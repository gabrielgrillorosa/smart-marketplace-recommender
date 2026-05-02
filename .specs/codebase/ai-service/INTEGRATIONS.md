# Integrations — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Neo4j 5.x (Graph + Vector Store)

**Propósito:** Armazenamento de grafos (Product, Client, BOUGHT, BELONGS_TO, AVAILABLE_IN) e busca vetorial (embeddings)
**Implementação:** `src/repositories/Neo4jRepository.ts`
**Driver:** `neo4j-driver` 5.24.0 — singleton instanciado em `src/index.ts`, injetado via constructor
**Session pattern:** Uma session por operação, fechada em `finally`
**Vector index:** `product_embeddings` (cosine similarity, 384 dims)
**Configuração:** `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`

Operações principais:
- `generateEmbeddings()` — gera embeddings para todos os produtos sem embedding (`WHERE p.embedding IS NULL`)
- `syncNeo4j()` — sincroniza pedidos do PostgreSQL via api-service HTTP
- `getClientWithCountry()` / `getPurchasedProductIds()` / `getClientPurchasedEmbeddings()`
- `getCandidateProducts(country, excludeIds)` — produtos disponíveis no país do cliente, não comprados
- `syncBoughtRelationships()` — usado por ModelTrainer para atualizar edges BOUGHT

Recomendações híbridas expostas em `POST /api/v1/recommend` e `POST /api/v1/recommend/from-cart` (vetor de perfil = compras confirmadas ± itens do carrinho). A API legada `demo-buy` foi removida do código; arestas `BOUGHT {is_demo: true}` antigas podem permanecer no Neo4j até limpeza manual — ver `scripts/neo4j-delete-demo-bought-edges.cypher` e `.specs/project/STATE.md` (secção Ops).

## @xenova/transformers (Embeddings locais)

**Propósito:** Geração de embeddings semânticos sem API key
**Modelo:** `sentence-transformers/all-MiniLM-L6-v2` (384 dimensões, ~90MB download no primeiro boot)
**Implementação:** `src/services/EmbeddingService.ts`
**Warm-up:** `embeddingService.init()` antes de `fastify.listen()` — garante que o modelo está carregado antes de aceitar tráfego
**Liveness/Readiness:** `/health` responde imediatamente; `/ready` responde `503` enquanto `embeddingService.isReady === false`

## @tensorflow/tfjs-node (Neural model)

**Propósito:** Treino e inferência da rede neural de recomendação
**Arquitetura:** `[product_embedding(384) + client_profile(64)] → Dense(256,relu) → Dense(128,relu) → Dense(64,relu) → Dense(1,sigmoid)`
**Backend:** C++ nativo (libtensorflow) — backend **global** ao processo Node.js
**Risco:** Chamadas concorrentes de inferência em diferentes requests Fastify podem causar contenção no backend TF.js global
**Mitigação atual:** `tf.tidy()` gerencia memória de tensores; boundary async/sync documentado (ADR-008)

## @langchain/community — Neo4jVectorStore

**Propósito:** Busca por similaridade vetorial no Neo4j para o pipeline RAG e busca semântica
**Implementação:** `SearchService.ts` e `RAGService.ts`
**Pattern:** `Neo4jVectorStore.fromExistingIndex()` com `embeddingNodeProperty: 'embedding'`

## OpenRouter via @langchain/openai

**Propósito:** LLM para geração de resposta no RAG
**Modelo:** `meta-llama/llama-3.2-3b-instruct:free` (default; configurável via `LLM_MODEL`)
**Implementação:** `RAGService.ts` usa `ChatOpenAI` com `openAIApiKey: OPENROUTER_API_KEY` e `configuration.baseURL: OPENROUTER_BASE_URL`
**Configuração:** `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`

## API Service (Java :8080)

**Propósito:** Fonte de dados de pedidos para treino do modelo
**Implementação:** `ModelTrainer.ts` faz HTTP GET `${API_SERVICE_URL}/api/v1/clients` e `/orders` para construir o dataset de treino
**Também:** `AiSyncClient` Java notifica o ai-service em `POST /api/v1/embeddings/sync-product` quando produto novo é criado

## node-cron

**Propósito:** Retreinamento automático diário
**Schedule:** `'0 2 * * *'` (02h00 UTC)
**Implementação:** `CronScheduler.ts` → `trainingJobRegistry.enqueue()` → job assíncrono
