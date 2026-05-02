# M21 — Evolução de ranking, perfil e fusão híbrida (decisões do comité)

**Status:** SPECIFIED (prioridades **T1 → A → T2 → R → T4 → T3**; execução por [tasks](./tasks.md))  
**Data:** 2026-05-01  
**ADR canónico:** [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md)

---

## Problem Statement

O roadmap **[ADR-062](../m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md)** prevê **M17 P3** (atenção temporal no MLP), mas o volume de dados do demo não justifica essa complexidade no curto prazo. Em paralelo, o comité identificou melhorias incrementais (**pairwise loss**, **atenção leve no estado do utilizador**, **negativos mais duros**, **reponderação híbrida**, **calibração**) que podem subir **métricas top-K** e narrativa didáctica **sem** substituir formalmente o P3. Falta um milestone que una essas entregas com **flags**, **gates de métrica** e **compatibilidade** com o comportamento actual (BCE + sigmoid + pooling existente).

---

## Goals

- [ ] **G1:** Entregar melhorias de treino e/ou inferência na ordem **T1 → A → T2 → R → T4 → T3**, cada uma **desligável por env** com defaults que reproduzem o sistema **antes** de M21.
- [ ] **G2:** Todo modelo novo que altere pesos do MLP **SHALL** ser comparado ao anterior com o mesmo protocolo **`precisionAt5`** (alinhado a [M20](../m20-manual-retrain-metrics-pos-retreino/spec.md) / retreino manual quando aplicável) antes de promoção.
- [ ] **G3:** Qualquer alteração ao **perfil utilizador** no eixo **A** **SHALL** usar **uma única** implementação partilhada entre treino, `POST /recommend`, `recommendFromCart` e avaliação offline ([ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)).
- [ ] **G4:** Manter **M17 P3** no roadmap como trabalho **distinto** quando os dados justificarem; M21 **não** a revoga.

---

## Out of Scope

| Item | Reason |
|------|--------|
| **M17 P3** (atenção temporal *dentro do MLP* ao nível do spec grande / Transformer) | Permanece em [spec M17 P3](../m17-phased-recency-ranking-signals/spec.md); dados insuficientes para priorizar aqui. |
| **Mudanças sem flags / defaults legacy** | Proibido por [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md). |
| **UI nova obrigatória** | Fora do núcleo; apenas se [M20](../m20-manual-retrain-metrics-pos-retreino/spec.md) ou showcase exigirem exposição de novos parâmetros (opcional, fase posterior). |
| **Calibração de pesos pagos / multi-tenant** | Portfolio single-tenant; R/T4 são heurísticas locais ao processo de fusão. |

---

## User Stories

### P1: T1 — Objetivo de ordenação explícito (pairwise) ⭐ MVP

**User Story:** Como **operador do demo**, quero **treinar o MLP com uma loss de pareamento** (ex. hinge / ranking) em alternativa ao BCE, para que o modelo optimize **ordenação** em vez de só classificação ponto a ponto.

**Why P1:** Primeira prioridade do comité; fundamento para comparar ganhos antes de T3.

**Acceptance Criteria:**

1. WHEN `NEURAL_LOSS_MODE` (nome final em [design](./design.md)) está no valor **legacy** THEN o treino SHALL usar **binaryCrossentropy** + última camada **sigmoid** como hoje.
2. WHEN o modo **pairwise** está activo THEN o treino SHALL minimizar uma loss de ranking documentada (pares ou batches compatíveis com TF.js) e a saída para inferência SHALL permanecer compatível com o pipeline híbrido existente (documentar se última camada passa a logit e sigmoid só na loss).
3. WHEN um trabalho de treino termina THEN métricas offline (`precisionAt5` / protocolo em [tasks](./tasks.md)) SHALL ser comparáveis ao modelo anterior antes de promoção.

**Independent Test:** Treinar com dataset sintético com modo legacy vs pairwise e verificar que métricas e artefacto serializam sem erro; default legacy inalterado.

**Requirements:** M21-01 — M21-03

---

### P2: A — Atenção leve no estado do utilizador

**User Story:** Como **engenheiro de IA**, quero **pesos ou softmax sobre N embeddings de histórico** (alternativa ou complemento à média), para que o vector de perfil reflita recência **sem** quebrar alinhamento treino/inferência.

**Why P2:** Segunda prioridade; estende ADR-065.

**Acceptance Criteria:**

1. WHEN a feature está **desligada** (default) THEN o pooling SHALL coincidir com o comportamento actual (`PROFILE_POOLING_MODE` / média ponderada existente).
2. WHEN **ligada**, a mesma função SHALL alimentar `buildTrainingDataset`, inferência em `/recommend`, `recommendFromCart` e `rankingEval`.

**Independent Test:** Unitários ou integração leve nos pontos de chamada + um caso offline eval.

**Requirements:** M21-04 — M21-06

---

### P3: T2 — Negativos mais duros

**User Story:** Como **operador**, quero **amostragem de negativos mais informativa**, para melhorar gradientes **sem** mudar a arquitectura do MLP.

**Why P3:** Terceira prioridade; baixo risco estrutural.

**Acceptance Criteria:**

1. WHEN a opção está desligada THEN a amostragem SHALL ser equivalente à actual.
2. WHEN ligada THEN documentação SHALL descrever o protocolo (ex. maior proporção de negativos “difíceis”, seed reprodutível).

**Requirements:** M21-07 — M21-08

---

### P4: R — Reponderação dinâmica cosine vs neural

**User Story:** Como **sistema de recomendação**, quero **ajustar `SEMANTIC_WEIGHT` / `NEURAL_WEIGHT` efectivos** com base em sinais do histórico (ex. homogeneidade), para melhor fusão **sem** novo treino do MLP.

**Why P4:** Quarto; só mistura escores.

**Acceptance Criteria:**

1. WHEN o modo dinâmico está **off** THEN os pesos SHALL ser os actuais (fixos por env).
2. WHEN **on** THEN a função de fusão SHALL estar isolada, testada, e **não** exigir novo `SavedModel`.

**Requirements:** M21-09 — M21-10

---

### P5: T4 — Calibração do score neural (inferência)

**User Story:** Como **operador**, quero **temperatura ou escala** no score neural na inferência, para alinhar margens sem retreinar.

**Why P5:** Quinto; pós-processamento.

**Acceptance Criteria:**

1. WHEN temperatura = 1 THEN o score SHALL coincidir com o actual.
2. WHEN ≠ 1 THEN apenas a escala de saída neural SHALL mudar (documentar interacção com híbrido).

**Requirements:** M21-11 — M21-12

---

### P6: T3 — Loss híbrida BCE + pairwise

**User Story:** Como **investigador**, quero **combinar BCE e termo pairwise** com dois hiperparâmetros, **depois** de existir baseline T1 medido.

**Why P6:** Última prioridade; evita dupla loss antes de baseline claro.

**Acceptance Criteria:**

1. WHEN desligado THEN o treino SHALL seguir apenas uma loss (conforme `NEURAL_LOSS_MODE`).
2. WHEN ligado THEN pesos relativos dos termos SHALL ser configuráveis por env e documentados.

**Requirements:** M21-13 — M21-14

---

## Edge Cases

- WHEN o modo pairwise produz **artefacto incompatível** com cargas antigas THEN o sistema SHALL falhar com mensagem clara **ou** segregar versão de modelo no `VersionedModelStore` (ver [design](./design.md)); rollback via env + modelo anterior.
- WHEN `precisionAt5` **não** melhora nem mantém banda aceite THEN o gate de promoção SHALL bloquear substituição do modelo **current** (política já alinhada a M9/M20).
- WHEN apenas **R** ou **T4** estão activos THEN **não** é obrigatório novo treino para validar em staging (inferência apenas).

---

## Requirement Traceability

Cada ID liga histórias **P1–P6** (faixas de entrega **T1 → A → T2 → R → T4 → T3**) a design/tasks e validação. **P** aqui significa *pacote de entrega*, não apenas prioridade MVP/P2/P3 de produto — ver ordem do comité em [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md).

| Requirement ID | Story | Track | Phase | Status | Statement |
| ---------------- | ----- | ----- | ----- | ------ | --------- |
| **M21-01** | P1 | T1 | Tasks | Pending | O treino **SHALL** suportar loss **pairwise** alternativa ao BCE, activável por env, default BCE. |
| **M21-02** | P1 | T1 | Tasks | Pending | A última camada / cabeça de score **SHALL** ser consistente entre treino e `predict` (sem drift sigmoid/logit). |
| **M21-03** | P1 | T1 | Tasks | Pending | Promoção de modelo **SHALL** exigir comparação `precisionAt5` vs baseline anterior no mesmo protocolo. |
| **M21-04** | P2 | A | Tasks | Pending | “Atenção leve” **SHALL** estar desligada por default e partilhar código treino=inferência=cart=eval. |
| **M21-05** | P2 | A | Tasks | Pending | Parâmetros de atenção (ex. janela, τ) **SHALL** ser configuráveis por env com defaults que reproduzem pooling não-atencional. |
| **M21-06** | P2 | A | Tasks | Pending | Regressão: com feature off, métricas offline **SHALL** coincidir com run baseline (tolerância numérica documentada). |
| **M21-07** | P3 | T2 | Tasks | Pending | Negativos mais duros **SHALL** ser opcionais e reprodutíveis (seed). |
| **M21-08** | P3 | T2 | Tasks | Pending | Com opção off, distribuição de negativos **SHALL** igualar a implementação actual. |
| **M21-09** | P4 | R | Tasks | Pending | Reponderação dinâmica **SHALL** ser opcional; quando off, pesos **SHALL** ser os env estáticos actuais. |
| **M21-10** | P4 | R | Tasks | Pending | A lógica **SHALL** viver na camada de fusão híbrida (ex. `RecommendationService`), não no MLP. |
| **M21-11** | P5 | T4 | Tasks | Pending | Temperatura (ou equivalente) **SHALL** defaultar a identidade. |
| **M21-12** | P5 | T4 | Tasks | Pending | Calibração **SHALL** aplicar-se só ao ramo neural antes da fusão documentada. |
| **M21-13** | P6 | T3 | Tasks | Pending | Loss combinada **SHALL** ser opcional e só recomendada após baseline T1 (documentado). |
| **M21-14** | P6 | T3 | Tasks | Pending | Coeficientes dos termos **SHALL** ser env-configuráveis. |
| **M21-15** | Cross | — | Tasks | Pending | Cada técnica **SHALL** ter documentação operador em `ai-service/README.md` (tabela env). |
| **M21-16** | Cross | — | Spec | Verified | **M17 P3** **SHALL NOT** ser implementada sob o nome M21 sem novo ADR/repriorização. |

**Status values:** Pending → In Design → In Tasks → Implementing → Verified  

**Coverage:** 16 total (**M21-01**…**M21-16**); mapeamento para [tasks](./tasks.md) **T21-1**…**T21-7** no design/tasks; **M21-16** é invariante de âmbito (sem tarefa de código).

---

## Success Criteria

Critérios mensuráveis para considerar M21 bem-sucedido após execução das tarefas:

- [ ] Com **todos** os defaults legacy (pré-M21), um retreino + inferência reproduzem comportamento e métricas dentro da **tolerância documentada** (sem regressão silenciosa).
- [ ] Cada técnica (T1, A, T2, R, T4, T3) pode ser **activada isoladamente** (onde aplicável) sem obrigar as outras; **R** e **T4** podem ser validados em staging **sem** novo artefacto neural quando só inferência muda.
- [ ] Nenhum modelo que altere o MLP é promovido sem gate **`precisionAt5`** vs baseline no **mesmo protocolo** ([M20](../m20-manual-retrain-metrics-pos-retreino/spec.md) / retreino manual quando aplicável).
- [ ] Operadores dispõem da **tabela env** em `ai-service/README.md` (**M21-15**) e de caminho de **rollback** (env + modelo anterior) documentado quando pairwise ou artefactos forem incompatíveis com cargas antigas.
- [ ] **M17 P3** permanece no roadmap M17; nenhuma implementação “atenção pesada no MLP” é expedida como conclusão de M21 sem novo ADR.

---

## Referências

- [ADR-070](./adr-070-m21-committee-priorities-and-m17-p3-deferral.md)
- [M17 spec](../m17-phased-recency-ranking-signals/spec.md)
- [ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)
- [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md)
- [STATE](../../project/STATE.md)
