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

/* ------------------------------------------------------------------ */
/* M23 — T23-7: Pure ranking metrics                                   */
/* ------------------------------------------------------------------ */

/**
 * NDCG@K with binary relevance. Standard DCG formulation:
 *   DCG@K = Σ_{i=1..K} rel_i / log2(i+1)
 *   IDCG@K = Σ_{i=1..min(K, |relevant|)} 1 / log2(i+1)
 * Returns 0 when `ranked` is empty or no relevant items exist.
 */
export function ndcgAtK(ranked: ReadonlyArray<string>, relevant: ReadonlySet<string>, K: number): number {
  if (ranked.length === 0 || relevant.size === 0 || K <= 0) return 0
  const limit = Math.min(K, ranked.length)
  let dcg = 0
  for (let i = 0; i < limit; i++) {
    if (relevant.has(ranked[i]!)) {
      dcg += 1 / Math.log2(i + 2)
    }
  }
  const idealCount = Math.min(K, relevant.size)
  let idcg = 0
  for (let i = 0; i < idealCount; i++) {
    idcg += 1 / Math.log2(i + 2)
  }
  return idcg === 0 ? 0 : dcg / idcg
}

export interface MrrSample {
  ranked: ReadonlyArray<string>
  relevant: ReadonlySet<string>
}

/**
 * Mean Reciprocal Rank across samples. The reciprocal rank of a sample is
 * `1/rank` of the first relevant item in `ranked` (1-indexed), or `0` if
 * none of the relevant items appear in `ranked`.
 */
export function meanReciprocalRank(samples: ReadonlyArray<MrrSample>): number {
  if (samples.length === 0) return 0
  let acc = 0
  for (const s of samples) {
    let rr = 0
    for (let i = 0; i < s.ranked.length; i++) {
      if (s.relevant.has(s.ranked[i]!)) {
        rr = 1 / (i + 1)
        break
      }
    }
    acc += rr
  }
  return acc / samples.length
}

export interface PairwiseSample {
  positiveCategory: string
  positiveScore: number
  negatives: ReadonlyArray<{ score: number; sameCategory: boolean }>
}

/**
 * Pairwise accuracy within category (the documented equivalent of
 * "pairwise accuracy within category" from the M23 RFC §6).
 *
 * Definition (deterministic, no model coupling):
 *  - For each `(positive, negative)` pair where the negative shares the
 *    positive's category, count `1` if `positiveScore > negativeScore`,
 *    `0.5` on tie, `0` otherwise.
 *  - Return the mean across all such pairs over all samples. Pairs with
 *    different categories are ignored — the metric is intentionally a
 *    decision-quality signal *between substitutes*.
 *
 * Returns `0` when no same-category pair exists in any sample (the whole
 * benchmark is vacuous on this axis); callers can detect that via the
 * `pairs` count returned by the higher-level `computeRankingEvalM22`.
 */
export function pairwiseAccuracyWithinCategory(
  samples: ReadonlyArray<PairwiseSample>
): number {
  let pairCount = 0
  let acc = 0
  for (const s of samples) {
    for (const n of s.negatives) {
      if (!n.sameCategory) continue
      pairCount += 1
      if (s.positiveScore > n.score) acc += 1
      else if (s.positiveScore === n.score) acc += 0.5
    }
  }
  return pairCount === 0 ? 0 : acc / pairCount
}

export interface TopNProxySample {
  /** Number of products in the client's training history (pre-holdout). */
  trainHistorySize: number
  ranked: ReadonlyArray<string>
  relevant: ReadonlySet<string>
}

/**
 * Top-N "after first interaction" proxy.
 *
 * The M23 spec asks for "métrica de top-N após primeira interação ou
 * proxy documentado". Live online data is not available offline, so we
 * use the documented offline proxy: clients with at least one product in
 * their training history (i.e. `trainHistorySize >= 1`) and we measure
 * Hit@N against the held-out tail. This is the same protocol used by
 * `computePrecisionAtK*` but exposed as a slice with explicit minimum
 * interaction filter, matching the semantics requested by the spec.
 */
export function topNAfterFirstInteractionProxy(
  samples: ReadonlyArray<TopNProxySample>,
  N: number
): { clients: number; hitRate: number } {
  let clients = 0
  let hits = 0
  for (const s of samples) {
    if (s.trainHistorySize < 1) continue
    clients += 1
    const limit = Math.min(N, s.ranked.length)
    let hit = false
    for (let i = 0; i < limit; i++) {
      if (s.relevant.has(s.ranked[i]!)) {
        hit = true
        break
      }
    }
    if (hit) hits += 1
  }
  return { clients, hitRate: clients === 0 ? 0 : hits / clients }
}

/* ------------------------------------------------------------------ */
/* M23 — T23-7: Unified ranking eval (used by M23 benchmark harness)   */
/* ------------------------------------------------------------------ */

export interface RankingEvalReport {
  /** Same protocol as `computePrecisionAtK*`. */
  precisionAtK: number
  /** NDCG@K, averaged over evaluated clients. */
  ndcgAtK: number
  /** Mean reciprocal rank, single relevant set per client. */
  mrr: number
  /** Pairwise accuracy within category (decision-quality between substitutes). */
  pairwiseAccuracyWithinCategory: number
  /** Number of intra-category (positive, negative) pairs scored. `0` => metric is vacuous. */
  pairwiseAccuracyPairs: number
  /** Top-N hit rate on the cold-start/proxy slice. */
  topNAfterFirstInteractionHitRate: number
  topNAfterFirstInteractionClients: number
  /**
   * Cold-start category slice (already used by M22): clients whose first
   * held-out purchase category was absent from their training history.
   */
  precisionAtKColdSlice: number
  precisionAtKColdClients: number
  evaluatedClients: number
  K: number
  topNCutoff: number
}

/**
 * Unified ranking evaluation reusing the same per-client temporal
 * holdout protocol as `computePrecisionAtKM22` / `computePrecisionAt5*`.
 *
 * Produces all M23 ranking metrics in a single pass over the dataset:
 *  - `precisionAtK`, `ndcgAtK`, `mrr` over Hit/score lists per client;
 *  - `pairwiseAccuracyWithinCategory` over (positive, same-category
 *    candidate) pairs scored by the model;
 *  - `topNAfterFirstInteractionHitRate` (proxy slice with
 *    `trainHistorySize >= 1`);
 *  - `precisionAtKColdSlice` (M22 cold-start slice protocol).
 *
 * Single-tower (`m22 = null`) and M22 dual-tower (`m22 != null`) paths
 * are unified through the same per-client loop, mirroring
 * `computePrecisionAt5ColdStartCategorySlice`.
 */
export function computeRankingEvalM22(
  clients: ClientDTO[],
  orders: OrderDTO[],
  productEmbeddingMap: Map<string, number[]>,
  model: tf.LayersModel,
  pooling: ProfilePoolingRuntime,
  neuralHeadKind: NeuralHeadKind,
  productsById: Map<string, ProductDTO>,
  m22: M22EvalBundle | null,
  K = 5,
  topNCutoff = 10
): RankingEvalReport {
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

  const mrrSamples: MrrSample[] = []
  const pairwiseSamples: PairwiseSample[] = []
  const topNSamples: TopNProxySample[] = []

  let precisionHits = 0
  let precisionTotal = 0
  let ndcgSum = 0
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
      entries.push({ embedding: emb, deltaDays: deltaDaysUtc(tRef, iso) })
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

    const ranked = candidates
      .map((pid, i) => ({ pid, score: scores[i]! }))
      .sort((a, b) => b.score - a.score)
    const rankedIds = ranked.map((r) => r.pid)
    const topK = rankedIds.slice(0, K)

    const hitTopK = topK.some((pid) => heldOut.has(pid))
    if (hitTopK) precisionHits += 1
    precisionTotal += 1

    ndcgSum += ndcgAtK(rankedIds, heldOut, K)
    mrrSamples.push({ ranked: rankedIds, relevant: heldOut })
    topNSamples.push({
      trainHistorySize: trainPurchased.size,
      ranked: rankedIds,
      relevant: heldOut,
    })

    if (isColdCategory) {
      if (hitTopK) coldHits += 1
      coldTotal += 1
    }

    // Pairwise accuracy within category — for each held-out positive,
    // compare its score against same-category candidates' scores. We
    // pick the highest-score candidate from the held-out set as the
    // representative positive (most informative comparator).
    const heldScored = ranked.filter((r) => heldOut.has(r.pid))
    if (heldScored.length === 0) continue
    const pos = heldScored[0]!
    const posProduct = productsById.get(pos.pid)
    const posCategory = posProduct?.category ?? heldCat
    if (!posCategory) continue

    const negatives: { score: number; sameCategory: boolean }[] = []
    for (const r of ranked) {
      if (r.pid === pos.pid) continue
      if (heldOut.has(r.pid)) continue
      const cand = productsById.get(r.pid)
      const sameCategory = cand?.category === posCategory
      if (!sameCategory) continue
      negatives.push({ score: r.score, sameCategory: true })
    }
    if (negatives.length > 0) {
      pairwiseSamples.push({
        positiveCategory: posCategory,
        positiveScore: pos.score,
        negatives,
      })
    }
  }

  const pairwiseAcc = pairwiseAccuracyWithinCategory(pairwiseSamples)
  let pairwisePairs = 0
  for (const s of pairwiseSamples) pairwisePairs += s.negatives.length
  const topN = topNAfterFirstInteractionProxy(topNSamples, topNCutoff)

  return {
    precisionAtK: precisionTotal === 0 ? 0 : precisionHits / precisionTotal,
    ndcgAtK: precisionTotal === 0 ? 0 : ndcgSum / precisionTotal,
    mrr: meanReciprocalRank(mrrSamples),
    pairwiseAccuracyWithinCategory: pairwiseAcc,
    pairwiseAccuracyPairs: pairwisePairs,
    topNAfterFirstInteractionHitRate: topN.hitRate,
    topNAfterFirstInteractionClients: topN.clients,
    precisionAtKColdSlice: coldTotal === 0 ? 0 : coldHits / coldTotal,
    precisionAtKColdClients: coldTotal,
    evaluatedClients: precisionTotal,
    K,
    topNCutoff,
  }
}
