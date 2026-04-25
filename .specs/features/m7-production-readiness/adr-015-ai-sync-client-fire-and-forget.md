# ADR-015: AiSyncClient fire-and-forget via Virtual Thread (Java 21)

**Status**: Accepted
**Date**: 2026-04-25
**Revised**: 2026-04-25 — substituição de `.subscribe()` Reactor por `Thread.ofVirtual()` após parecer do Comitê

## Context

Após `POST /api/v1/products` persistir um produto no PostgreSQL, o api-service deve notificar o ai-service para criar o nó Neo4j e gerar o embedding (GAP-02). A notificação não pode bloquear o 201 e não pode falhar o cadastro quando o ai-service estiver indisponível (M7-04).

A decisão original propunha `WebClient.subscribe()` (Reactor fire-and-forget). O Comitê identificou dois achados High que invalidam essa abordagem:

1. O projeto usa `spring-boot-starter-web` (servlet stack) como runtime primário. O `spring-boot-starter-webflux` está presente apenas para o `WebClient` do `AiServiceClient.recommend()` — que chama `.block()` e não usa o modelo reativo. Usar `.subscribe()` mistura dois modelos de threading em um call site que parece síncrono para o leitor (CUPID-I violado).
2. Se o scheduler `boundedElastic` do Reactor estiver saturado, a task pode ser dropada silenciosamente sem log no thread principal — risco de observabilidade não aceitável. Virtual threads falham com exceção loggável.

Java 21 + Spring Boot 3.3 oferecem `Thread.ofVirtual()` como alternativa nativa: custo ~few KB por thread, zero dependência de scheduler externo, semanticamente óbvio no idioma servlet do projeto.

## Decision

`AiSyncClient.notifyProductCreated()` usa `Thread.ofVirtual().name("ai-sync-" + productId).start(runnable)` para disparar a chamada HTTP em background. Dentro da virtual thread, usa `java.net.http.HttpClient` (built-in, sem dependência de Reactor) para `POST /api/v1/embeddings/sync-product`. Erros são capturados no `catch` e logados como WARN com `productId`.

```java
@Service
public class AiSyncClient {
    private static final Logger log = LoggerFactory.getLogger(AiSyncClient.class);
    private final java.net.http.HttpClient httpClient;
    private final String aiServiceBaseUrl;

    public AiSyncClient(@Value("${ai.service.base-url}") String aiServiceBaseUrl) {
        this.aiServiceBaseUrl = aiServiceBaseUrl;
        this.httpClient = java.net.http.HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();
    }

    public void notifyProductCreated(ProductDetailDTO product) {
        Thread.ofVirtual()
            .name("ai-sync-" + product.id())
            .start(() -> {
                try {
                    var body = buildPayload(product);
                    var request = HttpRequest.newBuilder()
                        .uri(URI.create(aiServiceBaseUrl + "/api/v1/embeddings/sync-product"))
                        .header("Content-Type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(body))
                        .timeout(Duration.ofSeconds(10))
                        .build();
                    httpClient.send(request, HttpResponse.BodyHandlers.discarding());
                } catch (Exception e) {
                    log.warn("[AiSync] notifyProductCreated failed for productId={}: {}",
                             product.id(), e.getMessage());
                }
            });
    }
}
```

## Alternatives considered

- **`WebClient.subscribe()` (Reactor)**: eliminado — mistura modelos de threading em projeto servlet (CUPID-I); task pode ser dropada silenciosamente se `boundedElastic` estiver saturado (Staff Engineering High + PSA High); não testável com Mockito padrão sem `CountDownLatch`.
- **`@Async` + `ThreadPoolTaskExecutor`**: equivalente funcional mas requer configuração de bean de executor e `@EnableAsync` — mais cerimônia que `Thread.ofVirtual()` para um único call site (Rule of Three: um call site não justifica abstração de pool).
- **`.block()` com `@CircuitBreaker`**: eliminado — bloqueia thread do request; viola M7-04 quando ai-service demora ~2–5s para gerar embedding.

## Consequences

- `ProductApplicationService.createProduct()` retorna 201 sem nenhuma dependência de estado do ai-service — M7-04 satisfeito.
- Virtual thread com nome `ai-sync-{productId}` é visível em thread dumps e ferramentas de diagnóstico (JFR, VisualVM) — observabilidade superior ao Reactor scheduler.
- `AiSyncClient` não depende de `WebClient` nem de Reactor — testável com Mockito padrão: `verify(aiSyncClient).notifyProductCreated(product)` verifica o call; o comportamento interno da virtual thread é testado com um `ArgumentCaptor` sobre o `HttpClient` mockado.
- `spring-boot-starter-webflux` permanece no classpath por ora (necessário para `AiServiceClient.recommend()` que usa `WebClient.block()`). Remoção completa requer reescrever `AiServiceClient` com `java.net.http.HttpClient` — registrado como Deferred Idea.
- Se `spring.threads.virtual.enabled=true` estiver ativo (recomendado com Spring Boot 3.3 + Java 21), os requests HTTP também rodam em virtual threads, e `Thread.ofVirtual()` em `notifyProductCreated` é consistente com o modelo do container.

