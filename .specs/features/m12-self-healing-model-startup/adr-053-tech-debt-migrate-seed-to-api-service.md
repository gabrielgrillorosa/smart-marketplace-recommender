# ADR-053: Tech Debt — Migrate Seed Responsibility to `api-service`

**Status:** Proposed (tech debt — not yet planned)  
**Date:** 2026-04-28  
**Type:** Technical Debt / Migration Roadmap  
**Milestone:** Post-M15 (candidate for M16 or standalone spike)

---

## Context

Since M1, the seed script (`seed.ts`) lives inside `ai-service` and writes directly to two
databases: PostgreSQL via `pg` driver and Neo4j via `neo4j-driver` Bolt protocol. This was a
deliberate choice (ADR-001) to avoid bootstrapping `api-service` before the databases were ready.

ADR-052 extended this pattern further: `AutoSeedService` now runs at `ai-service` boot time and
owns the write path to PostgreSQL for the initial data load, bypassing `api-service` entirely.

This creates two architectural tensions that grow over time:

### Tension 1 — Two write paths to PostgreSQL

`api-service` is the designated owner of the `products`, `clients`, `orders`, `suppliers`, and
`countries` tables. It has the domain model, validation rules, JPA mappings, and DTOs for these
entities. `seed.ts` bypasses all of that and writes raw SQL directly. This means:

- Validation added to `ProductApplicationService.createProduct()` does not apply to seeded data.
- Foreign key constraints and index coverage must be replicated in two places.
- Schema migrations applied via `api-service` (Flyway/Liquibase) are not automatically consistent
  with what `seed.ts` expects.

### Tension 2 — `ai-service` owns operational concerns outside its bounded context

`ai-service`'s core responsibility is recommendation, embedding, and model training. Owning the
initial data population for PostgreSQL (a relational catalog store owned by `api-service`) is
outside this boundary. It also forces `ai-service` to depend on `pg` as a direct database client —
a dependency that should only belong to `api-service`.

### Why this is deferred, not fixed immediately

The current system works correctly. The seed data is synthetic and static. Fixing this correctly
requires:
1. A dedicated `POST /api/v1/seed` (or idempotent bulk import) endpoint in `api-service`.
2. An equivalent mechanism for Neo4j seeding that doesn't depend on `ai-service`'s Bolt connection.
3. Careful ordering of the seed operations (PG entities must exist before Neo4j references them).
4. Integration test coverage for the migration path.

This is a 3–5 day spike, not a quick fix. Deferring to post-M15 is appropriate.

---

## Decision

Document this as a tracked technical debt item. No code changes in this ADR.

The migration will follow the roadmap below when scheduled.

---

## Migration Roadmap

### Phase 1 — `api-service` seed endpoint

**Goal:** `api-service` exposes a single idempotent endpoint for bulk seed import.

```
POST /api/v1/admin/seed
X-Admin-Key: $ADMIN_API_KEY

Body: optional — if omitted, seeds the default synthetic dataset
      if provided, accepts { products[], clients[], orders[] } (custom fixture)

Response:
  201 Created — seed applied (cold start)
  200 OK      — seed skipped (data already present, idempotency enforced)
  409 Conflict — seed in progress (concurrent request guard)
```

**Implementation details:**
- `SeedApplicationService` in `api-service` owns the business logic.
- Uses the same `ProductRepository`, `ClientRepository`, `OrderRepository` as the normal API.
- Enforces `ON CONFLICT DO NOTHING` semantics at service level (not raw SQL).
- Emits a `SeedCompletedEvent` (Spring `ApplicationEventPublisher`) after PostgreSQL write.
- Existing `api-service` unit tests cover the seed service; Testcontainers for integration.

### Phase 2 — Neo4j seed triggered by `api-service` event

**Goal:** When `api-service` seed completes, Neo4j is populated automatically without `ai-service`
owning the Bolt write path.

**Option A (recommended):** `api-service` calls `ai-service` for each seeded product via the
existing `POST /api/v1/embeddings/sync-product` endpoint (ADR-015 fire-and-forget pattern). This
already creates the Neo4j node, relationships, and embedding. Bulk seed just calls it N times with
virtual threads — same mechanism as `POST /api/v1/products` today.

**Option B (future):** `api-service` publishes a `ProductBulkCreated` event to an in-process or
out-of-process queue; `ai-service` consumes and syncs. Requires additional event bus infrastructure
— overkill for current scale.

Option A is preferred because it reuses existing infrastructure with zero new components.

### Phase 3 — Remove seed from `ai-service`

After Phase 1 + Phase 2 are validated:

1. Delete `ai-service/src/seed/` directory.
2. Delete `ai-service/src/services/AutoSeedService.ts`.
3. Remove `POSTGRES_*` env vars from `ai-service` config and `docker-compose.yml`.
4. Remove `pg` from `ai-service` production dependencies.
5. Update `ai-service/src/index.ts` — remove `autoSeedService.runIfNeeded()`.
6. Replace with: on boot, `ai-service` calls `POST /api/v1/admin/seed` on `api-service` if
   `AUTO_SEED_ON_BOOT=true`, then waits for `/actuator/health` to confirm `api-service` is ready.

### Phase 4 — Unified cold-start orchestration

After Phase 3, the boot sequence becomes:

```
postgres healthy
  → api-service starts
      → POST /api/v1/admin/seed (if AUTO_SEED_ON_BOOT=true)
          → SeedApplicationService.seedIfEmpty()
              → for each product: notifyProductCreated → ai-service sync-product
neo4j healthy + api-service healthy
  → ai-service starts
      → (AutoSeedService removed — data seeded by api-service)
      → StartupRecoveryService: embeddings, training
      → /ready = 200
```

---

## Effort estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1 — `api-service` seed endpoint | 1.5 days | Low — uses existing patterns |
| Phase 2 — Neo4j via sync-product calls | 1 day | Low — reuses ADR-015 |
| Phase 3 — Remove seed from `ai-service` | 0.5 days | Low — deletion + config cleanup |
| Phase 4 — Integration test + E2E validation | 1 day | Medium — cold-start timing |
| **Total** | **~4 days** | |

---

## Acceptance criteria (when done)

- [ ] `ai-service` has no `pg` direct dependency in `package.json`.
- [ ] `ai-service/src/seed/` directory does not exist.
- [ ] `docker compose up` on empty volumes reaches `/ready = 200` automatically (same UX as today).
- [ ] `POST /api/v1/admin/seed` returns `200 OK` (skip) on second call — idempotency confirmed.
- [ ] `api-service` unit tests cover `SeedApplicationService.seedIfEmpty()`.
- [ ] Testcontainers integration test validates full seed → query round-trip in `api-service`.
- [ ] E2E cold-start test in CI: `docker compose down -v && docker compose up -d && wait /ready`.

---

## Dependencies

- ADR-052 (current state — AutoSeedService in `ai-service`) is the baseline being migrated.
- ADR-015 (`AiSyncClient` Virtual Thread fire-and-forget) is reused in Phase 2.
- No new infrastructure dependencies required (no message queue, no new databases).

---

## See also

- [ADR-001](../m1-foundation/adr-001-seed-strategy.md) — Original seed strategy
- [ADR-015](../m7-production-readiness/adr-015-ai-sync-client-fire-and-forget.md) — Virtual Thread product sync
- [ADR-052](./adr-052-auto-seed-on-boot-and-cache-bypass.md) — Current AutoSeedService implementation (state being migrated away from)
