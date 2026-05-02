import { describe, it, expect } from 'vitest'
import { buildClientPurchaseTemporalMap } from './training-temporal-map.js'
import type { OrderDTO } from './training-data-fetch.js'

describe('buildClientPurchaseTemporalMap', () => {
  it('computes per-product max purchase iso and client T_ref from snapshot', () => {
    const orders: OrderDTO[] = [
      {
        id: 'o1',
        clientId: 'c1',
        items: [{ productId: 'p1', quantity: 1 }],
        orderDate: '2026-01-01T10:00:00.000Z',
      },
      {
        id: 'o2',
        clientId: 'c1',
        items: [{ productId: 'p1', quantity: 2 }],
        orderDate: '2026-03-01T10:00:00.000Z',
      },
      {
        id: 'o3',
        clientId: 'c1',
        items: [{ productId: 'p2', quantity: 1 }],
        orderDate: '2026-02-15T10:00:00.000Z',
      },
    ]
    const m = buildClientPurchaseTemporalMap(orders)
    expect(m.tRefIsoByClient.get('c1')).toBe('2026-03-01T10:00:00.000Z')
    expect(m.lastPurchaseIsoByClientProduct.get('c1::p1')).toBe('2026-03-01T10:00:00.000Z')
    expect(m.lastPurchaseIsoByClientProduct.get('c1::p2')).toBe('2026-02-15T10:00:00.000Z')
    expect(m.clientPurchasedProducts.get('c1')?.has('p1')).toBe(true)
    expect(m.clientPurchasedProducts.get('c1')?.has('p2')).toBe(true)
  })

  it('skips orders without parsable date', () => {
    const orders: OrderDTO[] = [
      {
        id: 'o1',
        clientId: 'c1',
        items: [{ productId: 'p1', quantity: 1 }],
        orderDate: undefined,
      },
    ]
    const m = buildClientPurchaseTemporalMap(orders)
    expect(m.tRefIsoByClient.size).toBe(0)
  })
})
