#### 참고 자료
https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/beans/factory/annotation/Autowired.html

## 개념
- 의존성 주입 `딸깍` 를 위한 애노테이션
	- 필요한 의존성이 `Bean`으로  `Spring Container` 에서 관리되고 있으면 자동으로 주입함.

- 이를 통해 직접 `new` 키워드를 통해 개발자가 관리하지 않아도 되어 편리함 제공.
	- 특히 테스트 시 매우 용이
```java
@Component
public class OrderService {
    @Autowired
    private PaymentService paymentService;
    // Spring이 자동으로 주입 → 낮은 결합도, 테스트 용이
}
```

### 사용할 수 있는 위치
1. **생성자 (Constructor)** 
2. **필드 (Field)**
3. **세터 메서드 (Setter Method)**
4. **일반 설정 메서드 (Config Method)**

#### 1. 생성자 주입 (Constructor Injection)

### 기본 예제

```java
@Component
public class OrderService {
    
    private final PaymentService paymentService;
    private final InventoryService inventoryService;
    
    @Autowired  // 생성자가 하나만 있으면 생략 가능 (Spring 4.3+)
    public OrderService(PaymentService paymentService, 
                       InventoryService inventoryService) {
        this.paymentService = paymentService;
        this.inventoryService = inventoryService;
    }
    
    public void createOrder(Order order) {
        inventoryService.checkStock(order);
        paymentService.process(order);
    }
}
```

### 생성자가 하나면 @Autowired 생략 가능

```java
@Component
public class UserService {
    
    private final UserRepository userRepository;
    
    // @Autowired 생략! Spring이 자동으로 인식
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
}
```

### Lombok과 함께 사용

```java
@Service
@RequiredArgsConstructor  // final 필드에 대한 생성자 자동 생성
public class ProductService {
    
    private final ProductRepository productRepository;
    private final CategoryService categoryService;
    
    // Lombok이 생성자를 만들어주고, Spring이 자동 주입
    
    public Product findById(Long id) {
        return productRepository.findById(id)
            .orElseThrow(() -> new ProductNotFoundException(id));
    }
}
```

### 생성자 주입의 장점

```java
@Service
public class ShoppingCartService {
    
    private final UserService userService;
    private final ProductService productService;
    private final PriceCalculator priceCalculator;
    
    public ShoppingCartService(UserService userService,
                              ProductService productService,
                              PriceCalculator priceCalculator) {
        this.userService = userService;
        this.productService = productService;
        this.priceCalculator = priceCalculator;
    }
    
    // 장점 1: final 키워드 → 불변성 보장
    // 장점 2: 테스트 시 Mock 객체 쉽게 주입
    // 장점 3: 순환 참조를 컴파일 타임에 감지 가능
    // 장점 4: 모든 의존성이 생성자에 명시 → 가독성 향상
}
```

### 테스트 시의 이점

```java
class ShoppingCartServiceTest {
    
    @Test
    void testCalculateTotal() {
        // Mock 객체를 생성자로 쉽게 주입
        UserService mockUserService = mock(UserService.class);
        ProductService mockProductService = mock(ProductService.class);
        PriceCalculator mockCalculator = mock(PriceCalculator.class);
        
        ShoppingCartService service = new ShoppingCartService(
            mockUserService,
            mockProductService,
            mockCalculator
        );
        
        // 테스트 수행...
    }
}
```

---

## 2. 필드 주입 (Field Injection)

### 기본 예제

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    
    @Autowired
    private OrderService orderService;
    
    @Autowired
    private NotificationService notificationService;
    
    @PostMapping
    public ResponseEntity<Order> createOrder(@RequestBody OrderRequest request) {
        Order order = orderService.createOrder(request);
        notificationService.sendConfirmation(order);
        return ResponseEntity.ok(order);
    }
}
```

### 단점과 주의사항

```java
@Service
public class EmailService {
    
    @Autowired
    private EmailSender emailSender;
    
    // 단점 1: final 키워드 사용 불가 → 가변 상태
    // 단점 2: 테스트 시 리플렉션 필요
    // 단점 3: 순환 참조를 런타임에서야 발견
    // 단점 4: 의존성이 숨겨져 있어 가독성 저하
    
    public void sendEmail(String to, String subject, String body) {
        emailSender.send(to, subject, body);
    }
}
```

### 언제 사용하나?

```java
@Configuration
public class AppConfig {
    
    // 설정 클래스의 간단한 유틸리티 빈에는 괜찮음
    @Autowired
    private Environment env;
    
    @Bean
    public DataSource dataSource() {
        return DataSourceBuilder.create()
            .url(env.getProperty("db.url"))
            .username(env.getProperty("db.username"))
            .password(env.getProperty("db.password"))
            .build();
    }
}
```

---

## 3. 세터 주입 (Setter Injection)

### 기본 예제

```java
@Component
public class ReportGenerator {
    
    private TemplateEngine templateEngine;
    private EmailService emailService;
    
    @Autowired
    public void setTemplateEngine(TemplateEngine templateEngine) {
        this.templateEngine = templateEngine;
    }
    
    @Autowired
    public void setEmailService(EmailService emailService) {
        this.emailService = emailService;
    }
    
    public void generateAndSend(Report report) {
        String content = templateEngine.generate(report);
        emailService.send(report.getRecipient(), content);
    }
}
```

### 선택적 의존성에 사용

```java
@Service
public class ProductService {
    
    private ProductRepository productRepository;
    private CacheService cacheService;  // 선택적
    
    @Autowired
    public ProductService(ProductRepository productRepository) {
        this.productRepository = productRepository;
    }
    
    @Autowired(required = false)
    public void setCacheService(CacheService cacheService) {
        this.cacheService = cacheService;
    }
    
    public Product findById(Long id) {
        // 캐시가 있으면 사용, 없으면 DB 직접 조회
        if (cacheService != null) {
            Product cached = cacheService.get("product:" + id);
            if (cached != null) return cached;
        }
        
        return productRepository.findById(id).orElse(null);
    }
}
```

### 재설정 가능한 의존성

```java
@Component
public class DynamicRoutingService {
    
    private RoutingStrategy strategy;
    
    @Autowired
    public void setStrategy(RoutingStrategy strategy) {
        this.strategy = strategy;
    }
    
    // 런타임에 전략 변경 가능
    public void changeStrategy(RoutingStrategy newStrategy) {
        this.strategy = newStrategy;
    }
    
    public Route calculateRoute(Location from, Location to) {
        return strategy.calculate(from, to);
    }
}
```

---

## 4. 일반 메서드 주입 (Method Injection)

### 복잡한 초기화가 필요한 경우

```java
@Component
public class DataProcessor {
    
    private DatabaseService databaseService;
    private ValidationService validationService;
    private LoggingService loggingService;
    
    @Autowired
    public void initializeDependencies(DatabaseService databaseService,
                                      ValidationService validationService,
                                      LoggingService loggingService) {
        this.databaseService = databaseService;
        this.validationService = validationService;
        this.loggingService = loggingService;
        
        // 복잡한 초기화 로직 수행
        loggingService.info("DataProcessor initialized");
        databaseService.warmUpConnections();
    }
    
    public void process(Data data) {
        if (validationService.isValid(data)) {
            databaseService.save(data);
        }
    }
}
```

### 여러 메서드에 주입

```java
@Service
public class OrderProcessor {
    
    private InventoryService inventoryService;
    private PaymentService paymentService;
    private ShippingService shippingService;
    
    @Autowired
    public void setupInventory(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }
    
    @Autowired
    public void setupPayment(PaymentService paymentService) {
        this.paymentService = paymentService;
    }
    
    @Autowired
    public void setupShipping(ShippingService shippingService) {
        this.shippingService = shippingService;
    }
}
```

---

## required 속성

### 기본 동작 (required = true)

```java
@Service
public class NotificationService {
    
    @Autowired  // required = true가 기본값
    private EmailSender emailSender;
    
    // emailSender 빈이 없으면 애플리케이션 구동 실패
    // 예외: NoSuchBeanDefinitionException
}
```

### 선택적 의존성 (required = false)

```java
@Service
public class UserService {
    
    @Autowired(required = false)
    private AuditLogger auditLogger;  // 없어도 null로 설정되고 진행
    
    public void createUser(User user) {
        // null 체크 필수!
        if (auditLogger != null) {
            auditLogger.log("User created: " + user.getId());
        }
        // 핵심 로직 수행
    }
}
```

### Optional 타입 사용 (더 명시적)

```java
@Service
public class ReportService {
    
    @Autowired
    private Optional<CacheService> cacheService;
    
    public Report generateReport(Long id) {
        // Optional API로 안전하게 처리
        cacheService.ifPresent(cache -> 
            cache.evict("report:" + id)
        );
        
        return reportRepository.findById(id)
            .orElseThrow(() -> new ReportNotFoundException(id));
    }
}
```

### @Nullable 사용 (Spring 5.0+)

```java
@Service
public class AnalyticsService {
    
    private MetricsCollector metricsCollector;
    
    @Autowired
    public AnalyticsService(@Nullable MetricsCollector metricsCollector) {
        this.metricsCollector = metricsCollector;
    }
    
    public void trackEvent(String event) {
        if (metricsCollector != null) {
            metricsCollector.track(event);
        }
    }
}
```

### 생성자가 여러 개일 때

```java
@Component
public class ComplexService {
    
    private final DatabaseService databaseService;
    private final CacheService cacheService;
    private final LoggingService loggingService;
    
    // required = true 생성자는 1개만 허용
    @Autowired
    public ComplexService(DatabaseService databaseService,
                         CacheService cacheService,
                         LoggingService loggingService) {
        this.databaseService = databaseService;
        this.cacheService = cacheService;
        this.loggingService = loggingService;
    }
    
    // required = false 생성자는 여러 개 가능
    @Autowired(required = false)
    public ComplexService(DatabaseService databaseService,
                         CacheService cacheService) {
        this(databaseService, cacheService, null);
    }
    
    @Autowired(required = false)
    public ComplexService(DatabaseService databaseService) {
        this(databaseService, null, null);
    }
    
    // Spring이 가장 많은 의존성을 충족할 수 있는 생성자 선택
}
```

---

## 컬렉션 주입

### List 주입

```java
@Service
public class PaymentProcessor {
    
    @Autowired
    private List<PaymentHandler> handlers;
    
    public void processPayment(Payment payment) {
        for (PaymentHandler handler : handlers) {
            if (handler.supports(payment.getType())) {
                handler.process(payment);
                break;
            }
        }
    }
}

// 구현체들
@Component
public class CardPaymentHandler implements PaymentHandler {
    @Override
    public boolean supports(PaymentType type) {
        return type == PaymentType.CARD;
    }
    
    @Override
    public void process(Payment payment) {
        // 카드 결제 처리
    }
}

@Component
public class BankTransferHandler implements PaymentHandler {
    @Override
    public boolean supports(PaymentType type) {
        return type == PaymentType.BANK_TRANSFER;
    }
    
    @Override
    public void process(Payment payment) {
        // 계좌 이체 처리
    }
}
```

### Map 주입

```java
@Service
public class NotificationService {
    
    @Autowired
    private Map<String, NotificationChannel> channels;
    // key = 빈 이름, value = 빈 객체
    
    public void send(String channelName, Notification notification) {
        NotificationChannel channel = channels.get(channelName);
        if (channel != null) {
            channel.send(notification);
        }
    }
    
    public void sendToAll(Notification notification) {
        channels.values().forEach(channel -> 
            channel.send(notification)
        );
    }
}

@Component("email")
public class EmailChannel implements NotificationChannel {
    @Override
    public void send(Notification notification) {
        // 이메일 전송
    }
}

@Component("sms")
public class SmsChannel implements NotificationChannel {
    @Override
    public void send(Notification notification) {
        // SMS 전송
    }
}
```

### 배열 주입

```java
@Configuration
public class FilterConfig {
    
    @Autowired
    private Filter[] filters;
    
    @Bean
    public FilterChain filterChain() {
        FilterChain chain = new FilterChain();
        for (Filter filter : filters) {
            chain.addFilter(filter);
        }
        return chain;
    }
}
```

### 순서 지정 (@Order)

```java
@Component
@Order(1)
public class AuthenticationFilter implements Filter {
    // 첫 번째로 실행
}

@Component
@Order(2)
public class LoggingFilter implements Filter {
    // 두 번째로 실행
}

@Component
@Order(3)
public class ValidationFilter implements Filter {
    // 세 번째로 실행
}

@Service
public class FilterService {
    
    @Autowired
    private List<Filter> filters;  // Order 순서대로 정렬됨
    
    public void applyFilters(Request request) {
        for (Filter filter : filters) {
            filter.doFilter(request);
        }
    }
}
```

---

## @Qualifier와 함께 사용

### 같은 타입의 빈이 여러 개일 때

```java
// 두 개의 DataSource 빈이 있는 경우
@Configuration
public class DataSourceConfig {
    
    @Bean
    @Qualifier("primary")
    public DataSource primaryDataSource() {
        return DataSourceBuilder.create()
            .url("jdbc:mysql://primary-db:3306/mydb")
            .build();
    }
    
    @Bean
    @Qualifier("secondary")
    public DataSource secondaryDataSource() {
        return DataSourceBuilder.create()
            .url("jdbc:mysql://secondary-db:3306/mydb")
            .build();
    }
}

@Service
public class UserService {
    
    @Autowired
    @Qualifier("primary")
    private DataSource primaryDataSource;
    
    @Autowired
    @Qualifier("secondary")
    private DataSource secondaryDataSource;
    
    public void syncData() {
        // primary에서 읽고 secondary에 쓰기
    }
}
```

### 생성자에서 @Qualifier 사용

```java
@Service
public class ReportService {
    
    private final DataSource reportDataSource;
    
    @Autowired
    public ReportService(@Qualifier("reportDB") DataSource dataSource) {
        this.reportDataSource = dataSource;
    }
}
```

### 커스텀 Qualifier 어노테이션

```java
@Target({ElementType.FIELD, ElementType.PARAMETER})
@Retention(RetentionPolicy.RUNTIME)
@Qualifier
public @interface Database {
    DatabaseType value();
}

public enum DatabaseType {
    MASTER, SLAVE, ANALYTICS
}

@Configuration
public class DatabaseConfig {
    
    @Bean
    @Database(DatabaseType.MASTER)
    public DataSource masterDataSource() {
        return DataSourceBuilder.create().build();
    }
    
    @Bean
    @Database(DatabaseType.SLAVE)
    public DataSource slaveDataSource() {
        return DataSourceBuilder.create().build();
    }
}

@Service
public class DataService {
    
    @Autowired
    @Database(DatabaseType.MASTER)
    private DataSource masterDb;
    
    @Autowired
    @Database(DatabaseType.SLAVE)
    private DataSource slaveDb;
}
```

---

## 주의사항

### ⚠️ BeanPostProcessor / BeanFactoryPostProcessor에는 사용 불가

```java
// ❌ 이렇게 하면 안 됨
@Component
public class CustomBeanPostProcessor implements BeanPostProcessor {
    
    @Autowired
    private SomeService someService;  // 주입되지 않음!
    
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // someService는 null
        return bean;
    }
}

// ✅ 대신 이렇게
@Component
public class CustomBeanPostProcessor implements BeanPostProcessor, ApplicationContextAware {
    
    private ApplicationContext applicationContext;
    
    @Override
    public void setApplicationContext(ApplicationContext context) {
        this.applicationContext = context;
    }
    
    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // 필요할 때 직접 조회
        SomeService service = applicationContext.getBean(SomeService.class);
        return bean;
    }
}
```

### ⚠️ 순환 참조 문제

```java
// ❌ 순환 참조 발생
@Service
public class ServiceA {
    @Autowired
    private ServiceB serviceB;
}

@Service
public class ServiceB {
    @Autowired
    private ServiceA serviceA;
}
// → BeanCurrentlyInCreationException 발생

// ✅ 해결 방법 1: 생성자 + @Lazy
@Service
public class ServiceA {
    private final ServiceB serviceB;
    
    public ServiceA(@Lazy ServiceB serviceB) {
        this.serviceB = serviceB;
    }
}

// ✅ 해결 방법 2: 설계 개선
// ServiceA와 ServiceB가 서로 의존한다면 설계를 다시 검토
// 공통 기능을 별도 서비스로 분리하는 것이 좋음
```

### ⚠️ 필드 주입 테스트의 어려움

```java
@Service
public class OrderService {
    @Autowired
    private PaymentService paymentService;  // private 필드
}

// 테스트 시 리플렉션 필요
class OrderServiceTest {
    
    @Test
    void test() throws Exception {
        OrderService service = new OrderService();
        PaymentService mock = mock(PaymentService.class);
        
        // 리플렉션으로 private 필드에 접근
        Field field = OrderService.class.getDeclaredField("paymentService");
        field.setAccessible(true);
        field.set(service, mock);
        
        // 테스트...
    }
}

// ✅ 생성자 주입이라면
@Service
public class OrderService {
    private final PaymentService paymentService;
    
    public OrderService(PaymentService paymentService) {
        this.paymentService = paymentService;
    }
}

class OrderServiceTest {
    
    @Test
    void test() {
        PaymentService mock = mock(PaymentService.class);
        OrderService service = new OrderService(mock);  // 간단!
        
        // 테스트...
    }
}
```

---

## 실전 예제

### 1. REST API 컨트롤러

```java
@RestController
@RequestMapping("/api/v1/products")
public class ProductController {
    
    private final ProductService productService;
    private final CategoryService categoryService;
    
    @Autowired
    public ProductController(ProductService productService,
                           CategoryService categoryService) {
        this.productService = productService;
        this.categoryService = categoryService;
    }
    
    @GetMapping
    public ResponseEntity<Page<Product>> getProducts(
            @RequestParam(required = false) Long categoryId,
            Pageable pageable) {
        
        if (categoryId != null) {
            return ResponseEntity.ok(
                productService.findByCategory(categoryId, pageable)
            );
        }
        return ResponseEntity.ok(productService.findAll(pageable));
    }
    
    @PostMapping
    public ResponseEntity<Product> createProduct(
            @RequestBody @Valid ProductRequest request) {
        
        Product product = productService.create(request);
        return ResponseEntity
            .status(HttpStatus.CREATED)
            .body(product);
    }
}
```

### 2. 멀티 데이터소스 설정

```java
@Configuration
public class MultiDataSourceConfig {
    
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.primary")
    public DataSourceProperties primaryDataSourceProperties() {
        return new DataSourceProperties();
    }
    
    @Bean
    @Primary
    @ConfigurationProperties("spring.datasource.primary.hikari")
    public DataSource primaryDataSource() {
        return primaryDataSourceProperties()
            .initializeDataSourceBuilder()
            .type(HikariDataSource.class)
            .build();
    }
    
    @Bean
    @ConfigurationProperties("spring.datasource.secondary")
    public DataSourceProperties secondaryDataSourceProperties() {
        return new DataSourceProperties();
    }
    
    @Bean
    @ConfigurationProperties("spring.datasource.secondary.hikari")
    public DataSource secondaryDataSource() {
        return secondaryDataSourceProperties()
            .initializeDataSourceBuilder()
            .type(HikariDataSource.class)
            .build();
    }
}

@Service
public class DataMigrationService {
    
    private final JdbcTemplate primaryTemplate;
    private final JdbcTemplate secondaryTemplate;
    
    @Autowired
    public DataMigrationService(
            @Qualifier("primaryDataSource") DataSource primaryDs,
            @Qualifier("secondaryDataSource") DataSource secondaryDs) {
        this.primaryTemplate = new JdbcTemplate(primaryDs);
        this.secondaryTemplate = new JdbcTemplate(secondaryDs);
    }
    
    public void migrateData() {
        List<Map<String, Object>> data = 
            primaryTemplate.queryForList("SELECT * FROM users");
        
        for (Map<String, Object> row : data) {
            secondaryTemplate.update(
                "INSERT INTO users_backup VALUES (?, ?, ?)",
                row.get("id"), row.get("name"), row.get("email")
            );
        }
    }
}
```

### 3. 이벤트 기반 아키텍처

```java
// 이벤트
public class OrderCreatedEvent {
    private final Long orderId;
    private final BigDecimal amount;
    private final String customerEmail;
    
    // constructor, getters
}

// 이벤트 리스너들
@Component
public class EmailNotificationListener {
    
    private final EmailService emailService;
    
    @Autowired
    public EmailNotificationListener(EmailService emailService) {
        this.emailService = emailService;
    }
    
    @EventListener
    public void handleOrderCreated(OrderCreatedEvent event) {
        emailService.sendOrderConfirmation(
            event.getCustomerEmail(),
            event.getOrderId()
        );
    }
}

@Component
public class InventoryUpdateListener {
    
    private final InventoryService inventoryService;
    
    @Autowired
    public InventoryUpdateListener(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }
    
    @EventListener
    @Async
    public void handleOrderCreated(OrderCreatedEvent event) {
        inventoryService.decreaseStock(event.getOrderId());
    }
}

// 이벤트 발행자
@Service
public class OrderService {
    
    private final OrderRepository orderRepository;
    private final ApplicationEventPublisher eventPublisher;
    
    @Autowired
    public OrderService(OrderRepository orderRepository,
                       ApplicationEventPublisher eventPublisher) {
        this.orderRepository = orderRepository;
        this.eventPublisher = eventPublisher;
    }
    
    @Transactional
    public Order createOrder(OrderRequest request) {
        Order order = orderRepository.save(
            Order.fromRequest(request)
        );
        
        // 이벤트 발행
        eventPublisher.publishEvent(
            new OrderCreatedEvent(
                order.getId(),
                order.getAmount(),
                order.getCustomerEmail()
            )
        );
        
        return order;
    }
}
```

### 4. 전략 패턴 구현

```java
// 전략 인터페이스
public interface PricingStrategy {
    BigDecimal calculatePrice(Product product, int quantity);
    boolean supports(CustomerType customerType);
}

// 전략 구현체들
@Component
@Order(1)
public class RetailPricingStrategy implements PricingStrategy {
    
    @Override
    public BigDecimal calculatePrice(Product product, int quantity) {
        return product.getPrice().multiply(BigDecimal.valueOf(quantity));
    }
    
    @Override
    public boolean supports(CustomerType customerType) {
        return customerType == CustomerType.RETAIL;
    }
}

@Component
@Order(2)
public class WholesalePricingStrategy implements PricingStrategy {
    
    @Override
    public BigDecimal calculatePrice(Product product, int quantity) {
        BigDecimal basePrice = product.getPrice()
            .multiply(BigDecimal.valueOf(quantity));
        
        if (quantity >= 100) {
            return basePrice.multiply(BigDecimal.valueOf(0.8)); // 20% 할인
        } else if (quantity >= 50) {
            return basePrice.multiply(BigDecimal.valueOf(0.9)); // 10% 할인
        }
        return basePrice;
    }
    
    @Override
    public boolean supports(CustomerType customerType) {
        return customerType == CustomerType.WHOLESALE;
    }
}

// 전략 사용
@Service
public class PricingService {
    
    private final List<PricingStrategy> strategies;
    
    @Autowired
    public PricingService(List<PricingStrategy> strategies) {
        this.strategies = strategies;
    }
    
    public BigDecimal calculatePrice(Product product, 
                                    int quantity, 
                                    CustomerType customerType) {
        return strategies.stream()
            .filter(strategy -> strategy.supports(customerType))
            .findFirst()
            .map(strategy -> strategy.calculatePrice(product, quantity))
            .orElseThrow(() -> 
                new IllegalArgumentException("No pricing strategy found")
            );
    }
}
```

---

## @Autowired vs @Inject vs @Resource

```java
// 1. @Autowired (Spring)
@Service
public class ServiceA {
    @Autowired
    @Qualifier("serviceB")
    private ServiceB serviceB;
}

// 2. @Inject (JSR-330 표준)
@Service
public class ServiceA {
    @Inject
    @Named("serviceB")
    private ServiceB serviceB;
    // required 옵션 없음
}

// 3. @Resource (JSR-250 표준)
@Service
public class ServiceA {
    @Resource(name = "serviceB")
    private ServiceB serviceB;
    // 이름으로 먼저 찾고, 없으면 타입으로 찾음
}
```

|어노테이션|출처|매칭 방식|required 옵션|
|---|---|---|---|
|`@Autowired`|Spring|타입 우선|✅ 있음|
|`@Inject`|JSR-330|타입 우선|❌ 없음|
|`@Resource`|JSR-250|이름 우선|✅ 있음|

---

## 베스트 프랙티스

### ✅ DO

1. **생성자 주입을 기본으로 사용**

```java
@Service
public class UserService {
    private final UserRepository userRepository;
    
    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }
}
```

2. **의존성은 final로 선언**

```java
private final DependencyService dependency;  // ✅
```

3. **테스트 가능하도록 설계**

```java
// 생성자 주입으로 Mock 주입 용이
public UserService(UserRepository repository) {
    this.repository = repository;
}
```

4. **선택적 의존성은 Optional 사용**

```java
@Autowired
private Optional<CacheService> cacheService;
```

### ❌ DON'T

1. **필드 주입 남발 금지**

```java
@Autowired
private Service1 service1;  // ❌
@Autowired
private Service2 service2;  // ❌
```

2. **순환 참조 만들지 않기**

```java
// ServiceA → ServiceB → ServiceA ❌
```

3. **너무 많은 의존성 주입**

```java
// 생성자 파라미터가 5개 이상이면 클래스 분리 고려
public ComplexService(A a, B b, C c, D d, E e, F f) { }  // ❌
```

---

## 정리

### 핵심 요약

1. `@Autowired`는 Spring 컨테이너가 타입 기준으로 빈을 찾아 자동 주입
2. 생성자 주입을 권장 (불변성, 테스트 용이성)
3. 생성자가 하나면 `@Autowired` 생략 가능 (Spring 4.3+)
4. 같은 타입의 빈이 여러 개면 `@Qualifier` 또는 `List` 주입
5. `required = false` 또는 `Optional`로 선택적 의존성 처리
6. 순환 참조 주의

### 언제 사용하나?

- **생성자 주입**: 대부분의 경우 (권장)
- **세터 주입**: 선택적 의존성, 재설정 가능한 의존성
- **필드 주입**: 테스트용 설정 클래스, 간단한 유틸리티
- **메서드 주입**: 복잡한 초기화 로직이 필요한 경우