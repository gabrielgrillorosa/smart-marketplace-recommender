import { describe, it, expect } from 'vitest'
import {
  classifyNegativeCandidates,
  isBucketLabel,
  isBucketReason,
  type BucketCandidateInput,
  type BucketClassifierOptions,
  type BucketInputProduct,
  type BucketLabel,
  type BucketReason,
} from './negativeSamplingBuckets.js'

/**
 * RED phase: unit tests for the M23-T23-3 bucket classifier helper.
 *
 * The classifier MUST:
 *  - bucketize candidates as `hard | medium | easy` using the runtime
 *    thresholds (`softMaxSim`, `hardMinSim`, `mediumMinSim`) — defaults
 *    matching T23-1 (0.92 / 0.70 / 0.40);
 *  - apply structural priority: a candidate that shares category with the
 *    positive AND shares supplier OR brand signal MUST be classified as
 *    `hard`, even when its cosine would otherwise be medium/easy. This is
 *    the M23 normative behaviour replacing the legacy global exclusion of
 *    `same category + supplierName`;
 *  - degrade gracefully when supplier / brand / embedding metadata is
 *    missing (no broadened hard classification just because metadata is
 *    absent);
 *  - preserve metadata required by downstream selection and the M22 / ID
 *    tower guardrail (`bucket`, `bucketReason`, `sameCategory`,
 *    `sameSupplier`, `sameBrand?`, plus the pool-level
 *    `intraCategoryAvailable`).
 */

const product = (over: Partial<BucketInputProduct>): BucketInputProduct => ({
  id: 'p-default',
  name: 'Default Product',
  category: 'food',
  sku: 'FOO-BAR-001',
  ...over,
})

const DEFAULT_OPTIONS: BucketClassifierOptions = {
  softMaxSim: 0.92,
  hardMinSim: 0.7,
  mediumMinSim: 0.4,
}

function unitVec(value: number, dims = 8): number[] {
  return new Array<number>(dims).fill(value)
}

function orthogonalLike(seed: number, dims = 8): number[] {
  const v = new Array<number>(dims).fill(0)
  v[seed % dims] = 1
  return v
}

/**
 * Builds two unit-norm vectors with cosine ≈ `target`.
 * a = e0; b = target * e0 + sqrt(1 - target^2) * e1.
 */
function pairWithCosine(target: number, dims = 8): { a: number[]; b: number[] } {
  const a = new Array<number>(dims).fill(0)
  const b = new Array<number>(dims).fill(0)
  a[0] = 1
  b[0] = target
  b[1] = Math.sqrt(Math.max(0, 1 - target * target))
  return { a, b }
}

describe('classifyNegativeCandidates — cosine bucket bands (M23-12)', () => {
  it('classifies cosine in [hardMinSim, softMaxSim] as hard', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.85)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified).toHaveLength(1)
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
    expect(result.classified[0].bucketReason).toBe<BucketReason>('cosine_hard_range')
  })

  it('classifies cosine exactly at hardMinSim as hard (inclusive lower bound)', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.7)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
  })

  it('classifies cosine exactly at softMaxSim as hard (inclusive upper bound)', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.92)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
  })

  it('classifies cosine in [mediumMinSim, hardMinSim) as medium', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.55)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('medium')
    expect(result.classified[0].bucketReason).toBe<BucketReason>('cosine_medium_range')
  })

  it('classifies cosine exactly at mediumMinSim as medium (inclusive lower bound of medium)', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.4)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('medium')
  })

  it('classifies cosine strictly below mediumMinSim as easy', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.2)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('easy')
    expect(result.classified[0].bucketReason).toBe<BucketReason>('cosine_easy_range')
  })

  it('respects parameterized non-default thresholds', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.55)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'other' }), embedding: b }],
      {
        softMaxSim: 0.99,
        hardMinSim: 0.5,
        mediumMinSim: 0.2,
        positiveEmbedding: a,
      }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
  })
})

describe('classifyNegativeCandidates — structural priority promotes to hard (M23-11)', () => {
  it('promotes a same-category + same-supplier candidate to hard even when cosine is medium', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const { a, b } = pairWithCosine(0.55) // cosine -> medium band
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({
            id: 'p2',
            category: 'food',
            supplierName: 'AcmeCorp',
          }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    const c = result.classified[0]
    expect(c.bucket).toBe<BucketLabel>('hard')
    expect(c.sameCategory).toBe(true)
    expect(c.sameSupplier).toBe(true)
    expect(c.bucketReason).toBe<BucketReason>(
      'structural_priority_same_category_same_supplier'
    )
  })

  it('promotes a same-category + same-supplier candidate to hard even when cosine is easy', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const { a, b } = pairWithCosine(0.1) // cosine -> easy band
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({
            id: 'p2',
            category: 'food',
            supplierName: 'AcmeCorp',
          }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
    expect(result.classified[0].bucketReason).toBe<BucketReason>(
      'structural_priority_same_category_same_supplier'
    )
  })

  it('promotes via brand resolver when same category + same brand', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'SupplierA' })
    const { a, b } = pairWithCosine(0.55)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          // different supplier, but same brand via resolver
          product: product({ id: 'p2', category: 'food', supplierName: 'SupplierB' }),
          embedding: b,
        },
      ],
      {
        ...DEFAULT_OPTIONS,
        positiveEmbedding: a,
        brandResolver: (p) => (p.id === 'p1' || p.id === 'p2' ? 'shared-brand' : undefined),
      }
    )
    const c = result.classified[0]
    expect(c.bucket).toBe<BucketLabel>('hard')
    expect(c.sameCategory).toBe(true)
    expect(c.sameSupplier).toBe(false)
    expect(c.sameBrand).toBe(true)
    expect(c.bucketReason).toBe<BucketReason>('structural_priority_same_category_same_brand')
  })

  it('combines supplier + brand structural signals when both fire', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const { a, b } = pairWithCosine(0.1)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'food', supplierName: 'AcmeCorp' }),
          embedding: b,
        },
      ],
      {
        ...DEFAULT_OPTIONS,
        positiveEmbedding: a,
        brandResolver: () => 'shared',
      }
    )
    const c = result.classified[0]
    expect(c.bucket).toBe<BucketLabel>('hard')
    expect(c.sameSupplier).toBe(true)
    expect(c.sameBrand).toBe(true)
    expect(c.bucketReason).toBe<BucketReason>(
      'structural_priority_same_category_same_supplier_and_brand'
    )
  })

  it('does NOT downgrade an already-hard cosine candidate (structural is supplementary, never demoting)', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const { a, b } = pairWithCosine(0.85)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'food', supplierName: 'AcmeCorp' }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
  })

  it('does NOT promote when only sameCategory holds (no supplier and no brand signal)', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'A' })
    const { a, b } = pairWithCosine(0.55) // medium cosine
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'food', supplierName: 'B' }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    const c = result.classified[0]
    expect(c.sameCategory).toBe(true)
    expect(c.sameSupplier).toBe(false)
    expect(c.bucket).toBe<BucketLabel>('medium')
    expect(c.bucketReason).toBe<BucketReason>('cosine_medium_range')
  })

  it('does NOT promote when supplier matches but category differs', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const { a, b } = pairWithCosine(0.55)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'cosmetics', supplierName: 'AcmeCorp' }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    const c = result.classified[0]
    expect(c.sameCategory).toBe(false)
    expect(c.sameSupplier).toBe(true)
    expect(c.bucket).toBe<BucketLabel>('medium')
  })
})

describe('classifyNegativeCandidates — graceful degradation when metadata is missing', () => {
  it('does not promote to hard when supplier metadata is missing on either side', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: undefined })
    const { a, b } = pairWithCosine(0.1)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'food', supplierName: 'AcmeCorp' }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    const c = result.classified[0]
    expect(c.sameSupplier).toBe(false)
    expect(c.bucket).toBe<BucketLabel>('easy')
  })

  it('treats supplier names case-insensitively and trim-tolerant', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: '  AcmeCorp ' })
    const { a, b } = pairWithCosine(0.1)
    const result = classifyNegativeCandidates(
      positive,
      [
        {
          product: product({ id: 'p2', category: 'food', supplierName: 'acmecorp' }),
          embedding: b,
        },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].sameSupplier).toBe(true)
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
  })

  it('defaults to easy bucket when cosine cannot be computed (missing positive embedding)', () => {
    const positive = product({ id: 'p1', category: 'other', supplierName: 'X' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food' }), embedding: unitVec(0.5) }],
      { ...DEFAULT_OPTIONS } // no positiveEmbedding
    )
    const c = result.classified[0]
    expect(c.cosine).toBeNull()
    expect(c.bucket).toBe<BucketLabel>('easy')
    expect(c.bucketReason).toBe<BucketReason>('cosine_unavailable_default_easy')
  })

  it('defaults to easy bucket when candidate embedding is missing', () => {
    const positive = product({ id: 'p1', category: 'other', supplierName: 'X' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food' }) }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: unitVec(0.5) }
    )
    const c = result.classified[0]
    expect(c.cosine).toBeNull()
    expect(c.bucket).toBe<BucketLabel>('easy')
  })

  it('defaults to easy bucket when embeddings have mismatched dimensions', () => {
    const positive = product({ id: 'p1', category: 'other' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food' }), embedding: new Array<number>(4).fill(1) }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: new Array<number>(8).fill(1) }
    )
    expect(result.classified[0].cosine).toBeNull()
    expect(result.classified[0].bucket).toBe<BucketLabel>('easy')
  })

  it('defaults to easy bucket when an embedding has zero norm', () => {
    const positive = product({ id: 'p1', category: 'other' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food' }), embedding: new Array<number>(8).fill(0) }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: unitVec(0.5) }
    )
    expect(result.classified[0].cosine).toBeNull()
    expect(result.classified[0].bucket).toBe<BucketLabel>('easy')
  })

  it('still applies structural priority when cosine is unavailable but structural signal holds', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'AcmeCorp' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food', supplierName: 'AcmeCorp' }) }],
      { ...DEFAULT_OPTIONS } // no embeddings at all
    )
    expect(result.classified[0].cosine).toBeNull()
    expect(result.classified[0].bucket).toBe<BucketLabel>('hard')
    expect(result.classified[0].bucketReason).toBe<BucketReason>(
      'structural_priority_same_category_same_supplier'
    )
  })

  it('does not error and does not throw on empty candidate list', () => {
    const positive = product({ id: 'p1' })
    const result = classifyNegativeCandidates(positive, [], { ...DEFAULT_OPTIONS })
    expect(result.classified).toEqual([])
    expect(result.intraCategoryAvailable).toBe(false)
  })
})

describe('classifyNegativeCandidates — metadata preservation for downstream / M22 guardrail (M23-15)', () => {
  it('exposes pool-level intraCategoryAvailable flag = true when any candidate shares the positive category', () => {
    const positive = product({ id: 'p1', category: 'food' })
    const result = classifyNegativeCandidates(
      positive,
      [
        { product: product({ id: 'p2', category: 'cosmetics' }), embedding: orthogonalLike(0) },
        { product: product({ id: 'p3', category: 'food' }), embedding: orthogonalLike(1) },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: orthogonalLike(2) }
    )
    expect(result.intraCategoryAvailable).toBe(true)
  })

  it('exposes pool-level intraCategoryAvailable flag = false when no candidate shares the positive category', () => {
    const positive = product({ id: 'p1', category: 'food' })
    const result = classifyNegativeCandidates(
      positive,
      [
        { product: product({ id: 'p2', category: 'cosmetics' }), embedding: orthogonalLike(0) },
        { product: product({ id: 'p3', category: 'electronics' }), embedding: orthogonalLike(1) },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: orthogonalLike(2) }
    )
    expect(result.intraCategoryAvailable).toBe(false)
  })

  it('preserves per-candidate intraCategoryAvailable mirroring sameCategory for downstream guardrail use', () => {
    const positive = product({ id: 'p1', category: 'food' })
    const result = classifyNegativeCandidates(
      positive,
      [
        { product: product({ id: 'p2', category: 'food' }), embedding: orthogonalLike(0) },
        { product: product({ id: 'p3', category: 'cosmetics' }), embedding: orthogonalLike(1) },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: orthogonalLike(2) }
    )
    const c2 = result.classified.find((c) => c.product.id === 'p2')
    const c3 = result.classified.find((c) => c.product.id === 'p3')
    expect(c2?.intraCategoryAvailable).toBe(true)
    expect(c3?.intraCategoryAvailable).toBe(false)
  })

  it('preserves cosine value when computable (rounded faithfully — not null) for downstream selection', () => {
    const positive = product({ id: 'p1' })
    const { a, b } = pairWithCosine(0.55)
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2' }), embedding: b }],
      { ...DEFAULT_OPTIONS, positiveEmbedding: a }
    )
    expect(result.classified[0].cosine).not.toBeNull()
    expect(result.classified[0].cosine!).toBeGreaterThan(0.5)
    expect(result.classified[0].cosine!).toBeLessThan(0.6)
  })

  it('keeps `sameBrand` undefined when no brand resolver is provided (explicit absence vs false)', () => {
    const positive = product({ id: 'p1', category: 'food', supplierName: 'X' })
    const result = classifyNegativeCandidates(
      positive,
      [{ product: product({ id: 'p2', category: 'food', supplierName: 'X' }) }],
      { ...DEFAULT_OPTIONS }
    )
    expect(result.classified[0].sameBrand).toBeUndefined()
  })
})

describe('classifyNegativeCandidates — determinism', () => {
  it('preserves input order in the classified list', () => {
    const positive = product({ id: 'p0' })
    const result = classifyNegativeCandidates(
      positive,
      [
        { product: product({ id: 'a' }), embedding: orthogonalLike(0) },
        { product: product({ id: 'b' }), embedding: orthogonalLike(1) },
        { product: product({ id: 'c' }), embedding: orthogonalLike(2) },
      ],
      { ...DEFAULT_OPTIONS, positiveEmbedding: orthogonalLike(3) }
    )
    expect(result.classified.map((c) => c.product.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same result on repeated calls with the same input', () => {
    const positive = product({ id: 'p0' })
    const candidates: BucketCandidateInput[] = [
      { product: product({ id: 'a', category: 'food' }), embedding: orthogonalLike(0) },
      { product: product({ id: 'b', category: 'other' }), embedding: orthogonalLike(1) },
    ]
    const r1 = classifyNegativeCandidates(positive, candidates, {
      ...DEFAULT_OPTIONS,
      positiveEmbedding: orthogonalLike(2),
    })
    const r2 = classifyNegativeCandidates(positive, candidates, {
      ...DEFAULT_OPTIONS,
      positiveEmbedding: orthogonalLike(2),
    })
    expect(r1).toEqual(r2)
  })
})

describe('isBucketLabel / isBucketReason type guards', () => {
  it('matches all known bucket labels', () => {
    expect(isBucketLabel('hard')).toBe(true)
    expect(isBucketLabel('medium')).toBe(true)
    expect(isBucketLabel('easy')).toBe(true)
  })

  it('rejects unknown bucket labels', () => {
    expect(isBucketLabel('soft')).toBe(false)
    expect(isBucketLabel('')).toBe(false)
  })

  it('matches all known bucket reasons', () => {
    expect(isBucketReason('cosine_hard_range')).toBe(true)
    expect(isBucketReason('cosine_medium_range')).toBe(true)
    expect(isBucketReason('cosine_easy_range')).toBe(true)
    expect(isBucketReason('cosine_unavailable_default_easy')).toBe(true)
    expect(isBucketReason('structural_priority_same_category_same_supplier')).toBe(true)
    expect(isBucketReason('structural_priority_same_category_same_brand')).toBe(true)
    expect(isBucketReason('structural_priority_same_category_same_supplier_and_brand')).toBe(true)
  })

  it('rejects unknown bucket reasons (e.g. legacy category_supplier exclusion)', () => {
    expect(isBucketReason('category_supplier')).toBe(false)
    expect(isBucketReason('above_soft_max_sim')).toBe(false)
  })
})
