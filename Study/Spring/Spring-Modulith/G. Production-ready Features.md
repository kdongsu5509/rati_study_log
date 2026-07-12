---
library: Spring Modulith
library_version: 2.1.0
version: 2.1.0
prev: "[[F. Producing Documentation for Application Modules]]"
next:
---
[Spring Modulith Docs - Production-ready Features](https://docs.spring.io/spring-modulith/reference/production-ready.html)

Spring Modulith는 런타임에서도 모듈 구조를 활용해요. 모듈 의존 순서대로 초기화하고, 모듈별 Flyway 마이그레이션을 돌리고, 모듈 구조를 Actuator로 노출하고, 모듈 간 호출을 트레이싱해줘요. 이 노트는 그 런타임/프로덕션 기능들을 정리해요.

> Actuator·트레이스에 찍히는 이벤트 흐름은 [[F. Producing Documentation for Application Modules]]에서 다룬 "의존성 방향 vs 이벤트 흐름"이 런타임에서 그대로 나타난 결과예요.

---

# 1. Runtime Support — 모듈 의존 순서를 런타임에 적용해요

```gradle
dependencies {
    runtimeOnly 'org.springframework.modulith:spring-modulith-runtime'
}
```

이 JAR를 추가하면 다음이 자동으로 등록돼요.

- `ApplicationModulesRuntime` — 런타임에서 `ApplicationModules`에 접근
- `SpringBootApplicationRuntime` — 메인 애플리케이션 클래스 감지
- `RuntimeApplicationModuleVerifier` — 시작 시 모듈 구조 검증 (옵트인)
- `ApplicationModuleInitializer` 실행기 — 모듈 의존 순서대로 초기화 코드 실행

# 2. `ApplicationModuleInitializer` — 위상 정렬로 초기화 순서를 보장해요

모듈 A에 의존하는 모듈 B가 있으면, A의 초기화 코드가 먼저 실행돼야 해요. `@Order`를 직접 지정할 필요 없이 모듈 의존 그래프를 따라 **위상 정렬(topological sort)**로 실행돼요.

```java
// order 모듈 — 의존 없음 → 먼저 실행
@Component
class OrderModuleInitializer implements ApplicationModuleInitializer {

    @Override
    public void initialize() {
        // 주문 테이블 기본 데이터 세팅
        log.info("Order module initialized");
    }
}

// inventory 모듈 — order에 의존 → order 이후 실행
@Component
class InventoryModuleInitializer implements ApplicationModuleInitializer {

    @Override
    public void initialize() {
        // 재고 초기 데이터 로딩
        // order 초기화가 완료된 상태가 보장됨
        log.info("Inventory module initialized");
    }
}

// notification 모듈 — inventory에 의존 → inventory 이후 실행
@Component
class NotificationModuleInitializer implements ApplicationModuleInitializer {

    @Override
    public void initialize() {
        // 알림 채널 설정
        log.info("Notification module initialized");
    }
}
```

실행 순서는 이래요.

```text
order → inventory → notification
```

시작 시 모듈 구조 검증을 켜려면 다음 속성을 써요.

```properties
spring.modulith.runtime.verification-enabled=true
```

순환 의존 등 구조 위반이 있으면 애플리케이션 시작이 중단돼요.

> [!NOTE] 빌드타임 검증과의 관계
> 여기서의 런타임 검증은 [[B. Verifying Application Module Structure]]에서 다룬 테스트 기반 검증을 시작 시점에도 한 번 더 걸어주는 거예요. 테스트를 건너뛴 배포에서도 구조 위반을 잡을 수 있어요.

# 3. 모듈별 Flyway 마이그레이션

각 모듈이 자기 테이블만 관리하는 마이그레이션 구조예요. 실행 순서도 모듈 의존 그래프를 따라요.

```properties
spring.modulith.runtime.flyway-enabled=true
```

디렉토리 구조는 이래요.

```text
db/migration/
├── __root/                        # 공통 마이그레이션 (기본 tracking table 사용)
│   └── V1__create_schema.sql
├── order/                         # order 모듈 전용 (flyway_schema_history_order)
│   ├── V1__create_orders.sql
│   └── V2__add_status.sql
└── inventory/                     # inventory 모듈 전용 (flyway_schema_history_inventory)
    └── V1__create_inventory.sql
```

핵심 동작을 정리하면 이래요.

- `db/migration/__root` — 기존 `db/migration` 역할. 기본 `flyway_schema_history` 테이블 사용
- `db/migration/{moduleIdentifier}` — 모듈별 별도 tracking table (`flyway_schema_history_{moduleIdentifier}`)
- **버전 번호가 모듈 스코프** — 각 모듈이 독립적으로 `V1`, `V2`를 쓸 수 있음
- 통합 테스트 시 테스트에 포함된 모듈의 마이그레이션만 실행
- `MigrationFilter` 빈을 등록하면 마이그레이션 실행 대상을 추가 필터링 가능

---

# 4. Actuator — 모듈 구조를 JSON으로 노출해요

```gradle
dependencies {
    runtimeOnly 'org.springframework.modulith:spring-modulith-actuator'
    runtimeOnly 'org.springframework.boot:spring-boot-starter-actuator'
}
```

엔드포인트는 이래요.

```text
GET /actuator/modulith
```

응답 예시:

```json
{
  "order": {
    "basePackage": "com.acme.commerce.order",
    "displayName": "Order",
    "dependencies": []
  },
  "inventory": {
    "basePackage": "com.acme.commerce.inventory",
    "displayName": "Inventory",
    "dependencies": [
      {
        "target": "order",
        "types": ["EVENT_LISTENER", "USES_COMPONENT"]
      }
    ]
  }
}
```

의존 유형(`types`)은 이래요.

| 타입 | 의미 | 코드 예시 |
|---|---|---|
| `DEFAULT` | 단순 타입 참조 | `import com.acme.order.OrderId;` |
| `USES_COMPONENT` | Spring 빈 주입 | `@Autowired OrderService orderService;` |
| `EVENT_LISTENER` | 이벤트 구독 | `@EventListener public void on(OrderCompleted e)` |

## 4-1. 이벤트 흐름 vs 의존성 방향 (복습)

Actuator 응답의 `inventory → order (EVENT_LISTENER)`를 코드로 보면 이래요.

```java
// inventory 모듈에 있는 코드
package com.acme.commerce.inventory;

import com.acme.commerce.order.OrderCompleted;  // ← order 타입을 import = 의존

@Component
public class InventoryOrderEventListener {

    @EventListener
    public void on(OrderCompleted event) { ... }
}
```

```text
의존성 방향 (JSON):    inventory ──────────────→ order    (inventory가 order를 안다)
이벤트 흐름 (런타임):   order ──(OrderCompleted)──→ inventory (이벤트는 반대로 흐른다)
```

**듣는 쪽이 보내는 쪽을 알아요.** 보내는 쪽은 듣는 쪽을 몰라요. ([[F. Producing Documentation for Application Modules]]에서 다룬 원칙이 런타임 JSON에도 그대로 나타나요.)

# 5. Observability — 모듈 간 호출을 트레이싱해요

```gradle
dependencies {
    runtimeOnly 'org.springframework.modulith:spring-modulith-observability'
}
```

Actuator + Observability를 한번에 넣으려면 스타터를 써요.

```gradle
dependencies {
    runtimeOnly 'org.springframework.modulith:spring-modulith-starter-insight'
}
```

## 5-1. 동작 원리

모듈의 API에 해당하는 Spring 빈을 **AOP로 감싸서**, 호출이 일어날 때마다 Micrometer span을 자동 생성해요. Zipkin/Wavefront 같은 도구에서 모듈 간 호출 트레이스를 시각적으로 볼 수 있어요.

트레이스 예시:

```text
payment.complete()
  └─ order.changeState(COMPLETED)
       └─ [async] engine.process()
            └─ order.changeState(PROCESSED)
```

시간 경과 이벤트 패턴과 결합하면 이렇게 잡혀요.

```text
moments.DayHasPassed
  └─ invoiceDebtCollection.on(DayHasPassed)
       └─ [event] InvoiceBecameOverdue
            ├─ accountSuspension.on(InvoiceBecameOverdue)
            └─ revenueAdjustment.on(InvoiceBecameOverdue)
```

프로덕션에서 이벤트 체이닝의 전체 흐름([[E. Working with Passage of Time Events]])이 트레이스로 잡혀요.

## 5-2. 추가 설정

Zipkin, Wavefront 등 모니터링 도구와 연결하려면 별도 의존성이 필요해요. Spring Boot의 Micrometer Tracing 문서를 참고해요.

```gradle
// Zipkin + Brave 예시
dependencies {
    implementation 'io.micrometer:micrometer-tracing-bridge-brave'
    implementation 'io.zipkin.reporter2:zipkin-reporter-brave'
}
```

```properties
# application.properties
management.tracing.sampling.probability=1.0
management.zipkin.tracing.endpoint=http://localhost:9411/api/v2/spans
```

---

## 최종 정리

> `spring-modulith-runtime`은 모듈 의존 그래프를 런타임에도 활용해 초기화 순서(위상 정렬)와 모듈별 Flyway 마이그레이션을 보장하고, 시작 시 구조 검증을 옵트인으로 걸 수 있어요. `spring-modulith-actuator`는 모듈 구조를 `/actuator/modulith` JSON으로 노출하고(의존성 방향은 이벤트 흐름과 반대), `spring-modulith-observability`는 모듈 간 호출과 이벤트 체이닝을 Micrometer span으로 트레이싱해요. 이 JAR들은 전부 `runtimeOnly`라, 프로덕션 코드가 라이브러리에 컴파일 타임 의존을 갖지 않아요.

## 전체 의존성 정리

| JAR | 용도 | 스코프 |
|---|---|---|
| `spring-modulith-runtime` | 모듈 초기화 순서, Flyway 연동 | `runtimeOnly` |
| `spring-modulith-actuator` | `/actuator/modulith` 엔드포인트 | `runtimeOnly` |
| `spring-modulith-observability` | 모듈 간 호출 트레이싱 | `runtimeOnly` |
| `spring-modulith-starter-insight` | actuator + observability 통합 | `runtimeOnly` |

## 관련 노트

- [[F. Producing Documentation for Application Modules]] — Canvas·C4, 의존성 방향 vs 이벤트 흐름
- [[E. Working with Passage of Time Events]] — `DayHasPassed`, 이벤트 체이닝 트레이스
- [[B. Verifying Application Module Structure]] — 모듈 구조 검증 (빌드타임)
- [[@EventListener]] — 이벤트 구독의 기본
- 이전: [[F. Producing Documentation for Application Modules]]

## 참고 문서

- [Production-ready Features](https://docs.spring.io/spring-modulith/reference/production-ready.html)
- [Runtime Support for Application Modules](https://docs.spring.io/spring-modulith/reference/runtime.html)
- [Spring Boot - Micrometer Tracing](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
