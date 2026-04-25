# Roadmap

**Current Milestone:** M7 — Production Readiness ✅ COMPLETE
**Status:** COMPLETE

**Previous:** M6 — Quality & Publication ✅ COMPLETE — 55/55 reqs, 19 AI tests (Vitest), 15 Java tests (JUnit 5), Testcontainers IT, multi-stage Dockerfiles, ai-model-data volume, README bilíngue, ESLint ✓, Checkstyle 0 violations

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

## M7 — Production Readiness

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

## Future Considerations

- Graph-augmented RAG: multi-hop Cypher como contexto adicional no pipeline RAG
- Fine-tuning HuggingFace + endpoint `/benchmark` comparando TF.js vs HuggingFace
- Kafka event-driven: `product.created` e `order.created` substituindo HTTP síncrono
- Deploy em cloud (Railway/Render/Fly.io) com URL pública no README
- CI/CD pipeline (GitHub Actions) com gates de lint, testes e build
- Multi-model LLM comparison no RAG via OpenRouter (Mistral vs Llama vs Gemma)
- `p-limit(10)` no `fetchAllPages` para controlar concorrência em datasets grandes
- Weighted mean pooling por frequência de compra no perfil do cliente
- Multi-model LLM comparison no RAG via OpenRouter (Mistral vs Llama vs Gemma)
