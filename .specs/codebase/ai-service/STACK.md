# Stack — AI Service
**Serviço:** ai-service (TypeScript / Fastify / Node.js 22)
**Analisado:** 2026-04-26

---

## Core

- **Framework:** Fastify 4.28.0
- **Language:** TypeScript 5.5.0
- **Runtime:** Node.js 22 (ts-node 10.9.2 para dev)
- **Package manager:** npm
- **Build:** `tsc` → `dist/`

## IA / ML

| Biblioteca | Versão | Propósito |
|---|---|---|
| `@xenova/transformers` | 2.17.2 | Embeddings HuggingFace locais (sentence-transformers/all-MiniLM-L6-v2, 384 dims) |
| `@huggingface/transformers` | 3.8.1 | Versão mais recente (coexiste com @xenova) |
| `@tensorflow/tfjs-node` | 4.22.0 | Treino da rede neural + inferência (backend global C++) |
| `@langchain/community` | 0.3.0 | Neo4jVectorStore (busca vetorial) |
| `@langchain/core` | 0.3.80 | Base do LangChain |
| `@langchain/openai` | 0.3.0 | LLM via OpenRouter (ChatOpenAI apontando para OpenRouter) |

## Banco de dados / Infra

| Biblioteca | Versão | Propósito |
|---|---|---|
| `neo4j-driver` | 5.24.0 | Graph + vector store (driver singleton) |
| `pg` | 8.12.0 | PostgreSQL (leitura de pedidos para treino) |

## HTTP / CORS

| Biblioteca | Versão | Propósito |
|---|---|---|
| `fastify` | 4.28.0 | HTTP server |
| `@fastify/cors` | 9.0.1 | CORS permissivo para dev |

## Agendamento

| Biblioteca | Versão | Propósito |
|---|---|---|
| `node-cron` | 4.2.1 | Cron diário de retreinamento (02h) |
| `cron-parser` | 5.5.0 | Parsing de expressões cron |

## Utilitários

| Biblioteca | Versão | Propósito |
|---|---|---|
| `uuid` | 10.0.0 | Geração de UUIDs para jobIds |

## Testing

| Biblioteca | Versão | Propósito |
|---|---|---|
| `vitest` | 4.1.5 | Test runner |
| `@vitest/coverage-v8` | 4.1.5 | Coverage via V8 |

## Linting / Build

| Ferramenta | Versão |
|---|---|
| ESLint | 10.2.1 |
| @typescript-eslint/eslint-plugin | 8.59.0 |
| @typescript-eslint/parser | 8.59.0 |

## Variáveis de ambiente

| Variável | Default | Obrigatória |
|---|---|---|
| `NEO4J_URI` | — | Sim |
| `NEO4J_USER` | — | Sim |
| `NEO4J_PASSWORD` | — | Sim |
| `API_SERVICE_URL` | `''` | Para treino |
| `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | Não |
| `LLM_MODEL` | `meta-llama/llama-3.2-3b-instruct:free` | Não |
| `OPENROUTER_API_KEY` | — | Para RAG |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1` | Não |
| `NEURAL_WEIGHT` | `0.6` | Não |
| `SEMANTIC_WEIGHT` | `0.4` | Não |
| `ADMIN_API_KEY` | — | Para admin routes |
| `PORT` | `3001` | Não |

## Scripts npm

```
start    → ts-node src/index.ts
dev      → ts-node src/index.ts
build    → tsc
seed     → ts-node src/seed/seed.ts
test     → vitest run
test:watch → vitest
lint     → eslint 'src/**/*.ts'
```
