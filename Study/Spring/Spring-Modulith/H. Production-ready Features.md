---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/production-ready.html
prev: "[[G. Spring Modulith Runtime Support]]"
next:
---
# 프로덕션 준비 기능

|   |   |
|---|---|
||[[4. Customizing the Application Modules Arrangement|애플리케이션 모듈 감지 커스터마이징]]을 적용하고 있다면, 여기서 설명하는 기능이 해당 설정을 고려할 수 있도록 그 커스터마이징을 프로덕션 소스에 두어야 해요. 이미 프로덕션 소스에 있다면 추가로 옮길 필요는 없어요.|

Spring Modulith는 시스템의 아키텍처 정보를 Spring Boot Actuator 엔드포인트로 노출하는 기능과, 애플리케이션 모듈 사이의 상호작용을 metrics 및 traces로 캡처해 관찰하는 기능을 제공해요. 프로덕션 준비가 된 애플리케이션은 보통 두 기능을 모두 필요로 하므로, 가장 편한 활성화 방법은 다음처럼 Spring Modulith Insight starter를 사용하는 것이에요.

Spring Modulith Insight starter 사용

- Maven

- Gradle

```none
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-starter-insight:2.1.0'
}
```

이 starter는 Actuator와 observability 지원을 포함하고, Actuator 전반을 지원하기 위한 Spring Boot Actuator starter도 함께 포함해요. 단, 애플리케이션을 [[Zipkin]], [[Wavefront Docs|Wavefront]] 같은 모니터링 도구에 연결하려면 보통 [[OpenTelemetry]]나 [[Brave]]를 통해 추가 의존성을 더해야 해요. 자세한 내용은 Spring Boot Reference Documentation의 [[Spring Boot Micrometer Tracing|해당 섹션]]을 참고하면 돼요.

## 애플리케이션 모듈 Actuator

애플리케이션 모듈 구조는 Spring Boot Actuator로 노출할 수 있어요. Actuator를 활성화하려면 프로젝트에 `spring-modulith-actuator` 의존성을 추가하세요. 위에서 설명한 `spring-modulith-starter-insight`를 이미 선언했다면 추가할 필요가 없어요.

Spring Modulith Actuator 지원 사용

- Maven

- Gradle

```none
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-actuator:2.1.0'
}

<!-- Spring Boot actuator starter required to enable actuators in general -->
dependencies {
  runtimeOnly 'org.springframework.boot:spring-boot-starter-actuator'
}
```

이제 애플리케이션을 실행하면 `modulith` Actuator 리소스가 노출돼요.

Actuator HTTP 리소스 접근

```json
GET http://localhost:8080/actuator

{
  "_links": {
    "self": {
      "href": "http://localhost:8080/actuator",
      "templated": false
    },
    "health-path": {
      "href": "http://localhost:8080/actuator/health/{*path}",
      "templated": true
    },
    "health": {
      "href": "http://localhost:8080/actuator/health",
      "templated": false
    },
    "modulith": { 
      "href": "http://localhost:8080/actuator/modulith",
      "templated": false
    }
  }
}
```

|   |   |
|---|---|
||노출된 `modulith` Actuator 리소스예요.|

`modulith` 리소스는 다음 구조를 따라요.

Table 1. 애플리케이션 모듈 Actuator의 JSON 구조

|JSONPath|Description|
|---|---|
|`$.{moduleName}`|애플리케이션 모듈의 기술적 이름이에요. `dependencies.target`의 모듈 참조 대상이에요.|
|`$.{moduleName}.displayName`|애플리케이션 모듈의 사람이 읽기 좋은 이름이에요.|
|`$.{moduleName}.basePackage`|애플리케이션 모듈의 베이스 패키지예요.|
|`$.{moduleName}.parent`|(선택 사항) 부모 모듈의 이름이에요. 자세한 내용은 [[2-3. Nested Application Modules]]를 참고하세요.|
|`$.{moduleName}.nested`|중첩 모듈이 있다면 그 이름들이에요. 자세한 내용은 [[2-3. Nested Application Modules]]를 참고하세요.|
|`$.{moduleName}.dependencies[]`|애플리케이션 모듈의 모든 outgoing dependency예요.|
|`$.{moduleName}.dependencies[].target`|의존 대상 애플리케이션 모듈의 이름이에요. `{moduleName}`에 대한 참조예요.|
|`$.{moduleName}.dependencies[].types[]`|대상 모듈을 향한 의존성 타입이에요. `DEFAULT`(단순 타입 의존성), `USES_COMPONENT`(Spring Bean 의존성), `EVENT_LISTENER` 중 하나일 수 있어요.|

예시 모듈 배치는 다음과 같아요.

애플리케이션 모듈 Actuator 응답 예시

```json
{
  "a": {
    "basePackage": "example.a",
    "displayName": "A",
    "dependencies": []
  },
  "b": {
    "basePackage": "example.b",
    "displayName": "B",
    "dependencies": [ {
      "target": "a",
      "types": [ "EVENT_LISTENER", "USES_COMPONENT" ]
    } ]
  }
}
```

## 애플리케이션 모듈 관찰

애플리케이션 모듈 사이의 상호작용을 가로채 Micrometer span을 만들 수 있고, 이 span은 최종적으로 [[Zipkin]]이나 [[Grafana]] 같은 도구에서 시각화할 수 있는 trace가 돼요. instrumentation을 활성화하려면 다음 런타임 의존성을 프로젝트에 추가하세요. 위에서 설명한 `spring-modulith-starter-insight`를 이미 선언했다면 추가할 필요가 없어요.

Spring Modulith observability 지원 사용

- Maven

- Gradle

```none
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-observability-core:2.1.0'
}
```

애플리케이션 이벤트 발행에 대해 생성되는 metric을 커스터마이징하고 싶다면, compile scope에 `spring-modulith-observability-api` 아티팩트도 선언해야 해요.

|   |   |
|---|---|
||observability metadata를 어떤 도구로 보낼지에 따라 추가 인프라 의존성을 설정해야 해요. 어떤 의존성을 포함해야 하는지는 [[Spring Boot Micrometer Tracing|Spring Boot 문서]]를 참고하세요.|

이 의존성을 추가하면 애플리케이션 모듈 API에 속한 모든 Spring 컴포넌트가 aspect로 장식돼요. 이 aspect는 호출을 가로채고 해당 호출에 대한 Micrometer span을 생성해요. 예시 호출 trace는 아래에서 볼 수 있어요.

![observability](https://docs.spring.io/spring-modulith/reference/_images/observability.png)

Figure 1. 모듈 호출 trace 예시

이 사례에서는 결제를 트리거하면 주문 상태가 변경되고, 그 결과 주문 완료 이벤트가 트리거돼요. 이 이벤트는 비동기로 엔진에 의해 처리되고, 엔진은 주문에 또 다른 상태 변경을 일으킨 뒤 몇 초 동안 작업하고 마지막으로 주문의 최종 상태 변경을 다시 트리거해요.

### Observability Span

#### Module Entry Span

Table 2. Tag Keys

|Name|Description|
|---|---|
|`module.identifier`|모듈의 식별자예요.|
|`module.invocation-type`|호출 타입이에요. `event listener` 또는 `bean`이에요.|
|`module.method`|모듈에서 실행된 메서드예요.|
|`module.name`|모듈의 이름이에요.|

### Observability Metric

Spring Modulith는 애플리케이션에서 발행되는 모든 도메인 이벤트에 대한 데이터를 두 가지 metric 형태로 등록해요.

- `module.events.published` - 모든 이벤트 발행을 합산하는 counter예요.

- `module.events.published.$moduleIdentifier.$simpleEventTypeName` - 개별 이벤트에 대한 counter이며, 도메인별 값으로 더 풍부하게 만들 수 있어요.

#### All Events Metric

Table 3. Low cardinality Keys

|Name|Description|
|---|---|
|`module.event.type`|발행된 이벤트의 타입이에요.|
|`module.identifier`|모듈의 식별자예요.|
|`module.name`|모듈의 이름이에요.|

#### Individual Events Metric

Table 4. Low cardinality Keys

|Name|Description|
|---|---|
|`module.identifier`|모듈의 식별자예요.|
|`module.name`|모듈의 이름이에요.|

개별 이벤트 metric에는 `ModulithEventMetricsCustomizer`를 구현해서 추가 tag를 더할 수 있어요.

```java
@Configuration
class ObservabilityConfiguration {

  @Bean
  ModulithEventMetricsCustomizer modulithEventMetricsCustomizer() {

    return metrics -> {

      metrics.customize(MyCustomDomainEvent.class, (event, it) -> {
        it.tags("someTag", event.getValue());
      });
    };
  }
}
```

개별 도메인 이벤트를 타입으로 참조하고, 해당 이벤트의 값을 metric의 값으로 변환할 수 있다는 점에 주목하면 돼요.

#### Convention

Spring Modulith가 생성하는 metric은 애플리케이션에 `ModulithObservationConvention` Bean을 제공해서 커스터마이징할 수 있어요.

```java
@Configuration
class ObservabilityConfiguration {

  @Bean
  ModulithObservationConvention observationConvention() {
    return new CustomModulithObservationConvention();
  }
}
```

기본 구현은 모든 호출을 `ModulithContext`의 메서드에 위임해요.
