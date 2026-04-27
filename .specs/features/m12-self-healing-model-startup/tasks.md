# M12 - Self-Healing Model Startup - Tasks

**Design**: `.specs/features/m12-self-healing-model-startup/design.md`
**Spec**: `.specs/features/m12-self-healing-model-startup/spec.md`
**Testing**: `.specs/codebase/ai-service/TESTING.md`
**Status**: Completed (2026-04-27)

---

## Execution Plan

### Phase 1: Recovery Primitives (Partial Parallel)

`TrainingJobRegistry.waitFor()` must exist before the new startup orchestrator can await a background job without polling. The env opt-out can be done independently.

```
T1 ──→ T2
T3 [P]
```

### Phase 2: Bootstrap + Startup Tests (Sequential)

The startup wiring depends on both the recovery service and the env flag. Startup-level tests are co-located with the bootstrap work in the same task.

```
T2, T3 ──→ T4
```

### Phase 3: Compose Contract (Sequential)

The container health contract should change only after `/ready` really represents usable recommendation state.

```
T4 ──→ T5
```

### Phase 4: Final Gate (Sequential)

The feature is only done after the ai-service build gate passes and the cold-boot startup contract is validated end to end.

```
T5 ──→ T6
```

---

## Task Breakdown

### T1: Extend `TrainingJobRegistry` with `waitFor(jobId)`

**What**: Add a promise-based terminal-state API so startup recovery can piggyback on an in-flight training job without polling loops or duplicate enqueue attempts.
**Where**:
- `ai-service/src/services/TrainingJobRegistry.ts`
- `ai-service/src/services/TrainingJobRegistry.test.ts`
**Depends on**: None
**Reuses**: Existing `jobs` map, `getActiveJobId()`, `ModelTrainer.setProgressCallback()`, and `VersionedModelStore.saveVersioned()`
**Requirement**: M12-03
**Status**: ✅ Complete

**Tools**:
- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:
- [ ] `waitFor(jobId)` is exported and resolves immediately for terminal `done` / `failed` jobs
- [ ] `waitFor(jobId)` waits for queued/running jobs without polling loops or direct access to `ModelTrainer` internals
- [ ] Unknown `jobId` resolves to `undefined` (or an equivalent explicit typed result) without hanging forever
- [ ] Completion listeners are released after resolution so repeated jobs do not leak memory
- [ ] Existing `enqueue()`, `getJob()`, and `getActiveJobId()` behavior remains unchanged
- [ ] Unit tests cover: immediate terminal resolution, queued/running job that becomes `done`, queued/running job that becomes `failed`, and unknown `jobId`
- [ ] Gate check passes: `npm test`
- [ ] Test count: previous ai-service Vitest suite + at least 4 new assertions (no silent deletions)

**Verify**:
```bash
cd ai-service && npm test -- src/services/TrainingJobRegistry.test.ts
```
Expected: the new `waitFor(...)` cases pass and existing registry behavior stays green.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai-service): add TrainingJobRegistry.waitFor for startup recovery`

---

### T2: Create `StartupRecoveryService` with explicit blocked states

**What**: Implement the background self-healing orchestrator that decides whether recovery is needed, generates embeddings only when missing, probes whether trainable data exists, reuses or enqueues the training job, and exposes readiness-blocking state.
**Where**:
- `ai-service/src/services/StartupRecoveryService.ts` (new)
- `ai-service/src/services/StartupRecoveryService.test.ts` (new)
- `ai-service/src/services/ModelTrainer.ts` (shared training-data probe extraction only if needed to avoid duplicating API pagination logic)
**Depends on**: T1
**Reuses**: `VersionedModelStore.loadCurrent()` / `getModel()`, `EmbeddingService.generateEmbeddings()`, `Neo4jRepository.getProductsWithoutEmbedding()`, `TrainingJobRegistry.enqueue()`, `TrainingJobRegistry.getActiveJobId()`, `TrainingJobRegistry.waitFor()`, and the existing training-data fetch path in `ModelTrainer.ts`
**Requirement**: M12-01, M12-02, M12-03, M12-04, M12-08
**Status**: ✅ Complete

**Tools**:
- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:
- [ ] `StartupRecoveryState` is exported with explicit phases for `idle`, `scheduled`, `embedding`, `training`, `blocked`, and `completed`
- [ ] The service returns quickly to its caller and performs the recovery path asynchronously instead of blocking startup
- [ ] When a model is already present, the service records a non-blocking skip reason (`model-present`) and does not enqueue recovery
- [ ] When embeddings are missing, the service calls `embeddingService.generateEmbeddings()`; when Neo4j already has embeddings, that step is skipped
- [ ] The service probes training-data availability without duplicating the API pagination logic already owned by `ModelTrainer.ts`
- [ ] When there is no training data, the service logs a warning, moves to `blocked/no-training-data`, and keeps the process alive
- [ ] When another training job is already active, the service reuses `getActiveJobId()` + `waitFor(jobId)` instead of enqueueing a duplicate job
- [ ] When the training job ends in failure or the model is still absent, the service records a blocked reason (`training-failed`, `api-unavailable`, or `neo4j-unavailable`) and does not retry in a loop
- [ ] `isBlockingReadiness()` and a read-only state accessor are exposed for `/ready`
- [ ] Unit tests cover: model-present skip, missing-embeddings path, embeddings-already-present path, no-training-data blocked state, active-job reuse, and training-failed blocked state
- [ ] Gate check passes: `npm test`
- [ ] Test count: previous ai-service Vitest suite + at least 6 new assertions (no silent deletions)

**Verify**:
```bash
cd ai-service && npm test -- src/services/StartupRecoveryService.test.ts
```
Expected: the recovery state machine transitions correctly for success, skip, and blocked paths.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai-service): add StartupRecoveryService for self-healing model startup`

---

### T3: Add `AUTO_HEAL_MODEL` env parsing and documentation [P]

**What**: Add the opt-out env flag for tests, defaulting to enabled, and document it in `.env.example` as the official way to keep startup deterministic in unit and E2E runs.
**Where**:
- `ai-service/src/config/env.ts`
- `.env.example`
**Depends on**: None
**Reuses**: Existing env parsing/warning pattern in `env.ts` and the current comment style in `.env.example`
**Requirement**: M12-10, M12-11
**Status**: ✅ Complete

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `ENV.AUTO_HEAL_MODEL` is exported as a boolean with default `true`
- [ ] `AUTO_HEAL_MODEL=false` is the only value that disables recovery; any other missing/invalid value keeps recovery enabled with a clear warning if needed
- [ ] `.env.example` documents `AUTO_HEAL_MODEL=true` and explains that `false` is intended for unit and E2E tests
- [ ] Existing env warnings for unrelated variables are not regressed
- [ ] Gate check passes: `npm test`

**Verify**:
```bash
cd ai-service && npm test
```
Expected: the existing suite remains green after the env/config change, and `.env.example` clearly documents the new flag.

**Tests**: none
**Gate**: quick

**Commit**: `feat(ai-service): add AUTO_HEAL_MODEL env flag and documentation`

---

### T4: Wire startup recovery into bootstrap and add startup integration tests

**What**: Refactor startup into a testable bootstrap seam, trigger background recovery only after the server is accepting traffic, compose `/ready` from embedding readiness + model presence + recovery state, and prove the behavior with startup-level Fastify integration tests.
**Where**:
- `ai-service/src/index.ts`
- `ai-service/src/tests/startup.test.ts` (new)
- `ai-service/src/tests/helpers/buildStartupApp.ts` or equivalent extracted bootstrap helper (new)
**Depends on**: T2, T3
**Reuses**: Current service instantiation order in `index.ts`, `VersionedModelStore.loadCurrent()`, `EmbeddingService.init()`, Fastify `inject()` testing pattern, and the route/plugin registration already used by `buildApp`
**Requirement**: M12-01, M12-04, M12-05, M12-06, M12-07, M12-08, M12-09, M12-10
**Status**: ✅ Complete

**Tools**:
- MCP: `user-context7` (only if Fastify bootstrap semantics need confirmation)
- Skill: `coding-guidelines`

**Done when**:
- [ ] Startup logic is available through a testable bootstrap helper instead of only a top-level side effect
- [ ] `VersionedModelStore.loadCurrent()` and `EmbeddingService.init()` still happen before traffic, but auto-healing is scheduled only after the server starts accepting traffic
- [ ] `/health` remains pure liveness and returns `200` even while recovery is running or blocked
- [ ] `/ready` returns `200` only when `embeddingService.isReady && versionedModelStore.getModel() !== null && !startupRecoveryService.isBlockingReadiness()`
- [ ] A warm boot with an already loaded model does not call startup recovery or enqueue a training job
- [ ] `AUTO_HEAL_MODEL=false` keeps a no-model boot alive but unready, without launching background recovery
- [ ] Startup integration tests cover: cold boot scheduling, `/health=200` and `/ready=503` during recovery, `/ready=200` after successful recovery, blocked no-training-data path, disabled opt-out path, and warm-boot skip path
- [ ] Gate check passes: `npm test`
- [ ] Test count: previous ai-service Vitest suite + at least 5 new startup-level assertions (no silent deletions)

**Verify**:
```bash
cd ai-service && npm test -- src/tests/startup.test.ts
```
Expected: mocked cold-boot, blocked, disabled, and warm-boot startup scenarios all pass through the new bootstrap seam.

**Tests**: integration
**Gate**: quick

**Commit**: `feat(ai-service): wire startup recovery into bootstrap and readiness`

---

### T5: Update `docker-compose.yml` to use the M12 startup contract

**What**: Align Docker Compose with the new readiness semantics by switching the ai-service healthcheck to `/ready`, increasing its grace period to `180s`, and breaking the `api-service <-> ai-service` startup cycle.
**Where**: `docker-compose.yml`
**Depends on**: T4
**Reuses**: Existing service names, current healthcheck structure, and ADR-034's `service_started` dependency rule for `api-service`
**Requirement**: M12-06, M12-07, M12-12
**Status**: ✅ Complete

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] The `ai-service` healthcheck probes `/ready` instead of `/health`
- [ ] `start_period` for `ai-service` is `180s`
- [ ] `interval`, `timeout`, and `retries` for the `ai-service` healthcheck remain unchanged
- [ ] `api-service` depends on `ai-service` with `condition: service_started`, while `postgres` stays `service_healthy`
- [ ] No unrelated service definitions are changed
- [ ] `docker compose config` succeeds after the edit

**Verify**:
```bash
docker compose config > /dev/null
```
Expected: compose renders successfully and the `ai-service` healthcheck now targets `/ready`.

**Tests**: none
**Gate**: none

**Commit**: `chore(infra): align compose healthchecks with ai-service readiness`

---

### T6: Final build gate + cold/warm boot validation

**What**: Run the authoritative ai-service build gate and the end-to-end M12 acceptance scenarios so the feature is proven on clean startup, warm restart, and the test opt-out path.
**Where**:
- `ai-service/`
- repo root (`docker-compose.yml`)
**Depends on**: T4, T5
**Reuses**: The ai-service build gate from `.specs/codebase/ai-service/TESTING.md`, the M12 acceptance criteria in `spec.md`, and the compose startup contract from ADR-034
**Requirement**: M12-01, M12-02, M12-03, M12-04, M12-05, M12-06, M12-07, M12-08, M12-09, M12-10, M12-11, M12-12
**Status**: ✅ Complete

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Build gate passes: `cd ai-service && npm run lint && npm run build && npm test`
- [ ] `docker compose config` exits `0`
- [ ] Clean-volume validation proves `/health` stays `200` while `/ready` stays `503` until the model is recovered
- [ ] After `/ready` becomes `200`, recommendations work without manual `POST /api/v1/embeddings/generate` or `POST /api/v1/model/train`
- [ ] Warm restart validation shows that startup does not enqueue duplicate recovery/training when a model already exists
- [ ] `AUTO_HEAL_MODEL=false` validation shows that no background recovery starts and the no-model boot remains intentionally unready
- [ ] No ai-service tests, lint checks, or build artifacts are silently skipped

**Verify**:
```bash
cd ai-service && npm run lint && npm run build && npm test
docker compose config > /dev/null
docker compose down -v && docker compose up --build
```
Expected: the ai-service build gate passes, compose stays valid, cold boot self-heals to readiness without manual intervention, and warm/disabled paths behave as specified.

**Tests**: build
**Gate**: build

**Commit**: `feat(m12): validate self-healing model startup end to end`

---

## Parallel Execution Map

```
Phase 1 (Partial Parallel):
  T1 ──→ T2
  T3 [P]

Phase 2 (Sequential):
  T2, T3 ──→ T4

Phase 3 (Sequential):
  T4 ──→ T5

Phase 4 (Sequential):
  T4, T5 ──→ T6
```

**Parallelism constraint:** Only T3 is marked `[P]` because it has no unfinished dependencies, no shared mutable state with T1/T2, and no required test layer beyond the existing quick gate.

---

## Task Granularity Check

| Task | Scope | Status |
|------|-------|--------|
| T1: `TrainingJobRegistry.waitFor()` | 1 service file + 1 unit test file | ✅ Granular |
| T2: `StartupRecoveryService` | 1 new service + 1 unit test file (+ optional shared helper extraction) | ✅ OK (single recovery concern) |
| T3: `AUTO_HEAL_MODEL` env + docs | 2 files, 1 operational concern | ✅ OK (cohesive) |
| T4: Bootstrap wiring + startup integration tests | 1 startup file + 1 helper + 1 test file | ✅ OK (cannot separate wiring from its startup proof) |
| T5: Compose health contract | 1 infra file | ✅ Granular |
| T6: Final verification | Verification only | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | None | Start of Phase 1 (`[P]`) | ✅ Match |
| T4 | T2, T3 | T2, T3 -> T4 | ✅ Match |
| T5 | T4 | T4 -> T5 | ✅ Match |
| T6 | T4, T5 | T4, T5 -> T6 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|------|-----------------------------|-----------------|-----------|--------|
| T1: `TrainingJobRegistry.waitFor()` | Service layer (`TrainingJobRegistry`) | unit | unit | ✅ OK |
| T2: `StartupRecoveryService` | New service layer | unit | unit | ✅ OK |
| T3: `env.ts` + `.env.example` | Config + docs | none | none | ✅ OK |
| T4: Startup bootstrap + `/ready` contract | Startup/HTTP integration seam | integration | integration | ✅ OK |
| T5: `docker-compose.yml` | Infra config | none | none | ✅ OK |
| T6: Final verification | Full feature acceptance | build | build | ✅ OK |

---

## Requirement Traceability

| Requirement | Covered by |
|-------------|------------|
| M12-01 | T2, T4, T6 |
| M12-02 | T2, T6 |
| M12-03 | T1, T2, T6 |
| M12-04 | T2, T4, T6 |
| M12-05 | T4, T6 |
| M12-06 | T4, T5, T6 |
| M12-07 | T4, T5, T6 |
| M12-08 | T2, T4, T6 |
| M12-09 | T4, T6 |
| M12-10 | T3, T4, T6 |
| M12-11 | T3 |
| M12-12 | T5, T6 |

**Coverage:** 12/12 requirements mapped ✅

---

## Pre-Execution: MCPs e Skills

Antes de executar, confirmar se quer manter estes defaults por task:

**MCPs disponiveis**: `user-context7`, `user-filesystem`, `user-github`
**Skills disponiveis**: `coding-guidelines`

| Task | MCP sugerido | Skill sugerida |
|------|-------------|----------------|
| T1 | NONE | `coding-guidelines` |
| T2 | NONE | `coding-guidelines` |
| T3 | NONE | NONE |
| T4 | `user-context7` (apenas se houver duvida sobre bootstrap/lifecycle do Fastify) | `coding-guidelines` |
| T5 | NONE | NONE |
| T6 | NONE | NONE |
