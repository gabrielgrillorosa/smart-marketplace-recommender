import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StartupRecoveryService } from './StartupRecoveryService.js'

type ModelRef = { current: object | null }

const makeDeps = (opts: {
  autoHealModel?: boolean
  modelPresent?: boolean
  missingEmbeddingsCount?: number
  hasTrainingData?: boolean
  activeJobId?: string
  trainingStatus?: 'done' | 'failed'
} = {}) => {
  const modelRef: ModelRef = { current: opts.modelPresent ? {} : null }

  const versionedModelStore = {
    getModel: vi.fn(() => modelRef.current),
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
      return {
        jobId,
        status,
      }
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

  it('skips recovery with non-blocking state when model is already present', async () => {
    const deps = makeDeps({ modelPresent: true })

    await deps.service.scheduleRecovery()

    expect(deps.service.getState()).toEqual({ phase: 'idle', reason: 'model-present' })
    expect(deps.service.isBlockingReadiness()).toBe(false)
    expect(deps.neo4jRepository.getProductsWithoutEmbedding).not.toHaveBeenCalled()
    expect(deps.trainingJobRegistry.enqueue).not.toHaveBeenCalled()
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
