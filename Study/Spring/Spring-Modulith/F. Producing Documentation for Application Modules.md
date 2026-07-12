---
library: Spring Modulith
library_version: 2.1.0
version: 2.1.0
prev: "[[E. Working with Passage of Time Events]]"
next: "[[G. Production-ready Features]]"
---
[Spring Modulith Docs - Producing Documentation for Application Modules](https://docs.spring.io/spring-modulith/reference/documentation.html)

Spring Modulith의 `Documenter`는 코드를 분석해서 모듈 구조를 자동으로 문서화해줘요. 이 노트는 그 문서화 기능과, 함께 드러나는 이벤트 기반 설계 개념(의존성 방향, Aggregate Root 이벤트 발행)을 정리해요.

> 문서에 찍히는 이벤트 흐름은 [[E. Working with Passage of Time Events]]와 [[C. Working with Application Events]]에서 다룬 이벤트 설계가 코드에 실제로 반영된 결과예요.

---

# 1. Documenter — 모듈 관계를 자동으로 문서화해요

테스트 코드 하나로 여러 산출물을 생성할 수 있어요.

```java
class DocumentationTests {

    ApplicationModules modules = ApplicationModules.of(Application.class);

    @Test
    void writeDocumentationSnippets() {
        new Documenter(modules)
            .writeModulesAsPlantUml()             // 1) 전체 모듈 C4 다이어그램
            .writeIndividualModulesAsPlantUml()   // 2) 개별 모듈 C4 다이어그램
            .writeModuleCanvases()                // 3) 모듈별 Canvas (표)
            .writeAggregatingDocument();          // 4) 위 전부를 묶은 all-docs.adoc
    }
}
```

## 1-1. C4 다이어그램

`writeModulesAsPlantUml()`은 전체 모듈 간 의존 관계를, `writeIndividualModulesAsPlantUml()`은 특정 모듈 중심으로 직접 연결된 모듈만 잘라서 보여줘요.

UML 스타일로 바꾸려면 `DiagramOptions`를 넘겨요.

```java
var options = DiagramOptions.defaults()
    .withStyle(DiagramStyle.UML);

new Documenter(modules)
    .writeModulesAsPlantUml(options)
    .writeIndividualModulesAsPlantUml(options);
```

## 1-2. Application Module Canvas

`writeModuleCanvases()`가 생성하는 표로, 모듈의 핵심 요소를 한눈에 보여줘요.

| 섹션 | 추출 대상 |
|---|---|
| Spring components | `@Service`, `@Repository`, `@Component` 등 |
| Aggregate roots | Repository가 있는 엔티티 또는 jMolecules `@AggregateRoot` |
| Published events | `registerEvent()`, `publishEvent()` 호출 |
| Events listened to | `@EventListener`, `@TransactionalEventListener` 파라미터 타입 |
| Configuration properties | `@ConfigurationProperties` 클래스 |

핵심은 `Documenter`가 **코드를 분석해서 자동 추출**한다는 점이에요. 수동으로 모듈 간 의존 관계를 문서화할 필요가 없어요.

# 2. Canvas 예시 — inventory 모듈 역추론

공식 문서의 inventory 모듈 Canvas를 코드로 역추론하면 이래요.

```java
// ── Aggregate Root ──
@Entity
public class InventoryItem extends AbstractAggregateRoot<InventoryItem> {

    public void decreaseQuantity(Quantity amount) {
        if (this.quantity.isLessThan(amount)) {
            throw new IllegalArgumentException("재고 부족");
        }
        this.quantity = this.quantity.minus(amount);
        registerEvent(new QuantityReduced(this.id, amount));  // → Published events
    }
}

// ── Repository ──
public interface Inventory extends CrudRepository<InventoryItem, Long> {}

// ── Service ──
@Service
public class InventoryManagement { ... }

// ── Event Listeners ──
@Component
public class InternalInventoryListeners {

    @EventListener
    public void on(DayHasPassed event) {       // → Events listened to (시간 경과 이벤트)
        // 재고 체크 로직
    }

    @EventListener
    public void on(QuantityReduced event) {    // → Events listened to (내부 이벤트)
        if (belowThreshold(event)) {
            eventPublisher.publishEvent(new StockShort(event.itemId()));
        }
    }
}

@Component
public class InventoryOrderEventListener {

    @EventListener
    public void on(OrderCompleted event) { ... }  // → Events listened to (외부 모듈 이벤트)

    @EventListener
    public void on(OrderCanceled event) { ... }
}

// ── Configuration Properties ──
@ConfigurationProperties("acme.commerce.inventory")
public class InventoryProperties {
    private Quantity restockThreshold;  // Canvas의 Properties 섹션에 표시
}
```

이 코드에서 `Documenter`가 추출하는 이벤트 체이닝 구조는 이래요.

```text
DayHasPassed → InternalInventoryListeners → StockShort
```

[[E. Working with Passage of Time Events]]에서 다룬 송장 연체 구조와 동일한 모양이에요.

```text
DayHasPassed → InvoiceDebtCollection → InvoiceBecameOverdue
```

# 3. 이벤트 흐름 vs 의존성 방향 — 반대예요

Canvas의 Events listened to에 `OrderCompleted`(order 모듈)가 있어요. 그러면 C4 다이어그램에서 화살표 방향은 어느 쪽일까요?

```java
// 이 파일은 inventory 모듈에 있다
package com.acme.commerce.inventory;

import com.acme.commerce.order.OrderCompleted;  // ← order 모듈의 클래스를 import
//     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

@Component
public class InventoryOrderEventListener {

    @EventListener
    public void on(OrderCompleted event) { ... }
}
```

```text
이벤트 흐름:    order ──(OrderCompleted)──→ inventory    (데이터가 흘러가는 방향)
의존성 방향:    inventory ─────────────→ order            (import가 가리키는 방향)
```

**이 두 방향은 반대예요.** C4 화살표는 의존성 방향을 따르므로 `inventory → order`가 돼요.

핵심 원칙을 정리하면 이래요.

- **이벤트를 "듣는 쪽"이 "보내는 쪽"을 알아요.** 보내는 쪽은 듣는 쪽을 몰라요.
- Command 패턴과 정확히 반대예요 — Command에서는 보내는 쪽이 받는 쪽을 알아야 해요.

> [!NOTE] `DayHasPassed`가 결합을 만들지 않는 이유
> `DayHasPassed`는 `spring-modulith-moments` 라이브러리가 제공하는 타입이에요. 어떤 비즈니스 모듈에도 속하지 않으므로, 구독해도 **모듈 간 의존성 화살표가 추가되지 않아요.**
> ```text
> // OrderCompleted 구독 → inventory가 order 모듈에 의존 (화살표 추가)
> import com.acme.commerce.order.OrderCompleted;
>
> // DayHasPassed 구독 → 라이브러리 의존일 뿐, 모듈 간 결합 아님 (화살표 없음)
> import org.springframework.modulith.moments.DayHasPassed;
> ```
> Verraes가 말한 "결합도 감소"가 다이어그램 레벨에서 눈에 보이는 순간이에요.

---

# 4. 왜 엔티티(Aggregate Root)에서 이벤트를 발행하나요

Canvas의 Published events에 `InventoryItem.decreaseQuantity(…)`가 표시돼요. 서비스가 아니라 **엔티티**에서 이벤트를 발행하는 이유가 있어요.

## 4-1. 서비스에서 발행하면 — 누락될 수 있어요

```java
// 버전 A: 서비스에서 이벤트 발행
@Service
public class InventoryManagement {

    public void decreaseStock(Long itemId, Quantity amount) {
        InventoryItem item = inventory.findById(itemId).orElseThrow();
        item.decreaseQuantity(amount);
        inventory.save(item);
        eventPublisher.publishEvent(new QuantityReduced(itemId, amount));
    }
}

// 다른 서비스에서 같은 동작을 하면?
@Service
public class ReturnProcessingService {

    public void processDamagedReturn(Long itemId, Quantity amount) {
        InventoryItem item = inventory.findById(itemId).orElseThrow();
        item.decreaseQuantity(amount);
        inventory.save(item);
        // ⚠️ 이벤트 발행을 깜빡하면? → QuantityReduced 누락
    }
}
```

## 4-2. 엔티티에서 발행하면 — 구조적으로 보장돼요

```java
// 버전 B: Aggregate Root에서 이벤트 발행
@Entity
public class InventoryItem extends AbstractAggregateRoot<InventoryItem> {

    public void decreaseQuantity(Quantity amount) {
        if (this.quantity.isLessThan(amount)) {
            throw new IllegalArgumentException("재고 부족");
        }
        this.quantity = this.quantity.minus(amount);
        registerEvent(new QuantityReduced(this.id, amount));
    }
}
```

누가, 어디서 `decreaseQuantity()`를 호출하든 이벤트가 **빠짐없이** 발행돼요. "깜빡하지 말자"라는 규칙이 아니라, 깜빡할 수 없는 설계예요.

# 5. `AbstractAggregateRoot` — 이벤트는 `save()` 시점에 발행돼요

## 5-1. `registerEvent()`는 쌓기만 해요

```java
// AbstractAggregateRoot 내부 (단순화)
public abstract class AbstractAggregateRoot<A extends AbstractAggregateRoot<A>> {

    @Transient
    private final List<Object> domainEvents = new ArrayList<>();

    protected A registerEvent(Object event) {
        this.domainEvents.add(event);  // 쌓기만 한다
        return (A) this;
    }

    public Collection<Object> domainEvents() {
        return Collections.unmodifiableList(domainEvents);
    }

    public void clearDomainEvents() {
        this.domainEvents.clear();
    }
}
```

## 5-2. `Repository.save()`가 실제로 발행해요

```java
// Spring Data 내부 동작 (단순화)
public <S extends T> S save(S entity) {
    // 1. DB에 저장
    entityManager.persist(entity);

    // 2. 쌓여있던 이벤트를 꺼내서 발행
    entity.domainEvents().forEach(eventPublisher::publishEvent);

    // 3. 이벤트 목록 비우기
    entity.clearDomainEvents();

    return entity;
}
```

> [!NOTE] `@DomainEvents`와의 관계
> Spring Data는 `@DomainEvents` 애노테이션이 붙은 메서드를 `save()` 시점에 호출해 이벤트를 꺼내요. `AbstractAggregateRoot`는 이 규약을 미리 구현해둔 편의 기반 클래스예요. 자세한 메커니즘은 [[@DomainEvents]] 참고.

## 5-3. 왜 `save()` 시점인가요

```java
@Service
public class InventoryManagement {

    @Transactional
    public void decreaseStock(Long itemId, Quantity amount) {
        InventoryItem item = inventory.findById(itemId).orElseThrow();

        item.decreaseQuantity(amount);   // registerEvent() → 이벤트 쌓임
        // 만약 여기서 검증 실패로 예외가 터지면? → 이벤트 발행 안 됨 ✅

        inventory.save(item);            // 여기서 비로소 이벤트 발행
    }
}
```

`save()` 이전에 이벤트가 발행되면 이런 문제가 생겨요.

- 리스너가 아직 커밋되지 않은 데이터를 조회하는 문제
- 저장이 실패했는데 이벤트는 나간 문제

## 5-4. 전체 흐름

`@TransactionalEventListener`와 결합하면 안전한 순서가 보장돼요.

```text
registerEvent()          엔티티 내부에 쌓임
       ↓
save()에서 발행           Spring Data가 이벤트를 꺼내 publishEvent() 호출
       ↓
트랜잭션 커밋             DB 변경 확정
       ↓
리스너 실행               @TransactionalEventListener가 커밋 후 실행
```

상태 변경(DB 저장)과 이벤트 발행의 **일관성**이 구조적으로 보장돼요.

---

## 최종 정리

> `Documenter`는 코드를 분석해 C4 다이어그램과 Module Canvas를 자동 생성해요. Canvas의 "Events listened to"는 의존성 방향과 **반대**로 흐르고(듣는 쪽이 보내는 쪽을 안다), 라이브러리 타입인 `DayHasPassed` 구독은 모듈 결합을 만들지 않아요. 이벤트는 서비스가 아니라 Aggregate Root의 `registerEvent()`로 등록해 누락을 구조적으로 막고, 실제 발행은 `save()` 시점에 일어나 상태 변경과 이벤트의 일관성을 보장해요.

## 관련 노트

- [[E. Working with Passage of Time Events]] — `DayHasPassed`, 시간 경과 이벤트 체이닝
- [[C. Working with Application Events]] — 이벤트 발행/소비, `@ApplicationModuleListener`
- [[@DomainEvents]] — `save()` 시점 이벤트 발행 메커니즘
- [[@TransactionalEventListener]] — 커밋 이후 리스너 실행
- [[@EventListener]] — 이벤트 구독의 기본
- 이전: [[E. Working with Passage of Time Events]]

## 참고 문서

- [Producing Documentation for Application Modules](https://docs.spring.io/spring-modulith/reference/documentation.html)
- [Spring Data - Publishing Events from Aggregate Roots](https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html)
