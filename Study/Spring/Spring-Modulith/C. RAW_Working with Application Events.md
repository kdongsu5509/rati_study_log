---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-06-15
prev: "[[4. Customizing the Application Modules Arrangement]]"
next:
---
# Working with Application Events

To keep application modules as decoupled as possible from each other, their primary means of interaction should be event publication and consumption. This avoids the originating module to know about all potentially interested parties, which is a key aspect to enable application module integration testing (see [Integration Testing Application Modules](https://docs.spring.io/spring-modulith/reference/testing.html)).

Often we will find application components defined like this:

- Java
    
- Kotlin
    

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

The `complete(…)` method creates functional gravity in the sense that it attracts related functionality and thus interaction with Spring beans defined in other application modules. This especially makes the component harder to test as we need to have instances available of those depended on beans just to create an instance of `OrderManagement` (see [Dealing with Efferent Dependencies](https://docs.spring.io/spring-modulith/reference/testing.html#efferent-dependencies)). It also means that we will have to touch the class whenever we would like to integrate further functionality with the business event order completion.

We can change the application module interaction as follows:

Publishing an application event via Spring’s `ApplicationEventPublisher`

- Java
    
- Kotlin
    

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

Note how, instead of depending on the other application module’s Spring bean, we use Spring’s `ApplicationEventPublisher` to publish a domain event once we have completed the state transitions on the primary aggregate. For a more aggregate-driven approach to event publication, see [Spring Data’s application event publication mechanism](https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html) for details. As event publication happens synchronously by default, the transactional semantics of the overall arrangement stay the same as in the example above. Both for the good, as we get to a very simple consistency model (either both the status change of the order _and_ the inventory update succeed or none of them does), but also for the bad as more triggered related functionality will widen the transaction boundary and potentially cause the entire transaction to fail, even if the functionality that is causing the error is not crucial.

A different way of approaching this is by moving the event consumption to asynchronous handling at transaction commit and treat secondary functionality exactly as that:

An async, transactional event listener

- Java
    
- Kotlin
    

```java
@Component
class InventoryManagement {

  @Async
  @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

This now effectively decouples the original transaction from the execution of the listener. While this avoids the expansion of the original business transaction, it also creates a risk: if the listener fails for whatever reason, the event publication is lost, unless each listener actually implements its own safety net. Even worse, that doesn’t even fully work, as the system might fail before the method is even invoked.

## [](https://docs.spring.io/spring-modulith/reference/events.html#aml)Application Module Listener

To run a transactional event listener in a transaction itself, it would need to be annotated with `@Transactional` in turn.

An async, transactional event listener running in a transaction itself

- Java
    
- Kotlin
    

```java
@Component
class InventoryManagement {

  @Async
  @Transactional(propagation = Propagation.REQUIRES_NEW)
  @TransactionalEventListener
  void on(OrderCompleted event) { /* … */ }
}
```

To ease the declaration of what is supposed to describe the default way of integrating modules via events, Spring Modulith provides `@ApplicationModuleListener` as a shortcut.

An application module listener

- Java
    
- Kotlin
    

```java
@Component
class InventoryManagement {

  @ApplicationModuleListener
  void on(OrderCompleted event) { /* … */ }
}
```

## [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry)The Event Publication Registry

Spring Modulith ships with an event publication registry that hooks into the core event publication mechanism of Spring Framework. On event publication, it finds out about the transactional event listeners that will get the event delivered and writes entries for each of them (dark blue) into an event publication log as part of the original business transaction. By default, all event listeners (meta-)annotated with `@TransactionalEventListener` are considered. If you want to customize this, check out the [`spring.modulith.events.registry-trigger-annotation` property](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties).

![event publication registry start](https://docs.spring.io/spring-modulith/reference/_images/event-publication-registry-start.png)

Figure 1. The transactional event listener arrangement before execution

Each transactional event listener is wrapped into an aspect that marks that log entry as completed if the execution of the listener succeeds. In case the listener fails, the log entry stays untouched so that retry mechanisms can be deployed depending on the application’s needs. Automatic re-publication of the events can be enabled via the [`spring.modulith.events.republish-outstanding-events-on-restart`](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties) property.

![event publication registry end](https://docs.spring.io/spring-modulith/reference/_images/event-publication-registry-end.png)

Figure 2. The transactional event listener arrangement after execution

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle)Event Publication Lifecycle (since 2.0)

Spring Modulith 2.0 introduces a dedicated lifecycle for event publications so that you can distinguish publications that are about to be processed, currently in progress, completed, or failed. That makes it easier to resubmit only failed publications and to recover from crashes without incorrectly treating in-progress ones as failed.

#### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.states)Publication states

Each event publication has a `EventPublication.Status`:

- `PUBLISHED` – The publication was stored and is waiting to be processed (or is about to be picked up).
    
- `PROCESSING` – A listener has claimed the publication and is executing. The interceptor around the listener sets this before invoking the listener and sets it to `COMPLETED` or `FAILED` when the listener returns.
    
- `COMPLETED` – The listener finished successfully. A completion date is set (unless the completion [mode is `DELETE`](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.completion)).
    
- `FAILED` – The listener threw an exception, or the publication was marked failed by the staleness mechanism (see [Event Publication Staleness and Automatic Marking as Failed](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.staleness)).
    
- `RESUBMITTED` – A previously failed publication was resubmitted and is again pending processing.
    

![event-publication-lifecycle](https://docs.spring.io/spring-modulith/reference/modulith/_images/event-publication-lifecycle-ab8d6ffd06f5cc626c7bceebcede14fad3d0ccac.svg)

#### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.details)Publication details

In addition to the status, each publication tracks:

- _Last resubmission date_ – When the publication was last resubmitted (if ever). Exposed via `EventPublication.getLastResubmissionDate()`.
    
- _Completion attempts_ – How often the listener was invoked (including the current run). Incremented when moving to `PROCESSING`, so a crash during the listener still leaves the attempt count updated. Exposed via `EventPublication.getCompletionAttempts()`.
    

These allow you to implement policies such as "resubmit only if failed longer than X" or "stop after N attempts" using the resubmission APIs and options.

#### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.staleness)Event Publication Staleness and Automatic Marking as Failed

Publications can remain in `PUBLISHED`, `PROCESSING`, or `RESUBMITTED` if the application crashes or a listener hangs. So that they can be treated as failed and resubmitted (or ignored), you can configure after which duration each of these states is considered _stale_. Stale publications are periodically marked as `FAILED` by a background task.

Spring Modulith provides a _Staleness Monitor_ (since 2.0) that runs as a scheduled task at a configurable interval. When any of the staleness durations is set to a non-zero value, the monitor is active: on each run it finds event publications in `PUBLISHED`, `PROCESSING`, or `RESUBMITTED` that are older than the corresponding duration and marks them as `FAILED`. That allows recovery (e.g. via `FailedEventPublications.resubmit(…)`) or other handling of publications that would otherwise remain stuck. You customize it via the [`spring.modulith.events.staleness` configuration properties](https://docs.spring.io/spring-modulith/reference/appendix.html#configuration-properties). If all of `published`, `processing`, and `resubmitted` are zero (default), the Staleness Monitor does not register the scheduled task and no automatic marking as failed occurs.

#### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.failed-and-resubmission)Failed publications and resubmission

The registry lets you work explicitly with failed publications:

- _FailedEventPublications_ (since 2.0) – Use the bean of this type to resubmit only failed publications: `resubmit(ResubmissionOptions)`.
    
- _ResubmissionOptions_ – Control how resubmission works: batch size, maximum in-flight, minimum age of the publication, and an optional filter (e.g. by event type or `completionAttempts`). Create with `ResubmissionOptions.defaults()` and customize with `withBatchSize(…)`, `withMinAge(…)`, `withFilter(…)`, etc.
    

Resubmission changes the status from `FAILED` to `RESUBMITTED` and updates the last resubmission date; when a listener is about to run, the publication moves to `PROCESSING` and the completion attempt count is incremented.

For "incomplete" publications in general (including failed and, depending on configuration, stale ones), the existing `IncompleteEventPublications` API still applies; as of 2.0 it supports `resubmitIncompletePublications(ResubmissionOptions)` in addition to the predicate- and duration-based overloads.

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.starters)Spring Boot Event Registry Starters

Using the transactional event publication log requires a combination of artifacts added to your application. To ease that task, Spring Modulith provides starter POMs that are centered around the [persistence technology](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.publication-repositories) to be used and default to the Jackson-based [EventSerializer](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.serialization) implementation. The following starters are available:

|Persistence Technology|Artifact|Description|
|---|---|---|
|JPA|`spring-modulith-starter-jpa`|Using JPA as persistence technology.|
|JDBC|`spring-modulith-starter-jdbc`|Using JDBC as persistence technology. Also works in JPA-based applications but bypasses your JPA provider for actual event persistence.|
|MongoDB|`spring-modulith-starter-mongodb`|Using MongoDB as persistence technology. Also enables MongoDB transactions and requires a replica set setup of the server to interact with. The transaction auto-configuration can be disabled by setting the `spring.modulith.events.mongodb.transaction-management.enabled` property to `false`.|
|Neo4j|`spring-modulith-starter-neo4j`|Using Neo4j behind Spring Data Neo4j.|

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.managing-publications)Managing Event Publications

Event publications may need to be managed in a variety of ways during the runtime of an application. Incomplete publications might have to be re-submitted to the corresponding listeners after a given amount of time. Completed publications on the other hand, will likely have to be purged from the database or moved into an archive store. As the needs for that kind of housekeeping strongly vary from application to application, Spring Modulith offers an API to deal with both kinds of publications. That API is available through the `spring-modulith-events-api` artifact that you can add to your application:

Using Spring Modulith Events API artifact

- Maven
    
- Gradle
    

```none
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-events-api:2.1.0'
}
```

This artifact contains primary abstractions that are available to application code as Spring Beans:

- `CompletedEventPublications` — This interface allows accessing all completed event publications, and provides an API to immediately purge all of them from the database or the completed publications older than a given duration (for example, 1 minute).
    
- `IncompleteEventPublications` — This interface allows accessing all incomplete event publications to resubmit either the ones matching a given predicate, older than a given `Duration` relative to the original publishing date, or matching custom criteria via `resubmitIncompletePublications(ResubmissionOptions)` (since 2.0).
    
- `FailedEventPublications` (since 2.0) — This interface allows resubmitting only failed event publications via `resubmit(ResubmissionOptions)`, as described in [Failed publications and resubmission](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.lifecycle.failed-and-resubmission).
    

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.completion)Event Publication Completion

Event publications are marked as completed when a transactional or `@ApplicationModuleListener` execution completes successfully. By default, the completion is registered by setting the completion date on an `EventPublication`. This means that completed publications will remain in the Event Publication Registry so that they can be inspected through the `CompletedEventPublications` interface as described [above](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.managing-publications). A consequence of this is that you’ll need to put some code in place that will periodically purge old, completed `EventPublication`s. Otherwise, the persistent abstraction of them, for example a relational database table, will grow unbounded and the interaction with the store creating and completing new `EventPublication` might slow down.

Spring Modulith 1.3 introduces a configuration property `spring.modulith.events.completion-mode` to support two additional modes of completion. It defaults to `UPDATE` which is backed by the strategy described above. Alternatively, the completion mode can be set to `DELETE`, which alters the registry’s persistence mechanisms to rather delete `EventPublication`s on completion. This means that `CompletedEventPublications` will not return any publications anymore, but at the same time, you don’t have to worry about purging the completed events from the persistence store manually anymore.

The third option is the `ARCHIVE` mode, which copies the entry into an archive table, collection or node. For that archive entry, the completion date is set and the original entry is removed. Contrary to the `DELETE` mode, completed event publications are then still accessible via the `CompletedEventPublications` abstraction.

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.publication-repositories)Event Publication Repositories

To actually write the event publication log, Spring Modulith exposes an `EventPublicationRepository` SPI and implementations for popular persistence technologies that support transactions, like JPA, JDBC and MongoDB. You select the persistence technology to be used by adding the corresponding JAR to your Spring Modulith application. We have prepared dedicated [starters](https://docs.spring.io/spring-modulith/reference/events.html#starters) to ease that task.

The JDBC-based implementation will create a dedicated table for the event publication log unless the respective configuration property (`spring.modulith.events.jdbc.schema-initialization.enabled`) is set to `false`. The schema creation will of course also back off if the required tables already exist, for example if created via database migration tools such as Flyway or Liquibase. For details, please consult the [schema overview](https://docs.spring.io/spring-modulith/reference/appendix.html#schemas) in the appendix.

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.serialization)Event Serializer

Each log entry contains the original event in serialized form. The `EventSerializer` abstraction contained in `spring-modulith-events-core` allows plugging different strategies for how to turn the event instances into a format suitable for the datastore. Spring Modulith provides a Jackson-based JSON implementation through the `spring-modulith-events-jackson` artifact, which registers a `JacksonEventSerializer` consuming an `ObjectMapper` through standard Spring Boot auto-configuration by default.

### [](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry.customize-publication-date)Customizing the Event Publication Date

By default, the Event Publication Registry will use the date returned by the `Clock.systemUTC()` as event publication date. If you want to customize this, register a bean of type clock with the application context:

```java
@Configuration
class MyConfiguration {

  @Bean
  Clock myCustomClock() {
    return … // Your custom Clock instance created here.
  }
}
```

## [](https://docs.spring.io/spring-modulith/reference/events.html#externalization)Externalizing Events

|   |   |
|---|---|
||The following section describes the Spring Modulith-native event externalization that is based on a asynchronous event listener. While this is a pragmatic, simple solution, it lacks critical features developers might expect from actual outbox pattern implementations. Spring Modulith 2.1 introduced support event externalization through the [Namastack Outbox](https://outbox.namastack.io/) and [JobRunr](http://jobrunr.io/). See the corresponding section ([Namastack](https://docs.spring.io/spring-modulith/reference/events.html#externalization.namastack), [JobRunr](https://docs.spring.io/spring-modulith/reference/events.html#externalization.jobrunr)) of the docs for details.|

Some of the events exchanged between application modules might be interesting to external systems. Spring Modulith allows publishing selected events to a variety of message brokers. To use that support you need to take the following steps:

1. Add the [broker-specific Spring Modulith artifact](https://docs.spring.io/spring-modulith/reference/events.html#externalization.infrastructure) to your project.
    
2. Select event types to be externalized by annotating them with either Spring Modulith’s or jMolecules' `@Externalized` annotation.
    
3. Specify the broker-specific routing target in the annotation’s value.
    

To find out how to use other ways of selecting events for externalization, or customize their routing within the broker, check out [Fundamentals of Event Externalization](https://docs.spring.io/spring-modulith/reference/events.html#externalization.fundamentals).

### [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.infrastructure)Supported Infrastructure

|Broker|Artifact|Description|
|---|---|---|
|Kafka|`spring-modulith-events-kafka`|Uses Spring Kafka for the interaction with the broker. The logical routing key will be used as Kafka’s topic and message key.|
|AMQP|`spring-modulith-events-amqp`|Uses Spring AMQP for the interaction with any compatible broker. Requires an explicit dependency declaration for Spring Rabbit for example. The logical routing key will be used as AMQP routing key.|
|JMS|`spring-modulith-events-jms`|Uses Spring’s core JMS support. Does not support routing keys.|
|Spring Messaging|`spring-modulith-events-messaging`|Uses Spring’s core `Message` and `MessageChannel` support. Resolves the target `MessageChannel` by its bean name given the `target` in the `Externalized` annotation. Forwards routing information as a header - called `springModulith_routingTarget` - to be processed in whatever way by downstream components, typically in a Spring Integration `IntegrationFlow`.|

### [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.fundamentals)Fundamentals of Event Externalization

Spring Modulith’s event externalization is implemented as [transactional event listener](https://docs.spring.io/spring-modulith/reference/events.html#aml) delegating to broker specific publication implementations. That means that Spring Modulith’s [Event Publication Registry](https://docs.spring.io/spring-modulith/reference/events.html#publication-registry) guards the externalization against failures during the interaction with the broker so that the publications can be resubmitted through the APIs provided.

The event externalization performs three steps on each application event published.

1. _Determining whether the event is supposed to be externalized_ — We refer to this as “event selection”. By default, only event types located within a Spring Boot auto-configuration package and annotated with one of the supported `@Externalized` annotations are selected for externalization.
    
2. _Preparing the message (optional)_ — By default, the event is serialized as is by the corresponding broker infrastructure. An optional mapping step allows developers to customize or even completely replace the original event with a payload suitable for external parties. For Kafka and AMQP, developers can also add headers to the message to be published.
    
3. _Determining a routing target_ — Message broker clients need a logical target to publish the message to. The target usually identifies physical infrastructure (a topic, exchange, or queue depending on the broker) and is often statically derived from the event type. Unless defined in the `@Externalized` annotation specifically, Spring Modulith uses the application-local type name as target. In other words, in a Spring Boot application with a base package of `com.acme.app`, an event type `com.acme.app.sample.SampleEvent` would get published to `sample.SampleEvent`.
    
    Some brokers also allow to define a rather dynamic routing key, that is used for different purposes within the actual target. By default, no routing key is used.
    

### [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.annotations)Annotation-based Event Externalization Configuration

To define a custom routing key via the `@Externalized` annotations, a pattern of `$target::$key` can be used for the target/value attribute available in each of the particular annotations. Both the target and key can be a SpEL expression which will get the event instance configured as root object.

Defining a dynamic routing key via SpEL expression

- Java
    
- Kotlin
    

```java
@Externalized("customer-created::#{#this.getLastname()}") 
class CustomerCreated {

  String getLastname() { 
    // …
  }
}
```

The `CustomerCreated` event exposes the last name of the customer via an accessor method. That method is then used via the `#this.getLastname()` expression in key expression following the `::` delimiter of the target declaration.

If the key calculation becomes more involved, it is advisable to rather delegate that into a Spring bean that takes the event as argument:

Invoking a Spring bean to calculate a routing key

- Java
    
- Kotlin
    

```java
@Externalized("…::#{@beanName.someMethod(#this)}")
```

### [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.api)Programmatic Event Externalization Configuration

The `spring-modulith-events-api` artifact contains `EventExternalizationConfiguration` that allows developers to customize all of the above mentioned steps.

Programmatically configuring event externalization

- Java
    
- Kotlin
    

```java
@Configuration
class ExternalizationConfiguration {

  @Bean
  EventExternalizationConfiguration eventExternalizationConfiguration() {

    return EventExternalizationConfiguration.externalizing()                 
      .select(EventExternalizationConfiguration.annotatedAsExternalized())   
      .mapping(SomeEvent.class, event -> …)                                  
      .headers(event -> …)                                                   
      .routeKey(WithKeyProperty.class, WithKeyProperty::getKey)              
      .build();
  }
}
```

|   |   |
|---|---|
||We start by creating a default instance of `EventExternalizationConfiguration`.|
||We customize the event selection by calling one of the `select(…)` methods on the `Selector` instance returned by the previous call. This step fundamentally disables the application base package filter as we only look for the annotation now. Convenience methods to easily select events by type, by packages, packages and annotation exist. Also, a shortcut to define selection and routing in one step.|
||We define a mapping step for `SomeEvent` instances. Note that the routing will still be determined by the original event instance, unless you additionally call `….routeMapped()` on the router.|
||We add custom headers to the message to be sent out either generally as shown or specific to a certain payload type.|
||We finally determine a routing key by defining a method handle to extract a value of the event instance. Alternatively, a full `RoutingKey` can be produced for individual events by using the general `route(…)` method on the `Router` instance returned from the previous call.|

## [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.serialization)Serializing Event Externalization

Spring Modulith’s event externalization is implemented as transactional event listener. This means that multiple threads might trigger the interaction with the broker at the same time. This can become particularly relevant when event publications are resubmitted. As the broker might see a sudden spike in interactions, some interactions might take a bit longer so that the externalization of later events might overtake former ones.

To prevent that, the interaction with the broker can be serialized so that only one event is sent out at a time by setting the `spring.modulith.events.externalization.serialize-externalization` property to `true`.

## [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.namastack)Namastack Outbox Support

If advanced outbox features are required, the event externalization can be delegated to the [Namastack Outbox](https://outbox.namastack.io/). This feature is currently only availble for relational databases. To activate the feature, start by adding the Spring Modulith Namastack starter to your project:

Declaring the Spring Modulith Namastack starter

- Maven
    
- Gradle
    

```none
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-starter-namastack'
}
```

To automatically delegate event externalization to Namastack, switch the `spring.modulith.events.externalization.mode` property to `outbox`. For more information on how to customize the way that the Namastack Outbox works in general, consult the Namastack [reference documentation](https://outbox.namastack.io/). Find an [example](https://github.com/spring-projects/spring-modulith/tree/main/spring-modulith-examples/spring-modulith-example-outbox) in our Github repository.

## [](https://docs.spring.io/spring-modulith/reference/events.html#externalization.jobrunr)JobRunr Outbox Support

Similar to the [Namastack support](https://docs.spring.io/spring-modulith/reference/events.html#externalization.namastack) to externalize events we provide support for [JobRunr](http://jobrunr.io/). To activate the feature, start by adding the Spring Modulith JobRunr starter to your project:

Declaring the Spring Modulith JobRunr starter

- Maven
    
- Gradle
    

```none
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-starter-jobrunr'
}
```

To automatically delegate event externalization to JobRunr, switch the `spring.modulith.events.externalization.mode` property to `outbox`. For more information on how to JobRunr please consult its [reference documentation](https://www.jobrunr.io/en/documentation/). Find an [example](https://github.com/spring-projects/spring-modulith/tree/main/spring-modulith-examples/spring-modulith-example-outbox) in our Github repository.

## [](https://docs.spring.io/spring-modulith/reference/events.html#testing)Testing published events

|   |   |
|---|---|
||The following section describes a testing approach solely focused on tracking Spring application events. For a more holistic approach on testing modules that use [`@ApplicationModuleListener`](https://docs.spring.io/spring-modulith/reference/testing.html), please check out the [`Scenario` API](https://docs.spring.io/spring-modulith/reference/testing.html#scenarios).|

Spring Modulith’s `@ApplicationModuleTest` enables the ability to get a `PublishedEvents` instance injected into the test method to verify a particular set of events has been published during the course of the business operation under test.

Event-based integration testing of the application module arrangement

- Java
    
- Kotlin
    

```java
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  void someTestMethod(PublishedEvents events) {

    // …
    var matchingMapped = events.ofType(OrderCompleted.class)
      .matching(OrderCompleted::getOrderId, reference.getId());

    assertThat(matchingMapped).hasSize(1);
  }
}
```

Note how `PublishedEvents` exposes an API to select events matching a certain criteria. The verification is concluded by an AssertJ assertion that verifies the number of elements expected. If you are using AssertJ for those assertions anyway, you can also use `AssertablePublishedEvents` as test method parameter type and use the fluent assertion APIs provided through that.

Using `AssertablePublishedEvents` to verify event publications

- Java
    
- Kotlin
    

```java
@ApplicationModuleTest
class OrderIntegrationTests {

  @Test
  void someTestMethod(AssertablePublishedEvents events) {

    // …
    assertThat(events)
      .contains(OrderCompleted.class)
      .matching(OrderCompleted::getOrderId, reference.getId());
  }
}
```

Note how the type returned by the `assertThat(…)` expression allows to define constraints on the published events directly.

[Verifying Application Module Structure](https://docs.spring.io/spring-modulith/reference/verification.html)