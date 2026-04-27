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
	- **커스텀 게터:** 호출될 때마다 값을 계산합니다. (Backing field가 생성되지 않음)
	    
- **커스텀 세터:** 입력된 값을 가공하여 저장할 때 사용합니다. `field` 키워드를 통해 실제 메모리 공간에 접근합니다.
    

Kotlin

```
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

---

### 5. 생성자 (Constructors)

#### 주 생성자 (Primary Constructor)

클래스 이름 바로 옆에 정의합니다. 가장 간결하며, 프로퍼티 선언과 동시에 초기화가 가능합니다.

Kotlin

```
class User(val name: String, var age: Int) // 주 생성자
```

#### 부 생성자 (Secondary Constructor)

추가적인 생성 로직이 필요할 때 `constructor` 키워드로 정의합니다. 반드시 주 생성자를 호출(`this`)해야 합니다.

Kotlin

```
class User(val name: String) {
    var age: Int = 0

    constructor(name: String, age: Int) : this(name) {
        this.age = age
    }
}
```

#### 초기화 블록 (`init`)

주 생성자는 코드를 가질 수 없으므로, 인스턴스 생성 시점에 실행될 로직은 `init` 블록에 작성합니다.

---

### 6. 내부 클래스 (Nested & Inner Classes)

코틀린은 클래스 안에 클래스를 정의할 때 기본적으로 **바깥 클래스에 대한 참조가 없는** 상태입니다.

|**구분**|**키워드**|**바깥 클래스 참조**|**특징**|
|---|---|---|---|
|**중첩 클래스**|`class`|**X**|자바의 `static class`와 유사. 메모리 누수 위험 없음.|
|**내부 클래스**|`inner class`|**O**|바깥 클래스의 멤버에 접근 가능. 참조를 유지하므로 주의 필요.|

Kotlin

```
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

---

**문서 요약:**

라티님이 작성하시는 코드가 상태(State)를 저장해야 한다면 **field**를 사용하는 프로퍼티를, 상태 없이 계산된 결과만 제공한다면 **커스텀 게터**를 사용하세요. 또한, 불필요한 메모리 참조를 줄이려면 기본적으로 `inner` 키워드가 없는 **중첩 클래스**를 사용하는 것이 권장됩니다.