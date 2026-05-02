# ADR-073: Catálogo em modo IA — reordenação em tempo quase real com o carrinho (from-cart)

**Status:** Accepted  
**Data:** 2026-05-01  
**Contexto:** `smart-marketplace-recommender/frontend` — `CatalogPanel`, `useRecommendationFetcher`, proxy `POST /api/proxy/recommend/from-cart` → `ai-service` `POST /api/v1/recommend/from-cart`. Alinha ao showcase cart-aware (M14 / coluna «Com Carrinho» em `AnalysisPanel`).

## Contexto

Após **«✨ Ordenar por IA»**, o catálogo passava a consumir sobretudo `POST /api/v1/recommend` (perfil do cliente). Ao **adicionar ou remover** itens no carrinho, a **intenção de sessão** muda: o *backend* já expõe `recommendFromCart` (pooling de embeddings dos produtos no carrinho) para a coluna de análise, mas a **grelha do catálogo** não reflectia essa actualização até nova acção (ex. mudança de filtros que alterasse a chave de pedido).

## Decisão

1. **Fonte de ranking com carrinho não vazio:** quando existem `productId` no carrinho do cliente seleccionado, o fetch de recomendações para o modo ordenado SHALL usar **`/api/proxy/recommend/from-cart`** com `productIds` (ordenados no cliente para chave estável) e o mesmo `limit` da janela de ranking (`resolveShowcaseRankingWindow` + `requestedLimit`).

2. **Carrinho vazio (modo IA activo):** manter **`/api/proxy/recommend`** — equivalente ao ranking global do cliente sem contexto de carrinho.

3. **Chave de sessão / store:** o `requestKey` materializado no `recommendationSlice` (via `buildCoverageMeta`) SHALL incorporar assinatura do carrinho — p.ex. sufixo `|cart:<id1,id2,...>` em `catalogRequestKey` em `CatalogPanel` — para que mudanças no carrinho impliquem novo pedido e estado coerente, sem reutilizar cache de uma sessão sem carrinho.

4. **UX e performance:** debounce **~200 ms** após alteração do carrinho para reduzir rajadas; **AbortController** no início de cada fetch em `useRecommendationFetcher` para cancelar respostas obsoletas. Actualizações **automáticas** por carrinho SHALL **não** mostrar toast de sucesso (`silent: true`); o clique manual em **«Ordenar por IA»** mantém feedback positivo.

5. **Não duplicar semântica:** a mesma rota e contrato usados em `AnalysisPanel` / `recommend/from-cart` — um único significado de “perfil de sessão” = carrinho actual.

## Consequências

- **Positivas:** alinhamento visual entre catálogo ordenado e coluna «Com Carrinho»; narrativa pedagógica clara ao comprar no catálogo.
- **Negativas:** mais chamadas ao `ai-service` ao mutar o carrinho com IA activa; mitigado por debounce e abort.
- **Testes:** E2E existentes de catálogo não cobrem obrigatoriamente cada passo; smoke manual ou spec dedicado futuro se regressões forem frequentes.

## Ligações

- [M14 — Cart-aware showcase](../m14-catalog-score-visibility-cart-aware-showcase/spec.md) (narrativa carrinho + análise).
- [INTEGRATIONS.md — Frontend](../../codebase/frontend/INTEGRATIONS.md) (tabela de proxies).
- Ficheiros: `frontend/lib/hooks/useRecommendationFetcher.ts`, `frontend/components/catalog/CatalogPanel.tsx`, `frontend/app/api/proxy/recommend/from-cart/route.ts`.

## Artefactos

| Ficheiro | Papel |
|----------|--------|
| `useRecommendationFetcher.ts` | Escolhe `recommend` vs `recommend/from-cart`; `signal` de abort; opção `silent` |
| `CatalogPanel.tsx` | `catalogRequestKey` com sufixo de carrinho; efeito com debounce quando `ordered` e carrinho / assinatura mudam |
