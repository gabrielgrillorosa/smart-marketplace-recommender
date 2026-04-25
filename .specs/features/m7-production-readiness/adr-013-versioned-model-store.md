# ADR-013: VersionedModelStore — SRP extension for model versioning

**Status**: Accepted
**Date**: 2026-04-25

## Context

M7 requires saving each trained model with a timestamp filename, maintaining a `current` symlink pointing to the best model by `precisionAt5`, and exposing a history of the last 5 models. Merging this responsibility into the existing `ModelStore` would add a third change axis (file I/O and version history) to a class already managing two (in-memory model reference + training status metadata), violating SRP and breaking the proven atomic-swap contract (ADR-006).

## Decision

Introduce `VersionedModelStore` as a subclass of `ModelStore`. It adds three methods: `saveVersioned(model, metadata)` — saves model file with ISO timestamp, updates `current` symlink if `precisionAt5` improves, prunes files beyond the 5 most recent, and calls `super.setModel()`; `getHistory()` — reads `/tmp/model/` directory and returns the last 5 model entries sorted by mtime; `loadCurrent()` — resolves the `current` symlink on startup, falls back to most-recent file if symlink absent. All filesystem operations use `node:fs/promises` (async) via an injected `FsPort` interface to enable Vitest unit testing via `vi.fn()` mocks.

## Alternatives considered

- **Extend `ModelStore` inline**: eliminated — adds file I/O and history management to a class whose only prior responsibility was in-memory atomic swap. Committee flagged as High severity SRP violation.
- **Standalone `ModelVersioner` utility**: considered but subclass is preferred — `VersionedModelStore` IS-A `ModelStore` (injection points in `index.ts` require no change) and inherits the status API; a standalone utility would require additional wiring.

## Consequences

- `FsPort` interface (`symlink`, `unlink`, `readdir`, `stat`, `mkdir`) is injected via constructor; production uses `node:fs/promises`; tests use `vi.fn()`.
- `saveVersioned()` only promotes `current` when `precisionAt5` of new model ≥ current; falls back to `loss` comparison when `precisionAt5 === 0` (fewer than 5 catalogue products — M7 edge case).
- History pruning deletes the oldest files beyond 5 after each successful save — bounded disk usage on the `ai-model-data` Docker volume.
- `index.ts` instantiates `VersionedModelStore` instead of `ModelStore`; no other wiring changes required.
