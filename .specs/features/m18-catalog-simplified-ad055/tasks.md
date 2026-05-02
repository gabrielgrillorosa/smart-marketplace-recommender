# M18 — Catálogo simplificado & contrato AD-055 — Tasks

**Spec:** [spec.md](./spec.md)  
**Design:** [design.md](./design.md)  
**ADRs (actualizar na fecho):** [ADR-055](../m16-neural-first-didactic-ranking-catalog-density/adr-055-eligibility-enriched-recommendation-contract.md), [ADR-056](../m16-neural-first-didactic-ranking-catalog-density/adr-056-view-mode-zustand-flag-catalog-view-mode-hook.md), [ADR-058](../m16-neural-first-didactic-ranking-catalog-density/adr-058-early-eligibility-prefetch-on-client-select.md)  
**Roadmap:** [.specs/project/ROADMAP.md](../../project/ROADMAP.md) — **M18**

**Status:** **IMPLEMENTED** — 2026-04-30. CSL-01…CSL-11 ver [spec.md](./spec.md) (rastreio).

---

## Execution plan

Há dois eixos: **contrato HTTP (`ai-service` + proxy)** e **frontend (Zustand + `CatalogPanel`)**. O cliente deve assumir payload filtrado; implementar **backend primeiro** evita UI a depender de linhas omitidas.

```text
        T1 ──► T2 ──► T6
         │
         └──► T3 ──► T4 ──► T5 ──► T7 ──► T8 ──► T9
```

- **T1 → T2:** filtro CSL-01 estável antes de alinhar `eligibilityOnly` e testes de contrato.
- **T1 → T3:** tipos/adaptadores no frontend podem assumir omissão (ou stubs até T1 merge).
- **T4 → T5:** remover `viewMode` antes de simplificar o ramo visual «uma vista».
- **T6:** prefetch / proxy — pode seguir T2 (mesma política CSL-03) ou em PR separado logo após T2.
- **T9 (docs/ADR):** último ou em paralelo após **T8** se a decisão já estiver congelada no código.

---

## Task breakdown

### T1 — `ai-service`: serialização HTTP filtrada (CSL-01, CSL-04)

**What:** Na resposta enviada ao cliente (`POST /recommend` e variantes que serializam a mesma lista), **omitir** itens com `eligible === false` e `eligibilityReason` ∈ {`no_embedding`, `in_cart`}. Manter elegíveis + inelegíveis `recently_purchased` com `eligible`, `eligibilityReason`, `suppressionUntil` alinhados a [NFD-03](../m16-neural-first-didactic-ranking-catalog-density/spec.md). O pipeline interno (candidatos completos, ranking) **não** muda — só a camada de serialização HTTP.

**Where:** Ponto único de serialização de recomendações para JSON (ex. helper partilhado por rotas/handlers); `ai-service/src/types/index.ts` se precisar de tipo de «item exposto ao cliente».

**Depends on:** —

**Reuses:** Lógica de elegibilidade existente; apenas filtro antes de `res.json`.

**Requirement:** CSL-01, CSL-04; edge «zero elegíveis + só recentes» do [spec § P1 payload ac‑5](./spec.md#p1-payload-de-recomendação-omite-inelegíveis-excepto-compra-recente--mvp)

**Done when:**

- [ ] Fixture com `in_cart`, `no_embedding`, `recently_purchased`: JSON sem as duas primeiras razões; recentes presentes com metadados correctos.
- [ ] Nenhum regresso HTTP 500 no caso «só recentes».

**Verify:** Testes de integração ou unit no serializer + chamada feliz ao handler.

**Tests:** `ai-service` — unit/integration conforme [.specs/codebase/ai-service/TESTING.md](../../codebase/ai-service/TESTING.md).

**Gate:** medium  
**Commit:** `feat(ai-service): filter recommend HTTP payload for AD-055 (M18)`

---

### T2 — `eligibilityOnly` + testes de contrato (CSL-03)

**What:** Caminho `eligibilityOnly: true` (ou equivalente) aplica a **mesma** política de omissão que CSL-01 **ou** é removido/substituído com decisão documentada em código + `design.md` §7 — evitar devolver de novo o mapa completo de inelegíveis.

**Where:** Mesmo serviço/handlers que T1; README `ai-service` com exemplo JSON antes/depois ([spec § Verificação](./spec.md#verificação-de-fecho-checklist)).

**Depends on:** T1

**Reuses:** Helper de filtro de T1.

**Requirement:** CSL-03

**Done when:**

- [ ] Cliente ou teste automatizado não recebe `no_embedding` / `in_cart` via `eligibilityOnly` sem opt-in explícito documentado.
- [ ] README com snippet antes/depois M16 vs M18.

**Verify:** Teste dedicado ao path `eligibilityOnly`.

**Gate:** medium  
**Commit:** `feat(ai-service): align eligibilityOnly with M18 payload (CSL-03)`

---

### T3 — Frontend: adaptadores e mapa de elegibilidade pós-resposta (CSL-01, CSL-04)

**What:** `adaptRecommendations` / `mergedEligibilityMap` e consumidores assumem **subconjunto** da resposta: não iterar inelegíveis omitidos; `in_cart` / `no_embedding` para UI vêm de **outras fontes** (ex. `getCart`) onde o [spec § Edge cases](./spec.md#edge-cases) exige.

**Where:** `frontend/src/...` (fetcher, hooks de recomendação, tipos compartilhados se existirem).

**Depends on:** T1 (idealmente merged; desenvolvimento local pode usar mock até lá).

**Reuses:** Padrões M16 de merge de scores.

**Requirement:** CSL-01, CSL-04; edge «carrinho para CTA» do spec.

**Done when:**

- [ ] Sem acessos a campos de itens que deixaram de existir no JSON.
- [ ] CTAs de carrinho continuam coerentes com estado real do carrinho.

**Verify:** Typecheck + testes de unidade no adaptador se existirem.

**Gate:** quick  
**Commit:** `refactor(frontend): consume filtered recommend payload (M18)`

---

### T4 — Remover modo vitrine/ranking e painel (CSL-05, CSL-06)

**What:** Remover `CatalogModeToggle`, `RecentPurchasesPanel` do fluxo e ficheiros sem consumidores; remover `catalogSlice.viewMode`, `setViewMode`, `toggleViewMode`, `resetViewMode`; remover `useCatalogViewMode.ts`; `clientSlice` deixa de chamar reset de `viewMode` ([design §6.1](./design.md#61-remover-ou-deixar-de-montar)).

**Where:** `frontend/src/features/catalog/...` (ou paths reais após grep).

**Depends on:** T3 (pode sobrepor-se no tempo com T5 se merges forem pequenos).

**Reuses:** —

**Requirement:** CSL-05, CSL-06; critérios [spec § P1 remoção](./spec.md#p1-remoção-de-estado-viewmode-e-painel-dedicado--mvp)

**Done when:**

- [ ] `grep` sem strings de toggle M16 nem `RecentPurchasesPanel` montado.
- [ ] Build e testes de fumo a verde.

**Verify:** `grep -R` + `pnpm test` / `npm test` no pacote frontend.

**Gate:** quick  
**Commit:** `refactor(frontend): remove viewMode toggle and RecentPurchasesPanel (M18)`

---

### T5 — Vista única pós-«Ordenar por IA»: bloco principal + rodapé (CSL-07, CSL-09)

**What:** Substituir condicionais `ordered && … && viewMode === 'ranking'` por ramo único conforme [design §2](./design.md#2-arquitectura-ui-alvo): **primaryRanked** (elegíveis com score) + separador condicional com literal exacto **—— Fora do ranking nesta janela ——** + **footerRecent** só `recently_purchased`. Opcional: `RankingFooterHeading.tsx` (`data-testid="catalog-ranking-footer-heading"`) e `selectCatalogRankingSections.ts` ([design §6.2](./design.md#62-novo-ou-extraído-opcional-preferência-por-legibilidade)). Cards do rodapé: **NFD-18** — sem score badge.

**Where:** `CatalogPanel` (e hooks `useCatalogOrdering` se necessário); não expandir escopo a pesquisa semântica além do [design §4](./design.md#4-layout-da-vista-complexa-pós-ordenar-por-ia).

**Depends on:** T4

**Reuses:** `ReorderableGrid`, `ProductCard`, `EligibilityBadge`.

**Requirement:** CSL-07, CSL-09

**Done when:**

- [ ] Sem cabeçalho órfão quando não há recentes ([design §4](./design.md#4-layout-da-vista-complexa-pós-ordenar-por-ia) regra de visibilidade).
- [ ] Ordem: ranqueados primeiro, depois rodapé; `rankScore`/M17 quando activo no bloco principal.

**Verify:** Testes de componente ou Storybook se existir; revisão manual.

**Gate:** medium  
**Commit:** `feat(frontend): single AI ordering view with ranking footer (M18)`

---

### T6 — Prefetch / proxy: política CSL-03 no cliente (CSL-03, CSL-08 parcial)

**What:** Alinhar chamada prefetch (`eligibilityOnly` via proxy) à mesma omissão **ou** remover prefetch com nota em ADR-058 ([design §7](./design.md#7-dados-prefetch--eligibilityonly-csl-03)). Garantir que mudança de cliente limpa estado de ordenação IA sem stale ([CSL-08](./spec.md#requirement-traceability)).

**Where:** Hook de selecção de cliente + proxy `frontend`; ADR-058 actualizado em T9 se a decisão for só documental.

**Depends on:** T2 (contrato estável no backend).

**Reuses:** Fluxo actual de prefetch M16.

**Requirement:** CSL-03, CSL-08

**Done when:**

- [ ] Não há reintrodução silenciosa do mapa completo de inelegíveis no cliente.
- [ ] Reset de cliente consistente com spec.

**Verify:** Teste manual ou E2E parcial; unit no hook se aplicável.

**Gate:** medium  
**Commit:** `fix(frontend): align eligibility prefetch with M18 contract`

---

### T7 — Copy e banners (zero elegíveis, CoverageStatusBanner)

**What:** Remover referências a «vitrine» / modos duplos em `catalog-zero-eligible-ranking` e `CoverageStatusBanner` se ainda mencionarem M16 ([design §5](./design.md#5-zero-elegíveis-csl-05--edge-spec)).

**Where:** Componentes de banner/alerta do catálogo.

**Depends on:** T5 (copy depende da UX final).

**Reuses:** `data-testid` existentes.

**Requirement:** CSL-07 (edge zero elegíveis); alinhamento com [spec](./spec.md).

**Done when:**

- [ ] Copy não contradiz AD-055; testids estáveis mantidos ou actualizados com nota no E2E.

**Gate:** quick  
**Commit:** `chore(frontend): catalog copy for M18 single-mode UX`

---

### T8 — E2E (CSL-10)

**What:** Actualizar ou renomear E2E para fluxo M18: [`m18-catalog-ad055`](../../../frontend/e2e/tests/m18-catalog-ad055.spec.ts) — ausência de toggle e painel; rodapé condicional; ordem elegíveis → recentes; `data-testid` do [design §8](./design.md#8-acessibilidade--testes).

**Where:** `frontend/e2e/...`

**Depends on:** T5, T6, T7

**Reuses:** Fixtures de cliente com supressão recente.

**Requirement:** CSL-10

**Done when:**

- [ ] Pipeline E2E relevante a verde em CI/local.

**Gate:** medium  
**Commit:** `test(e2e): update catalog flows for M18 AD-055`

---

### T9 — ADRs + rastreio CSL (CSL-11)

**What:** Marcar ADR-055 / 056 / 058 como *Amended* ou *Superseded* com ligação a este [spec.md](./spec.md) e a [tasks.md](./tasks.md); actualizar tabela de requisitos no `spec.md` (CSL-* → Verified onde aplicável).

**Where:** ADRs em `.specs/features/m16-.../`; `spec.md` M18; opcionalmente `STATE.md` / `ROADMAP.md` (milestone **Implemented**).

**Depends on:** T8 (ou T7 se E2E for follow-up — preferência: após T8).

**Reuses:** Formato de ADR já usado no repo.

**Requirement:** CSL-11; [spec § Goals documentação](./spec.md#goals)

**Done when:**

- [ ] ADRs reflectem contrato e UX M18; spec checklist de verificação actualizado.

**Gate:** quick  
**Commit:** `docs: amend ADR-055/056/058 for M18 catalog AD-055`

---

## Rastreio rápido CSL → task

| ID | Task(s) |
|----|---------|
| CSL-01 | T1, T3 |
| CSL-02 | T1 |
| CSL-03 | T2, T6 |
| CSL-04 | T1, T3 |
| CSL-05 | T4 |
| CSL-06 | T4 |
| CSL-07 | T5, T7 |
| CSL-08 | T6 |
| CSL-09 | T5 |
| CSL-10 | T8 |
| CSL-11 | T9 |

---

## Verificação de fecho (reexport do spec)

- [ ] Testes unitários/integration `ai-service` para forma do payload.
- [ ] Testes de componente/E2E frontend para CSL-05..07.
- [ ] README ou `ai-service/README.md` com exemplo JSON antes/depois.
- [ ] ADRs referenciados actualizados e ligados a este ficheiro.

**Próximo passo workflow:** `execute` (PRs por task ou batches T1+T2, etc.) → actualizar **Status** no topo deste ficheiro e em [STATE.md](../../project/STATE.md).
