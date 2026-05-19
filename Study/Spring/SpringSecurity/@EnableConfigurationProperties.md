# @EnableConfigurationProperties

> [Spring Boot 공식 문서 - Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html)

`@EnableConfigurationProperties`는 `@ConfigurationProperties`가 붙은 클래스를 스프링 빈으로 등록하고 활성화할 때 사용하는 애노테이션이에요.

---

## 1. 다양한 설정 방식과 파일 기반 설정

스프링 부트에서는 설정값을 주입하는 방식이 다양해요. OS 환경 변수나 커맨드 라인 인자 등도 있지만, 주로 `application.properties`나 `application.yml` 같은 **파일 기반 설정**을 많이 사용해요.

파일 기반 설정을 사용하는 이유는 다음과 같아요.
- **버전 관리**: Git 같은 도구로 설정 값의 변화를 추적하기 쉬워요.
- **환경별 분리**: `profile` 기능을 활용해 개발이나 운영 환경에 맞는 설정을 관리하기 편해요.
- **가독성**: YAML 구조 등을 사용하면 설정 간의 계층 구조를 한눈에 파악할 수 있어요.

---

## 2. 파일 기반 설정 사용 방식

파일 기반 설정을 주입받는 방법은 크게 세 가지가 있어요.

### `@Value`
```java
@Component
public class SecurityConfig {
    @Value("${security.whitelist.get}")
    private List<String> getUrls;

    @Value("${security.whitelist.post}")
    private List<String> postUrls;
}
```
별도의 클래스 정의 없이 필요한 값을 바로 가져올 수 있어 간편해요. 하지만 문자열 키를 직접 입력해야 해서 오타가 나도 컴파일 시점에 알기 어렵고, 설정값이 많아지면 관리가 힘들어져요. 또한 타입 변환이나 복잡한 구조를 다루기에 한계가 있어요.

### `@ConfigurationProperties` + `@Component`
```java
@Component
@ConfigurationProperties(prefix = "security")
public class SecurityWhiteList {
    private List<String> getUrls;
    private List<String> postUrls;
    // getter, setter...
}
```
관련된 설정값들을 하나의 객체로 묶어 구조화할 수 있어요. 하지만 설정 객체가 일반 비즈니스 로직 빈들과 섞여 관리가 모호해질 수 있고, 직접 수정할 수 없는 외부 라이브러리 클래스에는 `@Component`를 붙일 수 없다는 제약이 있어요.

### `@ConfigurationProperties` + `@EnableConfigurationProperties`
```java
// 1. 설정 구조체 정의
@ConfigurationProperties(prefix = "security")
public class SecurityWhiteList { ... }

// 2. 필요한 곳에서 활성화
@Configuration
@EnableConfigurationProperties(SecurityWhiteList.class)
public class MyConfig { ... }
```
타입 안전성을 보장하며, 설정 객체는 값만 담고 등록과 활성화는 설정 클래스가 담당하도록 역할을 나눌 수 있어요. 외부 라이브러리의 클래스도 설정 객체로 활용할 수 있어 확장성이 좋아요. 다만 별도의 활성화 과정이 필요하다는 점은 참고해야 해요.

---

## 3. 주요 장점

- **타입 안전성 (Type-Safety)**: 잘못된 데이터 형식이 들어오면 애플리케이션 구동 시점에 에러가 발생해서 문제를 빨리 파악할 수 있어요.
- **모듈화**: 설정 객체와 사용처를 명확히 분리할 수 있고, `@Component` 스캔 범위 밖의 클래스도 빈으로 등록해서 사용할 수 있어요.
- **검증 지원**: `@Validated`와 함께 사용하면 설정값에 대한 제약 조건을 선언적으로 체크할 수 있어요.

---

## 4. 실전 예제

### 1️⃣ 설정 구조체 정의
```java
@ConfigurationProperties(prefix = "security")
public class SecurityWhiteList {
    private List<String> getAllowedUrls;
    private List<String> postAllowedUrls;

    public List<String> getGetAllowedUrls() { return getAllowedUrls; }
    public void setGetAllowedUrls(List<String> getAllowedUrls) { this.getAllowedUrls = getAllowedUrls; }
    public List<String> getPostAllowedUrls() { return postAllowedUrls; }
    public void setPostAllowedUrls(List<String> postAllowedUrls) { this.postAllowedUrls = postAllowedUrls; }
}
```

### 2️⃣ 설정 클래스에서 활성화 및 주입
```java
@Configuration
@EnableWebSecurity
@EnableConfigurationProperties(SecurityWhiteList.class)
public class SecurityConfig {

    private final SecurityWhiteList whiteList;

    public SecurityConfig(SecurityWhiteList whiteList) {
        this.whiteList = whiteList;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(authorize -> authorize
                .requestMatchers(HttpMethod.GET, whiteList.getGetAllowedUrls().toArray(new String[0])).permitAll()
                .requestMatchers(HttpMethod.POST, whiteList.getPostAllowedUrls().toArray(new String[0])).permitAll()
                .anyRequest().authenticated()
            );
        return http.build();
    }
}
```