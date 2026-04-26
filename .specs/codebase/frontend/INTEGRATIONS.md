# Integrations — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## API Service (Java / Spring Boot :8080)

**Propósito:** Fonte de dados de clientes, produtos e pedidos
**Implementação:** Chamadas diretas do browser via rewrite no `next.config.js`
**Path rewrite:** `/backend/*` → `http://api-service:8080/*` (Docker) / `http://localhost:8080/*` (dev)
**Autenticação:** nenhuma (demo público)

Endpoints consumidos diretamente pelo browser:
- `GET /backend/api/v1/clients?size=100` — `ClientPanel.tsx`
- `GET /backend/api/v1/clients/{id}` — não usado diretamente (dados vêm do seed)
- `GET /backend/actuator/health` — `useServiceHealth.ts` (polling a cada 30s)

## AI Service (TypeScript / Fastify :3001)

**Propósito:** Busca semântica, recomendações híbridas, RAG chat
**Implementação:** Chamadas passam obrigatoriamente pelo proxy Next.js (CORS — ai-service não expõe CORS para o browser)
**Proxy layer:** `app/api/proxy/` → Route Handlers server-side

| Proxy route | Upstream | Adaptador |
|---|---|---|
| `POST /api/proxy/search` | `POST http://ai-service:3001/api/v1/search/semantic` | `lib/adapters/search.ts` |
| `POST /api/proxy/recommend` | `POST http://ai-service:3001/api/v1/recommend` | `lib/adapters/recommend.ts` |
| `POST /api/proxy/rag` | `POST http://ai-service:3001/api/v1/rag/query` | `lib/adapters/rag.ts` |

URL configurada via env `AI_SERVICE_URL` (default: `http://localhost:3001`). **Nota:** `route.ts` de recommend usa `AI_SERVICE_URL` mas chama `/api/v1/recommend` no ai-service diretamente (não via api-service Java). O AI Service implementa a rota de recomendação.

Health check: `GET /aibackend/ready` — rewrite `/aibackend/*` → ai-service (configurado em `next.config.js`)

## shadcn/ui

**Propósito:** Componentes de UI base (Card, Badge, Tooltip, Dialog, Select, Skeleton)
**Implementação:** Instalação manual — arquivos copiados para `components/ui/`
**Dependências:** Radix UI primitives (`@radix-ui/react-dialog`, `@radix-ui/react-select`, `@radix-ui/react-tooltip`)
**Versioning:** Componentes são estáticos no repositório — atualizações manuais

## Tailwind CSS

**Propósito:** Styling utility-first
**Configuração:** `tailwind.config.ts` + `postcss.config.mjs`
**Integração com shadcn:** variáveis CSS em `globals.css` para theming (cores, border-radius)

## react-markdown

**Propósito:** Renderizar respostas do LLM em formato Markdown no chat RAG
**Localização:** `components/chat/ChatMessage.tsx`
**Versão:** 8.0.7

## Playwright (E2E)

**Propósito:** Testes de integração end-to-end contra a aplicação rodando
**Configuração:** `e2e/playwright.config.ts`
**Requer:** todos os serviços Docker rodando na porta 3000
