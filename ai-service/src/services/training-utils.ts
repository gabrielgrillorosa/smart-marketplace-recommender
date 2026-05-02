import {
  aggregateClientProfileEmbeddings,
  deltaDaysUtc,
  type ProfilePoolingRuntime,
} from '../profile/clientProfileAggregation.js'
import type { PurchaseTemporalIndex } from './training-temporal-map.js'

export interface ClientDTO {
  id: string
  name: string
  segment: string
  countryCode: string
}

export interface ProductDTO {
  id: string
  name: string
  description?: string
  category: string
  price: number
  sku: string
  supplierName?: string
}

export interface TrainingDatasetOptions {
  negativeSamplingRatio: number
  seed?: number
  useClassWeight?: boolean
}

function lcgNext(state: number): number {
  return (state * 1664525 + 1013904223) & 0xffffffff
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function buildTrainingDataset(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions,
  temporal: PurchaseTemporalIndex,
  pooling: ProfilePoolingRuntime
): { inputVectors: number[][]; labels: number[] } {
  if (clients.length === 0) return { inputVectors: [], labels: [] }

  const { negativeSamplingRatio, seed, useClassWeight = true } = options
  let rngState = seed ?? Date.now()

  const productsWithEmbeddings = products.filter((p) => productEmbeddingMap.has(p.id))

  const inputVectors: number[][] = []
  const labels: number[] = []

  for (const client of clients) {
    const purchasedIds = clientOrderMap.get(client.id) ?? new Set<string>()
    const tRefIso = temporal.tRefIsoByClient.get(client.id)
    if (!tRefIso) continue
    const tRef = new Date(tRefIso)

    const entries: { embedding: number[]; deltaDays: number }[] = []
    for (const pid of purchasedIds) {
      const emb = productEmbeddingMap.get(pid)
      const iso = temporal.lastPurchaseIsoByClientProduct.get(`${client.id}::${pid}`)
      if (!emb || !iso) continue
      entries.push({
        embedding: emb,
        deltaDays: deltaDaysUtc(tRef, iso),
      })
    }
    if (entries.length === 0) continue

    const clientProfileVector = aggregateClientProfileEmbeddings(
      entries,
      pooling.mode,
      pooling.halfLifeDays
    )

    const positiveProducts = productsWithEmbeddings.filter((p) => purchasedIds.has(p.id))

    // Soft positive exclusion (ADR-031): products sharing (category + supplierName) with any
    // positive but not purchased are treated as "unknown" — not negative — to prevent
    // gradient interference on correlated products (False Negative Contamination).
    const positiveCategorySupplierPairs = new Set(
      positiveProducts
        .filter((p) => p.supplierName)
        .map((p) => `${p.category}::${p.supplierName}`)
    )
    const softPositiveIds = new Set(
      productsWithEmbeddings
        .filter(
          (p) =>
            !purchasedIds.has(p.id) &&
            p.supplierName != null &&
            positiveCategorySupplierPairs.has(`${p.category}::${p.supplierName}`)
        )
        .map((p) => p.id)
    )

    // Soft positive exclusion (ADR-032): candidates with maxCosineSimilarity to any positive
    // above threshold are treated as "unknown" — not negative — regardless of supplier.
    // Covers cross-supplier products in the same semantic space (e.g. food/Nestlé after
    // food/Unilever purchases). Threshold via env var, default 0.65.
    const simThreshold = parseFloat(process.env.SOFT_NEGATIVE_SIM_THRESHOLD ?? '0.65')
    const positiveEmbeddings = positiveProducts.map((p) => productEmbeddingMap.get(p.id)!)
    const candidatesAfterBrandFilter = productsWithEmbeddings.filter(
      (p) => !purchasedIds.has(p.id) && !softPositiveIds.has(p.id)
    )
    const softPositiveIdsBySimilarity = new Set(
      candidatesAfterBrandFilter
        .filter((p) => {
          const pEmb = productEmbeddingMap.get(p.id)!
          return positiveEmbeddings.some((posEmb) => cosineSimilarity(pEmb, posEmb) > simThreshold)
        })
        .map((p) => p.id)
    )

    const negativePool = candidatesAfterBrandFilter.filter(
      (p) => !softPositiveIdsBySimilarity.has(p.id)
    )

    for (const posProduct of positiveProducts) {
      const posEmb = productEmbeddingMap.get(posProduct.id)!
      const positiveCategory = posProduct.category

      // Separate negatives into different category and same category
      const diffCategoryNeg = negativePool.filter((p) => p.category !== positiveCategory)
      const sameCategoryNeg = negativePool.filter((p) => p.category === positiveCategory)

      const selectedNegatives: ProductDTO[] = []
      const hardNegativeCount = Math.min(2, negativeSamplingRatio, diffCategoryNeg.length)

      // Select hard negatives (different category)
      const shuffledDiff = seededSample(diffCategoryNeg, hardNegativeCount, rngState)
      rngState = lcgNext(rngState)
      selectedNegatives.push(...shuffledDiff)

      // Fill remaining slots from same-category or all negatives
      const remaining = negativeSamplingRatio - selectedNegatives.length
      if (remaining > 0) {
        const fillPool = sameCategoryNeg.length > 0 ? sameCategoryNeg : negativePool
        const fillNeg = seededSample(fillPool, remaining, rngState)
        rngState = lcgNext(rngState)
        selectedNegatives.push(...fillNeg)
      }

      // Add positive sample
      inputVectors.push([...posEmb, ...clientProfileVector])
      labels.push(1)

      if (useClassWeight !== false) {
        // Add negative samples
        for (const negProduct of selectedNegatives) {
          const negEmb = productEmbeddingMap.get(negProduct.id)!
          inputVectors.push([...negEmb, ...clientProfileVector])
          labels.push(0)
        }
      } else {
        // Upsampling: duplicate positive sample negativeSamplingRatio times
        for (let i = 0; i < negativeSamplingRatio; i++) {
          inputVectors.push([...posEmb, ...clientProfileVector])
          labels.push(1)
        }
      }
    }
  }

  return { inputVectors, labels }
}

/**
 * M21 — Builds a **pairwise** batch `[2P, D]` from a BCE dataset produced by `buildTrainingDataset`
 * when `useClassWeight !== false`: each positive row is immediately followed by its sampled negatives.
 * Rows `0..P-1` are positives; `P..2P-1` are the paired negatives (same order).
 */
export function bceLabelsToPairwiseRows(
  inputVectors: number[][],
  labels: number[]
): { rows: number[][]; pairCount: number } {
  const positives: number[][] = []
  const negatives: number[][] = []
  let i = 0
  while (i < labels.length) {
    if (labels[i] !== 1) {
      i++
      continue
    }
    const pos = inputVectors[i]!
    i++
    while (i < labels.length && labels[i] === 0) {
      positives.push(pos)
      negatives.push(inputVectors[i]!)
      i++
    }
  }
  const pairCount = positives.length
  if (pairCount === 0) return { rows: [], pairCount: 0 }
  return { rows: [...positives, ...negatives], pairCount }
}

function seededSample<T>(arr: T[], n: number, seed: number): T[] {
  if (n >= arr.length) return [...arr]
  const result: T[] = []
  const indices = Array.from({ length: arr.length }, (_, i) => i)
  let state = seed

  for (let i = 0; i < n; i++) {
    state = lcgNext(state)
    const j = i + (Math.abs(state) % (indices.length - i))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
    result.push(arr[indices[i]])
  }

  return result
}

/** Deterministic seed from client ids (same as production training). */
export function seedFromClientIds(clients: ClientDTO[]): number {
  let seed = 0
  for (const client of clients) {
    const prefix = client.id.slice(0, 8)
    for (let i = 0; i < prefix.length; i++) {
      seed += prefix.charCodeAt(i)
    }
  }
  return seed
}
