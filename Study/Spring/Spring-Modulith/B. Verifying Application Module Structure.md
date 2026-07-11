---
library: Spring Modulith
library_version: 2.1.0
url: https://docs.spring.io/spring-modulith/reference/verification.html
prev: "[[4. Customizing the Application Modules Arrangement]]"
next: "[[Study/Spring/Spring-Modulith/C. Working with Application Events/C. Working with Application Events]]"
---
[[1. 애플리케이션 모듈이란]]에서 이야기한 것처럼, `ApplicationModules`의 `verify()` 메서드를 이용해 애플리케이션 모듈 구조의 제약 조건을 검증할 수 있어요.

```java
ApplicationModules.of(Application.class).verify();
```

```kotlin
ApplicationModules.of(Application::class.java).verify()
```

`verify()`는 다음과 같은 규칙을 기준으로 검증을 수행해요.

1. 애플리케이션 모듈 수준에서 순환 참조를 허용하지 않아요. 모듈 간 의존성은 반드시 `directed acyclic graph`여야 해요.
2. 외부 모듈은 API 패키지를 통해서만 접근할 수 있어요. 애플리케이션 모듈의 내부 패키지(`internal`)에 대한 참조는 허용되지 않아요. 자세한 내용은 [[2-2. Advanced Application Modules]]를 참고하세요. 단, [[2-4. Open Application Modules]]의 경우에는 내부 패키지 접근이 허용돼요.
3. 명시적으로 허용된 애플리케이션 모듈 의존성만 허용할 수 있어요. `@ApplicationModule(allowedDependencies = …)`로 의존성을 정의하면, 허용 목록에 없는 다른 애플리케이션 모듈 의존성은 거부돼요. 자세한 내용은 [[2-5. Explicit Application Module Dependencies]]와 [[3. Named Interfaces]]를 참고하세요.

추가로 Spring Modulith를 [[jMolecules ArchUnit]] 라이브러리와 함께 사용할 수 있어요.

이 경우 `jMolecules ArchUnit`를 통해 선언된 DDD 및 아키텍처 검증 규칙까지 함께 적용해요.

## 감지된 위반 처리하기

`ApplicationModules.verify()`에서 아키텍처 위반이 감지되면 예외가 던져져요.
`verify()` 대신 `detectViolations()`를 이용하면 아키텍처 규칙을 위반한 코드가 발견되었을 때 무조건 빌드를 실패시키지 않고, 특정 예외 상황을 허용하거나 별도로 로그만 남기는 식의 커스텀 처리를 할 수 있어요.

```java
ApplicationModules.of(Application.class)
  .detectViolations() // 1. 일단 위반 사항들을 모두 수집해요. 이 시점에는 테스트를 실패시키지 않아요.
  .filter(violation -> {
      // 2. 위반 내용에 "Legacy"라는 단어가 포함되어 있다면
      if (violation.toString().contains("Legacy")) {
          return false; // 이 위반은 필터링해서 무시해요.
      }
      return true; // 나머지 위반 사항들은 그대로 유지해요.
  })
  .throwIfPresent(); // 3. 필터링 후 남아있는 위반이 있을 때만 테스트를 실패시켜요.
```

## 검증 커스터마이징하기

`ApplicationModules.verify(…)`와 `.detectViolations(…)`는 기본적으로 클래스패스 설정에 따라 자동으로 검증을 수행해요.

`VerificationOptions`를 이용하면 검증을 커스터마이징하거나, 일부 검증을 비활성화하거나, 추가 검증을 등록할 수 있어요.

```java
var hexagonal = JMoleculesArchitectureRules.ensureHexagonal(VerificationDepth.STRICT); // 1
var options = VerificationOptions.defaults().withAdditionalVerifications(hexagonal); //2

ApplicationModules.of(…).verify(options); //3
```

1. `Hexagonal Architecture`를 위한 `jMolecules` 아키텍처 검증을 설정해요.
2. 추가 검증을 포함하는 `VerificationOptions` 인스턴스를 생성해요.
3. 방금 설정한 옵션을 사용해 검증을 실행해요.
