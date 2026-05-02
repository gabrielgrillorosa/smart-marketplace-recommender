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
