---
title: 분산 환경 로그 추적 - LOKI
tags:
  - spring
  - logging
  - observability
  - Loki
---



---
  # Loki 도입 학습 여정 — 분산 환경 로그 추적의 진화

  > 작성일: 2026-05-03
  > 학습자: 고동수
  > 학습 페르소나: 김영한 + 검프 (Why 중심 점진적 진화)

  ---

  ## 0. 학습 출발점 — 우리가 풀려고 한 진짜 문제

  > "분산된 환경에서 로그를 추적하고 싶어요. 하나의 요청의 흐름에 대해서 찾을 수가 없어요."
  >
  > "수평적 확장이 증가할수록 이 문제는 심화되겠죠."

  이 두 문장이 출발점이었다. 현대 분산 시스템 운영의 90%가 이 한 줄로 설명된다. Loki, OpenTelemetry, Micrometer Tracing, ECS — 모든 도구는 **딱 이 문제**를 풀기 위해 등장했다.

  ---

  ## 1. 시간의 흐름 — 9단계 진화

  각 단계는 **이전 단계의 명확한 Pain Point**에서 출발한다.

  ### [시절 0] 로그 수집 시스템이 없던 시절

  ```
  [Server-1] /var/log/app.log
  [Server-2] /var/log/app.log
  [Server-3] /var/log/app.log
  ```

  **운영자의 일과:**

  ```bash
  ssh server-1 && grep "ERROR" /var/log/app.log
  ssh server-2 && grep "ERROR" /var/log/app.log
  ssh server-3 && grep "ERROR" /var/log/app.log
  ```

  **Pain Point:** 서버가 30대, 300대가 되면 작동 불가. 한 요청이 어느 서버에서 처리됐는지 알 수 없음.

  ---

  ### [시절 1] 요청마다 고유 ID 부여 — 직접 박아넣기

  ```java
  @RestController
  public class OrderController {
      public void createOrder(OrderRequest request) {
          String requestId = UUID.randomUUID().toString();
          log.info("[{}] 주문 시작 - userId={}", requestId, request.getUserId());
          paymentService.pay(requestId, request.getAmount());
          log.info("[{}] 주문 완료", requestId);
      }
  }

  @Service
  public class PaymentService {
      public void pay(String requestId, int amount) {
          log.info("[{}] 결제 처리 - amount={}", requestId, amount);
      }
  }
  ```

  **Pain Point:**
  - 모든 로그에 `[{}]`로 requestId를 박아야 함 — 깜빡하면 추적 불가
  - 모든 메서드 시그니처에 `String requestId` 추가
  - **변화의 이유가 비즈니스가 아닌 로깅에서 발생 — SRP 위반**

  > "변화의 이유가 비즈니스 규칙의 변경이 아닌 로깅을 위해서 나오는 것은 OOP를 위반합니다."

  ---

  ### [시절 2] MDC + ThreadLocal — 관심사의 분리

  **아이디어:** 요청 하나는 하나의 스레드에서 처리된다. 그러면 ThreadLocal에 ID를 저장해두고, 로그를 찍을 때 자동으로 꺼내 쓰면 된다. 이걸 SLF4J/Logback이 표준화한 게 **MDC (Mapped Diagnostic Context)**.

  ```java
  @Component
  public class TraceIdFilter extends OncePerRequestFilter {
      @Override
      protected void doFilterInternal(...) {
          try {
              String traceId = UUID.randomUUID().toString();
              MDC.put("traceId", traceId);
              chain.doFilter(request, response);
          } finally {
              MDC.clear();  // 스레드 풀 재사용 대비
          }
      }
  }
  ```

  ```xml
  <pattern>%d [%thread] [%X{traceId}] %-5level %logger - %msg%n</pattern>
  ```

  비즈니스 코드는 깨끗해진다.

  ```java
  public void pay(int amount) {  // 시그니처에 requestId 없음
      log.info("결제 처리 - amount={}", amount);  // 자동으로 traceId 박힘
  }
  ```

  **Pain Point:** ThreadLocal은 **한 스레드 안에서만** 동작.

  ---

  ### [시절 3] 비동기 환경의 함정 — MdcTaskDecorator (어제 학습)

  `@Async`로 다른 스레드에 작업을 넘기면 → ThreadLocal이 끊긴다 → MDC 비어있음.

  직접 만든 해결책:

  ```java
  public class MdcTaskDecorator implements TaskDecorator {
      @Override
      public Runnable decorate(Runnable runnable) {
          Map<String, String> contextMap = MDC.getCopyOfContextMap();
          return () -> {
              try {
                  if (contextMap != null) MDC.setContextMap(contextMap);
                  runnable.run();
              } finally {
                  MDC.clear();
              }
          };
      }
  }
  ```

  **그런데 사실 표준 라이브러리가 있었다.**

  ```java
  executor.setTaskDecorator(new ContextPropagatingTaskDecorator());
  ```

  **왜 손으로 먼저 만들었나?** 강사의 의도다. 표준을 그냥 가져다 쓰면 그게 왜 필요한지 모른다. 손으로 한 번 만들어보면 **`io.micrometer:context-propagation`** 라이브러리가 어떤 문제를 푸는지 체감으로
  이해된다.

  ---

  ### [시절 4] 서비스 간 호출에서 traceId 전파

  `Order Service` → HTTP → `Payment Service` 호출 시, MDC는 다른 JVM으로 자동 전파되지 않는다. **HTTP에 직접 실어 보내야 한다.**

  | HTTP 영역 | 적합한가? | 이유 |
  |---------|---------|------|
  | Body / Query Param | ❌ | 비즈니스 데이터에 메타정보 섞임 = SRP 위반 (또!) |
  | **Header** | ✅ | `Authorization`, `Content-Type`처럼 메타정보 표준 |

  **W3C Trace Context 표준:**

  ```
  traceparent: 00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01
               ↑   ↑                                ↑                ↑
               버전 trace-id (32자리)                 span-id          flags
  ```

  Spring Boot 3+ / Micrometer Tracing이 `RestTemplate`, `WebClient`, `Feign`에 자동으로 이 헤더를 박아준다.

  ---

  ### [시절 5] 로그 중앙 집중화 — 원시적 시도들

  흩어진 로그를 한 곳에 모으려는 첫 시도들과 그 실패.

  | 방식 | 문제점 |
  |------|------|
  | **NFS 공유 디스크** | Lock 없으면 충돌, Lock 있으면 성능 저하, 단일 장애 지점(SPOF) |
  | **rsync 1분마다 복사** | 실시간성 부족 — 새벽 3시 장애 알림이 와도 로그가 1분 뒤 도착 |
  | **UDP syslog** | 패킷 유실 — 로그 2번이 사라진 줄도 모르고, 장애 분석 시 "결제 실패인지 로그 유실인지" 구분 불가 |

  **우리가 진짜 원하는 것:**

  | 요구사항 | 이유 |
  |---------|------|
  | 비동기 전송 | 애플리케이션 성능 영향 없어야 함 |
  | 실시간성 | 파일에 새 로그 쓰이면 즉시 감지 |
  | 신뢰성 | 네트워크 장애 시 재시도, 버퍼링 |
  | 구조화 | 라벨/메타데이터 부착 |

  ---

  ### [시절 6] 전문 로그 에이전트의 등장

  ```
  Logstash (2010~)     →  무겁다 (JVM 기반)
  Fluentd (2011~)      →  중간 (Ruby 기반)
  Filebeat (2015~)     →  가볍다 (Go 기반)
  Fluent Bit (2015~)   →  더 가볍다 (C 기반)
  Promtail (2018~)     →  Loki 전용 (Go 기반) — 2025년 deprecated
  Alloy (2024~)        →  Promtail 후속작, OTel + Prometheus + Loki 통합
  ```

  **Alloy를 선택한 이유:**
  - Promtail deprecated (학습자가 정확히 짚음)
  - OpenTelemetry, Prometheus, Loki 모두 통합
  - 미래 지향적

  ---

  ### [시절 7] Loki — ELK의 무거움 해소

  > "ELK는 모든 로그를 역인덱싱하여 무거운 반면, 로키의 경우에는 메타데이터만을 다루기 때문에 가볍습니다."

  | 구분 | ELK | Loki |
  |------|-----|------|
  | 인덱싱 대상 | 본문 전체 (Inverted Index) | 라벨(메타데이터)만 |
  | 슬로건 | 강력한 검색 | "Like Prometheus, but for logs" |
  | 비용/리소스 | 무거움 | 가벼움 |
  | 검색 방식 | 전문 검색 | 라벨로 스트림 좁힌 후 grep |

  **LogQL의 본질:**

  ```
  {service="order-service", level="ERROR"}  |=  "userId=12345"
  └─────────────────────────────────────┘     └─────────────┘
     라벨 필터 (인덱스 사용)                     본문 grep
  ```

  **Cardinality 함정:**

  | 메타데이터 | 라벨 적합? | 이유 |
  |----------|---------|------|
  | `service=order` | ✅ | 적은 cardinality |
  | `level=ERROR` | ✅ | 5종류 정도 |
  | `pod=order-pod-1` | ✅ | Pod 수 한정 (Promtail이 K8s API에서 가져옴) |
  | `trace_id=abc-123` | ❌ | 요청마다 고유 = 폭발 |
  | `userId=12345` | ❌ | 사용자 수만큼 폭발 |

  > "high-cardinality 값은 본문에 두어야 합니다. {service="order"} |= "trace_id" 로 충분히 검색 가능."

  ---

  ### [시절 8] 표준화 — ECS, OpenTelemetry, W3C

  **ECS (Elastic Common Schema):**

  ```json
  {
    "@timestamp": "2026-05-03T12:54:28.060Z",
    "log.level": "INFO",
    "message": "주문 요청 시작",
    "service.name": "order-service",
    "trace.id": "abc...",
    "span.id": "def..."
  }
  ```

  표준 스키마 = **벤더 독립성** + 도구 호환.

  **OpenTelemetry — 점진적 진화의 결과:**

  ```
  [2010s] 도구별 분열: Zipkin, Jaeger, Datadog APM, Prometheus
  [2016~] OpenTracing (트레이싱 표준 시도)
  [2018~] OpenCensus (구글, 메트릭+트레이싱)
          → 표준이 또 분열
  [2019~] OpenTelemetry — 둘이 합쳐짐, CNCF 사실상 업계 표준
  ```

  **관측 가능성의 Three Pillars:**

  | 신호 | 설명 | 예시 |
  |------|------|------|
  | Logs | 사건 기록 | "주문 12345 처리 실패" |
  | Metrics | 수치 집계 | "초당 요청 100건, 에러율 5%" |
  | Traces | 요청 흐름 | "Order → Payment → Notification, 250ms" |

  ---

  ## 2. 학습자가 직접 도출한 핵심 원칙들

  ### 원칙 1 — SRP (Single Responsibility Principle)

  > "변화의 이유가 비즈니스 규칙의 변경이 아닌 로깅을 위해서 나오는 것은 OOP를 위반합니다."

  ### 원칙 2 — 12-Factor App "Logs as event streams"

  > "애플리케이션은 로그가 수집되는지 몰라야 한다."

  ### 원칙 3 — 의존성 관리

  > "사용하지도 않는 의존성 때문에 결과물이 더 무거워질 듯."

  영향: JAR 크기, 클래스로딩 시간, Attack Surface, Transitive 충돌.

  ### 원칙 4 — Cardinality 폭발 회피

  라벨은 분류, 본문은 검색.

  ### 원칙 5 — HTTP 메타데이터는 헤더에

  비즈니스 데이터(Body)와 메타정보(Header) 분리. `Authorization`, `Content-Type`이 헤더에 있는 이유.

  ### 원칙 6 — 설정도 코드 (Configuration as Code)

  `docker-compose.yml`, `loki/config.yaml`, `alloy/config.alloy` — 모두 git에 들어가야 한다.

  ---

  ## 3. 우리가 만든 최종 아키텍처

  ```
  ┌──────────────────────────┐
  │  Spring Boot App         │
  │  (Host에서 IDE로 실행)    │
  │                          │
  │  Logback                 │
  │  └─ EcsEncoder           │  ← ECS JSON 인코딩
  └──────────┬───────────────┘
             │ write (RollingFileAppender)
             ↓
     ┌──────────────────┐
     │ ./logs/app.json  │  ← 호스트 파일시스템
     └──────┬───────────┘
            │ volume mount (ro - 최소 권한 원칙)
            ↓
     ┌──────────────────┐
     │     Alloy        │  ← Promtail의 후속작
     │  (4단계 파이프라인) │
     │  ① file_match    │     어떤 파일?
     │  ② source.file   │     tail로 읽기
     │  ③ process       │     JSON 파싱 + 라벨링
     │  ④ loki.write    │     Loki로 push
     └──────┬───────────┘
            │ HTTP push
            ↓
     ┌──────────────────┐
     │      Loki        │  ← 라벨 인덱싱, 본문 압축
     │  Labels:         │
     │   - level        │     low cardinality만!
     │   - service      │
     └──────┬───────────┘
            │ LogQL query
            ↓
     ┌──────────────────┐
     │     Grafana      │  ← 시각화 + 조회
     │  Explore UI      │
     └──────────────────┘
  ```

  ---

  ## 4. 핵심 설정 파일들

  ### `build.gradle.kts` (의존성)

  ```kotlin
  dependencies {
      // [1] 로그 형식
      implementation("co.elastic.logging:logback-ecs-encoder:1.5.0")

      // [2] Tracing — Spring Boot 4.x는 OTel 기반
      implementation("io.micrometer:micrometer-tracing-bridge-otel")
      implementation("org.springframework.boot:spring-boot-starter-opentelemetry")

      // [3] 비동기 Context 전파
      implementation("io.micrometer:context-propagation")

      // [4] Spring 기본
      implementation("org.springframework.boot:spring-boot-starter-webmvc")
      implementation("org.springframework.boot:spring-boot-starter-actuator")
  }
  ```

  ### `logback-spring.xml`

  핵심: ECS JSON을 **파일**로 출력 (Alloy가 읽을 수 있도록).

  ```xml
  <appender name="ECS_FILE" class="ch.qos.logback.core.rolling.RollingFileAppender">
      <file>./logs/app.json</file>
      <rollingPolicy class="ch.qos.logback.core.rolling.SizeAndTimeBasedRollingPolicy">
          <fileNamePattern>./logs/app-%d{yyyy-MM-dd}.%i.json.gz</fileNamePattern>
          <maxFileSize>100MB</maxFileSize>
          <maxHistory>7</maxHistory>
      </rollingPolicy>
      <encoder class="co.elastic.logging.logback.EcsEncoder">
          <serviceName>${appName}</serviceName>
      </encoder>
  </appender>
  ```

  ### `docker-compose.yml`

  ```yaml
  services:
    loki:
      image: grafana/loki:2.9.4
      volumes:
        - ./loki/config.yaml:/etc/loki/local-config.yaml:ro
        - loki-data:/loki

    alloy:
      image: grafana/alloy:latest
      volumes:
        - ./alloy/config.alloy:/etc/alloy/config.alloy:ro
        - ./logs:/var/log/app:ro    # ro = 최소 권한 원칙

    grafana:
      image: grafana/grafana:10.2.3
      volumes:
        - grafana-data:/var/lib/grafana

  volumes:
    loki-data:
    grafana-data:
  ```

  ### `alloy/config.alloy` (River 언어)

  ```alloy
  local.file_match "app_logs" {
    path_targets = [{ __path__ = "/var/log/app/*.json", service = "order-service" }]
  }

  loki.source.file "app_logs" {
    targets    = local.file_match.app_logs.targets
    forward_to = [loki.process.parse_ecs.receiver]
  }

  loki.process "parse_ecs" {
    forward_to = [loki.write.local_loki.receiver]

    stage.json {
      expressions = {
        level    = "\"log.level\"",
        service  = "\"service.name\"",
        trace_id = "\"trace.id\"",
      }
    }

    stage.labels {
      values = {
        level   = "",   # ✅ low cardinality
        service = "",   # ✅ low cardinality
        # trace_id ← ❌ 라벨 X (본문에서 grep)
      }
    }
  }

  loki.write "local_loki" {
    endpoint { url = "http://loki:3100/loki/api/v1/push" }
  }
  ```

  ---

  ## 5. 디버깅 여정 — traceId 누락 사건

  학습 도중 발생한 실제 디버깅 케이스. 가장 큰 학습 포인트 중 하나.

  ### 증상

  ```
  [order-service,,] ← traceId, spanId 모두 비어있음
  ```

  `logs/app.json`에 `trace.id` 필드 자체가 없음.

  ### 추론 과정

  1. **가설 1**: 의존성이 안 들어왔나? → `gradle dependencies` 확인 → 들어와 있음 ✅
  2. **가설 2**: 자동 설정이 비활성화됐나? → `debug=true`로 부팅 → **`BraveAutoConfiguration`이 보고서 어디에도 없음**
  3. **결론**: Spring Boot 4.x에서는 tracing 자동 설정이 별도 모듈로 분리됨. `bridge-brave`만으로는 부족.

  ### 해결

  `bridge-brave` → `bridge-otel`로 전환 + `spring-boot-starter-opentelemetry` 추가.

  > 단, `opentelemetry-exporter-otlp`는 여전히 추가 안 함 (외부 전송 안 한다는 결정 유지).

  ### 교훈

  **진짜 디버깅:** 가설 → 검증 → 결론. 추측만으로는 안 된다. `--debug`, `/actuator/conditions` 같은 도구를 활용해서 **증거 기반 진단**을 한다.

  ---

  ## 6. Why 중심 다시 보기 — 시험 문제 셀프 체크

  각 질문에 본인 언어로 답할 수 있어야 한다.

  | 질문 | 답의 핵심 키워드 |
  |------|-------------|
  | 왜 MDC인가? | SRP, 비즈니스 코드 깨끗하게 |
  | 왜 자동 전파(Micrometer Tracing)인가? | MdcTaskDecorator의 표준 버전 |
  | 왜 W3C Trace Context인가? | 회사마다 헤더명 달라 호환 불가 |
  | 왜 파일이고 stdout이 아닌가? | Docker Compose에서 컨테이너 간 stdout 공유 불가 |
  | 왜 Alloy(수집기)인가? | 12-Factor App, 애플리케이션은 수집을 모르게 |
  | 왜 ECS JSON인가? | 표준 스키마, 벤더 독립성 |
  | 왜 Loki인가? | ELK 대비 가벼움, 메타데이터만 인덱싱 |
  | 왜 trace_id를 라벨로 안 두나? | Cardinality 폭발 방지 |
  | 왜 :ro 마운트인가? | 최소 권한 원칙 |
  | 왜 named volume인가? | 컨테이너 ephemeral, 데이터 영속화 |

  ---

  ## 7. 다음 학습 방향

  오늘 의식적으로 미뤄둔 주제들이 자연스러운 다음 학습이다.

  4. **Traces 본격** — Tempo + Grafana로 분산 추적 시각화
  5. **Metrics** — Prometheus + Grafana로 시스템 메트릭
  6. **OpenTelemetry 깊이** — Three Pillars 통합
  7. **LogQL 깊이** — `unwrap`, `rate`, 메트릭 추출
  8. **Alerting** — Alertmanager, 로그 패턴 기반 알람
  9. **K8s 환경** — DaemonSet, K8s API 디스커버리

  ---

  ## 8. 마무리

  이 학습의 본질은 **외운 것이 아니라 도출한 것**이다.

  학습자가 직접 던진 답들:
  - "ELK는 모든 로그를 역인덱싱하여 무거운 반면, 로키의 경우에는 메타데이터만을 다루기 때문에 가볍습니다."
  - "변화의 이유가 비즈니스 규칙의 변경이 아닌 로깅을 위해서 나오는 것은 OOP를 위반합니다."
  - "애플리케이션은 로그가 수집되는지 몰라야 한다."

  > **이 과정을 거쳐서 이해한 것과 그냥 외운 것은 완전히 다릅니다.**
