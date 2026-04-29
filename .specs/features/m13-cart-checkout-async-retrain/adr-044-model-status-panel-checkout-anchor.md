# ADR-044: `ModelStatusPanel` as the Checkout-Driven Async Learning Anchor

**Status**: Accepted
**Date**: 2026-04-28

## Context
The existing frontend already contains `RetrainPanel`, `TrainingProgressBar`, `ModelMetricsComparison`, and an always-mounted `AnalysisPanel` that preserves retrain state across tab switches. M13 changes the trigger from manual retrain to checkout, but the UI still needs a visible async anchor; otherwise the `Pos-Efetivar` column would update several seconds later with no clear explanation of what happened, and rejected/failed outcomes would look like bugs instead of explicit model-governance decisions.

## Decision
Rename `RetrainPanel` to `ModelStatusPanel`, keep it mounted as the primary async status surface after checkout, and move the manual retrain button into a collapsible `Avançado / Modo demo` section.

## Alternatives considered
- Remove the panel and rely only on column updates: rejected because it hides system status and makes `rejected` / `failed` outcomes opaque.
- Keep manual retrain as the primary trigger: rejected because it conflicts with the new checkout-first architecture.
- Build a brand-new status shell from scratch: rejected because the current panel, progress bar, and metrics comparison already solve most of the UI problem and should be evolved instead of replaced.

## Consequences
- Reuses ADR-023/024/025-era UI assets and keeps the async learning narrative visible.
- Requires renaming imports, texts, selectors, and the M9-B E2E flow to an M13 checkout-focused spec.
- Preserves manual retrain for instructor/demo scenarios, but clearly marks it as outside the main production flow.
