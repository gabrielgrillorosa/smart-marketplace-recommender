import { describe, it, expect, vi } from 'vitest'
import { buildApp } from '../tests/helpers/buildApp.js'
import { ClientNotFoundError, ProductNotFoundError } from '../repositories/Neo4jRepository.js'
import { ClientNoPurchaseHistoryError, ModelNotTrainedError } from '../services/RecommendationService.js'

const MOCK_RECS = [
  {
    id: 'prod-001',
    name: 'Product A',
    category: 'beverages',
    price: 10,
    sku: 'SKU-001',
    finalScore: 0.9,
    neuralScore: 0.85,
    semanticScore: 0.8,
    matchReason: 'neural' as const,
  },
]

const makeDemoBuyService = (overrides: Record<string, unknown> = {}) => ({
  demoBuy: vi.fn().mockResolvedValue(MOCK_RECS),
  undoDemoBuy: vi.fn().mockResolvedValue(MOCK_RECS),
  clearAllDemoBought: vi.fn().mockResolvedValue([]),
  ...overrides,
})

const buildTestApp = async (demoBuyService: ReturnType<typeof makeDemoBuyService>) =>
  buildApp({
    neo4jRepo: {},
    embeddingService: {},
    modelStore: {},
    modelTrainer: {},
    recommendationService: {},
    ragService: {},
    searchService: {},
    demoBuyService: demoBuyService as never,
  })

describe('demoBuyRoutes', () => {
  describe('POST /api/v1/demo-buy', () => {
    it('returns 200 with recommendations on success (M9A-08)', async () => {
      const app = await buildTestApp(makeDemoBuyService())
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'client-001', productId: 'prod-001', limit: 5 },
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body.recommendations).toEqual(MOCK_RECS)
    })

    it('returns 400 when clientId is missing', async () => {
      const app = await buildTestApp(makeDemoBuyService())
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { productId: 'prod-001' },
      })
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload).error).toMatch(/clientId/)
    })

    it('returns 400 when productId is missing', async () => {
      const app = await buildTestApp(makeDemoBuyService())
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'client-001' },
      })
      expect(response.statusCode).toBe(400)
      expect(JSON.parse(response.payload).error).toMatch(/productId/)
    })

    it('returns 404 when client not found (M9A-12)', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ demoBuy: vi.fn().mockRejectedValue(new ClientNotFoundError()) })
      )
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'unknown', productId: 'prod-001' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns 404 when product not found (M9A-12)', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ demoBuy: vi.fn().mockRejectedValue(new ProductNotFoundError()) })
      )
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'client-001', productId: 'unknown' },
      })
      expect(response.statusCode).toBe(404)
    })

    it('returns 422 when client has no purchase history (M9A-17)', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ demoBuy: vi.fn().mockRejectedValue(new ClientNoPurchaseHistoryError()) })
      )
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'client-001', productId: 'prod-001' },
      })
      expect(response.statusCode).toBe(422)
    })

    it('returns 503 when model not trained (M9A-13)', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ demoBuy: vi.fn().mockRejectedValue(new ModelNotTrainedError()) })
      )
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/demo-buy',
        payload: { clientId: 'client-001', productId: 'prod-001' },
      })
      expect(response.statusCode).toBe(503)
    })
  })

  describe('DELETE /api/v1/demo-buy/:clientId/:productId', () => {
    it('returns 200 with recommendations on success (M9A-14)', async () => {
      const app = await buildTestApp(makeDemoBuyService())
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/demo-buy/client-001/prod-001',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('recommendations')
    })

    it('returns 404 when client not found', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ undoDemoBuy: vi.fn().mockRejectedValue(new ClientNotFoundError()) })
      )
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/demo-buy/unknown/prod-001',
      })
      expect(response.statusCode).toBe(404)
    })
  })

  describe('DELETE /api/v1/demo-buy/:clientId', () => {
    it('returns 200 with empty recommendations on bulk clear (M9A-16)', async () => {
      const app = await buildTestApp(makeDemoBuyService())
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/demo-buy/client-001',
      })
      expect(response.statusCode).toBe(200)
      const body = JSON.parse(response.payload)
      expect(body).toHaveProperty('recommendations')
    })

    it('returns 404 when client not found', async () => {
      const app = await buildTestApp(
        makeDemoBuyService({ clearAllDemoBought: vi.fn().mockRejectedValue(new ClientNotFoundError()) })
      )
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/demo-buy/unknown',
      })
      expect(response.statusCode).toBe(404)
    })
  })
})
