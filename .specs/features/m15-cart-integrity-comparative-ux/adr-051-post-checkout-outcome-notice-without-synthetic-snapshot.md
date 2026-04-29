# ADR-051: Post-Checkout Outcome Notice Without Synthetic Snapshot

**Status**: Accepted
**Date**: 2026-04-28

## Context
After M13 and M14, `ModelStatusPanel` already exposes `promoted`, `rejected`, `failed`, and `unknown`, but `AnalysisPanel` only captures `Pos-Efetivar` when a new promoted model version is observed. That leaves the final comparison column visually empty in legitimate terminal states and makes the evaluator wonder whether the UI broke or whether no promotion happened. M15 must explain that ambiguity without faking recommendation data that was never produced by a promoted model.

## Decision
Keep `Pos-Efetivar` snapshot capture promotion-only and add a local post-checkout outcome notice in the `Pos-Efetivar` wrapper for `rejected`, `failed`, and `unknown`, coordinated with clearer `ModelStatusPanel` copy.

## Alternatives considered
- Always fetch and render a new `Pos-Efetivar` snapshot even when the model was rejected or failed: rejected because it invents a misleading comparison phase and weakens the chronology of the showcase.
- Rely only on `ModelStatusPanel`: rejected because the empty final column still looks unexplained when the evaluator is scanning the four-column story.
- Push outcome-specific notice behavior into the generic `RecommendationColumn` component: rejected because it broadens a presentational component for a single feature-specific case.

## Consequences
- The final column becomes self-explanatory in every terminal outcome without fabricating data.
- `AnalysisPanel` gains a small feature-specific wrapper notice/helper, but `RecommendationColumn` stays simple and reusable.
- Copy must stay aligned between `ModelStatusPanel` and the column notice, so a shared helper or shared input contract is needed to avoid drift.
