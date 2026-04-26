# Architecture — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Padrão arquitetural

**Layered Architecture (Controller → ApplicationService → Repository)** com pacotes por responsabilidade técnica. Sem DDD explícito — não há domain model separado de entity model.

## Estrutura de pacotes

```
com.smartmarketplace/
├── controller/         ← REST controllers (@RestController)
├── service/            ← Application services + AiServiceClient + AiSyncClient
├── repository/         ← Spring Data JPA repositories + Specifications
├── entity/             ← JPA entities
├── dto/                ← Request/Response DTOs (Java Records)
├── config/             ← Spring configuration beans
├── exception/          ← GlobalExceptionHandler + custom exceptions
└── ApiServiceApplication.java
```

## Camada Controller

Controllers são thin — apenas validação de parâmetros HTTP, delegação ao ApplicationService, e mapeamento de resposta. Exemplo:
```java
@GetMapping("/{clientId}")
public ResponseEntity<RecommendationResponseDTO> recommend(
        @PathVariable UUID clientId,
        @RequestParam(defaultValue = "10") int limit) {
    if (limit < 1 || limit > 50) throw new BusinessRuleException("...");
    return ResponseEntity.ok(recommendationService.recommend(clientId, limit));
}
```

## Camada ApplicationService

Lógica de negócio, transações, cache. Nomenclatura: `XxxApplicationService` (ex: `ProductApplicationService`, `ClientApplicationService`). Exceção: `RecommendationService` (sem "Application") e `AiServiceClient` / `AiSyncClient`.

## Dois clientes para o AI Service

**AiServiceClient** (WebClient + Resilience4j):
- Chama `POST /api/v1/recommend` no ai-service
- Circuit breaker `aiService` com fallback `emptyFallback()` → `Optional.empty()`
- Micrometer timer em cada call (`ai.service.call.duration`)
- Usa `WebClient.block()` — síncrono mas em virtual thread (aceitável)

**AiSyncClient** (java.net.http.HttpClient, fire-and-forget):
- Chama `POST /api/v1/embeddings/sync-product` quando produto é criado
- Roda em `Thread.ofVirtual()` — genuinamente fire-and-forget
- Sem circuit breaker — falhas logadas como WARN, não propagadas

## Error handling centralizado

`GlobalExceptionHandler` (@RestControllerAdvice) mapeia exceções para HTTP:

| Exceção | HTTP | 
|---|---|
| `ResourceNotFoundException` | 404 |
| `BusinessRuleException` | 400 |
| `MethodArgumentNotValidException` | 400 (campo: mensagem) |
| `ConstraintViolationException` | 400 |
| `DataIntegrityViolationException` | 409 |
| `Throwable` (catch-all) | 500 |

Response sempre usa `ErrorResponse` record com `timestamp`, `status`, `error`, `message`, `path`, `traceId` (do MDC).

## Cache (Caffeine)

`@Cacheable(value = CacheNames.CATALOG_LIST, key = "#page + '-' + #size + '-' + ...")` em `ProductApplicationService.listProducts()`. `@CacheEvict(allEntries = true)` em `createProduct()`. TTL configurado em `CacheConfig`.

## Observabilidade

- Actuator: `/actuator/health` (liveness), `/actuator/metrics`, `/actuator/info`
- Prometheus: `/actuator/prometheus` via micrometer-registry-prometheus
- Logs JSON: Logback + logstash-logback-encoder com `traceId` por request (TraceIdFilter via MDC)
- Custom metric: `ai.service.call.duration` (timer) em AiServiceClient
