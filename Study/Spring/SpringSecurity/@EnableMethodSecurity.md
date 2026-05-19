# @EnableMethodSecurity

> [Spring Security 공식 문서 - Method Security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)

`@EnableMethodSecurity`는 스프링 시큐리티에서 **메서드 단위의 인가(Authorization)** 기능을 활성화할 때 사용하는 애노테이션이에요. 기존의 `@EnableGlobalMethodSecurity`를 대체하며, 더 유연한 보안 설정을 지원해요.

---

## 1. 언제 필요할까?

메서드 보안은 다음과 같은 상황에서 주로 활용돼요.

1.  **세분화된 인가 로직**: URL 패턴만으로는 판단하기 어려운 복잡한 비즈니스 규칙이 있을 때 유용해요.
2.  **서비스 레이어 보안**: 웹 계층을 넘어 서비스 계층에서도 보안을 강제하여 데이터 무결성을 높이고 싶을 때 사용해요.
3.  **애노테이션 기반 설정**: 보안 정책을 비즈니스 로직 바로 옆에 두어 코드의 가독성을 높이고 싶을 때 선택해요.

---

## 2. 주요 활용 사례

### Case 1. 복잡하고 세분화된 인가 로직
일반적인 `HttpSecurity` 설정은 URL 패턴을 기반으로 해요.
```kotlin
http.authorizeHttpRequests {
    it.requestMatchers("/admin/**").hasRole("ADMIN")
}
```
하지만 **"게시글 수정은 ADMIN이거나 작성자 본인만 가능하다"**와 같은 조건은 URL만으로 처리하기 어렵습니다. 이때 `@PostAuthorize` 등을 활용하면 객체 상태에 따라 인가를 결정할 수 있어요.

```kotlin
@PostAuthorize("returnObject.ownerId == authentication.principal.id or hasRole('ADMIN')")
fun getSensitiveData(id: Long): Data { ... }
```

### Case 2. 서비스 레이어에서의 보안 강제
컨트롤러에서만 보안을 체크하면, 서비스 메서드가 다른 경로(배치, 메시지 리스너 등)에서 호출될 때 보안 사각지대가 생길 수 있어요.
```kotlin
@Service
class PostService {
    @PreAuthorize("hasRole('USER')")
    fun deletePost(id: Long) { ... }
}
```
서비스 레이어에 직접 보안을 설정하면 어떤 경로로 호출되더라도 인가된 사용자만 접근하도록 제한할 수 있어요.

### Case 3. 가독성과 유지보수성
`HttpSecurity`는 정책을 한눈에 보기 좋지만, 프로젝트가 커지면 설정 코드가 길어지는 단점이 있어요. 애노테이션 방식은 메서드 정의와 보안 규칙이 함께 있어 로직을 이해하기 수월해요.

---

## 3. 적용 방법

설정 클래스(`@Configuration`)에 애노테이션을 추가해서 활성화해요.

```kotlin
@Configuration  
@EnableWebSecurity  
@EnableMethodSecurity(  
    securedEnabled = true, // @Secured 활성화
    jsr250Enabled = true   // JSR-250 (@RolesAllowed 등) 활성화
)  
class SecurityConfig { ... }
```

### ⚠️ 주의사항: Spring AOP와 Proxy
메서드 보안은 **Spring AOP(프록시 방식)**를 기반으로 동작해요. 
> **중요**: 프록시 방식의 특성상, 같은 클래스 내부에서 다른 메서드를 호출할 때는 보안 체크가 적용되지 않아요. 반드시 외부에서 호출되는 진입점에 애노테이션을 사용해야 합니다.

---

## 4. 설정 옵션 상세

기본적으로 `@PreAuthorize`, `@PostAuthorize`, `@PreFilter`, `@PostFilter`는 바로 사용할 수 있어요. 추가로 다음 옵션들을 통해 다른 애노테이션도 지원해요.

### securedEnabled = true
스프링 시큐리티의 전통적인 애노테이션인 **`@Secured`**를 활성화해요.
```kotlin
@Secured("ROLE_ADMIN")
fun deleteUser() { ... }
```
- **특징**: 설정이 단순하고 직관적이지만, SpEL(Spring Expression Language)을 지원하지 않아 복잡한 로직을 구현하기에는 한계가 있어요.

### jsr250Enabled = true
자바 표준 보안 애노테이션인 **JSR-250**(`@RolesAllowed`, `@PermitAll` 등)을 활성화해요.
```kotlin
@RolesAllowed("USER")
fun getDashboard() { ... }
```
- **특징**: 프레임워크에 종속되지 않는 표준 기술을 사용할 수 있어요. 다만 `@Secured`와 마찬가지로 SpEL은 사용할 수 없습니다.

---

## 요약
보통은 SpEL을 지원하여 가장 유연한 **`@PreAuthorize`**를 주로 사용해요. 하지만 기존 코드와의 호환성이나 표준 준수가 필요한 상황이라면 `securedEnabled`나 `jsr250Enabled` 옵션을 활용하면 돼요.
