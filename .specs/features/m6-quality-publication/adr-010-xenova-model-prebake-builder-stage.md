# ADR-010: @xenova/transformers Model Pre-download in Builder Stage

**Status**: Accepted
**Date**: 2026-04-24

## Context

`@xenova/transformers` downloads the `sentence-transformers/all-MiniLM-L6-v2` model (~90MB ONNX files) on first use via a `postinstall` script and/or on the first call to `pipeline()`. In a multi-stage Dockerfile where the `runtime` stage runs `npm ci --omit=dev`, the postinstall scripts of dev-only packages are skipped. But even in a full `npm ci`, the model download happens at runtime (first call to `EmbeddingService.init()`) unless the model cache is explicitly pre-populated during the build.

If the model is not pre-downloaded in the builder stage, the `runtime` container will attempt a ~90MB HTTP download on every cold start (or on the first startup after image creation). This has three failure modes: (1) the download fails in restricted network environments, (2) the container starts too slowly and fails health checks (D-009, ADR-005), and (3) the downloaded files are not persisted across container restarts if no volume is mounted.

## Decision

In the `builder` stage of the `ai-service` Dockerfile, after running `npm ci`, execute a Node.js warm-up script that imports `@xenova/transformers` and calls `pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')` to trigger the model download into the npm cache directory (`/root/.cache/huggingface/hub` or `./node_modules/.cache`). The `runtime` stage copies `node_modules/.cache` (or the relevant cache directory) from the `builder` stage, so the model ONNX files are baked into the image.

## Alternatives considered

- **Download at container startup (ADR-005 approach)**: already accepted for development (`docker compose up`) but insufficient for a published Docker image — the image would require network access at startup and fail in air-gapped or rate-limited environments. For a portfolio project where `docker compose up` must "just work", pre-baking is the correct choice.
- **Volume mount for model cache**: would require the user to pre-download the model manually before first `docker compose up` — violates the "5 commands, zero prior knowledge" quickstart requirement (M6-15).
- **Use a smaller embedding model with no download**: no viable alternative in `@xenova/transformers` that produces 384-dim embeddings compatible with the existing Neo4j vector index (product embeddings already stored at 384 dims from M3).

## Consequences

- `ai-service` Docker build time increases by ~60–90 seconds (model download during `docker build`) — acceptable for a portfolio image built once.
- The `runtime` stage image will include the ONNX model files (~90MB). This increases image size but eliminates the cold-start download entirely.
- The warm-up script must handle the case where the model is already cached (idempotent) to avoid breaking CI layer caches.
- `EmbeddingService.init()` still runs at container startup (ADR-005) but will find the model in cache and complete in < 2 seconds instead of 30–60 seconds.
