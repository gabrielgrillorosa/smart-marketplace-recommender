import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import { fixtureSearchResponse } from './helpers/fixtures.js'

describe('POST /api/v1/search/semantic', () => {
  it('returns 200 with products array containing numeric scores', async () => {
    const mockSearchService = {
      semanticSearch: vi.fn().mockResolvedValue(fixtureSearchResponse.products),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: {},
      ragService: {},
      searchService: mockSearchService,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/search/semantic',
      payload: { query: 'refreshing beverage' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
    expect(typeof body[0].score).toBe('number')
    expect(body[0]).toHaveProperty('id')
    expect(body[0]).toHaveProperty('name')
  })

  it('returns 400 when query is empty', async () => {
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
      url: '/api/v1/search/semantic',
      payload: { query: '' },
    })

    expect(response.statusCode).toBe(400)
  })

  it('returns 400 when query is missing', async () => {
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
      url: '/api/v1/search/semantic',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })
})
