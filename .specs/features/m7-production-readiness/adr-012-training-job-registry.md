# ADR-012: TrainingJobRegistry for async train 202+polling pattern

**Status**: Accepted
**Date**: 2026-04-25

## Context

`POST /api/v1/model/train` was synchronous — it awaited `ModelTrainer.train()` and returned the result, blocking the HTTP connection for the full training duration (~9–60 s). Proxies and clients time out. The cron scheduler (GAP-01) cannot call this synchronously without blocking the Fastify event loop. A 202 Accepted + polling pattern was required (Comitê Achado #6). Two alternative designs were evaluated: (B) extending `ModelStore` with job scheduling, and (C) persisting job state in Redis. Both were eliminated in Phase 2 — B violates SRP + Rule of Three; C introduces an unwarranted external dependency.

## Decision

Introduce `TrainingJobRegistry` as a plain TypeScript class that maintains an in-memory `Map<jobId, TrainingJob>`. The registry is the sole entry point for enqueuing training jobs; it uses `setImmediate` to fire `ModelTrainer.train()` without blocking the HTTP response. `ModelStore` retains its existing single-model atomic-swap contract (ADR-006) unchanged.

## Alternatives considered

- **Node B — extend `ModelStore`**: eliminated because mixing job scheduling, job state, and model reference into one class violates SRP and Rule of Three; `ModelStore` had no prior scheduling responsibility.
- **Node C — Redis job store**: eliminated because Redis has zero prior art in the codebase (Rule of Three violation) and introduces a hard I/O dependency — polling endpoint returns 503 when Redis is unavailable.

## Consequences

- Job history is in-memory: a process restart loses in-flight and recent job status. Clients polling after a restart receive 404 and must retry with a new `POST /model/train`. Acceptable — cron creates a fresh job on the next scheduled run.
- History capped at 20 entries (`MAX_JOBS = 20`) to prevent unbounded memory growth.
- The `isTraining` guard is checked inside the `setImmediate` callback (not at enqueue time) to close the race window between cron timer fire and actual job start.
