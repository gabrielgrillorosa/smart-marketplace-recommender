import { describe, it, expect, vi } from 'vitest'
import { buildApp } from '../tests/helpers/buildApp.js'

const makeRepo = (opts: { hasExistingEmbedding?: boolean } = {}) => ({
  getProductEmbedding: vi.fn(async (_id: string) => {
    return opts.hasExistingEmbedding ? [0.1, 0.2, 0.3] : null
  }),
  createProductWithEmbedding: vi.fn(async () => {}),
})

const makeEmbeddingService = () => ({
  embedText: vi.fn(async (_text: string) => [0.1, 0.2, 0.3]),
  isReady: true,
})

const syncBody = {
  id: 'prod-sync-001',
  name: 'Test Product',
  description: 'A fresh product for sync',
  category: 'beverages',
  price: 12.99,
  sku: 'SKU-SYNC-001',
  countryCodes: ['BR', 'MX'],
}

describe('POST /embeddings/sync-product', () => {
  it('sync with new product → 200 { synced: true, productId } (M7-02)', async () => {
    const repo = makeRepo({ hasExistingEmbedding: false })
    const embeddingService = makeEmbeddingService()

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
      url: '/api/v1/embeddings/sync-product',
      payload: syncBody,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.synced).toBe(true)
    expect(body.productId).toBe(syncBody.id)
    expect(repo.createProductWithEmbedding).toHaveBeenCalledOnce()
  })

  it('sync with already-synced product → 200 { skipped: true } — no duplicate write (M7-06)', async () => {
    const repo = makeRepo({ hasExistingEmbedding: true })
    const embeddingService = makeEmbeddingService()

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
      url: '/api/v1/embeddings/sync-product',
      payload: syncBody,
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.skipped).toBe(true)
    expect(repo.createProductWithEmbedding).not.toHaveBeenCalled()
  })

  it('POST /embeddings/sync-product without X-Admin-Key → NOT 401 (M7-29)', async () => {
    const repo = makeRepo()
    const embeddingService = makeEmbeddingService()

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
      url: '/api/v1/embeddings/sync-product',
      payload: syncBody,
    })

    expect(response.statusCode).not.toBe(401)
  })
})
