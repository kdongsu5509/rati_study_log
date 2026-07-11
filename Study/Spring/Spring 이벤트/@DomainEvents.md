[스프링 Docs - Publishing Events from Aggregate Roots](https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html)

서비스가 `ApplicationEventPublisher`로 직접 발행하는 대신, **Aggregate가 이벤트를 내부에 기록하고 Spring Data Repository가 저장 시점에 대신 발행**하는 방식이에요.

상위 MOC: [[Spring 이벤트]]

---

# 1. 핵심 흐름

```text
Aggregate 내부에서 이벤트 기록
        ↓
repository.save(aggregate)
        ↓
@DomainEvents 메서드 호출
        ↓
Spring Application Event로 발행  → [[@EventListener]] / [[@TransactionalEventListener]]
        ↓
@AfterDomainEventPublication 메서드 호출
        ↓
기록한 이벤트 목록 제거
```

애노테이션 이름은 단수 `@DomainEvent`가 아니라 복수형 **`@DomainEvents`**예요.

# 2. 서비스 직접 발행과의 차이

```text
[서비스 직접 발행]              [Aggregate가 기록]
OrderService                    Order
  → order.complete()             → complete()
  → publisher.publishEvent(...)      ├─ 상태 변경
                                     └─ OrderCompletedEvent 기록
                                OrderRepository
                                  → save(order) → 기록된 이벤트 발행
```

역할 분리:

- **Aggregate**: 어떤 도메인 사건이 발생했는지 결정
- **Repository**: 기록된 사건을 Spring Application Event로 발행
- **Listener**: 사건에 어떻게 반응할지 결정

Aggregate가 `ApplicationEventPublisher`를 직접 주입받지 않으므로 핵심 도메인 행위와 발행 인프라의 직접 결합을 피할 수 있어요.

> [!NOTE] 프레임워크 의존성이 완전히 사라지는 건 아니에요
> `ApplicationEventPublisher`에 직접 의존하지는 않지만, `@DomainEvents`/`@AfterDomainEventPublication` 애노테이션이나 `AbstractAggregateRoot` 상속을 쓰면 **Spring Data와의 구조적 의존성은 남아요.** 완전 분리가 필요하면 순수 도메인 객체는 이벤트 목록만 관리하고, Repository 어댑터가 저장 후 꺼내 발행하도록 직접 구성해야 해요(대신 코드가 늘어남).

# 3. 직접 구현

```java
@DomainEvents
Collection<Object> domainEvents() {
    return List.copyOf(domainEvents);
}

@AfterDomainEventPublication
void clearDomainEvents() {
    domainEvents.clear();
}
```

- `@DomainEvents` 메서드는 인자를 받지 않고, 단일 이벤트 또는 컬렉션을 반환해요. Spring Data가 Repository 호출 과정에서 직접 호출해요.
- 도메인 행위는 상태를 바꾸면서 이미 일어난 사실을 이벤트로 기록만 해요.

```java
public void complete() {
    this.status = OrderStatus.COMPLETED;
    this.domainEvents.add(new OrderCompletedEvent(this.id));
}
```

이 시점엔 이벤트가 목록에 들어갔을 뿐, 아직 Spring 이벤트로 **발행되지 않았어요.**

# 4. 발행 계기는 JPA 변경 감지가 아니라 Repository 호출

```java
@Transactional
public void completeOrder(Long id) {
    Order order = orderRepository.findById(id).orElseThrow();
    order.complete();   // 상태는 변경 감지로 DB 반영되지만...
    // save(order)를 부르지 않으면 @DomainEvents는 발행되지 않음
}
```

```text
JPA 변경 감지         → 영속 상태 변경을 트랜잭션 종료 시 DB에 반영
Spring Data @DomainEvents → 지원되는 Repository 메서드 호출 시 이벤트 발행
```

`save()`를 호출하지 않으면 DB 상태는 `COMPLETED`가 되지만 완료 이벤트는 발행되지 않고, 미발행 이벤트가 Aggregate에 남아 나중에 저장될 때 뒤늦게 발행될 수 있어요.

> [!IMPORTANT] 핵심
> 도메인 사건의 **발생 시점**은 Aggregate 메서드 호출이지만, Spring 이벤트의 **발행 시점**은 Repository 메서드 호출이에요.

# 5. `@AfterDomainEventPublication` — 목록 비우기

발행 직후 호출되는 콜백이에요. 목록을 비우지 않으면 같은 Aggregate를 다시 저장할 때 같은 이벤트가 **중복 발행**돼요.

```text
order.complete()      → 목록: [OrderCompletedEvent]
첫 save(order)        → 발행 → (목록 안 비움)
둘째 save(order)      → 같은 OrderCompletedEvent 다시 발행
```

중복 발행은 이메일 중복 발송, 쿠폰 중복 지급, 통계 중복 증가 같은 부수 효과로 이어져요.

> [!WARNING] 발행 ≠ 커밋
> `@AfterDomainEventPublication`은 **이벤트 발행 후** 콜백이지 **트랜잭션 커밋 후** 콜백이 아니에요. 발행 후 후속 코드에서 예외가 나 롤백돼도, 일반 [[@EventListener]]는 이미 실행된 상태예요. 커밋 이후에만 반응해야 하는 로직(이메일 등)은 [[@TransactionalEventListener]] `AFTER_COMMIT`으로 받아야 해요.

# 6. Repository 메서드의 제약

Spring Data는 **Aggregate 인스턴스를 인자로 받는** 메서드에서만 이벤트를 꺼내 발행할 수 있어요.

```text
save(...) / saveAll(...) / delete(entity) / deleteAll(...)  → 객체 있음 → 발행 가능
deleteById(id)                                             → 객체 없음 → 발행 보장 불가
```

`deleteById(id)`는 Aggregate 객체 없이 삭제 쿼리만 실행하므로 `@DomainEvents`를 호출할 대상이 없을 수 있어요. 삭제 이벤트가 필요하면 먼저 조회해서 상태를 바꾼 뒤 `delete(entity)`에 넘겨요.

# 7. `AbstractAggregateRoot`

반복 코드(목록 보관/등록/노출/제거)를 줄여주는 Spring Data 베이스 클래스예요.

```java
@Entity
public class Order extends AbstractAggregateRoot<Order> {

    public void complete() {
        this.status = OrderStatus.COMPLETED;
        registerEvent(new OrderCompletedEvent(id)); // 목록에 등록
    }
}
```

| 방식 | 장점 | 단점 |
|---|---|---|
| `AbstractAggregateRoot` 상속 | 구현 간단, 반복 코드 적음 | 도메인 객체가 Spring Data 클래스를 상속 |
| `@DomainEvents` 직접 구현 | 보관/노출 정책 직접 통제 | 목록 관리·콜백 코드 반복 |

# 8. 도메인 이벤트의 의미

이미 발생한 사실을 표현하므로 보통 **과거형**으로 이름 지어요.

```text
OrderCompleted / BookingCancelled / PaymentApproved / WaitingPromoted
```

이벤트 분리가 항상 정답은 아니에요. 예약 취소와 대기 승격이 반드시 하나의 원자적 작업이어야 한다면 서비스에서 함께 처리하는 편이 더 명확해요. 알림·통계처럼 **독립적인 후속 반응**일 때 도메인 이벤트가 특히 유용해요.

# 9. 애노테이션 정의와 내부 동작

`@DomainEvents`와 `@AfterDomainEventPublication`은 Spring Data Commons(`org.springframework.data.domain`)에 있고, **속성이 없는 마커 애노테이션**이에요.

```java
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface DomainEvents { }

@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface AfterDomainEventPublication { }
```

동작 방식은 **Repository 프록시가 가로채는 방식**이에요. 별도 인터페이스를 구현하는 게 아니라, 애노테이션 붙은 메서드를 프록시가 찾아서 호출해요.

```text
EventPublishingRepositoryProxyPostProcessor
    ↓ Repository에 인터셉터 추가
EventPublishingMethodInterceptor
    ↓ save/delete 등 호출을 가로챔
EventPublishingMethod (엔티티에서 @DomainEvents / @AfterDomainEventPublication 메서드 탐색)
    ↓
ApplicationEventPublisher.publishEvent(...)  → [[@EventListener]]
    ↓
@AfterDomainEventPublication 메서드 호출 (목록 비우기)
```

`@DomainEvents`가 없는 엔티티면 인터셉터가 그냥 통과시켜요.

## `AbstractAggregateRoot`의 정체

7절의 `AbstractAggregateRoot`는 위 두 애노테이션을 **미리 구현해둔 베이스 클래스**예요. 직접 구현할 코드를 대신 담고 있어요.

```java
public class AbstractAggregateRoot<A extends AbstractAggregateRoot<A>> {

    private final transient List<Object> domainEvents = new ArrayList<>();

    protected <T> T registerEvent(T event) {   // 도메인 메서드에서 호출
        domainEvents.add(event);
        return event;
    }

    @DomainEvents                               // Repository가 저장 시 호출
    protected Collection<Object> domainEvents() {
        return Collections.unmodifiableList(domainEvents);
    }

    @AfterDomainEventPublication                // 발행 직후 호출
    protected void clearDomainEvents() {
        domainEvents.clear();
    }
}
```

`registerEvent()`로 등록 → `@DomainEvents`로 노출 → `@AfterDomainEventPublication`으로 정리까지 3절의 직접 구현과 동일한 흐름이에요.

---

## 최종 정리

1. Aggregate 메서드 호출은 이벤트를 **기록**만 하고, 지원되는 Repository 메서드가 호출돼야 발행돼요.
2. 변경 감지로 상태가 저장돼도 Repository 호출이 없으면 이벤트는 발행 안 될 수 있어요.
3. `@AfterDomainEventPublication`은 발행 후 정리 콜백이지 커밋 콜백이 아니에요.
4. 목록을 안 비우면 중복 발행 → 중복 부수 효과.
5. `deleteById()`처럼 객체를 안 넘기는 메서드에선 발행 보장 안 됨.
6. 커밋 이후 반응이 필요하면 [[@TransactionalEventListener]] `AFTER_COMMIT`.
7. 신뢰성 있는 외부 전달엔 `@DomainEvents`만으론 부족 → Outbox 등 별도 설계.

## 참고 문서

- [Publishing Events from Aggregate Roots](https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html)
- [Spring Data domain package API](https://docs.spring.io/spring-data/commons/reference/api/java/org/springframework/data/domain/package-summary.html)

## 관련 노트

- [[@TransactionalEventListener]] — 커밋 이후 실행
- [[@EventListener]] — 발행된 이벤트 받기
- [[ApplicationEvents 테스트]] — 발행 검증
- [[C. Working with Application Events]] — Spring Modulith 관점
- [[Spring 이벤트]] (MOC)
