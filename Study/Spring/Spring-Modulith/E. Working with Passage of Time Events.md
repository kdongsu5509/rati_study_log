---
library: Spring Modulith
library_version: 2.1.0
version: 2.1.0
prev: "[[D. Integration Testing Application Modules]]"
next: "[[F. Producing Documentation for Application Modules]]"
---
[Spring Modulith Docs - Working with Passage of Time Events](https://docs.spring.io/spring-modulith/reference/moments.html)

Mathias Verraes의 "Passage of Time Events" 패턴을 Spring Modulith가 `spring-modulith-moments`로 구현한 내용이에요. 스케줄러가 도메인을 직접 호출하는 대신, **시간이 흘렀다는 사실 자체를 도메인 이벤트로 발행**해서 시간 기반 로직을 분리하는 방식이에요.

> 이벤트 발행/소비의 기본기는 [[C. Working with Application Events]]에서 이어져요. 이 노트는 "시간"이라는 특수한 트리거를 이벤트로 다루는 관점을 다뤄요.

---

# 1. 문제 — 스케줄러가 도메인 지식에 결합

많은 시스템에서 "미래의 특정 시점에 실행해야 하는 작업"을 Cron이나 스케줄러로 처리해요. 이 설계에서 스케줄러는 **무엇을, 언제** 실행해야 하는지를 모두 알고 있어요.

```java
@Component
public class BillingCronJobs {

    private final InvoiceDebtCollectionService debtCollectionService;

    @Scheduled(cron = "0 0 0 * * *")
    public void checkForOverdueInvoices() {
        debtCollectionService.checkForOverdueInvoices();
    }
}

@Service
public class InvoiceDebtCollectionService {

    public void checkForOverdueInvoices() {
        List<Invoice> overdue = invoiceRepository.findOverdue(LocalDate.now(), 30);
        overdue.forEach(notificationService::sendOverdueReminder);
    }
}
```

무엇이 문제인지 정리하면 이래요.

- `BillingCronJobs`(인프라)가 `InvoiceDebtCollectionService`(도메인)를 직접 참조해요 → **인프라 ↔ 도메인 결합**
- DDD 관점에서 비즈니스 프로세스의 유비쿼터스 언어가 스케줄러 레이어로 유출돼요.

변경 시나리오에서 문제가 더 뚜렷하게 드러나요.

```text
"연체 시 계정 정지 추가"
→ BillingCronJobs에 UserService 의존성 추가
  또는 InvoiceDebtCollectionService에 계정 정지 로직 추가
→ 어느 쪽이든 기존 코드 수정 필요
```

# 2. 해결 — 시간의 흐름을 도메인 이벤트로 다뤄요

스케줄러가 도메인 명령(Command)을 호출하는 대신, **범용적인 시간 경과 이벤트**만 발행해요.

```java
// 스케줄러 — 도메인을 모른다
@Component
public class TimeEventPublisher {

    private final ApplicationEventPublisher eventPublisher;

    @Scheduled(cron = "0 0 0 * * *")
    public void publishDayHasPassed() {
        eventPublisher.publishEvent(new DayHasPassed(LocalDate.now()));
    }
}

// 도메인 이벤트
public record DayHasPassed(LocalDate date) {}

// 도메인 서비스 — 이벤트를 구독하고 판단한다
@Service
public class InvoiceDebtCollection {

    @EventListener
    public void on(DayHasPassed event) {
        List<Invoice> overdue = invoiceRepository.findOverdue(event.date(), 30);
        overdue.forEach(invoice ->
            eventPublisher.publishEvent(new InvoiceBecameOverdue(invoice.getId())));
    }
}
```

핵심 변화를 표로 정리하면 이래요.

| 관점 | 기존 설계 | 새 설계 |
|---|---|---|
| 스케줄러가 아는 것 | 무엇을 + 언제 | 언제만 |
| 도메인 로직 위치 | 스케줄러에 유출 | 구독자에 격리 |
| 기능 추가 시 | 기존 코드 수정 필요 | 리스너만 추가 (OCP) |

# 3. 이벤트 체이닝 — 후속 서비스는 시간을 몰라도 돼요

`DayHasPassed`를 받은 서비스가 **도메인 이벤트**를 한 단계 더 발행해요. 그러면 그 뒤의 서비스들은 시간 개념을 알 필요가 없어져요.

```java
// 연체 판단 서비스
@Service
public class InvoiceDebtCollection {

    @EventListener
    public void on(DayHasPassed event) {
        invoiceRepository.findOverdue(event.date(), 30)
            .forEach(invoice ->
                eventPublisher.publishEvent(new InvoiceBecameOverdue(invoice.getId())));
    }
}

// 계정 정지 서비스 — DayHasPassed가 아니라 InvoiceBecameOverdue를 구독
@Service
public class AccountSuspensionService {

    @EventListener
    public void on(InvoiceBecameOverdue event) {
        accountService.suspend(event.invoiceId());
        eventPublisher.publishEvent(new AccountWasSuspended(event.invoiceId()));
    }
}

// 매출 조정 서비스 — 역시 InvoiceBecameOverdue를 구독
@Service
public class RevenueAdjustmentService {

    @EventListener
    public void on(InvoiceBecameOverdue event) {
        revenueService.adjustExpectedRevenue(event.invoiceId());
    }
}
```

계정 정지의 원인은 "하루가 지남"이 아니라 "송장이 연체됨"이에요. 후속 서비스들은 시간 개념 자체를 알 필요가 없어요.

# 4. 테스트 — 시간이 데이터가 돼요

기존 설계에서는 `checkForOverdueInvoices()`가 내부에서 `LocalDate.now()`를 호출하기 때문에, 테스트에서 30일 경과를 표현하려면 `Clock`을 모킹해야 해요.

새 설계에서는 시간이 이벤트 객체의 `date` 필드, 즉 **데이터**예요. 그래서 Clock 모킹 없이 이벤트만 발행하면 돼요.

```java
@Test
void 삼십일_미결제시_계정_정지() {
    // Given
    eventPublisher.publishEvent(
        new CustomerWasInvoiced(invoiceId, LocalDate.of(2025, 1, 1)));

    // When — 30일의 시간 흐름
    for (int i = 1; i <= 30; i++) {
        eventPublisher.publishEvent(
            new DayHasPassed(LocalDate.of(2025, 1, 1).plusDays(i)));
    }

    // Then
    assertThat(events).contains(new InvoiceBecameOverdue(invoiceId));
    assertThat(events).contains(new AccountWasSuspended(accountId));
}

@Test
void 제때_결제되면_아무_일도_일어나지_않는다() {
    // Given
    eventPublisher.publishEvent(
        new CustomerWasInvoiced(invoiceId, LocalDate.of(2025, 1, 1)));
    eventPublisher.publishEvent(
        new DayHasPassed(LocalDate.of(2025, 1, 2)));

    // When
    eventPublisher.publishEvent(
        new PaymentWasMade(invoiceId));

    // Then — 이후 DayHasPassed에도 연체 판정 안 됨
    for (int i = 3; i <= 31; i++) {
        eventPublisher.publishEvent(
            new DayHasPassed(LocalDate.of(2025, 1, 1).plusDays(i)));
    }
    assertThat(events).doesNotContain(new InvoiceBecameOverdue(invoiceId));
}
```

# 5. 감사 추적 — 인과 체인이 기록으로 남아요

이벤트 로그에 전체 인과 관계가 명시적으로 남아요.

```text
CustomerWasInvoiced       ← 1/16 송장 발행
DayHasPassed              ← 1/17
DayHasPassed              ← 1/18
...
DayHasPassed              ← 2/15 (30일째)
InvoiceBecameOverdue      ← 연체 판정
AccountWasSuspended       ← 계정 정지
```

기존 설계에서는 DB에 `suspended_at = 2025-02-15`만 남을 뿐, 크론이 몇 번 실행됐는지, 중간에 누락이 있었는지 알 수 없어요. 이벤트 로그가 있으면 장애 추적·감사(audit) 시 원인 체인을 거꾸로 따라갈 수 있어요.

---

# 6. 한계

시간의 흐름을 이벤트로 다루는 방식에도 주의할 점이 있어요.

## 6-1. Thundering Herd

`DayHasPassed`가 자정에 발행되면, 모든 구독자가 동시에 깨어나 DB 쿼리·네트워크 호출을 수행해요. 서비스가 수십 개면 자정마다 부하 스파이크가 발생해요.

> [!TIP] 완화 방법
> - 각 소비자에 jitter(랜덤 지연)를 추가해요.
> - 메시지 브로커의 delivery delay를 서비스마다 다르게 설정해요.

## 6-2. 동기 트랜잭션 전파

단일 앱 내에서 `@EventListener`는 기본적으로 발행자의 트랜잭션 안에서 동기 실행돼요. 리스너가 많아지면 트랜잭션이 길어지고, 하나가 실패하면 전체가 롤백돼요.

> [!TIP] 완화 방법
> - `@TransactionalEventListener` — 트랜잭션 커밋 후 실행해요. ([[@TransactionalEventListener]])
> - `@Async` — 비동기 실행으로 트랜잭션을 분리해요.

---

# 7. Spring Modulith Moments — 라이브러리가 해주는 것

Verraes의 패턴을 Spring Modulith가 `spring-modulith-moments`로 구현했어요. 직접 `@Scheduled` + `ApplicationEventPublisher`를 만들 필요 없이, `Moments` 빈이 자동으로 시간 이벤트를 발행해줘요.

```gradle
dependencies {
    implementation 'org.springframework.modulith:spring-modulith-moments'
}
```

## 7-1. 자동 발행되는 이벤트

| 이벤트 | 발행 시점 |
|---|---|
| `HourHasPassed` | 매시 |
| `DayHasPassed` | 매일 |
| `WeekHasPassed` | 매주 |
| `MonthHasPassed` | 매월 |
| `QuarterHasPassed` | 매분기 |
| `YearHasPassed` | 매년 |

## 7-2. 테스트용 TimeMachine

```properties
spring.modulith.moments.enable-time-machine=true
```

앞서 `for`문으로 30번 이벤트를 발행했던 코드를, `TimeMachine`이 한 줄로 대체해요. 시간을 앞으로 이동시키면 그 사이에 발생해야 하는 모든 단위 이벤트가 순서대로 발행돼요.

## 7-3. 주요 설정

| 속성 | 기본값 | 역할 |
|---|---|---|
| `granularity` | `hours` | 최소 발행 단위. `days`로 바꾸면 `HourHasPassed`를 발행하지 않음 |
| `zone-id` | `UTC` | 물리적 시간 → 날짜 변환 경계 |
| `locale` | 시스템 기본값 | 날짜 → 주 단위 변환 경계 (주 시작일) |
| `quarter-start-month` | `JANUARY` | 회계연도 분기 기준 월 |
| `enable-time-machine` | `false` | 테스트 모드 전환 |

## 7-4. `zone-id`와 `locale`이 분리된 이유

두 속성은 서로 다른 경계를 결정하기 때문에 나뉘어 있어요.

```java
// zone-id: "오늘"의 경계 — 물리적 시간 → 날짜
ZonedDateTime.now(ZoneOffset.UTC);            // 2026-07-12T23:00Z
ZonedDateTime.now(ZoneId.of("Asia/Seoul"));   // 2026-07-13T08:00+09:00

// locale: "이번 주"의 경계 — 날짜 → 주
WeekFields.of(Locale.US).getFirstDayOfWeek();    // SUNDAY
WeekFields.of(Locale.KOREA).getFirstDayOfWeek(); // MONDAY
```

## 7-5. `granularity` 판단 기준

비즈니스 요구사항의 시간 해상도에 맞춰요.

```java
// hours가 필요한 케이스 — 경매 마감 (시간 단위 정밀도)
@EventListener
public void on(HourHasPassed event) {
    auctionRepository.findEndingAt(event.time())
        .forEach(auction ->
            eventPublisher.publishEvent(new AuctionHasEnded(auction.getId())));
}

// days로 충분한 케이스 — 쿠폰 만료 (날짜 단위)
@EventListener
public void on(DayHasPassed event) {
    couponRepository.findExpiredOn(event.date())
        .forEach(coupon ->
            eventPublisher.publishEvent(new CouponHasExpired(coupon.getId())));
}
```

> [!NOTE] 안 듣는 이벤트를 발행하지 않기
> 시간 단위 리스너가 없는데 `hours`를 쓰면, 아무도 듣지 않는 `HourHasPassed`를 하루 24번 발행하는 셈이에요. 이럴 때는 `days`로 설정해 불필요한 부하를 줄여요.

---

## 최종 정리

> 스케줄러가 "무엇을 언제"까지 알던 결합을 끊고, "시간이 흘렀다"는 사실만 도메인 이벤트로 발행하면, 시간 기반 로직은 구독자에 격리되고(OCP), 시간이 데이터가 되어 테스트가 쉬워지며, 인과 체인이 이벤트 로그로 남아요. Spring Modulith의 `spring-modulith-moments`가 이 패턴을 `Moments` 빈과 `TimeMachine`으로 구현해줘요.

## 관련 노트

- [[C. Working with Application Events]] — 이벤트 발행/소비, `@ApplicationModuleListener`
- [[@EventListener]] — 이벤트 구독의 기본
- [[@TransactionalEventListener]] — 커밋 이후 실행으로 트랜잭션 분리
- [[ApplicationEvent]] — Spring 이벤트 모델의 기초
- 이전: [[D. Integration Testing Application Modules]]

## 참고 문서

- [Working with Passage of Time Events](https://docs.spring.io/spring-modulith/reference/moments.html)
- [Mathias Verraes - Passage of Time Events](https://verraes.net/2019/05/patterns-for-decoupling-distsys-passage-of-time-event/)
- [Configuration Properties](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties)
