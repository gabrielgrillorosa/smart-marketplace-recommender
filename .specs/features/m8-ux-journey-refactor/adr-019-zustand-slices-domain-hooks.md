# ADR-019: Zustand Slices com Domain Hooks para Substituir React Contexts

**Status**: Accepted
**Date**: 2026-04-26

## Context

O frontend do M5 usa dois React Contexts para estado global: `ClientContext` (cliente selecionado) e `RecommendationContext` (lista de recomendações + loading + isFallback). Os Contexts funcionam mas têm limitações para o M8/M9:

1. **Sem persistência**: `ClientContext` não persiste entre reloads — o cliente selecionado se perde ao recarregar a página.
2. **Sem limpeza automática entre slices**: quando o cliente muda, as recomendações do cliente anterior não são limpas automaticamente — requer lógica manual em cada componente que observa o cliente.
3. **Provider coupling**: `layout.tsx` precisa dos `<ClientProvider>` e `<RecommendationProvider>` wrappers; qualquer novo slice de estado exige novo Provider no layout.
4. **M8/M9 precisam de um terceiro slice** (`demoSlice`) que tem dependência explícita com `clientSlice` — difícil de modelar com Contexts sem `useEffect` de sincronização manual.

O `RecommendationContext` também mistura estado com lógica de orquestração (o `setLoading`/`setRecommendations` são chamados por múltiplos consumidores de formas distintas) — violação de SRP identificada pelo Comitê.

## Decision

Substituir os dois React Contexts por **três Zustand slices** compostos em um store único, acessados via **domain hooks** que abstraem o shape do store:

**Slices:**
- `clientSlice` — `selectedClient: Client | null`, `persist` middleware (chave `smr-client`) para sobreviver reloads; `setSelectedClient` chama `clearDemoForClient` automaticamente via `subscribe` cross-slice antes de atualizar.
- `recommendationSlice` — `recommendations[]`, `loading`, `isFallback`, `ordered`, `cachedForClientId`; estado puro serializável sem lógica de fetch.
- `demoSlice` — `demoBoughtByClient: Record<clientId, productId[]>`, `chatHistory: Message[]`; sem persist (volátil de sessão).

**Domain hooks** (extraídos por Principal SW Architect — Medium advisory incorporado):
- `useSelectedClient()` — acessa `clientSlice`; componentes não importam `useAppStore` diretamente.
- `useRecommendations()` — acessa `recommendationSlice`.
- `useCatalogOrdering()` — `{ ordered, setOrdered, reset }` do `recommendationSlice`.
- `useRecommendationFetcher()` — encapsula `apiFetch` + escreve no `recommendationSlice`; toda lógica de I/O fica aqui, fora do slice.

**Cross-slice dependency** (Tensão T2 — AD-012): implementada via `subscribe` no store initialization, não via `useEffect` em componente:

```typescript
// store/index.ts
useAppStore.subscribe(
  (state) => state.selectedClient,
  (newClient, prevClient) => {
    if (prevClient?.id && newClient?.id !== prevClient.id) {
      useAppStore.getState().clearDemoForClient(prevClient.id);
      useAppStore.getState().clearRecommendations();
    }
  }
);
```

## Alternatives considered

- **Manter React Contexts**: não resolve persistência, não suporta cross-slice dependency sem `useEffect` manual, exige novo Provider para cada slice novo (M9 precisaria de um quarto). Eliminado por insuficiência técnica para os requisitos M8/M9.
- **Redux Toolkit**: resolve todos os problemas mas adiciona boilerplate significativo (slices com `createSlice`, reducers, dispatchers, selectors) para um projeto de demo. Zustand entrega o mesmo resultado com 1/5 do código. Eliminado por over-engineering para o escopo.
- **Zustand sem domain hooks** (store acessado diretamente por todos os componentes): funciona, mas acopla todos os componentes ao shape concreto do store — qualquer rename de campo quebra todos os consumidores. Principal SW Architect identificou como violação de DIP (Medium). Incorporado como advisory: domain hooks são implementados.

## Consequences

- `layout.tsx` remove `<ClientProvider>` e `<RecommendationProvider>` — sem Provider wrappers; Zustand não requer Provider.
- `clientSlice` com `persist` usa `localStorage` — em SSR (Next.js App Router), o valor inicial no servidor será `null`; o cliente hidrata com o valor persistido, causando potencial flash de "sem cliente selecionado" antes da hidratação. Mitigação: `useAppStore` com `shallow` selector + `useEffect` que lê o store após hidratação; ou `skipHydration: true` no persist config com `rehydrate()` manual no `useEffect` do `Header`.
- Cache de recomendações limitado a 1 entrada (`cachedForClientId: string | null`) — trocar de cliente invalida o cache automaticamente via `subscribe`. Sem crescimento unbounded da sessão.
- `useRecommendationFetcher` contém toda a lógica de fetch — testável de forma isolada com mock do `apiFetch` e mock do store; o `recommendationSlice` é estado puro serializável e não precisa de mocks de fetch para ser testado.
