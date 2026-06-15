---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-06-15
prev: "[[4. Customizing the Application Modules Arrangement]]"
next:
---
애플리케이션 모듈을 서로 가능한 한 분리된 상태(decoupled)로 유지하려면, 모듈 간의 주요 상호작용 수단은 이벤트 발행(event publication) 및 소비(consumption)가 되어야 합니다. 이를 통해 이벤트를 시작하는 모듈이 잠재적으로 관심이 있는 모든 대상을 알 필요가 없어지며, 이는 애플리케이션 모듈 통합 테스트(Application Module Integration Testing 참조)를 가능하게 하는 핵심적인 측면입니다.

종종 다음과 같이 정의된 애플리케이션 구성 요소를 볼 수 있습니다:

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

```kotlin
@Service
class OrderManagement(val inventory: InventoryManagement) {

  @Transactional
  fun complete(order: Order) {
    inventory.updateStockFor(order)
  }
}
```

`complete(…)` 메서드는 관련된 기능, 즉 다른 애플리케이션 모듈에 정의된 Spring 빈과의 상호작용을 끌어들인다는 점에서 기능적 중력(functional gravity)을 생성합니다. 이는 특히 `OrderManagement` 인스턴스를 생성하는 것만으로도 의존하는 빈들의 인스턴스가 사용 가능해야 하므로 해당 구성 요소를 테스트하기 어렵게 만듭니다(원인적 의존성 다루기(Dealing with Efferent Dependencies) 참조). 또한 주문 완료라는 비즈니스 이벤트와 추가적인 기능을 통합하고자 할 때마다 해당 클래스를 수정해야 함을 의미합니다.

우리는 애플리케이션 모듈 상호작용을 다음과 같이 변경할 수 있습니다:

Spring의 `ApplicationEventPublisher`를 통해 애플리케이션 이벤트 발행하기
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

```kotlin
@Service
class OrderManagement(val events: ApplicationEventPublisher, val dependency: OrderInternal) {

  @Transactional
  fun complete(order: Order) {
    events.publishEvent(OrderCompleted(order.id))
  }
}
```

다른 애플리케이션 모듈의 Spring 빈에 의존하는 대신, 주 애그리게이트(primary aggregate)에서 상태 전환을 완료한 후 Spring의 `ApplicationEventPublisher`를 사용하여 도메인 이벤트를 발행하는 방식에 주목하십시오. 이벤트 발행에 대한 더 애그리게이트 중심적인 접근 방식에 대한 자세한 내용은 Spring Data의 애플리케이션 이벤트 발행 메커니즘을 참조하십시오. 이벤트 발행은 기본적으로 동기식으로 진행되므로, 전체적인 정렬의 트랜잭션 의미론(transactional semantics)은 위의 예시와 동일하게 유지됩니다. 이는 매우 단순한 일관성 모델을 얻을 수 있다는 점에서는 좋지만(주문의 상태 변경과 인벤토리 업데이트가 둘 다 성공하거나 둘 다 실패함), 오류를 일으키는 기능이 중요하지 않은 경우에도 더 많은 연계 기능이 트리거되어 트랜잭션 경계를 넓히고 잠재적으로 전체 트랜잭션을 실패하게 만들 수 있다는 점에서는 나쁘기도 합니다.

이에 접근하는 다른 방법은 이벤트 소비를 트랜잭션 커밋 시점의 비동기 처리로 이동하고 부차적인 기능을 정확히 그 자체로 취급하는 것입니다:

비동기 트랜잭션 이벤트 리스너 (An async, transactional event listener)
```java
@Component
class InventoryManagement {

  @Async
  @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

```kotlin
@Component
class InventoryManagement {

  @Async
  @TransactionalEventListener
  fun on(event: OrderCompleted) { /* … */ }
}
```



이 방식은 이제 원래의 트랜잭션을 리스너의 실행으로부터 효과적으로 분리합니다. 이로 인해 원래 비즈니스 트랜잭션의 확장은 방지되지만, 리스너가 어떤 이유로든 실패하면 각 리스너가 실제로 자체적인 안전장치를 구현하지 않는 한 이벤트 발행이 소실된다는 위험도 생성됩니다. 더 나쁜 것은, 메서드가 호출되기도 전에 시스템이 실패할 수 있으므로 그것조차 완전히 작동하지 않는다는 점입니다.

#### 애플리케이션 모듈 리스너 (Application Module Listener)

트랜잭션 이벤트 리스너를 트랜잭션 자체 내부에서 실행하려면, 해당 리스너에 차례로 `@Transactional` 어노테이션을 지정해야 합니다.

트랜잭션 자체 내부에서 실행되는 비동기 트랜잭션 이벤트 리스너

Java

Kotlin

Kotlin

```
@Component
class InventoryManagement {

  @Async
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @TransactionalEventListener
  fun on(event: OrderCompleted) { /* … */ }
}
```

이벤트를 통해 모듈을 통합하는 기본 방식을 설명하기 위한 선언을 간소화하기 위해, Spring Modulith는 단축 기표로 `@ApplicationModuleListener`를 제공합니다.

애플리케이션 모듈 리스너

Java

Kotlin

Kotlin

```
@Component
class InventoryManagement {

  @ApplicationModuleListener
  fun on(event: OrderCompleted) { /* … */ }
}
```

### 이벤트 발행 레지스트리 (The Event Publication Registry)

Spring Modulith는 Spring Framework의 핵심 이벤트 발행 메커니즘에 연결되는 이벤트 발행 레지스트리와 함께 제공됩니다. 이벤트 발행 시, 레지스트리는 이벤트를 전달받을 트랜잭션 이벤트 리스너를 찾아내고 원래 비즈니스 트랜잭션의 일부로 이벤트 발행 로그에 각 리스너에 대한 항목(진한 파란색)을 작성합니다. 기본적으로 `@TransactionalEventListener`로 (메타)어노테이션이 지정된 모든 이벤트 리스너가 고려됩니다. 이를 커스텀하고 싶다면 `spring.modulith.events.registry-trigger-annotation` 프로퍼티를 확인하십시오.

이벤트 발행 레지스트리 시작

그림 1. 실행 전 트랜잭션 이벤트 리스너 정렬 (The transactional event listener arrangement before execution)

각 트랜잭션 이벤트 리스너는 리스너의 실행이 성공하면 해당 로그 항목을 완료됨으로 표시하는 애스펙트(aspect)로 래핑됩니다. 리스너가 실패하는 경우, 로그 항목은 수정되지 않은 상태로 유지되므로 애플리케이션의 필요에 따라 재시도 메커니즘을 배포할 수 있습니다. 이벤트의 자동 재발행은 `spring.modulith.events.republish-outstanding-events-on-restart` 프로퍼티를 통해 활성화할 수 있습니다.

이벤트 발행 레지스트리 종료

그림 2. 실행 후 트랜잭션 이벤트 리스너 정렬 (The transactional event listener arrangement after execution)

#### 이벤트 발행 수명 주기 (Event Publication Lifecycle, 2.0 이후)

Spring Modulith 2.0은 처리 예정, 현재 진행 중, 완료됨 또는 실패함 상태인 발행을 구분할 수 있도록 이벤트 발행을 위한 전용 수명 주기를 도입합니다. 이를 통해 실패한 발행만 재전송하고, 진행 중인 발행을 실패한 것으로 잘못 취급하지 않고 크래시로부터 복구하는 것이 더 쉬워집니다.

**발행 상태 (Publication states)**

각 이벤트 발행은 `EventPublication.Status`를 가집니다:

- **PUBLISHED** – 발행이 저장되었고 처리를 기다리고 있습니다 (또는 픽업되기 직전입니다).
    
- **PROCESSING** – 리스너가 발행을 선점하여 실행 중입니다. 리스너 주변의 인터셉터가 리스너를 호출하기 전에 이 상태로 설정하고, 리스너가 반환될 때 `COMPLETED` 또는 `FAILED`로 설정합니다.
    
- **COMPLETED** – 리스너가 성공적으로 종료되었습니다. 완료 날짜가 설정됩니다 (완료 모드가 `DELETE`인 경우는 제외).
    
- **FAILED** – 리스너가 예외를 던졌거나, 신선도 메커니즘에 의해 발행이 실패한 것으로 표시되었습니다 (이벤트 발행 신선도 및 자동 실패 표시 참조).
    
- **RESUBMITTED** – 이전에 실패했던 발행이 재전송되어 다시 처리를 대기 중입니다.
    

이벤트 발행 수명 주기 (event-publication-lifecycle)

**발행 세부 정보 (Publication details)**

상태 외에도 각 발행은 다음을 추적합니다:

- **최근 재전송 날짜 (Last resubmission date)** – 발행이 마지막으로 재전송된 시점입니다 (재전송된 적이 있는 경우). `EventPublication.getLastResubmissionDate()`를 통해 노출됩니다.
    
- **완료 시도 횟수 (Completion attempts)** – 리스너가 호출된 횟수입니다 (현재 실행 포함). `PROCESSING`으로 이동할 때 증가하므로, 리스너가 작동하는 동안 크래시가 발생하더라도 시도 횟수는 업데이트된 상태로 유지됩니다. `EventPublication.getCompletionAttempts()`를 통해 노출됩니다.
    

이러한 정보를 통해 재전송 API 및 옵션을 사용하여 "X보다 오래 실패한 경우에만 재전송" 또는 "N번 시도 후 중지"와 같은 정책을 구현할 수 있습니다.

#### 이벤트 발행 신선도 및 자동 실패 표시 (Event Publication Staleness and Automatic Marking as Failed)

애플리케이션이 크래시되거나 리스너가 중단되면 발행이 `PUBLISHED`, `PROCESSING` 또는 `RESUBMITTED` 상태로 남아있을 수 있습니다. 이를 실패한 것으로 취급하고 재전송하거나 무시할 수 있도록, 각 상태가 신선하지 않은(stale) 것으로 간주되는 기간을 설정할 수 있습니다. 신선하지 않은 발행은 백그라운드 태스크에 의해 주기적으로 `FAILED`로 표시됩니다.

Spring Modulith는 설정 가능한 간격으로 스케줄된 태스크로 실행되는 신선도 모니터(Staleness Monitor, 2.0 이후)를 제공합니다. 신선도 기간 중 어느 하나라도 0이 아닌 값으로 설정되면 모니터가 활성화됩니다: 매 실행 시 모니터는 `PUBLISHED`, `PROCESSING` 또는 `RESUBMITTED` 상태 중 해당 기간보다 오래된 이벤트 발행을 찾아 `FAILED`로 표시합니다. 이를 통해 복구(예: `FailedEventPublications.resubmit(…)`)를 수행하거나, 그렇지 않으면 멈춰 있을 발행에 대한 다른 처리가 가능해집니다. `spring.modulith.events.staleness` 구성 프로퍼티를 통해 이를 커스텀합니다. `published`, `processing`, `resubmitted`가 모두 0(기본값)인 경우, 신선도 모니터는 스케줄된 태스크를 등록하지 않으며 자동 실패 표시가 발생하지 않습니다.

#### 실패한 발행 및 재전송 (Failed publications and resubmission)

레지스트리를 통해 실패한 발행을 명시적으로 다룰 수 있습니다:

- **FailedEventPublications (2.0 이후)** – 이 타입의 빈을 사용하여 실패한 발행만 재전송합니다: `resubmit(ResubmissionOptions)`.
    
- **ResubmissionOptions** – 배치 크기, 최대 인플라이트(in-flight) 수, 발행의 최소 연령, 선택적 필터(예: 이벤트 타입 또는 `completionAttempts`별) 등 재전송 작동 방식을 제어합니다. `ResubmissionOptions.defaults()`로 생성하고 `withBatchSize(…)`, `withMinAge(…)`, `withFilter(…)` 등으로 커스텀합니다.
    

재전송은 상태를 `FAILED`에서 `RESUBMITTED`로 변경하고 최근 재전송 날짜를 업데이트합니다. 리스너가 실행되려고 할 때 발행은 `PROCESSING`으로 이동하고 완료 시도 횟수가 증가합니다.

일반적인 "미완료(incomplete)" 발행(실패한 발행 및 설정에 따른 신선하지 않은 발행 포함)의 경우, 기존의 `IncompleteEventPublications` API가 여전히 적용됩니다. 2.0 버전부터는 서술자(predicate) 및 기간 기반 오버로드 외에도 `resubmitIncompletePublications(ResubmissionOptions)`를 지원합니다.

### Spring Boot 이벤트 레지스트리 스타터 (Spring Boot Event Registry Starters)

트랜잭션 이벤트 발행 로그를 사용하려면 애플리케이션에 추가된 아티팩트의 조합이 필요합니다. 해당 작업을 간소화하기 위해, Spring Modulith는 사용할 영속성 기술을 중심으로 하며 기본적으로 Jackson 기반 `EventSerializer` 구현체를 사용하는 스타터 POM을 제공합니다. 다음 스타터들을 사용할 수 있습니다:

| **영속성 기술 (Persistence Technology)** | **아티팩트 (Artifact)**               | **설명 (Description)**                                                                                                                                                                        |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **JPA**                             | `spring-modulith-starter-jpa`     | JPA를 영속성 기술로 사용합니다.                                                                                                                                                                         |
| **JDBC**                            | `spring-modulith-starter-jdbc`    | JDBC를 영속성 기술로 사용합니다. JPA 기반 애플리케이션에서도 작동하지만 실제 이벤트 영속화를 위해 JPA 프로바이더를 우회합니다.                                                                                                                |
| **MongoDB**                         | `spring-modulith-starter-mongodb` | MongoDB를 영속성 기술로 사용합니다. 또한 MongoDB 트랜잭션을 활성화하며 상호작용을 위해 서버의 레플리카 셋 설정이 필요합니다. 트랜잭션 자동 구성은 `spring.modulith.events.mongodb.transaction-management.enabled` 프로퍼티를 `false`로 설정하여 비활성화할 수 있습니다. |
| **Neo4j**                           | `spring-modulith-starter-neo4j`   | Spring Data Neo4j 뒤에서 Neo4j를 사용합니다.                                                                                                                                                         |

### 이벤트 발행 관리하기 (Managing Event Publications)

이벤트 발행은 애플리케이션 런타임 중에 다양한 방식으로 관리되어야 할 수 있습니다. 미완료된 발행은 주어진 시간이 지난 후 해당 리스너로 재전송되어야 할 수 있습니다. 반면 완료된 발행은 데이터베이스에서 제거되거나 아카이브 저장소로 이동되어야 할 것입니다. 이러한 종류의 정리 작업(housekeeping)에 대한 요구사항은 애플리케이션마다 크게 다르기 때문에, Spring Modulith는 두 종류의 발행을 모두 다룰 수 있는 API를 제공합니다. 이 API는 애플리케이션에 추가할 수 있는 `spring-modulith-events-api` 아티팩트를 통해 사용할 수 있습니다:

Spring Modulith Events API 아티팩트 사용하기

Maven

Gradle

Groovy

```
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-events-api:2.1.0'
}
```

이 아티팩트에는 애플리케이션 코드에서 Spring 빈으로 사용할 수 있는 주요 추상화가 포함되어 있습니다:

- **CompletedEventPublications** — 이 인터페이스는 모든 완료된 이벤트 발행에 대한 접근을 허용하며, 데이터베이스에서 모든 발행을 즉시 제거하거나 주어진 기간(예: 1분)보다 오래된 완료된 발행을 제거하는 API를 제공합니다.
    
- **IncompleteEventPublications** — 이 인터페이스는 모든 미완료된 이벤트 발행에 접근하여 주어진 서술자와 일치하는 항목, 원래 발행 날짜를 기준으로 주어진 `Duration`보다 오래된 항목, 또는 `resubmitIncompletePublications(ResubmissionOptions)`를 통해 커스텀 기준과 일치하는 항목(2.0 이후)을 재전송할 수 있도록 합니다.
    
- **FailedEventPublications (2.0 이후)** — 이 인터페이스는 실패한 발행 및 재전송에서 설명한 대로 `resubmit(ResubmissionOptions)`를 통해 실패한 이벤트 발행만 재전송할 수 있도록 합니다.
    

#### 이벤트 발행 완료 (Event Publication Completion)

이벤트 발행은 트랜잭션 또는 `@ApplicationModuleListener` 실행이 성공적으로 완료될 때 완료됨으로 표시됩니다. 기본적으로 완료는 `EventPublication`에 완료 날짜를 설정함으로써 등록됩니다. 이는 완료된 발행이 이벤트 발행 레지스트리에 남아있음을 의미하므로, 위에서 설명한 대로 `CompletedEventPublications` 인터페이스를 통해 검사할 수 있습니다. 이로 인한 결과로, 오래되고 완료된 `EventPublications`를 주기적으로 제거하는 일부 코드를 배치해야 합니다. 그렇지 않으면 관계형 데이터베이스 테이블과 같은 영속성 추상화가 무한히 커질 것이고, 새로운 `EventPublication`을 생성하고 완료하는 저장소와의 상호작용이 느려질 수 있습니다.

Spring Modulith 1.3은 두 가지 추가적인 완료 모드를 지원하기 위해 구성 프로퍼티 `spring.modulith.events.completion-mode`를 도입합니다. 기본값은 위에서 설명한 전략에 의해 지원되는 `UPDATE`입니다. 대안으로 완료 모드를 `DELETE`로 설정할 수 있으며, 이는 완료 시 레지스트리의 영속성 메커니즘이 `EventPublications`를 삭제하도록 변경합니다. 이는 `CompletedEventPublications`가 더 이상 어떠한 발행도 반환하지 않음을 의미하지만, 동시에 영속성 저장소에서 완료된 이벤트를 수동으로 제거하는 것에 대해 더 이상 걱정하지 않아도 됨을 의미합니다.

세 번째 옵션은 항목을 아카이브 테이블, 컬렉션 또는 노드로 복사하는 `ARCHIVE` 모드입니다. 해당 아카이브 항목에 대해 완료 날짜가 설정되고 원래 항목은 제거됩니다. `DELETE` 모드와 달리, 완료된 이벤트 발행은 여전히 `CompletedEventPublications` 추상화를 통해 접근할 수 있습니다.

#### 이벤트 발행 리포지토리 (Event Publication Repositories)

실제로 이벤트 발행 로그를 작성하기 위해, Spring Modulith는 `EventPublicationRepository` SPI와 JPA, JDBC, MongoDB 같이 트랜잭션을 지원하는 대중적인 영속성 기술을 위한 구현체를 노출합니다. 사용할 영속성 기술은 Spring Modulith 애플리케이션에 해당하는 JAR를 추가하여 선택합니다. 해당 작업을 간소화하기 위해 전용 스타터를 준비했습니다.

JDBC 기반 구현체는 각 구성 프로퍼티(`spring.modulith.events.jdbc.schema-initialization.enabled`)가 `false`로 설정되지 않는 한 이벤트 발행 로그를 위한 전용 테이블을 생성합니다. 필요한 테이블이 이미 존재하는 경우(예: Flyway 또는 Liquibase와 같은 데이터베이스 마이그레이션 툴을 통해 생성된 경우) 스키마 생성은 당연히 취소됩니다. 자세한 내용은 부록의 스키마 개요를 참조하십시오.

#### 이벤트 직렬화 처리기 (Event Serializer)

각 로그 항목은 직렬화된 형태의 원래 이벤트를 포함합니다. `spring-modulith-events-core`에 포함된 `EventSerializer` 추상화는 이벤트 인스턴스를 데이터 저장소에 적합한 포맷으로 변환하는 다양한 전략을 플러그인할 수 있게 합니다. Spring Modulith는 `spring-modulith-events-jackson` 아티팩트를 통해 Jackson 기반 JSON 구현체를 제공하며, 이는 기본적으로 표준 Spring Boot 자동 구성을 통해 `ObjectMapper`를 소비하는 `JacksonEventSerializer`를 등록합니다.

#### 이벤트 발행 날짜 커스텀하기 (Customizing the Event Publication Date)

기본적으로 이벤트 발행 레지스트리는 `Clock.systemUTC()`에 의해 반환된 날짜를 이벤트 발행 날짜로 사용합니다. 이를 커스텀하고 싶다면 애플리케이션 컨텍스트에 `Clock` 타입의 빈을 등록하십시오:

Java

```
@Configuration
class MyConfiguration {

  @Bean
  Clock myCustomClock() {
    return … // 여기에 커스텀 Clock 인스턴스가 생성됩니다.
  }
}
```

### 이벤트 외재화하기 (Externalizing Events)

> 다음 섹션은 비동기 이벤트 리스너를 기반으로 하는 Spring Modulith 네이티브 이벤트 외재화(event externalization)에 대해 설명합니다. 이는 실용적이고 단순한 솔루션이지만, 개발자가 실제 아웃박스 패턴(outbox pattern) 구현체에서 기대할 수 있는 중요한 기능이 부족합니다. Spring Modulith 2.1은 Namastack Outbox 및 JobRunr를 통한 이벤트 외재화 지원을 도입했습니다. 자세한 내용은 문서의 해당 섹션(Namastack, JobRunr)을 참조하십시오.

애플리케이션 모듈 간에 교환되는 일부 이벤트는 외부 시스템에 흥미로울 수 있습니다. Spring Modulith는 선택된 이벤트를 다양한 메시지 브로커에 발행할 수 있도록 합니다. 해당 지원을 사용하려면 다음 단계를 수행해야 합니다:

1. 브로커 전용 Spring Modulith 아티팩트를 프로젝트에 추가합니다.
    
2. 이벤트를 Spring Modulith 또는 jMolecules의 `@Externalized` 어노테이션으로 지정하여 외재화할 이벤트 타입을 선택합니다.
    
3. 어노테이션의 값(value)에 브로커 전용 라우팅 대상을 지정합니다.
    

외재화를 위한 이벤트를 선택하는 다른 방법을 찾거나 브로커 내에서 라우팅을 커스텀하는 방법을 알아보려면 이벤트 외재화의 기본(Fundamentals of Event Externalization)을 확인하십시오.

#### 지원되는 인프라 (Supported Infrastructure)

|**브로커 (Broker)**|**아티팩트 (Artifact)**|**설명 (Description)**|
|---|---|---|
|**Kafka**|`spring-modulith-events-kafka`|브로커와의 상호작용을 위해 Spring Kafka를 사용합니다. 논리적 라우팅 키가 Kafka의 토픽 및 메시지 키로 사용됩니다.|
|**AMQP**|`spring-modulith-events-amqp`|호환되는 브로커와의 상호작용을 위해 Spring AMQP를 사용합니다. 예를 들어 Spring Rabbit에 대한 명시적인 의존성 선언이 필요합니다. 논리적 라우팅 키가 AMQP 라우팅 키로 사용됩니다.|
|**JMS**|`spring-modulith-events-jms`|Spring의 핵심 JMS 지원을 사용합니다. 라우팅 키를 지원하지 않습니다.|
|**Spring Messaging**|`spring-modulith-events-messaging`|Spring의 핵심 Message 및 MessageChannel 지원을 사용합니다. Externalized 어노테이션에 지정된 대상을 기반으로 빈 이름에 의해 대상 MessageChannel을 확인합니다. 라우팅 정보를 `springModulith_routingTarget`이라는 헤더로 전달하여 다운스트림 구성 요소(일반적으로 Spring Integration IntegrationFlow)에서 어떤 방식으로든 처리되도록 합니다.|

#### 이벤트 외재화의 기본 (Fundamentals of Event Externalization)

Spring Modulith의 이벤트 외재화는 브로커 전용 발행 구현체에 위임하는 트랜잭션 이벤트 리스너로 구현됩니다. 이는 Spring Modulith의 이벤트 발행 레지스트리가 브로커와의 상호작용 중에 발생하는 실패에 대해 외재화를 보호하므로 제공된 API를 통해 발행을 재전송할 수 있음을 의미합니다.

이벤트 외재화는 발행된 각 애플리케이션 이벤트에 대해 세 단계를 수행합니다.

1. **이벤트가 외재화되어야 하는지 여부 결정** — 우리는 이를 “이벤트 선택(event selection)”이라고 부릅니다. 기본적으로 Spring Boot 자동 구성 패키지 내에 위치하고 지원되는 `@Externalized` 어노테이션 중 하나가 지정된 이벤트 타입만 외재화 대상으로 선택됩니다.
    
2. **메시지 준비 (선택 사항)** — 기본적으로 이벤트는 해당 브로커 인프라에 의해 있는 그대로 직렬화됩니다. 선택적인 매핑 단계를 통해 개발자는 외부 당사자에게 적합한 페이로드로 원래 이벤트를 커스텀하거나 완전히 대체할 수 있습니다. Kafka 및 AMQP의 경우 개발자는 발행할 메시지에 헤더를 추가할 수도 있습니다.
    
3. **라우팅 대상 결정** — 메시지 브로커 클라이언트는 메시지를 발행할 논리적 대상이 필요합니다. 대상은 일반적으로 물리적 인프라(브로커에 따른 토픽, 익스체인지 또는 큐)를 식별하며 종종 이벤트 타입에서 정적으로 도출됩니다. `@Externalized` 어노테이션에 구체적으로 정의되어 있지 않은 한, Spring Modulith는 애플리케이션 로컬 타입 이름을 대상으로 사용합니다. 즉, 기본 패키지가 `com.acme.app`인 Spring Boot 애플리케이션에서 이벤트 타입 `com.acme.app.sample.SampleEvent`는 `sample.SampleEvent`로 발행됩니다.
    

일부 브로커는 실제 대상 내에서 다양한 목적으로 사용되는 다소 동적인 라우팅 키를 정의할 수도 있습니다. 기본적으로 라우팅 키는 사용되지 않습니다.

#### 어노테이션 기반 이벤트 외재화 구성 (Annotation-based Event Externalization Configuration)

`@Externalized` 어노테이션을 통해 커스텀 라우팅 키를 정의하기 위해, 각 특정 어노테이션에서 사용 가능한 target/value 속성에 `$target::$key` 패턴을 사용할 수 있습니다. 대상(target)과 키(key) 모두 구성된 이벤트 인스턴스를 루트 객체로 받는 SpEL 표현식이 될 수 있습니다.

SpEL 표현식을 통해 동적 라우팅 키 정의하기

Java

Kotlin

Kotlin

```
@Externalized("customer-created::#{#this.getLastname()}") 
class CustomerCreated {
  fun getLastname(): String { 
    // …
  }
}
```

`CustomerCreated` 이벤트는 접근자 메서드를 통해 고객의 성(last name)을 노출합니다. 해당 메서드는 대상 선언의 `::` 구분 기호 뒤에 오는 키 표현식에서 `#{#this.getLastname()}` 표현식을 통해 사용됩니다.

키 계산이 더 복잡해지는 경우, 이벤트를 인자로 받는 Spring 빈으로 이를 위임하는 것이 좋습니다:

라우팅 키를 계산하기 위해 Spring 빈 호출하기

Java

Kotlin

Java

```
@Externalized("…::#{@beanName.someMethod(#this)}")
```

#### 프로그램 방식 이벤트 외재화 구성 (Programmatic Event Externalization Configuration)

`spring-modulith-events-api` 아티팩트에는 개발자가 위에서 언급한 모든 단계를 커스텀할 수 있도록 하는 `EventExternalizationConfiguration`이 포함되어 있습니다.

프로그램 방식으로 이벤트 외재화 구성하기

Java

Kotlin

Kotlin

```
@Configuration
class ExternalizationConfiguration {

  @Bean
  fun eventExternalizationConfiguration(): EventExternalizationConfiguration {

    EventExternalizationConfiguration.externalizing()                         
      .select(EventExternalizationConfiguration.annotatedAsExternalized())    
      .mapping(SomeEvent::class.java) { event -> … }                          
      .headers() { event -> … }                                                
      .routeKey(WithKeyProperty::class.java, WithKeyProperty::getKey)         
      .build()
  }
}
```

1. 우리는 `EventExternalizationConfiguration`의 기본 인스턴스를 생성하는 것으로 시작합니다.
    
2. 이전 호출에 의해 반환된 `Selector` 인스턴스에서 `select(…)` 메서드 중 하나를 호출하여 이벤트 선택을 커스텀합니다. 이 단계는 이제 어노테이션만 찾기 때문에 근본적으로 애플리케이션 기본 패키지 필터를 비활성화합니다. 타입별, 패키지별, 패키지 및 어노테이션별로 이벤트를 쉽게 선택할 수 있는 편의 메서드가 존재합니다. 또한 한 단계로 선택과 라우팅을 정의하는 단축 기표도 있습니다.
    
3. `SomeEvent` 인스턴스에 대한 매핑 단계를 정의합니다. 라우터에서 추가로 `….routeMapped()`를 호출하지 않는 한, 라우팅은 여전히 원래 이벤트 인스턴스에 의해 결정된다는 점에 유의하십시오.
    
4. 여기 보인 것처럼 일반적으로 또는 특정 페이로드 타입에 구체적으로 발송될 메시지에 커스텀 헤더를 추가합니다.
    
5. 우리는 최종적으로 이벤트 인스턴스의 값을 추출하는 메서드 핸들을 정의하여 라우팅 키를 결정합니다. 대안으로 이전 호출에서 반환된 `Router` 인스턴스의 일반 `route(…)` 메서드를 사용하여 개별 이벤트에 대해 완전한 `RoutingKey`를 생성할 수 있습니다.
    

#### 이벤트 외재화 직렬화 처리 (Serializing Event Externalization)

Spring Modulith의 이벤트 외재화는 트랜잭션 이벤트 리스너로 구현됩니다. 이는 여러 스레드가 동시에 브로커와의 상호작용을 트리거할 수 있음을 의미합니다. 이는 이벤트 발행이 재전송될 때 특히 관련이 있을 수 있습니다. 브로커에 상호작용이 갑자기 급증할 수 있으므로 일부 상호작용은 약간 더 오래 걸릴 수 있으며, 이로 인해 나중 이벤트의 외재화가 이전 이벤트를 추월할 수 있습니다.

이를 방지하기 위해 `spring.modulith.events.externalization.serialize-externalization` 프로퍼티를 `true`로 설정하여 한 번에 하나의 이벤트만 전송되도록 브로커와의 상호작용을 직렬화 처리(serialize)할 수 있습니다.

#### Namastack 아웃박스 지원 (Namastack Outbox Support)

고급 아웃박스 기능이 필요한 경우, 이벤트 외재화를 Namastack Outbox로 위임할 수 있습니다. 이 기능은 현재 관계형 데이터베이스에서만 사용할 수 있습니다. 기능을 활성화하려면 프로젝트에 Spring Modulith Namastack 스타터를 추가하는 것으로 시작하십시오:

Spring Modulith Namastack 스타터 선언하기

Maven

Gradle

Groovy

```
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-starter-namastack'
}
```

이벤트 외재화를 Namastack에 자동으로 위임하려면 `spring.modulith.events.externalization.mode` 프로퍼티를 `outbox`로 전환하십시오. 일반적인 Namastack Outbox의 작동 방식을 커스텀하는 방법에 대한 자세한 내용은 Namastack 레퍼런스 문서를 참조하십시오. GitHub 리포지토리에서 예시를 확인하십시오.

#### JobRunr 아웃박스 지원 (JobRunr Outbox Support)

이벤트를 외재화하는 Namastack 지원과 유사하게 JobRunr에 대한 지원을 제공합니다. 기능을 활성화하려면 프로젝트에 Spring Modulith JobRunr 스타터를 추가하는 것으로 시작하십시오:

Spring Modulith JobRunr 스타터 선언하기

Maven

Gradle

Groovy

```
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-starter-jobrunr'
}
```

이벤트 외재화를 JobRunr에 자동으로 위임하려면 `spring.modulith.events.externalization.mode` 프로퍼티를 `outbox`로 전환하십시오. JobRunr에 대한 자세한 내용은 해당 레퍼런스 문서를 참조하십시오. GitHub 리포지토리에서 예시를 확인하십시오.

### 발행된 이벤트 테스트하기 (Testing published events)

> 다음 섹션은 Spring 애플리케이션 이벤트를 추적하는 것에만 전적으로 초점을 맞춘 테스트 접근 방식을 설명합니다. `@ApplicationModuleListener`를 사용하는 모듈을 테스트하는 것에 대한 보다 전체적인 접근 방식은 Scenario API를 확인하십시오.

Spring Modulith의 `@ApplicationModuleTest`는 테스트 중인 비즈니스 작업 과정 동안 특정 이벤트 집합이 발행되었는지 검증하기 위해 테스트 메서드에 `PublishedEvents` 인스턴스를 주입받을 수 있는 기능을 활성화합니다.

애플리케이션 모듈 정렬의 이벤트 기반 통합 테스트

Java

Kotlin

Kotlin

```
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  fun someTestMethod(events: PublishedEvents) {

    // …
    val matchingMapped = events.ofType(OrderCompleted::class.java)
      .matching(OrderCompleted::getOrderId, reference.getId())

    assertThat(matchingMapped).hasSize(1)
  }
}
```

`PublishedEvents`가 특정 기준과 일치하는 이벤트를 선택하는 API를 노출하는 방식에 주목하십시오. 검증은 예상되는 요소의 수를 검증하는 AssertJ 단언(assertion)으로 결론을 맺습니다. 어차피 해당 단언에 AssertJ를 사용하고 있다면, 테스트 메서드 파라미터 타입으로 `AssertablePublishedEvents`를 사용하고 이를 통해 제공되는 유연한(fluent) 단언 API를 사용할 수도 있습니다.

이벤트 발행 검증을 위해 `AssertablePublishedEvents` 사용하기

Java

Kotlin

Kotlin

```
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  fun someTestMethod(events: AssertablePublishedEvents) {

    // …
    assertThat(events)
      .contains(OrderCompleted::class.java)
      .matching(OrderCompleted::getOrderId, reference.getId())
  }
}
```

`assertThat(…)` 표현식에 의해 반환된 타입이 발행된 이벤트에 대한 제약 조건을 직접 정의할 수 있도록 하는 방식에 주목하십시오.