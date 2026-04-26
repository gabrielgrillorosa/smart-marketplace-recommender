# Stack — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Core

- **Framework:** Next.js 14.2.5 (App Router)
- **Language:** TypeScript 5.5.3
- **Runtime:** Node.js (via Next.js standalone)
- **Package manager:** npm

## Frontend

- **UI Framework:** React 18.3.1 + React DOM 18.3.1
- **Styling:** Tailwind CSS 3.4.6 + PostCSS 8.4.39 + Autoprefixer 10.4.19
- **Component Library:** Radix UI primitives (@radix-ui/react-dialog 1.1.15, @radix-ui/react-select 2.2.6, @radix-ui/react-tooltip 1.2.8) + shadcn/ui manual install
- **Icon Library:** lucide-react 1.11.0
- **State Management:** React Context (ClientContext + RecommendationContext) — sem Redux, sem Zustand
- **HTTP Client:** `fetch` nativo do browser / Node.js — sem Axios
- **Markdown rendering:** react-markdown 8.0.7 (usado no RAG chat)
- **CSS utilities:** clsx 2.1.1 + tailwind-merge 3.5.0 + class-variance-authority 0.7.1

## Testing

- **E2E:** Playwright 1.59.1 (`@playwright/test`)
- **Unit/Component:** não instalado — sem Vitest, sem Jest, sem Testing Library
- **Coverage:** não configurado

## Build & Tooling

- **Linter:** ESLint 8.57.1 + eslint-config-next 14.2.5
- **Type checking:** `tsc` via `next build`
- **Bundler:** Next.js built-in (Webpack / Turbopack)
- **Output mode:** `standalone` (configurado em next.config.js)

## Variáveis de ambiente relevantes

| Variável | Default dev | Descrição |
|---|---|---|
| `AI_SERVICE_URL` | `http://localhost:3001` | URL do ai-service para as API Routes proxy |
| `API_SERVICE_URL` | não usada diretamente | serviço Java acessado via `/backend/*` rewrite |

## Scripts npm

```
dev     → next dev
build   → next build
start   → next start
lint    → next lint
test:e2e → playwright test --config e2e/playwright.config.ts
```
