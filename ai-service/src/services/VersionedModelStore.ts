import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as tf from '@tensorflow/tfjs-node'
import { ModelStore } from './ModelStore.js'
import {
  LastDecision,
  LastTrainingResult,
  ModelHistoryEntry,
  TrainingMetadata,
  TrainingResult,
  TrainingTrigger,
  type ModelArchitectureKind,
  type NeuralHeadKind,
} from '../types/index.js'
import { NEURAL_HEAD_MANIFEST_FILENAME, parseNeuralHeadManifestJson } from './neuralHeadManifest.js'
import {
  M22_ITEM_MANIFEST_FILENAME,
  readM22ItemManifestFromModelDir,
  type M22ItemManifest,
} from '../ml/m22Manifest.js'
import {
  TRAINING_METADATA_FILENAME,
  modelFilenameToCheckpointIso,
  parsePersistedTrainingMetadataJson,
  type PersistedTrainingMetadata,
} from './trainingMetadata.js'

export interface FsStatResult {
  mtimeMs: number
  isFile: boolean
  isDirectory: boolean
}

export interface FsPort {
  symlink(target: string, linkPath: string): Promise<void>
  unlink(p: string): Promise<void>
  /** Remove file or directory (`recursive` for checkpoint dirs). */
  rm(p: string, opts?: { recursive?: boolean; force?: boolean }): Promise<void>
  readdir(dir: string): Promise<string[]>
  stat(p: string): Promise<FsStatResult>
  mkdir(dir: string, opts: { recursive: boolean }): Promise<unknown>
  readlink(p: string): Promise<string>
}

export const defaultFsPort: FsPort = {
  symlink: (target, linkPath) => fs.symlink(target, linkPath),
  unlink: (p) => fs.unlink(p),
  rm: (p, opts) => fs.rm(p, opts ?? { recursive: true, force: true }),
  readdir: (dir) => fs.readdir(dir),
  stat: async (p) => {
    const s = await fs.stat(p)
    return { mtimeMs: s.mtimeMs, isFile: s.isFile(), isDirectory: s.isDirectory() }
  },
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

export interface SaveVersionedOutcome {
  promoted: boolean
  /** Set when `promoted` is false (governance / precision gate). */
  rejectReason?: string
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
  ): Promise<SaveVersionedOutcome> {
    await this.fsPort.mkdir(MODEL_DIR, { recursive: true })

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `model-${timestamp}.json`
    const filePath = path.join(MODEL_DIR, filename)

    const modelDir = filePath.replace(/\.json$/, '')
    await model.save(`file://${modelDir}`)
    await fs.mkdir(modelDir, { recursive: true })
    await fs.writeFile(
      path.join(modelDir, NEURAL_HEAD_MANIFEST_FILENAME),
      JSON.stringify({ head: result.neuralHeadKind }, null, 2),
      'utf8'
    )

    if (result.m22ItemManifest) {
      await fs.writeFile(
        path.join(modelDir, M22_ITEM_MANIFEST_FILENAME),
        `${JSON.stringify(result.m22ItemManifest, null, 2)}\n`,
        'utf8'
      )
    }

    const tolerance = this._getPromotionTolerance()
    const candidatePrecisionAt5 = result.precisionAt5 ?? 0
    const status = this.getStatus()
    const hasCurrentPrecision = status.status === 'trained' && typeof status.precisionAt5 === 'number'
    const currentPrecisionAt5 = hasCurrentPrecision ? status.precisionAt5 ?? 0 : 0

    const candidateArch: ModelArchitectureKind =
      result.modelArchitecture ?? (result.m22ItemManifest ? 'm22' : 'baseline')
    const loadedArch = this.getModelArchitecture()

    /** P@5 is only comparable across training jobs with the same checkpoint architecture. */
    const architectureDiffers =
      hasCurrentPrecision && loadedArch !== candidateArch

    let accepted = false
    let reason = 'no_current_precision_baseline'

    if (!hasCurrentPrecision) {
      accepted = true
    } else if (architectureDiffers) {
      accepted = true
      reason = 'architecture_change_skip_numeric_gate'
      console.info(
        `[VersionedModelStore] Promoting without P@5 gate: architecture ${loadedArch} → ${candidateArch} ` +
          '(offline metrics are not comparable across architectures)'
      )
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

      const trainedAt = result.syncedAt ?? new Date().toISOString()
      const arch: ModelArchitectureKind = result.modelArchitecture ?? (result.m22ItemManifest ? 'm22' : 'baseline')
      super.setModel(model, {
        trainedAt,
        finalLoss: result.finalLoss,
        finalAccuracy: result.finalAccuracy,
        trainingSamples: result.trainingSamples,
        durationMs: result.durationMs,
        syncedAt: result.syncedAt,
        precisionAt5: candidatePrecisionAt5,
        neuralHeadKind: result.neuralHeadKind,
        modelArchitecture: arch,
      }, {
        m22ItemManifest: result.m22ItemManifest ?? null,
        modelArchitecture: arch,
      })

      const persisted: PersistedTrainingMetadata = {
        trainedAt,
        finalLoss: result.finalLoss,
        finalAccuracy: result.finalAccuracy,
        trainingSamples: result.trainingSamples,
        durationMs: result.durationMs,
        syncedAt: result.syncedAt,
        precisionAt5: candidatePrecisionAt5,
        neuralHeadKind: result.neuralHeadKind,
        modelArchitecture: arch,
      }
      await fs.writeFile(
        path.join(modelDir, TRAINING_METADATA_FILENAME),
        `${JSON.stringify(persisted, null, 2)}\n`,
        'utf8'
      )
      console.info(`[VersionedModelStore] Promoted checkpoint architecture=${arch} (${filename})`)
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
    return {
      promoted: accepted,
      rejectReason: accepted ? undefined : reason,
    }
  }

  private async _loadM22ManifestSafe(modelDir: string): Promise<M22ItemManifest | null> {
    try {
      return await readM22ItemManifestFromModelDir(modelDir)
    } catch (e) {
      console.warn('[VersionedModelStore] Invalid or unreadable M22 manifest — ignoring:', e)
      return null
    }
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
        const neuralHeadKind = await this._loadNeuralHeadKindFromDisk(modelPath)
        const loadedModel = await tf.loadLayersModel(`file://${modelPath}/model.json`)
        const diskMeta = await this._readPersistedTrainingMetadata(modelPath)
        const inferredTs = modelFilenameToCheckpointIso(mostRecent) ?? new Date().toISOString()
        const baseMeta = this._metadataForLoadedCheckpoint(diskMeta, neuralHeadKind, inferredTs)
        const m22Manifest = await this._loadM22ManifestSafe(modelPath)
        const arch: ModelArchitectureKind =
          diskMeta?.modelArchitecture ?? (m22Manifest ? 'm22' : 'baseline')
        super.setModel(loadedModel, { ...baseMeta, modelArchitecture: arch }, {
          m22ItemManifest: m22Manifest,
          modelArchitecture: arch,
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
      const basename = path.basename(target)
      const modelPath = path.join(MODEL_DIR, basename.replace(/\.json$/, ''))
      const neuralHeadKind = await this._loadNeuralHeadKindFromDisk(modelPath)
      const loadedModel = await tf.loadLayersModel(`file://${modelPath}/model.json`)
      const diskMeta = await this._readPersistedTrainingMetadata(modelPath)
      const inferredTs = modelFilenameToCheckpointIso(basename) ?? new Date().toISOString()
      const baseMeta = this._metadataForLoadedCheckpoint(diskMeta, neuralHeadKind, inferredTs)
      const m22Manifest = await this._loadM22ManifestSafe(modelPath)
      const arch: ModelArchitectureKind =
        diskMeta?.modelArchitecture ?? (m22Manifest ? 'm22' : 'baseline')
      super.setModel(loadedModel, { ...baseMeta, modelArchitecture: arch }, {
        m22ItemManifest: m22Manifest,
        modelArchitecture: arch,
      })
      this.currentVersion = basename
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
      const top = path.join(MODEL_DIR, f)
      try {
        const st = await this.fsPort.stat(top)
        if (st.isFile) {
          await this.fsPort.unlink(top)
          continue
        }
      } catch {
        // fall through — checkpoint dir uses label `name.json` but folder has no .json suffix
      }
      const dirName = f.endsWith('.json') ? f.slice(0, -'.json'.length) : f
      const dirPath = path.join(MODEL_DIR, dirName)
      try {
        await this.fsPort.rm(dirPath, { recursive: true, force: true })
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

  private async _readPersistedTrainingMetadata(modelDir: string): Promise<PersistedTrainingMetadata | null> {
    try {
      const text = await fs.readFile(path.join(modelDir, TRAINING_METADATA_FILENAME), 'utf8')
      return parsePersistedTrainingMetadataJson(text)
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
      if (code === 'ENOENT') return null
      console.warn('[VersionedModelStore] Failed to read training-metadata.json:', e)
      return null
    }
  }

  private _metadataForLoadedCheckpoint(
    disk: PersistedTrainingMetadata | null,
    neuralHeadKind: NeuralHeadKind,
    inferredCheckpointIso: string
  ): TrainingMetadata {
    if (disk) {
      return {
        trainedAt: disk.trainedAt,
        finalLoss: disk.finalLoss,
        finalAccuracy: disk.finalAccuracy,
        trainingSamples: disk.trainingSamples,
        durationMs: disk.durationMs,
        syncedAt: disk.syncedAt,
        precisionAt5: disk.precisionAt5,
        neuralHeadKind: disk.neuralHeadKind ?? neuralHeadKind,
        modelArchitecture: disk.modelArchitecture,
      }
    }
    return {
      trainedAt: inferredCheckpointIso,
      finalLoss: 0,
      finalAccuracy: 0,
      trainingSamples: 0,
      durationMs: 0,
      neuralHeadKind,
    }
  }

  private async _loadNeuralHeadKindFromDisk(modelDir: string): Promise<NeuralHeadKind> {
    const manifestPath = path.join(modelDir, NEURAL_HEAD_MANIFEST_FILENAME)
    try {
      const text = await fs.readFile(manifestPath, 'utf8')
      return parseNeuralHeadManifestJson(text)
    } catch (e) {
      const code =
        e && typeof e === 'object' && 'code' in e ? (e as NodeJS.ErrnoException).code : undefined
      if (code === 'ENOENT') return 'bce_sigmoid'
      throw e
    }
  }

  private async _getModelFilesSortedByMtime(): Promise<string[]> {
    try {
      const entries = await this.fsPort.readdir(MODEL_DIR)
      const candidates: { label: string; mtimeMs: number }[] = []

      for (const name of entries) {
        if (!name.startsWith('model-')) continue
        const full = path.join(MODEL_DIR, name)

        if (name.endsWith('.json')) {
          try {
            const st = await this.fsPort.stat(full)
            if (st.isFile) {
              candidates.push({ label: name, mtimeMs: st.mtimeMs })
            }
          } catch {
            continue
          }
          continue
        }

        try {
          const st = await this.fsPort.stat(full)
          if (!st.isDirectory) continue
          try {
            await this.fsPort.stat(path.join(full, 'model.json'))
          } catch {
            continue
          }
          candidates.push({ label: `${name}.json`, mtimeMs: st.mtimeMs })
        } catch {
          continue
        }
      }

      return candidates.sort((a, b) => b.mtimeMs - a.mtimeMs).map((x) => x.label)
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
