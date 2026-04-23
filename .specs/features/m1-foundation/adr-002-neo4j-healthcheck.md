# ADR-002: Neo4j Health Check via cypher-shell (not HTTP)

**Status:** Accepted
**Date:** 2026-04-23

## Context

Docker Compose `depends_on: condition: service_healthy` requires a reliable health check that accurately reflects when Neo4j is ready to accept the protocol used by the application. Neo4j exposes both an HTTP API (port 7474) and a Bolt protocol endpoint (port 7687). The application and seed script use Bolt exclusively — via `neo4j-driver` (seed) and `@langchain/community` Neo4jVectorStore (ai-service in M3).

The critical failure mode: Neo4j's HTTP interface becomes available before the Bolt listener is fully initialized. If the health check tests HTTP, dependent services (`ai-service`, seed script) start and immediately fail with `ServiceUnavailable: Connection refused` on Bolt — a difficult-to-diagnose race condition.

## Decision

Use `cypher-shell` inside the Neo4j container as the health check command: `cypher-shell -u neo4j -p $$NEO4J_PASSWORD "RETURN 1"`. This tests the Bolt protocol directly and only returns healthy when Neo4j can actually execute a query.

## Alternatives considered

- **HTTP GET on port 7474:** Disqualified because HTTP may respond before Bolt is ready, creating a race condition between health check passing and actual Bolt availability. Observed in Neo4j 5.x startup sequence.
- **TCP check on port 7687:** Disqualified because TCP connectivity does not guarantee Neo4j has completed initialization and can execute queries — port may accept connections during startup without processing them.

## Consequences

- **Accepted trade-off:** `cypher-shell` must be available inside the Neo4j container image — it is, as it ships with the official `neo4j:5` Docker image. No additional tooling required.
- **Startup time:** `cypher-shell` health check adds ~1–2 seconds per check versus HTTP, but prevents false positives that cause downstream failures.
- **compose configuration:** `NEO4J_PASSWORD` environment variable must be available at health check time — guaranteed since it is set in the same service definition.
