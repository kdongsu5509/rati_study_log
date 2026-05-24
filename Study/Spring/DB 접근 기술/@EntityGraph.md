[스프링 Docs - EntityGraph](https://docs.spring.io/spring-data/jpa/docs/current/api/org/springframework/data/jpa/repository/EntityGraph.html)

스프링 데이터 JPA에서 지연 로딩(Lazy Loading)으로 인해 발생하는 **N+1 문제**를 복잡한 JPQL 작성 없이 어노테이션 하나로 해결해 주는(Fetch Join) 기능이에요.

---

# 1. N+1 문제와 지연 로딩

실무에서 쇼핑몰 앱을 만든다고 가정해 볼게요. **주문(Order)** 목록을 화면에 보여줘야 하는데, 각 주문에는 주문한 **회원(Member)** 정보가 포함되어 있어요.

JPA는 성능 최적화를 위해 기본적으로 연관된 데이터를 실제 사용할 때 DB에서 조회하는 **지연 로딩(LAZY)** 전략을 사용해요.

**[문제 상황 코드 (Kotlin)]**
```kotlin
// 내 주문 10개를 조회해요. (쿼리 1번 실행)
val orders: List<Order> = orderRepository.findAll()

// 화면에 보여주려고 반복문을 돌려요.
for (order in orders) {
    // 💡 회원의 이름을 출력하기 위해 DB에 다시 조회해요.
    println(order.member.name)
}
```

* **결과:** 주문 10개를 가져왔는데, 반복문을 돌면서 회원의 이름을 알아내려고 **DB에 쿼리를 10번 더 실행해요.**
* 총 11번(`1 + 10`)의 쿼리가 발생했어요. 만약 주문이 1,000개였다면 쿼리가 1,001번 실행돼요. 성능 저하를 일으키는 이 현상을 **N+1 문제**라고 불러요.

---

# 2. 해결책 1: 직접 조인하기 (JPQL Fetch Join)

이 문제를 해결하려면 주문을 가져올 때 회원 정보까지 한 번에 조인(JOIN)해서 가져와야 해요. 
기존에는 이를 위해 **JPQL**을 써서 `fetch join` 쿼리를 직접 작성해야 했어요.

**[기존 방식]**
```kotlin
// 직접 fetch join 쿼리를 작성해야 해요.
@Query("select o from Order o join fetch o.member")
fun findAllWithMember(): List<Order>
```

문제가 해결되지만, 매번 `join fetch` 쿼리를 직접 문자열로 작성하면 오타가 발생할 수 있고 `유지보수`가 번거로워져요.

---

# 3. 해결책 2: `@EntityGraph` 사용

이때 개발 편의를 위해 스프링 데이터 JPA가 제공하는 기능이 `@EntityGraph`에요.
복잡하게 쿼리를 짜지 않고, **"함께 조회할 연관 필드 이름"**만 명시해주면 스프링이 내부적으로 Join 쿼리를 생성해 줘요.

**[@EntityGraph 적용 (Kotlin)]**
```kotlin
interface OrderRepository : JpaRepository<Order, Long> {

    // 💡 주문을 조회할 때 member 필드도 함께 조인해서 가져오도록 설정해요.
    @EntityGraph(attributePaths = ["member"])
    override fun findAll(): List<Order>
}
```

이렇게 설정하면 `orderRepository.findAll()`을 호출할 때, 스프링이 알아서 `Order`와 `Member`를 묶는 `LEFT OUTER JOIN` SQL을 만들어서 DB에 **1번만** 실행해요.

N+1 번 발생하던 추가 쿼리가 단 1번의 쿼리로 최적화돼요.

---

# 4. `@EntityGraph`의 주요 속성

공식 문서에 따르면 `@EntityGraph`는 크게 2가지 주요 속성을 제공해요.

### A. `attributePaths`
- 페치 조인(Fetch Join)으로 함께 가져올 **연관 엔티티의 필드명**을 배열로 지정해요.
- 예: `@EntityGraph(attributePaths = ["member", "delivery"])` (여러 개를 한 번에 지정할 수 있어요.)

### B. `type` (EntityGraphType)
엔티티 그래프가 연관된 속성을 어떻게 가져올지 결정하는 설정이에요. (기본값: `FETCH`)

- **`EntityGraphType.FETCH` (기본값)**: `attributePaths`에 명시한 연관 속성들은 **EAGER(즉시 로딩)**로 가져오고, 명시되지 않은 나머지 연관 속성들은 모두 **LAZY(지연 로딩)**로 처리해요. (일반적으로 가장 많이 사용해요.)
- **`EntityGraphType.LOAD`**: `attributePaths`에 명시한 속성들은 EAGER로 가져오지만, 명시하지 않은 속성들은 **엔티티 클래스에 설정된 기본 FetchType(`@ManyToOne(fetch = FetchType.EAGER)` 등)을 그대로 따라가요.**
