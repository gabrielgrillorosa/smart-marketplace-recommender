# ADR-047: Explicit Ranking Window Metadata

**Status**: Accepted  
**Date**: 2026-04-28

## Context

The current frontend still treats recommendation depth as an implicit implementation detail: both `CatalogPanel` and `AnalysisPanel` call recommendation endpoints with `limit: 10`, and the UI infers "what was ranked" only from the returned list. That creates the exact ambiguity M14 is supposed to remove: catalog cards outside the returned top-10 appear to have no score, and comparison columns can show misleading movement because each phase may have been captured under a different invisible cap. M14 needs a single way to define, store, and display the ranking depth used by catalog ordering and by the `Com IA -> Com Carrinho -> Pos-Efetivar` showcase.

## Decision

Every recommendation fetch used by M14 will carry an explicit `RankingWindow`/`CoverageMeta` contract, resolved by a shared frontend helper and stored alongside catalog coverage state and analysis snapshots.

## Alternatives considered

- Keep the current implicit `limit` behavior and infer coverage from array length: rejected because it preserves the top-10 ambiguity and makes truncation invisible.
- Move all catalog/session/filter state into one global showcase store: rejected because it couples local catalog controls to unrelated surfaces and adds hydration complexity without evidence of reuse.
- Let catalog and analysis define separate caps locally: rejected because it would recreate inconsistent comparison windows and false deltas.

## Consequences

- Catalog ordered mode and analysis snapshots now share the same ranking-depth contract and can communicate truncation explicitly.
- Cache invalidation becomes request-key based instead of client-only, which adds a little more bookkeeping but avoids stale ordered sessions.
- Snapshot data structures grow slightly because ranking-window metadata travels with each capture.
- If the ranking window changes mid-session, the showcase must reset and recapture from `Com IA` instead of comparing mismatched windows.

