# ADR-008: tf.tidy() boundary — synchronous-only, async I/O outside

**Status**: Accepted
**Date**: 2026-04-23

## Context

`@tensorflow/tfjs-node` provides `tf.tidy(fn)` to automatically dispose all tensors allocated inside `fn` when `fn` returns. A common mistake is wrapping async functions in `tf.tidy()` — e.g., `await tf.tidy(async () => { ... })`. TF tracks tensor allocation synchronously via a stack; when an async function suspends at `await`, the `tidy()` stack frame has already popped and subsequent tensor allocations are not tracked. This produces silent memory leaks that accumulate over multiple `/recommend` calls and training runs (L-001 from STATE.md documents this exact pattern from `parte05`).

## Decision

All Neo4j queries, API Service HTTP calls, and any other async I/O are completed **before** entering `tf.tidy()`. The `tf.tidy()` block receives plain JavaScript arrays (not Promises) and performs only synchronous tensor construction, computation, and data extraction. The boundary is: **data collection is async, tensor math is sync inside `tidy()`**.

Pattern enforced in both `ModelTrainer` (training loop) and `RecommendationService` (predict path):
```
// CORRECT
const data = await collectAllData()          // async I/O — outside tidy
const result = tf.tidy(() => {
  const tensor = tf.tensor2d(data)           // sync — inside tidy
  const output = model.predict(tensor)       // sync — inside tidy
  return (output as tf.Tensor).dataSync()    // sync — inside tidy
})
// tensors from inside tidy() are disposed here

// WRONG — DO NOT DO
await tf.tidy(async () => {
  const data = await fetchFromNeo4j()        // async inside tidy = leak
})
```

## Alternatives considered

- **`tensor.dispose()` manual calls instead of `tf.tidy()`**: viable for simple cases but error-prone in branching code (early returns leave tensors alive). `tf.tidy()` is preferred for the predict path where multiple intermediate tensors exist.
- **`tf.engine().startScope()` / `tf.engine().endScope()`**: lower-level equivalent to `tidy()`, same sync-only constraint applies. No advantage for this use case.

## Consequences

- All Neo4j data fetching and API Service HTTP calls must be fully resolved before any `tf.tidy()` block.
- Training `model.fit()` is managed by TF internally and does not require a `tidy()` wrapper — only tensor construction before `fit()` (input/label tensors) requires `dispose()` after `fit()` completes.
- Code reviewers should flag any `await` inside a `tf.tidy()` call as a defect.
