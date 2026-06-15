##### 참고 문서
[Spring Modulith Docs](https://docs.spring.io/spring-modulith/reference/index.html)

### Spring Modulith 란?
- `Spring Boot` 애플리케이션에서 논리적 모듈을 구현할 수 있도록 지원하는 라이브러리
- 기능 중심 프로젝트 구조와 모듈 간 상호작용 방식 강제.

**특징**
- 구조적 검증 적용
- `Module` 배치 문서화
- 개별 Module 에 대한 통합 테스트 실행 가능
- 런타임 시점에서 모듈 간의 상호작용 관찰 가능.

**사용 시 장점**
- 유지보수성 향상

### 적용 방법
```gradle
dependencyManagement {
	imports {
		mavenBom 'org.springframework.modulith:spring-modulith-bom:2.1.0'
	}
}
```

[]