# ADR-064: `rankingConfig` no slice Zustand de recomendações (frontend)

**Status**: Accepted (design complex UI — M17 ADR-063)  
**Date**: 2026-05-01

**Implementação (2026-05-01):** `rankingConfig` no `recommendationSlice`, integrado com `adaptRecommendations` / fetch; alinhado ao ADR-063. **Pendentes no milestone M17:** só [Fase 2 / Fase 3](./spec.md) do ADR-062.

## Context

O ADR-063 exige que o modal e a grelha usem pesos runtime iguais ao `ai-service`. O showcase já persiste recomendações em **`useAppStore` → `recommendationSlice`** via `useRecommendationFetcher`; o `RecommendationContext` React existe mas o catálogo consome o **hook** `useRecommendations` ligado ao Zustand. Colocar `rankingConfig` só em estado local do `CatalogPanel` arrisca dessincronização com `clearRecommendations` / troca de cliente e duplica a fonte de verdade.

## Decision

Persistir **`rankingConfig: RankingConfig | null`** no mesmo **`recommendationSlice`**, actualizado em conjunto com `setRecommendations` (e limpo em `clearRecommendations` / `resetOrderedState`).

## Alternatives considered

- **Estado local só no `CatalogPanel`** — descartado: não acompanha automaticamente o ciclo de vida global das recomendações; risco C-F01 (cliente vs recs) se outro painel passar a depender de pesos.
- **Novo slice Zustand isolado** — descartado: Rule of Three; duas fontes para o mesmo request aumentam race mental sem benefício.
- **Só `RecommendationContext`** — descartado: o fluxo activo de fetch já escreve no Zustand; duplicar no Context seria dupla escrita ou migração maior fora do escopo ADR-063.

## Consequences

- `setRecommendations` ganha parâmetro ou payload agrupado `{ results, isFallback, rankingConfig?, coverageMeta }` (detalhe de assinatura na implementação).
- Qualquer UI que leia recomendações via `useRecommendations()` pode ler `rankingConfig` no mesmo hook com **um** selector adicional.
- O `RecommendationContext` pode permanecer legado até refactor global (fora ADR-063).
