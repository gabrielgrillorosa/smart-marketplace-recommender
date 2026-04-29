# ADR-049: Cart Country Compatibility at Cart Boundary

**Status**: Accepted
**Date**: 2026-04-28

## Context
The current codebase already treats `Order` as the only learning ground truth and validates product availability by country in `OrderApplicationService.createOrder()`, but `CartApplicationService.addItem()` still accepts any existing product. That leaves the main `Carrinho -> Checkout -> Pedido -> Treino` narrative in a contradictory state: the catalog can invite the evaluator to build a cart that the backend only rejects later at checkout. M15 needs the same country rule earlier in the flow without inventing a second source of truth.

## Decision
Enforce country compatibility at add-item time in `api-service` through a shared `ProductAvailabilityPolicy`, returning `422 ErrorResponse` for incompatible client/product pairs while continuing to reuse the same policy at checkout.

## Alternatives considered
- Rely only on frontend button disablement: rejected because stale data, manual requests, and proxy calls can bypass the UI and still need server enforcement.
- Keep validation only at checkout: rejected because the evaluator discovers the problem too late and the cart can hold semantically invalid state.
- Add a cart-specific integrity endpoint or enriched cart DTO: rejected because the current product dataset already exposes `availableCountries`, so the extra API surface is unnecessary for MVP scale.

## Consequences
- The backend remains the source of truth for semantic cart validity, and add-item / checkout messages stay aligned through one policy.
- A new cart-specific semantic exception is introduced, but it stays narrow in scope and reuses the existing `ErrorResponse` contract.
- The frontend can derive proactive CTA disablement from the same country data, but must still reconcile to backend responses on stale mismatches.
