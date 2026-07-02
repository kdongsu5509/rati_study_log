---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-06-15
prev: "[[4. Customizing the Application Modules Arrangement]]"
next:
---
# Production-ready Features

|   |   |
|---|---|
||If you are applying customizations to the application module detection described [here](https://docs.spring.io/spring-modulith/reference/fundamentals.html#customizing-modules), you need to move those into your production sources, unless already present there, to make sure that those are considered by the features described here.|

Spring Modulith provides support to expose architectural information about your system as a Spring Boot actuator endpoint as well as observing the interaction between application modules by capturing metrics and traces. As a production-ready application is likely to require both, the most convenient way to activate those features is to use the Spring Modulith Insight starter as follows:

Using the Spring Modulith Insight starter

- Maven
    
- Gradle
    

```none
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-starter-insight:2.1.0'
}
```

This will include the actuator and observability support as well as Spring Boot’s actuator startup for general support for actuators. Note, that you will still have to add further dependencies to connect your application to your monitoring tools such as [Zipkin](https://zipkin.io/), [Wavefront](https://docs.wavefront.com/) etc. usually via [OpenTelemetry](https://opentelemetry.io/) or [Brave](https://github.com/openzipkin/brave). Find more information on that in [the corresponding section](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#actuator.micrometer-tracing) of Spring Boot’s reference documentation.

## [](https://docs.spring.io/spring-modulith/reference/production-ready.html#actuator)Application Module Actuator

The application module structure can be exposed as Spring Boot actuator. To enable the actuator, add the `spring-modulith-actuator` dependency to the project, unless you already declared the `spring-modulith-starter-insight` as described [above](https://docs.spring.io/spring-modulith/reference/production-ready.html#production-ready):

Using the Spring Modulith actuator support

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

Running the application will now expose an `modulith` actuator resource:

Accessing the actuator HTTP resource

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
||The `modulith` actuator resource advertised.|

The `modulith` resource adheres to the following structure:

Table 1. The JSON structure of the application modules actuator
|JSONPath|Description|
|---|---|
|`$.{moduleName}`|The technical name of an application module. Target for module references in `dependencies.target`.|
|`$.{moduleName}.displayName`|The human-readable name of the application module.|
|`$.{moduleName}.basePackage`|The application module’s base package.|
|`$.{moduleName}.parent`|(optional) The name of the parent module. See xref:fundamentals.adoc#modules.nested for details.|
|`$.{moduleName}.nested`|The names of nested modules, if any. See xref:fundamentals.adoc#modules.nested for details.|
|`$.{moduleName}.dependencies[]`|All outgoing dependencies of the application module|
|`$.{moduleName}.dependencies[].target`|The name of the application module depended on. A reference to a `{moduleName}`.|
|`$.{moduleName}.dependencies[].types[]`|The types of dependencies towards the target module. Can either be `DEFAULT` (simple type dependency), `USES_COMPONENT` (Spring bean dependency) or `EVENT_LISTENER`.|

An example module arrangement would look like this:

An example response for the application modules actuator

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

## [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability)Observing Application Modules

The interaction between application modules can be intercepted to create Micrometer spans to ultimately end up in traces you can visualize in tools like [Zipkin](https://zipkin.io/) or [Grafana](https://grafana.com/). To activate the instrumentation add the following runtime dependency to your project, unless you already declared the `spring-modulith-starter-insight` as described [above](https://docs.spring.io/spring-modulith/reference/production-ready.html#production-ready):

Using the Spring Modulith observability support

- Maven
    
- Gradle
    

```none
dependencies {
  runtimeOnly 'org.springframework.modulith:spring-modulith-observability-core:2.1.0'
}
```

In case you would like to customize metrics created for application event publications, you will also need to declare the `spring-modulith-observability-api` artifact in compile scope.

|   |   |
|---|---|
||You will have to configure additional infrastructure dependencies depending on the tooling you want to pipe the observability metadata in. For details, please check the corresponding [Spring Boot documentation](https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#actuator.micrometer-tracing) on which dependencies to include for your setup.|

This will cause all Spring components that are part of the application module’s API being decorated with an aspect that will intercept invocations and create Micrometer spans for them. A sample invocation trace can be seen below:

![observability](https://docs.spring.io/spring-modulith/reference/_images/observability.png)

Figure 1. A sample module invocation trace

In this particular case, triggering the payment changes the state of the order which then causes an order completion event being triggered. This gets picked up asynchronously by the engine that triggers another state change on the order, works for a couple of seconds and triggers the final state change on the order in turn.

### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-spans)Observability Spans

#### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-spans-module-entry)Module Entry Span

|   |   |
|---|---|
Table 2. Tag Keys
|Name|Description|
|`module.identifier`|The identifier of the module.|
|`module.invocation-type`|Type of invocation ("event listener" or "bean").|
|`module.method`|Method executed on a module.|
|`module.name`|Name of the module.|

### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-metrics)Observability Metrics

Spring Modulith registers data for all domain events published in the application in the form of two metrics.

- `module.events.published` – a counter summarizing all event publications.
    
- `module.events.published.$moduleIdentifier.$simpleEventTypeName` - a counter for the individual event that can be further enriched with domain-specific values.
    

#### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-metrics-all-events)The All Events Metric

|   |   |
|---|---|
Table 3. Low cardinality Keys
|Name|Description|
|`module.event.type`|Type of the emitted event.|
|`module.identifier`|The identifier of the module.|
|`module.name`|Name of the module.|

#### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-metrics-individual-events)The Individual Events Metric

|   |   |
|---|---|
Table 4. Low cardinality Keys
|Name|Description|
|`module.identifier`|The identifier of the module.|
|`module.name`|Name of the module.|

Additional tags can be added to the invidual events metrics by implementing a `ModulithEventMetricsCustomizer`.

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

Note how we are able to refer to the individual domain events by type and can translate values of the particular event into a value on the metric.

#### [](https://docs.spring.io/spring-modulith/reference/production-ready.html#observability-conventions)Conventions

The metrics created by Spring Modulith can be customized by providing a `ModulithObservationConvention` as bean in your application.

```java
@Configuration
class ObservabilityConfiguration {

  @Bean
  ModulithObservationConvention observationConvention() {
    return new CustomModulithObservationConvention();
  }
}
```

Our default implementation delegates all calls to methods on `ModulithContext`.