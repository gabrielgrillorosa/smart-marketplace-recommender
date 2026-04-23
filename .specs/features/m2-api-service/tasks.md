# M2 — API Service Tasks

**Spec**: `.specs/features/m2-api-service/spec.md`
**Design**: `.specs/features/m2-api-service/design.md`
**Status**: Draft

**MCPs disponiveis:**
- `context7` — documentacao atualizada de libs (Spring Boot, Spring Data JPA, Spring Cache/Caffeine, Resilience4j, springdoc, Micrometer)
- `filesystem` — leitura/escrita de arquivos no projeto (escopo: `smart-marketplace-recommender/`)
- `github` — operacoes GitHub (requer `GITHUB_PERSONAL_ACCESS_TOKEN` preenchido no `~/.cursor/mcp.json`)

---

## Execution Plan

### Phase 1: Runtime Foundation (Sequential)

Base de dependencias, configuracao e correlacao de trace para suportar todas as features M2.

```
T1 -> T2 -> T3
```

### Phase 2: Domain and Persistence Base (Parallel + Barrier)

Entidades, contratos e cache/repository base podem ser feitos em paralelo apos a fundacao.

```
T3 complete, then:

    ├── T4  [P]   entities: Product/Supplier/Country
    ├── T5  [P]   entities: Client/Order/OrderItem
    ├── T6  [P]   shared DTOs + request contracts
    └── T14 [P]   cache config + cache names

After T4 + T5 + T6 + T14:
T7
```

### Phase 3: Product Vertical Slice (Sequential)

Implementacao ponta-a-ponta de catalogo (service + controller + docs).

```
T7 -> T8 -> T9
```

### Phase 4: Client and Order Vertical Slice (Parallel + Barrier)

Client profile e order write-flow com consistencia transacional.

```
T7 complete, then:

    ├── T10 -> T11
    └── T12 -> T13
```

### Phase 5: Recommendation and Error Contract (Sequential)

Proxy resiliente para AI + padronizacao de erros observaveis.

```
T11 + T13 complete:
T15 -> T16 -> T17
```

### Phase 6: Operational Hardening and Final Gate (Sequential)

Validacao integrada de OpenAPI, Actuator, cache, fallback e telemetria.

```
T9 + T17 complete:
T18
```

---

## Task Breakdown

### T1: Extend `api-service` dependencies for M2 foundation

**What**: Expand `api-service/pom.xml` with all libraries required by M2 design: validation, WebClient/reactor netty, cache/Caffeine, Resilience4j circuit breaker, and structured logging encoder.
**Where**: `api-service/pom.xml`
**Depends on**: None
**Reuses**: Existing M1 Maven skeleton (`api-service/pom.xml`)
**Requirement**: M2-18, M2-20, M2-23, M2-24, M2-28, M2-33, M2-34

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `pom.xml` includes dependencies for Bean Validation, WebClient/reactor-netty, Caffeine cache, Resilience4j circuit breaker, and Logstash JSON encoder
- [ ] Existing dependencies (`spring-boot-starter-web`, `spring-boot-starter-data-jpa`, `actuator`, `springdoc`) are preserved
- [ ] Dependency scopes are correct (runtime for PostgreSQL, test for `spring-boot-starter-test`)
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `build(api-service): add m2 dependencies for cache resilience and telemetry`

---

### T2: Configure baseline runtime properties for API, AI client, cache and actuator

**What**: Update `application.properties` with server/app properties, datasource, cache ttl settings, actuator exposure, springdoc defaults, AI service base URL/timeouts, and resilience4j configuration.
**Where**: `api-service/src/main/resources/application.properties`
**Depends on**: T1
**Reuses**: Existing M1 database/application keys in `application.properties`
**Requirement**: M2-18, M2-20, M2-21, M2-23, M2-24, M2-27, M2-28, M2-32, M2-33

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `application.properties` defines `api.v1` base settings, pagination defaults, and validation limits (`size<=100`, recommendation `limit<=50`)
- [ ] Actuator endpoints required in spec (`health`, `info`, `metrics`) are exposed
- [ ] AI client properties exist (`ai.service.base-url`, connect timeout, response timeout) and app startup does not fail if downstream is unavailable
- [ ] Caffeine/resilience/cache-related settings are present and consistent with design ADRs
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `chore(api-service): configure m2 runtime properties and actuator exposure`

---

### T3: Implement request trace correlation and JSON log baseline

**What**: Add infrastructure for request trace propagation (`TraceIdFilter`) and JSON logging configuration (`logback-spring.xml`) so every request/error can be correlated by `traceId`.
**Where**: `api-service/src/main/java/com/smartmarketplace/config/TraceIdFilter.java`, `api-service/src/main/resources/logback-spring.xml`
**Depends on**: T2
**Reuses**: Spring Boot servlet filter and MDC patterns
**Requirement**: M2-22, M2-34, M2-35

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `TraceIdFilter` creates/reuses per-request `traceId`, writes `X-Trace-Id` response header, and stores value in MDC
- [ ] JSON logging output includes at least method, path, status, duration and `traceId`
- [ ] Filter clears MDC on completion to avoid cross-request leakage
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `feat(observability): add traceid filter and structured json logging baseline`

---

### T4: Implement catalog-side JPA entities (`Product`, `Supplier`, `Country`) [P]

**What**: Create entity mappings for product catalog side with constraints/relationships to M1 schema, including many-to-many mapping for `product_countries`.
**Where**: `api-service/src/main/java/com/smartmarketplace/entity/Product.java`, `Supplier.java`, `Country.java`
**Depends on**: T3
**Reuses**: M1 PostgreSQL schema (`products`, `suppliers`, `countries`, `product_countries`)
**Requirement**: M2-02, M2-05, M2-07

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Entities map correctly to existing table/column names (no `ddl-auto` schema drift)
- [ ] `Product` includes supplier relation and countries relation for `availableCountries`
- [ ] `Product.sku` is mapped as unique at entity level to support duplicate-write conflict handling
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(api-service): map product supplier and country entities`

---

### T5: Implement customer/order JPA entities (`Client`, `Order`, `OrderItem`) [P]

**What**: Create entity mappings for client profile and transactional order flow, preserving schema names and relationships used in aggregate queries.
**Where**: `api-service/src/main/java/com/smartmarketplace/entity/Client.java`, `Order.java`, `OrderItem.java`
**Depends on**: T3
**Reuses**: M1 PostgreSQL schema (`clients`, `orders`, `order_items`)
**Requirement**: M2-10, M2-11, M2-13, M2-14, M2-15

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `Client` maps country relation for `countryCode` lookup
- [ ] `Order` and `OrderItem` map one-to-many/many-to-one relations without orphan schema generation
- [ ] Monetary/date fields are mapped to stable Java types (`BigDecimal`, `LocalDateTime`)
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(api-service): map client order and orderitem entities`

---

### T6: Create shared DTO contracts and request payload models [P]

**What**: Implement common response/request contracts (`PagedResponse`, `ErrorResponse`, create request DTOs, summary/detail DTOs) with validation annotations for edge cases from spec.
**Where**: `api-service/src/main/java/com/smartmarketplace/dto/*.java`
**Depends on**: T3
**Reuses**: DTO shapes defined in M2 design
**Requirement**: M2-01, M2-02, M2-05, M2-09, M2-10, M2-11, M2-14, M2-22, M2-30

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Pagination envelope DTO exposes `items`, `page`, `size`, `totalItems`, `totalPages`
- [ ] Request DTOs enforce minimum business constraints (`description>=30`, positive price/quantity, non-empty items)
- [ ] Error contract DTO includes `timestamp`, `status`, `error`, `message`, `path`, `traceId`
- [ ] Recommendation DTO supports `degraded` and per-item `matchReason`
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(api-service): add m2 request and response dto contracts`

---

### T14: Implement cache infrastructure (`CacheNames` + `CacheConfig`) [P]

**What**: Implement programmatic Caffeine cache manager with two caches (`catalogList` 5m and `fallbackRecommendations` 1m) and statistics enabled.
**Where**: `api-service/src/main/java/com/smartmarketplace/config/CacheNames.java`, `CacheConfig.java`
**Depends on**: T3
**Reuses**: ADR-003 cache decision for explicit names/TTL
**Requirement**: M2-24, M2-25, M2-27, M2-29

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Cache names are centralized in constants (no magic strings across services)
- [ ] Caffeine manager config creates both caches with distinct TTLs
- [ ] `recordStats()` is enabled so Micrometer/Actuator can expose cache metrics
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(cache): configure caffeine caches with explicit ttl and stats`

---

### T7: Implement repositories and query helpers for filters, summaries and fallback

**What**: Implement Spring Data repositories and query methods/specifications for product filtering (AND semantics), purchase summary aggregate, ordered history, and fallback recommendation query.
**Where**: `api-service/src/main/java/com/smartmarketplace/repository/*.java`
**Depends on**: T4, T5, T6, T14
**Reuses**: Spring Data JPA Specification and JPQL aggregate/query patterns
**Requirement**: M2-03, M2-04, M2-11, M2-13, M2-14, M2-24, M2-25, M2-29, M2-31

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Product repository supports composable filters (`category`, `country`, `supplier`, `search`) with AND semantics
- [ ] Search filter is case-insensitive substring on product name
- [ ] Order repository provides aggregate query for `purchaseSummary` and history query sorted by `orderDate DESC`
- [ ] Fallback query excludes products already purchased by client and ranks by top-selling criteria
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `feat(repository): add m2 filter aggregate and fallback queries`

---

### T8: Implement `ProductApplicationService` with validation, cache and transactional create

**What**: Implement product use cases (`listProducts`, `getProduct`, `createProduct`) including all business validations and cache key/eviction behavior from spec.
**Where**: `api-service/src/main/java/com/smartmarketplace/service/ProductApplicationService.java`
**Depends on**: T7
**Reuses**: `CacheNames` constants and product repositories/specification helpers
**Requirement**: M2-01, M2-02, M2-03, M2-04, M2-05, M2-06, M2-07, M2-08, M2-09, M2-24, M2-25, M2-26

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] List operation returns paged envelope with default `page=0`, `size=20` and validated bounds
- [ ] Create operation validates category, supplier, country codes, duplicate countries, positive price and description length
- [ ] Product + `product_countries` links are persisted atomically in a single transaction
- [ ] Catalog list cache key includes all six dimensions and create operation evicts catalog cache entries
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(product): implement product application service with cache and validations`

---

### T9: Implement `ProductController` with OpenAPI docs and response semantics

**What**: Expose product endpoints under `/api/v1/products` with parameter validation, documented request/response schemas, and expected status codes.
**Where**: `api-service/src/main/java/com/smartmarketplace/controller/ProductController.java`
**Depends on**: T8
**Reuses**: Product DTOs and application service methods
**Requirement**: M2-01, M2-02, M2-05, M2-06, M2-07, M2-08, M2-09, M2-18, M2-19

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `GET /api/v1/products` supports pagination/filter params and returns documented `PagedResponse<ProductSummaryDTO>`
- [ ] `GET /api/v1/products/{id}` returns detail payload or 404 for unknown UUID
- [ ] `POST /api/v1/products` returns 201 on success and delegates validation/constraint failures to standardized error pipeline
- [ ] Springdoc annotations describe endpoint params, payloads and error status codes
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `feat(product): expose catalog endpoints with openapi documentation`

---

### T10: Implement `ClientApplicationService` for list/detail/history

**What**: Implement client use cases (`listClients`, `getClient`, `listClientOrders`) including aggregate purchase summary and 404 behavior.
**Where**: `api-service/src/main/java/com/smartmarketplace/service/ClientApplicationService.java`
**Depends on**: T7
**Reuses**: Client/order repositories and aggregate queries from T7
**Requirement**: M2-10, M2-11, M2-12, M2-13, M2-14, M2-17

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Client list returns paged summaries with required fields
- [ ] Client detail computes and returns `purchaseSummary { totalOrders, totalItems, totalSpent, lastOrderAt }`
- [ ] Unknown client IDs return `ResourceNotFoundException` for consistent 404 response
- [ ] Order history list enforces descending `orderDate` and nested item mapping
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(client): implement client application service and purchase summary`

---

### T11: Implement `ClientController` endpoints with OpenAPI metadata

**What**: Expose client endpoints under `/api/v1/clients` for list, profile and order history with pagination validation and documented contracts.
**Where**: `api-service/src/main/java/com/smartmarketplace/controller/ClientController.java`
**Depends on**: T10
**Reuses**: Client DTOs and service methods
**Requirement**: M2-10, M2-11, M2-12, M2-13, M2-14, M2-19

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `GET /api/v1/clients` returns paged client summaries
- [ ] `GET /api/v1/clients/{id}` returns detail with purchase summary
- [ ] `GET /api/v1/clients/{id}/orders` returns paged order history sorted by newest first
- [ ] OpenAPI metadata for params and response schemas is complete
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(client): expose client and order history endpoints`

---

### T12: Implement `OrderApplicationService` with pre-validation and transaction boundary

**What**: Implement order creation orchestration with pre-validation (unknown client/product, duplicate product ids, country availability) and transactional persistence of `orders` + `order_items`.
**Where**: `api-service/src/main/java/com/smartmarketplace/service/OrderApplicationService.java`
**Depends on**: T7
**Reuses**: Repositories from T7 and DTO contracts from T6
**Requirement**: M2-15, M2-16, M2-17

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Service rejects empty item lists and duplicate product IDs before transaction
- [ ] Service validates product existence and country availability with batch queries (no per-item DB loop)
- [ ] Transaction computes order total from current product prices and persists order/items atomically
- [ ] Success response includes nested item payload required by spec
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(order): implement transactional order creation service`

---

### T13: Implement `OrderController` (`POST /api/v1/orders`) and contract docs

**What**: Expose write endpoint for orders with request validation and documented success/error contracts.
**Where**: `api-service/src/main/java/com/smartmarketplace/controller/OrderController.java`
**Depends on**: T12
**Reuses**: `CreateOrderRequest` and `OrderApplicationService`
**Requirement**: M2-15, M2-16, M2-17, M2-19

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] `POST /api/v1/orders` returns 201 on successful transactional create
- [ ] Validation and domain failures are surfaced via standardized error responses
- [ ] OpenAPI documentation includes request schema, success schema and relevant error statuses
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `feat(order): expose create order endpoint with openapi docs`

---

### T15: Implement `AiServiceClient` and WebClient timeout/circuit-breaker adapter

**What**: Implement outbound AI adapter with explicit timeout configuration, Resilience4j circuit breaker, and fallback-to-empty behavior without failing app startup.
**Where**: `api-service/src/main/java/com/smartmarketplace/config/WebClientConfig.java`, `AiServiceConfig.java`, `api-service/src/main/java/com/smartmarketplace/service/AiServiceClient.java`
**Depends on**: T11, T13
**Reuses**: ADR-002 split between adapter and orchestration service
**Requirement**: M2-23, M2-28, M2-29, M2-32, M2-33

**Tools**:
- MCP: `context7`, `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] AI HTTP client uses configured base URL plus connect/response timeout values
- [ ] Circuit breaker wraps outbound call and fallback method returns empty optional/list on failures
- [ ] Adapter does not include fallback ranking domain logic (SRP split preserved)
- [ ] Startup path does not require downstream AI availability
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(recommendation): add resilient ai service http client`

---

### T16: Implement recommendation orchestration service and controller

**What**: Implement `RecommendationService` and `RecommendationController` that validate client first, return AI-ranked responses when available, and degrade to fallback recommendations with explicit `degraded=true`.
**Where**: `api-service/src/main/java/com/smartmarketplace/service/RecommendationService.java`, `api-service/src/main/java/com/smartmarketplace/controller/RecommendationController.java`
**Depends on**: T15
**Reuses**: `AiServiceClient`, fallback repository/query from T7, recommendation DTOs from T6
**Requirement**: M2-28, M2-29, M2-30, M2-31, M2-32

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Unknown client IDs return 404 before any outbound AI request
- [ ] Successful downstream AI responses return ranked items with `degraded=false`
- [ ] Timeout/5xx/open-circuit scenarios return fallback top-selling list with `degraded=true` and `matchReason=fallback`
- [ ] Fallback remains country-aware and excludes already purchased products
- [ ] Gate check passes: `mvn -f api-service/pom.xml -DskipTests compile`

**Tests**: none
**Gate**: verify

**Commit**: `feat(recommendation): add proxy endpoint with resilient fallback flow`

---

### T17: Implement global exception handling contract and HTTP-to-error mapping

**What**: Implement exception classes and `GlobalExceptionHandler` to unify error payload for validation, business rule, not found, duplicate sku conflict, and unexpected errors.
**Where**: `api-service/src/main/java/com/smartmarketplace/exception/*.java`
**Depends on**: T16
**Reuses**: `ErrorResponse` DTO from T6 and `traceId` from T3 MDC context
**Requirement**: M2-06, M2-08, M2-12, M2-16, M2-22, M2-35

**Tools**:
- MCP: `filesystem`
- Skill: `coding-guidelines`

**Done when**:
- [ ] Known exception classes map to expected HTTP statuses (400/404/409/500)
- [ ] Every error response contains `timestamp`, `status`, `error`, `message`, `path`, `traceId`
- [ ] `DataIntegrityViolationException` on duplicate `sku` maps to HTTP 409
- [ ] Error `traceId` value matches request trace context from filter/logging pipeline
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `feat(api-service): standardize global error handling with trace correlation`

---

### T18: Run integrated operational verification and close M2 build gate

**What**: Validate the full M2 behavior end-to-end: Swagger/OpenAPI reachability, actuator baseline, product/client/order flows, cache behavior, recommendation degraded mode recovery, and telemetry consistency.
**Where**: Verification task (may adjust `controller/`, `service/`, `config/`, `repository/`, `dto/`, `exception/`, or `application.properties` if failures appear)
**Depends on**: T9, T17
**Reuses**: M2 independent test scenarios in `spec.md`
**Requirement**: M2-01..M2-35 (full milestone gate)

**Tools**:
- MCP: NONE
- Skill: NONE

**Done when**:
- [ ] `GET /swagger-ui.html` and `GET /v3/api-docs` return 200 and expose all M2 public endpoints
- [ ] `GET /actuator/health`, `GET /actuator/info`, `GET /actuator/metrics`, and `GET /actuator/metrics/http.server.requests` return 200
- [ ] Product, client and order endpoints satisfy all P1 acceptance criteria including pagination defaults and edge-case errors
- [ ] Repeated identical product list queries produce cache hits and product create evicts stale catalog cache entries
- [ ] Recommendation endpoint demonstrates both normal and degraded/fallback flows and recovers after downstream restoration
- [ ] Structured logs and error payloads can be correlated by the same `traceId`
- [ ] Build gate passes: `mvn -f api-service/pom.xml clean verify`

**Tests**: none
**Gate**: build

**Commit**: `chore(m2): verify api service endpoints resilience cache and observability`

---

## Parallel Execution Map

Visual representation of what can run simultaneously:

```
Phase 1 (Sequential):
  T1 --> T2 --> T3

Phase 2 (Parallel):
  T3 complete, then:
    ├── T4 [P]
    ├── T5 [P]
    ├── T6 [P]
    └── T14 [P]
  T4 + T5 + T6 + T14 --> T7

Phase 3 (Sequential):
  T7 --> T8 --> T9

Phase 4 (Parallel Streams):
  T7 complete, then:
    Stream A: T10 --> T11
    Stream B: T12 --> T13

Phase 5 (Sequential):
  T11 + T13 --> T15 --> T16 --> T17

Phase 6 (Final Gate):
  T9 + T17 --> T18
```

---

## Pre-Approval Validation

### Check 1: Task Granularity

| Task | Scope | Status |
|---|---|---|
| T1: Extend dependencies | 1 file, 1 concern (build deps) | ✅ Granular |
| T2: Runtime properties | 1 file, cohesive config set | ✅ Granular |
| T3: Trace + JSON log baseline | 2 infra files, single observability concern | ✅ Granular |
| T4: Catalog entities | 3 entities, same bounded concern | ✅ Granular |
| T5: Client/order entities | 3 entities, same transactional concern | ✅ Granular |
| T6: Shared DTO contracts | DTO-only layer | ✅ Granular |
| T14: Cache infrastructure | 2 config files, one cache concern | ✅ Granular |
| T7: Repository/query base | repository layer only | ✅ Granular |
| T8: Product service | 1 service class / 1 vertical business flow | ✅ Granular |
| T9: Product controller | 1 controller / 3 endpoints same bounded context | ✅ Granular |
| T10: Client service | 1 service class | ✅ Granular |
| T11: Client controller | 1 controller | ✅ Granular |
| T12: Order service | 1 service class | ✅ Granular |
| T13: Order controller | 1 controller / 1 endpoint | ✅ Granular |
| T15: AI HTTP adapter | adapter/config layer only | ✅ Granular |
| T16: Recommendation orchestration + endpoint | one cohesive recommendation flow | ✅ Granular |
| T17: Global error mapping | exception layer only | ✅ Granular |
| T18: Integrated gate | verification-only milestone closure | ✅ Granular |

**Result:** ✅ All 18 tasks are atomic and executable.

---

### Check 2: Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows | Status |
|---|---|---|---|
| T1 | None | Start of Phase 1 | ✅ Match |
| T2 | T1 | T1 -> T2 | ✅ Match |
| T3 | T2 | T2 -> T3 | ✅ Match |
| T4 [P] | T3 | T3 -> T4 | ✅ Match |
| T5 [P] | T3 | T3 -> T5 | ✅ Match |
| T6 [P] | T3 | T3 -> T6 | ✅ Match |
| T14 [P] | T3 | T3 -> T14 | ✅ Match |
| T7 | T4, T5, T6, T14 | T4 + T5 + T6 + T14 -> T7 | ✅ Match |
| T8 | T7 | T7 -> T8 | ✅ Match |
| T9 | T8 | T8 -> T9 | ✅ Match |
| T10 | T7 | T7 -> T10 | ✅ Match |
| T11 | T10 | T10 -> T11 | ✅ Match |
| T12 | T7 | T7 -> T12 | ✅ Match |
| T13 | T12 | T12 -> T13 | ✅ Match |
| T15 | T11, T13 | T11 + T13 -> T15 | ✅ Match |
| T16 | T15 | T15 -> T16 | ✅ Match |
| T17 | T16 | T16 -> T17 | ✅ Match |
| T18 | T9, T17 | T9 + T17 -> T18 | ✅ Match |

**Result:** ✅ Diagram and task dependencies are consistent. No circular dependencies. `[P]` tasks in Phase 2 are independent.

---

### Check 3: Test Co-location Validation

> Note: `.specs/codebase/TESTING.md` does not exist in this repository yet. Following the current project convention (M1 tasks), test type defaults to `none` and verification is performed by compile/build gates and endpoint-level acceptance checks.

| Task | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
|---|---|---|---|---|
| T1 | Build dependencies (`pom.xml`) | none (no TESTING.md) | none | ✅ OK |
| T2 | Runtime config (`application.properties`) | none | none | ✅ OK |
| T3 | Observability infra (`filter` + `logback`) | none | none | ✅ OK |
| T4 | JPA entities (catalog) | none | none | ✅ OK |
| T5 | JPA entities (client/order) | none | none | ✅ OK |
| T6 | DTO contracts | none | none | ✅ OK |
| T14 | Cache config | none | none | ✅ OK |
| T7 | Repository/query layer | none | none | ✅ OK |
| T8 | Product service | none | none | ✅ OK |
| T9 | Product controller | none | none | ✅ OK |
| T10 | Client service | none | none | ✅ OK |
| T11 | Client controller | none | none | ✅ OK |
| T12 | Order service | none | none | ✅ OK |
| T13 | Order controller | none | none | ✅ OK |
| T15 | AI adapter layer | none | none | ✅ OK |
| T16 | Recommendation service/controller | none | none | ✅ OK |
| T17 | Exception handling layer | none | none | ✅ OK |
| T18 | End-to-end verification | none | none | ✅ OK |

**Result:** ✅ No test-matrix violations under current project baseline.  
**Follow-up recommended before Execute:** define `.specs/codebase/TESTING.md` to codify unit/integration/build gates for M3+.

---

## Requirement Traceability

| Req ID | Task(s) | Status |
|---|---|---|
| M2-01 | T6, T8, T9, T18 | Pending |
| M2-02 | T4, T6, T8, T9 | Pending |
| M2-03 | T7, T8 | Pending |
| M2-04 | T7, T8 | Pending |
| M2-05 | T4, T6, T8, T9 | Pending |
| M2-06 | T8, T9, T17 | Pending |
| M2-07 | T4, T8, T9 | Pending |
| M2-08 | T6, T8, T9, T17 | Pending |
| M2-09 | T6, T8, T9 | Pending |
| M2-10 | T5, T6, T10, T11 | Pending |
| M2-11 | T7, T10, T11 | Pending |
| M2-12 | T10, T11, T17 | Pending |
| M2-13 | T7, T10, T11 | Pending |
| M2-14 | T6, T7, T10, T11 | Pending |
| M2-15 | T5, T6, T12, T13 | Pending |
| M2-16 | T6, T12, T13, T17 | Pending |
| M2-17 | T10, T12, T13, T18 | Pending |
| M2-18 | T1, T2, T9, T18 | Pending |
| M2-19 | T9, T11, T13, T18 | Pending |
| M2-20 | T1, T2, T18 | Pending |
| M2-21 | T2, T18 | Pending |
| M2-22 | T3, T6, T17, T18 | Pending |
| M2-23 | T1, T2, T15, T18 | Pending |
| M2-24 | T1, T2, T14, T8, T18 | Pending |
| M2-25 | T14, T8, T18 | Pending |
| M2-26 | T8, T18 | Pending |
| M2-27 | T2, T14, T18 | Pending |
| M2-28 | T1, T2, T15, T16, T18 | Pending |
| M2-29 | T14, T7, T15, T16, T18 | Pending |
| M2-30 | T6, T16, T18 | Pending |
| M2-31 | T7, T16, T18 | Pending |
| M2-32 | T2, T15, T16, T18 | Pending |
| M2-33 | T1, T2, T15, T16, T18 | Pending |
| M2-34 | T1, T3, T18 | Pending |
| M2-35 | T3, T17, T18 | Pending |

**Coverage:** 35/35 requirements mapped ✅

---

## Pre-Execute Tool Confirmation

Para a fase de **Execute**, confirme se quer manter este padrao por tarefa:

- **MCP principal:** `filesystem` para implementacao, `context7` para consultas de API/config
- **Skill principal:** `coding-guidelines`
- **Subagentes:** usar 1 subagente por tarefa `[P]` nas fases paralelas

Se quiser, eu ja inicio a execucao pela **Phase 1 (T1 -> T2 -> T3)** neste mesmo fluxo.
