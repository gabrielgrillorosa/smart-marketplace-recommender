# M3 — AI Service Tasks

**Spec**: `.specs/features/m3-ai-service/spec.md`
**Design**: `.specs/features/m3-ai-service/design.md`
**Status**: Draft

---

## Context

No TESTING.md exists — this is a greenfield TypeScript/Fastify service. Formal tests are explicitly **out of scope for M3** (deferred to M6 per spec). All `Tests` fields are therefore `none` per spec exclusion; gate checks are manual `curl` verification.

**Existing code:**
- `src/index.ts` — stub Fastify server with `/health` and `AI_SERVICE_PORT` env var (needs refactor to match design)
- `src/seed/` — existing seed code; must not be modified
- `docker-compose.yml` — `ai-service` service already defined with `depends_on: neo4j`, port mapping, and healthcheck; needs: `OPENROUTER_API_KEY` env var + start_period bump for model warm-up
- `Dockerfile` — single-stage; needs replacement with multi-stage

---

## Execution Plan

### Phase 1: Foundation (Sequential)

Shared infrastructure all other tasks depend on. T0 (deps) and T1+T2 (types + config) have no cross-dependency but are kept sequential for simplicity.

```
T0 → T1 → T2 → T3 → T4
```

### Phase 2: Core Services (Parallel OK)

After foundation is in place, domain services and Dockerfile can be built in parallel. T7 depends only on T0 (package.json correct) and the directory structure defined in T1.

```
T4 ──┬──→ T5 [P]
     ├──→ T6 [P]
     └──→ T7 [P]
```

### Phase 3: Routes (Parallel OK)

Each route depends exclusively on its own service.

```
T4 ──→ T8 [P]   (embeddings route — uses EmbeddingService from T4)
T5 ──→ T9 [P]   (search route — uses SearchService from T5)
T6 ──→ T10 [P]  (rag route — uses RAGService from T6)
```

### Phase 4: Integration (Sequential)

Wire everything together, refactor entry point, update infrastructure.

```
T8, T9, T10, T7 ──→ T11 → T12 → T13
```

---

## Task Breakdown

### T0: Verify and pin dependencies

**What**: Confirm `@langchain/core` is declared explicitly in `package.json` and verify `tsconfig.json` has `outDir: "./dist"` — prerequisites for T6 (RAGService imports) and T7 (Dockerfile build)
**Where**: `ai-service/package.json`, `ai-service/tsconfig.json`
**Depends on**: None
**Reuses**: —
**Requirement**: M3-23 (LangChain chain imports), M3-34 (Dockerfile build)

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `@langchain/core` listed in `package.json` `dependencies` (currently only a transitive dep — must be explicit to survive `npm ci --omit=dev` in Dockerfile runner stage)
- [ ] `tsconfig.json` has `"outDir": "./dist"` — already confirmed ✅ (no change needed)
- [ ] `npm install` run if `package.json` was modified (updates `package-lock.json`)

**Tests**: none
**Gate**: quick — `node -e "require('@langchain/core/prompts')" && echo OK`

---

### T1: Create shared type definitions

**What**: Create `src/types/index.ts` with all shared TypeScript interfaces used across the service
**Where**: `ai-service/src/types/index.ts`
**Depends on**: None
**Reuses**: Interfaces defined in `design.md` — `Product`, `SearchResult`, `RAGResponse`, `SearchFilters`, `Source`
**Requirement**: M3-06, M3-14, M3-22

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `Product` interface exported with fields: `id`, `name`, `description`, `category`, `price`, `sku`, `embedding?`
- [ ] `SearchResult` interface exported with fields: `id`, `name`, `description`, `category`, `price`, `sku`, `score`
- [ ] `SearchFilters` interface exported with optional `country` and `category`
- [ ] `RAGResponse` interface exported with `answer: string` and `sources: Array<{ id, name, score }>`
- [ ] `Source` interface exported with `id`, `name`, `score`
- [ ] No TypeScript errors (`npx tsc --noEmit`)

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

---

### T2: Create environment config module

**What**: Create `src/config/env.ts` that reads and validates all environment variables, exporting an immutable `ENV` object
**Where**: `ai-service/src/config/env.ts`
**Depends on**: None
**Reuses**: —
**Requirement**: M3-01, M3-04, M3-30, M3-31, M3-32

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `ENV` object exported with: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `OPENROUTER_API_KEY`, `PORT`, `NLP_MODEL`
- [ ] `PORT` defaults to `3001` when `PORT` env var absent (M3-31)
- [ ] `NLP_MODEL` defaults to `"sentence-transformers/all-MiniLM-L6-v2"` when absent (M3-31)
- [ ] `OPENROUTER_API_KEY` is `string | undefined` (not required at startup)
- [ ] When `NEO4J_URI`, `NEO4J_USER`, or `NEO4J_PASSWORD` are absent: logs warning, does NOT crash (M3-32)
- [ ] `ENV` object is frozen/immutable (use `Object.freeze`)
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

**Verify**:
```bash
PORT=3002 NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=x ts-node -e "import('./src/config/env').then(m => console.log(m.ENV.PORT))"
# Expected: 3002
```

---

### T3: Create Neo4jRepository

**What**: Create `src/repositories/Neo4jRepository.ts` with all Cypher operations isolated in one class
**Where**: `ai-service/src/repositories/Neo4jRepository.ts`
**Depends on**: T1 (types)
**Reuses**: `neo4j-driver` session pattern from `src/seed/seed.ts` — `try/finally` session close
**Requirement**: M3-06, M3-07, M3-08, M3-10, M3-12, M3-14, M3-15, M3-16, M3-17, M3-18, M3-19, M3-21

**Tools**:
- MCP: `filesystem`, `user-context7`
- Skill: NONE

**Done when**:
- [ ] `constructor(driver: Driver)` — receives neo4j Driver singleton
- [ ] `getProductsWithoutEmbedding(): Promise<Product[]>` — `MATCH (p:Product) WHERE p.embedding IS NULL RETURN p`
- [ ] `setProductEmbedding(id: string, embedding: number[]): Promise<void>` — `MATCH (p:Product {id: $id}) SET p.embedding = $embedding`
- [ ] `createVectorIndex(): Promise<void>` — uses `CREATE VECTOR INDEX product_embeddings IF NOT EXISTS FOR (p:Product) ON (p.embedding) OPTIONS { indexConfig: { 'vector.dimensions': 384, 'vector.similarity_function': 'cosine' } }`
- [ ] `vectorSearch(embedding: number[], limit: number, filters?: SearchFilters): Promise<SearchResult[]>` — uses `db.index.vector.queryNodes` with WHERE clauses built via array concat (NO string interpolation); returns results ordered by score DESC (M3-18)
- [ ] `close(): Promise<void>`
- [ ] Every method opens its own session and closes it in `try/finally`
- [ ] On Neo4j connection error: throws `Neo4jUnavailableError` (custom error class in same file)
- [ ] Cypher query uses parametrized WHERE clauses for `country` and `category` filters (M3-16, M3-17) — exactly as shown in design.md
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

---

### T4: Create EmbeddingService

**What**: Create `src/services/EmbeddingService.ts` — singleton HuggingFace model with warm-up, batch embedding pipeline, and mutex for concurrent generate calls
**Where**: `ai-service/src/services/EmbeddingService.ts`
**Depends on**: T1, T3
**Reuses**: `HuggingFaceTransformersEmbeddings` from `@langchain/community/embeddings/huggingface_transformers` (pattern from `exemplo-13`)
**Requirement**: M3-06, M3-07, M3-08, M3-09, M3-10, M3-11, M3-12, M3-13

**Tools**:
- MCP: `filesystem`, `user-context7`
- Skill: NONE

**Done when**:
- [ ] `constructor(modelName: string)` — stores model name, initializes `isGenerating = false`, `modelReady = false`
- [ ] `async init(): Promise<void>` — instantiates `HuggingFaceTransformersEmbeddings`, calls `embedQuery("")` (warm-up/download), sets `this.modelReady = true`
- [ ] `get isReady(): boolean` — returns `this.modelReady`
- [ ] `async embedText(text: string): Promise<number[]>` — calls `this.embeddings.embedQuery(text)`, returns `number[]`
- [ ] `async generateEmbeddings(repo: Neo4jRepository): Promise<{ generated: number; skipped: number; indexCreated: boolean }>`:
  - Returns HTTP 409 signal by throwing `AlreadyRunningError` if `isGenerating === true`
  - Sets `isGenerating = true` at start, `false` in `finally`
  - Fetches products via `repo.getProductsWithoutEmbedding()` (idempotent — skips already-embedded products, M3-08)
  - Processes in batches of 10 (M3-13): for each product, concatenates `name + " " + description + " " + category` (M3-07), calls `embedText`, calls `repo.setProductEmbedding`
  - Logs progress every 10 products: `[X/N] Produto "name" embedado` (M3-09)
  - Calls `repo.createVectorIndex()` after all products processed (M3-10)
  - Returns `{ generated, skipped, indexCreated: true }` (M3-11)
  - Wraps repo calls in try/catch; re-throws `Neo4jUnavailableError` for 503 handling upstream
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

---

### T5: Create SearchService [P]

**What**: Create `src/services/SearchService.ts` — validates model readiness and vector index existence, then executes semantic search
**Where**: `ai-service/src/services/SearchService.ts`
**Depends on**: T4
**Reuses**: `EmbeddingService.embedText()`, `Neo4jRepository.vectorSearch()`
**Requirement**: M3-14, M3-15, M3-16, M3-17, M3-18, M3-19, M3-20, M3-21

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `constructor(embeddingService: EmbeddingService, repo: Neo4jRepository)`
- [ ] `async semanticSearch(query: string, limit: number, filters?: SearchFilters): Promise<SearchResult[]>`
  - Throws `ModelNotReadyError` if `!embeddingService.isReady`
  - Applies `limit` default of 10 if not provided (M3-20)
  - Caps `limit` at 50 silently (edge case from spec)
  - Calls `embeddingService.embedText(query)`
  - Calls `repo.vectorSearch(embedding, limit, filters)` — threshold 0.5 enforced in repository WHERE clause
  - Returns array sorted by score DESC; empty array if no results (M3-19)
  - Re-throws `Neo4jUnavailableError` and `IndexNotFoundError` for route handling
- [ ] `IndexNotFoundError` custom error class defined (used when vector index doesn't exist, M3-21)
- [ ] `ModelNotReadyError` custom error class defined
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

---

### T6: Create RAGService [P]

**What**: Create `src/services/RAGService.ts` — full RAG pipeline: embed → vector search → build context → LLM → structured response
**Where**: `ai-service/src/services/RAGService.ts`
**Depends on**: T4
**Reuses**: `ChatOpenAI` with OpenRouter baseURL, `ChatPromptTemplate`, `RunnableSequence`, `StringOutputParser` — pattern from `exemplo-13/src/ai.ts`
**Requirement**: M3-22, M3-23, M3-24, M3-25, M3-26, M3-27, M3-28, M3-29

**Tools**:
- MCP: `filesystem`, `user-context7`
- Skill: NONE

**Done when**:
- [ ] `constructor(embeddingService: EmbeddingService, repo: Neo4jRepository, openRouterApiKey: string | undefined, modelName: string)`
- [ ] `async query(userQuery: string): Promise<RAGResponse>`:
  - Throws `LLMNotConfiguredError` if `openRouterApiKey` is undefined (M3-28)
  - Truncates `userQuery` to 1000 chars (M3 edge case from spec)
  - Calls `embeddingService.embedText(query)` → embedding vector
  - Calls `repo.vectorSearch(embedding, 5)` with topK=5 — threshold 0.5 enforced in repo
  - If `sources.length === 0`: returns `{ answer: "Não encontrei produtos que correspondam à sua pergunta.", sources: [] }` WITHOUT calling LLM (M3-27)
  - Formats context per product: `- [name] (SKU: sku, Categoria: category, Preço: R$ price): description` (M3-24)
  - Uses `ChatPromptTemplate` with prompt that: instructs pt-BR/en response based on query language, restricts to provided context only, returns "Não encontrei..." if context insufficient (M3-25)
  - Uses `ChatOpenAI` with `model: "mistralai/mistral-7b-instruct:free"`, `configuration: { baseURL: "https://openrouter.ai/api/v1" }`, `apiKey: openRouterApiKey` (M3-23)
  - Invokes `RunnableSequence` with `StringOutputParser`
  - Returns `{ answer: string, sources: [{ id, name, score }] }` (M3-26)
  - On LLM error (catch): throws `LLMError` with `sources` payload for 502 handling upstream (M3-29)
- [ ] `LLMNotConfiguredError` custom error class defined
- [ ] `LLMError` custom error class with `sources` field defined
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

---

### T7: Update Dockerfile to multi-stage build [P]

**What**: Replace existing single-stage Dockerfile with multi-stage build: `builder` compiles TypeScript, `runner` uses only `dist/` and production `node_modules`
**Where**: `ai-service/Dockerfile`
**Depends on**: T0 (package.json deps correct), T1 (directory structure established)
**Reuses**: Multi-stage pattern from `api-service/Dockerfile`
**Requirement**: M3-34

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Stage `builder`: `FROM node:22-alpine AS builder`, installs all deps (`npm ci`), copies source, runs `npm run build` (produces `dist/`)
- [ ] Stage `runner`: `FROM node:22-alpine AS runner`, installs only production deps (`npm ci --omit=dev`), copies `dist/` from builder, exposes 3001, `CMD ["node", "dist/index.js"]`
- [ ] `WORKDIR /app` on both stages
- [ ] `EXPOSE 3001` in runner stage
- [ ] `docker build -t ai-service-test ./ai-service` succeeds (manual test)

**Tests**: none
**Gate**: manual — `docker build -t ai-service-test ./ai-service`

---

### T8: Create embeddings route plugin [P]

**What**: Create `src/routes/embeddings.ts` — Fastify plugin handling `POST /api/v1/embeddings/generate`
**Where**: `ai-service/src/routes/embeddings.ts`
**Depends on**: T4 (EmbeddingService)
**Reuses**: Fastify plugin pattern (`FastifyPluginAsync`)
**Requirement**: M3-06, M3-08, M3-09, M3-10, M3-11, M3-12, M3-13

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Exports `embeddingsRoutes` as `FastifyPluginAsync` accepting `{ embeddingService: EmbeddingService, repo: Neo4jRepository }` in options
- [ ] `POST /embeddings/generate` handler:
  - Calls `embeddingService.generateEmbeddings(repo)`
  - On `AlreadyRunningError`: reply 409 `{ error: "Generation already in progress" }`
  - On `Neo4jUnavailableError`: reply 503 `{ error: "Neo4j unavailable" }`
  - On success: reply 200 `{ generated, skipped, indexCreated }`
- [ ] Plugin registered with prefix `/api/v1` in `index.ts` (will be done in T11)
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

**Verify** (after T11):
```bash
curl -X POST http://localhost:3001/api/v1/embeddings/generate
# Expected: { "generated": N, "skipped": 0, "indexCreated": true }
```

---

### T9: Create search route plugin [P]

**What**: Create `src/routes/search.ts` — Fastify plugin handling `POST /api/v1/search/semantic`
**Where**: `ai-service/src/routes/search.ts`
**Depends on**: T5 (SearchService — wraps EmbeddingService + repo)
**Reuses**: Fastify plugin pattern (`FastifyPluginAsync`)
**Requirement**: M3-14, M3-15, M3-16, M3-17, M3-18, M3-19, M3-20, M3-21

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Exports `searchRoutes` as `FastifyPluginAsync` accepting `{ searchService: SearchService }` in options
- [ ] `POST /search/semantic` handler:
  - Validates `body.query` is non-empty string — reply 400 `{ error: "query is required and must be non-empty" }` if not (M3 edge case)
  - Validates `body.limit >= 1` — reply 400 if `limit < 1`
  - Calls `searchService.semanticSearch(query, limit ?? 10, filters)`
  - On `ModelNotReadyError`: reply 503 `{ error: "Model loading. Retry in a few seconds." }`
  - On `IndexNotFoundError`: reply 503 `{ error: "Embedding index not found. Run POST /api/v1/embeddings/generate first." }` (M3-21)
  - On `Neo4jUnavailableError`: reply 503 `{ error: "Neo4j unavailable" }`
  - On success: reply 200 with result array (sorted, filtered by score > 0.5 — enforced upstream)
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

**Verify** (after T11):
```bash
curl -X POST http://localhost:3001/api/v1/search/semantic \
  -H "Content-Type: application/json" \
  -d '{"query":"refrigerante sem açúcar","limit":5}'
# Expected: array of products with score > 0.5
```

---

### T10: Create RAG route plugin [P]

**What**: Create `src/routes/rag.ts` — Fastify plugin handling `POST /api/v1/rag/query`
**Where**: `ai-service/src/routes/rag.ts`
**Depends on**: T6 (RAGService — full pipeline)
**Reuses**: Fastify plugin pattern (`FastifyPluginAsync`)
**Requirement**: M3-22, M3-23, M3-24, M3-25, M3-26, M3-27, M3-28, M3-29

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Exports `ragRoutes` as `FastifyPluginAsync` accepting `{ ragService: RAGService }` in options
- [ ] `POST /rag/query` handler:
  - Validates `body.query` is non-empty string — reply 400 if not
  - Calls `ragService.query(body.query)`
  - On `LLMNotConfiguredError`: reply 503 `{ error: "LLM not configured. Set OPENROUTER_API_KEY env var." }` (M3-28)
  - On `LLMError`: reply 502 `{ error: err.message, sources: err.sources }` (M3-29)
  - On `Neo4jUnavailableError`: reply 503 `{ error: "Neo4j unavailable" }`
  - On `ModelNotReadyError`: reply 503 `{ error: "Model loading. Retry in a few seconds." }`
  - On success: reply 200 `{ answer, sources }` (M3-26)
- [ ] No TypeScript errors

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

**Verify** (after T11):
```bash
curl -X POST http://localhost:3001/api/v1/rag/query \
  -H "Content-Type: application/json" \
  -d '{"query":"Quais produtos sem açúcar estão disponíveis no México?"}'
# Expected: { "answer": "...", "sources": [...] }
```

---

### T11: Refactor entry point (src/index.ts)

**What**: Replace stub `src/index.ts` with full startup orchestration: config → neo4j driver → services init with warm-up → route registration → listen
**Where**: `ai-service/src/index.ts`
**Depends on**: T2, T3, T4, T5, T6, T8, T9, T10
**Reuses**: Design `index.ts` startup sequence from `design.md`; existing Fastify server stub
**Requirement**: M3-01, M3-02, M3-03, M3-04, M3-05

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Reads `ENV` from `src/config/env.ts`
- [ ] Creates neo4j `Driver` singleton: `neo4j.driver(ENV.NEO4J_URI, neo4j.auth.basic(ENV.NEO4J_USER, ENV.NEO4J_PASSWORD))`
- [ ] Instantiates `Neo4jRepository(driver)`, `EmbeddingService(ENV.NLP_MODEL)`
- [ ] `await embeddingService.init()` — warm-up before listen (M3 startup order from design)
- [ ] Instantiates `SearchService(embeddingService, repo)` and `RAGService(embeddingService, repo, ENV.OPENROUTER_API_KEY, ENV.NLP_MODEL)`
- [ ] Registers `/health` — returns `{ status: "ok", service: "ai-service" }` (M3-02)
- [ ] Registers `/ready` — returns `{ ready: embeddingService.isReady }` with 200/503 (liveness vs readiness ADR)
- [ ] Registers `embeddingsRoutes`, `searchRoutes`, `ragRoutes` all with prefix `/api/v1`
- [ ] `fastify.listen({ port: ENV.PORT, host: '0.0.0.0' })` (M3-01)
- [ ] Logs `AI Service listening on port ${ENV.PORT}` after successful listen (M3-03)
- [ ] On unhandled startup error: `fastify.log.error(err); process.exit(1)` (M3-04)
- [ ] `ENV.PORT` read from `src/config/env.ts` (not directly from `process.env.AI_SERVICE_PORT` as in old stub) — uses `PORT` var per spec M3-30
- [ ] `npx tsc --noEmit` exits 0

**Tests**: none
**Gate**: quick — `npx tsc --noEmit`

**Verify**:
```bash
PORT=3001 NEO4J_URI=bolt://localhost:7687 NEO4J_USER=neo4j NEO4J_PASSWORD=password123 \
  ts-node src/index.ts
# Expected log: "AI Service listening on port 3001"
curl http://localhost:3001/health
# Expected: { "status": "ok", "service": "ai-service" }
```

---

### T12: Update docker-compose.yml for M3

**What**: Update `docker-compose.yml` `ai-service` entry to pass `OPENROUTER_API_KEY`, adjust `start_period` for model warm-up, and ensure `NEO4J_USER`/`NEO4J_PASSWORD` env vars are present
**Where**: `smart-marketplace-recommender/docker-compose.yml`
**Depends on**: T11
**Reuses**: Existing `ai-service` service block
**Requirement**: M3-33, M3-35, M3-36, M3-37

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}` added to `ai-service.environment` (M3-37)
- [ ] `NEO4J_USER: ${NEO4J_USER:-neo4j}` and `NEO4J_PASSWORD: ${NEO4J_PASSWORD:-password123}` added to `ai-service.environment` (env vars needed by `ENV` config)
- [ ] `start_period` on `ai-service` healthcheck bumped to `60s` (model download on first run can take 30-60s)
- [ ] `healthcheck.test` already uses `127.0.0.1` — verify it remains (M3-36)
- [ ] `depends_on: neo4j: condition: service_healthy` already present — verify unchanged (M3-33)
- [ ] Port mapping `3001:3001` already present — verify unchanged (M3-35)

**Tests**: none
**Gate**: manual

**Verify**:
```bash
docker compose config ai-service
# Expected: OPENROUTER_API_KEY present in environment section
```

---

### T13: Update .env.example with M3 variables

**What**: Add M3 required env vars (`OPENROUTER_API_KEY`, `NLP_MODEL`, `PORT`) to `.env.example` with documentation comments
**Where**: `smart-marketplace-recommender/.env.example`
**Depends on**: T12
**Reuses**: Existing `.env.example` format
**Requirement**: M3-30, M3-31

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `OPENROUTER_API_KEY=` added with comment `# Get free key at https://openrouter.ai`
- [ ] `NLP_MODEL=sentence-transformers/all-MiniLM-L6-v2` added with comment `# Default embedding model (384 dims)`
- [ ] `PORT=3001` added (or verified already present as `AI_SERVICE_PORT`) with comment
- [ ] Existing variables are not removed or altered
- [ ] Manual review: `.env.example` documents all vars consumed by `src/config/env.ts`

**Tests**: none
**Gate**: manual

---

## Parallel Execution Map

```
Phase 1 (Sequential — Foundation):
  T0 ──→ T1 ──→ T2 ──→ T3 ──→ T4

Phase 2 (Parallel — Domain Services + Dockerfile):
  T4 complete, then:
    ├── T5 [P]   (SearchService)
    ├── T6 [P]   (RAGService)
    └── T7 [P]   (Dockerfile multi-stage — depende de T0+T1, pode rodar assim que T4 terminar)

Phase 3 (Parallel — Routes):
  T4 complete ──→ T8 [P]   (embeddings route — EmbeddingService)
  T5 complete ──→ T9 [P]   (search route — SearchService)
  T6 complete ──→ T10 [P]  (rag route — RAGService)

Phase 4 (Sequential — Integration):
  T7, T8, T9, T10 complete, then:
    T11 ──→ T12 ──→ T13
```

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T0 | None | Start of Phase 1 | ✅ Match |
| T1 | None (após T0) | T0 → T1 | ✅ Match |
| T2 | None (após T1) | T1 → T2 | ✅ Match |
| T3 | T1 | T2 → T3 | ✅ Match |
| T4 | T1, T3 | T3 → T4 | ✅ Match |
| T5 | T4 | T4 → T5 [P] | ✅ Match |
| T6 | T4 | T4 → T6 [P] | ✅ Match |
| T7 | T0, T1 | T4 → T7 [P] (pode rodar assim que T4 terminar) | ✅ Match |
| T8 | T4 | T4 → T8 [P] | ✅ Match |
| T9 | T5 | T5 → T9 [P] | ✅ Match |
| T10 | T6 | T6 → T10 [P] | ✅ Match |
| T11 | T2, T3, T4, T5, T6, T7, T8, T9, T10 | T7,T8,T9,T10 → T11 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |

No mismatches. ✅

---

## Test Co-location Validation

No `TESTING.md` exists. Formal tests are explicitly **out of scope for M3** (see spec `Out of Scope` section — "Testes unitários e de integração formais" deferred to M6). All tasks are therefore `Tests: none`.

| Task | Code Layer Created/Modified | M3 Spec Requires | Task Says | Status |
|------|-----------------------------|------------------|-----------|--------|
| T0 | package.json (dep declaration) | none | none | ✅ OK |
| T1 | Types (interfaces only) | none (M6) | none | ✅ OK |
| T2 | Config module | none (M6) | none | ✅ OK |
| T3 | Repository layer | none (M6) | none | ✅ OK |
| T4 | Service layer | none (M6) | none | ✅ OK |
| T5 | Service layer | none (M6) | none | ✅ OK |
| T6 | Service layer | none (M6) | none | ✅ OK |
| T7 | Dockerfile | none | none | ✅ OK |
| T8 | Route handler | none (M6) | none | ✅ OK |
| T9 | Route handler | none (M6) | none | ✅ OK |
| T10 | Route handler | none (M6) | none | ✅ OK |
| T11 | Entry point | none (M6) | none | ✅ OK |
| T12 | docker-compose.yml | none | none | ✅ OK |
| T13 | .env.example | none | none | ✅ OK |

All ✅ — no violations.

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T0: Verify and pin dependencies | 1 file (package.json), verificação | ✅ Granular |
| T1: Create shared types | 1 file, pure interfaces | ✅ Granular |
| T2: Create env config | 1 file, 1 module | ✅ Granular |
| T3: Create Neo4jRepository | 1 file, 1 class | ✅ Granular |
| T4: Create EmbeddingService | 1 file, 1 class | ✅ Granular |
| T5: Create SearchService | 1 file, 1 class | ✅ Granular |
| T6: Create RAGService | 1 file, 1 class | ✅ Granular |
| T7: Update Dockerfile | 1 file | ✅ Granular |
| T8: Create embeddings route | 1 file, 1 route group | ✅ Granular |
| T9: Create search route | 1 file, 1 route group | ✅ Granular |
| T10: Create RAG route | 1 file, 1 route group | ✅ Granular |
| T11: Refactor index.ts | 1 file, wiring only | ✅ Granular |
| T12: Update docker-compose.yml | 1 file, env vars section | ✅ Granular |
| T13: Update .env.example | 1 file, additive only | ✅ Granular |

All tasks atomic. ✅
