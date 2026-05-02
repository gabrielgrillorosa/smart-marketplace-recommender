/**
 * Train Dense(1) on (embedding, binary label) rows and export AttentionParams for inference JSON.
 */
import * as tf from '@tensorflow/tfjs-node'
import type { AttentionParams } from '../profile/attentionParamsJson.js'

export interface TrainAttentionPoolingOptions {
  /** L2 on the kernel (default 1e-4). */
  l2?: number
  maxEpochs?: number
  batchSize?: number
  /** Held-out fraction for early stopping (default 0.2). Set 0 to disable validation split. */
  validationSplit?: number
  learningRate?: number
  earlyStopPatience?: number
  /** Written into JSON `lambda` for runtime temporal mixing (not learned by this head). */
  lambdaInference?: number
}

export interface TrainAttentionPoolingResult {
  params: AttentionParams
  embeddingDim: number
  sampleCount: number
  epochsCompleted: number
  trainLoss: number
  valLoss: number | null
}

function classWeightForRows(labels: number[]): { 0: number; 1: number } {
  let pos = 0
  let neg = 0
  for (const y of labels) {
    if (y >= 0.5) pos++
    else neg++
  }
  if (pos === 0 || neg === 0) return { 0: 1, 1: 1 }
  const n = labels.length
  return { 0: n / (2 * neg), 1: n / (2 * pos) }
}

export async function trainAttentionPoolingDense(
  rows: { embedding: number[]; label: number }[],
  options: TrainAttentionPoolingOptions = {}
): Promise<TrainAttentionPoolingResult> {
  if (rows.length === 0) {
    throw new Error('trainAttentionPoolingDense: empty rows')
  }
  const dim = rows[0]!.embedding.length
  for (let i = 1; i < rows.length; i++) {
    const L = rows[i]!.embedding.length
    if (L !== dim) {
      throw new Error(`trainAttentionPoolingDense: embedding length mismatch ${L} vs ${dim} at row ${i}`)
    }
  }

  const l2 = options.l2 ?? 1e-4
  const maxEpochs = options.maxEpochs ?? 40
  const batchSize = options.batchSize ?? 32
  let validationSplit = options.validationSplit ?? 0.2
  if (rows.length < 5) validationSplit = 0

  const xsData = rows.map((r) => r.embedding)
  const ysData = rows.map((r) => [r.label])
  const cw = classWeightForRows(rows.map((r) => r.label))

  const model = tf.sequential()
  model.add(
    tf.layers.dense({
      units: 1,
      inputShape: [dim],
      useBias: true,
      kernelRegularizer: tf.regularizers.l2({ l2 }),
    })
  )
  model.compile({
    optimizer: tf.train.adam(options.learningRate ?? 0.01),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy'],
  })

  const xs = tf.tensor2d(xsData)
  const ys = tf.tensor2d(ysData)

  const patienceLimit = options.earlyStopPatience ?? 5
  let bestMonitor = Infinity
  let patience = 0
  let epochsCompleted = 0
  let lastTrainLoss = 0
  let lastValLoss: number | null = null

  for (let e = 0; e < maxEpochs; e++) {
    const h = await model.fit(xs, ys, {
      epochs: 1,
      batchSize,
      validationSplit,
      shuffle: true,
      verbose: 0,
      classWeight: { '0': cw[0], '1': cw[1] },
    })
    const tl = Number(h.history.loss?.[0] ?? 0)
    const vlRaw = h.history.val_loss?.[0]
    const vl = vlRaw !== undefined ? Number(vlRaw) : null
    lastTrainLoss = tl
    lastValLoss = vl
    epochsCompleted = e + 1

    if (validationSplit > 0 && vl !== null && Number.isFinite(vl)) {
      if (vl < bestMonitor - 1e-5) {
        bestMonitor = vl
        patience = 0
      } else {
        patience++
        if (patience >= patienceLimit) break
      }
    } else if (validationSplit <= 0) {
      if (tl < bestMonitor - 1e-5) {
        bestMonitor = tl
        patience = 0
      } else {
        patience++
        if (patience >= patienceLimit) break
      }
    }
  }

  const [kw, bw] = model.getWeights()
  const wFlat = kw.dataSync()
  if (wFlat.length < dim) {
    xs.dispose()
    ys.dispose()
    model.dispose()
    throw new Error('trainAttentionPoolingDense: unexpected kernel size')
  }
  const w = Array.from(wFlat.slice(0, dim))
  const b = Number(bw.dataSync()[0] ?? 0)

  xs.dispose()
  ys.dispose()
  model.dispose()

  const params: AttentionParams = {
    w,
    b,
    lambda: options.lambdaInference ?? 1.0,
  }

  return {
    params,
    embeddingDim: dim,
    sampleCount: rows.length,
    epochsCompleted,
    trainLoss: lastTrainLoss,
    valLoss: lastValLoss,
  }
}
