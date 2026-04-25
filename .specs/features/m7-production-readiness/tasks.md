# M7 — Production Readiness: Tasks

**Design**: `.specs/features/m7-production-readiness/design.md`
**Spec**: `.specs/features/m7-production-readiness/spec.md`
**Status**: Complete ✅

> **Gate commands** (no TESTING.md — derived from M6 conventions):
> - **TS quick gate**: `npm test --prefix ai-service`
> - **Java quick gate**: `./mvnw test -pl api-service`
> - **TS build gate**: `npm test --prefix ai-service && npm run lint --prefix ai-service`
> - **Java build gate**: `./mvnw verify -pl api-service`
> - **Full build gate**: `./mvnw verify -pl api-service && npm test --prefix ai-service && npm run lint --prefix ai-service && npm run lint --prefix frontend`
> - **E2E gate**: `npx playwright test --config frontend/e2e/playwright.config.ts`

---

## Execution Plan

### Phase 1: Foundation — Types & Env (Sequential)

Shared TypeScript types and env extension must exist before any new service or route code can compile.

```
T1 → T2
```

### Phase 2: Core Services — TrainingJobRegistry + VersionedModelStore (Parallel OK after T2)

Both new services depend only on types. `VersionedModelStore` depends on `ModelTrainer` being extended (T3a). They can be developed in parallel after T2 completes.

```
T2 complete, then:
    ├── T3 [P]   ← ModelTrainer.setProgressCallback() extension
    ├── T4 [P]   ← VersionedModelStore (depends only on types + FsPort)
    └── T5       ← TrainingJobRegistry (depends on T3 for progress callback + T4 for saveVersioned)
        (T5 waits for T3 + T4)
```

Revised:

```
T2 → T3 [P] ─┐
T2 → T4 [P] ─┤→ T5
```

### Phase 3: CronScheduler + Admin Plugin + sync-product route (Parallel OK after T5)

These three components are independent of each other. `CronScheduler` needs `TrainingJobRegistry` (T5). `adminRoutes` needs `TrainingJobRegistry` (T5). `sync-product` route needs `Neo4jRepository` extension (T6, which can start from T2).

```
T2 complete, then:
    T6 [P]   ← Neo4jRepository.createProductWithEmbedding()

T5 + T6 complete, then:
    ├── T7 [P]   ← CronScheduler
    ├── T8 [P]   ← adminRoutes plugin (POST /model/train, GET /model/train/status/:jobId)
    └── T9 [P]   ← POST /embeddings/sync-product + updated EmbeddingService fallback
```

### Phase 4: ai-service wiring + GET /model/status extension (Sequential)

Wire all new services into `index.ts`. Extend `GET /model/status` to return `EnrichedModelStatus`.

```
T7, T8, T9 complete, then:
    T10 → T11
```

### Phase 5: api-service — AiSyncClient + ProductApplicationService extension (Parallel with Phase 3/4)

The api-service changes are independent of all ai-service work (different service boundary).

```
(can start after T1):
    T12 [P]   ← AiSyncClient.java
    T13        ← ProductApplicationService extension (depends on T12)
```

### Phase 6: Test Suite — ai-service (Parallel OK after Phase 4 complete)

Unit and integration tests for the new services.

```
T10 complete (wiring done), then:
    ├── T14 [P]   ← TrainingJobRegistry unit tests
    ├── T15 [P]   ← VersionedModelStore unit tests (FsPort mocked)
    ├── T16 [P]   ← adminRoutes integration tests (auth, 202, 404)
    └── T17 [P]   ← sync-product integration tests (idempotency, 401 guard)
```

### Phase 7: Playwright E2E + env.example + ai-service build gate (Parallel OK after Phase 5 + Phase 6)

```
T13 + T17 complete, then:
    ├── T18 [P]   ← Playwright config + search.spec.ts
    ├── T19 [P]   ← recommend.spec.ts + rag.spec.ts
    └── T20 [P]   ← .env.example + ADMIN_API_KEY documentation
```

### Phase 8: Full Build Gate (Sequential — final)

```
T18, T19, T20 complete, then:
    T21   ← Full build gate (all services + lint + coverage)
```

---

## Task Breakdown

### T1: Extend shared TypeScript types (`src/types/index.ts`)

**What**: Add `TrainingJob`, `JobStatus`, `ModelHistoryEntry`, and `EnrichedModelStatus` interfaces to the ai-service type definitions.
**Where**: `ai-service/src/types/index.ts`
**Depends on**: None
**Reuses**: Existing `TrainingStatus`, `EnrichedTrainingStatus` types in same file
**Requirement**: M7-07, M7-08, M7-19, M7-21

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `JobStatus = 'queued' | 'running' | 'complete' | 'failed'` exported
- [ ] `TrainingJob { jobId, status, epoch?, totalEpochs?, loss?, eta?, error?, startedAt?, completedAt? }` exported
- [ ] `ModelHistoryEntry { filename, timestamp, precisionAt5, loss, accepted }` exported
- [ ] `EnrichedModelStatus extends EnrichedTrainingStatus` with `currentModel?`, `models: ModelHistoryEntry[]`, `nextScheduledTraining?` exported
- [ ] `tsc --noEmit` passes in `ai-service/`

**Tests**: none (types-only file)
**Gate**: quick (`npm test --prefix ai-service` — existing tests still pass)

---

### T2: Extend `src/config/env.ts` with `ADMIN_API_KEY`

**What**: Add optional `ADMIN_API_KEY` env var to ai-service config; log startup warning when absent.
**Where**: `ai-service/src/config/env.ts`
**Depends on**: None
**Reuses**: Existing env validation pattern in same file
**Requirement**: M7-28, M7-30

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `ADMIN_API_KEY` added as optional field (no crash when absent)
- [ ] Startup logs `"ADMIN_API_KEY not set — admin endpoints unprotected"` when env var is missing
- [ ] Exported `ENV.ADMIN_API_KEY` available to `adminRoutes`
- [ ] `tsc --noEmit` passes

**Tests**: none
**Gate**: quick (`npm test --prefix ai-service`)

---

### T3: Extend `ModelTrainer` with `setProgressCallback()` [P]

**What**: Add `setProgressCallback(cb: (epoch: number, totalEpochs: number, loss: number) => void)` method to `ModelTrainer`; invoke callback in `onEpochEnd` during training.
**Where**: `ai-service/src/services/ModelTrainer.ts`
**Depends on**: T1 (types), T2 (env)
**Reuses**: Existing `onEpochEnd` callback pattern; `ModelStore.setProgress()` call (preserved for backward compat)
**Requirement**: M7-07, M7-09

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `setProgressCallback(cb)` method added; callback stored as instance field
- [ ] `onEpochEnd` calls both `modelStore.setProgress()` (existing) AND `this._progressCallback?.(epoch, total, loss)` (new)
- [ ] Existing unit tests for `ModelTrainer` still pass (backward compatible)
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: ≥ existing count (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T4: Create `VersionedModelStore` class [P]

**What**: Implement `VersionedModelStore extends ModelStore` with `saveVersioned()`, `loadCurrent()`, `getHistory()`, and `pruneHistory()` methods; inject `FsPort` interface for testability.
**Where**: `ai-service/src/services/VersionedModelStore.ts` (new file)
**Depends on**: T1 (ModelHistoryEntry type), T2 (env)
**Reuses**: `ModelStore` base class; `ADR-013` design; `FsPort` interface defined inline
**Requirement**: M7-18, M7-19, M7-20, M7-21, M7-22, M7-23

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `FsPort` interface exported with `symlink`, `unlink`, `readdir`, `stat`, `mkdir` methods
- [ ] `defaultFsPort` using `node:fs/promises` exported
- [ ] `VersionedModelStore` constructor accepts `fsPort: FsPort = defaultFsPort`
- [ ] `saveVersioned(model, result)`: saves model with ISO timestamp filename, promotes symlink if `precisionAt5` new ≥ current (or uses `loss` comparison fallback when `precisionAt5 === 0`), calls `super.setModel()` only on promotion, calls `pruneHistory()`
- [ ] `loadCurrent()`: resolves `/tmp/model/current` symlink → fallback to most-recent-by-mtime → graceful no-op when no files
- [ ] `getHistory()`: reads last 5 `model-*.json` files sorted by mtime desc
- [ ] `pruneHistory()`: deletes oldest files beyond 5 most recent
- [ ] `tsc --noEmit` passes

**Tests**: unit (covered in T15)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T5: Create `TrainingJobRegistry` class

**What**: Implement `TrainingJobRegistry` with `enqueue()` and `getJob()` methods; uses `setImmediate` to fire training without blocking the HTTP response; tracks job state in a `Map`.
**Where**: `ai-service/src/services/TrainingJobRegistry.ts` (new file)
**Depends on**: T3 (ModelTrainer.setProgressCallback), T4 (VersionedModelStore.saveVersioned)
**Reuses**: `TrainingJob`, `JobStatus` from T1; `ConflictError` pattern from existing error types
**Requirement**: M7-07, M7-08, M7-09, M7-10, M7-11, M7-12

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `enqueue()` returns `{ jobId, status: 'queued', message }` in < 100ms; uses `crypto.randomUUID()`
- [ ] `enqueue()` throws `ConflictError` (409) when `modelTrainer.isTraining === true`
- [ ] `setImmediate` fires `_runJob(jobId)` after HTTP response is sent
- [ ] `_runJob` updates job status to `'running'`, subscribes to progress callback, awaits `modelTrainer.train()`, calls `versionedModelStore.saveVersioned()`, sets status to `'complete'`
- [ ] `_runJob` catches errors and sets status to `'failed'` with `error: err.message`
- [ ] `getJob(jobId)` returns `TrainingJob | undefined`
- [ ] Map pruned to `MAX_JOBS = 20` (keep most-recent by `startedAt`) after each job completion
- [ ] `tsc --noEmit` passes

**Tests**: unit (covered in T14)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T6: Extend `Neo4jRepository` with `createProductWithEmbedding()` [P]

**What**: Add `createProductWithEmbedding(product, embedding)` method to `Neo4jRepository` using an idempotent MERGE Cypher query.
**Where**: `ai-service/src/repositories/Neo4jRepository.ts`
**Depends on**: T2 (env, compilation baseline)
**Reuses**: Existing `Neo4jRepository` session try/finally pattern (ADR-004); existing MERGE Cypher patterns in same file
**Requirement**: M7-02, M7-06

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Method signature: `async createProductWithEmbedding(product: { id, name, description, category, price, sku, countryCodes: string[] }, embedding: number[]): Promise<void>`
- [ ] Cypher uses `MERGE (p:Product {id: $id}) ON CREATE SET ...` — idempotent
- [ ] `FOREACH` creates `Country` nodes and `AVAILABLE_IN` edges for each `countryCode`
- [ ] `WHERE p.embedding IS NULL SET p.embedding = $embedding` guard ensures existing embeddings are not overwritten (M7-06)
- [ ] Session opened/closed in `try/finally` (ADR-004 pattern)
- [ ] `tsc --noEmit` passes

**Tests**: none (integration covered in T17)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T7: Create `CronScheduler` class [P]

**What**: Implement `CronScheduler` that registers a `node-cron` job on schedule `'0 2 * * *'`, uses `setImmediate` inside the callback, skips if training in progress, and exposes `getNextExecution()`.
**Where**: `ai-service/src/services/CronScheduler.ts` (new file)
**Depends on**: T5 (TrainingJobRegistry), T2 (env)
**Reuses**: `node-cron` (already referenced in spec); `TrainingJobRegistry.enqueue()` from T5
**Requirement**: M7-13, M7-14, M7-15, M7-17, M7-18

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `constructor(registry: TrainingJobRegistry, schedule: string = '0 2 * * *')`
- [ ] `start()` calls `cron.schedule(schedule, () => { setImmediate(() => { /* check + enqueue */ }) })`
- [ ] Inside `setImmediate`: checks `modelTrainer.isTraining`; if true, logs skip message; if false, calls `registry.enqueue()` and logs
- [ ] `start()` logs registered schedule and next execution ISO datetime on startup
- [ ] `getNextExecution()` returns `Date` computed from cron expression (using `cron-parser` or `node-cron` `nextDate()` API)
- [ ] Cron errors are caught, logged with stack trace, and do not crash the process (M7-17)
- [ ] `tsc --noEmit` passes

**Tests**: none (scheduler behavior tested via integration / manual schedule override)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T8: Create `adminRoutes` Fastify plugin [P]

**What**: Create `adminRoutes` Fastify plugin that scopes `X-Admin-Key` validation via `addHook('onRequest', ...)` and registers `POST /model/train` (202 + jobId) and `GET /model/train/status/:jobId` routes inside the plugin.
**Where**: `ai-service/src/routes/adminRoutes.ts` (new file)
**Depends on**: T5 (TrainingJobRegistry), T2 (ENV.ADMIN_API_KEY)
**Reuses**: Existing Fastify plugin patterns in `embeddingsRoutes.ts`; `ConflictError` from existing errors
**Requirement**: M7-07, M7-08, M7-10, M7-24, M7-25, M7-26, M7-27, M7-28

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Plugin exported as async function compatible with `fastify.register(adminRoutes, options)`
- [ ] `onRequest` hook compares `request.headers['x-admin-key']` to `ENV.ADMIN_API_KEY`; returns `401 { error: 'Unauthorized' }` on mismatch or when env is absent
- [ ] `POST /model/train` calls `registry.enqueue()`, returns `202 { jobId, status, message }`; returns `409` on `ConflictError`
- [ ] `GET /model/train/status/:jobId` returns `200 TrainingJob` or `404 { error: 'Job not found' }`
- [ ] `POST /embeddings/generate` moved inside this plugin from `embeddingsRoutes.ts`
- [ ] `tsc --noEmit` passes

**Tests**: integration (covered in T16)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T9: Add `POST /embeddings/sync-product` route + EmbeddingService fallback [P]

**What**: Add `POST /embeddings/sync-product` handler to `embeddingsRoutes.ts` (outside `adminRoutes` — no admin key); extend `EmbeddingService.generateEmbeddings()` fallback to process products in PostgreSQL but missing from Neo4j or without embeddings.
**Where**: `ai-service/src/routes/embeddings.ts` (extend); `ai-service/src/services/EmbeddingService.ts` (extend)
**Depends on**: T6 (Neo4jRepository.createProductWithEmbedding), T2 (env)
**Reuses**: Existing `embeddingService.embedText()` pattern; existing `embeddingsRoutes` route registration
**Requirement**: M7-02, M7-03, M7-05, M7-06, M7-29

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `POST /embeddings/sync-product` body validated: `{ id, name, description, category, price, sku, countryCodes: string[] }`
- [ ] Handler checks Neo4j for existing product with embedding; returns `200 { skipped: true }` if found (idempotent — M7-06)
- [ ] Handler generates `text = "${name} ${description} ${category}"`, calls `embeddingService.embedText(text)`, calls `repo.createProductWithEmbedding()`
- [ ] Returns `200 { synced: true, productId }` on success; responds within 5s (M7-02 AC)
- [ ] No `X-Admin-Key` required on this endpoint (M7-29, ADR-014)
- [ ] `EmbeddingService.generateEmbeddings()` extended with fallback: query PostgreSQL for products not in Neo4j (or `embedding IS NULL`), process them (M7-05)
- [ ] `tsc --noEmit` passes

**Tests**: integration (covered in T17)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T10: Wire new services into `ai-service/src/index.ts`

**What**: Update `index.ts` to instantiate `VersionedModelStore`, `TrainingJobRegistry`, `CronScheduler`, register `adminRoutes` plugin, and inject all new services into `AppDeps`.
**Where**: `ai-service/src/index.ts`
**Depends on**: T7 (CronScheduler), T8 (adminRoutes), T9 (sync-product route)
**Reuses**: Existing startup sequence; DI pattern from M3/M4 `buildApp` factory
**Requirement**: M7-13, M7-22, M7-23

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Startup sequence follows design.md order (steps 1–10)
- [ ] `VersionedModelStore` instantiated and passed to `TrainingJobRegistry`
- [ ] `VersionedModelStore.loadCurrent()` called before `fastify.listen()` (M7-22); no crash when no model exists (M7-23)
- [ ] `TrainingJobRegistry` instantiated and passed to `CronScheduler` and `adminRoutes`
- [ ] `CronScheduler.start()` called after `buildApp` and before `fastify.listen()`
- [ ] `adminRoutes` registered via `fastify.register(adminRoutes, { registry })`
- [ ] `AppDeps` interface extended with `trainingJobRegistry` field (for test factory)
- [ ] `tsc --noEmit` passes

**Tests**: none (integration tested in T16/T17)
**Gate**: quick (`npm test --prefix ai-service`)

---

### T11: Extend `GET /model/status` to return `EnrichedModelStatus`

**What**: Update `model.ts` route handler to return `currentModel`, `models` (from `versionedModelStore.getHistory()`), and `nextScheduledTraining` (from `cronScheduler.getNextExecution()`).
**Where**: `ai-service/src/routes/model.ts`
**Depends on**: T10 (services wired)
**Reuses**: Existing `GET /model/status` handler; `EnrichedModelStatus` type from T1
**Requirement**: M7-18, M7-21

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Response includes `currentModel: string | undefined` (symlink target filename)
- [ ] Response includes `models: ModelHistoryEntry[]` (last 5, from `versionedModelStore.getHistory()`)
- [ ] Response includes `nextScheduledTraining: string` (ISO datetime, from `cronScheduler.getNextExecution().toISOString()`)
- [ ] Response includes `staleDays` and `staleWarning` (existing fields, unchanged)
- [ ] `tsc --noEmit` passes
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: ≥ existing count (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T12: Create `AiSyncClient.java` (api-service) [P]

**What**: Create new Spring `@Service` `AiSyncClient` that calls `POST /api/v1/embeddings/sync-product` on the ai-service via `Thread.ofVirtual()` fire-and-forget using `java.net.http.HttpClient` (Java 21 built-in — no Reactor dependency). See ADR-015 (revised).
**Where**: `api-service/src/main/java/com/smartmarketplace/service/AiSyncClient.java` (new file)
**Depends on**: None (independent of ai-service TypeScript work)
**Reuses**: `@Value("${ai.service.base-url}")` pattern (existing in `AiServiceClient.java`); `ProductDetailDTO`
**Requirement**: M7-01, M7-04

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `@Service AiSyncClient` with constructor injection of `@Value("${ai.service.base-url}") String aiServiceBaseUrl`
- [ ] `java.net.http.HttpClient` built with `connectTimeout(Duration.ofSeconds(5))` — no `WebClient`/Reactor dependency
- [ ] `notifyProductCreated(ProductDetailDTO product)` fires `Thread.ofVirtual().name("ai-sync-" + product.id()).start(runnable)`
- [ ] Inside virtual thread: builds `HttpRequest` to `aiServiceBaseUrl + "/api/v1/embeddings/sync-product"`, calls `httpClient.send()`, catches `Exception` and logs WARN with `productId` (M7-04)
- [ ] `buildPayload(ProductDetailDTO)` serializes DTO fields to JSON string matching ai-service body schema (`id`, `name`, `description`, `category`, `price`, `sku`, `countryCodes`)
- [ ] `notifyProductCreated` returns immediately (201 unaffected by ai-service latency/unavailability — M7-04)
- [ ] `./mvnw test -pl api-service` passes (existing tests unaffected)

**Tests**: unit
**Gate**: quick (`./mvnw test -pl api-service`)

---

### T13: Extend `ProductApplicationService` to call `AiSyncClient`

**What**: Inject `AiSyncClient` into `ProductApplicationService`; call `aiSyncClient.notifyProductCreated(result)` after `productRepository.save()` succeeds (after transaction commits — ADR-015).
**Where**: `api-service/src/main/java/com/smartmarketplace/service/ProductApplicationService.java`
**Depends on**: T12 (AiSyncClient)
**Reuses**: Existing `ProductApplicationService` constructor; `ProductDetailDTO` return from `createProduct()`
**Requirement**: M7-01, M7-04

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `AiSyncClient aiSyncClient` injected via constructor
- [ ] `aiSyncClient.notifyProductCreated(result)` called after `return toDetail(product)` — fires after transaction commits (ADR-015)
- [ ] If ai-service is unavailable, `POST /products` still returns `201 Created` (fire-and-forget — M7-04)
- [ ] Existing `ProductApplicationService` unit tests pass (add `@Mock AiSyncClient` — testável com Mockito padrão via `verify(aiSyncClient).notifyProductCreated(product)`, sem necessidade de `CountDownLatch`)
- [ ] Gate check passes: `./mvnw test -pl api-service`
- [ ] Test count: ≥ existing count (no silent deletions)

**Tests**: unit
**Gate**: quick (`./mvnw test -pl api-service`)

---

### T14: Unit tests — `TrainingJobRegistry` [P]

**What**: Write Vitest unit tests for `TrainingJobRegistry` covering enqueue success (202+jobId), double-enqueue conflict (409 / ConflictError), and job status transitions (queued → running → complete, queued → running → failed).
**Where**: `ai-service/src/services/TrainingJobRegistry.test.ts` (new file)
**Depends on**: T10 (wiring complete, registry fully injectable)
**Reuses**: Existing Vitest + `vi.fn()` mocking pattern from M6 tests; `buildApp` test factory
**Requirement**: M7-07, M7-08, M7-11, M7-12

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Test: `enqueue()` returns `{ jobId: string, status: 'queued' }` synchronously
- [ ] Test: `enqueue()` while `isTraining = true` throws error (ConflictError / maps to 409)
- [ ] Test: job transitions `queued → running → complete` when `modelTrainer.train()` resolves
- [ ] Test: job transitions `queued → running → failed` with `error` field when `modelTrainer.train()` rejects
- [ ] Test: `getJob(unknownId)` returns `undefined`
- [ ] `ModelTrainer` and `VersionedModelStore` mocked via `vi.fn()`
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: previous count + ≥ 5 new tests

**Tests**: unit
**Gate**: quick

---

### T15: Unit tests — `VersionedModelStore` [P]

**What**: Write Vitest unit tests for `VersionedModelStore` covering model promotion (precisionAt5 new ≥ current → symlink updated), rejection (precisionAt5 new < current → symlink unchanged + log), `loss` fallback when precisionAt5 = 0, `loadCurrent` with and without symlink, and `pruneHistory` beyond 5 files.
**Where**: `ai-service/src/services/VersionedModelStore.test.ts` (new file)
**Depends on**: T10 (class implemented and wired)
**Reuses**: `FsPort` interface (inject mock); Vitest `vi.fn()` pattern; existing `ModelStore` test patterns
**Requirement**: M7-18, M7-19, M7-20, M7-22, M7-23

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] All `FsPort` methods mocked via `vi.fn()`
- [ ] Test: `saveVersioned()` promotes symlink when `newPrecisionAt5 >= currentPrecisionAt5`
- [ ] Test: `saveVersioned()` does NOT update symlink when `newPrecisionAt5 < currentPrecisionAt5`; logs rejection message
- [ ] Test: `saveVersioned()` uses `loss` comparison when `precisionAt5 === 0`
- [ ] Test: `loadCurrent()` resolves symlink when it exists
- [ ] Test: `loadCurrent()` falls back to most-recent file when symlink absent
- [ ] Test: `loadCurrent()` returns without crash when no model files present (M7-23)
- [ ] Test: `pruneHistory()` deletes files beyond 5 most recent
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: previous count + ≥ 7 new tests

**Tests**: unit
**Gate**: quick

---

### T16: Integration tests — `adminRoutes` (auth + 202 + 404) [P]

**What**: Write Vitest integration tests for the `adminRoutes` plugin covering 401 responses (missing key, wrong key), 202 success with valid key, 404 for unknown jobId, and 409 for concurrent train attempt.
**Where**: `ai-service/src/routes/adminRoutes.test.ts` (new file)
**Depends on**: T10 (full wiring; `buildApp` factory includes `trainingJobRegistry`)
**Reuses**: Existing `buildApp` test factory pattern from M6; `supertest` or Fastify `inject()`
**Requirement**: M7-07, M7-08, M7-10, M7-24, M7-25, M7-26, M7-27, M7-28

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Test: `POST /model/train` without `X-Admin-Key` → `401 { error: 'Unauthorized' }` (M7-24)
- [ ] Test: `POST /model/train` with wrong key → `401` (M7-26)
- [ ] Test: `POST /model/train` with correct key → `202 { jobId, status: 'queued' }` (M7-27)
- [ ] Test: `GET /model/train/status/:jobId` with valid jobId → `200 TrainingJob` (M7-08)
- [ ] Test: `GET /model/train/status/nonexistent` → `404 { error: 'Job not found' }` (M7-10)
- [ ] Test: `POST /model/train` twice while first is running → `409` (concurrent guard)
- [ ] `TrainingJobRegistry` methods mocked (no real training triggered)
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: previous count + ≥ 6 new tests

**Tests**: integration
**Gate**: quick

---

### T17: Integration tests — `sync-product` route (idempotency + no-auth) [P]

**What**: Write Vitest integration tests for `POST /embeddings/sync-product` covering successful sync, idempotent skip when product already has embedding, and confirmation that no `X-Admin-Key` is required.
**Where**: `ai-service/src/routes/embeddings.test.ts` (extend or new file)
**Depends on**: T10 (full wiring)
**Reuses**: `buildApp` test factory; `Neo4jRepository` mocked via `vi.fn()`; existing embedding route test patterns
**Requirement**: M7-02, M7-03, M7-06, M7-29

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Test: `POST /embeddings/sync-product` without `X-Admin-Key` → NOT `401` (M7-29)
- [ ] Test: sync with new product → `200 { synced: true, productId }` + `createProductWithEmbedding` called once (M7-02)
- [ ] Test: sync with already-synced product (Neo4j mock returns existing embedding) → `200 { skipped: true }` + no duplicate write (M7-06)
- [ ] `Neo4jRepository.createProductWithEmbedding` and `EmbeddingService.embedText` mocked
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: previous count + ≥ 3 new tests

**Tests**: integration
**Gate**: quick

---

### T18: Playwright setup + `search.spec.ts` [P]

**What**: Install Playwright in `frontend/`, create `playwright.config.ts` (baseURL: localhost:3000, timeout: 30s, screenshots on failure), and write `search.spec.ts` verifying the semantic search flow.
**Where**: `frontend/e2e/playwright.config.ts` (new); `frontend/e2e/tests/search.spec.ts` (new); `frontend/package.json` (add Playwright dev dependency + script)
**Depends on**: T13 (api-service POST /products complete — full flow exercisable)
**Reuses**: Playwright patterns from design.md §8; existing frontend components for selector targets
**Requirement**: M7-31, M7-32, M7-35, M7-36

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `@playwright/test` added to `frontend/package.json` devDependencies
- [ ] `playwright.config.ts` sets `baseURL: 'http://localhost:3000'`, `timeout: 30000`, screenshot on failure saved to `e2e/screenshots/` (M7-35, M7-36)
- [ ] `search.spec.ts` test: navigate to app → type search query into semantic search input → assert product cards are rendered (M7-32)
- [ ] `frontend/e2e/screenshots/` directory entry in `.gitignore` (or tracked as empty dir with `.gitkeep`)
- [ ] `"test:e2e": "playwright test --config e2e/playwright.config.ts"` script added to `frontend/package.json`
- [ ] Config file syntactically valid (no TS errors in `frontend/`)

**Tests**: e2e
**Gate**: E2E (`npx playwright test --config frontend/e2e/playwright.config.ts` — requires running services)

---

### T19: Playwright `recommend.spec.ts` + `rag.spec.ts` [P]

**What**: Write Playwright E2E tests for the recommendations flow and RAG chat flow.
**Where**: `frontend/e2e/tests/recommend.spec.ts` (new); `frontend/e2e/tests/rag.spec.ts` (new)
**Depends on**: T18 (Playwright config + `e2e/` directory created)
**Reuses**: `playwright.config.ts` from T18; existing frontend component selectors
**Requirement**: M7-33, M7-34

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `recommend.spec.ts`: select client from dropdown → click "Get Recommendations" → assert product recommendation cards with score values are displayed (M7-33)
- [ ] `rag.spec.ts`: type a query in RAG chat input → submit → assert non-empty response text appears (M7-34)
- [ ] Both tests use `page.screenshot()` on failure (handled by `playwright.config.ts`)
- [ ] No TS errors in `frontend/e2e/`

**Tests**: e2e
**Gate**: E2E

---

### T20: Update `.env.example` with `ADMIN_API_KEY` [P]

**What**: Add `ADMIN_API_KEY=` with an explanatory comment to `.env.example` at the repo root.
**Where**: `.env.example` (root)
**Depends on**: None (documentation task)
**Reuses**: Existing `.env.example` format and comment style
**Requirement**: M7-30

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `ADMIN_API_KEY=` entry added under ai-service section in `.env.example`
- [ ] Comment explains: admin key protects `POST /model/train` and `POST /embeddings/generate`; leave empty for local dev (auth disabled with startup warning)
- [ ] README `## Environment Variables` section (or quickstart) references `ADMIN_API_KEY`

**Tests**: none
**Gate**: none (documentation only)

---

### T21: Full build gate — all services + lint + coverage (Final)

**What**: Run the full cross-service verification suite: Java unit + integration tests + JaCoCo, TypeScript tests + lint, and confirm `tsc --noEmit` clean across all services.
**Where**: Repo root
**Depends on**: T18, T19, T20 (all M7 implementation complete)
**Reuses**: Gate commands defined in this file's header
**Requirement**: All M7 requirements

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Build gate passes: `./mvnw verify -pl api-service` exits 0
- [ ] Surefire: all `*Test` Java classes pass (existing + T13 new tests)
- [ ] Failsafe: all `*IT` Testcontainers classes pass
- [ ] JaCoCo coverage threshold enforced and passing
- [ ] TS build gate passes: `npm test --prefix ai-service` exits 0 — test count: **≥ previous M6 count + 21 new tests** (T14: 5 + T15: 7 + T16: 6 + T17: 3)
- [ ] ESLint passes: `npm run lint --prefix ai-service` exits 0 (no new violations)
- [ ] ESLint passes: `npm run lint --prefix frontend` exits 0
- [ ] `tsc --noEmit` clean in `ai-service/`
- [ ] Checkstyle: `./mvnw checkstyle:check -pl api-service` exits 0 (0 violations)

**Tests**: build
**Gate**: build (`./mvnw verify -pl api-service && npm test --prefix ai-service && npm run lint --prefix ai-service && npm run lint --prefix frontend`)

**Commit**: `feat(m7): production readiness — async training, model versioning, product sync, admin security, playwright e2e`

---

## Parallel Execution Map

```
Phase 1 (Sequential — Foundation):
  T1 → T2

Phase 2 (Parallel — Core Services):
  T2 complete, then:
    ├── T3 [P]   (ModelTrainer.setProgressCallback)
    └── T4 [P]   (VersionedModelStore)
  T2 complete (also):
    T6 [P]       (Neo4jRepository.createProductWithEmbedding)
  T3, T4 complete, then:
    T5           (TrainingJobRegistry — needs T3 + T4)

Phase 3 (Parallel — Plugins & Routes):
  T5 + T6 complete, then:
    ├── T7 [P]   (CronScheduler)
    ├── T8 [P]   (adminRoutes plugin)
    └── T9 [P]   (sync-product route + EmbeddingService fallback)

  api-service (runs in parallel with all Phase 2/3):
    T2 complete, then:
    T12 [P]     (AiSyncClient.java)
    T12 complete, then:
    T13          (ProductApplicationService extension)

Phase 4 (Sequential — Wiring + Status):
  T7, T8, T9 complete, then:
    T10 → T11

Phase 5 (Parallel — Tests):
  T10 + T13 complete, then:
    ├── T14 [P]  (TrainingJobRegistry unit tests)
    ├── T15 [P]  (VersionedModelStore unit tests)
    ├── T16 [P]  (adminRoutes integration tests)
    └── T17 [P]  (sync-product integration tests)

Phase 6 (Parallel — E2E + Docs):
  T13 + T17 complete, then:
    ├── T18 [P]  (Playwright setup + search.spec.ts)
    ├── T19 [P]  (recommend.spec.ts + rag.spec.ts — after T18)
    └── T20 [P]  (env.example ADMIN_API_KEY)

Phase 7 (Sequential — Final Gate):
  T18, T19, T20 complete, then:
    T21          (Full build gate)
```

---

## Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: Extend types/index.ts | 1 file, type definitions only | ✅ Granular |
| T2: Extend env.ts | 1 file, 1 env var | ✅ Granular |
| T3: ModelTrainer.setProgressCallback() | 1 method in 1 file | ✅ Granular |
| T4: VersionedModelStore | 1 new class file | ✅ Granular |
| T5: TrainingJobRegistry | 1 new class file | ✅ Granular |
| T6: Neo4jRepository.createProductWithEmbedding() | 1 method in 1 file | ✅ Granular |
| T7: CronScheduler | 1 new class file | ✅ Granular |
| T8: adminRoutes plugin | 1 new plugin file | ✅ Granular |
| T9: sync-product route + EmbeddingService fallback | 2 files, 1 cohesive flow | ✅ Granular (cohesive — same data path) |
| T10: index.ts wiring | 1 file, DI assembly | ✅ Granular |
| T11: GET /model/status extension | 1 route handler in 1 file | ✅ Granular |
| T12: AiSyncClient.java | 1 new class | ✅ Granular |
| T13: ProductApplicationService extension | 1 method call in 1 file | ✅ Granular |
| T14: TrainingJobRegistry tests | 1 test file | ✅ Granular |
| T15: VersionedModelStore tests | 1 test file | ✅ Granular |
| T16: adminRoutes tests | 1 test file | ✅ Granular |
| T17: sync-product tests | 1 test file | ✅ Granular |
| T18: Playwright config + search.spec.ts | 2 files, 1 setup concern | ✅ Granular (cohesive setup) |
| T19: recommend.spec.ts + rag.spec.ts | 2 test files, same E2E suite | ✅ Granular |
| T20: .env.example update | 1 file, 1 variable | ✅ Granular |
| T21: Full build gate | Verification only, no code | ✅ Granular |

---

## Diagram–Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | None | T1 → T2 | ✅ Match |
| T3 | T1, T2 | T2 → T3 [P] | ✅ Match |
| T4 | T1, T2 | T2 → T4 [P] | ✅ Match |
| T5 | T3, T4 | T3 + T4 → T5 | ✅ Match |
| T6 | T2 | T2 → T6 [P] | ✅ Match |
| T7 | T5 | T5 + T6 → T7 [P] | ✅ Match |
| T8 | T5, T2 | T5 + T6 → T8 [P] | ✅ Match |
| T9 | T6, T2 | T5 + T6 → T9 [P] | ✅ Match |
| T10 | T7, T8, T9 | T7 + T8 + T9 → T10 | ✅ Match |
| T11 | T10 | T10 → T11 | ✅ Match |
| T12 | None (api-service independent) | T2 → T12 [P] | ✅ Match |
| T13 | T12 | T12 → T13 | ✅ Match |
| T14 | T10 | T10 + T13 → T14 [P] | ✅ Match |
| T15 | T10 | T10 + T13 → T15 [P] | ✅ Match |
| T16 | T10 | T10 + T13 → T16 [P] | ✅ Match |
| T17 | T10 | T10 + T13 → T17 [P] | ✅ Match |
| T18 | T13 | T13 + T17 → T18 [P] | ✅ Match |
| T19 | T18 | T18 → T19 [P] | ✅ Match |
| T20 | None | T13 + T17 → T20 [P] | ✅ Match |
| T21 | T18, T19, T20 | T18 + T19 + T20 → T21 | ✅ Match |

---

## Test Co-location Validation

> Note: No TESTING.md exists. Test types derived from M6 tasks.md conventions and design.md QA requirements.

| Task | Code Layer Created/Modified | Test Required | Task Says | Status |
|------|-----------------------------|---------------|-----------|--------|
| T1 | types only | none | none | ✅ OK |
| T2 | config/env | none | none | ✅ OK |
| T3 | service layer (ModelTrainer) | unit | unit (T3 runs existing tests; T14 adds new) | ✅ OK |
| T4 | service layer (VersionedModelStore) | unit | unit (T15 covers) | ✅ OK |
| T5 | service layer (TrainingJobRegistry) | unit | unit (T14 covers) | ✅ OK |
| T6 | repository layer (Neo4jRepository) | integration | integration (T17 covers) | ✅ OK |
| T7 | service layer (CronScheduler) | none (schedule-driven) | none | ✅ OK |
| T8 | route layer (adminRoutes) | integration | integration (T16 covers) | ✅ OK |
| T9 | route layer (sync-product) + service | integration | integration (T17 covers) | ✅ OK |
| T10 | index.ts wiring | none (assembly) | none | ✅ OK |
| T11 | route extension (model.ts) | unit | unit | ✅ OK |
| T12 | service layer Java (AiSyncClient) | unit | unit | ✅ OK |
| T13 | service layer Java (ProductApplicationService) | unit | unit | ✅ OK |
| T14 | test file only | — | unit | ✅ OK |
| T15 | test file only | — | unit | ✅ OK |
| T16 | test file only | — | integration | ✅ OK |
| T17 | test file only | — | integration | ✅ OK |
| T18 | e2e test + config | e2e | e2e | ✅ OK |
| T19 | e2e test files | e2e | e2e | ✅ OK |
| T20 | .env.example (docs) | none | none | ✅ OK |
| T21 | verification only | build | build | ✅ OK |

---

## Requirement Traceability

| Requirement | Task(s) |
|-------------|---------|
| M7-01 | T12, T13 |
| M7-02 | T6, T9, T17 |
| M7-03 | T9, T17 |
| M7-04 | T12, T13 |
| M7-05 | T9 |
| M7-06 | T6, T9, T17 |
| M7-07 | T5, T8, T14, T16 |
| M7-08 | T8, T16 |
| M7-09 | T3, T5 |
| M7-10 | T8, T16 |
| M7-11 | T5, T14 |
| M7-12 | T5, T14 |
| M7-13 | T7, T10 |
| M7-14 | T7 |
| M7-15 | T7 |
| M7-16 | T7, T10, T11 |
| M7-17 | T7 |
| M7-18 | T7, T11 |
| M7-19 | T4, T15 |
| M7-20 | T4, T15 |
| M7-21 | T4, T11, T15 |
| M7-22 | T4, T10 |
| M7-23 | T4, T10 |
| M7-24 | T8, T16 |
| M7-25 | T8, T16 |
| M7-26 | T8, T16 |
| M7-27 | T8, T16 |
| M7-28 | T2, T8, T16 |
| M7-29 | T9, T17 |
| M7-30 | T20 |
| M7-31 | T18, T19 |
| M7-32 | T18 |
| M7-33 | T19 |
| M7-34 | T19 |
| M7-35 | T18 |
| M7-36 | T18 |

**Coverage:** 37/37 requirements mapped ✅
