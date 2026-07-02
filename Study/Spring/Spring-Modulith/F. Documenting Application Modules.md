---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/documentation.html
prev: "[[E. Moments - a Passage of Time Events API]]"
next: "[[G. Spring Modulith Runtime Support]]"
---
# 애플리케이션 모듈 문서화

`ApplicationModules`로 만든 애플리케이션 모듈 모델은 Asciidoc으로 작성하는 개발자 문서에 포함할 문서 조각을 생성하는 데 사용할 수 있어요. Spring Modulith의 `Documenter` 추상화는 두 종류의 문서 조각을 만들 수 있어요.

- 개별 애플리케이션 모듈 사이의 관계를 설명하는 C4 및 UML 컴포넌트 다이어그램

- 이른바 _Application Module Canvas_ 라고 부르는 표 형태의 개요. 모듈과 그 안의 주요 요소, 즉 Spring Bean, Aggregate Root, 발행하거나 수신하는 이벤트, 설정 프로퍼티를 보여줘요.

추가로 `Documenter`는 기존의 모든 컴포넌트 다이어그램과 Canvas를 포함하는 집계 Asciidoc 파일도 만들 수 있어요.

## 애플리케이션 모듈 컴포넌트 다이어그램 생성

문서 조각은 `ApplicationModules` 인스턴스를 `Documenter`에 넘겨 생성할 수 있어요.

`Documenter`를 사용해 애플리케이션 모듈 컴포넌트 다이어그램 생성하기

- Java

- Kotlin

```java
class DocumentationTests {

  ApplicationModules modules = ApplicationModules.of(Application.class);

  @Test
  void writeDocumentationSnippets() {

    new Documenter(modules)
      .writeModulesAsPlantUml()
      .writeIndividualModulesAsPlantUml();
  }
}
```

`Documenter`에 대한 첫 번째 호출은 시스템 안의 모든 모듈을 포함하는 C4 컴포넌트 다이어그램을 생성해요.

![All modules and their relationships rendered as C4 component diagram](https://docs.spring.io/spring-modulith/reference/modulith/_images/c4-all-modules-7a9abd84f1dc3ca7573f11b9e1bb966a730e8f95.svg)

Figure 1. 모든 모듈과 그 관계를 C4 컴포넌트 다이어그램으로 렌더링한 모습

두 번째 호출은 개별 모듈과 그 모듈이 직접 의존하는 모듈만 포함하는 추가 다이어그램을 생성해요.

![A subset of application modules and their relationships starting from the order module rendered as C4 component diagram](https://docs.spring.io/spring-modulith/reference/modulith/_images/c4-individual-modules-d0ac046b1c7ca34fb72edf7b8dd43502ed9384ed.svg)

Figure 2. `order` 모듈에서 시작하는 애플리케이션 모듈 일부와 그 관계를 C4 컴포넌트 다이어그램으로 렌더링한 모습

### 전통적인 UML 컴포넌트 다이어그램 사용

전통적인 UML 스타일의 컴포넌트 다이어그램을 선호한다면, 다음처럼 `DiagramOptions`를 조정해 해당 스타일을 사용하게 할 수 있어요.

- Java

- Kotlin

```java
DiagramOptions.defaults()
  .withStyle(DiagramStyle.UML);
```

그러면 다이어그램은 다음과 같은 모습이 돼요.

![All modules and their relationships rendered as UML component diagram](https://docs.spring.io/spring-modulith/reference/modulith/_images/uml-all-modules-8d88e2c5d56063b7e4a931d7964ad0ff57db1f6b.svg)

Figure 3. 모든 모듈과 그 관계를 UML 컴포넌트 다이어그램으로 렌더링한 모습

![A subset of application modules and their relationships starting from the order module rendered as UML component diagram](https://docs.spring.io/spring-modulith/reference/modulith/_images/uml-individiual-module-611802716c1915f699d48490eb6176990306d043.svg)

Figure 4. `order` 모듈에서 시작하는 애플리케이션 모듈 일부와 그 관계를 UML 컴포넌트 다이어그램으로 렌더링한 모습

## 애플리케이션 모듈 Canvas 생성

Application Module Canvas는 `Documenter.writeModuleCanvases()`를 호출해 생성할 수 있어요.

`Documenter`를 사용해 애플리케이션 모듈 Canvas 생성하기

- Java

- Kotlin

```java
class DocumentationTests {

  ApplicationModules modules = ApplicationModules.of(Application.class);

  @Test
  void writeDocumentationSnippets() {

    new Documenter(modules)
      .writeModuleCanvases();
  }
}
```

기본적으로 문서는 빌드 시스템의 빌드 폴더 아래 `spring-modulith-docs` 폴더에 생성돼요. 생성된 Canvas는 다음과 같아요.

Table 1. Application Module Canvas 예시

|   |   |
|---|---|
|Base package|`com.acme.commerce.inventory`|
|Spring components|_Services_<br><br>- `c.a.c.i.InventoryManagement`<br>    <br><br>_Repositories_<br><br>- `c.a.c.i.Inventory`<br>    <br><br>_Event listeners_<br><br>- `c.a.c.i.InternalInventoryListeners` listening to `o.s.m.m.DayHasPassed`, `c.a.c.i.QuantityReduced`<br>    <br>- `c.a.c.i.InventoryOrderEventListener` listening to `c.a.c.o.OrderCanceled`, `c.a.c.o.OrderCompleted`<br>    <br><br>_Configuration properties_<br><br>- `c.a.c.i.InventoryProperties`<br>    <br><br>_Others_<br><br>- `c.a.c.i.InventoryItemCreationListener`|
|Aggregate roots|- `c.a.c.i.InventoryItem`|
|Published events|- `c.a.c.i.QuantityReduced` created by:<br>    <br>    - `c.a.c.i.InventoryItem.decreaseQuantity(…)`<br>        <br>    <br>- `c.a.c.i.StockShort` created by:<br>    <br>    - `c.a.c.i.InternalInventoryListeners.on(…)`|
|Events listened to|- `c.a.c.o.OrderCompleted`<br>    <br>- `c.a.c.o.OrderCanceled`|
|Properties|- `acme.commerce.inventory.restock-threshold` - `c.a.c.c.Quantity`. 재고 업데이트 중 `InventoryEvents.StockShort`가 트리거되어야 하는 임계값이에요.|

이 Canvas는 다음 섹션으로 구성돼요.

- _애플리케이션 모듈의 베이스 패키지_

- _애플리케이션 모듈이 노출하는 Spring Bean을 stereotype별로 그룹화한 목록_ - 즉, API 패키지나 [[3. Named Interfaces|named interface package]] 안에 있는 Bean이에요. 여기서는 [[jMolecules Architecture Abstractions|jMolecules architecture abstractions]]가 정의한 컴포넌트 stereotype뿐 아니라 표준 Spring stereotype 애너테이션도 감지해요.

- _노출된 Aggregate Root_ - Repository가 발견되는 엔티티이거나 jMolecules를 통해 Aggregate로 명시적으로 선언된 타입이에요.

- _모듈이 발행하는 애플리케이션 이벤트_ - 이 이벤트 타입은 jMolecules `@DomainEvent`로 표시되어 있거나 `DomainEvent` 인터페이스를 구현해야 해요.

- _모듈이 수신하는 애플리케이션 이벤트_ - Spring의 `@EventListener`, `@TransactionalEventListener`, jMolecules의 `@DomainEventHandler`가 붙은 메서드나 `ApplicationListener`를 구현한 Bean에서 도출돼요.

- _설정 프로퍼티_ - 애플리케이션 모듈이 노출하는 Spring Boot Configuration Properties예요. 프로퍼티에 붙은 메타데이터를 추출하려면 `spring-boot-configuration-processor` 아티팩트를 사용해야 해요.

## 집계 문서 생성

`Documenter.writeDocumentation(…)`를 사용하면 생성된 모든 다이어그램과 Application Module Canvas를 링크하는 `all-docs.adoc` 파일이 만들어져요. 집계 문서는 `Documenter.writeAggregatingDocument()`를 호출해 수동으로 생성할 수도 있어요.

`Documenter`를 사용해 집계 문서 생성하기

- Java

- Kotlin

```java
class DocumentationTests {

  ApplicationModules modules = ApplicationModules.of(Application.class);

  @Test
  void writeDocumentationSnippets() {

    new Documenter(modules)
        .writeAggregatingDocument();
  }
}
```

집계 문서는 기존의 애플리케이션 모듈 컴포넌트 다이어그램과 애플리케이션 모듈 Canvas를 모두 포함해요. 아무것도 없다면 이 메서드는 출력 파일을 만들지 않아요.
