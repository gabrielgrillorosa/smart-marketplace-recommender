# ADR-001: Single-Page Tabs Over Segment Routing

**Status**: Accepted
**Date**: 2026-04-24

## Context

M5 requires 4 panels (Catalog, Client Profile, Recommendations, RAG Chat) navigable without losing the selected client and loaded recommendations between panel switches (M5-29). The frontend already uses Next.js 14 App Router. The choice between URL-segment routing (one route per panel) and single-page tab navigation determines whether cross-panel state can survive navigation without an external cache layer.

## Decision

Use single-page tab navigation: all four panels live in a single route (`/`), rendered conditionally based on an `activeTab` state variable. Navigation never triggers a route change.

## Alternatives considered

- **Next.js App Router segment routing** (`/catalog`, `/client`, `/recommendations`, `/chat`): eliminated because route changes cause full component tree remounts, wiping `recommendations` state and violating M5-29. Serializing the full recommendation array to `searchParams` is impractical (10 products × score breakdown = unbounded URL length).
- **`useReducer` with memoized selectors**: kept panel structure of Node A but introduced abstraction (memoized selectors) without evidence of repetition in the codebase and beyond the 5 state fields present at this scope.

## Consequences

- Selected client and recommendations survive panel navigation with no additional persistence layer.
- All four panel components are imported in the root page — initial bundle includes all panel code; acceptable for a ~50-product demo.
- Future addition of deep-linkable panel URLs requires introducing a router — deferred to post-demo.
