# ADR-006: ModelStore atomic swap pattern

**Status**: Accepted
**Date**: 2026-04-23

## Context

M4 introduces a trained `tf.LayersModel` that lives in memory and is shared between `ModelTrainer` (write path: train) and `RecommendationService` (read path: predict). Node.js is single-threaded but async I/O means a `/recommend` request can be in-flight while `POST /api/v1/model/train` completes training and attempts to replace the model reference. If the replacement happens mid-inference — e.g., between reading `model` and calling `model.predict()` — the behavior is undefined and the request could operate on a partially-replaced object.

## Decision

`ModelStore` is the single source of truth for the trained model. `ModelTrainer` calls `modelStore.setModel(newModel)` only after training is **fully complete** (after `model.fit()` resolves and `model.save()` completes). `setModel()` is a single synchronous reference assignment — atomic in the Node.js event loop. `RecommendationService.recommend()` reads the model reference once at the start of the request and holds it for the duration of the call; subsequent `setModel()` calls do not affect in-flight requests (JavaScript closure semantics).

## Alternatives considered

- **Per-request mutex lock on `ModelStore`**: rejected — adds complexity and latency to every `/recommend` call with no benefit, because the reference assignment is already atomic in single-threaded JS.
- **Copy model weights on read**: rejected — deep-copying TF model weights is expensive and unnecessary given atomic assignment.
- **`ModelService` god class owning train + predict + status**: rejected in Phase 2 — concurrent train/predict race condition with no clean mitigation boundary; SRP violation.

## Consequences

- `ModelStore.setModel()` must never be called during training (only after `model.fit()` + `model.save()` complete) — enforced by `ModelTrainer` design.
- In-flight `/recommend` requests that hold old model reference will use the previous model for their duration, then the next request gets the new model. This is the intended behavior for zero-downtime model replacement.
- `ModelStore` must track training metadata (status, timestamps, metrics) separately from the model weights to avoid coupling status reads to tensor memory.
