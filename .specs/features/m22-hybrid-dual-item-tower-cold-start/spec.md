# M22 — Item em três vias (semântica HF, prior estrutural esparsa, ID opcional) + cold start

**Status:** **IMPLEMENTED** no `ai-service` (2026-05-02); critério de sucesso «melhoria documentada em cold start» e gate de promoção **`precisionAt5`** em ambiente real permanecem **validação operador / staging**.  
**Data:** 2026-05-02  
**ADR:** [ADR-074](./adr-074-m22-milestone-hybrid-sparse-item-tower.md)  
**Design:** [design.md](./design.md)

---

## Problem Statement

Com o modelo actual (perfil agregado + embedding HF de produto + MLP), itens cuja **marca/categoria** (ou SKU) não tiveram exposição suficiente no **seed/treino** tendem a **subir tarde** no ranking até haver várias interações repetidas. Baixar **temperatura** de pooling e **encurtar a janela temporal** acelera a promoção, mas aproxima o comportamento de «só a última compra importa», degradando estabilidade do perfil.

---

## Goals

- [x] **G1:** Decompor a representação de **item** em **(A)** torre **semântica** HF (texto), **(B)** torre de **prior estrutural** esparsa (brand, category, subcategory quando aplicável, **price_bucket** — sem `product_id`), e **(C)** embedding opcional de **`product_id`** só para **memorização**; combinar com **user tower** via função de fusão explícita **f(u, e_sem, e_struct, e_id)** documentada; **B** e **C** **SHALL NOT** partilhar a mesma tabela/projeção esparsa.
- [x] **G2:** Preservar **alinhamento treino = inferência = cart = eval** para qualquer função que produza o vector de utilizador ou de item (reuso do padrão [ADR-065](../../features/m17-phased-recency-ranking-signals/adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)).
- [x] **G3:** **Feature flags / env** com defaults **pré-M22** até promoção explícita; rollback documentado.
- [ ] **G4:** Nenhum modelo M22 promovido sem **gate `precisionAt5`** vs baseline no mesmo protocolo ([M20](../../features/m20-manual-retrain-metrics-pos-retreino/spec.md) / [M21](../../features/m21-ranking-evolution-committee-decisions/spec.md)) — **processo operador**, não automatizado só no repo.

---

## Out of Scope

| Item | Reason |
|------|--------|
| **Substituir M21** ou concluir M21 sob o nome M22 | M22 é milestone separado; M21 mantém a sua ordem T1→…→T3. |
| **M17 P3** (atenção pesada no MLP / Transformer) | Permanece no [spec M17 P3](../../features/m17-phased-recency-ranking-signals/spec.md); pode compor no futuro, mas não é requisito de abertura M22. |
| **ANN / ScaNN em produção neste repo** | Retrieval em milhões de itens não é alvo do demo; técnicas de serving podem ser ADR futuro. |

---

## User Stories (alto nível)

### P1: Representação de item em vias separadas ⭐ fundação

**Como** operador do demo, **quero** que o treino opcional use **(B)** prior de catálogo/mercado e opcionalmente **(C)** memorização por SKU, sempre **junto** com **(A)** embedding HF, **sem** misturar ID com brand/category na mesma torre esparsa, **para** cold start de marca/categoria e controlo de memorização.

**Acceptance criteria (rascunho):** com M22 **off**, comportamento idêntico ao checkpoint anterior; com M22 **on**, dataset e `predict` usam o **mesmo** extractor com entradas separadas para A / B / C conforme [ADR-074](./adr-074-m22-milestone-hybrid-sparse-item-tower.md).

**Requirements:** M22-01 — M22-04, M22-08 — M22-10

### P2: Fusão com score híbrido existente

**Como** sistema, **quero** integrar o score do dual-item-tower com o **híbrido neural + semântico** já existente, **para** não perder o ancoramento semântico em [ADR-016](../../features/m4-neural-recommendation/adr-016-hybrid-score-weight-calibration.md).

**Requirements:** M22-05 — M22-07

---

## Requirement traceability

| ID | Statement | Status |
|----|-----------|--------|
| **M22-01** | Ramo esparsa **SHALL** ser opcional por env; default **SHALL** reproduzir arquitectura pré-M22. | Implemented |
| **M22-02** | Campos para **(B)** (brand, category, subcategory, price_bucket) e para **(C)** quando activo **SHALL** derivar-se de dados persistidos (Neo4j/PostgreSQL) ou de **derivados documentados** (ex. bucket de preço); versão de esquema documentada. | Implemented |
| **M22-03** | OOV **SHALL** ser explícito **por via**: bucket/hash para tokens de **(B)** independente da política OOV de **(C)** quando ambos activos. | Implemented |
| **M22-04** | `buildTrainingDataset` e `RecommendationService` **SHALL** partilhar a mesma composição de **f(u, e_sem, e_struct, e_id)** quando M22 activo. | Implemented |
| **M22-05** | A fusão com `semanticScore` / pesos **SHALL** manter-se configurável; alterações **SHALL** ser documentadas no `ai-service/README.md`. | Implemented |
| **M22-06** | Artefacto em disco **SHALL** incluir metadados de versão M22 (manifest estendido ou ficheiro sidecar acordado em tasks). | Implemented |
| **M22-07** | Testes de regressão numérica **SHALL** garantir que M22 off = baseline dentro da tolerância do projecto. | Implemented (`training-utils.test.ts` empilha sem+user ≡ 768-d baseline; `M22_ENV_OFF` nos testes de recomendação) |
| **M22-08** | Lookups de **prior estrutural (B)** e de **identity (C)** **SHALL NOT** partilhar a mesma tabela de embedding nem a mesma projeção única indiferenciada. | Implemented |
| **M22-09** | O encoder **HF (A)** **SHALL NOT** incorporar brand/category/price_bucket na geração de **e_sem**; fusão com B/C **SHALL** ocorrer só na etapa **f** / MLP acordada. | Implemented |
| **M22-10** | Embedding de **product_id (C)** **SHALL** ser opcional por env e documentado como **só memorização** no manifesto e README. | Implemented |

---

## Success criteria

- [x] Baseline com M22 desligado indistinguível do comportamento pré-M22 nos testes acordados (dataset empilhado + caminhos de inferência com checkpoint baseline / manifest em falta).
- [ ] Com M22 ligado em ambiente de desenvolvimento, casos de **primeira compra** numa marca/categoria fora do seed mostram **melhoria documentada** em ordem média (slice `precisionAt5` em `rankingEval`; fechar com números em staging quando activar `M22_*`).
- [x] Documentação de operador e caminho de rollback no `ai-service/README.md`; ROADMAP/STATE reflectem **IMPLEMENTED** no código com nota de validação operador.

---

## References

- [design.md](./design.md)
- [ADR-074](./adr-074-m22-milestone-hybrid-sparse-item-tower.md)
- [M21 spec](../../features/m21-ranking-evolution-committee-decisions/spec.md)
