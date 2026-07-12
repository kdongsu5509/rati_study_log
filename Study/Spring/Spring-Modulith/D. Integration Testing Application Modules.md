---
library: Spring Modulith
library_version: 2.1.0
version: 2.1.0
prev: "[[C. Working with Application Events]]"
next: "[[E. Working with Passage of Time Events]]"
---
[Spring Modulith Docs - Integration Testing Application Modules](https://docs.spring.io/spring-modulith/reference/testing.html)

Spring Modulith에서는 전체 애플리케이션을 실행하지 않고, 특정 애플리케이션 모듈만 실행해서 통합 테스트할 수 있어요.

```text
애플리케이션
├─ 주문 모듈
├─ 재고 모듈
├─ 결제 모듈
└─ 배송 모듈
```

주문 모듈을 테스트하기 위해 전체 모듈을 실행할 필요 없이, 주문 모듈만 Spring 컨테이너에 올려 테스트할 수 있다는 뜻이에요.

> 이벤트를 발행/소비하는 모듈을 테스트하는 배경은 [[C. Working with Application Events]]에서 이어져요. 순수 Spring TestContext 관점의 이벤트 검증은 [[ApplicationEvents 테스트]] 참고.

---

# 1. 테스트 의존성 추가

먼저 Spring Modulith 테스트 스타터를 추가해요.

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

그리고 테스트하려는 모듈의 패키지 또는 하위 패키지에 테스트 클래스를 작성해요.

```java
package example.order;

@ApplicationModuleTest
class OrderIntegrationTests {

    // 테스트 작성
}
```

테스트 클래스가 `example.order` 패키지에 있으므로 Spring Modulith는 이 테스트가 주문 모듈을 대상으로 한다고 판단해요.

# 2. `@SpringBootTest`와의 차이

일반적인 `@SpringBootTest`는 애플리케이션 전체를 실행해요.

```text
@SpringBootTest
→ 주문 + 재고 + 결제 + 배송 모듈 실행
```

반면 `@ApplicationModuleTest`는 기본적으로 현재 테스트가 속한 모듈만 실행해요.

```text
@ApplicationModuleTest
→ 주문 모듈만 실행
```

Spring Bean, 엔티티, 자동 설정 등을 검색하는 범위도 해당 모듈의 패키지로 제한돼요. 따라서 테스트 범위가 명확해지고, 모듈이 다른 모듈과 제대로 분리되어 있는지도 확인할 수 있어요.

> [!TIP] 포함된 모듈·Bean 확인
> `org.springframework.modulith`의 로그 레벨을 `DEBUG`로 설정하면 테스트에 어떤 모듈과 Bean이 포함되었는지 자세히 확인할 수 있어요.

# 3. 테스트 실행 범위 선택 (BootstrapMode)

`@ApplicationModuleTest`에는 세 가지 부트스트랩 모드가 있어요.

### `STANDALONE`

기본 설정이며, 현재 모듈만 실행해요.

```java
@ApplicationModuleTest(mode = BootstrapMode.STANDALONE)
```

주문 모듈이 다른 모듈 없이 독립적으로 동작하는지 확인할 때 사용해요.

### `DIRECT_DEPENDENCIES`

현재 모듈과 이 모듈이 직접 의존하는 모듈만 실행해요. 주문 모듈이 재고 모듈에 직접 의존한다면 다음 범위가 실행돼요.

```text
주문 모듈
└─ 재고 모듈
```

### `ALL_DEPENDENCIES`

현재 모듈이 직간접적으로 의존하는 모든 모듈을 실행해요. 의존 관계가 `주문 → 재고 → 상품`이라면 주문·재고·상품 모듈이 모두 실행돼요.

| 모드 | 실행 범위 |
|---|---|
| `STANDALONE` | 현재 모듈만 |
| `DIRECT_DEPENDENCIES` | 현재 모듈과 직접 의존 모듈 |
| `ALL_DEPENDENCIES` | 현재 모듈과 모든 직간접 의존 모듈 |

# 4. 다른 모듈의 Bean에 의존하는 경우

현재 모듈의 Bean이 다른 모듈의 Bean을 직접 주입받고 있다고 해봐요.

```java
@Service
class InventoryManagement {

    private final SomeOtherComponent component;

    InventoryManagement(SomeOtherComponent component) {
        this.component = component;
    }
}
```

`SomeOtherComponent`가 다른 모듈에 있고 현재 테스트가 `STANDALONE`이라면 해당 Bean이 로딩되지 않아요. 따라서 Spring은 의존성을 주입할 수 없어서 테스트 실행에 실패해요.

가장 간단한 해결책은 다른 모듈의 Bean을 Mock으로 등록하는 것이에요.

```java
@ApplicationModuleTest
class InventoryIntegrationTests {

    @MockitoBean
    SomeOtherComponent someOtherComponent;
}
```

Spring Boot는 `SomeOtherComponent`의 Mock 객체를 만들고 테스트용 `ApplicationContext`에 Bean으로 등록해요.

> [!NOTE] 범위 확대는 신호일 수 있어요
> 테스트 범위를 넓혀 다른 모듈까지 실행할 수도 있지만, 항상 좋은 해결책은 아니에요. 한 모듈이 다른 모듈의 Bean을 너무 많이 필요로 한다면 모듈 간 결합도가 높다는 신호일 수 있어요. 이럴 때는 직접 호출 대신 도메인 이벤트를 발행하는 방식([[C. Working with Application Events]])으로 바꿀 수 있는지 검토할 필요가 있어요.

# 5. 수평 슬라이스 테스트와 결합하기

`@ApplicationModuleTest`는 모듈을 기준으로 애플리케이션을 세로로 나눠요.

```text
주문 모듈 │ 결제 모듈 │ 재고 모듈
```

반면 Spring Boot의 `@DataJpaTest` 같은 애노테이션은 기술 계층을 기준으로 애플리케이션을 가로로 나눠요.

```text
Controller 계층
Service 계층
Repository 계층 ← @DataJpaTest
```

`@ModuleSlicing`을 사용하면 두 방식을 결합할 수 있어요. 예를 들어 주문 모듈 안의 JPA Repository만 테스트할 수 있어요.

```java
package example.order;

@ModuleSlicing
@DataJpaTest
class SomeModuleRepositoryIntegrationTests {

    @Autowired
    SomeRepository repository;

    @Test
    void someTest() {
        // 주문 모듈의 Repository 테스트
    }
}
```

즉, 이 테스트의 범위는 다음과 같아요.

```text
주문 모듈
└─ JPA 관련 구성과 Repository만
```

---

# 6. 비동기 이벤트 테스트의 어려움

비동기 이벤트를 사용하는 모듈의 통합 테스트는 생각보다 복잡해요. 예를 들어 다음 흐름을 테스트한다고 해봐요.

```text
주문 완료
→ OrderCompleted 이벤트 발행
→ 비동기 리스너 실행
→ 재고 차감
→ StockDecreased 이벤트 발행
```

테스트 코드가 주문 완료를 실행한 직후 재고를 확인하면, 비동기 리스너가 아직 실행되지 않았을 수 있어요.

```text
테스트 스레드: 주문 완료 → 바로 검증
비동기 스레드:          → 아직 재고 처리 중
```

이 때문에 다음 도구들을 직접 조합해야 할 수 있어요.

- 이벤트를 트랜잭션 안에서 발행하는 기능
- 트랜잭션 이벤트 리스너 실행
- 비동기 처리가 끝날 때까지 기다리는 기능
- 결과를 검증하는 기능
- 시간 초과 처리

Spring Modulith의 `Scenario`는 이러한 작업을 간단하게 표현하기 위한 테스트 도구예요.

# 7. `Scenario` 테스트의 기본 구조

`@ApplicationModuleTest`의 테스트 메서드에서 `Scenario`를 매개변수로 받으면 돼요.

```java
@ApplicationModuleTest
class SomeApplicationModuleTest {

    @Test
    void someModuleIntegrationTest(Scenario scenario) {
        // Scenario를 이용한 테스트
    }
}
```

Scenario 테스트는 보통 다음 순서로 구성돼요.

```text
1. 자극을 준다.
2. 필요하면 대기 시간 등을 설정한다.
3. 기대하는 이벤트나 상태 변화를 기다린다.
4. 결과를 검증한다.
```

여기서 자극은 시스템에 어떤 동작을 시작시키는 입력을 의미해요. 예를 들면 애플리케이션 이벤트를 발행하거나, Spring Bean의 메서드를 호출하는 것이에요.

## 7-1. 자극(stimulus) 주기

이벤트를 발행하면서 테스트를 시작해요.

```java
scenario.publish(new MyApplicationEvent(...));
```

특정 Bean의 메서드를 호출하면서 테스트를 시작할 수도 있어요.

```java
scenario.stimulate(() -> someBean.someMethod(...));
```

이 이벤트 발행이나 Bean 호출은 Spring Modulith가 만든 **새로운 트랜잭션** 안에서 실행돼요. 그래야 실행 중 발행된 이벤트가 `@TransactionalEventListener`에 정상적으로 전달되기 때문이에요.

> [!WARNING] 테스트 데이터가 자동 롤백되지 않아요
> Scenario는 기존 테스트 트랜잭션과 별개의 새로운 트랜잭션을 사용해요. 따라서 자극을 실행하면서 DB에 저장한 데이터는 테스트가 끝나도 자동으로 롤백되지 않아요.
> ```text
> 테스트 트랜잭션
> └─ Scenario 전용 새 트랜잭션
>    └─ 데이터 저장 후 커밋
> ```
> 그러므로 테스트가 만든 데이터는 직접 정리해야 해요. 이를 위해 Scenario의 `andCleanup(...)` 계열 메서드를 사용할 수 있어요. 테스트끼리 데이터가 섞이지 않게 하려면 특히 중요해요.

## 7-2. 특정 이벤트가 발행될 때까지 기다리기

다음 코드는 `SomeOtherEvent`가 발행될 때까지 기다려요.

```java
scenario
    .publish(new MyApplicationEvent(...))
    .andWaitForEventOfType(SomeOtherEvent.class)
    .matching(event -> ...)
    .toArrive();
```

각 부분의 의미는 다음과 같아요.

```text
publish(...)                 → 테스트를 시작할 이벤트 발행
andWaitForEventOfType(...)   → 기대하는 종류의 이벤트가 올 때까지 기다림
matching(...)                → 그중에서 조건에 맞는 이벤트만 인정
toArrive()                   → 실제 Scenario 실행
```

이벤트가 조건에 맞게 도착하면 테스트가 계속 진행돼요. 이벤트가 오지 않으면 무한정 기다리는 것이 아니라, 기본 제한 시간이 지난 후 테스트가 실패해요.

## 7-3. 도착한 이벤트 검증하기

이벤트가 도착했는지만 확인하려면 `.toArrive();`를 쓰고, 내용까지 검증하려면 `.toArriveAndVerify(...)`를 써요.

```java
scenario
    .publish(new MyApplicationEvent(...))
    .andWaitForEventOfType(SomeOtherEvent.class)
    .matching(event -> ...)
    .toArriveAndVerify(event -> {
        // 도착한 이벤트 검증
    });
```

자연어로 읽으면 이래요.

> `MyApplicationEvent`를 발행하고, 조건에 맞는 `SomeOtherEvent`가 도착할 때까지 기다린 다음, 도착한 이벤트를 검증한다.

## 7-4. 이벤트 대신 상태 변화 기다리기

항상 결과가 이벤트로 나타나는 것은 아니에요. 이벤트 처리 결과로 DB 상태가 변경될 수도 있어요.

```text
OrderCompleted 이벤트
→ 비동기 처리
→ 주문 상태가 SHIPPED로 변경
```

이때는 특정 이벤트가 아니라 모듈의 상태가 변경될 때까지 기다릴 수 있어요.

```java
scenario
    .publish(new MyApplicationEvent(...))
    .andWaitForStateChange(() -> someBean.someMethod(...))
    .andVerify(result -> {
        // 변경된 상태 검증
    });
```

Spring Modulith는 지정한 메서드를 반복해서 호출하면서 상태 변화가 나타났는지 확인해요. 기본적으로 다음 결과가 반환되면 상태가 확인된 것으로 판단해요.

- `null`이 아닌 값
- 비어 있지 않은 `Optional`

판단 기준을 직접 정의하고 싶다면 `Predicate`를 추가로 전달할 수 있어요. 예를 들어 주문 상태가 정확히 `COMPLETED`가 될 때까지 기다리는 식이에요.

```java
.andWaitForStateChange(
    () -> orderQuery.findStatus(orderId),
    status -> status == COMPLETED
)
```

## 7-5. 제한 시간 설정하기

비동기 결과를 얼마나 오래 기다릴지도 설정할 수 있어요.

```java
scenario
    .publish(new MyApplicationEvent(...))
    .customize(conditionFactory -> conditionFactory.atMost(Duration.ofSeconds(2)))
    .andWaitForEventOfType(SomeOtherEvent.class)
    .matching(event -> ...)
    .toArriveAndVerify(event -> ...);
```

이 테스트는 조건에 맞는 이벤트를 최대 2초까지 기다려요. 2초 안에 도착하지 않으면 실패해요. 일반적인 제한 시간 설정에는 `waitAtMost(...)` 같은 전용 메서드도 사용할 수 있어요.

## 7-6. 모든 Scenario에 공통 설정 적용하기

테스트마다 제한 시간 등의 설정을 반복하고 싶지 않다면 `ScenarioCustomizer`를 만들 수 있어요.

```java
@ExtendWith(MyCustomizer.class)
class MyTests {

    @Test
    void myTestCase(Scenario scenario) {
        // 공통 설정이 적용된 Scenario
    }

    static class MyCustomizer implements ScenarioCustomizer {

        @Override
        public Function<ConditionFactory, ConditionFactory> getDefaultCustomizer(
                Method method, ApplicationContext context) {
            return conditionFactory -> ...;
        }
    }
}
```

이렇게 하면 해당 테스트 클래스의 모든 `Scenario`에 공통 설정이 적용돼요. 예를 들어 전체 Scenario의 기본 제한 시간을 5초로 통일할 수 있어요.

---

# 8. 변경된 모듈과 관련된 테스트만 실행하기

Spring Modulith 1.3부터는 코드 변경의 영향을 받은 테스트만 실행하는 기능을 제공해요. 다음 테스트 의존성을 추가해요.

```xml
<dependency>
    <groupId>org.springframework.modulith</groupId>
    <artifactId>spring-modulith-junit</artifactId>
    <scope>test</scope>
</dependency>
```

그러면 다음 모듈의 테스트가 실행 대상으로 선택돼요.

- 루트 모듈
- 코드가 변경된 모듈
- 변경된 모듈에 의존하는 모듈

예를 들어 의존 관계가 `주문 → 재고 → 상품`이고 상품 모듈이 변경되면, 상품에 의존하는 재고와 주문 모듈에도 영향이 갈 수 있어요. 따라서 상품·재고·주문 테스트가 실행될 수 있어요. 반대로 결제 모듈이 상품 모듈과 관계가 없다면 결제 테스트는 건너뛸 수 있어요.

## 8-1. 변경 감지 최적화를 사용하지 않는 경우

다음 상황에서는 일부 테스트만 고르지 않고 최적화를 중단해요.

- IDE에서 테스트를 직접 실행한 경우
- `pom.xml`이나 `build.gradle` 같은 빌드 파일이 변경된 경우
- 클래스패스 리소스가 변경된 경우
- 프로젝트에서 변경 사항을 찾지 못한 경우

IDE에서 테스트를 실행하면 개발자가 특정 테스트를 명시적으로 실행한 것으로 간주하기 때문에 변경 감지로 테스트를 건너뛰지 않아요. 빌드 설정이 변경되면 어느 모듈까지 영향을 받는지 안전하게 판단하기 어려워 전체 테스트가 필요할 수 있어요.

변경 사항이 없을 때는 기본적으로 모든 테스트를 실행해요. 모두 건너뛰고 싶다면 다음 설정을 사용할 수 있어요.

```properties
spring.modulith.test.on-no-changes=skip-all
```

## 8-2. CI에서 변경 감지 사용하기

CI에서는 마지막으로 빌드에 성공한 Git 커밋을 기준으로 이후 변경 사항을 계산해야 해요. 다음 속성에 마지막 성공 커밋을 지정해요.

```properties
spring.modulith.test.reference-commit=<마지막 성공 커밋>
```

CI가 해당 커밋까지의 Git 이력을 가져오도록 설정되어 있어야 해요. 얕은 clone 때문에 이전 커밋이 없다면 변경 범위를 제대로 계산하지 못할 수 있어요.

기본 변경 감지 방식을 바꾸고 싶다면 `FileModificationDetector` 구현체를 만들고 다음 설정으로 등록할 수 있어요.

```properties
spring.modulith.test.file-modification-detector=...
```

---

## 최종 정리

> `@ApplicationModuleTest`는 특정 모듈만 Spring에 올려 통합 테스트하게 해주고, `Scenario`는 비동기 이벤트와 상태 변화를 기다리고 검증하는 과정을 쉽게 만들며, 변경 감지 기능은 실제로 영향을 받은 모듈의 테스트만 골라 실행하게 해줘요.

## 관련 노트

- [[C. Working with Application Events]] — 이벤트 발행/소비, `@ApplicationModuleListener`
- [[ApplicationEvents 테스트]] — 순수 Spring TestContext 이벤트 검증
- [[@TransactionalEventListener]] — 커밋 이후 실행
- 이전: [[C. Working with Application Events]]

## 참고 문서

- [Integration Testing Application Modules](https://docs.spring.io/spring-modulith/reference/testing.html)
- [Scenario API](https://docs.spring.io/spring-modulith/reference/testing.html#scenarios)
- [Configuration Properties](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties)
