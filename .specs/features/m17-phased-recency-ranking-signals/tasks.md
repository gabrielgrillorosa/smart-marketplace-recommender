# M17 — Phased recency ranking signals — Tasks

**Design**: [design.md](./design.md)  
**Spec**: [spec.md](./spec.md)  
**ADR**: [adr-062](./adr-062-phased-recency-ranking-signals.md), [adr-063](./adr-063-score-breakdown-api-and-product-detail-modal.md), [adr-064](./adr-064-rankingconfig-zustand-recommendation-slice.md), [adr-065](./adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md)  
**Testing** (convenções do projeto): [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)

**Status global:** **M17 P1 + ADR-063/064 — implementação completa** (T1–T11). **M17 P2 — implementação completa** (T12–T22; 2026-05-01). **M17 P3** — não planeado neste ficheiro.

**Nota workflow TLC:** `tasks.md` cresceu em duas vagas (núcleo P1, depois ADR-063); o estado actual reflecte **tudo fechado** até à transparência no modal.

---

## Rastreio de execução (M17 entregue)

| ID | Âmbito | Estado | Evidência (código / doc) |
|----|--------|--------|---------------------------|
| **T1** | Config `RECENCY_*` | **Feito** | `ai-service/src/config/env.ts`, `recencyRerankEnv.ts`, `recencyRerankEnv.test.ts`; `.env.example`; `docker-compose.yml` |
| **T2** | Neo4j âncoras | **Feito** | `Neo4jRepository.getRecentConfirmedPurchaseAnchorEmbeddings` |
| **T3** | `RecommendationService` `rankScore` | **Feito** | `RecommendationService.ts` |
| **T4** | Tipos + payload item | **Feito** | `ai-service/src/types/index.ts` |
| **T5** | Testes cenários P1 | **Feito** | `ai-service/src/tests/recommend.test.ts` |
| **T6** | Docs + STATE P1 | **Feito** | `ai-service/README.md`; `STATE.md` |
| **T7** | `rankingConfig` HTTP | **Feito** | `RecommendEnvelope`, `routes/recommend.ts` |
| **T8** | Proxy Next | **Feito** | `frontend/app/api/proxy/recommend/*.ts` |
| **T9** | Zustand + `scoreMap` | **Feito** | `recommendationSlice.ts`, `useRecommendationFetcher`, `CatalogPanel` |
| **T10** | Modal ADR-063 | **Feito** | `ProductDetailModal.tsx` |
| **T11** | Docs ADR-063 + ADR *Accepted* | **Feito** | `ai-service/README.md`; [adr-063](./adr-063-score-breakdown-api-and-product-detail-modal.md) *Accepted* |

**Débito opcional (não bloqueia M17):** teste unit `Vitest` em `frontend` só para `adaptRecommendations` + `rankingConfig` ([CONCERNS C-F02](../../codebase/frontend/CONCERNS.md)).

### M17 — O que falta (só roadmap)

| Fase | Estado | Onde |
|------|--------|------|
| **P2** | **Implementado** (T12–T22) | `ai-service` profile pooling + docs |
| **P3** | Por planear / executar | [spec.md](./spec.md) (história P3), PRS-14–15 |

---

## Execution plan

T1–T6: núcleo `ai-service` M17. **T7–T11:** ADR-063 (API `rankingConfig`, proxy, adapter/store, modal, testes).

```text
T1 -> T2 -> T3 -> T4 -> T5 -> T6
         \
          T7 -> T8 -> T9 -> T10 -> T11
```

**Dependências ADR-063:** cadeia **T7 → T8 → T9 → T10**; **T11** (docs + ADR *Accepted*) concluída.

- **Pendentes M17:** apenas **P2** e **P3** no [spec](./spec.md) — fora deste ficheiro de tarefas P1.

- **T1 → T2**: config disponível para `limit` e testes; repositório não precisa importar env se receber `limit` por argumento.
- **T2 → T3**: serviço chama Neo4j de âncoras só quando `RECENCY_RERANK_WEIGHT > 0`.
- **T3 → T4**: valores `recencySimilarity` / `rankScore` no pipeline antes da serialização.

---

## Task breakdown

### T1 — Config: `RECENCY_RERANK_WEIGHT` e `RECENCY_ANCHOR_COUNT`

**What**: Ler variáveis ortogonais com defaults e validação de arranque conforme [design §3](./design.md#3-variáveis-de-ambiente-ortogonais-adr-062). Log `info` com valores efectivos (como pesos híbridos). Atualizar `.env.example`.

**Where**: `ai-service/src/config/env.ts` (ou equivalente), `.env.example`, compose se o stack expuser envs.

**Depends on**: —  
**Reuses**: Padrão de parsing/validação já usado para `NEURAL_WEIGHT` / `SEMANTIC_WEIGHT`.

**Requirement**: PRS-02, PRS-03, PRS-10

**Done when**:

- [x] `RECENCY_RERANK_WEIGHT` default `0`; ausente ⇒ `0`; definido e inválido (negativo, `NaN`, não finito) ⇒ **falha de arranque** com mensagem clara.
- [x] `RECENCY_ANCHOR_COUNT` default `1`; inteiro ≥ 1, cap superior **10**; inválido ⇒ falha de arranque (ou política única documentada se o projecto preferir clamp — o design fixa falha).
- [x] `.env.example` documenta ambos (success criteria do spec).

**Verify**: Build do pacote `ai-service`; smoke de arranque com env válido / inválido.

**Tests**: Unit no parser de env, se o projecto já cobrir `env.ts`.

**Gate**: quick  
**Commit**: `feat(ai-service): add recency rerank env (M17 P1)`

---

### T2 — Neo4j: âncoras por compra confirmada com ordem temporal

**What**: Implementar `getRecentConfirmedPurchaseAnchorEmbeddings(clientId, limit)` com Cypher alinhado a [design §4](./design.md#4-dados-novo-método-neo4j-âncoras) e a `getConfirmedPurchaseLastDates` (M16): `BOUGHT`, não-demo, `order_date` não nulo, `embedding` não nulo; `max(datetime(toString(r.order_date)))` por produto; `ORDER BY lastPurchase DESC, productId ASC`; `LIMIT`.

**Where**: `ai-service/src/repositories/Neo4jRepository.ts` (+ tipos exportados se necessário).

**Depends on**: T1 (para testes de integração com `limit` vindo da config; implementação pura pode usar parâmetro).

**Reuses**: Padrão de sessão/driver e mapeamento de `embedding` para `number[]`.

**Requirement**: PRS-03, PRS-06 (fonte de dados vazia ⇒ `[]`)

**Done when**:

- [x] Método devolve `[]` quando não há âncoras utilizáveis.
- [x] Ordem: compra mais recente (por produto agregado) primeiro; desempate estável por `productId`.

**Verify**: Teste de repositório com Neo4j de teste ou mock de `session.run`.

**Tests**: integration / mocked session.

**Gate**: medium  
**Commit**: `feat(ai-service): neo4j recent purchase anchor embeddings (M17 P1)`

---

### T3 — `RecommendationService`: `finalScore` inalterado, `rankScore`, re-ordenação

**What**: Depois de `finalScore` = `NEURAL_WEIGHT * neural + SEMANTIC_WEIGHT * semantic` apenas sobre candidatos **já elegíveis** (`scorable`): (1) se `w_r > 0`, carregar âncoras; se `w_r === 0`, **não** chamar Neo4j de âncoras; (2) `recencySimilarity` = máximo dos cossenos candidato × âncora, ou `0` sem âncoras; (3) `rankScore = finalScore + w_r * recencySimilarity`; (4) ordenar por `rankScore` desc, desempate `finalScore` desc, depois `sku` asc ([design §2.3](./design.md#23-rankscore-e-ordenação-prs-02-prs-05)); (5) slice top-K inalterado face ao fluxo actual excepto pela chave de sort.

**Where**: `ai-service/src/services/RecommendationService.ts` (caminho partilhado por `recommend` / `recommendFromCart` / `recommendFromVector`).

**Depends on**: T1, T2

**Reuses**: Batch neural existente; elegibilidade M16; utilitário de cosseno (existente ou mínimo novo).

**Requirement**: PRS-01, PRS-04, PRS-05, PRS-07, PRS-08

**Done when**:

- [x] `finalScore` por SKU idêntico com `w_r=0` vs `w_r>0` (Independent Test do spec).
- [x] Boost não aplica a inelegíveis (incl. `recently_purchased`).
- [x] `recommend` e `recommendFromCart` usam a mesma lógica de âncora (só `clientId`) e mesma fórmula.

**Verify**: Vitest/Jest com mocks de Neo4j + modelo.

**Tests**: unit (`RecommendationService`).

**Gate**: medium  
**Commit**: `feat(ai-service): recency rerank rankScore after hybrid (M17 P1)`

---

### T4 — Tipos e payload API: `recencySimilarity`, `rankScore`

**What**: Estender `RecommendationResult` (ou tipo de item devolvido) com campos opcionais conforme [design §6](./design.md#6-contrato-api--tipos-prs-09): preencher quando `w_r > 0` e elegível com scores; omitir/`null` quando peso 0 para JSON limpo — seguir **decisão única** documentada no código/README.

**Where**: `ai-service/src/types/index.ts` (ou equivalente), serialização em `toRecommendationItem` / adaptadores.

**Depends on**: T3 (valores disponíveis no pipeline).

**Requirement**: PRS-09

**Done when**:

- [x] Campos novos não quebram clientes que ignoram chaves extra.
- [x] Comportamento com `w_r=0` documentado se campos omitidos.

**Verify**: Contract snapshot ou teste de serialização.

**Tests**: unit no DTO / um caso de resposta JSON.

**Gate**: quick  
**Commit**: `feat(ai-service): expose optional recency rank fields (M17 P1)`

_Nota_: T4 pode ser fundido em T3 num único commit se a equipa preferir atómico; manter critérios de “done” separados na revisão.

---

### T5 — Testes de regressão e cenários da matriz de design

**What**: Cobrir a [matriz §7 do design](./design.md#7-matriz-de-testes-sugeridos): peso 0 ≡ ordem por `finalScore`+desempates; dois SKUs com `finalScore` próximos e ordem que muda com `w_r>0` mantendo `finalScore` por SKU; sem âncoras ⇒ neutro; `recently_purchased` fora do boost; env inválido já coberto em T1 (referência cruzada).

**Where**: `ai-service` test suite (pastas existentes por convenção em TESTING.md).

**Depends on**: T1–T4 (mínimo T1–T3 para cenários de ordenação).

**Requirement**: PRS-01–10 (aceitação agregada), Independent Test do spec.

**Done when**:

- [x] Pelo menos um teste que prova inversão de ordem com mesmo `finalScore` por SKU entre runs (mock controlado).
- [x] `RECENCY_RERANK_WEIGHT=0` documentado ou assertado contra baseline de ordenação.

**Verify**: `pnpm test` / `npm test` no pacote ai-service (comando exacto em TESTING.md).

**Tests**: unit + integration conforme gates do projecto.

**Gate**: medium  
**Commit**: `test(ai-service): M17 P1 recency rerank scenarios`

---

### T6 — Documentação operacional e rastreio de estado

**What**: README do `ai-service` (ou secção relevante): com boost activo, a **ordem** segue `rankScore`, não só `finalScore`; nomes finais de env vars; ligação ao ADR-062. Entrada em `.specs/project/STATE.md` e nota de release / baseline de métrica quando `w_r > 0` em staging (success criteria spec §Success / §documento de release).

**Where**: `smart-marketplace-recommender/ai-service/README.md` (se existir; senão doc mínima acordada no repo), `STATE.md`, opcionalmente `ROADMAP.md` linha M17.

**Depends on**: T3 (comportamento final) — T4 opcional para exemplos JSON.

**Requirement**: PRS-09 (fallback documentação), success criteria do [spec](./spec.md#success-criteria)

**Done when**:

- [x] Operador sabe como desligar o boost (`0`) e como interpretar campos novos.
- [x] STATE/ROADMAP reflectem milestone P1 em implementação ou verificado após merge.

**Verify**: Revisão manual + links internos válidos.

**Tests**: —

**Gate**: quick  
**Commit**: `docs(ai-service): M17 P1 recency rerank operator notes`

---

### T7 — `ai-service`: serializar `rankingConfig` (+ termos opcionais por item)

**What**: No handler HTTP de `recommend` e `recommend/from-cart`, incluir no JSON de resposta **`rankingConfig`** com `neuralWeight`, `semanticWeight`, `recencyRerankWeight` efectivos ([design §11.1](./design.md#111-envelope-de-resposta-rankingconfig)). Opcionalmente anexar por item `hybridNeuralTerm`, `hybridSemanticTerm`, `recencyBoostTerm` ([§11.2](./design.md#112-item--campos-existentes--opcionais-adr-063)).

**Where**: rotas/controllers do `ai-service` que montam o body de resposta + tipos partilhados.

**Depends on**: T1 (env legível); ideal T4 (payload item completo).

**Requirement**: PRS-16, PRS-20

**Done when**:

- [x] Resposta de exemplo documentada (README ou comentário OpenAPI se existir) mostra `rankingConfig`.
- [x] Valores coincidem com `env` efectivo do processo para a mesma invocação.

**Verify**: Teste de serialização ou integração HTTP.

**Gate**: quick  
**Commit**: `feat(ai-service): expose rankingConfig on recommend (M17 ADR-063)`

---

### T8 — Next proxy: repassar `rankingConfig`

**What**: `POST` em `frontend/app/api/proxy/recommend/route.ts` e `.../from-cart/route.ts` SHALL devolver `rankingConfig` ao cliente conforme [design §11.3](./design.md#113-proxy-nextjs-apiproxyrecommend). Ajustar `adaptRecommendations` ou o handler para não descartar metadados.

**Where**: ficheiros acima; `frontend/lib/adapters/recommend.ts`.

**Depends on**: T7

**Requirement**: PRS-17

**Done when**:

- [x] Resposta do proxy inclui `rankingConfig` quando upstream envia.
- [x] `isFallback` / `results` comportamento actual preservado.

**Verify**: Teste unit do route handler com mock upstream.

**Gate**: quick  
**Commit**: `feat(frontend): pass rankingConfig through recommend proxy (M17 ADR-063)`

---

### T9 — Estado global + tipos: guardar `rankingConfig` e entradas alargadas do `scoreMap`

**What**: Estender `RecommendationResult` / tipo do mapa para `recencySimilarity`, `rankScore`, termos opcionais; persistir `rankingConfig` no **Zustand** `recommendationSlice` e actualizar `useRecommendationFetcher` + `setRecommendations` para escrita **atómica** com a lista (ver [ADR-064](./adr-064-rankingconfig-zustand-recommendation-slice.md)). Expor `rankingConfig` via `useRecommendations()` quando necessário ao catálogo.

**Where**: `frontend/lib/types.ts`, `frontend/store/recommendationSlice.ts`, `frontend/lib/hooks/useRecommendations.ts`, `frontend/lib/hooks/useRecommendationFetcher.ts`, consumidor de recomendações se necessário.

**Depends on**: T8

**Requirement**: PRS-17, PRS-18 (dados até ao painel)

**Done when**:

- [x] `rankingConfig` acessível na árvore que renderiza o catálogo.
- [x] `scoreMap` inclui campos necessários ao modal para PRS-18.

**Verify**: Typecheck; smoke manual.

**Gate**: quick  
**Commit**: `feat(frontend): store rankingConfig and score breakdown fields (M17 ADR-063)`

---

### T10 — `ProductDetailModal`: resumo alinhado ao servidor

**What**: Implementar UI do [design §11.5](./design.md#115-productdetailmodal--copy-e-testes): parcelas híbrido em pontos, recência, incremento, `rankScore`; `data-testid="product-detail-score-summary"`; degradação sem `rankingConfig` ([spec PRS-21](./spec.md#edge-cases)).

**Where**: `frontend/components/catalog/ProductDetailModal.tsx`, possivelmente `CatalogPanel.tsx` (props para `rankingConfig` ou score alargado).

**Depends on**: T9

**Requirement**: PRS-18, PRS-19, PRS-21, PRS-22

**Done when**:

- [x] Com boost activo e payload completo, rótulos e números batem com JSON (revisão ou teste).
- [x] Com `rankingConfig` ausente, sem afirmações falsas sobre pesos.

**Verify**: Teste de componente ou E2E mínimo no `data-testid`.

**Gate**: medium  
**Commit**: `feat(frontend): product detail score breakdown aligned with ai-service (M17 ADR-063)`

---

### T11 — Testes e documentação ADR-063

**What**: Cobertura de contrato (adapter ou integração) para `rankingConfig`; E2E opcional no resumo do modal; actualizar README do `ai-service` / nota `STATE.md` referenciando ADR-063 e Opção A; marcar ADR-063 *Accepted* após verificação (processo do repo).

**Where**: pastas de teste `frontend` / `ai-service`; docs.

**Depends on**: T7–T10 (mínimo T7+T8+T10 para doc honesta)

**Requirement**: PRS-16–PRS-22 (agregado), critérios de sucesso [spec](./spec.md#success-criteria)

**Done when**:

- [x] Regressão: clientes que só leem `results` não quebram.
- [x] Documentação menciona `rankingConfig` e campos opcionais por item.
- [x] ADR-063 marcado *Accepted* e alinhado ao código (ver [adr-063](./adr-063-score-breakdown-api-and-product-detail-modal.md)).

*(Débito opcional C-F02: teste unit `adaptRecommendations` no `frontend` — não faz parte do scope mínimo M17 P1+ADR.)*

**Verify**: Comandos de teste do monorepo.

**Gate**: medium  
**Commit**: `test(docs): M17 ADR-063 rankingConfig and score summary coverage`

---

## Rastreio PRS → tarefas

| PRS | Tarefas |
|-----|---------|
| PRS-01 | T3 |
| PRS-02 | T1, T3, T5 |
| PRS-03 | T1, T2, T3 |
| PRS-04 | T3, T5 |
| PRS-05 | T3, T5 |
| PRS-06 | T2, T3, T5 |
| PRS-07 | T3, T5 |
| PRS-08 | T3, T5 |
| PRS-09 | T4, T6, T7 |
| PRS-10 | T1, T5 |
| PRS-16 | T7, T11 |
| PRS-17 | T8, T9 |
| PRS-18 | T9, T10 |
| PRS-19 | T8, T10 |
| PRS-20 | T7, T10 |
| PRS-21 | T10, T11 |
| PRS-22 | T10, T11 |

---

## M17 P2 — Phased recency — profile pooling (tasks)

**Design:** [design.md §13](./design.md#13-m17-p2--design-complex-pooling-treinoinferência) · **ADR:** [ADR-065](./adr-065-m17-p2-shared-profile-pooling-and-temporal-alignment.md) · **Spec:** PRS-11–13, PRS-23–29  
**Status:** Approved (tasks) · **Execute:** complete (2026-05-01)

### Validation (tlc-spec-driven `tasks.md` gates)

**Granularity check**

| Task | Scope | Status |
|------|--------|--------|
| T12 | Env parsing + startup validation | ✅ Granular |
| T13 | Single pure aggregation module + co-located unit tests | ✅ Granular |
| T14 | Temporal map builder from orders snapshot | ✅ Granular |
| T15 | `buildTrainingDataset` + `training-utils` refactor | ✅ Granular |
| T16 | `ModelTrainer` wiring only | ✅ Granular |
| T17 | Neo4j repository method + mapper/fixture tests | ✅ Granular |
| T18 | `RecommendationService` profile path + co-located unit tests | ✅ Granular |
| T19 | `rankingEval` reuse + tests | ✅ Granular |
| T20 | `rankingConfig` extension + serialization/route tests | ✅ Granular |
| T21 | Docs + STATE + spec traceability | ✅ Granular |
| T22 | Final build gate (full verification) | ✅ Granular |

**Diagram ↔ `Depends on` cross-check**

| Task | Depends on (body) | Diagram | Status |
|------|---------------------|---------|--------|
| T12 | — | Phase 1 root | ✅ |
| T13 | — | Phase 1 root | ✅ |
| T14 | — | Phase 1 root | ✅ |
| T17 | — | Phase 1 root | ✅ |
| T15 | T13, T14 | After T13∧T14 | ✅ |
| T16 | T12, T15 | T15 → T16 | ✅ |
| T18 | T12, T13, T17 | After Phase 1 | ✅ |
| T19 | T12, T13 | After Phase 1 | ✅ |
| T20 | T12, T18 | After T18 | ✅ |
| T21 | T16, T18, T19, T20 | Sequential closure | ✅ |
| T22 | T21 | After T21 | ✅ |

Parallel groups **{T12,T13,T14,T17}** and **{T15,T18,T19}** have no internal dependencies. ✅

**Test co-location vs [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md)**

| Task | Layer modified | Matrix requires | Task `Tests` | Status |
|------|----------------|-----------------|--------------|--------|
| T12 | `env` config | unit | unit | ✅ |
| T13 | new pure module | unit | unit | ✅ |
| T14 | training-data / map helper | unit | unit | ✅ |
| T15 | `ModelTrainer` / training-utils | unit | unit | ✅ |
| T16 | `ModelTrainer` | unit | unit | ✅ |
| T17 | `Neo4jRepository` | none | unit (fixtures/mapper) | ✅ |
| T18 | `RecommendationService` | unit | unit | ✅ |
| T19 | `rankingEval` | unit | unit | ✅ |
| T20 | routes / types | integration | integration | ✅ |
| T21 | docs only | — | none | ✅ |
| T22 | gate | — | full command | ✅ |

---

### Execution plan (P2)

**Phase 1 — Foundation [P]:** T12 ‖ T13 ‖ T14 ‖ T17  

**Phase 2 — Parallel tracks (after Phase 1):** T15 ‖ T18 ‖ T19  

**Phase 3:** T16 (after T12 + T15)  

**Phase 4:** T20 (after T12 + T18)  

**Phase 5:** T21 (after T16 + T18 + T19 + T20)  

**Phase 6:** T22 (after T21)

```text
        ┌─ T12 ─┐
        ├─ T13 ─┼──→ T15 ──→ T16 ──┐
        ├─ T14 ─┘                   │
        └─ T17 ───→ T18 ──────────┼──→ T20 ──→ T21 ──→ T22
                  T13,T12 ─→ T19 ──┘
```

---

### Task breakdown (T12–T22)

#### T12 — Config: `PROFILE_POOLING_MODE` e `PROFILE_POOLING_HALF_LIFE_DAYS`

**What:** Parser + startup validation + `info` logging per [design §13.9](./design.md#139-variáveis-de-ambiente-p2); defaults `mean` and `30`; invalid ⇒ fail fast (PRS-25). Update `.env.example`; README detail in T21.

**Where:** `ai-service/src/config/env.ts` (or dedicated module re-exported), `.env.example`, `docker-compose.yml` if stack exposes vars.

**Depends on:** —  
**Reuses:** Pattern from `RECENCY_RERANK_WEIGHT` / hybrid weights validation.

**Requirement:** PRS-25

**Done when:**

- [x] `PROFILE_POOLING_MODE` ∈ {`mean`,`exp`}; invalid ⇒ startup failure with clear message.
- [x] `PROFILE_POOLING_HALF_LIFE_DAYS` used when mode `exp`; finite and `> 0`; invalid ⇒ startup failure; absent ⇒ documented default (e.g. `30`).
- [x] `.env.example` documents both names and semantics.

**Tests:** unit  
**Gate:** quick (`npm test`)

**Commit:** `feat(ai-service): profile pooling env (M17 P2)`

---

#### T13 — Module: `aggregateClientProfileEmbeddings` (shared)

**What:** New pure module `src/profile/clientProfileAggregation.ts` exporting `aggregateClientProfileEmbeddings` with modes `mean` | `exp`, half-life \(H\), \(T_{\mathrm{ref}}\), entries `(embedding, Δ_i)` per [design §13.6–13.8](./design.md#136-code-reuse-analysis). Edge: \(\Delta_i < 0\) ⇒ `0` + optional warn. **No** `process.env` inside pure functions.

**Where:** `ai-service/src/profile/clientProfileAggregation.ts`, `clientProfileAggregation.test.ts`

**Depends on:** —  
**Reuses:** —

**Requirement:** PRS-11, PRS-12, PRS-23

**Done when:**

- [x] Mode `mean` matches legacy arithmetic mean within documented float32 ε (PRS-11).
- [x] Mode `exp` uses \(w_i=\exp(-\Delta_i/\tau)\), \(\tau=H/\ln 2\), normalized weighted sum.
- [x] Golden-vector unit tests: same `(e_i, Δ_i)` fixture produces identical output via single import (PRS-12).

**Tests:** unit  
**Gate:** quick

**Commit:** `feat(ai-service): shared client profile aggregation (M17 P2)`

---

#### T14 — Training: temporal map from orders snapshot

**What:** Build per-client \(t_i\) per `productId` and \(T_{\mathrm{ref}}^{(c)}\) from snapshot `orders`, aligned with confirmed-purchase rules and `normalizeOrderDateFromApi` (PRS-23, PRS-24).

**Where:** `training-data-fetch.ts` and/or helper co-located with training pipeline (exact path per codebase).

**Depends on:** —  
**Reuses:** `normalizeOrderDateFromApi`, existing order types.

**Requirement:** PRS-23, PRS-24

**Done when:**

- [x] Unit tests with fixture `orders[]` prove \(t_i\) and \(T_{\mathrm{ref}}^{(c)}\) per spec.

**Tests:** unit  
**Gate:** quick

**Commit:** `feat(ai-service): training temporal map for profile pooling (M17 P2)`

---

#### T15 — `buildTrainingDataset` + `training-utils`: shared aggregation

**What:** Extend `buildTrainingDataset` / helpers to accept temporal structure + **injected** pooling options (no hidden env); resolve embeddings via `productEmbeddingMap`; call **only** `aggregateClientProfileEmbeddings`; remove duplicate `meanPooling`.

**Where:** `ai-service/src/services/training-utils.ts`, callers.

**Depends on:** T13, T14  
**Reuses:** `aggregateClientProfileEmbeddings`

**Requirement:** PRS-11, PRS-12, PRS-24

**Done when:**

- [x] Mode `mean`: profile vectors match previous behavior within ε.
- [x] No duplicated pooling logic in `training-utils`.

**Tests:** unit (`model.test.ts` / training tests)

**Gate:** quick

**Commit:** `refactor(ai-service): buildTrainingDataset uses shared profile pooling (M17 P2)`

---

#### T16 — `ModelTrainer`: inject pooling options

**What:** Read validated config from T12 at trainer boundary; pass explicit pooling options into `buildTrainingDataset` per [design §13.7](./design.md#137-components).

**Where:** `ai-service/src/services/ModelTrainer.ts`

**Depends on:** T12, T15  
**Reuses:** Existing trainer → dataset flow.

**Requirement:** PRS-24

**Done when:**

- [x] Training path uses same aggregation module + semantics as inference when modes match.

**Tests:** unit (`model.test.ts`)

**Gate:** quick

**Commit:** `feat(ai-service): ModelTrainer wires profile pooling options (M17 P2)`

---

#### T17 — Neo4j: profile pool with `lastPurchase` per product

**What:** Implement `getClientProfilePoolForAggregation(clientId)` (final name per code review): **all** eligible purchases with embedding + `lastPurchase`, `ORDER BY lastPurchase DESC, productId ASC`, no LIMIT (PRS-26). Map to aggregation inputs.

**Where:** `ai-service/src/repositories/Neo4jRepository.ts`

**Depends on:** —  
**Reuses:** Cypher patterns from `getRecentConfirmedPurchaseAnchorEmbeddings`.

**Requirement:** PRS-26

**Done when:**

- [x] Mapper/unit tests with **fixture** records validate ordering and Δ at TS boundary (mitigate C-A02).

**Tests:** unit (fixtures)  
**Gate:** quick

**Commit:** `feat(ai-service): neo4j client profile pool for aggregation (M17 P2)`

---

#### T18 — `RecommendationService`: inference profile via shared aggregation

**What:** `recommend`: pool via T17; \(T_{\mathrm{ref}}\) = request now UTC; `aggregateClientProfileEmbeddings`. `recommendFromCart`: union history + cart at \(\Delta=0\), one aggregation pass (PRS-27). Preserve P1 `finalScore` / `rankScore` (PRS-28). Extend `recommend.test.ts` with design §13.12 scenarios.

**Where:** `RecommendationService.ts`, `src/tests/recommend.test.ts`

**Depends on:** T12, T13, T17  
**Reuses:** `aggregateClientProfileEmbeddings`, existing ranking pipeline.

**Requirement:** PRS-11, PRS-26, PRS-27, PRS-28

**Done when:**

- [x] `PROFILE_POOLING_MODE=mean` matches prior profile within ε for mocks.
- [x] Cart-only and P1+P2 coexistence tests pass.

**Tests:** unit  
**Gate:** medium (`npm test` in `ai-service`)

**Commit:** `feat(ai-service): inference profile pooling shared with training (M17 P2)`

---

#### T19 — `rankingEval`: align offline profile with training

**What:** Refactor `rankingEval` / `computePrecisionAtK` to use `aggregateClientProfileEmbeddings` with explicit pooling options; remove duplicate `meanPooling`.

**Where:** `ai-service/src/services/rankingEval.ts` (path per repo)

**Depends on:** T12, T13  
**Reuses:** `aggregateClientProfileEmbeddings`

**Requirement:** PRS-12

**Done when:**

- [x] Eval matches training aggregation for same fixtures when modes align.

**Tests:** unit  
**Gate:** quick

**Commit:** `refactor(ai-service): rankingEval uses shared profile aggregation (M17 P2)`

---

#### T20 — Optional `rankingConfig` fields (PRS-29)

**What:** Extend HTTP envelope / types with optional `profilePoolingMode`, `profilePoolingHalfLifeDays` (effective runtime values); no UI requirement.

**Where:** Response types, `routes/recommend.ts` (or equivalent), route tests.

**Depends on:** T12, T18  
**Reuses:** Existing `rankingConfig` pattern (ADR-063).

**Requirement:** PRS-29

**Done when:**

- [x] Route/integration test asserts optional fields when enabled.

**Tests:** integration  
**Gate:** full (`npm run lint && npm test` minimum)

**Commit:** `feat(ai-service): rankingConfig profile pooling metadata (M17 P2)`

---

#### T21 — Documentation, STATE baseline, traceability

**What:** `ai-service/README.md` P2 operator section; register offline metric baseline (PRS-13) in `STATE.md` or release note; update **this** `tasks.md` checkboxes and [spec.md](./spec.md) PRS table when verified.

**Where:** README, `STATE.md`, `spec.md`

**Depends on:** T16, T18, T19, T20  
**Reuses:** —

**Requirement:** PRS-13

**Done when:**

- [x] Operators can configure P2 without reading source.
- [x] Baseline row recorded (or explicit pending only if measurement blocked).

**Tests:** none  
**Gate:** quick (review)

**Commit:** `docs(m17): P2 profile pooling operator notes and baseline (M17 P2)`

---

#### T22 — Build gate (phase closure)

**What:** Run full ai-service verification per [TESTING.md](../../codebase/ai-service/TESTING.md) Build gate; mark P2 tasks complete.

**Where:** —

**Depends on:** T21  
**Reuses:** —

**Requirement:** PRS-11–13, PRS-23–29 (aggregate DoD)

**Done when:**

- [x] `npm run lint && npm run build && npm test` from `ai-service` root exits 0.
- [x] T12–T21 checklists updated; spec traceability PRS-11–29 → tasks.

**Tests:** (full suite)  
**Gate:** **build**

**Commit:** `chore(ai-service): M17 P2 verification gate`

---

### Parallel execution map (P2)

| Phase | Tasks | Notes |
|-------|-------|------|
| 1 | T12 [P], T13 [P], T14 [P], T17 [P] | Independent. |
| 2 | T15 [P], T18 [P], T19 [P] | After Phase 1. |
| 3 | T16 | After T15 + T12. |
| 4 | T20 | After T18 + T12. |
| 5 | T21 | After T16, T18, T19, T20. |
| 6 | T22 | After T21. |

---

### Rastreio PRS (P2) → tarefas

| PRS | Tarefas |
|-----|---------|
| PRS-11 | T13, T15, T18 |
| PRS-12 | T13, T15, T19 |
| PRS-13 | T21 |
| PRS-23 | T13, T14, T15 |
| PRS-24 | T14, T15, T16 |
| PRS-25 | T12 |
| PRS-26 | T17, T18 |
| PRS-27 | T18 |
| PRS-28 | T18 |
| PRS-29 | T20 |

---

## Próximo passo workflow (`tlc-spec-driven`)

**M17 P1 + ADR-063/064:** ~~`execute`~~ **concluído.** **M17 P2:** ~~`execute`~~ **concluído** (T12–T22). **M17 P3** quando priorizado — ver [spec.md](./spec.md).
