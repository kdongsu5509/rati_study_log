[스프링 Docs - Standard and Custom Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events)

Spring 이벤트 객체를 정의하는 방법과, 제네릭 이벤트를 다룰 때 부딪히는 타입 소거 문제를 다뤄요.

상위 MOC: [[Spring 이벤트]]

---

# 1. 이벤트를 정의하는 두 방식

Spring 4.2부터 이벤트 객체는 **POJO(또는 record)** 로도 만들 수 있고, 예전처럼 **`ApplicationEvent`를 상속**해서도 만들 수 있어요.

### A. record / POJO (권장)

```java
public record OrderCompleted(Long orderId) { }
```

```java
publisher.publishEvent(new OrderCompleted(orderId));
```

발행 시 Spring이 내부에서 `PayloadApplicationEvent<OrderCompleted>`로 감싸요. 리스너는 원본 타입으로 바로 받아요.

```java
@EventListener
public void on(OrderCompleted event) { ... } // 언래핑된 payload가 그대로 들어옴
```

### B. `ApplicationEvent` 상속

```java
public class OrderCompleted extends ApplicationEvent {
    private final Long orderId;

    public OrderCompleted(Object source, Long orderId) {
        super(source); // 발행자(source) 필수
        this.orderId = orderId;
    }

    public Long getOrderId() { return orderId; }
}
```

```java
publisher.publishEvent(new OrderCompleted(this, orderId)); // this = 발행한 빈
```

### 차이

| 항목 | record / POJO | `ApplicationEvent` 상속 |
|---|---|---|
| Spring 결합 | 없음 (프레임워크 비침투적) | `ApplicationEvent`에 결합 |
| `source` | 없음 | `super(source)` 필수 |
| `getTimestamp()` | 없음 | 기본 제공 |
| 도메인 이벤트 재사용 | 쉬움 | 도메인이 Spring에 묶임 |
| 발행 시 래핑 | `PayloadApplicationEvent`로 감쌈 | 그대로 발행 |

> [!TIP] 실무 선택
> 특별히 `source`나 `timestamp`가 필요한 경우가 아니면 **record/POJO**가 나아요. 도메인 객체가 Spring에 결합되지 않아 [[@DomainEvents|도메인 이벤트]]로 그대로 재사용하기 좋아요. `source`가 정말 필요할 때만 `ApplicationEvent` 상속을 써요.

# 2. `java.util.EventObject`와 `source`

`ApplicationEvent`는 Spring이 새로 만든 게 아니라 JDK 1.1부터 있던 **`java.util.EventObject`**를 상속받아요.

```java
public class EventObject implements Serializable {
    protected transient Object source;

    public EventObject(Object source) {
        if (source == null)
            throw new IllegalArgumentException("null source");
        this.source = source;
    }

    public Object getSource() { return source; }
}
```

필드가 `source` 하나예요. "이 이벤트가 최초로 발생한 객체"만 기억하는 껍데기고, 나머지 정보는 서브클래스가 채워요. AWT/Swing 이벤트(`ActionEvent` 등)의 뿌리이기도 해요.

`source`는 흔히 오해하듯 `ApplicationContext`가 **아니에요.** 이벤트를 발행한 빈 자신이에요. `super(source)`가 필수인 이유는 `EventObject` 생성자가 `null` source를 `IllegalArgumentException`으로 막기 때문이에요. Spring은 그 규약을 물려받았어요.

# 3. 발행 흐름

```text
publisher.publishEvent(event)
    ↓
ApplicationEventMulticaster (멀티캐스터)
    ↓
등록된 리스너들에게 전달 → [[@EventListener]]
```

발행된 이벤트는 **어디에도 저장되지 않고** 리스너에게 흘러가요. "방금 뭐가 발행됐지?"를 사후에 물어보려면 별도 장치가 필요한데, 테스트에서는 [[ApplicationEvents 테스트]]가 그 역할을 해요.

---

# 4. 제네릭 이벤트와 타입 소거

`EntityCreatedEvent<Person>`과 `EntityCreatedEvent<Order>`를 리스너가 구분하려 할 때 타입 소거 문제에 부딪혀요.

## 4-1. 타입 소거(Type Erasure)란

자바 제네릭은 **컴파일 시점에만 검사되고, 런타임에는 지워져요.**

```java
List<String> a = new ArrayList<>();
List<Integer> b = new ArrayList<>();

System.out.println(a.getClass() == b.getClass()); // true — 런타임엔 둘 다 List
```

```text
컴파일 전                                런타임 (소거 후)
List<String>                  →          List
EntityCreatedEvent<Person> (변수 타입) →  EntityCreatedEvent
```

`<>` 안의 정보는 컴파일러가 타입 검사할 때만 쓰고 버려요. (자바 1.5 이전 라이브러리와 바이트코드 레벨에서 호환되어야 했던 하위 호환성 절충안이에요.)

## 4-2. 왜 이벤트에서 문제가 되나

Spring이 리스너를 매칭할 때 메서드의 파라미터 타입을 리플렉션으로 물어봐요.

```java
@EventListener
public void onPersonCreated(EntityCreatedEvent<Person> event) { ... }
```

런타임에는 `<Person>`이 소거돼서 `EntityCreatedEvent`만 나와요. "Person용인지 Order용인지" 알 방법이 없어요.

## 4-3. 예외 — 클래스 선언부의 제네릭은 남는다

**변수/메서드 시그니처의 타입 인자는 소거되지만, 클래스 선언부에 박힌 제네릭 파라미터는 소거되지 않아요.**

```java
public class PersonCreatedEvent extends EntityCreatedEvent<Person> { }
```

```text
컴파일 전                                   런타임 (.class 파일에 남는 정보)
List<String> myList             →           변수 타입: List           ← 소거됨
class PersonCreatedEvent                     class: PersonCreatedEvent
  extends EntityCreatedEvent<Person> →         superclass: EntityCreatedEvent<Person>  ← 남음
```

부모가 `EntityCreatedEvent<Person>`이라는 정보가 클래스 메타데이터로 남아서 `getGenericSuperclass()`로 런타임에 조회할 수 있어요. 이게 우회법 1의 원리예요.

## 4-4. 우회법 1 — 서브클래스

```java
public class PersonCreatedEvent extends EntityCreatedEvent<Person> { }

@EventListener
public void onPersonCreated(PersonCreatedEvent event) { ... }
```

간단하지만 **엔티티 타입마다 빈 껍데기 서브클래스를 만들어야** 해요 (`PersonCreatedEvent`, `OrderCreatedEvent`, `ProductCreatedEvent`...).

## 4-5. 우회법 2 — `ResolvableTypeProvider`

이벤트 객체가 리플렉션 대신 **자기 자신의 실제 타입을 알려주는** 방식이에요.

```java
public class EntityCreatedEvent<T> extends ApplicationEvent implements ResolvableTypeProvider {

    public EntityCreatedEvent(T entity) {
        super(entity);
    }

    @Override
    public ResolvableType getResolvableType() {
        return ResolvableType.forClassWithGenerics(
                getClass(),
                ResolvableType.forInstance(getSource()));
    }
}
```

`getSource()`는 `super(entity)`로 넘긴 실제 엔티티예요(위 2절 `source` 참고). 실제 인스턴스에서 타입을 뽑아 "나는 `EntityCreatedEvent<[실제 엔티티]>`야"라고 알려줘요. 서브클래스 없이 이벤트 클래스 하나로 재사용할 수 있어요.

```java
publisher.publishEvent(new EntityCreatedEvent<>(new Person(...)));

@EventListener
public void onPersonCreated(EntityCreatedEvent<Person> event) { ... }
```

## 4-6. 비교

| 방식 | 장점 | 단점 |
|---|---|---|
| 서브클래스 | 간단, 직관적 | 엔티티마다 클래스 필요 |
| `ResolvableTypeProvider` | 이벤트 클래스 하나로 재사용 | 구현 복잡도 증가 |

---

## 관련 노트

- [[@EventListener]] — 이 이벤트를 받는 방법 (타입 소거가 다중 인터페이스 구현을 막는 이유 포함)
- [[@DomainEvents]] — 도메인 이벤트로 재사용
- [[ApplicationEvents 테스트]] — 발행 검증
- [[Spring 이벤트]] (MOC)
