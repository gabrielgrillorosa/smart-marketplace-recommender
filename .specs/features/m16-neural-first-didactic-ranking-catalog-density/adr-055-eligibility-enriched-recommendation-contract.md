# ADR-055: Eligibility-Enriched Recommendation Contract (MVP Merged Response)

**Status**: Accepted (HTTP payload **amended** M18 — see § Amendment)  
**Date**: 2026-04-29

## Amendment (M18 / AD-055 — 2026-04-30)

The merged **internal** recommendation list is unchanged. **HTTP responses** to the browser now apply `filterRecommendationsForClientHttp`: rows with `eligible === false` and `eligibilityReason` ∈ {`no_embedding`, `in_cart`} are **omitted**; `recently_purchased` rows remain with full metadata. `eligibilityOnly` uses the same filter. See [.specs/features/m18-catalog-simplified-ad055/spec.md](../../m18-catalog-simplified-ad055/spec.md) and [tasks.md](../../m18-catalog-simplified-ad055/tasks.md).

## Context

M16 requires the frontend to distinguish `eligible` ranked items from `suppressed` items (recently purchased, outside country, no embedding, etc.) and display per-product eligibility metadata including `reason` and `suppressionUntil`. The canonical tension is whether to deliver ranking data and eligibility metadata via the same HTTP response or via separate endpoints.

A split endpoint (`GET /recommend` for ranking + `GET /recommend/eligibility` for suppression metadata) would cleanly separate concerns at the API boundary but introduces a race condition risk when both calls are in-flight simultaneously and data can diverge if a model retrain happens between the two requests. For a showcase MVP with 85–125 SKUs and a single-user session, the marginal benefit of separation does not justify the added complexity.

## Decision

Embed eligibility metadata (`eligible: boolean`, `reason: string`, `suppressionUntil: string | null`) directly into each item of the `POST /recommend` response alongside the existing `finalScore`, `neuralScore`, and `semanticScore` fields. Ineligible items are included in the response payload with `eligible: false`; they are excluded from the ranked portion but present for badge rendering.

## Alternatives considered

- **Split endpoint `GET /recommend/eligibility`**: Disqualified by race condition risk (ranking and eligibility can diverge between calls) and double HTTP overhead per client-switch.
- **Frontend-only derivation from order history**: Disqualified because `suppressionUntil` depends on `RECENT_PURCHASE_WINDOW_DAYS` server config not exposed to the frontend, making the computation inaccurate without server input.

## Consequences

- `adaptRecommendations()` in `frontend/lib/adapters/recommend.ts` must be extended to handle the new optional fields defensively (null-safe) — backward compatible with older AI service responses.
- The merged response is a conscious MVP trade-off. When the project evolves toward a split ranking/filtering architecture, the eligibility contract should be extracted to a dedicated endpoint and this ADR should be superseded.
- Suppressed items appear in the response, so `CatalogPanel.renderItem` must check `eligibilityMap.get(id)?.eligible !== false` before passing `scoreBadge` to `ProductCard` (non-negotiable committee finding).
