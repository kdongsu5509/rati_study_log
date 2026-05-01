참고 : [@JdbcTest Spring Docs](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/jdbc/test/autoconfigure/JdbcTest.html)

## 역할
- `JDBC` 의 테스트에 관련된 컴포넌트의 `auto-configuration` 을 담당.
	- 그 외 다른 `Configuration`  및 `Component` 에 대해서는 다루지 않음.
		- 스캔하지 않음 : `@Component`, `@Service`, `@Repository
		- 스캔함 : `@Repository`
			- 추가로 `DataSource`, `JdbcTemplate`, `NamedParameterJdbcTemplate`
#### 기본 설정
-  `@Transactional` 애노테이션 자동 적용 -> 테스트 수행 이후 `roll-back` 수행.
- 내장 `in-memory` 저장소 사용
	- `@JdbcTest` 가 내부적으로 `@AutoConfigureTestDatabase` 설정 가지고 있음.

#### 기본 설정을 회피하는 방법들
	- -> 해당 설정은 `@AutoConfigureTestDatabase` 를 이용하면 `override` 가능.
1. `내장 in-memory` 저장소 사용
	->  `@AutoConfigureTestDatabase` 를 이용하여 `DataSource` 설정 `override`
	```java
	@JdbcTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
	```
	
2. 모든 `application configuration` 로딩 + 실제 데이터베이스 사용 희망
	-> `@SpringBootTest` 애노테이션을 활용 

```java
@Target(ElementType.TYPE)  
@Retention(RetentionPolicy.RUNTIME)  
@Documented  
@Inherited  
@BootstrapWith(JdbcTestContextBootstrapper.class)  
@ExtendWith(SpringExtension.class)  
@OverrideAutoConfiguration(enabled = false)  
@TypeExcludeFilters(JdbcTypeExcludeFilter.class)  
@Transactional  
@AutoConfigureCache  
@AutoConfigureJdbc  
@AutoConfigureTestDatabase  
@ImportAutoConfiguration  
public @interface JdbcTest {  
  
    /**  
     * Properties in form {@literal key=value} that should be added to the Spring  
     * {@link Environment} before the test runs.  
     * @return the properties to add  
     * @since 2.1.0  
     */    String[] properties() default {};  
  
    /**  
     * Determines if default filtering should be used with     * {@link SpringBootApplication @SpringBootApplication}. By default no beans are  
     * included.     * @see #includeFilters()  
     * @see #excludeFilters()  
     * @return if default filters should be used  
     */    boolean useDefaultFilters() default true;  
  
    /**  
     * A set of include filters which can be used to add otherwise filtered beans to the     * application context.     * @return include filters to apply  
     */    ComponentScan.Filter[] includeFilters() default {};  
  
    /**  
     * A set of exclude filters which can be used to filter beans that would otherwise be     * added to the application context.     * @return exclude filters to apply  
     */    ComponentScan.Filter[] excludeFilters() default {};  
  
    /**  
     * Auto-configuration exclusions that should be applied for this test.     * @return auto-configuration exclusions to apply  
     */    @AliasFor(annotation = ImportAutoConfiguration.class, attribute = "exclude")  
    Class<?>[] excludeAutoConfiguration() default {};  
  
}
```

