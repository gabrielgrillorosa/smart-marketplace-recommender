# ADR-011: Next.js Standalone Output Dockerfile Pattern

**Status**: Accepted
**Date**: 2026-04-24

## Context

Next.js 14 provides a `standalone` output mode (`output: 'standalone'` in `next.config.js`) that produces a self-contained server in `.next/standalone/` with only the minimal Node.js files required to run — no `node_modules`, no dev dependencies. This is the correct approach for a production-grade multi-stage Dockerfile.

Without `output: 'standalone'`, a Next.js multi-stage Dockerfile must copy the entire `node_modules/` directory (including dev dependencies if not careful), resulting in images > 1GB. The `standalone` output reduces the runtime image to ~200–400MB.

The pattern requires three distinct `COPY` operations in the runtime stage that are non-obvious and easy to get wrong: (1) the standalone server, (2) the static assets (`.next/static/`), and (3) the public folder (`public/`). Missing any one of them causes a runtime failure (missing static files or missing server entrypoint). Additionally, since L-003 documents that Next.js standalone mode binds to the container network IP by default, `HOSTNAME=0.0.0.0` must be set in the Dockerfile ENV.

## Decision

The `frontend` Dockerfile uses a two-stage build:
- **`builder` stage**: installs all dependencies (`npm ci`), runs `next build` (which generates `.next/standalone/`, `.next/static/`, and `public/` is already present in source)
- **`runtime` stage**: uses `node:20-alpine`; copies ONLY: `.next/standalone/` (standalone server), `.next/static/` into `.next/standalone/.next/static/`, and `public/` into `.next/standalone/public/`; sets `ENV HOSTNAME=0.0.0.0`; entrypoint is `node server.js` inside `.next/standalone/`

`next.config.js` must have `output: 'standalone'` set before this Dockerfile is used.

## Alternatives considered

- **Copy full `node_modules` to runtime**: produces images > 1GB with all dev dependencies included; violates M6-26 (dev dependencies must not be in the runtime image); discarded.
- **`npm ci --omit=dev` in runtime stage without standalone**: still copies source files and a large `node_modules`; doesn't leverage Next.js tree-shaking and standalone bundling; produces larger images than standalone output; discarded.
- **Multi-stage with `npm prune --production`**: fragile — some packages have production/development detection bugs; Next.js 14 officially recommends `output: 'standalone'` over manual pruning; discarded.

## Consequences

- `next.config.js` must have `output: 'standalone'` — if this is missing, `next build` won't generate the standalone directory and the Dockerfile `COPY` will fail silently or produce a broken image.
- The `runtime` stage COPY sequence is: (1) `COPY --from=builder .next/standalone ./`, (2) `COPY --from=builder .next/static .next/static`, (3) `COPY --from=builder public ./public`. Order matters — (2) must overwrite the static directory that standalone does NOT include by default.
- `ENV HOSTNAME=0.0.0.0` is required (L-003): without it, the standalone server binds to the container's internal IP and the Docker health check using `127.0.0.1` fails.
- Final `frontend` runtime image size target: < 400MB (down from > 1GB without standalone).
