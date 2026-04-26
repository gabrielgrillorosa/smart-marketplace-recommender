# ADR-029: analysisSlice com Type Discriminada de 4 Fases para Snapshots de Comparação

**Status**: Accepted
**Date**: 2026-04-26

## Context

A feature M11 requer exibir 3 colunas de recomendação na aba "Análise": estado inicial (sem influência de demo), estado pós-demo (após compras `is_demo:true`), e estado pós-retreino (após `ModelTrainer.train()` com demos incluídos). Esse é um fluxo temporal com dependências estritas: não faz sentido exibir "Com Demo" sem ter capturado o "Inicial", nem exibir "Pós-Retreino" sem ter o snapshot "Com Demo" como referência.

O Arquiteto de Soluções (High severity) identificou que snapshots sem clientId associado causam inconsistência ao trocar de cliente. O QA Staff (High severity) identificou que estados parciais (ex: `demo=populated, initial=null`) podem crashar componentes que assumem ordem temporal. O Staff Product Engineer (High severity) identificou que 3 colunas no layout `md` requerem degradação graceful.

## Decision

Implementar `analysisSlice` com **type discriminada de 4 fases** como Zustand slice volátil (sem `persist`):

```typescript
type AnalysisPhase =
  | { phase: 'empty' }
  | { phase: 'initial'; clientId: string; initial: Snapshot; capturedAt: string }
  | { phase: 'demo'; clientId: string; initial: Snapshot; demo: Snapshot; capturedAt: string }
  | { phase: 'retrained'; clientId: string; initial: Snapshot; demo: Snapshot; retrained: Snapshot; capturedAt: string }

type Snapshot = { recommendations: RecommendationResult[]; capturedAt: string }
```

Transições válidas: `empty → initial → demo → retrained`. Trocar de cliente reseta para `empty`. `initial` é capturado quando `useRecommendations()` resolve com resultados válidos para um `clientId` pela primeira vez após seleção do cliente.

## Alternatives considered

- **Estado local em `AnalysisPanel`** — não persiste entre trocas de aba (violaria AD-023 always-mounted); estado não é compartilhável com outros componentes que precisem saber o phase atual; QA Staff rejeitou por criar inconsistência com `demoSlice` global.
- **3 campos opcionais independentes `{ initial?, demo?, retrained? }`** — permite estados impossíveis (ex: `demo=populated, initial=null`); QA Staff (High) rejeitou; sem invariante tipológica.
- **Elevar para `recommendationSlice` existente** — viola SRP do slice; `recommendationSlice` serve ao catálogo, não à aba "Análise"; Arquiteto Principal rejeitou por acoplamento de contextos.

## Consequences

- Type discriminada garante em compile-time que snapshots seguem ordem temporal — impossível ter `demo` sem `initial`.
- Reset ao trocar cliente é explícito e pode ser encadeado via `subscribe` no store (padrão já estabelecido em AD-019 para `demoSlice`).
- `capturedAt` em cada snapshot permite exibir "capturado às HH:MM" na UI (Staff UI Designer) e badge de timestamp.
- O componente `RecommendationColumn` recebe `snapshot: Snapshot | null` — quando null, renderiza estado `empty` com instrução de ação (Staff PE).
- Botão "Retreinar Modelo" desabilitado quando `phase === 'empty'` (Staff PE, Medium) — sem tooltip extra necessário pois a ausência das colunas já comunica o contexto.
