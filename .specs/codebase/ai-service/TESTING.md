# Testing — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Frameworks

| Tipo | Framework | Versão |
|---|---|---|
| Unit/Integration | Vitest | 4.1.5 |
| Coverage | @vitest/coverage-v8 | 4.1.5 |
| E2E (externo) | Playwright (no frontend) | — |

## Organização dos testes

Dois padrões de localização coexistem:
1. **Co-localizado** — test ao lado do source: `src/services/TrainingJobRegistry.test.ts`, `src/routes/adminRoutes.test.ts`
2. **Pasta dedicada** — `src/tests/` para testes de rotas/services: `recommend.test.ts`, `rag.test.ts`, `search.test.ts`, `model.test.ts`

Contagem exacta: correr `npm test` (Vitest imprime ficheiros e testes no fim). **`npm test` sozinho não corre o compilador TypeScript** — erros de tipo só aparecem em `npm run build` (igual ao passo Docker `RUN npm run build`).

## Padrão de mocking

Dependências injetadas via constructor são mockadas com `vi.fn()` / `vi.spyOn()`. Neo4j e TF.js não são instanciados nos testes — repositories e services são mockados diretamente. Exemplo padrão:
```ts
const mockRepo = {
  getClientWithCountry: vi.fn(),
  getPurchasedProductIds: vi.fn(),
  // ...
}
const service = new RecommendationService(mockModelStore, mockRepo as any, 0.6, 0.4, 7, 0, 1)
```

## Coverage Matrix por camada

| Camada | Tipo de teste | Localização | Comando |
|---|---|---|---|
| `RecommendationService` | Unit (Vitest) | `src/tests/recommend.test.ts` | `npm test` |
| `RAGService` | Unit (Vitest) | `src/tests/rag.test.ts` | `npm test` |
| `SearchService` | Unit (Vitest) | `src/tests/search.test.ts` | `npm test` |
| `ModelTrainer` | Unit (Vitest) | `src/tests/model.test.ts` | `npm test` |
| `TrainingJobRegistry` | Unit (Vitest) | `src/services/TrainingJobRegistry.test.ts` | `npm test` |
| `VersionedModelStore` | Unit (Vitest) | `src/services/VersionedModelStore.test.ts` | `npm test` |
| `adminRoutes` | Integration (Vitest) | `src/routes/adminRoutes.test.ts` | `npm test` |
| `embeddings routes` | Integration (Vitest) | `src/routes/embeddings.test.ts` | `npm test` |
| `Neo4jRepository` | **não testado** | — | — |
| `EmbeddingService` | **não testado** | — | — |
| `CronScheduler` | **não testado** | — | — |

## Parallelism Assessment

| Tipo | Parallel-safe? | Evidência |
|---|---|---|
| Vitest unit | Sim | Mocks injetados — sem Neo4j real, sem TF.js global state nos testes |
| Vitest integration (routes) | Sim | Fastify test instance criada por teste com `buildServer()` helper |

## Gate Check Commands

| Gate | Quando usar | Comando |
|---|---|---|
| Quick | Iteração rápida (só lógica coberta por Vitest) | `npm test` |
| Full | Antes de PR / merge | `npm run lint && npm test` |
| **Build** | **Obrigatório antes de considerar feature fechada** (Docker = `tsc`) | `npm run build` |
| **DoD recomendado** | Build + testes + lint numa linha | **`npm run verify`** (`build` → `test` → `lint`) |
