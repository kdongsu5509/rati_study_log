[스프링 Docs - Modifying](https://docs.spring.io/spring-data/jpa/docs/current/api/org/springframework/data/jpa/repository/Modifying.html)

기본 `@Query`는 무조건 `SELECT` 전용 쿼리 인터페이스(`executeQuery()`)로 동작하기 때문에, `INSERT/UPDATE/DELETE`를 날리려면 강제로 실행 메커니즘을 바꿔주는 `@Modifying`이 무조건 필수에요.

---

# 1. 벌크 연산 방식들
JPA 에서는 다수의 데이터를 한 번에 수정하거나 삭제하는 벌크 연산(Bulk Operation)을 정의하는 3가지 방법이 있어요.

### A. Spring Data JPA (메소드 이름 파생 쿼리)
Spring Data JPA가 기본적으로 제공하는 `deleteBy...`, `removeBy...` 같은 쿼리 메소드를 사용할 수 있어요.
하지만 이 방식은 **영속성 컨텍스트를 거쳐서 동작**해요. 즉, 삭제할 엔티티를 먼저 `SELECT`로 조회한 후, 엔티티를 하나씩 낱개로 반복해서 `DELETE` 쿼리를 발생시켜요. 대량의 데이터를 지울 때는 N+1 문제처럼 엄청난 쿼리가 발생하여 성능상 큰 문제가 될 수 있습니다. 따라서 대량의 데이터 처리 시에는 보통 아래의 `@Modifying`과 `@Query`를 조합해 벌크 연산으로 처리해요.

### B. JPQL / Native Query (+ `@Modifying`, `@Query`)
**가장 권장되는 벌크 연산 방식**이에요. Spring Data JPA의 파생 쿼리(메서드 이름)가 너무 길어지고 복잡해질 때, 또는 대량의 데이터를 한 번에 수정/삭제할 때 인터페이스에 `@Query`를 사용하여 JPQL이나 Native Query를 직접 작성해요.
이때 이것이 단순 조회가 아닌 벌크 연산임을 명시하기 위해 **`@Modifying` 어노테이션을 반드시 추가**해야 해요.

**[예시 1] 파생 쿼리 메서드 이름이 너무 복잡해질 때 (Kotlin)**
```kotlin
@Modifying(clearAutomatically = true)
@Query(
    """
    DELETE FROM FriendshipJpaEntity f 
    WHERE (f.ownerUser.id = :ownerId AND f.friendUser.id = :friendId) 
       OR (f.ownerUser.id = :friendId AND f.friendUser.id = :ownerId)
    """
)
fun deleteBoth(
    @Param("ownerId") ownerId: UUID,
    @Param("friendId") friendId: UUID
)
```

**[예시 2] 시간 기반 만료 데이터 벌크 삭제 (Kotlin)**
```kotlin
@Modifying(clearAutomatically = true)
@Query(
    """
    delete from FriendRestrictionJpaEntity fr
    where fr.expiredAt <= :now
    """
)
fun deleteExpired(@Param("now") now: LocalDateTime)
```

> [!IMPORTANT] 주의사항 (`clearAutomatically` 속성)
> - JPA의 벌크 연산은 영속성 컨텍스트를 완전히 무시하고 **DB에 직접 쿼리를 실행**해요.
> - 따라서 DB의 데이터는 변경되었지만, 영속성 컨텍스트(1차 캐시)에는 여전히 과거 값이 남아있는 불일치 상태가 돼요.
> - 이 상태에서 같은 트랜잭션 내에 해당 엔티티를 다시 조회하면, DB가 아닌 1차 캐시에 남아있는 과거 데이터를 가져오므로 심각한 비즈니스 로직 오류가 발생할 수 있어요.
> - 이를 방지하기 위해 `@Modifying(clearAutomatically = true)`를 설정하여 **벌크 연산 직후 영속성 컨텍스트를 완전히 초기화(`em.clear()`)** 하도록 만들어야 안전해요.

### C. EntityManager (순수 JPA)
순수 JPA의 `EntityManager`를 직접 주입받아 사용할 때는 `@Modifying` 어노테이션이 필요하지 않고, 대신 `executeUpdate()` 메서드를 호출하여 벌크 연산을 직접 실행해요.

```java
int resultCount = em.createQuery("update Member m set m.age = m.age + 1 where m.age >= :age")
        .setParameter("age", age)
        .executeUpdate(); // 순수 JPA 벌크 연산 실행 메서드

em.clear(); // DB에 직접 반영되었으므로, 개발자가 직접 영속성 컨텍스트를 초기화 해줘야 함
```

---

# 2. `@Modifying`의 주요 속성 정리

- **`clearAutomatically` (기본값: false)**
  - `true`로 설정 시, 벌크 연산 쿼리 수행 직후 영속성 컨텍스트를 `clear()` (초기화) 해요.
  - 벌크 연산 이후에 같은 트랜잭션 내에서 엔티티를 다시 조회해야 한다면 **반드시 true로 설정**해야 데이터 정합성 문제가 발생하지 않아요.
  
- **`flushAutomatically` (기본값: false)**
  - `true`로 설정 시, 벌크 연산 쿼리 수행 이전에 영속성 컨텍스트의 쓰기 지연 SQL 저장소에 쌓인 쿼리들을 미리 `flush()` (DB에 반영) 해요.
  - Hibernate는 기본적으로 JPQL/Native 쿼리 실행 직전에 Auto Flush를 발생시키기 때문에 굳이 명시하지 않아도 정상적으로 동작하는 경우가 많아요.
