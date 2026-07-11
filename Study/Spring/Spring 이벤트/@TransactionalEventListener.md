[스프링 Docs - Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)

[[@EventListener]]는 기본적으로 발행자와 **같은 트랜잭션 안에서 동기 실행**돼요. 이게 문제가 되는 상황과, 그걸 해결하는 `@TransactionalEventListener`를 다뤄요.

상위 MOC: [[Spring 이벤트]]

---

# 1. 동기 실행의 함정

```java
@Transactional
public void completePayment(Order order) {
    order.markAsPaid();
    orderRepository.save(order);
    publisher.publishEvent(new PaymentCompletedEvent(order)); // ① 리스너가 즉시 이 자리에서 실행됨
    // ...
} // ② 여기서 트랜잭션 커밋
```

`publishEvent()`는 동기 호출이라서 **①이 항상 ②보다 먼저** 일어나요. 리스너가 예외 없이 성공해도 마찬가지예요.

문제: 리스너가 "결제 완료 메일 발송" 같은 **되돌릴 수 없는 작업**이라면 — 메일이 이미 나간 뒤에 후속 코드에서 예외가 터져 트랜잭션이 롤백될 수 있어요. DB엔 결제 기록이 없는데 사용자에겐 완료 메일이 간 상태가 돼요.

# 2. 해결책 — `AFTER_COMMIT`

```java
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void sendPaymentNotification(PaymentCompletedEvent event) {
    // 트랜잭션이 실제로 커밋된 후에만 실행
}
```

이 리스너는 이벤트 발행 즉시 실행되는 게 아니라, 감싸는 트랜잭션이 **커밋될 때까지 대기**했다가 실행돼요. 롤백되면 아예 호출조차 안 돼요.

`phase` 종류:

| phase | 실행 시점 |
|---|---|
| `AFTER_COMMIT` (기본) | 커밋 성공 직후 |
| `AFTER_ROLLBACK` | 롤백 직후 |
| `AFTER_COMPLETION` | 커밋/롤백 무관 완료 후 |
| `BEFORE_COMMIT` | 커밋 직전 (아직 flush 전) |

# 3. 함정 — 트랜잭션이 없으면 조용히 무시됨

이벤트 발행 시점에 **활성화된 트랜잭션이 아예 없으면**, 이 리스너는 호출조차 안 돼요. 조용히 무시돼요. 지켜볼 커밋 시점 자체가 없기 때문이에요.

```text
이벤트 발행
  → 활성 트랜잭션 있음: 커밋 후 실행하도록 등록
  → 활성 트랜잭션 없음: 등록할 커밋 시점이 없어 실행 안 함
```

> [!WARNING] 테스트에서 자주 겪는 함정
> `@Transactional` 없이 서비스 메서드를 직접 호출하고 "왜 알림이 안 나가지?" 하는 경우가 많아요. 원인은 트랜잭션이 없어서 리스너가 아예 안 불린 것이에요.

트랜잭션 유무와 무관하게 항상 실행하고 싶으면 `fallbackExecution = true`를 켜요. 단, 트랜잭션 유무에 따라 실행 의미가 달라지므로 주의해야 해요.

```java
@TransactionalEventListener(
    phase = TransactionPhase.AFTER_COMMIT,
    fallbackExecution = true) // 트랜잭션 없으면 즉시 실행
public void sendPaymentNotification(PaymentCompletedEvent event) { }
```

# 4. `@Async`와의 조합 — 서로 다른 축

- `AFTER_COMMIT` = **언제** 실행할지
- `@Async` = **어느 스레드에서** 실행할지

둘은 독립적인 축이에요. 무거운 외부 API 호출이 리스너 안에 있으면, `@Async` 없이는 커밋을 요청한 스레드(예: HTTP 요청 스레드)가 응답을 기다리며 블로킹돼요.

```java
@Async
@TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
public void handle(OrderCompletedEvent event) {
    // 커밋 후 + 별도 스레드에서 실행
}
```

`@Async`를 쓰려면 설정 클래스에 `@EnableAsync`가 필요해요. 대신 잃는 것이 있어요.

- 리스너에서 예외가 터져도 **호출자에게 전파되지 않아요** (`AsyncUncaughtExceptionHandler`로 별도 처리). 호출자 스레드는 이미 `publishEvent()` 지점을 지나가서 예외를 받을 콜 스택이 없어요.
- 메서드가 값을 `return`해서 다음 이벤트를 발행하는 기능을 **쓸 수 없어요**.

# 5. 신뢰성의 한계

`AFTER_COMMIT`도 외부 시스템 전송을 원자적으로 보장하지는 않아요.

```text
DB 커밋 성공
→ AFTER_COMMIT 실행 직전 서버 종료
→ 이메일/메시지 전송 누락
```

신뢰성 있는 외부 전달이 필요하면 Transactional Outbox, 재시도, 실패 큐, 멱등 처리 같은 별도 전략이 필요해요. (Spring Modulith의 이벤트 발행 레지스트리가 이 문제를 다뤄요 → [[C. Working with Application Events]])

# 6. 애노테이션 정의와 속성

`@TransactionalEventListener`는 [[@EventListener]]를 **메타 애노테이션으로 달고 있어요.** 즉 `@EventListener`의 확장판이에요.

```java
@Target({ElementType.METHOD, ElementType.ANNOTATION_TYPE})
@Retention(RetentionPolicy.RUNTIME)
@EventListener                              // ← 메타 애노테이션
public @interface TransactionalEventListener {

    TransactionPhase phase() default TransactionPhase.AFTER_COMMIT;

    boolean fallbackExecution() default false;

    @AliasFor(annotation = EventListener.class, attribute = "classes")
    Class<?>[] value() default {};

    @AliasFor(annotation = EventListener.class, attribute = "classes")
    Class<?>[] classes() default {};

    String condition() default "";          // EventListener.condition으로 위임

    String id() default "";
}
```

| 속성 | 설명 |
|---|---|
| `phase` | 실행할 트랜잭션 단계 (2절 표) |
| `fallbackExecution` | 트랜잭션이 없을 때 즉시 실행할지 (기본 `false` → 무시) |
| `value`/`classes`/`condition`/`id` | `@EventListener`에서 상속. 구독 타입·SpEL 조건 그대로 사용 |

`@EventListener`를 메타 애노테이션으로 달았기 때문에 `condition`, `classes` 같은 속성을 그대로 물려받아요.

# 7. 내부 동작 — 트랜잭션 동기화 콜백

일반 [[@EventListener]]가 `ApplicationListenerMethodAdapter`로 등록되는 것과 달리, 이건 `TransactionalApplicationListenerMethodAdapter`로 등록돼요.

```text
이벤트 발행
    ↓
TransactionalApplicationListenerMethodAdapter
    ↓ 활성 트랜잭션 있음?
    ├─ 있음 → TransactionSynchronizationManager.registerSynchronization(...)
    │         → 지정한 phase(예: afterCommit)에 콜백 실행
    └─ 없음 → fallbackExecution=true 면 즉시 실행 / 아니면 무시
```

리스너를 곧바로 실행하지 않고 **트랜잭션 동기화(`TransactionSynchronization`) 콜백으로 등록**해뒀다가, 지정한 `phase` 시점에 실행해요. 3절의 "트랜잭션 없으면 무시"도 여기서 나와요 — 등록할 동기화 대상이 없기 때문이에요.

> [!NOTE] `@Transactional`과 함께
> `@Async` 없이 리스너를 다시 트랜잭션 안에서 돌리려면 `@Transactional(propagation = REQUIRES_NEW)`를 함께 붙여요. Spring Modulith의 `@ApplicationModuleListener`는 `@Async` + `@Transactional(REQUIRES_NEW)` + `@TransactionalEventListener`를 묶은 단축 애노테이션이에요 → [[C. Working with Application Events]]

---

## 관련 노트

- [[@EventListener]] — 기본 동기 리스너
- [[@DomainEvents]] — Aggregate가 이벤트를 기록하는 방식
- [[@Async]] — 비동기 실행 일반
- [[Spring 이벤트]] (MOC)
