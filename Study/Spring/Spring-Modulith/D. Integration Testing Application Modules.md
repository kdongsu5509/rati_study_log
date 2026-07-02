---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/testing.html
prev: "[[C. Working with Application Events]]"
next: "[[E. Moments - a Passage of Time Events API]]"
---
# 애플리케이션 모듈 통합 테스트

Spring Modulith는 개별 애플리케이션 모듈을 단독으로, 또는 다른 모듈과 조합해서 부트스트랩하는 통합 테스트를 실행할 수 있게 해줘요. 이를 위해 프로젝트에 Spring Modulith 테스트 스타터를 추가해요.

```xml
<dependency>
  <groupId>org.springframework.modulith</groupId>
  <artifactId>spring-modulith-starter-test</artifactId>
  <scope>test</scope>
</dependency>
```

그다음 애플리케이션 모듈 패키지나 그 하위 패키지에 JUnit 테스트 클래스를 두고 `@ApplicationModuleTest`를 붙여요.

애플리케이션 모듈 통합 테스트 클래스 예시는 다음과 같아요.

```java
package example.order;

@ApplicationModuleTest
class OrderIntegrationTests {

  // Individual test cases go here
}
```

이 테스트는 `@SpringBootTest`와 비슷하게 통합 테스트를 실행하지만, 실제 부트스트랩 범위는 테스트 클래스가 위치한 애플리케이션 모듈로 제한돼요. `org.springframework.modulith`의 로그 레벨을 `DEBUG`로 설정하면 테스트 실행이 Spring Boot 부트스트랩을 어떻게 조정하는지 자세히 볼 수 있어요.

애플리케이션 모듈 통합 테스트 부트스트랩 로그 예시는 다음과 같아요.

```text
  .   ____          _            __ _ _
 /\\ / ___'_ __ _ _(_)_ __  __ _ \ \ \ \
( ( )\___ | '_ | '_| | '_ \/ _` | \ \ \ \
 \\/  ___)| |_)| | | | | || (_| |  ) ) ) )
  '  |____| .__|_| |_|_| |_\__, | / / / /
 =========|_|==============|___/=/_/_/_/
 :: Spring Boot ::       (v3.0.0-SNAPSHOT)

… - Bootstrapping @ApplicationModuleTest for example.order in mode STANDALONE (class example.Application)…
… - ======================================================================================================
… - ## example.order ##
… - > Logical name: order
… - > Base package: example.order
… - > Direct module dependencies: none
… - > Spring beans:
… -       + ….OrderManagement
… -       + ….internal.OrderInternal
… - Starting OrderIntegrationTests using Java 17.0.3 …
… - No active profile set, falling back to 1 default profile: "default"
… - Re-configuring auto-configuration and entity scan packages to: example.order.
```

출력에는 테스트 실행에 포함된 모듈에 대한 상세 정보가 들어 있어요. Spring Modulith는 애플리케이션 모듈을 만들고, 실행할 모듈을 찾은 뒤, 자동 설정과 컴포넌트 스캔 및 엔티티 스캔 범위를 해당 패키지로 제한해요.

## 부트스트랩 모드

애플리케이션 모듈 테스트는 여러 모드로 부트스트랩할 수 있어요.

| 모드 | 설명 |
|---|---|
| `STANDALONE` | 기본값이에요. 현재 모듈만 실행해요. |
| `DIRECT_DEPENDENCIES` | 현재 모듈과 현재 모듈이 직접 의존하는 모든 모듈을 실행해요. |
| `ALL_DEPENDENCIES` | 현재 모듈과 현재 모듈이 의존하는 전체 모듈 트리를 실행해요. |

## 외부 방향 의존성 다루기

애플리케이션 모듈이 부트스트랩되면 그 안에 포함된 Spring 빈들이 인스턴스화돼요. 빈이 모듈 경계를 넘는 참조를 가지고 있는데 테스트 실행에 해당 대상 모듈이 포함되어 있지 않으면 부트스트랩이 실패해요. 자세한 내용은 위의 부트스트랩 모드를 참고하세요. 자연스러운 대응은 포함할 애플리케이션 모듈 범위를 넓히는 것이지만, 보통은 대상 빈을 mocking하는 편이 더 좋아요.

다른 애플리케이션 모듈의 Spring 빈 의존성을 mocking하는 예시는 다음과 같아요.

```java
@ApplicationModuleTest
class InventoryIntegrationTests {

  @MockitoBean SomeOtherComponent someOtherComponent;
}
```

Spring Boot는 `@MockitoBean`으로 정의된 타입에 대한 빈 정의와 인스턴스를 만들고, 테스트 실행을 위해 부트스트랩된 `ApplicationContext`에 추가해요.

애플리케이션 모듈이 다른 모듈의 빈에 너무 많이 의존한다면 보통 모듈 간 결합도가 높다는 신호예요. 이런 의존성은 [[C. Working with Application Events|도메인 이벤트]] 발행으로 대체할 후보인지 검토하는 것이 좋아요.

## Boot Slice Test 애너테이션과 통합하기

`@ApplicationModuleTest`는 애플리케이션의 모든 계층을 한 번에 실행하되 애플리케이션 모듈 기준으로 잘라 실행하는 `@SpringBootTest`의 대체 수단이에요. Spring Modulith의 수직 슬라이싱과 Spring Boot의 수평 슬라이싱을 조합하고 싶다면 `@ApplicationModuleTest`의 기반이 되는 `@ModuleSlicing` 애너테이션을 사용하면 돼요.

```java
package example.order;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.modulith.test.ModuleSlicing;

@ModuleSlicing
@DataJpaTest
class SomeModuleRepositoryIntegrationTests {

  @Autowired SomeRepository repository;

  @Test
  void someTest() { … }
}
```

## 통합 테스트 시나리오 정의하기

애플리케이션 모듈 통합 테스트는 꽤 복잡해질 수 있어요. 특히 모듈 통합이 [[C. Working with Application Events|비동기 트랜잭션 이벤트 처리]]를 기반으로 한다면 동시 실행을 다룰 때 미묘한 오류가 생길 수 있어요. 또한 이벤트가 발행되고 트랜잭션 리스너에 전달되도록 `TransactionOperations`와 `ApplicationEventProcessor`를 다뤄야 하고, 동시성을 다루기 위해 Awaitility를 사용해야 하며, 테스트 결과를 표현하기 위해 AssertJ assertion도 필요해요.

Spring Modulith는 애플리케이션 모듈 통합 테스트를 더 쉽게 정의할 수 있도록 `Scenario` 추상화를 제공해요. `@ApplicationModuleTest`로 선언된 테스트에서 이를 테스트 메서드 파라미터로 선언해 사용할 수 있어요.

JUnit 5 테스트에서 `Scenario` API를 사용하는 예시는 다음과 같아요.

```java
@ApplicationModuleTest
class SomeApplicationModuleTest {

  @Test
  public void someModuleIntegrationTest(Scenario scenario) {
    // Use the Scenario API to define your integration test
  }
}
```

테스트 정의는 보통 다음 흐름을 따라요.

1. 시스템에 줄 자극을 정의해요. 보통 이벤트 발행이거나 모듈이 노출한 Spring 컴포넌트 호출이에요.
2. 실행의 기술적인 세부 사항을 선택적으로 커스터마이징해요. 예를 들어 timeout 등을 설정할 수 있어요.
3. 기대 결과를 정의해요. 특정 조건을 만족하는 다른 애플리케이션 이벤트가 발행되거나, 노출된 컴포넌트를 호출해 감지할 수 있는 모듈 상태 변화가 이에 해당해요.
4. 수신한 이벤트나 관찰된 변경 상태에 대해 선택적으로 추가 검증을 수행해요.

`Scenario`는 이 단계들을 정의하고 자연스럽게 이어갈 수 있는 API를 제공해요.

`Scenario`의 시작점으로 자극을 정의하는 예시는 다음과 같아요.

```java
// Start with an event publication
scenario.publish(new MyApplicationEvent(…)).…

// Start with a bean invocation
scenario.stimulate(() -> someBean.someMethod(…)).…
```

이벤트 발행과 빈 호출은 모두 트랜잭션 콜백 안에서 실행돼요. 그래야 주어진 이벤트나 빈 호출 중 발행된 이벤트가 트랜잭션 이벤트 리스너에 전달될 수 있어요. 이 동작은 테스트 케이스가 이미 트랜잭션 안에서 실행 중이더라도 반드시 **새로운** 트랜잭션을 시작해야 해요. 즉, 자극으로 인해 발생한 데이터베이스 상태 변경은 **절대** 롤백되지 않으며 직접 정리해야 해요. 이를 위해 `….andCleanup(…)` 메서드를 사용할 수 있어요.

그다음 결과 객체에 대해 일반적인 `….customize(…)` 메서드나 timeout 설정용 `….waitAtMost(…)` 같은 특화 메서드로 실행을 커스터마이징할 수 있어요.

설정 단계는 자극의 실제 기대 결과를 정의하면서 마무리돼요. 기대 결과는 다시 특정 타입의 이벤트일 수 있고, matcher로 조건을 더 좁힐 수도 있어요.

작업 결과로 이벤트 발행을 기대하는 예시는 다음과 같아요.

```java
….andWaitForEventOfType(SomeOtherEvent.class)
 .matching(event -> …) // Use some predicate here
 .…
```

이 코드는 최종 실행이 기다릴 완료 조건을 설정해요. 즉, 위 예시는 기본 timeout에 도달하거나 정의한 predicate와 일치하는 `SomeOtherEvent`가 발행될 때까지 실행을 block하게 돼요.

이벤트 기반 `Scenario`를 실행하는 terminal operation은 `….toArrive…()`라는 이름을 가지고 있으며, 선택적으로 기대한 발행 이벤트나 원래 자극으로 정의한 빈 호출의 결과 객체에 접근할 수 있게 해줘요.

검증을 트리거하는 예시는 다음과 같아요.

```java
// Executes the scenario
….toArrive(…)

// Execute and define assertions on the event received
….toArriveAndVerify(event -> …)
```

메서드 이름을 개별 단계로 보면 조금 어색해 보일 수 있지만, 체인으로 조합하면 꽤 자연스럽게 읽혀요.

완성된 `Scenario` 정의 예시는 다음과 같아요.

```java
scenario.publish(new MyApplicationEvent(…))
  .andWaitForEventOfType(SomeOtherEvent.class)
  .matching(event -> …)
  .toArriveAndVerify(event -> …);
```

기대 완료 신호로 이벤트 발행을 사용하는 대신, 노출된 컴포넌트 중 하나의 메서드를 호출해 애플리케이션 모듈의 상태를 검사할 수도 있어요. 이 경우 시나리오는 다음과 같아요.

상태 변경을 기대하는 예시는 다음과 같아요.

```java
scenario.publish(new MyApplicationEvent(…))
  .andWaitForStateChange(() -> someBean.someMethod(…)))
  .andVerify(result -> …);
```

`….andVerify(…)` 메서드로 전달되는 `result`는 상태 변경을 감지하기 위해 호출한 메서드의 반환값이에요. 기본적으로 `null`이 아닌 값과 비어 있지 않은 `Optional`은 확정적인 상태 변경으로 간주돼요. 이 판단은 `….andWaitForStateChange(…, Predicate)` overload를 사용해 조정할 수 있어요.

### Scenario 실행 커스터마이징하기

개별 scenario 실행을 커스터마이징하려면 `Scenario`의 설정 체인에서 `….customize(…)` 메서드를 호출해요.

`Scenario` 실행 커스터마이징 예시는 다음과 같아요.

```java
scenario.publish(new MyApplicationEvent(…))
  .customize(conditionFactory -> conditionFactory.atMost(Duration.ofSeconds(2)))
  .andWaitForEventOfType(SomeOtherEvent.class)
  .matching(event -> …)
  .toArriveAndVerify(event -> …);
```

테스트 클래스의 모든 `Scenario` 인스턴스를 전역으로 커스터마이징하려면 `ScenarioCustomizer`를 구현하고 JUnit extension으로 등록해요.

`ScenarioCustomizer` 등록 예시는 다음과 같아요.

```java
@ExtendWith(MyCustomizer.class)
class MyTests {

  @Test
  void myTestCase(Scenario scenario) {
    // scenario will be pre-customized with logic defined in MyCustomizer
  }

  static class MyCustomizer implements ScenarioCustomizer {

    @Override
    Function<ConditionFactory, ConditionFactory> getDefaultCustomizer(Method method, ApplicationContext context) {
      return conditionFactory -> …;
    }
  }
}
```

## 변경 인지 테스트 실행

Spring Modulith 1.3부터는 JUnit Jupiter extension을 제공해요. 이 extension은 프로젝트 변경의 영향을 받지 않는 테스트를 건너뛰도록 테스트 실행을 최적화해요. 이 최적화를 활성화하려면 `spring-modulith-junit` artifact를 test scope 의존성으로 선언해요.

```xml
<dependency>
  <groupId>org.springframework.modulith</groupId>
  <artifactId>spring-modulith-junit</artifactId>
  <scope>test</scope>
</dependency>
```

테스트는 root module에 있거나, 변경이 발생한 모듈에 있거나, 변경이 발생한 모듈에 전이적으로 의존하는 모듈에 있을 때 실행 대상으로 선택돼요. 다음 상황에서는 최적화를 중단하고 일반적인 테스트 실행으로 되돌아가요.

- 테스트 실행이 IDE에서 시작된 경우예요. 이 경우 명시적으로 실행된 것으로 간주해요.
- 변경 집합에 모듈 root의 빌드 시스템 리소스 변경이 포함된 경우예요. 예를 들어 `pom.xml`, `build.gradle(.kts)`, `settings.gradle(.kts)`, `gradle.properties`, `gradle/libs.versions.toml`, `gradle/wrapper/gradle-wrapper.properties`가 이에 해당해요.
- 변경 집합에 classpath resource 변경이 포함된 경우예요.
- 프로젝트에 변경 사항이 전혀 없는 경우예요.

|   |   |
|---|---|
| | 변경 인지 실행은 현재 작업 디렉터리를 기준으로 해요. 따라서 sibling sub-module이나 `buildSrc/`, `build-logic/` 같은 전용 build-logic 디렉터리의 빌드 파일 변경은 주변 모듈의 전체 테스트 실행을 트리거하지 않아요. 해당 모듈의 테스트가 실행될 때 감지돼요. |

classpath 또는 빌드 리소스 변경이 감지되지 않으면 기본적으로 모든 테스트를 실행해요. 이 동작은 `spring.modulith.test.on-no-changes` 프로퍼티를 `skip-all`로 설정해 커스터마이징할 수 있어요.

CI 환경에서 실행을 최적화하려면 `spring.modulith.test.reference-commit` 프로퍼티에 마지막 성공 빌드의 commit을 지정하고, 빌드가 해당 reference commit까지의 모든 commit을 checkout하도록 해야 해요. 그러면 애플리케이션 모듈 변경을 감지하는 알고리즘이 그 delta 안에서 변경된 모든 파일을 고려해요. 프로젝트 수정 감지를 override하려면 `spring.modulith.test.file-modification-detector` 프로퍼티를 통해 `FileModificationDetector` 구현체를 선언하면 돼요.

다음으로는 [[C. Working with Application Events|애플리케이션 이벤트 사용]]를 함께 보면 모듈 간 결합을 낮추는 테스트 전략을 이해하는 데 도움이 돼요.
