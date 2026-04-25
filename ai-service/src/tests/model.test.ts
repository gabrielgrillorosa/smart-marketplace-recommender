import { describe, it, expect } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import { ModelStore } from '../services/ModelStore.js'

describe('GET /api/v1/model/status', () => {
  it('returns 200 with status: untrained when no model is trained', async () => {
    const modelStore = new ModelStore()
    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore,
      modelTrainer: {},
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/model/status',
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.payload)
    expect(body.status).toBe('untrained')
    expect(body.staleDays).toBeNull()
  })

  it('staleDays is null when model is untrained', async () => {
    const modelStore = new ModelStore()
    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore,
      modelTrainer: {},
      recommendationService: {},
      ragService: {},
      searchService: {},
    })

    const response = await app.inject({ method: 'GET', url: '/api/v1/model/status' })
    const body = JSON.parse(response.payload)
    expect(body.staleDays).toBeNull()
    expect(body.staleWarning).toBeUndefined()
  })

  it('returns staleDays >= 7 and staleWarning when model is 8 days old', async () => {
    const modelStore = new ModelStore()
    const trainedAt = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()

    // Use a fake tf.LayersModel-like object; ModelStore just stores it
    const fakeModel = {} as Parameters<typeof modelStore.setModel>[0]
    modelStore.setModel(fakeModel, {
      trainedAt,
      finalLoss: 0.1,
      finalAccuracy: 0.9,
      trainingSamples: 500,
      durationMs: 1000,
      syncedAt: trainedAt,
      precisionAt5: 0.5,
    })

    const enriched = modelStore.getEnrichedStatus(() => new Date())
    expect(enriched.staleDays).toBeGreaterThanOrEqual(7)
    expect(enriched.staleWarning).toBeDefined()
    expect(enriched.staleWarning).toContain('consider retraining')
  })

  it('returns no staleWarning when model is 3 days old', async () => {
    const modelStore = new ModelStore()
    const trainedAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const fakeModel = {} as Parameters<typeof modelStore.setModel>[0]
    modelStore.setModel(fakeModel, {
      trainedAt,
      finalLoss: 0.1,
      finalAccuracy: 0.9,
      trainingSamples: 500,
      durationMs: 1000,
      syncedAt: trainedAt,
      precisionAt5: 0.5,
    })

    const enriched = modelStore.getEnrichedStatus(() => new Date())
    expect(enriched.staleDays).toBeLessThan(7)
    expect(enriched.staleWarning).toBeUndefined()
  })

  it('injected nowFn controls staleDays calculation for 8-day boundary', async () => {
    const modelStore = new ModelStore()
    const trainedAt = new Date('2026-01-01T00:00:00.000Z').toISOString()

    const fakeModel = {} as Parameters<typeof modelStore.setModel>[0]
    modelStore.setModel(fakeModel, {
      trainedAt,
      finalLoss: 0.05,
      finalAccuracy: 0.95,
      trainingSamples: 1040,
      durationMs: 9000,
      syncedAt: trainedAt,
      precisionAt5: 0.6,
    })

    const eightDaysLater = new Date('2026-01-09T00:00:00.000Z')
    const enriched = modelStore.getEnrichedStatus(() => eightDaysLater)
    expect(enriched.staleDays).toBe(8)
    expect(enriched.staleWarning).toBeDefined()

    const threeDaysLater = new Date('2026-01-04T00:00:00.000Z')
    const enriched2 = modelStore.getEnrichedStatus(() => threeDaysLater)
    expect(enriched2.staleDays).toBe(3)
    expect(enriched2.staleWarning).toBeUndefined()
  })
})

describe('ModelStore enriched status includes syncedAt and precisionAt5', () => {
  it('returns syncedAt and precisionAt5 when model is trained', () => {
    const modelStore = new ModelStore()
    const trainedAt = new Date().toISOString()
    const syncedAt = new Date().toISOString()

    const fakeModel = {} as Parameters<typeof modelStore.setModel>[0]
    modelStore.setModel(fakeModel, {
      trainedAt,
      finalLoss: 0.1,
      finalAccuracy: 0.9,
      trainingSamples: 500,
      durationMs: 1000,
      syncedAt,
      precisionAt5: 0.65,
    })

    const enriched = modelStore.getEnrichedStatus()
    expect(enriched.syncedAt).toBe(syncedAt)
    expect(enriched.precisionAt5).toBe(0.65)
  })
})
