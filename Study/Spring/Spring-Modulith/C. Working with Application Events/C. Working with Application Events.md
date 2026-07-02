---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/events.html
prev: "[[B. Verifying Application Module Structure]]"
next: "[[1. 애플리케이션 이벤트로 작업하기]]"
---

# Working with Application Events

Spring Modulith에서 애플리케이션 모듈은 가능한 한 직접 의존하지 않고 이벤트 발행과 소비로 통합하는 것이 좋아요. 이 장은 이벤트 기반 모듈 통합, 안정적인 이벤트 처리, 외부 메시지 브로커 연동, 발행 이벤트 테스트를 다뤄요.

## 문서 목록

1. [[1. 애플리케이션 이벤트로 작업하기]]
2. [[2. Application Module Listener]]
3. [[3. Event Publication Registry]]
4. [[4. Externalizing Events]]
5. [[5. Testing Published Events]]

## 흐름 요약

|주제|핵심|
|---|---|
|애플리케이션 이벤트|모듈 간 직접 호출을 줄이고 도메인 이벤트로 통합해요.|
|`@ApplicationModuleListener`|비동기 트랜잭션 이벤트 리스너 구성을 간단히 선언해요.|
|Event Publication Registry|리스너 실행 실패나 재시도를 추적할 수 있도록 이벤트 발행 로그를 관리해요.|
|Externalizing Events|선택한 이벤트를 Kafka, AMQP, JMS 같은 외부 인프라로 내보내요.|
|Testing Published Events|`PublishedEvents`와 `AssertablePublishedEvents`로 테스트 중 발행된 이벤트를 검증해요.|
