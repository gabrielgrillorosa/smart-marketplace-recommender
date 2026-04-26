# Integrations — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## PostgreSQL (Spring Data JPA)

**Propósito:** Persistência de produtos, clientes, pedidos, fornecedores, países
**Driver:** `org.postgresql:postgresql` (runtime scope)
**ORM:** Hibernate via Spring Data JPA
**Repositories:** `JpaRepository<Entity, UUID>` com `JpaSpecificationExecutor` em `ProductRepository`
**Transações:** `@Transactional` nos ApplicationServices; `readOnly = true` para leituras
**Configuração:** `spring.datasource.*` em `application.yml`

## AI Service (TypeScript :3001) — dois clientes

### AiServiceClient (WebClient + Resilience4j)
**Propósito:** Obter recomendações híbridas para um cliente
**Endpoint:** `POST /api/v1/recommend` com body `{ clientId, limit }`
**Implementação:** `WebClient` configurado em `WebClientConfig.java` com base URL via `@Value("${ai.service.base-url}")`
**Resiliência:** `@CircuitBreaker(name = "aiService", fallbackMethod = "emptyFallback")` — retorna `Optional.empty()` quando o ai-service está fora, ativando fallback de top sellers
**Métrica:** Timer Micrometer `ai.service.call.duration` com tag `outcome: success|fallback`
**Nota:** usa `WebClient.block()` — síncrono em virtual thread (aceitável, mas mantém `spring-boot-starter-webflux` no classpath)

### AiSyncClient (java.net.http.HttpClient)
**Propósito:** Notificar o ai-service quando produto é criado para gerar embedding imediatamente
**Endpoint:** `POST /api/v1/embeddings/sync-product`
**Implementação:** `java.net.http.HttpClient` puro, virtual thread fire-and-forget via `Thread.ofVirtual()`
**Payload:** JSON construído manualmente (sem Jackson) — `buildPayload(product)` com `escapeJson()`
**Failure mode:** falhas logadas como WARN, não propagadas ao caller
**Timeout:** 10s para a requisição HTTP

## Swagger / OpenAPI

**Propósito:** Documentação automática da API
**Biblioteca:** `springdoc-openapi-starter-webmvc-ui` 2.5.0
**URL:** `/swagger-ui.html` (redireciona para `/swagger-ui/index.html`)
**OpenAPI spec:** `/v3/api-docs`
**Anotações:** `@Operation`, `@ApiResponse`, `@Tag` em todos os controllers

## Spring Actuator

| Endpoint | Propósito |
|---|---|
| `/actuator/health` | Liveness + Readiness (inclui DB connectivity) |
| `/actuator/metrics` | Métricas JVM + custom |
| `/actuator/prometheus` | Scrape Prometheus via Micrometer |
| `/actuator/info` | Informações da aplicação |

## Resilience4j (Circuit Breaker)

**Propósito:** Proteção contra falha do AI Service
**Scope:** apenas `AiServiceClient.recommend()`
**Fallback:** `RecommendationService` detecta `Optional.empty()` e chama `FallbackRecommendationQuery` (top sellers por pedidos)
**Configuração:** `application.yml` seção `resilience4j.circuitbreaker`

## Micrometer + Logstash

**Propósito:** Observabilidade
**Metrics:** `ai.service.call.duration`, métricas JVM padrão, cache hit/miss Caffeine
**Logs:** JSON estruturado via `logstash-logback-encoder`; `traceId` por request via `TraceIdFilter` + MDC

## Caffeine Cache

**Propósito:** Cache de catálogo de produtos (evita queries repetidas)
**TTL:** Configurado em `CacheConfig.java`
**Cache name:** `CacheNames.CATALOG_LIST`
**Eviction:** `@CacheEvict(allEntries = true)` em `createProduct()`
