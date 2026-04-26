# Structure — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Árvore de diretórios

```
api-service/
├── src/
│   ├── main/
│   │   ├── java/com/smartmarketplace/
│   │   │   ├── config/
│   │   │   │   ├── AiServiceConfig.java          ← @Value ai.service.base-url
│   │   │   │   ├── CacheConfig.java              ← Caffeine TTL
│   │   │   │   ├── CacheNames.java               ← constantes de nomes de cache
│   │   │   │   ├── TraceIdFilter.java            ← MDC traceId por request
│   │   │   │   ├── WebClientConfig.java          ← WebClient bean para ai-service
│   │   │   │   └── WebMvcConfig.java             ← CORS config
│   │   │   ├── controller/
│   │   │   │   ├── ClientController.java
│   │   │   │   ├── OrderController.java
│   │   │   │   ├── ProductController.java
│   │   │   │   └── RecommendationController.java
│   │   │   ├── dto/
│   │   │   │   ├── ClientDetailDTO.java          ← record
│   │   │   │   ├── ClientSummaryDTO.java         ← record
│   │   │   │   ├── CreateOrderRequest.java       ← record
│   │   │   │   ├── CreateProductRequest.java     ← record
│   │   │   │   ├── ErrorResponse.java            ← record
│   │   │   │   ├── OrderDTO.java                 ← record
│   │   │   │   ├── OrderItemDTO.java             ← record
│   │   │   │   ├── PagedResponse.java            ← record genérico
│   │   │   │   ├── ProductDetailDTO.java         ← record
│   │   │   │   ├── ProductSummaryDTO.java        ← record
│   │   │   │   ├── PurchaseSummaryDTO.java       ← record
│   │   │   │   ├── RecommendationItemDTO.java    ← record
│   │   │   │   └── RecommendationResponseDTO.java ← record
│   │   │   ├── entity/
│   │   │   │   ├── Client.java
│   │   │   │   ├── Country.java
│   │   │   │   ├── Order.java
│   │   │   │   ├── OrderItem.java
│   │   │   │   ├── Product.java
│   │   │   │   └── Supplier.java
│   │   │   ├── exception/
│   │   │   │   ├── BusinessRuleException.java
│   │   │   │   ├── GlobalExceptionHandler.java
│   │   │   │   └── ResourceNotFoundException.java
│   │   │   ├── repository/
│   │   │   │   ├── ClientRepository.java
│   │   │   │   ├── CountryRepository.java
│   │   │   │   ├── FallbackRecommendationQuery.java ← top sellers query
│   │   │   │   ├── OrderItemRepository.java
│   │   │   │   ├── OrderRepository.java
│   │   │   │   ├── ProductRepository.java
│   │   │   │   ├── ProductSpecifications.java    ← JPA Specifications
│   │   │   │   └── SupplierRepository.java
│   │   │   ├── service/
│   │   │   │   ├── AiServiceClient.java          ← WebClient + circuit breaker
│   │   │   │   ├── AiSyncClient.java             ← HttpClient fire-and-forget
│   │   │   │   ├── ClientApplicationService.java
│   │   │   │   ├── OrderApplicationService.java
│   │   │   │   ├── ProductApplicationService.java
│   │   │   │   └── RecommendationService.java
│   │   │   └── ApiServiceApplication.java
│   │   └── resources/
│   │       ├── application.yml
│   │       └── checkstyle.xml
│   └── test/
│       └── java/com/smartmarketplace/
│           ├── controller/
│           │   ├── BaseIntegrationTest.java      ← Testcontainers base class
│           │   ├── ClientControllerIT.java
│           │   ├── OrderControllerIT.java
│           │   └── ProductControllerIT.java
│           └── service/
│               ├── ClientApplicationServiceTest.java
│               ├── OrderApplicationServiceTest.java
│               ├── ProductApplicationServiceTest.java
│               └── RecommendationServiceTest.java
│
├── pom.xml
└── Dockerfile
```

## Mapeamento capacidades → locais

| Capacidade | Localização |
|---|---|
| REST endpoints | `controller/` |
| Lógica de negócio | `service/*ApplicationService.java` |
| Chamada ao AI Service (recommend) | `service/AiServiceClient.java` |
| Sync de produto para AI Service | `service/AiSyncClient.java` |
| Acesso a dados PostgreSQL | `repository/` |
| JPA entities | `entity/` |
| DTOs de request/response | `dto/` |
| Error handling centralizado | `exception/GlobalExceptionHandler.java` |
| Cache config | `config/CacheConfig.java` |
| Observabilidade | `config/TraceIdFilter.java` + Actuator + Micrometer |
| Testes unitários | `test/.../service/` |
| Testes de integração | `test/.../controller/` |
