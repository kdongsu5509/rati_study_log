# @WebMvcTest 완벽 가이드

## 개요
- `@WebMvcTest` : **Spring MVC 컨트롤러 계층만을 테스트**하기 위한 어노테이션

### 핵심 개념
- **슬라이스 테스트(Slice Test)**: 전체 애플리케이션이 아닌 특정 계층만 로드하여 테스트
	- **MVC 집중**: 웹 계층(컨트롤러, 요청/응답 처리)에만 집중
	- **빠른 테스트**: 필요한 빈만 로드하므로 `@SpringBootTest`보다 훨씬 빠름

### 사용
- 컨트롤러의 HTTP 요청/응답 처리를 테스트할 때
- URL 매핑, 파라미터 바인딩, 검증 로직을 확인할 때
- MockMvc를 사용한 단위 테스트가 필요할 때

**다음과 같은 경우에서는 부적합**
- 전체 애플리케이션 통합 테스트 → `@SpringBootTest` 사용
- 데이터베이스를 포함한 전체 흐름 테스트 → `@SpringBootTest` + `@AutoConfigureMockMvc`

## 특징
#### 1. MVC 관련 자동 설정만 활성화

#### 📌 스캔되는 어노테이션

- `@Controller`
- `@ControllerAdvice`
- `@JacksonComponent`
- `@JsonComponent` (Jackson 2, deprecated)

#### 📌 자동 포함되는 인터페이스 구현체

- `Converter`
- `DelegatingFilterProxyRegistrationBean`
- `ErrorAttributes`
- `Filter`
- `FilterRegistrationBean`
- `GenericConverter`
- `HandlerInterceptor`
- `HandlerMethodArgumentResolver`
- `HttpMessageConverter`
- `IDialect` (Thymeleaf 사용 시)
- `JacksonModule` (Jackson 사용 시)
- `Module` (Jackson 2, deprecated)
- `SecurityFilterChain`
- `WebMvcConfigurer`
- `WebMvcRegistrations`
- `WebSecurityConfigurer`

### 2. 자동 설정 포함 사항

- **Spring Security**: 자동 설정됨
- **MockMvc**: 자동 구성됨
- **HtmlUnit WebClient**: 지원
- **Selenium WebDriver**: 지원

## 속성(Optional Elements)

### 1. `value` / `controllers`

테스트할 특정 컨트롤러를 지정합니다.

```java
// 모든 컨트롤러 테스트
@WebMvcTest
class AllControllersTest { }

// 특정 컨트롤러만 테스트 (value 사용)
@WebMvcTest(UserController.class)
class UserControllerTest { }

// 특정 컨트롤러만 테스트 (controllers 사용)
@WebMvcTest(controllers = {UserController.class, ProductController.class})
class MultiControllerTest { }
```

### 2. `properties`

테스트 실행 전 Environment에 추가할 프로퍼티를 지정합니다.

```java
@WebMvcTest(
    controllers = ProductController.class,
    properties = {
        "spring.application.name=test-app",
        "app.feature.enabled=true",
        "server.port=9090"
    }
)
class ProductControllerTest {
    @Value("${app.feature.enabled}")
    private boolean featureEnabled;
    
    @Test
    void testWithProperties() {
        assertTrue(featureEnabled);
    }
}
```

### 3. `useDefaultFilters`

기본 필터 사용 여부를 결정합니다.
기본값 : `true`

```java
// 기본 필터 사용
@WebMvcTest(useDefaultFilters = true)
class DefaultFilterTest { }

// 기본 필터 비활성화
@WebMvcTest(
    useDefaultFilters = false,
    includeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = MyCustomController.class
    )
)
class CustomFilterTest { }
```

### 4. `includeFilters`

추가로 포함할 빈을 지정합니다.

```java
@WebMvcTest(
    includeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = {CustomValidator.class, CustomConverter.class}
    )
)
class IncludeFilterTest { }
```

### 5. `excludeFilters`

제외할 빈을 지정합니다.

```java
@WebMvcTest(
    excludeFilters = @ComponentScan.Filter(
        type = FilterType.ASSIGNABLE_TYPE,
        classes = SecurityConfig.class
    )
)
class ExcludeFilterTest { }
```

### 6. `excludeAutoConfiguration`

자동 설정에서 제외할 클래스를 지정합니다.

```java
@WebMvcTest(
    excludeAutoConfiguration = {
        SecurityAutoConfiguration.class,
        UserDetailsServiceAutoConfiguration.class
    }
)
class NoSecurityTest { }
```

---

## 실전 예제

### 예제 1: 기본 컨트롤러 테스트

#### Controller

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {
    
    private final ProductService productService;
    
    public ProductController(ProductService productService) {
        this.productService = productService;
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<ProductDto> getProduct(@PathVariable Long id) {
        ProductDto product = productService.findById(id);
        return ResponseEntity.ok(product);
    }
    
    @PostMapping
    public ResponseEntity<ProductDto> createProduct(@Valid @RequestBody CreateProductRequest request) {
        ProductDto created = productService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

#### Test

```java
@WebMvcTest(ProductController.class)
class ProductControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean  // Service는 Mock으로 주입
    private ProductService productService;
    
    @Test
    @DisplayName("ID로 상품 조회 - 성공")
    void getProduct_Success() throws Exception {
        // Given
        Long productId = 1L;
        ProductDto expectedProduct = new ProductDto(productId, "노트북", 1500000);
        when(productService.findById(productId)).thenReturn(expectedProduct);
        
        // When & Then
        mockMvc.perform(get("/api/products/{id}", productId)
                .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(productId))
                .andExpect(jsonPath("$.name").value("노트북"))
                .andExpect(jsonPath("$.price").value(1500000));
        
        verify(productService).findById(productId);
    }
    
    @Test
    @DisplayName("상품 생성 - 유효성 검증 실패")
    void createProduct_ValidationFail() throws Exception {
        // Given
        String invalidRequest = """
            {
                "name": "",
                "price": -1000
            }
            """;
        
        // When & Then
        mockMvc.perform(post("/api/products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidRequest))
                .andExpect(status().isBadRequest());
    }
}
```

### 예제 2: 여러 컨트롤러 테스트

```java
@WebMvcTest(controllers = {UserController.class, OrderController.class})
class MultiControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private UserService userService;
    
    @MockitoBean
    private OrderService orderService;
    
    @Test
    @DisplayName("사용자 조회 테스트")
    void testUserEndpoint() throws Exception {
        when(userService.findById(1L))
            .thenReturn(new UserDto(1L, "홍길동"));
        
        mockMvc.perform(get("/api/users/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("홍길동"));
    }
    
    @Test
    @DisplayName("주문 조회 테스트")
    void testOrderEndpoint() throws Exception {
        when(orderService.findById(1L))
            .thenReturn(new OrderDto(1L, "ORDER-001"));
        
        mockMvc.perform(get("/api/orders/1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.orderNumber").value("ORDER-001"));
    }
}
```

### 예제 3: ControllerAdvice 테스트

#### Exception Handler

```java
@RestControllerAdvice
public class GlobalExceptionHandler {
    
    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(ResourceNotFoundException ex) {
        ErrorResponse error = new ErrorResponse(
            HttpStatus.NOT_FOUND.value(),
            ex.getMessage(),
            LocalDateTime.now()
        );
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
    }
    
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationErrorResponse> handleValidation(
            MethodArgumentNotValidException ex) {
        
        List<FieldError> fieldErrors = ex.getBindingResult()
            .getFieldErrors()
            .stream()
            .map(error -> new FieldError(
                error.getField(), 
                error.getDefaultMessage()
            ))
            .toList();
        
        ValidationErrorResponse response = new ValidationErrorResponse(
            HttpStatus.BAD_REQUEST.value(),
            "검증 실패",
            fieldErrors,
            LocalDateTime.now()
        );
        
        return ResponseEntity.badRequest().body(response);
    }
}
```

#### Test

```java
@WebMvcTest(ProductController.class)
class ExceptionHandlingTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private ProductService productService;
    
    @Test
    @DisplayName("존재하지 않는 상품 조회 - 404 예외")
    void getProduct_NotFound() throws Exception {
        // Given
        Long nonExistentId = 999L;
        when(productService.findById(nonExistentId))
            .thenThrow(new ResourceNotFoundException("상품을 찾을 수 없습니다."));
        
        // When & Then
        mockMvc.perform(get("/api/products/{id}", nonExistentId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.status").value(404))
                .andExpect(jsonPath("$.message").value("상품을 찾을 수 없습니다."))
                .andExpect(jsonPath("$.timestamp").exists());
    }
    
    @Test
    @DisplayName("유효성 검증 실패 - 400 예외")
    void createProduct_ValidationError() throws Exception {
        // Given
        String invalidProduct = """
            {
                "name": "",
                "price": -100,
                "category": null
            }
            """;
        
        // When & Then
        mockMvc.perform(post("/api/products")
                .contentType(MediaType.APPLICATION_JSON)
                .content(invalidProduct))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.status").value(400))
                .andExpect(jsonPath("$.message").value("검증 실패"))
                .andExpect(jsonPath("$.fieldErrors").isArray())
                .andExpect(jsonPath("$.fieldErrors.length()").value(greaterThan(0)));
    }
}
```

### 예제 4: 파일 업로드 테스트

#### Controller

```java
@RestController
@RequestMapping("/api/files")
public class FileUploadController {
    
    private final FileStorageService fileStorageService;
    
    @PostMapping("/upload")
    public ResponseEntity<UploadResponse> uploadFile(
            @RequestParam("file") MultipartFile file) {
        
        String fileName = fileStorageService.store(file);
        
        UploadResponse response = new UploadResponse(
            fileName,
            file.getSize(),
            file.getContentType()
        );
        
        return ResponseEntity.ok(response);
    }
}
```

#### Test

```java
@WebMvcTest(FileUploadController.class)
class FileUploadControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private FileStorageService fileStorageService;
    
    @Test
    @DisplayName("파일 업로드 - 성공")
    void uploadFile_Success() throws Exception {
        // Given
        String fileName = "test-file.txt";
        String content = "테스트 파일 내용";
        MockMultipartFile file = new MockMultipartFile(
            "file",
            fileName,
            MediaType.TEXT_PLAIN_VALUE,
            content.getBytes()
        );
        
        when(fileStorageService.store(any(MultipartFile.class)))
            .thenReturn(fileName);
        
        // When & Then
        mockMvc.perform(multipart("/api/files/upload")
                .file(file))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fileName").value(fileName))
                .andExpect(jsonPath("$.size").value(content.length()))
                .andExpect(jsonPath("$.contentType").value(MediaType.TEXT_PLAIN_VALUE));
        
        verify(fileStorageService).store(any(MultipartFile.class));
    }
    
    @Test
    @DisplayName("이미지 파일 업로드")
    void uploadImage_Success() throws Exception {
        // Given
        String fileName = "test-image.png";
        MockMultipartFile imageFile = new MockMultipartFile(
            "file",
            fileName,
            MediaType.IMAGE_PNG_VALUE,
            "fake-image-data".getBytes()
        );
        
        when(fileStorageService.store(any())).thenReturn(fileName);
        
        // When & Then
        mockMvc.perform(multipart("/api/files/upload")
                .file(imageFile))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.contentType").value(MediaType.IMAGE_PNG_VALUE));
    }
}
```

### 예제 5: 보안 설정 테스트

#### Security Config

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(csrf -> csrf.disable())
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .httpBasic(Customizer.withDefaults());
        
        return http.build();
    }
}
```

#### Test

```java
@WebMvcTest(AdminController.class)
class SecurityTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private AdminService adminService;
    
    @Test
    @DisplayName("인증 없이 보호된 엔드포인트 접근 - 401")
    void accessProtectedEndpoint_Unauthorized() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
    }
    
    @Test
    @WithMockUser(roles = "USER")
    @DisplayName("일반 사용자로 관리자 엔드포인트 접근 - 403")
    void accessAdminEndpoint_Forbidden() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isForbidden());
    }
    
    @Test
    @WithMockUser(roles = "ADMIN")
    @DisplayName("관리자로 관리자 엔드포인트 접근 - 성공")
    void accessAdminEndpoint_Success() throws Exception {
        // Given
        List<UserDto> users = List.of(
            new UserDto(1L, "user1"),
            new UserDto(2L, "user2")
        );
        when(adminService.getAllUsers()).thenReturn(users);
        
        // When & Then
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(2));
    }
}
```

### 예제 6: 커스텀 Converter 테스트

#### Custom Converter

```java
@Component
public class StringToLocalDateConverter implements Converter<String, LocalDate> {
    
    @Override
    public LocalDate convert(String source) {
        try {
            return LocalDate.parse(source, DateTimeFormatter.ISO_LOCAL_DATE);
        } catch (DateTimeParseException e) {
            throw new IllegalArgumentException("Invalid date format: " + source);
        }
    }
}
```

#### Controller

```java
@RestController
@RequestMapping("/api/events")
public class EventController {
    
    @GetMapping
    public ResponseEntity<List<EventDto>> getEventsByDate(
            @RequestParam("date") LocalDate date) {
        
        // date는 StringToLocalDateConverter에 의해 자동 변환됨
        List<EventDto> events = eventService.findByDate(date);
        return ResponseEntity.ok(events);
    }
}
```

#### Test

```java
@WebMvcTest(EventController.class)
class CustomConverterTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private EventService eventService;
    
    // StringToLocalDateConverter는 자동으로 로드됨
    
    @Test
    @DisplayName("날짜 파라미터 변환 - 성공")
    void testDateConversion_Success() throws Exception {
        // Given
        LocalDate targetDate = LocalDate.of(2024, 5, 1);
        List<EventDto> events = List.of(
            new EventDto(1L, "Spring Boot 세미나", targetDate)
        );
        when(eventService.findByDate(targetDate)).thenReturn(events);
        
        // When & Then
        mockMvc.perform(get("/api/events")
                .param("date", "2024-05-01"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Spring Boot 세미나"));
        
        verify(eventService).findByDate(targetDate);
    }
    
    @Test
    @DisplayName("잘못된 날짜 형식 - 400 에러")
    void testDateConversion_InvalidFormat() throws Exception {
        mockMvc.perform(get("/api/events")
                .param("date", "invalid-date"))
                .andExpect(status().isBadRequest());
    }
}
```

### 예제 7: 페이징 및 정렬 테스트

#### Controller

```java
@RestController
@RequestMapping("/api/products")
public class ProductController {
    
    @GetMapping
    public ResponseEntity<Page<ProductDto>> getProducts(
            @PageableDefault(size = 10, sort = "id") Pageable pageable) {
        
        Page<ProductDto> products = productService.findAll(pageable);
        return ResponseEntity.ok(products);
    }
}
```

#### Test

```java
@WebMvcTest(ProductController.class)
class PagingAndSortingTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private ProductService productService;
    
    @Test
    @DisplayName("페이징 및 정렬 파라미터 테스트")
    void testPagingAndSorting() throws Exception {
        // Given
        Pageable expectedPageable = PageRequest.of(0, 5, Sort.by("name").descending());
        List<ProductDto> products = List.of(
            new ProductDto(1L, "제품A", 10000),
            new ProductDto(2L, "제품B", 20000)
        );
        Page<ProductDto> page = new PageImpl<>(products, expectedPageable, 2);
        
        when(productService.findAll(any(Pageable.class))).thenReturn(page);
        
        // When & Then
        mockMvc.perform(get("/api/products")
                .param("page", "0")
                .param("size", "5")
                .param("sort", "name,desc"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(2))
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.size").value(5))
                .andExpect(jsonPath("$.number").value(0));
        
        verify(productService).findAll(argThat(pageable -> 
            pageable.getPageNumber() == 0 &&
            pageable.getPageSize() == 5 &&
            pageable.getSort().getOrderFor("name") != null &&
            pageable.getSort().getOrderFor("name").isDescending()
        ));
    }
}
```

### 예제 8: 헤더 및 쿠키 테스트

```java
@WebMvcTest(ApiController.class)
class HeaderAndCookieTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockitoBean
    private ApiService apiService;
    
    @Test
    @DisplayName("커스텀 헤더 테스트")
    void testCustomHeader() throws Exception {
        mockMvc.perform(get("/api/data")
                .header("X-API-Key", "test-api-key")
                .header("X-Request-ID", "req-12345"))
                .andExpect(status().isOk())
                .andExpect(header().exists("X-Response-Time"))
                .andExpect(header().string("X-Server", "Spring Boot"));
    }
    
    @Test
    @DisplayName("쿠키 테스트")
    void testCookie() throws Exception {
        mockMvc.perform(get("/api/user/preferences")
                .cookie(new Cookie("sessionId", "abc123"))
                .cookie(new Cookie("theme", "dark")))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("lastVisit"))
                .andExpect(cookie().value("theme", "dark"));
    }
}
```

---

## 모범 사례

### 1. 필요한 컨트롤러만 로드하기

```java
// ✅ 좋은 예: 특정 컨트롤러만 테스트
@WebMvcTest(UserController.class)
class UserControllerTest { }

// ❌ 나쁜 예: 모든 컨트롤러 로드 (불필요하게 느림)
@WebMvcTest
class UserControllerTest { }
```

### 2. MockitoBean을 사용하여 의존성 모킹

```java
@WebMvcTest(OrderController.class)
class OrderControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    // ✅ 서비스 계층은 Mock으로 주입
    @MockitoBean
    private OrderService orderService;
    
    @MockitoBean
    private PaymentService paymentService;
}
```

### 3. 명확한 테스트 이름 사용

```java
// ✅ 좋은 예: 테스트 의도가 명확함
@Test
@DisplayName("존재하지 않는 사용자 조회 시 404 응답")
void getUserById_WhenUserNotFound_Returns404() { }

// ❌ 나쁜 예: 의도가 불명확함
@Test
void test1() { }
```

### 4. Given-When-Then 패턴 사용

```java
@Test
void createOrder_Success() throws Exception {
    // Given: 테스트 준비
    CreateOrderRequest request = new CreateOrderRequest(/* ... */);
    when(orderService.create(any())).thenReturn(new OrderDto(/* ... */));
    
    // When: 실행
    ResultActions result = mockMvc.perform(post("/api/orders")
        .contentType(MediaType.APPLICATION_JSON)
        .content(objectMapper.writeValueAsString(request)));
    
    // Then: 검증
    result.andExpect(status().isCreated())
          .andExpect(jsonPath("$.orderId").exists());
}
```

### 5. 테스트 격리 유지

```java
@WebMvcTest(ProductController.class)
class ProductControllerTest {
    
    @MockitoBean
    private ProductService productService;
    
    @BeforeEach
    void setUp() {
        // 각 테스트 전에 Mock 초기화
        reset(productService);
    }
    
    @Test
    void test1() { /* ... */ }
    
    @Test
    void test2() { /* ... */ }
}
```

---

## 주의사항

### ⚠️ 1. Service, Repository는 자동 로드되지 않음

```java
@WebMvcTest(UserController.class)
class UserControllerTest {
    
    // ❌ 이것은 작동하지 않음 - ProductService는 로드되지 않음
    @Autowired
    private ProductService productService;  // NoSuchBeanDefinitionException
    
    // ✅ 이것을 사용해야 함
    @MockitoBean
    private ProductService productService;
}
```

### ⚠️ 2. 데이터베이스 접근 불가

```java
// ❌ @WebMvcTest는 JPA/데이터베이스를 설정하지 않음
@WebMvcTest
class SomeTest {
    
    @Autowired
    private JpaRepository repository;  // 작동하지 않음!
}

// ✅ 데이터베이스 테스트가 필요하면
@SpringBootTest
@AutoConfigureMockMvc
class IntegrationTest { }
```

### ⚠️ 3. @SpringBootTest와 혼동하지 말기

```java
// @WebMvcTest: 웹 계층만 테스트 (빠름, 단위 테스트)
@WebMvcTest(UserController.class)
class UserControllerTest { }

// @SpringBootTest: 전체 애플리케이션 테스트 (느림, 통합 테스트)
@SpringBootTest
@AutoConfigureMockMvc
class UserIntegrationTest { }
```

### ⚠️ 4. 보안 설정 주의

```java
// Security가 활성화되어 있으면 인증이 필요함
@WebMvcTest(SecureController.class)
class SecureControllerTest {
    
    @Test
    @WithMockUser  // 이 어노테이션 필요!
    void testSecureEndpoint() throws Exception {
        mockMvc.perform(get("/api/secure"))
                .andExpect(status().isOk());
    }
}
```

### ⚠️ 5. @Import로 추가 설정 가능

```java
@WebMvcTest(ProductController.class)
@Import({CustomConfig.class, SecurityConfig.class})  // 필요한 설정 Import
class ProductControllerTest { }
```

---

## 비교표: @WebMvcTest vs @SpringBootTest

|특징|@WebMvcTest|@SpringBootTest|
|---|---|---|
|**로딩 범위**|웹 계층만|전체 애플리케이션|
|**속도**|빠름 ⚡|느림 🐌|
|**MockMvc**|자동 설정|@AutoConfigureMockMvc 필요|
|**Service/Repository**|Mock 필요|실제 빈 사용|
|**데이터베이스**|❌ 사용 불가|✅ 사용 가능|
|**용도**|단위 테스트|통합 테스트|
|**비용**|낮음|높음|

---

## 요약

### 핵심 포인트

1. **`@WebMvcTest`는 웹 계층(컨트롤러)만 테스트하는 슬라이스 테스트**
2. **MockMvc가 자동으로 설정되어 HTTP 요청/응답 테스트 가능**
3. **Service, Repository는 `@MockitoBean`으로 주입**
4. **`@SpringBootTest`보다 빠르고 가벼움**
5. **컨트롤러 단위 테스트에 최적화**

### 언제 사용할까?

- ✅ 컨트롤러의 요청/응답 로직 테스트
- ✅ URL 매핑 검증
- ✅ 파라미터 바인딩 테스트
- ✅ 유효성 검증 테스트
- ✅ 예외 처리 테스트
- ❌ 전체 통합 테스트 (대신 @SpringBootTest 사용)

---

## 추가 학습 자료

### 관련 어노테이션
- `@AutoConfigureMockMvc` - MockMvc 세부 설정
- `@MockitoBean` - Mock 객체 주입
- `@WithMockUser` - 보안 테스트용 인증 사용자
- `@SpringBootTest` - 통합 테스트