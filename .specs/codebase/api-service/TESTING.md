# Testing — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Frameworks

| Tipo | Framework | Versão |
|---|---|---|
| Unit | JUnit 5 + Mockito + AssertJ | via spring-boot-starter-test |
| Integration | Testcontainers (PostgreSQL) | via spring-boot-testcontainers |
| Coverage | JaCoCo | 0.8.12 |
| Code quality | Checkstyle | maven-checkstyle-plugin 3.4.0 |

## Organização dos testes

```
src/test/java/com/smartmarketplace/
├── controller/
│   ├── BaseIntegrationTest.java     ← @SpringBootTest + @Testcontainers + setup data
│   ├── ClientControllerIT.java      ← IT test: GET /clients
│   ├── OrderControllerIT.java       ← IT test: POST /orders
│   └── ProductControllerIT.java     ← IT test: POST /products + GET /products
└── service/
    ├── ClientApplicationServiceTest.java   ← unit com Mockito
    ├── OrderApplicationServiceTest.java    ← unit com Mockito
    ├── ProductApplicationServiceTest.java  ← unit com Mockito
    └── RecommendationServiceTest.java      ← unit com Mockito
```

## Padrão de testes unitários (service/)

```java
@ExtendWith(MockitoExtension.class)
class ProductApplicationServiceTest {
    @Mock ProductRepository productRepository;
    @Mock SupplierRepository supplierRepository;
    @Mock AiSyncClient aiSyncClient;
    @InjectMocks ProductApplicationService service;

    @Test void createProduct_whenValidRequest_savesAndNotifiesAiService() { ... }
}
```

## Padrão de testes de integração (controller/)

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
class BaseIntegrationTest {
    @Container static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16");
    @Autowired TestRestTemplate restTemplate;
}
```
Testcontainers sobe PostgreSQL real. Spring Boot auto-configura datasource via `DynamicPropertySource`. Dados de seed inseridos em `@BeforeEach` ou `@BeforeAll` no base class.

## Coverage

- **Regra JaCoCo:** mínimo 60% line coverage em `com.smartmarketplace.service.*`
- **Exclusão explícita:** `AiServiceClient` excluído do check (exercitado via E2E, não mockável facilmente)
- **Execução:** `./mvnw verify` executa unit + IT + JaCoCo merge + check

## Coverage Matrix por camada

| Camada | Tipo de teste | Localização | Cobertura mínima |
|---|---|---|---|
| `service/*ApplicationService` | Unit (Mockito) | `test/.../service/` | 60% line (enforced) |
| `service/RecommendationService` | Unit (Mockito) | `test/.../service/` | 60% line (enforced) |
| `service/AiServiceClient` | **excluído do JaCoCo** | — | N/A |
| `service/AiSyncClient` | **não testado** | — | não enforced |
| `controller/*` | IT (Testcontainers) | `test/.../controller/` | não enforced |
| `repository/*` | coberto indiretamente via IT | — | não enforced |
| `entity/*` | **não testado** | — | — |
| `config/*` | **não testado** | — | — |

## Parallelism Assessment

| Tipo | Parallel-safe? | Evidência |
|---|---|---|
| Mockito unit | Sim | Sem estado compartilhado |
| Testcontainers IT | Sim (com cuidado) | Container compartilhado via `static` — riscos de dirty data entre testes |

## Gate Check Commands

| Gate | Quando usar | Comando |
|---|---|---|
| Quick | Após mudanças em service | `./mvnw test` |
| Full | Após feature com IT tests | `./mvnw verify` |
| Build | Fase completa | `./mvnw verify` (inclui checkstyle + jacoco) |
