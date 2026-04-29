# ADR-045: Post-Checkout Capture via `currentVersion` Polling on `/model/status`

**Status**: Accepted
**Date**: 2026-04-28

## Context
The current frontend retrain flow is driven by `jobId` polling from `useRetrainJob`, which works for a manually triggered admin job but couples the UI to queue internals and loses state on full page reload. M13 needs a status mechanism that survives reloads, works for both checkout-triggered and manual retrains, and does not force `POST /carts/{clientId}/checkout` to leak ai-service job IDs into the public API contract.

## Decision
Expose `currentVersion`, `lastTrainingResult`, `lastTrainingTriggeredBy`, `lastOrderId`, and `lastDecision` in `GET /model/status`, then have the frontend persist a small awaiting-state subset and poll for `currentVersion` changes instead of polling by `jobId`.

## Alternatives considered
- Return `jobId` from checkout and poll `/model/train/status/{jobId}`: rejected because it couples checkout to ai-service queue internals and complicates reload recovery.
- Use SSE/WebSocket to push model-state updates: rejected because it adds transport complexity and extra infrastructure for an MVP/demo-scale workflow.
- Depend on timeout/manual refresh only: rejected because it is non-deterministic and too weak for the teaching/showcase narrative.

## Consequences
- Checkout stays clean and domain-focused: `{ orderId, expectedTrainingTriggered }`.
- The frontend can recover waiting state after reload by persisting `awaitingRetrainSince`, `lastObservedVersion`, and `awaitingForOrderId`.
- ai-service keeps freedom to queue checkout jobs internally because the UI watches the active model version, not a specific background job.
- Polling adds small network overhead, which is acceptable for the current dataset size and demo usage pattern.
