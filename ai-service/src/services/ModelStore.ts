import * as tf from '@tensorflow/tfjs-node'
import { TrainingStatus, TrainingMetadata, type NeuralHeadKind } from '../types/index.js'

const MS_PER_DAY = 86_400_000

export type EnrichedTrainingStatus = TrainingStatus & {
  staleDays: number | null
  staleWarning?: string
}

export class ModelStore {
  private model: tf.LayersModel | null = null
  private status: TrainingStatus = { status: 'untrained' }
  private neuralHeadKind: NeuralHeadKind = 'bce_sigmoid'

  getModel(): tf.LayersModel | null {
    return this.model
  }

  getNeuralHeadKind(): NeuralHeadKind {
    return this.neuralHeadKind
  }

  getStatus(): TrainingStatus {
    return { ...this.status }
  }

  getEnrichedStatus(nowFn: () => Date = () => new Date()): EnrichedTrainingStatus {
    const base = { ...this.status }
    const head = { neuralHeadKind: this.neuralHeadKind }

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

  setModel(model: tf.LayersModel, metadata: TrainingMetadata): void {
    this.model = model
    this.neuralHeadKind = metadata.neuralHeadKind ?? 'bce_sigmoid'
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
  }
}
