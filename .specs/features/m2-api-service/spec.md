# M2 — API Service Specification

## Problem Statement

M1 established the infrastructure, schema, and seeded data, but the Spring Boot service is still only a skeleton. Without a real domain API, the frontend cannot consume marketplace data, the seeded dataset cannot be exercised through public contracts, and the AI capabilities planned for later milestones have no stable gateway. M2 turns the `api-service` into a documented, observable, and resilient domain API over PostgreSQL, exposing products, clients, orders, and an AI-ready recommendation proxy.

## Goals

- [ ] Expose a stable REST API under `/api/v1` for products, clients, orders, and recommendations, backed by the seeded PostgreSQL dataset.
- [ ] Publish OpenAPI documentation and operational endpoints so an evaluator can inspect and validate the service without reading source code.
- [ ] Support pagination, filtering, caching, and resilient downstream integration patterns that demonstrate Spring Boot production practices.
- [ ] Enforce business validation and transactional consistency for write operations (`POST /products`, `POST /orders`).

## Out of Scope

| Feature | Reason |
|---|---|
| Authentication / authorization | Explicitly excluded from project scope; the portfolio focus is domain API + AI integration, not identity |
| Product update / delete endpoints | Not needed for the MVP demo flow; create + read is sufficient for seed replay and catalog browsing |
| Inventory / stock / warehouse management | The synthetic dataset has no stock domain or fulfillment workflow |
| Embedding generation, semantic search, RAG answer generation | M3 responsibility — belongs to the AI service |
| Neural recommendation training and hybrid scoring logic | M4 responsibility — the API only proxies and degrades gracefully |
| Async order processing, Kafka, event-driven integration | Deferred post-MVP; synchronous HTTP is enough for the portfolio demo |

---

## User Stories

### P1: Product Catalog API ⭐ MVP

**User Story:** As a frontend or integration consumer, I want product list, detail, and create endpoints so that I can browse the catalog and seed or replay products through the public API.

**Why P1:** Products are the primary domain object in the marketplace and unblock both the frontend catalog and future AI-driven recommendation flows.

**Acceptance Criteria:**

1. WHEN `GET /api/v1/products` is called without filters THEN the API SHALL return HTTP 200 with a paginated response containing `items`, `page`, `size`, `totalItems`, and `totalPages`.
2. WHEN `GET /api/v1/products` returns `items` THEN each item SHALL map to `ProductSummaryDTO` with at least `id`, `sku`, `name`, `category`, `price`, `supplierName`, and `availableCountries`.
3. WHEN any combination of `category`, `country`, `supplier`, and `search` query parameters is provided THEN the API SHALL apply all provided filters with AND semantics.
4. WHEN `search` is provided THEN the API SHALL perform a case-insensitive substring match on product `name`.
5. WHEN `GET /api/v1/products/{id}` is called with an existing UUID THEN the API SHALL return HTTP 200 with `ProductDetailDTO`, including the summary fields plus `description`, `supplierId`, and `createdAt`.
6. WHEN `GET /api/v1/products/{id}` is called with an unknown UUID THEN the API SHALL return HTTP 404 with the standard error payload.
7. WHEN `POST /api/v1/products` is called with a valid payload and a unique `sku` THEN the API SHALL create the product, persist its `product_countries` links, and return HTTP 201 with the created representation.
8. WHEN `POST /api/v1/products` is called with duplicate `sku`, invalid `category`, invalid `supplierId`, invalid country code, non-positive `price`, or `description` shorter than 30 characters THEN the API SHALL reject the request with HTTP 400 or 409 and persist nothing.
9. WHEN `page` and `size` are omitted on `GET /api/v1/products` THEN the API SHALL default to `page=0` and `size=20`.

**Independent Test:** Create a product via Swagger UI, fetch it through `GET /api/v1/products`, then fetch it through `GET /api/v1/products/{id}` and verify both list and detail representations.

---

### P1: Client Profile and Order API ⭐ MVP

**User Story:** As a frontend or evaluator, I want client profile and order endpoints so that I can inspect purchase history and create new orders that influence later recommendation behavior.

**Why P1:** Orders are the behavioral signal for later AI milestones, and the project demo needs a complete transactional flow, not just static catalog reads.

**Acceptance Criteria:**

1. WHEN `GET /api/v1/clients` is called THEN the API SHALL return HTTP 200 with a paginated client list containing at least `id`, `name`, `segment`, and `countryCode`.
2. WHEN `GET /api/v1/clients/{id}` is called with an existing UUID THEN the API SHALL return HTTP 200 with client profile data plus `purchaseSummary { totalOrders, totalItems, totalSpent, lastOrderAt }`.
3. WHEN `GET /api/v1/clients/{id}` is called with an unknown UUID THEN the API SHALL return HTTP 404 with the standard error payload.
4. WHEN `GET /api/v1/clients/{id}/orders` is called THEN the API SHALL return HTTP 200 with paginated order history sorted by `orderDate DESC`.
5. WHEN `GET /api/v1/clients/{id}/orders` returns results THEN each order SHALL include `id`, `orderDate`, `total`, and nested `items[*]` with `productId`, `productName`, `quantity`, and `unitPrice`.
6. WHEN `POST /api/v1/orders` is called with a valid `clientId` and at least one valid item THEN the API SHALL create `orders` and `order_items` in a single transaction and compute the stored `total` from current product prices.
7. WHEN `POST /api/v1/orders` includes a product unavailable in the client's country, an unknown `productId`, an unknown `clientId`, or an empty item list THEN the API SHALL reject the request with HTTP 400 or 404 and persist nothing.
8. WHEN `POST /api/v1/orders` succeeds THEN the newly created order SHALL appear in `GET /api/v1/clients/{id}/orders` without requiring any manual data refresh or background job.

**Independent Test:** Place an order for a seeded client, then fetch `GET /api/v1/clients/{id}` and `GET /api/v1/clients/{id}/orders` to verify the purchase summary and order history changed immediately.

---

### P1: API Documentation and Baseline Operations ⭐ MVP

**User Story:** As a developer evaluating the portfolio project, I want self-describing API docs and operational endpoints so that I can validate the service without reading implementation code.

**Why P1:** M2 must feel like a polished Spring Boot service, not just a collection of controllers. OpenAPI and Actuator are part of the milestone promise.

**Acceptance Criteria:**

1. WHEN the `api-service` is running THEN `GET /swagger-ui.html` SHALL load Swagger UI and `GET /v3/api-docs` SHALL return the OpenAPI document in JSON.
2. WHEN the OpenAPI document is inspected THEN all public endpoints in M2 SHALL be documented with request schemas, response schemas, pagination parameters, and error response codes.
3. WHEN `GET /actuator/health`, `GET /actuator/info`, and `GET /actuator/metrics` are called THEN each endpoint SHALL return HTTP 200.
4. WHEN at least one business endpoint has been called THEN `GET /actuator/metrics/http.server.requests` SHALL expose request timing data for the executed route.
5. WHEN validation, not-found, or business-rule errors occur THEN the API SHALL return a consistent JSON error payload containing at least `timestamp`, `status`, `error`, `message`, `path`, and `traceId`.
6. WHEN the AI service base URL is unavailable during `api-service` startup THEN the Spring Boot application SHALL still boot successfully; only the recommendation endpoint SHALL degrade later at request time.

**Independent Test:** Open `http://localhost:8080/swagger-ui.html`, hit a catalog endpoint, then open `http://localhost:8080/actuator/metrics/http.server.requests` and confirm the route appears in the metrics payload.

---

### P2: Cached Catalog Queries

**User Story:** As a catalog consumer, I want repeated list queries to be cached so that browsing is fast and the project demonstrates API-side performance patterns.

**Why P2:** Important engineering signal, but the service remains functionally correct without it.

**Acceptance Criteria:**

1. WHEN the same `GET /api/v1/products` query (same page, size, and filters) is executed repeatedly within 5 minutes THEN the API SHALL serve the second and subsequent responses from a Caffeine in-memory cache.
2. WHEN cache keys are computed for catalog queries THEN the key SHALL include `page`, `size`, `category`, `country`, `supplier`, and `search` so different query shapes do not collide.
3. WHEN `POST /api/v1/products` succeeds THEN the catalog cache SHALL be evicted before the next read request so new products can appear immediately.
4. WHEN catalog traffic occurs THEN cache activity SHALL be visible through Micrometer metrics or Actuator-exposed cache statistics.

**Independent Test:** Call the same list endpoint twice, verify cache-hit metrics increase, then create a product and confirm the next list response reflects the new data.

---

### P2: Recommendation Proxy with Resilient Fallback

**User Story:** As the frontend, I want a Spring Boot recommendation endpoint that proxies AI requests so that the UI depends on a single domain API even when the AI service is slow or unavailable.

**Why P2:** Important for the final architecture, but the core catalog and order API can still ship before the AI service is fully implemented.

**Acceptance Criteria:**

1. WHEN `GET /api/v1/recommend/{clientId}?limit=10` is called and the downstream AI service returns a successful response THEN the API SHALL return HTTP 200 with ranked products containing `score`, `matchReason`, and product summary fields, plus top-level `degraded=false`.
2. WHEN the downstream AI call times out, returns `5xx`, or the circuit breaker is open THEN the API SHALL return HTTP 200 with a fallback list of top-selling products available in the client's country and not yet purchased by the client.
3. WHEN fallback is used THEN the response SHALL set `degraded=true`, and each returned item SHALL include `matchReason=fallback`.
4. WHEN `GET /api/v1/recommend/{clientId}` is called with an unknown client UUID THEN the API SHALL return HTTP 404 before attempting the downstream call.
5. WHEN the downstream AI service recovers after a failure period THEN the recommendation endpoint SHALL resume normal proxy behavior without restarting `api-service`.

**Independent Test:** Stop or mock-fail the AI service and confirm the recommendation endpoint still returns fallback results; restore the AI service and confirm the endpoint resumes returning live ranked scores.

---

### P3: Advanced Operational Telemetry

**User Story:** As a developer troubleshooting performance, I want structured logs and custom metrics so that I can observe cache behavior and downstream latency without adding ad hoc debug code.

**Why P3:** High-value engineering polish, but not mandatory to prove the business API works.

**Acceptance Criteria:**

1. WHEN recommendation traffic flows through the API THEN Micrometer SHALL expose custom metrics for recommendation latency, AI service call duration, and catalog cache behavior.
2. WHEN any HTTP request is processed THEN the application SHALL emit structured JSON logs containing at least `traceId`, HTTP method, path, status, and request duration.
3. WHEN an error response is returned to a caller THEN the `traceId` in the payload SHALL match the `traceId` present in the corresponding log entry.

**Independent Test:** Generate API traffic, inspect `/actuator/metrics`, and confirm a failed request can be correlated end-to-end through the shared `traceId`.

---

## Edge Cases

- WHEN a paginated endpoint receives `page < 0`, `size < 1`, or `size > 100` THEN the API SHALL return HTTP 400 instead of silently coercing the values.
- WHEN `GET /api/v1/products` or `GET /api/v1/clients` has no matches for the provided filters THEN the API SHALL return HTTP 200 with `items=[]` and valid pagination metadata.
- WHEN a `supplier` filter does not match any known supplier name THEN the catalog endpoint SHALL return an empty result set, not HTTP 404.
- WHEN `POST /api/v1/products` includes duplicate country codes in the same payload THEN the API SHALL reject the request with HTTP 400 rather than silently deduplicating.
- WHEN `POST /api/v1/orders` contains the same `productId` multiple times THEN the API SHALL reject the request with HTTP 400 rather than merge quantities implicitly.
- WHEN the recommendation endpoint omits `limit` THEN the API SHALL default to `limit=10`; WHEN `limit < 1` or `limit > 50` THEN the API SHALL return HTTP 400.
- WHEN the circuit breaker is open for the AI service THEN the recommendation endpoint SHALL skip the downstream network call and return fallback results immediately.
- WHEN two concurrent requests try to create the same `sku` THEN exactly one request SHALL succeed and the other SHALL receive HTTP 409.

---

## Requirement Traceability

| Requirement ID | Story | Description | Status |
|---|---|---|---|
| M2-01 | P1: Product Catalog API | Product list returns paginated envelope | Pending |
| M2-02 | P1: Product Catalog API | `ProductSummaryDTO` exposes summary fields | Pending |
| M2-03 | P1: Product Catalog API | Catalog filters combine with AND semantics | Pending |
| M2-04 | P1: Product Catalog API | `search` matches product name case-insensitively | Pending |
| M2-05 | P1: Product Catalog API | Product detail returns `ProductDetailDTO` | Pending |
| M2-06 | P1: Product Catalog API | Unknown product returns 404 error payload | Pending |
| M2-07 | P1: Product Catalog API | Product create persists availability links | Pending |
| M2-08 | P1: Product Catalog API | Product create validates business constraints | Pending |
| M2-09 | P1: Product Catalog API | Catalog pagination defaults to page 0 size 20 | Pending |
| M2-10 | P1: Client Profile and Order API | Client list returns paginated summaries | Pending |
| M2-11 | P1: Client Profile and Order API | Client detail returns purchase summary | Pending |
| M2-12 | P1: Client Profile and Order API | Unknown client detail returns 404 | Pending |
| M2-13 | P1: Client Profile and Order API | Client order history is paginated and sorted | Pending |
| M2-14 | P1: Client Profile and Order API | Order history includes nested line items | Pending |
| M2-15 | P1: Client Profile and Order API | Order create is transactional and computes total | Pending |
| M2-16 | P1: Client Profile and Order API | Invalid order requests fail atomically | Pending |
| M2-17 | P1: Client Profile and Order API | Successful order is immediately queryable | Pending |
| M2-18 | P1: API Documentation and Baseline Operations | Swagger UI and OpenAPI JSON are reachable | Pending |
| M2-19 | P1: API Documentation and Baseline Operations | OpenAPI documents all public M2 endpoints | Pending |
| M2-20 | P1: API Documentation and Baseline Operations | Health, info, and metrics endpoints are exposed | Pending |
| M2-21 | P1: API Documentation and Baseline Operations | HTTP server request latency metrics are available | Pending |
| M2-22 | P1: API Documentation and Baseline Operations | Error payload includes timestamp, path, and traceId | Pending |
| M2-23 | P1: API Documentation and Baseline Operations | AI service unavailability does not block startup | Pending |
| M2-24 | P2: Cached Catalog Queries | Repeated catalog queries use 5-minute cache | Pending |
| M2-25 | P2: Cached Catalog Queries | Cache key includes pagination and filters | Pending |
| M2-26 | P2: Cached Catalog Queries | Product create evicts stale catalog cache | Pending |
| M2-27 | P2: Cached Catalog Queries | Cache metrics are visible via Actuator/Micrometer | Pending |
| M2-28 | P2: Recommendation Proxy with Resilient Fallback | Successful AI proxy returns ranked recommendations | Pending |
| M2-29 | P2: Recommendation Proxy with Resilient Fallback | Downstream failures return top-selling fallback | Pending |
| M2-30 | P2: Recommendation Proxy with Resilient Fallback | Fallback responses expose `degraded=true` and `matchReason=fallback` | Pending |
| M2-31 | P2: Recommendation Proxy with Resilient Fallback | Unknown client returns 404 before downstream call | Pending |
| M2-32 | P2: Recommendation Proxy with Resilient Fallback | Proxy resumes normal behavior after downstream recovery | Pending |
| M2-33 | P3: Advanced Operational Telemetry | Custom metrics expose latency and cache behavior | Pending |
| M2-34 | P3: Advanced Operational Telemetry | Structured JSON logs include request traceId | Pending |
| M2-35 | P3: Advanced Operational Telemetry | Error payload traceId matches log traceId | Pending |

**Coverage:** 35 requirements total, 0 mapped to tasks, 35 unmapped ⚠️

---

## Success Criteria

- [ ] `GET /api/v1/products`, `GET /api/v1/clients`, and `GET /api/v1/clients/{id}/orders` return real PostgreSQL data with stable pagination metadata.
- [ ] `POST /api/v1/products` and `POST /api/v1/orders` enforce validation rules and persist data atomically.
- [ ] `http://localhost:8080/swagger-ui.html` and `http://localhost:8080/v3/api-docs` are accessible and document all M2 endpoints.
- [ ] `http://localhost:8080/actuator/health`, `http://localhost:8080/actuator/info`, and `http://localhost:8080/actuator/metrics/http.server.requests` are accessible.
- [ ] Repeated identical catalog queries show cache activity, and successful product creation invalidates stale catalog responses.
- [ ] `GET /api/v1/recommend/{clientId}` returns either live AI-ranked results or graceful fallback results without crashing the API service.
