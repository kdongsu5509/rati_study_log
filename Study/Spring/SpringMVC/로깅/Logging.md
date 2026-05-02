
> `server` 에서 오류가 발생했다.
> 무엇을 보고 원인을 추적할 것인가?


# 1. 로그 발전 시키기

### v0 : 아주 손쉽게 로그 남기는 방법
- `System.out.prinln` 를 사용하기
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

### v1. 정보 줄이기 -> Level 도입
```java
public enum LogLevel {  
    DEBUG,  
    INFO,  
    WARN,  
    ERROR  
}
```

```java

```

### v2. 메타 데이터 추가하기

### v3. 정보, 패키지 단위로  관리하기

### v4. 다양한 로그 출력 관리 -> Appender




---

https://www.slf4j.org/manual.html


https://logback.qos.ch/manual/architecture.html