# ADR-003: AI Service Proxied via Next.js API Routes

**Status**: Accepted
**Date**: 2026-04-24

## Context

The AI Service runs on a different origin (`http://ai-service:3000` / `http://localhost:3000`). Browser fetch from the Next.js frontend to the AI Service directly triggers CORS preflight. The spec mandates resolving this via Next.js API Routes proxy. A secondary concern is that API Route handlers provide a typed adapter boundary — they can normalize AI Service response shapes to frontend DTOs, decoupling frontend components from upstream API shape changes.

## Decision

Create three Next.js API Route handlers under `app/api/`:
- `POST /api/proxy/search` → forwards to AI Service `POST /api/v1/search/semantic`; returns `SearchResult[]` DTO.
- `POST /api/proxy/rag` → forwards to AI Service `POST /api/v1/rag/query`; returns `RagResponse` DTO.
- `POST /api/proxy/recommend` → forwards to API Service `POST /api/v1/recommend` (not AI Service — API Service handles the hybrid engine call); returns `RecommendationResult[]` DTO.

All three handlers transform the upstream response into a canonical frontend DTO defined in `lib/types.ts`. Components never import raw AI Service response shapes.

## Alternatives considered

- **Direct browser fetch to AI Service with CORS headers on AI Service**: technically feasible but requires modifying the Fastify AI Service (M3 scope). Rejected — M5 must not alter M3 artifacts.
- **Single catch-all proxy route (`/api/proxy/[...path]`)**: rejected because a catch-all pass-through provides no adapter boundary; any AI Service shape change would propagate directly to components.

## Consequences

- An extra network hop (browser → Next.js server → AI Service) adds ~1–5ms latency; negligible for a demo context.
- `AbortController` must be threaded through both the browser fetch (component → API Route) and the server-side fetch (API Route → AI Service) to support request cancellation on double-submit.
- `lib/adapters/` holds the transformation functions; `lib/types.ts` holds the canonical DTOs — this is the hexagonal adapter layer for the frontend.
