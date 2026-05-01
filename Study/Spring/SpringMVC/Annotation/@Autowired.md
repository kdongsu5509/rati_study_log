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
**기본 예제**
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
- 스프링 4.3 이후로는 생성자가 하나일 때 `Autowired` 생략 가능.

**생성자 주입의 장점**
- 장점 1: final 키워드 → 불변성 보장
- 장점 2: 테스트 시 Mock 객체 쉽게 주입
- 장점 3: 순환 참조를 컴파일 타임에 감지 가능
- 장점 4: 모든 의존성이 생성자에 명시 → 가독성 향상
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
}
```

**테스트 시의 이점**
-> 굳이 `Mock` 를 안써도(즉, 테스트용 객체를 별도로 주입할 때에도) 편리함.
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

#### 2. 필드 주입 (Field Injection)

**기본 예제**
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

**단점과 주의사항**
1. `final` 키워드 사용 불가 -> 가변 상태
2. 테스트 시 `reflection` 사용하여야 함.
3. 순환 참조를 컴파일 단계에서 찾을 수 없음 -> 런타임에서 발견 가능
4. 의존성이 숨겨져 있음 -> 가독성 저하

**언제 사용하나?**
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

#### 3. 세터 주입 (Setter Injection)

**기본 예제**
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

##### 적절한 사용 예시
**선택적 의존성에 사용**
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

**재설정 가능한 의존성**
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

#### 4. 일반 메서드 주입 (Method Injection)
##### 적합한 사용 시기

**복잡한 초기화가 필요한 경우**
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

**여러 메서드에 주입**
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



## `@Autowired` 의 속성

### 1. required 속성
- 기본값 : `true`
	- 반드시 기본값이 `true` 인 `@Autowired` 는 최대 한 개만 존재하여야 함.
	- 아래 예제에서 `emailSender` 가 없으면 실행 불가 -> `NoSuchBeanDefinitionException` 발생

**required 옵션 `false` 사용 예제**
- 필요한 `Bean` 이 없어도 구동 가능.
- 의존성 관련 작업 전 `Null` 를 명시적으로 확인하여야 함.
	- `Optional` 타입으로 의존성을 주입하면 확인을 강제함.
	- `Spring` 5 이상에서부터는 `@Nullable` 를 사용할 수도 있음.
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

**Optional 타입 사용**
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

**@Nullable 사용 (Spring 5.0+)**
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

**생성자가 여러 개일 때**
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

### 2. 컬렉션 주입

**List 주입**
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

**Map 주입**
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

**배열 주입**
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

### 3. 순서 지정 (@Order)
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

##### Case1. 같은 타입의 빈이 여러 개일 때
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

#####  Case2. 생성자에서 @Qualifier 사용
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

##### Case3. 커스텀 Qualifier 어노테이션
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

#### 1. BeanPostProcessor / BeanFactoryPostProcessor에는 사용 불가
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