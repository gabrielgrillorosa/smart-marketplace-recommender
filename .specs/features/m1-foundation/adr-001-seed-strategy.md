# ADR-001: Seed Strategy — Direct Drivers, Sequential, with Cross-Count Verification

**Status:** Accepted
**Date:** 2026-04-23

## Context

M1 requires populating two heterogeneous databases (PostgreSQL and Neo4j) with consistent synthetic data. Three approaches were evaluated during the Design Complex phase. The key tension: data must be consistent across both stores (same UUIDs, same counts), the seed must be idempotent, and it must not depend on the api-service being healthy at seed time (which would create a circular startup dependency).

## Decision

Implement a single TypeScript seed script that connects directly to PostgreSQL via the `pg` driver and to Neo4j via the Bolt protocol driver (`neo4j-driver`), populating both databases **sequentially** (PostgreSQL first, Neo4j second), using `UNWIND` batch `MERGE` for Neo4j operations, and verifying cross-database count consistency at the end before exiting.

## Alternatives considered

- **Node B — psql + neo4j-admin import as Docker init containers:** Disqualified because `neo4j-admin import` requires Neo4j to be stopped during import — incompatible with Neo4j Community Edition in runtime mode and with live health checks. Additionally, no mechanism for cross-database consistency verification.
- **Node C — parallel Promise.all per entity type:** Disqualified because parallel writes to two independent stores with UUIDs generated in the seed script create a race condition risk: if any transformation or retry occurs, IDs may diverge between stores. Also risks saturating Neo4j Community Edition Bolt connection pool.

## Consequences

- **Accepted trade-off:** Seed script bypasses the `api-service` REST layer and writes directly to PostgreSQL. This creates two write paths for Product/Client/Order entities. Mitigated by: (a) seed is a bootstrap-only operation, clearly documented as such; (b) api-service is the only write path after initial seed.
- **Performance:** `UNWIND` batch MERGE in Neo4j reduces individual Cypher round-trips from O(n) to O(1) per entity type — critical for 500+ relationship operations.
- **Correctness guarantee:** Cross-count verification at the end (`SELECT COUNT(*) FROM products` vs `MATCH (p:Product) RETURN count(p)`) ensures M1-20 is mechanically enforced, not just documented.
- **Remaining risk:** Bolt healthcheck in docker-compose must use `cypher-shell`, not HTTP, to guarantee Neo4j is ready to accept Bolt connections before seed starts (see ADR-002).
