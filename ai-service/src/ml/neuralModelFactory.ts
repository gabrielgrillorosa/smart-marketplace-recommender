import * as tf from '@tensorflow/tfjs-node'
import type { NeuralLossMode } from '../types/index.js'

const L2 = 1e-4

/** Baseline matches production `ModelTrainer` / ADR-028. */
export type NeuralArchProfile = 'baseline' | 'deep64_32' | 'deep128_64'

function addOutputHead(model: tf.Sequential, neuralLossMode: NeuralLossMode): void {
  if (neuralLossMode === 'pairwise') {
    model.add(tf.layers.dense({ units: 1, activation: 'linear' }))
  } else {
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
  }
}

export function buildNeuralModel(
  profile: NeuralArchProfile,
  neuralLossMode: NeuralLossMode = 'bce'
): tf.Sequential {
  const model = tf.sequential()
  switch (profile) {
    case 'baseline':
      model.add(
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          inputShape: [768],
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
      addOutputHead(model, neuralLossMode)
      break
    case 'deep64_32':
      model.add(
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          inputShape: [768],
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
      model.add(
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
      addOutputHead(model, neuralLossMode)
      break
    case 'deep128_64':
      model.add(
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          inputShape: [768],
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.25 }))
      model.add(
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
      addOutputHead(model, neuralLossMode)
      break
  }
  return model
}
