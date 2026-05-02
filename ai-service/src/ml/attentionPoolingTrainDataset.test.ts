import { describe, it, expect } from 'vitest'
import type { OrderDTO } from '../services/training-data-fetch.js'
import { buildAttentionPoolingBinaryDataset } from './attentionPoolingTrainDataset.js'

describe('buildAttentionPoolingBinaryDataset', () => {
  it('labels purchases with a later order as positive and adds negatives', () => {
    const orders: OrderDTO[] = [
      { id: 'o1', clientId: 'c1', orderDate: '2020-01-01T00:00:00.000Z', items: [{ productId: 'p1', quantity: 1 }] },
      { id: 'o2', clientId: 'c1', orderDate: '2020-02-01T00:00:00.000Z', items: [{ productId: 'p2', quantity: 1 }] },
    ]
    const productEmbeddingMap = new Map<string, number[]>([
      ['p1', [1, 0, 0]],
      ['p2', [0, 1, 0]],
      ['p3', [0, 0, 1]],
    ])
    const rows = buildAttentionPoolingBinaryDataset(orders, productEmbeddingMap, {
      negativesPerPositive: 1,
      seed: 123,
    })
    const pos = rows.filter((r) => r.label === 1)
    const neg = rows.filter((r) => r.label === 0)
    expect(pos.length).toBe(1)
    expect(pos[0]!.embedding).toEqual([1, 0, 0])
    expect(neg.length).toBeGreaterThanOrEqual(1)
    expect(neg.every((r) => r.embedding.length === 3)).toBe(true)
  })

  it('returns empty when every client has fewer than two dated purchases', () => {
    const orders: OrderDTO[] = [
      { id: 'o1', clientId: 'c1', orderDate: '2020-01-01T00:00:00.000Z', items: [{ productId: 'p1', quantity: 1 }] },
    ]
    const productEmbeddingMap = new Map<string, number[]>([['p1', [1, 0, 0]]])
    const rows = buildAttentionPoolingBinaryDataset(orders, productEmbeddingMap, {
      negativesPerPositive: 2,
      seed: 1,
    })
    expect(rows).toEqual([])
  })
})
