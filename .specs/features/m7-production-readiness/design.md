# M7 — Production Readiness: Design

**Status**: Approved
**Date**: 2026-04-25
**Spec**: [spec.md](spec.md)
**ADRs**: [ADR-012](adr-012-training-job-registry.md) · [ADR-013](adr-013-versioned-model-store.md) · [ADR-014](adr-014-admin-key-scoped-plugin.md) · [ADR-015](adr-015-ai-sync-client-fire-and-forget.md)

---

## Architecture Overview

M7 adds five operational capabilities without introducing new infrastructure. The ai-service gains three new classes (`TrainingJobRegistry`, `VersionedModelStore`, `CronScheduler`) and one new plugin encapsulation scope. The api-service gains one new service (`AiSyncClient`). The frontend gains a Playwright E2E test suite.

```mermaid
graph TB
    subgraph "api-service (extended)"
        PAS["ProductApplicationService\n+ notifyProductCreated()"]
        ASC["AiSyncClient (NEW)\nThread.ofVirtual() fire-and-forget\njava.net.http.HttpClient"]
        PAS -->|after save()| ASC
    end

    subgraph "ai-service — new classes"
        TJR["TrainingJobRegistry (NEW)\nMap<jobId, TrainingJob>\nenqueue() → setImmediate(train)"]
        VMS["VersionedModelStore (NEW)\nextends ModelStore\nsaveVersioned() + getHistory() + loadCurrent()\nFsPort injected"]
        CS["CronScheduler (NEW)\nnode-cron 0 2 * * *\nregisters job, checks isTraining inside setImmediate"]
    end

    subgraph "ai-service — extended"
        MT["ModelTrainer\ntrain() — unchanged logic\nreturns TrainingResult with precisionAt5"]
        MS["ModelStore (base)\nADR-006 atomic swap — unchanged"]
        ER["embeddingsRoutes\n+ POST /embeddings/sync-product (new, no admin key)"]
        VMS -->|extends| MS
    end

    subgraph "ai-service — new plugin scope"
        AR["adminRoutes plugin\nonRequest hook: X-Admin-Key\nPOST /model/train\nPOST /embeddings/generate"]
    end

    subgraph "ai-service — new routes"
        TR["trainRoutes\nPOST /model/train → 202 + jobId\nGET /model/train/status/:jobId → TrainingJob"]
    end

    TJR -->|fires setImmediate| MT
    MT -->|result| VMS
    CS -->|enqueue| TJR
    TR --> TJR
    AR --> TR

    subgraph "frontend (new)"
        PW["Playwright E2E\ne2e/tests/search.spec.ts\ne2e/tests/recommend.spec.ts\ne2e/tests/rag.spec.ts"]
    end

    subgraph "External"
        N4J[(Neo4j)]
        PG[(PostgreSQL)]
    end

    ASC -->|POST /embeddings/sync-product| ER
    ER -->|MERGE Product + generateEmbedding| N4J
    PAS --> PG
```

**Startup sequence (M7 extended):**
```
1. Validate env: NEO4J_*, API_SERVICE_URL, ADMIN_API_KEY (warn if absent)
2. Instantiate neo4j driver singleton (unchanged)
3. Instantiate VersionedModelStore (extends ModelStore)
4. VersionedModelStore.loadCurrent() → resolve /tmp/model/current symlink → tf.loadLayersModel
5. EmbeddingService.init() → warm-up (unchanged)
6. Instantiate TrainingJobRegistry(modelTrainer, versionedModelStore)
7. Instantiate CronScheduler(trainingJobRegistry) → registers cron "0 2 * * *"
8. Register adminRoutes plugin (scoped hook + POST /model/train + POST /embeddings/generate)
9. Register embeddingsRoutes (POST /embeddings/generate inside adminRoutes, POST /embeddings/sync-product outside)
10. fastify.listen() → accepts traffic
```

---

## Code Reuse Analysis

| Component | Status | Notes |
|-----------|--------|-------|
| `ModelStore` | Base unchanged | `VersionedModelStore extends ModelStore`; ADR-006 atomic swap contract preserved |
| `ModelTrainer.train()` | Unchanged | Registry calls `modelTrainer.train()`; result passed to `versionedModelStore.saveVersioned()` |
| `Neo4jRepository` | Extend | Add `createProductWithEmbedding(product, embedding)` — MERGE Product node + set embedding |
| `EmbeddingService.generateEmbeddings()` | Extend | Add fallback path: process products in PostgreSQL but not in Neo4j (M7-05) |
| `embeddingsRoutes` | Extend | Add `POST /embeddings/sync-product` handler (no admin key) |
| `AiServiceClient` | Unchanged | Recommendation proxy — no changes |
| `AiSyncClient` | New | Fire-and-forget notification to ai-service after product save |
| `ProductApplicationService` | Extend | Inject `AiSyncClient`; call `notifyProductCreated()` after `productRepository.save()` |
| `buildApp` test factory | Extend | Add `trainingJobRegistry` to `AppDeps` interface |
| `src/types/index.ts` | Extend | Add `TrainingJob`, `JobStatus`, `ModelHistoryEntry`, `EnrichedModelStatus` |
| `src/config/env.ts` | Extend | Add `ADMIN_API_KEY` (optional, warn if absent) |

---

## Components

### 1. `TrainingJobRegistry` (`src/services/TrainingJobRegistry.ts`)

**Purpose**: Tracks async training jobs; returns `jobId` immediately; wires `ModelTrainer.train()` result back to job state.

```typescript
type JobStatus = 'queued' | 'running' | 'complete' | 'failed'

interface TrainingJob {
  jobId: string
  status: JobStatus
  epoch?: number
  totalEpochs?: number
  loss?: number
  eta?: string
  error?: string
  startedAt?: string
  completedAt?: string
}
```

**Interface:**
```
constructor(modelTrainer: ModelTrainer, versionedModelStore: VersionedModelStore)
enqueue(): { jobId: string; status: 'queued' }
  - generates jobId = crypto.randomUUID()
  - if modelTrainer.isTraining → throw ConflictError (409)
  - stores { jobId, status: 'queued' } in Map
  - setImmediate(() => _runJob(jobId))   ← fires after HTTP response sent
  - returns { jobId, status: 'queued', message: 'Training job queued' }
getJob(jobId: string): TrainingJob | undefined
  - returns job from Map or undefined (→ 404 in route)
private async _runJob(jobId: string): void
  - if modelTrainer.isTraining: update job status = 'failed', error = 'Concurrent train'; return
  - update job status = 'running', startedAt = now
  - subscribe to modelTrainer.setProgressCallback((epoch, total, loss) => update job fields)
  - result = await modelTrainer.train()
  - await versionedModelStore.saveVersioned(result)
  - update job status = 'complete', completedAt = now
  - on catch: update job status = 'failed', error = err.message
  - prune map to MAX_JOBS = 20 (keep most recent by startedAt)
```

**Progress subscription**: `ModelTrainer` gains `setProgressCallback(cb)` method — callback invoked in `onEpochEnd` instead of (or in addition to) `modelStore.setProgress()`.

---

### 2. `VersionedModelStore` (`src/services/VersionedModelStore.ts`)

**Purpose**: Extends `ModelStore` with filesystem-backed model history, versioned save, and symlink-based `current` pointer.

```typescript
interface ModelHistoryEntry {
  filename: string         // 'model-2026-04-25T02-00-00.json'
  timestamp: string        // ISO8601
  precisionAt5: number
  loss: number
  accepted: boolean        // true if this is or was the 'current'
}

interface FsPort {
  symlink(target: string, path: string): Promise<void>
  unlink(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  stat(path: string): Promise<{ mtimeMs: number }>
  mkdir(path: string, options?: { recursive: boolean }): Promise<void>
}
```

**Interface:**
```
constructor(fsPort: FsPort = defaultFsPort)
  where defaultFsPort = node:fs/promises subset
async saveVersioned(model: tf.LayersModel, result: TrainingResult): Promise<void>
  1. timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
  2. filename = `model-${timestamp}.json`
  3. await model.save(`file:///tmp/model/${filename}`)
  4. currentPrecision = this.getStatus().precisionAt5 ?? 0
  5. newPrecision = result.precisionAt5
  6. promote = (newPrecision > 0 && newPrecision >= currentPrecision) || (newPrecision === 0 && result.finalLoss <= (this.getStatus().finalLoss ?? Infinity))
  7. if promote:
       await fsPort.unlink('/tmp/model/current').catch(() => {})
       await fsPort.symlink(filename, '/tmp/model/current')
       log.info(`[VersionedModelStore] Promoted ${filename} (precisionAt5=${newPrecision})`)
       super.setModel(model, metadata)   ← ADR-006 atomic swap
  8. else:
       log.warn(`[VersionedModelStore] Model rejected: new precisionAt5 ${newPrecision} < current ${currentPrecision}`)
  9. await pruneHistory()

async loadCurrent(): Promise<void>
  - try: resolve symlink /tmp/model/current → filename → tf.loadLayersModel
  - fallback: if symlink absent, list /tmp/model/*.json sorted by mtime desc, load most recent
  - on load failure: log warn, status remains 'untrained'
  - on no files: return (status 'untrained', no crash)

async getHistory(): Promise<ModelHistoryEntry[]>
  - list /tmp/model/model-*.json files, stat each, sort by mtime desc, take 5
  - reads metadata from model JSON headers if available, else uses filename timestamp

private async pruneHistory(): Promise<void>
  - list all /tmp/model/model-*.json, sort by mtime asc (oldest first)
  - delete all beyond the 5 most recent
```

---

### 3. `CronScheduler` (`src/services/CronScheduler.ts`)

**Purpose**: Registers the nightly retraining cron; exposes next execution time for observability.

```typescript
constructor(registry: TrainingJobRegistry, schedule: string = '0 2 * * *')
start(): void
  - cron.schedule(schedule, () => {
      setImmediate(() => {
        if (modelTrainer.isTraining) {
          log.warn('Skipping scheduled train: training already in progress')
          return
        }
        registry.enqueue()
        log.info('[CronScheduler] Training job enqueued by cron')
      })
    })
  - log registered schedule and next execution ISO datetime
getNextExecution(): Date
  - use cron-parser or node-cron nextDate() API to compute next trigger datetime
```

`GET /model/status` response is extended to include `nextScheduledTraining: string (ISO)` from `cronScheduler.getNextExecution().toISOString()`.

---

### 4. Admin key hook (`src/routes/adminRoutes.ts` plugin)

**Purpose**: Encapsulates admin-protected endpoints; applies `X-Admin-Key` validation via `onRequest` hook scoped to this plugin only.

```typescript
export async function adminRoutes(fastify: FastifyInstance, options: AdminRoutesOptions) {
  const adminKey = ENV.ADMIN_API_KEY

  fastify.addHook('onRequest', async (request, reply) => {
    const key = request.headers['x-admin-key']
    if (!adminKey || key !== adminKey) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })

  // POST /model/train → 202 + jobId  (M7-07)
  fastify.post('/model/train', async (_request, reply) => {
    try {
      const job = options.registry.enqueue()
      return reply.code(202).send({ ...job, message: 'Training job queued' })
    } catch (err) {
      if (err instanceof ConflictError) return reply.code(409).send({ error: err.message })
      throw err
    }
  })

  // GET /model/train/status/:jobId  (M7-08..M7-12)
  fastify.get('/model/train/status/:jobId', async (request, reply) => {
    const { jobId } = request.params as { jobId: string }
    const job = options.registry.getJob(jobId)
    if (!job) return reply.code(404).send({ error: 'Job not found' })
    return reply.code(200).send(job)
  })
}
```

`POST /embeddings/generate` is also moved inside `adminRoutes`. `POST /embeddings/sync-product` remains in `embeddingsRoutes` (outside `adminRoutes`).

---

### 5. `POST /embeddings/sync-product` (`src/routes/embeddings.ts` addition)

**Purpose**: Internal endpoint called by api-service to sync a single product to Neo4j and generate its embedding immediately.

```
Body: { id: string, name: string, description: string, category: string, price: number, sku: string, countryCodes: string[] }
Handler:
  1. Check Neo4j: MATCH (p:Product {id: $id}) WHERE p.embedding IS NOT NULL → if exists, return 200 { skipped: true }
  2. text = `${name} ${description} ${category}`
  3. embedding = await embeddingService.embedText(text)
  4. await repo.createProductWithEmbedding({ id, name, description, category, price, sku, countryCodes }, embedding)
  5. return 200 { synced: true, productId: id }
Response times: < 5s (M7-02 AC)
No admin key required (M7-29, ADR-014)
```

---

### 6. `Neo4jRepository.createProductWithEmbedding()` (extension)

```typescript
async createProductWithEmbedding(
  product: { id: string; name: string; description: string; category: string; price: number; sku: string; countryCodes: string[] },
  embedding: number[]
): Promise<void>
```

Cypher (idempotent — M7-06):
```cypher
MERGE (p:Product {id: $id})
ON CREATE SET p.name = $name, p.description = $description,
              p.category = $category, p.price = $price, p.sku = $sku
WITH p
FOREACH (code IN $countryCodes |
  MERGE (c:Country {code: code})
  MERGE (p)-[:AVAILABLE_IN]->(c)
)
WITH p
WHERE p.embedding IS NULL
SET p.embedding = $embedding
```

`WHERE p.embedding IS NULL` guard on SET ensures idempotency — existing embeddings are not overwritten (M7-06).

---

### 7. `AiSyncClient` (new Java class — `api-service`)

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

`ProductApplicationService` ganha `AiSyncClient aiSyncClient` no constructor; chama `aiSyncClient.notifyProductCreated(result)` após `return toDetail(product)` (após commit da transação — ADR-015).

**Nota:** `AiSyncClient` usa `java.net.http.HttpClient` (built-in Java 11+) — não depende de `WebClient` nem de Reactor. `spring-boot-starter-webflux` permanece no classpath por ora (necessário para `AiServiceClient.recommend()`); remoção completa registrada como Deferred Idea.

---

### 8. Playwright E2E (`frontend/e2e/`)

```
frontend/
└── e2e/
    ├── playwright.config.ts       ← baseURL: http://localhost:3000, timeout: 30000
    ├── screenshots/               ← Playwright saves failure screenshots here
    └── tests/
        ├── search.spec.ts         ← M7-32: type query → assert product cards rendered
        ├── recommend.spec.ts      ← M7-33: select client → click "Get Recommendations" → assert scored cards
        └── rag.spec.ts            ← M7-34: type query → send → assert non-empty response text
```

---

## Data Models

### New / extended types (`src/types/index.ts`)

```typescript
type JobStatus = 'queued' | 'running' | 'complete' | 'failed'

interface TrainingJob {
  jobId: string
  status: JobStatus
  epoch?: number
  totalEpochs?: number
  loss?: number
  eta?: string
  error?: string
  startedAt?: string
  completedAt?: string
}

interface ModelHistoryEntry {
  filename: string
  timestamp: string
  precisionAt5: number
  loss: number
  accepted: boolean
}

// Extended GET /model/status response
interface EnrichedModelStatus extends EnrichedTrainingStatus {
  currentModel?: string              // filename of current symlink target
  models: ModelHistoryEntry[]        // last 5 models
  nextScheduledTraining?: string     // ISO datetime from CronScheduler
}
```

### `TrainingStatus` — no changes required (M6 extensions sufficient)

---

## Error Handling Strategy

| Scenario | Handler | HTTP |
|----------|---------|------|
| `POST /model/train` without `X-Admin-Key` | `adminRoutes` hook | 401 |
| `POST /model/train` with invalid key | `adminRoutes` hook | 401 |
| `POST /model/train` while training in progress | `TrainingJobRegistry.enqueue()` throws `ConflictError` | 409 |
| `GET /model/train/status/:jobId` — jobId not found | route returns 404 | 404 |
| `POST /embeddings/sync-product` — Neo4j unavailable | `Neo4jUnavailableError` | 503 |
| `POST /embeddings/sync-product` — product already synced | idempotent return | 200 `{ skipped: true }` |
| `VersionedModelStore.saveVersioned()` — new model worse than current | log warn, no symlink update, no `super.setModel()` call | — (silent, status unchanged) |
| `VersionedModelStore.loadCurrent()` — no model files | log info, status = 'untrained', no crash | — |
| `AiSyncClient.notifyProductCreated()` — ai-service unavailable | `catch` na virtual thread loga WARN | — (fire-and-forget, 201 unaffected) |
| `CronScheduler` — training already running at trigger time | log skip inside `setImmediate`, no new job enqueued | — |
| `ADMIN_API_KEY` not set in env | startup WARN log; hook rejects all admin requests with 401 | 401 |

---

## Tech Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Async train pattern | `TrainingJobRegistry` + `setImmediate` + `Map<jobId>` (ADR-012) | Fits existing DI/composition; no external dependency; isTraining guard closes race |
| Model versioning | `VersionedModelStore extends ModelStore` + `FsPort` injected (ADR-013) | SRP preserved; base `ModelStore` ADR-006 contract unchanged; testable via `vi.fn()` |
| Admin protection | Scoped Fastify plugin `adminRoutes` + `addHook('onRequest')` (ADR-014) | OCP: new admin endpoints added inside plugin, zero hook changes; internal endpoints never affected |
| Product sync | `AiSyncClient` Java service + `Thread.ofVirtual()` + `java.net.http.HttpClient` (ADR-015) | Idiomático no stack servlet + Java 21; observável em thread dumps; testável com Mockito padrão; zero Reactor scheduler |
| Cron library | `node-cron` | Already referenced in spec (M7-13); no new dependency evaluation needed |
| FS operations | `node:fs/promises` via injected `FsPort` | Async — no event loop blocking; `FsPort` makes `VersionedModelStore` unit-testable (QA finding) |
| E2E framework | Playwright | Spec mandates it (M7-31); modern, reliable, built-in screenshot on failure |
| `precisionAt5 === 0` fallback for promotion | Compare `loss` instead | Edge case: fewer than 5 catalogue products prevents valid precision computation (M7 edge cases) |
| Progress callback | `ModelTrainer.setProgressCallback(cb)` | Decouples registry from `ModelStore.setProgress()` while preserving backward compat for existing tests |

---

## Alternatives Discarded

| Node | Approach | Eliminated in | Reason |
|------|----------|---------------|--------|
| B | Extend `ModelStore` with job scheduling (`enqueueTraining`, jobs Map) | Phase 2 | High: SRP violation (scheduling + atomic swap in one class); Rule of Three — no evidence of repetition for scheduling concern |
| C | Redis-backed job state | Phase 2 | High: Rule of Three — zero Redis prior art in codebase; I/O SPOF — polling endpoint fails when Redis unavailable |

---

## Committee Findings Applied

| Finding | Persona | How incorporated |
|---------|---------|-----------------|
| `VersionedModelStore` must be separate class (SRP) | Principal SW Architect (High) | `VersionedModelStore extends ModelStore` with `saveVersioned()`, `getHistory()`, `loadCurrent()`; `ModelStore` base unchanged |
| Admin key in scoped plugin hook, not per-route (OCP) | Principal SW Architect (High) | `adminRoutes` Fastify plugin with `addHook('onRequest', adminKeyHook)` encapsulating only the two admin routes |
| `TrainingJobRegistry` unit tests required | QA Staff (High) | Tests defined: 202+jobId on enqueue, 409 on double-enqueue, status transitions via mocked `ModelTrainer` |
| `FsPort` interface for mockable FS operations | QA Staff (Medium) + Staff Engineering (Low) | `FsPort` injected into `VersionedModelStore` constructor; all `fs.promises.*` calls go through port; `defaultFsPort` uses `node:fs/promises` |
| Model history pruning beyond 5 entries | Staff Engineering (Medium) | `pruneHistory()` called in `saveVersioned()` — deletes oldest files beyond 5 most recent |
| `isTraining` checked inside `setImmediate` in cron | Staff Engineering (Medium) | `CronScheduler` fires `setImmediate` first, then checks `isTraining` inside callback before calling `registry.enqueue()` |
| Error consumer em `AiSyncClient.notifyProductCreated()` | Staff Engineering (Medium) | `catch (Exception e)` na virtual thread com `log.warn(productId, msg)` |
| `sync-product` must not require admin key — regression test | QA Staff (Medium) | Test asserts `POST /embeddings/sync-product` without `X-Admin-Key` returns non-401; also covered by plugin scoping (ADR-014) |

---

## Directory Structure (M7 additions)

```
ai-service/src/
├── config/
│   └── env.ts                        # + ADMIN_API_KEY (optional, warn if absent)
├── repositories/
│   └── Neo4jRepository.ts            # + createProductWithEmbedding()
├── services/
│   ├── ModelStore.ts                  # unchanged (base)
│   ├── VersionedModelStore.ts         # NEW — extends ModelStore + FsPort
│   ├── TrainingJobRegistry.ts         # NEW — Map<jobId, TrainingJob> + setImmediate
│   ├── CronScheduler.ts               # NEW — node-cron + getNextExecution()
│   ├── ModelTrainer.ts                # extend: setProgressCallback() method
│   └── EmbeddingService.ts            # unchanged
├── routes/
│   ├── embeddings.ts                  # + POST /embeddings/sync-product (no admin key)
│   ├── adminRoutes.ts                 # NEW — scoped plugin: POST /model/train + POST /embeddings/generate + GET /model/train/status/:jobId
│   └── model.ts                       # extend: GET /model/status returns EnrichedModelStatus
├── types/
│   └── index.ts                       # + TrainingJob, JobStatus, ModelHistoryEntry, EnrichedModelStatus
└── index.ts                           # + VersionedModelStore init + CronScheduler + adminRoutes registration

api-service/src/main/java/com/smartmarketplace/
└── service/
    └── AiSyncClient.java              # NEW — Thread.ofVirtual() fire-and-forget + java.net.http.HttpClient

frontend/
└── e2e/
    ├── playwright.config.ts           # NEW
    └── tests/
        ├── search.spec.ts             # NEW
        ├── recommend.spec.ts          # NEW
        └── rag.spec.ts                # NEW
```
