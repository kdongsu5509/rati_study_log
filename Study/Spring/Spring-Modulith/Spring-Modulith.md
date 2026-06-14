### 참고 문서
[Spring Modulith Docs](https://docs.spring.io/spring-modulith/reference/index.html)

> *`Spring Modulith` is an opinionated toolkit to build domain-driven, modular applications with Spring Boot. In the same way that Spring Boot has an opinion on the technical arrangement of an application, Spring Modulith implements an opinion on how to structure an app functionally and allows its individual, logical parts to interact with each other. As a result, Spring Modulith enables developers to build applications that are easier to update so they can accommodate changing business requirements over time.*


### Spring Modulith 의 특징
- **기능 중심의 프로젝트 구조와 모듈 간 상호작용 방식의 표준 매커니즘을 강제**
- `Modularity` 확보
	- 모노리스(Monolith) 아키텍처 내에서 도메인 단위로 논리적 경계(Bounded Context)를 명확히 나누고 관리할 수 있게 도움.

**이를 통한 장점**
- **유지보수성 향상**
	- 모듈 간의 결합도를 낮춤(논리적 경계를 통해)
		- -> 이를 통해 특정 모듈만 독립적인 수정 및 확장이 가능하도록 강제.

### 적용 방법
```gradle
dependencyManagement {
	imports {
		mavenBom 'org.springframework.modulith:spring-modulith-bom:2.1.0'
	}
}
```