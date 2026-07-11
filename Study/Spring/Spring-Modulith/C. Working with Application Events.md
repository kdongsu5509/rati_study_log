---
library: Spring Modulith
library_version: 2.1.0
version: 2.1.0
prev: "[[B. Verifying Application Module Structure]]"
next: "[[D. Integration Testing Application Modules]]"
---

[Spring Modulith Docs - Working with Application Events](https://docs.spring.io/spring-modulith/reference/events.html)

애플리케이션 모듈 간의 결합도를 최대한 낮게 유지하기 위해, 모듈 간 주된 상호작용 수단은 이벤트 발행(publication) 및 소비(consumption)가 되어야 해요. 이를 통해 이벤트를 발생시키는 모듈이 이벤트에 관심이 있을 수 있는 모든 대상에 대해 알 필요가 없게 되며, 이는 애플리케이션 모듈 통합 테스트를 가능하게 하는 핵심 요소예요 ([Integration Testing Application Modules](https://docs.spring.io/spring-modulith/reference/testing.html) 참고).

> Spring의 이벤트 메커니즘 자체(`@EventListener`, `@TransactionalEventListener`, `@DomainEvents`)는 [[Spring 이벤트]] MOC에서 다뤄요. 이 문서는 그 위에 Spring Modulith가 얹는 것(발행 기록부·외부화·모듈 테스트)에 집중해요.

---

# 1. 왜 직접 호출 대신 이벤트인가

- 일반적인 컴포넌트 Logic

```java
@Service
@RequiredArgsConstructor
public class OrderManagement {

  private final InventoryManagement inventory;

  @Transactional
  public void complete(Order order) {

    // State transition on the order aggregate go here

    // Invoke related functionality
    inventory.updateStockFor(order);
  }
}
```

`complete()` 메서드는 관련된 기능을 필요로 할 수 있고, 이 과정에서 다른 애플리케이션 모듈에 정의된 `Spring Bean` 들과 상호작용이 필요할 수도 있어요. 이 때문에 `OrderManagement` 클래스에 `complete` 와 관련된 부가 기능과 외부 의존성이 집중될 가능성이 높아져요. 이러한 점은 다음과 같은 문제점을 야기해요.

1. 높은 결합도
	- `주문 완료` 라는 비즈니스 상의 이벤트에 기능 추가 시, `OrderManagement`의 `complete()` 에서 직접 호출
		- 이로 인해 주입 받아야 하는 `spring bean` 의 개수가 지속적으로 증가 → `Module` 간의 결합도 증가
2. 테스트의 어려움
	- `1` 로 인해 주입받는 모든 외부 의존성들에 대해 `Mock` 등의 추가적인 설정이 필요함.
3. OCP 위배
	- `1` 에서 언급한 것처럼 `주문 완료` 의 로직 변경이 아닌 부가 기능 추가를 위해서 `OrderManagement` 의 코드가 변경되어야 함.

이러한 문제들은 다음과 같이 변경하면, 쉽게 해결 가능해요.

# 2. `ApplicationEventPublisher` 를 이용한 애플리케이션 이벤트 발행

```java
@Service
@RequiredArgsConstructor
public class OrderManagement {

  private final ApplicationEventPublisher events;
  private final OrderInternal dependency;

  @Transactional
  public void complete(Order order) {

    // State transition on the order aggregate go here

    events.publishEvent(new OrderCompleted(order.getId()));
  }
}
```

다른 애플리케이션 모듈의 Spring 빈에 직접 의존하는 대신, 주 애그리거트(primary aggregate)의 상태 전환을 완료한 후 Spring의 `ApplicationEventPublisher`를 사용하여 도메인 이벤트를 발행하는 방식에 주목하세요. 보다 애그리거트 중심적인 이벤트 발행 방식에 대한 자세한 내용은 [[@DomainEvents]] 및 [[Spring 이벤트]]를 참고하세요.

이벤트 발행은 기본적으로 동기식으로 처리되므로, 전체 구조의 트랜잭션 의미(semantics)는 이전 예제와 동일하게 유지돼요. 이는 장단점을 모두 가져요.

- **장점**은 매우 단순한 일관성 모델(주문 상태 변경과 재고 업데이트가 모두 성공하거나 모두 실패함)을 보장한다는 것이에요.
- **단점**은 이벤트에 의해 트리거되는 관련 기능이 늘어날수록 트랜잭션 경계가 넓어지며, 오류를 발생시킨 기능이 핵심 로직이 아님에도 불구하고 전체 트랜잭션을 실패하게 만들 수 있다는 점이에요.

이를 해결하기 위한 다른 접근 방식은 트랜잭션 커밋 시점에 이벤트 소비를 비동기 처리로 전환하여, 부가 기능(secondary functionality)을 그 목적에 맞게 온전히 부가적인 것으로만 취급하는 것이에요.

# 3. 비동기 트랜잭션 이벤트 리스너

```java
@Component
class InventoryManagement {

  @Async
  @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

이 방식은 결과적으로 원본 트랜잭션을 리스너의 실행과 효과적으로 분리(decouple)해요. 이를 통해 원본 비즈니스 트랜잭션의 경계가 확장되는 것을 방지할 수 있지만, 동시에 위험도 초래해요.

> [!WARNING] 이벤트 유실
> 각 리스너가 자체적인 안전망(safety net)을 구현하지 않는 한, 어떤 이유로든 리스너가 실패할 경우 발행된 **이벤트가 유실**돼요. 더 심각한 문제는 시스템이 해당 메서드(리스너)를 호출하기도 전에 장애가 발생할 수 있기 때문에, 리스너 내부의 안전망만으로는 완벽한 해결책이 될 수 없다는 점이에요. → 이 문제는 5절의 **이벤트 발행 기록부**가 다뤄요.

리스너 관련 세부(`AFTER_COMMIT`, `@Async` 조합, 트랜잭션 없을 때 무시)는 [[@TransactionalEventListener]] 참고.

# 4. Application Module Listener

트랜잭션 이벤트 리스너 자체를 트랜잭션 안에서 실행하려면, 해당 리스너에도 `@Transactional`을 붙여야 해요.

자체 트랜잭션 안에서 실행되는 비동기 트랜잭션 이벤트 리스너:

```java
@Component
class InventoryManagement {

  @Async
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

이벤트를 통해 모듈을 통합하는 기본 방식을 더 쉽게 선언할 수 있도록, Spring Modulith는 축약 애노테이션인 `@ApplicationModuleListener`를 제공해요.

```java
@Component
class InventoryManagement {

  @ApplicationModuleListener // = @Async + @Transactional(REQUIRES_NEW) + @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

---

# 5. 이벤트 발행 기록부 (The Event Publication Registry)

Spring Modulith는 Spring Framework의 핵심 이벤트 발행 메커니즘과 연동되는 이벤트 발행 레지스트리를 제공해요. 이벤트가 발행되면, 해당 이벤트를 전달받을 트랜잭션 이벤트 리스너를 찾아내요. 그리고 원래 비즈니스 트랜잭션의 일부로 각 리스너에 대한 항목을 이벤트 발행 로그에 기록해요. 기본적으로 `@TransactionalEventListener`가 직접 또는 메타 애노테이션 형태로 붙은 모든 이벤트 리스너가 대상이 돼요. 이 동작을 변경하려면 `spring.modulith.events.registry-trigger-annotation` 설정을 확인하면 돼요.

![event publication registry start](https://docs.spring.io/spring-modulith/reference/_images/event-publication-registry-start.png)
*Figure 1. 실행 전 트랜잭션 이벤트 리스너 배치*

각 트랜잭션 이벤트 리스너는 하나의 애스펙트(aspect)로 감싸져요. 리스너 실행이 성공하면 그 로그 항목을 완료(completed)로 표시하고, 리스너가 실패하면 로그 항목은 그대로 남아 있어서 애플리케이션의 필요에 따라 재시도 메커니즘을 적용할 수 있어요. 애플리케이션이 재시작될 때 이벤트를 자동으로 다시 발행하도록 하려면 [`spring.modulith.events.republish-outstanding-events-on-restart`](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties) 속성으로 활성화할 수 있어요.

![event publication registry end](https://docs.spring.io/spring-modulith/reference/_images/event-publication-registry-end.png)
*Figure 2. 실행 후 트랜잭션 이벤트 리스너 배치*

## 쉽게 풀어쓴 요약

Spring Modulith는 이벤트가 제대로 처리되었는지를 관리하는 **이벤트 처리 기록부**를 제공해요.

이벤트가 발행되면 Spring Modulith는 먼저 그 이벤트를 처리하도록 등록된 `@TransactionalEventListener`들을 찾아요. 그런 다음 각 리스너가 처리해야 할 작업을 이벤트 발행 기록부에 하나씩 저장해요. 이 기록은 원래 비즈니스 작업과 같은 트랜잭션 안에서 저장돼요.

예를 들어 주문 완료 이벤트를 재고 리스너와 포인트 리스너가 구독하고 있다면 다음 두 작업이 기록돼요.

- 재고 리스너가 주문 완료 이벤트를 처리해야 한다.
- 포인트 리스너가 주문 완료 이벤트를 처리해야 한다.

각 리스너가 실행에 성공하면 Spring Modulith는 해당 작업을 완료된 것으로 표시해요. 반대로 리스너 실행 중 오류가 발생하면 해당 작업은 완료 처리되지 않아요. 따라서 나중에 실패한 작업만 찾아서 다시 실행할 수 있어요. 필요하다면 애플리케이션이 재시작될 때 완료되지 않은 이벤트 작업을 자동으로 다시 실행하도록 설정할 수도 있어요.

기본적으로 `@TransactionalEventListener`가 붙은 리스너가 이러한 관리 대상이 돼요. 다른 애노테이션을 기준으로 관리하고 싶다면 `spring.modulith.events.registry-trigger-annotation` 설정을 변경할 수 있어요.

> 한마디로: Spring Modulith의 Event Publication Registry는 어떤 이벤트를 어떤 리스너가 처리해야 하는지 기록하고, 처리 성공 여부를 관리하여 실패한 작업을 나중에 다시 시도할 수 있게 해주는 기능이에요.

## 5-1. 이벤트 발행 생명주기 (Event Publication Lifecycle, since 2.0)

Spring Modulith 2.0은 발행에 전용 생명주기를 도입했어요. 이를 통해 처리 예정, 처리 중, 완료, 실패 상태의 발행을 구분할 수 있어요. 덕분에 실패한 발행만 재제출하고, 크래시로부터 복구할 때 처리 중인 것을 실패로 잘못 취급하지 않게 돼요.

### 발행 상태 (Publication states)

각 이벤트 발행은 `EventPublication.Status`를 가져요.

- `PUBLISHED` – 발행이 저장되어 처리를 기다리는 상태 (또는 곧 픽업될 상태).
- `PROCESSING` – 리스너가 발행을 점유하고 실행 중인 상태. 리스너를 감싸는 인터셉터가 리스너 호출 직전에 이 상태로 설정하고, 리스너가 반환되면 `COMPLETED` 또는 `FAILED`로 설정해요.
- `COMPLETED` – 리스너가 성공적으로 끝난 상태. 완료일(completion date)이 설정돼요 (완료 모드가 `DELETE`인 경우는 제외).
- `FAILED` – 리스너가 예외를 던졌거나, staleness 메커니즘에 의해 실패로 표시된 상태.
- `RESUBMITTED` – 이전에 실패한 발행이 재제출되어 다시 처리 대기 중인 상태.

![event-publication-lifecycle](https://docs.spring.io/spring-modulith/reference/modulith/_images/event-publication-lifecycle-ab8d6ffd06f5cc626c7bceebcede14fad3d0ccac.svg)

### 발행 상세 정보 (Publication details)

상태 외에도 각 발행은 다음을 추적해요.

- **마지막 재제출 일시(Last resubmission date)** – 발행이 마지막으로 재제출된 시점(있다면). `EventPublication.getLastResubmissionDate()`로 노출돼요.
- **완료 시도 횟수(Completion attempts)** – 리스너가 호출된 횟수(현재 실행 포함). `PROCESSING`으로 이동할 때 증가하므로, 리스너 실행 도중 크래시가 나도 시도 횟수는 갱신된 채로 남아요. `EventPublication.getCompletionAttempts()`로 노출돼요.

이 값들로 "X보다 오래 실패한 경우에만 재제출", "N회 시도 후 중단" 같은 정책을 재제출 API·옵션으로 구현할 수 있어요.

### 5-2. 발행 staleness와 자동 실패 표시

애플리케이션이 크래시하거나 리스너가 멈추면(hang) 발행이 `PUBLISHED`, `PROCESSING`, `RESUBMITTED` 상태에 계속 머무를 수 있어요. 이들을 실패로 취급해 재제출(또는 무시)할 수 있도록, 각 상태가 얼마의 기간이 지나면 **stale**로 간주될지 설정할 수 있어요. Stale 발행은 백그라운드 작업이 주기적으로 `FAILED`로 표시해요.

Spring Modulith는 설정 가능한 간격으로 스케줄 작업으로 실행되는 **Staleness Monitor**(since 2.0)를 제공해요. staleness 기간 중 하나라도 0이 아닌 값으로 설정되면 모니터가 활성화되고, 매 실행마다 해당 기간보다 오래된 `PUBLISHED`/`PROCESSING`/`RESUBMITTED` 발행을 찾아 `FAILED`로 표시해요. 그러면 `FailedEventPublications.resubmit(…)` 등으로 복구하거나, 그대로 두면 막혀 있을 발행을 다르게 처리할 수 있어요. `spring.modulith.events.staleness` 설정으로 커스터마이징해요. `published`, `processing`, `resubmitted`가 모두 0(기본값)이면 Staleness Monitor는 스케줄 작업을 등록하지 않고 자동 실패 표시도 일어나지 않아요.

### 5-3. 실패한 발행과 재제출

레지스트리는 실패한 발행을 명시적으로 다룰 수 있게 해줘요.

- **`FailedEventPublications`** (since 2.0) – 이 타입의 빈을 사용해 실패한 발행만 재제출해요: `resubmit(ResubmissionOptions)`.
- **`ResubmissionOptions`** – 재제출 동작을 제어해요: 배치 크기, 최대 in-flight, 발행 최소 나이, 선택적 필터(예: 이벤트 타입이나 `completionAttempts`). `ResubmissionOptions.defaults()`로 생성하고 `withBatchSize(…)`, `withMinAge(…)`, `withFilter(…)` 등으로 커스터마이징해요.

재제출은 상태를 `FAILED` → `RESUBMITTED`로 바꾸고 마지막 재제출 일시를 갱신해요. 리스너가 실행되려 할 때 발행은 `PROCESSING`으로 이동하고 완료 시도 횟수가 증가해요.

일반적인 "미완료(incomplete)" 발행(실패한 것, 그리고 설정에 따라 stale한 것 포함)에는 기존 `IncompleteEventPublications` API가 여전히 적용돼요. 2.0부터는 predicate 및 duration 기반 오버로드에 더해 `resubmitIncompletePublications(ResubmissionOptions)`를 지원해요.

## 5-4. Spring Boot 이벤트 레지스트리 스타터

트랜잭션 이벤트 발행 로그를 사용하려면 애플리케이션에 여러 아티팩트를 조합해 추가해야 해요. 이 작업을 쉽게 하도록 Spring Modulith는 사용할 [영속성 기술](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.publication-repositories)을 중심으로 한 스타터 POM을 제공하며, 기본값으로 Jackson 기반 [EventSerializer](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.serialization) 구현을 사용해요.

| 영속성 기술 | 아티팩트 | 설명 |
|---|---|---|
| JPA | `spring-modulith-starter-jpa` | JPA를 영속성 기술로 사용 |
| JDBC | `spring-modulith-starter-jdbc` | JDBC를 영속성 기술로 사용. JPA 기반 앱에서도 동작하지만 실제 이벤트 저장은 JPA 프로바이더를 우회함 |
| MongoDB | `spring-modulith-starter-mongodb` | MongoDB 사용. MongoDB 트랜잭션도 활성화하며 서버의 replica set 구성이 필요함. `spring.modulith.events.mongodb.transaction-management.enabled`를 `false`로 두면 트랜잭션 자동 구성 비활성화 |
| Neo4j | `spring-modulith-starter-neo4j` | Spring Data Neo4j 뒤의 Neo4j 사용 |

## 5-5. 이벤트 발행 관리 (Managing Event Publications)

이벤트 발행은 애플리케이션 런타임 동안 여러 방식으로 관리해야 할 수 있어요. 미완료 발행은 일정 시간 후 해당 리스너로 재제출해야 할 수 있고, 반대로 완료된 발행은 데이터베이스에서 purge하거나 아카이브 저장소로 옮겨야 할 수 있어요. 이런 하우스키핑의 필요는 애플리케이션마다 크게 다르기 때문에, Spring Modulith는 두 종류 발행을 다루는 API를 제공해요. 이 API는 애플리케이션에 추가할 수 있는 `spring-modulith-events-api` 아티팩트로 제공돼요.

```groovy
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-events-api:2.1.0'
}
```

이 아티팩트는 애플리케이션 코드에 Spring 빈으로 제공되는 주요 추상을 담고 있어요.

- **`CompletedEventPublications`** — 완료된 모든 이벤트 발행에 접근하게 해주며, DB에서 즉시 전부 purge하거나 특정 기간(예: 1분)보다 오래된 완료 발행을 purge하는 API를 제공해요.
- **`IncompleteEventPublications`** — 미완료 이벤트 발행에 접근해, 주어진 predicate에 맞는 것, 원래 발행일 기준 특정 `Duration`보다 오래된 것, 또는 `resubmitIncompletePublications(ResubmissionOptions)`(since 2.0)로 커스텀 기준에 맞는 것을 재제출하게 해줘요.
- **`FailedEventPublications`** (since 2.0) — 실패한 이벤트 발행만 `resubmit(ResubmissionOptions)`로 재제출하게 해줘요 (5-3 참고).

## 5-6. 이벤트 발행 완료 (Event Publication Completion)

이벤트 발행은 트랜잭션 리스너 또는 `@ApplicationModuleListener` 실행이 성공적으로 끝나면 완료로 표시돼요. 기본적으로 완료는 `EventPublication`에 완료일을 설정하는 방식으로 기록돼요. 이 말은 완료된 발행이 이벤트 발행 레지스트리에 계속 남아 `CompletedEventPublications` 인터페이스로 조회할 수 있다는 뜻이에요. 그 결과, 오래된 완료 `EventPublication`을 주기적으로 purge하는 코드를 마련해야 해요. 그러지 않으면 이들의 영속 저장소(예: 관계형 DB 테이블)가 무한히 커지고, 새 `EventPublication`을 생성·완료하는 상호작용이 느려질 수 있어요.

Spring Modulith 1.3은 `spring.modulith.events.completion-mode` 설정으로 두 가지 완료 모드를 추가로 지원해요.

| 모드 | 동작 |
|---|---|
| `UPDATE` (기본) | 위에서 설명한 전략. 완료일을 설정하고 항목은 레지스트리에 남음 → 오래된 완료 항목을 직접 purge해야 함 |
| `DELETE` | 완료 시 `EventPublication`을 삭제하도록 영속 메커니즘을 변경. `CompletedEventPublications`로는 더 이상 조회되지 않지만, 완료 이벤트를 수동으로 purge할 걱정이 없어짐 |
| `ARCHIVE` | 항목을 아카이브 테이블/컬렉션/노드로 복사. 그 아카이브 항목에 완료일을 설정하고 원본은 제거. `DELETE`와 달리 완료 발행을 여전히 `CompletedEventPublications`로 접근 가능 |

## 5-7. 이벤트 발행 저장소 (Event Publication Repositories)

발행 로그를 실제로 쓰기 위해 Spring Modulith는 `EventPublicationRepository` SPI와, 트랜잭션을 지원하는 인기 영속성 기술(JPA, JDBC, MongoDB)의 구현을 노출해요. 사용할 영속성 기술은 해당 JAR을 애플리케이션에 추가해 선택하며, 이를 쉽게 하도록 전용 스타터가 준비돼 있어요.

JDBC 기반 구현은 발행 로그용 전용 테이블을 생성해요. 단, `spring.modulith.events.jdbc.schema-initialization.enabled` 속성이 `false`이면 생성하지 않아요. 또한 필요한 테이블이 이미 존재하면(예: Flyway/Liquibase 같은 마이그레이션 도구로 생성) 스키마 생성은 백오프해요. 자세한 내용은 부록의 [스키마 개요](https://docs.spring.io/spring-modulith/reference/appendix.html#schemas)를 참고하세요.

## 5-8. 이벤트 직렬화기 (Event Serializer)

각 로그 항목은 원본 이벤트를 직렬화된 형태로 담아요. `spring-modulith-events-core`의 `EventSerializer` 추상은 이벤트 인스턴스를 데이터스토어에 적합한 형식으로 변환하는 전략을 갈아끼울 수 있게 해줘요. Spring Modulith는 `spring-modulith-events-jackson` 아티팩트를 통해 Jackson 기반 JSON 구현을 제공하며, 기본적으로 Spring Boot 자동 구성으로 `ObjectMapper`를 주입받는 `JacksonEventSerializer`를 등록해요.

## 5-9. 이벤트 발행 시각 커스터마이징

기본적으로 Event Publication Registry는 `Clock.systemUTC()`가 반환하는 시각을 이벤트 발행 시각으로 사용해요. 이를 커스터마이징하려면 애플리케이션 컨텍스트에 `Clock` 타입 빈을 등록하세요.

```java
@Configuration
class MyConfiguration {

  @Bean
  Clock myCustomClock() {
    return … // 여기서 생성한 커스텀 Clock 인스턴스
  }
}
```

---

# 6. 이벤트 외부화 (Externalizing Events)

> [!NOTE] 기본 외부화의 한계
> 아래 내용은 비동기 이벤트 리스너 기반의 Spring Modulith 네이티브 이벤트 외부화예요. 실용적이고 단순한 해법이지만, 실제 outbox 패턴 구현에서 기대할 만한 핵심 기능은 부족해요. Spring Modulith 2.1은 [Namastack Outbox](https://outbox.namastack.io/)와 [JobRunr](http://jobrunr.io/)를 통한 이벤트 외부화를 도입했어요 (6-7절).

지금까지 다룬 이벤트는 같은 애플리케이션 안에서 모듈끼리 주고받는 이벤트였어요. 하지만 주문 완료나 회원 가입 같은 이벤트는 외부 시스템에도 전달해야 할 수 있어요.

```text
주문 모듈
  ↓ OrderCompleted 이벤트
Spring Modulith
  ↓
Kafka
  ↓
배송 시스템·데이터 분석 시스템
```

이처럼 애플리케이션 내부 이벤트를 Kafka 같은 외부 메시지 브로커로 보내는 것을 이벤트 외부화, 즉 `Event Externalization`이라고 해요.

## 6-1. 외부로 이벤트를 보내는 방법

이벤트 외부화에는 크게 세 단계가 필요해요.

1. Kafka나 AMQP 등 사용할 메시지 브로커의 의존성을 추가해요.
2. 외부로 보낼 이벤트에 `@Externalized`를 붙여요 (Spring Modulith 또는 jMolecules의 애노테이션).
3. 이벤트를 보낼 목적지를 애노테이션 값에 지정해요.

```java
@Externalized("orders.completed")
public record OrderCompleted(Long orderId) {
}
```

이제 `OrderCompleted` 이벤트가 애플리케이션 안에서 발행되면 Spring Modulith가 이를 `orders.completed`라는 외부 목적지로 전송해요. 모든 내부 이벤트를 외부로 보내는 것은 아니에요. 기본적으로 `@Externalized`가 붙은 이벤트만 외부 전송 대상으로 선택돼요.

## 6-2. 지원하는 메시지 전송 기술 (Supported Infrastructure)

| 전송 기술 | 추가할 모듈 | 목적지 |
|---|---|---|
| Kafka | `spring-modulith-events-kafka` | 토픽 (논리적 라우팅 키가 Kafka의 topic·message key로 사용) |
| AMQP | `spring-modulith-events-amqp` | Exchange 또는 routing key (Spring Rabbit 등 명시적 의존성 필요, 논리적 라우팅 키가 AMQP routing key로 사용) |
| JMS | `spring-modulith-events-jms` | Queue 또는 Topic (라우팅 키 미지원) |
| Spring Messaging | `spring-modulith-events-messaging` | `@Externalized`의 `target`과 같은 이름의 `MessageChannel` 빈. 라우팅 정보를 `springModulith_routingTarget` 헤더로 전달 |

Kafka를 사용한다면 Spring Kafka를 통해 메시지를 전송해요. AMQP를 사용한다면 Spring AMQP를 사용하며, RabbitMQ 같은 실제 구현체의 의존성도 별도로 추가해야 해요. JMS는 라우팅 키를 지원하지 않아요. Spring Messaging 방식에서는 `@Externalized`에 지정한 목적지 이름과 같은 이름의 `MessageChannel` 빈을 찾아 메시지를 전달하며, 라우팅 정보는 `springModulith_routingTarget` 헤더로 전달되어 보통 Spring Integration `IntegrationFlow`에서 처리돼요.

## 6-3. 이벤트 외부화 과정 (Fundamentals)

이벤트 외부화는 [트랜잭션 이벤트 리스너](https://docs.spring.io/spring-modulith/reference/events.html#aml)로 구현되어 브로커별 발행 구현에 위임해요. 즉 Spring Modulith의 [이벤트 발행 레지스트리](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry)가 브로커와의 상호작용 중 실패에 대비해 외부화를 보호하므로, 발행을 제공된 API로 재제출할 수 있어요.

Spring Modulith가 이벤트 하나를 외부로 보낼 때는 다음 세 단계를 거쳐요.

### 1. 외부로 보낼 이벤트인지 판단 (event selection)

먼저 이 이벤트가 외부 전송 대상인지 확인해요. 기본적으로 다음 조건을 만족하는 이벤트가 선택돼요.

- Spring Boot 자동 구성 패키지 내부에 있다.
- 지원되는 `@Externalized` 애노테이션 중 하나가 붙어 있다.

```java
@Externalized
public record OrderCompleted(Long orderId) {
}
```

반면 `@Externalized`가 없는 내부 이벤트는 외부로 보내지 않아요.

### 2. 외부 메시지로 가공 (선택 사항)

기본적으로는 이벤트 객체를 해당 브로커 인프라가 그대로 직렬화하여 전송해요.

```text
new OrderCompleted(100L)   →   { "orderId": 100 }
```

그러나 내부 이벤트에는 외부 시스템이 알 필요 없는 정보가 포함될 수 있어요. 이 경우 매핑 단계를 이용해 외부 전용 메시지로 바꾸거나 완전히 교체할 수 있어요. Kafka와 AMQP에서는 발행할 메시지에 헤더도 추가할 수 있어요.

```text
내부 이벤트
OrderCompleted(orderId, internalUserId, internalMetadata)
            ↓ 매핑
외부 메시지
{ "orderId": 100 }
```

### 3. 목적지 결정 (routing target)

마지막으로 메시지를 어디로 보낼지 결정해요. 메시지 브로커 클라이언트는 발행할 논리적 target이 필요하고, 이 target은 보통 물리적 인프라(브로커에 따라 topic, exchange, queue)를 식별하며 흔히 이벤트 타입에서 정적으로 파생돼요. `@Externalized`에 특별히 정의하지 않으면 Spring Modulith는 애플리케이션 로컬 타입 이름을 target으로 사용해요.

```text
기본 패키지 com.acme.app, 이벤트 com.acme.app.sample.SampleEvent
            →   기본 목적지: sample.SampleEvent
```

일부 브로커는 target 내에서 다양한 용도로 쓰이는 동적 라우팅 키도 정의할 수 있어요. 기본적으로는 라우팅 키를 사용하지 않아요.

## 6-4. 목적지와 라우팅 키 지정 (Annotation-based Configuration)

`@Externalized` 값에는 `$target::$key` 형식(`목적지::라우팅키`)을 사용할 수 있어요. target과 key 모두 이벤트 인스턴스를 루트 객체로 갖는 SpEL 표현식이 될 수 있어요.

```java
@Externalized("customer-created::#{#this.getLastname()}")
class CustomerCreated {

  String getLastname() {
    // 고객 성 반환
  }
}
```

`CustomerCreated` 이벤트는 접근자 메서드로 고객의 성을 노출해요. `::` 구분자 뒤의 키 표현식 `#this.getLastname()`이 라우팅 키로 사용돼요.

```text
customer-created           → 메시지를 보낼 목적지
#{#this.getLastname()}     → 메시지의 라우팅 키
```

고객의 성이 `Kim`이라면 결과는 개념적으로 목적지 `customer-created`, 라우팅 키 `Kim`이 돼요.

키 계산 로직이 복잡해지면 이벤트 클래스 안에 넣지 않고, 이벤트를 인자로 받는 Spring 빈에 위임하는 게 좋아요.

```java
@Externalized("customer-created::#{@routingKeyService.calculate(#this)}")
```

여기서 `#this`는 현재 발행된 이벤트 객체를 의미해요.

## 6-5. Java 설정으로 외부화 규칙 만들기 (Programmatic Configuration)

애노테이션만으로 설정하기 어렵다면 `spring-modulith-events-api`의 `EventExternalizationConfiguration`으로 위 모든 단계를 Java 코드로 커스터마이징할 수 있어요.

```java
@Configuration
class ExternalizationConfiguration {

  @Bean
  EventExternalizationConfiguration eventExternalizationConfiguration() {
    return EventExternalizationConfiguration.externalizing()                 // ①
      .select(EventExternalizationConfiguration.annotatedAsExternalized())   // ②
      .mapping(SomeEvent.class, event -> …)                                  // ③
      .headers(event -> …)                                                   // ④
      .routeKey(WithKeyProperty.class, WithKeyProperty::getKey)              // ⑤
      .build();
  }
}
```

① `EventExternalizationConfiguration`의 기본 인스턴스를 생성해요.
② 이전 호출이 반환한 `Selector`의 `select(…)` 메서드로 이벤트 선택을 커스터마이징해요. 이 단계는 애플리케이션 기본 패키지 필터를 사실상 비활성화하고 애노테이션만 보게 해요. 타입·패키지·(패키지+애노테이션)으로 쉽게 선택하는 편의 메서드, 그리고 선택과 라우팅을 한 번에 정의하는 단축 메서드도 있어요.
③ `SomeEvent` 인스턴스에 대한 매핑 단계를 정의해요. 단, 라우팅은 라우터에서 `.routeMapped()`를 추가로 호출하지 않는 한 여전히 원본 이벤트 인스턴스로 결정돼요.
④ 발행할 메시지에 커스텀 헤더를 추가해요. 전체 공통으로, 또는 특정 payload 타입에 한정해서 추가할 수 있어요.
⑤ 이벤트 인스턴스에서 값을 뽑는 메서드 핸들을 정의해 라우팅 키를 결정해요. 또는 이전 호출이 반환한 `Router`의 일반 `route(…)` 메서드로 개별 이벤트에 대한 완전한 `RoutingKey`를 만들 수 있어요.

정리하면 각 단계의 의미는 다음과 같아요.

- `externalizing()`: 이벤트 외부화 설정을 시작해요.
- `select(...)`: 어떤 이벤트를 외부로 보낼지 정해요. 직접 설정하면 기본 패키지 필터보다 정의한 선택 규칙이 적용돼요.
- `mapping(...)`: 내부 이벤트를 외부 메시지 형태로 변환해요. 내용을 바꿔도 기본적으로 목적지 계산은 변환 전 원본 이벤트를 기준으로 하며, 변환 객체 기준으로 하려면 `routeMapped()`가 필요해요.
- `headers(...)`: 메시지에 헤더를 추가해요.
- `routeKey(...)`: 라우팅 키를 계산해요.
- `build()`: 설정을 완성해요.

## 6-6. Event Publication Registry와의 관계 & 직렬화

이벤트 외부 전송은 내부적으로 트랜잭션 이벤트 리스너를 이용해요. 따라서 앞에서 살펴본 Event Publication Registry가 외부 전송 작업도 관리할 수 있어요. 예를 들어 주문 완료 이벤트를 Kafka로 보내다가 Kafka 연결에 실패하면 해당 작업이 완료되지 않은 것으로 기록돼요.

```text
OrderCompleted 발행
        ↓
외부 전송 작업 DB에 기록
        ↓
Kafka 전송 시도
        ├─ 성공 → 완료 처리
        └─ 실패 → 미완료 또는 실패 상태 유지
                         ↓
                    나중에 재시도
```

즉, Kafka에 보내는 도중 장애가 발생하더라도 실패 기록을 남기고 다시 시도할 수 있어요.

> [!WARNING] 중복 전송 가능성
> 이 방식에서는 중복 전송 가능성이 있어요. Kafka 전송은 성공했지만 완료 상태를 DB에 기록하기 전에 서버가 죽으면, 복구 과정에서 같은 이벤트를 다시 보낼 수 있기 때문이에요. 따라서 외부 시스템도 같은 이벤트를 여러 번 받아도 문제가 생기지 않도록 **멱등하게** 처리하는 것이 안전해요.

### 이벤트 전송 순서 유지하기 (Serializing Externalization)

이벤트 외부화는 트랜잭션 이벤트 리스너로 구현되므로 여러 스레드가 동시에 브로커와 상호작용할 수 있어요. 특히 발행이 재제출될 때 두드러져요. 브로커가 갑작스러운 상호작용 급증을 겪으면 일부 상호작용이 더 오래 걸려, 나중 이벤트의 외부화가 앞선 것을 추월할 수 있어요.

```text
실제 발생 순서: 주문 생성 → 주문 결제
외부 도착 순서: 주문 결제 → 주문 생성   (역전 가능)
```

이를 방지하려면 한 번에 하나의 이벤트만 나가도록 브로커와의 상호작용을 직렬화할 수 있어요.

```properties
spring.modulith.events.externalization.serialize-externalization=true
```

순서 뒤바뀜 가능성은 줄어들지만, 동시에 여러 이벤트를 보내지 못하므로 처리량이 낮아질 수 있어요.

## 6-7. Namastack / JobRunr Outbox 사용

Spring Modulith의 기본 비동기 외부화보다 강력한 Outbox 기능(전송 작업의 지속성, 재시도, 장애 복구)이 필요하면 Namastack Outbox나 JobRunr에 위임할 수 있어요. Namastack은 현재 관계형 데이터베이스에서만 사용할 수 있어요.

먼저 스타터 의존성을 추가해요.

```groovy
// Namastack (관계형 DB 전용)
implementation 'org.springframework.modulith:spring-modulith-starter-namastack'
// 또는 JobRunr
implementation 'org.springframework.modulith:spring-modulith-starter-jobrunr'
```

그다음 외부화 모드를 `outbox`로 전환해요.

```properties
spring.modulith.events.externalization.mode=outbox
```

이렇게 하면 외부 이벤트 전송을 각각 Namastack Outbox 또는 JobRunr 작업으로 처리해요. 자세한 커스터마이징은 각 프로젝트의 레퍼런스 문서를 참고하고, 예제는 Spring Modulith GitHub의 [outbox 예제](https://github.com/spring-projects/spring-modulith/tree/main/spring-modulith-examples/spring-modulith-example-outbox)를 참고하세요.

---

# 7. 이벤트 발행 테스트 (Testing published events)

> [!NOTE] 이 테스트의 범위
> 아래는 오직 Spring 애플리케이션 이벤트 추적에만 초점을 둔 테스트 방식이에요. `@ApplicationModuleListener`를 사용하는 모듈을 더 총체적으로 테스트하려면 [Scenario API](https://docs.spring.io/spring-modulith/reference/testing.html#scenarios)를 참고하세요.

`@ApplicationModuleTest`를 사용하면 테스트 대상 비즈니스 로직을 실행하는 동안 특정 이벤트 집합이 발행되었는지 검증할 수 있도록 `PublishedEvents` 인스턴스를 테스트 메서드에 주입받을 수 있어요.

```java
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  void someTestMethod(PublishedEvents events) {

    // 주문 완료 처리 실행

    var matchingMapped = events.ofType(OrderCompleted.class)
      .matching(OrderCompleted::getOrderId, reference.getId());

    assertThat(matchingMapped).hasSize(1);
  }
}
```

> 이 테스트는 `reference.getId()`와 같은 주문 ID를 가진 `OrderCompleted` 이벤트가 정확히 한 번 발행되었는지 확인해요.

`PublishedEvents`는 특정 기준에 맞는 이벤트를 선택하는 API를 노출하고, 검증은 예상 개수를 확인하는 AssertJ assertion으로 마무리돼요. 어차피 AssertJ를 쓴다면 테스트 메서드 파라미터 타입으로 `AssertablePublishedEvents`를 사용해 fluent assertion API를 그대로 쓸 수 있어요.

```java
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  void someTestMethod(AssertablePublishedEvents events) {

    // 주문 완료 처리 실행

    assertThat(events)
      .contains(OrderCompleted.class)
      .matching(OrderCompleted::getOrderId, reference.getId());
  }
}
```

`assertThat(…)` 표현식이 반환하는 타입을 통해 발행된 이벤트에 대한 제약을 직접 정의할 수 있어요.

| 파라미터 타입 | 검증 방식 |
|---|---|
| `PublishedEvents` | 이벤트를 조회한 후 일반 AssertJ로 검증 |
| `AssertablePublishedEvents` | 이벤트 전용 fluent AssertJ 형식으로 바로 검증 |

여기서 테스트하는 것은 Kafka에 실제로 메시지가 도착했는지가 아니에요. 비즈니스 동작 중 Spring 애플리케이션 이벤트가 올바르게 발행됐는지를 확인하는 테스트예요. 순수 Spring TestContext의 [[ApplicationEvents 테스트|ApplicationEvents]]와 목적이 같고, 모듈 통합 관점으로 확장한 것이에요.

> 한 문장 정리: Spring Modulith의 이벤트 외부화는 선택한 내부 이벤트를 Kafka 같은 외부 메시지 브로커로 전달하고, 전송 실패를 기록하여 재시도할 수 있게 하며, 목적지·메시지 내용·라우팅 키·전송 순서를 설정할 수 있게 해주는 기능이에요.

[Verifying Application Module Structure](https://docs.spring.io/spring-modulith/reference/verification.html)

---

## 관련 노트

- [[Spring 이벤트]] — 이벤트 메커니즘 MOC
- [[@TransactionalEventListener]] — `AFTER_COMMIT`, `@Async` 조합
- [[@DomainEvents]] — 애그리거트 기반 발행
- [[ApplicationEvents 테스트]] — 순수 Spring 이벤트 검증
- 이전: [[4. Customizing the Application Modules Arrangement]]

## 참고 문서

- [Working with Application Events](https://docs.spring.io/spring-modulith/reference/events.html)
- [Configuration Properties](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties)
- [Testing Application Modules](https://docs.spring.io/spring-modulith/reference/testing.html)
