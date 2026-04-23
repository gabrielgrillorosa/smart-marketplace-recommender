# ADR-001: Layered Architecture with Explicit Application Services

**Status**: Accepted
**Date**: 2026-04-23

## Context

The `api-service` skeleton has no existing architecture beyond a single `ApiServiceApplication.java`. M2 must implement product catalog, client/order APIs, caching, a resilient recommendation proxy, and observability — all within a Spring Boot 3.3 monolith. Two credible approaches were evaluated: (A) annotation-mixed service beans where `@Cacheable`, `@Transactional`, and `@CircuitBreaker` all annotate the same service class, and (B) hexagonal ports+adapters with domain ports and infrastructure adapters. A third approach (C) — explicit Application Service classes with strict layer responsibilities — was also evaluated.

## Decision

Adopt a layered architecture with explicit Application Service classes (`ProductApplicationService`, `OrderApplicationService`, `RecommendationService`) that own business logic and orchestration, delegating to Spring Data JPA repositories for persistence and to dedicated infrastructure beans (`AiServiceClient`, `CatalogCacheManager`) for cross-cutting concerns.

## Alternatives considered

- **Annotation-mixed service beans (Node A)**: Resilience4j circuit breaker annotations on the same Spring bean as the fallback method bypass the AOP proxy via self-invocation — the fallback is never invoked. Fatal misconfiguration risk rated High severity.
- **Hexagonal ports+adapters (Node B)**: Introduces 8+ interface/adapter pairs with no evidence of a second adapter implementation anywhere in the project. Rule of Three violation; adds file overhead with zero runtime or testability benefit for a single-stack demo. Rejected on grounds of unnecessary abstraction.

## Consequences

- Application services are not interface-backed — JPA repositories are injected directly; testability is covered by Testcontainers in M6 rather than in-memory doubles.
- Package layout is mandated: `controller`, `service`, `repository`, `dto`, `entity`, `config`, `exception` to prevent controller-layer imports of JPA entities.
- Adding a second adapter in the future (e.g., MongoDB) would require extracting a repository interface at that point — acceptable deferred cost.
