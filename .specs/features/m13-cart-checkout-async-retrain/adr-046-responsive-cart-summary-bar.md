# ADR-046: Responsive Cart Summary Bar Inside `CatalogPanel`

**Status**: Accepted
**Date**: 2026-04-28

## Context
M13 introduces a persistent cart and checkout flow in a frontend that currently centers its interaction model around the catalog grid and the analysis showcase. The cart CTA must remain visible while the evaluator browses products, but the global header is already occupied by client selection, service status, and the RAG entrypoint. A full modal drawer for every cart review would also add unnecessary focus-management and interaction overhead for the MVP.

## Decision
Render a dedicated `CartSummaryBar` inside `CatalogPanel`, using a sticky in-flow summary on `md+` screens and a sticky bottom action bar with a lightweight non-modal review sheet on `<md` screens.

## Alternatives considered
- Move the cart into the global header: rejected because it overloads the header and competes visually with client, status, and chat controls.
- Use a modal drawer/dialog for routine cart review: rejected because it introduces focus-trap complexity for a flow that only needs quick review and checkout.
- Keep the cart as a non-sticky inline section above the grid: rejected because the checkout CTA would disappear during long catalog scroll sessions.

## Consequences
- Checkout remains visible during browsing on both desktop and mobile.
- Mobile gets a thumb-reachable CTA without requiring the entire cart to be always open.
- The cart review surface can use `transform` / `opacity` transitions and `motion-reduce` fallbacks instead of layout-heavy animation.
- The design must document keyboard/disclosure behavior explicitly because the mobile review surface is non-modal rather than a full dialog.
