### 1. 객체 표현식 (Object Expressions)
- 특정 클래스 혹은 인터페이스를 상속받는 익명 객체 생성.
- 선언한 클래스의 외부에서는 사용이 어려움.
- **사용 예시**
	- 로컬 범위의 데이터 그룹화

- 빈 객체
	- 아무것도 상속받지 않는 `object { ... }`
	- 관련 있는 데이터를 하나로 묶는 임시 바구니 역할
- **익명 타입 (Anonymous Type)** 
    -  함수 내부(로컬)나 `private` 멤버로 선언될 때만 익명 객체의 실제 멤버에 접근 가능
    - `public` 함수의 반환 타입으로 쓰이면 `Any`로 취급되어 내부 멤버에 접근이 불가능.

```ko
val mouseAdapter = object : MouseAdapter() {
    override fun mouseClicked(e: MouseEvent) { ... }
}
```

---

### 2. 객체 선언 (Object Declarations)

클래스 선언과 동시에 단 하나의 인스턴스를 생성하는 **싱글턴(Singleton)** 패턴을 언어 차원에서 지원합니다.

- **특징:** 스레드 안전(Thread-safe)하며, 처음 접근할 때 지연 초기화(Lazy initialization)됩니다.
    
- **주의:** 생성자를 가질 수 없습니다.
    

Kotlin

```
object DatabaseConfig {
    val url = "jdbc:mysql://localhost:3306"
    fun connect() { ... }
}
```

---

### 3. 컴패니언 객체 (Companion Objects)

클래스 내부에서 해당 클래스와 연결된 정적(static) 멤버를 정의할 때 사용합니다.

#### 자바(static)와의 비교

- **자바:** 클래스에 귀속된 정적 멤버. 객체 지향과는 거리가 멀음.
    
- **코틀린:** 실제 객체(인스턴스)입니다. 따라서 인터페이스를 구현하거나 확장 함수를 가질 수 있습니다.
    

|**구분**|**장점**|**단점**|
|---|---|---|
|**장점**|팩토리 메서드 패턴 구현에 용이, 인터페이스 구현 가능, 캡슐화 유지|클래스마다 하나만 생성 가능, 자바에서 호출 시 `.Companion`을 붙여야 함|
|**단점**|클래스 내부에 정의되므로 코드가 길어지면 가독성 저하|메모리에 상주하므로 무분별한 사용 시 자원 낭비|

---

### 4. 데이터 객체 선언 (Data Object)

Kotlin 1.9에서 도입되었습니다. 일반 `object`와 동일하지만, `data class`처럼 유용한 유틸리티 기능을 제공합니다.

- **주요 특징:** `toString()` 호출 시 클래스 이름이 예쁘게 출력되며, `equals()`와 `hashCode()`가 적절히 구현되어 있습니다.
    
- **활용:** 주로 상태를 나타내는 **Sealed 클래스**의 하위 요소로 사용하여 가독성을 높입니다.
    

Kotlin

```
sealed class ScreenState {
    data object Loading : ScreenState() // toString() -> "Loading"
    data object Error : ScreenState()
}
```

---

### 5. 상수 (`const val`)

컴파일 시점에 값이 결정되는 진짜 상수입니다.

- **조건:** 1. `String`이나 기본 타입(Primitive type)이어야 함.
    
    2. `top-level`이거나 `object`, `companion object`의 멤버여야 함.
    
    3. 커스텀 게터를 가질 수 없음.
    
- **차이점 (`val` vs `const val`):**
    
    - `val`: 런타임에 값이 할당됨 (ReadOnly).
        
    - `const val`: 컴파일 타임에 인라인화(Inlined)되어 런타임 오버헤드가 없음.
        

Kotlin

```
const val API_TIMEOUT = 5000L // 컴파일 시 숫자로 치환됨
```

---

**냉철한 요약:**

자바의 `static`에 익숙하시겠지만, 코틀린은 이를 `companion object`라는 **실제 객체**로 승격시켰습니다. 단순 상수는 `const val`로 처리하여 성능을 챙기고, 상태가 없는 싱글턴 객체는 `data object`를 사용해 디버깅 편의성을 확보하는 것이 코틀린스러운 방식입니다.