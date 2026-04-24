# M4 — Neural Recommendation Model Design

**Spec**: `.specs/features/m4-neural-recommendation/spec.md`
**Status**: Approved
**Date**: 2026-04-23
**Method**: Design Complex (ToT Divergence → Red Team → Self-Consistency → Committee Review)

---

## Architecture Overview

M4 extends the AI Service with two new service-layer components (`ModelTrainer`, `RecommendationService`) and a shared state holder (`ModelStore`), following the same single-responsibility service pattern established in M3. Four new Cypher queries are added to `Neo4jRepository`. Two new route files integrate with Fastify using the existing `register` + prefix pattern.

```mermaid
graph TD
    subgraph HTTP Layer
        H[Fastify Server<br/>src/index.ts]
        R4[ModelRoutes<br/>src/routes/model.ts]
        R5[RecommendRoutes<br/>src/routes/recommend.ts]
        H -->|register /api/v1| R4
        H -->|register /api/v1| R5
    end

    subgraph Service Layer - M4
        MT[ModelTrainer<br/>src/services/ModelTrainer.ts]
        RS[RecommendationService<br/>src/services/RecommendationService.ts]
        MS[ModelStore<br/>src/services/ModelStore.ts]
        R4 --> MT
        R4 --> MS
        R5 --> RS
        MT -->|setModel after training| MS
        RS -->|getModel + getStatus| MS
    end

    subgraph Service Layer - M3 reused
        ES[EmbeddingService<br/>src/services/EmbeddingService.ts]
        MT --> ES
        RS --> ES
    end

    subgraph Infrastructure Layer
        NR[Neo4jRepository<br/>src/repositories/Neo4jRepository.ts]
        CFG[Config<br/>src/config/env.ts]
        MT --> NR
        RS --> NR
    end

    subgraph External
        API[API Service<br/>Spring Boot :8080]
        MT -->|fetchTrainingData()| API
    end

    subgraph Neo4j
        NR --> DB[(Neo4j 5.x<br/>Product nodes<br/>Client nodes<br/>BOUGHT edges)]
    end

    subgraph TF
        MT -->|model.fit| TFN[@tensorflow/tfjs-node]
        RS -->|model.predict batch| TFN
        MS -->|holds tf.LayersModel| TFN
    end
```

**Startup sequence (extended from M3):**
```
1. Validate env vars (NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, API_SERVICE_URL)
2. Instantiate neo4j Driver (singleton — unchanged)
3. Instantiate ModelStore (status: "untrained")
4. Check /tmp/model exists → if yes: tf.loadLayersModel('file:///tmp/model') → modelStore.setModel()
5. EmbeddingService.init() → model warm-up (unchanged)
6. fastify.listen() → accepts traffic
```

**Endpoints (M4 additions):**
| Method | Path | Service | Req IDs |
|--------|------|---------|---------|
| POST | /api/v1/model/train | ModelTrainer | M4-01..M4-12 |
| GET  | /api/v1/model/status | ModelStore | M4-13..M4-15 |
| POST | /api/v1/recommend | RecommendationService | M4-16..M4-27 |

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component | Location | How to Use |
|-----------|----------|------------|
| `Neo4jRepository` | `src/repositories/Neo4jRepository.ts` | Extend with 4 new methods (see Components section); constructor and session pattern unchanged |
| `Neo4jUnavailableError` | `src/repositories/Neo4jRepository.ts` | Reuse directly in all new Cypher methods |
| `EmbeddingService.embedText()` | `src/services/EmbeddingService.ts` | Used by `ModelTrainer` to embed product descriptions for products missing embeddings check; used by `RecommendationService` for semantic score path |
| `ENV` config object | `src/config/env.ts` | Extend with `API_SERVICE_URL`, `NEURAL_WEIGHT`, `SEMANTIC_WEIGHT` |
| Fastify `register` + prefix pattern | `src/index.ts` | Same pattern for `modelRoutes` and `recommendRoutes` |
| `Product` interface | `src/types/index.ts` | Reuse; add `RecommendationResult`, `TrainingStatus`, `ClientProfile` interfaces |

### Integration Points

| System | Integration Method |
|--------|--------------------|
| API Service (Spring Boot) | `fetch()` (Node.js built-in) — `GET /api/v1/clients`, `GET /api/v1/products`, `GET /api/v1/clients/{id}/orders` — inline in `ModelTrainer.fetchTrainingData()` (no class abstraction: single call site, Rule of Three) |
| Neo4j | Extended `Neo4jRepository` — 4 new methods; same driver singleton |
| `@tensorflow/tfjs-node` | `ModelTrainer` for training; `RecommendationService` for batch predict; `ModelStore` holds the `tf.LayersModel` reference |

---

## Components

### ModelStore (`src/services/ModelStore.ts`)

- **Purpose**: Single source of truth for trained model reference and training status metadata; enables atomic model swap (ADR-006)
- **Interfaces**:
  - `getModel(): tf.LayersModel | null`
  - `getStatus(): TrainingStatus` — returns `{ status: "untrained" | "training" | "trained", trainedAt?, startedAt?, progress?, finalLoss?, finalAccuracy?, trainingSamples? }`
  - `setModel(model: tf.LayersModel, metadata: TrainingMetadata): void` — called only after training fully completes; single synchronous reference assignment
  - `setTraining(startedAt: string): void` — called when training begins; sets status to `"training"`
  - `setProgress(epoch: number, total: number): void` — updates `progress` field during training
  - `reset(): void` — sets status back to `"untrained"` (used if training fails)
- **Rules**: `setModel()` never called during `model.fit()`; only after `model.save()` completes. All reads return a snapshot — no locks needed (atomic reference assignment, ADR-006).

### ModelTrainer (`src/services/ModelTrainer.ts`)

- **Purpose**: Orchestrates the full training pipeline: fetch data → build tensors → train → save → update `ModelStore`
- **Interfaces**:
  - `constructor(modelStore: ModelStore, repo: Neo4jRepository, embeddingService: EmbeddingService, apiServiceUrl: string, neuralWeight: number, semanticWeight: number)`
  - `async train(): Promise<TrainingResult>` — full pipeline; sets `isTraining` flag; returns `{ status, epochs, finalLoss, finalAccuracy, trainingSamples, durationMs }`
  - `get isTraining(): boolean`
- **Training pipeline**:
  ```
  1. Check isTraining → if true: throw 409 ConflictError
  2. Set isTraining = true; modelStore.setTraining(now)
  3. fetchTrainingData(apiServiceUrl) → { clients, products, orders }
  4. For each client: compute clientProfileVector = mean of embedded products (from Neo4j)
  5. Build binary matrix: for each (client, product) pair → label=1 if in orders, else 0 (negative sampling)
  6. Build inputVectors: concat([productEmbedding(384), clientProfileVector(384)]) = [768]
  7. xs = tf.tensor2d(inputVectors, [samples, 768])
  8. ys = tf.tensor2d(labels, [samples, 1])
  9. model = buildModel() → Sequential Dense(256,relu)+Dropout(0.3)+Dense(128,relu)+Dropout(0.2)+Dense(64,relu)+Dense(1,sigmoid)
  10. model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] })
  11. await model.fit(xs, ys, { epochs: 20, batchSize: 32, callbacks: { onEpochEnd } })
  12. xs.dispose(); ys.dispose()
  13. await model.save('file:///tmp/model')
  14. modelStore.setModel(model, metadata)
  15. isTraining = false; return result
  ```
- **Error handling**: any error in steps 3–14 → `isTraining = false`; `modelStore.reset()`; re-throw
- **tf.tidy() boundary (ADR-008)**: steps 7–8 (tensor construction) may use `tf.tidy()` only for intermediate tensors; `xs` and `ys` used in `model.fit()` must be disposed manually after fit (they cannot be inside `tidy()` since `fit()` is async)

### fetchTrainingData (module function in `ModelTrainer.ts`)

- **Purpose**: Fetches raw training data from API Service via HTTP; NOT a class (Rule of Three: one call site)
- **Signature**: `async function fetchTrainingData(apiServiceUrl: string): Promise<{ clients: ClientDTO[], products: ProductDTO[], orders: OrderDTO[] }>`
- **Calls**:
  - `GET {apiServiceUrl}/api/v1/clients?page=0&size=1000`
  - `GET {apiServiceUrl}/api/v1/products?page=0&size=1000`
  - `GET {apiServiceUrl}/api/v1/clients/{id}/orders?page=0&size=1000` — one per client
- **Error**: throws `ApiServiceUnavailableError` if any call fails with network error or 5xx

### RecommendationService (`src/services/RecommendationService.ts`)

- **Purpose**: Hybrid scoring pipeline — builds candidate pool, computes semantic + neural scores, returns ranked results
- **Interfaces**:
  - `constructor(modelStore: ModelStore, repo: Neo4jRepository, embeddingService: EmbeddingService, neuralWeight: number, semanticWeight: number)`
  - `async recommend(clientId: string, limit: number): Promise<RecommendationResult[]>`
- **Recommend pipeline**:
  ```
  1. model = modelStore.getModel() → if null: throw ModelNotTrainedError (→ 503)
  2. client = repo.getClientWithCountry(clientId) → if null: throw ClientNotFoundError (→ 404)
  3. purchasedIds = repo.getPurchasedProductIds(clientId)
  4. purchasedEmbeddings = repo.getClientPurchasedEmbeddings(clientId)
  5. if purchasedEmbeddings.length === 0: throw ClientNoPurchaseHistoryError (→ 422)
  6. clientProfileVector = elementwise mean of purchasedEmbeddings (384 dims)
  7. candidates = repo.getCandidateProducts(client.country, purchasedIds)
  8. if candidates.length === 0: return { recommendations: [], reason: "No new products..." }
  9. Filter candidates to those with embeddings; log warning for skipped (M4-26)
  10. [ADR-007] Async I/O complete — enter tf.tidy():
      a. batchMatrix = tf.tensor2d([...concat(productEmb, clientProfileVec) for each candidate], [N, 768])
      b. neuralScores = model.predict(batchMatrix) as tf.Tensor → dataSync() → Float32Array
      c. semanticScores = cosine(clientProfileVector, productEmb) per candidate (pure JS — no tensor needed)
  11. For each candidate: finalScore = NEURAL_WEIGHT * neuralScore + SEMANTIC_WEIGHT * semanticScore
  12. Sort by finalScore desc; slice to limit (max 50)
  13. Map matchReason: diff = |neural - semantic|; if diff < 0.05 → "hybrid"; else neural > semantic → "neural"; else → "semantic"
  14. Return array of RecommendationResult
  ```
- **Empty candidate guard**: step 8 returns early before any tensor allocation (QA Staff finding)
- **`matchReason` ordering**: diff-first evaluation (QA Staff finding, ADR-006)

### Neo4jRepository extensions

Four new methods added to the existing `Neo4jRepository` class (Principal SW Architect High finding):

| Method | Cypher | Returns |
|--------|--------|---------|
| `getClientWithCountry(clientId)` | `MATCH (c:Client {id: $id}) RETURN c.id, c.name, c.segment, c.country` | `ClientProfile \| null` |
| `getPurchasedProductIds(clientId)` | `MATCH (:Client {id: $id})-[:BOUGHT]->(p:Product) RETURN p.id` | `string[]` |
| `getClientPurchasedEmbeddings(clientId)` | `MATCH (:Client {id: $id})-[:BOUGHT]->(p:Product) WHERE p.embedding IS NOT NULL RETURN p.embedding` | `number[][]` |
| `getCandidateProducts(countryCode, excludedIds)` | `MATCH (p:Product)-[:AVAILABLE_IN]->(:Country {code: $code}) WHERE NOT p.id IN $excludedIds AND p.embedding IS NOT NULL RETURN p.id, p.name, p.category, p.price, p.sku, p.embedding` | `CandidateProduct[]` |

### Routes

**`src/routes/model.ts`**:
- `POST /api/v1/model/train` → calls `modelTrainer.train()`; returns 409 if already training
- `GET /api/v1/model/status` → calls `modelStore.getStatus()`

**`src/routes/recommend.ts`**:
- `POST /api/v1/recommend` → validates body `{ clientId, limit? }`; calls `recommendationService.recommend()`

### Config extensions (`src/config/env.ts`)

New env vars added to `ENV`:
- `API_SERVICE_URL: string` — required; no default; startup warning if absent
- `NEURAL_WEIGHT: number` — default `0.6`
- `SEMANTIC_WEIGHT: number` — default `0.4`
- Startup log: `"Hybrid weights: neural=X, semantic=Y"`
- Startup warning if `NEURAL_WEIGHT + SEMANTIC_WEIGHT !== 1.0`

---

## Data Models

### New interfaces (`src/types/index.ts` extensions)

```typescript
type ModelStatus = 'untrained' | 'training' | 'trained'

interface TrainingStatus {
  status: ModelStatus
  trainedAt?: string          // ISO8601
  startedAt?: string          // ISO8601, set when training begins
  progress?: string           // "epoch X/20"
  finalLoss?: number
  finalAccuracy?: number
  trainingSamples?: number
}

interface TrainingMetadata {
  trainedAt: string
  finalLoss: number
  finalAccuracy: number
  trainingSamples: number
  durationMs: number
}

interface ClientProfile {
  id: string
  name: string
  segment: string
  country: string
}

interface CandidateProduct {
  id: string
  name: string
  category: string
  price: number
  sku: string
  embedding: number[]         // 384 dims — already filtered by getCandidateProducts
}

type MatchReason = 'neural' | 'semantic' | 'hybrid'

interface RecommendationResult {
  id: string
  name: string
  category: string
  price: number
  sku: string
  finalScore: number
  neuralScore: number
  semanticScore: number
  matchReason: MatchReason
}
```

### Input tensor shape (Staff Engineering finding — explicit documentation)

```
Training input tensor:  [trainingSamples, 768]
  → col 0..383:  productEmbedding  (384 dims, @xenova/transformers all-MiniLM-L6-v2)
  → col 384..767: clientProfileVector (384 dims, mean of purchased product embeddings)

Predict input tensor:   [candidateCount, 768]
  → same layout as training input

Output tensor shape:    [candidateCount, 1]  → sigmoid score per candidate
```

---

## Error Handling Strategy

| Error Scenario | Error Class | HTTP | Message |
|----------------|-------------|------|---------|
| Model not trained | `ModelNotTrainedError` | 503 | `"Model not trained. Call POST /api/v1/model/train first."` |
| Training already in progress | `ConflictError` | 409 | `"Training already in progress"` |
| API Service unreachable | `ApiServiceUnavailableError` | 503 | `"API Service unavailable. Cannot fetch training data."` |
| `clientId` not found | `ClientNotFoundError` | 404 | `"Client not found"` |
| Client has no purchases | `ClientNoPurchaseHistoryError` | 422 | `"Client has no purchase history. Cannot compute profile vector."` |
| Empty candidate pool | (early return, no throw) | 200 | `{ recommendations: [], reason: "..." }` |
| Neo4j offline | `Neo4jUnavailableError` (existing) | 503 | `"Neo4j unavailable"` |
| `clientId` empty/invalid | validation in route | 400 | `"clientId is required"` |
| `limit` ≤ 0 | validation in route | 400 | `"limit must be >= 1"` |
| `limit` > 50 | cap in `RecommendationService` | — | silently capped to 50 |
| Model load failure on startup | log warning, status = "untrained" | — | startup continues normally |

---

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| `ModelStore` as shared state holder | Plain class with atomic reference assignment | ADR-006 — Node.js single-threaded reference swap is atomic; no locks needed |
| Batch predict | Single `tf.tensor2d` + one `model.predict()` call | ADR-007 — O(1) TF backend calls vs O(N) serial; 10–50x latency improvement |
| `tf.tidy()` boundary | Sync-only; all async I/O completed before entering | ADR-008 — async `await` inside `tidy()` silently breaks tensor tracking (L-001) |
| `fetchTrainingData` as module function | Not a class; inline in `ModelTrainer.ts` | Rule of Three: one call site; abstraction not justified |
| Client profile vector | Element-wise mean of purchased product embeddings | D-007 — dense 384-dim representation; no one-hot encoding |
| Input concat dimension | `[productEmb(384) + clientProfile(384)] = 768` | Matches spec AC6; explicitly documented to prevent off-by-one (Staff Engineering finding) |
| `matchReason` evaluation order | diff-first (< 0.05 → "hybrid"), then magnitude comparison | QA Staff finding — prevents "hybrid" from being unreachable when neural leads |
| `xs.dispose()` / `ys.dispose()` | Manual dispose after `model.fit()` | `model.fit()` is async; cannot be inside `tf.tidy()` — manual cleanup required |

---

## Alternatives Discarded

| Node | Approach | Eliminated in | Reason |
|------|----------|---------------|--------|
| C | Inline ML logic in route handlers; `tf.model` as module variable | Phase 2 | High: tensor lifecycle unmanageable in async route handlers; untestable; SRP violated |
| A | `ModelService` god class owning train + predict + status | Phase 2 + Phase 3 | High: concurrent train/predict race condition with no clean mitigation; Rule of Three violation (aggregates 3 responsibilities with no repetition evidence); CUPID-U: No |

---

## Committee Findings Applied

| Finding | Persona | How incorporated |
|---------|---------|-----------------|
| `ModelStore` must use atomic swap (replace reference only after training completes) | Principal SW Architect (High) + QA Staff (Medium) | `ModelStore.setModel()` called only after `model.save()` resolves; `setTraining()` / `setProgress()` / `reset()` are separate methods that never touch the model reference — ADR-006 |
| Batch all candidates into single `model.predict()` call | Staff Engineering (High) | `RecommendationService` step 10a builds `tf.tensor2d([...allVectors], [N, 768])` before calling `model.predict()` once — ADR-007 |
| `tf.tidy()` must only wrap synchronous code | Staff Engineering (High) | All async I/O (Neo4j, API Service) completed before `tf.tidy()` block in both `ModelTrainer` and `RecommendationService`; `xs`/`ys` training tensors disposed manually after async `model.fit()` — ADR-008 |
| Define 4 new `Neo4jRepository` methods before implementation | Principal SW Architect (High) | `getClientWithCountry`, `getPurchasedProductIds`, `getClientPurchasedEmbeddings`, `getCandidateProducts` fully specified in Components section |
| Input tensor shape `[N, 768]` explicitly documented | Staff Engineering (Medium) | Data Models section documents shape, column layout, and source of each 384-dim block |
| `matchReason` diff-first evaluation | QA Staff (Medium) | `RecommendationService` step 13: `diff = abs(neural - semantic)`; if `diff < 0.05` → `"hybrid"` evaluated first |
| Explicit empty candidate pool guard before tensor construction | QA Staff (Low) | `RecommendationService` step 8: early return before any `tf.tidy()` block if `candidates.length === 0` |

---

## Directory Structure (M4 additions to ai-service)

```
ai-service/src/
├── config/
│   └── env.ts                  # + API_SERVICE_URL, NEURAL_WEIGHT, SEMANTIC_WEIGHT
├── repositories/
│   └── Neo4jRepository.ts      # + 4 new methods: getClientWithCountry, getPurchasedProductIds,
│                               #   getClientPurchasedEmbeddings, getCandidateProducts
├── services/
│   ├── EmbeddingService.ts     # unchanged (reused)
│   ├── SearchService.ts        # unchanged (reused)
│   ├── RAGService.ts           # unchanged (reused)
│   ├── ModelStore.ts           # NEW — model reference + status metadata
│   ├── ModelTrainer.ts         # NEW — training pipeline + fetchTrainingData()
│   └── RecommendationService.ts # NEW — hybrid scoring pipeline
├── routes/
│   ├── embeddings.ts           # unchanged
│   ├── search.ts               # unchanged
│   ├── rag.ts                  # unchanged
│   ├── model.ts                # NEW — POST /train, GET /status
│   └── recommend.ts            # NEW — POST /recommend
├── types/
│   └── index.ts                # + TrainingStatus, TrainingMetadata, ClientProfile,
│                               #   CandidateProduct, RecommendationResult, MatchReason
└── index.ts                    # + ModelStore init + /tmp/model load on startup
                                # + ModelTrainer + RecommendationService instantiation
                                # + model/recommend routes registration
```
