import { describe, it, expect } from 'vitest'
import {
  selectStratifiedNegatives,
  type NegativeSamplingSelectorOptions,
  type NegativeSamplingTelemetry,
  type SelectedNegative,
  type SelectionFallbackKind,
} from './negativeSamplingSelector.js'
import {
  type StratifiedNegativeCandidate,
  type BucketInputProduct,
} from './negativeSamplingBuckets.js'

/**
 * RED tests for M23-T23-4 deterministic selector.
 *
 * Contract under test:
 *  - Target distribution `[hard, medium, medium, easy]` per positive (M23-07).
 *  - Hard prioritized; at least one hard when available (M23-08, M23-09).
 *  - Explicit fallback: hard <- best medium <- next available (M23-10).
 *  - Same seed + same configuration => same composition AND same final order
 *    (M23-13).
 *  - Telemetry must aggregate at minimum `hardAvailable`, `hardSelected`,
 *    `intraCategoryAvailable`, `intraCategorySelected`, fallback usage,
 *    `mode`, and `seed` (M23-14).
 *  - No duplication of items across selected slots.
 *  - Pure function: same input -> same output.
 */

const product = (over: Partial<BucketInputProduct>): BucketInputProduct => ({
  id: 'p-default',
  name: 'Default Product',
  category: 'food',
  sku: 'FOO-BAR-001',
  ...over,
})

function candidate(
  over: Partial<StratifiedNegativeCandidate> & { productOver?: Partial<BucketInputProduct> }
): StratifiedNegativeCandidate {
  const { productOver, ...rest } = over
  return {
    product: product({ id: 'p-x', ...productOver }),
    embedding: undefined,
    cosine: 0.5,
    bucket: 'medium',
    bucketReason: 'cosine_medium_range',
    sameCategory: false,
    sameSupplier: false,
    sameBrand: undefined,
    intraCategoryAvailable: false,
    ...rest,
  }
}

const POS = product({ id: 'pos-1', category: 'food' })

const BASE_OPTIONS: NegativeSamplingSelectorOptions = {
  mode: 'stratified',
  seed: 12345,
}

describe('selectStratifiedNegatives — full buckets distribution (M23-07, M23-08)', () => {
  it('produces exactly 1 hard + 2 medium + 1 easy when all buckets are full', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'h2' },
        cosine: 0.8,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.6,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm3' },
        cosine: 0.45,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.2,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
      candidate({
        productOver: { id: 'e2' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const buckets = result.selected.map((s) => s.bucket)
    expect(buckets).toEqual(['hard', 'medium', 'medium', 'easy'])
    expect(result.selected).toHaveLength(4)
    expect(result.telemetry.hardSelected).toBe(1)
    expect(result.telemetry.mediumSelected).toBe(2)
    expect(result.telemetry.easySelected).toBe(1)
  })

  it('picks the highest-cosine hard candidate first (M23-08)', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h-low' },
        cosine: 0.72,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'h-high' },
        cosine: 0.9,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.45,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected[0].product.id).toBe('h-high')
  })

  it('prefers structurally-strong hard candidate over cosine-only hard (priority)', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h-cosine', category: 'other' },
        cosine: 0.91,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
        sameCategory: false,
        sameSupplier: false,
      }),
      candidate({
        productOver: { id: 'h-struct', category: 'food', supplierName: 'AcmeCo' },
        cosine: 0.71,
        bucket: 'hard',
        bucketReason: 'structural_priority_same_category_same_supplier',
        sameCategory: true,
        sameSupplier: true,
        intraCategoryAvailable: true,
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.45,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected[0].product.id).toBe('h-struct')
  })
})

describe('selectStratifiedNegatives — stable tie-break by productId', () => {
  it('breaks ties on equal cosine and equal structural signals by productId asc', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'm-zzz' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm-aaa' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm-mmm' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.8,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const mediumIds = result.selected
      .filter((s) => s.bucket === 'medium')
      .map((s) => s.product.id)
    expect(mediumIds).toEqual(['m-aaa', 'm-mmm'])
  })
})

describe('selectStratifiedNegatives — fallback when hard missing (M23-10)', () => {
  it('fills hard slot with best medium when no hard candidate exists', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'm-best' },
        cosine: 0.69,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm-low' },
        cosine: 0.42,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm-mid' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected).toHaveLength(4)
    const slot0 = result.selected[0]
    expect(slot0.product.id).toBe('m-best')
    expect(slot0.bucket).toBe('medium')
    expect(slot0.fallbackFrom).toBe<SelectionFallbackKind>('hard_to_medium')
    expect(result.telemetry.hardAvailable).toBe(0)
    expect(result.telemetry.hardSelected).toBe(0)
    expect(result.telemetry.fallbackHardToMedium).toBe(1)
  })

  it('fills hard slot with next-best available (easy) when no hard or medium exist', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'e-high' },
        cosine: 0.35,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
      candidate({
        productOver: { id: 'e-low' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected.length).toBe(2)
    expect(result.selected[0].product.id).toBe('e-high')
    expect(result.selected[0].fallbackFrom).toBe<SelectionFallbackKind>('hard_to_other')
    expect(result.telemetry.fallbackHardToOther).toBe(1)
  })
})

describe('selectStratifiedNegatives — fallback for medium/easy slots', () => {
  it('fills medium slots with remaining hard first, then easy, when medium is short', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'h2' },
        cosine: 0.8,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.2,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
      candidate({
        productOver: { id: 'e2' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected).toHaveLength(4)
    expect(result.selected[0].bucket).toBe('hard')
    expect(result.selected[0].product.id).toBe('h1')
    expect(result.selected[1].bucket).toBe('hard')
    expect(result.selected[1].product.id).toBe('h2')
    expect(result.selected[1].fallbackFrom).toBe<SelectionFallbackKind>('medium_to_hard')
    expect(result.selected[2].bucket).toBe('easy')
    expect(result.selected[2].fallbackFrom).toBe<SelectionFallbackKind>('medium_to_easy')
    expect(result.selected[3].bucket).toBe('easy')
    expect(result.telemetry.fallbackMediumToHard).toBe(1)
    expect(result.telemetry.fallbackMediumToEasy).toBe(1)
  })

  it('fills easy slot with remaining medium first, then hard', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'h2' },
        cosine: 0.8,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.6,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm3' },
        cosine: 0.45,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected).toHaveLength(4)
    expect(result.selected[3].bucket).toBe('medium')
    expect(result.selected[3].product.id).toBe('m3')
    expect(result.selected[3].fallbackFrom).toBe<SelectionFallbackKind>('easy_to_medium')
    expect(result.telemetry.fallbackEasyToMedium).toBe(1)
  })
})

describe('selectStratifiedNegatives — no duplicates', () => {
  it('never selects the same product across two slots', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
    ]
    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const ids = result.selected.map((s) => s.product.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('returns at most ratio items even when pool is smaller', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'only-1' },
        cosine: 0.4,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
    ]
    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(result.selected).toHaveLength(1)
    expect(result.selected[0].product.id).toBe('only-1')
  })

  it('handles empty pool: returns empty selection and zeroed counts', () => {
    const result = selectStratifiedNegatives(POS, [], BASE_OPTIONS)
    expect(result.selected).toHaveLength(0)
    expect(result.telemetry.hardAvailable).toBe(0)
    expect(result.telemetry.hardSelected).toBe(0)
    expect(result.telemetry.intraCategoryAvailable).toBe(0)
    expect(result.telemetry.intraCategorySelected).toBe(0)
  })
})

describe('selectStratifiedNegatives — determinism (M23-13)', () => {
  it('produces same composition and same order for same inputs and same seed', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'h2' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm3' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]
    const a = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const b = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(a.selected.map((s) => s.product.id)).toEqual(b.selected.map((s) => s.product.id))
    expect(a.selected.map((s) => s.bucket)).toEqual(b.selected.map((s) => s.bucket))
    expect(a.telemetry.seed).toBe(b.telemetry.seed)
  })

  it('produces same result regardless of input candidate order', () => {
    const baseList: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.6,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]
    const reversed = [...baseList].reverse()
    const a = selectStratifiedNegatives(POS, baseList, BASE_OPTIONS)
    const b = selectStratifiedNegatives(POS, reversed, BASE_OPTIONS)
    expect(a.selected.map((s) => s.product.id)).toEqual(b.selected.map((s) => s.product.id))
  })
})

describe('selectStratifiedNegatives — telemetry contract (M23-14)', () => {
  it('includes mode, seed and minimum aggregate counters', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1', category: 'food' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
        sameCategory: true,
        intraCategoryAvailable: true,
      }),
      candidate({
        productOver: { id: 'h2', category: 'other' },
        cosine: 0.8,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1', category: 'food' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
        sameCategory: true,
        intraCategoryAvailable: true,
      }),
      candidate({
        productOver: { id: 'm2', category: 'other' },
        cosine: 0.45,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1', category: 'other' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]

    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const t: NegativeSamplingTelemetry = result.telemetry
    expect(t.mode).toBe('stratified')
    expect(t.seed).toBe(BASE_OPTIONS.seed)
    expect(t.hardAvailable).toBe(2)
    expect(t.hardSelected).toBe(1)
    expect(t.mediumAvailable).toBe(2)
    expect(t.mediumSelected).toBe(2)
    expect(t.easyAvailable).toBe(1)
    expect(t.easySelected).toBe(1)
    expect(t.intraCategoryAvailable).toBe(2)
    expect(t.intraCategorySelected).toBeGreaterThanOrEqual(1)
    expect(t.fallbackHardToMedium).toBe(0)
    expect(t.fallbackHardToOther).toBe(0)
    expect(t.fallbackMediumToHard).toBe(0)
    expect(t.fallbackMediumToEasy).toBe(0)
    expect(t.fallbackEasyToMedium).toBe(0)
    expect(t.fallbackEasyToHard).toBe(0)
  })

  it('passes mode through telemetry when running in legacy mode (selector still callable)', () => {
    const result = selectStratifiedNegatives(POS, [], { mode: 'legacy', seed: 7 })
    expect(result.telemetry.mode).toBe('legacy')
    expect(result.telemetry.seed).toBe(7)
  })
})

describe('selectStratifiedNegatives — purity', () => {
  it('does not mutate input candidates array', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.6,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
    ]
    const snapshot = candidates.map((c) => ({ id: c.product.id, bucket: c.bucket }))
    selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    expect(candidates.map((c) => ({ id: c.product.id, bucket: c.bucket }))).toEqual(snapshot)
  })
})

describe('selectStratifiedNegatives — selected items expose source bucket', () => {
  it('SelectedNegative carries underlying candidate metadata', () => {
    const candidates: StratifiedNegativeCandidate[] = [
      candidate({
        productOver: { id: 'h1' },
        cosine: 0.85,
        bucket: 'hard',
        bucketReason: 'cosine_hard_range',
      }),
      candidate({
        productOver: { id: 'm1' },
        cosine: 0.6,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'm2' },
        cosine: 0.5,
        bucket: 'medium',
        bucketReason: 'cosine_medium_range',
      }),
      candidate({
        productOver: { id: 'e1' },
        cosine: 0.1,
        bucket: 'easy',
        bucketReason: 'cosine_easy_range',
      }),
    ]
    const result = selectStratifiedNegatives(POS, candidates, BASE_OPTIONS)
    const first: SelectedNegative = result.selected[0]
    expect(first.product.id).toBe('h1')
    expect(first.bucket).toBe('hard')
    expect(first.candidate).toBeDefined()
    expect(first.candidate.bucketReason).toBe('cosine_hard_range')
  })
})
