# M20 — Retreino manual, métricas, Pos-Retreino (ADR-067) — Tarefas de implementação

**Milestone:** **M20**  
**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**ADR:** [ADR-067](./adr-067-manual-retrain-metrics-showcase-pos-retreino.md), [ADR-068](./adr-068-post-retrain-baseline-snapshot-in-analysis-slice.md), [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)  
**Testing ai-service:** [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)  
**Testing frontend:** [.specs/codebase/frontend/TESTING.md](../../codebase/frontend/TESTING.md)

**Status:** Planned

---

## Pre-approval validation

### Granularidade

| Task | Entregável | Granular? |
|------|------------|-----------|
| T067-1 | Flags env + `orders.ts` sync-only / resposta | Sim |
| T067-2 | Cron gating + teste ou doc de comportamento | Sim |
| T067-3 | `api-service` `expectedTrainingTriggered` + testes | Sim |
| T067-4 | Tipos `TrainingJob` + registry + opcional `ModelTrainer` épocas efectivas + `model.test` | Sim |
| T067-5 | Slice + `AnalysisPanel` baseline Pos-Retreino + copy | Sim |
| T067-6 | `ModelStatusPanel` + «Fixar novo normal» (ADR-069) + E2E | Sim |
| T067-7 | Infra docs + fecho ROADMAP/STATE + build gates | Sim |

### Plano de execução

```text
        ┌─ T067-1 ─┐
Start ──┤          ├──► T067-3 (api) ──┐
        └─ T067-2 ─┘                    ├──► T067-5 ─► T067-6 ─► T067-7
              T067-4 (métricas) ────────┘
```

- **Paralelo:** T067-1 e T067-2 após alinhar nomes exactos das env vars num único commit de convenção (ou T067-1 primeiro se o cron ler a mesma config loader).
- **T067-4** pode arrancar em paralelo com T067-3 uma vez definidos tipos partilhados no `ai-service`.

---

## T067-1 — `ai-service`: checkout sync-only + contrato de resposta

**What:** Ler `CHECKOUT_ENQUEUE_TRAINING` (default `false` para demo manual). Em `orders.ts`, após `syncBoughtRelationships`, só chamar `registry.enqueue` quando a flag for `true`. Ajustar payload `202`: quando não enfileirar, não devolver `training` com job queued ou devolver corpo explícito `{ training: { enqueued: false } }` — **escolher uma variante** e documentar em `ai-service/README.md`.

**Where:** `ai-service/src/routes/orders.ts`, config/env loader (onde as outras env são lidas), `ai-service/src/routes/orders.test.ts`

**Depends on:** —  
**Reuses:** `TrainingJobRegistry`, testes existentes em `orders.test.ts`

**Requirement:** PR-067-01, PR-067-02

**Done when:**

- [ ] Com flag `false`, `enqueue` não é invocado com `triggeredBy: 'checkout'`.
- [ ] Com flag `true`, comportamento legado preservado.
- [ ] `npm test` em `orders.test.ts` + gate quick `ai-service`.

**Tests:** Vitest `orders.test.ts`  
**Gate:** quick (`npm test` focado ou suite `ai-service`)

**Commit:** `feat(ai-service): gated checkout training enqueue (ADR-067)`

---

## T067-2 — `ai-service`: cron diário independente

**What:** `ENABLE_DAILY_TRAIN` (default `false` alinhado a demo manual, ou `true` se o produto quiser preservar cron em ambientes não-demo — **documentar default** na spec/env). `CronScheduler.start()` só regista tarefa quando a flag for `true`; `index.ts` ou composição DI respectiva.

**Where:** `ai-service/src/services/CronScheduler.ts`, arranque do servidor, `docker-compose` / `.env.example`

**Depends on:** — (preferência: depois de T067-1 para naming consistente na mesma PR ou imediatamente antes na mesma branch)

**Requirement:** PR-067-03

**Done when:**

- [ ] Com cron desligado, nenhum `enqueue()` periódico.
- [ ] README menciona interacção com `CHECKOUT_ENQUEUE_TRAINING`.

**Tests:** unit mínimo em `CronScheduler` com registry mock **ou** teste de integração leve em `index` (preferir unit se DI permitir).

**Gate:** quick

**Commit:** `feat(ai-service): optional daily training cron flag (ADR-067)`

---

## T067-3 — `api-service`: `expectedTrainingTriggered` alinhado

**What:** Substituir `new CheckoutResponse(order.id(), true)` por valor derivado da mesma política que o `ai-service` (recomendado: `@Value` boolean espelhado `CHECKOUT_ENQUEUE_TRAINING` com o **mesmo nome e default** que compose; documentar que deve coincidir com o `ai-service`). Actualizar `CartApplicationServiceTest`, `CartControllerIT`.

**Where:** `CartApplicationService.java`, `application.yml` / env, testes referidos

**Depends on:** T067-1 (semântica estável)

**Requirement:** PR-067-04

**Done when:**

- [ ] Com property `false`, testes esperam `expectedTrainingTriggered` false mesmo com itens.
- [ ] `./mvnw test` no módulo afectado.

**Gate:** `api-service` test suite

**Commit:** `feat(api-service): checkout expectedTrainingTriggered respects training flag (ADR-067)`

---

## T067-4 — `ai-service`: métricas completas no job / status

**What:** Estender `TrainingJob` (e tipos TS) com campos opcionais ao terminal: `finalAccuracy`, `trainingSamples`, `durationMs`, `syncedAt`, `precisionAt5`, `epochsConfigured`, `epochsCompleted` (ou nomes alinhados ao código), versão/artefacto se já existir em `VersionedModelStore.saveVersioned`. Actualizar `TrainingJobRegistry._runJob` para preencher a partir de `ModelTrainer.train()`; garantir que `GET /model/train/status/:jobId` e enriquecimento de `GET /model/status` expõem o que o frontend precisa para o painel.

**Where:** `ai-service/src/types/index.ts`, `TrainingJobRegistry.ts`, possivelmente `ModelTrainer.ts` (épocas efectivas), `routes/model.ts`, `src/tests/model.test.ts`

**Depends on:** — (pode paralelizar com T067-3)

**Requirement:** PR-067-05, PR-067-06

**Done when:**

- [ ] Job `done` inclui conjunto mínimo acordado no spec.
- [ ] Testes de registry/model actualizados.
- [ ] Gate build `ai-service`: `npm run lint && npm test` (e `build` se o projecto exigir).

**Commit:** `feat(ai-service): expose full training metrics on jobs and status (ADR-067)`

---

## T067-5 — Frontend: baseline Pos-Retreino + slice

**What:** Guardar snapshot imutável do ranking **«Com IA»** antes da transição para captura pós-retreino (ponto exacto a desenhar em `analysisSlice` / efeitos em `AnalysisPanel` — alinhar a ADR-067 §5). Alterar `postCheckoutDeltaByProductId` para usar `(previousComIaBeforePromotion, postCheckoutSnapshot)` no modo Pos-Retreino; manter modo ADR-065 (cart vs postCheckout) atrás de flag **`SHOWCASE_POST_RETRAIN_BASELINE`** ou nome acordado. Actualizar `RecommendationColumn` / testIds para **Pos-Retreino**. Opcional PR-067-10: esconder coluna Com Carrinho quando flag demo.

**Where:** `frontend/store/analysisSlice.ts`, `frontend/components/recommendations/AnalysisPanel.tsx`, `RecommendationColumn.tsx`, `frontend/lib/showcase/post-checkout-outcome.ts` (strings)

**Depends on:** T067-1–T067-3 recomendado (fluxo E2E coerente); pode implementar UI com mocks primeiro.

**Requirement:** PR-067-07, PR-067-08 (parcial), PR-067-10

**Done when:**

- [ ] `npm run lint && npm run build` no `frontend`.
- [ ] Comportamento documentado no spec se houver duas baselines possíveis.

**Commit:** `feat(frontend): Pos-Retreino delta baseline vs Com IA pre-promotion (ADR-067)`

---

## T067-6 — Frontend: ModelStatusPanel + «Fixar novo normal» + E2E

**What:** Tornar retreino manual visível/primário; copy alinhada a «sem treino automático no checkout» quando flags assim o ditarem. Implementar acção de promoção do showcase (**«Fixar novo normal»**, `data-testid=showcase-apply-post-retrain`; [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)) e **«Limpar showcase»** (`showcase-reset-analysis`) distinta de `resetAnalysis`. Actualizar `CatalogPanel` para não assumir polling quando `expectedTrainingTriggered` for false. E2E: `m13-cart-async-retrain.spec.ts` (assertions de `expectedTrainingTriggered`, fluxo manual de train se necessário), `m15-cart-integrity-comparative-ux.spec.ts` onde citar Pos-Retreino / Pos-Efetivar.

**Where:** `ModelStatusPanel.tsx`, `CatalogPanel.tsx`, `frontend/e2e/tests/m13-cart-async-retrain.spec.ts`, `m15-*.spec.ts`

**Depends on:** T067-3, T067-5

**Requirement:** PR-067-08, PR-067-09, PR-067-12

**Done when:**

- [ ] `npm run lint && npm run build && npm run test:e2e` (stack docker conforme README).

**Gate:** full frontend

**Commit:** `feat(frontend): manual-first retrain UX and fixar novo normal showcase (ADR-067/069)`

---

## T067-7 — Infra + fecho documental

**What:** `.env.example`, `docker-compose.yml`, READMEs root/`ai-service`/`api-service`; actualizar [ROADMAP.md](../../project/ROADMAP.md) secção **M20** para **IMPLEMENTED**; [STATE.md](../../project/STATE.md); checklist em [spec.md](./spec.md); ligação em [ADR-067](./adr-067-manual-retrain-metrics-showcase-pos-retreino.md) artefactos.

**Where:** raiz do monorepo, `.specs/project/*`

**Depends on:** T067-1–T067-6

**Requirement:** PR-067-11, PR-067-12

**Done when:**

- [ ] Variáveis novas documentadas.
- [ ] Gates finais: ai + api + frontend conforme matriz de cada serviço.

**Commit:** `docs: close M20 / ADR-067 rollout (env, roadmap, state)`

---

## Before Execute

Confirmar nomes finais das env vars com o dono do repo (evitar duplicar `ENABLE_*` com semântica divergente do resto do compose). Se **Pos-Retreino** e **Pos-Efetivar** conviverem, fixar nomes de ficheiros de teste e copy PT numa única passagem para não duplicar manutenção.
