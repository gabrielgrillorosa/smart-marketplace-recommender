# ADR-009: Vitest DI-first Mocking Strategy for AI Service Tests

**Status**: Accepted
**Date**: 2026-04-24

## Context

M6 requires integration tests for `/recommend`, `/rag/query`, and `/semantic` endpoints (M6-07..M6-13), plus a unit test for the score combination formula (M6-12). The AI Service follows a constructor-injection architecture established in ADR-003 (M3) and extended in M4 — `Neo4jRepository`, `EmbeddingService`, `ModelStore`, and `RecommendationService` are all instantiated in `src/index.ts` and injected via constructors into routes. The question was: should tests use `vi.mock()` (module-level path mocking) or construct mock instances manually and inject them via the existing DI wires.

`vi.mock()` works by intercepting the import path of a module. If the internal import paths change during refactors, mocks silently stop applying — the test keeps passing while exercising real code. This creates a fragile test suite that gives false confidence. Additionally, `vi.mock()` makes it impossible to test the same endpoint with different mock states (e.g., Neo4j available vs. unavailable) in separate test cases without complex `mockImplementation` chains.

## Decision

Use constructor-injection mocking: create mock objects that implement the same interface as the real dependencies (using Vitest's `vi.fn()` per method), instantiate a fresh Fastify server in each test file with those mocks injected, and fire requests against it with Fastify's `app.inject()`. No `vi.mock()` is used for the repository or service layers.

## Alternatives considered

- **`vi.mock()` path-based mocking (Node A)**: discarded because coupling to import paths makes tests fragile under refactors; module-level mocks cannot be varied between test cases without resetting the entire module cache; and it does not validate the constructor injection contract (ADR-003) that the design depends on.
- **`testcontainers-node` with real Neo4j (Node C)**: discarded because Neo4j Community image cold-start exceeds the `< 3 min` SLA in M6-07; testing M6-11 (Neo4j unavailable → 503) requires stopping a running container mid-test, which is flaky in CI; and `testcontainers-node` would be a new abstraction with a single call site (Rule of Three violation).

## Consequences

- Each test file creates a lightweight `buildApp(deps)` factory function that accepts injected dependencies and returns a configured Fastify instance — mirroring the production wiring in `src/index.ts`.
- Mock objects must implement the same TypeScript interface as the real class (`Neo4jRepository`, `ModelStore`, `RecommendationService`). Fixtures use the exact shape from `src/types/index.ts` to catch type drift.
- The `ModelNotTrainedError → 503` scenario (M6-11) is tested by injecting a `ModelStore` mock where `getModel()` returns `null`.
- Neo4j unavailability (M6-11) is tested by injecting a `Neo4jRepository` mock where the relevant method rejects with `new Neo4jUnavailableError()` — not `mockReturnValue(undefined)`.
- Float comparison in score combination tests (M6-12) uses `toBeCloseTo(expected, 5)` — not `toBe()` — to handle float64 imprecision.
