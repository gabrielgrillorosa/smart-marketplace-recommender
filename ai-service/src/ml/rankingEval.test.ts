import { describe, it, expect } from 'vitest'
import * as tf from '@tensorflow/tfjs-node'
import {
  computePrecisionAtK,
  ndcgAtK,
  meanReciprocalRank,
  pairwiseAccuracyWithinCategory,
  topNAfterFirstInteractionProxy,
} from './rankingEval.js'
import type { ClientDTO } from '../services/training-utils.js'
import type { OrderDTO } from '../services/training-data-fetch.js'

function emb(dims: number, v: number): number[] {
  return new Array<number>(dims).fill(v)
}

describe('computePrecisionAtK (M21 A pooling)', () => {
  it('matches between mean and attention_light with uniform temperature on a minimal fixture', () => {
    const clients: ClientDTO[] = [{ id: 'c1', name: 'C1', segment: 'x', countryCode: 'BR' }]
    const orders: OrderDTO[] = [
      { id: 'o1', clientId: 'c1', items: [{ productId: 'p1', quantity: 1 }], orderDate: '2026-01-01T00:00:00.000Z' },
      { id: 'o2', clientId: 'c1', items: [{ productId: 'p2', quantity: 1 }], orderDate: '2026-01-02T00:00:00.000Z' },
    ]
    const d = 384
    const productEmbeddingMap = new Map<string, number[]>([
      ['p1', emb(d, 0.1)],
      ['p2', emb(d, 0.2)],
      ['p3', emb(d, 0.3)],
    ])

    const mockModel = {
      predict: (input: tf.Tensor) => {
        const n = input.shape[0] ?? 0
        return tf.ones([n, 1])
      },
    } as unknown as tf.LayersModel

    const pm = computePrecisionAtK(clients, orders, productEmbeddingMap, mockModel, 5, {
      mode: 'mean',
      halfLifeDays: 30,
    })
    const pa = computePrecisionAtK(clients, orders, productEmbeddingMap, mockModel, 5, {
      mode: 'attention_light',
      halfLifeDays: 30,
      attentionTemperature: Number.POSITIVE_INFINITY,
    })
    expect(pm).toBe(pa)
    expect(pm).toBeGreaterThanOrEqual(0)
    expect(pm).toBeLessThanOrEqual(1)
  })
})

/**
 * M23 — T23-7 ranking metrics. These are pure helpers and intentionally
 * decoupled from `tf` / model so we can pin the math on small fixtures
 * the way the M23 spec asks (`NDCG@K`, `MRR`, intra-category pairwise
 * accuracy, top-N proxy). Fixtures are tiny on purpose.
 */
describe('ndcgAtK', () => {
  it('returns 1 when the top-ranked item is the held-out positive', () => {
    const ranked = ['a', 'b', 'c', 'd']
    const relevant = new Set(['a'])
    expect(ndcgAtK(ranked, relevant, 4)).toBeCloseTo(1, 12)
  })

  it('returns 0 when no held-out positive is ranked within K', () => {
    const ranked = ['a', 'b', 'c']
    const relevant = new Set(['z'])
    expect(ndcgAtK(ranked, relevant, 3)).toBe(0)
  })

  it('matches the textbook formula for a single relevant at rank 2', () => {
    // DCG = 1/log2(2+1) = 1/log2(3); IDCG (1 relevant) = 1/log2(1+1) = 1
    const ranked = ['x', 'a', 'y']
    const relevant = new Set(['a'])
    const expected = 1 / Math.log2(3) // because IDCG=1
    expect(ndcgAtK(ranked, relevant, 3)).toBeCloseTo(expected, 12)
  })

  it('is bounded by 1 when there are multiple relevant items perfectly ordered', () => {
    const ranked = ['a', 'b', 'c']
    const relevant = new Set(['a', 'b'])
    expect(ndcgAtK(ranked, relevant, 3)).toBeCloseTo(1, 12)
  })

  it('returns 0 when ranked list is empty', () => {
    expect(ndcgAtK([], new Set(['a']), 5)).toBe(0)
  })
})

describe('meanReciprocalRank', () => {
  it('returns 1 when first item is relevant', () => {
    const samples = [{ ranked: ['a', 'b', 'c'], relevant: new Set(['a']) }]
    expect(meanReciprocalRank(samples)).toBe(1)
  })

  it('returns 1/2 when relevant is at rank 2', () => {
    const samples = [{ ranked: ['x', 'a', 'b'], relevant: new Set(['a']) }]
    expect(meanReciprocalRank(samples)).toBe(0.5)
  })

  it('averages reciprocal ranks across samples (1 + 1/2 + 0)/3', () => {
    const samples = [
      { ranked: ['a', 'b'], relevant: new Set(['a']) },
      { ranked: ['x', 'b'], relevant: new Set(['b']) },
      { ranked: ['x', 'y'], relevant: new Set(['z']) },
    ]
    expect(meanReciprocalRank(samples)).toBeCloseTo((1 + 0.5 + 0) / 3, 12)
  })

  it('returns 0 for empty input', () => {
    expect(meanReciprocalRank([])).toBe(0)
  })
})

describe('pairwiseAccuracyWithinCategory', () => {
  it('counts a correct pair when positive scores higher than a same-category negative', () => {
    const samples = [
      {
        positiveCategory: 'food',
        positiveScore: 0.9,
        negatives: [
          { score: 0.4, sameCategory: true },
          { score: 0.95, sameCategory: false },
        ],
      },
    ]
    expect(pairwiseAccuracyWithinCategory(samples)).toBe(1)
  })

  it('returns 0 when no same-category pair exists', () => {
    const samples = [
      {
        positiveCategory: 'food',
        positiveScore: 0.9,
        negatives: [{ score: 0.95, sameCategory: false }],
      },
    ]
    expect(pairwiseAccuracyWithinCategory(samples)).toBe(0)
  })

  it('treats ties as 0.5 (concordance fraction)', () => {
    const samples = [
      {
        positiveCategory: 'food',
        positiveScore: 0.5,
        negatives: [{ score: 0.5, sameCategory: true }],
      },
    ]
    expect(pairwiseAccuracyWithinCategory(samples)).toBe(0.5)
  })

  it('averages over all valid same-category pairs across samples', () => {
    const samples = [
      {
        positiveCategory: 'food',
        positiveScore: 0.9,
        negatives: [
          { score: 0.4, sameCategory: true },
          { score: 0.95, sameCategory: true },
        ],
      },
      {
        positiveCategory: 'tools',
        positiveScore: 0.5,
        negatives: [{ score: 0.5, sameCategory: true }],
      },
    ]
    expect(pairwiseAccuracyWithinCategory(samples)).toBeCloseTo((1 + 0 + 0.5) / 3, 12)
  })
})

describe('topNAfterFirstInteractionProxy', () => {
  it('proxies cold-start by counting clients whose held-out hits at top-N (slice >= 1 history)', () => {
    const samples = [
      { trainHistorySize: 1, ranked: ['a', 'b', 'c'], relevant: new Set(['a']) },
      { trainHistorySize: 1, ranked: ['x', 'y'], relevant: new Set(['z']) },
      { trainHistorySize: 0, ranked: ['a'], relevant: new Set(['a']) },
    ]
    const result = topNAfterFirstInteractionProxy(samples, 2)
    expect(result.clients).toBe(2)
    expect(result.hitRate).toBeCloseTo(0.5, 12)
  })

  it('returns hitRate=0 and clients=0 when no client has the minimum interaction history', () => {
    const samples = [{ trainHistorySize: 0, ranked: ['a'], relevant: new Set(['a']) }]
    const result = topNAfterFirstInteractionProxy(samples, 2)
    expect(result.clients).toBe(0)
    expect(result.hitRate).toBe(0)
  })
})
