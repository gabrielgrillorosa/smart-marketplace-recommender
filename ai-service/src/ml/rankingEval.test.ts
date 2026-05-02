import { describe, it, expect } from 'vitest'
import * as tf from '@tensorflow/tfjs-node'
import { computePrecisionAtK } from './rankingEval.js'
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
