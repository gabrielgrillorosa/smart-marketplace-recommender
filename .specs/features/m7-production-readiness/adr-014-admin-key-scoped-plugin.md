# ADR-014: Admin key validation via scoped Fastify plugin hook

**Status**: Accepted
**Date**: 2026-04-25

## Context

M7 requires that `POST /model/train` and `POST /embeddings/generate` reject requests without a valid `X-Admin-Key` header (M7-24..M7-29), while `POST /embeddings/sync-product` — an internal endpoint called by api-service — must NOT require the key. Implementing validation inline in each route handler violates OCP: every new admin endpoint would require adding the same check. A blanket `fastify.addHook('onRequest', ...)` at the top level would catch `sync-product` too, requiring a whitelist that grows with every new internal endpoint.

## Decision

Wrap the two protected routes (`POST /model/train`, `POST /embeddings/generate`) in a dedicated Fastify plugin (`adminRoutes`) registered with its own `fastify.register()` scope. A single `fastify.addHook('onRequest', adminKeyHook)` is registered inside this plugin — it applies only to routes within the plugin's encapsulated scope. `POST /embeddings/sync-product` stays outside the plugin. `ADMIN_API_KEY` absence at startup logs a warning and causes the hook to reject all requests with 401.

## Alternatives considered

- **Inline validation per route**: eliminated — violates OCP; duplication risk as admin endpoints grow.
- **Blanket top-level hook + whitelist**: eliminated — whitelist grows with every internal endpoint; logic is inverted (deny-by-default with explicit allow is harder to reason about than allow-by-default with explicit deny).

## Consequences

- Adding a new admin endpoint requires only registering it inside `adminRoutes` — zero changes to the hook.
- Adding a new internal endpoint requires only registering it outside `adminRoutes` — zero changes to the hook.
- `ADMIN_API_KEY` env var documented in `.env.example`; absence triggers startup warning (M7-28).
- Fastify plugin encapsulation guarantees the hook is never applied outside the plugin's scope (verified by the QA regression test: `POST /embeddings/sync-product` without key must return non-401).
