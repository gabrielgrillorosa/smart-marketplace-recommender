# M3 — AI Service Specification

## Problem Statement

O sistema de recomendação precisa de inteligência semântica: capacidade de entender produtos por significado (não só por categoria), buscar por linguagem natural, e responder perguntas sobre o catálogo. Sem isso, as recomendações são baseadas apenas em histórico de compras sem compreensão do conteúdo dos produtos. O M3 ativa a camada de embeddings e RAG que transforma o catálogo de dados em conhecimento consultável.

## Goals

- [ ] Todos os produtos têm representação vetorial (embedding 384 dims) armazenada no Neo4j
- [ ] Busca semântica retorna produtos semanticamente relevantes para queries em linguagem natural
- [ ] RAG pipeline responde perguntas sobre o catálogo com respostas fundamentadas no contexto recuperado
- [ ] O AI Service está operacional como serviço Fastify com health check funcional
- [ ] Todos os endpoints são consumíveis pelo api-service (Spring Boot) e pelo frontend (Next.js)

## Out of Scope

| Feature | Reason |
| --- | --- |
| Modelo neural (collaborative filtering) | M4 — requer embeddings prontos como pré-requisito |
| Endpoint `/recommend` híbrido | M4 — depende do modelo neural treinado |
| Treinamento de modelo (`/model/train`) | M4 |
| Interface gráfica para busca | M5 — frontend separado |
| Autenticação/autorização nos endpoints | Fora do escopo do MVP |
| Rate limiting e retry policies | M6 — qualidade de produção |
| Testes unitários e de integração formais | M6 — abordado separadamente |

---

## User Stories

### P1: Servidor Fastify Operacional ⭐ MVP

**User Story**: Como desenvolvedor, quero que o AI Service inicie como um servidor HTTP Fastify com health check, para que outros serviços e o Docker Compose possam verificar que ele está vivo.

**Why P1**: Pré-requisito de infraestrutura para todos os outros endpoints. Sem servidor rodando, nada mais funciona.

**Acceptance Criteria**:

1. WHEN o container `ai-service` inicia THEN o servidor Fastify SHALL escutar na porta `3001` (configurável via `PORT` env var)
2. WHEN `GET /health` é chamado THEN sistema SHALL retornar `{ status: "ok", service: "ai-service" }` com HTTP 200
3. WHEN o servidor inicia com sucesso THEN sistema SHALL logar `AI Service listening on port 3001`
4. WHEN uma variável de ambiente obrigatória está ausente THEN sistema SHALL lançar erro descritivo no startup e encerrar com código 1
5. WHEN `docker compose up` é executado THEN o healthcheck do Docker SHALL passar após no máximo 30 segundos

**Independent Test**: `curl http://localhost:3001/health` retorna `{ status: "ok" }` após `docker compose up`.

---

### P1: Pipeline de Geração de Embeddings ⭐ MVP

**User Story**: Como engenheiro de dados, quero gerar embeddings vetoriais para todos os produtos e armazená-los no Neo4j, para que a busca semântica e o modelo neural possam operar sobre representações densas dos produtos.

**Why P1**: Todos os outros recursos de M3 (busca semântica, RAG) e M4 (modelo neural) dependem dos embeddings estarem disponíveis.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/embeddings/generate` é chamado THEN sistema SHALL usar `@xenova/transformers` com modelo `sentence-transformers/all-MiniLM-L6-v2` (384 dims) para gerar embeddings de todos os produtos
2. WHEN o embedding de um produto é gerado THEN sistema SHALL concatenar `name + " " + description + " " + category` como texto de entrada antes de embedar
3. WHEN um produto já possui a propriedade `embedding` no Neo4j THEN sistema SHALL pular esse produto (idempotência)
4. WHEN o pipeline processa produtos THEN sistema SHALL logar progresso a cada 10 produtos processados: `[X/N] Produto "nome" embedado`
5. WHEN todos os produtos são processados THEN sistema SHALL criar (ou recriar se existir) o vector index `product_embeddings` no Neo4j com similaridade cosine e dimensão 384
6. WHEN o pipeline completa THEN sistema SHALL retornar `{ generated: N, skipped: M, indexCreated: true }` com HTTP 200
7. WHEN ocorre erro de conexão com Neo4j THEN sistema SHALL retornar HTTP 503 com mensagem de erro descritiva
8. WHEN o pipeline é executado em lote THEN sistema SHALL processar em batches de 10 para não estourar memória

**Independent Test**: Após `POST /api/v1/embeddings/generate`, o Neo4j Browser mostra `MATCH (p:Product) WHERE p.embedding IS NOT NULL RETURN count(p)` com valor igual ao total de produtos.

---

### P1: Busca Semântica ⭐ MVP

**User Story**: Como usuário da API, quero buscar produtos por texto em linguagem natural (ex: "bebida sem açúcar para o café da manhã") e receber produtos rankeados por relevância semântica, para que a busca vá além do match exato de palavras-chave.

**Why P1**: Demonstra o valor central do AI Service — inteligência semântica sobre o catálogo. É o diferencial técnico visível de M3.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/search/semantic` é chamado com `{ query: string, limit: number }` THEN sistema SHALL gerar embedding do query e executar busca por similaridade cosine no Neo4j vector index `product_embeddings`
2. WHEN a busca retorna resultados THEN sistema SHALL filtrar apenas produtos com score cosine > 0.5
3. WHEN `filters.country` é fornecido THEN sistema SHALL aplicar filtro `(:Product)-[:AVAILABLE_IN]->(:Country {code: country})` na query Cypher
4. WHEN `filters.category` é fornecido THEN sistema SHALL aplicar filtro `(:Product)-[:BELONGS_TO]->(:Category {name: category})` na query Cypher
5. WHEN a busca retorna produtos THEN sistema SHALL retornar array ordenado por score decrescente com campos: `id`, `name`, `description`, `category`, `price`, `sku`, `score`
6. WHEN nenhum produto supera o threshold de 0.5 THEN sistema SHALL retornar array vazio `[]` com HTTP 200
7. WHEN `limit` não é fornecido THEN sistema SHALL usar default de 10
8. WHEN o vector index `product_embeddings` não existe THEN sistema SHALL retornar HTTP 503 com mensagem `"Embedding index not found. Run POST /api/v1/embeddings/generate first."`

**Independent Test**: `POST /api/v1/search/semantic` com `{ "query": "refrigerante sem açúcar", "limit": 5 }` retorna produtos da categoria `beverages` com score > 0.5, sem produtos de limpeza ou cuidado pessoal.

---

### P1: RAG Pipeline ⭐ MVP

**User Story**: Como usuário, quero fazer perguntas em linguagem natural sobre o catálogo de produtos (ex: "Quais produtos sem açúcar estão disponíveis no México?") e receber respostas fundamentadas no contexto real do catálogo, para que eu possa explorar o catálogo sem conhecer categorias ou SKUs.

**Why P1**: É o endpoint mais impressionante do M3 para avaliadores e recrutadores. Demonstra RAG end-to-end: embeddings + vector search + LLM + grounded answer.

**Acceptance Criteria**:

1. WHEN `POST /api/v1/rag/query` é chamado com `{ query: string }` THEN sistema SHALL executar o pipeline: embed query → vector search Neo4j (topK=5, threshold > 0.5) → construir contexto → chamar LLM → retornar resposta estruturada
2. WHEN o LLM é chamado THEN sistema SHALL usar OpenRouter com modelo `mistralai/mistral-7b-instruct:free` via `@langchain/openai` com `baseURL: https://openrouter.ai/api/v1`
3. WHEN o contexto é construído THEN sistema SHALL formatar cada produto recuperado como: `- [name] (SKU: sku, Categoria: category, Preço: R$ price): description`
4. WHEN o prompt é enviado ao LLM THEN sistema SHALL usar template que instrui responder em pt-BR ou en (detectando o idioma da query), responder apenas com base no contexto fornecido, e responder "Não encontrei produtos que correspondam à sua pergunta." se o contexto for insuficiente
5. WHEN a resposta é retornada THEN sistema SHALL incluir: `{ answer: string, sources: [{ id, name, score }] }` onde `sources` lista os produtos usados como contexto
6. WHEN nenhum produto supera o threshold de 0.5 THEN sistema SHALL retornar `{ answer: "Não encontrei produtos que correspondam à sua pergunta.", sources: [] }` sem chamar o LLM
7. WHEN `OPENROUTER_API_KEY` não está configurada THEN sistema SHALL retornar HTTP 503 com mensagem `"LLM not configured. Set OPENROUTER_API_KEY env var."`
8. WHEN o LLM retorna erro (timeout, rate limit) THEN sistema SHALL retornar HTTP 502 com mensagem de erro e os `sources` recuperados do Neo4j

**Independent Test**: `POST /api/v1/rag/query` com `{ "query": "Quais produtos sem açúcar estão disponíveis no México?" }` retorna resposta em pt-BR citando produtos reais do catálogo com `sources` não vazio.

---

### P2: Configuração de Variáveis de Ambiente

**User Story**: Como engenheiro de operações, quero que todas as configurações sensíveis e de ambiente sejam injetadas via variáveis de ambiente, para que o serviço seja portável entre ambientes (local, CI, produção).

**Why P2**: Necessário para funcionamento correto em Docker Compose, mas não bloqueia demo manual com valores hardcoded temporários.

**Acceptance Criteria**:

1. WHEN o serviço inicia THEN sistema SHALL ler as seguintes env vars: `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `OPENROUTER_API_KEY`, `PORT`, `NLP_MODEL`
2. WHEN `NLP_MODEL` não está definida THEN sistema SHALL usar default `sentence-transformers/all-MiniLM-L6-v2`
3. WHEN `PORT` não está definida THEN sistema SHALL usar default `3001`
4. WHEN `NEO4J_URI`, `NEO4J_USER` ou `NEO4J_PASSWORD` não estão definidas THEN sistema SHALL logar aviso mas não encerrar (Neo4j lazy connect)

**Independent Test**: Iniciar o serviço com `PORT=3002` e verificar que `GET http://localhost:3002/health` responde.

---

### P2: Integração com Docker Compose

**User Story**: Como desenvolvedor, quero que o AI Service seja um serviço de primeira classe no `docker-compose.yml`, para que `docker compose up` suba tudo de uma vez, incluindo o AI Service pronto para receber requisições.

**Why P2**: Necessário para o demo completo do projeto, mas não bloqueia desenvolvimento local com `ts-node`.

**Acceptance Criteria**:

1. WHEN `docker compose up` é executado THEN o serviço `ai-service` SHALL depender de `neo4j` com `service_healthy`
2. WHEN o Dockerfile do ai-service é construído THEN SHALL usar multi-stage build: stage `builder` (compila TypeScript) + stage `runner` (node:22-alpine com apenas `dist/` e `node_modules` de produção)
3. WHEN o container inicia THEN a porta `3001` SHALL ser mapeada para `3001` no host
4. WHEN o health check é executado THEN SHALL usar `wget -qO- http://127.0.0.1:3001/health` (não `localhost`)
5. WHEN o `docker-compose.yml` é atualizado THEN SHALL incluir `OPENROUTER_API_KEY` como variável de ambiente passada do `.env`

**Independent Test**: `docker compose up ai-service` seguido de `docker compose ps` mostra `ai-service` com status `healthy`.

---

## Edge Cases

- WHEN `POST /api/v1/search/semantic` recebe `query` vazia (`""`) THEN sistema SHALL retornar HTTP 400 com `"query is required and must be non-empty"`
- WHEN `POST /api/v1/rag/query` recebe `query` com mais de 1000 caracteres THEN sistema SHALL truncar para 1000 caracteres antes de embedar
- WHEN Neo4j está offline durante uma requisição THEN sistema SHALL retornar HTTP 503 com mensagem `"Neo4j unavailable"`
- WHEN `limit` em `/search/semantic` é maior que 50 THEN sistema SHALL limitar a 50 resultados
- WHEN `limit` em `/search/semantic` é menor que 1 THEN sistema SHALL retornar HTTP 400
- WHEN o modelo `@xenova/transformers` ainda não foi baixado (primeira execução) THEN sistema SHALL logar download progress e aguardar — não retornar erro prematuro
- WHEN dois requests simultâneos chamam `POST /api/v1/embeddings/generate` THEN sistema SHALL processar normalmente (idempotência garante resultado correto)

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| M3-01 | P1: Servidor Fastify — porta configurável | Design | Pending |
| M3-02 | P1: Servidor Fastify — GET /health responde 200 | Design | Pending |
| M3-03 | P1: Servidor Fastify — log de startup | Design | Pending |
| M3-04 | P1: Servidor Fastify — falha em env ausente | Design | Pending |
| M3-05 | P1: Servidor Fastify — healthcheck Docker passa | Design | Pending |
| M3-06 | P1: Embeddings — modelo all-MiniLM-L6-v2 384 dims | Design | Pending |
| M3-07 | P1: Embeddings — concatenação name+description+category | Design | Pending |
| M3-08 | P1: Embeddings — idempotência (pula se embedding existe) | Design | Pending |
| M3-09 | P1: Embeddings — log de progresso a cada 10 produtos | Design | Pending |
| M3-10 | P1: Embeddings — cria vector index product_embeddings | Design | Pending |
| M3-11 | P1: Embeddings — retorna { generated, skipped, indexCreated } | Design | Pending |
| M3-12 | P1: Embeddings — HTTP 503 em falha Neo4j | Design | Pending |
| M3-13 | P1: Embeddings — batch de 10 | Design | Pending |
| M3-14 | P1: Busca Semântica — vector search cosine no Neo4j | Design | Pending |
| M3-15 | P1: Busca Semântica — threshold > 0.5 | Design | Pending |
| M3-16 | P1: Busca Semântica — filtro country via Cypher | Design | Pending |
| M3-17 | P1: Busca Semântica — filtro category via Cypher | Design | Pending |
| M3-18 | P1: Busca Semântica — resposta ordenada por score | Design | Pending |
| M3-19 | P1: Busca Semântica — array vazio quando abaixo do threshold | Design | Pending |
| M3-20 | P1: Busca Semântica — default limit=10 | Design | Pending |
| M3-21 | P1: Busca Semântica — HTTP 503 se index não existe | Design | Pending |
| M3-22 | P1: RAG — pipeline completo embed→search→context→LLM | Design | Pending |
| M3-23 | P1: RAG — OpenRouter + Mistral 7B instruct free | Design | Pending |
| M3-24 | P1: RAG — formato de contexto (name, SKU, category, price, description) | Design | Pending |
| M3-25 | P1: RAG — prompt template multilíngue pt-BR/en | Design | Pending |
| M3-26 | P1: RAG — resposta inclui { answer, sources } | Design | Pending |
| M3-27 | P1: RAG — resposta "Não encontrei" sem chamar LLM quando sources vazio | Design | Pending |
| M3-28 | P1: RAG — HTTP 503 quando OPENROUTER_API_KEY ausente | Design | Pending |
| M3-29 | P1: RAG — HTTP 502 em erro do LLM, inclui sources | Design | Pending |
| M3-30 | P2: Env vars — leitura de todas as variáveis | Design | Pending |
| M3-31 | P2: Env vars — defaults para NLP_MODEL e PORT | Design | Pending |
| M3-32 | P2: Env vars — aviso (não crash) para Neo4j vars ausentes | Design | Pending |
| M3-33 | P2: Docker — depends_on neo4j service_healthy | Design | Pending |
| M3-34 | P2: Docker — multi-stage Dockerfile | Design | Pending |
| M3-35 | P2: Docker — porta 3001 mapeada | Design | Pending |
| M3-36 | P2: Docker — healthcheck usa 127.0.0.1 | Design | Pending |
| M3-37 | P2: Docker — OPENROUTER_API_KEY no compose | Design | Pending |

**Coverage:** 37 total, 37 mapped, 0 unmapped ✓

---

## Success Criteria

- [ ] `GET /health` retorna HTTP 200 após `docker compose up`
- [ ] `POST /api/v1/embeddings/generate` processa todos os produtos e o Neo4j Browser confirma `embedding` property em todos os `Product` nodes
- [ ] `POST /api/v1/search/semantic` com `{ "query": "refrigerante sem açúcar", "limit": 5 }` retorna ≥1 produto de `beverages` com score > 0.5
- [ ] `POST /api/v1/rag/query` com `{ "query": "Quais produtos sem açúcar estão disponíveis no México?" }` retorna resposta textual em pt-BR com `sources` não vazio
- [ ] `docker compose ps` mostra `ai-service` com status `healthy`
- [ ] O endpoint `/api/v1/recommend/{clientId}` do api-service (M2) consegue chamar o AI Service e receber resposta válida (integração ponta-a-ponta)
