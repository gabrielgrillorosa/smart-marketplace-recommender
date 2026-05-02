# M20 — Retreino manual, métricas de treino e showcase «Pos-Retreino» — Especificação

**Status:** SPECIFIED (planeado) · **Design (UI complexo):** [design.md](./design.md) (*Approved*, 2026-05-01); **ADRs UI:** [ADR-068](./adr-068-post-retrain-baseline-snapshot-in-analysis-slice.md), [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)  
**Milestone:** **M20** · **ADR:** [ADR-067](./adr-067-manual-retrain-metrics-showcase-pos-retreino.md) (*Accepted*)  
**Tasks:** [tasks.md](./tasks.md) (**T067-1**…**T067-7**)  
**Relação com M19:** Estende [ADR-065](../m19-pos-efetivar-showcase-deltas/adr-065-post-checkout-column-deltas-baseline.md) / [spec M19](../m19-pos-efetivar-showcase-deltas/spec.md) — o spec M19 mantém modo **cart-aware** / **Pos-Efetivar**; ADR-067 (M20) acrescenta **«Pos-Retreino»** (baseline = **Com IA** pré-promoção) e o desacoplamento checkout→treino.

**Relação com M18:** o [spec M18](../m18-catalog-simplified-ad055/spec.md) (catálogo / ADR-055) não reescreve a política de treino; o comportamento «sync sem treino por defeito» e showcase **Pos-Retreino** estão em **M20 / ADR-067**.

**Relação com M21:** ver [design M21 § M20](../m21-ranking-evolution-committee-decisions/design.md#relação-com-m20-política-de-treino).

---

## Problem Statement

O checkout **podia** enfileirar treino em cada sincronização (M13 legado), o que gera batches ruidosos, UX de «sempre a treinar» e pouco controlo pedagógico. **Implementado (2026-05-02):** `CHECKOUT_ENQUEUE_TRAINING` default **`false`** — sync Neo4j sem enqueue; ver [ADR-067](./adr-067-manual-retrain-metrics-showcase-pos-retreino.md). Resta alinhar UI showcase **Pos-Retreino**, métricas completas no painel, e retreino manual como caminho primário. O contrato `expectedTrainingTriggered` deve refletir a política em todos os ambientes. As métricas expostas ao fim do job podem ser incompletas face ao que `ModelTrainer` já calcula. No showcase, a narrativa «modelo antigo vs modelo novo após retreino» exige comparar **Com IA** (pré-promoção) com o snapshot pós-promoção, não obrigatoriamente o carrinho pré-checkout. Com retreino só manual, o caminho de retreino no `ModelStatusPanel` deve deixar de ser apenas «modo avançado» e passar a ser **primário**.

---

## Goals

- [x] Checkout sincroniza relações no Neo4j **sem** enfileirar treino por defeito (`CHECKOUT_ENQUEUE_TRAINING`, **2026-05-02**); retreino profundo via `POST /api/v1/model/train` (política `X-Admin-Key` inalterada).
- [x] `expectedTrainingTriggered` alinha-se à política real de enqueue (**2026-05-02**); frontend não entra em polling de treino só por checkout quando o enqueue estiver desligado (`useModelStatus` não usa `lastTrainingResult` histórico como alerta pós-checkout fora do fluxo de espera).
- [ ] Feature flags documentadas e independentes: enqueue no checkout vs cron diário.
- [ ] Métricas completas do ciclo de treino nos resultados do job e/ou `GET /model/status` (loss/accuracy finais, amostras, `precisionAt5`, duração, `syncedAt`, épocas configuradas vs efectivas se early stopping, metadados de artefacto quando aplicável).
- [ ] UI: copy **«Pos-Efetivar» → «Pos-Retreino»** onde a semântica for pós-promoção; delta com `buildRecommendationDeltaMap(previous, current)` onde `previous` = snapshot **Com IA** antes da promoção e `current` = pós-promoção (`captureRetrained`).
- [ ] Acção **«Reiniciar»** (produto) promove o showcase: **Com IA** passa a reflectir o que era **Pos-Retreino** (novo normal), sem novo deploy — na UI o botão SHALL usar copy não ambígua (**«Fixar novo normal»**; ver [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)).

---

## Out of Scope

| Feature | Reason |
| ------- | ------ |
| Alterar arquitectura da rede ou hiperparâmetros por defeito | Ortogonal; só exposição de métricas e flags |
| Remover `sync-and-train` sem migração explícita | ADR prefere flag ou sync-only; renome pode ser fase 2 |
| Revogar ADR-065 ou remover modo cart-aware | Convivência — dois modos ou flag de baseline até migração |

---

## User Stories

### P1: Checkout sync-only e contrato honesto ⭐ MVP

**User Story:** Como operador de demo, quero que o checkout grave dados no grafo sem disparar treino por defeito, e que a API diga a verdade sobre treino disparado, para acumular compras antes de retreinar manualmente e para o UI não mostrar «a aprender» indevidamente.

**Why P1:** Sem isto, o resto da narrativa ADR-067 / M20 (manual + painel) não assenta em comportamento determinístico.

**Acceptance Criteria:**

1. WHEN `CHECKOUT_ENQUEUE_TRAINING=false` THEN o `ai-service` SHALL NOT invocar `TrainingJobRegistry.enqueue` com `triggeredBy: 'checkout'` após `syncBoughtRelationships` no fluxo de checkout/sync.
2. WHEN `CHECKOUT_ENQUEUE_TRAINING=true` THEN o `ai-service` SHALL preservar o comportamento legado (enqueue após sync).
3. WHEN o enqueue de checkout estiver desligado THEN a resposta de checkout/sync SHALL comunicar claramente que não houve enqueue (variante única escolhida e documentada em `ai-service/README.md`, por exemplo corpo explícito `{ training: { enqueued: false } }` ou omissão coerente de `training`).
4. WHEN o `api-service` processa checkout com a mesma política THEN `expectedTrainingTriggered` SHALL ser `false` se o `ai-service` não enfileirou treino por checkout (env espelhado ou contrato futuro síncrono documentado).
5. WHEN `ENABLE_DAILY_TRAIN=false` THEN o `CronScheduler` SHALL NOT registar/execução periódica que enfileira treino; WHEN `true` THEN o cron diário SHALL poder correr independentemente do checkout.

**Independent Test:** Subir stack com flags de demo manual; efectuar checkout com itens; verificar ausência de job de treino e `expectedTrainingTriggered===false`; com flag `true`, verificar enqueue e valor `true`.

---

### P2: Métricas completas no job e no status

**User Story:** Como formador, quero ver loss, accuracy, duração, P@5, amostras e épocas após cada job, para avaliar se o retreino vale a pena.

**Why P2:** Pedagogicamente necessário após desacoplar treino do checkout.

**Acceptance Criteria:**

1. WHEN um job de treino termina em estado terminal (`done` ou `failed` com contexto útil) THEN o objecto de job / resposta de status SHALL incluir o conjunto mínimo acordado (alinhar a `TrainingResult` / metadados de `ModelTrainer`: loss/accuracy finais, amostras, `precisionAt5`, `durationMs`, `syncedAt`, épocas configuradas vs efectivas se early stopping, versão de artefacto quando aplicável).
2. WHEN o cliente chama `GET /model/train/status/:jobId` ou `GET /model/status` THEN a resposta SHALL expor os campos necessários ao `ModelStatusPanel` conforme documentação do serviço.

**Independent Test:** Disparar `POST /model/train`, aguardar `done`, inspeccionar payload do job e `/model/status` (ou documentação + teste automatizado).

---

### P3: Showcase «Pos-Retreino» vs «Com IA» e «Reiniciar»

**User Story:** Como avaliador do showcase, quero comparar o ranking antes e depois da promoção do modelo e, depois, reiniciar para fixar o novo normal em «Com IA».

**Why P3:** Entrega o valor pedagógico central do ADR-067 (delta modelo antigo vs novo).

**Acceptance Criteria:**

1. WHEN o modo Pos-Retreino está activo THEN o delta da coluna SHALL usar `buildRecommendationDeltaMap(previous, current)` com `previous` = último snapshot estável **Com IA** antes da promoção e `current` = snapshot pós-promoção (`captureRetrained` / `postCheckout` conforme implementação existente).
2. WHEN copy e `data-testid` referem pós-promoção THEN o texto SHALL preferir **«Pos-Retreino»** em vez de «Pos-Efetivar» onde a semântica for a do ADR-067.
3. WHEN o utilizador usa retreino manual como caminho principal THEN o `ModelStatusPanel` SHALL tratar o disparo manual como **primário** (não apenas escondido em diagnóstico avançado).
4. WHEN o utilizador acciona a acção de promoção do showcase (**«Reiniciar»** no produto; botão **«Fixar novo normal»** na UI — [ADR-069](./adr-069-reiniciar-vs-limpar-showcase-copy.md)) após analisar deltas THEN o estado do showcase SHALL promover **Com IA** para reflectir o ranking que era **Pos-Retreino**, terminando a comparação transitória, sem exigir novo deploy.
5. WHEN modo demo o pedir THEN a coluna **Com Carrinho** MAY ser ocultada ou desactivada atrás de flag ou preferência documentada (opcional).

**Independent Test:** Fluxo completo: recomendações Com IA → retreino manual → promoção → ver deltas Pos-Retreino → Reiniciar → Com IA actualizado; E2E alinhados (`m13-cart-async-retrain`, regressões M15 onde aplicável).

---

## Edge Cases

- WHEN o checkout corre com carrinho vazio ou sem itens elegíveis THEN o sistema SHALL manter semântica actual de sync e SHALL NOT assumir treino sem política explícita.
- WHEN `probeTrainingDataAvailability` (ou equivalente) indicar dados insuficientes THEN o job ou UI SHALL comunicar risco de retreino inútil sem bloquear silenciosamente o formador.
- WHEN dois triggers de treino coexistem (checkout vs manual) THEN a UI SHALL manter distinção de origem onde já previsto (copy / estado do painel).
- WHEN `CHECKOUT_ENQUEUE_TRAINING` divergir entre `api-service` e `ai-service` THEN a documentação SHALL advertir e os testes SHALL detectar desalinhamento na propriedade espelhada.

---

## Requirement Traceability

Cada requisito mapeia para tarefas em [tasks.md](./tasks.md).

| Requirement ID | Story | Phase | Status |
| -------------- | ----- | ----- | ------ |
| PR-067-01 | P1 | Tasks | Pending |
| PR-067-02 | P1 | Tasks | Pending |
| PR-067-03 | P1 | Tasks | Pending |
| PR-067-04 | P1 | Tasks | Pending |
| PR-067-05 | P2 | Tasks | Pending |
| PR-067-06 | P2 | Tasks | Pending |
| PR-067-07 | P3 | Tasks | Pending |
| PR-067-08 | P3 | Tasks | Pending |
| PR-067-09 | P3 | Tasks | Pending |
| PR-067-10 | P3 | Tasks | Pending |
| PR-067-11 | P1/P2/Infra | Tasks | Pending |
| PR-067-12 | P1–P3 | Tasks | Pending |

**ID format:** `PR-067-xx` (alinhado às tarefas **T067-*** neste milestone).

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 requisitos; mapeamento spec ↔ tasks em [tasks.md](./tasks.md) (T067-1…T067-7).

| ID | Resumo |
|----|--------|
| PR-067-01 | `ai-service`: checkout sync-only por defeito (`CHECKOUT_ENQUEUE_TRAINING`). |
| PR-067-02 | `ai-service`: resposta de sync indica se treino foi enfileirado — contrato documentado. |
| PR-067-03 | `ai-service`: `ENABLE_DAILY_TRAIN` (ou equivalente) independente do checkout. |
| PR-067-04 | `api-service`: `expectedTrainingTriggered` alinhado a PR-067-01. |
| PR-067-05 | Métricas completas no `TrainingJob` terminal e/ou `model/status`. |
| PR-067-06 | `ModelTrainer`: épocas efectivas vs configuradas no resultado quando aplicável. |
| PR-067-07 | Frontend: delta Pos-Retreino = Com IA pré-promoção vs pós-promoção; um motor `buildRecommendationDeltaMap`. |
| PR-067-08 | Frontend: copy Pos-Retreino; retreino manual primário no painel. |
| PR-067-09 | Frontend: acção «Reiniciar» conforme ADR-067 §6. |
| PR-067-10 | Frontend (opcional): coluna Com Carrinho oculta/desactivada em modo demo. |
| PR-067-11 | Infra: `.env.example` / `docker-compose` / README com variáveis. |
| PR-067-12 | Testes: `ai-service`, `api-service`, E2E actualizados. |

---

## Success Criteria

- [ ] Critérios WHEN/THEN da ADR-067 satisfeitos ou deferidos com ADR de follow-up explícito.
- [ ] Gates: `ai-service` `npm run lint && npm test`; `api-service` `./mvnw test`; `frontend` lint + build + E2E conforme [.specs/codebase/frontend/TESTING.md](../../codebase/frontend/TESTING.md).
- [ ] [STATE.md](../../project/STATE.md) e [ROADMAP.md](../../project/ROADMAP.md) actualizados com estado **IMPLEMENTED** e data no fecho (**T067-7**).

---

## Verificação de fecho (checklist operacional)

- [ ] Todos os critérios da ADR-067 satisfeitos ou explicitamente deferidos com ADR de follow-up.
- [ ] Requisitos PR-067-01…12 verificados ou marcados N/A com justificação.
