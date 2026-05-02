# M15 — Cart Integrity & Comparative UX — Tasks

**Design**: `.specs/features/m15-cart-integrity-comparative-ux/design.md`  
**Spec**: `.specs/features/m15-cart-integrity-comparative-ux/spec.md`  
**Testing**:

- `.specs/codebase/api-service/TESTING.md`
- `.specs/codebase/frontend/TESTING.md`

**Status**: Implemented — reconciliado em 2026-04-29

## Execution Outcome

- T1..T10 foram entregues entre `api-service` e `frontend`: `ProductAvailabilityPolicy`, bloqueio proativo por país, reconciliação frontend/backend, enriquecimento transitório do `ClientProfileCard` e copy final de `ModelStatusPanel` / `PostCheckoutOutcomeNotice`.
- A evidência principal está em `ProductAvailabilityPolicyTest`, `CartApplicationServiceTest`, `CartControllerIT` e `frontend/e2e/tests/m15-cart-integrity-comparative-ux.spec.ts`.
- Os checklists abaixo foram preservados como plano histórico de execução; o fechamento formal passou a ser rastreado por este status, pelo `spec.md` reconciliado e pelo `ROADMAP.md`.

---

## Execution Plan

### Phase 1: Backend Country Compatibility Guard (Sequential)

The shared availability policy and the cart-specific exception must exist before `CartApplicationService.addItem()` can call them. The api-service phase build gate runs once at the end of this phase, after `CartControllerIT` has been extended.

```text
T1 -> T2 -> T3
```

### Phase 2: Frontend Pure Helpers (Partial Parallel)

Three independent pure modules feed Phase 3. They touch different files and different store surfaces, so they can land in parallel after Phase 1 stabilizes the backend contract.

```text
        T4 [P]
       /
T3 ---<  T5 [P]
       \
        T6 [P]
```

### Phase 3: Frontend Wiring (Sequential)

Each helper is wired into its own React surface in a fixed order to avoid overlapping edits in `AnalysisPanel.tsx` between profile enrichment and post-checkout outcome work.

```text
T4 -> T7
T5 -> T8
T6 -> T9
```

### Phase 4: Acceptance And Phase Build Gate (Sequential)

The frontend phase-end build gate runs once, after E2E coverage has been extended for the M15 acceptance path.

```text
T7, T8, T9 -> T10
```

---

## Task Breakdown

### T1: Add `ProductAvailabilityPolicy` and `CartItemUnavailableException`

**What**: Introduce the shared backend availability policy and the semantic cart exception so add-item and checkout share the same country-compatibility invariant.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/service/ProductAvailabilityPolicy.java` (new)
- `api-service/src/main/java/com/smartmarketplace/exception/CartItemUnavailableException.java` (new)
- `api-service/src/main/java/com/smartmarketplace/exception/GlobalExceptionHandler.java`
- `api-service/src/test/java/com/smartmarketplace/service/ProductAvailabilityPolicyTest.java` (new)

**Depends on**: None  
**Reuses**: `Client.country`, `Product.countries`, the existing `ErrorResponse` contract, and the `422` mapping precedent already used by `CartEmptyException`.  
**Requirement**: INTEG-01, INTEG-02, INTEG-08

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `ProductAvailabilityPolicy` exposes `assertAvailableForClientCountry(Client, Product)` and `assertAllAvailableForClientCountry(Client, List<Product>)`.
- [ ] `CartItemUnavailableException` extends the existing semantic-error base used by other cart exceptions and carries an explicit human-readable message naming the product and the client country.
- [ ] `GlobalExceptionHandler` maps `CartItemUnavailableException` to `422` with the standard `ErrorResponse` body, matching the contract used by `CartEmptyException`.
- [ ] `ProductAvailabilityPolicyTest` covers compatible client/product, incompatible client/product, missing client country, missing product countries, and bulk assertion failure pointing to the first offender.
- [ ] No existing exception mapping or `ErrorResponse` shape is broken.
- [ ] Gate check passes: `./mvnw test -Dtest=ProductAvailabilityPolicyTest`.

**Verify**:

```bash
cd api-service && ./mvnw test -Dtest=ProductAvailabilityPolicyTest
```

Expected: the new policy unit suite is green and `GlobalExceptionHandler` compiles with the new mapping.

**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(api-service): add product availability policy and cart item unavailable exception`

---

### T2: Enforce country compatibility inside `CartApplicationService.addItem()`

**What**: Call `ProductAvailabilityPolicy.assertAvailableForClientCountry()` before the cart is created or mutated, and reuse the same policy in `OrderApplicationService.createOrder()` so the two paths cannot drift.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/service/CartApplicationService.java`
- `api-service/src/main/java/com/smartmarketplace/service/OrderApplicationService.java`
- `api-service/src/main/java/com/smartmarketplace/repository/ProductRepository.java`
- `api-service/src/test/java/com/smartmarketplace/service/CartApplicationServiceTest.java`

**Depends on**: T1  
**Reuses**: Existing `findByIdWithDetails()` / `findAllByIdWithCountries()` queries on `ProductRepository`, the current `addItem()` happy path, and the existing `OrderApplicationService` country-validation site.  
**Requirement**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-09, INTEG-10

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `addItem()` loads the product with its countries and calls `ProductAvailabilityPolicy.assertAvailableForClientCountry()` before any cart entity is created or persisted.
- [ ] When the policy throws, no cart, cart-item, or quantity change is committed for that request.
- [ ] Compatible products keep the existing `addItem()` happy path, including upsert quantity increments for repeated adds.
- [ ] `OrderApplicationService.createOrder()` delegates the same invariant to the shared policy (no duplicated country check string).
- [ ] `CartApplicationServiceTest` covers: country-mismatch rejection, cart immutability after rejection, compatible add success, upsert quantity preserved, and incompatible legacy item rejected at checkout time as a defense-in-depth case.
- [ ] Gate check passes: `./mvnw test -Dtest=CartApplicationServiceTest`.

**Verify**:

```bash
cd api-service && ./mvnw test -Dtest=CartApplicationServiceTest
```

Expected: cart service unit suite is green with the new policy in place and no regressions in the existing happy paths.

**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(api-service): block incompatible products at cart boundary via shared policy`

---

### T3: Extend `CartControllerIT` and run the api-service phase build gate

**What**: Prove the `422 ErrorResponse` contract end-to-end on the cart HTTP boundary and run the api-service phase-end gate.  
**Where**:

- `api-service/src/test/java/com/smartmarketplace/controller/CartControllerIT.java`

**Depends on**: T2  
**Reuses**: Existing controller integration setup, seeded clients, and seeded products with country metadata.  
**Requirement**: INTEG-01, INTEG-02, INTEG-03, INTEG-08, INTEG-09

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `CartControllerIT` covers `POST /api/v1/carts/{clientId}/items` returning `422` with the standard `ErrorResponse` shape when the product is incompatible with the client country.
- [ ] `CartControllerIT` confirms the active cart is unchanged after a rejected request.
- [ ] `CartControllerIT` confirms a compatible product is still added successfully.
- [ ] `CartControllerIT` confirms checkout rejects a cart that contains a legacy incompatible item, with the same human-readable message coming from the shared policy.
- [ ] No existing IT scenario is silently removed.
- [ ] Build gate passes: `./mvnw verify`.

**Verify**:

```bash
cd api-service && ./mvnw verify
```

Expected: api-service unit + IT + JaCoCo + checkstyle exit 0 with the M15 cart-integrity scenarios covered.

**Tests**: integration  
**Gate**: build  
**Commit**: `test(api-service): cover cart country-compatibility rejection via integration tests`

---

### T4: Create `cart-integrity` pure helper [P]

**What**: Build the pure helper used by `CatalogPanel`, `ProductCard`, and `CartSummaryBar` to distinguish disabled-CTA reasons and to detect known-bad cart items.  
**Where**:

- `frontend/lib/cart-integrity.ts` (new)

**Depends on**: T3  
**Reuses**: `selectedClient.country`, `product.countries`, `cartByClient`, and `productsById` shapes already used by the catalog and cart surfaces.  
**Requirement**: INTEG-05, INTEG-06, INTEG-07, INTEG-09

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Module exports `CartActionAvailability` and `CartIntegrityIssue` types matching the design data models.
- [ ] `resolveCartActionAvailability(selectedClient, product)` returns `enabled`, `no-client`, or `country-incompatible` with a human-readable message and the available countries.
- [ ] `collectCartIntegrityIssues(cart, productsById, clientCountry)` returns one issue per known incompatible cart item, naming the product, with no false positives when a cart item is missing from `productsById`.
- [ ] The helper is pure: no React, no Zustand, no `apiFetch` imports.
- [ ] Helper messages are reusable as on-screen copy (no internal ids leaking into UI text).
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the frontend compiles with the new pure helper and no consumer regression.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add pure cart integrity helper for cta and checkout blocking`

---

### T5: Create `useSelectedClientProfile` hook and client adapters [P]

**What**: Build the transient client profile view-model hook plus the `clients` adapter so the catalog/analysis surfaces never have to mutate the persisted `selectedClient` object.  
**Where**:

- `frontend/lib/adapters/clients.ts` (new)
- `frontend/lib/hooks/useSelectedClientProfile.ts` (new)

**Depends on**: T3  
**Reuses**: `apiFetch`, the existing `cancelled`-flag effect pattern from `AnalysisPanel`, the `Client` type in `frontend/lib/types.ts`, and the existing `GET /api/v1/clients/{id}` and `GET /api/v1/clients/{id}/orders` endpoints.  
**Requirement**: INTEG-11, INTEG-12, INTEG-13, INTEG-14, INTEG-15, INTEG-16, INTEG-17, INTEG-18, INTEG-19

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `clients` adapter exposes `getClientDetail(clientId)` and `getClientOrders(clientId, size?)` returning typed responses.
- [ ] The `Client` type (or a sibling view model) carries `totalSpent` and `lastOrderAt` so the card can render real values without contradicting persisted state.
- [ ] `useSelectedClientProfile(selectedClient)` returns a `ClientProfileViewModel` with `loading`, `ready`, `empty`, `partial`, and `unavailable` states.
- [ ] Both calls fan out via `Promise.allSettled` so partial success is preserved.
- [ ] Recent products are derived from newest-first orders, deduplicated, and capped at five.
- [ ] A request token / cleanup guard prevents stale responses from overwriting the currently selected client.
- [ ] Loading / error / request metadata is never written to Zustand (the hook stays transient).
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the new hook and adapter compile cleanly and consumers can be wired in Phase 3.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add transient selected-client profile enrichment hook`

---

### T6: Create `post-checkout-outcome` helper [P]

**What**: Build the pure helper that derives the `Pos-Efetivar` outcome notice and the aligned `ModelStatusPanel` copy keys from `panelState`, `lastDecision`, and snapshot presence.  
**Where**:

- `frontend/lib/showcase/post-checkout-outcome.ts` (new)

**Depends on**: T3  
**Reuses**: The existing `panelState` / `lastDecision` / `currentVersion` shape from `useModelStatus` and the `#pos-efetivar` anchor used by the analysis panel.  
**Requirement**: INTEG-21, INTEG-22, INTEG-23, INTEG-25, INTEG-26, INTEG-28, INTEG-29

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Module exports `PostCheckoutOutcomeNotice` matching the design discriminated union (`rejected | failed | unknown`).
- [ ] `buildPostCheckoutOutcome(panelState, modelStatus, hasPostCheckoutSnapshot)` returns `null` for `idle` / `training` / `promoted` (no notice needed) and a notice for non-promoted terminal states without a snapshot.
- [ ] Copy is evaluator-oriented and aligned with the `Com Carrinho -> Pos-Efetivar` vocabulary, with no internal labels (`ModelStatusPanel`, raw enum values) leaking into user-facing text.
- [ ] The helper is pure: no React, no Zustand, no `apiFetch` imports.
- [ ] Title and description for `rejected` reference the rejection reason exposed by `lastDecision`.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the frontend compiles with the new outcome helper available for `AnalysisPanel` and `ModelStatusPanel`.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add post-checkout outcome helper for non-promoted retrain states`

---

### T7: Wire cart integrity into `CatalogPanel`, `ProductCard`, and `CartSummaryBar`

**What**: Apply `resolveCartActionAvailability` and `collectCartIntegrityIssues` to the catalog surface so disabled CTAs explain the reason, semantic backend rejections reconcile cart state, and checkout blocks when the cart is known to contain incompatible items.  
**Where**:

- `frontend/components/catalog/CatalogPanel.tsx`
- `frontend/components/catalog/ProductCard.tsx`
- `frontend/components/cart/CartSummaryBar.tsx`

**Depends on**: T4  
**Reuses**: Existing `cartActionDisabledReason` prop, existing `checkoutError` inline slot, current `apiFetch` error propagation, and the cart's `getCart(clientId)` refresh path.  
**Requirement**: INTEG-05, INTEG-06, INTEG-07, INTEG-08, INTEG-09, INTEG-10

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `CatalogPanel.renderItem()` derives the disabled reason from `resolveCartActionAvailability` and distinguishes `no-client` from `country-incompatible`.
- [ ] `ProductCard` renders CTA-adjacent helper text bound via `aria-describedby` when the action is disabled, on desktop and touch.
- [ ] `handleAddToCart()` surfaces the exact backend `ApiError.message` for semantic rejections (`422`), clears the button loading state, and calls `getCart(clientId)` to reconcile cart state.
- [ ] `CartSummaryBar` accepts `integrityIssues` and disables checkout with an inline issue summary when one or more known-bad items are detected; missing local product metadata does not false-block.
- [ ] Existing `data-testid` selectors stay stable; new ones use the project's `data-testid` convention.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: catalog and cart surfaces compile with explicit cart-integrity wiring.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): wire cart integrity helpers into catalog and cart surfaces`

---

### T8: Wire `useSelectedClientProfile` into `AnalysisPanel` and expand `ClientProfileCard`

**What**: Replace the persisted-zero placeholder rendering with the transient view model, and turn `ClientProfileCard` into a presentational state machine with `loading`, `ready`, `empty`, `partial`, and `unavailable` states.  
**Where**:

- `frontend/components/recommendations/AnalysisPanel.tsx`
- `frontend/components/client/ClientProfileCard.tsx`
- `frontend/components/layout/ClientSelectorDropdown.tsx`

**Depends on**: T5  
**Reuses**: Existing persisted `selectedClient` identity boundary in `useAppStore`, the current `ClientProfileCard` layout, and the existing `cancelled`-flag effect style.  
**Requirement**: INTEG-13, INTEG-14, INTEG-15, INTEG-16, INTEG-17, INTEG-18, INTEG-19, INTEG-20

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `AnalysisPanel` consumes `useSelectedClientProfile(selectedClient)` and passes the resulting view model into `ClientProfileCard` as props.
- [ ] `ClientSelectorDropdown` no longer fabricates `totalOrders: 0` and `recentProducts: []`; it persists only the lightweight identity needed by the rest of the showcase.
- [ ] `ClientProfileCard` renders `loading` as a skeleton, `ready` with totals, `totalSpent`, `lastOrderAt`, and recent products, `empty` with real zero stats and explicit "no orders" copy, `partial` with section-level local fallback warnings, and `unavailable` with a compact fallback that does not clear the selected client.
- [ ] Catalog, cart, and recommendations remain functional when both enrichment requests fail.
- [ ] Rapid client switching never overwrites the current card with a stale response.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: `AnalysisPanel`, `ClientProfileCard`, and `ClientSelectorDropdown` compile with transient enrichment in place.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): render real client profile via transient enrichment view model`

---

### T9: Update `ModelStatusPanel` copy and add `PostCheckoutOutcomeNotice`

**What**: Apply evaluator-oriented copy in `ModelStatusPanel` per state, render `PostCheckoutOutcomeNotice` above `Pos-Efetivar` for non-promoted terminal states, and keep advanced/manual retrain controls labeled as secondary or diagnostic.  
**Where**:

- `frontend/components/retrain/ModelStatusPanel.tsx`
- `frontend/components/analysis/PostCheckoutOutcomeNotice.tsx` (new)
- `frontend/components/recommendations/AnalysisPanel.tsx`

**Depends on**: T6  
**Reuses**: `useModelStatus`, the existing `RecommendationColumn` empty-state slot, the `#pos-efetivar` anchor, and `captureRetrained()` for the promoted path only.  
**Requirement**: INTEG-21, INTEG-22, INTEG-23, INTEG-24, INTEG-25, INTEG-26, INTEG-27, INTEG-28, INTEG-29, INTEG-30

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `ModelStatusPanel` renders distinct evaluator-oriented title and description for `promoted`, `rejected`, `failed`, `unknown`, and the advanced/manual secondary state, with no internal labels exposed.
- [ ] `PostCheckoutOutcomeNotice` renders an amber notice for `rejected`, a red notice for `failed`, and a neutral notice with manual-refresh affordance for `unknown`.
- [ ] `AnalysisPanel` uses `buildPostCheckoutOutcome()` to decide when to render the notice and continues to call `captureRetrained()` only on `promoted`.
- [ ] No synthetic `Pos-Efetivar` snapshot is created for `rejected`, `failed`, or `unknown`.
- [ ] `RecommendationColumn` for `Pos-Efetivar` shows state-specific empty copy that complements (does not duplicate) the panel and the notice.
- [ ] Vocabulary stays aligned with `Com Carrinho -> Pos-Efetivar`, never `Demo`.
- [ ] Manual / advanced retrain controls remain visible only as a secondary or diagnostic affordance, clearly labeled.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: `ModelStatusPanel`, `PostCheckoutOutcomeNotice`, and `AnalysisPanel` compile with state-specific evaluator-oriented copy.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): explain post-checkout terminal states with aligned panel copy and column notice`

---

### T10: Extend Playwright acceptance and run the frontend phase build gate

**What**: Cover the M15 acceptance path in Playwright (proactive country block, forced-request reconciliation, real client profile, mocked terminal-state outcomes) and run the frontend phase-end gate.  
**Where**:

- `frontend/e2e/tests/m13-cart-async-retrain.spec.ts`
- `frontend/e2e/tests/m15-cart-integrity-comparative-ux.spec.ts` (new, only if `m13` becomes too noisy)

**Depends on**: T7, T8, T9  
**Reuses**: Existing `data-testid` conventions, the cart -> checkout -> async retrain principal flow, and the existing Playwright setup.  
**Requirement**: INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-05, INTEG-06, INTEG-07, INTEG-08, INTEG-09, INTEG-10, INTEG-11, INTEG-12, INTEG-13, INTEG-14, INTEG-15, INTEG-16, INTEG-17, INTEG-18, INTEG-19, INTEG-20, INTEG-21, INTEG-22, INTEG-23, INTEG-24, INTEG-25, INTEG-26, INTEG-27, INTEG-28, INTEG-29, INTEG-30

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] The principal real-stack flow validates proactive disabled CTAs with explicit country reasons, forced add-item rejection reconciled to the backend message, and compatible add-item still working.
- [ ] The principal real-stack flow validates `ClientProfileCard` showing real totals, `totalSpent`, `lastOrderAt`, and recent products for a seeded client with history, plus the empty state for a seeded client with no history.
- [ ] A focused mocked branch validates `rejected`, `failed`, and `unknown` terminal states rendering the right `ModelStatusPanel` copy and the right `PostCheckoutOutcomeNotice` above `Pos-Efetivar`, without synthesizing a fake snapshot.
- [ ] A focused branch validates rapid client switching not leaking stale enrichment into the current card.
- [ ] No existing Playwright scenario is silently removed.
- [ ] Build gate passes: `npm run lint && npm run build && npm run test:e2e`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: the frontend phase-end gate exits 0 with the M15 acceptance path covered.

**Tests**: e2e  
**Gate**: build  
**Commit**: `test(frontend): cover m15 cart integrity and comparative ux acceptance`

---

## Parallel Execution Map

```text
Phase 1:
  T1 -> T2 -> T3

Phase 2:
  T3
  ├── T4 [P]
  ├── T5 [P]
  └── T6 [P]

Phase 3:
  T4 -> T7
  T5 -> T8
  T6 -> T9

Phase 4:
  T7, T8, T9 -> T10
```

**Parallelism constraint**:

- `T4 [P]`, `T5 [P]`, and `T6 [P]` are the only parallel-safe tasks in this plan.
- They depend only on `T3` (api-service contract stable) and have no mutual dependencies.
- They create distinct new files and do not modify the same existing files.
- The frontend testing matrix requires `none` for these pure-helper layers, so there is no shared test runner bottleneck.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | 1 backend policy + 1 exception + handler mapping + 1 unit suite | ✅ Granular |
| T2 | 1 backend service surface (`CartApplicationService.addItem` + `OrderApplicationService` reuse) | ✅ Granular |
| T3 | 1 backend controller IT slice + api-service phase build gate | ✅ Granular |
| T4 | 1 frontend pure helper (`cart-integrity.ts`) | ✅ Granular |
| T5 | 1 frontend hook + 1 adapter slice for client enrichment | ✅ Granular |
| T6 | 1 frontend pure helper (`post-checkout-outcome.ts`) | ✅ Granular |
| T7 | 1 cart-side wiring slice (catalog + product card + cart summary) | ✅ Granular |
| T8 | 1 client-profile wiring slice (analysis panel + card + selector) | ✅ Granular |
| T9 | 1 outcome wiring slice (panel copy + notice + analysis branching) | ✅ Granular |
| T10 | 1 E2E acceptance and final frontend gate task | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | No inbound arrows | ✅ Match |
| T2 | T1 | `T1 -> T2` | ✅ Match |
| T3 | T2 | `T2 -> T3` | ✅ Match |
| T4 | T3 | `T3 -> T4 [P]` | ✅ Match |
| T5 | T3 | `T3 -> T5 [P]` | ✅ Match |
| T6 | T3 | `T3 -> T6 [P]` | ✅ Match |
| T7 | T4 | `T4 -> T7` | ✅ Match |
| T8 | T5 | `T5 -> T8` | ✅ Match |
| T9 | T6 | `T6 -> T9` | ✅ Match |
| T10 | T7, T8, T9 | `T7, T8, T9 -> T10` | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | api-service service + exception | unit | unit | ✅ OK |
| T2 | api-service service | unit | unit | ✅ OK |
| T3 | api-service controller + IT | integration | integration (build gate) | ✅ OK |
| T4 | frontend pure helper | none | none | ✅ OK |
| T5 | frontend hook + adapter | none | none | ✅ OK |
| T6 | frontend pure helper | none | none | ✅ OK |
| T7 | React components | none | none | ✅ OK |
| T8 | React components + selector | none | none | ✅ OK |
| T9 | React components + new notice | none | none | ✅ OK |
| T10 | Full M15 E2E acceptance | e2e | e2e (build gate) | ✅ OK |

**Note**: The frontend test matrix has no unit/component runner. Phase-end protection therefore happens through the build gate in `T10` (`npm run lint && npm run build && npm run test:e2e`), and the api-service phase-end protection happens through the build gate in `T3` (`./mvnw verify`).

---

## Requirement Traceability

| Task | Requirements Covered |
|---|---|
| T1 | INTEG-01, INTEG-02, INTEG-08 |
| T2 | INTEG-01, INTEG-02, INTEG-03, INTEG-04, INTEG-09, INTEG-10 |
| T3 | INTEG-01, INTEG-02, INTEG-03, INTEG-08, INTEG-09 |
| T4 | INTEG-05, INTEG-06, INTEG-07, INTEG-09 |
| T5 | INTEG-11, INTEG-12, INTEG-13, INTEG-14, INTEG-15, INTEG-16, INTEG-17, INTEG-18, INTEG-19 |
| T6 | INTEG-21, INTEG-22, INTEG-23, INTEG-25, INTEG-26, INTEG-28, INTEG-29 |
| T7 | INTEG-05, INTEG-06, INTEG-07, INTEG-08, INTEG-09, INTEG-10 |
| T8 | INTEG-13, INTEG-14, INTEG-15, INTEG-16, INTEG-17, INTEG-18, INTEG-19, INTEG-20 |
| T9 | INTEG-21, INTEG-22, INTEG-23, INTEG-24, INTEG-25, INTEG-26, INTEG-27, INTEG-28, INTEG-29, INTEG-30 |
| T10 | INTEG-01..INTEG-30 acceptance sweep |

---

## Pre-Execution: MCPs And Skills

Before executing the tasks, confirm which tools to use per task.

**Recommended defaults for this feature**:

- MCPs: NONE
- Skills:
  - `tlc-spec-driven` for orchestration
  - `coding-guidelines` for implementation tasks

**Execution note**:

- Run Phase 1 sequentially (`T1 -> T2 -> T3`); the api-service build gate in `T3` is non-negotiable before any frontend wiring depends on the new contract.
- Run `T4`, `T5`, and `T6` in parallel for the fastest safe path through the pure-helper layer.
- Each Phase 3 wiring task is paired with exactly one Phase 2 helper, so the three wiring tasks can also overlap if separate working contexts are used; if they share a single working context, run them sequentially in `T7 -> T8 -> T9` order to keep `AnalysisPanel.tsx` edits readable.
- Do not skip the frontend build gate in `T10`; it is the only place where the full M15 acceptance is verified end to end.
