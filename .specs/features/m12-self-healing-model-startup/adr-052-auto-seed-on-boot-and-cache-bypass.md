# ADR-052: AutoSeedService on Boot + Cache-Control Bypass for Training Reads

**Status:** Accepted  
**Date:** 2026-04-28  
**Milestone:** M12 (post-M12 production hardening — delivered outside planned milestone scope)

---

## Context

After M12 delivered the self-healing model startup (`StartupRecoveryService`), the system still had
a critical cold-start failure mode when the Docker volumes were empty (`docker compose down -v`):

1. **Empty databases on first boot.** `api-service` and `ai-service` connected to a PostgreSQL and
   Neo4j with zero rows. `StartupRecoveryService` probed for training data, found none, and set the
   service to `blocked/no-training-data` — never reaching `/ready = 200`.

2. **Cache poisoning by race condition.** Even after the seed script was run manually, there was a
   window where `api-service` became healthy and began serving `/api/v1/products` *before* the seed
   data was present. Any request hitting the endpoint during this window caused Caffeine (5-min TTL)
   to cache an empty result set. Subsequent calls from `ModelTrainer` during boot recovery received
   the cached empty response, starving the training pipeline.

The existing `seed.ts` CLI was not wired to the boot lifecycle — it had to be run manually after
`docker compose up`. The goal is a fully self-sufficient system that reaches `/ready = 200` from a
completely clean environment without any manual intervention.

---

## Decision

### Part A — AutoSeedService (boot-time idempotent seed)

Add `AutoSeedService` to the `ai-service` boot sequence. It runs *before*
`listenAndScheduleRecovery`, following this contract:

```
if AUTO_SEED_ON_BOOT=true (default):
    if isAlreadySeeded(pool, driver):   ← both PG + Neo4j must have > 0 products
        log "Skipping — data already present"
    else:
        runSeed({ pool, driver })        ← full seed: PG + Neo4j + cross-count verification
```

**Idempotency is guaranteed at the database level:**
- PostgreSQL: `INSERT ... ON CONFLICT DO NOTHING`
- Neo4j: `UNWIND … MERGE (n:Label {id: $id}) SET n += $props`

**Isolation:** `AutoSeedService` creates its own short-lived `Pool` and `Driver` via injected
factory functions — it does not share connections with the runtime application layer. Both are
closed in a `finally` block after the seed completes (or is skipped).

**CLI entry point preserved:** `seed.ts`'s `main()` function is guarded by `require.main === module`
so the file can be imported without triggering execution. Useful for manual seeding and testing.

### Part B — Cache-Control bypass (cold-start cache poisoning fix)

`ModelTrainer.fetchTrainingData()` now sends `Cache-Control: no-cache` on all HTTP requests to
`api-service`. The `api-service` side wires this into the `@Cacheable` condition:

```
ProductController.listProducts(... cacheControl: String)
  → isCacheBypass(cacheControl)          // true when "no-cache" or "no-store" present
  → ProductApplicationService.listProducts(..., noCache: boolean)
     @Cacheable(condition = "!#noCache") // cache bypassed for internal training reads
```

The public catalog path (`noCache=false`) benefits from full caching — even empty results cached
normally and expire on the 5-min TTL. Internal training reads (`noCache=true`) always hit
PostgreSQL directly and are never stored in Caffeine.

---

## Alternatives considered

### A1 — Add `AUTO_SEED_ON_BOOT` to `api-service` instead of `ai-service`

Rejected at this time. The seed script uses the `neo4j-driver` Bolt API directly (a deliberate
choice from ADR-001 to avoid seeding Neo4j through a REST intermediary). The `api-service` does not
have a `neo4j-driver` dependency and adding one would violate the bounded context boundary. See
ADR-053 for the migration roadmap.

### A2 — Docker init container for seeding

Rejected because: (a) it requires a separate image or entrypoint composition; (b) health-check
ordering would need to be replicated for both PG and Neo4j; (c) `isAlreadySeeded` check would need
to run in the container anyway. The `AutoSeedService` achieves the same outcome with zero
infrastructure changes.

### B1 — Add `unless = "#result.totalItems() == 0"` to `@Cacheable`

Considered as a first-pass fix. Rejected because it prevents caching of genuinely empty filtered
queries (e.g., `?country=XY&category=snacks` returning 0 results), causing unnecessary database
hits in production for valid but empty result combinations. The `Cache-Control: no-cache` approach
correctly separates *caller intent* from *result content*.

### B2 — Dedicated internal endpoint (`/api/v1/seed/products`) for training reads

Considered. Rejected because: (a) it creates a maintenance burden as a parallel route; (b) the
`Cache-Control` header is an HTTP-standard mechanism for exactly this use case; (c) the existing
`ProductApplicationService` contract is extended minimally without duplication.

---

## Consequences

### Positive

- **Zero-touch cold start:** `docker compose up` on an empty environment reaches `/ready = 200`
  fully automatically, without manual seed runs.
- **Idempotent and safe:** Running the seed multiple times (reboots, crash-loops) is harmless.
- **Cache poisoning eliminated:** Training reads are always authoritative, regardless of what is
  in the Caffeine cache.
- **Testable isolation:** `AutoSeedService` receives `poolFactory` and `driverFactory` via
  constructor — mockable in Vitest without module patching.
- **No regression on public API:** Caching behavior for the catalog path is unchanged.

### Negative / trade-offs

- **ai-service owns seed responsibility.** The `seed.ts` file — which writes to PostgreSQL — lives
  in the `ai-service` codebase and bypasses the `api-service` REST layer. This is the same
  trade-off accepted in ADR-001, now extended to the runtime boot path. ADR-053 tracks the
  migration to move this responsibility to `api-service`.
- **`AUTO_SEED_ON_BOOT` default = `true`.** Operators must explicitly set
  `AUTO_SEED_ON_BOOT=false` in environments where the database is pre-populated externally (CI,
  staging with restored dumps). This is documented in `.env.example`.
- **Longer cold-start time.** An empty environment now takes ~5s longer to reach the embedding
  load step. This is acceptable for a development/demo system.

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTO_SEED_ON_BOOT` | `true` | Enable/disable automatic seeding at `ai-service` startup |
| `POSTGRES_HOST` | `localhost` | PostgreSQL host (set to `postgres` in Docker Compose) |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `marketplace` | PostgreSQL database name |
| `POSTGRES_USER` | `postgres` | PostgreSQL username |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL password |

---

## Files changed

| File | Change |
|------|--------|
| `ai-service/src/seed/seed.ts` | Extracted `runSeed()`, `isAlreadySeeded()`, `SeedVerificationError`, `SeedLogger` interface; `main()` preserved behind `require.main` guard |
| `ai-service/src/services/AutoSeedService.ts` | New file — boot-time orchestrator |
| `ai-service/src/config/env.ts` | Added `AUTO_SEED_ON_BOOT` + `POSTGRES_*` vars; `parseBooleanFlag` generic helper |
| `ai-service/src/index.ts` | Wired `AutoSeedService.runIfNeeded()` before `listenAndScheduleRecovery` |
| `ai-service/src/services/ModelTrainer.ts` | `TRAINING_HEADERS = { 'Cache-Control': 'no-cache' }` on all fetch calls |
| `api-service/.../ProductApplicationService.java` | `listProducts` gains `boolean noCache`; `@Cacheable(condition = "!#noCache")` |
| `api-service/.../ProductController.java` | Reads `Cache-Control` header; `isCacheBypass()` parses `no-cache`/`no-store` directives |
| `api-service/.../ProductApplicationServiceTest.java` | Updated calls to pass `false` for `noCache` |
| `api-service/.../ProductControllerCacheBypassTest.java` | New — unit tests for header parsing and cache bypass forwarding |
| `docker-compose.yml` | `POSTGRES_*` + `AUTO_SEED_ON_BOOT` added to `ai-service`; `postgres: service_healthy` added to `ai-service depends_on` |
| `.env` | `AUTO_SEED_ON_BOOT=true` added with comment |

---

## See also

- [ADR-001](../m1-foundation/adr-001-seed-strategy.md) — Original seed strategy (direct drivers, sequential)
- [ADR-033](./adr-033-self-healing-model-startup.md) — StartupRecoveryService (M12)
- [ADR-053](./adr-053-tech-debt-migrate-seed-to-api-service.md) — Tech debt: migrate seed to `api-service`
- [docs/diagrams/cold-start-boot-flow.md](../../../docs/diagrams/cold-start-boot-flow.md) — Full boot sequence diagram
