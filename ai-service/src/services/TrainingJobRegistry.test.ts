import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TrainingJobRegistry } from '../services/TrainingJobRegistry.js'

const makeTrainer = (opts: { isTraining?: boolean; shouldFail?: boolean } = {}) => {
  let _progressCallback: ((epoch: number, totalEpochs: number, loss: number) => void) | undefined

  return {
    isTraining: opts.isTraining ?? false,
    setProgressCallback: vi.fn((cb: (epoch: number, totalEpochs: number, loss: number) => void) => {
      _progressCallback = cb
    }),
    train: vi.fn(async () => {
      if (opts.shouldFail) throw new Error('Training failed')
      _progressCallback?.(1, 20, 0.5)
      return {
        status: 'trained' as const,
        epochs: 20,
        finalLoss: 0.1,
        finalAccuracy: 0.9,
        trainingSamples: 100,
        durationMs: 1000,
        syncedAt: new Date().toISOString(),
        precisionAt5: 0.6,
      }
    }),
  }
}

const makeVersionedModelStore = () => ({
  getModel: vi.fn(() => null),
  saveVersioned: vi.fn(async () => {}),
})

describe('TrainingJobRegistry', () => {
  let trainer: ReturnType<typeof makeTrainer>
  let store: ReturnType<typeof makeVersionedModelStore>
  let registry: TrainingJobRegistry

  beforeEach(() => {
    trainer = makeTrainer()
    store = makeVersionedModelStore()
    registry = new TrainingJobRegistry(
      trainer as unknown as import('../services/ModelTrainer.js').ModelTrainer,
      store as unknown as import('../services/VersionedModelStore.js').VersionedModelStore,
    )
  })

  it('enqueue() returns jobId and status queued synchronously', () => {
    const result = registry.enqueue()
    expect(result.jobId).toBeTruthy()
    expect(result.status).toBe('queued')
    expect(result.message).toBeTruthy()
  })

  it('enqueue() stores job retrievable via getJob()', () => {
    const { jobId } = registry.enqueue()
    const job = registry.getJob(jobId)
    expect(job).toBeDefined()
    expect(job?.jobId).toBe(jobId)
    expect(job?.status).toBe('queued')
  })

  it('getJob() returns undefined for unknown jobId', () => {
    const job = registry.getJob('non-existent-id')
    expect(job).toBeUndefined()
  })

  it('enqueue() throws ConflictError when training is already in progress', () => {
    const busyTrainer = makeTrainer({ isTraining: true })
    const busyRegistry = new TrainingJobRegistry(
      busyTrainer as unknown as import('../services/ModelTrainer.js').ModelTrainer,
      store as unknown as import('../services/VersionedModelStore.js').VersionedModelStore,
    )

    expect(() => busyRegistry.enqueue()).toThrow()
  })

  it('job transitions queued → running → done when train() resolves', async () => {
    const { jobId } = registry.enqueue()

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const job = registry.getJob(jobId)
        if (job?.status === 'done') {
          clearInterval(check)
          resolve()
        }
      }, 10)
    })

    const job = registry.getJob(jobId)
    expect(job?.status).toBe('done')
    expect(job?.completedAt).toBeTruthy()
  })

  it('job transitions queued → running → failed when train() rejects', async () => {
    const failingTrainer = makeTrainer({ shouldFail: true })
    const failingRegistry = new TrainingJobRegistry(
      failingTrainer as unknown as import('../services/ModelTrainer.js').ModelTrainer,
      store as unknown as import('../services/VersionedModelStore.js').VersionedModelStore,
    )

    const { jobId } = failingRegistry.enqueue()

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const job = failingRegistry.getJob(jobId)
        if (job?.status === 'failed') {
          clearInterval(check)
          resolve()
        }
      }, 10)
    })

    const job = failingRegistry.getJob(jobId)
    expect(job?.status).toBe('failed')
    expect(job?.error).toContain('Training failed')
    expect(job?.completedAt).toBeTruthy()
  })
})
