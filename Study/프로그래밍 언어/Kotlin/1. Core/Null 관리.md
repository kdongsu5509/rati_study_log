### 1. 안전 호출 (Safe Call: `?.`)
- 객체가 `null` 이면 `null` 을 반환. (원래 메서드, 객체에 접근 X)
- `null` 이 아니면 의도대로 동작

- 객체가 `nullable` 이면 내부 변수도 `nullable` 로 취급됨.

```kotlin
var user: User? = null
println(user?.name?.length) // 출력: null (NullPointerException 방지)
```

### 2. Not-null Assertion (`!!`)
- `컴파일러` 에게 변수가 `null` 이 아님을 명시적으로 선언.
	- 만약 `null`일 경우 `NullPointerException`이 발생
	- 즉, 안전한 `null` 처리라고 볼 수 없다.

### 2-1. 안전한 예외 처리 (`requireNotNull`, `checkNotNull`)
`Not Null Assertion` 대신 라이브러리 함수를 사용하면 더욱 안전하게 `null` 처리 가능.

| **함수명**                     | **발생 예외 (Exception)**      | **용도**                             |
| --------------------------- | -------------------------- | ---------------------------------- |
| **`requireNotNull(value)`** | `IllegalArgumentException` | 함수의 인자(Argument)가 유효한지 검증할 때 사용    |
| **`checkNotNull(value)`**   | `IllegalStateException`    | 객체의 현재 상태가 작업을 수행하기에 적절한지 검증할 때 사용 |

### 3. 스마트 캐스팅 (Smart Cast)

`if`문 등을 통해 `null` 체크가 완료되면, 컴파일러가 해당 블록 내에서는 타입을 Non-nullable로 자동 변환.

```kotlin
fun printLength(str: String?) {
    if (str != null) {
        // 이 블록 안에서 str은 String 타입으로 스마트 캐스트 됨
        println(str.length)
    }
}
```

### 4. 엘비스 연산자 (Elvis Operator: `?:`)
- `null`일 경우 사용할 기본값(Default value)을 지정

```kotlin
val name = user?.name ?: "Guest"
val length = user?.name?.length ?: throw IllegalArgumentException("이름이 필요합니다.")
```

### 5. 널 가능한 타입의 확장 함수 (Nullable Extension Functions)
#### Common
- **`let`**  : 객체가 `null`이 아닐 때만 블록을 실행.
- **`also`**: 객체가 `null`이 아닐 때 사이드 이펙트(출력, 데이터 저장 등)를 수행. 이후 자신을 다시 반환
- **`takeIf`**: 조건에 만족하면 객체를 반환하고, 만족하지 않으면 `null`을 반환.
```kotlin
fun commonExtensions(user: User?) {
    // 1. 존재할 때만 특정 작업 수행
    user?.let { 
        sendNotification(it.name) 
    }

    // 2. 조건에 따른 필터링 (name이 "라티"인 경우만 객체 유지, 아니면 null)
    val ratiOnly = user?.takeIf { it.name == "라티" }
}
```

#### String
| **함수명**               | **null** | **"" (Empty)** | **" " (Blank)** | **비고**                          |
| --------------------- | -------- | -------------- | --------------- | ------------------------------- |
| **`isNullOrEmpty()`** | `true`   | `true`         | `false`         | 가장 기본적인 빈 값 체크                  |
| **`isNullOrBlank()`** | `true`   | `true`         | `true`          | 화이트스페이스만 있는 경우도 포함              |
| **`orEmpty()`**       | `""`     | `""`           | `" "`           | `null`이면 빈 문자열로 치환 (엘비스 연산자 대용) |
```kotlin
fun stringExtensions(input: String?) {
    // 1. null이나 ""일 때 처리
    if (input.isNullOrEmpty()) { ... }

    // 2. null, "", "  " 모두를 무의미한 값으로 간주할 때
    if (input.isNullOrBlank()) { ... }

    // 3. null을 안전하게 빈 문자열로 변환 (뒤에 바로 문자열 함수 체이닝 가능)
    val safeString = input.orEmpty() 
    println(safeString.length) 
}
```

#### Collection
| **함수명**               | **설명**                                                     |
| --------------------- | ---------------------------------------------------------- |
| **`isNullOrEmpty()`** | 컬렉션 자체가 `null`이거나 요소가 하나도 없을 때 `true`를 반환합니다.              |
| **`orEmpty()`**       | 컬렉션이 `null`이면 **비어있는 불변 리스트/맵**을 반환하여 이후 반복문에서 NPE를 방지합니다. |
| **`filterNotNull()`** | 컬렉션 내부의 요소 중 `null`인 것들을 제거하고 **Non-null 타입의 리스트**로 변환합니다. |
| **`firstOrNull()`**   | 조건에 맞는 첫 번째 요소를 찾되, 없으면 에러 대신 `null`을 반환합니다.               |
```kotlin
fun collectionExtensions(list: List<String?>?) {
    // 1. 컬렉션 자체가 null이거나 비었는지 확인
    if (list.isNullOrEmpty()) return

    // 2. null인 요소만 쏙 빼고 작업하고 싶을 때 (가장 많이 사용)
    // list의 타입이 List<String?>에서 List<String>으로 바뀜
    val nonNullList: List<String> = list.filterNotNull()

    // 3. 리스트가 null이어도 forEach를 안전하게 돌리고 싶을 때
    list.orEmpty().forEach { 
        println(it) 
    }

    // 4. 조건 검색 시 안전한 반환
    val found = list.orEmpty().firstOrNull { it == "라티" }
}
```

### 6. 지연 초기화 (Late Initialization)
- 초기화와 할당을 분리.
- **사용 예시**
	- 의존성 주입(DI)이나 프레임워크 제약 우회
	- 자원 소모가 큰 객체를 생성

#### 변수에 따른 설정
-  `lateinit var` (가변 변수)
	- **발생 가능 문제:** 초기화 전 접근 시 `UninitializedPropertyAccessException`이 발생.
	- **초기화 확인 함수:** **`::변수명.isInitialized`** 를 통해 초기화 여부를 불리언 값으로 확인 가능
-  `by lazy` (불변 변수)
	- 선언 시 초기화 로직을 정의하며, 첫 호출 시점에 로직이 실행. 호출 전까지는 메모리를 점유 X.
	    
```kotlin
class TaskManager {
    lateinit var taskName: String
    val database by lazy { println("DB 연결됨"); "MySQL" }

    fun printTask() {
        // 초기화 여부 확인 (KProperty 접근)
        if (::taskName.isInitialized) {
            println(taskName)
        } else {
            taskName = "Default Task"
            println("초기화 후 출력: $taskName")
        }
    }
}
```