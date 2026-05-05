import { describe, it, expect } from 'vitest'
import {
  applySoftCleanup,
  deriveSkuFamilyKey,
  isSoftCleanupExclusion,
  type SoftCleanupCandidate,
  type SoftCleanupExclusionReason,
  type SoftCleanupInputProduct,
} from './negativeSamplingSoftCleanup.js'

/**
 * RED phase: unit tests for the M23-T23-2 soft cleanup helper.
 *
 * The helper MUST exclude only structurally equivalent candidates relative to
 * the positive product:
 *  - same `product_id`
 *  - same derivable SKU family
 *  - tightly bounded trivial variations (same normalized name + same category +
 *    same SKU family) — closed and deterministic
 *  - cosine > SOFT_NEGATIVE_MAX_SIM
 *
 * The helper MUST NOT reintroduce broad exclusion by `category + supplierName`
 * or by a low semantic threshold.
 */

const product = (over: Partial<SoftCleanupInputProduct>): SoftCleanupInputProduct => ({
  id: 'p-default',
  name: 'Default Product',
  category: 'food',
  sku: 'FOO-BAR-001',
  ...over,
})

function unitVec(value: number, dims = 8): number[] {
  return new Array<number>(dims).fill(value)
}

function orthogonalLike(seed: number, dims = 8): number[] {
  const v = new Array<number>(dims).fill(0)
  v[seed % dims] = 1
  return v
}

describe('deriveSkuFamilyKey', () => {
  it('returns the prefix before the last hyphen-separated segment for multi-segment SKUs', () => {
    expect(deriveSkuFamilyKey('FOO-BAR-001')).toBe('FOO-BAR')
    expect(deriveSkuFamilyKey('ABC-123-V2')).toBe('ABC-123')
  })

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(deriveSkuFamilyKey('  foo-bar-001  ')).toBe('FOO-BAR')
  })

  it('returns null when SKU has no derivable family with confidence', () => {
    expect(deriveSkuFamilyKey('SINGLETOKEN')).toBeNull()
    expect(deriveSkuFamilyKey('')).toBeNull()
    expect(deriveSkuFamilyKey('   ')).toBeNull()
    expect(deriveSkuFamilyKey(undefined)).toBeNull()
  })

  it('returns null when last segment is not a recognizable variant token', () => {
    // Two segments where the last is a long descriptive word — not a clear variant suffix.
    // Confidence requires the last segment to look like a numeric / short variant token.
    expect(deriveSkuFamilyKey('CATEGORY-ELECTRONICS')).toBeNull()
  })

  it('accepts numeric or short alphanumeric variant tails as derivable family', () => {
    expect(deriveSkuFamilyKey('PROD-42')).toBe('PROD')
    expect(deriveSkuFamilyKey('PROD-V2')).toBe('PROD')
    expect(deriveSkuFamilyKey('PROD-XL')).toBe('PROD')
  })
})

describe('applySoftCleanup — exclusion rules', () => {
  it('excludes candidate with same product_id as positive', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p1', sku: 'AAA-001' }) },
      { product: product({ id: 'p2', sku: 'BBB-002' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept.map((c) => c.product.id)).toEqual(['p2'])
    expect(result.excluded).toHaveLength(1)
    expect(result.excluded[0].product.id).toBe('p1')
    expect(result.excluded[0].reason).toBe<SoftCleanupExclusionReason>('same_product_id')
  })

  it('excludes candidate with same derivable SKU family', () => {
    const positive = product({ id: 'p1', sku: 'PROD-A-001' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'PROD-A-002' }) },
      { product: product({ id: 'p3', sku: 'OTHER-X-001' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept.map((c) => c.product.id)).toEqual(['p3'])
    const ex = result.excluded.find((e) => e.product.id === 'p2')
    expect(ex?.reason).toBe<SoftCleanupExclusionReason>('same_sku_family')
  })

  it('excludes trivial variation (same normalized name + same category + same SKU family)', () => {
    const positive = product({
      id: 'p1',
      name: 'Premium Olive Oil',
      category: 'food',
      sku: 'OIL-01-500ML',
    })
    const trivial: SoftCleanupCandidate = {
      product: product({
        id: 'p2',
        name: '  premium  olive   oil  ',
        category: 'food',
        sku: 'OIL-01-1L',
      }),
    }
    const result = applySoftCleanup(positive, [trivial], { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(0)
    expect(result.excluded[0].reason).toBe<SoftCleanupExclusionReason>('trivial_variation')
  })

  it('excludes candidate with cosine similarity strictly greater than softMaxSim', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const positiveEmbedding = unitVec(0.5)
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'BBB-001' }), embedding: unitVec(0.5) },
      { product: product({ id: 'p3', sku: 'CCC-001' }), embedding: orthogonalLike(0) },
    ]
    const result = applySoftCleanup(positive, candidates, {
      softMaxSim: 0.92,
      positiveEmbedding,
    })
    expect(result.kept.map((c) => c.product.id)).toEqual(['p3'])
    const ex = result.excluded.find((e) => e.product.id === 'p2')
    expect(ex?.reason).toBe<SoftCleanupExclusionReason>('above_soft_max_sim')
  })

  it('does NOT exclude candidate with cosine equal to softMaxSim (strict greater-than only)', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const positiveEmbedding = unitVec(0.5)
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'BBB-002' }), embedding: unitVec(0.5) },
    ]
    const result = applySoftCleanup(positive, candidates, {
      softMaxSim: 1.0,
      positiveEmbedding,
    })
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].product.id).toBe('p2')
  })
})

describe('applySoftCleanup — non-exclusion guarantees (anti-broadening)', () => {
  it('keeps semantically close but not structurally equivalent candidates below softMaxSim', () => {
    const positive = product({ id: 'p1', name: 'Olive Oil A', category: 'food', sku: 'OILA-001' })
    const candidates: SoftCleanupCandidate[] = [
      {
        product: product({ id: 'p2', name: 'Sunflower Oil', category: 'food', sku: 'SUNF-001' }),
        embedding: unitVec(0.5),
      },
    ]
    const result = applySoftCleanup(positive, candidates, {
      softMaxSim: 0.92,
      positiveEmbedding: orthogonalLike(0),
    })
    expect(result.kept).toHaveLength(1)
    expect(result.excluded).toHaveLength(0)
  })

  it('does NOT exclude by same category + supplierName (legacy broad rule must NOT come back)', () => {
    const positive = product({
      id: 'p1',
      name: 'Brand A Cookies',
      category: 'food',
      sku: 'COOKIE-A-001',
      supplierName: 'AcmeCorp',
    })
    const candidates: SoftCleanupCandidate[] = [
      {
        product: product({
          id: 'p2',
          name: 'Brand A Crackers',
          category: 'food',
          sku: 'CRACKER-A-001',
          supplierName: 'AcmeCorp',
        }),
      },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(1)
    expect(result.kept[0].product.id).toBe('p2')
  })

  it('does NOT exclude by a low semantic threshold (legacy 0.65 must NOT come back)', () => {
    // Force similarity ~0.70 — legacy threshold 0.65 would have excluded this;
    // M23 threshold default is 0.92, so candidate must be kept.
    // a=[1,0,...], b=[0.7, sqrt(1-0.49)=~0.7141, 0,...] yields cosine ~0.70.
    const dims = 8
    const a = new Array<number>(dims).fill(0)
    const b = new Array<number>(dims).fill(0)
    a[0] = 1
    b[0] = 0.7
    b[1] = Math.sqrt(1 - 0.49)
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'BBB-001' }), embedding: b },
    ]
    const result = applySoftCleanup(positive, candidates, {
      softMaxSim: 0.92,
      positiveEmbedding: a,
    })
    expect(result.kept).toHaveLength(1)
  })
})

describe('applySoftCleanup — graceful degradation when metadata is missing', () => {
  it('does not exclude when SKU family is not derivable on either side', () => {
    const positive = product({ id: 'p1', sku: 'SINGLETOKEN' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'OTHER' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(1)
  })

  it('does not exclude trivial variation when SKU family is missing on one side', () => {
    const positive = product({
      id: 'p1',
      name: 'Olive Oil',
      category: 'food',
      sku: 'OIL-01-500ML',
    })
    const candidates: SoftCleanupCandidate[] = [
      // same name + same category, but no derivable SKU family — trivial rule must NOT fire
      { product: product({ id: 'p2', name: 'Olive Oil', category: 'food', sku: 'PLAIN' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(1)
  })

  it('does not exclude trivial variation when categories differ', () => {
    const positive = product({
      id: 'p1',
      name: 'Olive Oil',
      category: 'food',
      sku: 'OIL-01-500ML',
    })
    const candidates: SoftCleanupCandidate[] = [
      // same name and same SKU family, but different category — trivial rule must NOT fire
      { product: product({ id: 'p2', name: 'Olive Oil', category: 'cosmetics', sku: 'OIL-01-1L' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(1)
  })

  it('skips cosine check when either embedding is missing (no broadening)', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const candidates: SoftCleanupCandidate[] = [
      // No embedding provided on candidate; positiveEmbedding also absent.
      { product: product({ id: 'p2', sku: 'BBB-001' }) },
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept).toHaveLength(1)
  })

  it('zero-norm embeddings degrade to no exclusion via cosine', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const dims = 8
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'BBB-001' }), embedding: new Array(dims).fill(0) },
    ]
    const result = applySoftCleanup(positive, candidates, {
      softMaxSim: 0.92,
      positiveEmbedding: new Array(dims).fill(0),
    })
    expect(result.kept).toHaveLength(1)
  })
})

describe('applySoftCleanup — determinism and ordering', () => {
  it('preserves input order in kept and excluded lists', () => {
    const positive = product({ id: 'p0', sku: 'POS-A-001' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'a', sku: 'OTHER-X-001' }) },
      { product: product({ id: 'b', sku: 'POS-A-002' }) }, // same family
      { product: product({ id: 'c', sku: 'OTHER-Y-001' }) },
      { product: product({ id: 'd', sku: 'POS-A-003' }) }, // same family
    ]
    const result = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(result.kept.map((c) => c.product.id)).toEqual(['a', 'c'])
    expect(result.excluded.map((c) => c.product.id)).toEqual(['b', 'd'])
  })

  it('returns same result on repeated calls with same input', () => {
    const positive = product({ id: 'p1', sku: 'AAA-001' })
    const candidates: SoftCleanupCandidate[] = [
      { product: product({ id: 'p2', sku: 'AAA-002' }) },
      { product: product({ id: 'p3', sku: 'BBB-001' }) },
    ]
    const a = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    const b = applySoftCleanup(positive, candidates, { softMaxSim: 0.92 })
    expect(a).toEqual(b)
  })
})

describe('isSoftCleanupExclusion type guard', () => {
  it('matches all known reasons', () => {
    expect(isSoftCleanupExclusion('same_product_id')).toBe(true)
    expect(isSoftCleanupExclusion('same_sku_family')).toBe(true)
    expect(isSoftCleanupExclusion('trivial_variation')).toBe(true)
    expect(isSoftCleanupExclusion('above_soft_max_sim')).toBe(true)
  })

  it('rejects unrelated strings', () => {
    expect(isSoftCleanupExclusion('category_supplier')).toBe(false)
    expect(isSoftCleanupExclusion('')).toBe(false)
  })
})
