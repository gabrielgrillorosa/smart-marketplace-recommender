# M6 — Quality & Publication: Tasks

**Design**: `.specs/features/m6-quality-publication/design.md`
**Status**: Draft

> **Note:** No `TESTING.md` exists yet. Test types and gate commands below are derived from the spec and design:
> - **Java quick gate**: `./mvnw test -pl api-service`
> - **Java build gate**: `./mvnw verify -pl api-service` (includes JaCoCo coverage enforcement)
> - **TS quick gate**: `npm test --prefix ai-service`
> - **Lint gate**: `./mvnw checkstyle:check -pl api-service && npm run lint --prefix ai-service && npm run lint --prefix frontend`
> - **Build gate (full)**: `./mvnw verify -pl api-service && npm test --prefix ai-service`

---

## Execution Plan

### Phase 1: Foundation — Types & Interfaces (Sequential)

Shared types and the `buildApp` factory must exist before any test or service code can reference them.

```
T1 → T2 → T3
```

### Phase 2: AI Service — Core Logic Extensions (Parallel OK)

With types and factory in place, service extensions and the `Neo4jRepository` method can be implemented in parallel.

```
T3 complete, then:
    ├── T4 [P]
    ├── T5 [P]
    └── T6 [P]
```

### Phase 3: AI Service — Test Suite (Parallel OK after T4–T6)

All test files can be written in parallel once the services they test exist.

```
T4, T5, T6 complete, then:
    ├── T7 [P]
    ├── T8 [P]
    ├── T9 [P]
    └── T10 [P]
```

### Phase 4: API Service — Test Suite (Parallel OK)

Java unit tests and integration tests are independent of each other and of Phase 3.

```
T3 complete (types locked), T1 complete (Dockerfiles don't affect Java tests):
    ├── T11 [P]
    └── T12 [P]
```

### Phase 5: Docker, Compose & Infrastructure (Sequential)

Dockerfiles depend on knowing the final production build commands; safe to start after Phase 1.

```
T13 → T14 → T15
```

### Phase 6: Documentation (Parallel OK after Phase 5)

README, CONTRIBUTING, and .env.example are independent of each other.

```
T15 complete (quickstart commands verified), then:
    ├── T16 [P]
    └── T17 [P]
```

### Phase 7: Linting & Final Gate (Sequential)

```
T16, T17 complete, then:
    T18 → T19
```

---

## Task Breakdown

---

### T1: Extend TypeScript types in `src/types/index.ts`

**What**: Add `staleDays`, `staleWarning`, `syncedAt`, `precisionAt5` to `TrainingStatus` and `TrainingMetadata`; add `syncedAt` and `precisionAt5` to `TrainingResult`.
**Where**: `ai-service/src/types/index.ts`
**Depends on**: None
**Reuses**: Existing `TrainingStatus`, `TrainingMetadata`, `TrainingResult` interfaces
**Requirement**: M6-41, M6-42, M6-49, M6-53, M6-54

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `TrainingStatus` has optional `staleDays?: number | null`, `staleWarning?: string`, `syncedAt?: string`, `precisionAt5?: number`
- [ ] `TrainingMetadata` has optional `syncedAt?: string`, `precisionAt5?: number`
- [ ] `TrainingResult` has required `syncedAt: string`, `precisionAt5: number`
- [ ] `tsc --noEmit` on ai-service exits 0 (no TypeScript errors)
- [ ] Gate check passes: `tsc --noEmit` in `ai-service/`

**Tests**: none
**Gate**: quick

---

### T2: Create `buildApp` factory and `AppDeps` interface

**What**: Create `ai-service/src/tests/helpers/buildApp.ts` with `AppDeps` interface and factory function that wires injected deps into a Fastify instance using the same route registrations as `src/index.ts`.
**Where**: `ai-service/src/tests/helpers/buildApp.ts` (new file)
**Depends on**: T1
**Reuses**: `src/index.ts` route registration patterns
**Requirement**: M6-07 (foundational for all TS tests)

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `AppDeps` interface defined with all 7 partial deps: `neo4jRepo`, `embeddingService`, `modelStore`, `modelTrainer`, `recommendationService`, `ragService`, `searchService`
- [ ] `buildApp(deps: AppDeps): Promise<FastifyInstance>` exported from the file
- [ ] Factory registers the same routes as `src/index.ts`
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Gate check passes: `tsc --noEmit` in `ai-service/`

**Tests**: none
**Gate**: quick

---

### T3: Create test fixtures file

**What**: Create `ai-service/src/tests/helpers/fixtures.ts` with typed mock responses matching `src/types/index.ts` shapes — covering recommendations, RAG answers, search results, and model status.
**Where**: `ai-service/src/tests/helpers/fixtures.ts` (new file)
**Depends on**: T1, T2
**Reuses**: Types from `src/types/index.ts`
**Requirement**: M6-07 (foundational for all TS tests)

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Fixture for `/recommend` response: `{ clientId, recommendations: [{ id, name, score, matchReason }] }`
- [ ] Fixture for `/rag/query` response: `{ answer: string, sources: [...] }`
- [ ] Fixture for `/search/semantic` response: `{ products: [{ ...product, score: number }] }`
- [ ] Fixture for `GET /model/status` — trained state: `{ status: 'trained', staleDays: 2, precisionAt5: 0.6, ... }`
- [ ] Fixture for `GET /model/status` — untrained state: `{ status: 'untrained', staleDays: null }`
- [ ] All fixture types match `src/types/index.ts` (TypeScript compilation clean)
- [ ] Gate check passes: `tsc --noEmit` in `ai-service/`

**Tests**: none
**Gate**: quick

---

### T4: Implement `ModelStore.getEnrichedStatus()` [P]

**What**: Add `getEnrichedStatus(nowFn?: () => Date): EnrichedTrainingStatus` method to `ModelStore`; computes `staleDays` and `staleWarning` at read time using injected clock.
**Where**: `ai-service/src/services/ModelStore.ts`
**Depends on**: T1
**Reuses**: Existing `ModelStore` state fields
**Requirement**: M6-41, M6-42

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `getEnrichedStatus(nowFn?: () => Date)` implemented as described in design.md §1
- [ ] When `status === 'trained'` and `trainedAt` is set: `staleDays` is computed as `Math.floor((now - trainedAt) / ms_per_day)`
- [ ] `staleWarning` is set when `staleDays >= 7`
- [ ] When status is not `'trained'`: `staleDays` is `null` and `staleWarning` is `undefined`
- [ ] `nowFn` defaults to `() => new Date()`
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Gate check passes: `npm test --prefix ai-service` (existing tests still pass)

**Tests**: unit (via T7)
**Gate**: quick

---

### T5: Implement `Neo4jRepository.syncBoughtRelationships()` [P]

**What**: Add `syncBoughtRelationships(edges: Array<{clientId: string; productId: string}>): Promise<{created: number; existed: number; skipped: number}>` to `Neo4jRepository`.
**Where**: `ai-service/src/repositories/Neo4jRepository.ts`
**Depends on**: T1
**Reuses**: Existing Neo4j session/driver patterns in the repository
**Requirement**: M6-45, M6-46

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Method uses `UNWIND $edges AS edge MATCH...MERGE (c)-[r:BOUGHT]->(p) ON CREATE SET r.synced = true` Cypher as in design.md §3
- [ ] Returns `{ created, existed, skipped }` (skipped = input length minus total)
- [ ] Method is idempotent — running twice with same input produces same graph state
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Gate check passes: `npm test --prefix ai-service` (existing tests still pass)

**Tests**: unit (via T7)
**Gate**: quick

---

### T6: Implement `ModelTrainer` extensions + `RecommendationService` structured log [P]

**What**: (a) Extract `syncNeo4j(orders, products)` (private) and `computePrecisionAtK(...)` (private) from `ModelTrainer.train()`; update `train()` to call both and include `syncedAt`/`precisionAt5` in `TrainingResult`. (b) Add structured `fastify.log.info()` to `RecommendationService.recommend()` with `clientId`, `country`, `resultsCount`, `avgFinalScore`, `matchReasonDistribution`.
**Where**: `ai-service/src/services/ModelTrainer.ts`, `ai-service/src/services/RecommendationService.ts`
**Depends on**: T1, T5
**Reuses**: `Neo4jRepository.syncBoughtRelationships()` from T5; existing `train()` loop; existing `recommend()` scoring pipeline
**Requirement**: M6-45, M6-47, M6-48, M6-49, M6-50, M6-51, M6-52, M6-53

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `syncNeo4j()` calls `neo4jRepo.syncBoughtRelationships()`, logs warning per skipped product, logs `[Sync] N created, M existed, K skipped` after loop; returns `{ syncedAt: string }`
- [ ] `computePrecisionAtK()` implements mean-pooling client profile, top-K prediction, held-out 20% validation; disposes tensors via `tf.tidy()`; returns `precisionAt5: number`
- [ ] `train()` calls `syncNeo4j()` before the training loop, calls `computePrecisionAtK()` after `model.fit()`, before `model.save()`; errors in either are caught and logged as non-fatal
- [ ] `TrainingResult` from `train()` includes `syncedAt` and `precisionAt5`
- [ ] `RecommendationService` constructor accepts `logger: FastifyBaseLogger`; `index.ts` passes `fastify.log`
- [ ] `recommend()` emits one `logger.info()` after scoring with the fields from design.md §4
- [ ] Empty recommendation path logs `{ clientId, reason: "no_candidates" }`
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Gate check passes: `npm test --prefix ai-service` (existing tests still pass)

**Tests**: unit (via T7, T10)
**Gate**: quick

---

### T7: Write `model.test.ts` for ModelStore and ModelTrainer [P]

**What**: Create `ai-service/src/tests/model.test.ts` covering M6-07, M6-13, `getEnrichedStatus()` staleDays/staleWarning, and Neo4j sync idempotency.
**Where**: `ai-service/src/tests/model.test.ts` (new file)
**Depends on**: T2, T3, T4, T6
**Reuses**: `buildApp` factory from T2; fixtures from T3
**Requirement**: M6-07, M6-13, M6-41, M6-42, M6-49, M6-53, M6-54

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `GET /api/v1/model/status` test: asserts status 200, presence of `status`, `staleDays`, `staleWarning` (when applicable), `syncedAt`, `precisionAt5` in metrics
- [ ] `staleDays` is `null` when model is untrained
- [ ] `staleDays >= 7` test: injects fixed clock returning `trainedAt + 8 days`; asserts `staleWarning` is present
- [ ] `staleDays < 7` test: injects fixed clock returning `trainedAt + 3 days`; asserts no `staleWarning`
- [ ] Neo4j sync idempotency test: calling `syncBoughtRelationships` twice with same edges asserts edge count is unchanged on second call
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: at least 5 tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

---

### T8: Write `recommend.test.ts` [P]

**What**: Create `ai-service/src/tests/recommend.test.ts` covering M6-08, M6-11, and M6-12 (score combination unit test).
**Where**: `ai-service/src/tests/recommend.test.ts` (new file)
**Depends on**: T2, T3, T6
**Reuses**: `buildApp` factory from T2; fixtures from T3
**Requirement**: M6-08, M6-11, M6-12

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `POST /api/v1/recommend` happy path: status 200, response has `clientId`, `recommendations` array, each item has `score` and `matchReason`
- [ ] `POST /api/v1/recommend` Neo4j unavailable: mock `neo4jRepo` throws `Neo4jUnavailableError`; asserts status 503 with structured error body
- [ ] Score combination unit test: `computeFinalScore(1.0, 0.5, 0.6, 0.4)` is `toBeCloseTo(0.8, 5)` (pure function extracted from `RecommendationService`)
- [ ] Untrained model test: mock `modelStore` returns `status: 'untrained'`; `neuralScore` fallback to 0; response still returns semantic-only results (or 503 `ModelNotTrainedError`)
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: at least 4 tests pass

**Tests**: unit
**Gate**: quick

---

### T9: Write `rag.test.ts` and `search.test.ts` [P]

**What**: Create `ai-service/src/tests/rag.test.ts` (M6-09) and `ai-service/src/tests/search.test.ts` (M6-10).
**Where**: `ai-service/src/tests/rag.test.ts` (new), `ai-service/src/tests/search.test.ts` (new)
**Depends on**: T2, T3
**Reuses**: `buildApp` factory from T2; fixtures from T3
**Requirement**: M6-09, M6-10

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `POST /api/v1/rag/query` test: status 200, `answer` is a non-empty string, `sources` is a non-empty array
- [ ] `POST /api/v1/search/semantic` test: status 200, `products` array with numeric `score` per item
- [ ] Both test files have at least 2 tests each
- [ ] Gate check passes: `npm test --prefix ai-service`
- [ ] Test count: at least 4 tests pass across both files

**Tests**: unit
**Gate**: quick

---

### T10: Verify full AI Service test suite gate [P]

**What**: Run the complete AI service test suite after all test files are written (T7–T9). This is the AI-service phase-end build gate.
**Where**: `ai-service/` (no new files; gate verification task)
**Depends on**: T7, T8, T9
**Reuses**: N/A
**Requirement**: M6-07

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `npm test --prefix ai-service` exits 0
- [ ] All test files (model, recommend, rag, search) execute
- [ ] Total test count: at least 15 tests pass (no silent deletions)
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Gate check passes: `npm test --prefix ai-service`

**Tests**: unit
**Gate**: build

**Commit**: `test(ai-service): add vitest test suite with buildApp factory and DI mocks`

---

### T11: Write Java unit tests for service layer [P]

**What**: Create unit tests for `ProductApplicationService`, `ClientApplicationService`, `OrderApplicationService`, and `RecommendationService` using JUnit 5 + Mockito. Each class gets at least 3 tests: happy path, not-found (404), and input validation.
**Where**: `api-service/src/test/java/com/smartmarketplace/service/` (new files per design.md §6)
**Depends on**: None (Java layer is independent of T1–T10)
**Reuses**: Existing service classes in `api-service/src/main/`
**Requirement**: M6-01, M6-03

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `ProductApplicationServiceTest.java`: happy path, not-found, validation (≥3 tests)
- [ ] `ClientApplicationServiceTest.java`: happy path, not-found, validation (≥3 tests)
- [ ] `OrderApplicationServiceTest.java`: happy path, not-found, validation (≥3 tests)
- [ ] `RecommendationServiceTest.java`: happy path, AI service unavailable, validation (≥3 tests)
- [ ] All tests use `@ExtendWith(MockitoExtension.class)` and `@Mock`/`@InjectMocks`
- [ ] Gate check passes: `./mvnw test -pl api-service`
- [ ] Test count: at least 12 unit tests pass

**Tests**: unit
**Gate**: quick

---

### T12: Write Java integration tests with Testcontainers + MockMvc [P]

**What**: Create integration tests for `ProductController`, `ClientController`, and `OrderController` using MockMvc + Testcontainers PostgreSQL (`@SpringBootTest`). Each controller gets at least one test per endpoint verifying HTTP status and response structure; 404 tests verify error body format.
**Where**: `api-service/src/test/java/com/smartmarketplace/controller/` (new files per design.md §6)
**Depends on**: T11 (Testcontainers `@Container` setup can be shared via base class after T11 establishes the test classpath)
**Reuses**: `test-data.sql` baseline seed (new file); existing controller classes
**Requirement**: M6-01, M6-02, M6-04, M6-05, M6-06

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `test-data.sql` created at `api-service/src/test/resources/test-data.sql` with minimal baseline product/client/order rows
- [ ] `ProductControllerIT.java`: all endpoints tested with MockMvc; 404 test asserts status code + error body
- [ ] `ClientControllerIT.java`: GET list and GET by id; 404 test asserts error body
- [ ] `OrderControllerIT.java`: GET orders for client; 404 test asserts error body
- [ ] `@DynamicPropertySource` overrides `spring.datasource.*` from Testcontainers PostgreSQL container
- [ ] `@Transactional` on each test method for rollback isolation
- [ ] `pom.xml` has JaCoCo plugin with `<minimum>0.70</minimum>` for `*Service` classes
- [ ] Gate check passes: `./mvnw verify -pl api-service`
- [ ] JaCoCo: `*Service` class line coverage ≥70%

**Tests**: integration
**Gate**: build

**Commit**: `test(api-service): add JUnit 5 unit tests + Testcontainers integration tests with JaCoCo`

---

### T13: Replace `api-service` Dockerfile with multi-stage build

**What**: Rewrite `api-service/Dockerfile` as a two-stage (`builder`/`runtime`) image per design.md §7.
**Where**: `api-service/Dockerfile`
**Depends on**: None
**Reuses**: Dockerfile pattern from design.md §7
**Requirement**: M6-25

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Stage `builder`: `eclipse-temurin:21-jdk`, copies `mvnw`, `pom.xml`, `.mvn/`, runs `dependency:go-offline`, then copies `src/`, runs `mvnw package -DskipTests`
- [ ] Stage `runtime`: `eclipse-temurin:21-jre`, copies only `*.jar` from builder, `ENTRYPOINT ["java", "-jar", "app.jar"]`
- [ ] `docker build -t api-service api-service/` completes successfully
- [ ] Final image contains only the JAR (no Maven wrapper, no source)
- [ ] Gate check passes: `docker build -t api-service api-service/`

**Tests**: none
**Gate**: quick

---

### T14: Replace `ai-service` Dockerfile with multi-stage build + model prebake

**What**: Rewrite `ai-service/Dockerfile` as a two-stage build per design.md §7 + ADR-010. Builder stage runs `scripts/prebake-model.js` to warm the `@xenova` model cache. Runtime stage uses `npm ci --omit=dev` and copies model cache.
**Where**: `ai-service/Dockerfile`, `ai-service/scripts/prebake-model.js` (new)
**Depends on**: T13
**Reuses**: ADR-010 design; existing `ai-service/` npm structure
**Requirement**: M6-26

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `prebake-model.js` script exists; triggers `@xenova/transformers` model download into `node_modules/.cache`
- [ ] Dockerfile stage `builder`: `node:20-alpine`, `npm ci`, copies all, runs prebake script, then `npm run build`
- [ ] Dockerfile stage `runtime`: `node:20-alpine`, `npm ci --omit=dev`, copies `node_modules/.cache` from builder, copies `dist/`, `CMD ["node", "dist/index.js"]`
- [ ] `docker build -t ai-service ai-service/` completes (may take time due to model download)
- [ ] Final image does NOT contain `@types/*`, `ts-node`, `vitest` (dev-only packages)
- [ ] Gate check passes: `docker build -t ai-service ai-service/`

**Tests**: none
**Gate**: quick

---

### T15: Replace `frontend` Dockerfile + add `ai-model-data` volume to `docker-compose.yml`

**What**: (a) Rewrite `frontend/Dockerfile` as two-stage Next.js standalone build per design.md §7 + ADR-011. (b) Add `ai-model-data` named volume to `docker-compose.yml` mounted at `/tmp/model` in `ai-service`.
**Where**: `frontend/Dockerfile`, `docker-compose.yml`
**Depends on**: T14
**Reuses**: ADR-011 design; existing docker-compose.yml
**Requirement**: M6-27, M6-36, M6-37, M6-38, M6-39, M6-40

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `frontend/Dockerfile`: `builder` stage runs `next build` (requires `output: 'standalone'` in `next.config.js`); `runtime` stage copies `.next/standalone`, `.next/static`, `public/` + sets `ENV HOSTNAME=0.0.0.0`, `CMD ["node", "server.js"]`
- [ ] `next.config.js` has `output: 'standalone'` (add if missing)
- [ ] `docker-compose.yml`: `volumes:` block has `ai-model-data:`; `ai-service` service has `volumes: - ai-model-data:/tmp/model`
- [ ] `docker compose build` completes for all services
- [ ] `docker compose up -d` starts all services with volume mounted
- [ ] After `POST /model/train`, `docker compose restart ai-service`, `GET /model/status` returns `trained`
- [ ] Gate check passes: `docker compose build && docker compose up -d`

**Tests**: none
**Gate**: build

**Commit**: `build: replace all Dockerfiles with multi-stage builds + add ai-model-data volume`

---

### T16: Write README bilíngue completo [P]

**What**: Create `README.md` at the repository root with all sections from design.md §9 and spec M6-14..M6-21, M6-30..M6-35, M6-43, M6-55. Bilingual (pt-BR primary + English sections). Includes real captured RAG output samples.
**Where**: `README.md` (root of monorepo)
**Depends on**: T15 (quickstart commands verified against working Dockerfiles)
**Reuses**: Architecture diagrams from design.md; ADR rationale; existing API documentation
**Requirement**: M6-14, M6-15, M6-16, M6-17, M6-18, M6-19, M6-20, M6-21, M6-30, M6-31, M6-32, M6-33, M6-34, M6-35, M6-43, M6-55

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] Section 1: title + badge + one-liner (pt-BR + en)
- [ ] Section 2: Mermaid architecture diagram showing all 5 services, 3 main data flows (hybrid recommendation, semantic search, RAG query)
- [ ] Section 3: quickstart — exactly 5 commands: `git clone` → `cp .env.example .env` → `docker compose up` → open browser → system running
- [ ] Section 4: tech decisions — TypeScript AI service rationale, Java/Spring Boot rationale, Neo4j rationale
- [ ] Section 5: API reference — curl examples for `/recommend`, `/rag/query`, `/search/semantic`; link to `http://localhost:8080/swagger-ui.html`
- [ ] Section 6: ≥2 RAG queries in pt-BR + ≥1 in English with real captured output (including `sources`)
- [ ] Section 7: `staleDays` observability — how and when to call `POST /model/train`; what `staleDays` and `staleWarning` mean; why Precision@K > accuracy for imbalanced datasets
- [ ] Section 8: English version of all sections (bilingual headings in single file)
- [ ] `.env.example`: each variable has an explanatory comment; note about manual retraining
- [ ] Gate check: manual read-through confirms all required sections present

**Tests**: none
**Gate**: quick

---

### T17: Write `CONTRIBUTING.md` and verify `.gitignore` [P]

**What**: Create `CONTRIBUTING.md` describing monorepo structure, per-service dev setup, test commands, and Conventional Commits convention. Verify/update `.gitignore` to cover all required patterns.
**Where**: `CONTRIBUTING.md` (root), `.gitignore` (root)
**Depends on**: T15
**Reuses**: Existing project structure knowledge
**Requirement**: M6-28, M6-29

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `CONTRIBUTING.md` has: monorepo structure overview, how to run each service individually for development, test commands (`./mvnw test`, `npm test`), Conventional Commits convention
- [ ] `.gitignore` covers: `node_modules/`, `.next/`, `target/`, `*.class`, `.env` (excluding `.env.example`), `tmp/`, `.idea/`, `.vscode/` (with exception for shareable `settings.json`)
- [ ] No sensitive files are tracked by git (`git status` shows clean expected state)
- [ ] Gate check passes: manual review of both files

**Tests**: none
**Gate**: quick

**Commit**: `docs: add bilingual README, CONTRIBUTING.md, and .env.example`

---

### T18: Fix all linting violations (Checkstyle + ESLint)

**What**: Run Checkstyle on api-service and ESLint on ai-service and frontend; fix all violations to achieve zero warnings and zero errors.
**Where**: `api-service/` (Java), `ai-service/` (TypeScript), `frontend/` (TypeScript/React)
**Depends on**: T16, T17 (all code files finalized)
**Reuses**: Existing Checkstyle config in `pom.xml`; existing ESLint configs in `ai-service/` and `frontend/`
**Requirement**: M6-22, M6-23, M6-24

**Tools**:
- MCP: `filesystem`
- Skill: NONE

**Done when**:
- [ ] `./mvnw checkstyle:check -pl api-service` exits 0 with zero violations
- [ ] `npm run lint --prefix ai-service` exits 0 with zero warnings and zero errors
- [ ] `npm run lint --prefix frontend` exits 0 with zero warnings and zero errors
- [ ] Gate check passes: `./mvnw checkstyle:check -pl api-service && npm run lint --prefix ai-service && npm run lint --prefix frontend`

**Tests**: none
**Gate**: quick

---

### T19: Final build gate — full verification across all services

**What**: Run the complete verification suite across all services as the definitive project-done gate.
**Where**: Repository root (no new files)
**Depends on**: T10, T12, T18
**Reuses**: N/A
**Requirement**: M6-01, M6-02, M6-07, M6-22, M6-23, M6-24

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] Build gate passes: `./mvnw verify -pl api-service` exits 0
- [ ] Surefire: all `*Test` classes pass (≥12 unit tests)
- [ ] Failsafe: all `*IT` classes pass (integration tests with Testcontainers)
- [ ] JaCoCo: `*Service` classes line coverage ≥70% (report at `api-service/target/site/jacoco/`)
- [ ] AI service gate passes: `npm test --prefix ai-service` exits 0 (≥15 tests)
- [ ] `tsc --noEmit` in `ai-service/` exits 0
- [ ] Checkstyle: `./mvnw checkstyle:check -pl api-service` exits 0
- [ ] ESLint ai-service: `npm run lint --prefix ai-service` exits 0
- [ ] ESLint frontend: `npm run lint --prefix frontend` exits 0
- [ ] `docker compose build` exits 0 (all three multi-stage Dockerfiles)
- [ ] Gate check passes: `./mvnw verify -pl api-service && npm test --prefix ai-service && npm run lint --prefix ai-service && npm run lint --prefix frontend`

**Tests**: build
**Gate**: build

**Commit**: `chore(m6): quality & publication — tests, dockerfiles, docs, linting complete`

---

## Parallel Execution Map

```
Phase 1 (Sequential — types & factory):
  T1 → T2 → T3

Phase 2 (Parallel — AI service logic):
  T3 complete, then:
    ├── T4 [P]   getEnrichedStatus()
    ├── T5 [P]   syncBoughtRelationships()
    └── T6 [P]   ModelTrainer + RecommendationService log

Phase 3 (Parallel — AI service tests):
  T4, T5, T6 complete, then:
    ├── T7 [P]   model.test.ts
    ├── T8 [P]   recommend.test.ts
    ├── T9 [P]   rag.test.ts + search.test.ts
    └── T10      (after T7, T8, T9) full AI gate

Phase 4 (Parallel — Java tests, independent of Phase 2-3):
  can start after T3 (types locked — but Java layer is independent):
    ├── T11 [P]  Java unit tests
    └── T12      (after T11) Java integration tests + JaCoCo gate

Phase 5 (Sequential — Docker):
  T13 → T14 → T15

Phase 6 (Parallel — docs):
  T15 complete, then:
    ├── T16 [P]  README
    └── T17 [P]  CONTRIBUTING + .gitignore

Phase 7 (Sequential — lint + final):
  T16, T17 complete:
    T18 → T19 (final build gate)
```

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|------|------------------------|---------------|--------|
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | T1 → T2 | ✅ Match |
| T3 | T1, T2 | T2 → T3 | ✅ Match |
| T4 | T1 | T3 → T4 [P] | ✅ Match |
| T5 | T1 | T3 → T5 [P] | ✅ Match |
| T6 | T1, T5 | T3 → T6 [P] (T5 is a co-dep, both available before Phase 2) | ✅ Match |
| T7 | T2, T3, T4, T6 | T4, T6 → T7 [P] (T2/T3 also complete) | ✅ Match |
| T8 | T2, T3, T6 | T6 → T8 [P] | ✅ Match |
| T9 | T2, T3 | T3 → T9 [P] (can start as soon as factory/fixtures exist) | ✅ Match |
| T10 | T7, T8, T9 | T7, T8, T9 → T10 | ✅ Match |
| T11 | None | Parallel with Phase 2-3 | ✅ Match |
| T12 | T11 | T11 → T12 | ✅ Match |
| T13 | None | Start of Phase 5 | ✅ Match |
| T14 | T13 | T13 → T14 | ✅ Match |
| T15 | T14 | T14 → T15 | ✅ Match |
| T16 | T15 | T15 → T16 [P] | ✅ Match |
| T17 | T15 | T15 → T17 [P] | ✅ Match |
| T18 | T16, T17 | T16, T17 → T18 | ✅ Match |
| T19 | T10, T12, T18 | T10, T12, T18 → T19 | ✅ Match |

---

## Test Co-location Validation

> No TESTING.md exists. Test types derived from spec + design.

| Task | Code Layer Created/Modified | Test Type Required | Task Says | Status |
|------|-----------------------------|--------------------|-----------|--------|
| T1 | TypeScript types (interfaces only) | none — no runtime logic | none | ✅ OK |
| T2 | Test helper (factory) | none — test-only code | none | ✅ OK |
| T3 | Test fixtures | none — test-only code | none | ✅ OK |
| T4 | `ModelStore` service method | unit | unit (via T7, co-located phase) | ✅ OK |
| T5 | `Neo4jRepository` method | unit | unit (via T7, co-located phase) | ✅ OK |
| T6 | `ModelTrainer` + `RecommendationService` | unit | unit (via T7/T8/T10) | ✅ OK |
| T7 | Test file (model.test.ts) | unit (IS the test) | unit | ✅ OK |
| T8 | Test file (recommend.test.ts) | unit (IS the test) | unit | ✅ OK |
| T9 | Test files (rag + search) | unit (IS the tests) | unit | ✅ OK |
| T10 | Gate verification (no new code) | build gate | build | ✅ OK |
| T11 | Java service test files | unit (IS the tests) | unit | ✅ OK |
| T12 | Java controller IT files + JaCoCo config | integration (IS the tests) | integration | ✅ OK |
| T13 | `api-service/Dockerfile` | none — infrastructure | none | ✅ OK |
| T14 | `ai-service/Dockerfile` + prebake script | none — infrastructure | none | ✅ OK |
| T15 | `frontend/Dockerfile` + docker-compose.yml | none — infrastructure | none | ✅ OK |
| T16 | `README.md`, `.env.example` | none — documentation | none | ✅ OK |
| T17 | `CONTRIBUTING.md`, `.gitignore` | none — documentation | none | ✅ OK |
| T18 | Lint fixes across 3 services | none — style fixes | none | ✅ OK |
| T19 | Gate verification (no new code) | build gate | build | ✅ OK |

> **Note on T4–T6 co-location**: T4, T5, T6 produce service code whose unit tests live in T7/T8. This is a valid "merge forward" pattern (design.md: untestable code merged into earliest runnable test task) because the `buildApp` factory (T2) is a prerequisite for the tests — tests cannot run until Phase 2 deps are complete. The test tasks (T7, T8) include all required assertions for the service code created in T4–T6.
