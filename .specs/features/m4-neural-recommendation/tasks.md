# M4 — Neural Recommendation Model Tasks

**Design**: `.specs/features/m4-neural-recommendation/design.md`
**Status**: In Progress

---

## Execution Plan

### Phase 1: Foundation (Sequential)

```
T1 → T2 → T3
```

T1: deps + config + types (everything T2–T8 imports)
T2: Neo4jRepository 4 new methods (depends on T1 types)
T3: ModelStore (depends on T1 types)

### Phase 2: Core Services (Parallel after T3)

```
T3 ──┬── T4 (ModelTrainer) ──┐
     └── T5 (RecommendSvc) ──┴── T6 (model routes) → T7 (recommend route) → T8 (index.ts wiring)
```

T4 and T5 can run in parallel (both depend on T2 + T3, but don't depend on each other).
T6 depends on T4 + T3.
T7 depends on T5.
T8 depends on T6 + T7.

### Phase 3: Infrastructure + Docs (after T8)

```
T8 → T9
```

---

## Task Breakdown

### T1: Install @tensorflow/tfjs-node + extend env.ts + extend types/index.ts

**What**: Add `@tensorflow/tfjs-node` dependency; extend `ENV` with `API_SERVICE_URL`, `NEURAL_WEIGHT`, `SEMANTIC_WEIGHT`; add new M4 TypeScript interfaces to `src/types/index.ts`.
**Where**: `ai-service/package.json`, `ai-service/src/config/env.ts`, `ai-service/src/types/index.ts`
**Depends on**: None
**Reuses**: Existing `ENV` pattern in `src/config/env.ts`
**Requirement**: M4-32, M4-33, M4-34

**Done when**:

- [ ] `@tensorflow/tfjs-node` added to `dependencies` in `package.json` and installed
- [ ] `ENV.API_SERVICE_URL` (required, startup warning if absent), `ENV.NEURAL_WEIGHT` (default `0.6`), `ENV.SEMANTIC_WEIGHT` (default `0.4`) added
- [ ] Startup log `"Hybrid weights: neural=X, semantic=Y"` emitted from `env.ts` module load
- [ ] Startup warning emitted if `NEURAL_WEIGHT + SEMANTIC_WEIGHT !== 1.0`
- [ ] `TrainingStatus`, `TrainingMetadata`, `ClientProfile`, `CandidateProduct`, `RecommendationResult`, `MatchReason` interfaces/types exported from `src/types/index.ts`
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add tfjs-node, M4 env vars, and M4 types`

---

### T2: Extend Neo4jRepository with 4 new Cypher methods

**What**: Add `getClientWithCountry`, `getPurchasedProductIds`, `getClientPurchasedEmbeddings`, and `getCandidateProducts` to the existing `Neo4jRepository` class.
**Where**: `ai-service/src/repositories/Neo4jRepository.ts`
**Depends on**: T1
**Reuses**: Existing `Neo4jUnavailableError`, `try/finally session.close()` pattern
**Requirement**: M4-17, M4-18, M4-20, M4-21

**Done when**:

- [ ] `getClientWithCountry(clientId: string): Promise<ClientProfile | null>` returns client with country or null
- [ ] `getPurchasedProductIds(clientId: string): Promise<string[]>` returns list of product IDs bought by client
- [ ] `getClientPurchasedEmbeddings(clientId: string): Promise<number[][]>` returns embeddings of products the client has bought (WHERE embedding IS NOT NULL)
- [ ] `getCandidateProducts(countryCode: string, excludedIds: string[]): Promise<CandidateProduct[]>` returns products available in country, not in excludedIds, with embedding IS NOT NULL
- [ ] All methods use `try/finally session.close()` pattern
- [ ] All methods throw `Neo4jUnavailableError` on Neo4j errors
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add 4 Neo4j query methods for M4 recommendation`

---

### T3: Implement ModelStore

**What**: Create `src/services/ModelStore.ts` — single source of truth for trained model reference and training status metadata; enables atomic model swap (ADR-006).
**Where**: `ai-service/src/services/ModelStore.ts` (new file)
**Depends on**: T1
**Reuses**: `TrainingStatus`, `TrainingMetadata` from `src/types/index.ts`
**Requirement**: M4-13, M4-14, M4-15

**Done when**:

- [ ] `ModelStore` class exported with methods: `getModel()`, `getStatus()`, `setModel()`, `setTraining()`, `setProgress()`, `reset()`
- [ ] `getStatus()` returns `TrainingStatus` snapshot
- [ ] `setModel()` stores the `tf.LayersModel` reference and sets status to `"trained"` with provided `TrainingMetadata`
- [ ] `setTraining(startedAt)` sets status to `"training"` without touching model reference
- [ ] `setProgress(epoch, total)` updates `progress` field to `"epoch X/Y"`
- [ ] `reset()` sets status back to `"untrained"` without touching model reference
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add ModelStore for atomic model reference management`

---

### T4: Implement ModelTrainer [P]

**What**: Create `src/services/ModelTrainer.ts` — full training pipeline: fetch data → build tensors → train → save → update `ModelStore`.
**Where**: `ai-service/src/services/ModelTrainer.ts` (new file)
**Depends on**: T2, T3
**Reuses**: `EmbeddingService` (imported), `Neo4jRepository` (injected), `ModelStore` (injected), `Neo4jUnavailableError`
**Requirement**: M4-01 through M4-12

**Done when**:

- [ ] `ModelTrainer` class exported with `constructor(modelStore, repo, embeddingService, apiServiceUrl, neuralWeight, semanticWeight)`
- [ ] `get isTraining(): boolean` property works
- [ ] `async train(): Promise<TrainingResult>` orchestrates full pipeline steps 1–15 from design
- [ ] Throws HTTP 409 `ConflictError` (custom error class) when `isTraining === true`
- [ ] `fetchTrainingData(apiServiceUrl)` module function fetches clients, products, orders from API Service; throws `ApiServiceUnavailableError` on network/5xx errors
- [ ] Client profile vector = element-wise mean of purchased product embeddings (384 dims)
- [ ] Products without Neo4j embeddings are skipped with log warning (M4-04)
- [ ] Input tensor shape: `[samples, 768]` (product 384 + client profile 384)
- [ ] Model architecture: `Dense(256, relu) → Dropout(0.3) → Dense(128, relu) → Dropout(0.2) → Dense(64, relu) → Dense(1, sigmoid)`
- [ ] Compiled with `adam`, `binaryCrossentropy`, `['accuracy']`; 20 epochs, batchSize 32
- [ ] Logs `Epoch X/20 — loss: Y — accuracy: Z` per epoch via `onEpochEnd` callback
- [ ] `xs.dispose()` and `ys.dispose()` called after `model.fit()` (async — cannot use `tf.tidy()`)
- [ ] Model saved to `file:///tmp/model` after fit
- [ ] `modelStore.setModel()` called only after save completes
- [ ] Any error in steps 3–14: `isTraining = false`, `modelStore.reset()`, re-throw
- [ ] Returns `{ status, epochs, finalLoss, finalAccuracy, trainingSamples, durationMs }`
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add ModelTrainer with full neural training pipeline`

---

### T5: Implement RecommendationService [P]

**What**: Create `src/services/RecommendationService.ts` — hybrid scoring pipeline: build candidate pool → compute semantic + neural scores → rank and return results.
**Where**: `ai-service/src/services/RecommendationService.ts` (new file)
**Depends on**: T2, T3
**Reuses**: `Neo4jRepository` (injected), `ModelStore` (injected), `CandidateProduct`, `RecommendationResult` types
**Requirement**: M4-16 through M4-27

**Done when**:

- [ ] `RecommendationService` class exported with `constructor(modelStore, repo, neuralWeight, semanticWeight)`
- [ ] `async recommend(clientId: string, limit: number): Promise<RecommendationResult[] | { recommendations: [], reason: string }>` implemented
- [ ] Throws `ModelNotTrainedError` (→ 503) if `modelStore.getModel()` returns null
- [ ] Throws `ClientNotFoundError` (→ 404) if client not found in Neo4j
- [ ] Throws `ClientNoPurchaseHistoryError` (→ 422) if client has no purchased embeddings
- [ ] Client profile vector = element-wise mean of purchased product embeddings
- [ ] Returns `{ recommendations: [], reason: "..." }` when candidate pool is empty (no tensor allocated)
- [ ] Products without embedding are filtered/logged before tensor construction (M4-26)
- [ ] All async I/O completed BEFORE `tf.tidy()` block (ADR-008)
- [ ] Batch `tf.tensor2d([...allVectors], [N, 768])` built; single `model.predict()` call (ADR-007)
- [ ] `dataSync()` called to extract Float32Array from output tensor
- [ ] Semantic score = cosine similarity (pure JS, no tensor)
- [ ] Final score = `NEURAL_WEIGHT * neuralScore + SEMANTIC_WEIGHT * semanticScore`
- [ ] `matchReason` diff-first: `|neural - semantic| < 0.05` → "hybrid"; else neural > semantic → "neural"; else → "semantic"
- [ ] Results sorted descending by `finalScore`, sliced to `min(limit, 50)`
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add RecommendationService with hybrid neural+semantic scoring`

---

### T6: Implement model routes (POST /train, GET /status)

**What**: Create `src/routes/model.ts` — Fastify route plugin for `POST /api/v1/model/train` and `GET /api/v1/model/status`.
**Where**: `ai-service/src/routes/model.ts` (new file)
**Depends on**: T3, T4
**Reuses**: Existing route plugin pattern from `src/routes/embeddings.ts`
**Requirement**: M4-09, M4-12, M4-13, M4-14, M4-15

**Done when**:

- [ ] `modelRoutes` exported as Fastify plugin receiving `{ modelTrainer, modelStore }` options
- [ ] `POST /api/v1/model/train`: calls `modelTrainer.train()`; returns 409 on `ConflictError`; returns 503 on `ApiServiceUnavailableError`; returns 200 with training result on success
- [ ] `GET /api/v1/model/status`: calls `modelStore.getStatus()`; always returns 200 with status object
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add model routes for train and status endpoints`

---

### T7: Implement recommend route (POST /recommend)

**What**: Create `src/routes/recommend.ts` — Fastify route plugin for `POST /api/v1/recommend` with input validation and error mapping.
**Where**: `ai-service/src/routes/recommend.ts` (new file)
**Depends on**: T5
**Reuses**: Existing route plugin pattern from `src/routes/search.ts`
**Requirement**: M4-16 through M4-27

**Done when**:

- [ ] `recommendRoutes` exported as Fastify plugin receiving `{ recommendationService }` options
- [ ] `POST /api/v1/recommend` validates body: `clientId` required (400 if missing/empty), `limit` default 10 (400 if ≤ 0)
- [ ] Maps `ModelNotTrainedError` → 503
- [ ] Maps `ClientNotFoundError` → 404
- [ ] Maps `ClientNoPurchaseHistoryError` → 422
- [ ] Maps `Neo4jUnavailableError` → 503
- [ ] Returns 200 with recommendations array on success (including empty array case)
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): add recommend route with input validation and error mapping`

---

### T8: Wire M4 components in index.ts + startup model load

**What**: Extend `src/index.ts` to instantiate `ModelStore`, `ModelTrainer`, `RecommendationService`; attempt `/tmp/model` load on startup (P2); register `modelRoutes` and `recommendRoutes`.
**Where**: `ai-service/src/index.ts`
**Depends on**: T6, T7
**Reuses**: Existing `start()` function structure; `EmbeddingService`, `Neo4jRepository` already instantiated
**Requirement**: M4-28, M4-29, M4-30, M4-31, M4-32, M4-33, M4-34

**Done when**:

- [ ] `ModelStore` instantiated before `EmbeddingService.init()` call
- [ ] After `embeddingService.init()`, attempt `tf.loadLayersModel('file:///tmp/model')`; on success: `modelStore.setModel(model, metadata)` + log `"Neural model loaded from /tmp/model"` (M4-30)
- [ ] If `/tmp/model` doesn't exist or load fails: log warning, status stays `"untrained"` — startup continues (M4-29, M4-31)
- [ ] `ModelTrainer` instantiated with `modelStore`, `repo`, `embeddingService`, `ENV.API_SERVICE_URL`, `ENV.NEURAL_WEIGHT`, `ENV.SEMANTIC_WEIGHT`
- [ ] `RecommendationService` instantiated with `modelStore`, `repo`, `ENV.NEURAL_WEIGHT`, `ENV.SEMANTIC_WEIGHT`
- [ ] `modelRoutes` registered with prefix `/api/v1` + `{ modelTrainer, modelStore }`
- [ ] `recommendRoutes` registered with prefix `/api/v1` + `{ recommendationService }`
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit` (0 errors — build gate for Phase 2)

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `feat(ai-service): wire M4 services and routes in index.ts with startup model load`

---

### T9: Update docker-compose + .env.example + ROADMAP + STATE

**What**: Add `API_SERVICE_URL`, `NEURAL_WEIGHT`, `SEMANTIC_WEIGHT` to `docker-compose.yml` and `.env.example`; update `ROADMAP.md` M4 status to complete; update `STATE.md` todos and current focus.
**Where**: `docker-compose.yml`, `.env.example`, `.specs/project/ROADMAP.md`, `.specs/project/STATE.md`
**Depends on**: T8
**Requirement**: M4-32

**Done when**:

- [ ] `API_SERVICE_URL=http://api-service:8080` added to `ai-service` service env in `docker-compose.yml`
- [ ] `NEURAL_WEIGHT=0.6` and `SEMANTIC_WEIGHT=0.4` added to `docker-compose.yml`
- [ ] `.env.example` updated with `API_SERVICE_URL`, `NEURAL_WEIGHT`, `SEMANTIC_WEIGHT` with comments
- [ ] `ROADMAP.md` M4 status updated to `✅ Completed`; M5 set as current milestone
- [ ] `STATE.md` updated: M4 todos marked complete, current focus updated to M5
- [ ] Gate check passes: `cd ai-service && npx tsc --noEmit`

**Tests**: none
**Gate**: build (`cd ai-service && npx tsc --noEmit`)
**Commit**: `chore: update docker-compose and env for M4 neural recommendation`

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body)  | Diagram Shows        | Status   |
|------|------------------------|----------------------|----------|
| T1   | None                   | Start of chain       | ✅ Match |
| T2   | T1                     | T1 → T2              | ✅ Match |
| T3   | T1                     | T1 → T3              | ✅ Match |
| T4   | T2, T3                 | T2+T3 → T4           | ✅ Match |
| T5   | T2, T3                 | T2+T3 → T5           | ✅ Match |
| T6   | T3, T4                 | T4+T3 → T6           | ✅ Match |
| T7   | T5                     | T5 → T7              | ✅ Match |
| T8   | T6, T7                 | T6+T7 → T8           | ✅ Match |
| T9   | T8                     | T8 → T9              | ✅ Match |

## Test Co-location Validation

Tests are formally deferred to M6 per spec.md Out of Scope: "Testes unitários e de integração formais — M6". Gate check for all tasks: `tsc --noEmit`.

| Task | Code Layer            | Matrix Requires | Task Says | Status |
|------|-----------------------|-----------------|-----------|--------|
| T1   | config + types        | none (M6)       | none      | ✅ OK  |
| T2   | repository            | none (M6)       | none      | ✅ OK  |
| T3   | service               | none (M6)       | none      | ✅ OK  |
| T4   | service               | none (M6)       | none      | ✅ OK  |
| T5   | service               | none (M6)       | none      | ✅ OK  |
| T6   | routes                | none (M6)       | none      | ✅ OK  |
| T7   | routes                | none (M6)       | none      | ✅ OK  |
| T8   | index.ts wiring       | none (M6)       | none      | ✅ OK  |
| T9   | infra + docs          | none            | none      | ✅ OK  |
