# ADR-043: Cart/Checkout with `Order` as Ground Truth and AI Sync After Commit

**Status**: Accepted
**Date**: 2026-04-28

## Context
M13 replaces the legacy `Demo Comprar -> BOUGHT {is_demo: true} -> manual retrain` path with a real purchase lifecycle. The current codebase already has authoritative order validation/persistence in `OrderApplicationService` and a best-effort async integration pattern in `AiSyncClient`, but it does not have cart persistence and it does not guarantee that ai-service is notified only after the checkout transaction commits. If the ai-service is triggered before commit, retraining can race the newly created order and miss the very event that should teach the model.

## Decision
Persist the cart in `api-service`/PostgreSQL, compose checkout on top of `OrderApplicationService.createOrder()`, and notify ai-service through a new internal `sync-and-train` route only in `afterCommit`.

## Alternatives considered
- Keep the cart/demo signal in Neo4j and continue the manual retrain path: rejected because it preserves the intent-vs-ground-truth coupling that M13 is explicitly removing.
- Trigger ai-service while the checkout transaction is still open: rejected because `ModelTrainer.fetchTrainingData()` could observe the system before the new order is committed.
- Introduce an outbox/event-bus architecture for M13: rejected because it improves durability but adds infrastructure and coordination patterns that do not fit the current MVP codebase.

## Consequences
- Reuses the existing order-validation rules and ADR-015 fire-and-forget integration style instead of cloning business rules.
- Requires new cart entities/repositories/controllers in `api-service`.
- Keeps checkout success independent from ai-service availability; if the internal sync fails, the order is still committed and visible.
- Legacy `is_demo` edges remain in Neo4j for historical/debug reasons, but M13 must ignore them in training and confirmed-history recommendation queries.
