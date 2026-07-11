---
type: MOC
tags:
  - spring
  - event
---
# Spring 이벤트

Spring `ApplicationContext`의 이벤트 발행/구독부터 Spring Data의 도메인 이벤트, 테스트에서의 이벤트 검증까지 정리한 노트 묶음이에요.

**발행자(publisher)는 리스너를 직접 알지 못하고 `ApplicationContext`를 통해서만 연결돼요.** `Observer` 패턴을 Spring이 인프라로 구현한 거예요.

```text
EmailService (발행자)
      │  publisher.publishEvent(event)
      ▼
ApplicationContext (브로드캐스트)
      │
      ├──▶ BlockedListNotifier (리스너 A)
      └──▶ AuditLogListener    (리스너 B)
```

얻는 것:

- **결합도 감소** — 발행자는 리스너가 몇 개인지 몰라도 돼요. 리스너를 추가/제거해도 발행자 코드는 그대로예요.
- **테스트 용이성** — 발행자를 테스트할 때 "리스너가 무엇을 했는지"까지 볼 필요 없이 "이벤트가 발행됐는지"만 확인하면 돼요.

> [!NOTE] 결합도가 사라지는 건 아니에요
> 직접 호출 관계가 이벤트를 통한 간접 연결로 바뀔 뿐, 의존성이 없어지는 건 아니에요. 발행자와 리스너는 "이벤트 타입"이라는 계약을 공유해요.

---

## 노트 목록

| 노트 | 다루는 것 |
|---|---|
| [[ApplicationEvent]] | 이벤트 객체 정의 (record vs 상속), `source`, 제네릭 이벤트와 타입 소거 |
| [[@EventListener]] | 애노테이션 기반 리스너, 오버로딩, `condition`, `@Order` |
| [[@TransactionalEventListener]] | 커밋 이후 실행(`AFTER_COMMIT`), 트랜잭션 함정, `@Async`와의 조합 |
| [[@DomainEvents]] | Aggregate 기반 이벤트 발행 (Spring Data), `AbstractAggregateRoot` |
| [[ApplicationEvents 테스트]] | `@RecordApplicationEvents`로 발행된 이벤트 검증 |

## 학습 순서 (권장)

1. [[ApplicationEvent]] — 이벤트를 정의하는 법, 제네릭 이벤트 구분
2. [[@EventListener]] — 어떻게 받는지
3. [[@TransactionalEventListener]] — 트랜잭션과 함께 쓸 때의 함정
4. [[@DomainEvents]] — 서비스 대신 Aggregate가 이벤트를 기록하는 방식
5. [[ApplicationEvents 테스트]] — 이 모든 걸 테스트로 검증
## 참고 문서

- [Standard and Custom Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events)
- [Transaction-bound Events](https://docs.spring.io/spring-framework/reference/data-access/transaction/event.html)
- [Application Events (TestContext)](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/application-events.html)
- [Publishing Events from Aggregate Roots](https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html)

관련: [[C. Working with Application Events]] (Spring Modulith 관점)
