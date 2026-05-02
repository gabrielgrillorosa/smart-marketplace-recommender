# M19 — Pos-Efetivar: deltas & baseline cart-aware (ADR-065) — Tasks

**Design:** [design.md](./design.md)  
**Spec:** [spec.md](./spec.md)  
**ADR:** [ADR-065](./adr-065-post-checkout-column-deltas-baseline.md), [ADR-066](./adr-066-pe-04-showcase-delta-score-metric.md)  
**Testing:** [.specs/codebase/frontend/TESTING.md](../../codebase/frontend/TESTING.md) (matriz e gates do `frontend`)

**Status:** Implemented

---

## Pre-approval validation (references/tasks.md §5)

### Check 1 — Task granularity

| Task | Scope (deliverable) | Granular? |
|------|---------------------|-----------|
| T1 | Documentar decisão PE-04 (A vs B) em spec + design + ADR-066 | ✅ Um resultado documental |
| T2 | Invariantes de baseline cart-aware + UX PE-03 (vários ficheiros, um objectivo) | ✅ Coeso (uma feature de baseline) |
| T3 | Ajustar `deltas.ts` + chamadas conforme T1 | ✅ Um eixo de código (métrica Δ) |
| T4 | Copy e estados degradados na coluna | ✅ Um eixo de UX/copy |
| T5 | E2E regressão Pos-Efetivar | ✅ Um ficheiro ou extensão de spec E2E |
| T6 | ROADMAP + STATE + checklist + gate Build | ✅ Fecho de marco |

### Check 2 — Diagram–definition cross-check

| Task | Depends on (corpo) | Diagrama (abaixo) | Match |
|------|--------------------|-------------------|-------|
| T1 | — | Início | ✅ |
| T2 | — | Início | ✅ |
| T3 | T1 | Após T1 | ✅ |
| T4 | T2 | Após T2 | ✅ |
| T5 | T2, T3, T4 | Após T3 e T4 | ✅ |
| T6 | T1–T5 | Após T5 | ✅ |

### Check 3 — Test co-location vs [.specs/codebase/frontend/TESTING.md](../../codebase/frontend/TESTING.md)

| Task | Camada alterada | Matrix exige | Campo Tests / Done when |
|------|-----------------|---------------|-------------------------|
| T1 | docs | n/a | none — revisão |
| T2 | Zustand + panel (`frontend/`) | Fluxos E2E para regressão de UI | e2e coberto em T5; T2 inclui critérios manuais até T5 |
| T3 | `lib/showcase/deltas.ts` | Matrix: sem unit por defeito; spec PE-06 pede prova do score | e2e em T5 **ou** unit se se introduzir Vitest para `deltas.ts` na mesma tarefa |
| T4 | componentes | E2E | e2e em T5 + `data-testid` onde aplicável |
| T5 | `e2e/tests/` | Playwright | e2e |
| T6 | docs + comando agregado | Build gate | e2e via comando full |

**Violations:** Nenhuma — camadas sem teste obrigatório na matrix não usam `Tests: unit` a menos que o projecto adicione harness; PE-06 é satisfeito por E2E + documentação, com unit opcional em T3 se Vitest for adicionado.

---

## Rastreio spec ↔ tasks

| ID | Tarefas |
|----|---------|
| PE-01, PE-03 | T2 |
| PE-02 | T2–T3 |
| PE-04 | T1 → T3 |
| PE-05 | T4 |
| PE-06 | T5; T6 |

---

## Execution plan

### Phase 1 — Fundação (paralelo permitido)

Depois do arranque, **T1** e **T2** não dependem uma da outra.

```text
       ┌─ T1 ─┐
Start ─┤      ├─ (T1 feito) ─► T3 ─┐
       └─ T2 ─┘                    ├──► T5 ─► T6
              (T2 feito) ─► T4 ──┘
```

### Phase 2 — Núcleo (paralelo após Phase 1)

Quando **T1** e **T2** estão fechados, **T3** e **T4** podem correr em paralelo (`[P]`).

### Phase 3 — Integração e fecho

**T5** (E2E) → **T6** (docs + **Build** gate).

---

## Task breakdown

### T1: Registar decisão PE-04 (métrica Δscore)

**What:** Escolher e documentar opção **A** (`finalScore` apenas) ou **B** (`rankScore ?? finalScore` quando M17 activo); alinhar [spec](./spec.md), [design](./design.md) (secção de métrica / tech decisions) e [ADR-066](./adr-066-pe-04-showcase-delta-score-metric.md) (*Proposed* → *Accepted*).

**Where:** `spec.md`, `design.md`, `adr-066-pe-04-showcase-delta-score-metric.md`

**Depends on:** —  
**Reuses:** Comportamento actual em [`deltas.ts`](../../../frontend/lib/showcase/deltas.ts)

**Requirement:** PE-04

**Tools:**

- MCP: NONE
- Skill: NONE

**Done when:**

- [x] Secção «Decisão produto» no spec deixa de estar *pendente*.
- [x] `design.md` e ADR-066 reflectem a mesma opção e critério de produto.
- [x] Gate: `npm run lint` no `frontend` se editores validarem markdown/tsconfig; senão revisão humana.

**Tests:** none  
**Gate:** quick

**Commit:** `docs(spec): M19 PE-04 score delta metric decision`

---

### T2: Baseline cart-aware e degradação PE-03 [P]

**What:** Implementar estratégia **Node B** do design (invariantes ADR-048 + `analysisSlice` / `captureRetrained` / `clearCartAware`); garantir `previous` correcto para Pos-Efetivar no fluxo checkout → promoção; UX quando baseline em falta ([design § Interaction states](./design.md#interaction-states)).

**Where:** `frontend/store/analysisSlice.ts`, `frontend/components/recommendations/AnalysisPanel.tsx` (e call sites de checkout/stale conforme design)

**Depends on:** —  
**Reuses:** `markCartSnapshotStale`, fluxos ADR-045/048

**Requirement:** PE-01, PE-03

**Tools:**

- MCP: `user-filesystem` (leitura/escrita repo)
- Skill: `coding-guidelines` (opcional)

**Done when:**

- [x] Fluxo feliz: deltas Pos-Efetivar não ficam `{}` só por carrinho UI vazio pós-checkout quando existe baseline comparável.
- [x] `postCheckout` presente + baseline ausente: copy/`data-testid` estável (PE-03).
- [x] Gate: `npm run lint && npm run build` no `frontend`.

**Tests:** e2e (prova final agregada em **T5**; esta tarefa define comportamento testável)  
**Gate:** quick

**Commit:** `fix(showcase): preserve cart baseline for post-checkout deltas (M19)`

---

### T3: Alinhar `buildRecommendationDeltaMap` à decisão T1 [P]

**What:** Implementar opção **A** ou **B** em [`deltas.ts`](../../../frontend/lib/showcase/deltas.ts) e actualizar [`AnalysisPanel.tsx`](../../../frontend/components/recommendations/AnalysisPanel.tsx) (e colunas afectadas); manter **um único** motor de diff (PE-02).

**Where:** `frontend/lib/showcase/deltas.ts`, `frontend/components/recommendations/AnalysisPanel.tsx`

**Depends on:** T1  
**Reuses:** `buildRecommendationDeltaMap`; ADR-066

**Requirement:** PE-02, PE-04

**Tools:**

- MCP: `user-filesystem`, `user-context7` (se necessário para tipos TS)
- Skill: NONE

**Done when:**

- [x] Δ e regras de janela consistentes com T1.
- [x] Sem Vitest no `frontend`; cobertura PE-06 via E2E em T5 (comportamento `scoreForRecommendationDelta` / `deltas.ts`).
- [x] Gate: `npm run lint && npm run build`.

**Tests:** unit (se harness existir ou for criado aqui) **ou** deferido a e2e em T5  
**Gate:** quick

**Commit:** `feat(showcase): align delta score metric with M17 ranking (M19)`

---

### T4: Copy PE-05 e estados vazios [P]

**What:** Uniformizar labels «Pos-Efetivar» / «Pós efetivar»; mensagens para baseline ausente / janela diferente conforme design.

**Where:** `frontend/components/analysis/RecommendationColumn.tsx`, `AnalysisPanel.tsx`

**Depends on:** T2  
**Reuses:** `emptyMessage`, `aria-label` existentes

**Requirement:** PE-05

**Tools:**

- MCP: `user-filesystem`
- Skill: NONE

**Done when:**

- [x] Copy PT consistente; `role="status"` ou equivalente onde o design exige leitura por leitor de ecrã.
- [x] Gate: `npm run lint && npm run build`.

**Tests:** e2e (asserções em T5)  
**Gate:** quick

**Commit:** `feat(showcase): M19 post-checkout column copy and empty-delta states`

---

### T5: E2E — regressão Pos-Efetivar (PE-06)

**What:** Estender [`m13-cart-async-retrain.spec.ts`](../../../frontend/e2e/tests/m13-cart-async-retrain.spec.ts) ou criar `m19-pos-efetivar-deltas.spec.ts` com asserções de deltas pós-checkout / coluna Pos-Efetivar.

**Where:** `frontend/e2e/tests/`

**Depends on:** T2, T3, T4  
**Reuses:** Padrões Playwright do repo

**Requirement:** PE-06

**Tools:**

- MCP: `user-filesystem`; `cursor-ide-browser` (opcional, depuração)
- Skill: NONE

**Done when:**

- [x] `npm run lint && npm run build && npm run test:e2e` no `frontend` (stack conforme README/docker).
- [x] Comentário no teste referindo M19 / PE-06.
- [x] Contagem de testes Playwright sem remoções silenciosas.

**Tests:** e2e  
**Gate:** full — [.specs/codebase/frontend/TESTING.md](../../codebase/frontend/TESTING.md)

**Commit:** `test(e2e): M19 post-checkout delta assertions`

---

### T6: Fecho documental + Build gate

**What:** Actualizar [ROADMAP.md](../../project/ROADMAP.md), [STATE.md](../../project/STATE.md), checklist do [spec.md](./spec.md); confirmar rastreio PE-01–PE-06.

**Where:** `.specs/project/ROADMAP.md`, `.specs/project/STATE.md`, `spec.md`

**Depends on:** T1–T5  
**Reuses:** Formato de entradas de marcos anteriores

**Requirement:** PE-06 (fecho), critérios de verificação do spec

**Tools:**

- MCP: NONE
- Skill: NONE

**Done when:**

- [x] ROADMAP / STATE / spec alinhados com **IMPLEMENTED** e data.
- [x] **Build gate** do frontend: `npm run lint && npm run build && npm run test:e2e` (barreira final após T3/T4 paralelos).

**Tests:** e2e (via comando agregado)  
**Gate:** build

**Commit:** `docs: close M19 Pos-Efetivar showcase deltas`

---

## Parallel execution map

| Phase | Tasks | Notas |
|-------|-------|--------|
| 1 | T1 [P], T2 [P] | E2E parallel-safe per TESTING.md |
| 2 | T3 [P], T4 [P] | Só após T1+T2; coordenar se o mesmo ficheiro for editado |
| 3 | T5 | Sequencial |
| 4 | T6 | Build gate obrigatório |

---

## Before Execute (references/tasks.md §6)

Antes de implementar, confirmar com o utilizador **por tarefa** quais MCPs e skills usar (lista actual do ambiente vs tabela **Tools** acima).
