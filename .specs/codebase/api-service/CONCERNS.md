# Concerns — API Service
**Serviço:** api-service (Java 21 / Spring Boot 3.3)
**Analisado:** 2026-04-26

---

## Alta Severidade

### C-J01: AiSyncClient usa JSON manual sem Jackson — frágil para campos complexos
**Arquivo:** `src/main/java/.../service/AiSyncClient.java` método `buildPayload()`
**Problema:** Payload construído via `String.format()` com `escapeJson()` manual. Qualquer campo com aspas duplas, newlines ou caracteres Unicode especiais no nome/descrição do produto pode produzir JSON inválido. Jackson (já no classpath via Spring Boot) deveria ser usado.
**Fix:** Injetar `ObjectMapper` e serializar com `objectMapper.writeValueAsString(payloadMap)`.

---

## Média Severidade

### C-J02: spring-boot-starter-webflux no classpath — `WebClient.block()` é o único uso
**Arquivo:** `pom.xml` linha 44 + `AiServiceClient.java`
**Contexto:** Decisão já avaliada e deferida conscientemente (ver STATE.md — Deferred Ideas: "Remoção de `spring-boot-starter-webflux` do api-service").
**Problema:** `spring-boot-starter-webflux` adiciona Netty e Project Reactor ao classpath apenas para `WebClient.block()` em `AiServiceClient.recommend()`. O `AiSyncClient` já foi migrado para `java.net.http.HttpClient` (virtual thread fire-and-forget). Resta `AiServiceClient` como único consumidor do WebClient.
**Fix quando oportuno:** Reescrever `AiServiceClient.callAiService()` com `java.net.http.HttpClient` (mesmo padrão do `AiSyncClient`) e remover `spring-boot-starter-webflux` do `pom.xml`. Elimina Netty como dependência transitiva.
**Por que deferido:** Baixo risco atual na rede interna Docker; escopo do M7 não justificava o refactor.

### C-J03: Testcontainers IT tests compartilham container — risco de dirty data
**Arquivo:** `src/test/java/.../controller/BaseIntegrationTest.java`
**Problema:** Container PostgreSQL declarado como `static` — compartilhado entre todos os IT tests da mesma JVM. Se um teste cria dados e não limpa em `@AfterEach`, o próximo teste vê dados residuais. Dependendo da ordem de execução (que pode variar), testes podem passar em CI e falhar localmente ou vice-versa.
**Fix:** Garantir `@Transactional` + `@Rollback` nos IT tests, ou `@Sql(scripts = "cleanup.sql")` em `@AfterEach`, ou migrar para Testcontainers com `@DirtiesContext` por test class.

### C-J04: AiSyncClient sem circuit breaker — pode acumular virtual threads em burst
**Arquivo:** `src/main/java/.../service/AiSyncClient.java`
**Problema:** `Thread.ofVirtual().start(runnable)` cria uma nova virtual thread por produto criado. Se o ai-service estiver lento e 100 produtos forem criados em burst (ex: via seed script), 100 virtual threads ficam pendentes com timeout de 10s cada. Virtual threads são baratos, mas 100 conexões pendentes para o ai-service podem saturar o connection pool HTTP.
**Fix:** Adicionar `Semaphore` ou `p-limit` equivalente Java (`ExecutorService` com pool limitado) para limitar o número de threads de sync simultâneas. Ex: `Executors.newVirtualThreadPerTaskExecutor()` com `Semaphore(10)`.

---

## Baixa Severidade

### C-J05: `RecommendationController` usa GET com `clientId` no path — inconsistente com o ai-service
**Arquivo:** `src/main/java/.../controller/RecommendationController.java`
**Problema:** O frontend proxy (`app/api/proxy/recommend/route.ts`) chama `POST /api/v1/recommend` mas o `RecommendationController` expõe `GET /api/v1/recommend/{clientId}`. O adaptador `recommend.ts` no frontend faz POST para o proxy, que faz POST para o ai-service (não para o api-service). A rota Java é acessada apenas quando o ai-service retorna resultado — o flow é: frontend → proxy → ai-service → (internamente sem chamar o api-service). O api-service é chamado pelo ai-service internamente para buscar orders durante o treino. Isso é funcional mas não óbvio.
**Fix:** Documentar o fluxo no Swagger com nota explicando que `GET /recommend/{clientId}` é o endpoint público e que ele chama o ai-service via AiServiceClient internamente.

### C-J06: Coverage mínimo de 60% — baixo para um serviço de produção
**Arquivo:** `pom.xml` (jacoco config)
**Problema:** 60% de line coverage em `service.*` é o mínimo configurado. Para um serviço que gerencia pedidos e dados financeiros de clientes B2B, o ideal seria 80%+.
**Fix:** Aumentar gradualmente para 70% e depois 80% conforme testes são adicionados.
