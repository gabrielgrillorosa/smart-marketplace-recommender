import { randomUUID } from 'node:crypto'
import { TrainingJob, JobStatus } from '../types/index.js'
import { ModelTrainer, ConflictError } from './ModelTrainer.js'
import { VersionedModelStore } from './VersionedModelStore.js'

const MAX_JOBS = 20

export class TrainingJobRegistry {
  private readonly jobs = new Map<string, TrainingJob>()
  private readonly waiters = new Map<string, Set<(job: TrainingJob) => void>>()

  constructor(
    private readonly modelTrainer: ModelTrainer,
    private readonly versionedModelStore: VersionedModelStore,
  ) {}

  getActiveJobId(): string | undefined {
    return Array.from(this.jobs.values()).find(
      (j) => j.status === 'queued' || j.status === 'running'
    )?.jobId
  }

  enqueue(): { jobId: string; status: JobStatus; message: string } {
    if (this.modelTrainer.isTraining) {
      throw new ConflictError()
    }

    const jobId = randomUUID()
    const job: TrainingJob = {
      jobId,
      status: 'queued',
      startedAt: new Date().toISOString(),
    }
    this.jobs.set(jobId, job)

    setImmediate(() => {
      void this._runJob(jobId)
    })

    return { jobId, status: 'queued', message: 'Training job queued' }
  }

  getJob(jobId: string): TrainingJob | undefined {
    return this.jobs.get(jobId)
  }

  waitFor(jobId: string): Promise<TrainingJob | undefined> {
    const existing = this.jobs.get(jobId)
    if (!existing) {
      return Promise.resolve(undefined)
    }

    if (this._isTerminal(existing.status)) {
      return Promise.resolve(existing)
    }

    return new Promise<TrainingJob>((resolve) => {
      const listeners = this.waiters.get(jobId) ?? new Set<(job: TrainingJob) => void>()
      const resolver = (job: TrainingJob) => {
        resolve(job)
      }
      listeners.add(resolver)
      this.waiters.set(jobId, listeners)

      // Guard against race between listener registration and a near-simultaneous status update.
      const latest = this.jobs.get(jobId)
      if (latest && this._isTerminal(latest.status)) {
        listeners.delete(resolver)
        if (listeners.size === 0) {
          this.waiters.delete(jobId)
        }
        resolve(latest)
      }
    })
  }

  private async _runJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId)
    if (!job) return

    this._updateJob(jobId, { status: 'running' })

    this.modelTrainer.setProgressCallback((epoch, totalEpochs, loss) => {
      this._updateJob(jobId, { epoch, totalEpochs, loss })
    })

    try {
      const result = await this.modelTrainer.train()
      const trainedModel = this.versionedModelStore.getModel()
      if (trainedModel) {
        await this.versionedModelStore.saveVersioned(trainedModel, result)
      }
      this._updateJob(jobId, {
        status: 'done',
        completedAt: new Date().toISOString(),
        loss: result.finalLoss,
      })
    } catch (err) {
      this._updateJob(jobId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      })
    } finally {
      this._pruneJobs()
    }
  }

  private _updateJob(jobId: string, updates: Partial<TrainingJob>): void {
    const existing = this.jobs.get(jobId)
    if (existing) {
      const updated = { ...existing, ...updates }
      this.jobs.set(jobId, updated)
      if (this._isTerminal(updated.status)) {
        this._notifyWaiters(jobId, updated)
      }
    }
  }

  private _pruneJobs(): void {
    if (this.jobs.size <= MAX_JOBS) return
    const sorted = Array.from(this.jobs.entries())
      .sort((a, b) => {
        const aTime = a[1].startedAt ?? ''
        const bTime = b[1].startedAt ?? ''
        return bTime.localeCompare(aTime)
      })
    const toDelete = sorted.slice(MAX_JOBS)
    for (const [id] of toDelete) {
      this.jobs.delete(id)
      this.waiters.delete(id)
    }
  }

  private _notifyWaiters(jobId: string, job: TrainingJob): void {
    const listeners = this.waiters.get(jobId)
    if (!listeners || listeners.size === 0) {
      return
    }

    this.waiters.delete(jobId)
    for (const resolve of listeners) {
      resolve(job)
    }
  }

  private _isTerminal(status: JobStatus): boolean {
    return status === 'done' || status === 'failed'
  }
}
