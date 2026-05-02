# ADR-065: Deltas na coluna «Pos-Efetivar» — baseline cart-aware e âmbito do marco M19

**Status:** Accepted  
**Data:** 2026-04-30  
**Contexto:** showcase de aprendizagem (`AnalysisPanel`) — colunas «Com IA», «Com Carrinho», «Pos-Efetivar».

## Contexto

Foi pedido um **marco M19** para que a coluna **«Pos-Efetivar»** apresente a **mesma lógica de evolução** (pills `subiu` / `caiu` / `sem mudança`, variação de score, ranks) que a coluna **«Com Carrinho»**.

A implementação actual já:

- Calcula deltas de **Com Carrinho** com `buildRecommendationDeltaMap(initialSnapshot, cartSnapshot)` em [`frontend/components/recommendations/AnalysisPanel.tsx`](../../../frontend/components/recommendations/AnalysisPanel.tsx).
- Calcula deltas de **Pos-Efetivar** com `buildRecommendationDeltaMap(cartSnapshot, postCheckoutSnapshot)` no mesmo ficheiro.
- Reutiliza [`RecommendationColumn`](../../../frontend/components/analysis/RecommendationColumn.tsx) + [`RecommendationDeltaBadge`](../../../frontend/components/analysis/RecommendationDeltaBadge.tsx) e a lógica pura em [`lib/showcase/deltas.ts`](../../../frontend/lib/showcase/deltas.ts).
- O E2E [`m13-cart-async-retrain.spec.ts`](../../../frontend/e2e/tests/m13-cart-async-retrain.spec.ts) já assere `analysis-column-post-checkout-delta-*` após promoção.

O risco residual é **baseline inconsistente** se `analysis.cart` for `null` em fase `postCheckout` (o mapa de deltas fica vazio), e **desalinhamento M17** se o utilizador interpretar a ordem pela grelha (`rankScore`) mas o delta de score usar só `finalScore` (ver [`buildRecommendationDeltaMap`](../../../frontend/lib/showcase/deltas.ts)).

## Decisão

1. **Âmbito do M19:** não reimplementar pills nem duplicar regras de UI. O M19 é **formalização em spec/tarefas**, **robustez do snapshot** cart-aware para comparação pós-checkout, **documentação/copy** («Pós efetivar» vs baseline explícito), testes alargados se necessário, e **decisão explícita** sobre métrica de Δscore (manter `finalScore` vs opcional `rankScore` quando existir recência).
2. **Baseline oficial para Pos-Efetivar:** o ranking **cart-aware capturado antes do checkout** (o mesmo universo que «Com Carrinho» com `markCartSnapshotStale` + preservação do snapshot quando o carrinho esvazia — alinhado a [ADR-048](../m14-catalog-score-visibility-cart-aware-showcase/adr-048-explicit-cart-snapshot-clearing.md) e fluxo de captura [ADR-045](../m13-cart-checkout-async-retrain/adr-045-current-version-polling-for-post-checkout-capture.md)).
3. **Fonte única de verdade para deltas:** continuar a usar **`buildRecommendationDeltaMap`** para ambas as colunas; sem segundo motor de diff no cliente.

## Consequências

- **Positivas:** menos código novo; comportamento já testável em E2E; semântica «Com Carrinho → Pos-Efetivar» fica explícita para quem lê o ADR.
- **Negativas / follow-up:** se surgirem fluxos em que `cart` é `null` com `postCheckout` preenchido, o slice ou `captureRetrained` pode precisar de um **snapshot imutável** dedicado (ex. cópia só para diff) — tratar no M19 como tarefa de verificação, não como mudança de decisão aqui.
- **Produto / M17:** se o produto exigir que o número ao lado de «sem mudança» reflita a **mesma** escala que ordena a lista com recência, será necessário estender `deltas.ts` (ou parâmetro de «campo de score») para usar `rankScore ?? finalScore` — documentar no `spec` M19 antes de codar.

## Ligações

- [ADR-045 — Polling pós-checkout](../m13-cart-checkout-async-retrain/adr-045-current-version-polling-for-post-checkout-capture.md)
- [ADR-048 — Snapshot do carrinho](../m14-catalog-score-visibility-cart-aware-showcase/adr-048-explicit-cart-snapshot-clearing.md)
- [ADR-051 — Post-checkout outcome sem snapshot sintético](../m15-cart-integrity-comparative-ux/adr-051-post-checkout-outcome-notice-without-synthetic-snapshot.md)

## Artefactos de planeamento (M19)

- [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- [ADR-066 — Métrica Δscore no showcase (PE-04)](./adr-066-pe-04-showcase-delta-score-metric.md) (*Proposed*)
