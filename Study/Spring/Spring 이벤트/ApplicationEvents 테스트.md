[스프링 Docs - Application Events (TestContext)](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/application-events.html)

테스트에서 "이 메서드를 호출했을 때 이런 이벤트가 발행됐는가"를 검증하는 `ApplicationEvents` API예요.

상위 MOC: [[Spring 이벤트]]

---

# 1. 문제 상황 — 이벤트는 흘러가고 저장되지 않는다

[[ApplicationEvent|발행된 이벤트]]는 즉시 리스너에게 전달되고 **어디에도 저장되지 않아요.** "방금 무슨 이벤트가 발행됐지?"를 사후에 물어볼 곳이 없어요.

수동으로 검증하려면 테스트용 리스너로 이벤트를 수집해야 해요.

```java
static class TestEventCollector {
    private final List<Object> events = new ArrayList<>();

    @EventListener
    public void capture(Object event) {
        events.add(event);
    }
}
```

문제: 테스트 메서드마다 컬렉터가 재사용되면 이전 테스트 이벤트가 남아 오염돼요. `@BeforeEach`에서 매번 `clear()`를 잊으면 예기치 않게 깨져요.

# 2. 해결책 — `@RecordApplicationEvents` + `ApplicationEvents`

```java
@SpringJUnitConfig(/* ... */)
@RecordApplicationEvents                     // ①
class OrderServiceTests {

    @Test
    void submitOrder(@Autowired OrderService service,
                     ApplicationEvents events) {  // ②
        service.submitOrder(new Order(/* ... */));

        long numEvents = events.stream(OrderSubmitted.class).count(); // ③
        assertThat(numEvents).isEqualTo(1);
    }
}
```

① 테스트 클래스에 붙이면 각 테스트에서 발행되는 이벤트를 자동 기록해요.
② `ApplicationEvents`를 파라미터로 주입받아요. **테스트 메서드 라이프사이클로 스코프**되므로 매 테스트마다 새로 만들어지고 폐기돼요 → 오염 문제가 구조적으로 사라져요.
③ `events.stream()`으로 자바 Stream API를 그대로 써요.

> [!NOTE] 리스너 등록
> `ApplicationEventsTestExecutionListener`가 필요한데 기본 등록돼 있어요. `@TestExecutionListeners`로 기본 리스너를 제외하는 커스텀 설정을 할 때만 수동 등록이 필요해요.

# 3. 주입 방식 3가지

| 방식 | 가능 여부 | 이유 |
|---|---|---|
| 메서드 파라미터 | ✅ 권장 | 테스트 시작 시점에 맞춰 새로 주입됨 |
| 필드 `@Autowired` | ✅ 대안 | 매 테스트마다 다른 인스턴스로 갈아끼워짐 |
| 생성자 `@Autowired` | ❌ 불가 | 생성자가 테스트 메서드 시작보다 먼저 실행되는데, `ApplicationEvents`는 그때 아직 존재하지 않음 |

```text
1. 테스트 클래스 인스턴스 생성   ← 생성자 실행 (아직 ApplicationEvents 없음)
2. @BeforeEach
3. @Test 시작                  ← ApplicationEvents 준비/기록 시작
4. @Test 종료                  ← ApplicationEvents 폐기
5. @AfterEach
```

# 4. `stream()` 활용 예시

```java
// 1. 특정 타입이 정확히 한 번 발행됐는가
assertThat(events.stream(OrderSubmitted.class).count()).isEqualTo(1);

// 2. 이벤트 내용까지 검증
OrderSubmitted e = events.stream(OrderSubmitted.class).findFirst().orElseThrow();
assertThat(e.getOrderId()).isEqualTo("ORDER-123");

// 3. 여러 이벤트가 순서대로 발행됐는가
List<Class<?>> types = events.stream().map(Object::getClass).toList();
assertThat(types).containsExactly(
        OrderValidated.class, OrderSubmitted.class, OrderNotified.class);

// 4. 특정 이벤트가 발행되지 않았음을 검증
assertThat(events.stream(PaymentFailed.class).count()).isZero();
```

# 5. `@Async` 리스너와의 관계

`ApplicationEvents`는 **발행된 이벤트**를 기록하는 것이지, **리스너가 처리한 이벤트**를 기록하는 게 아니에요.

```text
publishEvent(new OrderSubmitted(...))
    │
    ├──▶ [발행됨] ← ApplicationEvents가 여기서 기록
    │
    └──▶ 리스너 전달
          ├─ 동기 리스너: 같은 스레드 즉시 실행
          └─ @Async 리스너: 별도 스레드로 나중에 실행
```

`@Async`는 "리스너가 별도 스레드에서 돈다"는 의미일 뿐, `publishEvent()` 자체는 언제나 호출 즉시 일어나요. 따라서 리스너가 [[@TransactionalEventListener|@Async]]여도 `events.stream(...).count()`는 정상적으로 잡아내요.

> [!WARNING] 반대는 안 돼요
> "비동기 리스너가 실제로 처리를 끝냈는지"는 `ApplicationEvents`로 검증할 수 없어요. 리스너가 아직 다른 스레드에서 실행 중일 수 있기 때문이에요. 이 경우 `Awaitility` 같은 폴링 라이브러리나 리스너 목킹이 필요해요.

# 6. Spring Modulith 대응물

Spring Modulith를 쓴다면 `@ApplicationModuleTest`에서 `PublishedEvents` / `AssertablePublishedEvents`가 같은 역할을 해요. → [[C. Working with Application Events]]

```java
@ApplicationModuleTest
class OrderIntegrationTests {
    @Test
    void someTestMethod(AssertablePublishedEvents events) {
        assertThat(events)
            .contains(OrderCompleted.class)
            .matching(OrderCompleted::getOrderId, reference.getId());
    }
}
```

# 7. 애노테이션 정의와 내부 동작

`@RecordApplicationEvents`는 **속성이 없는 마커 애노테이션**이에요. 테스트 클래스에 붙여요(`@Target(TYPE)`).

```java
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
public @interface RecordApplicationEvents { }
```

실제 기록은 `ApplicationEventsTestExecutionListener`(`TestExecutionListener` 구현)가 담당해요. 이 리스너가 각 테스트 메서드 실행 전후로 `ApplicationEvents` 인스턴스를 만들고 폐기해요 — 그래서 스코프가 테스트 메서드 단위가 돼요(3절).

```text
@RecordApplicationEvents (마커)
    ↓ 감지
ApplicationEventsTestExecutionListener (TestExecutionListener)
    ↓ 테스트 메서드 시작 시
ApplicationEvents 인스턴스 생성 → 리졸버블 디펜던시로 등록 (파라미터/필드 주입 가능)
    ↓ 테스트 메서드 종료 시
폐기
```

`ApplicationEvents` 자체는 인터페이스이고, 구현체는 `DefaultApplicationEvents`예요. `stream()` API(4절)가 여기 정의돼 있어요.

> [!NOTE] 기본 등록
> `ApplicationEventsTestExecutionListener`는 기본 `TestExecutionListener` 목록에 포함돼 있어요. `@TestExecutionListeners`로 기본 목록을 덮어쓰는 경우에만 수동으로 추가해야 해요.

---

## 관련 노트

- [[ApplicationEvent]] — 발행된 이벤트가 저장되지 않는 이유
- [[@EventListener]] / [[@TransactionalEventListener]] — 검증 대상 리스너
- [[@DomainEvents]] — Aggregate가 발행한 이벤트도 동일하게 검증
- [[Spring 이벤트]] (MOC)
