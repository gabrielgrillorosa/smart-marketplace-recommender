import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import {
  ModelNotTrainedError,
  computeFinalScore,
} from '../services/RecommendationService.js'
import { Neo4jUnavailableError } from '../repositories/Neo4jRepository.js'

describe('POST /api/v1/recommend', () => {
  it('returns 200 with clientId and recommendations array on happy path', async () => {
    const mockRecommendations = [
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
    expect(body[0]).toHaveProperty('finalScore')
    expect(body[0]).toHaveProperty('matchReason')
    expect(['neural', 'semantic', 'hybrid']).toContain(body[0].matchReason)
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
