import type { FastifyBaseLogger } from 'fastify'
import { Neo4jUnavailableError, Neo4jRepository } from '../repositories/Neo4jRepository.js'
import { TrainingJobRegistry } from './TrainingJobRegistry.js'
import {
  ApiServiceUnavailableError,
  ConflictError,
  ModelTrainer,
  type TrainingDataProbe,
} from './ModelTrainer.js'
import { EmbeddingService } from './EmbeddingService.js'
import { VersionedModelStore } from './VersionedModelStore.js'

export type StartupRecoveryBlockedReason =
  | 'no-training-data'
  | 'api-unavailable'
  | 'neo4j-unavailable'
  | 'training-failed'

export type StartupRecoveryState =
  | { phase: 'idle'; reason: 'not-started' | 'model-present' | 'disabled' }
  | { phase: 'scheduled' }
  | { phase: 'embedding' }
  | { phase: 'training'; jobId: string }
  | { phase: 'blocked'; reason: StartupRecoveryBlockedReason; jobId?: string }
  | { phase: 'completed'; jobId: string; recoveredAt: string }

interface StartupRecoveryServiceOptions {
  autoHealModel: boolean
  versionedModelStore: VersionedModelStore
  embeddingService: EmbeddingService
  neo4jRepository: Neo4jRepository
  modelTrainer: ModelTrainer
  trainingJobRegistry: TrainingJobRegistry
  logger?: Pick<FastifyBaseLogger, 'info' | 'warn' | 'error'>
  scheduleTask?: (fn: () => void) => void
  trainingDataProbeAttempts?: number
  trainingDataProbeDelayMs?: number
  sleep?: (ms: number) => Promise<void>
}

export class StartupRecoveryService {
  private state: StartupRecoveryState = { phase: 'idle', reason: 'not-started' }
  private runPromise: Promise<void> | null = null
  private readonly scheduleTask: (fn: () => void) => void
  private readonly sleep: (ms: number) => Promise<void>
  private readonly trainingDataProbeAttempts: number
  private readonly trainingDataProbeDelayMs: number

  constructor(private readonly options: StartupRecoveryServiceOptions) {
    this.scheduleTask = options.scheduleTask ?? ((fn) => setImmediate(fn))
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.trainingDataProbeAttempts = Math.max(options.trainingDataProbeAttempts ?? 1, 1)
    this.trainingDataProbeDelayMs = Math.max(options.trainingDataProbeDelayMs ?? 0, 0)
  }

  scheduleRecovery(): Promise<void> {
    if (!this.options.autoHealModel) {
      this.state = { phase: 'idle', reason: 'disabled' }
      this.options.logger?.info('[StartupRecovery] Disabled by AUTO_HEAL_MODEL=false')
      return Promise.resolve()
    }

    if (this.options.versionedModelStore.getModel() !== null) {
      this.state = { phase: 'idle', reason: 'model-present' }
      this.options.logger?.info('[StartupRecovery] Skipping recovery because model is already loaded')
      return Promise.resolve()
    }

    if (this.runPromise) {
      return this.runPromise
    }

    this.state = { phase: 'scheduled' }
    this.runPromise = new Promise<void>((resolve) => {
      this.scheduleTask(() => {
        void this.runRecovery().finally(resolve)
      })
    })

    return this.runPromise
  }

  getState(): Readonly<StartupRecoveryState> {
    return { ...this.state }
  }

  isBlockingReadiness(): boolean {
    return (
      this.state.phase === 'scheduled' ||
      this.state.phase === 'embedding' ||
      this.state.phase === 'training' ||
      this.state.phase === 'blocked'
    )
  }

  private async runRecovery(): Promise<void> {
    try {
      const missingEmbeddings = await this.options.neo4jRepository.getProductsWithoutEmbedding()
      if (missingEmbeddings.length > 0) {
        this.state = { phase: 'embedding' }
        await this.options.embeddingService.generateEmbeddings(this.options.neo4jRepository)
      }

      const probe = await this.probeTrainingDataAvailability()
      if (!probe.hasTrainingData) {
        this.options.logger?.warn(
          `[StartupRecovery] Blocked: no training data available (clients=${probe.clients}, products=${probe.products}, orders=${probe.orders})`
        )
        this.state = { phase: 'blocked', reason: 'no-training-data' }
        return
      }

      const jobId = this.acquireJobId()
      if (!jobId) {
        this.state = { phase: 'blocked', reason: 'training-failed' }
        return
      }

      this.state = { phase: 'training', jobId }
      const terminalJob = await this.options.trainingJobRegistry.waitFor(jobId)
      const modelWasRecovered = this.options.versionedModelStore.getModel() !== null

      if (!terminalJob || terminalJob.status === 'failed' || !modelWasRecovered) {
        this.state = { phase: 'blocked', reason: 'training-failed', jobId }
        return
      }

      this.state = { phase: 'completed', jobId, recoveredAt: new Date().toISOString() }
    } catch (error) {
      if (error instanceof ApiServiceUnavailableError) {
        this.state = { phase: 'blocked', reason: 'api-unavailable' }
      } else if (error instanceof Neo4jUnavailableError) {
        this.state = { phase: 'blocked', reason: 'neo4j-unavailable' }
      } else {
        this.state = { phase: 'blocked', reason: 'training-failed' }
      }

      this.options.logger?.error(`[StartupRecovery] Recovery failed: ${this.getErrorMessage(error)}`)
    }
  }

  private acquireJobId(): string | undefined {
    const activeJobId = this.options.trainingJobRegistry.getActiveJobId()
    if (activeJobId) {
      return activeJobId
    }

    try {
      return this.options.trainingJobRegistry.enqueue().jobId
    } catch (error) {
      if (error instanceof ConflictError) {
        return this.options.trainingJobRegistry.getActiveJobId()
      }
      throw error
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }

  private async probeTrainingDataAvailability(): Promise<TrainingDataProbe> {
    let latestProbe = await this.options.modelTrainer.probeTrainingDataAvailability()

    for (let attempt = 2; attempt <= this.trainingDataProbeAttempts; attempt++) {
      if (latestProbe.hasTrainingData) {
        return latestProbe
      }

      this.options.logger?.warn(
        `[StartupRecovery] Training data probe attempt ${attempt - 1}/${this.trainingDataProbeAttempts} ` +
        `returned clients=${latestProbe.clients}, products=${latestProbe.products}, orders=${latestProbe.orders}. ` +
        `Retrying in ${this.trainingDataProbeDelayMs}ms.`
      )

      if (this.trainingDataProbeDelayMs > 0) {
        await this.sleep(this.trainingDataProbeDelayMs)
      }

      latestProbe = await this.options.modelTrainer.probeTrainingDataAvailability()
    }

    return latestProbe
  }
}
