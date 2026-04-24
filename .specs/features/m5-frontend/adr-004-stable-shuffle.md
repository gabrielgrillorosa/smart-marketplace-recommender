# ADR-004: Stable Shuffle via Seeded LCG and useMemo

**Status**: Accepted
**Date**: 2026-04-24

## Context

The "Sem IA" column in the Recommendation Panel (M5-16) must display the same 10 products in a shuffled order for visual contrast against the "Com IA" ranked column. The shuffle must be:
1. **Stable across re-renders** — the same client must always produce the same shuffled order so the comparison is reproducible and not distracting.
2. **Different per client** — two clients must produce visually distinct orderings to demonstrate per-client personalization.

`Math.random()` is not seedable in native JavaScript. Re-shuffling on every render causes the "Sem IA" column to flicker, undermining the demo.

## Decision

Implement a seeded Linear Congruential Generator (LCG) as a pure utility function in `lib/utils/shuffle.ts`. The seed is derived from a simple hash of the `clientId` string. The shuffle is wrapped in `useMemo` with `[recommendations, selectedClient.id]` as dependencies — it recomputes only when the client changes or new recommendations arrive.

```ts
// Knuth LCG — sufficient entropy for UI display purposes
function lcg(seed: number) {
  let s = seed;
  return () => { s = (1664525 * s + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function stableHash(str: string): number {
  return [...str].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
}

export function seededShuffle<T>(arr: T[], seed: string): T[] {
  const rng = lcg(stableHash(seed));
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
```

## Alternatives considered

- **`Math.random()` without memoization**: eliminated — re-shuffles on every parent re-render, causing visible flickering in the "Sem IA" column.
- **External `seedrandom` npm package**: rejected — adds a dependency for a utility implementable in 15 lines; Rule of Three exemption does not apply (no existing evidence of seedrandom in the codebase).
- **Fixed pre-computed shuffle stored in `RecommendationContext`**: considered — would persist across re-renders without `useMemo`; rejected because it requires the context to own shuffle logic, mixing concerns.

## Consequences

- LCG entropy is sufficient for visual shuffling but not for cryptographic or statistical purposes — explicitly acceptable for UI demo use.
- The shuffle is computed in the render thread via `useMemo` — O(n) where n≤10, negligible cost.
- Changing `clientId` always produces a different visible order, making the "Sem IA" vs "Com IA" contrast convincing.
