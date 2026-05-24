[스프링 Docs - ReflectionTestUtils](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/test/util/ReflectionTestUtils.html)

스프링 프레임워크가 제공하는 단위 테스트(Unit Test) 및 통합 테스트(Integration Test) 시나리오에서 사용할 수 있는 **리플렉션 기반의 유틸리티 클래스**에요.

---

# 1. 언제 사용하나요? (3가지 주요 상황)

스프링 프레임워크(JPA, Spring DI 등)는 `private` 영역을 적극적으로 활용해요. 
이 때문에 스프링의 기능을 배제하는 단위 테스트에서 `ReflectionTestUtils`가 유용하다고 해요.

### A. JPA / Hibernate (ORM 프레임워크)
- **상황:** 도메인 엔티티의 무분별한 상태 변경을 막기 위해 `public Setter` 사용을 지양하고 캡슐화를 유지해요.
- **해결 방안:** 스프링이나 DB 없이 순수 단위 테스트를 할 때, 엔티티에 **가짜 ID 값이나 특정 필드 값을 강제로 심어주기 위해** 사용해요.

### B. 스프링 의존성 주입 (`@Autowired`, `@Inject`)
- **상황:** 스프링 컨텍스트를 띄우지 않는 가벼운 단위 테스트에서는 의존성이 자동 주입되지 않고 `null` 상태가 돼요.
- **해결 방안:** 생성자 주입이 불가능한 레거시 코드 등에서 **`private` 필드에 가짜(Mock) 객체를 강제로 꽂아 넣기 위해** 사용해요.

### C. 수명 주기 콜백 (`@PostConstruct`, `@PreDestroy`)
- **상황:** 빈(Bean)이 초기화되거나 소멸할 때 작동하는 메서드로, 보통 외부에서 임의로 호출할 수 없도록 `private` 구조를 가져요.
- **해결 방안:** 스프링 컨텍스트 없이 순수 단위 테스트 환경에서 **초기화/소멸 로직을 강제로 트리거(호출)하여 검증하기 위해** 사용해요.

---

# 2. 주요 제어 기능 및 사용 예시

일반적인 인스턴스(객체) 레벨의 제어뿐만 아니라, **클래스 레벨의 `static`(정적) 영역**에 대한 제어도 폭넓게 지원해요.

### A. 인스턴스 필드 값 강제 주입 (`setField`)
가장 많이 쓰이는 기능이에요. JPA 엔티티를 단위 테스트할 때 영속성 컨텍스트를 거치지 않고 강제로 DB ID를 부여할 때 유용해요.

**[예시] JPA 엔티티에 ID 강제 할당 (Kotlin)**
```kotlin
val user = User(name = "홍길동") // id는 private이고 setter가 없는 상황

// user 객체의 "id" 필드에 강제로 1L 값을 주입
ReflectionTestUtils.setField(user, "id", 1L)

assertThat(user.id).isEqualTo(1L)
```

### B. 인스턴스 필드 값 읽기 (`getField`)
`private`으로 꽁꽁 숨겨져 있는 필드의 상태를 직접 꺼내어 검증해야 할 때 사용해요.

**[예시] 숨겨진 필드 값 검증 (Kotlin)**
```kotlin
val service = MyService()

// service 내부의 private 상태값을 강제로 꺼내서 검증
val secretValue = ReflectionTestUtils.getField(service, "secretKey") as String

assertThat(secretValue).isEqualTo("expected_key")
```

### C. 인스턴스 메서드 강제 호출 (`invokeMethod`)
접근 제어자가 `private`인 생명주기 메서드나 내부 검증 로직을 직접 실행해보고 싶을 때 사용해요.

**[예시] `@PostConstruct` 메서드 수동 트리거 (Kotlin)**
```kotlin
val myComponent = MyComponent()

// private init() 메서드를 밖에서 강제로 호출
ReflectionTestUtils.invokeMethod(myComponent, "init")
```

### D. 정적(Static) 필드 및 메서드 제어
인스턴스가 아닌 정적 영역도 동일한 방식으로 제어할 수 있어요.

- **`setField(Class, String, Object)`**: static 필드 값 강제 변경
- **`getField(Class, String)`**: static 필드 값 읽기
- **`invokeMethod(Class, String, Object...)`**: static 메서드 강제 실행

**[예시] Static 필드 조작 (Kotlin)**
```kotlin
// AppConfig 클래스의 static 상수 "API_URL"을 테스트용 URL로 강제 변경
ReflectionTestUtils.setField(AppConfig::class.java, "API_URL", "http://localhost:8080/test")
```

---

> [!WARNING] 사용 시 주의사항
> `ReflectionTestUtils`는 어디까지나 **테스트를 위한 최후의 보루**로 사용해야 해요. 
> 객체 지향의 캡슐화를 강제로 깨뜨리기 때문에, 가급적 생성자 주입이나 `public` 인터페이스를 활용한 정석적인 테스트를 우선적으로 고려하여야 해요.