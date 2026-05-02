# ADR-056: viewMode as Zustand Flag + useCatalogViewMode Companion Hook

**Status**: Superseded by [M18 catalog AD-055](../../m18-catalog-simplified-ad055/spec.md) (2026-04-30)  
**Date**: 2026-04-29

## Supersession note (M18)

The `viewMode` / `catalogSlice` / `useCatalogViewMode` approach was **removed**. After «Ordenar por IA», a single layout shows ranked eligible products plus an optional footer for `recently_purchased` only — no global vitrine↔ranking toggle. Implementation: [tasks M18 T4](../../m18-catalog-simplified-ad055/tasks.md).

## Context

M16 introduces two explicit catalog modes: `Modo Vitrine` (full catalog, all items visible) and `Modo Ranking IA` (AI-ordered eligible items at top, ineligible items below with badges). This mode switch is orthogonal to the existing `ordered` flag in `useCatalogOrdering`, which tracks whether the AI sort has been triggered and scores are available.

The Principal Software Architect flagged a SRP violation risk: adding `viewMode` directly to `useCatalogOrdering` would give that hook four distinct responsibilities (score ordering, coverage mode, diagnostic mode, view mode). The committee also identified that `viewMode` must reset when the client changes (QA finding), which is a cross-cutting concern that benefits from Zustand integration over local component state.

## Decision

Add a `viewMode: 'vitrine' | 'ranking'` flag to the existing `catalogSlice` in the Zustand store (alongside `ordered`, `coverageMode`, `diagnosticEnabled`). Expose it via a thin `useCatalogViewMode()` hook that returns `{ viewMode, setViewMode, toggleViewMode }`. The hook resets `viewMode` to `'vitrine'` when `clientId` changes, enforced inside the `clientSlice` reset logic (same pattern as `clearRecommendations` on client change).

## Alternatives considered

- **Extend `useCatalogOrdering` directly**: Disqualified by SRP concern — `useCatalogOrdering` already manages three orthogonal aspects; a fourth makes the hook a catch-all god hook.
- **Local `CatalogPanel` state (`useState`)**: Disqualified because `viewMode` must survive component unmount when the tab system uses `always-mounted` pattern (ADR-023), and because `viewMode` should reset on client change without `CatalogPanel` explicitly tracking client identity.
- **New `catalogViewSlice`**: Disqualified by Rule of Three — a dedicated slice for a single boolean has no codebase repetition evidence. Adding the flag to the existing `catalogSlice` achieves the same isolation at zero abstraction cost.

## Consequences

- `catalogSlice` gains one field: `viewMode: 'vitrine' | 'ranking'` (default `'vitrine'`).
- `clientSlice.setSelectedClient()` must call `resetCatalogViewMode()` action — same pattern as `clearRecommendations` on client change.
- `useCatalogViewMode` is a thin hook; no business logic lives in it. Consumer components own the rendering decision.
- `Modo Ranking IA` becomes accessible only after `viewMode === 'ranking'` — distinct from `ordered` (AI scores loaded). Both flags can be true simultaneously: `ordered=true` means scores are available; `viewMode='ranking'` means the UI separates eligible/ineligible items visually.
