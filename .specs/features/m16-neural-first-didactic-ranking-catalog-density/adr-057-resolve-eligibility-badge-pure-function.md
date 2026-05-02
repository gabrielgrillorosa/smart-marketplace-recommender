# ADR-057: resolveEligibilityBadge Pure Function for Badge Precedence

**Status**: Accepted
**Date**: 2026-04-29

## Context

M16 introduces multiple eligibility reasons that can apply simultaneously to the same product card: `in_cart`, `recently_purchased`, `no_country`, `no_embedding`, and the existing `demo` (legacy). The spec (NFD-08) mandates a deterministic primary reason with optional secondary reasons. Without an explicit precedence rule, different render paths can produce inconsistent badge choices for the same product, breaking the "no ambiguity" promise of the didactic UX.

The QA Staff persona flagged that this precedence logic is untestable if it lives inline inside `ProductCard` or `renderItem`. The Principal Architect noted that badge display is a pure function of eligibility data — no side effects, no I/O — making it a natural candidate for a testable utility.

## Decision

Implement `resolveEligibilityBadge(productId, eligibilityMap, cartProductIds): EligibilityBadge | null` as a pure function in `frontend/lib/catalog/eligibility.ts`. Precedence order (highest wins):

1. `in_cart` — product is in the active cart (controlled by the user, most actionable)
2. `recently_purchased` — suppressed by purchase window (didactic focus of M16)
3. `no_country` — ineligible by country mismatch (deterministic operational rule)
4. `no_embedding` — ineligible because no vector exists yet (infrastructure state)
5. `eligible` (null return — no badge needed)

The function returns `{ label: string, variant: BadgeVariant, suppressionUntil?: string }` or `null` for eligible products.

## Alternatives considered

- **Inline badge selection in `ProductCard`**: Disqualified by testability — `ProductCard` is a render function; the precedence logic would require mounting the component to test badge selection.
- **Precedence defined in the AI service response**: Disqualified because `in_cart` is frontend state, not known to the backend; a full server-side precedence would require the server to know cart state per client.

## Consequences

- `resolveEligibilityBadge` is a unit-testable pure function covering all precedence combinations.
- `CatalogPanel.renderItem` calls `resolveEligibilityBadge` and passes the result as an `eligibilityBadge` prop to `ProductCard`.
- `ProductCard` receives `eligibilityBadge?: EligibilityBadge | null` as a new optional prop alongside the existing `scoreBadge`; the two are mutually exclusive — when `eligibilityBadge` is present, `scoreBadge` is suppressed (enforcing NFD-18).
- The precedence order is documented here and must not be changed without a new ADR.
