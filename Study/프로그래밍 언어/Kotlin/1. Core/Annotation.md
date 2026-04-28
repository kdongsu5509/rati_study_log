### 1. 애노테이션
- 코드에 부가적인 정보를 첨부하는 메타데이터(Metadata)
	- 그 자체로는 로직 X
	- 컴파일러나 런타임 라이브러리가 이 정보를 읽어 특정 처리를 수행

### 2. 애노테이션 선언 및 구성
- 키워드 `annotation class`
```kotlin
annotation class Fancy(val priority: Int)
```

### 3. 메타-애노테이션 (Meta-Annotations)
- 애노테이션을 위한 애노테이션
	- 애노테이션 정의 시 사용

**종류**
- **`@Target`**: 애노테이션이 붙을 수 있는 위치를 지정합니다. (클래스, 함수, 프로퍼티, 표현식 등)
- **`@Retention`**: 애노테이션 정보가 언제까지 유지될지 결정합니다.
    - `SOURCE`: 소스 코드에만 존재, 컴파일 후 제거.
    - `BINARY`: 클래스 파일에 포함되지만 런타임에 리플렉션으로 읽기 불가.
    - `RUNTIME`: 런타임에도 유지되어 리플렉션으로 접근 가능 (가장 흔히 사용).
- **`@Repeatable`**: 동일한 요소에 여러 번 붙일 수 있게 합니다.
- **`@MustBeDocumented`**: API 문서(Dokka/Javadoc)에 포함되도록 설정합니다.

### 4. 사용 지점 대상 (Use-site Targets)
- 사용 이유
	- `Kotlin Property` -> `JVM` 을 위한 코드(`java bytecode`) 로 변환 시, 필드(Field), 게터(Getter), 세터(Setter)로 분리.
	- 필드(Field), 게터(Getter), 세터(Setter) 중 특정 부분에만 특정 애노테이션을 적용시키고 싶은 경우에 사용하도록 하는 수요 존재.

| **대상**         | **설명**                          |
| -------------- | ------------------------------- |
| **`field`**    | 자바 필드에 직접 적용                    |
| **`get`**      | 프로퍼티 게터에 적용                     |
| **`set`**      | 프로퍼티 세터에 적용                     |
| **`param`**    | 생성자 파라미터에 적용                    |
| **`property`** | 코틀린 프로퍼티 전체에 적용 (자바에서는 읽을 수 없음) |

```kotlin
class User(
    @field:NotNull val name: String, // 자바 필드에 NotNull 적용
    @get:JsonProperty("user_id") val id: String // 게터에 JSON 필드명 지정
)
```

### 4. 주요 표준 애노테이션 (JVM Interop)

코틀린과 자바를 함께 사용할 때(Spring 환경 등) 필수적인 애노테이션들입니다.

- **`@JvmStatic`**: 객체(object)나 동반 객체(companion object)의 멤버를 실제 자바 static 멤버로 생성합니다.
- **`@JvmOverloads`**: 기본값이 있는 코틀린 함수에 대해 자바에서 호출 가능한 여러 개의 오버로딩 생성자를/함수를 자동으로 만들어줍니다.
- **`@JvmField`**: 프로퍼티를 게터/세터 없이 공개된(public) 자바 필드로 노출합니다.
- **`@Throws`**: 코틀린은 체크 예외(Checked Exception)가 없지만, 자바에서 예외 처리를 강제할 수 있도록 선언합니다.