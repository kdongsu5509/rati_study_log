[SpringSecurity - MethodSecurity](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html)

*메서드 단위 보안을 설정하기 위해 스프링 시큐리티 기능을 활성화 하는 애노테이션*

### 언제 필요할까?
위에 언급된 공식 문서를 참고하면 메서드 인가 지원은 다음과 같은 경우에 유용하다고 해요.
- 세분화된 인가 로직
- 서비스 레이어에서 보안을 강제할 때.
- 스타일 측면에서 `HttpSecurity` 기반 설정보다 애노테이션 기반 설정을 선호할 때.

## Case1. 세분화된 인가 로직
- 일반적인 `HttpSecurity` 기반 설정
```kotlin
http.authorizeHttpRequests {
    it.requestMatchers("/admin/**").hasRole("ADMIN")
}
```
- `/admin/**` 이라는 패턴에 일치하는 경우 `Admin` 권한이 있는 지 확인.

그러나 게시물 수정 같은 것이 있다고 가정을 해봅시다. 해당 컨트롤러의 인가 조건이 " `ADMIN` 이거나 게시글 작성자 본인만 수정 가능" 이라고 하면, `URL` 만으로는 판단하기 어려워요.

추가로, 반환값을 기반으로 인가를 설정할 수도 있어요.
예를 들어, 민감 정보가 포함된 객체가 응답값에 포함된다고 가정해볼게요.

```kotlin
fun getUser(userId: Long): User
```

```kotlin
@PostAuthorize(
    "returnObject.id == authentication.principal.id"
)
fun getUser(userId: Long): User
```

## Case2. 서비스 레이어에서 보안 강제
삭제 컨트롤러가 있고 해당 컨틀롤러 계층에서만 보안을 적용해볼게요.
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

이 경우 `postService.delete(id)` 가 다른 곳에서 호출되는 경우, 허락하지 않은 사용자로 인한 데이터 삭제가 가능하게 되요.
특히, 배치 서비스, 비동기 기능 등에서 의도치 않은 사이드 이펙트를 발생시킬 가능성이 높아요.

## Case3. Annotation 기반 선호
이건 단순한 스타일 차이에 가까워요.

우선 `HttpSecurity` 에서 설정하는 것을 볼게요.

```kotlin
http.authorizeHttpRequests {
    it.requestMatchers(HttpMethod.POST, "/themes")
        .hasRole("ADMIN")
}
```

해당 로직에 권한 규칙이 집중되어 있어요. 그렇기 때문에 관리가 쉬운 장점이 있어요.
그러나, 엔드포인트가 많아지면 매우 길어질 수 있어요.


그 다음, Annotation 방식이에요
```kotlin
@PreAuthorize("hasRole('ADMIN')")
fun createTheme() {}
```
해당 방식의 장점은 권한 규칙이 함께 있어서 이해가 쉽다는 점이 있어요.
그러나, 권한 정책이 분산되어 있다는 단점도 함께 가지고 있어요.


# 적용 방법
적용 방법은 간단해요
```plainText
As already mentioned, you begin by adding `@EnableMethodSecurity` to a `@Configuration` class or `<sec:method-security/>` in a Spring XML configuration file.
```
공식 문서에 언급된 것처럼 `@Configuration` 를 사용하고 있는 설정 파일에 `@EnableMethodSecurity` 을 추가로 부착해주면 되요.

```kotlin
@Configuration  
@EnableWebSecurity  
@EnableMethodSecurity(  
    securedEnabled = true,  
    jsr250Enabled = true  
)  
class SecurityConfig(){...}
```

