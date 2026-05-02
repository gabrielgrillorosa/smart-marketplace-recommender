# M21 — Tarefas de implementação (ADR-070)

**Milestone:** **M21**  
**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**ADR:** [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md)  
**Testing ai-service:** [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)

**Status:** T21-1 (Track T1) implemented in `ai-service` (2026-05-01)  
**Ordem canónica:** T1 → A → T2 → R → T4 → T3

---

## Dependências entre fases

```text
T21-1 (T1) ─► T21-2 (A) ─► T21-3 (T2) ─► T21-4 (R) ─► T21-5 (T4) ─► T21-6 (T3) ─► T21-7 (cross)
```

- **Paralelo permitido:** revisão de docs / README após cada merge; **não** paralelizar T21-6 antes de T21-1 estar estável (baseline pairwise).
- **T21-6 (T3)** só deve arrancar quando **T21-1** tiver métricas aceites em pelo menos um cenário de referência.
- **Track T1** está decomposta em **T21-1a → … → T21-1h** (abaixo). **T21-1** considera-se **Done** quando todas as sub-tarefas estão verificadas.
- **Track A** está decomposta em **T21-2a → … → T21-2g** (secção T21-2). **T21-2** considera-se **Done** quando todas as sub-tarefas estão verificadas.

---

## T21-1 — Track **T1**: pairwise ranking loss + compatibilidade legacy (epic)

**Requirements:** M21-01 — M21-03 · **ADR:** [ADR-071](./adr-071-m21-neural-head-and-pure-fusion-boundary.md) (cabeça + manifest)

**Escopo epic:** `NEURAL_LOSS_MODE` com default `bce`; ramo **pairwise** em treino; cabeça neural alinhada treino/inferência; manifest / compatibilidade de artefacto; `precisionAt5` como gate narrativo inalterado.

### Plano de execução — só Track T1

```text
          ┌──► T21-1c ─► T21-1d ─► T21-1g ─┐
T21-1a ─► T21-1b ─┤                      ├──► T21-1f ─► T21-1h
                  └──► T21-1e [P] ────────┘
```

**Paralelismo:** após **T21-1b**, **T21-1e** pode correr em paralelo com **T21-1c** (sem dependências cruzadas). **T21-1f** só após **T21-1e** e **T21-1g**.

### Granularity check (TLC)

| Sub-tarefa | Âmbito | Status |
|------------|--------|--------|
| T21-1a | Parser env + wiring DI | ✅ |
| T21-1b | Factory cabeça neural | ✅ |
| T21-1c | Dataset / tensores pairwise | ✅ |
| T21-1d | Ramo compile/fit `ModelTrainer` | ✅ |
| T21-1e | Função pura score híbrido | ✅ |
| T21-1g | Manifest save/load + estado loja | ✅ |
| T21-1f | Call sites inferência | ✅ |
| T21-1h | README operador | ✅ |

### Diagram ↔ `Depends on` cross-check

| Sub-tarefa | Depends on (corpo) | Diagrama | Match |
|------------|---------------------|----------|-------|
| T21-1a | — | entrada | ✅ |
| T21-1b | T21-1a | após 1a | ✅ |
| T21-1c | T21-1b | após 1b | ✅ |
| T21-1d | T21-1c | após 1c | ✅ |
| T21-1e | T21-1b | após 1b ([P] com 1c) | ✅ |
| T21-1g | T21-1d | após 1d (resultado de treino com meta) | ✅ |
| T21-1f | T21-1e, T21-1g | após 1e e 1g | ✅ |
| T21-1h | T21-1f | após 1f | ✅ |

### Test co-location ([TESTING.md](../../codebase/ai-service/TESTING.md))

| Sub-tarefa | Camada | Matrix / convenção | Tests no corpo |
|------------|--------|-------------------|----------------|
| T21-1a | `config/env.ts` | Sem linha dedicada — novo módulo TS | unit (parser) |
| T21-1b | `neuralModelFactory` | Mesmo nível que código ML tocado pelo trainer | unit |
| T21-1c | `training-utils` | Igual suite existente `training-utils.test.ts` | unit |
| T21-1d | `ModelTrainer` | Matrix: unit em `model.test.ts` | unit |
| T21-1e | helper `src/ml/*` | Unit co-localizado | unit |
| T21-1g | `VersionedModelStore` | Matrix: `VersionedModelStore.test.ts` | unit |
| T21-1f | `RecommendationService`, `rankingEval` | Matrix: `recommend.test.ts`; `rankingEval` sem linha → unit novo ou extendido | unit |
| T21-1h | docs | N/A | N/A |

---

### T21-1a — Env `NEURAL_LOSS_MODE` + injecção

**What:** Parsear `NEURAL_LOSS_MODE` (`bce` \| `pairwise`) com default **`bce`**; exportar em `ENV`; injectar em `ModelTrainer` e `RecommendationService` via `src/index.ts` (e construtores) para leitura runtime alinhada ao [design](./design.md).

**Where:** `ai-service/src/config/env.ts`, `ai-service/src/index.ts`, assinaturas `ModelTrainer.ts`, `RecommendationService.ts`.

**Depends on:** —  
**Reuses:** Padrão de parse existente em `env.ts` (`PROFILE_POOLING_MODE`, etc.).

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Default `bce` se env ausente ou inválido (fail-fast documentado).
- [ ] Gate: `cd ai-service && npm test` exit 0.
- [ ] Contagem de testes ≥ baseline actual (sem remoções silenciosas).

**Tests:** unit (novo ficheiro `src/config/env.neuralLoss.test.ts` ou equivalente co-localizado).  
**Gate:** full package — `cd ai-service && npm test`

**Commit:** `feat(ai-service): add NEURAL_LOSS_MODE env and DI (M21 T21-1a)`

---

### T21-1b — Factory: cabeça `bce_sigmoid` vs `ranking_linear`

**What:** Estender `buildNeuralModel` (ou API equivalente) para seleccionar última camada **sigmoid** (legado) vs **linear** (pairwise), conforme modo de loss / tipo de cabeça acordado na implementação.

**Where:** `ai-service/src/ml/neuralModelFactory.ts` + **novo** `neuralModelFactory.test.ts`.

**Depends on:** T21-1a  
**Reuses:** Perfis `NeuralArchProfile` existentes.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Modo legado reproduz grafo actual para `baseline` (smoke: estrutura de camadas).
- [ ] Modo pairwise usa cabeça linear documentada.
- [ ] Gate: `npm test` exit 0; testes novos cobrem ambos os ramos.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): neural factory head for BCE vs pairwise (M21 T21-1b)`

---

### T21-1c — Dataset / tensores para pairwise

**What:** Produzir dados de treino compatíveis com TF.js para o ramo pairwise (ex. pares ou batch com labels para hinge / margin — **documentar formato exacto no PR**). Com `NEURAL_LOSS_MODE=bce`, o caminho **shall** reutilizar o fluxo actual `buildTrainingDataset` → tensores 2D iguais aos de hoje.

**Where:** `ai-service/src/services/training-utils.ts` (+ tipos exportados se necessário); `training-utils.test.ts`.

**Depends on:** T21-1b  
**Reuses:** `buildTrainingDataset` positivos/negativos; sem alterar semântica ADR-031/032 no modo BCE.

**Tools:** MCP: context7 (opcional, só se consultar API TF.js loss) · Skill: NONE

**Done when:**

- [ ] Modo BCE: propriedades de dataset alinhadas aos testes existentes (regressão verde).
- [ ] Modo pairwise: pelo menos um teste unitário com tensores de forma estável e reprodutível (`seed`).
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): pairwise training tensor builder (M21 T21-1c)`

---

### T21-1d — `ModelTrainer`: compile/fit/dispose ramo pairwise

**What:** Encaminhar `buildNeuralModel` + dataset conforme `NEURAL_LOSS_MODE`; `compile` com loss/metrics adequadas; `fit` com tensores pairwise ou BCE; manter `computePrecisionAtK` invocável pós-treino; incluir **metadata de cabeça** no resultado (`TrainingResult` ou campo paralelo consumido por **T21-1g**).

**Where:** `ai-service/src/services/ModelTrainer.ts`, `src/types/index.ts` (se estender tipo); `src/tests/model.test.ts`.

**Depends on:** T21-1c  
**Reuses:** Padrão dispose `xs`/`ys`; early stopping existente quando aplicável ao ramo BCE.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] `bce`: comportamento equivalente ao actual (loss/metrics/épocas dentro do esperado).
- [ ] `pairwise`: treino completa sem throw num fixture sintético mínimo.
- [ ] Gate: `npm test` exit 0.

**Tests:** unit (`model.test.ts`)  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): ModelTrainer pairwise branch (M21 T21-1d)`

---

### T21-1e — Helper puro: saída cabeça → score híbrido [P]

**What:** Função pura (ex. `src/ml/neuralHead.ts`) que mapeia output bruto do `predict` para o **mesmo tipo de escalar** que o híbrido esperava pré-M21 (ex. probabilidade em ]0,1[ via sigmoid sobre logit quando cabeça for linear). Cobre **M21-02**.

**Where:** novo módulo sob `ai-service/src/ml/` + `*.test.ts` adjacente.

**Depends on:** T21-1b  
**Reuses:** Nenhuma dependência TF no helper.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Tabela mínima entrada/saída documentada no JSDoc ou README técnico inline.
- [ ] Testes cobrem `bce_sigmoid` (identidade ou near-identidade) e `ranking_linear`.
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): pure neural head output for hybrid score (M21 T21-1e)`

---

### T21-1g — Manifest cabeça + `VersionedModelStore` load/save

**What:** Persistir sidecar (ex. `neural-head.json` junto ao diretório do modelo versionado) em `saveVersioned`; em `loadCurrent`, ler manifest — **ausência** implica cabeça legado `bce_sigmoid`; **mismatch** com política documentada (log + falha explícita ou estado degradado conforme [ADR-071](./adr-071-m21-neural-head-and-pure-fusion-boundary.md)). Expor getter no store para **T21-1f**.

**Where:** `ai-service/src/services/VersionedModelStore.ts`, `VersionedModelStore.test.ts`; possivelmente `ModelStore.ts`.

**Depends on:** T21-1d  
**Reuses:** `FsPort` para escrita leitura.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Novo modelo pairwise grava manifest legível.
- [ ] Load sem manifest não parte fluxo actual (backward compat).
- [ ] Testes cobrem pelo menos: sem manifest, com manifest matching, mismatch opcional conforme decisão de implementação.
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): versioned neural head manifest (M21 T21-1g)`

---

### T21-1f — Inferência: `RecommendationService` + `rankingEval`

**What:** Após `model.predict`, aplicar **T21-1e** usando cabeça obtida do store (**T21-1g**), não do env isolado — o env selecciona treino; o artefacto governa inferência. Garantir que `rankingEval` e caminho recomendação usam o **mesmo** helper.

**Where:** `RecommendationService.ts`, `rankingEval.ts`; `recommend.test.ts`; novo ou extendido teste para `rankingEval`.

**Depends on:** T21-1e, T21-1g  
**Reuses:** `tf.tidy()` boundary ADR-008.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Caminho BCE + modelo legado: scores alinhados aos testes existentes (tolerância numérica documentada se necessário).
- [ ] Pelo menos um caso cobre modelo cabeça linear + transformação.
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): apply neural head at inference and eval (M21 T21-1f)`

---

### T21-1h — README `ai-service` (operador T1)

**What:** Documentar `NEURAL_LOSS_MODE`, manifest, rollback (env + modelo anterior), e gate **`precisionAt5`** / promoção (`VersionedModelStore`) para **Track T1**.

**Where:** `ai-service/README.md` (secção M21 ou tabela env).

**Depends on:** T21-1f  
**Reuses:** Texto alinhado a [spec](./spec.md) P1.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Operador consegue seguir passos sem ler o código.
- [ ] Gate final Track T1: `cd ai-service && npm test` exit 0.

**Tests:** N/A  
**Gate:** `cd ai-service && npm test`

**Commit:** `docs(ai-service): M21 T1 NEURAL_LOSS_MODE and promotion gate (M21 T21-1h)`

---

**Epic T21-1 — Done when:** todas as caixas **T21-1a…h** fechadas + critério **M21-03** verificável (comparar `precisionAt5` vs baseline no mesmo protocolo ao promover).

**Antes de executar:** para cada sub-tarefa, confirmar ferramentas (MCPs / skills) em uso — padrão aqui é **NONE** excepto consulta opcional TF.js em **T21-1c**.

---

## T21-2 — Track **A**: atenção leve no estado do utilizador (ADR-065)

**Requirements:** M21-04 — M21-06 · **ADR:** [ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) (extensão; uma função, quatro eixos)

**Escopo epic:** modo opcional de agregação tipo **atenção leve** (softmax normalizado sobre pesos derivados de recência / parâmetros env). **Uma** implementação em `aggregateClientProfileEmbeddings` (ou helper puro no mesmo módulo) consumida por treino, `POST /recommend`, `recommendFromCart` e `rankingEval`. Default **idêntico** ao pooling M17 actual (`mean` / `exp`).

**Depends on (épico):** T21-1 **opcional** para merge (preferir sequência se os mesmos ficheiros — ex. `ModelTrainer` — estiverem quentes no branch).

### Plano de execução — só Track A

```text
                    ┌──► T21-2c [P] ──┐
T21-2a ─► T21-2b ───┼──► T21-2d [P] ──┼──► T21-2f ─► T21-2g
                    └──► T21-2e [P] ──┘
```

**Paralelismo:** após **T21-2b**, **T21-2c**, **T21-2d** e **T21-2e** podem correr em paralelo (call sites independentes). **T21-2f** só após **T21-2c**, **T21-2d** e **T21-2e** (anti-drift + smoke global).

### Granularity check (TLC)

| Sub-tarefa | Âmbito | Status |
|------------|--------|--------|
| T21-2a | Env + tipos `ProfilePoolingRuntime` / parsers / `ENV` / `index` | Pending |
| T21-2b | `aggregateClientProfileEmbeddings` + assinatura + testes agregação | Pending |
| T21-2c | `training-utils` (+ `model.test` se regressão) | Pending |
| T21-2d | `rankingEval` (+ testes co-localizados) | Pending |
| T21-2e | `RecommendationService` + `recommend.test` (+ `meanPooling` se aplicável) | Pending |
| T21-2f | Teste anti-drift / contrato ADR-065+M21 | Pending |
| T21-2g | README operador Track A | Pending |

### Diagram ↔ `Depends on` cross-check

| Sub-tarefa | Depends on (corpo) | Diagrama | Match |
|------------|---------------------|----------|-------|
| T21-2a | — | entrada | ✅ |
| T21-2b | T21-2a | após 2a | ✅ |
| T21-2c | T21-2b | ramo [P] após 2b | ✅ |
| T21-2d | T21-2b | ramo [P] após 2b | ✅ |
| T21-2e | T21-2b | ramo [P] após 2b | ✅ |
| T21-2f | T21-2c, T21-2d, T21-2e | após 2c–2e | ✅ |
| T21-2g | T21-2f | após 2f | ✅ |

### Test co-location ([TESTING.md](../../codebase/ai-service/TESTING.md))

| Sub-tarefa | Camada | Matrix / convenção | Tests no corpo |
|------------|--------|-------------------|----------------|
| T21-2a | `env` / `profilePoolingEnv` | Co-localizado `profilePoolingEnv.test.ts` | unit |
| T21-2b | `clientProfileAggregation` | Co-localizado `clientProfileAggregation.test.ts` | unit |
| T21-2c | `training-utils` / `ModelTrainer` | `src/tests/model.test.ts` | unit |
| T21-2d | `rankingEval` | Novo `rankingEval.test.ts` ou extensão `model.test.ts` | unit |
| T21-2e | `RecommendationService` | `src/tests/recommend.test.ts` | unit |
| T21-2f | contrato perfil | Vitest (smoke / lista canónica) | unit |
| T21-2g | docs | N/A | N/A |

---

### T21-2a — Env + tipos runtime de pooling (M21-05)

**What:** Estender `PROFILE_POOLING_MODE` (e/ou variáveis auxiliares documentadas em [design](./design.md) § Tech decisions) para incluir o modo **atenção leve**; parsear parâmetros configuráveis (ex. temperatura τ, janela máxima de entradas — **nomes finais na implementação**) com defaults que colapsam no comportamento **mean/exp** actual quando o modo novo está **desligado** ou ausente.

**Where:** `ai-service/src/config/profilePoolingEnv.ts`, `profilePoolingEnv.test.ts`, `ai-service/src/config/env.ts`, `ai-service/src/profile/clientProfileAggregation.ts` (apenas tipos `ProfilePoolingMode` / `ProfilePoolingRuntime` se movidos — preferir um único sítio canónico), `ai-service/src/index.ts` (objecto `ProfilePoolingRuntime` passado ao `ModelTrainer` e `RecommendationService`), `ai-service/src/types/index.ts` se `rankingConfig` expuser novos campos (PRS-29).

**Depends on:** —  
**Reuses:** Padrão fail-fast de `parseProfilePoolingMode` / `parseProfilePoolingHalfLifeDays`.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Deploy só com env legacy não altera valores efectivos vs baseline actual.
- [ ] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit (`profilePoolingEnv.test.ts` + ajustes mínimos em tipos se houver teste de compilação indirecta).  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): M21 A env and profile pooling runtime types (M21 T21-2a)`

---

### T21-2b — Núcleo: `aggregateClientProfileEmbeddings` (atenção leve + assinatura)

**What:** Implementar o ramo de agregação **atenção leve** (ex. softmax sobre scores de recência alinhados a `deltaDays` + parâmetros do runtime). Refactor recomendado: assinatura principal `aggregateClientProfileEmbeddings(entries, pooling: ProfilePoolingRuntime, logger?)` para o runtime transportar novos campos sem proliferar argumentos (actualizar recursão interna `exp` fallback). **Entre sub-tarefas:** pode manter-se sobrecarga ou wrapper com a assinatura legada `(entries, mode, halfLife, logger?)` delegando no objecto runtime até **T21-2c–e** migrarem, desde que `tsc`/`npm test` permaneçam verdes após **T21-2b**. Com modo legacy, saída **SHALL** coincidir numericamente com `mean` / `exp` actuais (M21-06).

**Where:** `ai-service/src/profile/clientProfileAggregation.ts`, `clientProfileAggregation.test.ts`.

**Depends on:** T21-2a  
**Reuses:** `deltaDaysUtc`, validação de dimensões existente.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Pelo menos um teste dourado para o novo modo (seed / valores fixos).
- [ ] Regressão: testes `mean` e `exp` existentes passam sem alterar semântica.
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): M21 A light attention branch in profile aggregation (M21 T21-2b)`

---

### T21-2c — Treino: `buildTrainingDataset` / `ModelTrainer` [P]

**What:** Substituir chamadas a `aggregateClientProfileEmbeddings` para passar o `ProfilePoolingRuntime` completo (ou assinatura acordada em T21-2b). Garantir que o `pooling` injectado no `ModelTrainer` chega ao dataset sem ramos duplicados.

**Where:** `ai-service/src/services/training-utils.ts`, `ai-service/src/services/ModelTrainer.ts` (se necessário), `ai-service/src/tests/model.test.ts`.

**Depends on:** T21-2b  
**Reuses:** `PurchaseTemporalIndex` existente.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] `PROFILE_POOLING_MODE` legacy: tensores de treino alinhados aos testes existentes (sem regressão silenciosa).
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): M21 A wire profile pooling runtime in training path (M21 T21-2c)`

---

### T21-2d — Offline eval: `rankingEval` [P]

**What:** Alinhar `computePrecisionAtK` (e assinaturas exportadas) ao mesmo `ProfilePoolingRuntime` / chamada única a `aggregateClientProfileEmbeddings` que treino e inferência.

**Where:** `ai-service/src/ml/rankingEval.ts`; **novo** `rankingEval.test.ts` (preferido) ou extensão mínima de `model.test.ts` se já existir cobertura cruzada.

**Depends on:** T21-2b  
**Reuses:** `buildClientPurchaseTemporalMap`, `deltaDaysUtc`.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Pelo menos um teste unitário cobre `computePrecisionAtK` com pooling legacy **e** um caso com modo atenção leve (ou propriedade estável documentada).
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): M21 A profile pooling in rankingEval (M21 T21-2d)`

---

### T21-2e — Inferência: `RecommendationService` + `recommendFromCart` [P]

**What:** Todas as vias que constroem `entries` + perfil (`POST /recommend`, `recommendFromCart`, helpers como `meanPooling` se ainda delegarem em `aggregateClientProfileEmbeddings`) usam o **mesmo** runtime injectado e a assinatura de T21-2b. Documentar no PR se algum caminho ficar intencionalmente excluído (ex. função utilitária puramente legada).

**Where:** `ai-service/src/services/RecommendationService.ts`, `ai-service/src/tests/recommend.test.ts`.

**Depends on:** T21-2b  
**Reuses:** `deltaDaysUtc`, queries Neo4j existentes para `lastPurchase`.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] `rankingConfig` reflecte novos campos quando o design os expuser (M21-05).
- [ ] Gate: `npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `feat(ai-service): M21 A profile pooling at inference and from-cart (M21 T21-2e)`

---

### T21-2f — Anti-drift: contrato «uma função, N call sites»

**What:** Satisfazer o finding de QA no [design](./design.md) Fase 4: teste ou módulo de contrato que **falhe** se novos caminhos agregarem perfil sem passar por `aggregateClientProfileEmbeddings` (ex. lista canónica de módulos importadores, ou grep guard em Vitest). Incluir nota em comentário ou `TESTING.md` se a política do repo evoluir.

**Where:** novo ficheiro sob `ai-service/src/profile/` ou `src/tests/` (nome final à escolha da implementação).

**Depends on:** T21-2c, T21-2d, T21-2e  
**Reuses:** —

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Existe uma verificação automatizada (lista canónica de módulos importadores, snapshot de imports, ou equivalente) alinhada ao código após **T21-2c–e**.
- [ ] O processo de actualização está documentado no próprio teste (como acrescentar um call site legítimo sem falsos positivos).
- [ ] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit  
**Gate:** `cd ai-service && npm test`

**Commit:** `test(ai-service): M21 A profile aggregation call-site contract (M21 T21-2f)`

---

### T21-2g — README `ai-service` (operador Track A)

**What:** Documentar modo atenção leve, tabela env alinhada a [spec](./spec.md) P2, interacção com `mean`/`exp`, retreino quando o perfil de treino mudar, e referência ao gate **M21-06** (baseline offline com feature off).

**Where:** `ai-service/README.md` (secção M17 P2 / M21 A).

**Depends on:** T21-2f  
**Reuses:** Texto existente de `PROFILE_POOLING_*`.

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [ ] Operador consegue activar/desactivar sem ler o código-fonte completo.
- [ ] Build gate do pacote ([TESTING.md](../../codebase/ai-service/TESTING.md)): `cd ai-service && npm run lint && npm run build && npm test` exit 0.

**Tests:** N/A  
**Gate:** `cd ai-service && npm run lint && npm run build && npm test`

**Commit:** `docs(ai-service): M21 A light attention profile pooling (M21 T21-2g)`

---

**Epic T21-2 — Done when:** todas as caixas **T21-2a…g** fechadas + critérios **M21-04** (default), **M21-05** (env), **M21-06** (regressão offline com feature off vs tolerância documentada) verificáveis.

**Antes de executar:** confirmar MCPs/skills por sub-tarefa — padrão **NONE**; consultar **context7** só se a API TF.js for tocada indirectamente (neste track, **não** esperado).

---

## T21-3 — Track **T2**: negativos mais duros

**What:** Opção de amostragem de negativos mais informativa (hard negatives), com seed reprodutível e default equivalente ao legado.

**Where:** Builder de exemplos de treino negativos.

**Depends on:** T21-1 (recomendado — mesma superfície de dataset).

**Requirements:** M21-07 — M21-08

**Done when:**

- [ ] `NEGATIVE_SAMPLING_MODE=legacy` (ou equivalente) equivale ao código actual.
- [ ] Modo novo documentado no README.

**Tests:** Vitest nos ratios ou propriedades de amostragem  
**Gate:** `npm test` em `ai-service`

**Commit:** `feat(ai-service): configurable hard negative sampling (M21 T2)`

---

## T21-4 — Track **R**: fusão híbrida dinâmica (sem retreino)

**What:** Modo `HYBRID_FUSION_MODE=dynamic` que ajusta pesos efectivos semantic/neural com base em heurística documentada (ex. dispersão do histórico). Modo `static` preserva env actual.

**Where:** `RecommendationService` ou módulo extraído de fusão.

**Depends on:** — (pode seguir T21-3)

**Requirements:** M21-09 — M21-10

**Done when:**

- [ ] Sem novo treino necessário para validar.
- [ ] Testes unitários da função de pesos.

**Tests:** Vitest  
**Gate:** `npm test` em `ai-service`

**Commit:** `feat(ai-service): optional dynamic hybrid fusion weights (M21 R)`

---

## T21-5 — Track **T4**: temperatura / calibração na inferência

**What:** `NEURAL_SCORE_TEMPERATURE` (default `1`) aplicado ao ramo neural antes da fusão; documentar interacção com `rankScore` / breakdown se existir.

**Where:** Caminho de score neural antes de combinar com semântica.

**Depends on:** T21-4 **opcional** (mesma área — ordenar merge para evitar conflitos).

**Requirements:** M21-11 — M21-12

**Done when:**

- [ ] Temperatura 1 é identidade.
- [ ] README atualizado.

**Tests:** Vitest  
**Gate:** `npm test` em `ai-service`

**Commit:** `feat(ai-service): neural score temperature for inference (M21 T4)`

---

## T21-6 — Track **T3**: loss híbrida BCE + pairwise

**What:** Combinar termos BCE e pairwise com coeficientes env; **só** após T21-1 baseline estável. Default desligado ou modo único como hoje.

**Where:** `ModelTrainer` + mesma extensão de dataset que T21-1.

**Depends on:** **T21-1** (obrigatório).

**Requirements:** M21-13 — M21-14

**Done when:**

- [ ] Coeficientes configuráveis; documentação de tuning mínima.
- [ ] Testes de regressão para “modo desligado”.

**Tests:** Vitest  
**Gate:** `npm test` em `ai-service`

**Commit:** `feat(ai-service): optional combined BCE+pairwise loss (M21 T3)`

---

## T21-7 — Encerramento: versão de artefacto, ROADMAP/STATE, `.env.example`

**What:** Documentar incompatibilidade de modelo se aplicável; sincronizar `.env.example` / `docker-compose` com novas variáveis; actualizar [ROADMAP](../../project/ROADMAP.md) e [STATE](../../project/STATE.md) para marcar M21 conforme progresso; checklist `precisionAt5` para operadores.

**Where:** Docs raiz do `ai-service`, specs de projecto.

**Depends on:** T21-1 … T21-6 (conforme entregas realizadas).

**Requirements:** M21-15 — M21-16

**Done when:**

- [ ] Tabela env completa no README.
- [ ] ROADMAP/STATE reflectem estado **SPECIFIED / IN PROGRESS / COMPLETE** coerente.

**Tests:** N/A (docs); opcional smoke `docker compose`  
**Gate:** conforme política do repositório (lint + testes dos pacotes tocados)

**Commit:** `docs(m21): env matrix and milestone closure (ADR-070)`
