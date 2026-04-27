### 1. 숫자 범위와 진행 (Ranges & Progressions)
```kotlin
// [1] 기본 닫힌 범위 (Inclusive): [1, 5]
for (i in 1..5) print("$i ") // 1 2 3 4 5

// [2] 마지막 제외 범위 (Exclusive): [1, 5)
for (i in 1 until 5) print("$i ") // 1 2 3 4
for (i in 1..<5) print("$i ")    // 1 2 3 4 (Kotlin 1.9+ 권장 문법)

// [3] 역방향 진행 (DownTo): [5, 1]
for (i in 5 downTo 1) print("$i ") // 5 4 3 2 1

// [4] 증가폭 제어 (Step): 2씩 건너뛰기
for (i in 1..10 step 2) print("$i ")   // 1 3 5 7 9
for (i in 10 downTo 1 step 3) print("$i ") // 10 7 4 1

// [5] 문자 범위 순회 (Char Range)
for (char in 'a'..'e') print("$char ") // a b c d e
```

---

### 2. 컬렉션 순회 (Collection Iteration)
```kotlin
val techs = listOf("Java", "Spring", "Kotlin", "Flutter")

// [1] 단순 요소 순회 (Element-only)
for (tech in techs) {
    println("Tech: $tech")
}

// [2] 인덱스만 순회 (Index-only)
// techs.size를 직접 쓰지 않고 프로퍼티를 사용하여 안전함
for (idx in techs.indices) {
    println("Index $idx: ${techs[idx]}")
}

// [3] 인덱스와 요소를 동시에 (Destructuring)
// 실무에서 가장 빈번하게 사용되는 가독성 높은 패턴
for ((idx, tech) in techs.withIndex()) {
    println("[$idx] $tech")
}

// [4] 필터링과 함께 순회 (Loop with Condition)
for (tech in techs) {
    if (tech.startsWith("K")) println("Special: $tech")
}
```

---

### 3. Map 객체 파괴 (Map & Destructuring)
자바에서 `Entry` 객체를 일일이 다루던 복잡성 -> 구조 분해 할당으로 해결
```kotlin
val statusCodes = mapOf(
    200 to "OK",
    404 to "Not Found",
    500 to "Internal Server Error"
)

// [1] Key-Value 직접 분해 순회
for ((code, message) in statusCodes) {
    println("HTTP $code -> $message")
}

// [2] Key 또는 Value만 순회
for (code in statusCodes.keys) print("$code ")
for (msg in statusCodes.values) print("$msg ")

// [3] 람다를 이용한 순회 (Internal Iteration)
statusCodes.forEach { (code, msg) ->
    if (code >= 400) println("Error: $msg")
}
```

### 4. 고차 함수와 결합된 순회 (Functional API)
```kotlin
val numbers = (1..10).toList()

// [1] 조건부 순회 및 변환
numbers.filter { it % 2 == 0 } // 짝수만 필터링
       .map { it * it }        // 제곱으로 변환
       .forEach { println("Even Squared: $it") }

// [2] 인덱스 기반 함수형 순회
techs.forEachIndexed { idx, name ->
    println("Priority $idx: $name")
}
```