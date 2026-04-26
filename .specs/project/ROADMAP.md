# Roadmap

**Current Milestone:** M11 — AI Learning Showcase ✅ COMPLETE
**Status:** COMPLETE — 8/8 tasks, 4 phases, 27/27 reqs; training-utils.ts (buildTrainingDataset + hard negative mining + seed LCG) + ModelTrainer (Dense[64]→Dropout→Dense[1], EPOCHS=30, BATCH_SIZE=16, early stopping) + analysisSlice (4-phase discriminated union) + RecommendationColumn (empty/loading/populated, 4 colorSchemes) + AnalysisPanel (snapshot orchestration + xl:grid-cols-4 + accordion md + mobile tabs) + RetrainPanel (disabled when phase=empty, lifted useRetrainJob) + useAppStore (analysisSlice composed + reset chain) + E2E spec; ESLint ✓; npm run build ✓; 72 AI tests (Vitest)

**Previous:** M10 — Demo-Retrain Integration ✅ COMPLETE (ADR-026)

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

## M-CF — Client Profile Enrichment Fix — PLANNED

**Goal:** Corrigir o `ClientProfileCard` na aba "Análise" que exibe `0 pedidos` e `Sem pedidos registrados` para todos os clientes, apesar de os dados existirem no Postgres. O bug está no `ClientSelectorDropdown` que hardcoda `totalOrders: 0` e `recentProducts: []` ao construir o objeto `Client` a partir do endpoint de lista `/api/v1/clients`, que não retorna dados de pedidos.

**Target:** Ao selecionar um cliente, o `ClientProfileCard` exibe o total de pedidos correto, o valor total gasto, a data do último pedido e os últimos 5 produtos comprados — todos buscados dos endpoints `/api/v1/clients/{id}` e `/api/v1/clients/{id}/orders` já existentes no API Service.

**Status:** PLANNED — aguarda M9-A ✅

### Root Cause

O endpoint de lista `/api/v1/clients?size=100` retorna apenas `{ id, name, segment, countryCode }`. A função `toClient()` no `ClientSelectorDropdown` preenche `totalOrders: 0` e `recentProducts: []` hardcoded. Os endpoints individuais com dados completos existem mas nunca são chamados:

- `GET /api/v1/clients/{id}` → retorna `purchaseSummary: { totalOrders, totalItems, totalSpent, lastOrderAt }`
- `GET /api/v1/clients/{id}/orders` → retorna histórico de pedidos com itens e nomes de produtos

### Features

**Enriquecimento do perfil do cliente ao selecionar** — PLANNED

- Ao selecionar cliente no dropdown, chamar `GET /api/v1/clients/{id}` para obter `purchaseSummary`
- Chamar `GET /api/v1/clients/{id}/orders` para obter os últimos pedidos e extrair `recentProducts`
- Atualizar o objeto `Client` no Zustand store (`clientSlice`) com os dados enriquecidos
- Loading skeleton no `ClientProfileCard` durante o fetch de enriquecimento
- Erro silencioso (mantém `totalOrders: 0`) se o fetch falhar — sem quebrar o fluxo principal

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
