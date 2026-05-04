import * as tf from '@tensorflow/tfjs-node'
import type { M22ScoreRow } from './m22Manifest.js'
import { toHybridNeuralScalar } from './neuralHead.js'
import type { NeuralHeadKind, NeuralLossMode } from '../types/index.js'

const L2 = 1e-4

export type M22VocabSizes = {
  brand: number
  category: number
  subcategory: number
  priceBucket: number
  productId: number
}

const EMB_DIM_B = 8
const EMB_DIM_C = 8

function flatEmb(
  input: tf.SymbolicTensor,
  inputDim: number,
  name: string
): tf.SymbolicTensor {
  const emb = tf.layers
    .embedding({ inputDim, outputDim: EMB_DIM_B, name: `${name}_emb` })
    .apply(input) as tf.SymbolicTensor
  return tf.layers.flatten({ name: `${name}_flat` }).apply(emb) as tf.SymbolicTensor
}

/**
 * M22 — functional model: **f(u, e_sem, e_struct, e_id)** as concat + MLP.
 * HF (A) stays in `m22_sem` only; structural (B) and identity (C) use **disjoint** embedding tables.
 */
export function buildM22HybridNeuralModel(
  vocabSizes: M22VocabSizes,
  neuralLossMode: NeuralLossMode,
  profile: NeuralArchProfile = 'baseline'
): tf.LayersModel {
  const inSem = tf.input({ shape: [384], name: 'm22_sem' })
  const inUser = tf.input({ shape: [384], name: 'm22_user' })
  const inBB = tf.input({ shape: [1], dtype: 'int32', name: 'm22_b_brand' })
  const inBC = tf.input({ shape: [1], dtype: 'int32', name: 'm22_b_category' })
  const inBS = tf.input({ shape: [1], dtype: 'int32', name: 'm22_b_subcategory' })
  const inBP = tf.input({ shape: [1], dtype: 'int32', name: 'm22_b_price_bucket' })
  const inC = tf.input({ shape: [1], dtype: 'int32', name: 'm22_c_product' })

  const bBrand = flatEmb(inBB, vocabSizes.brand, 'm22_brand')
  const bCat = flatEmb(inBC, vocabSizes.category, 'm22_category')
  const bSub = flatEmb(inBS, vocabSizes.subcategory, 'm22_subcategory')
  const bPrice = flatEmb(inBP, vocabSizes.priceBucket, 'm22_price')

  const eStruct = tf.layers
    .concatenate({ name: 'm22_e_struct' })
    .apply([bBrand, bCat, bSub, bPrice]) as tf.SymbolicTensor

  const embC = tf.layers
    .embedding({ inputDim: vocabSizes.productId, outputDim: EMB_DIM_C, name: 'm22_emb_product_id' })
    .apply(inC) as tf.SymbolicTensor
  const eId = tf.layers.flatten({ name: 'm22_e_id_flat' }).apply(embC) as tf.SymbolicTensor

  const fused = tf.layers
    .concatenate({ name: 'm22_f_concat' })
    .apply([inSem, inUser, eStruct, eId]) as tf.SymbolicTensor

  const hiddenByProfile: Record<NeuralArchProfile, number[]> = {
    baseline: [64],
    deep64_32: [64, 32],
    deep128_64: [128, 64],
    deep128_64_32: [128, 64, 32],
    deep256: [256, 128, 64],
    deep512: [512, 256, 128, 64],
  }
  const hiddenLayers = hiddenByProfile[profile]
  let h: tf.SymbolicTensor = fused
  hiddenLayers.forEach((units, idx) => {
    h = tf.layers
      .dense({
        units,
        activation: 'relu',
        kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        name: `m22_dense_${units}_${idx}`,
      })
      .apply(h) as tf.SymbolicTensor
    const dropoutRate = units >= 256 ? 0.25 : 0.2
    h = tf.layers.dropout({ rate: dropoutRate, name: `m22_dropout_${idx}` }).apply(h) as tf.SymbolicTensor
  })

  const outUnits = 1
  const outActivation = neuralLossMode === 'pairwise' ? 'linear' : 'sigmoid'
  const out = tf.layers
    .dense({ units: outUnits, activation: outActivation, name: 'm22_logit' })
    .apply(h) as tf.SymbolicTensor

  return tf.model({
    inputs: [inSem, inUser, inBB, inBC, inBS, inBP, inC],
    outputs: out,
    name: 'm22_hybrid_item_tower',
  })
}

/** Same order as `buildM22HybridNeuralModel` inputs (required by `LayersModel.predict` / `fit`). */
export function m22InputTensorListFromRows(rows: M22ScoreRow[]): tf.Tensor[] {
  const n = rows.length
  return [
    tf.tensor2d(rows.map((r) => r.sem384), [n, 384]),
    tf.tensor2d(rows.map((r) => r.user384), [n, 384]),
    tf.tensor2d(rows.map((r) => [r.bBrand]), [n, 1], 'int32'),
    tf.tensor2d(rows.map((r) => [r.bCategory]), [n, 1], 'int32'),
    tf.tensor2d(rows.map((r) => [r.bSubcategory]), [n, 1], 'int32'),
    tf.tensor2d(rows.map((r) => [r.bPriceBucket]), [n, 1], 'int32'),
    tf.tensor2d(rows.map((r) => [r.cProduct]), [n, 1], 'int32'),
  ]
}

export function predictM22HybridScores(
  model: tf.LayersModel,
  rows: M22ScoreRow[],
  neuralHeadKind: NeuralHeadKind
): number[] {
  const inputs = m22InputTensorListFromRows(rows)
  let out: tf.Tensor | null = null
  try {
    out = model.predict(inputs) as tf.Tensor
    const raw = Array.from(out.dataSync() as Float32Array)
    return raw.map((r) => toHybridNeuralScalar(r, neuralHeadKind))
  } finally {
    inputs.forEach((t) => t.dispose())
    out?.dispose()
  }
}

/** Baseline matches production `ModelTrainer` / ADR-028. */
export type NeuralArchProfile = 'baseline' | 'deep64_32' | 'deep128_64' | 'deep128_64_32' | 'deep256' | 'deep512'

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
    case 'deep128_64_32':
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
    case 'deep256':
      model.add(
        tf.layers.dense({
          units: 256,
          activation: 'relu',
          inputShape: [768],
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.25 }))
      model.add(
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
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
    case 'deep512':
      model.add(
        tf.layers.dense({
          units: 512,
          activation: 'relu',
          inputShape: [768],
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.25 }))
      model.add(
        tf.layers.dense({
          units: 256,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.25 }))
      model.add(
        tf.layers.dense({
          units: 128,
          activation: 'relu',
          kernelRegularizer: tf.regularizers.l2({ l2: L2 }),
        })
      )
      model.add(tf.layers.dropout({ rate: 0.2 }))
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
