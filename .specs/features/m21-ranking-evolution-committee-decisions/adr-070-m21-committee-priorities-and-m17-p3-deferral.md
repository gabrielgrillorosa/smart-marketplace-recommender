# ADR-070: M21 — prioridades do comité (ranking, perfil, híbrido) e desvio face a M17 P3

**Status:** Accepted  
**Date:** 2026-05-01  
**Milestone:** **M21** — evolução do treino / perfil / fusão híbrida sem obrigar atenção temporal pesada ([spec M21](./spec.md))

## Context

O **[ADR-062](../m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md)** prevê a **Fase 3 (M17 P3)** — atenção temporal sobre sequência no MLP / artefacto distinto. Com o **volume de dados actual** do demo, a equipa **não** implementou P3 (custo e risco de overfitting frente ao ganho). Em sessão de comité (Eng. de IA aplicada, Deep Learning, Arquiteto de soluções IA) avaliaram-se alternativas alinhadas a **top-K** e **contexto de utilizador** sem aumentar a complexidade para a de um Transformer grande.

Foram avaliados, com raciocínio tipo **ToT** / consistência:

| ID | Técnica | Nota |
|----|---------|------|
| **T1** | Ranking loss **pairwise** (hinge ou equivalente) em vez de só BCE | Objetivo de ordenação explícita; possível última camada **logit** (sem sigmoid) para treino estável. |
| **T2** | BCE + **negativos mais duros** (amostragem) | Mantém loss actual; melhora gradiente sem mudar arquitectura. |
| **T3** | **Híbrido** BCE + termo pairwise | Dois hiperparâmetros; só relevante após baseline T1 ou métrica a pedir estabilização. |
| **T4** | **Calibração** do score neural na inferência (ex. temperatura) | Não altera pesos do MLP se for só pós-processamento. |
| **A** | **Atenção leve** no *user state* (pesos por recência ou softmax aprendido sobre N embeddings) | Substitui ou complementa agregação tipo média; **deve** respeitar a regra M17 P2 de **mesma** função treino/inferência ([ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)). |
| **R** | **Reweight dinâmico** da componente **cosine** vs **neural** no score híbrido | Heurística na fusão (ex. homogeneidade do histórico); **não** exige novo treino do MLP se só mistura escores. |

## Decision

1. **Prioridade por impacto esperado no resultado** (mantida como referência de implementação incremental):  
   **T1 → A → T2 → R → T4 → T3**  
   (T3 fica por último: potencial alto mas só depois de T1 medido; evita dupla loss antes de baseline pairwise.)

2. **M17 P3** (atenção temporal *dentro do MLP* ao estilo spec grande) **permanece no roadmap M17** quando dados justificarem; **M21** é o veículo para **entregas incrementais** acima **sem** bloquear nem revogar ADR-062.

3. **Preservação do modelo e do comportamento actual:** cada técnica **SHALL** ser activável por **variável de ambiente** (ou equivalente já existente: `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT`, `PROFILE_POOLING_MODE`, etc.), com **defaults** que reproduzem o comportamento **hoje** (BCE + MLP actual + pooling actual + pesos fixos) até promoção consciente de novo artefacto (`VersionedModelStore` / tolerância já previstas).

4. **Classificação de impacto no artefacto neural:** T1, T2, T3 e A (com retreino) alteram pesos e possivelmente grafo; R e T4 (puros inferência) **não** exigem novo `SavedModel` por si só.

5. **Métrica de gate:** comparar sempre com o mesmo **`precisionAt5`** (e protocolo de retreino M20) antes de promover modelo.

## Alternatives considered

- **Implementar M17 P3 (Transformer / atenção pesada) já:** descartado no curto prazo pelo comité — dataset insuficiente para justificar complexidade.
- **Só T3 híbrido sem T1 isolado:** descartado como primeira entrega — mais superfície de tuning sem baseline pairwise claro.
- **Mudanças sem flags:** descartado — viola operação segura e showcase didáctico.

## Consequences

- **Novo milestone [M21](./spec.md)** no [STATE](../../project/STATE.md) / [ROADMAP](../../project/ROADMAP.md) com este ADR como decisão canónica.
- **Tarefas de implementação** ficam para `tasks.md` de M21 quando o `plan feature` detalhar PRs; até lá, **ADR-070** fixa a ordem e os constraints.
- **Risco:** pairwise (T1) pode exigir **artefacto incompatível** com o MLP BCE+sigmoid actual — documentar versão de modelo e path de *rollback* via env + modelo anterior.
- **Alinhamento ADR-065:** qualquer “atenção leve” em perfil **SHALL** partilhar implementação entre `buildTrainingDataset`, `POST /recommend`, `recommendFromCart` e `rankingEval`.

## Relação com outros ADRs

| ADR | Relação |
|-----|---------|
| [ADR-062](../m17-phased-recency-ranking-signals/adr-062-phased-recency-ranking-signals.md) | P3 continua “when data justifies”; M21 não a substitui formalmente. |
| [ADR-065](../m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) | A (atenção leve no estado) estende o princípio “uma função, treino = inferência”. |
| [ADR-016](../m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md) | R e T4 são vizinhos temáticos (calibração / pesos híbridos); ADR-016 permanece referência quando se detalhar produto. |
| [ADR-071](./adr-071-m21-neural-head-and-pure-fusion-boundary.md) | Design complex: cabeça neural sob pairwise vs legado; fusão R/T4 em TS puro fora do MLP. |
