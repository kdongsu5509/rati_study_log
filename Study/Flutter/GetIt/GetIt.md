- `Dart` 와 `Flutter` 을 위한 서비스 로케이터.
- `BuildContext` 를 사용하지 않음.

**주요 장점**
- ✅ **Extremely fast** - O(1) lookup using Dart's Map
- ✅ **Easy to test** - Switch implementations for mocks in tests
- ✅ **No BuildContext needed** - Access from anywhere in your app (UI, business logic, anywhere)
- ✅ **Type safe** - Compile-time type checking
- ✅ **No code generation** - Works without build_runner

**간단한 사용법**
1. `main.dart` 에서 등록
2. `GetIt Conatiner` 에 저장
3. 모든 곳에서 사용(`Widget` `Business Logic` `Service` 등)

### 목차
[[1. Object Registration - Basic]]
[[2. Object Registration - Deeping]]
[[3. Scopes - 기초]]
[[4. Scopes - 심화]]