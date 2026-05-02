# M16 — Neural-First Didactic Ranking & Catalog Density — Tasks

**Design**: `.specs/features/m16-neural-first-didactic-ranking-catalog-density/design.md`  
**Spec**: `.specs/features/m16-neural-first-didactic-ranking-catalog-density/spec.md`  
**Testing** (project conventions):

- `.specs/codebase/ai-service/TESTING.md` (if present)
- `.specs/codebase/frontend/TESTING.md`

**Status**: **COMPLETE** (2026-04-30) — T1–T15 e integração ADR-061; fecho registado em `.specs/project/STATE.md` e `ROADMAP.md`.

**Gap analysis (plan M16):** matriz NFD, ADRs, fluxos, backlog e verificação — [GAP_ANALYSIS.md](./GAP_ANALYSIS.md).

---

## Execution Plan

### Phase 1: ai-service — elegibilidade e contrato (sequencial)

O frontend e o proxy dependem do contrato enriquecido e da supressão Neo4j-first (ADR-055, ADR-060).

```text
T1 -> T2 -> T3 -> T4
```

### Phase 2: Seed e verificação (após T2 recomendado)

Expansão monolítica (ADR-059). **T5** inclui `products` / `suppliers` / `orders`, `verifyCounts`, cold start.

```text
T2 -> T5
```

(Pode iniciar redação de dados em `products.ts` antes de T3 se não bloquear revisões.)

### Phase 3: Frontend — tipos, estado, utilitários (paralelo)

```text
T6 [P]   T7 [P]   T8 [P]
```

**Depends on**: T3 estável para contrato real; T6–T8 podem usar stub até merge de T3.

### Phase 4: Frontend — componentes e wiring (sequencial)

```text
T6, T7, T8 -> T9 -> T10 -> T11 -> T12 -> T13
```

### Phase 5: Aceitação, métricas e E2E

```text
T5, T11 -> T14 -> T15
```

---

## Task Breakdown

### T1: `RECENT_PURCHASE_WINDOW_DAYS` em config do ai-service

**What**: Variável de ambiente com default `7`, alinhada ao design Part II.  
**Where**: `ai-service` `config/env.ts` (ou equivalente), `.env.example` / compose se aplicável.  
**Depends on**: None  
**Reuses**: Padrão existente de env no serviço.  
**Requirement**: NFD-01, NFD-04, spec P1 backend AC1

**Done when**:

- [ ] Env lida de forma tipada; default `7` dias.
- [ ] Documentação mínima no PR ou comentário no módulo de config.

**Verify**: Build/test do pacote ai-service.  
**Tests**: unit (parser/default) se o projeto já testar env.  
**Gate**: quick  
**Commit**: `feat(ai-service): add RECENT_PURCHASE_WINDOW_DAYS config`

---

### T2: Neo4j — compras recentes por `BOUGHT.order_date` (não-demo)

**What**: Evoluir repositório para janela recente vs histórico; `max(order_date)` por `(client, product)` onde aplicável; excluir `is_demo`.  
**Where**: `Neo4jRepository` (ou equivalente), Cypher.  
**Depends on**: T1  
**Reuses**: `BOUGHT` com `order_date` no seed.  
**Requirement**: NFD-01, NFD-05, ADR-060

**Done when**:

- [ ] Candidatos para ranking não excluem indefinidamente todo o histórico comprado; janela aplicada.
- [ ] `order_date` ausente: comportamento único documentado + teste ou nota no PR.

**Verify**: Testes de repositório ou integração Neo4j de teste.  
**Tests**: integration / mocked session  
**Gate**: medium  
**Commit**: `feat(ai-service): neo4j recent purchase window for candidates`

---

### T3: `RecommendationService` — passo de elegibilidade + payload enriquecido

**What**: Elegíveis para score híbrido; inelegíveis com `eligible`, `eligibilityReason`, `suppressionUntil`; scores `null` para inelegíveis; sem boost em `finalScore` (NFD-09, NFD-20).  
**Where**: `RecommendationService`, tipos de resposta HTTP.  
**Depends on**: T2  
**Reuses**: `recommend` / `recommendFromCart`.  
**Requirement**: NFD-02, NFD-03, NFD-06, NFD-08, NFD-20, NFD-21, spec P1 AC2–9

**Done when**:

- [ ] JSON alinhado ao exemplo em `design.md` (nomes alinhados com `adaptRecommendations`).
- [ ] Inelegíveis no fim do array com metadados determinísticos.

**Verify**: Vitest/Jest do serviço com mocks.  
**Tests**: unit (RecommendationService)  
**Gate**: medium  
**Commit**: `feat(ai-service): eligibility metadata on recommend responses`

---

### T4: Proxy Next.js — `eligibilityOnly`

**What**: Encaminhar `eligibilityOnly: true` para prefetch no select de cliente (ADR-058).  
**Where**: `frontend/app/api/proxy/recommend` (ou equivalente).  
**Depends on**: T3  
**Reuses**: Proxy existente.  
**Requirement**: ADR-058, NFD-15

**Done when**:

- [ ] Prefetch de elegibilidade sem ordenação completa quando definido no contrato.
- [ ] Falha/timeout não crasha o cliente.

**Verify**: Chamada manual ou teste de rota.  
**Tests**: API route test se existir padrão.  
**Gate**: quick  
**Commit**: `feat(frontend): proxy recommend eligibilityOnly prefetch`

---

### T5: Seed — densidade, viés pedagógico, verifyCounts e cold start

**What**: `products.ts` (~85–125 SKUs, comentário de contagem), `beverages`/`food` 20–25 cada, `suppliers.ts` >3, `orders.ts` / `generateOrders()` viés segment×category + recompra; `available_in`; `verifyCounts`; docs/compose se cold start exceder healthcheck (NFD-27..33).  
**Where**: `ai-service/seed/data/*.ts`, `seed.ts`.  
**Depends on**: T2 (recomendado)  
**Reuses**: `runSeed`, MERGE `BOUGHT` + `order_date`.  
**Requirement**: NFD-27..NFD-33, ADR-059

**Done when**:

- [ ] `docker compose up` limpo reprodutível.
- [ ] Validação qualitativa spec: após 3–4 compras mesma categoria ainda há candidatos inéditos no país (nota de smoke).

**Verify**: `verifyCounts` + compose.  
**Tests**: seed verification existente  
**Gate**: slow  
**Commit**: `feat(ai-service): expand seed for catalog density (M16)`

---

### T6: Tipos frontend + `adaptRecommendations` defensivo

**What**: `EligibilityItem` / campos opcionais em `RecommendationResult`; mapear elegibilidade; backward-compat sem campos.  
**Where**: `frontend/lib/types.ts`, `lib/adapters/recommend.ts`.  
**Depends on**: T3  
**Requirement**: NFD-03, tabela error handling no design

**Done when**:

- [ ] Campos ausentes ⇒ todos elegíveis; strings humanas no adapter quando aplicável.

**Verify**: Unit tests do adapter.  
**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(frontend): map recommendation eligibility fields`

---

### T7: `lib/catalog/eligibility.ts` + testes

**What**: `resolveEligibilityBadge`, `filterSuppressedItems`; precedência `in_cart > recently_purchased > no_country > no_embedding`.  
**Where**: `frontend/lib/catalog/eligibility.ts` + testes.  
**Depends on**: T6  
**Requirement**: NFD-06, NFD-08, NFD-14, ADR-057

**Done when**:

- [ ] Casos de precedência e mapa vazio cobertos.

**Verify**: Vitest no frontend.  
**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(frontend): eligibility badge resolution helpers`

---

### T8: Zustand `catalogSlice` + `useCatalogViewMode` + reset no cliente

**What**: `viewMode`, `setViewMode`, `resetViewMode`; hook; `setSelectedClient` ⇒ `resetViewMode()` e política NFD-17 para mapa de elegibilidade.  
**Where**: slices catálogo + cliente.  
**Depends on**: None (merge independente de T6–T7)  
**Requirement**: NFD-10, NFD-17, ADR-056

**Done when**:

- [ ] Troca de cliente não deixa modo ranking stale.

**Verify**: Testes de store ou smoke.  
**Tests**: unit (store) opcional  
**Gate**: quick  
**Commit**: `feat(frontend): catalog view mode in zustand`

---

### T9: `fetchEligibility` + `CatalogPanel` (paralelo ao carrinho)

**What**: `useEffect` em `selectedClient`: `fetchEligibility` ∥ `getCart`; `eligibilityMap`, `eligibilityLoading`; merge com resposta full recommend.  
**Where**: `CatalogPanel.tsx`, cliente HTTP.  
**Depends on**: T4, T6, T7, T8  
**Requirement**: NFD-15, NFD-17, ADR-058

**Done when**:

- [ ] Falha eligibility ⇒ mapa vazio, sem crash.
- [ ] `eligibilityMap` como fonte única para badges + `RecentPurchasesPanel`.

**Verify**: Smoke com erro 500 no eligibility.  
**Tests**: RTL opcional  
**Gate**: medium  
**Commit**: `feat(frontend): prefetch eligibility on client select`

---

### T10: `EligibilityBadge`, `CatalogModeToggle`, `RecentPurchasesPanel`

**What**: Componentes novos conforme `design.md` (skeleton, empty, a11y, `motion-safe`).  
**Where**: `frontend/components/catalog/*.tsx`  
**Depends on**: T7  
**Requirement**: NFD-13, NFD-16, NFD-10..12, a11y checklist

**Done when**:

- [ ] Toggle: `aria-pressed`, touch target; painel: roles list/listitem.

**Verify**: Storybook ou RTL.  
**Tests**: component  
**Gate**: quick  
**Commit**: `feat(frontend): catalog eligibility UI primitives (M16)`

---

### T11: `ProductCard` + `CatalogPanel` grid + `ProductDetailModal`

**What**: Badge vs score mutuamente exclusivos; estilos ranking; `data-ineligible`; vitrine vs ranking + separador + zero elegíveis (NFD-07); `ProductDetailModal` NFD-19; `RecentPurchasesPanel` acima da grelha.  
**Where**: `ProductCard.tsx`, `CatalogPanel.tsx`, modal de detalhe.  
**Depends on**: T9, T10  
**Requirement**: NFD-07, NFD-11, NFD-12, NFD-18, NFD-19, spec P1 UI

**Done when**:

- [ ] `resolveEligibilityBadge` antes de `scoreBadge` em `renderItem`.

**Verify**: Smoke manual dos modos e clientes.  
**Tests**: RTL / E2E prep  
**Gate**: medium  
**Commit**: `feat(frontend): catalog panel M16 ranking and eligibility wiring`

---

### T12: `PostCheckoutOutcomeNotice` — atribuição modelo vs filtros

**What**: Secções “O que mudou no modelo” / “Filtros aplicados”; `attributionMode`; copy NFD-22..26.  
**Where**: `PostCheckoutOutcomeNotice.tsx` + tipos.  
**Depends on**: T11 (útil para QA)  
**Requirement**: NFD-21..NFD-26

**Done when**:

- [ ] Compra recente como filtro operacional, não como rejeição do modelo.

**Verify**: Smoke pós-checkout.  
**Tests**: unit se copy extraída  
**Gate**: quick  
**Commit**: `feat(frontend): post-checkout attribution model vs filters (M16)`

---

### T13: `CoverageStatusBanner` (opcional) + polish

**What**: Extensão opcional `viewMode` no banner; selectors E2E.  
**Depends on**: T11  
**Requirement**: design Part I (opcional)

**Done when**:

- [ ] Opcional entregue ou explicitamente “deferred” no PR.

**Gate**: quick  
**Commit**: `chore(frontend): M16 catalog polish and optional banner context`

---

### T14: E2E M16

**What**: Cliente com compra recente → prefetch → badges → toggle vitrine/ranking → painel → detalhe.  
**Where**: `frontend/e2e/tests/m16-*.spec.ts`  
**Depends on**: T11, T4, T5 (dados credíveis)  
**Requirement**: testes independentes spec P1

**Done when**:

- [ ] Playwright (ou stack do repo) verde.

**Verify**: comando e2e do projeto.  
**Tests**: e2e  
**Gate**: slow  
**Commit**: `test(e2e): M16 eligibility and catalog modes`

---

### T15: Re-baseline métricas (NFD-34..38)

**What**: `precisionAt5` em README ou `.specs/project/STATE.md`; notas `recall@10` / `nDCG@10`; reavaliar `SOFT_NEGATIVE_SIM_THRESHOLD` / `negativeSamplingRatio` com rationale; gate `precisionAt5`.  
**Depends on**: T5 + run de treino  
**Requirement**: NFD-34..NFD-38

**Done when**:

- [ ] Baseline datado + commit referenciado.

**Verify**: revisão + números do treino.  
**Gate**: slow  
**Commit**: `docs: M16 metrics baseline after seed expansion`

---

## Requirement traceability (resumo)

| Tasks | NFD / ADR |
|-------|-----------|
| T1–T4 | NFD-01..05, ADR-055,058,060 |
| T5 | NFD-27..33, ADR-059 |
| T6–T13 | NFD-06..19, NFD-22..26, ADR-056,057 |
| T14 | E2E P1 |
| T15 | NFD-34..38 |

---

## Subdivisão opcional de T5 (equipa grande)

- **T5a**: apenas `products.ts` + comentário de contagem  
- **T5b**: `suppliers.ts`  
- **T5c**: `orders.ts` / `generateOrders`  
- **T5d**: `verifyCounts` + compose + docs cold start  

Ordem sugerida: T5a → T5b → T5c → T5d.
