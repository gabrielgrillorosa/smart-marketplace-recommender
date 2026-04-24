# ADR-007: Batch predict over serial predict for candidate pool

**Status**: Accepted
**Date**: 2026-04-23

## Context

`POST /api/v1/recommend` must score every product in the candidate pool (products available in client's country that the client has not purchased). The naive implementation calls `model.predict(tf.tensor2d([vector]))` once per candidate in a loop. With a typical candidate pool of 30–100 products and `@tensorflow/tfjs-node` running on CPU, a serial loop produces N blocking synchronous calls to the native TF backend, multiplying latency linearly. On a developer laptop with 8GB RAM, a 100-candidate serial loop can take 500ms–2s; a batched call takes ~20–50ms.

## Decision

`RecommendationService` collects all candidate product vectors before any tensor allocation, builds a single `tf.tensor2d(allVectors, [candidates.length, 768])`, and calls `model.predict(batchTensor)` once to obtain a column tensor of shape `[candidates.length, 1]`. The output tensor is converted to a flat `Float32Array` via `.dataSync()` inside a `tf.tidy()` block and then paired with candidate metadata by index.

## Alternatives considered

- **Serial `model.predict()` per candidate**: rejected — O(N) TF backend calls; blocks event loop for each call; latency unacceptable for pools >20 products.
- **Web Worker per candidate**: rejected — `@tensorflow/tfjs-node` uses native bindings that are not transferable across Worker threads without explicit setup; adds complexity beyond MVP scope.

## Consequences

- `RecommendationService` must filter out products without embeddings **before** building the batch tensor — no padding or masking required.
- Products without embeddings are logged as warnings and excluded from the result (per M4-26).
- The output tensor index must exactly correspond to the input candidate array index — no sorting between tensor construction and output parsing.
- `.dataSync()` is used (not `.data()`) because the synchronous TF execution in `tfjs-node` makes `.dataSync()` safe and simpler inside `tf.tidy()`.
