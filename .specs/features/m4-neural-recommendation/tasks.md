# M4 — Neural Recommendation Model — Tasks

## Summary

**Total tasks:** 9  
**Requirements covered:** 34/34 (M4-01..M4-34)  
**Status:** ✅ All tasks complete — `tsc --noEmit` clean

---

## Phase 1 — Types & Configuration

### T1 — M4 types in `types/index.ts`

**File:** `ai-service/src/types/index.ts`  
**Requirements:** M4-13 (ModelStatus), M4-14 (TrainingMetadata), M4-09 (TrainingResult), M4-24 (RecommendationResult), M4-18 (ClientProfile, CandidateProduct)

Add to existing `types/index.ts`:

- `ModelStatus = 'untrained' | 'training' | 'trained'`
- `TrainingStatus` (status + optional trainedAt/startedAt/progress/finalLoss/finalAccuracy/trainingSamples)
- `TrainingMetadata` (trainedAt, finalLoss, finalAccuracy, trainingSamples, durationMs)
- `TrainingResult` (status: 'trained', epochs, finalLoss, finalAccuracy, trainingSamples, durationMs)
- `ClientProfile` (id, name, segment, country)
- `CandidateProduct` (id, name, category, price, sku, embedding: number[])
- `MatchReason = 'neural' | 'semantic' | 'hybrid'`
- `RecommendationResult` (id, name, category, price, sku, finalScore, neuralScore, semanticScore, matchReason)

**Verification:** `tsc --noEmit` clean ✅

---

### T2 — M4 env vars in `config/env.ts`

**File:** `ai-service/src/config/env.ts`  
**Requirements:** M4-32, M4-33, M4-34

Add after existing required-vars block:

- Warn if `API_SERVICE_URL` is not set (non-blocking)
- Read `NEURAL_WEIGHT` (default `0.6`) and `SEMANTIC_WEIGHT` (default `0.4`)
- `console.info` on startup: `"Hybrid weights: neural=X, semantic=Y"`
- Warn if `NEURAL_WEIGHT + SEMANTIC_WEIGHT != 1.0`
- Export `API_SERVICE_URL`, `NEURAL_WEIGHT`, `SEMANTIC_WEIGHT` from `ENV`

**Verification:** `tsc --noEmit` clean ✅

---

## Phase 2 — Repository

### T3 — Neo4j M4 query methods

**File:** `ai-service/src/repositories/Neo4jRepository.ts`  
**Requirements:** M4-01 (client country), M4-18 (candidate products), M4-20 (purchased embeddings), M4-21 (training data)

Add 4 methods to `Neo4jRepository`:

1. `getClientWithCountry(clientId): Promise<ClientProfile | null>` — `MATCH (c:Client {id: $id})`
2. `getPurchasedProductIds(clientId): Promise<string[]>` — `MATCH (:Client)-[:BOUGHT]->(p:Product)`
3. `getClientPurchasedEmbeddings(clientId): Promise<number[][]>` — same pattern, filter `p.embedding IS NOT NULL`
4. `getCandidateProducts(countryCode, excludedIds): Promise<CandidateProduct[]>` — products available in country, not in excludedIds, with embedding
5. `getAllProductEmbeddings(): Promise<{id, embedding}[]>` — all products with non-null embedding (used by training)

All methods use try/finally session close and throw `Neo4jUnavailableError` on error.

**Verification:** `tsc --noEmit` clean ✅

---

## Phase 3 — Services

### T4 — ModelStore

**File:** `ai-service/src/services/ModelStore.ts`  
**Requirements:** M4-13, M4-14, M4-15, M4-28..M4-31

Create `ModelStore` class:

- Private `model: tf.LayersModel | null = null`
- Private `status: TrainingStatus = { status: 'untrained' }`
- `getModel()`, `getStatus()` (returns copy)
- `setModel(model, metadata)` — sets status to `'trained'` with metadata
- `setTraining(startedAt)` — sets status to `'training'`
- `setProgress(epoch, total)` — updates `progress` field
- `reset()` — resets to `'untrained'`

**Verification:** `tsc --noEmit` clean ✅

---

### T5 — ModelTrainer

**File:** `ai-service/src/services/ModelTrainer.ts`  
**Requirements:** M4-01..M4-12

Create `ModelTrainer` class + `ConflictError` + `ApiServiceUnavailableError`:

- `fetchTrainingData(apiServiceUrl)` — fetches clients + products + orders/client via API Service
- `meanPooling(embeddings)` — element-wise mean of embedding arrays
- `buildModel()` — `Dense(256,relu) → Dropout(0.3) → Dense(128,relu) → Dropout(0.2) → Dense(64,relu) → Dense(1,sigmoid)`, inputShape `[768]`
- `train()`:
  1. Guard: throw `ConflictError` if already training (HTTP 409)
  2. Set `modelStore.setTraining()`; fetch data via API Service
  3. Build `productEmbeddingMap` from `getAllProductEmbeddings()`
  4. Build `inputVectors` / `labels` — concat `[productEmb(384), clientProfileVector(384)]`
  5. Skip client with 0 purchased embeddings; skip product with no embedding (log warn)
  6. Create `xs` (tensor2d Nx768), `ys` (tensor2d Nx1)
  7. Compile model: `adam`, `binaryCrossentropy`, `metrics: ['accuracy']`
  8. `model.fit` with `epochs: 20`, `batchSize: 32`; log each epoch + `modelStore.setProgress()`
  9. `xs.dispose(); ys.dispose()` after fit (ADR-008)
  10. `model.save('file:///tmp/model')`
  11. `modelStore.setModel()` with metadata; return `TrainingResult`
  12. On any error: reset `_isTraining = false`, `modelStore.reset()`, rethrow

**Verification:** `tsc --noEmit` clean ✅

---

### T6 — RecommendationService

**File:** `ai-service/src/services/RecommendationService.ts`  
**Requirements:** M4-16..M4-27

Create `RecommendationService` class + `ModelNotTrainedError` + `ClientNotFoundError` + `ClientNoPurchaseHistoryError`:

- `recommend(clientId, limit)`:
  1. Guard: throw `ModelNotTrainedError` if `modelStore.getModel() === null` (HTTP 503)
  2. `getClientWithCountry()` → throw `ClientNotFoundError` if null (HTTP 404)
  3. `getPurchasedProductIds()` + `getClientPurchasedEmbeddings()` in parallel
  4. Guard: throw `ClientNoPurchaseHistoryError` if embeddings empty (HTTP 422)
  5. `meanPooling(purchasedEmbeddings)` → `clientProfileVector`
  6. `getCandidateProducts(country, purchasedIds)` → return empty response if none
  7. `cappedLimit = Math.min(limit, 50)`
  8. Inside `tf.tidy()`: batch predict all candidates at once (ADR-007); compute `semanticScore` via cosine; compute `finalScore = neuralWeight * neural + semanticWeight * semantic`; determine `matchReason` (diff < 0.05 → 'hybrid')
  9. Sort by `finalScore` desc, slice to `cappedLimit`

**Verification:** `tsc --noEmit` clean ✅

---

## Phase 4 — Routes

### T7 — Model routes

**File:** `ai-service/src/routes/model.ts`  
**Requirements:** M4-09, M4-12, M4-13, M4-14, M4-15

Create `modelRoutes` Fastify plugin:

- `POST /model/train` — calls `modelTrainer.train()`; maps `ConflictError` → 409, `ApiServiceUnavailableError` → 503, `Neo4jUnavailableError` → 503
- `GET /model/status` — returns `modelStore.getStatus()` with HTTP 200

**Verification:** `tsc --noEmit` clean ✅

---

### T8 — Recommend route

**File:** `ai-service/src/routes/recommend.ts`  
**Requirements:** M4-16..M4-27

Create `recommendRoutes` Fastify plugin:

- `POST /recommend` — body: `{ clientId?: string, limit?: number }`
- Guard: `clientId` empty → 400; `limit <= 0` → 400
- Default `limit = 10`; no max here (service caps at 50)
- Maps `ModelNotTrainedError` → 503, `ClientNotFoundError` → 404, `ClientNoPurchaseHistoryError` → 422, `Neo4jUnavailableError` → 503

**Verification:** `tsc --noEmit` clean ✅

---

## Phase 5 — Wiring & Infrastructure

### T9 — Wire M4 in `index.ts` + startup model load + env vars

**Files:** `ai-service/src/index.ts`, `docker-compose.yml`, `.env.example`  
**Requirements:** M4-28..M4-34

In `index.ts`:

- Import `tf`, `fs`, `ModelStore`, `ModelTrainer`, `RecommendationService`, `modelRoutes`, `recommendRoutes`
- Create `modelStore = new ModelStore()`
- After `embeddingService.init()`, attempt `tf.loadLayersModel('file:///tmp/model')` if `/tmp/model` exists; on success call `modelStore.setModel()`; on error log warn and continue
- Instantiate `modelTrainer` and `recommendationService` with `ENV.API_SERVICE_URL`, `ENV.NEURAL_WEIGHT`, `ENV.SEMANTIC_WEIGHT`
- Register `modelRoutes` and `recommendRoutes` with prefix `/api/v1`

In `docker-compose.yml` (ai-service environment):

- `API_SERVICE_URL: http://api-service:8080`
- `NEURAL_WEIGHT: ${NEURAL_WEIGHT:-0.6}`
- `SEMANTIC_WEIGHT: ${SEMANTIC_WEIGHT:-0.4}`

In `.env.example`:

- `NEURAL_WEIGHT=0.6`
- `SEMANTIC_WEIGHT=0.4`

**Verification:** `tsc --noEmit` clean ✅

---

## Requirement Traceability

| Task | Requirements |
| --- | --- |
| T1 | M4-13, M4-14, M4-15, M4-09, M4-24, M4-18, M4-19 |
| T2 | M4-32, M4-33, M4-34 |
| T3 | M4-01, M4-03, M4-18, M4-20, M4-21 |
| T4 | M4-13, M4-14, M4-15, M4-28, M4-29, M4-30, M4-31 |
| T5 | M4-01, M4-02, M4-03, M4-04, M4-05, M4-06, M4-07, M4-08, M4-09, M4-10, M4-11, M4-12 |
| T6 | M4-16, M4-17, M4-18, M4-19, M4-20, M4-21, M4-22, M4-23, M4-24, M4-25, M4-26, M4-27 |
| T7 | M4-09, M4-12, M4-13, M4-14, M4-15 |
| T8 | M4-16, M4-17, M4-19, M4-22, M4-24, M4-25 |
| T9 | M4-28, M4-29, M4-30, M4-31, M4-32, M4-33, M4-34 |

**Coverage:** 34/34 requirements mapped ✓
