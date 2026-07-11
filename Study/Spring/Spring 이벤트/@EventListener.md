[스프링 Docs - Annotation-based Event Listeners](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events-annotation)

[[ApplicationEvent]]로 발행된 이벤트를 받는 **애노테이션 기반 리스너**예요. 예전에는 `ApplicationListener<T>` 인터페이스를 구현했지만, 이제는 평범한 메서드에 `@EventListener`만 붙이면 돼요.

상위 MOC: [[Spring 이벤트]]

---

# 1. 구식 vs 신식

### A. 구식 — `ApplicationListener<T>` 구현

```java
public class BlockedListNotifier implements ApplicationListener<BlockedListEvent> {
    public void onApplicationEvent(BlockedListEvent event) {
        // ...
    }
}
```

### B. 신식 — `@EventListener` 애노테이션

```java
public class BlockedListNotifier {
    @EventListener
    public void processBlockedListEvent(BlockedListEvent event) {
        // ...
    }
}
```

파라미터 타입이 곧 구독할 이벤트 타입이에요. **Spring은 메서드 이름을 전혀 보지 않아요.** 오직 파라미터 타입만으로 어떤 이벤트를 구독하는지 판단해요.

# 2. 애노테이션 방식이 나은 이유 — 다중 이벤트

결합도 자체는 두 방식이 동일해요(둘 다 이벤트 객체로만 연결됨). 차이는 **한 클래스가 여러 이벤트를 듣고 싶을 때** 드러나요.

인터페이스 방식은 같은 제네릭 인터페이스를 서로 다른 타입 인자로 두 번 구현할 수 없어요 — [[ApplicationEvent#4. 제네릭 이벤트와 타입 소거|타입 소거]] 때문에 컴파일러가 막아요.

```java
// 컴파일 에러 — 같은 인터페이스 중복 구현 불가
public class Notifier implements
        ApplicationListener<BlockedListEvent>,
        ApplicationListener<OrderCreatedEvent> {
}
```

`@EventListener`는 그냥 메서드라서 파라미터 타입만 다르면 오버로딩으로 자유롭게 처리해요.

```java
public class Notifier {
    @EventListener
    public void onEvent(BlockedListEvent event) { /* ... */ }

    @EventListener
    public void onEvent(OrderCreatedEvent event) { /* ... */ }
}
```

# 3. 조건부 실행 — `condition` (SpEL)

```java
@EventListener(condition = "#blEvent.content == 'my-event'")
public void processBlockedListEvent(BlockedListEvent blEvent) {
    // 실제 로직만
}
```

| 방식 | 동작 |
|---|---|
| `if (blEvent.getContent().equals(...))` | 메서드가 **항상 호출**되고, 진입 후 첫 줄에서 걸러짐 |
| `condition = "..."` | Spring이 조건을 먼저 평가해서 **메서드 자체를 호출하지 않음** |

→ **트리거(실행 여부)와 액션(실제 로직)의 책임이 분리**돼요. 복잡한 비즈니스 규칙까지 SpEL로 넣으면 가독성을 해치니, 단순 라우팅 조건에만 쓰는 게 좋아요.

> [!NOTE] SpEL 루트 객체
> 이벤트 객체는 파라미터 이름(`#blEvent`)으로 참조하거나 `#root.event` / `#root.args[0]`로도 접근할 수 있어요.

# 4. 실행 순서 — `@Order`

```java
@Order(10)
@EventListener
public void decreaseStock(OrderCompletedEvent event) { }

@Order(20)
@EventListener
public void sendEmail(OrderCompletedEvent event) { }
```

같은 이벤트를 듣는 리스너가 여러 개일 때, **숫자가 작을수록 먼저** 실행돼요. 값에 간격을 두면(10, 20) 중간 순서 리스너를 나중에 끼워넣기 쉬워요.

> [!WARNING] 비동기에서는 순서 보장 안 됨
> `@Order`는 동기 리스너의 **호출** 순서를 제어할 뿐이에요. [[@TransactionalEventListener|@Async 리스너]]는 작업 제출 순서와 실제 완료 순서가 달라질 수 있어요.

# 5. 기본은 동기 실행

리스너는 기본적으로 **발행자와 같은 스레드, 같은 트랜잭션** 안에서 즉시 실행돼요. `publishEvent()`를 호출한 그 줄에서 리스너가 끝까지 돌고 나서야 다음 줄로 넘어가요.

이 동기 특성이 트랜잭션과 만나면 함정이 생기는데, 그건 [[@TransactionalEventListener]]에서 다뤄요.

# 6. 애노테이션 정의와 속성

```java
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface EventListener {

    @AliasFor("classes")
    Class<?>[] value() default {};

    @AliasFor("value")
    Class<?>[] classes() default {};

    String condition() default "";

    String id() default "";
}
```

| 속성 | 설명 |
|---|---|
| `value` / `classes` | 구독할 이벤트 타입. 둘은 서로 별칭(`@AliasFor`). 생략하면 메서드 파라미터 타입으로 추론 |
| `condition` | SpEL 조건. `true`일 때만 메서드 호출 (3절 참고) |
| `id` | 리스너 식별자. `ApplicationListener`로 등록될 때의 이름 지정용 |

`value`/`classes`를 명시하면 파라미터 없는 리스너도 만들 수 있어요.

```java
@EventListener(ApplicationReadyEvent.class)
public void onReady() { ... } // 이벤트 객체가 필요 없을 때
```

# 7. 내부 동작 — 결국 `ApplicationListener`

`@EventListener`는 인터페이스가 아니라 애노테이션이지만, 런타임에는 결국 [[ApplicationEvent|구식 `ApplicationListener<T>`]]로 귀결돼요.

```text
EventListenerMethodProcessor  (BeanFactoryPostProcessor + SmartInitializingSingleton)
    ↓ 싱글턴 초기화 후 @EventListener 메서드 스캔
DefaultEventListenerFactory
    ↓ 메서드 하나당
ApplicationListenerMethodAdapter  (ApplicationListener 구현)
    ↓
ApplicationEventMulticaster에 리스너로 등록
```

`EventListenerMethodProcessor`가 모든 빈을 훑어 `@EventListener` 메서드를 찾고, 각 메서드를 `ApplicationListenerMethodAdapter`로 감싸 `ApplicationListener`로 등록해요. **인터페이스 구현 방식과 런타임 결과는 동일하고, 등록 과정만 자동화된 것**이에요. 그래서 파라미터 타입만으로 이벤트를 매칭할 수 있어요.

---

## 관련 노트

- [[ApplicationEvent]] — 받을 이벤트를 만드는 법, 제네릭 이벤트와 타입 소거
- [[@TransactionalEventListener]] — 커밋 이후에 실행하기
- [[ApplicationEvents 테스트]] — 발행 검증
- [[Spring 이벤트]] (MOC)
