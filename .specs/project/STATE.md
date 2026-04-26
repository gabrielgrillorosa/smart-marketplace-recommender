# Project State

_Last updated: 2026-04-26 — Session: M11 — AI Learning Showcase ✅ COMPLETE — 8/8 tasks; training-utils.ts + ModelTrainer refactor (ADR-027/028) + analysisSlice (ADR-029) + RecommendationColumn (ADR-030) + AnalysisPanel snapshot orchestration + RetrainPanel phase-gate + useAppStore composição + E2E spec; ESLint ✓; npm run build ✓; 72 AI Vitest tests_

---

## Current Focus

**Status:** M11 — AI Learning Showcase ✅ COMPLETE (ADR-027..ADR-030)

**Previous:** M10 — Demo-Retrain Integration ✅ COMPLETE (ADR-026)

---

## Decisions

### AD-026: M10 — getAllDemoBoughtPairs + mescla no clientOrderMap para incluir demos no retreinamento (2026-04-26)

**Decision:** `Neo4jRepository.getAllDemoBoughtPairs()` retorna todos os pares `{clientId, productId}` de edges `BOUGHT {is_demo: true}` em uma query batch. `ModelTrainer.train()` chama este método após `fetchTrainingData()` e mescla os pares no `clientOrderMap` antes de construir os tensores — com `try/catch` non-fatal idêntico ao padrão de `syncNeo4j`.

**Reason:** `fetchTrainingData()` busca pedidos exclusivamente do PostgreSQL — edges demo no Neo4j eram invisíveis ao retreinamento. Comitê de Design (5 personas) convergiu em Node B (query batch) por menor pressão de I/O vs Node A (N queries por cliente) e por preservar o isolamento `is_demo:true` que sustenta o `clearAllDemoBought` do M9-A (descartando Node C). Staff Engineering e QA Staff (2 personas) confirmaram o filtro `WHERE r.is_demo = true` explícito como non-negotiable para evitar inclusão acidental de edges sem o atributo.

**Status:** Accepted ✓ (ADR-026)

---

### AD-025: M9-B — useRetrainJob com jobIdRef para evitar stale closure no setInterval (2026-04-26)

**Decision:** `useRetrainJob` usa `jobIdRef = useRef<string | null>(null)` sincronizado com `jobId` state via `useEffect([jobId])`. O callback do `setInterval` lê `jobIdRef.current` (sempre o valor mais recente) em vez do valor capturado na closure.

**Reason:** `setInterval` callback captura o `jobId` no momento de criação — stale closure. Se React batcheia updates, o callback lê `null`. Staff Engineering High severity no Phase 4 da Design Complex UI. Padrão documentado em React docs como "escape hatch" para closures de timers.

**Status:** Accepted ✓ (ADR-025)

---

### AD-024: M9-B — Progress bar via transform scaleX em vez de width (2026-04-26)

**Decision:** `TrainingProgressBar` anima o progresso via `transform: scaleX(fraction)` com `transform-origin: left` em uma div fill de `width: 100%`. Usa `motion-safe:transition-transform duration-300 ease-out`. Modo indeterminado: `animate-pulse` no fill.

**Reason:** Animar `width` aciona layout → paint → composite a cada poll update (thrashing). `transform` é GPU-composited — sem recálculo de layout. Staff UI Designer High severity no Phase 4. Consistente com AD-017 (ReorderableGrid só anima `transform`).

**Status:** Accepted ✓ (ADR-024)

---

### AD-023: M9-B — AnalysisPanel always-mounted para preservar estado do retrain entre tabs (2026-04-26)

**Decision:** `AnalysisPanel` renderizado incondicionalmente em `page.tsx`. Visibilidade via Tailwind `hidden`/`block`. Container recebe `aria-hidden={activeTab !== 'analysis'}` para remover elementos ocultos da árvore de acessibilidade.

**Reason:** Render condicional `{activeTab === 'analysis' && <AnalysisPanel />}` destrói `useRetrainJob` state ao sair da aba — viola M9B-22. Padrão always-mounted já estabelecido em AD-018 (RAGDrawer). Phase 3 Self-Consistency convergiu em Node C via dois caminhos independentes.

**Status:** Accepted ✓ (ADR-023)

---

### AD-020: M8 nav quick fix — Abas Cliente/Recomendações removidas; aba Análise criada (2026-04-26)

**Decision:** As abas "Cliente" e "Recomendações" foram removidas do `TabNav`. Uma nova aba "📊 Análise" foi criada fundindo: (1) `ClientProfileCard` lendo de `useSelectedClient()`; (2) comparação "Sem IA vs Com IA" (`ShuffledColumn` + `RecommendedColumn`) lendo de `useRecommendations()`. A aba "Chat RAG" foi mantida (duplica o drawer, mas preserva acessibilidade via teclado sem exigir interação com o header). `ShuffledColumn` foi migrada de `useClient()` (Context antigo) para `useSelectedClient()` (domain hook do M8).

**Reason:** Com o M8, o cliente é selecionado na navbar e o fluxo de recomendação vive no catálogo. A aba "Cliente" passou a ser um card estático sem ação. A aba "Recomendações" redirecionava o usuário para outra aba (link broken UX). Fundir ambas em "Análise" elimina o impasse, mantém o valor pedagógico da comparação lado a lado, e antecipa a estrutura já prevista no roadmap para o M9-B (Deep Retrain Showcase).

**Status:** Accepted ✓ (Parecer do Comitê — decisão de quick fix documentada em M8)

---

### AD-017: M8 — FLIP animation sem flushSync no ReorderableGrid (2026-04-26)

**Decision:** `<ReorderableGrid>` usa padrão `prevPositionsRef` com dois `useLayoutEffect` consecutivos para FLIP animation — sem `flushSync`. Snapshot "First" é capturado via ref antes do render; transforms são aplicados e removidos via `requestAnimationFrame` para criar dois frames visuais distintos. Apenas `transform` é animado (GPU-composited). `@media (prefers-reduced-motion)` suportado via `motion-safe:transition-transform`.

**Reason:** `flushSync` dentro de `useLayoutEffect` é anti-pattern React 18 — causa double-render em StrictMode e warnings no commit phase (Principal SW Architect, High severity). CSS Grid `order` não é animável. Animar `top`/`left` causa layout thrashing (Node B, Phase 2, High severity).

**Status:** Accepted ✓ (ADR-017)

---

### AD-018: M8 — RAGDrawer always-mounted para preservar histórico de chat (2026-04-26)

**Decision:** `<RAGDrawer>` é renderizado incondicionalmente no `Header` (always-mounted); visibilidade controlada via prop `open` do Radix `Sheet`. `isOpen` boolean é estado local do `Header`. Histórico de chat permanece em `useState` local do `RAGChatPanel` — sem elevação para o store global. Focus trap e `returnFocus` delegados ao Radix Sheet (não suprimir `onOpenAutoFocus`).

**Reason:** Conditional render `{isOpen && <RAGDrawer />}` destrói o estado do chat ao fechar — viola M8-41 diretamente (QA Staff, High severity). Elevar `chatHistory` para `demoSlice` violaria SRP do slice.

**Status:** Accepted ✓ (ADR-018)

---

### AD-019: M8 — Zustand slices + domain hooks substituem React Contexts (2026-04-26)

**Decision:** Três Zustand slices compostos em `useAppStore`: `clientSlice` (persist `smr-client`), `recommendationSlice` (volátil, `loading` no slice), `demoSlice` (volátil). Cross-slice dependency via `subscribe` no store init (não `useEffect` em componente). Domain hooks `useSelectedClient`, `useRecommendations`, `useCatalogOrdering`, `useRecommendationFetcher` abstraem o shape do store. Cache de recomendações limitado a 1 entrada (`cachedForClientId`). `tailwindcss-animate` instalado para keyframes do Sheet.

**Reason:** React Contexts não suportam `persist`, cross-slice dependency sem `useEffect` manual, nem crescimento de slices sem novos Providers. Zustand elimina Provider wrappers e entrega todas as features com 1/5 do boilerplate do Redux.

**Impact:** `layout.tsx` remove `<ClientProvider>` e `<RecommendationProvider>`. `useClient()` e `useRecommendations()` existentes continuam funcionando via domain hooks compatíveis. Risco de hydration flash com `persist` — mitigado via `skipHydration` + `rehydrate()` no `useEffect` do `Header`.

**Status:** Accepted ✓ (ADR-019)

---

### AD-021: M9-A — Transação unificada Neo4j para createDemoBought + getEmbeddings (2026-04-26)

**Decision:** `createDemoBoughtAndGetEmbeddings(clientId, productId)` (e variantes delete/clear) executam MERGE/DELETE e SELECT de embeddings na mesma `session.executeWrite()` — escopo transacional único. `session.executeWrite()` ativa retry automático do driver Neo4j em deadlocks.

**Reason:** Dois `session.run()` separados criam timing gap: o MATCH de embeddings pode rodar antes que o MERGE anterior tenha sido visível, produzindo `profileVector` sem a compra demo e feedback visual incorreto (Staff Engineering High severity; QA Staff cold start M9A-32).

**Status:** Accepted ✓ (ADR-021)

---

### AD-022: M9-A — DELETE /demo-buy usa path params em vez de request body (2026-04-26)

**Decision:** `DELETE /api/v1/demo-buy/:clientId/:productId` (individual) e `DELETE /api/v1/demo-buy/:clientId` (bulk) sem body. Frontend chama sem `Content-Type`.

**Reason:** DELETE com body é ignorado silenciosamente por proxies e gateways — causaria `clientId`/`productId` ausentes e 400s não rastreáveis (Staff Engineering Medium severity).

**Status:** Accepted ✓ (ADR-022)

---



**Decision:** A feature "Demo Buy + Live Reorder" (M9) opera exclusivamente no espaço do **clientProfileVector** (mean-pooling dos embeddings), não no espaço dos pesos da rede neural. Ao clicar "Demo Comprar", o ai-service: (1) cria edge `BOUGHT {is_demo: true}` no Neo4j via `syncBoughtRelationships()`; (2) relê os embeddings via `getClientPurchasedEmbeddings()`; (3) recalcula `meanPooling()` em memória; (4) chama `recommend()` existente com o novo profileVector. O `ModelTrainer` não é alterado. Latência estimada: 180–350ms.

**Reason:** Retreinamento completo dura ~2min — inviável para feedback ao vivo. O profile vector incremental entrega 95% do valor visual com 5% do risco. Online learning via `model.trainOnBatch()` foi avaliado pelo Comitê (Sessão 002, Caminho G) e rejeitado por risco de catastrophic forgetting + thread safety no Fastify. O Deep Retrain completo (Sprint B) foi separado como feature independente (M9-B) que usa `POST /model/train` existente com tela de progresso ao vivo.

**Trade-off:** A demo não modifica os pesos da rede — o efeito é visível apenas para o cliente selecionado na sessão. Para aprendizado que beneficia todos os clientes com perfil similar, o retrain completo (Sprint B) é necessário.

**Impact:** Nova rota `POST /api/v1/demo-buy` e `DELETE /api/v1/demo-buy` no ai-service. Novo método `clearDemoBought(clientId)` no Neo4jRepository. Flag `is_demo: true` nas edges BOUGHT demo para isolamento e limpeza.

**Status:** Accepted ✓ (ToT + Self-Consistency 87% — Comitê Ampliado Sessão 002)

---

### AD-012: M8/M9 — Arquitetura frontend unificada com Zustand + componente de reordenação reutilizável (2026-04-26)

**Decision:** As features M8 (UX Journey Refactor) e M9 (Demo Buy) compartilham duas fundações de código que devem ser implementadas em Sprint 0 antes de qualquer feature: (1) **Zustand store** com slices `selectedClient` (persistente na navbar) e `demoState` (lista de compras demo por clientId, limpa automaticamente ao trocar de cliente); (2) **componente `<ReorderableGrid>`** reutilizável que recebe scores como parâmetro e executa a animação CSS de reordenação. O M8 usa o componente via botão "✨ Ordenar por IA" na toolbar; o M9 usa o mesmo componente via botão "Demo Comprar" no card.

**Reason:** Sem estado global do cliente, nenhuma feature de recomendação funciona em contexto de página única. Sem componente reutilizável, a animação seria implementada duas vezes com risco de divergência visual. A análise de conflitos entre os documentos do Comitê (Sessão 001 vs Sessão 002) identificou estas três tensões: (T1) dois gatilhos para a mesma animação — resolvida com componente único; (T2) `demoState` deve ser limpo ao trocar `selectedClient` — dependência explícita entre slices; (T3) aba "Análise" absorve tanto a comparação "Sem IA vs Com IA" (M8) quanto o botão de Deep Retrain (M9-B) — layout interno a ser definido no design.md do M9.

**Trade-off:** Sprint 0 adiciona ~3h de setup antes de qualquer entrega visível. Justificado pela eliminação de retrabalho nos sprints seguintes.

**Impact:** `frontend/src/store/` com `clientSlice.ts` + `demoSlice.ts`. `frontend/src/components/ReorderableGrid/` como componente independente. Query params `?client=&ai=on` na URL para deep link e testes automatizados (sugestão do Arquiteto Rafael Alves, Sessão 001).

**Status:** Accepted ✓ (Análise de conflitos entre documentos — Sessão 002)

---

### AD-011: M7 Production Readiness — backlog formalizado como próximo milestone (2026-04-25)

**Decision:** Os gaps operacionais identificados na análise pós-M6 (GAP-01: cron diário de retreinamento, GAP-02: sincronização automática de produtos novos com Neo4j) e os achados do Comitê de Arquitetura (#5: model versioning, #6: 202 + polling, #10: segurança básica) foram formalizados como features do milestone M7 — Production Readiness. O ROADMAP foi atualizado: M6 marcado como COMPLETE, M7 como PLANNED.

**Reason:** Sem GAP-02 o sistema opera com produtos "invisíveis" para RAG e recomendações assim que qualquer produto novo é cadastrado. Sem GAP-01 o modelo se torna obsoleto silenciosamente sem alertas acionáveis. Ambos os gaps têm severidade Alta para produção. Os achados do Comitê (#5, #6, #10) são pré-requisitos para um deploy público seguro.

**Trade-off:** Adiamos event-driven (Kafka) e fine-tuning para "Future Considerations" — a Solução B do GAP-02 (cron de `generateEmbeddings` com `embedding IS NULL`) é mais simples, já idempotente, e elimina o gap sem dependências externas.

**Impact:** GAP-02 deve ser o primeiro item a executar no M7 — zero pré-requisitos. GAP-01 depende do Achado #6 (202 + polling) para não bloquear o event loop. Achado #5 (model versioning) deve andar junto com GAP-01 pois ambos tocam ModelStore/ModelTrainer.

---

### D-001 — TypeScript for AI Service instead of Python
**Date:** 2026-04-23
**Decision:** Use TypeScript (Node.js 22 / Fastify) for the AI service instead of Python/FastAPI.
**Rationale:**
- The entire post-graduation course (`Engenharia de Software com IA Aplicada`) is TypeScript-first, taught by Erick Wendel (Google Developer Expert, Node.js core contributor).
- `exemplo-13-embeddings-neo4j-rag` already validates the full stack: `@langchain/community`, `@xenova/transformers`, Neo4j vector store, OpenRouter via `@langchain/openai`. This is 60–70% of the AI service already working.
- `@xenova/transformers` (Transformers.js) provides HuggingFace local embeddings with no API cost in Node.js.
- `@tensorflow/tfjs-node` handles the neural model training for the complexity required by this MVP.
- Developer velocity: Gabriel has deep TypeScript expertise. Python would add friction without technical benefit at this scope.
- Portfolio coherence: fewer runtimes to configure (Node.js + JVM instead of Node.js + JVM + Python).
**Tradeoff accepted:** Python has richer ML tooling (Keras, scikit-learn, PyTorch). If model architecture needs to grow beyond a dense network, Python becomes the correct choice.
**Status:** Accepted ✓

### D-002 — Java 21 / Spring Boot 3.3 for API Service
**Date:** 2026-04-23
**Decision:** Use Java 21 with Spring Boot 3.3 for the domain API layer.
**Rationale:**
- Gabriel's primary expertise; existing GitHub projects demonstrate ultra-scale backend (100M RPM patterns).
- Positions the project for two audiences: AI recruiters (see the TypeScript AI service) and backend/platform recruiters (see the Spring Boot service).
- Spring Boot 3.3 + virtual threads (Project Loom) provides near-Go performance for I/O-bound workloads without reactive complexity.
- Springdoc OpenAPI auto-generates Swagger UI — zero effort for API documentation.
- Spring Actuator + Micrometer provides production-grade observability out of the box.
**Tradeoff accepted:** Adds JVM to the stack, increasing Docker image size and cold start time. Acceptable for portfolio; documented in README.
**Status:** Accepted ✓

### D-003 — Neo4j as unified Graph + Vector Store
**Date:** 2026-04-23
**Decision:** Use Neo4j 5.x Community as both the graph database (product relationships) and vector store (product embeddings), instead of separating vector DB (Pinecone/Weaviate) and graph DB.
**Rationale:**
- `exemplo-13-embeddings-neo4j-rag` validates this exact pattern: LangChain `Neo4jVectorStore` with `addDocuments` and `similaritySearchWithScore`.
- Neo4j 5.x native vector indexes eliminate the need for a separate vector database.
- Graph structure (`BOUGHT`, `BELONGS_TO`, `AVAILABLE_IN`) enables future graph-augmented retrieval (multi-hop Cypher) without changing infrastructure.
- Single service to manage in Docker Compose (simpler for reproducibility).
- Community Edition is free; no licensing cost.
**Tradeoff accepted:** Neo4j Community lacks clustering and enterprise backup. Irrelevant for portfolio scope.
**Status:** Accepted ✓

### D-004 — Synthetic dataset (no real data)
**Date:** 2026-04-23
**Decision:** Use a fully synthetic dataset generated by a seed script; optionally enrich product descriptions from Open Food Facts (public domain).
**Rationale:**
- No proprietary data risk (BEES, Ambev, Nestlé, etc.).
- Seed script is versionable, reproducible, and idempotent — evaluators always get the same state.
- Synthetic data can be engineered to produce clear recommendation signals (purchase patterns that make semantic sense), making the demo more impressive and predictable.
**Open question:** Whether to use Open Food Facts API for real product descriptions or keep descriptions fully synthetic. Leaning toward synthetic for full reproducibility.
**Status:** Accepted ✓

### D-005 — Hybrid scoring formula (0.6 neural + 0.4 semantic)
**Date:** 2026-04-23
**Decision:** Final recommendation score = `0.6 * neuralScore + 0.4 * semanticScore`. Weights configurable via environment variable.
**Rationale:**
- Neural score has higher weight because it incorporates purchase behavior (stronger signal for recommendation).
- Semantic score (cosine similarity of client profile embedding vs product embedding) handles cold-start and new products not yet in training data.
- Configurable weights allow demonstrating different behaviors in the README without code changes.
**Status:** Accepted ✓ (may be revised after M4 implementation and qualitative testing)

### D-006 — Separação EMBEDDING_MODEL / LLM_MODEL + troca para Llama 3.2 3B
**Date:** 2026-04-25
**Decision:** Separar a variável `NLP_MODEL` em duas: `EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2` (HuggingFace local, sem API key) e `LLM_MODEL=meta-llama/llama-3.2-3b-instruct:free` (OpenRouter inference).
**Rationale:**
- `NLP_MODEL` servia dois propósitos distintos — embedding local e LLM remoto — que têm requisitos e providers completamente diferentes.
- Llama 3.2 3B supera Mistral 7B em benchmarks (MMLU Pro 34.7% vs 24.5%, contexto 128K vs 32K) enquanto sendo menor (2GB VRAM vs 5GB).
- Separação permite trocar cada modelo independentemente via env var sem mudança de código (validado em `exemplo-13`).
**Tradeoff accepted:** Llama 3.2 3B tem throughput menor (53 tok/s vs 169 tok/s do Mistral). Aceitável para demo.
**Status:** Accepted ✓

### D-008 — Neo4j driver singleton com sessions por operação e try/finally
**Date:** 2026-04-23
**Decision:** Instanciar o `neo4j-driver` Driver uma vez no startup; injetar no `Neo4jRepository`; cada método abre/fecha session em `try/finally`.
**Rationale:** Evita overhead de conexão por request e leak de sessions em caso de exceção (Staff Engineering + Principal SW Architect — High severity no committee review do Design Complex M3).
**Status:** Accepted ✓ (ADR-004)

### D-009 — Model warm-up no startup + separação /health (liveness) e /ready (readiness)
**Date:** 2026-04-23
**Decision:** `EmbeddingService.init()` antes de `fastify.listen()`; `/health` responde imediatamente; `/ready` responde quando `modelReady === true`.
**Rationale:** `@xenova/transformers` download (~90MB) causaria latência de 30-60s no primeiro request; separação liveness/readiness evita que Docker marque container como healthy antes do modelo estar pronto (Staff Engineering High + QA Staff Medium no committee review).
**Status:** Accepted ✓ (ADR-005)

### D-010 — Estrutura modular de camadas para o AI Service
**Date:** 2026-04-23
**Decision:** `src/config/` → `src/repositories/` → `src/services/` → `src/routes/` → `src/index.ts`; rotas via `fastify.register` com prefixo `/api/v1`.
**Rationale:** Extensibilidade para M4 sem refactor; testabilidade por injeção de dependência via constructor; SRP cumprido por camada (Principal SW Architect High no committee review).
**Status:** Accepted ✓ (ADR-003)

### D-007 — Client profile vector = mean of purchased product embeddings
**Date:** 2026-04-23
**Decision:** Represent a client's taste profile as the element-wise mean of the HuggingFace embeddings of all products they have purchased.
**Rationale:**
- Avoids sparse one-hot encoding used in `parte05` (which treats category/color as independent features).
- Dense 384-dim representation captures semantic product characteristics.
- Simple to compute, interpretable, and effective for small-to-medium purchase histories.
- Directly enables cosine similarity between client profile and candidate product embeddings.
**Tradeoff accepted:** Mean pooling loses purchase frequency information. Weighted mean by purchase quantity is a noted improvement for future work.
**Status:** Accepted ✓

---

## Blockers

_None at this time._

---

## Lessons Learned

### L-001 — parte05 bugs to avoid
**Source:** Exploration of `exemplo-01-ecommerce-recomendations-z/parte05`
- `events.js` has duplicate `onProgressUpdate` static method — second overrides first. Avoid duplicate event names in the new AI service.
- `clearAll()` called without `await` in `exemplo-13` creates race condition with `addDocuments`. Always `await` Neo4j operations sequentially in the seed script.
- `tf.dispose()` and `tf.tidy()` missing in `parte05` worker — causes memory growth on repeated training. Apply in `@tensorflow/tfjs-node` training loop.
- README port mismatch (8080 vs 3000) in `parte05`. Keep README in sync from day one.

### L-003 — M1 Infrastructure Lessons
**Source:** M1 Execute phase
- Neo4j 5.x image does NOT support auto-execution of Cypher init scripts via volume mount (unlike PostgreSQL's `/docker-entrypoint-initdb.d/`). The entrypoint tries to `chown` mounted directories and fails if they are read-only. Solution: apply constraints via the seed script using `CREATE CONSTRAINT IF NOT EXISTS`.
- Alpine-based Docker health checks: `wget -qO- http://localhost:PORT` fails in some containers because `localhost` doesn't resolve. Always use `127.0.0.1` explicitly in Docker health check commands.
- Next.js standalone mode binds to the container's network IP by default, not `0.0.0.0`. Set `HOSTNAME=0.0.0.0` in the Dockerfile ENV to make it accessible via `127.0.0.1` inside the container.
- Order seed data must use deterministic UUIDs (e.g., `uuid/v5` with a stable namespace) to guarantee idempotency across re-runs. `uuid/v4` generates random IDs that defeat `ON CONFLICT (id) DO NOTHING`.
- Port conflicts on developer machines: use non-standard host port mappings (e.g., `5433:5432`) with a `POSTGRES_HOST_PORT` env var to avoid conflicts with other running PostgreSQL instances.

### L-005 — Next.js 14 fetch cache em Route Handlers quebra polling de jobs assíncronos
**Source:** Bug fix — botão Retreinar preso (2026-04-26)
- Next.js 14 faz cache agressivo de respostas de `fetch()` em Route Handlers por padrão. Qualquer proxy de polling que não declare `cache: 'no-store'` congela a primeira resposta recebida e a repete indefinidamente.
- Sintoma: `POST /model/train` retornava `202 queued`, mas os polls subsequentes via proxy sempre retornavam o primeiro estado capturado (`running` sem epoch), nunca avançando para `done`. O backend treinava corretamente — o bug era exclusivamente no cache do proxy.
- Fix: adicionar `cache: 'no-store'` em todos os `fetch()` dentro de Route Handlers que servem dados mutáveis ou em tempo real (`/api/proxy/model/train/status/[jobId]`, `/api/proxy/model/status`, `/api/proxy/model/train`).
- Regra geral: qualquer proxy Next.js → serviço externo que retorna dados que mudam por request deve ter `cache: 'no-store'` explícito.

### L-004 — Next.js 14 ESLint version requirements
**Source:** M5 Execute — `npm run lint` setup
- `next lint` with Next.js 14 requires ESLint 8, NOT ESLint 9. Installing the latest `eslint` package pulls in ESLint 9 which causes incompatible CLI options errors.
- Always install `eslint@8` + `eslint-config-next@{NEXT_VERSION}` (pinned to exact Next.js version) together.
- `npx shadcn@latest init` is interactive and cannot be used with `--yes` alone; manually creating `components/ui/` files + `lib/utils.ts` with `clsx`/`tailwind-merge` is the reliable alternative.
- For Next.js 14 with Radix UI: install `@radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-select` directly; no additional shadcn CLI needed.

### L-002 — langchain import path in exemplo-13
**Source:** Exploration of `exemplo-13-embeddings-neo4j-rag`
- `RecursiveCharacterTextSplitter` imported from `langchain/text_splitter` but `langchain` (bare package) is not in `package.json` — may rely on transitive dependency. In the new AI service, import from `@langchain/textsplitters` (explicit scoped package) to avoid ambiguity.

---

## Todos

- [x] Specify M1 features (monorepo structure, seed, Neo4j schema) — spec.md created (28 reqs, M1-01..M1-28)
- [x] Design complex M1 — design.md + ADR-001 (seed strategy) + ADR-002 (Neo4j healthcheck) created
- [x] Break M1 into tasks — tasks.md created (21 tasks, 6 phases, 28/28 reqs mapped)
- [x] Execute M1 — all 21 tasks complete, all 5 services healthy, seed idempotent, 28/28 requirements met
- [x] Specify M2 features (Spring Boot API endpoints)
- [x] Execute M2 — 45 Java classes implemented (controllers/services/repositories/entities/config/exception), OpenAPI + Actuator + cache + recommendation fallback validated via runtime smoke tests
- [x] Specify M3 features (AI service embedding + RAG) — spec.md created (37 reqs, M3-01..M3-37)
- [x] Design complex M3 — design.md + ADR-003 (estrutura modular) + ADR-004 (driver singleton) + ADR-005 (warm-up + liveness/readiness) criados; 3 nós ToT, committee review com 3 personas, 6 findings incorporados
- [x] Break M3 into tasks — tasks.md (13 tasks, T0..T13)
- [x] Execute M3 — 13 tasks complete, tsc --noEmit clean, all 37 requirements met
- [x] Specify M4 features (neural model + hybrid recommendation) — spec.md criado (34 reqs, M4-01..M4-34)
- [x] Design complex M4 — design.md + ADR-006 (ModelStore atomic swap) + ADR-007 (batch predict tensor strategy) + ADR-008 (tf.tidy async boundary) criados; 3 nós ToT, committee review com 3 personas, 7 findings incorporados
- [x] Break M4 into tasks — tasks.md (9 tasks, T1..T9)
- [x] Execute M4 — 9 tasks complete, tsc --noEmit clean, 34/34 requirements verified ✅ COMPLETE
- [x] Specify M5 features (Next.js frontend) — spec.md criado (33 reqs, M5-01..M5-33)
- [x] Design M5 — design.md + ADR-001..ADR-004 criados
- [x] Break M5 into tasks — tasks.md (40 tasks, 8 phases, 33/33 reqs mapped)
- [x] Execute M5 — 40 tasks complete, `npm run build` ✓, `npm run lint` ✓ zero warnings, 33/33 requirements met
- [x] Specify M6 features (tests + README) — spec.md criado (35 reqs, M6-01..M6-35)
- [x] Design complex M6 — design.md + ADR-009 (Vitest DI mocking) + ADR-010 (xenova pre-download builder stage) + ADR-011 (Next.js standalone Dockerfile) criados; 3 nós ToT, committee review com 3 personas, 9 findings incorporados
- [x] Break M6 into tasks — tasks.md (19 tasks, 7 phases, 55+ reqs mapped)
- [x] Execute M6 — 19 tasks complete; 19 AI service tests (Vitest); 15 Java unit tests (JUnit 5); Testcontainers IT tests; multi-stage Dockerfiles; ai-model-data volume; bilingual README; CONTRIBUTING; ESLint ✓; Checkstyle ✓ 0 violations; M6 ✅ COMPLETE
- [x] Specify M7 features (production readiness) — spec.md criado (36 reqs, M7-01..M7-36); 5 features (GAP-02, async train, cron GAP-01, model versioning, security + E2E)
- [x] Design complex M7 — design.md + ADR-012 (TrainingJobRegistry) + ADR-013 (VersionedModelStore) + ADR-014 (admin key scoped plugin) + ADR-015 (AiSyncClient fire-and-forget) criados; 3 nós ToT, committee review com 3 personas, 8 findings incorporados
- [x] Break M7 into tasks — tasks.md criado (21 tarefas, 8 fases, 37/37 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M7 — 21 tasks complete; 42 AI service tests (Vitest: 19 existing + 23 new); 16 Java tests; ESLint ✓; Checkstyle 0 violations; Playwright E2E suite (search, recommend, rag); VersionedModelStore, TrainingJobRegistry, CronScheduler, adminRoutes, sync-product, AiSyncClient all implemented; M7 ✅ COMPLETE
- [x] Specify M8 — UX Journey Refactor (página única, client selector na navbar, "Ordenar por IA", RAG side drawer) — spec.md criado (55 reqs, M8-01..M8-55)
- [x] Design complex UI M8 — design.md (Approved) + ADR-017 (FLIP sem flushSync) + ADR-018 (RAGDrawer always-mounted) + ADR-019 (Zustand slices + domain hooks); 5 personas; 3 High findings incorporados
- [x] Break M8 into tasks — tasks.md criado (14 tarefas, 6 fases, 55/55 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M8 — 14 tasks complete; Zustand store (3 slices) + 4 domain hooks + ReorderableGrid (FLIP ADR-017) + ClientSelectorDropdown + RAGDrawer (always-mounted ADR-018) + ScoreBadge + CatalogPanel toolbar + Header wiring + layout.tsx Providers removed + ClientPanel read-only + RecommendationPanel banner + sonner toasts + E2E m8-ux-journey.spec.ts; `npm run build` ✓; ESLint ✓ 0 warnings; M8 ✅ COMPLETE
- [x] M8 nav quick fix — abas Cliente/Recomendações removidas; nova aba Análise (ClientProfileCard + comparação Sem IA vs Com IA); ShuffledColumn migrada para useSelectedClient; antecipa estrutura prevista no M9-B; `npm run build` ✓; ESLint ✓
- [x] Specify M9-A — Demo Buy + Live Reorder (profile vector incremental, nova rota demo-buy) — spec.md criado (33 reqs, M9A-01..M9A-33); 3 rotas mapeadas; componentes existentes reutilizáveis identificados; latência estimada 160–230ms
- [x] Design Complex M9-A — design.md (Approved) + ADR-021 (write transaction unificada Neo4j) + ADR-022 (DELETE path params); DemoBuyService + recommendFromVector() + 3 métodos Neo4jRepository; demoSlice loading state; 4 committee findings incorporados; 3 ToT nodes; committee review 3 personas
- [x] Break M9-A into tasks — tasks.md criado (9 tarefas, 4 fases, 33/33 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M9-A — 9 tasks complete; DemoBuyService + recommendFromVector + Neo4jRepository (createDemoBoughtAndGetEmbeddings, deleteDemoBoughtAndGetEmbeddings, clearAllDemoBoughtAndGetEmbeddings) + demoBuyRoutes (ADR-022) + demoSlice loading state + ProductCard demo buttons/badge + CatalogPanel wiring (handlers + Limpar Demo toolbar) + 3 Next.js proxy routes + E2E m9a-demo-buy.spec.ts; ClientNotFoundError moved to Neo4jRepository; 63 AI tests (Vitest); `npm run build` ✓; ESLint ✓ 0 warnings; `tsc --noEmit` ✓; M9-A ✅ COMPLETE
- [x] Specify M9-B — Deep Retrain Showcase — spec.md criado (32 reqs, M9B-01..M9B-32); 6 stories P1/P2/P3; 4 novos componentes (RetrainPanel, TrainingProgressBar, ModelMetricsComparison, useRetrainJob); 0 mudanças de backend; layout integrado na aba "Análise"
- [x] Design M9-B — design.md (Approved) + ADR-023 (AnalysisPanel always-mounted) + ADR-024 (progress bar scaleX) + ADR-025 (jobIdRef stale closure); 3 proxy routes; lib/adapters/train.ts; 8 committee findings incorporados
- [x] Break M9-B into tasks — tasks.md criado (9 tarefas, 4 fases, 32/32 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M9-B — 9 tasks complete; lib/types.ts (5 tipos M9-B) + lib/adapters/train.ts + 3 proxy routes + useRetrainJob hook (ADR-025 jobIdRef, polling backoff, circuit-breaker 3 erros) + TrainingProgressBar (ADR-024 scaleX) + ModelMetricsComparison + RetrainPanel + AnalysisPanel lg:grid-cols-2 + mobile Tabs + page.tsx always-mounted ADR-023 + E2E m9b-deep-retrain.spec.ts; npm run build ✓; ESLint ✓ 0 warnings; M9-B ✅ COMPLETE
- [x] M10 — Demo-Retrain Integration — Neo4jRepository.getAllDemoBoughtPairs() + ModelTrainer mescla demos no clientOrderMap (ADR-026); compras demo feitas antes do retreinamento agora participam do tensor de treino
- [x] Break M11 into tasks — tasks.md criado (8 tarefas, 4 fases, 27/27 reqs mapeados); Granularity ✅, Diagram-Definition ✅, Test Co-location ✅
- [x] Execute M11 — 8/8 tasks complete; training-utils.ts (buildTrainingDataset + hard negative mining N=4 + seed LCG + upsampling fallback + 9 unit tests) + ModelTrainer (Dense[64, relu, l2(1e-4)]→Dropout[0.2]→Dense[1], EPOCHS=30, BATCH_SIZE=16, early stopping patience=5, seedFromClientIds, ADR-027/028) + analysisSlice.ts (4-phase discriminated union: empty|initial|demo|retrained, 4 actions, ADR-029) + RecommendationColumn.tsx (empty/loading/populated, colorScheme gray/blue/emerald/violet, capturedAt, fade-in animation, ADR-030) + AnalysisPanel (snapshot orchestration: captureInitial/captureDemo/captureRetrained via useEffect chains, xl:grid-cols-4 + md:grid-cols-2 + accordion + mobile stacked, lifted useRetrainJob shared with RetrainPanel) + RetrainPanel (disabled when phase=empty, M11-26, optional retrainJob prop) + useAppStore (analysisSlice composed, resetAnalysis() encadeado no setSelectedClient, ADR-029) + E2E m11-ai-learning-showcase.spec.ts (7 testes: initial/demo/retrain/disable/reset/accordion/mobile); ESLint ✓ 0 warnings; npm run build ✓; 72 AI tests (Vitest); M11 ✅ COMPLETE

---

## Deferred Ideas

- **Remoção de `spring-boot-starter-webflux` do api-service:** `AiSyncClient` foi reescrito com `java.net.http.HttpClient` (ADR-015 revisado). Resta `AiServiceClient.recommend()` como único consumidor do `WebClient`. Reescrevê-lo com `java.net.http.HttpClient` eliminaria o `spring-boot-starter-webflux` do classpath, removendo o Netty como dependência transitiva e reduzindo o modelo mental do projeto para servlet puro + virtual threads. **Endereçar em M9 como primeira task técnica (pre-feature cleanup).**

- **`StructuredTaskScope` para paralelismo awaitable intra-request:** Avaliado pelo Comitê como alternativa ao `Thread.ofVirtual().start()` em `AiSyncClient` e rejeitado — `StructuredTaskScope` requer `scope.join()` antes de fechar o scope, bloqueando o thread pai. É incompatível com fire-and-forget por design (JEP 453/480). O caso de uso correto no projeto seria: montar DTOs compondo múltiplas fontes de dados em paralelo dentro do mesmo request — ex: `productRepo.findById()` + `reviewRepo.findByProductId()` em paralelo com `ShutdownOnFailure`. Endereçar quando houver call site com N resultados awaitable paralelos. Nota: `StructuredTaskScope` era Preview no Java 21; Feature somente no Java 23 — requer atenção ao `java.version` do `pom.xml`.

- **Graph-augmented RAG:** Use multi-hop Cypher traversal (e.g., "find products bought by clients who also bought X") as additional context for the RAG pipeline. Neo4j graph structure supports this without schema changes. Deferred to post-MVP.

- **Fine-tuning HuggingFace + Benchmarking comparativo (M4 ou pós-MVP):** Explorar fine-tuning de um modelo HuggingFace existente (ex: `sentence-transformers/all-MiniLM-L6-v2` ou `distilbert-base-uncased`) no domínio de produtos do catálogo, e comparar sistematicamente contra o modelo neural treinado com TensorFlow.js (M4). A ideia central é ter um endpoint de benchmarking (`POST /api/v1/benchmark`) que executa um mesmo conjunto de queries de recomendação nos dois modelos e retorna métricas comparativas (Precision@K, nDCG, latência p50/p95). O fine-tuning via HuggingFace `transformers` + `datasets` exige Python — isso abre uma decisão arquitetural: manter o fine-tuning em um script Python separado (offline, gera artefato `.bin`) e servir o resultado via `@xenova/transformers` no AI Service (ONNX export), ou adicionar um microserviço Python para servir o modelo fine-tuned. Deferred para exploração pós-M4, quando o modelo TensorFlow.js estiver treinado e os dados de comparação fizerem sentido. Ver D-001 (decisão TypeScript vs Python) — essa feature pode ser o ponto onde Python entra justificadamente no stack.

- **Kafka async recommendations:** Pre-compute recommendations asynchronously when a new order is placed. Demonstrates event-driven architecture. Deferred to post-MVP.

- **Precision@K / nDCG evaluation endpoint:** Expose recommendation quality metrics as a dedicated API endpoint. Important for production but deferred for MVP. _(Precision@K adicionada como M6-53/54 na fase de treino — este item refere-se ao endpoint dedicado de benchmarking contínuo)_

- **Open Food Facts enrichment:** Use Open Food Facts public API to enrich synthetic product descriptions with real nutritional data. Optional enrichment, deferred.

- **Live cloud deploy:** Deploy to Railway/Render/Fly.io for a public URL in the README. High portfolio impact, deferred until M6 is complete.

- **Model versioning com rollback (Comitê Achado #5):** Salvar modelos com timestamp (`/tmp/model/model-{timestamp}.json`) e manter o último "melhor" modelo como symlink. Permite rollback quando um novo treino produz qualidade inferior. Requer critério de comparação automático (ex: `precisionAt5` do novo modelo vs modelo atual). Severidade: Média. Pré-requisito: M6-53 (Precision@K implementado).

- **Job assíncrono para POST /model/train — padrão 202 + polling (Comitê Achado #6):** Treino síncrono bloqueia o cliente HTTP durante todo o processamento (~9s com 1040 amostras, minutos com 100K). Em produção, proxies (nginx, ALB) têm timeout de 60s. Solução: `POST /model/train` retorna `202 Accepted` com `jobId`, `GET /model/train/status/{jobId}` consulta o progresso. Compatível com a implementação atual do `ModelStore`. Severidade: Média. Pré-condição: dataset grande o suficiente para o timeout ser relevante.

- **p-limit concurrency no fetchAllPages de orders (Comitê Achado #7):** `Promise.all` sobre 1000 clientes dispara 1000 requests HTTP simultâneos para o `api-service`. Pode sobrecarregar o connection pool do Spring Boot ou causar `ECONNRESET`. Solução: `import pLimit from 'p-limit'; const limit = pLimit(10)` antes do `Promise.all`. Com os 20 clientes atuais, sem impacto prático. Severidade: Baixa. Endereçar quando o dataset crescer.

- **Weighted mean pooling por frequência de compra (Comitê Achado #3):** O perfil do cliente é calculado como média aritmética dos embeddings. Um produto comprado 50x tem o mesmo peso que um comprado 1x. Solução: ponderar cada embedding pelo `quantity` do pedido — `clientProfile = Σ(embedding_i × quantity_i) / Σ(quantity_i)`. Requer buscar `quantity` das edges `:BOUGHT` no Neo4j. Severidade: Baixa. Melhoria de qualidade do modelo pós-MVP.

- **Autenticação no endpoint POST /model/train (Comitê Achado #10):** Qualquer cliente que conhece a URL pode retreinar o modelo ou causar carga excessiva. Solução: header `X-Admin-Key` validado contra env var `ADMIN_API_KEY`, ou JWT com role `admin`. Na rede interna Docker do MVP, risco irrelevante. Severidade: Baixa. Endereçar antes de qualquer exposição pública.

- **Online learning via `model.trainOnBatch()` para compras individuais (M9 — Sessão 002, Caminho G — Rejeitado):** Avaliado pelo Comitê Ampliado como alternativa para "aprendizado em tempo real" sem retreinamento completo. Rejeitado por dois riscos: (1) *catastrophic forgetting* — `trainOnBatch()` com uma única amostra sobrescreve o aprendizado generalizado da rede, degradando recomendações para outros clientes; (2) *thread safety* — TensorFlow.js usa um backend global; chamadas concorrentes de Fastify sem lock podem corromper o estado interno dos tensores. O padrão seguro para produção seria uma fila de treinamento serial (um job por vez), que converge para o padrão 202 + async já deferido (Comitê Achado #6). Deferred indefinidamente — risco supera o benefício para o escopo de demonstração.

- **Animação de reordenação com física (M8 — Sessão 001, Sugestão UI Designer):** O UI Designer Léa Santana sugeriu Framer Motion `layout` prop para a animação de reordenação dos cards após "Ordenar por IA". O sprint do M8 pode usar CSS transitions simples (`transform: translate`, `transition: transform 500ms ease`) para entregar o efeito visual sem nova dependência; Framer Motion pode ser adicionado se a animação CSS revelar limitações em cards que mudam de coluna no grid. Deferred para pós-M8.

- **Query params `?client=&ai=on` para deep link e testes (M8/M9 — Sessão 001, Sugestão Arquiteto Rafael):** Serializar o estado da UI na URL permite compartilhar links e simplifica asserções nos testes Playwright (`await page.goto('/catalog?client=1&ai=on')`). Verificar qual roteador o projeto usa (App Router vs Pages Router) antes de implementar `useSearchParams` ou `router.push({ shallow: true })`. Deferred para o design.md do M8.

- **Aba "Análise" — layout interno a ser definido no design.md do M9-B (Tensão T3 — Sessão 002):** O documento de UX (Sessão 001) propõe a aba "Análise" para comparar "Sem IA vs Com IA". O Feature Committee (Sessão 002) reusa a mesma aba para o botão "Deep Retrain + progresso ao vivo". Resolução aprovada: a aba contém ambos os painéis (comparação à esquerda, controles de retrain à direita em tela grande; tabs empilhadas em mobile). Layout exato a ser definido no `design.md` do M9-B, referenciando os dois documentos de comitê como contexto.

- **Cron diário de retreinamento automático (GAP-01):** O modelo neural fica desatualizado silenciosamente após novos pedidos serem criados. O `staleDays` e `staleWarning` foram implementados no M6 como observabilidade passiva — o sistema avisa que está velho, mas nenhum mecanismo reage automaticamente. Retreinar a cada compra é incorreto (custo computacional, catastrophic forgetting, race conditions); o padrão correto para sistemas B2B é retreinamento em batch diário. Solução: cron interno no `ai-service` (ex: `node-cron`) disparando `modelTrainer.train()` em background todo dia às 02h. Pré-condição: implementar o padrão 202 + async (Comitê Achado #6) para que o cron não bloqueie o event loop. Os dois itens se encaixam: o cron precisa do treino assíncrono; o treino assíncrono precisa de um disparador que não seja manual. Severidade: Média-Alta para produção. Pré-requisito: Comitê Achado #6 (202 + polling).

- **Sincronização automática de produtos novos com Neo4j + embeddings (GAP-02):** Produto cadastrado via `POST /products` no `api-service` é salvo apenas no PostgreSQL. O Neo4j não recebe o nó novo e nenhum embedding é gerado, tornando o produto invisível para busca semântica, RAG e recomendações até que o operador chame manualmente `POST /embeddings/generate`. Diferente do GAP de `:BOUGHT` (resolvido no M6-45), este gap não foi documentado em nenhum ADR, spec ou task. Solução A (simples): `api-service` chama `POST /aiservice/api/v1/embeddings/generate` após salvar produto — síncrono mas frágil se o ai-service estiver fora. Solução B (robusta): cron no ai-service que roda `generateEmbeddings()` periodicamente (só processa produtos com `embedding IS NULL` — já idempotente). Solução C (event-driven): evento `product.created` via Kafka — convergente com D-03. Severidade: Alta para funcionalidade de IA. Pré-requisito: nenhum.

---

## Preferences

- Language for specs and documentation: Portuguese (README bilingual pt-BR / en)
- Commit message style: conventional commits (`feat:`, `fix:`, `chore:`, `docs:`)
- Branch strategy: `main` (stable) + `feat/milestone-name` per milestone

---

## Repository

- **GitHub:** `git@github-gabrielgrillorosa:gabrielgrillorosa/smart-marketplace-recommender.git`
- **URL:** `https://github.com/gabrielgrillorosa/smart-marketplace-recommender`
- **SSH host alias:** `github-gabrielgrillorosa` (via `~/.ssh/config`, chave `id_ed25519`)
- **Visibility:** Public (portfolio)
