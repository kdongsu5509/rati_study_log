---
library: Spring Data Common
library_version: 4.1.0
url: https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html
---
리포지토리가 관리하는 엔티티는 애그리거트 루트(aggregate root)입니다. 도메인 주도 설계(DDD) 애플리케이션에서 이러한 애그리거트 루트는 일반적으로 도메인 이벤트를 발행합니다. Spring Data는 애그리거트 루트의 메서드에 선언하여 이벤트 발행을 최대한 쉽게 처리할 수 있도록 `@DomainEvents`라는 어노테이션을 제공하며, 사용 예시는 다음과 같습니다.

**애그리거트 루트에서 도메인 이벤트 노출하기**

Java

```
class AnAggregateRoot {

    @DomainEvents 
    Collection<Object> domainEvents() {
        // … 발행하고자 하는 이벤트들을 여기서 반환합니다.
    }

    @AfterDomainEventPublication 
    void callbackMethod() {
       // … 도메인 이벤트 목록을 정리(clean up)하는 등의 작업을 수행합니다.
    }
}
```

`@DomainEvents`를 사용하는 메서드는 단일 이벤트 인스턴스나 이벤트 컬렉션을 반환할 수 있으며, 어떠한 인자(argument)도 받아서는 안 됩니다.

모든 이벤트가 발행된 후에는 `@AfterDomainEventPublication` 어노테이션이 선언된 메서드가 호출됩니다. 이 메서드를 활용하여 발행될 이벤트 목록을 정리하는 등의 목적에 사용할 수 있습니다.

위 메서드들은 다음과 같은 Spring Data 리포지토리 메서드가 호출될 때마다 실행됩니다.

- `save(…)`, `saveAll(…)`
    
- `delete(…)`, `deleteAll(…)`, `deleteAllInBatch(…)`, `deleteInBatch(…)`
    

주의할 점은, 해당 리포지토리 메서드들은 애그리거트 루트 인스턴스를 인자로 취한다는 것입니다. `deleteById(…)`가 위 목록에서 명시적으로 제외된 이유는, 구현체가 인스턴스를 삭제하는 쿼리를 직접 실행하는 방식을 선택할 수 있고, 이 경우 애초에 애그리거트 인스턴스에 접근할 수 없기 때문입니다.