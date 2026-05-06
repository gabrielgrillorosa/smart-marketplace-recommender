import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../tests/helpers/buildApp.js'

const productEventBody = {
  productId: 'prod-sync-001',
  sku: 'SKU-SYNC-001',
  name: 'Test Product',
  description: 'A fresh product for sync',
  category: 'beverages',
  price: 12.99,
  supplierId: 'supplier-001',
  supplierName: 'Supplier One',
  supplierCountryCode: 'BR',
  countryCodes: ['BR', 'MX'],
}

const checkoutEventBody = {
  orderId: 'order-123',
  clientId: 'client-001',
  orderDate: '2024-01-15T12:00:00.000Z',
  items: [
    {
      productId: 'prod-001',
      quantity: 2,
      unitPrice: 10.5,
    },
  ],
}

describe('integrationEventsRoutes', () => {
  const originalEnv = process.env.CHECKOUT_ENQUEUE_TRAINING

  beforeEach(() => {
    process.env.CHECKOUT_ENQUEUE_TRAINING = 'true'
  })

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CHECKOUT_ENQUEUE_TRAINING
    } else {
      process.env.CHECKOUT_ENQUEUE_TRAINING = originalEnv
    }
  })

  it('POST /events/product-upserted computes embedding and upserts full projection', async () => {
    const repo = {
      upsertProductProjectionWithEmbedding: vi.fn().mockResolvedValue(undefined),
    }
    const embeddingService = {
      embedText: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      isReady: true,
    }

    const app = await buildApp({
      neo4jRepo: repo as never,
      embeddingService: embeddingService as never,
      modelStore: {},
      modelTrainer: {},
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events/product-upserted',
      payload: productEventBody,
    })

    expect(response.statusCode).toBe(200)
    expect(embeddingService.embedText).toHaveBeenCalledOnce()
    expect(repo.upsertProductProjectionWithEmbedding).toHaveBeenCalledWith(
      {
        id: 'prod-sync-001',
        sku: 'SKU-SYNC-001',
        name: 'Test Product',
        description: 'A fresh product for sync',
        category: 'beverages',
        price: 12.99,
        supplierId: 'supplier-001',
        supplierName: 'Supplier One',
        supplierCountryCode: 'BR',
        countryCodes: ['BR', 'MX'],
      },
      [0.1, 0.2, 0.3]
    )
  })

  it('POST /events/order-checkout-completed syncs BOUGHT edges and enqueues checkout training', async () => {
    const repo = {
      syncBoughtRelationships: vi.fn().mockResolvedValue({ created: 1, existed: 0, skipped: 0 }),
    }
    const registry = {
      enqueue: vi.fn().mockReturnValue({ jobId: 'job-1', status: 'queued', message: 'Training job queued' }),
      getActiveJobId: vi.fn(),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo as never,
      embeddingService: { embedText: vi.fn(), isReady: true } as never,
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/events/order-checkout-completed',
      payload: checkoutEventBody,
    })

    expect(response.statusCode).toBe(202)
    expect(repo.syncBoughtRelationships).toHaveBeenCalledWith([
      {
        clientId: 'client-001',
        productId: 'prod-001',
        orderId: 'order-123',
        orderDate: '2024-01-15T12:00:00.000Z',
        quantity: 2,
      },
    ])
    expect(registry.enqueue).toHaveBeenCalledWith({
      triggeredBy: 'checkout',
      orderId: 'order-123',
      strategy: 'queue',
    })
  })
})
