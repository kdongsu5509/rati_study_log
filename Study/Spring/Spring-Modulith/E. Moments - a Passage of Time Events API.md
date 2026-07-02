---
version: 2.1.0
tags:
  - spring-modulith
updatedAt: 2026-07-02
url: https://docs.spring.io/spring-modulith/reference/moments.html
prev: "[[D. Integration Testing Application Modules]]"
next: "[[F. Documenting Application Modules]]"
---
# Moments - 시간 경과 이벤트 API

`spring-modulith-moments`는 [[Patterns for Decoupling in Distributed Systems - Passage of Time Event|Matthias Verraes의 글]]에서 많은 영감을 받은 Passage of Time Events 구현체예요. 특정 시간이 지났다는 사실에 연결된 동작을 트리거하기 위해 시간을 이벤트 기반으로 다루는 접근 방식이에요.

이 추상화를 사용하려면 프로젝트에 다음 의존성을 추가해요.

```none
dependencies {
  implementation 'org.springframework.modulith:spring-modulith-moments'
}
```

프로젝트 classpath에 이 의존성이 추가되면 애플리케이션에서 다음 기능을 사용할 수 있어요.

- 애플리케이션 코드는 Spring event listener에서 `HourHasPassed`, `DayHasPassed`, `WeekHasPassed`, `MonthHasPassed`, `QuarterHasPassed`, `YearHasPassed` 타입을 참조해 특정 시간 단위가 지났을 때 알림을 받을 수 있어요.
- `org.springframework.modulith.Moments` 타입의 bean이 `ApplicationContext`에 등록돼요. 이 bean은 시간 경과 이벤트를 트리거하는 로직을 담고 있어요.
- `spring.modulith.moments.enable-time-machine`이 `true`로 설정되어 있으면 해당 인스턴스는 `org.springframework.modulith.TimeMachine`이 돼요. `TimeMachine`은 시간을 앞으로 "이동"시키고 그 사이에 발생해야 하는 모든 중간 이벤트를 트리거할 수 있어요. 시간 경과 이벤트로 동작하는 기능을 통합 테스트할 때 유용해요.

기본적으로 Moments는 `Clock.systemUTC()` 인스턴스를 사용해요. 이를 커스터마이징하려면 `Clock` 타입 bean을 선언하면 돼요.

```java
@Configuration
class MyConfiguration {

  @Bean
  Clock myCustomClock() {
    // Create a custom Clock here
  }
}
```

Moments는 고급 커스터마이징을 위해 다음 애플리케이션 프로퍼티를 제공해요.

Table 1. 사용할 수 있는 애플리케이션 프로퍼티

| Property | Default value | Description |
|---|---|---|
| `spring.modulith.moments.enable-time-machine` | false | `true`로 설정하면 `Moments` 인스턴스가 시간을 앞으로 이동시키는 API를 노출하는 `TimeMachine`이 돼요. Passage of Time Events로 트리거되는 기능을 기대하는 통합 테스트에 유용해요. |
| `spring.modulith.moments.granularity` | hours | 발행할 이벤트의 최소 granularity예요. 시간 단위 이벤트를 피하려면 대체 값으로 `days`를 사용할 수 있어요. |
| `spring.modulith.moments.locale` | `Locale.getDefault()` | 주 경계를 판단할 때 사용할 `Locale`이에요. |
| `spring.modulith.moments.quarter-start-month` | `Months.JANUARY` | 분기가 시작되는 월이에요. |
| `spring.modulith.moments.zone-id` | `ZoneOffset#UTC` | 발행되는 이벤트에 연결할 시간을 판단하는 `ZoneId`예요. |

Moments는 “정해진 스케줄을 직접 호출한다”기보다 “시간이 지났다는 도메인 이벤트를 발행한다”는 관점에 가까워요. 그래서 월말 정산, 주간 리포트, 분기별 상태 갱신처럼 시간 경과에 반응하는 기능을 다른 모듈과 느슨하게 연결하기 좋아요.
