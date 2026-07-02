---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/runtime.html
prev: "[[F. Documenting Application Modules]]"
next: "[[H. Production-ready Features]]"
---
# Spring Modulith 런타임 지원

이전 장에서 설명한 기능들은 애플리케이션 모듈 배치를 검증 및 문서화 목적의 테스트 시나리오에서 사용하거나, 모듈을 느슨하게 결합하도록 돕는 일반 지원 기능이었어요. 하지만 애플리케이션 모듈 구조 자체를 런타임에 직접 활용하지는 않았어요. 이 섹션에서는 애플리케이션 런타임에서 모듈 초기화를 지원하는 Spring Modulith 기능을 설명해요.

|   |   |
|---|---|
||[[4. Customizing the Application Modules Arrangement|애플리케이션 모듈 감지 커스터마이징]]을 적용하고 있다면, 여기서 설명하는 기능이 해당 설정을 고려할 수 있도록 그 커스터마이징을 프로덕션 소스에 두어야 해요. 이미 프로덕션 소스에 있다면 추가로 옮길 필요는 없어요.|

## 애플리케이션 모듈 런타임 지원 설정

Spring Modulith의 런타임 지원을 활성화하려면 프로젝트에 `spring-modulith-runtime` JAR을 포함해야 해요.

- Maven

- Gradle

```xml
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-runtime'
}
```

이 JAR을 추가하면 Spring Boot 자동 설정이 실행되고 애플리케이션에 다음 컴포넌트가 등록돼요.

- `ApplicationModules`에 접근할 수 있게 해주는 `ApplicationModulesRuntime`

- 메인 애플리케이션 클래스를 감지하기 위해 앞의 Bean을 뒷받침하는 `SpringBootApplicationRuntime`

- `spring.modulith.runtime.verification-enabled`가 `true`로 설정된 경우, 시작 시 애플리케이션 모듈 배치를 검증하고 위반이 감지되면 시작을 중단하는 `RuntimeApplicationModuleVerifier`

- 애플리케이션 컨텍스트에 정의된 `ApplicationModuleInitializer` Bean을 호출하는 [[Spring Boot Application Events and Listeners|`ApplicationStartedEvent` 이벤트 리스너]]

## 애플리케이션 모듈 Initializer

애플리케이션 모듈을 다루다 보면, 애플리케이션 시작 시 개별 모듈에 특화된 코드를 실행해야 하는 경우가 흔해요. 이때 해당 코드의 실행 순서는 애플리케이션 모듈의 의존성 구조를 따라야 해요. 예를 들어 모듈 B가 모듈 A에 의존한다면, Initializer들이 서로 직접 의존하지 않더라도 A의 초기화 코드가 B의 초기화 코드보다 먼저 실행되어야 해요.

![Diagram](https://docs.spring.io/spring-modulith/reference/modulith/_images/diag-c9d3ea255afe83a782790b55732804a6232d12eb.svg)

개발자가 Spring의 표준 `@Order` 애너테이션이나 `Ordered` 인터페이스로 실행 순서를 정의할 수도 있지만, Spring Modulith는 애플리케이션 시작 시 실행될 Bean을 위한 `ApplicationModuleInitializer` 인터페이스를 제공해요. 이 Bean들의 실행 순서는 애플리케이션 모듈 의존성 구조에 따라 자동으로 정렬돼요.

- Java

- Kotlin

```java
@Component
class MyInitializer implements ApplicationModuleInitializer {

  @Override
  public void initialize() {
    // Initialization code goes here
  }
}
```

`ApplicationModuleInitializer` Bean은 `spring-modulith-runtime` JAR이 클래스패스에 있을 때만 호출돼요. 이 JAR이 있어야 애플리케이션 모듈 구조에 따라 Initializer를 위상 정렬하는 데 필요한 의존성이 함께 들어오기 때문이에요. 설정 방법은 [[G. Spring Modulith Runtime Support#애플리케이션 모듈 런타임 지원 설정|애플리케이션 모듈 런타임 지원 설정]]을 참고하면 돼요.

## 애플리케이션 모듈을 인식하는 Flyway Migration

Spring Modulith 2.0부터는 모듈별 [[Spring Boot Flyway Database Migrations|Flyway migration]] 실행을 지원해요. 애플리케이션 모듈은 자기 자신의 영속 데이터에 대한 migration만 정의하는 것이 권장되며, 따라서 이 migration들은 모듈 의존성 트리의 순서대로 실행되어야 해요.

기본 Flyway 설정에서 migration이 `classpath:db/migration`에 있고, `first`와 `second`라는 두 애플리케이션 모듈이 있으며, `second`가 `first`에 의존한다고 가정해볼게요. 여기에 `spring.modulith.runtime.flyway-enabled` [[Spring Modulith Configuration Properties|설정 프로퍼티]]가 활성화되어 있다고 해요.

이 조건이 갖춰지면 Spring Modulith는 Flyway 설정을 다음과 같이 커스터마이징해요.

- 루트 migration 폴더가 `db/migration/__root`로 변경돼요. 이 폴더에는 기본 버전 추적 테이블이 사용돼요.

- `db/migration/$moduleIdentifier`에 대한 추가 migration이 등록되고, 추적 테이블은 `flyway_schema_history_$moduleIdentifier`가 돼요. 이 migration들은 baseline version `0`으로 설정되고, migrate 시 baseline을 잡도록 구성돼요.

- wildcard로 끝나는 migration location은 커스터마이징되지 않아요.

이제 migration 스크립트에 사용하는 버전 번호는 사실상 애플리케이션 모듈 범위 안에서만 의미를 가지므로, 전역 순서를 기준으로 번호를 매기면 안 돼요.

migration 파일을 어느 폴더에 둘지 선택함으로써 항상 실행될 migration과 해당 모듈에 대해서만 실행될 migration을 구분할 수 있어요. 애플리케이션 모듈 테스트 통합은 기본 migration과 테스트 실행에 포함된 모듈의 migration만 실행해요.

### Migration 필터링

기본적으로 Spring Modulith는 migration 파일이 있는 모든 모듈의 migration을 실행해요. 테스트 실행 중에는 테스트 실행에 관련된 모듈의 migration만 실행돼요. migration 실행을 더 세밀하게 커스터마이징하려면 `org.springframework.modulith.runtime.flyway.MigrationFilter` 타입의 Bean을 등록하면 돼요.
