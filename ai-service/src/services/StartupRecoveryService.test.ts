import { beforeEach, describe, expect, it, vi } from 'vitest'
import { M22_ENV_OFF } from '../config/m22Env.js'
import type { ModelArchitectureKind } from '../types/index.js'
import { StartupRecoveryService } from './StartupRecoveryService.js'

type ModelRef = { current: object | null }

const makeDeps = (opts: {
  autoHealModel?: boolean
  modelPresent?: boolean
  loadedArchitecture?: ModelArchitectureKind
  m22Env?: import('../config/m22Env.js').M22EnvFlags
  missingEmbeddingsCount?: number
  hasTrainingData?: boolean
  activeJobId?: string
  trainingStatus?: 'done' | 'failed'
  /** When `trainingStatus` is `failed`: exception vs governance rejection (`promoted: false`). */
  failedJobKind?: 'train-exception' | 'governance-rejection'
} = {}) => {
  const modelRef: ModelRef = { current: opts.modelPresent ? {} : null }

  const versionedModelStore = {
    getModel: vi.fn(() => modelRef.current),
    getModelArchitecture: vi.fn(() => opts.loadedArchitecture ?? 'baseline'),
  }

  const neo4jRepository = {
    getProductsWithoutEmbedding: vi.fn(async () => {
      const count = opts.missingEmbeddingsCount ?? 0
      return Array.from({ length: count }, (_, i) => ({
        id: `product-${i}`,
        name: `Product ${i}`,
        description: `Description ${i}`,
        category: 'category',
        price: 1,
        sku: `sku-${i}`,
      }))
    }),
  }

  const embeddingService = {
    generateEmbeddings: vi.fn(async () => ({
      generated: opts.missingEmbeddingsCount ?? 0,
      skipped: 0,
      indexCreated: true,
    })),
  }

  const modelTrainer = {
    probeTrainingDataAvailability: vi.fn(async () => ({
      hasTrainingData: opts.hasTrainingData ?? true,
      clients: 1,
      products: 1,
      orders: 1,
    })),
  }

  const trainingJobRegistry = {
    getActiveJobId: vi.fn(() => opts.activeJobId),
    enqueue: vi.fn(() => ({ jobId: 'job-new', status: 'queued' as const, message: 'queued' })),
    waitFor: vi.fn(async (jobId: string) => {
      const status = opts.trainingStatus ?? 'done'
      if (status === 'done') {
        modelRef.current = {}
      }
      const job: { jobId: string; status: 'queued' | 'running' | 'done' | 'failed'; promoted?: boolean } = {
        jobId,
        status,
      }
      if (status === 'failed' && opts.failedJobKind === 'governance-rejection') {
        job.promoted = false
      }
      return job
    }),
  }

  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }

  const service = new StartupRecoveryService({
    autoHealModel: opts.autoHealModel ?? true,
    versionedModelStore: versionedModelStore as never,
    embeddingService: embeddingService as never,
    neo4jRepository: neo4jRepository as never,
    modelTrainer: modelTrainer as never,
    trainingJobRegistry: trainingJobRegistry as never,
    m22Env: opts.m22Env ?? M22_ENV_OFF,
    logger,
  })

  return {
    service,
    modelRef,
    versionedModelStore,
    neo4jRepository,
    embeddingService,
    modelTrainer,
    trainingJobRegistry,
    logger,
  }
}

describe('StartupRecoveryService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns quickly and schedules recovery in background', async () => {
    const deps = makeDeps()

    type ProductWithoutEmbedding = {
      id: string
      name: string
      description: string
      category: string
      price: number
      sku: string
    }

    let resolveProducts: ((value: ProductWithoutEmbedding[]) => void) | undefined
    const pendingProducts = new Promise<ProductWithoutEmbedding[]>((resolve) => {
      resolveProducts = resolve
    })

    deps.neo4jRepository.getProductsWithoutEmbedding.mockReturnValueOnce(pendingProducts)

    const runPromise = deps.service.scheduleRecovery()
    expect(deps.service.getState().phase).toBe('scheduled')

    resolveProducts?.([])
    await runPromise
  })

  it('when model is already present: checks Neo4j for missing embeddings; skips train if none missing', async () => {
    const deps = makeDeps({ modelPresent: true, missingEmbeddingsCount: 0 })

    await deps.service.scheduleRecovery()

    expect(deps.service.getState()).toEqual({ phase: 'idle', reason: 'model-present-compatible' })
    expect(deps.service.isBlockingReadiness()).toBe(false)
    expect(deps.neo4jRepository.getProductsWithoutEmbedding).toHaveBeenCalled()
    expect(deps.embeddingService.generateEmbeddings).not.toHaveBeenCalled()
    expect(deps.trainingJobRegistry.enqueue).not.toHaveBeenCalled()
  })

  it('when model is already present: fills missing embeddings then skips retrain', async () => {
    const deps = makeDeps({ modelPresent: true, missingEmbeddingsCount: 3 })

    await deps.service.scheduleRecovery()

    expect(deps.neo4jRepository.getProductsWithoutEmbedding).toHaveBeenCalled()
    expect(deps.embeddingService.generateEmbeddings).toHaveBeenCalledOnce()
    expect(deps.trainingJobRegistry.enqueue).not.toHaveBeenCalled()
    expect(deps.trainingJobRegistry.waitFor).not.toHaveBeenCalled()
    expect(deps.service.getState()).toEqual({ phase: 'idle', reason: 'model-present-compatible' })
    expect(deps.service.isBlockingReadiness()).toBe(false)
  })

  it('runs embedding generation when Neo4j has products without embedding', async () => {
    const deps = makeDeps({ missingEmbeddingsCount: 2 })

    await deps.service.scheduleRecovery()

    expect(deps.embeddingService.generateEmbeddings).toHaveBeenCalledOnce()
    expect(deps.service.getState().phase).toBe('completed')
    expect(deps.service.isBlockingReadiness()).toBe(false)
  })

  it('skips embedding generation when embeddings are already present', async () => {
    const deps = makeDeps({ missingEmbeddingsCount: 0 })

    await deps.service.scheduleRecovery()

    expect(deps.embeddingService.generateEmbeddings).not.toHaveBeenCalled()
    expect(deps.service.getState().phase).toBe('completed')
  })

  it('moves to blocked/no-training-data when there is no trainable data', async () => {
    const deps = makeDeps({ hasTrainingData: false })

    await deps.service.scheduleRecovery()

    expect(deps.service.getState()).toEqual({
      phase: 'blocked',
      reason: 'no-training-data',
    })
    expect(deps.service.isBlockingReadiness()).toBe(true)
    expect(deps.trainingJobRegistry.enqueue).not.toHaveBeenCalled()
  })

  it('reuses active training job instead of enqueueing duplicates', async () => {
    const deps = makeDeps({ activeJobId: 'job-active' })

    await deps.service.scheduleRecovery()

    expect(deps.trainingJobRegistry.enqueue).not.toHaveBeenCalled()
    expect(deps.trainingJobRegistry.waitFor).toHaveBeenCalledWith('job-active')
    expect(deps.service.getState()).toEqual(
      expect.objectContaining({
        phase: 'completed',
        jobId: 'job-active',
      })
    )
  })

  it('when checkpoint is baseline but env requires M22: enqueues retrain', async () => {
    const deps = makeDeps({
      modelPresent: true,
      missingEmbeddingsCount: 0,
      m22Env: { enabled: true, structural: true, identity: false },
      loadedArchitecture: 'baseline',
    })

    await deps.service.scheduleRecovery()

    expect(deps.trainingJobRegistry.enqueue).toHaveBeenCalled()
    expect(deps.service.getState().phase).toBe('completed')
  })

  it('when checkpoint is M22 but env is baseline-only: enqueues retrain', async () => {
    const deps = makeDeps({
      modelPresent: true,
      missingEmbeddingsCount: 0,
      m22Env: M22_ENV_OFF,
      loadedArchitecture: 'm22',
    })

    await deps.service.scheduleRecovery()

    expect(deps.trainingJobRegistry.enqueue).toHaveBeenCalled()
  })

  it('when governance rejects promotion but a checkpoint remains loaded: completes recovery (ready)', async () => {
    const deps = makeDeps({
      modelPresent: true,
      missingEmbeddingsCount: 0,
      m22Env: { enabled: true, structural: true, identity: false },
      loadedArchitecture: 'baseline',
      trainingStatus: 'failed',
      failedJobKind: 'governance-rejection',
    })

    await deps.service.scheduleRecovery()

    expect(deps.service.getState().phase).toBe('completed')
    expect(deps.service.isBlockingReadiness()).toBe(false)
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('not promoted (governance)')
    )
  })

  it('moves to blocked/training-failed when background training fails', async () => {
    const deps = makeDeps({ trainingStatus: 'failed' })

    await deps.service.scheduleRecovery()

    expect(deps.service.getState()).toEqual({
      phase: 'blocked',
      reason: 'training-failed',
      jobId: 'job-new',
    })
    expect(deps.service.isBlockingReadiness()).toBe(true)
  })
})
