import * as tf from '@tensorflow/tfjs-node'

const L2 = 1e-4

/** Baseline matches production `ModelTrainer` / ADR-028. */
export type NeuralArchProfile = 'baseline' | 'deep64_32' | 'deep128_64'

export function buildNeuralModel(profile: NeuralArchProfile): tf.Sequential {
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
      model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
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
      model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
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
      model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }))
      break
  }
  return model
}
