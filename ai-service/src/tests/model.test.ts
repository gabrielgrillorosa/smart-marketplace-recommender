import { describe, it, expect, vi } from 'vitest'
import { buildApp } from './helpers/buildApp.js'
import { ModelStore } from '../services/ModelStore.js'
import { summarizeNegativeSampling } from '../services/ModelTrainer.js'
import type { NegativeSamplingDatasetMetadata } from '../services/training-utils.js'
import type { NegativeSamplingEnv } from '../config/negativeSamplingEnv.js'
import type { NegativeSamplingTelemetry } from '../services/negativeSamplingSelector.js'

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
    expect(body.neuralHeadKind).toBe('bce_sigmoid')
    expect(body.modelArchitecture).toBe('baseline')
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

  it('includes neuralHeadKind when model is trained (M21)', () => {
    const modelStore = new ModelStore()
    const trainedAt = new Date().toISOString()
    const fakeModel = {} as Parameters<typeof modelStore.setModel>[0]
    modelStore.setModel(fakeModel, {
      trainedAt,
      finalLoss: 0.1,
      finalAccuracy: 0,
      trainingSamples: 120,
      durationMs: 1000,
      syncedAt: trainedAt,
      precisionAt5: 0.5,
      neuralHeadKind: 'ranking_linear',
    })
    const enriched = modelStore.getEnrichedStatus()
    expect(enriched.neuralHeadKind).toBe('ranking_linear')
  })
})

describe('GET /api/v1/model/status governance metadata (M13)', () => {
  it('returns null governance fields before first training decision', async () => {
    const modelStore = new ModelStore()
    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore,
      versionedModelStore: {
        getHistory: vi.fn().mockResolvedValue([]),
        getGovernanceStatus: vi.fn().mockReturnValue({
          currentVersion: null,
          lastTrainingResult: null,
          lastTrainingTriggeredBy: null,
          lastOrderId: null,
          lastDecision: null,
        }),
      },
      cronScheduler: {
        getNextExecution: vi.fn().mockReturnValue(new Date('2030-01-01T00:00:00.000Z')),
      },
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
    expect(body.currentVersion).toBeNull()
    expect(body.lastTrainingResult).toBeNull()
    expect(body.lastTrainingTriggeredBy).toBeNull()
    expect(body.lastOrderId).toBeNull()
    expect(body.lastDecision).toBeNull()
  })

  it('returns rejected decision payload and sets status=training when job is active', async () => {
    const modelStore = new ModelStore()
    const app = await buildApp({
      neo4jRepo: {},
      embeddingService: {},
      modelStore,
      versionedModelStore: {
        getHistory: vi.fn().mockResolvedValue([
          { filename: 'model-current.json', timestamp: '', precisionAt5: 0, loss: 0, accepted: true },
        ]),
        getGovernanceStatus: vi.fn().mockReturnValue({
          currentVersion: 'model-current.json',
          lastTrainingResult: 'rejected',
          lastTrainingTriggeredBy: 'checkout',
          lastOrderId: 'order-123',
          lastDecision: {
            accepted: false,
            reason: 'candidate_below_tolerance_gate',
            currentPrecisionAt5: 0.8,
            candidatePrecisionAt5: 0.75,
            tolerance: 0.02,
            currentVersion: 'model-current.json',
          },
        }),
      },
      cronScheduler: {
        getNextExecution: vi.fn().mockReturnValue(new Date('2030-01-01T00:00:00.000Z')),
      },
      trainingJobRegistry: {
        getActiveJobId: vi.fn().mockReturnValue('job-active'),
        getJob: vi.fn(),
      } as never,
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
    expect(body.status).toBe('training')
    expect(body.currentVersion).toBe('model-current.json')
    expect(body.lastTrainingResult).toBe('rejected')
    expect(body.lastTrainingTriggeredBy).toBe('checkout')
    expect(body.lastOrderId).toBe('order-123')
    expect(body.lastDecision?.accepted).toBe(false)
  })
})

/**
 * M23 T23-6 — `summarizeNegativeSampling` is the pure aggregator that
 * `ModelTrainer.train()` uses to expose `mode`, active thresholds, `seed`,
 * and a compact composition/fallback/identity summary on the training
 * result and on the structured info log. These tests exercise the
 * aggregator directly so they don't need to spin up TensorFlow / network
 * fetch — `train()` simply forwards the same inputs.
 */
describe('summarizeNegativeSampling — M23 T23-6 training summary', () => {
  const legacyEnv: NegativeSamplingEnv = {
    mode: 'legacy',
    softMaxSim: 0.92,
    hardMinSim: 0.7,
    mediumMinSim: 0.4,
    benchmarkRuns: 2,
  }
  const stratifiedEnv: NegativeSamplingEnv = {
    ...legacyEnv,
    mode: 'stratified',
  }

  function makeTelemetry(
    overrides: Partial<NegativeSamplingTelemetry> = {}
  ): NegativeSamplingTelemetry {
    return {
      mode: 'stratified',
      seed: 0,
      hardAvailable: 0,
      hardSelected: 0,
      mediumAvailable: 0,
      mediumSelected: 0,
      easyAvailable: 0,
      easySelected: 0,
      intraCategoryAvailable: 0,
      intraCategorySelected: 0,
      fallbackHardToMedium: 0,
      fallbackHardToOther: 0,
      fallbackMediumToHard: 0,
      fallbackMediumToEasy: 0,
      fallbackEasyToMedium: 0,
      fallbackEasyToHard: 0,
      ...overrides,
    }
  }

  it('legacy mode without metadata: exposes mode, thresholds, seed, zero composition/identity', () => {
    const summary = summarizeNegativeSampling(legacyEnv, 4242, undefined)

    expect(summary.mode).toBe('legacy')
    expect(summary.seed).toBe(4242)
    expect(summary.thresholds).toEqual({
      softMaxSim: 0.92,
      hardMinSim: 0.7,
      mediumMinSim: 0.4,
    })
    expect(summary.positives).toBe(0)
    expect(summary.composition).toEqual({
      hardAvailable: 0,
      hardSelected: 0,
      mediumAvailable: 0,
      mediumSelected: 0,
      easyAvailable: 0,
      easySelected: 0,
    })
    expect(summary.fallback).toEqual({
      hardToMedium: 0,
      hardToOther: 0,
      mediumToHard: 0,
      mediumToEasy: 0,
      easyToMedium: 0,
      easyToHard: 0,
    })
    expect(summary.identity).toEqual({ enabled: false, applied: 0, unavailable: 0 })
  })

  it('stratified mode aggregates composition and fallback counts across positives', () => {
    const metadata: NegativeSamplingDatasetMetadata = {
      mode: 'stratified',
      identityEnabled: false,
      identityGuardrailApplied: 0,
      identityGuardrailUnavailable: 0,
      perPositive: [
        makeTelemetry({
          hardAvailable: 3,
          hardSelected: 1,
          mediumAvailable: 5,
          mediumSelected: 2,
          easyAvailable: 7,
          easySelected: 1,
          fallbackHardToMedium: 0,
          fallbackEasyToMedium: 1,
        }),
        makeTelemetry({
          hardAvailable: 2,
          hardSelected: 0,
          mediumAvailable: 4,
          mediumSelected: 2,
          easyAvailable: 6,
          easySelected: 1,
          fallbackHardToMedium: 1,
          fallbackMediumToEasy: 1,
        }),
      ],
    }

    const summary = summarizeNegativeSampling(stratifiedEnv, 12345, metadata)

    expect(summary.mode).toBe('stratified')
    expect(summary.seed).toBe(12345)
    expect(summary.positives).toBe(2)
    expect(summary.composition).toEqual({
      hardAvailable: 5,
      hardSelected: 1,
      mediumAvailable: 9,
      mediumSelected: 4,
      easyAvailable: 13,
      easySelected: 2,
    })
    expect(summary.fallback).toEqual({
      hardToMedium: 1,
      hardToOther: 0,
      mediumToHard: 0,
      mediumToEasy: 1,
      easyToMedium: 1,
      easyToHard: 0,
    })
  })

  it('forwards identity guardrail counters from dataset metadata', () => {
    const metadata: NegativeSamplingDatasetMetadata = {
      mode: 'stratified',
      identityEnabled: true,
      identityGuardrailApplied: 3,
      identityGuardrailUnavailable: 1,
      perPositive: [makeTelemetry()],
    }

    const summary = summarizeNegativeSampling(stratifiedEnv, 7, metadata)

    expect(summary.identity).toEqual({ enabled: true, applied: 3, unavailable: 1 })
    expect(summary.positives).toBe(1)
  })

  it('legacy mode WITH metadata still aggregates faithfully (uniform shape for legacy vs stratified compare)', () => {
    // Defensive: legacy normally emits no metadata, but the aggregator must
    // still produce a comparable summary when given any metadata payload.
    const metadata: NegativeSamplingDatasetMetadata = {
      mode: 'legacy' as never,
      identityEnabled: false,
      identityGuardrailApplied: 0,
      identityGuardrailUnavailable: 0,
      perPositive: [
        makeTelemetry({ hardAvailable: 1, hardSelected: 1 }),
      ],
    }

    const summary = summarizeNegativeSampling(legacyEnv, 99, metadata)

    expect(summary.mode).toBe('legacy')
    expect(summary.positives).toBe(1)
    expect(summary.composition.hardSelected).toBe(1)
    expect(summary.composition.hardAvailable).toBe(1)
  })
})
