import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import { ModelHistoryEntry, TrainingResult } from '../types/index.js'

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

export class VersionedModelStore extends ModelStore {
  constructor(private readonly fsPort: FsPort = defaultFsPort) {
    super()
  }

  async saveVersioned(model: tf.LayersModel, result: TrainingResult): Promise<void> {
    await this.fsPort.mkdir(MODEL_DIR, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `model-${timestamp}.json`
    const filePath = path.join(MODEL_DIR, filename)

    await model.save(`file://${filePath.replace(/\.json$/, '')}`)

    const currentPrecisionAt5 = await this._getCurrentPrecisionAt5()
    const newPrecisionAt5 = result.precisionAt5 ?? 0

    if (newPrecisionAt5 > 0 || currentPrecisionAt5 > 0) {
      // At least one model has a precision metric — use it for comparison
      if (newPrecisionAt5 >= currentPrecisionAt5) {
        await this._updateSymlink(filename)
        super.setModel(model, {
          trainedAt: result.syncedAt ?? new Date().toISOString(),
          finalLoss: result.finalLoss,
          finalAccuracy: result.finalAccuracy,
          trainingSamples: result.trainingSamples,
          durationMs: result.durationMs,
          syncedAt: result.syncedAt,
          precisionAt5: newPrecisionAt5,
        })
      } else {
        console.info(
          `[VersionedModelStore] New model rejected: precisionAt5 ${newPrecisionAt5.toFixed(4)} < current ${currentPrecisionAt5.toFixed(4)}`
        )
      }
    } else {
      // fallback: compare loss (lower is better) when both precisionAt5 === 0
      const currentLoss = await this._getCurrentLoss()
      if (result.finalLoss <= currentLoss || currentLoss === Infinity) {
        await this._updateSymlink(filename)
        super.setModel(model, {
          trainedAt: result.syncedAt ?? new Date().toISOString(),
          finalLoss: result.finalLoss,
          finalAccuracy: result.finalAccuracy,
          trainingSamples: result.trainingSamples,
          durationMs: result.durationMs,
          syncedAt: result.syncedAt,
          precisionAt5: newPrecisionAt5,
        })
      } else {
        console.info(
          `[VersionedModelStore] New model rejected (loss fallback): ${result.finalLoss.toFixed(4)} > current ${currentLoss.toFixed(4)}`
        )
      }
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

  private async _getCurrentPrecisionAt5(): Promise<number> {
    const status = this.getStatus()
    return status.precisionAt5 ?? 0
  }

  private async _getCurrentLoss(): Promise<number> {
    const status = this.getStatus()
    if (status.status !== 'trained' || !status.finalLoss) return Infinity
    return status.finalLoss
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
