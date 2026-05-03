---
title: MDC로 시작하는 로깅 맥락 추적
description: 비즈니스 로직을 오염시키지 않으면서 요청 단위 추적 ID를 로그에 새기는 방법 — 파라미터 전달의 고통에서 출발해 ThreadLocal/MDC, TaskDecorator를 거쳐 중앙 집중형 관측까지의 진화 과정.
tags:
  - spring
  - logging
  - observability
  - mdc
---
[[Logging, 좋은 로깅이란 무엇인가]] 에서도 작성되었듯이,
여러 요청이 동시에 들어오는 웹 서버에서 **"이 로그가 어떤 요청에 속한 건지"** 가 보이지 않으면 장애 대응이 사실상 불가능합니다. 이 글은 그 문제를 어떻게 마주치고, 왜 결국 MDC라는 기술이 필연적으로 등장했는지, 그리고 그 한계를 어떻게 메워나가는지를 단계적으로 학습 후 정리해보았습니다.

## 1단계 — 파라미터로 traceId를 계속 넘기기

가장 쉽게 떠올릴 수 있는 방식은 **요청을 식별하는 ID를 메서드 파라미터로 계속 넘기는 것**입니다.
간단하게 `MVC` 구조라고 해봅시다.
이 경우에는 `Controller` 계층에서 요청을 받을 때 `ID` 를 생성하여, `Service` 계층에서 전달 후, `Service` 계층은 `Repository` 계층에 또 전달을 하는 방식으로 처리할 수 있습니다.
```java
@Slf4J
@RestController
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;

    @PostMapping("/order")
    public OrderResponse create(@RequestParam String itemId) {
        String traceId = UUID.randomUUID().toString();
        log.info("[{}] 주문 요청 수신", traceId);
        return "ok"
    }
}

@Service
@RequiredArgsConstructor
public class OrderService {

    private final InventoryRepository inventoryRepository;

    public void order(String itemId, String traceId) {
        log.info("[{}] 재고 차감 시작", traceId);
        inventoryRepository.decrease(itemId, traceId);
    }
}
```

**해당 방식의 문제점**
- **모든 메서드 시그니처가 오염**됩니다. `traceId`는 비즈니스 도메인과 무관한 횡단 관심사(cross-cutting concern)인데 도메인 코드 한가운데에 들어와 있죠.
	- 이 때문에 코드는 `traceId` 때문에 변경이 발생할 수 있는 위험을 가지게 됩니다.
- 신규 메서드를 만들 때마다 `traceId` 를 빠뜨리지 않았는가 를 신경 써야 합니다.
- 외부 라이브러리 함수에는 강제할 수도 없습니다.

## 2단계 — ThreadLocal 기반의 MDC

서블릿 컨테이너(Tomcat 등)는 **요청 하나당 스레드 하나** 를 할당합니다. 같은 요청 안의 모든 코드는 같은 스레드 위에서 실행되죠. 그렇다면 **스레드에 traceId를 묶어두면** 파라미터로 넘길 필요 없이 어디서든 꺼내 쓸 수 있습니다.

이것이 SLF4J가 제공하는 `MDC`(Mapped Diagnostic Context) 의 본질입니다. 
`MDC` 는 내부적으로 `ThreadLocal<Map<String, String>>` 형태로 구현되어있습니다.

진입 지점에서 `traceId` 를 넣는 방법은 다양하게 있습니다. `Filter` , `Interceptor`  등. 그러나 이번에는 해당 부분에 대한 것은 잠시 미뤄두고, 간단하게 `Controller` 에서 `traceId` 를 주입하는 방식을 선택하여 `MDC` 에 집중해보겠습니다.

```java
@Slf4j  
@RestController  
@RequiredArgsConstructor  
public class OrderController {  
  
    private final OrderService orderService;  
  
    @GetMapping("/order")  
    public String order(@RequestParam String itemId) {  
        String traceId = UUID.randomUUID().toString().substring(0, 8);  
        MDC.put("traceId", traceId);  
  
        try {  
            log.info("주문 요청 시작 - itemId : {}", itemId);  
            orderService.order(itemId);  
            log.info("주문 요청 완료");  
        } finally {  
            MDC.clear();  
        }  
  
        return "ok";  
    }  
}
```

```java
@Slf4j  
@Service  
@RequiredArgsConstructor  
public class OrderService {  
  
    private final InventoryRepository inventoryRepository;  
  
    public void order(String itemId) {  
        log.info("재고 차감 시작");  
        inventoryRepository.decrease(itemId);  
    }  
}
```

**주의 사항**
- Tomcat의 `worker thread`는 **풀에서 재사용**됩니다.
	- 사용 후 `clear()` 하지 않으면 다음 요청이 이전 요청의 traceId를 그대로 들고 시작합니다

**장점**
`MDC` 를 사용함으로써 `Service` 계층은 더 이상 `MDC` 관련 로직을 가지고 있지 않게 되었습니다. 이를 통해 변경의 이유가 오로지 비즈니스 로직의 변경으로 제한되었습니다.

**+참고.** Logback 패턴으로 자동 출력
`logback-spring.xml` 에서 `%X{traceId}` 토큰을 패턴에 박아두면, 모든 로그 라인에 자동으로 traceId가 찍힙니다.
[[Slf4J + Logback]] 을 참고해보면, 더 다양한 방식에 대해 찾아볼 수 있습니다.
```xml
<configuration>
    <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
        <encoder>
            <pattern>
                %d{HH:mm:ss.SSS} [%thread] [traceId=%X{traceId:-N/A}] %-5level %logger{36} - %msg%n
            </pattern>
        </encoder>
    </appender>

    <root level="INFO">
        <appender-ref ref="STDOUT" />
    </root>
</configuration>
```

출력 예시:
```
14:22:01.103 [http-nio-8080-exec-3] [traceId=2f1a-...] INFO  c.e.OrderService - 재고 차감 시작
14:22:01.118 [http-nio-8080-exec-3] [traceId=2f1a-...] INFO  c.e.PaymentClient - PG 호출 응답: 200
```

## 3단계 — 한계 직면: 비동기로 가는 순간 ThreadLocal은 끊긴다

요청을 받은 스레드와 작업을 처리하는 스레드가 같을 때만 MDC가 동작합니다. 
`@Async`, `CompletableFuture`, `ExecutorService.submit()` 등으로 **다른 스레드에 작업을 넘기는 순간 컨텍스트는 단절**됩니다.

이것을 보기 위해 `[[@Async]]` 관련된 설정을 해보겠습니다. 
예를 들어, 주문을 하면, 주문 영수증을 이메일로 발급하는 것을 가정해보죠.

```java
@Slf4J
@Service
@RequiredArgsConstructor
public class NotificationService {

    @Async   // 별도 스레드 풀에서 실행
    public void sendEmailAsync(String to) {
        log.info("이메일 발송 시작 → {}", to);
        // ...
    }
}
```

```java
@Slf4j  
@Service  
@RequiredArgsConstructor  
public class OrderService {  
  
    private final InventoryRepository inventoryRepository;  
    private final NotificationService notificationService;  
  
    public void order(String itemId) {  
        log.info("재고 차감 시작");  
        inventoryRepository.decrease(itemId, traceId);  
        notificationService.sendEmailAsync("user@user.com");  
    }  
}
```

```java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(4);
        exec.setMaxPoolSize(8);
        exec.setThreadNamePrefix("async-");
        exec.initialize();
        return exec;
    }
}
```

호출 결과:
```
14:30:00.001 [http-nio-8080-exec-3] [traceId=abc-123] INFO  c.e.OrderService - 주문 처리 완료
14:30:00.012 [async-1]              [traceId=N/A]     INFO  c.e.NotificationService - 이메일 발송 시작 → user@x.com
```

`async-1` 스레드는 자기만의 ThreadLocal을 가지고, 거기엔 아무것도 없습니다. **traceId가 끊겼습니다.** 동일한 요청에서 발생한 두 로그를 더 이상 한 줄기로 묶을 수 없습니다.

## 4단계 — TaskDecorator로 맥락을 복사

작업을 다른 스레드에 위임하기 직전, **부모 스레드의 MDC 스냅샷을 떠서 자식 스레드에 심는** 훅이 필요합니다. Spring은 이 훅을 `TaskDecorator` 라는 이름으로 제공합니다.

**1. MdcTaskDecorator 구현**
```java
public class MdcTaskDecorator implements TaskDecorator {
    @Override
    public Runnable decorate(Runnable runnable) {
        // 부모 스레드(작업을 제출한 쪽)의 MDC 스냅샷
        Map<String, String> parentContext = MDC.getCopyOfContextMap();

        return () -> {
            // 자식 스레드(실제 실행하는 쪽)에서 복원
            if (parentContext != null) {
                MDC.setContextMap(parentContext);
            }
            try {
                runnable.run();
            } finally {
                MDC.clear();   // 다음 작업을 위해 정리
            }
        };
    }
}
```

**2. Executor에 데코레이터 부착**
```java
@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean
    public Executor taskExecutor() {
        ThreadPoolTaskExecutor exec = new ThreadPoolTaskExecutor();
        exec.setCorePoolSize(4);
        exec.setMaxPoolSize(8);
        exec.setThreadNamePrefix("async-");
        exec.setTaskDecorator(new MdcTaskDecorator());   // 핵심
        exec.initialize();
        return exec;
    }
}
```

이제 다시 같은 호출:
```
14:30:00.001 [http-nio-8080-exec-3] [traceId=abc-123] INFO  c.e.OrderService - 주문 처리 완료
14:30:00.012 [async-1]              [traceId=abc-123] INFO  c.e.NotificationService - 이메일 발송 시작 → user@x.com
```

비동기 경계 너머에서도 traceId가 **이어집니다.** 한 요청이 만든 모든 로그를 다시 하나로 꿰맬 수 있죠.

### CompletableFuture 직접 사용

`@Async`가 아닌 `CompletableFuture.supplyAsync(..., executor)`를 쓸 때도 같은 executor를 주입하면 됩니다. **모든 비동기 진입점이 데코레이터가 부착된 executor 하나로 일원화**되도록 설계하는 게 핵심입니다.

```java
public CompletableFuture<Result> doAsync() {
    return CompletableFuture.supplyAsync(() -> {
        log.info("비동기 작업 진행");   // traceId 살아있음
        return compute();
    }, taskExecutor);                 // ← 데코레이터가 붙은 executor
}
```



## MDC의 한계
다음과 같은 상황을 생각해봅시다.
- 서버가 여러 대고, 같은 요청이 게이트웨이 → API 서버 → 결제 서버를 차례로 거칩니다.

- 이 상황은 다음과 같은 문제가 존재합니다.
	- 컨테이너는 죽었다 살아납니다. 호스트 로그 파일을 grep하는 건 의미가 없습니다.
	- 로그가 평문 텍스트로만 있으면 traceId 단위 집계·필터링이 어렵습니다.

이 시점부터는 **로그를 한 곳에 모으고, 정형화하고, 색인하는 도구**가 필요합니다. 