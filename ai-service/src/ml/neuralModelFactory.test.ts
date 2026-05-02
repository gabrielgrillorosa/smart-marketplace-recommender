import { describe, it, expect } from 'vitest'
import * as tf from '@tensorflow/tfjs-node'
import { buildNeuralModel } from './neuralModelFactory.js'

describe('buildNeuralModel', () => {
  it('ends with sigmoid when loss mode is bce (legacy)', () => {
    const m = buildNeuralModel('baseline', 'bce')
    const json = m.toJSON(null, false) as { config?: { layers?: { config?: { activation?: string } }[] } }
    const layers = json.config?.layers ?? []
    const last = layers[layers.length - 1]?.config
    expect(last?.activation).toBe('sigmoid')
    m.dispose()
  })

  it('ends with linear output when loss mode is pairwise', () => {
    const m = buildNeuralModel('baseline', 'pairwise')
    const json = m.toJSON(null, false) as { config?: { layers?: { config?: { activation?: string } }[] } }
    const layers = json.config?.layers ?? []
    const last = layers[layers.length - 1]?.config
    expect(last?.activation).toBe('linear')
    m.dispose()
  })

  it('fits pairwise logistic loss on a toy stacked batch without throwing', async () => {
    const pairwiseRankingLoss = (_yTrue: tf.Tensor, yPred: tf.Tensor): tf.Tensor =>
      tf.tidy(() => {
        const flat = yPred.reshape([-1])
        const twoP = flat.shape[0] ?? 0
        const p = Math.floor(twoP / 2)
        const pos = flat.slice([0], [p])
        const neg = flat.slice([p], [p])
        return tf.mean(tf.softplus(tf.sub(neg, pos)))
      })

    const model = buildNeuralModel('baseline', 'pairwise')
    model.compile({ optimizer: 'adam', loss: pairwiseRankingLoss, metrics: [] })

    const xs = tf.randomNormal([8, 768])
    /** Pairwise loss ignores y; Keras still requires sample count to match xs. */
    const ys = tf.ones([8, 1])
    await model.fit(xs, ys, { epochs: 1, batchSize: 8, verbose: 0 })
    xs.dispose()
    ys.dispose()
    model.dispose()
  })
})
