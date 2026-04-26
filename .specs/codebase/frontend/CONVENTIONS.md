# Conventions — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Nomenclatura de arquivos

| Tipo | Padrão | Exemplos reais |
|---|---|---|
| Componente React | PascalCase + `.tsx` | `CatalogPanel.tsx`, `ProductCard.tsx`, `RecommendationSkeleton.tsx` |
| Hook customizado | `use` + PascalCase + `.ts` | `useServiceHealth.ts` |
| Contexto | PascalCase + `Context.tsx` | `ClientContext.tsx`, `RecommendationContext.tsx` |
| Adaptador | camelCase + `.ts` | `recommend.ts`, `search.ts`, `rag.ts` |
| Utilitário | camelCase + `.ts` | `shuffle.ts`, `utils.ts`, `fetch-wrapper.ts` |
| Tipo canônico | `types.ts` (único arquivo) | `lib/types.ts` |
| API Route (Next.js) | `route.ts` em pasta com nome do endpoint | `app/api/proxy/recommend/route.ts` |

## Nomenclatura de componentes e funções

- Componentes exportados como **named exports** (não default): `export function CatalogPanel()`, `export function ClientSelector()`
- Hooks retornam objeto nomeado: `return { apiStatus, aiStatus }`
- Context exports seguem par `Provider + useHook`: `ClientProvider` + `useClient`
- Funções utilitárias em camelCase: `seededShuffle`, `apiFetch`, `adaptRecommendations`

## Diretiva `'use client'`

Padrão observado: **todos os componentes interativos têm `'use client'` no topo**. Exemplos:
- `lib/contexts/ClientContext.tsx` → `'use client'`
- `lib/hooks/useServiceHealth.ts` → `'use client'`
- `components/client/ClientPanel.tsx` → `'use client'`
- `app/page.tsx` → `'use client'`

API Routes (`app/api/`) são Server Components por padrão — **sem** `'use client'`.

## Padrão de imports

Todos os imports usam path alias `@/` configurado pelo Next.js:
```ts
import type { Client } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { useClient } from '@/lib/contexts/ClientContext';
```
Sem imports relativos (`../`) nos componentes — apenas nas definições internas de lib.

Ordem observada: imports de framework/library → imports locais de lib → imports de componentes irmãos.

## Tipagem

- Interfaces para contratos de componente e DTOs: `interface ClientContextValue`, `interface RawRecommendItem`
- `type` para unions e aliases: `type ServiceStatus = 'up' | 'down' | 'unknown'`, `type TabId = 'catalog' | 'client' | 'recommendations' | 'chat'`
- Props de componente tipadas inline ou como interface local (sem arquivo separado de tipos por componente)
- `export interface` em `lib/types.ts` para DTOs canônicos compartilhados entre componentes e API Routes

## Error handling

- `fetch-wrapper.ts` define `ApiError extends Error` com `status: number` — lançado em respostas não-ok
- Componentes capturam erros com `try/catch` em `useEffect` ou handlers: `setError('mensagem')` → renderiza `<div className="text-red-700">`
- API Routes retornam `NextResponse.json({ error: message }, { status: 502 })` em falha upstream
- Sem React Error Boundaries — erros não capturados propagam para o Next.js default error page

## Padrão CSS / Tailwind

- Classes Tailwind inline no JSX — sem arquivos `.module.css`
- `cn()` utilitário de `lib/utils.ts` para classes condicionais (clsx + tailwind-merge)
- shadcn/ui components em `components/ui/` com variantes via `class-variance-authority`
- Paleta: `gray-*` para texto neutro, `blue-600` para ativo/primário, `green-700` para IA, `red-*` para erros
