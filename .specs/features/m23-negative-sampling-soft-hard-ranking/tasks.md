# M23 — Tarefas de implementação (negative sampling soft + hard)

**Milestone:** **M23**  
**RFC:** [rfc.md](./rfc.md)  
**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**Testing ai-service:** [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)

**Status:** Verified (executed, gates green, 2026-05-04)  
**Ordem canónica:** T23-1 → T23-2 → T23-3 → T23-4 → T23-5 → (T23-6 ∥ T23-7) → T23-8 → T23-9

---

## Plano de execução

### Fase 1 — Fundação do sampler estratificado (sequencial)

```text
T23-1 ─► T23-2 ─► T23-3 ─► T23-4 ─► T23-5
```

### Fase 2 — Wiring de treino e benchmark (paralelo após T23-5)

```text
          ┌──► T23-6 [P] ──┐
T23-5 ────┼──► T23-7 [P] ──┼──► T23-8 ─► T23-9
```

**Regra:** T23-6 e T23-7 não dependem entre si; ambas dependem apenas de **T23-5**. T23-8 depende de **T23-6** e **T23-7**. T23-9 é o gate final do milestone.

---

## Validação TLC (pré-aprovação)

### Granularity check

| Task | Âmbito | Status |
|------|--------|--------|
| T23-1 | Parser/env runtime M23 + validação de thresholds | ✅ |
| T23-2 | Helper puro de soft cleanup minimalista | ✅ |
| T23-3 | Helper puro de bucketização hard/medium/easy | ✅ |
| T23-4 | Seletor determinístico + telemetria do sampler | ✅ |
| T23-5 | Integração em `training-utils` + compat BCE/pairwise/M22 | ✅ |
| T23-6 | Wiring em `ModelTrainer` + logs/metadata de sampling | ✅ |
| T23-7 | Métricas de ranking + harness de benchmark M23 | ✅ |
| T23-8 | README/playbook operador + env matrix M23 | ✅ |
| T23-9 | Build gate + sincronização `ROADMAP` / `STATE` / links | ✅ |

### Diagram ↔ `Depends on` cross-check

| Task | Depends on (corpo) | Diagrama | Match |
|------|---------------------|----------|-------|
| T23-1 | — | entrada | ✅ |
| T23-2 | T23-1 | após T23-1 | ✅ |
| T23-3 | T23-2 | após T23-2 | ✅ |
| T23-4 | T23-3 | após T23-3 | ✅ |
| T23-5 | T23-4 | após T23-4 | ✅ |
| T23-6 | T23-5 | ramo paralelo após T23-5 | ✅ |
| T23-7 | T23-5 | ramo paralelo após T23-5 | ✅ |
| T23-8 | T23-6, T23-7 | após ramos paralelos | ✅ |
| T23-9 | T23-8 | após T23-8 | ✅ |

### Test co-location ([TESTING.md](../../codebase/ai-service/TESTING.md))

| Task | Camada / ficheiros | Matrix / convenção | Tests no corpo |
|------|---------------------|--------------------|----------------|
| T23-1 | `src/config/negativeSamplingEnv.ts`, `src/config/env.ts` | Novo módulo TS em `config/` -> unit co-localizado | unit |
| T23-2 | novo helper `src/services/negativeSamplingSoftCleanup.ts` | Novo helper TS -> unit co-localizado | unit |
| T23-3 | novo helper `src/services/negativeSamplingBuckets.ts` | Novo helper TS -> unit co-localizado | unit |
| T23-4 | novo helper `src/services/negativeSamplingSelector.ts` | Novo helper TS -> unit co-localizado | unit |
| T23-5 | `src/services/training-utils.ts` | Matrix: `training-utils.test.ts` / Vitest unit | unit |
| T23-6 | `src/services/ModelTrainer.ts` | Matrix: `src/tests/model.test.ts` | unit |
| T23-7 | `src/ml/rankingEval.ts`, `src/benchmark/*` | Matrix: `rankingEval.test.ts`; benchmark TS segue convenção Vitest unit | unit |
| T23-8 | `ai-service/README.md`, `.env.example` | Documentação -> none | none |
| T23-9 | gate do pacote + docs de projeto | DoD final: `npm run verify` + revisão documental | build |

---

## Task breakdown

### T23-1 — Env e contrato runtime `legacy|stratified`

**What:** Introduzir o contrato runtime de M23 com parsing dedicado para `NEGATIVE_SAMPLING_MODE`, `SOFT_NEGATIVE_MAX_SIM`, `HARD_NEGATIVE_MIN_SIM`, `MEDIUM_NEGATIVE_MIN_SIM` e `M23_BENCHMARK_RUNS`, validando ranges incoerentes antes de treino/benchmark e mantendo `legacy` como default operacional.

**Where:** `ai-service/src/config/negativeSamplingEnv.ts`, `ai-service/src/config/negativeSamplingEnv.test.ts`, `ai-service/src/config/env.ts`, `ai-service/src/index.ts`

**Depends on:** —  
**Reuses:** `ai-service/src/config/m22Env.ts`, `ai-service/src/config/neuralLossEnv.ts`

**Requirement:** M23-01, M23-06, M23-12  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `NEGATIVE_SAMPLING_MODE` aceita apenas `legacy | stratified`, com default `legacy`.
- [x] `SOFT_NEGATIVE_MAX_SIM`, `HARD_NEGATIVE_MIN_SIM` e `MEDIUM_NEGATIVE_MIN_SIM` são parseados com defaults do design (`0.92`, `0.70`, `0.40`) e rejeitam ranges incoerentes.
- [x] `M23_BENCHMARK_RUNS` aplica mínimo `2` para o protocolo offline.
- [x] Gate: `cd ai-service && npm test` exit 0; contagem de testes >= baseline actual.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): add M23 negative sampling env contract (T23-1)`

---

### T23-2 — Soft cleanup minimalista e preciso

**What:** Extrair um helper puro para remover do pool negativo apenas equivalências reais: `same product_id`, mesma família de SKU quando derivável, variações triviais fechadas/documentadas e candidatos acima de `SOFT_NEGATIVE_MAX_SIM`, sem reintroduzir a exclusão ampla por categoria + fornecedor ou por threshold baixo.

**Where:** `ai-service/src/services/negativeSamplingSoftCleanup.ts`, `ai-service/src/services/negativeSamplingSoftCleanup.test.ts`

**Depends on:** T23-1  
**Reuses:** `ProductDTO` e `cosineSimilarity` hoje embutidos em `ai-service/src/services/training-utils.ts`

**Requirement:** M23-02, M23-03, M23-04, M23-05  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Duplicata exata por `product_id` é removida do pool negativo.
- [x] Casos de mesma família de SKU e variações triviais permitidas são excluídos apenas quando a heurística fechada consegue derivá-los com segurança.
- [x] Itens semanticamente próximos, mas não equivalentes estruturalmente, continuam elegíveis para bucketização.
- [x] Ausência de `skuFamilyKey`, `brand` ou metadata estrutural não amplia o escopo de exclusão.
- [x] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): add M23 minimal soft cleanup helper (T23-2)`

---

### T23-3 — Bucketização `hard/medium/easy` com prioridade estrutural

**What:** Criar o classificador de candidatos estratificados com `bucket`, `bucketReason` e flags estruturais (`sameCategory`, `sameSupplier`, `sameBrand?`, cobertura intra-categoria), promovendo `same category + supplier/brand` a fonte de `hard negatives` em vez de regra global de exclusão.

**Where:** `ai-service/src/services/negativeSamplingBuckets.ts`, `ai-service/src/services/negativeSamplingBuckets.test.ts`

**Depends on:** T23-2  
**Reuses:** `ProductDTO`, embeddings do pool e thresholds de T23-1

**Requirement:** M23-11, M23-12, M23-15  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `hard`, `medium` e `easy` seguem as faixas default do design, parametrizadas por runtime.
- [x] `same category + supplier/brand` deixa de excluir e passa a elevar prioridade do bucket `hard`.
- [x] O candidato preserva metadata suficiente para o guardrail M22/ID tower (`intraCategoryAvailable`, sinais estruturais, razão do bucket).
- [x] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): add M23 stratified bucket classifier (T23-3)`

---

### T23-4 — Seletor determinístico `1/2/1` + telemetria

**What:** Implementar a seleção determinística por bucket com alvo `1 hard + 2 medium + 1 easy`, fallback explícito (`hard -> melhor medium`, depois próximo candidato disponível), desempate estável por prioridade estrutural/similaridade/`productId` e telemetria mínima por positivo/run.

**Where:** `ai-service/src/services/negativeSamplingSelector.ts`, `ai-service/src/services/negativeSamplingSelector.test.ts`

**Depends on:** T23-3  
**Reuses:** `seedFromClientIds` / estratégia determinística já usada em `training-utils.ts`

**Requirement:** M23-07, M23-08, M23-09, M23-10, M23-13, M23-14  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Buckets completos geram exactamente a distribuição `1 hard + 2 medium + 1 easy` por positivo.
- [x] Na falta de `hard`, o slot é preenchido pelo melhor `medium`; na falta de `medium/easy`, o fallback mantém ordem determinística e não duplica item.
- [x] A mesma `seed` e configuração produzem a mesma composição e a mesma ordem final.
- [x] A telemetria agrega pelo menos `hardAvailable`, `hardSelected`, `intraCategoryAvailable`, `intraCategorySelected`, uso de fallback, `mode` e `seed`.
- [x] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): add M23 deterministic selector and telemetry (T23-4)`

---

### T23-5 — `training-utils` como orquestrador `legacy|stratified`

**What:** Integrar os helpers T23-2/T23-3/T23-4 em `buildTrainingDataset`, preservando o caminho pré-M23 em `legacy`, emitindo dataset compatível com BCE/pairwise/M22 e aplicando o guardrail intra-categoria quando `identityEnabled` estiver activo.

**Where:** `ai-service/src/services/training-utils.ts`, `ai-service/src/services/training-utils.test.ts`

**Depends on:** T23-4  
**Reuses:** `buildTrainingDataset`, `rowForProduct`, `seedFromClientIds`, contrato M22 existente

**Requirement:** M23-05, M23-06, M23-07, M23-08, M23-09, M23-10, M23-11, M23-13, M23-14, M23-15  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `NEGATIVE_SAMPLING_MODE=legacy` reproduz o comportamento anterior sem regressão inesperada no formato do dataset.
- [x] `NEGATIVE_SAMPLING_MODE=stratified` usa soft cleanup minimalista, buckets e seletor determinístico sem quebrar o contrato baseline ou M22.
- [x] Quando `identityEnabled` estiver activo e houver candidatos intra-categoria após soft cleanup, pelo menos um sobrevive entre os negativos escolhidos; quando não houver, isso aparece em telemetria/log.
- [x] `training-utils.test.ts` cobre `legacy`, `stratified`, fallbacks e cenários M22 com/sem identidade.
- [x] Gate: `cd ai-service && npm run lint && npm test` exit 0.

**Tests:** unit  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): integrate M23 stratified sampling into training-utils (T23-5)`

---

### T23-6 — Wiring de treino e logs de sampling [P]

**What:** Fazer o `ModelTrainer` consumir o runtime M23, incluir `mode/config/seed/telemetry summary` no fluxo de treino e deixar a comparação `legacy` vs `stratified` visível nos artefactos/logs de execução, mantendo rollback operacional por env/modelo legado.

**Where:** `ai-service/src/services/ModelTrainer.ts`, `ai-service/src/tests/model.test.ts`, `ai-service/src/types/index.ts` (se necessário)

**Depends on:** T23-5  
**Reuses:** padrões existentes de métricas e logging em `ModelTrainer.ts`

**Requirement:** M23-14, M23-19  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] O trainer recebe e usa explicitamente o runtime M23 em vez de ler thresholds ad hoc no meio do loop.
- [x] Logs/resultado de treino expõem ao menos `samplingMode`, thresholds activos, `seed` e resumo da telemetria de composição/fallback.
- [x] `legacy` continua o caminho default e não exige mudança de código para rollback.
- [x] Gate: `cd ai-service && npm run lint && npm test` exit 0.

**Tests:** unit  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): wire M23 sampling runtime into training flow (T23-6)`

---

### T23-7 — Métricas de ranking e benchmark M23 [P]

**What:** Estender `rankingEval` com métricas orientadas a ranking real (`NDCG@K`, `MRR`, `pairwise accuracy within category` ou equivalente documentado, slice cold-start/top-N) e criar o harness M23 reutilizando o benchmark M22 para comparar `legacy` vs `stratified` em pelo menos `2` runs por configuração, no mesmo dataset e com seeds documentadas.

**Where:** `ai-service/src/ml/rankingEval.ts`, `ai-service/src/ml/rankingEval.test.ts`, `ai-service/src/benchmark/m23SamplingBenchmark.ts`, `ai-service/src/benchmark/benchmarkShared.ts` (se necessário)

**Depends on:** T23-5  
**Reuses:** `ai-service/src/benchmark/m22ArchBenchmark.ts`, `benchmarkShared.ts`, `computePrecisionAtK*`

**Requirement:** M23-16, M23-17, M23-18, M23-19  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `rankingEval` reporta `precisionAtK`, `NDCG@K`, `MRR`, métrica intra-categoria e o slice cold-start/top-N acordado.
- [x] O benchmark M23 executa `legacy` e `stratified` sob o mesmo protocolo, com pelo menos `2` runs por configuração e seeds explícitas.
- [x] O relatório do benchmark inclui `samplingMode`, seeds, métricas de ranking e resumo de bucket telemetry suficiente para decisão de rollout.
- [x] Há pelo menos um cenário com M22/ID tower desactivado e outro com identidade activa quando o artefacto estiver disponível.
- [x] Gate: `cd ai-service && npm run lint && npm test` exit 0.

**Tests:** unit  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): add M23 ranking metrics and benchmark harness (T23-7)`

---

### T23-8 — README operador, env matrix e playbook de rollback

**What:** Documentar no `ai-service` como activar `stratified`, como voltar a `legacy`, quais métricas/telemetria observar, como ler o benchmark M23 e como o marco convive com M21/M22 sem os revogar.

**Where:** `ai-service/README.md`, `.env.example` (se necessário)

**Depends on:** T23-6, T23-7  
**Reuses:** secções de rollout/rollback já existentes para M21 e M22

**Requirement:** M23-19, M23-20, M23-22  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] README inclui tabela de envs M23, comandos de benchmark e passos explícitos de rollback para `legacy`.
- [x] O operador consegue responder, só pela documentação, quando manter `legacy` desligado/ligado e quais sinais bloqueiam promoção.
- [x] A relação com M21/M22 fica explícita: M23 melhora sampling, não substitui marcos anteriores.
- [x] Se `.env.example` mudar, os nomes/defaults ficam alinhados ao parser de T23-1.

**Tests:** none  
**Gate:** revisão estática; se houver código tocado no pacote, `cd ai-service && npm run lint && npm test`  
**Commit:** `docs(ai-service): add M23 rollout and rollback playbook (T23-8)`

---

### T23-9 — Build gate e sincronização documental do marco

**What:** Fechar o milestone documentalmente: correr a verificação total do `ai-service`, ligar `design.md` <-> `tasks.md`, e actualizar `ROADMAP.md` / `STATE.md` para reflectir que M23 já está em `spec + design + tasks`, ficando pronto para `execute`.

**Where:** `smart-marketplace-recommender/.specs/features/m23-negative-sampling-soft-hard-ranking/design.md`, `smart-marketplace-recommender/.specs/project/ROADMAP.md`, `smart-marketplace-recommender/.specs/project/STATE.md`

**Depends on:** T23-8  
**Reuses:** padrão de fecho documental visto em M21/M22

**Requirement:** M23-20, M23-21, M23-22  
**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `cd ai-service && npm run verify` exit 0.
- [x] Nenhum teste é removido silenciosamente; a suite final continua verde com build + test + lint.
- [x] `design.md`, `tasks.md`, `ROADMAP.md` e `STATE.md` apontam uns para os outros sem estado divergente.
- [x] O próximo passo do milestone fica explícito como rollout operacional / benchmark, não mais `design/tasks`.

**Tests:** build  
**Gate:** DoD — `cd ai-service && npm run verify`  
**Commit:** `chore(m23): verify milestone and sync planning docs (T23-9)`

---

## Parallel execution map

| Phase | Tasks | Notas |
|-------|-------|------|
| 1 | T23-1 … T23-5 | Sequencial obrigatório: contrato env -> soft cleanup -> bucketização -> seletor -> orquestração em `training-utils`. |
| 2 | T23-6, T23-7 | `[P]` permitido: ambos dependem só de T23-5; Vitest unit é parallel-safe segundo `TESTING.md`. |
| 3 | T23-8 | Consolida docs/playbook a partir do wiring e do benchmark. |
| 4 | T23-9 | Build gate + sincronização `ROADMAP` / `STATE` / links do milestone. |

---

## Rastreio spec

| Requirement | Tasks |
|-------------|-------|
| M23-01 | T23-1 |
| M23-02 | T23-2 |
| M23-03 | T23-2 |
| M23-04 | T23-2 |
| M23-05 | T23-2, T23-5 |
| M23-06 | T23-1, T23-5 |
| M23-07 | T23-4, T23-5 |
| M23-08 | T23-4, T23-5 |
| M23-09 | T23-4, T23-5 |
| M23-10 | T23-4, T23-5 |
| M23-11 | T23-3, T23-5 |
| M23-12 | T23-1, T23-3 |
| M23-13 | T23-4, T23-5 |
| M23-14 | T23-4, T23-5, T23-6 |
| M23-15 | T23-3, T23-5, T23-7 |
| M23-16 | T23-7 |
| M23-17 | T23-7 |
| M23-18 | T23-1, T23-7 |
| M23-19 | T23-1, T23-6, T23-7, T23-8 |
| M23-20 | T23-8, T23-9 |
| M23-21 | T23-9 |
| M23-22 | T23-5, T23-8, T23-9 |

---

**Durante a execução:** não foi necessário MCP adicional; `user-context7` permaneceu dispensável porque a implementação e a documentação usaram apenas código e artefactos locais do repositório.

---

_Fim das tarefas M23._
