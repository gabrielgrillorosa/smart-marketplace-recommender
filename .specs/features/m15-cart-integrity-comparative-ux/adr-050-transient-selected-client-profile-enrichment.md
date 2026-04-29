# ADR-050: Transient Selected-Client Profile Enrichment

**Status**: Accepted
**Date**: 2026-04-28

## Context
`ClientSelectorDropdown` currently persists a lightweight `selectedClient` object in Zustand and fills profile-only fields with placeholders such as `totalOrders: 0` and `recentProducts: []`. M15 needs real `purchaseSummary`, `lastOrderAt`, `totalSpent`, and recent products, but enriching the persisted selection object directly would couple transient loading/error/request state to hydration and make fast client switches vulnerable to stale overwrites. The card needs richer data without turning `selectedClient` into a second async cache layer.

## Decision
Keep `selectedClient` as a lightweight persisted identity/segment/country selection object and layer profile enrichment through a transient hook/view model that fetches client detail and order history in parallel.

## Alternatives considered
- Mutate and persist the enriched `selectedClient` object directly: rejected because stale loading/error data could survive reloads and bleed into unrelated flows.
- Add a new global store slice for client profile network state: rejected because the concern is local to the analysis card and does not justify new cross-app state coupling.
- Expand the list-clients endpoint to include recent products and purchase summary: rejected because it increases payload and backend coupling even though the required detail endpoints already exist.

## Consequences
- The profile card gets accurate data, explicit loading, and partial-failure states without changing how catalog/cart logic reads the selected client.
- Fast client changes remain safe because the enrichment lifecycle is request-scoped and disposable.
- Reloaded sessions briefly refetch profile details instead of hydrating stale placeholder or error state, which is preferable for correctness.
