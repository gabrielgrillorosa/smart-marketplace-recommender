import * as tf from '@tensorflow/tfjs-node'
import { TrainingStatus, TrainingMetadata } from '../types/index.js'

export class ModelStore {
  private model: tf.LayersModel | null = null
  private status: TrainingStatus = { status: 'untrained' }

  getModel(): tf.LayersModel | null {
    return this.model
  }

  getStatus(): TrainingStatus {
    return { ...this.status }
  }

  setModel(model: tf.LayersModel, metadata: TrainingMetadata): void {
    this.model = model
    this.status = {
      status: 'trained',
      trainedAt: metadata.trainedAt,
      finalLoss: metadata.finalLoss,
      finalAccuracy: metadata.finalAccuracy,
      trainingSamples: metadata.trainingSamples,
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
  }
}
