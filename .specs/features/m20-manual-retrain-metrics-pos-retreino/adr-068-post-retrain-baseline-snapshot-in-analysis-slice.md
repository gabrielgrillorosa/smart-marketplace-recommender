# ADR-068: Baseline «Com IA pré-promoção» persistido no slice de análise (Pos-Retreino)

**Status:** Accepted  
**Data:** 2026-05-01

## Context

O modo **Pos-Retreino** (ADR-067) exige `buildRecommendationDeltaMap(previous, current)` com `previous` = ranking **Com IA** estável **antes** da promoção e `current` = snapshot pós-promoção. Hoje `AnalysisPanel` deriva deltas Pos-Efetivar de `cart → postCheckout` (M19). Após M20, `initial` (coluna Com IA) continua a ser actualizado por fluxos de janela e por um futuro **«Fixar novo normal»**; confiar apenas no valor de `initial` no mesmo tick que `captureRetrained` corre expõe a **corrida** entre `fetchRecs` assíncrono e o estado que o utilizador viu.

## Decision

Introduzir no **`analysisSlice`** um campo explícito e imutável durante a comparação transitória — por exemplo `postRetrainBaseline: Snapshot | null` — preenchido **atomicamente** na transição para `postCheckout` quando a captura pós-promoção é aplicada: copiar o `Snapshot` que serviu de **Com IA** naquele momento (o `initial` actual ou um campo dedicado se `initial` já divergiu). Os deltas da coluna Pos-Retreino em modo ADR-067 usam `buildRecommendationDeltaMap(postRetrainBaseline, postCheckout)`; o modo cart-aware (M19) continua a usar `cart → postCheckout` quando um **modo de showcase** (flag derivada de env/proxy ou preferência documentada) estiver activo.

## Alternatives considered

- **Derivar `previous` só de `initial` no `useEffect` antes do `fetchRecs`** — descartado: janela de corrida e re-renders podem alterar `initial` antes do snapshot ser congelado.
- **Baseline em `useRef` no `AnalysisPanel`** — descartado: duplica verdade com o slice, dificulta testes e viola o padrão Zustand já usado em M19 (ver comentários ADR-048 no slice).
- **`sessionStorage`** — descartado: semântica de cliente/tab incorrecta após reload e fora do modelo mental do docente.

## Consequences

- **Positivos:** Delta determinístico; E2E podem assertar `postRetrainBaseline` via `data-testid` / estado exportado em testes de store se necessário.
- **Negativos:** O tipo `AnalysisState` ganha um campo opcional ou um discriminant `showcaseMode`; tarefas T067-* devem actualizar todas as transições (`resetAnalysis`, `resetAnalysisSnapshots`, mudança de cliente).
- **Mitigação:** Uma função pura `freezePostRetrainBaseline(current: AnalysisState): Snapshot` centraliza a regra de cópia.
