# Roadmap

**Current focus:** **M17 — Fase 2 (P2)** ou **Fase 3 (P3)** do [ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md) quando priorizado ([spec M17](../features/m17-phased-recency-ranking-signals/spec.md)); calibração / baseline métrica em staging com `RECENCY_RERANK_WEIGHT` > 0 conforme necessidade. **M17 P1 + [ADR-063](../features/m17-phased-recency-ranking-signals/adr-063-score-breakdown-api-and-product-detail-modal.md)/064** ✅ **entregue** (2026-05-01). **M18** — Catálogo AD-055 ✅ (2026-04-30). Ver [STATE](STATE.md).

**Previous:** M17 P1 + transparência de score — **COMPLETE** ([spec](../features/m17-phased-recency-ranking-signals/spec.md), [design](../features/m17-phased-recency-ranking-signals/design.md), [tasks](../features/m17-phased-recency-ranking-signals/tasks.md)). M16 — ✅ **COMPLETE** (2026-04-30).

---

## Fila de planeamento (próximo trabalho)


| Ordem   | Nome de trabalho                                                  | Fonte                                                                                                                                                                                                                                 | Próximo passo **tlc**                                                     |
| ------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **P1**  | **M17** — Fase 1 (ADR-062) + ADR-063/064 — ✅ **entregue** | [ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md); [ADR-063](../features/m17-phased-recency-ranking-signals/adr-063-score-breakdown-api-and-product-detail-modal.md); [spec](../features/m17-phased-recency-ranking-signals/spec.md); [tasks](../features/m17-phased-recency-ranking-signals/tasks.md) | **M17 P2** (pooling) ou **M17 P3** (atenção); baseline métrica / staging |
| **P2**  | **M18** — catálogo simplificado / contrato AD-055 — ✅ entregue | [STATE § AD-055](STATE.md#state-ad-055); [spec M18](../features/m18-catalog-simplified-ad055/spec.md) | Verificação `docker compose`; seguir **M17 P2/P3** |
| **—**   | **M19** — Pos-Efetivar deltas & baseline (ADR-065) — ✅ **IMPLEMENTED** (2026-05-01) | [ADR-065](../features/m19-pos-efetivar-showcase-deltas/adr-065-post-checkout-column-deltas-baseline.md); [spec M19](../features/m19-pos-efetivar-showcase-deltas/spec.md); [tasks](../features/m19-pos-efetivar-showcase-deltas/tasks.md) | Verificação `npm run test:e2e` no `frontend` |
| **—**   | **M20** — Retreino manual, métricas, showcase «Pos-Retreino» (ADR-067) — **DESIGNED** (2026-05-01) | [ADR-067](../features/m20-manual-retrain-metrics-pos-retreino/adr-067-manual-retrain-metrics-showcase-pos-retreino.md); [design M20](../features/m20-manual-retrain-metrics-pos-retreino/design.md); [spec M20](../features/m20-manual-retrain-metrics-pos-retreino/spec.md); [tasks](../features/m20-manual-retrain-metrics-pos-retreino/tasks.md) | **Execute** T067-1 → T067-7 (gates por serviço) |
| **—**   | **M21** — Evolução ranking/perfil/híbrido (ADR-070 + ADR-071) — **DESIGNED** (complex, 2026-05-01) | [ADR-070](../features/m21-ranking-evolution-committee-decisions/adr-070-m21-committee-priorities-and-m17-p3-deferral.md); [ADR-071](../features/m21-ranking-evolution-committee-decisions/adr-071-m21-neural-head-and-pure-fusion-boundary.md); [spec M21](../features/m21-ranking-evolution-committee-decisions/spec.md); [design](../features/m21-ranking-evolution-committee-decisions/design.md); [tasks](../features/m21-ranking-evolution-committee-decisions/tasks.md) | **Execute** T21-1 → T21-7 (`ai-service`; ordem T1→…→T3) |


**M18:** implementação + E2E `m18-catalog-ad055.spec.ts` — estado em [STATE § AD-055](STATE.md#state-ad-055).

**M19:** baseline cart-aware para deltas da coluna **Pós efetivar**; motor único `buildRecommendationDeltaMap`; PE-04 opção B — ✅ [spec M19](../features/m19-pos-efetivar-showcase-deltas/spec.md) (2026-05-01).

**M20 (ADR-067):** retreino só manual por defeito; métricas completas no job/`model/status`; UI **Pos-Retreino** vs **Com IA** + acção **Fixar novo normal** — **DESIGNED** ([design M20](../features/m20-manual-retrain-metrics-pos-retreino/design.md), [spec M20](../features/m20-manual-retrain-metrics-pos-retreino/spec.md), [tasks](../features/m20-manual-retrain-metrics-pos-retreino/tasks.md)).

**M21 (ADR-070, ADR-071):** entregas incrementais **T1 → A → T2 → R → T4 → T3** (pairwise, atenção leve no perfil, negativos duros, fusão dinâmica, temperatura, loss combinada) sem substituir **M17 P3**; defaults legacy por env; gate **`precisionAt5`**. **DESIGNED** (complex; [spec M21](../features/m21-ranking-evolution-committee-decisions/spec.md), [design](../features/m21-ranking-evolution-committee-decisions/design.md), [tasks](../features/m21-ranking-evolution-committee-decisions/tasks.md)).

**Tech Debt:** ADR-053 — Migrate seed from `ai-service` to `api-service` (standalone spike / future debt item, ~4 days)

---

## M17 — Phased recency ranking signals (`ai-service`) — **P1 + ADR-063/064 ✅** · **P2 / P3 🔄 próximo**

**Goal:** Roll out **recency-aware** hybrid ranking in **three controlled phases** with **orthogonal configuration** (per [ADR-062](../features/m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md)): measurable attribution, no “big bang” stacking of all signals on day one, and a clear path to phase 3 (attention) only when data volume justifies it.

**Target:** Fase 1 com peso de boost default `0`; fases 2–3 com flags/env e testes; com Fase 2 activa, treino e inferência usam a **mesma** definição de perfil; métricas (`precisionAt5` e gates) documentadas por fase.

**Estado (2026-05-01):** **Fase 1 (P1)** e **transparência ADR-063/064** (`rankingConfig`, modal, proxy, Zustand) **entregues**. **Seguinte no mesmo milestone:** **Fase 2** (pooling perfil treino+inferência) e **Fase 3** (atenção temporal) — ver [spec M17](../features/m17-phased-recency-ranking-signals/spec.md) histórias P2/P3.

### Features

**Phase 1 — Re-ranking boost from recent purchase(s)** — ✅ **IMPLEMENTED** (`spec.md` P1; ver [tasks](../features/m17-phased-recency-ranking-signals/tasks.md) T1–T6)

- Similarity boost toward last (or recent) purchased item embeddings in `RecommendationService` (or equivalent re-rank step); intensity via env (e.g. weight `0` = off).
- No MLP retrain required for first value; complements [ADR-060](../features/m16-neural-first-didactic-ranking-catalog-density/adr-060-recent-suppression-neo4j-order-date.md) (suppression ≠ boost).

**Phase 2 — Weighted client profile pooling** — PLANNED

- Exponential decay (or documented alternative) in `training-utils` + matching inference path; **requires** aligned train/infer and a retrain cycle to evaluate offline/online metrics.

**Phase 3 — Temporal attention over orders** — PLANNED (roadmap / larger change)

- New model path and serialized artifact; **not** a third trivial toggle — conditioned on sufficient events per client; separate design slice when prioritized.

**ADR-063 / ADR-064 — Decomposição de score (API + modal + estado)** — ✅ **COMPLETE** (integrado ao M17 P1)

- **Decisão:** [ADR-063](../features/m17-phased-recency-ranking-signals/adr-063-score-breakdown-api-and-product-detail-modal.md) (*Accepted*): `rankingConfig` e termos no payload; modal «Resumo do score actual» alinhado ao servidor. [ADR-064](../features/m17-phased-recency-ranking-signals/adr-064-rankingconfig-zustand-recommendation-slice.md): `rankingConfig` no `recommendationSlice` Zustand.
- **Rastreio:** [tasks M17](../features/m17-phased-recency-ranking-signals/tasks.md) T7–T11; [spec PRS-16–22](../features/m17-phased-recency-ranking-signals/spec.md).

**Specification:** [.specs/features/m17-phased-recency-ranking-signals/spec.md](../features/m17-phased-recency-ranking-signals/spec.md) — P1 `PRS-01`…`PRS-10`; ADR-063 `PRS-16`…`PRS-22`; **P2/P3** em histórias de alto nível. **Tasks P1+ADR:** [tasks.md](../features/m17-phased-recency-ranking-signals/tasks.md) — **concluídas**.

---

## M18 — Catálogo simplificado & contrato AD-055 — ✅ **COMPLETE** (2026-04-30)

**Goal:** Executar a direcção de produto **[AD-055](STATE.md#state-ad-055)** em relação ao showcase M16: simplificar catálogo e contrato HTTP — sem painel isolado «Compras recentes», sem toggle global **Modo Vitrine / Modo Ranking IA**; payload que **omite** inelegíveis excepto **compra recente**; lista única após **«Ordenar por IA»** com secção **—— Fora do ranking nesta janela ——** para suprimidos temporais.

**Target:** `ai-service` / proxy alinhados ao contrato revisto; frontend sem `RecentPurchasesPanel` nem dual-mode vitrine↔ranking; E2E [`m18-catalog-ad055.spec.ts`](../../frontend/e2e/tests/m18-catalog-ad055.spec.ts); requisitos `NFD-*` reconciliados no spec (tabela § Reconciliação).

**Specification:** [.specs/features/m18-catalog-simplified-ad055/spec.md](../features/m18-catalog-simplified-ad055/spec.md) — **SPECIFIED** (prefixo `CSL-01..11`). **Design (Complex UI):** [.specs/features/m18-catalog-simplified-ad055/design.md](../features/m18-catalog-simplified-ad055/design.md). **Tasks:** [.specs/features/m18-catalog-simplified-ad055/tasks.md](../features/m18-catalog-simplified-ad055/tasks.md) (T1…T9). **ADRs (actualizados na entrega M18):** [ADR-055](../features/m16-neural-first-didactic-ranking-catalog-density/adr-055-eligibility-enriched-recommendation-contract.md), [ADR-056](../features/m16-neural-first-didactic-ranking-catalog-density/adr-056-view-mode-zustand-flag-catalog-view-mode-hook.md), [ADR-058](../features/m16-neural-first-didactic-ranking-catalog-density/adr-058-early-eligibility-prefetch-on-client-select.md).

---

## M19 — Pos-Efetivar: deltas & baseline cart-aware (ADR-065) — ✅ **IMPLEMENTED** (2026-05-01)

**Goal:** Formalizar e endurecer o comportamento já existente: a coluna **«Pós efetivar»** usa a **mesma** função de diff que **«Com Carrinho»** (`buildRecommendationDeltaMap`), com baseline **cart-aware capturado antes do checkout** (ADR-048 / ADR-045). Resolver robustez quando `analysis.cart` é `null` em `postCheckout`, decidir métrica de Δscore face ao M17 (`rankScore ?? finalScore` — **ADR-066**), copy estável e testes.

**Target:** ~~Spec + design + tasks executados~~ **feito**; sem segundo motor de diff; invariantes Node B no slice + `AnalysisPanel` (sem `cartBaselineForDiff`).

**Specification:** [.specs/features/m19-pos-efetivar-showcase-deltas/spec.md](../features/m19-pos-efetivar-showcase-deltas/spec.md) (PE-01…PE-06). **Design:** [.specs/features/m19-pos-efetivar-showcase-deltas/design.md](../features/m19-pos-efetivar-showcase-deltas/design.md). **Tasks:** [.specs/features/m19-pos-efetivar-showcase-deltas/tasks.md](../features/m19-pos-efetivar-showcase-deltas/tasks.md) (T1…T6). **ADR:** [ADR-065](../features/m19-pos-efetivar-showcase-deltas/adr-065-post-checkout-column-deltas-baseline.md), [ADR-066](../features/m19-pos-efetivar-showcase-deltas/adr-066-pe-04-showcase-delta-score-metric.md). **E2E:** extensão [`m13-cart-async-retrain.spec.ts`](../../frontend/e2e/tests/m13-cart-async-retrain.spec.ts) (ramo `promoted`).

---

## M20 — Retreino manual, métricas de treino, showcase «Pos-Retreino» (ADR-067) — **DESIGNED** (2026-05-01)

**Goal:** Alinhar operação e narrativa didáctica: checkout **só sync** Neo4j por defeito; treino profundo via **retreino manual**; `expectedTrainingTriggered` coerente; métricas completas do `ModelTrainer` nos jobs e no status; showcase com coluna **Pos-Retreino** (delta vs **Com IA** pré-promoção) e acção **Reiniciar**; cron diário configurável independentemente.

**Target:** `ai-service` + `api-service` + `frontend` + env/docker; testes Vitest/JUnit/E2E actualizados; ADR-065 convive como modo cart-aware quando flag/modo o exigir.

**Specification:** [.specs/features/m20-manual-retrain-metrics-pos-retreino/spec.md](../features/m20-manual-retrain-metrics-pos-retreino/spec.md) (**PR-067-01**…). **Design:** [.specs/features/m20-manual-retrain-metrics-pos-retreino/design.md](../features/m20-manual-retrain-metrics-pos-retreino/design.md) (UI complexo; 2026-05-01). **Tasks:** [.specs/features/m20-manual-retrain-metrics-pos-retreino/tasks.md](../features/m20-manual-retrain-metrics-pos-retreino/tasks.md) (**T067-1**…**T067-7**). **ADR:** [ADR-067](../features/m20-manual-retrain-metrics-pos-retreino/adr-067-manual-retrain-metrics-showcase-pos-retreino.md), [ADR-068](../features/m20-manual-retrain-metrics-pos-retreino/adr-068-post-retrain-baseline-snapshot-in-analysis-slice.md), [ADR-069](../features/m20-manual-retrain-metrics-pos-retreino/adr-069-reiniciar-vs-limpar-showcase-copy.md).

---

## M21 — Evolução ranking, perfil & fusão híbrida (ADR-070 + ADR-071) — **DESIGNED** (complex, 2026-05-01)

**Goal:** Entregar melhorias incrementais de treino e inferência (**pairwise loss**, **atenção leve no perfil**, **negativos mais duros**, **reponderação híbrida dinâmica**, **temperatura**, **loss combinada**) sem obrigar **M17 P3** (atenção pesada no MLP); cada técnica activável por env com defaults que reproduzem o sistema pré-M21.

**Target:** Principalmente `ai-service` (`ModelTrainer`, dataset, `RecommendationService`, offline eval); gate **`precisionAt5`** alinhado a protocolo de retreino (M20); documentação operador.

**Specification:** [.specs/features/m21-ranking-evolution-committee-decisions/spec.md](../features/m21-ranking-evolution-committee-decisions/spec.md) (**M21-01**…**M21-16**). **Design (complex):** [.specs/features/m21-ranking-evolution-committee-decisions/design.md](../features/m21-ranking-evolution-committee-decisions/design.md). **Tasks:** [.specs/features/m21-ranking-evolution-committee-decisions/tasks.md](../features/m21-ranking-evolution-committee-decisions/tasks.md) (**T21-1**…**T21-7**). **ADRs:** [ADR-070](../features/m21-ranking-evolution-committee-decisions/adr-070-m21-committee-priorities-and-m17-p3-deferral.md), [ADR-071](../features/m21-ranking-evolution-committee-decisions/adr-071-m21-neural-head-and-pure-fusion-boundary.md).

---

## M1 — Foundation ✅ COMPLETE

**Goal:** Entire infrastructure is reproducible with a single command. Synthetic data seeds both databases. Any engineer who clones the repo can bring up all services and inspect data in Neo4j Browser and PostgreSQL within 10 minutes.

**Target:** `docker compose up` succeeds; Neo4j has Product nodes with edges; PostgreSQL has products, clients, orders; seed script is idempotent.

### Features

**Monorepo Structure** — PLANNED

- `/api-service` (Java/Spring Boot), `/ai-service` (TypeScript/Fastify), `/frontend` (Next.js), `/infra` (Docker Compose, init scripts)
- Root `docker-compose.yml` with `postgres`, `neo4j`, `api-service`, `ai-service`, `frontend` services
- Health checks on all services; `depends_on` with condition `service_healthy`
- `.env.example` with all required variables documented

**Synthetic Dataset Seed** — PLANNED

- 50+ products across 5 categories: `beverages`, `food`, `personal_care`, `cleaning`, `snacks`
- 3 suppliers: `Ambev`, `Nestlé`, `Unilever` (fictional equivalents)
- 5 countries: `BR`, `MX`, `CO`, `NL`, `RO`
- 20+ clients with realistic B2B purchase histories (5–15 orders each)
- Seed script (`seed.ts` in `ai-service`) populates PostgreSQL via API and Neo4j directly
- Script is idempotent (safe to run multiple times)

**Neo4j Graph Schema** — PLANNED

- Nodes: `Product {id, name, description, category, price, sku}`, `Client {id, name, segment, country}`, `Category {name}`, `Supplier {name, country}`, `Country {code, name}`
- Edges: `(:Client)-[:BOUGHT {quantity, date}]->(:Product)`, `(:Product)-[:BELONGS_TO]->(:Category)`, `(:Product)-[:SUPPLIED_BY]->(:Supplier)`, `(:Product)-[:AVAILABLE_IN]->(:Country)`
- Constraints and indexes on `id` properties

---

## M2 — API Service (Spring Boot) ✅ COMPLETE

**Goal:** Full domain API is live with OpenAPI docs, pagination, filtering, and Actuator metrics. Demonstrates Spring Boot best practices for high-throughput APIs.

**Target:** All endpoints return correct data; Swagger UI accessible at `/swagger-ui.html`; `/actuator/metrics` shows request latency.

### Features

**Product Catalog API** — PLANNED

- `GET /api/v1/products` — paginated list with filters: `category`, `country`, `supplier`, `search` (name substring)
- `GET /api/v1/products/{id}` — product detail
- `POST /api/v1/products` — create (used by seed script)
- Caffeine in-memory cache on catalog list (TTL 5 min) to demonstrate caching pattern
- Response DTOs with `ProductSummaryDTO` (list) and `ProductDetailDTO` (single)

**Client & Order API** — PLANNED

- `GET /api/v1/clients` — paginated client list
- `GET /api/v1/clients/{id}` — client profile with purchase summary
- `GET /api/v1/clients/{id}/orders` — paginated order history
- `POST /api/v1/orders` — place order (creates order + order_items, updates client history)

**Recommendation Proxy Endpoint** — PLANNED

- `GET /api/v1/recommend/{clientId}?limit=10` — calls AI service `POST /recommend`, returns ranked product list
- Circuit breaker pattern (Resilience4j) on the AI service call — fallback returns top-selling products
- Response includes `score`, `matchReason` (`semantic` | `neural` | `hybrid`) per product

**Observability** — PLANNED

- Spring Actuator: `/actuator/health`, `/actuator/metrics`, `/actuator/info`
- Micrometer: custom metrics for recommendation latency, cache hit rate, AI service call duration
- Structured logging (Logback JSON) with `traceId` per request

---

## M3 — AI Service (TypeScript/Fastify) ✅ COMPLETE

**Goal:** Embedding generation pipeline is operational. All products have vector representations stored in Neo4j. RAG endpoint answers natural language questions about the catalog.

**Target:** `POST /rag/query` returns grounded answers; Neo4j Browser shows `embedding` property on Product nodes; similarity search returns semantically relevant products.

### Features

**Embedding Pipeline** — PLANNED

- `POST /api/v1/embeddings/generate` — generates embeddings for all products using `@xenova/transformers` (`sentence-transformers/all-MiniLM-L6-v2`, 384 dims)
- Stores embeddings as `embedding` float array property on Neo4j `Product` nodes
- Creates Neo4j vector index `product_embeddings` (cosine similarity)
- Batch processing with progress logging; idempotent (skips products already embedded)

**Semantic Search** — PLANNED

- `POST /api/v1/search/semantic` — natural language product search via vector similarity
- Body: `{ query: string, limit: number, filters?: { country?, category? } }`
- Returns products ranked by cosine similarity score (threshold > 0.5)
- Uses `Neo4jVectorStore` from `@langchain/community` (pattern from `exemplo-13`)

**RAG Pipeline** — PLANNED

- `POST /api/v1/rag/query` — answers natural language questions about the product catalog
- Pipeline: embed question → vector search Neo4j (topK=5, score > 0.5) → build context → LLM (OpenRouter, Mistral 7B free) → structured answer
- Prompt engineered for pt-BR and en responses
- Prompt template: grounded answers only, explicit "not found" when context is insufficient
- Reuses and adapts pattern from `exemplo-13-embeddings-neo4j-rag`

---

## M4 — Neural Recommendation Model ✅ COMPLETE

**Goal:** Neural model is trained on client purchase history using HuggingFace embeddings as input features (replacing one-hot encoding from parte05). Hybrid recommendation endpoint combines semantic + neural scores.

**Target:** `POST /api/v1/recommend` returns ranked products; model training completes without error; hybrid score is demonstrably better than either approach alone (qualitative validation in README).

### Features

**Model Training** — PLANNED

- `POST /api/v1/model/train` — trains neural model on current client/product/purchase data
- Architecture: `[product_embedding(384) + client_profile_vector(64)] → Dense(256, relu) → Dense(128, relu) → Dense(64, relu) → Dense(1, sigmoid)`
- Training data: binary matrix (client, product) → 1 if purchased, 0 if not (negative sampling)
- Client profile vector: mean of purchased product embeddings (dense, not one-hot)
- Framework: `@tensorflow/tfjs-node`
- Saves trained model to `/tmp/model` (TFSavedModel format)
- `GET /api/v1/model/status` — returns training status, last trained timestamp, training metrics (loss, accuracy)

**Hybrid Recommendation Engine** — PLANNED

- `POST /api/v1/recommend` — body: `{ clientId: string, limit: number }`
- For each candidate product: compute `semanticScore` (cosine similarity of client profile embedding vs product embedding) + `neuralScore` (model.predict output)
- Final score: `0.6 * neuralScore + 0.4 * semanticScore` (configurable weights via env)
- Returns top-N products sorted by final score, with score breakdown per product
- Candidate pool: products available in client's country and not yet purchased
- **ADR-016**: Parecer do Comitê Técnico confirma que híbrido é superior ao neural puro no regime de dados esparsos — calibração empírica dos pesos registrada como Feature Futura (ver `m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md`)

---

## M5 — Frontend ✅ COMPLETE

**Goal:** Functional demo UI that showcases all system capabilities end-to-end. A recruiter or evaluator can clone, run, and immediately see the system working without reading the code.

**Target:** All four panels are interactive and display real data from the services; RAG chat produces coherent answers; recommendation panel shows ranked products.

### Features

**Product Catalog Panel** — PLANNED

- Grid view of products with image placeholder, name, category, supplier, country badges, price
- Filter controls: category, country, supplier
- Search bar (semantic search via AI service)
- Click product → detail modal with full description

**Client Profile Panel** — PLANNED

- Client selector dropdown (all seeded clients)
- Shows client segment, country, purchase history summary
- "Get Recommendations" button triggers recommendation fetch

**Recommendation Panel** — PLANNED

- Displays top-10 recommended products for selected client
- Each card shows: product name, final score (0–1), match reason badge (`semantic` / `neural` / `hybrid`), score breakdown tooltip
- Side-by-side before/after: "Without AI" (random order) vs "With AI" (ranked)

**RAG Chat Panel** — PLANNED

- Chat interface for natural language product queries
- Example prompts pre-loaded: "Quais produtos sem açúcar estão disponíveis no México?", "Show me cleaning products from Unilever available in Netherlands"
- Displays retrieved context chunks alongside the answer (explainability)

---

## M6 — Quality & Publication ✅ COMPLETE

**Goal:** Project is production-quality in documentation, tests, and engineering practices. README tells a compelling technical story. GitHub repository is ready for public sharing.

**Target:** Tests pass; README is self-sufficient; any engineer can clone and run with zero prior knowledge of the project.

**Status:** ✅ COMPLETE — 55/55 reqs, testes automatizados, multi-stage Dockerfiles, README bilíngue

### Features

**Test Suite** — PLANNED

- API Service (Java): unit tests for service layer (≥70% coverage on domain services); integration tests for REST endpoints with Testcontainers (PostgreSQL)
- AI Service (TypeScript): integration tests for `/rag/query` and `/recommend` endpoints with mock Neo4j responses; unit tests for score combination logic
- All tests run in CI via `./mvnw test` (Java) and `npm test` (TypeScript)

**README & Documentation** — PLANNED

- Architecture diagram (Mermaid or ASCII) with data flow
- Tech decisions section: why TypeScript for AI service (Erick Wendel's course, `exemplo-13` reference, Transformers.js maturity)
- Why Java/Spring Boot for API (ultra-scale background, demonstrated in other projects)
- Why Neo4j (unified graph + vector store, validated in `exemplo-13`)
- 5-command quickstart: `git clone` → `cp .env.example .env` → `docker compose up` → open browser → done
- API reference link to Swagger UI
- Sample RAG queries and expected outputs

**Engineering Polish** — PLANNED

- Checkstyle (Java) + Ruff (not applicable, TypeScript) + ESLint (TypeScript/React) all passing with zero warnings
- `docker compose` build uses multi-stage Dockerfiles (smaller images)
- `.gitignore` correct for all three runtimes (Java, Node.js, Next.js)
- `CONTRIBUTING.md` minimal guide for project structure

---

## M7 — Production Readiness ✅ COMPLETE

**Goal:** Fechar os gaps operacionais críticos identificados pelo Comitê de Arquitetura e pela análise pós-M6. Modelo neural retreinado automaticamente toda madrugada. Produtos novos sincronizados com Neo4j e embeddings gerados sem intervenção manual. Treino assíncrono que não bloqueia o cliente HTTP. Model versioning com rollback. Segurança mínima para deploy público.

**Target:** Sistema opera de forma autônoma após deploy — sem intervenção manual para retreino, sincronização ou embedding de novos produtos.

**Status:** ✅ COMPLETE — 37/37 reqs; TrainingJobRegistry + VersionedModelStore + CronScheduler + adminRoutes + sync-product + AiSyncClient; 42 AI tests (Vitest); 16 Java tests; ESLint ✓; Checkstyle 0 violations; Playwright E2E suite

### Features

**Sincronização automática de produtos novos → Neo4j + embeddings (GAP-02)** — PLANNED

- `POST /products` no api-service notifica ai-service após persistir no PostgreSQL
- ai-service cria nó `Product` no Neo4j e gera embedding via HuggingFace imediatamente
- Produto novo aparece em busca semântica, RAG e recomendações sem intervenção manual
- Fallback: se ai-service indisponível, produto fica na fila e é processado no próximo ciclo de `/embeddings/generate`

**Treino assíncrono — padrão 202 + polling (Comitê Achado #6)** — PLANNED

- `POST /model/train` retorna `202 Accepted` com `{ jobId, status: "queued" }` imediatamente
- `GET /model/train/status/{jobId}` retorna progresso: `{ status, epoch, totalEpochs, loss, eta }`
- Treino roda em background sem bloquear o event loop do Fastify
- Pré-requisito para o cron diário (GAP-01)

**Cron diário de retreinamento automático (GAP-01)** — PLANNED

- Cron interno no ai-service (`node-cron`) dispara `modelTrainer.train()` todo dia às 02h
- Usa o padrão assíncrono do Achado #6 — não bloqueia o event loop
- `syncNeo4j()` já roda dentro do `train()` — pega todos os pedidos novos do dia automaticamente
- `staleDays` zera após cada execução bem-sucedida; `staleWarning` desaparece

**Model versioning com rollback (Comitê Achado #5)** — PLANNED

- Modelo salvo com timestamp: `/tmp/model/model-{ISO}.json`
- Symlink `/tmp/model/current` aponta para o melhor modelo por `precisionAt5`
- Novo treino só substitui `current` se `precisionAt5` novo ≥ `precisionAt5` atual
- `GET /model/status` expõe histórico dos últimos 5 modelos com métricas

**Segurança mínima para deploy público (Comitê Achado #10)** — PLANNED

- Header `X-Admin-Key` validado contra env var `ADMIN_API_KEY` nos endpoints `POST /model/train` e `POST /embeddings/generate`
- Retorna `401 Unauthorized` sem a chave
- Documentado no README e `.env.example`

**Testes E2E com Playwright** — PLANNED

- Cobertura dos fluxos principais: busca de produto, recomendações, RAG chat
- Execução no pipeline CI/CD após build das imagens
- Screenshots de regressão visual para o frontend

---

## M8 — UX Journey Refactor ✅ COMPLETE

**Goal:** Reorganizar a experiência de demo em uma jornada de página única fluida. Seleção de cliente persistente na navbar, catálogo com reordenação por IA animada, chat RAG acessível como drawer lateral — sem precisar trocar de aba para completar o fluxo principal.

**Target:** Avaliador seleciona cliente uma vez na navbar e explora catálogo, reordenação por IA e chat RAG sem sair da tela do catálogo.

**Status:** ✅ COMPLETE — 55/55 reqs (M8-01..M8-55); Zustand store (clientSlice + demoSlice + recommendationSlice) + 4 domain hooks; ReorderableGrid (FLIP ADR-017) + ClientSelectorDropdown + RAGDrawer (always-mounted ADR-018) + ScoreBadge + CatalogPanel toolbar + Header wiring + layout migration + ClientPanel read-only + RecommendationPanel banner + sonner toasts + E2E suite; `npm run build` ✓; ESLint ✓ 0 warnings

**Post-M8 nav fix (AD-020):** Abas "Cliente" e "Recomendações" removidas; nova aba "📊 Análise" criada fundindo ClientProfileCard + comparação Sem IA vs Com IA — antecipa estrutura do M9-B.

### Features

**Sprint 0 — Zustand Store** — PLANNED

- Substituir React Contexts por Zustand: `clientSlice` (persistente) + `demoSlice` (volátil)
- `selectedClient` persiste entre abas e reloads; `demoState` limpo automaticamente ao trocar de cliente
- Hook único `useAppStore` — sem Provider wrappers no layout

**Sprint 0 — Componente `<ReorderableGrid>`** — PLANNED

- Componente genérico com props `items`, `getScore`, `ordered`, `renderItem`
- Animação CSS pura (`transform + transition 500ms`) ao alternar `ordered true/false`
- Reutilizado por M8 (catálogo) e M9 (demo buy) sem modificação

**Client Selector na Navbar** — PLANNED

- Dropdown de clientes embutido no Header, visível em qualquer aba
- Badge de país (emoji de bandeira) ao lado do nome do cliente selecionado
- Persiste entre navegações; troca de cliente limpa demoState automaticamente

**Botão "✨ Ordenar por IA" no Catálogo** — PLANNED

- Toolbar do catálogo ganha botão "✨ Ordenar por IA" (habilitado apenas com cliente selecionado)
- Dispara `POST /recommend`, anima reordenação dos cards por score híbrido descrescente
- Toggle para "✕ Ordenação original" com animação de reversão
- Respeita filtros ativos; cache de recomendações evita chamadas desnecessárias

**Score Badge nos Cards do Catálogo** — PLANNED

- Cards exibem badge "XX% match" quando em modo ordenado por IA
- Tooltip com breakdown: `Neural: X.XX`, `Semântico: X.XX`
- Desaparece ao reverter para ordem original

**RAG Side Drawer** — PLANNED

- Botão "💬 Chat RAG" no Header abre drawer lateral (420px desktop / 100% mobile)
- Histórico de chat preservado ao fechar/reabrir
- Contexto do cliente selecionado visível no cabeçalho do drawer
- Fechar com clique fora ou Escape

---

## M9-A — Demo Buy + Live Reorder ✅ COMPLETE

**Goal:** Demonstrar aprendizado incremental em tempo real: clicar "Demo Comprar" em um produto atualiza o perfil vector do cliente e reordena as recomendações ao vivo, sem retreinar a rede neural.

**Target:** Avaliador clica "Demo Comprar", espera ~300ms, e vê os cards de recomendação se reordenarem refletindo a nova compra — feedback visual imediato do motor de recomendação.

**Status:** ✅ COMPLETE — 33/33 reqs; DemoBuyService + 3 Neo4jRepository methods (ADR-021) + demoBuyRoutes (ADR-022) + recommendFromVector + demoSlice loading state + ProductCard demo buttons + CatalogPanel wiring + 3 proxy routes + E2E spec; 63 AI tests (Vitest); `npm run build` ✓; ESLint ✓ 0 warnings; `tsc --noEmit` ✓

### Features

**Rota demo-buy no AI Service** — PLANNED

- `POST /api/v1/demo-buy` — cria edge `BOUGHT {is_demo: true}` no Neo4j, recalcula `clientProfileVector` via mean-pooling incremental, retorna novas recomendações (latência estimada: 180–350ms)
- `DELETE /api/v1/demo-buy` — remove todas as edges `is_demo: true` para o `clientId`, restaurando o perfil original
- Sem alteração no `ModelTrainer` — opera exclusivamente no espaço do `clientProfileVector` (AD-013)

**Botão "Demo Comprar" nos cards** — PLANNED

- Card de produto no catálogo exibe botão "🛒 Demo Comprar" quando cliente está selecionado
- Ao clicar: `demoSlice` registra compra, chama `POST /demo-buy`, `<ReorderableGrid>` anima nova ordem
- Badge "demo" no card após compra simulada; botão muda para "↩ Desfazer"
- "↩ Desfazer" chama `DELETE /demo-buy`, restaura ordem anterior com animação

---

## Client Profile Enrichment Fix — DELIVERED VIA M15

**Goal:** Corrigir o `ClientProfileCard` na aba "Análise" que exibe `0 pedidos` e `Sem pedidos registrados` para todos os clientes, apesar de os dados existirem no Postgres. O bug está no `ClientSelectorDropdown` que hardcoda `totalOrders: 0` e `recentProducts: []` ao construir o objeto `Client` a partir do endpoint de lista `/api/v1/clients`, que não retorna dados de pedidos.

**Target:** Ao selecionar um cliente, o `ClientProfileCard` exibe o total de pedidos correto, o valor total gasto, a data do último pedido e os últimos 5 produtos comprados — todos buscados dos endpoints `/api/v1/clients/{id}` e `/api/v1/clients/{id}/orders` já existentes no API Service.

**Status:** DELIVERED VIA `M15` — o dropdown passou a persistir apenas a identidade leve do cliente, e o enriquecimento real do card agora e feito de forma transitoria com fallback gracioso. O fechamento formal continua absorvido pelo milestone `M15`, que ainda esta em reconciliacao documental.

### Root Cause

O endpoint de lista `/api/v1/clients?size=100` retorna apenas `{ id, name, segment, countryCode }`. A função `toClient()` no `ClientSelectorDropdown` preenche `totalOrders: 0` e `recentProducts: []` hardcoded. Os endpoints individuais com dados completos existem mas nunca são chamados:

- `GET /api/v1/clients/{id}` → retorna `purchaseSummary: { totalOrders, totalItems, totalSpent, lastOrderAt }`
- `GET /api/v1/clients/{id}/orders` → retorna histórico de pedidos com itens e nomes de produtos

### Features

**Enriquecimento do perfil do cliente ao selecionar** — DELIVERED VIA `M15`

- Ao selecionar cliente no dropdown, buscar `GET /api/v1/clients/{id}` e `GET /api/v1/clients/{id}/orders` em paralelo para compor o card
- `ClientSelectorDropdown` persiste apenas identidade leve; os dados enriquecidos ficam fora do Zustand principal
- `ClientProfileCard` mostra loading skeleton e estados `ready | empty | partial | unavailable`
- `recentProducts`, `totalSpent` e `lastOrderAt` passam a refletir dados reais quando disponiveis
- O fluxo principal continua utilizavel mesmo quando o enriquecimento falha parcialmente ou totalmente

---

## M9-B — Deep Retrain Showcase ✅ COMPLETE

**Goal:** Demonstrar retreinamento completo da rede neural com barra de progresso ao vivo e comparação "antes/depois" no painel de Análise.

**Target:** Avaliador clica "Retreinar Modelo", acompanha progresso epoch por epoch, e vê as métricas de qualidade antes e depois do treino na aba "Análise".

**Status:** ✅ COMPLETE — 32/32 reqs, 9/9 tasks; useRetrainJob (ADR-025) + TrainingProgressBar (ADR-024 scaleX) + ModelMetricsComparison + RetrainPanel + AnalysisPanel lg:grid-cols-2 + mobile Tabs + page.tsx always-mounted (ADR-023) + 3 proxy routes + lib/adapters/train.ts + E2E spec; `npm run build` ✓; ESLint ✓ 0 warnings

### Features

**Aba "Análise" com Deep Retrain** — PLANNED

- Botão "Retreinar Modelo" chama `POST /model/train` existente (202 + polling — M7)
- Barra de progresso ao vivo via polling `GET /model/train/status/{jobId}`
- Comparação "antes/depois": métricas `precisionAt5`, `loss`, `epoch` do modelo anterior vs novo
- Layout: comparação "Sem IA vs Com IA" à esquerda; controles de retrain à direita (tela grande); tabs empilhadas em mobile (Tensão T3 — AD-012)

---

## M11 — AI Learning Showcase ✅ COMPLETE

**Goal:** Demonstrar aprendizado incremental visível na aba "Análise" com 4 colunas de recomendação comparando: Sem IA → Com IA → Com Demo → Pós-Retreino. O avaliador experimenta o ciclo completo de aprendizado de máquina de forma guiada e visualmente clara.

**Target:** Avaliador seleciona cliente, vê coluna "Com IA" populada automaticamente; faz compras demo no catálogo, vê coluna "Com Demo" atualizada; clica "Retreinar Modelo", vê coluna "Pós-Retreino" aparecer com recomendações que refletem as compras demo. Modelo neural melhora qualitativamente: produtos da categoria comprada sobem no ranking após retreino.

**Status:** ✅ COMPLETE — 8/8 tasks, 27/27 reqs; training-utils.ts + ModelTrainer (Dense[64]→Dropout→Dense[1], ADR-027/028) + analysisSlice (4-phase union, ADR-029) + RecommendationColumn (4 colorSchemes, ADR-030) + AnalysisPanel (snapshot orchestration + xl:grid-cols-4 + accordion md) + RetrainPanel (phase-gate disable) + useAppStore composição + E2E spec; ESLint ✓; npm run build ✓; 72 AI tests (Vitest)

**Post-M11 quick fix (ADR-031, 2026-04-27) ✅ COMPLETE:** Corrigido comportamento de queda de score pós-retreino em produtos correlacionados (ex: Knorr Pasta Sauce 64% → 32% após compras demo food/Unilever). Causa raiz: False Negative Contamination — produtos da mesma (categoria + supplier) dos comprados na demo entravam como negativos, recebendo gradiente oposto amplificado pelo `classWeight: {0:1, 1:4}`. Fix: `supplierName?: string` adicionado ao `ProductDTO`; filtro `positiveCategorySupplierPairs` exclui soft negatives do pool antes do sampling. Diagnóstico validado por Comitê de IA (4 personas). Prática equivalente ao exposure-aware sampling de produção (MNAR). 2 novos testes unitários; 74/74 Vitest ✓; ESLint ✓. Commit `e4c9004`.

**Post-M11 quick fix (ADR-032, 2026-04-27) ✅ COMPLETE:** ADR-031 cobre apenas mesma (categoria + supplier). Produtos de outros suppliers na mesma categoria (ex: food/Nestlé após compras food/Unilever) com embeddings próximos no espaço latente continuam sujeitos a penalização residual (~5–15 pontos). Decisão aprovada pelo Comitê de IA: adicionar segundo filtro de soft negatives por **similaridade coseno** em `buildTrainingDataset` — candidatos com `maxCosineSim(candidato, qualquer_positivo) > SOFT_NEGATIVE_SIM_THRESHOLD` são excluídos do pool. Threshold via `process.env.SOFT_NEGATIVE_SIM_THRESHOLD` (default `0.65`). Os dois filtros (ADR-031 + ADR-032) são aditivos. Equivalente ao ANCE simplificado — padrão de produção. Implementação: `cosineSimilarity` pura + filtro `softPositiveIdsBySimilarity` em `training-utils.ts`; 2 novos testes unitários; 76/76 Vitest ✓; ESLint ✓. Commit `fix(ai-service): add cosine similarity soft negative filter to complement ADR-031 (ADR-032)`.

### Features

**Backend ML Refactor (ADR-027 + ADR-028)** — PLANNED

- `buildTrainingDataset` em `training-utils.ts`: função pura com negative sampling N=4, hard negative mining por categoria, seed determinístico derivado de `clientId`, fallback upsampling
- `ModelTrainer` atualizado: arquitetura `Dense[64, relu, l2(1e-4)] → Dropout[0.2] → Dense[1, sigmoid]`, `classWeight: {0:1.0, 1:4.0}`, `EPOCHS=30`, `BATCH_SIZE=16`, early stopping patience=5

**analysisSlice — Type Discriminada 4 Fases (ADR-029)** — PLANNED

- Zustand slice volátil com fases `empty | initial | demo | retrained`, cada uma com snapshots tipados por `clientId`
- Reset automático ao trocar de cliente; impossibilita estados inválidos em compile-time

**RecommendationColumn Presentacional (ADR-030)** — PLANNED

- Componente genérico com estados empty/loading/populated, `colorScheme` semântico (gray/blue/emerald/violet), timestamp `capturedAt`
- `AnalysisPanel` orquestra 4 instâncias com snapshots do `analysisSlice`

**AnalysisPanel — Layout Responsivo + Snapshot Orchestration** — PLANNED

- Layout `grid-cols-1 md:grid-cols-2 xl:grid-cols-4`; accordion para colunas 3/4 em viewport `< xl`
- Captura automática de snapshots: `initial` ao montar, `demo` ao detectar mudança no `demoSlice`, `retrained` ao `useRetrainJob.status === 'done'`

---

---

## M12 — Self-Healing Model Startup — COMPLETE

**Goal:** Tornar o ai-service totalmente autônomo na inicialização. Em ambiente limpo (`docker compose up` pela primeira vez ou após `docker compose down -v`), o serviço deve detectar a ausência de modelo, gerar embeddings se necessário, treinar o modelo v1 em background e sinalizar prontidão via `/ready` — sem nenhuma intervenção manual do operador.

**Target:** `docker compose up` em ambiente limpo resulta em sistema totalmente operacional após ~3 minutos, sem nenhum comando adicional. O avaliador abre `http://localhost:3000` e as recomendações funcionam.

**Status:** ✅ COMPLETE — execute finalizado (T1..T6, 2026-04-27). `StartupRecoveryService` ativo em background, `TrainingJobRegistry.waitFor()` implementado, `AUTO_HEAL_MODEL` documentado, bootstrap/startup testável com testes de integração de startup, compose alinhado com `/ready` + `start_period: 180s`, validação build gate + cold/warm boot concluída.

**Post-M12 Hardening (2026-04-28):** `AutoSeedService` adicionado ao boot do `ai-service` (ADR-052) — sistema agora **zero-touch em cold start total** (`docker compose down -v && docker compose up`). Bug de cold-start cache poisoning no `api-service` corrigido via `Cache-Control: no-cache` no `ModelTrainer` + `condition = "!#noCache"` no `@Cacheable`. Novos ADRs: ADR-052 (entregue) e ADR-053 (débito técnico). Ver [docs/diagrams/cold-start-boot-flow.md](../../docs/diagrams/cold-start-boot-flow.md).

### Features

`**autoHealModel()` — Background Self-Healing** — COMPLETE

- Disparado em background após `listen()` quando `versionedModelStore.getModel() === null` e `AUTO_HEAL_MODEL=true`
- Sequência implementada: (1) verifica embeddings no Neo4j e gera apenas quando faltantes; (2) faz probe de dados de treino com retry limitado para absorver race de startup; (3) reutiliza job ativo (`getActiveJobId()` + `waitFor`) ou enfileira novo job; (4) bloqueia `/ready` durante recovery e em estados `blocked`
- Quando não há dados de treino (seed ausente), mantém processo vivo com `/health=200` e `/ready=503` (sem crash, sem retry infinito)
- `AUTO_HEAL_MODEL=false` mantém boot sem recovery para testes determinísticos

`**docker-compose.yml` — Healthcheck ajustado** — COMPLETE

- Healthcheck do `ai-service` usa `/ready` com `start_period: 180s`; `interval`, `retries` e `timeout` preservados
- `api-service` depende de `ai-service: service_started` (não `service_healthy`) para quebrar ciclo de boot sem perder resiliência

---

## M13 — Cart, Checkout & Async Retrain Capture — COMPLETE

**Goal:** Substituir o fluxo legado `Demo Buy` por `Carrinho -> Checkout -> Pedido -> Treino`, tornando `Order` o unico ground truth de treino e capturando o retreinamento assincrono via `ModelStatusPanel`.

**Target:** Avaliador adiciona produtos ao carrinho, visualiza o estado `Com Carrinho`, efetiva a compra, e acompanha a coluna `Pos-Efetivar` ser preenchida quando o `currentVersion` mudar no `/model/status`.

**Status:** ✅ COMPLETE — `Cart`/`CartItem` persistidos no `api-service`, `recommendFromCart()` no `ai-service`, polling por `currentVersion`, `ModelStatusPanel`, governanca `promoted/rejected/failed`, e fluxo principal validado pelos testes que hoje sustentam `M14` e `M15`.

### Features

**Cart & Checkout API** — COMPLETE

- `api-service` ganha `Cart`/`CartItem` persistidos em PostgreSQL com rotas para adicionar item, remover item, esvaziar carrinho e efetivar checkout
- `POST /carts/{clientId}/checkout` cria `Order` real e retorna `{ orderId, expectedTrainingTriggered }`
- Checkout confirmado substitui `BOUGHT {is_demo: true}` como gatilho principal de treino

**Cart-Aware Recommendation Flow** — COMPLETE

- `ai-service` expõe `recommendFromCart(clientId, productIds[])` usando embeddings já precomputados no Neo4j
- Perfil `Com Carrinho` combina pedidos reais prévios com os itens do carrinho via `meanPooling` em memória
- Fluxo `is_demo` sai do caminho principal e fica apenas como modo legado/de depuração

**Async Retrain Capture & ModelStatusPanel** — COMPLETE

- `RetrainPanel` evolui para `ModelStatusPanel` com estados `idle | training | promoted | rejected | failed`
- `useRetrainJob` evolui para `useModelStatus`, trocando a fonte de verdade de `jobId` para `currentVersion`
- Frontend inicia polling em `GET /model/status` após checkout e captura `Pos-Efetivar` quando a versão do modelo mudar

**Model Governance & Migration** — COMPLETE

- `GET /model/status` passa a expor `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy` e `lastOrderId`
- Gate de promoção com banda de tolerância e decisão explícita `promoted/rejected/failed`
- Limpeza/ignorância de edges legadas `BOUGHT {is_demo: true}` antes do go-live do novo fluxo

---

## M14 — Catalog Score Visibility & Cart-Aware Showcase — COMPLETE

**Goal:** Tornar o efeito do carrinho visível em todo o catálogo e na jornada comparativa da aba "Análise", substituindo o vocabulário e a semântica de `Com Demo` por `Com Carrinho`.

**Target:** Avaliador vê score em todos os itens relevantes do catálogo, observa snapshots `Com Carrinho` reativos a cada mudança, e interpreta deltas entre `Com IA -> Com Carrinho -> Pos-Efetivar` sem ambiguidade.

**Status:** ✅ COMPLETE — janela de ranking compartilhada, `CoverageStatusBanner` com modo diagnostico, snapshots reativos `Com Carrinho`, deltas entre fases e migracao principal para `cartSlice` / vocabulario de carrinho estao entregues no frontend e cobertos pelo fluxo E2E principal. A reconciliacao de 2026-04-29 alinhou `spec.md`, `tasks.md` e removeu os restos legados de frontend ligados a `demo` que ainda causavam ambiguidade.

### Features

**Catalog Score Visibility** — COMPLETE

- Catálogo ordenado por IA exibe score para todos os itens visíveis, não apenas o top-10
- Limite/configuração para modo diagnóstico ou catálogo completo quando necessário
- Marca e categoria aparecem de forma consistente em cards e detalhes

**Reactive Analysis Timeline** — COMPLETE

- `analysisSlice` troca a fase `demo` por `cart` e passa a reagir a cada add/remove do carrinho
- Coluna `Com Carrinho` atualiza de forma incremental, sem congelar no primeiro evento
- UI de análise mostra posição anterior, posição nova e delta de score entre as fases

**Frontend Vocabulary Migration** — COMPLETE

- `Demo Comprar` -> `Adicionar ao Carrinho`
- `Limpar Demo` -> `Esvaziar Carrinho`
- `demoSlice` -> `cartSlice`, com atualização de componentes, testes E2E e textos de apoio

---

## M15 — Cart Integrity & Comparative UX — COMPLETE

**Goal:** Fechar os gaps de integridade e UX restantes no fluxo com carrinho, garantindo regras de negócio corretas, feedback comparativo claro e contexto fiel do cliente na aba "Análise".

**Target:** Produtos incompatíveis com o contexto do cliente são bloqueados no carrinho, o `ClientProfileCard` mostra dados reais de pedidos, e os estados `promoted/rejected/failed` são compreensíveis para o avaliador.

**Status:** ✅ COMPLETE — bloqueio por pais no carrinho com erro `422`, mensagens coerentes backend/frontend, enriquecimento transitorio do `ClientProfileCard` e copy/notice para `promoted`, `rejected`, `failed` e `unknown` estao implementados com cobertura JUnit e Playwright. A reconciliacao de 2026-04-29 fechou a defasagem documental em `spec.md`, `tasks.md` e `STATE.md`; os `test.skip()` remanescentes nos E2E refletem dependencia de fixtures/ambiente, nao falta de feature.

### Features

**Cart Integrity Rules** — COMPLETE

- `POST /carts/{clientId}/items` valida `available_in` contra o país do cliente
- Ações inválidas retornam mensagens de erro consistentes no backend e no frontend
- Frontend desabilita ou sinaliza tentativas inválidas antes do checkout

**Comparative UX Polish** — COMPLETE

- Banners e copy final para estados `promoted`, `rejected` e `failed` no `ModelStatusPanel`
- Melhor explicação visual para o caso "sem mudança visível" quando o modelo candidato é rejeitado
- Fechamento do restante do AD-042 adaptado ao vocabulário `Com Carrinho`

**Client Profile Enrichment Fix** — COMPLETE

- Ao selecionar cliente, chamar `GET /api/v1/clients/{id}` e `GET /api/v1/clients/{id}/orders`
- Preencher `ClientProfileCard` com total de pedidos, valor gasto, data do último pedido e produtos recentes
- Manter fallback gracioso quando o enriquecimento falhar

---

## M16 — Neural-First Didactic Ranking & Catalog Density ✅ COMPLETE

**Goal:** Tornar o showcase didático explícito e confiável para o avaliador: produtos comprados recentemente deixam de "sumir" silenciosamente, o catálogo passa a explicar elegibilidade vs ranking, e o seed ganha densidade suficiente para que a aprendizagem de categoria emerja do modelo neural sem boost manual de regra de negócio.

**Target:** Avaliador compra 3–4 itens de uma mesma categoria, continua vendo candidatos inéditos suficientes dessa categoria no ranking, entende claramente quais itens ficaram fora por compra recente e consegue atribuir o movimento do ranking ao modelo neural, não a fórmulas escondidas.

**Status:** ✅ **COMPLETE** (2026-04-30) — `design.md` + ADRs 055–061; tarefas T1–T15 e gates de build conforme `tasks.md`; E2E `m16-catalog-modes`.

### Features

**Recent Purchase Suppression (eligibility, not ranking)** — COMPLETE

- `getCandidateProducts` deixa de usar exclusão vitalícia por histórico completo e passa a considerar uma janela de compras recentes (`RECENT_PURCHASE_WINDOW_DAYS`, default sugerido `7`)
- Produtos comprados recentemente permanecem visíveis no catálogo, mas ficam fora do ranking principal durante a janela
- Contrato de recomendação deve distinguir itens `eligible` vs `suppressed`, com `reason` e `suppressionUntil` quando aplicável
- Regras determinísticas ficam restritas à camada de elegibilidade (país, disponibilidade, carrinho, compras recentes), preservando o ranking `neural + semantic` sem boost manual

**Didactic Catalog Transparency** — COMPLETE

- Catálogo ganha separação explícita entre `Modo Vitrine` e `Modo Ranking IA`
- Painel `Compras recentes` no topo mostra o que o cliente comprou, quando comprou e quando cada item volta a ser elegível ao ranking
- Cards exibem badges de elegibilidade (`comprado recentemente`, `fora do ranking nesta janela`, `demo`, `fora do país`, `sem embedding`) para evitar a interpretação de "produto sumiu"
- Grid ordenado por IA continua exibindo todos os produtos do catálogo, mas com distinção visual entre itens pontuados e itens inelegíveis

**Neural-First Ranking Contract** — COMPLETE

- `finalScore` permanece exclusivamente como combinação dos sinais já existentes (`neuralScore` + `semanticScore`)
- Não serão adicionados boosts manuais por categoria, marca ou supplier para simular aprendizagem
- A UI deve explicitar a diferença entre `filtros aplicados` e `mudanças do modelo`
- Bloco "o que mudou no modelo" passa a resumir promoção/rejeição, pedidos novos, deltas e outros sinais que ajudem a atribuir o uplift ao comportamento neural

**Catalog Density Refresh (seed & data design)** — COMPLETE

- Expandir o seed sintético para piso aceitável de `~85` SKUs e alvo preferido de `~125`, com 20–25 produtos nas categorias centrais (`beverages`, `food`)
- Aumentar diversidade de suppliers, clientes e pedidos para que a rede tenha espaço para aprender afinidade de categoria sem esgotar o candidate pool
- `orders.ts` deixa de ser quase uniforme e passa a refletir vieses por `segment x category`, padrões de recompra e descrições mais diversas
- Revisar disponibilidade por país para reduzir falsos vazios de categoria causados apenas por cobertura geográfica estreita

**Metric Re-Baseline & Validation Refresh** — COMPLETE

- Após a expansão do seed, recalcular o baseline de `precisionAt5` do projeto
- Avaliar `recall@10` e `nDCG@10` como métricas auxiliares do showcase didático, sem substituir a métrica principal de promoção enquanto não houver nova decisão de comitê
- Recalibrar `SOFT_NEGATIVE_SIM_THRESHOLD` e `negativeSamplingRatio` caso a distribuição de embeddings / hard negatives mude materialmente com o dataset mais denso

---

## Future Considerations

- Graph-augmented RAG: multi-hop Cypher como contexto adicional no pipeline RAG
- Fine-tuning HuggingFace + endpoint `/benchmark` comparando TF.js vs HuggingFace
- Kafka event-driven: `product.created` e `order.created` substituindo HTTP síncrono
- Deploy em cloud (Railway/Render/Fly.io) com URL pública no README
- CI/CD pipeline (GitHub Actions) com gates de lint, testes e build
- Multi-model LLM comparison no RAG via OpenRouter (Mistral vs Llama vs Gemma)
- `p-limit(10)` no `fetchAllPages` para controlar concorrência em datasets grandes
- **[ADR-016] Calibração empírica dos pesos do score híbrido** — grid search sobre `NEURAL_WEIGHT`/`SEMANTIC_WEIGHT` usando `precisionAt5` como métrica de decisão (requer ≥ 100 clientes com ≥ 10 pedidos cada); inclui comparação: neural puro × semântico puro × híbrido calibrado. Infra de `computePrecisionAtK` já existe em `ModelTrainer.ts`. Ver `m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md`.
- **[ADR-016] Weighted mean pooling** — substituir `meanPooling` por média ponderada por frequência de compra no perfil do cliente (`weightedMeanPooling`), aumentando a influência de produtos com histórico de recompra.
- **[ADR-016] Endpoint `/api/v1/model/benchmark`** — API que retorna métricas comparativas (precisionAt5, recallAt10) para múltiplas configurações de peso, expondo os resultados do grid search no painel admin.

