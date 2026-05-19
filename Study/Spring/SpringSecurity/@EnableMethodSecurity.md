[SpringSecurity - MethodSecurity](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)

*메서드 단위 보안을 설정하기 위해 스프링 시큐리티 기능을 활성화하는 애노테이션*

### 언제 필요할까?
공식 문서를 참고하면 메서드 인가 지원은 다음과 같은 경우에 유용해요.
- 세분화된 인가 로직이 필요할 때
- 서비스 레이어에서 보안을 강제하고 싶을 때
- 스타일 측면에서 `HttpSecurity` 기반 설정보다 애노테이션 기반 설정을 선호할 때

## Case 1. 세분화된 인가 로직
- 일반적인 `HttpSecurity` 기반 설정
```kotlin
http.authorizeHttpRequests {
    it.requestMatchers("/admin/**").hasRole("ADMIN")
}
```
- `/admin/**` 패턴과 일치하는 경우 `ADMIN` 권한이 있는지 확인해요.

하지만 게시물 수정 기능을 예로 들어볼게요. 인가 조건이 "`ADMIN`이거나 게시글 작성자 본인만 수정 가능"이라면, `URL`만으로는 판단하기 어렵습니다.

이럴 때 반환값을 기반으로 인가를 설정할 수도 있어요.
예를 들어, 응답값에 민감 정보가 포함된 객체가 있다고 가정해 볼게요.

```kotlin
fun getUser(userId: Long): User
```

```kotlin
@PostAuthorize(
    "returnObject.id == authentication.principal.id"
)
fun getUser(userId: Long): User
```

## Case 2. 서비스 레이어에서 보안 강제
삭제 컨트롤러가 있고, 해당 컨트롤러 계층에서만 보안을 적용했다고 해볼게요.
```kotlin
@RestController
class PostController(
    private val postService: PostService
) {

    @PreAuthorize("hasRole('USER')")
    @DeleteMapping("/{id}")
    fun delete(@PathVariable id: Long) {
        postService.delete(id)
    }
}
```

만약 `postService.delete(id)`가 다른 곳에서 호출된다면, 권한이 없는 사용자가 데이터를 삭제할 수도 있게 돼요.
특히 배치 서비스나 비동기 기능 등에서 의도치 않은 사이드 이펙트를 발생시킬 가능성이 높습니다.

## Case 3. 애노테이션 기반 선호
이건 스타일 차이에 가까워요.

먼저 `HttpSecurity`에서 설정하는 방식입니다.

```kotlin
http.authorizeHttpRequests {
    it.requestMatchers(HttpMethod.POST, "/themes")
        .hasRole("ADMIN")
}
```

권한 규칙이 한곳에 집중되어 있어 관리가 쉽다는 장점이 있어요.
하지만 엔드포인트가 많아지면 코드가 매우 길어질 수 있습니다.

다음은 애노테이션 방식입니다.
```kotlin
@PreAuthorize("hasRole('ADMIN')")
fun createTheme() {}
```
이 방식은 권한 규칙이 메서드와 함께 있어서 코드를 이해하기 쉽다는 장점이 있어요.
반면, 권한 정책이 이곳저곳에 분산된다는 단점도 있습니다.


# 적용 방법
적용 방법은 간단해요.
```plainText
As already mentioned, you begin by adding @EnableMethodSecurity to a @Configuration class or <sec:method-security/> in a Spring XML configuration file.
```
공식 문서에 언급된 것처럼 `@Configuration` 클래스에 `@EnableMethodSecurity`를 추가해주면 돼요.

```kotlin
@Configuration  
@EnableWebSecurity  
@EnableMethodSecurity(  
    securedEnabled = true,  
    jsr250Enabled = true  
)  
class SecurityConfig() { ... }
```

이렇게 설정하면 메서드 보안 애노테이션이 적용된 객체는 `Spring AOP` 기술을 기반으로 프록시 객체가 생성되어 대체돼요.
프록시 방식의 특성상 클래스 내부에서 메서드를 호출할 때는 프록시 객체를 거치지 않고 실제 객체를 직접 호출하게 되므로, 이 점을 반드시 유의해야 합니다.

## 추가 내용
*`securedEnabled`와 `jsr250Enabled` 옵션*
`@EnableMethodSecurity`는 기본적으로 `@PreAuthorize`, `@PostAuthorize`, `@PreFilter`, `@PostFilter`를 활성화해요. 하지만 상황에 따라 다른 애노테이션이 필요할 때 아래 옵션들을 사용합니다.

- **`securedEnabled = true`**
	- 스프링 시큐리티의 전통적인 애노테이션인 `@Secured`를 활성화해요.
	```kotlin
	@Secured("ROLE_ADMIN")
	fun deleteUser() { ... }
	```
	- 매우 직관적이고 사용하기 쉽지만, `SpEL`을 지원하지 않기 때문에 복잡한 조건(예: 본인 확인 로직 등)을 작성하기에는 한계가 있어요.

- **`jsr250Enabled = true`**
	- 자바 표준 보안 애노테이션인 **JSR-250** 애노테이션(`@RolesAllowed`, `@PermitAll`, `@DenyAll`)을 활성화해요.
	```kotlin
	@RolesAllowed("USER")
	fun getDashboard() { ... }
	```
	- 스프링 시큐리티에 종속되지 않는 표준 기술을 사용하고 싶을 때 유용해요. 다만 `@Secured`와 마찬가지로 `SpEL`을 사용할 수 없다는 점을 유의해야 해요.

보통은 `SpEL`의 강력한 기능을 활용할 수 있는 `@PreAuthorize` 방식을 주로 사용하지만, 기존 레거시 코드와의 호환성이나 표준 준수가 필요한 상황에서 이 옵션들을 활용하게 돼요.
