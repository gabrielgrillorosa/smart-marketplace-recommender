import * as tf from '@tensorflow/tfjs-node'
import type { M22ItemManifest } from '../ml/m22Manifest.js'
import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'
import type {
  ModelArchitectureKind,
  NeuralHeadKind,
  TrainingMetadata,
  TrainingStatus,
} from '../types/index.js'

export type SetModelOptions = {
  m22ItemManifest?: M22ItemManifest | null
  modelArchitecture?: ModelArchitectureKind
}

const MS_PER_DAY = 86_400_000

export type EnrichedTrainingStatus = TrainingStatus & {
  staleDays: number | null
  staleWarning?: string
}

export class ModelStore {
  private model: tf.LayersModel | null = null
  private status: TrainingStatus = { status: 'untrained' }
  private neuralHeadKind: NeuralHeadKind = 'bce_sigmoid'
  private m22ItemManifest: M22ItemManifest | null = null
  private modelArchitecture: ModelArchitectureKind = 'baseline'
  private modelArchitectureProfile: NeuralArchProfile | undefined = undefined
  private poolingMode: ProfilePoolingMode | undefined = undefined
  private poolingHalfLifeDays: number | undefined = undefined
  private poolingAttentionTemperature: number | null | undefined = undefined
  private poolingAttentionMaxEntries: number | undefined = undefined

  getModel(): tf.LayersModel | null {
    return this.model
  }

  getM22ItemManifest(): M22ItemManifest | null {
    return this.m22ItemManifest
  }

  getModelArchitecture(): ModelArchitectureKind {
    return this.modelArchitecture
  }

  getNeuralHeadKind(): NeuralHeadKind {
    return this.neuralHeadKind
  }

  getStatus(): TrainingStatus {
    return { ...this.status }
  }

  getEnrichedStatus(nowFn: () => Date = () => new Date()): EnrichedTrainingStatus {
    const base = { ...this.status }
    const head = {
      neuralHeadKind: this.neuralHeadKind,
      modelArchitecture: this.modelArchitecture,
      modelArchitectureProfile: this.modelArchitectureProfile,
      poolingMode: this.poolingMode,
      poolingHalfLifeDays: this.poolingHalfLifeDays,
      poolingAttentionTemperature: this.poolingAttentionTemperature,
      poolingAttentionMaxEntries: this.poolingAttentionMaxEntries,
    }

    if (base.status === 'trained' && base.trainedAt) {
      const staleDays = Math.floor((nowFn().getTime() - new Date(base.trainedAt).getTime()) / MS_PER_DAY)
      const staleWarning = staleDays >= 7
        ? `Model trained ${staleDays} days ago — consider retraining`
        : undefined
      return { ...base, ...head, staleDays, staleWarning }
    }

    // Sempre expor neuralHeadKind (runtime default ou último treino) para a UI exigir BCE vs pairwise.
    return { ...base, ...head, staleDays: null }
  }

  setModel(model: tf.LayersModel, metadata: TrainingMetadata, options?: SetModelOptions): void {
    this.model = model
    this.neuralHeadKind = metadata.neuralHeadKind ?? 'bce_sigmoid'
    this.modelArchitecture = options?.modelArchitecture ?? metadata.modelArchitecture ?? 'baseline'
    this.modelArchitectureProfile = metadata.modelArchitectureProfile
    this.poolingMode = metadata.poolingMode
    this.poolingHalfLifeDays = metadata.poolingHalfLifeDays
    this.poolingAttentionTemperature = metadata.poolingAttentionTemperature
    this.poolingAttentionMaxEntries = metadata.poolingAttentionMaxEntries
    this.m22ItemManifest = options?.m22ItemManifest ?? null
    if (this.modelArchitecture === 'm22' && !this.m22ItemManifest) {
      console.warn('[ModelStore] modelArchitecture=m22 but no m22ItemManifest — forcing baseline metadata')
      this.modelArchitecture = 'baseline'
    }
    this.status = {
      status: 'trained',
      trainedAt: metadata.trainedAt,
      finalLoss: metadata.finalLoss,
      finalAccuracy: metadata.finalAccuracy,
      trainingSamples: metadata.trainingSamples,
      syncedAt: metadata.syncedAt,
      precisionAt5: metadata.precisionAt5,
    }
  }

  setTraining(startedAt: string): void {
    this.status = { status: 'training', startedAt }
  }

  setProgress(epoch: number, total: number): void {
    this.status = { ...this.status, progress: `epoch ${epoch}/${total}` }
  }

  reset(): void {
    this.status = { status: 'untrained' }
    this.neuralHeadKind = 'bce_sigmoid'
    this.m22ItemManifest = null
    this.modelArchitecture = 'baseline'
    this.modelArchitectureProfile = undefined
    this.poolingMode = undefined
    this.poolingHalfLifeDays = undefined
    this.poolingAttentionTemperature = undefined
    this.poolingAttentionMaxEntries = undefined
  }
}
