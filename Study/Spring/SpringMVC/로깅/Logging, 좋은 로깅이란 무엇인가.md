다음 글 : [[Slf4J + Logback]]
`server` 에서 오류가 발생했다. 무엇을 보고 원인을 추적할 것인가?

## 로그 발전 시키기

### v0 : 아주 손쉽게 로그 남기는 방법

- `System.out.println` 를 사용하기

```java
public class RunningService {
	public void order(String userId, Long productId, int quantity) {
		System.out.println("주문 시작: userId=" + userId + ", productId=" + productId);
	}
}
```

**해당 방식의 문제점**

- 추적 혹은 재현이 불가능하다.
    - 이 로그가 언제 찍혔는가?
    - 어느 스레드에서 찍혔는가?
    - 어느 클래스의 어느 메서드 몇 번째 라인에서 찍혔는가?
    - 이 요청은 어떤 요청 ID/트래킹 ID에 속하는가? — 동시에 들어온 다른 주문 (100건) 과 구분할 수 있나?
- 정보의 과다
    - `주문 시작` 과 같은 정보 -> 단순 운영 정보
    - `오류 발생` 과 같은 정보 -> 운영 시 중요한 추적 정보
    - 두 가지 타입을 분리해서 볼 수 없음.
- `System.out.println` 의 성능 문제가 존재
    - `System.out.println` -> 동기적 로직
        - 내부적으로 `synchronized` 락까지 사용

---

### v1. 정보 줄이기 -> Level 도입
우선, 필요한 정보만을 출력할 수 있도록 하자.
`로그` 는 결국 잘 찾을 수 있어야 하는데, `DEBUG` ~ `ERROR` 가 뒤섞여 있으면 찾기 어렵지 않겠는가?
특히, 이것이 배포된 서버라면...??

상상만 해도 별로다. 그러니, 우선 필요한 정보만을 차후에 필터링 할 수 있도록 로그에 `Level` 를 도입하자.

```java
public enum LogLevel {
    DEBUG,   // 개발 중 상세 정보
    INFO,    // 일반 운영 정보
    WARN,    // 경고 (잠재적 문제)
    ERROR    // 오류 (즉시 대응 필요)
}
```

```java
public class SimpleLogger {
    private LogLevel currentLevel = LogLevel.INFO;
    
    public void log(LogLevel level, String message) {
        if (level.ordinal() >= currentLevel.ordinal()) {
            System.out.println("[" + level + "] " + message);
        }
    }
    
    public void debug(String message) { log(LogLevel.DEBUG, message); }
    public void info(String message) { log(LogLevel.INFO, message); }
    public void warn(String message) { log(LogLevel.WARN, message); }
    public void error(String message) { log(LogLevel.ERROR, message); }
}
```

**사용 예시**

```java
public class OrderService {
    private SimpleLogger logger = new SimpleLogger();
    
    public void order(String userId, Long productId, int quantity) {
        logger.info("주문 시작: userId=" + userId);
        logger.debug("상세 파라미터: productId=" + productId + ", quantity=" + quantity);
        
        try {
            processOrder(userId, productId, quantity);
            logger.info("주문 완료");
        } catch (Exception e) {
            logger.error("주문 실패: " + e.getMessage());
        }
    }
}
```

**개선점**
- 중요도에 따라 로그 필터링 가능
- 운영 환경에서는 INFO 이상만 출력 → 불필요한 DEBUG 로그 제거

**문제점**
- 이 로그는 어느 코드에서, 언제, 왜 터진것인지에 대한 분석이 불가능하다.

### v2. 메타 데이터 추가하기
```java
public class EnhancedLogger {
    private LogLevel currentLevel = LogLevel.INFO;
    
    public void log(LogLevel level, String message) {
        if (level.ordinal() >= currentLevel.ordinal()) {
            String timestamp = LocalDateTime.now().format(
                DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
            );
            String threadName = Thread.currentThread().getName();
            String className = getCallerClassName();
            
            String formatted = String.format(
                "%s [%s] [%s] %s - %s",
                timestamp, level, threadName, className, message
            );
            System.out.println(formatted);
        }
    }
    
    private String getCallerClassName() {
        StackTraceElement[] stackTrace = Thread.currentThread().getStackTrace();
        // stackTrace[0]: getStackTrace
        // stackTrace[1]: getCallerClassName
        // stackTrace[2]: log
        // stackTrace[3]: 실제 호출한 클래스
        if (stackTrace.length > 3) {
            return stackTrace[3].getClassName() + "." + 
                   stackTrace[3].getMethodName() + ":" + 
                   stackTrace[3].getLineNumber();
        }
        return "Unknown";
    }
}
```

**출력 예시**

```
2024-05-02 14:23:45.123 [INFO] [http-nio-8080-exec-1] com.example.OrderService.order:15 - 주문 시작: userId=user123
2024-05-02 14:23:45.456 [ERROR] [http-nio-8080-exec-1] com.example.OrderService.order:20 - 주문 실패: 재고 부족
```

**개선점**
- 언제, 어디서, 어느 스레드에서 발생했는지 추적 가능
- 동일 시간대 여러 요청을 스레드 이름으로 구분 가능

**문제점**
- 만약 당신이 특정 패키지에 대한 로그를 집중적으로 보고 싶을 때, 가능할까? 
	- `order` 에서 오류를 자세히 보고 싶은데, 현재 상태에서는 모든 곳에서 오류가 상세히 찍힌다.

### v3. 정보, 패키지 단위로 관리하기
```java
public class LoggerFactory {
    private static final Map<String, EnhancedLogger> loggers = new ConcurrentHashMap<>();
    private static final Map<String, LogLevel> packageLevels = new ConcurrentHashMap<>();
    
    static {
        // 패키지별 로그 레벨 설정
        packageLevels.put("com.example.order", LogLevel.DEBUG);
        packageLevels.put("com.example.payment", LogLevel.INFO);
        packageLevels.put("com.example.external", LogLevel.WARN);
    }
    
    public static EnhancedLogger getLogger(Class<?> clazz) {
        String className = clazz.getName();
        return loggers.computeIfAbsent(className, k -> {
            LogLevel level = determineLogLevel(className);
            return new EnhancedLogger(className, level);
        });
    }
    
    private static LogLevel determineLogLevel(String className) {
        // 가장 구체적인 패키지부터 찾기
        for (String packageName : packageLevels.keySet()) {
            if (className.startsWith(packageName)) {
                return packageLevels.get(packageName);
            }
        }
        return LogLevel.INFO; // 기본값
    }
}
```

**사용 예시**
```java
public class OrderService {
    private static final EnhancedLogger logger = LoggerFactory.getLogger(OrderService.class);
    
    public void order(String userId, Long productId, int quantity) {
        logger.debug("주문 상세: userId=" + userId + ", productId=" + productId);
        logger.info("주문 처리 중");
    }
}

public class ExternalApiService {
    private static final EnhancedLogger logger = LoggerFactory.getLogger(ExternalApiService.class);
    
    public void callApi() {
        logger.debug("API 호출 시작"); // WARN 레벨이므로 출력 안 됨
        logger.warn("API 응답 지연");  // 출력됨
    }
}
```

**개선점**
- 패키지/모듈별로 다른 로그 레벨 적용 가능
- 외부 API 호출 모듈은 WARN 이상만, 핵심 비즈니스는 DEBUG까지 상세히
- 설정 파일로 분리하면 재배포 없이 로그 레벨 조정 가능

### v4. 다양한 로그 출력 관리 -> Appender

로그를 콘솔에만 출력하는 것이 아니라, 파일, 데이터베이스, 외부 모니터링 시스템 등 다양한 곳으로 전송해야 한다.
그렇지 않으면, 배포된 지 오래될 수록, 요청이 많이 올 수록 많이 쌓인 로그를 오로지 `콘솔` 에서만 찾을 수 있다. 이것이 과연 옳은가?
```java
public interface LogAppender {
    void append(String formattedMessage);
}

public class ConsoleAppender implements LogAppender {
    @Override
    public void append(String formattedMessage) {
        System.out.println(formattedMessage);
    }
}

public class FileAppender implements LogAppender {
    private final String filePath;
    private final BufferedWriter writer;
    
    public FileAppender(String filePath) throws IOException {
        this.filePath = filePath;
        this.writer = new BufferedWriter(new FileWriter(filePath, true));
    }
    
    @Override
    public void append(String formattedMessage) {
        try {
            writer.write(formattedMessage);
            writer.newLine();
            writer.flush();
        } catch (IOException e) {
            System.err.println("파일 쓰기 실패: " + e.getMessage());
        }
    }
}

public class RollingFileAppender implements LogAppender {
    private final String baseFilePath;
    private final long maxFileSize; // bytes
    private FileAppender currentAppender;
    private long currentSize = 0;
    
    public RollingFileAppender(String baseFilePath, long maxFileSizeMB) throws IOException {
        this.baseFilePath = baseFilePath;
        this.maxFileSize = maxFileSizeMB * 1024 * 1024;
        this.currentAppender = new FileAppender(getCurrentFileName());
    }
    
    @Override
    public void append(String formattedMessage) {
        if (currentSize >= maxFileSize) {
            rollFile();
        }
        currentAppender.append(formattedMessage);
        currentSize += formattedMessage.getBytes().length;
    }
    
    private void rollFile() {
        try {
            String timestamp = LocalDateTime.now().format(
                DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")
            );
            String newFileName = baseFilePath + "." + timestamp + ".log";
            currentAppender = new FileAppender(newFileName);
            currentSize = 0;
        } catch (IOException e) {
            System.err.println("로그 파일 롤링 실패: " + e.getMessage());
        }
    }
    
    private String getCurrentFileName() {
        return baseFilePath + ".log";
    }
}
```

**개선된 Logger**
```java
public class AdvancedLogger {
    private final String name;
    private final LogLevel level;
    private final List<LogAppender> appenders = new ArrayList<>();
    
    public AdvancedLogger(String name, LogLevel level) {
        this.name = name;
        this.level = level;
    }
    
    public void addAppender(LogAppender appender) {
        appenders.add(appender);
    }
    
    public void log(LogLevel logLevel, String message) {
        if (logLevel.ordinal() >= level.ordinal()) {
            String formatted = formatMessage(logLevel, message);
            for (LogAppender appender : appenders) {
                appender.append(formatted);
            }
        }
    }
    
    private String formatMessage(LogLevel level, String message) {
        String timestamp = LocalDateTime.now().format(
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
        );
        String threadName = Thread.currentThread().getName();
        
        return String.format("%s [%s] [%s] %s - %s",
            timestamp, level, threadName, name, message
        );
    }
}
```

**사용 예시**
```java
public class Application {
    public static void main(String[] args) throws IOException {
        AdvancedLogger logger = new AdvancedLogger("com.example.OrderService", LogLevel.INFO);
        
        // 여러 Appender 추가
        logger.addAppender(new ConsoleAppender());
        logger.addAppender(new FileAppender("/var/log/app.log"));
        logger.addAppender(new RollingFileAppender("/var/log/app", 10)); // 10MB
        
        logger.info("애플리케이션 시작");
        logger.error("치명적 오류 발생");
    }
}
```

**개선점**

- 로그를 동시에 여러 곳으로 전송 가능
- 파일 크기 제한으로 디스크 용량 관리
- Appender만 교체하면 다양한 출력 방식 지원 (Kafka, Elasticsearch, CloudWatch 등)


아직, 남은 문제가 많다,
- `System.out.println` 의 동기적 처리 문제.

그러나, 생각을 해보자. 나만 이렇게 불편할까?

선배 개발자 분들이 좋은 것들을 이미 만들어두셨다. 이제 이것들에 대해 알아보자.
[[Slf4J + Logback]]