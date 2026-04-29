# M14 — Catalog Score Visibility & Cart-Aware Showcase — Tasks

**Design**: `.specs/features/m14-catalog-score-visibility-cart-aware-showcase/design.md`  
**Spec**: `.specs/features/m14-catalog-score-visibility-cart-aware-showcase/spec.md`  
**Testing**:

- `.specs/codebase/frontend/TESTING.md`

**Status**: Draft

---

## Execution Plan

### Phase 1: Shared Ranking Window And Catalog Coverage (Partial Parallel)

The shared ranking-window contract must exist first. After that, catalog coverage state and analysis state can evolve in parallel because they touch different store surfaces. Catalog fetch wiring, coverage messaging, and product-context polish then land sequentially to avoid overlapping edits in `CatalogPanel`.

```text
      T2 [P] -> T4 -> T5 -> T6
     /
T1 -<
     \
      T3 [P]
```

### Phase 2: Analysis Deltas And Principal-Flow Migration (Sequential)

Analysis deltas build on the new snapshot contract. Once analysis orchestration is stable and the catalog surface is finalized, principal-flow vocabulary and the Playwright acceptance path can be updated once.

```text
T3 -> T7 -> T8
T6 -----------\
               -> T9 -> T10
T8 -----------/
```

---

## Task Breakdown

### T1: Create shared ranking-window helper

**What**: Create the explicit ranking-depth contract used by both catalog ordered mode and analysis snapshots.  
**Where**:

- `frontend/lib/showcase/ranking-window.ts`

**Depends on**: None  
**Reuses**: Current catalog dataset assumptions (`size=100`) and the approved `full` / `diagnostic` coverage modes from ADR-047.  
**Requirement**: SHOW-01, SHOW-02, SHOW-07, SHOW-12, SHOW-34, SHOW-35, SHOW-37, SHOW-38

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `CoverageMode`, `RankingWindow`, and `CoverageMeta` are exported from a pure helper module.
- [ ] `resolveShowcaseRankingWindow()` derives `requestedLimit`, `totalCatalogItems`, `mode`, and `truncated` without depending on React or Zustand.
- [ ] `buildShowcaseRequestKey()` (or equivalent) encodes `clientId + mode + totalCatalogItems + searchStateKind`.
- [ ] `full` mode is sized to cover the seeded project catalog by default and does not silently fall back to `10`.
- [ ] `diagnostic` mode can raise the requested coverage window explicitly.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: frontend compiles cleanly with the new shared ranking-window helper.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add shared ranking window contract for catalog and analysis`

---

### T2: Extend `recommendationSlice` with coverage metadata [P]

**What**: Replace the client-only ordered-session cache with request-key-based metadata for coverage state.  
**Where**:

- `frontend/store/recommendationSlice.ts`
- `frontend/lib/hooks/useRecommendations.ts`
- `frontend/lib/hooks/useCatalogOrdering.ts`

**Depends on**: T1  
**Reuses**: Existing ordered toggle, recommendation list storage, and reset semantics from the M8/M13 store.  
**Requirement**: SHOW-01, SHOW-04, SHOW-05, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Store state includes `coverageMeta` and `requestKey` instead of relying only on `cachedForClientId`.
- [ ] `setRecommendations()` accepts enough metadata to describe the coverage window used by the fetch.
- [ ] `clearRecommendations()` resets coverage metadata and ordered state together.
- [ ] `useRecommendations()` exposes ordered coverage metadata to the catalog surface.
- [ ] `useCatalogOrdering()` continues to provide a simple reset/toggle interface after the store shape changes.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the updated store shape compiles and no existing ordered-mode imports break.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): track ordered catalog coverage metadata in recommendation slice`

---

### T3: Extend `analysisSlice` with ranking-window snapshots and explicit cart clearing [P]

**What**: Evolve the analysis state machine so snapshots carry ranking-window metadata and empty-cart reset is modeled as a real action.  
**Where**:

- `frontend/store/analysisSlice.ts`

**Depends on**: T1  
**Reuses**: Existing discriminated union from M11 and persisted `awaitingRetrain*` fields from M13.  
**Requirement**: SHOW-08, SHOW-09, SHOW-10, SHOW-11, SHOW-12, SHOW-13, SHOW-14, SHOW-15, SHOW-33, SHOW-37

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `Snapshot` includes `window: RankingWindow`.
- [ ] `postCheckout` allows `cart: Snapshot | null`.
- [ ] `clearCartAware(clientId)` exists and preserves `postCheckout` while removing only the current cart snapshot.
- [ ] `captureCartAware()` no longer has to overload `[]` as a proxy for "cart cleared".
- [ ] Type transitions remain explicit and compile cleanly (`empty | initial | cart | postCheckout`).
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: `analysisSlice` compiles with the widened snapshot contract and explicit clear action.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): model analysis snapshots with ranking metadata and explicit cart clearing`

---

### T4: Refactor ordered catalog fetches to use the shared ranking window

**What**: Update the recommendation fetch hook and ordered-mode trigger to fetch by ranking window and invalidate by request key.  
**Where**:

- `frontend/lib/hooks/useRecommendationFetcher.ts`
- `frontend/components/catalog/CatalogPanel.tsx`

**Depends on**: T2  
**Reuses**: Existing `/api/proxy/recommend` route, `apiFetch`, ordered CTA, and toast behavior.  
**Requirement**: SHOW-01, SHOW-02, SHOW-04, SHOW-05, SHOW-06, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `useRecommendationFetcher.fetch()` accepts `{ window, requestKey }` (or equivalent) instead of only `clientId`.
- [ ] The POST body uses `window.requestedLimit`, never a hard-coded `10`.
- [ ] Reusing the same `requestKey` can skip a redundant refetch, but any changed catalog session invalidates the ordered state.
- [ ] Fetch failure clears stale ordered coverage state instead of leaving stale badges visible.
- [ ] The catalog computes the window from the visible filtered grid, not from an unrelated global top-10 assumption.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: ordered catalog fetches compile with the new window/request-key contract.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): make ordered catalog fetches coverage-aware`

---

### T5: Add coverage banner and diagnostic-mode UX

**What**: Create the ordered-mode coverage banner and wire explicit truncation / diagnostic-mode messaging into the catalog.  
**Where**:

- `frontend/components/catalog/CoverageStatusBanner.tsx`
- `frontend/components/catalog/CatalogPanel.tsx`

**Depends on**: T4  
**Reuses**: Existing catalog toolbar/button styling and compact status copy patterns from `CartSummaryBar`.  
**Requirement**: SHOW-03, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] The banner is hidden when ordered mode is off.
- [ ] Ordered-mode loading state announces that the current coverage window is being fetched.
- [ ] Ready state communicates how many products received score in the current window.
- [ ] Truncated state communicates `pontuados vs fora da cobertura` and exposes a diagnostic-mode action.
- [ ] If semantic search results are active, the copy explicitly clarifies that M14 coverage targets the filtered catalog grid, not semantic-search ranking.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the catalog renders an explicit ordered-mode status surface with no type or build errors.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add explicit coverage status banner for ordered catalog mode`

---

### T6: Preserve product context and modal score summary

**What**: Finish the catalog-side M14 polish so category/supplier remain visible while ordered mode is active and the product modal shows the same score context as the card.  
**Where**:

- `frontend/components/catalog/CatalogPanel.tsx`
- `frontend/components/catalog/ProductCard.tsx`
- `frontend/components/catalog/ProductDetailModal.tsx`

**Depends on**: T5  
**Reuses**: Existing `ScoreBadge`, category/supplier badges, and dialog composition.  
**Requirement**: SHOW-03, SHOW-39, SHOW-40, SHOW-41, SHOW-42, SHOW-43

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Ordered cards preserve visible category and supplier context while rendering score badges.
- [ ] Badge stacking does not hide cart affordances or metadata when ordered mode is active.
- [ ] `ProductDetailModal` receives existing score metadata from the catalog and does not trigger a second recommendation fetch.
- [ ] The modal renders a compact summary block for `Score final`, `Neural`, and `Semântico` only when score metadata exists.
- [ ] Build gate passes: `npm run lint && npm run build && npm run test:e2e`.
- [ ] Existing Playwright suite passes with no silent deletions.

**Verify**:

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: catalog-side M14 polish is integrated and the frontend phase-end gate exits 0.

**Tests**: none  
**Gate**: build  
**Commit**: `feat(frontend): preserve product context and modal score summary in ordered mode`

---

### T7: Create delta helper and recommendation delta badge

**What**: Add the pure delta-calculation helper and the presentational badge used by analysis rows.  
**Where**:

- `frontend/lib/showcase/deltas.ts`
- `frontend/components/analysis/RecommendationDeltaBadge.tsx`
- `frontend/components/analysis/RecommendationColumn.tsx`

**Depends on**: T3  
**Reuses**: Existing `RecommendationColumn` presentational boundary and `ScoreBadge`.  
**Requirement**: SHOW-25, SHOW-26, SHOW-27, SHOW-28, SHOW-29, SHOW-30, SHOW-31, SHOW-32, SHOW-33, SHOW-43

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `buildRecommendationDeltaMap()` compares adjacent phases by `product.id`.
- [ ] Supported delta states are `moved`, `unchanged`, `new`, and `outOfWindow`.
- [ ] `RecommendationDeltaBadge` renders readable Portuguese labels such as `subiu`, `caiu`, `sem mudança`, `novo`, and `fora do ranking`.
- [ ] `RecommendationColumn` supports a second metadata line for `supplier · category` plus delta status.
- [ ] Neutral cases explicitly render a visible zero-change state instead of silence.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the delta helper and updated analysis rows compile cleanly.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add recommendation delta helper and badge for analysis columns`

---

### T8: Refactor `AnalysisPanel` to use shared windows and explicit cart resets

**What**: Rewire analysis snapshot orchestration so all phases share the same ranking window, cart clearing removes only the cart snapshot, and deltas are passed into the columns.  
**Where**:

- `frontend/components/recommendations/AnalysisPanel.tsx`

**Depends on**: T7  
**Reuses**: Existing `useModelStatus`, `seededShuffle`, `ModelStatusPanel`, and snapshot-capture lifecycle.  
**Requirement**: SHOW-08, SHOW-09, SHOW-10, SHOW-11, SHOW-12, SHOW-13, SHOW-14, SHOW-15, SHOW-25, SHOW-26, SHOW-27, SHOW-28, SHOW-29, SHOW-30, SHOW-31, SHOW-32, SHOW-33, SHOW-37

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `Com IA`, `Com Carrinho`, and `Pos-Efetivar` fetches all use the shared ranking-window resolver.
- [ ] Empty cart calls `clearCartAware(clientId)` instead of capturing an empty synthetic recommendation list.
- [ ] When the ranking window changes mid-session, the showcase resets and recaptures `Com IA` before comparing again.
- [ ] `RecommendationColumn` receives precomputed delta metadata for adjacent comparisons only.
- [ ] `Pos-Efetivar` remains visible after a confirmed checkout even when a later cart session is cleared.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: analysis orchestration compiles with shared windows and explicit cart reset semantics.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): align analysis snapshots with shared ranking windows and delta metadata`

---

### T9: Finish principal-flow cart vocabulary and selector cleanup

**What**: Remove remaining `Demo` semantics from the principal flow, keep legacy demo paths explicitly isolated, and align the main selectors/test IDs with cart vocabulary.  
**Where**:

- `frontend/components/catalog/CatalogPanel.tsx`
- `frontend/components/recommendations/AnalysisPanel.tsx`
- `frontend/store/index.ts`
- `frontend/e2e/tests/m11-ai-learning-showcase.spec.ts`
- `frontend/e2e/tests/m9a-demo-buy.spec.ts`

**Depends on**: T6, T8  
**Reuses**: Already-cart-based M13 UI and the existing advanced/demo isolation direction in the analysis/retrain surfaces.  
**Requirement**: SHOW-16, SHOW-17, SHOW-18, SHOW-19, SHOW-20, SHOW-21, SHOW-22, SHOW-23, SHOW-24

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Main-flow labels and explanatory text no longer use `Demo Comprar`, `Limpar Demo`, or `Com Demo`.
- [ ] Principal-flow selectors and test IDs reflect cart semantics instead of demo semantics.
- [ ] `store/index.ts` no longer implies demo state as the principal-flow source of intent.
- [ ] Legacy demo scenarios, if retained, are explicitly marked as `legacy` / `advanced` and stop defining the acceptance path for M14.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: principal-flow vocabulary is cart-first and legacy demo paths are clearly isolated.

**Tests**: none  
**Gate**: quick  
**Commit**: `refactor(frontend): finalize cart-first vocabulary for the principal showcase flow`

---

### T10: Update Playwright coverage and run the final frontend gate

**What**: Extend the active acceptance path to prove full-grid score visibility, reactive `Com Carrinho`, readable deltas, and modal score context, then run the final frontend gate.  
**Where**:

- `frontend/e2e/tests/m13-cart-async-retrain.spec.ts`
- `frontend/e2e/tests/m11-ai-learning-showcase.spec.ts`
- `frontend/e2e/tests/m9a-demo-buy.spec.ts`

**Depends on**: T9  
**Reuses**: Existing `data-testid` conventions and the current cart -> checkout -> async retrain flow.  
**Requirement**: SHOW-01, SHOW-02, SHOW-03, SHOW-04, SHOW-05, SHOW-06, SHOW-07, SHOW-08, SHOW-09, SHOW-10, SHOW-11, SHOW-12, SHOW-13, SHOW-14, SHOW-15, SHOW-16, SHOW-17, SHOW-18, SHOW-19, SHOW-20, SHOW-21, SHOW-22, SHOW-23, SHOW-24, SHOW-25, SHOW-26, SHOW-27, SHOW-28, SHOW-29, SHOW-30, SHOW-31, SHOW-32, SHOW-33, SHOW-34, SHOW-35, SHOW-36, SHOW-37, SHOW-38, SHOW-39, SHOW-40, SHOW-41, SHOW-42, SHOW-43

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] The active E2E path validates score coverage beyond the old implicit top-10 behavior.
- [ ] The suite validates `Com Carrinho` recapture on add, remove, and empty-cart reset.
- [ ] The suite validates delta visibility between adjacent phases.
- [ ] The suite validates modal score context when ordered metadata exists.
- [ ] Legacy demo specs no longer define the acceptance path for principal-flow behavior.
- [ ] Build gate passes: `npm run lint && npm run build && npm run test:e2e`.
- [ ] Existing Playwright suite passes with no silent deletions.

**Verify**:

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: the full frontend acceptance gate exits 0 with the M14 principal flow covered.

**Tests**: e2e  
**Gate**: build  
**Commit**: `test(frontend): cover m14 catalog visibility and cart-aware showcase acceptance`

---

## Parallel Execution Map

```text
Phase 1:
  T1
  ├── T2 [P] -> T4 -> T5 -> T6
  └── T3 [P]

Phase 2:
  T3 -> T7 -> T8
  T6 -----------\
                 -> T9 -> T10
  T8 -----------/
```

**Parallelism constraint**:

- `T2 [P]` and `T3 [P]` are the only parallel-safe tasks in this plan.
- They have no unfinished mutual dependencies.
- They do not modify the same files.
- Frontend testing matrix requires `none` for these layers, so there is no shared test runner bottleneck.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 helper module / 1 contract | ✅ Granular |
| T2 | 1 store surface (`recommendationSlice` + hooks) | ✅ Granular |
| T3 | 1 store surface (`analysisSlice`) | ✅ Granular |
| T4 | 1 ordered-fetch contract | ✅ Granular |
| T5 | 1 catalog coverage UX surface | ✅ Granular |
| T6 | 1 cohesive catalog-context polish slice | ✅ Granular |
| T7 | 1 delta calculation + presentation slice | ✅ Granular |
| T8 | 1 analysis orchestration refactor | ✅ Granular |
| T9 | 1 vocabulary / selector migration slice | ✅ Granular |
| T10 | 1 E2E acceptance and final gate task | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | No inbound arrows | ✅ Match |
| T2 | T1 | `T1 -> T2` | ✅ Match |
| T3 | T1 | `T1 -> T3` | ✅ Match |
| T4 | T2 | `T2 -> T4` | ✅ Match |
| T5 | T4 | `T4 -> T5` | ✅ Match |
| T6 | T5 | `T5 -> T6` | ✅ Match |
| T7 | T3 | `T3 -> T7` | ✅ Match |
| T8 | T7 | `T7 -> T8` | ✅ Match |
| T9 | T6, T8 | `T6 -> T9`, `T8 -> T9` | ✅ Match |
| T10 | T9 | `T9 -> T10` | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | `frontend/lib/showcase/*` helper | none | none | ✅ OK |
| T2 | Zustand store + hooks | none | none | ✅ OK |
| T3 | Zustand store | none | none | ✅ OK |
| T4 | hook + catalog component wiring | none | none | ✅ OK |
| T5 | React component | none | none | ✅ OK |
| T6 | React components / modal | none | none | ✅ OK |
| T7 | helper + React components | none | none | ✅ OK |
| T8 | React orchestration component | none | none | ✅ OK |
| T9 | React copy/selectors + legacy E2E positioning | none | none | ✅ OK |
| T10 | Full principal-flow E2E | e2e | e2e | ✅ OK |

**Note**: The frontend test matrix has no unit/component runner. Phase-end protection therefore happens through the build gates in `T6` and `T10`, both running `npm run lint && npm run build && npm run test:e2e`.

---

## Requirement Traceability

| Task | Requirements Covered |
|---|---|
| T1 | SHOW-01, SHOW-02, SHOW-07, SHOW-12, SHOW-34, SHOW-35, SHOW-37, SHOW-38 |
| T2 | SHOW-01, SHOW-04, SHOW-05, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38 |
| T3 | SHOW-08, SHOW-09, SHOW-10, SHOW-11, SHOW-12, SHOW-13, SHOW-14, SHOW-15, SHOW-33, SHOW-37 |
| T4 | SHOW-01, SHOW-02, SHOW-04, SHOW-05, SHOW-06, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38 |
| T5 | SHOW-03, SHOW-07, SHOW-34, SHOW-35, SHOW-36, SHOW-38 |
| T6 | SHOW-03, SHOW-39, SHOW-40, SHOW-41, SHOW-42, SHOW-43 |
| T7 | SHOW-25, SHOW-26, SHOW-27, SHOW-28, SHOW-29, SHOW-30, SHOW-31, SHOW-32, SHOW-33, SHOW-43 |
| T8 | SHOW-08, SHOW-09, SHOW-10, SHOW-11, SHOW-12, SHOW-13, SHOW-14, SHOW-15, SHOW-25, SHOW-26, SHOW-27, SHOW-28, SHOW-29, SHOW-30, SHOW-31, SHOW-32, SHOW-33, SHOW-37 |
| T9 | SHOW-16, SHOW-17, SHOW-18, SHOW-19, SHOW-20, SHOW-21, SHOW-22, SHOW-23, SHOW-24 |
| T10 | SHOW-01..SHOW-43 acceptance sweep |

---

## Pre-Execution: MCPs And Skills

Before executing the tasks, confirm which tools to use per task.

**Recommended defaults for this feature**:

- MCPs: NONE
- Skills:
  - `tlc-spec-driven` for orchestration
  - `coding-guidelines` for implementation tasks

**Execution note**:

- Start with `T1`, then run `T2` and `T3` in parallel if you want the fastest safe path.
- Because the frontend has no unit/component test runner, do not skip the build gates in `T6` and `T10`.
