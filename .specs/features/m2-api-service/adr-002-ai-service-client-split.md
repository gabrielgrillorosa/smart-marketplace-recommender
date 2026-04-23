# ADR-002: Split AiServiceClient from RecommendationService

**Status**: Accepted
**Date**: 2026-04-23

## Context

The recommendation proxy endpoint (`GET /api/v1/recommend/{clientId}`) must call the AI service via HTTP, handle circuit-breaker open/closed state, enforce I/O timeouts, and fall back to a domain query (top-selling products by country, excluding already-purchased items). An initial design combined all of this in a single `RecommendationClient` class. Two independent committee reviewers (Principal Architect and Staff Engineering) flagged this as an SRP violation: HTTP integration and domain fallback query are distinct responsibilities that change for different reasons.

## Decision

Separate into two beans:
- **`AiServiceClient`** — owns WebClient setup, request/response mapping, Resilience4j `@CircuitBreaker` declaration, and explicit I/O timeouts (`responseTimeout=3s`, `connectTimeout=1s`). Returns `Optional<List<RecommendationItem>>` — empty on any failure.
- **`RecommendationService`** — orchestrates the flow: validates clientId, calls `AiServiceClient`, falls back to `FallbackRecommendationQuery` (JPA-backed, cached) when the optional is empty, assembles the response with `degraded` flag.

## Alternatives considered

- **Single `RecommendationClient` class**: Mixes HTTP integration with domain fallback logic — violates SRP. Changing timeout configuration requires touching the same class as the fallback business rule. Rejected.
- **Resilience4j annotation on `RecommendationService` with self-invocation fallback**: Fatal at runtime — AOP proxy is bypassed when the fallback method is on the same bean instance. Disqualified in Phase 1.

## Consequences

- `AiServiceClient` is a pure I/O adapter — it can be mocked in integration tests without starting a real AI service.
- Timeout values (`ai.service.timeout.response`, `ai.service.timeout.connect`) are `@Value`-injected, configurable per environment via `application.properties` without code changes.
- `FallbackRecommendationQuery` (the JPA query backing the fallback) is cached per country code with a 1-minute TTL to avoid N+1 joins on every circuit-open request.
- Adding a second downstream AI provider in the future requires only a new implementation of the same `AiServiceClient` pattern — no `RecommendationService` changes.
