import { describe, it, expect, vi } from 'vitest'
import { DemoBuyService } from './DemoBuyService.js'
import { ClientNoPurchaseHistoryError } from './RecommendationService.js'
import { ClientNotFoundError, ProductNotFoundError } from '../repositories/Neo4jRepository.js'

const makeRepo = (overrides: Record<string, unknown> = {}) => ({
  createDemoBoughtAndGetEmbeddings: vi.fn(),
  deleteDemoBoughtAndGetEmbeddings: vi.fn(),
  clearAllDemoBoughtAndGetEmbeddings: vi.fn(),
  ...overrides,
})

const makeRecommendService = (overrides: Record<string, unknown> = {}) => ({
  recommendFromVector: vi.fn(),
  ...overrides,
})

const EMBEDDING_A = Array.from({ length: 384 }, (_, i) => i * 0.001)
const EMBEDDING_B = Array.from({ length: 384 }, (_, i) => (i + 1) * 0.001)

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

describe('DemoBuyService', () => {
  describe('demoBuy', () => {
    it('returns recommendations on success', async () => {
      const repo = makeRepo({
        createDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([EMBEDDING_A, EMBEDDING_B]),
      })
      const recService = makeRecommendService({
        recommendFromVector: vi.fn().mockResolvedValue(MOCK_RECS),
      })
      const service = new DemoBuyService(repo as never, recService as never)

      const result = await service.demoBuy('client-001', 'prod-001', 10)

      expect(repo.createDemoBoughtAndGetEmbeddings).toHaveBeenCalledWith('client-001', 'prod-001')
      expect(recService.recommendFromVector).toHaveBeenCalledWith('client-001', 10, expect.any(Array))
      expect(result).toEqual(MOCK_RECS)
    })

    it('throws ClientNoPurchaseHistoryError on cold start (M9A-32)', async () => {
      const repo = makeRepo({
        createDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([]),
      })
      const recService = makeRecommendService()
      const service = new DemoBuyService(repo as never, recService as never)

      await expect(service.demoBuy('client-001', 'prod-001')).rejects.toThrow(ClientNoPurchaseHistoryError)
      expect(recService.recommendFromVector).not.toHaveBeenCalled()
    })

    it('propagates ClientNotFoundError from repo', async () => {
      const repo = makeRepo({
        createDemoBoughtAndGetEmbeddings: vi.fn().mockRejectedValue(new ClientNotFoundError()),
      })
      const recService = makeRecommendService()
      const service = new DemoBuyService(repo as never, recService as never)

      await expect(service.demoBuy('unknown', 'prod-001')).rejects.toThrow(ClientNotFoundError)
    })

    it('propagates ProductNotFoundError from repo', async () => {
      const repo = makeRepo({
        createDemoBoughtAndGetEmbeddings: vi.fn().mockRejectedValue(new ProductNotFoundError()),
      })
      const recService = makeRecommendService()
      const service = new DemoBuyService(repo as never, recService as never)

      await expect(service.demoBuy('client-001', 'unknown-prod')).rejects.toThrow(ProductNotFoundError)
    })
  })

  describe('undoDemoBuy', () => {
    it('returns recommendations after undo', async () => {
      const repo = makeRepo({
        deleteDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([EMBEDDING_A]),
      })
      const recService = makeRecommendService({
        recommendFromVector: vi.fn().mockResolvedValue(MOCK_RECS),
      })
      const service = new DemoBuyService(repo as never, recService as never)

      const result = await service.undoDemoBuy('client-001', 'prod-001', 10)

      expect(repo.deleteDemoBoughtAndGetEmbeddings).toHaveBeenCalledWith('client-001', 'prod-001')
      expect(result).toEqual(MOCK_RECS)
    })

    it('returns empty array when no embeddings remain after undo', async () => {
      const repo = makeRepo({
        deleteDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([]),
      })
      const recService = makeRecommendService()
      const service = new DemoBuyService(repo as never, recService as never)

      const result = await service.undoDemoBuy('client-001', 'prod-001')

      expect(result).toEqual([])
      expect(recService.recommendFromVector).not.toHaveBeenCalled()
    })
  })

  describe('clearAllDemoBought', () => {
    it('returns empty array when 0 demo purchases (M9A-28 — idempotent)', async () => {
      const repo = makeRepo({
        clearAllDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([]),
      })
      const recService = makeRecommendService()
      const service = new DemoBuyService(repo as never, recService as never)

      const result = await service.clearAllDemoBought('client-001')

      expect(result).toEqual([])
      expect(recService.recommendFromVector).not.toHaveBeenCalled()
    })

    it('returns recommendations after clearing demos with real purchases remaining', async () => {
      const repo = makeRepo({
        clearAllDemoBoughtAndGetEmbeddings: vi.fn().mockResolvedValue([EMBEDDING_A, EMBEDDING_B]),
      })
      const recService = makeRecommendService({
        recommendFromVector: vi.fn().mockResolvedValue(MOCK_RECS),
      })
      const service = new DemoBuyService(repo as never, recService as never)

      const result = await service.clearAllDemoBought('client-001', 5)

      expect(result).toEqual(MOCK_RECS)
      expect(recService.recommendFromVector).toHaveBeenCalledWith('client-001', 5, expect.any(Array))
    })
  })
})
