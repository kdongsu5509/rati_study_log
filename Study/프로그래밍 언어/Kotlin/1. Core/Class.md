### 1. 객체 생성 (No `new` Keyword)
- 객체 생성 시 `new` 키워드 사용 x.
	- 대신 생성자를 일반 함수처럼 호출 => 인스턴스 생성

```kotlin
val user = User("라티") // new 키워드 없이 바로 생성
```

### 2. 멤버 함수 (Member Functions)
```kotlin
class User(val name: String) {
    fun sayHello() = "안녕하세요, $name 입니다." // 멤버 함수
}
```

### 3. 프로퍼티 (Properties)
**코틀린의 프로퍼티**
- 필드(데이터 저장 공간) + 접근자(Getter/Setter) 의 통합 개념
	- `private` 필드와 `public` getter/setter 생성 이유 X.
	- `val` : `getter` 만
	- `var` : `getter` ,`setter` 둘 다 생성
### 4. 게터와 세터 (Getters & Setters)
**기본 접근자**
- 코틀린 컴파일러가 자동으로 생성
- 호출 시, `.name` 처럼 필드에 직접 접근하는 style로 호출.
	- 내부적으로는 생성된 접근자 메서드 호출
#### 커스텀 접근자 (Custom Accessors)
- 특정 로직을 사용하고 싶을 때 생성.
	- **커스텀 게터** 
		- 호출될 때마다 값을 계산 => (Backing field가 생성되지 않음)
	- **커스텀 세터** 
		- 입력된 값을 가공하여 저장할 때 사용
		-  `field` 키워드를 통해 실제 메모리 공간에 접근
		    
```kotlin
class Person(var firstName: String, var lastName: String) {
    // 커스텀 게터: 필드 생성 X (매번 계산함)
    val fullName: String
        get() = "$firstName $lastName"

    // 커스텀 세터: field 키워드 사용 (필드 생성 O)
    var nickname: String = ""
        set(value) {
            field = value.trim().uppercase() // 공백 제거 후 대문자로 저장
        }
}
```

### 5. 생성자 (Constructors)

#### 주 생성자 (Primary Constructor)
- 클래스 이름 바로 옆에 정의
- `Property` 선언 및 초기화 가능
```kotlin
class User(val name: String, var age: Int) // 주 생성자
```

#### 부 생성자 (Secondary Constructor)
- 추가적인 생성 로직이 필요할 때 `constructor` 키워드로 정의
- 반드시 주 생성자를 호출(`this`)해야 함.

```kotlin
class User(val name: String) {
    var age: Int = 0

    constructor(name: String, age: Int) : this(name) {
        this.age = age
    }
}
```

#### 초기화 블록 (`init`)
주 생성자는 코드를 가질 수 없으므로, 인스턴스 생성 시점에 실행될 로직은 `init` 블록에 작성
```kotlin
class User(val name: String, var age: Int) {

    // 1. 인스턴스 생성 시점에 가장 먼저 실행되는 블록
    init {
        println("인스턴스 초기화를 시작합니다.")
        
        // 주 생성자로 받은 데이터를 검증하는 로직 (주 생성자 본문에는 작성 불가)
        require(name.isNotBlank()) { "이름은 공백일 수 없습니다." }
        require(age >= 0) { "나이는 0세 이상이어야 합니다." }
        
        println("사용자 '$name'(이)가 성공적으로 생성되었습니다.")
    }

    // 2. 여러 개의 init 블록을 가질 수 있으며, 작성된 순서대로 실행됨
    init {
        println("두 번째 초기화 블록: 생성 시각 기록 등 추가 로직 수행")
    }

    fun introduce() = "안녕하세요, 저는 ${name}이고 ${age}살입니다."
}

fun main() {
    // 객체 생성 시점에 init 블록 내의 로직이 자동으로 실행됨
    val user = User("라티", 25)
    
    println("--------------------")
    println(user.introduce())
    
    // 에러 케이스: init 블록의 require 검증에 걸림
    // val invalidUser = User("", -1) 
}
```

### 6. 내부 클래스 (Nested & Inner Classes)
- 기본: 이너 클래스 정의 시, 기본적으로 외부 클래스에 대한 참조 X.

|**구분**|**키워드**|**바깥 클래스 참조**|**특징**|
|---|---|---|---|
|**중첩 클래스**|`class`|**X**|자바의 `static class`와 유사. 메모리 누수 위험 없음.|
|**내부 클래스**|`inner class`|**O**|바깥 클래스의 멤버에 접근 가능. 참조를 유지하므로 주의 필요.|

```kotlin
class Outer {
    private val bar: Int = 1

    class Nested {
        // fun foo() = bar // 에러: 바깥 멤버에 접근 불가
    }

    inner class Inner {
        fun foo() = bar // 접근 가능
    }
}
```
