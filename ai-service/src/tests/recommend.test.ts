import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import {
  ModelNotTrainedError,
  computeFinalScore,
  maxCosineToAnchors,
  RecommendationService,
} from '../services/RecommendationService.js'
import { Neo4jUnavailableError, ClientNotFoundError } from '../repositories/Neo4jRepository.js'

describe('POST /api/v1/recommend', () => {
  it('returns 200 with rankingConfig and recommendations envelope (ADR-063)', async () => {
    const mockEnvelope = {
      recommendations: [
        {
          id: 'prod-001',
          name: 'Test Product A',
          category: 'beverages',
          price: 12.99,
          sku: 'SKU-001',
          finalScore: 0.85,
          neuralScore: 0.9,
          semanticScore: 0.75,
          matchReason: 'neural' as const,
          eligible: true,
          eligibilityReason: 'eligible' as const,
          suppressionUntil: null,
          hybridNeuralTerm: 0.54,
          hybridSemanticTerm: 0.3,
          recencyBoostTerm: 0,
        },
      ],
      rankingConfig: { neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 },
    }

    const mockRecommendationService = {
      recommend: vi.fn().mockResolvedValue(mockEnvelope),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001', limit: 5 },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.rankingConfig).toEqual({ neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 })
    expect(Array.isArray(body.recommendations)).toBe(true)
    expect(body.recommendations).toHaveLength(1)
    expect(body.recommendations[0]).toHaveProperty('finalScore')
    expect(body.recommendations[0]).toHaveProperty('hybridNeuralTerm')
    expect(body.recommendations[0]).toHaveProperty('matchReason')
    expect(['neural', 'semantic', 'hybrid']).toContain(body.recommendations[0].matchReason)
  })

  it('returns 200 with bare recommendations array when service returns array (legacy mock)', async () => {
    const mockRecommendations = [
      {
        id: 'prod-legacy',
        name: 'Legacy shape',
        category: 'beverages',
        price: 1,
        sku: 'LEG',
        finalScore: 0.5,
        neuralScore: 0.5,
        semanticScore: 0.5,
        matchReason: 'hybrid' as const,
        eligible: true,
        eligibilityReason: 'eligible' as const,
        suppressionUntil: null,
      },
    ]

    const mockRecommendationService = {
      recommend: vi.fn().mockResolvedValue(mockRecommendations),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001', limit: 5 },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(Array.isArray(body)).toBe(true)
    expect(body[0].sku).toBe('LEG')
  })

  it('returns 503 when Neo4j is unavailable', async () => {
    const mockRecommendationService = {
      recommend: vi.fn().mockRejectedValue(new Neo4jUnavailableError()),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001' },
    })

    expect(response.statusCode).toBe(503)
    const body = JSON.parse(response.payload)
    expect(body).toHaveProperty('error')
  })

  it('returns 503 when model is not trained', async () => {
    const mockRecommendationService = {
      recommend: vi.fn().mockRejectedValue(new ModelNotTrainedError()),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001' },
    })

    expect(response.statusCode).toBe(503)
  })

  it('returns 400 when clientId is missing', async () => {
    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 200 with recommendations envelope when eligibilityOnly is true', async () => {
    const mockRows = [
      {
        id: 'p1',
        name: 'A',
        category: 'beverages',
        price: 1,
        sku: 's',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'recently_purchased' as const,
        suppressionUntil: '2026-05-01T00:00:00.000Z',
      },
    ]
    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendEligibilityOnly: vi.fn().mockResolvedValue(mockRows),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001', eligibilityOnly: true, productIds: ['x'] },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.recommendations).toEqual(mockRows)
    expect(mockRecommendationService.recommendEligibilityOnly).toHaveBeenCalledWith('client-001', ['x'])
    expect(mockRecommendationService.recommend).not.toHaveBeenCalled()
  })

  it('M18 — eligibilityOnly HTTP omits no_embedding and in_cart like full recommend', async () => {
    const mockRows = [
      {
        id: 'recent',
        name: 'R',
        category: 'beverages',
        price: 1,
        sku: 'r',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'recently_purchased' as const,
        suppressionUntil: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'cart',
        name: 'C',
        category: 'beverages',
        price: 1,
        sku: 'c',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'in_cart' as const,
        suppressionUntil: null,
      },
      {
        id: 'noemb',
        name: 'N',
        category: 'beverages',
        price: 1,
        sku: 'n',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'no_embedding' as const,
        suppressionUntil: null,
      },
    ]
    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendEligibilityOnly: vi.fn().mockResolvedValue(mockRows),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001', eligibilityOnly: true, productIds: [] },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.recommendations).toHaveLength(1)
    expect(body.recommendations[0].id).toBe('recent')
  })

  it('M18 — full recommend HTTP filters merged rows from service', async () => {
    const mockRecommendations = [
      {
        id: 'e1',
        name: 'Eligible',
        category: 'beverages',
        price: 1,
        sku: 'e1',
        finalScore: 0.9,
        neuralScore: 0.9,
        semanticScore: 0.8,
        matchReason: 'neural' as const,
        eligible: true,
        eligibilityReason: 'eligible' as const,
        suppressionUntil: null,
      },
      {
        id: 'r1',
        name: 'Recent',
        category: 'beverages',
        price: 1,
        sku: 'r1',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'recently_purchased' as const,
        suppressionUntil: '2026-06-01T00:00:00.000Z',
      },
      {
        id: 'x1',
        name: 'No emb',
        category: 'beverages',
        price: 1,
        sku: 'x1',
        finalScore: null,
        neuralScore: null,
        semanticScore: null,
        matchReason: null,
        eligible: false,
        eligibilityReason: 'no_embedding' as const,
        suppressionUntil: null,
      },
    ]
    const mockRecommendationService = {
      recommend: vi.fn().mockResolvedValue(mockRecommendations),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend',
      payload: { clientId: 'client-001', limit: 10 },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(Array.isArray(body)).toBe(true)
    expect(body.map((r: { id: string }) => r.id)).toEqual(['e1', 'r1'])
  })
})

describe('POST /api/v1/recommend/from-cart', () => {
  it('returns 200 for non-empty cart recommendations', async () => {
    const mockRecommendations = [
      {
        id: 'prod-010',
        name: 'Complementary Product',
        category: 'beverages',
        price: 18.5,
        sku: 'SKU-010',
        finalScore: 0.82,
        neuralScore: 0.8,
        semanticScore: 0.85,
        matchReason: 'hybrid' as const,
      },
    ]

    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendFromCart: vi.fn().mockResolvedValue(mockRecommendations),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend/from-cart',
      payload: { clientId: 'client-001', productIds: ['prod-001', 'prod-002'], limit: 5 },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(Array.isArray(body)).toBe(true)
    expect(mockRecommendationService.recommendFromCart).toHaveBeenCalledWith(
      'client-001',
      ['prod-001', 'prod-002'],
      5
    )
  })

  it('returns 200 for empty productIds and delegates to service fallback behavior', async () => {
    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendFromCart: vi.fn().mockResolvedValue({ recommendations: [], reason: 'No new products' }),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend/from-cart',
      payload: { clientId: 'client-001', productIds: [] },
    })

    expect(response.statusCode).toBe(200)
    expect(mockRecommendationService.recommendFromCart).toHaveBeenCalledWith('client-001', [], 10)
  })

  it('returns 200 when cart has missing embeddings but service still returns recommendations', async () => {
    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendFromCart: vi.fn().mockResolvedValue([]),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend/from-cart',
      payload: { clientId: 'client-001', productIds: ['missing-embedding-id'] },
    })

    expect(response.statusCode).toBe(200)
  })

  it('returns 200 when client has no prior orders but cart profile is provided by service', async () => {
    const mockRecommendationService = {
      recommend: vi.fn(),
      recommendFromCart: vi.fn().mockResolvedValue([
        {
          id: 'prod-777',
          name: 'Starter Product',
          category: 'snacks',
          price: 4.9,
          sku: 'SKU-777',
          finalScore: 0.71,
          neuralScore: 0.69,
          semanticScore: 0.74,
          matchReason: 'semantic' as const,
        },
      ]),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: mockRecommendationService,
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/recommend/from-cart',
      payload: { clientId: 'new-client', productIds: ['prod-777'], limit: 3 },
    })

    expect(response.statusCode).toBe(200)
    expect(mockRecommendationService.recommendFromCart).toHaveBeenCalledWith(
      'new-client',
      ['prod-777'],
      3
    )
  })
})

describe('computeFinalScore (pure function, M6-12)', () => {
  it('computes 0.6 * neural + 0.4 * semantic correctly', () => {
    expect(computeFinalScore(1.0, 0.5, 0.6, 0.4)).toBeCloseTo(0.8, 5)
  })

  it('returns 0 when both scores are 0', () => {
    expect(computeFinalScore(0, 0, 0.6, 0.4)).toBe(0)
  })

  it('returns 1 when both scores are 1 with full weights', () => {
    expect(computeFinalScore(1, 1, 0.6, 0.4)).toBeCloseTo(1.0, 5)
  })
})

describe('RecommendationService.recommendFromVector', () => {
  const mockModel = { predict: vi.fn() }

  it('returns empty envelope when catalog is empty and emptyCatalogReason is omitted', async () => {
    const mockRepo = {
      getClientWithCountry: vi.fn().mockResolvedValue({ country: 'BR' }),
      getProductsInCountryCatalog: vi.fn().mockResolvedValue([]),
      getConfirmedPurchaseLastDates: vi.fn().mockResolvedValue(new Map()),
    }
    const mockStore = { getModel: vi.fn().mockReturnValue(mockModel) }
    const svc = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0, 1, 'mean', 30)
    const vec = Array.from({ length: 384 }, () => 0.01)
    const r = await svc.recommendFromVector('c1', 10, vec)
    expect(r).toEqual({
      recommendations: [],
      rankingConfig: { neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 },
    })
    expect(mockModel.predict).not.toHaveBeenCalled()
  })

  it('returns empty reason object when catalog is empty and emptyCatalogReason is set', async () => {
    const mockRepo = {
      getClientWithCountry: vi.fn().mockResolvedValue({ id: 'c1', country: 'BR' }),
      getProductsInCountryCatalog: vi.fn().mockResolvedValue([]),
      getConfirmedPurchaseLastDates: vi.fn().mockResolvedValue(new Map()),
    }
    const mockStore = { getModel: vi.fn().mockReturnValue(mockModel) }
    const svc = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0, 1, 'mean', 30)
    const vec = Array.from({ length: 384 }, () => 0.01)
    const reason = 'No new products available for this client in their country'
    const r = await svc.recommendFromVector('c1', 10, vec, { emptyCatalogReason: reason })
    expect(r).toEqual({
      recommendations: [],
      reason,
      rankingConfig: { neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 },
    })
  })

  it('rejects with ClientNotFoundError when client is missing', async () => {
    const mockRepo = {
      getClientWithCountry: vi.fn().mockResolvedValue(null),
      getProductsInCountryCatalog: vi.fn(),
      getConfirmedPurchaseLastDates: vi.fn(),
    }
    const mockStore = { getModel: vi.fn().mockReturnValue(mockModel) }
    const svc = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0, 1, 'mean', 30)
    await expect(svc.recommendFromVector('unknown', 10, [])).rejects.toThrow(ClientNotFoundError)
  })
})

describe('maxCosineToAnchors (M17)', () => {
  it('returns 0 without anchors', () => {
    expect(maxCosineToAnchors([1, 0, 0], [])).toBe(0)
  })

  it('returns the maximum cosine to any anchor', () => {
    const a = [1, 0, 0]
    const anchors = [
      [0, 1, 0],
      [1, 0, 0],
    ]
    expect(maxCosineToAnchors(a, anchors)).toBeCloseTo(1, 5)
  })
})

describe('M17 recency re-rank (recommendFromVector)', () => {
  const D = 384
  const axisUnit = (axis: number): number[] => {
    const v = new Array<number>(D).fill(0)
    v[axis] = 1
    return v
  }

  const profile = axisUnit(2)
  const rowHigh = {
    id: 'p-high',
    name: 'High sim',
    category: 'c',
    price: 1,
    sku: 'zzz',
    embedding: axisUnit(0),
  }
  const rowLow = {
    id: 'p-low',
    name: 'Low sim',
    category: 'c',
    price: 1,
    sku: 'aaa',
    embedding: axisUnit(1),
  }

  const mockPredictTensor = () => ({
    dataSync: () => new Float32Array([0.8, 0.8]),
  })

  it('does not query anchor embeddings when RECENCY_RERANK_WEIGHT is 0', async () => {
    const getAnchors = vi.fn().mockResolvedValue([axisUnit(0)])
    const mockRepo = {
      getClientWithCountry: vi.fn().mockResolvedValue({ id: 'c1', country: 'BR' }),
      getProductsInCountryCatalog: vi.fn().mockResolvedValue([rowHigh, rowLow]),
      getConfirmedPurchaseLastDates: vi.fn().mockResolvedValue(new Map()),
      getRecentConfirmedPurchaseAnchorEmbeddings: getAnchors,
    }
    const mockModel = { predict: vi.fn().mockReturnValue(mockPredictTensor()) }
    const mockStore = { getModel: vi.fn().mockReturnValue(mockModel) }
    const svc = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0, 1, 'mean', 30)
    await svc.recommendFromVector('c1', 10, profile)
    expect(getAnchors).not.toHaveBeenCalled()
  })

  it('reorders by rankScore when weight > 0 while finalScore per sku stays unchanged vs weight 0', async () => {
    const getAnchors = vi.fn().mockResolvedValue([axisUnit(0)])
    const mockRepo = {
      getClientWithCountry: vi.fn().mockResolvedValue({ id: 'c1', country: 'BR' }),
      getProductsInCountryCatalog: vi.fn().mockResolvedValue([rowHigh, rowLow]),
      getConfirmedPurchaseLastDates: vi.fn().mockResolvedValue(new Map()),
      getRecentConfirmedPurchaseAnchorEmbeddings: getAnchors,
    }
    const mockModel = { predict: vi.fn().mockReturnValue(mockPredictTensor()) }
    const mockStore = { getModel: vi.fn().mockReturnValue(mockModel) }
    const svcOff = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0, 1, 'mean', 30)
    const svcOn = new RecommendationService(mockStore as never, mockRepo as never, 0.6, 0.4, 30, 0.5, 1, 'mean', 30)

    type Ranked = { sku: string; finalScore: number | null; rankScore?: number; recencySimilarity?: number }
    const offEnv = await svcOff.recommendFromVector('c1', 10, profile)
    const onEnv = await svcOn.recommendFromVector('c1', 10, profile)
    const off = offEnv.recommendations as Ranked[]
    const on = onEnv.recommendations as Ranked[]

    expect(offEnv.rankingConfig).toEqual({ neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 })
    expect(onEnv.rankingConfig).toEqual({ neuralWeight: 0.6, semanticWeight: 0.4, recencyRerankWeight: 0.5, profilePoolingMode: 'mean', profilePoolingHalfLifeDays: 30 })

    const offScores = Object.fromEntries(off.map((r) => [r.sku, r.finalScore]))
    const onScores = Object.fromEntries(on.map((r) => [r.sku, r.finalScore]))
    expect(onScores).toEqual(offScores)

    expect(off[0].sku).toBe('aaa')
    expect(off[1].sku).toBe('zzz')

    expect(on[0].sku).toBe('zzz')
    expect(on[1].sku).toBe('aaa')
    expect(on[0].recencySimilarity).toBeCloseTo(1, 5)
    expect(on[0].rankScore).toBeGreaterThan(on[1].rankScore ?? 0)
    expect(getAnchors).toHaveBeenCalledTimes(1)
  })
})
