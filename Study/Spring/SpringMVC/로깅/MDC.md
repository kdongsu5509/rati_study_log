---
title: MDC로 시작하는 로깅 맥락 추적
description: 비즈니스 로직을 오염시키지 않으면서 요청 단위 추적 ID를 로그에 새기는 방법 — 파라미터 전달의 고통에서 출발해 ThreadLocal/MDC, TaskDecorator를 거쳐 중앙 집중형 관측까지의 진화 과정.
tags:
  - spring
  - logging
  - observability
  - mdc
---
[[Logging, 좋은 로깅이란 무엇인가]] 에서도 다루었듯
여러 요청이 동시에 들어오는 웹 서버에서 **"이 로그가 어떤 요청에 속한 건지"** 가 보이지 않으면 장애 대응이 사실상 불가능합니다. 이 글은 그 문제를 어떻게 마주치고, 왜 결국 MDC라는 기술이 필연적으로 등장했는지, 그리고 그 한계를 어떻게 메워나가는지를 단계적으로 정리합니다.

---

## 1단계 — 고통의 확인: 파라미터로 traceId를 들고 다니기

가장 처음 떠오르는 순진한 접근은 **요청을 식별하는 ID를 메서드 파라미터로 계속 넘기는 것**입니다.

```java
@RestController
@RequiredArgsConstructor
public class OrderController {
    private final OrderService orderService;

    @PostMapping("/orders")
    public OrderResponse create(@RequestBody OrderRequest req) {
        String traceId = UUID.randomUUID().toString();
        log.info("[{}] 주문 요청 수신", traceId);
        return orderService.place(req, traceId);
    }
}

@Service
@RequiredArgsConstructor
public class OrderService {
    private final PaymentClient paymentClient;
    private final InventoryRepository inventoryRepository;

    public OrderResponse place(OrderRequest req, String traceId) {
        log.info("[{}] 재고 차감 시작", traceId);
        inventoryRepository.decrease(req.itemId(), req.qty(), traceId);

        log.info("[{}] 결제 호출", traceId);
        paymentClient.pay(req.amount(), traceId);

        return new OrderResponse(/* ... */);
    }
}
```

### 문제점

- **모든 메서드 시그니처가 오염**됩니다. `traceId`는 비즈니스 도메인과 무관한 횡단 관심사(cross-cutting concern)인데 도메인 코드 한가운데에 들어와 있죠.
- 신규 메서드를 만들 때마다 *traceId를 빠뜨리지 않았는가* 를 신경 써야 합니다. 빠뜨린 호출은 추적이 끊깁니다.
- 외부 라이브러리 함수에는 강제할 수도 없습니다.

> [!warning] 핵심
> 횡단 관심사를 도메인에 직접 박는 순간, 코드는 두 가지 변경 축을 동시에 견뎌야 합니다. **분리되지 않은 관심사는 결국 모든 곳을 오염시킵니다.**

---

## 2단계 — ThreadLocal 기반의 MDC

서블릿 컨테이너(Tomcat 등)는 **요청 하나당 스레드 하나** 를 할당합니다. 같은 요청 안의 모든 코드는 같은 스레드 위에서 실행되죠. 그렇다면 **스레드에 traceId를 묶어두면** 파라미터로 넘길 필요 없이 어디서든 꺼내 쓸 수 있습니다.

이것이 SLF4J가 제공하는 `MDC`(Mapped Diagnostic Context) 의 본질입니다. 내부적으로 `ThreadLocal<Map<String, String>>` 입니다.

### 2.1 — 진입 지점: 필터에서 traceId 주입

```java
@Component
public class MdcLoggingFilter extends OncePerRequestFilter {
    private static final String TRACE_ID = "traceId";
    private static final String HEADER = "X-Trace-Id";

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws ServletException, IOException {
        String traceId = Optional.ofNullable(request.getHeader(HEADER))
            .orElse(UUID.randomUUID().toString());

        MDC.put(TRACE_ID, traceId);
        try {
            response.setHeader(HEADER, traceId);
            chain.doFilter(request, response);
        } finally {
            MDC.clear();   // 스레드 풀 재사용에 대비해 반드시 정리
        }
    }
}
```

### 2.2 — 비즈니스 로직은 이제 깨끗합니다

```java
@Service
@RequiredArgsConstructor
public class OrderService {
    private final PaymentClient paymentClient;
    private final InventoryRepository inventoryRepository;

    public OrderResponse place(OrderRequest req) {     // traceId 사라짐
        log.info("재고 차감 시작");                      // 깔끔
        inventoryRepository.decrease(req.itemId(), req.qty());

        log.info("결제 호출");
        paymentClient.pay(req.amount());

        return new OrderResponse(/* ... */);
    }
}
```

### 2.3 — Logback 패턴으로 자동 출력

`logback-spring.xml` 에서 `%X{traceId}` 토큰을 패턴에 박아두면, 모든 로그 라인에 자동으로 traceId가 찍힙니다.

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

비즈니스 로직은 traceId를 **모르는 채로** 모든 로그에 traceId가 박혀있습니다. 횡단 관심사가 횡단 위치(필터)로 분리됐죠.

> [!tip] MDC.clear()를 잊으면
> Tomcat의 워커 스레드는 **풀에서 재사용**됩니다. clear() 하지 않으면 다음 요청이 이전 요청의 traceId를 그대로 들고 시작합니다 — 디버깅 지옥의 시작.

---

## 3단계 — 한계 직면: 비동기로 가는 순간 ThreadLocal은 끊긴다

요청을 받은 스레드와 작업을 처리하는 스레드가 같을 때만 MDC가 동작합니다. `@Async`, `CompletableFuture`, `ExecutorService.submit()` 등으로 **다른 스레드에 작업을 넘기는 순간 컨텍스트는 단절**됩니다.

### 3.1 — 끊김을 직접 본다

```java
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

> [!danger] 본질
> ThreadLocal은 "그 스레드 안에서만" 유효합니다. 작업이 다른 스레드로 넘어가는 순간, **부모의 맥락은 자동으로 따라가지 않습니다.**

---

## 4단계 — 필연적 진화: TaskDecorator로 맥락을 복사한다

작업을 다른 스레드에 위임하기 직전, **부모 스레드의 MDC 스냅샷을 떠서 자식 스레드에 심는** 훅이 필요합니다. Spring은 이 훅을 `TaskDecorator` 라는 이름으로 제공합니다.

### 4.1 — MdcTaskDecorator 구현

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

### 4.2 — Executor에 데코레이터 부착

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

> [!note] 데코레이터 패턴이 적합한 이유
> `TaskDecorator`는 Runnable을 한 겹 감싸는 단순한 함수형 인터페이스입니다. ThreadLocal 복사뿐 아니라 **보안 컨텍스트(SecurityContext), 트랜잭션, 트레이싱(SpanContext) 등 모든 맥락 전파**가 같은 패턴으로 해결됩니다.

### 4.3 — CompletableFuture를 직접 쓸 때는?

`@Async`가 아닌 `CompletableFuture.supplyAsync(..., executor)`를 쓸 때도 같은 executor를 주입하면 됩니다. **모든 비동기 진입점이 데코레이터가 부착된 executor 하나로 일원화**되도록 설계하는 게 핵심입니다.

```java
public CompletableFuture<Result> doAsync() {
    return CompletableFuture.supplyAsync(() -> {
        log.info("비동기 작업 진행");   // traceId 살아있음
        return compute();
    }, taskExecutor);                 // ← 데코레이터가 붙은 executor
}
```

---

## 5단계 — 확장된 시야: 중앙 집중형 관측으로

서버 한 대 안에서 traceId가 잘 따라붙는 것까지 확보했습니다. 그런데 현실은 그보다 훨씬 거칠죠:

- 서버가 여러 대고, 같은 요청이 게이트웨이 → API 서버 → 결제 서버를 차례로 거칩니다.
- 컨테이너는 죽었다 살아납니다. 호스트 로그 파일을 grep하는 건 의미가 없습니다.
- 로그가 평문 텍스트로만 있으면 traceId 단위 집계·필터링이 어렵습니다.

이 시점부터는 **로그를 한 곳에 모으고, 정형화하고, 색인하는 도구**가 필요합니다. Grafana 진영의 대표 조합이 **Loki(저장·색인) + Promtail(수집) + Grafana(질의·시각화)** 입니다.

### 5.1 — 정형(JSON) 로그로 출력

평문 패턴 대신 JSON 인코더를 쓰면 traceId가 **필드** 가 됩니다 — Loki에서 LogQL로 한 번에 필터링할 수 있게 되죠.

```xml
<dependency>
    <groupId>net.logstash.logback</groupId>
    <artifactId>logstash-logback-encoder</artifactId>
    <version>7.4</version>
</dependency>
```

```xml
<appender name="JSON" class="ch.qos.logback.core.ConsoleAppender">
    <encoder class="net.logstash.logback.encoder.LogstashEncoder">
        <includeMdcKeyName>traceId</includeMdcKeyName>
    </encoder>
</appender>
```

출력 한 줄(예시):

```json
{"@timestamp":"2026-05-03T14:30:00.012+09:00","level":"INFO","logger_name":"c.e.NotificationService","thread_name":"async-1","message":"이메일 발송 시작 → user@x.com","traceId":"abc-123"}
```

### 5.2 — Loki에서 traceId로 한 번에 묶기

```logql
{app="order-service"} | json | traceId="abc-123"
```

이 한 줄로 해당 요청이 만든 **모든 서비스의 모든 스레드** 로그가 시간순으로 펼쳐집니다. 이게 비로소 **관측 가능성(Observability)** 의 출발점입니다.

> [!info] 다음 학습 주제
> - **Distributed Tracing**: traceId를 직접 만드는 대신 OpenTelemetry / Micrometer Tracing이 spanId까지 자동 부여 → MDC에 자동 주입.
> - **로그 ↔ 메트릭 ↔ 트레이스 상관관계**: Grafana에서 한 traceId를 클릭하면 그 시각의 메트릭/트레이스로 점프.
> - **샘플링 전략**: 모든 요청을 다 저장하면 비용이 폭발 — 어떤 기준으로 남길지.

---

## 오늘 학습의 핵심 요약

이걸 잊으면 다시 도루묵입니다:

1. **고통의 확인**: 파라미터로 traceId를 넘기는 건 비즈니스 로직을 오염시키는 행위였다.
2. **기술적 대안**: ThreadLocal 기반의 MDC를 통해 로직의 순수성을 지키며 맥락을 유지했다.
3. **한계 직면**: 멀티스레드(비동기) 환경에서 ThreadLocal은 단절된다는 물리적 한계를 목격했다.
4. **필연적 진화**: TaskDecorator를 사용하여 부모의 맥락을 자식에게 '복사'해 전달하는 징검다리를 놓았다.
5. **확장된 시야**: 이렇게 정제된 로그를 Loki와 같은 중앙 집중형 시스템으로 모아야 비로소 분산 시스템의 관측 가능성(Observability)이 완성된다.

왜 여기까지 왔는지 이제 이해가 됩니까?

다음번엔 이 로그들을 실제로 Loki로 쏘아 올리고, Grafana에서 어떻게 요리할지 고민해 보십시오. 물론, 공식 문서를 먼저 정독하고 오지 않는다면 제 호통을 면치 못할 겁니다.

수고하셨습니다.
