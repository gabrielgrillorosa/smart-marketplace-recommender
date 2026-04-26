# Structure — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Árvore de diretórios

```
ai-service/
├── src/
│   ├── config/
│   │   └── env.ts                      ← ENV object frozen, validação no startup
│   ├── repositories/
│   │   └── Neo4jRepository.ts          ← toda I/O Neo4j (graph + vector)
│   ├── routes/
│   │   ├── adminRoutes.ts              ← POST /model/train + GET status (X-Admin-Key)
│   │   ├── embeddings.ts               ← POST /embeddings/generate + /sync-product
│   │   ├── model.ts                    ← GET /model/status + /versions + /cron/status
│   │   ├── rag.ts                      ← POST /rag/query
│   │   ├── recommend.ts                ← POST /recommend
│   │   └── search.ts                   ← POST /search/semantic
│   ├── seed/
│   │   └── seed.ts                     ← seed de dados sintéticos
│   ├── services/
│   │   ├── CronScheduler.ts            ← node-cron 02h diário
│   │   ├── EmbeddingService.ts         ← @xenova/transformers warm-up + embed()
│   │   ├── ModelStore.ts               ← base: getModel(), setModel(), isReady
│   │   ├── ModelTrainer.ts             ← TF.js train + syncNeo4j + precisionAtK
│   │   ├── RAGService.ts               ← embed → Neo4j vector → LLM → answer
│   │   ├── RecommendationService.ts    ← hybrid score (neural + cosine)
│   │   ├── SearchService.ts            ← Neo4jVectorStore similarity search
│   │   ├── TrainingJobRegistry.ts      ← job 202+polling async
│   │   └── VersionedModelStore.ts      ← extends ModelStore + timestamp + symlink
│   ├── tests/
│   │   ├── model.test.ts               ← testes de ModelTrainer
│   │   ├── rag.test.ts                 ← testes de RAGService
│   │   ├── recommend.test.ts           ← testes de RecommendationService
│   │   └── search.test.ts              ← testes de SearchService
│   ├── types/
│   │   └── index.ts                    ← RecommendationResult, MatchReason, etc.
│   └── index.ts                        ← composition root + startup
│
├── src/routes/adminRoutes.test.ts      ← co-localizado na pasta routes/
├── src/routes/embeddings.test.ts
├── src/services/TrainingJobRegistry.test.ts
├── src/services/VersionedModelStore.test.ts
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

## Mapeamento capacidades → locais

| Capacidade | Localização |
|---|---|
| Configuração de ambiente | `src/config/env.ts` |
| Toda I/O Neo4j | `src/repositories/Neo4jRepository.ts` |
| Embeddings HuggingFace | `src/services/EmbeddingService.ts` |
| Treino da rede neural | `src/services/ModelTrainer.ts` |
| Modelo versionado + rollback | `src/services/VersionedModelStore.ts` |
| Job assíncrono de treino | `src/services/TrainingJobRegistry.ts` |
| Cron diário | `src/services/CronScheduler.ts` |
| Recomendação híbrida | `src/services/RecommendationService.ts` |
| Busca semântica | `src/services/SearchService.ts` |
| RAG pipeline | `src/services/RAGService.ts` |
| Rotas admin (autenticadas) | `src/routes/adminRoutes.ts` |
| Tipos canônicos | `src/types/index.ts` |
| Dados sintéticos | `src/seed/seed.ts` |
