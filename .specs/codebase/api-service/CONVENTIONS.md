# Conventions — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Nomenclatura de classes

| Tipo | Padrão | Exemplos |
|---|---|---|
| Controller | `XxxController` | `ProductController`, `ClientController`, `RecommendationController` |
| Application Service | `XxxApplicationService` | `ProductApplicationService`, `OrderApplicationService` |
| Repository (JPA) | `XxxRepository` | `ProductRepository`, `ClientRepository` |
| JPA Entity | `Xxx` (sem sufixo) | `Product`, `Client`, `Order`, `OrderItem` |
| DTO de resposta | `XxxDTO` ou `XxxResponseDTO` | `ProductSummaryDTO`, `RecommendationResponseDTO` |
| DTO de request | `CreateXxxRequest` ou `XxxRequest` | `CreateProductRequest`, `CreateOrderRequest` |
| Exception customizada | `XxxException` | `ResourceNotFoundException`, `BusinessRuleException` |
| Config bean | `XxxConfig` | `CacheConfig`, `WebClientConfig`, `AiServiceConfig` |

## DTOs como Java Records

Todos os DTOs são `record` (Java 16+):
```java
public record ProductSummaryDTO(
    UUID id, String sku, String name, String category,
    BigDecimal price, String supplierName, List<String> availableCountries
) {}
```

## Injeção de dependência

Constructor injection em todos os services e controllers (sem `@Autowired` em campo):
```java
public ProductApplicationService(ProductRepository productRepository,
                                 SupplierRepository supplierRepository,
                                 CountryRepository countryRepository,
                                 AiSyncClient aiSyncClient) {
    this.productRepository = productRepository;
    // ...
}
```

## Anotações de Spring

- `@Service` em application services
- `@RestController` + `@RequestMapping` em controllers
- `@Repository` implícito em interfaces JPA (extends `JpaRepository`)
- `@Cacheable` / `@CacheEvict` em métodos de serviço (não no controller)
- `@Transactional(readOnly = true)` em operações de leitura
- `@Transactional` em operações de escrita

## Swagger annotations

Todos os endpoints documentados com:
```java
@Operation(summary = "...")
@ApiResponse(responseCode = "200", description = "...")
@Tag(name = "...", description = "...")
```

## Pacote raiz

`com.smartmarketplace` — todos os pacotes são subpacotes diretos.

## Checkstyle

Configurado em `checkstyle.xml`. Aplicado via `maven-checkstyle-plugin` no goal `verify`. Exclui arquivos de teste (`**/*IT.java`, `**/*Test.java`). `failsOnError = true` — build falha com violations.

## Logging

`LoggerFactory.getLogger(XxxClass.class)` via SLF4J. Logger declarado como `private static final`. MDC `traceId` injetado automaticamente pelo `TraceIdFilter` em cada request.
