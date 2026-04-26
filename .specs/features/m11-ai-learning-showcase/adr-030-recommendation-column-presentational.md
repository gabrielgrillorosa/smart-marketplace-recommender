# ADR-030: RecommendationColumn Genérico Presentational — Container/Presentational Pattern

**Status**: Accepted
**Date**: 2026-04-26

## Context

A aba "Análise" atual tem `ShuffledColumn` (sem IA, ordem aleatória) e `RecommendedColumn` (com IA, ranking por score). A feature M11 adiciona uma terceira coluna "Com Demo" e uma quarta "Pós-Retreino". As quatro colunas têm estrutura idêntica: título + badge de estado + lista de produtos ranqueados com score. A diferença é a fonte dos dados (snapshot do `analysisSlice`).

O Arquiteto Principal (Medium severity) identificou que o `RecommendationColumn` genérico deve ser **presentational** — recebendo `recommendations` como prop — e não deve encapsular lógica de fetch, para não violar SRP e não acumular responsabilidades de orquestração que pertencem ao `AnalysisPanel`.

A Rule of Three é satisfeita: 4 instâncias do mesmo padrão no mesmo componente `AnalysisPanel` justificam a abstração.

## Decision

Criar `components/analysis/RecommendationColumn.tsx` como componente **presentational puro**:
- Props: `{ title: string; badge?: ReactNode; recommendations: RecommendationResult[] | null; loading?: boolean; emptyMessage?: string; colorScheme: 'gray' | 'blue' | 'emerald' | 'violet' }`
- Quando `recommendations === null` e `loading === false`: renderiza `emptyMessage` com instrução de ação.
- Quando `loading === true`: renderiza skeleton de 5 cards.
- `AnalysisPanel` orquestra: lê `analysisSlice`, passa snapshots para cada coluna, captura snapshots nos momentos corretos.
- `ShuffledColumn` e `RecommendedColumn` existentes são **mantidos** para o fluxo do catálogo (M8/M9-A) — sem refactor de código existente para evitar regressões.

## Alternatives considered

- **Refatorar `ShuffledColumn` e `RecommendedColumn` para herdar de `RecommendationColumn`** — requer mudança de código testado e em produção; risco de regressão em M8/M9-A; Arquiteto Principal rejeitou sem necessidade de refactor já que os componentes existentes servem contextos diferentes (catálogo vs. análise).
- **`RecommendationColumn` com fetch interno via hook** — viola SRP (fetch + render na mesma responsabilidade); impossibilita teste unitário isolado; Arquiteto Principal (Medium) rejeitou.
- **Inline direto no `AnalysisPanel`** — sem abstração; 4 blocos de código idênticos; Rule of Three exige extração com 4 instâncias.

## Consequences

- `ShuffledColumn` e `RecommendedColumn` não são alterados — zero risco de regressão em M8/M9-A.
- `RecommendationColumn` é facilmente testável em isolamento com props mockadas — satisfaz QA Staff.
- `AnalysisPanel` se torna o único ponto de orquestração: captura snapshots, lê `analysisSlice`, passa dados para colunas — responsabilidade única clara.
- `colorScheme` prop implementa a diferenciação visual proposta pelo Staff UI Designer: gray (sem IA), blue (com IA), emerald (com demo), violet (pós-retreino).
