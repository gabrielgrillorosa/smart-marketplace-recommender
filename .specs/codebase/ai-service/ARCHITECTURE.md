# Architecture — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Padrão arquitetural

**Camadas modulares com injeção de dependência via constructor.** Todas as dependências são instanciadas em `src/index.ts` (composition root) e injetadas via constructor nas classes que precisam delas. Não há container IoC.

## Sequência de startup (src/index.ts)

```
1. Fastify + CORS register
2. Neo4j driver singleton (neo4j.driver)
3. Neo4jRepository(driver)
4. EmbeddingService(EMBEDDING_MODEL)
5. VersionedModelStore() → loadCurrent() (carrega modelo do symlink /tmp/model/current)
6. embeddingService.init() [BLOQUEANTE — 30-60s no primeiro boot]
7. ModelTrainer(versionedModelStore, repo, embeddingService, API_SERVICE_URL, weights)
8. TrainingJobRegistry(modelTrainer, versionedModelStore)
9. CronScheduler(trainingJobRegistry) → start()
10. RecommendationService(versionedModelStore, repo, weights, logger)
11. SearchService(embeddingService, repo)
12. RAGService(embeddingService, repo, OPENROUTER_API_KEY, LLM_MODEL, OPENROUTER_BASE_URL)
13. Registrar rotas com prefixo /api/v1
14. fastify.listen({ port, host: '0.0.0.0' })
```

## Diagrama de camadas

```
src/
├── config/env.ts              ← ENV object (frozen, validação no startup)
├── repositories/
│   └── Neo4jRepository        ← toda I/O com Neo4j (graph + vector)
├── services/
│   ├── EmbeddingService       ← @xenova/transformers (warm-up no startup)
│   ├── ModelStore             ← base: get/set model, isReady
│   ├── VersionedModelStore    ← extends ModelStore: timestamp + symlink + rollback
│   ├── ModelTrainer           ← treino TF.js + syncNeo4j + computePrecisionAtK
│   ├── TrainingJobRegistry    ← job async 202 + polling
│   ├── CronScheduler          ← node-cron dispara às 02h
│   ├── RecommendationService  ← hybrid score (neural + semantic cosine)
│   ├── SearchService          ← semantic search via Neo4jVectorStore
│   └── RAGService             ← embed → vector search → LLM context → resposta
└── routes/
    ├── embeddings.ts          ← POST /embeddings/generate, POST /embeddings/sync-product
    ├── search.ts              ← POST /search/semantic
    ├── rag.ts                 ← POST /rag/query
    ├── model.ts               ← GET /model/status, GET /model/versions, GET /cron/status
    ├── recommend.ts           ← POST /recommend
    └── adminRoutes.ts         ← POST /model/train + GET /model/train/status/:jobId (X-Admin-Key)
```

## Padrão de session Neo4j

Todo método no `Neo4jRepository` segue:
```ts
const session = this.driver.session()
try {
  const result = await session.run(cypher, params)
  return mapResult(result)
} finally {
  await session.close()
}
```
Driver singleton instanciado uma vez; sessions abertas/fechadas por operação — evita leak.

## TensorFlow.js — boundary crítico

`RecommendationService.recommend()` separa I/O do TF.js:
1. Toda I/O assíncrona (Neo4j, HTTP) completa **antes** de entrar em `tf.tidy()`
2. `tf.tidy()` executa operações síncronas de tensor (predict, map, sort)
3. Tensores são liberados ao sair do `tidy()`

Motivação: `tf.tidy()` não suporta operações async dentro — misturar causa memory leak de tensores (ADR-008).

## Padrão de error customizado

Services definem erros com `statusCode`:
```ts
export class ModelNotTrainedError extends Error {
  readonly statusCode = 503
}
export class ClientNotFoundError extends Error {
  readonly statusCode = 404
}
```
Routes fazem `instanceof` check e usam `statusCode` para a resposta HTTP — sem switch/case em cada rota.
