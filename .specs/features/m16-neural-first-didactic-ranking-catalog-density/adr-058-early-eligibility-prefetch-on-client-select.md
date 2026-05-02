# ADR-058: Early Eligibility Pre-Fetch on Client Select

**Status**: Accepted (prefetch contract **amended** M18 — see § Amendment)  
**Date**: 2026-04-29

## Amendment (M18 — 2026-04-30)

Pre-fetch via `eligibilityOnly: true` still runs on client select, but the **HTTP body** matches AD-055: `no_embedding` / `in_cart` rows are omitted alongside full recommend. `RecentPurchasesPanel` was removed; suppression for **compra recente** appears in the catalog **footer** only after «Ordenar por IA». Pre-IA badges for `no_embedding` / `in_cart` are optional (cart still drives `in_cart` CTAs). See [M18 spec § Pré-fetch](../../m18-catalog-simplified-ad055/spec.md).

## Context

The winning Node A in the M16 design had one High severity finding: `RecentPurchasesPanel` would be empty and eligibility badges absent in `Modo Vitrine` until the user explicitly clicks "✨ Ordenar por IA" — because eligibility metadata arrives embedded in the recommendation response (ADR-055). This breaks NFD-15 (panel shows recent purchases immediately after client select) and NFD-13 (badges shown in vitrine mode).

The mitigation path identified in Phase 2 is a lightweight pre-fetch that retrieves eligibility metadata for the selected client immediately upon client selection, before the user triggers AI ordering. This pre-fetch runs in parallel with the existing cart fetch (`getCart`) to avoid added sequential latency.

## Decision

Add a `fetchEligibility(clientId)` call to `CatalogPanel` in the same `useEffect` block that fires on `selectedClient` change, parallel with `getCart`. The eligibility endpoint (`POST /api/proxy/recommend` with a `{ clientId, eligibilityOnly: true }` flag, or a dedicated `GET /api/proxy/eligibility/{clientId}`) returns the eligibility map without requiring a full ranking computation. The AI service computes eligibility (suppression window check) independently of the neural ranking pass.

The result is stored in `CatalogPanel` local state as `eligibilityMap: Map<string, EligibilityItem>` (no Zustand — this is transient, session-scoped, per-client data that does not need cross-panel visibility).

## Alternatives considered

- **Eligibility only from recommendation response (no pre-fetch)**: Disqualified by High severity finding — `Modo Vitrine` would show no suppression badges until AI is triggered, defeating NFD-13 and NFD-15.
- **Store eligibility in Zustand**: Disqualified by Rule of Three — eligibility data is consumed only by `CatalogPanel` and its children; no cross-panel consumer exists in the current roadmap. Local state is sufficient.
- **Dedicated `/eligibility` endpoint (separate from `/recommend`)**: Preferred long-term design; for MVP, the AI service can accept an `eligibilityOnly` flag on the existing recommend proxy route to skip the neural ranking pass and return only eligibility metadata. This avoids shipping a new API endpoint contract before the backend design phase.

## Consequences

*(Original M16; HTTP filtering and UI footer supersede parts of this list — see § Amendment.)*

- `CatalogPanel` keeps `prefetchEligibilityMap` local state (merged with full recommend results). M18: no `eligibilityLoading` UI; pre-fetch still runs in parallel with `getCart`.
- The `useEffect` on `selectedClient` fires `getCart` plus `eligibilityOnly` pre-fetch via the proxy.
- If pre-fetch fails, the map falls back to empty (`new Map()`) — graceful degradation.
- M18: suppression badges for **compra recente** appear after «Ordenar por IA» in the catalog footer; pre-IA badges for `no_embedding` / `in_cart` are optional when rows are omitted from HTTP (see § Amendment).
