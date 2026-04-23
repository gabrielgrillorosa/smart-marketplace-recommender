# ADR-003: Programmatic Caffeine Cache Configuration

**Status**: Accepted
**Date**: 2026-04-23

## Context

The spec requires a Caffeine in-memory cache on catalog list queries (TTL 5 min, cache key = page + size + category + country + supplier + search) and a short-TTL fallback cache for top-selling products by country (TTL 1 min). Spring's `@Cacheable` annotation is sufficient for single-cache setups, but the key generation strategy for a 6-dimensional cache key and the need for two distinct caches with different TTLs and metrics make annotation-driven configuration fragile and opaque. A `CacheManager` misconfiguration may silently fail — all reads miss and all writes go to the database with no visible error.

## Decision

Configure both Caffeine caches programmatically in a `CacheConfig` `@Configuration` class using `CaffeineCacheManager` with named cache registrations, explicit TTL via `Caffeine.newBuilder().expireAfterWrite(...)`, and `recordStats()` enabled for Micrometer integration. Use Spring's `@Cacheable(value="catalogList", key="#root.methodName + ':' + #page + ':' + #size + ':' + #category + ':' + #country + ':' + #supplier + ':' + #search")` SpEL expression as the key — deterministic and testable.

## Alternatives considered

- **`application.properties`-only Caffeine spec string**: `spring.cache.caffeine.spec=expireAfterWrite=5m,recordStats` — does not support multiple caches with different TTLs in a single property. Rejected.
- **`@EnableCaching` with default key generator**: Default key generator uses method arguments positionally — fragile if method signature changes. Rejected in favor of explicit SpEL keys.

## Consequences

- Cache names (`catalogList`, `fallbackRecommendations`) are constants in `CacheNames.java` — no magic strings scattered across services.
- `recordStats()` enables `cache.gets` and `cache.puts` metrics automatically exposed via Micrometer, satisfying M2-27 without manual instrumentation.
- `@CacheEvict(value="catalogList", allEntries=true)` on `createProduct` is safe — `allEntries=true` avoids partial eviction races by flushing all keys atomically on write.
- Two-cache design (5 min catalog + 1 min fallback) means cache invalidation on product create does not affect fallback recommendations unnecessarily.
