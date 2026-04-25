import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import { fixtureRAGResponse } from './helpers/fixtures.js'

describe('POST /api/v1/rag/query', () => {
  it('returns 200 with answer string and sources array', async () => {
    const mockRagService = {
      query: vi.fn().mockResolvedValue(fixtureRAGResponse),
    }

    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore: {},
      modelTrainer: {},
      recommendationService: {},
      ragService: mockRagService,
      searchService: {},
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/rag/query',
      payload: { query: 'What beverages do you have?' },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(typeof body.answer).toBe('string')
    expect(body.answer.length).toBeGreaterThan(0)
    expect(Array.isArray(body.sources)).toBe(true)
    expect(body.sources.length).toBeGreaterThan(0)
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
      url: '/api/v1/rag/query',
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
      url: '/api/v1/rag/query',
      payload: {},
    })

    expect(response.statusCode).toBe(400)
  })
})
