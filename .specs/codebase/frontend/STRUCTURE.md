# Structure — Frontend
**Serviço:** frontend (Next.js 14 / App Router)
**Analisado:** 2026-04-26

---

## Árvore de diretórios

```
frontend/
├── app/
│   ├── api/
│   │   └── proxy/
│   │       ├── recommend/route.ts    ← proxy → AI Service /recommend
│   │       ├── search/route.ts       ← proxy → AI Service /search/semantic
│   │       └── rag/route.ts          ← proxy → AI Service /rag/query
│   ├── globals.css
│   ├── layout.tsx                    ← providers + metadata
│   └── page.tsx                      ← root page, activeTab state
│
├── components/
│   ├── catalog/
│   │   ├── CatalogPanel.tsx          ← busca produtos, gerencia filtros
│   │   ├── CategoryIcon.tsx
│   │   ├── ProductCard.tsx
│   │   ├── ProductDetailModal.tsx
│   │   ├── ProductFilters.tsx
│   │   ├── ProductGrid.tsx
│   │   └── SemanticSearchBar.tsx
│   ├── chat/
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ContextChunks.tsx
│   │   ├── ExamplePrompts.tsx
│   │   └── RAGChatPanel.tsx
│   ├── client/
│   │   ├── ClientPanel.tsx           ← busca clientes, dispara recomendações
│   │   ├── ClientProfileCard.tsx
│   │   ├── ClientSelector.tsx
│   │   └── RecommendButton.tsx
│   ├── layout/
│   │   ├── Header.tsx                ← health badges
│   │   ├── ServiceStatusBadge.tsx
│   │   └── TabNav.tsx
│   ├── recommendations/
│   │   ├── EmptyState.tsx
│   │   ├── FallbackBanner.tsx
│   │   ├── RecommendationCard.tsx
│   │   ├── RecommendationPanel.tsx
│   │   ├── RecommendationSkeleton.tsx
│   │   ├── RecommendedColumn.tsx
│   │   ├── ScoreTooltip.tsx
│   │   └── ShuffledColumn.tsx
│   └── ui/                           ← shadcn/ui (manual install)
│       ├── badge.tsx
│       ├── card.tsx
│       ├── dialog.tsx
│       ├── select.tsx
│       ├── skeleton.tsx
│       └── tooltip.tsx
│
├── e2e/
│   ├── playwright.config.ts
│   └── tests/
│       ├── rag.spec.ts
│       ├── recommend.spec.ts
│       └── search.spec.ts
│
├── lib/
│   ├── adapters/
│   │   ├── rag.ts
│   │   ├── recommend.ts              ← mais complexo: multi-format defensive
│   │   └── search.ts
│   ├── contexts/
│   │   ├── ClientContext.tsx
│   │   └── RecommendationContext.tsx
│   ├── hooks/
│   │   └── useServiceHealth.ts
│   ├── utils/
│   │   └── shuffle.ts                ← LCG seeded shuffle
│   ├── fetch-wrapper.ts
│   ├── types.ts                      ← DTOs canônicos
│   └── utils.ts                      ← cn() helper
│
├── next.config.js
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── Dockerfile
```

## Mapeamento capacidades → locais

| Capacidade | Localização |
|---|---|
| Estado global (cliente selecionado) | `lib/contexts/ClientContext.tsx` |
| Estado global (recomendações) | `lib/contexts/RecommendationContext.tsx` |
| DTOs e tipos canônicos | `lib/types.ts` |
| HTTP com error handling | `lib/fetch-wrapper.ts` |
| Adaptadores upstream → DTO | `lib/adapters/` |
| Saúde dos serviços (polling) | `lib/hooks/useServiceHealth.ts` |
| Shuffle determinístico | `lib/utils/shuffle.ts` |
| Proxy CORS para AI Service | `app/api/proxy/` |
| Layout e navegação por tabs | `components/layout/` + `app/page.tsx` |
| Catálogo + busca semântica | `components/catalog/` |
| Seleção de cliente + perfil | `components/client/` |
| Comparação Sem IA vs Com IA | `components/recommendations/` |
| Chat RAG | `components/chat/` |
| Testes E2E | `e2e/` |
