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
        model: {} as import('@tensorflow/tfjs-node').LayersModel,
      }
    }),
  }
}

const makeVersionedModelStore = () => ({
  saveVersioned: vi.fn(async () => {}),
  markTrainingFailed: vi.fn(),
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

  it('enqueue() keeps queue semantics for checkout strategy when busy', () => {
    const busyTrainer = makeTrainer({ isTraining: true })
    const busyRegistry = new TrainingJobRegistry(
      busyTrainer as unknown as import('../services/ModelTrainer.js').ModelTrainer,
      store as unknown as import('../services/VersionedModelStore.js').VersionedModelStore,
    )

    const queued = busyRegistry.enqueue({
      triggeredBy: 'checkout',
      strategy: 'queue',
      orderId: 'order-1',
    })

    expect(queued.status).toBe('queued')
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

  it('waitFor() resolves unknown jobId to undefined', async () => {
    const result = await registry.waitFor('missing-job')
    expect(result).toBeUndefined()
  })

  it('waitFor() resolves queued/running job when it reaches done', async () => {
    const { jobId } = registry.enqueue()
    const result = await registry.waitFor(jobId)

    expect(result?.jobId).toBe(jobId)
    expect(result?.status).toBe('done')
    expect(result?.completedAt).toBeTruthy()
  })

  it('waitFor() resolves queued/running job when it reaches failed', async () => {
    const failingTrainer = makeTrainer({ shouldFail: true })
    const failingRegistry = new TrainingJobRegistry(
      failingTrainer as unknown as import('../services/ModelTrainer.js').ModelTrainer,
      store as unknown as import('../services/VersionedModelStore.js').VersionedModelStore,
    )

    const { jobId } = failingRegistry.enqueue()
    const result = await failingRegistry.waitFor(jobId)

    expect(result?.jobId).toBe(jobId)
    expect(result?.status).toBe('failed')
    expect(result?.error).toContain('Training failed')
  })

  it('waitFor() resolves immediately for terminal jobs', async () => {
    const { jobId } = registry.enqueue()

    const firstTerminal = await registry.waitFor(jobId)
    expect(firstTerminal?.status).toBe('done')

    const secondTerminal = await registry.waitFor(jobId)
    expect(secondTerminal?.status).toBe('done')
    expect(secondTerminal?.jobId).toBe(jobId)
  })
})
