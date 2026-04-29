# M13 — Cart, Checkout & Async Retrain Capture — Tasks

**Design**: `.specs/features/m13-cart-checkout-async-retrain/design.md`  
**Spec**: `.specs/features/m13-cart-checkout-async-retrain/spec.md`  
**Testing**:

- `.specs/codebase/api-service/TESTING.md`
- `.specs/codebase/ai-service/TESTING.md`
- `.specs/codebase/frontend/TESTING.md`

**Status**: Executed (all service gates green on this environment)

---

## Execution Plan

### Phase 1: Cart Foundation In `api-service` (Sequential)

Cart persistence and CRUD endpoints must exist before checkout or frontend wiring can be verified.

```text
T1 -> T2 -> T3
```

### Phase 2: AI Confirmed-History And Governance Foundation (Partial Parallel)

Cart-aware recommendations, orders-only training, and promotion ownership can start independently. Queue semantics and the checkout sync route depend on the governance refactor.

```text
T4 [P]
T5 [P]
T6 [P] -> T7 -> T8
```

### Phase 3: Checkout Orchestration In `api-service` (Sequential)

Checkout depends on cart services and the ai-service sync contract.

```text
T8 -> T9
T2, T9 -> T10 -> T11
```

### Phase 4: Frontend Cart Data And Visual Shell (Sequential)

Proxy routes unlock the adapter/store layer; catalog controls, the responsive cart shell, and persisted cart-aware analysis state are easier to land coherently in order.

```text
T3, T4, T11 -> T12 -> T13 -> T14 -> T15 -> T16
```

### Phase 5: Frontend Model Status And Accessible Integration (Sequential)

Version polling must land before the panel rename; analysis and navigation semantics are finalized once the new status UI exists.

```text
T7, T11, T16 -> T17 -> T18 -> T19
```

### Phase 6: M13 E2E And Cross-Service Verification (Sequential)

The final task proves the full cart -> checkout -> async retrain loop across all services.

```text
T11, T19 -> T20
```

---

## Task Breakdown

### T1: Add cart persistence model

**What**: Create the JPA entities, repositories, and DTOs for one active cart per client and one cart item row per `(cart, product)`.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/entity/Cart.java`
- `api-service/src/main/java/com/smartmarketplace/entity/CartItem.java`
- `api-service/src/main/java/com/smartmarketplace/repository/CartRepository.java`
- `api-service/src/main/java/com/smartmarketplace/repository/CartItemRepository.java`
- `api-service/src/main/java/com/smartmarketplace/dto/CartDTO.java`
- `api-service/src/main/java/com/smartmarketplace/dto/CartItemDTO.java`
- `api-service/src/main/java/com/smartmarketplace/dto/AddCartItemRequest.java`

**Depends on**: None  
**Reuses**: Existing `Order`, `OrderItem`, `Client`, `Product`, repository naming, and DTO record style.  
**Requirement**: CART-01, CART-02, CART-03, CART-04, CART-05, CART-06

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `Cart` belongs to one `Client` and owns many `CartItem` rows.
- [ ] `CartItem` references one `Product` and stores positive `quantity`.
- [ ] The model does not introduce a `CartStatus` enum that the approved design explicitly removed.
- [ ] Repository methods can resolve the active cart by `clientId`.
- [ ] DTOs expose `{ cartId, clientId, items, itemCount }`.
- [ ] Gate check passes: `./mvnw test`.

**Verify**:

```bash
cd api-service && ./mvnw test
```

Expected: project compiles and existing service tests remain green.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(api-service): add cart persistence model`

---

### T2: Implement cart operations service

**What**: Add `CartApplicationService` methods for get, add/upsert, remove, and clear operations, with unit coverage.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/service/CartApplicationService.java`
- `api-service/src/test/java/com/smartmarketplace/service/CartApplicationServiceTest.java`

**Depends on**: T1  
**Reuses**: `OrderApplicationService` transaction style, `ResourceNotFoundException`, and `BusinessRuleException`.  
**Requirement**: CART-01, CART-02, CART-03, CART-04, CART-05, CART-06

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `getActiveCart(clientId)` returns an empty DTO when no active cart exists.
- [ ] `addItem` creates an active cart when needed and upserts by `productId`.
- [ ] Adding the same product twice sums quantities.
- [ ] Removing the last item deletes the cart row so the API can return `cartId: null`.
- [ ] `clearCart` removes the active cart and returns the empty DTO contract.
- [ ] Unit tests cover empty cart, first add, upsert, remove, last-item removal, and clear.
- [ ] Gate check passes: `./mvnw test`.
- [ ] Test count: existing api-service unit suite plus cart service cases pass.

**Verify**:

```bash
cd api-service && ./mvnw test -Dtest=CartApplicationServiceTest
```

Expected: cart service unit tests pass without requiring PostgreSQL.

**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(api-service): implement cart application service`

---

### T3: Expose cart REST endpoints

**What**: Add `CartController` routes for get, add item, remove item, and clear cart, with integration tests and the api-service phase build gate.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/controller/CartController.java`
- `api-service/src/test/java/com/smartmarketplace/controller/CartControllerIT.java`

**Depends on**: T2  
**Reuses**: `OrderController`, `ProductController`, `BaseIntegrationTest`, and `@Valid` request handling.  
**Requirement**: CART-01, CART-02, CART-03, CART-04, CART-05, CART-06

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `GET /api/v1/carts/{clientId}` returns active or empty cart.
- [ ] `POST /api/v1/carts/{clientId}/items` validates and upserts an item.
- [ ] `DELETE /api/v1/carts/{clientId}/items/{productId}` removes one item.
- [ ] `DELETE /api/v1/carts/{clientId}` clears the active cart.
- [ ] Integration test covers add two products -> get -> remove one -> get -> clear.
- [ ] Build gate passes: `./mvnw verify`.
- [ ] Surefire unit suite passes.
- [ ] Failsafe integration suite passes, including `CartControllerIT`.
- [ ] Checkstyle and JaCoCo gates remain green.

**Verify**:

```bash
cd api-service && ./mvnw verify -Dfailsafe.includes='**/CartControllerIT.java'
```

Expected: cart endpoints work against Testcontainers PostgreSQL and the full api-service gate exits 0.

**Tests**: integration  
**Gate**: build  
**Commit**: `feat(api-service): expose cart endpoints`

---

### T4: Add confirmed-history cart-aware recommendation path [P]

**What**: Update confirmed-history graph reads to ignore legacy demo edges and implement `recommendFromCart` with the existing hybrid recommendation path.  
**Where**:

- `ai-service/src/repositories/Neo4jRepository.ts`
- `ai-service/src/services/RecommendationService.ts`
- `ai-service/src/routes/recommend.ts`
- `ai-service/src/tests/recommend.test.ts`

**Depends on**: None  
**Reuses**: `meanPooling`, `recommendFromVector`, route error mapping in `recommend.ts`, and existing candidate-product queries.  
**Requirement**: CART-15, CART-16, CART-17, CART-18, CART-19

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `getPurchasedProductIds()` and `getClientPurchasedEmbeddings()` ignore `BOUGHT {is_demo: true}` edges for confirmed-history reads.
- [ ] `recommendFromCart(clientId, productIds, limit)` combines confirmed-history embeddings and valid cart embeddings via `meanPooling`.
- [ ] Empty `productIds` behaves like the existing `/recommend` flow.
- [ ] Missing cart embeddings are ignored without failing the request.
- [ ] Candidate exclusion includes confirmed purchased IDs and cart product IDs so the cart does not recommend itself.
- [ ] Route tests cover non-empty cart, empty cart, missing embedding, and no prior orders.
- [ ] Gate check passes: `npm test`.
- [ ] Test count: existing ai-service Vitest suite plus new recommendation cases pass.

**Verify**:

```bash
cd ai-service && npm test -- src/tests/recommend.test.ts
```

Expected: recommendation route/service tests pass with mocked repository and model store.

**Tests**: integration  
**Gate**: quick  
**Commit**: `feat(ai-service): add confirmed-history cart recommendations`

---

### T5: Remove demo pairs from training path [P]

**What**: Make `ModelTrainer.train()` and precision evaluation use only confirmed orders from `api-service`.  
**Where**:

- `ai-service/src/services/ModelTrainer.ts`
- `ai-service/src/tests/model.test.ts`
- `ai-service/src/services/training-utils.test.ts` (only if dataset assertions need adjustment)

**Depends on**: None  
**Reuses**: Existing `fetchTrainingData`, `buildTrainingDataset`, and `computePrecisionAtK` orders-only holdout path.  
**Requirement**: CART-20, CART-21, CART-22, CART-23, CART-60, CART-61, CART-62

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `ModelTrainer.train()` no longer imports or calls `getAllDemoBoughtPairs()`.
- [ ] No `demoPairs` are merged into `clientOrderMap`.
- [ ] Legacy Neo4j `BOUGHT {is_demo: true}` edges are ignored by training.
- [ ] `syncNeo4j()` continues creating confirmed `BOUGHT` relationships without `is_demo`.
- [ ] Tests assert demo-pair reads are not part of the training path anymore.
- [ ] Gate check passes: `npm test`.
- [ ] Test count: existing model/training tests pass with updated expectations.

**Verify**:

```bash
cd ai-service && npm test -- src/tests/model.test.ts src/services/training-utils.test.ts
```

Expected: training data and model tests pass without demo-pair dependencies.

**Tests**: unit  
**Gate**: quick  
**Commit**: `fix(ai-service): train only from confirmed orders`

---

### T6: Refactor promotion ownership and tolerance metadata [P]

**What**: Move promotion ownership fully into `VersionedModelStore`, add `MODEL_PROMOTION_TOLERANCE`, and persist explicit decision metadata without overwriting the current model early.  
**Where**:

- `ai-service/src/config/env.ts`
- `ai-service/src/types/index.ts`
- `ai-service/src/services/ModelTrainer.ts`
- `ai-service/src/services/VersionedModelStore.ts`
- `ai-service/src/services/VersionedModelStore.test.ts`
- `ai-service/src/tests/model.test.ts`

**Depends on**: None  
**Reuses**: Existing `VersionedModelStore.saveVersioned`, `ModelHistoryEntry`, and current precision/loss snapshot logic.  
**Requirement**: CART-24, CART-25, CART-30, CART-31, CART-32, CART-33, CART-34, CART-35, CART-36, CART-37

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `ModelTrainer` no longer promotes the candidate model before `VersionedModelStore` decides.
- [ ] Tolerance defaults to `0.02` and supports `MODEL_PROMOTION_TOLERANCE=0`.
- [ ] First train promotes when there is no current precision.
- [ ] Candidate inside the tolerance band is promoted.
- [ ] Candidate below `currentPrecisionAt5 - tolerance` is rejected without replacing the current model.
- [ ] Rejected decision records reason, current precision, candidate precision, tolerance, and a stable `currentVersion` token.
- [ ] Unit tests cover first train, strict zero tolerance, inside-band promotion, and below-band rejection.
- [ ] Gate check passes: `npm test`.
- [ ] Test count: existing `VersionedModelStore` suite plus new gate cases pass.

**Verify**:

```bash
cd ai-service && npm test -- src/services/VersionedModelStore.test.ts src/tests/model.test.ts
```

Expected: candidate promotion/rejection is deterministic and no current model is overwritten before the decision point.

**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(ai-service): refactor model promotion ownership`

---

### T7: Extend the training registry for queued checkout retrains

**What**: Add strategy-aware enqueue semantics, queue checkout-triggered retrains FIFO, and expose governance fields through `GET /model/status`.  
**Where**:

- `ai-service/src/services/TrainingJobRegistry.ts`
- `ai-service/src/services/TrainingJobRegistry.test.ts`
- `ai-service/src/routes/model.ts`
- `ai-service/src/tests/model.test.ts`
- `ai-service/src/types/index.ts`

**Depends on**: T6  
**Reuses**: Existing `TrainingJob` lifecycle, `lastTrainingProgress`, and `model.ts` status route.  
**Requirement**: CART-24, CART-25, CART-26, CART-27, CART-28, CART-29, CART-30, CART-31, CART-32, CART-13, CART-14

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `enqueue({ triggeredBy, orderId, strategy })` exists.
- [ ] Checkout-triggered jobs use queue semantics instead of busy-conflict semantics.
- [ ] Manual retrain preserves the current `409 + activeJobId` behavior when busy.
- [ ] Failed jobs record `lastTrainingResult: 'failed'`.
- [ ] `GET /model/status` returns `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy`, `lastOrderId`, and `lastDecision` when available.
- [ ] First boot returns null governance fields.
- [ ] Tests cover queued checkout behavior, manual conflict behavior, promoted, rejected, failed, and null initial fields.
- [ ] Gate check passes: `npm test`.
- [ ] Test count: existing registry/model route tests plus new queue/status cases pass.

**Verify**:

```bash
cd ai-service && npm test -- src/services/TrainingJobRegistry.test.ts src/tests/model.test.ts
```

Expected: queued checkout jobs and status metadata are observable without exposing `jobId` through checkout.

**Tests**: integration  
**Gate**: quick  
**Commit**: `feat(ai-service): queue checkout retrains and expose status metadata`

---

### T8: Add checkout sync-and-train route in `ai-service`

**What**: Add the internal route that syncs confirmed order edges into Neo4j and enqueues retrain with checkout metadata, then run the ai-service phase build gate.  
**Where**:

- `ai-service/src/routes/orderSyncRoutes.ts`
- `ai-service/src/services/OrderSyncService.ts` (optional if route logic needs extraction)
- `ai-service/src/index.ts`
- `ai-service/src/routes/orderSyncRoutes.test.ts`

**Depends on**: T7  
**Reuses**: `Neo4jRepository.syncBoughtRelationships`, `TrainingJobRegistry.enqueue`, and existing Fastify route test patterns.  
**Requirement**: CART-09, CART-13, CART-14, CART-26, CART-27, CART-29, CART-61

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `POST /api/v1/orders/:orderId/sync-and-train` accepts `{ clientId, productIds }`.
- [ ] The route creates only real `BOUGHT` relationships without `is_demo`.
- [ ] The route enqueues retrain with `{ triggeredBy: 'checkout', orderId, strategy: 'queue' }`.
- [ ] Payload validation rejects malformed requests before touching Neo4j.
- [ ] Route tests cover successful sync, validation failure, repository failure, and active-job queue behavior.
- [ ] Build gate passes: `npm run lint && npm run build && npm test`.
- [ ] Existing ai-service route/service suites remain present.

**Verify**:

```bash
cd ai-service && npm run lint && npm run build && npm test
```

Expected: the internal checkout sync route builds, tests pass, and the full ai-service gate exits 0.

**Tests**: integration  
**Gate**: build  
**Commit**: `feat(ai-service): sync checkout orders and enqueue retrain`

---

### T9: Extend `AiSyncClient` for checkout completion

**What**: Add the fire-and-forget checkout notification method from `api-service` to `ai-service`, using structured JSON serialization.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/service/AiSyncClient.java`
- `api-service/src/main/java/com/smartmarketplace/dto/CheckoutSyncRequest.java`

**Depends on**: T8  
**Reuses**: Existing virtual-thread fire-and-forget pattern in `AiSyncClient` and Jackson from the Spring Boot classpath.  
**Requirement**: CART-09, CART-12, CART-13

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] `notifyCheckoutCompleted(orderId, clientId, productIds)` posts to `ai-service /api/v1/orders/{orderId}/sync-and-train`.
- [ ] JSON serialization for the new payload uses Jackson/ObjectMapper rather than manual string formatting.
- [ ] Non-2xx responses and exceptions are logged as warnings without throwing to the caller.
- [ ] Existing product sync behavior remains unchanged.
- [ ] Gate check passes: `./mvnw test`.

**Verify**:

```bash
cd api-service && ./mvnw test
```

Expected: project compiles and existing service tests remain green.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(api-service): notify ai-service after checkout`

---

### T10: Implement checkout service flow with after-commit notification

**What**: Convert an active cart into a real order, clear the cart, raise the empty-cart business error, and schedule ai-service notification only after commit.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/service/CartApplicationService.java`
- `api-service/src/main/java/com/smartmarketplace/dto/CheckoutResponse.java`
- `api-service/src/main/java/com/smartmarketplace/exception/CartEmptyException.java`
- `api-service/src/main/java/com/smartmarketplace/exception/GlobalExceptionHandler.java`
- `api-service/src/test/java/com/smartmarketplace/service/CartApplicationServiceTest.java`

**Depends on**: T2, T9  
**Reuses**: `OrderApplicationService.createOrder()`, cart service methods from T2, and existing Spring exception handling patterns.  
**Requirement**: CART-07, CART-08, CART-09, CART-10, CART-11, CART-12

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Non-empty checkout creates `Order` and `OrderItems` through `OrderApplicationService.createOrder()`.
- [ ] Checkout deletes the active cart in the same transaction.
- [ ] Checkout returns `{ orderId, expectedTrainingTriggered: true }`.
- [ ] Empty checkout raises `CartEmptyException` for the explicit `422` contract.
- [ ] ai-service notification is scheduled in `afterCommit`, not sent inline before commit completes.
- [ ] Post-commit ai-service failures do not rollback the created order.
- [ ] Unit tests cover success, empty cart, product quantity mapping, cart removal, and post-commit notification scheduling.
- [ ] Gate check passes: `./mvnw test`.
- [ ] Test count: cart service unit suite passes with checkout cases.

**Verify**:

```bash
cd api-service && ./mvnw test -Dtest=CartApplicationServiceTest
```

Expected: checkout behavior is verified without an external ai-service dependency.

**Tests**: unit  
**Gate**: quick  
**Commit**: `feat(api-service): checkout cart into confirmed order`

---

### T11: Expose checkout endpoint and integration tests

**What**: Add `POST /api/v1/carts/{clientId}/checkout`, verify the persisted order/cart effects, and close the api-service checkout phase with the build gate.  
**Where**:

- `api-service/src/main/java/com/smartmarketplace/controller/CartController.java`
- `api-service/src/test/java/com/smartmarketplace/controller/CartControllerIT.java`

**Depends on**: T10  
**Reuses**: `BaseIntegrationTest`, `OrderControllerIT` assertions, and the shared `GlobalExceptionHandler`.  
**Requirement**: CART-07, CART-08, CART-10, CART-11, CART-12

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Endpoint returns `201` for a non-empty cart.
- [ ] Response includes `orderId` and `expectedTrainingTriggered: true`.
- [ ] Created order is visible through existing client order APIs.
- [ ] Cart is empty after checkout.
- [ ] Empty-cart checkout returns the documented `422` response.
- [ ] Integration test covers successful checkout and empty checkout.
- [ ] Build gate passes: `./mvnw verify`.
- [ ] Surefire unit suite passes.
- [ ] Failsafe integration suite passes, including checkout cases.
- [ ] Checkstyle and JaCoCo gates remain green.

**Verify**:

```bash
cd api-service && ./mvnw verify -Dfailsafe.includes='**/CartControllerIT.java'
```

Expected: checkout endpoint creates persisted orders, clears the cart, and the full api-service gate exits 0.

**Tests**: integration  
**Gate**: build  
**Commit**: `feat(api-service): expose cart checkout endpoint`

---

### T12: Add frontend proxy routes for cart, checkout, and cart recommendations

**What**: Create Next.js proxy route handlers for cart operations, checkout, and `recommend/from-cart`.  
**Where**:

- `frontend/app/api/proxy/carts/[clientId]/route.ts`
- `frontend/app/api/proxy/carts/[clientId]/items/route.ts`
- `frontend/app/api/proxy/carts/[clientId]/items/[productId]/route.ts`
- `frontend/app/api/proxy/carts/[clientId]/checkout/route.ts`
- `frontend/app/api/proxy/recommend/from-cart/route.ts`

**Depends on**: T3, T4, T11  
**Reuses**: Existing proxy patterns in `frontend/app/api/proxy/recommend/route.ts`, `model/status/route.ts`, and `demo-buy/*`.  
**Requirement**: CART-63, CART-64, CART-65, CART-66, CART-67, CART-68

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Cart proxy routes forward method, path params, JSON body, and response status.
- [ ] Checkout proxy uses `cache: 'no-store'`.
- [ ] `recommend/from-cart` proxy calls `ai-service` with `cache: 'no-store'`.
- [ ] Error responses preserve backend status and message where possible.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: Next.js route handlers compile and lint cleanly.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): proxy cart and cart recommendation APIs`

---

### T13: Add frontend cart adapter and store slice

**What**: Add frontend data access and Zustand state for active cart operations, per-product loading, and checkout mutation status.  
**Where**:

- `frontend/lib/adapters/cart.ts`
- `frontend/store/cartSlice.ts`
- `frontend/store/index.ts`

**Depends on**: T12  
**Reuses**: Existing `demoSlice` action shape, `useAppStore` slice composition, and `apiFetch` conventions.  
**Requirement**: CART-01, CART-02, CART-03, CART-04, CART-05, CART-06, CART-10

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Adapter functions exist for `getCart`, `addCartItem`, `removeCartItem`, `clearCart`, and `checkoutCart`.
- [ ] Store tracks cart items, per-product loading state, and checkout pending/error state for the selected client.
- [ ] Cart state can be refreshed from backend after reload/navigation.
- [ ] Checkout response is available to callers as `{ orderId, expectedTrainingTriggered }`.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: adapter and store types compile without a frontend unit-test framework.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add cart adapter and store slice`

---

### T14: Replace demo-buy controls with cart item controls in the catalog

**What**: Replace the primary demo-buy interaction in the catalog with add/remove cart actions that follow the approved interaction-state and accessibility rules.  
**Where**:

- `frontend/components/catalog/CatalogPanel.tsx`
- `frontend/components/catalog/ProductCard.tsx`

**Depends on**: T13  
**Reuses**: Existing card layout, badge/button visual language, and catalog loading patterns.  
**Requirement**: CART-01, CART-02, CART-03, CART-04, CART-05, CART-06

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`, `react-best-practices`

**Done when**:

- [ ] Product cards expose `Adicionar ao Carrinho` / `Remover` actions for the primary flow.
- [ ] No-client state is explicitly disabled and explained.
- [ ] Add/remove buttons use stable labels, `disabled`, and `aria-busy` instead of emoji-only loading states.
- [ ] In-cart visual state is visible without opening another surface.
- [ ] New interactive controls have stable `data-testid` values.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: catalog cards compile with cart actions and no demo-buy control remains on the primary path.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): replace demo buy with cart controls`

---

### T15: Add the responsive `CartSummaryBar` and mobile review sheet

**What**: Add the sticky cart summary shell approved in ADR-046 for desktop and mobile.  
**Where**:

- `frontend/components/cart/CartSummaryBar.tsx`
- `frontend/components/cart/CartItemChip.tsx`
- `frontend/components/cart/MobileCartReviewSheet.tsx`
- `frontend/components/catalog/CatalogPanel.tsx`

**Depends on**: T14  
**Reuses**: Existing `ProductCard` badge/button styles, touch-target sizing from `RecommendationColumn`, and disclosure patterns already used by dropdown components.  
**Requirement**: CART-03, CART-07, CART-08, CART-10, CART-11

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`, `react-best-practices`

**Done when**:

- [ ] On `md+`, the cart summary renders as a sticky in-flow bar below the catalog filters.
- [ ] On `<md`, the summary renders as a sticky bottom bar with a lightweight review sheet.
- [ ] The mobile review sheet uses disclosure semantics (`aria-expanded`, `aria-controls`) rather than a full modal dialog.
- [ ] Clear-cart and checkout actions are available from the summary shell.
- [ ] New motion uses `transform` / `opacity` only and is guarded by `motion-safe` / `motion-reduce`.
- [ ] New interactive controls have stable `data-testid` values.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: cart summary UI compiles and behaves responsively without adding a new header control group.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add responsive cart summary bar`

---

### T16: Persist cart-aware analysis and awaiting retrain state

**What**: Extend the analysis store so cart-aware snapshots and awaiting-retrain metadata survive reloads, then close the frontend cart-data phase with the build gate.  
**Where**:

- `frontend/store/analysisSlice.ts`
- `frontend/store/index.ts`

**Depends on**: T13, T15  
**Reuses**: Existing `captureInitial`, `captureRetrained`, `resetAnalysis`, and Zustand `partialize`.  
**Requirement**: CART-15, CART-16, CART-17, CART-18, CART-19, CART-45, CART-46, CART-47, CART-48, CART-49, CART-54, CART-55, CART-56, CART-57, CART-58, CART-59

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [ ] Analysis state can represent a cart-aware snapshot separately from the post-checkout snapshot.
- [ ] `awaitingRetrainSince`, `lastObservedVersion`, and `awaitingForOrderId` exist on analysis state.
- [ ] Store actions can start and clear an awaiting retrain session.
- [ ] `captureRetrained` resets the awaiting fields.
- [ ] Changing/resetting client clears cart-aware and awaiting fields.
- [ ] Zustand `partialize` persists the awaiting fields with `selectedClient`.
- [ ] Build gate passes: `npm run lint && npm run build && npm run test:e2e`.
- [ ] Existing frontend Playwright suite remains green after the state changes.

**Verify**:

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: persisted analysis/cart state is type-safe and the full frontend gate exits 0.

**Tests**: none  
**Gate**: build  
**Commit**: `feat(frontend): persist cart-aware analysis state`

---

### T17: Rename `useRetrainJob` to `useModelStatus`

**What**: Replace job-id polling with `/model/status` version polling while preserving manual retrain support.  
**Where**:

- `frontend/lib/hooks/useModelStatus.ts`
- `frontend/lib/hooks/useRetrainJob.ts` (delete or compatibility alias during migration)
- `frontend/lib/adapters/train.ts`

**Depends on**: T7, T11, T16  
**Reuses**: Existing polling interval structure, `getModelStatus`, `postModelTrain`, and current error/backoff behavior.  
**Requirement**: CART-45, CART-46, CART-47, CART-48, CART-49, CART-50, CART-53

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`, `react-best-practices`

**Done when**:

- [ ] Hook polls `GET /model/status` every 2s while awaiting retrain.
- [ ] Hook starts awaiting after checkout with `expectedTrainingTriggered: true`.
- [ ] Hook captures retrained recommendations when `currentVersion` changes.
- [ ] Hook resolves rejected/failed without requiring `jobId`.
- [ ] Hook times out after 90s into `unknown`.
- [ ] Hook resumes from persisted awaiting fields after reload.
- [ ] Manual retrain uses the same model-status source of truth.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: the new hook compiles and the old hook is no longer the primary source of truth.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): poll model status by version`

---

### T18: Rename and evolve `RetrainPanel` into `ModelStatusPanel`

**What**: Rename the retrain UI and add explicit idle, training, promoted, rejected, failed, and unknown visual states plus the advanced/manual disclosure.  
**Where**:

- `frontend/components/retrain/ModelStatusPanel.tsx`
- `frontend/components/retrain/RetrainPanel.tsx` (remove after migration)
- `frontend/components/retrain/TrainingProgressBar.tsx`
- `frontend/components/retrain/ModelMetricsComparison.tsx`

**Depends on**: T17  
**Reuses**: Existing retrain panel layout, `TrainingProgressBar`, `ModelMetricsComparison`, and the always-mounted analysis pattern.  
**Requirement**: CART-38, CART-39, CART-40, CART-41, CART-42, CART-43, CART-51, CART-53

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`, `react-best-practices`

**Done when**:

- [ ] `RetrainPanel.tsx` no longer exists on the primary path.
- [ ] Idle state shows current model and "Aguardando proximo pedido para aprender".
- [ ] Training state shows progress and checkout order context.
- [ ] Promoted state shows success, delta, and the CTA to see updated recommendations.
- [ ] Rejected state shows decision details from `lastDecision`.
- [ ] Failed state shows recoverable error copy.
- [ ] Unknown state appears after timeout with a manual refresh action.
- [ ] Manual "Retreinar Modelo" lives inside an advanced/demo disclosure.
- [ ] Status text remains `aria-live="polite"` and decorative emoji are hidden from assistive tech.
- [ ] Gate check passes: `npm run lint && npm run build`.

**Verify**:

```bash
cd frontend && npm run lint && npm run build
```

Expected: `ModelStatusPanel` builds with all terminal states and the advanced/manual path remains available.

**Tests**: none  
**Gate**: quick  
**Commit**: `feat(frontend): add model status panel`

---

### T19: Wire `AnalysisPanel` and `TabNav` to the final M13 UX

**What**: Connect the final cart/status UX into the analysis view, align navigation semantics with real tabs, and close the frontend UI phase with the build gate.  
**Where**:

- `frontend/components/recommendations/AnalysisPanel.tsx`
- `frontend/components/analysis/RecommendationColumn.tsx`
- `frontend/components/layout/TabNav.tsx`
- `frontend/components/ui/tabs.tsx` (reuse or adapt)
- `frontend/app/page.tsx`
- `frontend/e2e/tests/*.spec.ts` (only selector/semantics updates needed to keep the existing suite green)

**Depends on**: T14, T15, T16, T18  
**Reuses**: Existing always-mounted `AnalysisPanel`, Radix `Tabs`, `RecommendationColumn`, and current Playwright helpers.  
**Requirement**: CART-39, CART-40, CART-41, CART-42, CART-43, CART-44, CART-52, CART-68

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`, `react-best-practices`

**Done when**:

- [ ] `AnalysisPanel` shows the approved `Com Carrinho` and `Pos-Efetivar` flow.
- [ ] `ModelStatusPanel` is wired into `AnalysisPanel` without reintroducing click-driven `jobId` logic.
- [ ] `Pos-Efetivar` has a stable id/anchor target for the promoted CTA scroll behavior.
- [ ] `TabNav` uses real tab semantics via Radix `Tabs` or equivalent DOM semantics.
- [ ] Main nav is keyboard-operable and aligned with current E2E expectations.
- [ ] Stable `data-testid` values exist for cart and model-status controls needed by Playwright.
- [ ] Existing frontend Playwright specs are updated only as needed to stay green against the new DOM.
- [ ] Build gate passes: `npm run lint && npm run build && npm run test:e2e`.
- [ ] No silent test deletion: existing search/recommend/rag coverage remains present.

**Verify**:

```bash
cd frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: the final cart/status UI compiles, existing frontend E2E passes, and top-level navigation exposes real tab semantics.

**Tests**: e2e  
**Gate**: build  
**Commit**: `feat(frontend): wire final cart and model status UX`

---

### T20: Add M13 end-to-end coverage and run final cross-service gates

**What**: Add the checkout-to-async-retrain E2E spec and run the final build gates across all touched services.  
**Where**:

- `frontend/e2e/tests/m13-cart-async-retrain.spec.ts`
- `frontend/e2e/tests/m9b-deep-retrain.spec.ts` (rename/delete/update only if still conflicting with M13)
- `.specs/project/STATE.md` only for execution notes if requested during Execute

**Depends on**: T11, T19  
**Reuses**: Existing Playwright helpers from M9/M11, stable `data-testid` values added earlier, and the final cross-service verification commands from TESTING.md.  
**Requirement**: CART-01 through CART-68

**Tools**:

- MCP: NONE
- Skill: `coding-guidelines`

**Done when**:

- [x] E2E flow selects a client, adds products to cart, reviews the cart shell, checks out, observes `ModelStatusPanel` training, and waits for promoted/rejected/failed terminal status.
- [x] E2E validates the cart is cleared after checkout.
- [x] E2E validates `Pos-Efetivar` is filled after promotion or the rejected state is clearly explained.
- [x] Legacy M9 deep-retrain coverage is updated or superseded so there is no conflicting manual-first expectation.
- [x] API build gate passes: `./mvnw verify`.
- [x] AI build gate passes: `npm run lint && npm run build && npm test`.
- [x] Frontend build gate passes: `npm run lint && npm run build && npm run test:e2e`.
- [x] No silent test deletion: existing M8/M9/M11/M12/M13 specs remain present unless explicitly superseded by name.

**Verify**:

```bash
cd api-service && ./mvnw verify
cd ../ai-service && npm run lint && npm run build && npm test
cd ../frontend && npm run lint && npm run build && npm run test:e2e
```

Expected: all service-level build gates pass and the M13 E2E demonstrates the full cart -> checkout -> async retrain loop.

**Tests**: e2e  
**Gate**: build  
**Commit**: `test(e2e): cover cart checkout async retrain flow`

---

## Parallel Execution Map

```text
Phase 1 (Sequential):
  T1 -> T2 -> T3

Phase 2 (Parallel start, sequential finish):
  T4 [P]
  T5 [P]
  T6 [P] -> T7 -> T8

Phase 3 (Sequential):
  T8 -> T9
  T2, T9 -> T10 -> T11

Phase 4 (Sequential):
  T3, T4, T11 -> T12 -> T13 -> T14 -> T15 -> T16

Phase 5 (Sequential):
  T7, T11, T16 -> T17 -> T18 -> T19

Phase 6 (Sequential):
  T11, T19 -> T20
```

**Parallelism constraint**: Only T4/T5/T6 are marked `[P]` because they use parallel-safe Vitest quick gates and do not share implementation files. Frontend tasks remain sequential due to shared store and component surfaces. Do not run Playwright E2E in parallel with backend build gates that mutate the local stack.

---

## Task Granularity Check

| Task | Scope | Status |
|---|---|---|
| T1 | API cart model + DTO contract | ✅ Granular |
| T2 | One application service behavior group | ✅ Granular |
| T3 | One controller endpoint group + phase build gate | ✅ Granular |
| T4 | One AI recommendation capability | ✅ Granular |
| T5 | One training-path correction | ✅ Granular |
| T6 | One promotion-ownership refactor | ✅ Granular |
| T7 | One queue/status behavior group | ✅ Granular |
| T8 | One internal AI sync route + phase build gate | ✅ Granular |
| T9 | One API client capability | ✅ Granular |
| T10 | One checkout service flow | ✅ Granular |
| T11 | One checkout controller slice + phase build gate | ✅ Granular |
| T12 | Frontend proxy route group | ✅ Granular |
| T13 | Frontend adapter/store slice | ✅ Granular |
| T14 | Catalog cart actions | ✅ Granular |
| T15 | Responsive cart summary shell | ✅ Granular |
| T16 | Analysis persistence/cart-aware state + phase build gate | ✅ Granular |
| T17 | One hook migration | ✅ Granular |
| T18 | One panel rename/evolution | ✅ Granular |
| T19 | Final analysis/nav UX integration + phase build gate | ✅ Granular |
| T20 | M13 E2E + cross-service final verification | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | No inbound arrow | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | T2 | T2 -> T3 | ✅ Match |
| T4 | None | Parallel root | ✅ Match |
| T5 | None | Parallel root | ✅ Match |
| T6 | None | Parallel root | ✅ Match |
| T7 | T6 | T6 -> T7 | ✅ Match |
| T8 | T7 | T7 -> T8 | ✅ Match |
| T9 | T8 | T8 -> T9 | ✅ Match |
| T10 | T2, T9 | T2,T9 -> T10 | ✅ Match |
| T11 | T10 | T10 -> T11 | ✅ Match |
| T12 | T3, T4, T11 | T3,T4,T11 -> T12 | ✅ Match |
| T13 | T12 | T12 -> T13 | ✅ Match |
| T14 | T13 | T13 -> T14 | ✅ Match |
| T15 | T14 | T14 -> T15 | ✅ Match |
| T16 | T13, T15 | T13,T15 -> T16 | ✅ Match |
| T17 | T7, T11, T16 | T7,T11,T16 -> T17 | ✅ Match |
| T18 | T17 | T17 -> T18 | ✅ Match |
| T19 | T14, T15, T16, T18 | T14,T15,T16,T18 -> T19 | ✅ Match |
| T20 | T11, T19 | T11,T19 -> T20 | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | `entity/*`, `repository/*`, DTOs | none / indirect IT | none | ✅ OK |
| T2 | `service/*ApplicationService` | unit | unit | ✅ OK |
| T3 | `controller/*` | integration | integration | ✅ OK |
| T4 | `RecommendationService`, route | integration | integration | ✅ OK |
| T5 | `ModelTrainer` | unit | unit | ✅ OK |
| T6 | `VersionedModelStore`, `ModelTrainer`, config/types | unit | unit | ✅ OK |
| T7 | `TrainingJobRegistry`, model route | integration | integration | ✅ OK |
| T8 | ai-service route/service | integration | integration | ✅ OK |
| T9 | `AiSyncClient` | none | none | ✅ OK |
| T10 | `service/*ApplicationService` | unit | unit | ✅ OK |
| T11 | `controller/*` | integration | integration | ✅ OK |
| T12 | `app/api/proxy/*` | none | none | ✅ OK |
| T13 | frontend adapter/store | none | none | ✅ OK |
| T14 | React components | none | none | ✅ OK |
| T15 | React components | none | none | ✅ OK |
| T16 | Zustand slice/store | none | none | ✅ OK |
| T17 | React hook/adapter | none | none | ✅ OK |
| T18 | React component | none | none | ✅ OK |
| T19 | React components + Playwright selector alignment | e2e (task owns E2E alignment) | e2e | ✅ OK |
| T20 | full UI flow | e2e | e2e | ✅ OK |

---

## Execution Notes

- Execute Phase 2 parallel tasks with separate sub-agents only after confirming the branch is ready for implementation.
- Before `execute task`, ask the user which MCPs and skills they want applied per task.
- Use `user-context7` only if implementation needs current Fastify, Spring, Next.js, Radix, Tailwind, or Zustand API confirmation beyond existing project patterns.
- Available MCPs for execution: `user-filesystem`, `user-context7`, `user-github`, `user-atlassian`, `user-jira-zephyr`, `user-figma`, `user-azure-devops-ms`, `cursor-ide-browser`.
- Available relevant skills for execution: `coding-guidelines`, `react-best-practices`, `tlc-spec-driven`.
