# ADR-048: Explicit Cart Snapshot Clearing

**Status**: Accepted  
**Date**: 2026-04-28

## Context

Today `AnalysisPanel` uses `captureCartAware(selectedClient.id, [])` when the cart becomes empty, and `analysisSlice` treats that call as a normal cart capture. This means the showcase cannot distinguish between two very different situations: `(a)` the user actually cleared the cart and the UI should return to the baseline `Com IA`, or `(b)` a non-empty cart produced an empty recommendation set. It also cannot represent the important M14 case where `Pos-Efetivar` already exists but the user starts and then clears a new cart session: the confirmed post-checkout snapshot should remain visible while `Com Carrinho` disappears.

## Decision

`analysisSlice` will model cart clearing as an explicit state transition via `clearCartAware(clientId)`, and the `postCheckout` state will allow `cart: Snapshot | null` so the current cart session can disappear without deleting the last confirmed `Pos-Efetivar`.

## Alternatives considered

- Keep overloading `captureCartAware([])`: rejected because it conflates "empty cart" with "empty result set" and keeps the state machine ambiguous.
- Normalize analysis state into a large generic object with many nullable fields: rejected because it weakens the existing discriminated-union predictability introduced in M11.
- Keep cart-clearing logic only in React component refs: rejected because it would be harder to test and would split source of truth between component memory and Zustand.

## Consequences

- The showcase can return cleanly to baseline when the cart is emptied, satisfying the M14 reactivity requirement.
- `Pos-Efetivar` remains stable across new cart sessions, which keeps the timeline legible after checkout.
- The store API becomes slightly wider (`clearCartAware`) and E2E expectations need to distinguish baseline reset from empty-state capture.
- Recommendation-delta rendering becomes more predictable because "no cart snapshot" is now a real state, not an empty list masquerading as a capture.

