import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import {
  LastDecision,
  LastTrainingResult,
  ModelHistoryEntry,
  TrainingResult,
  TrainingTrigger,
} from '../types/index.js'

export interface FsPort {
  symlink(target: string, linkPath: string): Promise<void>
  unlink(p: string): Promise<void>
  readdir(dir: string): Promise<string[]>
  stat(p: string): Promise<{ mtimeMs: number }>
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>
  readlink(p: string): Promise<string>
}

export const defaultFsPort: FsPort = {
  symlink: (target, linkPath) => fs.symlink(target, linkPath),
  unlink: (p) => fs.unlink(p),
  readdir: (dir) => fs.readdir(dir),
  stat: (p) => fs.stat(p),
  mkdir: (dir, opts) => fs.mkdir(dir, opts),
  readlink: (p) => fs.readlink(p),
}

const MODEL_DIR = '/tmp/model'
const CURRENT_LINK = path.join(MODEL_DIR, 'current')
const MAX_HISTORY = 5
const DEFAULT_PROMOTION_TOLERANCE = 0.02

export interface SaveVersionedContext {
  triggeredBy: TrainingTrigger
  orderId?: string
}

export class VersionedModelStore extends ModelStore {
  private currentVersion: string | null = null
  private lastTrainingResult: LastTrainingResult | null = null
  private lastTrainingTriggeredBy: TrainingTrigger | null = null
  private lastOrderId: string | null = null
  private lastDecision: LastDecision | null = null

  constructor(private readonly fsPort: FsPort = defaultFsPort) {
    super()
  }

  async saveVersioned(
    model: tf.LayersModel,
    result: TrainingResult,
    context: SaveVersionedContext
  ): Promise<void> {
    await this.fsPort.mkdir(MODEL_DIR, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `model-${timestamp}.json`
    const filePath = path.join(MODEL_DIR, filename)

    await model.save(`file://${filePath.replace(/\.json$/, '')}`)

    const tolerance = this._getPromotionTolerance()
    const candidatePrecisionAt5 = result.precisionAt5 ?? 0
    const status = this.getStatus()
    const hasCurrentPrecision = status.status === 'trained' && typeof status.precisionAt5 === 'number'
    const currentPrecisionAt5 = hasCurrentPrecision ? status.precisionAt5 ?? 0 : 0

    let accepted = false
    let reason = 'no_current_precision_baseline'

    if (!hasCurrentPrecision) {
      accepted = true
    } else if (candidatePrecisionAt5 >= currentPrecisionAt5 - tolerance) {
      accepted = true
      reason = 'candidate_within_tolerance_band'
    } else {
      reason = 'candidate_below_tolerance_gate'
    }

    this.lastTrainingTriggeredBy = context.triggeredBy
    this.lastOrderId = context.orderId ?? null

    if (accepted) {
      await this._updateSymlink(filename)
      this.currentVersion = filename
      this.lastTrainingResult = 'promoted'
      this.lastDecision = null

      super.setModel(model, {
        trainedAt: result.syncedAt ?? new Date().toISOString(),
        finalLoss: result.finalLoss,
        finalAccuracy: result.finalAccuracy,
        trainingSamples: result.trainingSamples,
        durationMs: result.durationMs,
        syncedAt: result.syncedAt,
        precisionAt5: candidatePrecisionAt5,
      })
    } else {
      this.lastTrainingResult = 'rejected'
      this.lastDecision = {
        accepted: false,
        reason,
        currentPrecisionAt5,
        candidatePrecisionAt5,
        tolerance,
        currentVersion: this.currentVersion,
      }
      console.info(
        `[VersionedModelStore] New model rejected: precisionAt5 ${candidatePrecisionAt5.toFixed(4)} below gate ${(currentPrecisionAt5 - tolerance).toFixed(4)} (current=${currentPrecisionAt5.toFixed(4)}, tolerance=${tolerance.toFixed(4)})`
      )
    }

    await this.pruneHistory()
  }

  async loadCurrent(): Promise<void> {
    try {
      await this.fsPort.readlink(CURRENT_LINK)
    } catch {
      // symlink does not exist — try to find most recent model file
      try {
        const files = await this._getModelFilesSortedByMtime()
        if (files.length === 0) {
          console.info('[VersionedModelStore] No model files found — starting untrained')
          return
        }
        const mostRecent = files[0]
        const modelPath = path.join(MODEL_DIR, mostRecent.replace(/\.json$/, ''))
        const loadedModel = await tf.loadLayersModel(`file://${modelPath}/model.json`)
        super.setModel(loadedModel, {
          trainedAt: new Date().toISOString(),
          finalLoss: 0,
          finalAccuracy: 0,
          trainingSamples: 0,
          durationMs: 0,
        })
        this.currentVersion = mostRecent
        console.info(`[VersionedModelStore] Loaded most recent model: ${mostRecent}`)
      } catch {
        console.info('[VersionedModelStore] No loadable model found — starting untrained')
      }
      return
    }

    try {
      const target = await this.fsPort.readlink(CURRENT_LINK)
      const modelPath = path.join(MODEL_DIR, path.basename(target).replace(/\.json$/, ''))
      const loadedModel = await tf.loadLayersModel(`file://${modelPath}/model.json`)
      super.setModel(loadedModel, {
        trainedAt: new Date().toISOString(),
        finalLoss: 0,
        finalAccuracy: 0,
        trainingSamples: 0,
        durationMs: 0,
      })
      this.currentVersion = path.basename(target)
      console.info(`[VersionedModelStore] Loaded current model from symlink: ${target}`)
    } catch (err) {
      console.warn('[VersionedModelStore] Failed to load current model:', err)
    }
  }

  async getHistory(): Promise<ModelHistoryEntry[]> {
    const files = await this._getModelFilesSortedByMtime()
    const recent = files.slice(0, MAX_HISTORY)

    let currentTarget: string | undefined
    try {
      currentTarget = path.basename(await this.fsPort.readlink(CURRENT_LINK))
    } catch {
      // no symlink
    }

    return recent.map((f) => ({
      filename: f,
      timestamp: this._extractTimestamp(f),
      precisionAt5: 0,
      loss: 0,
      accepted: f === currentTarget,
    }))
  }

  async pruneHistory(): Promise<void> {
    const files = await this._getModelFilesSortedByMtime()
    const toDelete = files.slice(MAX_HISTORY)
    for (const f of toDelete) {
      const filePath = path.join(MODEL_DIR, f)
      try {
        await this.fsPort.unlink(filePath)
      } catch (err) {
        console.warn(`[VersionedModelStore] Failed to prune ${f}:`, err)
      }
    }
  }

  markTrainingFailed(context: SaveVersionedContext): void {
    this.lastTrainingResult = 'failed'
    this.lastTrainingTriggeredBy = context.triggeredBy
    this.lastOrderId = context.orderId ?? null
    this.lastDecision = null
  }

  getGovernanceStatus(): {
    currentVersion: string | null
    lastTrainingResult: LastTrainingResult | null
    lastTrainingTriggeredBy: TrainingTrigger | null
    lastOrderId: string | null
    lastDecision: LastDecision | null
  } {
    return {
      currentVersion: this.currentVersion,
      lastTrainingResult: this.lastTrainingResult,
      lastTrainingTriggeredBy: this.lastTrainingTriggeredBy,
      lastOrderId: this.lastOrderId,
      lastDecision: this.lastDecision,
    }
  }

  private async _getModelFilesSortedByMtime(): Promise<string[]> {
    try {
      const entries = await this.fsPort.readdir(MODEL_DIR)
      const jsonFiles = entries.filter((f) => f.startsWith('model-') && f.endsWith('.json'))

      const withStats = await Promise.all(
        jsonFiles.map(async (f) => {
          try {
            const st = await this.fsPort.stat(path.join(MODEL_DIR, f))
            return { f, mtimeMs: st.mtimeMs }
          } catch {
            return { f, mtimeMs: 0 }
          }
        })
      )

      return withStats.sort((a, b) => b.mtimeMs - a.mtimeMs).map((x) => x.f)
    } catch {
      return []
    }
  }

  private _getPromotionTolerance(): number {
    const rawTolerance = process.env.MODEL_PROMOTION_TOLERANCE
    if (rawTolerance == null || rawTolerance === '') {
      return DEFAULT_PROMOTION_TOLERANCE
    }

    const parsed = Number(rawTolerance)
    if (Number.isNaN(parsed) || parsed < 0) {
      console.warn(
        `[VersionedModelStore] Invalid MODEL_PROMOTION_TOLERANCE="${rawTolerance}", using ${DEFAULT_PROMOTION_TOLERANCE}`
      )
      return DEFAULT_PROMOTION_TOLERANCE
    }
    return parsed
  }

  private async _updateSymlink(filename: string): Promise<void> {
    try {
      await this.fsPort.unlink(CURRENT_LINK)
    } catch {
      // symlink may not exist yet
    }
    await this.fsPort.symlink(filename, CURRENT_LINK)
    console.info(`[VersionedModelStore] Symlink updated → ${filename}`)
  }

  private _extractTimestamp(filename: string): string {
    // filename: model-2026-04-25T02-00-00-000Z.json
    const match = filename.match(/model-(.+)\.json$/)
    if (!match) return ''
    return match[1].replace(/-/g, ':').replace('T', 'T').slice(0, 24)
  }
}
