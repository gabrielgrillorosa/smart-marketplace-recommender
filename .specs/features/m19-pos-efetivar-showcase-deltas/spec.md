# M19 — Pos-Efetivar: deltas & baseline cart-aware (ADR-065) — Especificação

**Status:** **IMPLEMENTED** (2026-05-01)  
**Design:** [design.md](./design.md) (design-complex-ui, **Approved** 2026-05-01) · **Tasks:** [tasks.md](./tasks.md)  
**ADR:** [ADR-065](./adr-065-post-checkout-column-deltas-baseline.md) (*Accepted*) · [ADR-066](./adr-066-pe-04-showcase-delta-score-metric.md) (*Accepted* — PE-04) · [ADR-067](../m20-manual-retrain-metrics-pos-retreino/adr-067-manual-retrain-metrics-showcase-pos-retreino.md) (*Accepted* — **M20:** [spec](../m20-manual-retrain-metrics-pos-retreino/spec.md), [tasks](../m20-manual-retrain-metrics-pos-retreino/tasks.md); atalhos [spec-adr067](./spec-adr067.md) / [tasks-adr067](./tasks-adr067.md))

**Roadmap:** [.specs/project/ROADMAP.md](../../project/ROADMAP.md) — **M19**

---

## Source documents

- [ADR-065](./adr-065-post-checkout-column-deltas-baseline.md) — âmbito, baseline oficial, fonte única `buildRecommendationDeltaMap`.
- [ADR-045](../m13-cart-checkout-async-retrain/adr-045-current-version-polling-for-post-checkout-capture.md) — captura assíncrona via `/model/status`.
- [ADR-048](../m14-catalog-score-visibility-cart-aware-showcase/adr-048-explicit-cart-snapshot-clearing.md) — snapshot do carrinho + `markCartSnapshotStale`.
- [ADR-051](../m15-cart-integrity-comparative-ux/adr-051-post-checkout-outcome-notice-without-synthetic-snapshot.md) — outcome pós-checkout sem snapshot sintético.
- Implementação actual: [`AnalysisPanel.tsx`](../../../frontend/components/recommendations/AnalysisPanel.tsx), [`deltas.ts`](../../../frontend/lib/showcase/deltas.ts), [`analysisSlice.ts`](../../../frontend/store/analysisSlice.ts).

---

## Dependências de marcos

| Marco | Ligação a M19 |
|-------|----------------|
| **M13** | Pós-checkout, polling de versão e `postCheckout` no slice — fonte do snapshot «depois» do retreino. |
| **M14** | Colunas comparativas, `cartSnapshotStale`, profundidade/janela de ranking partilhada entre colunas. |
| **M15** | ADR-051 — sem fabricar baseline sintético; copy de outcome alinhada ao estado real. |
| **M17** | `rankScore` / `rankingConfig` opcionais — alimentam **PE-04** (métrica de Δ vs ordenação da grelha). |

M19 **não** altera contratos HTTP nem o motor de ranking no `ai-service`; limita-se ao cliente showcase e a invariantes de estado.

---

## Glossário

| Termo | Significado |
|-------|-------------|
| **Baseline cart-aware (Pos-Efetivar)** | O último ranking **com carrinho** capturado **antes** do checkout, comparável ao universo da coluna «Com Carrinho» (ADR-048 / preservação com carrinho vazio + stale). |
| **`cartSnapshot`** | Valor derivado em `AnalysisPanel` a partir de `analysis.cart` (recomendações + metadados de captura) usado como `previous` no diff Pos-Efetivar. |
| **`postCheckoutSnapshot`** | Snapshot guardado em `analysis.postCheckout` após promoção do modelo (fluxo ADR-045), usado como `current` no diff Pos-Efetivar. |
| **`buildRecommendationDeltaMap(previous, current)`** | Função pura em `deltas.ts` — única fonte de pills, `scoreDelta`, ranks e regras de janela (`hasSameRankingWindow`). |

---

## Problema

A coluna **«Pos-Efetivar»** deve mostrar a **mesma semântica de evolução** que **«Com Carrinho»**: pills (`subiu` / `caiu` / `sem mudança`), variação de score e ranks, via **`buildRecommendationDeltaMap(previous, current)`**.

O código já calcula `postCheckoutDeltaByProductId = buildRecommendationDeltaMap(cartSnapshot, postCheckoutSnapshot)`. Os riscos residuais são:

1. **Baseline inconsistente** quando `cartSnapshot` é `null` em `phase === 'postCheckout'` — o mapa de deltas fica vazio sem feedback explícito.
2. **Desalinhamento M17:** a grelha pode ordenar por `rankScore` (re-rank com recência), mas `deltas.ts` usa apenas `finalScore` para `scoreDelta` — o utilizador pode interpretar números inconsistentes com a ordem visual.

---

## Pré-condições

- M13–M15 entregues no ambiente de demonstração (checkout, `postCheckout`, outcome sem snapshot sintético).
- Para validar **PE-04 opção B**, o payload de recomendação expõe `rankScore` quando o boost M17 está activo (já previsto no M17).

---

## Goals

- [x] **PE-01 (Baseline):** O baseline «antes do checkout» para comparar com **Pos-Efetivar** é o ranking **cart-aware capturado antes da compra**, alinhado a ADR-048 / fluxo de captura ADR-045 — não um snapshot genérico nem uma segunda implementação de diff.
- [x] **PE-02 (Motor único):** Continuar a usar **apenas** `buildRecommendationDeltaMap` para **Com Carrinho** e **Pos-Efetivar** — sem segundo motor de diff.
- [x] **PE-03 (Robustez):** Se `analysis.cart` for `null` em `postCheckout` mas existir `postCheckout`, a UI SHALL degradar de forma **didática** (mensagem/tooltip ou badge na coluna) e o `design` SHALL documentar se é necessário **snapshot imutável** dedicado no slice — ver [ADR-065 § Consequências](./adr-065-post-checkout-column-deltas-baseline.md).
- [x] **PE-04 (Métrica Δscore):** Decisão **explícita** registada no `design.md` (e aqui em § Decisão produto): manter `finalScore` para Δ **ou** usar `rankScore ?? finalScore` quando o modo de ranking com recência estiver activo — **antes** de alterar `deltas.ts`.
- [x] **PE-05 (Copy):** Copy estável para o utilizador sobre **«Pós efetivar»** vs **baseline explícito** (coluna / rodapé / `RecommendationColumn` conforme `design`).
- [x] **PE-06 (Verificação):** Testes alargados onde faltar: unitários em `deltas.ts` para o campo de score escolhido; E2E ou extensão de [`m13-cart-async-retrain.spec.ts`](../../../frontend/e2e/tests/m13-cart-async-retrain.spec.ts) para assert de deltas pós-checkout quando aplicável.

---

## Fora de escopo (M19)

| Item | Motivo |
|------|--------|
| Reimplementar `RecommendationDeltaBadge` / pills | ADR-065 — reutilizar componentes existentes |
| Alterar política de polling `/model/status` | Coberto por M13 / ADR-045 |
| Novas APIs no `ai-service` só para showcase | Não exigido pelo ADR-065 |
| M17 Fase 2/3 (pooling, atenção) | Ortogonal; apenas consumir `rankScore` / `rankingConfig` se PE-04 assim decidir |

---

## Decisão produto — métrica de Δscore (PE-04)

**Estado:** **Opção B** — alinhamento com a ordenação visível quando M17 expõe `rankScore`.

| Opção | Descrição |
|-------|-----------|
| **A (default actual)** | `scoreDelta` baseado só em `finalScore` (comportamento legado em [`deltas.ts`](../../../frontend/lib/showcase/deltas.ts) antes de M19). |
| **B (alinhamento lista)** | Quando existir `rankScore` no resultado (M17), usar `rankScore ?? finalScore` para comparação e para Δ, para alinhar à ordenação da coluna. **← adoptada.** |

**Critério de escolha:** O utilizador-alvo do showcase interpreta o número ao lado da pill como «mudança coerente com a lista que está a ver»; com re-rank por recência activo, **B** evita inconsistência entre ordem e Δ.

Registrar a escolha final em `design.md` § Métrica (PE-04), nesta secção, e em [ADR-066](./adr-066-pe-04-showcase-delta-score-metric.md).

---

## User stories

### P1: Baseline cart-aware preservado para diff pós-checkout

**Como** avaliador do showcase, **quero** que os deltas da coluna Pos-Efetivar comparem o modelo novo ao último ranking **com o carrinho que levou ao checkout**, **para** ver o efeito do retreino contra o contexto certo.

**Por que P1:** Sem baseline estável, a coluna Pos-Efetivar fica vazia ou enganosa após esvaziar o carrinho ou transições do slice — quebra a narrativa ADR-065 e o E2E existente perde significado.

**Critérios de aceitação**

1. WHEN o fluxo normal «carrinho → checkout → promoção» for seguido THEN o par `(previous, current)` passado a `buildRecommendationDeltaMap` para Pos-Efetivar SHALL usar como `previous` o snapshot cart-aware **capturado antes do checkout** (mesmo universo que «Com Carrinho» com política ADR-048).
2. WHEN `phase === 'postCheckout'` e existir `postCheckout` THEN o sistema SHALL NOT silenciar deltas apenas por `cart === null` sem uma razão documentada e UX de degradação (PE-03).

**Teste independente:** Cliente com carrinho não vazio → capturar fases até «Com Carrinho» → checkout → aguardar promoção → confirmar que a coluna Pos-Efetivar mostra pills/deltas coerentes (não mapa vazio só porque o carrinho UI está vazio após compra). Opcional: inspeccionar estado `analysis` e verificar que o `previous` do diff corresponde ao último ranking cart-aware pré-checkout.

---

### P1: Paridade visual de deltas com «Com Carrinho»

**Como** avaliador, **quero** que pills e badges na coluna Pos-Efetivar sigam as mesmas regras que «Com Carrinho», **para** comparar colunas sem aprender duas semânticas.

**Por que P1:** O ADR-065 exige um único motor de diff; qualquer divergência de regras entre colunas exigiria documentação e testes duplicados.

**Critérios de aceitação**

1. WHEN `hasSameRankingWindow` for verdadeiro para o par de snapshots THEN os deltas SHALL incluir movimentos / unchanged / new / outOfWindow como na coluna Com Carrinho (mesma função pura).
2. WHEN a janela de ranking mudar entre snapshots THEN o mapa SHALL ficar vazio (comportamento actual) e, se o produto quiser, uma linha de copy opcional pode explicar «janela de ranking alterada» — ver `design` (nice-to-have).

**Teste independente:** Com janela estável entre `cartSnapshot` e `postCheckoutSnapshot`, escolher um SKU presente em ambos: verificar que o tipo de pill e o sinal de `scoreDelta` em Pos-Efetivar seguem a mesma lógica que seria obtida ao aplicar `buildRecommendationDeltaMap` aos mesmos pares noutra coluna (Com Carrinho já cobre a função; Pos-Efetivar deve ser apenas outro par de argumentos).

---

## Requisitos rastreáveis

| ID | Requisito |
|----|-----------|
| PE-01 | Baseline cart-aware oficial para Pos-Efetivar (ADR-065) |
| PE-02 | Fonte única `buildRecommendationDeltaMap` |
| PE-03 | Degradação explícita se baseline em falta |
| PE-04 | Decisão `finalScore` vs `rankScore ?? finalScore` documentada e implementada |
| PE-05 | Copy «Pós efetivar» / baseline |
| PE-06 | Testes unit + E2E conforme tasks |

### Rastreio spec ↔ tasks ([tasks.md](./tasks.md))

| ID | Tarefas principais |
|----|--------------------|
| PE-01, PE-03 | **T2** (baseline robusto + UX de falta de baseline) |
| PE-02 | Invariante em **T2**–**T3** (sem segundo motor) |
| PE-04 | **T1** (decisão) → **T3** (`deltas.ts` + chamadas) |
| PE-05 | **T4** |
| PE-06 | **T5** (E2E/regressão); **T6** fecha docs de projeto |

---

## Verificação de fecho (checklist)

- [x] `design.md` actualizado com decisão PE-04 e diagrama ou tabela de estados `analysis.cart` vs baseline congelado.
- [x] `tasks.md` — todas as tarefas marcadas **Done when** satisfeitas.
- [x] E2E ou unitários referidos em PE-06 a verde no CI local / `docker compose`.
- [x] [STATE.md](../../project/STATE.md) — entrada M19 **IMPLEMENTED** com data.
