import { describe, expect, it, vi } from 'vitest'
import { buildApp } from '../tests/helpers/buildApp.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

const sampleOrderDate = '2024-01-15T12:00:00.000Z'
const sampleOrderDateIso = new Date(sampleOrderDate).toISOString()

describe('ordersRoutes', () => {
  it('POST /orders/:orderId/sync-and-train syncs BOUGHT edges and enqueues checkout training', async () => {
    const repo = {
      syncBoughtRelationships: vi.fn().mockResolvedValue({ created: 2, existed: 0, skipped: 0 }),
    }
    const registry = {
      enqueue: vi.fn().mockReturnValue({ jobId: 'job-1', status: 'queued', message: 'Training job queued' }),
      getActiveJobId: vi.fn(),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo,
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/order-123/sync-and-train',
      payload: {
        clientId: 'client-001',
        productIds: ['prod-001', 'prod-002'],
        orderDate: sampleOrderDate,
      },
    })

    expect(response.statusCode).toBe(202)
    expect(repo.syncBoughtRelationships).toHaveBeenCalledWith([
      {
        clientId: 'client-001',
        productId: 'prod-001',
        orderId: 'order-123',
        orderDate: sampleOrderDateIso,
      },
      {
        clientId: 'client-001',
        productId: 'prod-002',
        orderId: 'order-123',
        orderDate: sampleOrderDateIso,
      },
    ])
    expect(registry.enqueue).toHaveBeenCalledWith({
      triggeredBy: 'checkout',
      orderId: 'order-123',
      strategy: 'queue',
    })
  })

  it('returns 400 when payload is malformed', async () => {
    const repo = {
      syncBoughtRelationships: vi.fn(),
    }
    const registry = {
      enqueue: vi.fn(),
      getActiveJobId: vi.fn(),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo,
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/order-123/sync-and-train',
      payload: {
        clientId: 'client-001',
        productIds: [],
        orderDate: sampleOrderDate,
      },
    })

    expect(response.statusCode).toBe(400)
    expect(repo.syncBoughtRelationships).not.toHaveBeenCalled()
    expect(registry.enqueue).not.toHaveBeenCalled()
  })

  it('returns 400 when orderDate is missing', async () => {
    const repo = { syncBoughtRelationships: vi.fn() }
    const registry = {
      enqueue: vi.fn(),
      getActiveJobId: vi.fn(),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo,
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/order-123/sync-and-train',
      payload: {
        clientId: 'client-001',
        productIds: ['prod-001'],
      },
    })

    expect(response.statusCode).toBe(400)
    expect(repo.syncBoughtRelationships).not.toHaveBeenCalled()
  })

  it('returns 503 when Neo4j sync fails', async () => {
    const repo = {
      syncBoughtRelationships: vi.fn().mockRejectedValue(new Neo4jUnavailableError()),
    }
    const registry = {
      enqueue: vi.fn(),
      getActiveJobId: vi.fn(),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo,
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/order-123/sync-and-train',
      payload: {
        clientId: 'client-001',
        productIds: ['prod-001'],
        orderDate: sampleOrderDate,
      },
    })

    expect(response.statusCode).toBe(503)
    expect(registry.enqueue).not.toHaveBeenCalled()
  })

  it('keeps queue semantics for checkout even when another job is active', async () => {
    const repo = {
      syncBoughtRelationships: vi.fn().mockResolvedValue({ created: 1, existed: 0, skipped: 0 }),
    }
    const registry = {
      enqueue: vi.fn().mockReturnValue({
        jobId: 'job-queued-after-active',
        status: 'queued',
        message: 'Training job queued',
      }),
      getActiveJobId: vi.fn().mockReturnValue('job-running'),
      getJob: vi.fn(),
    }

    const app = await buildApp({
      neo4jRepo: repo,
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      trainingJobRegistry: registry as never,
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders/order-999/sync-and-train',
      payload: {
        clientId: 'client-001',
        productIds: ['prod-001'],
        orderDate: sampleOrderDate,
      },
    })

    expect(response.statusCode).toBe(202)
    expect(registry.enqueue).toHaveBeenCalledWith({
      triggeredBy: 'checkout',
      orderId: 'order-999',
      strategy: 'queue',
    })
  })
})
