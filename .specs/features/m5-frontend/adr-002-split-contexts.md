# ADR-002: Split ClientContext and RecommendationContext

**Status**: Accepted
**Date**: 2026-04-24

## Context

The frontend requires shared state for the selected client (consumed by Client Profile, Recommendation, and Catalog panels) and for the recommendation result set (consumed by Client Profile and Recommendation panels). Placing both in a single context value object mixes domain state (`selectedClient`) with derived UI state (`recommendations`, `loading`, `isFallback`), violating SRP and causing all consumers to re-render whenever either slice changes. The `isFallback` field in particular must be explicitly modeled so the fallback badge (M5-14) is driven by data, not by component-level heuristics.

## Decision

Create two separate React Contexts:
- `ClientContext`: holds `{ selectedClient, setSelectedClient }` — consumed broadly.
- `RecommendationContext`: holds `{ recommendations, loading, isFallback, setRecommendations, setLoading, setIsFallback }` — consumed only by panels that render recommendations.

## Alternatives considered

- **Single unified context**: eliminated because any update to `recommendations` triggers re-render of all consumers including Catalog and RAG Chat panels that do not depend on recommendation data; `isFallback` would be implicit (derived from response shape inspection in component code, not modeled).
- **Prop drilling**: eliminated because `selectedClient` must cross at least 3 component boundaries (Layout → TabView → ClientPanel → RecommendationPanel); violates spec guidance to use Context for this.

## Consequences

- Catalog and RAG Chat panels subscribe only to `ClientContext`; they do not re-render when recommendations load.
- `isFallback: boolean` is a first-class field in `RecommendationContext`, making M5-14 testable and deterministic.
- Two providers must be nested in the root layout — minor boilerplate, acceptable at this scale.
