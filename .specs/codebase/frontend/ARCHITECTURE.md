# Architecture — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Padrão arquitetural

**Single-page com tabs** — `app/page.tsx` é a única rota; mantém `activeTab` state e renderiza condicionalmente um dos 4 painéis. Não há sub-rotas no App Router. A navegação é puramente client-side por troca de estado local.

## Diagrama de alto nível

```
Browser
├── app/layout.tsx          → <ClientProvider><RecommendationProvider>
│   └── app/page.tsx        → activeTab state + <Header> + <TabNav> + painel ativo
│       ├── <CatalogPanel>      ← tab 'catalog'
│       ├── <ClientPanel>       ← tab 'client'
│       ├── <RecommendationPanel> ← tab 'recommendations'
│       └── <RAGChatPanel>      ← tab 'chat'
│
├── app/api/proxy/          → Next.js Route Handlers (server-side proxy)
│   ├── recommend/route.ts  → POST → AI Service /api/v1/recommend
│   ├── recommend/from-cart/route.ts → POST → AI Service /api/v1/recommend/from-cart
│   ├── search/route.ts     → POST → AI Service /api/v1/search/semantic
│   └── rag/route.ts        → POST → AI Service /api/v1/rag/query
│
└── lib/
    ├── types.ts            → DTOs canônicos
    ├── fetch-wrapper.ts    → apiFetch() com ApiError
    ├── contexts/           → ClientContext + RecommendationContext
    ├── adapters/           → search.ts, recommend.ts, rag.ts
    ├── hooks/              → useServiceHealth.ts
    └── utils/              → shuffle.ts (LCG seeded)
```

## Padrão de estado global

Dois React Contexts definidos em `lib/contexts/`, fornecidos em `app/layout.tsx`:

**ClientContext** (`lib/contexts/ClientContext.tsx`)
- Shape: `{ selectedClient: Client | null, setSelectedClient }`
- Escopo: toda a aplicação via Provider em layout.tsx
- Persistência: memória de sessão — limpo no reload

**RecommendationContext** (`lib/contexts/RecommendationContext.tsx`)
- Shape: `{ recommendations, loading, isFallback, setRecommendations, setLoading, clearRecommendations }`
- Escopo: toda a aplicação
- Dependência implícita: `ClientPanel.handleClientChange()` chama `clearRecommendations()` antes de `setSelectedClient()` — **acoplamento funcional não capturado pelo tipo**

## Padrão de proxy (CORS resolution)

O frontend não chama os serviços externos diretamente. Todas as chamadas ao AI Service passam por Next.js Route Handlers em `app/api/proxy/`:

```
Browser → POST /api/proxy/recommend
        → Route Handler (server-side)
        → apiFetch → AI Service :3001/api/v1/recommend
        → adaptRecommendations()
        → NextResponse.json(dto)
```

O API Service (Java :8080) é chamado diretamente do browser via rewrite configurado em `next.config.js` (`/backend/*` → `http://api-service:8080/*`). Confirmado em `useServiceHealth.ts`: `checkEndpoint('/backend/actuator/health')`.

O catálogo em modo **«Ordenar por IA»** com itens no carrinho usa também `POST /api/proxy/recommend/from-cart` (ranking com pooling do carrinho; alinhado à coluna «Com Carrinho» do showcase). Ver [ADR-073](../../features/m18-catalog-simplified-ad055/adr-073-catalog-live-reorder-with-cart.md) e [INTEGRATIONS](./INTEGRATIONS.md).

## Padrão de adaptadores

Cada API Route usa um adaptador em `lib/adapters/` para transformar a resposta upstream no DTO canônico. Os adaptadores são **defensive** — lidam com múltiplos formatos de resposta possíveis (ex: `recommend.ts` aceita `recommendations[]`, `products[]`, ou array direto). Isso indica que houve evolução da API upstream durante o desenvolvimento.

## Fluxo de dados principal (recomendação)

```
1. ClientPanel.handleClientChange(client)
   → clearRecommendations()          [RecommendationContext]
   → setSelectedClient(client)       [ClientContext]

2. RecommendButton.onClick()
   → setLoading(true)
   → POST /api/proxy/recommend { clientId }
   → adaptRecommendations(raw)
   → setRecommendations(results, isFallback)
   → setLoading(false)

3. RecommendationPanel (reactive)
   → lê useRecommendations()
   → renderiza ShuffledColumn + RecommendedColumn
```

## Sem roteamento de páginas

`TabId = 'catalog' | 'client' | 'recommendations' | 'chat'` — estado local em `page.tsx`. O URL permanece `/` independente da tab ativa. Não há `useSearchParams` ou `router.push` — os query params `?client=&ai=on` foram deferidos (ver STATE.md).
