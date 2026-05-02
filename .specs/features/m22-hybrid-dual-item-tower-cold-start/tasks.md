# M22 — Tarefas de implementação (ADR-074)

**Milestone:** **M22**  
**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**ADR:** [ADR-074](./adr-074-m22-milestone-hybrid-sparse-item-tower.md)  
**Testing ai-service:** [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)

**Status:** **Executed** — `ai-service` entrega flags (`M22_*`), extractor A/B/C, manifest `m22-item-manifest.json`, treino/inferência multi-input TF.js, eval slice cold-start (`rankingEval`), `npm run verify` verde (2026-05-02). Critérios de sucesso do spec (métricas em produção real / UAT) ficam para validação operador.

**Ordem canónica:** T22-1 → T22-2 → T22-3 → T22-4 → T22-5 → T22-6 → (T22-7 ∥ T22-8 ∥ T22-9) → T22-10

---

## Métrica de cold start (acordo em `tasks.md`)

Conforme [spec](./spec.md) (Success criteria, linha ~70):

| Métrica | Definição | Onde fechar |
|--------|-----------|-------------|
| **Principal** | `precisionAt5` num **slice** de interacções “primeira compra” em **marca ou categoria** fora do conjunto visto no seed de treino (protocolo alinhado a M20/M21, mesmo builder de dataset) | T22-8 + relatório curto no `ai-service/README.md` |
| **Secundária** | Estudo qualitativo controlado: ordem média / posição de itens OOV no top-5 em cenário de dev documentado (logs ou painel de análise, se disponível) | T22-8 (resultados descritos, não bloqueiam merge se gate principal estiver verde) |

---

## Plano de execução

### Fase 1 — Fundação (sequencial)

```text
T22-1 ─► T22-2 ─► T22-3 ─► T22-4 ─► T22-5 ─► T22-6
```

### Fase 2 — Documentação, eval e regressão (paralelo após T22-6)

```text
          ┌──► T22-7 [P] ──┐
T22-6 ────┼──► T22-8 [P] ──┼──► T22-10
          └──► T22-9 [P] ──┘
```

**Regra:** T22-7, T22-8, T22-9 **não** dependem entre si; só de **T22-6**. T22-10 depende de **T22-7**, **T22-8** e **T22-9**.

**Táctica de PR (design § *Nota de entrega*):** a ordem no código pode entregar **B** antes de **C** (`e_id` / ramo **C** = zero até C estar pronto) **sem** alterar o nó arquitectural alvo — apenas sequência de merges.

**Política manifest / flags (alinhado a [design.md](./design.md) *Error handling* + *Modelo de feature flags*):**

- **Master off** ou manifest totalmente em falta/incompatível → **M22 off** + log (como M21; fast-fail opcional no README).
- **Manifest parcial (só vocabulário B; C ausente ou C off no manifesto):** com sub-flag **C** desligada ou sem tabela **C** → **`e_id = 0`**; comportamento documentado (não estado inválido silencioso).
- **Sub-flags inválidas** (ex. **C** on sem **B** se a política for fail-fast): validação no **startup** ou matriz exacta no README — **T22-1**; nomes indicativos no design: **`M22_ENABLED`**, **`M22_STRUCTURAL`**, **`M22_IDENTITY`** (nomes finais confirmados em `env.ts` na implementação).

---

## Validação TLC (pré-aprovação)

### Granularity check

| Task | Âmbito | Status |
|------|--------|--------|
| T22-1 | Parser env: master + sub-flags B/C + validação startup | ✅ |
| T22-2 | Extractor único + sub-APIs A/B/C + `price_bucket` + testes | ✅ |
| T22-3 | Manifest / metadados loja | ✅ |
| T22-4 | `training-utils` + `ModelTrainer` ramo treino | ✅ |
| T22-5 | `neuralModelFactory` fusão TF | ✅ |
| T22-6 | `RecommendationService` + alinhamento inferência | ✅ |
| T22-7 | README + pesos híbridos (doc + hooks se necessário) | ✅ |
| T22-8 | Eval / `precisionAt5` + flag M22 | ✅ |
| T22-9 | Regressão numérica M22 off | ✅ |
| T22-10 | Verificação total + doc operador | ✅ |

### Diagram ↔ `Depends on` cross-check

| Task | Depends on (corpo) | Diagrama | Match |
|------|---------------------|----------|-------|
| T22-1 | — | início | ✅ |
| T22-2 | T22-1 | após 1 | ✅ |
| T22-3 | T22-2 | após 2 | ✅ |
| T22-4 | T22-2, T22-3 | após 2 e 3 | ✅ |
| T22-5 | T22-4 | após 4 | ✅ |
| T22-6 | T22-5 | após 5 | ✅ |
| T22-7 | T22-6 | ramo paralelo | ✅ |
| T22-8 | T22-6 | ramo paralelo | ✅ |
| T22-9 | T22-6 | ramo paralelo | ✅ |
| T22-10 | T22-7, T22-8, T22-9 | após paralelo | ✅ |

### Test co-location ([TESTING.md](../../codebase/ai-service/TESTING.md))

| Task | Camada / ficheiros | Matrix | Tests no corpo |
|------|---------------------|--------|----------------|
| T22-1 | `config/env.ts` | Convenção: novo módulo TS | unit |
| T22-2 | novo `src/ml/` ou `src/services/` extractor | Unit co-localizado | unit |
| T22-3 | `VersionedModelStore` + manifest | `VersionedModelStore.test.ts` | unit |
| T22-4 | `training-utils`, `ModelTrainer` | `model.test.ts` / `training-utils.test.ts` | unit |
| T22-5 | `neuralModelFactory` | `neuralModelFactory.test.ts` | unit |
| T22-6 | `RecommendationService` | `recommend.test.ts` | unit |
| T22-7 | docs / wiring mínimo | N/A se só markdown; se alterar serviço, mesmo que T22-6 | unit se código |
| T22-8 | `rankingEval` ou script eval | unit extendido ou test de integração leve | unit ou integration |
| T22-9 | regressão numérica | `recommend.test.ts` ou `model.test.ts` | unit |
| T22-10 | agregador | `npm run verify` | build (DoD) |

---

## Task breakdown

### T22-1 — Feature flags e env (default pré-M22)

**What:** Introduzir variáveis de ambiente conforme [design.md](./design.md) § *Modelo de feature flags*: **master** (ex. `M22_ENABLED`) default **off** (pré-M22 integral); **sub-flag** ramo **B** — prior estrutural (ex. `M22_STRUCTURAL`); **sub-flag** ramo **C** — identity (ex. `M22_IDENTITY`). **C** on **SHOULD** exigir **B** on ou fail-fast no startup; matriz permitida documentada no README (**T22-7** pode completar texto); parsing fail-safe; injecção em `index.ts` / construtores conforme M21.

**Where:** `ai-service/src/config/env.ts`, `ai-service/src/index.ts`, assinaturas que receberem o modo M22.

**Depends on:** —  
**Reuses:** Padrão `NEURAL_LOSS_MODE`, `PROFILE_POOLING_MODE` em `env.ts`.

**Requirement:** M22-01, **M22-10** (C opcional) · **Goals:** G3

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Com M22 **off** (default), nenhum ramo novo é activado sem env explícito.
- [x] Combinações inválidas B/C **rejeitadas** no startup ou documentadas com comportamento explícito (alinhado ao [design.md](./design.md)).
- [x] `cd ai-service && npm test` exit 0; contagem de testes ≥ baseline.
- [x] `cd ai-service && npm run build` exit 0.

**Tests:** unit (parser / defaults).  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): add M22 sparse item tower env flags (M22 T22-1)`

---

### T22-2 — Extractor partilhado: entradas **A / B / C** + OOV

**What:** Um módulo **puro** (TypeScript) alinhado a *Components* do design — contrato indicativo **`itemRepresentationInputs`**: produto → `{ textForHF, structuralKeys, idKey }` **sem** misturar B com C numa estrutura opaca. **(A)** texto para HF; **(B)** só brand, category, subcategory (opcional/derivado alinhado ao catálogo), **price_bucket** (derivado de `price` com bins versionados — ver manifest T22-3); **nunca** `product_id` em B; **(C)** `product_id` + OOV **independente** de B. Exportar `SCHEMA_VERSION` e políticas OOV.

**Where:** Novo ficheiro sob `ai-service/src/ml/` ou `ai-service/src/services/` (nome final na implementação), testes co-localizados.

**Depends on:** T22-1  
**Reuses:** Tipos de produto Neo4j/API existentes; sem misturar B e C na mesma estrutura opaca.

**Requirement:** M22-02, M22-03, **M22-08**, **M22-09**, **M22-10** (contrato de extractor) · **Goals:** G2

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] OOV tratado de forma explícita e testada (casos conhecidos + token desconhecido).
- [x] Esquema da feature documentado num comentário ou constante `SCHEMA_VERSION`.
- [x] Gate: `cd ai-service && npm test` exit 0.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): shared sparse item feature extractor with OOV (M22 T22-2)`

---

### T22-3 — Manifest M22 + `VersionedModelStore`

**What:** Persistir **dois** vocabulários / dimensões esparsas (**B** vs **C**, tabelas **disjoint**), políticas OOV separadas, **bins de `price_bucket` estáveis + versão** (anti-leakage, [design.md](./design.md) *Data models* / *Tech decisions*), **metadados da fusão `f`** (forma e dimensões — TBD na implementação, ex. concat+MLP), e versão M22 junto do artefacto (`neural-head.json` estendido **ou** `m22-item-manifest.json` sidecar — escolher e documentar); `VersionedModelStore` + rollback; manifesto declara explicitamente se **C** está off (compatível com só-B no disco).

**Where:** `ai-service/src/services/VersionedModelStore.ts`, rotinas de save/load do trainer, testes em `VersionedModelStore.test.ts`.

**Depends on:** T22-2  
**Reuses:** Padrão ADR-071 sidecars / manifest M21.

**Requirement:** M22-06, **M22-08**, **M22-10** · **Goals:** G2, G4

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Manifest em falta / mismatch grave → **master M22 off** + log (alinhado ao spec).
- [x] Cenário **só B** (vocabulário C ausente ou C declarado off): runtime aplica **`e_id = 0`** sem assumir tabela **C** ([design.md](./design.md) *Error handling*).
- [x] Testes de loja actualizados; `npm test` verde.
- [x] `npm run build` verde.

**Tests:** unit (`VersionedModelStore`)  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): M22 sparse manifest and versioned store metadata (M22 T22-3)`

---

### T22-4 — Dataset de treino + `ModelTrainer` (caminho esparsa)

**What:** Construir vocabulários no **fit**, integrar `buildTrainingDataset` / `seedFromClientIds` com o **mesmo** extractor que inferência; tensores alinhados ao novo subgraph (sem activar fusão final até T22-5 se o código exigir ordem estrita — preferir entrega incremental com feature flag).

**Where:** `ai-service/src/services/training-utils.ts`, `ai-service/src/services/ModelTrainer.ts`, `ai-service/src/tests/model.test.ts` (ou equivalente).

**Depends on:** T22-2, T22-3  
**Reuses:** `buildTrainingDataset`, pipelines M21 existentes.

**Requirement:** M22-04 (treino) · **Goals:** G1, G2

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Com M22 off, dataset idêntico ao comportamento anterior (teste de regressão ou diff de forma documentada).
- [x] Com M22 on, linhas de treino incluem features esparsas coerentes com manifest.
- [x] `npm test` no pacote `ai-service` verde.

**Tests:** unit (`ModelTrainer` / `training-utils`)  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): training dataset and ModelTrainer sparse item path (M22 T22-4)`

---

### T22-5 — `neuralModelFactory`: **B** e **C** disjuntos + **f** com HF **(A)**

**What:** Subgrafos TF.js: **tabela(s) de embedding só para (B)** e **tabela separada para (C)** quando activo; **e_sem** do HF **sem** misturar brand/category/price no encoder; fusão explícita **f(u, e_sem, e_struct, e_id)** (ex. concat + MLP) **antes** do score; memória TF alinhada ADR-008 (`tf.tidy`).

**Where:** `ai-service/src/ml/neuralModelFactory.ts`, `neuralModelFactory.test.ts`.

**Depends on:** T22-4  
**Reuses:** `buildNeuralModel`, blocos MLP actuais.

**Requirement:** M22-01, M22-04, **M22-08**, **M22-09**, **M22-10** · **Goals:** G1

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Forward training + inferência usam a mesma geometria quando M22 on.
- [x] Testes unitários do factory cobrem ramo M22 off (baseline) e M22 on (forma de tensores).
- [x] `npm test` verde.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `feat(ai-service): TF.js sparse item tower fusion with HF branch (M22 T22-5)`

---

### T22-6 — `RecommendationService`: inferência e alinhamento carrinho

**What:** Caminho `predict` (e carrinho / rerank) usa **obrigatoriamente** o extractor de T22-2 e manifest de T22-3; mesma composição **f(u, e_sem, e_struct, e_id)** que `buildTrainingDataset` com M22 activo.

**Where:** `ai-service/src/services/RecommendationService.ts`, `ai-service/src/tests/recommend.test.ts`.

**Depends on:** T22-5  
**Reuses:** Orquestração `semanticScore` existente (cosine em **e_sem** vs perfil — ADR-016).

**Requirement:** M22-04, **M22-09** · **Goals:** G2

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Um teste (ou fixture) demonstra alinhamento produto → índices entre dataset simulado e serviço.
- [x] `recommend.test.ts` actualizado; `npm test` verde.

**Tests:** unit  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): RecommendationService M22 item vector alignment (M22 T22-6)`

---

### T22-7 — Fusão híbrida neural + semântica e README [P]

**What:** Garantir que pesos `semanticScore` / breakdown permanecem **configuráveis**; **cosine ADR-016** em **e_sem** vs perfil (diagrama design); documentar no `ai-service/README.md` envs **`M22_ENABLED` / `M22_STRUCTURAL` / `M22_IDENTITY`** (ou nomes finais), **matriz permitida** B/C, e secção **Operador: rollback M22** (ordem de desligar master vs sub-flags, promoção).

**Where:** `ai-service/README.md`, ajustes mínimos em config se o spec exigir documentação de parâmetros.

**Depends on:** T22-6  
**Reuses:** ADR-016, documentação M21.

**Requirement:** M22-05 · **Goals:** G3

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] README descreve fusão (neural + **semanticScore** em **e_sem**), **três vias** A/B/C ao nível operador, e rollback.
- [x] README inclui **matriz** master + B + C (combinações válidas / fail-fast).
- [x] Se houver alteração de código, `npm test` verde; senão revisão estática.

**Tests:** N/A se só documentação; senão unit conforme camada alterada.  
**Gate:** full se código — `cd ai-service && npm run lint && npm test`  
**Commit:** `docs(ai-service): M22 hybrid score and operator rollback (M22 T22-7)`

---

### T22-8 — Eval `precisionAt5` + slice cold start [P]

**What:** Alinhar avaliação (ex. `rankingEval` ou script usado no gate) com **mesmo** protocolo M20/M21. Cobrir **matriz de flags** do design (*Components* / eval): pelo menos cenários documentados **A só** (esparsa off), **A+B** (estrutural on, identity off), **A+B+C** (quando C estiver implementado) — `precisionAt5` global + **slice** “primeira compra” / OOV (tabela de métricas acima); documentar comandos no README.

**Where:** Ficheiros de eval existentes em `ai-service/src/` (grep `precisionAt5`), possível extensão de CLI.

**Depends on:** T22-6  
**Reuses:** Dataset builder, tolerância `VersionedModelStore`.

**Requirement:** G4, Success criteria (métrica principal) · **Goals:** G4

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Gate narrativo: novo modelo não promovido sem cumprir política de `precisionAt5` (já existente) **e** relatório do slice documentado.
- [x] Resultados ou testes automatizados distinguem **A só** vs **A+B** vs **A+B+C** conforme disponibilidade do código na altura do merge (mínimo: A só + A+B antes de declarar C completo).
- [x] Smoke script / comandos documentados passam localmente.

**Tests:** unit ou integration conforme ficheiros tocados (matrix).  
**Gate:** full — `cd ai-service && npm run lint && npm test`  
**Commit:** `feat(ai-service): M22 precisionAt5 eval and cold-start slice (M22 T22-8)`

---

### T22-9 — Regressão numérica: M22 off ≡ baseline [P]

**What:** Testes automáticos que fixam que, com M22 desligado, scores / forma de output coincidem com tolerância definida no projecto (espelhar testes M21/M20 de baseline).

**Where:** `recommend.test.ts` e/ou `model.test.ts`.

**Depends on:** T22-6  
**Reuses:** Fixtures existentes.

**Requirement:** M22-07 · **Goals:** G3

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] Asserções numéricas estáveis (seeds fixos).
- [x] `npm test` verde.

**Tests:** unit  
**Gate:** quick — `cd ai-service && npm test`  
**Commit:** `test(ai-service): M22-off numerical regression vs baseline (M22 T22-9)`

---

### T22-10 — Build gate e DoD do milestone

**What:** Fechar milestone: `npm run verify` no `ai-service`, actualizar [STATE.md](../../project/STATE.md) e [ROADMAP.md](../../project/ROADMAP.md) quando M22 for marcado completo; checklist de success criteria do [spec](./spec.md).

**Where:** Repo docs + verificação final.

**Depends on:** T22-7, T22-8, T22-9  
**Reuses:** —

**Requirement:** Success criteria (documentação operador, rollback) · **Goals:** todos

**Tools:** MCP: NONE · Skill: NONE

**Done when:**

- [x] `cd ai-service && npm run verify` exit 0 (build + test + lint).
- [x] Nenhum teste removido silenciosamente; contagens registadas.
- [x] STATE / ROADMAP actualizados para **IMPLEMENTED** no `ai-service` (2026-05-02); fecho formal «COMPLETE» no produto após UAT / gate `precisionAt5` em staging.

**Tests:** (agregação de todas as suites)  
**Gate:** **build / DoD** — `cd ai-service && npm run verify`

**Commit:** `chore(ai-service): complete M22 verification and milestone docs (M22 T22-10)`

---

## Parallel execution map

| Phase | Tasks | Notas |
|-------|-------|------|
| 1 | T22-1 … T22-6 | Sequencial obrigatório (flags → extractor A/B/C → manifest B≠C + `f` meta → treino → TF **B**/**C** disjuntos + **f** → inferência). Pode entregar-se **B** antes de **C** com `e_id = 0` (nota de entrega no design). |
| 2 | T22-7, T22-8, T22-9 | `[P]` — ficheiros distintos; Vitest parallel-safe per TESTING.md. |
| 3 | T22-10 | Após as três anteriores. |

---

## Rastreio spec

| Requirement | Tasks |
|-------------|-------|
| M22-01 | T22-1, T22-5 |
| M22-02 | T22-2 |
| M22-03 | T22-2 |
| M22-04 | T22-4, T22-5, T22-6 |
| M22-05 | T22-7 |
| M22-06 | T22-3 |
| M22-07 | T22-9 |
| M22-08 | T22-2, T22-3, T22-5 |
| M22-09 | T22-2, T22-5, T22-6 |
| M22-10 | T22-1, T22-2, T22-3, T22-5, T22-7 |
| G4 / gate | T22-3, T22-8, T22-10 |

---

_Fim das tarefas M22._
