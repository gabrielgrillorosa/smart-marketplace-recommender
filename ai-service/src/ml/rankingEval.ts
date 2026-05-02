import * as tf from '@tensorflow/tfjs-node'
import type { NeuralHeadKind } from '../types/index.js'
import type { ClientDTO } from '../services/training-utils.js'
import type { OrderDTO } from '../services/training-data-fetch.js'
import { buildClientPurchaseTemporalMap } from '../services/training-temporal-map.js'
import {
  aggregateClientProfileEmbeddings,
  deltaDaysUtc,
  type ProfilePoolingRuntime,
} from '../profile/clientProfileAggregation.js'
import { toHybridNeuralScalar } from './neuralHead.js'
import type { M22ItemManifest, M22ScoreRow } from './m22Manifest.js'
import {
  buildM22IndexMaps,
  identityIndexFromId,
  keysFromProductDTO,
  structuralIndicesFromInputs,
} from './m22Manifest.js'
import { predictM22HybridScores } from './neuralModelFactory.js'
import type { ProductDTO } from '../services/training-utils.js'

/**
 * Per-client temporal split on purchase list; ranks candidates by neural score.
 * Same protocol as `ModelTrainer` (holdout tail of purchases, top-K among non-train products).
 */
export function computePrecisionAtK(
  clients: ClientDTO[],
  orders: OrderDTO[],
  productEmbeddingMap: Map<string, number[]>,
  model: tf.LayersModel,
  K = 5,
  pooling: ProfilePoolingRuntime = { mode: 'mean', halfLifeDays: 30 },
  neuralHeadKind: NeuralHeadKind = 'bce_sigmoid'
): number {
  const temporal = buildClientPurchaseTemporalMap(orders)

  const clientOrderMap = new Map<string, string[]>()
  for (const order of orders) {
    if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, [])
    for (const item of order.items) {
      clientOrderMap.get(order.clientId)!.push(item.productId)
    }
  }

  const allProductIds = Array.from(productEmbeddingMap.keys())
  let clientsWithHit = 0
  let totalClients = 0

  for (const client of clients) {
    const allPurchased = clientOrderMap.get(client.id) ?? []
    if (allPurchased.length < 2) continue

    const splitIdx = Math.floor(allPurchased.length * 0.8)
    const trainPurchased = new Set(allPurchased.slice(0, splitIdx))
    const heldOut = new Set(allPurchased.slice(splitIdx))

    const tRefIso = temporal.tRefIsoByClient.get(client.id)
    if (!tRefIso) continue
    const tRef = new Date(tRefIso)

    const entries: { embedding: number[]; deltaDays: number }[] = []
    for (const pid of trainPurchased) {
      const emb = productEmbeddingMap.get(pid)
      const iso = temporal.lastPurchaseIsoByClientProduct.get(`${client.id}::${pid}`)
      if (!emb || !iso) continue
      entries.push({
        embedding: emb,
        deltaDays: deltaDaysUtc(tRef, iso),
      })
    }
    if (entries.length === 0) continue

    const clientProfile = aggregateClientProfileEmbeddings(entries, pooling)

    const candidates = allProductIds.filter((pid) => !trainPurchased.has(pid))
    if (candidates.length === 0) continue

    const scores = tf.tidy(() => {
      const matrix = tf.tensor2d(
        candidates.map((pid) => [...productEmbeddingMap.get(pid)!, ...clientProfile]),
        [candidates.length, 768]
      )
      const output = model.predict(matrix) as tf.Tensor
      const raw = Array.from(output.dataSync())
      return raw.map((r) => toHybridNeuralScalar(r, neuralHeadKind))
    })

    const topK = candidates
      .map((pid, i) => ({ pid, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K)
      .map((x) => x.pid)

    const hasHit = topK.some((pid) => heldOut.has(pid))
    if (hasHit) clientsWithHit++
    totalClients++
  }

  return totalClients === 0 ? 0 : clientsWithHit / totalClients
}

export type M22EvalBundle = {
  manifest: M22ItemManifest
  productsById: Map<string, ProductDTO>
}

/** M22 — same temporal protocol as `computePrecisionAtK`, multi-input hybrid model. */
export function computePrecisionAtKM22(
  clients: ClientDTO[],
  orders: OrderDTO[],
  productEmbeddingMap: Map<string, number[]>,
  model: tf.LayersModel,
  K: number,
  pooling: ProfilePoolingRuntime,
  neuralHeadKind: NeuralHeadKind,
  bundle: M22EvalBundle
): number {
  const maps = buildM22IndexMaps(bundle.manifest)
  const temporal = buildClientPurchaseTemporalMap(orders)

  const clientOrderMap = new Map<string, string[]>()
  for (const order of orders) {
    if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, [])
    for (const item of order.items) {
      clientOrderMap.get(order.clientId)!.push(item.productId)
    }
  }

  const allProductIds = Array.from(productEmbeddingMap.keys())
  let clientsWithHit = 0
  let totalClients = 0

  for (const client of clients) {
    const allPurchased = clientOrderMap.get(client.id) ?? []
    if (allPurchased.length < 2) continue

    const splitIdx = Math.floor(allPurchased.length * 0.8)
    const trainPurchased = new Set(allPurchased.slice(0, splitIdx))
    const heldOut = new Set(allPurchased.slice(splitIdx))

    const tRefIso = temporal.tRefIsoByClient.get(client.id)
    if (!tRefIso) continue
    const tRef = new Date(tRefIso)

    const entries: { embedding: number[]; deltaDays: number }[] = []
    for (const pid of trainPurchased) {
      const emb = productEmbeddingMap.get(pid)
      const iso = temporal.lastPurchaseIsoByClientProduct.get(`${client.id}::${pid}`)
      if (!emb || !iso) continue
      entries.push({
        embedding: emb,
        deltaDays: deltaDaysUtc(tRef, iso),
      })
    }
    if (entries.length === 0) continue

    const clientProfile = aggregateClientProfileEmbeddings(entries, pooling)

    const candidates = allProductIds
      .filter((pid) => !trainPurchased.has(pid))
      .filter((pid) => bundle.productsById.has(pid) && productEmbeddingMap.has(pid))
    if (candidates.length === 0) continue

    const rows: M22ScoreRow[] = candidates.map((pid) => {
      const p = bundle.productsById.get(pid)!
      const emb = productEmbeddingMap.get(pid)!
      const keys = keysFromProductDTO(p, bundle.manifest.priceBinEdges)
      const st = structuralIndicesFromInputs(keys, maps)
      const cProduct = identityIndexFromId(keys.idKey, maps, bundle.manifest.identityEnabled)
      return {
        sem384: emb,
        user384: clientProfile,
        bBrand: st.bBrand,
        bCategory: st.bCategory,
        bSubcategory: st.bSubcategory,
        bPriceBucket: st.bPriceBucket,
        cProduct,
      }
    })

    const scores = predictM22HybridScores(model, rows, neuralHeadKind)

    const topK = candidates
      .map((pid, i) => ({ pid, score: scores[i]! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, K)
      .map((x) => x.pid)

    const hasHit = topK.some((pid) => heldOut.has(pid))
    if (hasHit) clientsWithHit++
    totalClients++
  }

  return totalClients === 0 ? 0 : clientsWithHit / totalClients
}

/**
 * M22 eval — `precisionAt5` on a **cold-start category** slice: clients whose first held-out
 * purchase category was absent from training purchases (protocol aligned to M20/M21 builder).
 */
export function computePrecisionAt5ColdStartCategorySlice(
  clients: ClientDTO[],
  orders: OrderDTO[],
  productEmbeddingMap: Map<string, number[]>,
  model: tf.LayersModel,
  pooling: ProfilePoolingRuntime,
  neuralHeadKind: NeuralHeadKind,
  productsById: Map<string, ProductDTO>,
  m22: M22EvalBundle | null
): { global: number; coldSlice: number; coldClients: number; globalClients: number } {
  const temporal = buildClientPurchaseTemporalMap(orders)

  const clientOrderMap = new Map<string, string[]>()
  for (const order of orders) {
    if (!clientOrderMap.has(order.clientId)) clientOrderMap.set(order.clientId, [])
    for (const item of order.items) {
      clientOrderMap.get(order.clientId)!.push(item.productId)
    }
  }

  const allProductIds = Array.from(productEmbeddingMap.keys())
  const maps = m22 ? buildM22IndexMaps(m22.manifest) : null

  let globalHits = 0
  let globalTotal = 0
  let coldHits = 0
  let coldTotal = 0

  for (const client of clients) {
    const allPurchased = clientOrderMap.get(client.id) ?? []
    if (allPurchased.length < 2) continue

    const splitIdx = Math.floor(allPurchased.length * 0.8)
    const trainPurchased = new Set(allPurchased.slice(0, splitIdx))
    const heldOut = new Set(allPurchased.slice(splitIdx))
    const heldOutArr = allPurchased.slice(splitIdx)
    const primaryHeld = heldOutArr[0]
    const heldProduct = primaryHeld ? productsById.get(primaryHeld) : undefined
    const heldCat = heldProduct?.category ?? ''

    const trainCategories = new Set<string>()
    for (const pid of trainPurchased) {
      const p = productsById.get(pid)
      if (p?.category) trainCategories.add(p.category)
    }
    const isColdCategory = Boolean(heldCat) && !trainCategories.has(heldCat)

    const tRefIso = temporal.tRefIsoByClient.get(client.id)
    if (!tRefIso) continue
    const tRef = new Date(tRefIso)

    const entries: { embedding: number[]; deltaDays: number }[] = []
    for (const pid of trainPurchased) {
      const emb = productEmbeddingMap.get(pid)
      const iso = temporal.lastPurchaseIsoByClientProduct.get(`${client.id}::${pid}`)
      if (!emb || !iso) continue
      entries.push({
        embedding: emb,
        deltaDays: deltaDaysUtc(tRef, iso),
      })
    }
    if (entries.length === 0) continue

    const clientProfile = aggregateClientProfileEmbeddings(entries, pooling)

    let candidates = allProductIds.filter((pid) => !trainPurchased.has(pid))
    if (m22 && maps) {
      candidates = candidates.filter((pid) => productsById.has(pid) && productEmbeddingMap.has(pid))
    }
    if (candidates.length === 0) continue

    let scores: number[]
    if (m22 && maps) {
      const rows: M22ScoreRow[] = candidates.map((pid) => {
        const p = productsById.get(pid)!
        const emb = productEmbeddingMap.get(pid)!
        const keys = keysFromProductDTO(p, m22.manifest.priceBinEdges)
        const st = structuralIndicesFromInputs(keys, maps)
        const cProduct = identityIndexFromId(keys.idKey, maps, m22.manifest.identityEnabled)
        return {
          sem384: emb,
          user384: clientProfile,
          bBrand: st.bBrand,
          bCategory: st.bCategory,
          bSubcategory: st.bSubcategory,
          bPriceBucket: st.bPriceBucket,
          cProduct,
        }
      })
      scores = predictM22HybridScores(model, rows, neuralHeadKind)
    } else {
      scores = tf.tidy(() => {
        const matrix = tf.tensor2d(
          candidates.map((pid) => [...productEmbeddingMap.get(pid)!, ...clientProfile]),
          [candidates.length, 768]
        )
        const output = model.predict(matrix) as tf.Tensor
        const raw = Array.from(output.dataSync())
        return raw.map((r) => toHybridNeuralScalar(r, neuralHeadKind))
      })
    }

    const topK = candidates
      .map((pid, i) => ({ pid, score: scores[i]! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.pid)

    const hasHit = topK.some((pid) => heldOut.has(pid))
    if (hasHit) globalHits++
    globalTotal++

    if (isColdCategory) {
      if (hasHit) coldHits++
      coldTotal++
    }
  }

  return {
    global: globalTotal === 0 ? 0 : globalHits / globalTotal,
    coldSlice: coldTotal === 0 ? 0 : coldHits / coldTotal,
    coldClients: coldTotal,
    globalClients: globalTotal,
  }
}
