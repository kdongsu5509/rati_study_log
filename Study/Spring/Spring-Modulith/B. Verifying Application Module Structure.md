---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-06-15
prev: "[[4. Customizing the Application Modules Arrangement]]"
next:
---
[[1. 애플리케이션 모듈이란]] 에서 이야기한 것처럼, `ApplicationModules` 의 `verify()` 메서드를 이용해 제약 조건을 검증할 수 있어요.

```java
ApplicationModules.of(Application.class).verify();
```

```kotlin
ApplicationModules.of(Application::class.java).verify()
```

`verify()` 는 다음과 같은 규칙을 기반으로 검증을 수행해요.

1. 애플리케이션 모듈 수준에서의 순환 참조 금지 : 모듈 간의 의존성은 반드시 `directed acyclic graph`이어야 한다.
2. API 패키지를 통해서만 외부 모듈 접근 가능
 - 애플리케이션 모듈 내부 패키지(`internal`) 내부에 대한 참조는 모두 불가. -> [[2-2. Advanced Application Modules]] 참고.
 - 단, [[2-4. Open Application Modules]]  의 경우는 참조 가능.
3. 명시적으로 허용된 애플리케이션 모듈 의존성만 허용 (optional)
 - `@ApplicationModule(allowedDependencies = …)` 를 통해 의존성 정의 시, 다른 애플리케이션 모듈에 대한 의존성 거부. -> [[2-5. Explicit Application Module Dependencies]] 및 [[3. Named Interfaces]] 참조.

추가적으로 `spring modulith` 를 `JMolecules ArchUnit` 라이브러리와 함께 사용할 수 있어요.
`JMolecules ArchUnit` 에 대한 내용은 다음을 참고하세요 : [JMolecules ArchUnit](https://github.com/xmolecules/jmolecules-integrations/tree/main/jmolecules-archunit)

- 이 경우, `JMolecules ArchUnit` 를 통해 선언된 DDD 및 아키텍처 검증 규칙까지 검증에서 사용해요.

## Handling Detected Violation

`ApplicationModules.verify()` 에서 아키텍처 위반이 감지되면 예외가 던져져요.
`verify()` 대신 `detectViolations()` 를 이용하면 아키텍처 규칙을 위반한 코드가 발견되었을 때, 무조건 빌드를 실패시키지 않고 개발자가 특정 예외 상황을 허용하거나 따로 로그만 남기도록 하기 등의 커스텀 처리를 할 수 있어요.

```java
ApplicationModules.of(Application.class)
  .detectViolations() // 1. 일단 위반 사항들을 다 수집해와 (테스트 실패 안 시킴)
  .filter(violation -> {
      // 2. 만약 위반된 내용에 "Legacy"라는 단어가 포함되어 있다면?
      if (violation.toString().contains("Legacy")) {
          return false; // 거름망에서 제외 ➡️ "이 위반은 눈감아줄게(무시)"
      }
      return true; // 나머지 위반 사항들은 그대로 유지
  })
  .throwIfPresent(); // 3. 필터링 다 거치고도 남아있는 '진짜 위반'이 있을 때만 테스트 실패!
```

## Customizing the Verification

`ApplicationModules.verify(…)`와 `.detectViolations(…)`는 기본적으로 모두 클래스패스 설정에 따라 자동으로 검증을 수행해요.

`VerificationOptions`를 이용하면, 검증을 커스텀하거나, 비활성화하거나, 또는 추가적인 검증을 등록할 수 있어요.

```java
var hexagonal = JMoleculesArchitectureRules.ensureHexagonal(VerificationDepth.STRICT); // 1
var options = VerificationOptions.defaults().withAdditionalVerifications(hexagonal); //2

ApplicationModules.of(…).verify(options); //3
```

1. `Hexagonal Architecture`를 위한 `jMolecules` 아키텍처 검증을 설정
2. `1`로 기본 검증을 대체하는 `VerificationOptions` 인스턴스를 생성
3. 방금 설정된 옵션을 사용하여 검증을 실행
