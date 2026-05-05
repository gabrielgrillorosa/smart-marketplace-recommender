import {
  aggregateClientProfileEmbeddings,
  deltaDaysUtc,
  type ProfilePoolingRuntime,
} from '../profile/clientProfileAggregation.js'
import type { PurchaseTemporalIndex } from './training-temporal-map.js'
import type { M22ItemManifest, M22ScoreRow, M22IndexMaps } from '../ml/m22Manifest.js'
import {
  buildM22IndexMaps,
  identityIndexFromId,
  keysFromProductDTO,
  structuralIndicesFromInputs,
} from '../ml/m22Manifest.js'
import {
  parseNegativeSamplingEnv,
  type NegativeSamplingEnv,
  type NegativeSamplingMode,
} from '../config/negativeSamplingEnv.js'
import {
  applySoftCleanup,
  type SoftCleanupCandidate,
} from './negativeSamplingSoftCleanup.js'
import {
  classifyNegativeCandidates,
  type StratifiedNegativeCandidate,
} from './negativeSamplingBuckets.js'
import {
  selectStratifiedNegatives,
  type NegativeSamplingTelemetry,
  type SelectedNegative,
} from './negativeSamplingSelector.js'

/**
 * M23 — T23-5: optional, fully backward-compatible sampling telemetry
 * attached to the dataset result. Existing call sites read only
 * `inputVectors`/`labels` (or `rows`/`labels`) and ignore this field.
 *
 * The field is populated for both legacy and stratified modes so that
 * downstream consumers (e.g. T23-6 in `ModelTrainer`) can log a
 * uniform shape. Per-positive entries preserve insertion order, which
 * matches the `[positive, neg, neg, ...]` row layout produced by
 * `buildTrainingDataset` when `useClassWeight !== false`.
 */
export interface NegativeSamplingDatasetMetadata {
  mode: NegativeSamplingMode
  perPositive: NegativeSamplingTelemetry[]
  identityEnabled: boolean
  /** Number of positives where the M22/identity guardrail (M23-15) swapped a non-intra negative for an intra-category one. */
  identityGuardrailApplied: number
  /** Number of positives where identity is on but no intra-category candidate was available after soft cleanup. */
  identityGuardrailUnavailable: number
}

export type TrainingDatasetBuildResult =
  | { inputVectors: number[][]; labels: number[]; samplingMetadata?: NegativeSamplingDatasetMetadata }
  | { mode: 'm22'; rows: M22ScoreRow[]; labels: number[]; samplingMetadata?: NegativeSamplingDatasetMetadata }

export function isM22TrainingDataset(d: TrainingDatasetBuildResult): d is {
  mode: 'm22'
  rows: M22ScoreRow[]
  labels: number[]
  samplingMetadata?: NegativeSamplingDatasetMetadata
} {
  return 'mode' in d && (d as { mode?: string }).mode === 'm22'
}

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
): { inputVectors: number[][]; labels: number[]; samplingMetadata?: NegativeSamplingDatasetMetadata }
export function buildTrainingDataset(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions,
  temporal: PurchaseTemporalIndex,
  pooling: ProfilePoolingRuntime,
  m22: { manifest: M22ItemManifest; productsById: Map<string, ProductDTO> }
): { mode: 'm22'; rows: M22ScoreRow[]; labels: number[]; samplingMetadata?: NegativeSamplingDatasetMetadata }
export function buildTrainingDataset(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions,
  temporal: PurchaseTemporalIndex,
  pooling: ProfilePoolingRuntime,
  m22?: { manifest: M22ItemManifest; productsById: Map<string, ProductDTO> }
): TrainingDatasetBuildResult {
  const samplingEnv = parseNegativeSamplingEnv(process.env)
  if (samplingEnv.mode === 'stratified') {
    return buildTrainingDatasetStratified(
      clients,
      clientOrderMap,
      productEmbeddingMap,
      products,
      options,
      temporal,
      pooling,
      samplingEnv,
      m22
    )
  }
  return buildTrainingDatasetLegacy(
    clients,
    clientOrderMap,
    productEmbeddingMap,
    products,
    options,
    temporal,
    pooling,
    m22
  )
}

/**
 * Pre-M23 algorithm preserved verbatim so `NEGATIVE_SAMPLING_MODE=legacy`
 * (and the unset default) reproduces the existing dataset shape and
 * counts byte-for-byte. The optional `samplingMetadata` is left
 * `undefined` here — legacy emits no per-positive bucket telemetry.
 */
function buildTrainingDatasetLegacy(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions,
  temporal: PurchaseTemporalIndex,
  pooling: ProfilePoolingRuntime,
  m22?: { manifest: M22ItemManifest; productsById: Map<string, ProductDTO> }
): TrainingDatasetBuildResult {
  if (clients.length === 0) {
    return m22 ? { mode: 'm22', rows: [], labels: [] } : { inputVectors: [], labels: [] }
  }

  const { negativeSamplingRatio, seed, useClassWeight = true } = options
  let rngState = seed ?? Date.now()

  const productsWithEmbeddings = products.filter((p) => productEmbeddingMap.has(p.id))

  const inputVectors: number[][] = []
  const m22Rows: M22ScoreRow[] = []
  const labels: number[] = []

  const m22Maps: M22IndexMaps | null = m22 ? buildM22IndexMaps(m22.manifest) : null
  const priceEdges = m22?.manifest.priceBinEdges ?? []

  const rowForProduct = (product: ProductDTO, sem: number[], userVec: number[]): M22ScoreRow => {
    if (!m22 || !m22Maps) throw new Error('M22 row builder without manifest')
    const keys = keysFromProductDTO(product, priceEdges)
    const s = structuralIndicesFromInputs(keys, m22Maps)
    const cProduct = identityIndexFromId(keys.idKey, m22Maps, m22.manifest.identityEnabled)
    return {
      sem384: sem,
      user384: userVec,
      bBrand: s.bBrand,
      bCategory: s.bCategory,
      bSubcategory: s.bSubcategory,
      bPriceBucket: s.bPriceBucket,
      cProduct,
    }
  }

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

    const clientProfileVector = aggregateClientProfileEmbeddings(entries, pooling)

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

      const diffCategoryNeg = negativePool.filter((p) => p.category !== positiveCategory)
      const sameCategoryNeg = negativePool.filter((p) => p.category === positiveCategory)

      const selectedNegatives: ProductDTO[] = []
      const hardNegativeCount = Math.min(2, negativeSamplingRatio, diffCategoryNeg.length)

      const shuffledDiff = seededSample(diffCategoryNeg, hardNegativeCount, rngState)
      rngState = lcgNext(rngState)
      selectedNegatives.push(...shuffledDiff)

      const remaining = negativeSamplingRatio - selectedNegatives.length
      if (remaining > 0) {
        const fillPool = sameCategoryNeg.length > 0 ? sameCategoryNeg : negativePool
        const fillNeg = seededSample(fillPool, remaining, rngState)
        rngState = lcgNext(rngState)
        selectedNegatives.push(...fillNeg)
      }

      if (m22 && m22Maps) {
        m22Rows.push(rowForProduct(posProduct, posEmb, clientProfileVector))
      } else {
        inputVectors.push([...posEmb, ...clientProfileVector])
      }
      labels.push(1)

      if (useClassWeight !== false) {
        for (const negProduct of selectedNegatives) {
          const negEmb = productEmbeddingMap.get(negProduct.id)!
          if (m22 && m22Maps) {
            m22Rows.push(rowForProduct(negProduct, negEmb, clientProfileVector))
          } else {
            inputVectors.push([...negEmb, ...clientProfileVector])
          }
          labels.push(0)
        }
      } else {
        for (let i = 0; i < negativeSamplingRatio; i++) {
          if (m22 && m22Maps) {
            m22Rows.push(rowForProduct(posProduct, posEmb, clientProfileVector))
          } else {
            inputVectors.push([...posEmb, ...clientProfileVector])
          }
          labels.push(1)
        }
      }
    }
  }

  if (m22) {
    return { mode: 'm22', rows: m22Rows, labels }
  }
  return { inputVectors, labels }
}

/**
 * M23 — T23-5: Stratified negative sampling orchestration.
 *
 * Pipeline per positive:
 *  1. Build the broad candidate pool (products with embeddings,
 *     excluding the client's own positives).
 *  2. Apply T23-2 minimal soft cleanup against the positive (drops
 *     same-id, same SKU family, trivial packaging variations and
 *     candidates with cosine strictly above `softMaxSim`).
 *  3. T23-3 bucket classification (`hard | medium | easy`) with
 *     structural priority on `sameCategory + sameSupplier`.
 *  4. T23-4 deterministic selector picks `[hard, medium, medium, easy]`
 *     with explicit fallback when buckets are short.
 *  5. M23-15 identity guardrail: when the M22 manifest's
 *     `identityEnabled` is on AND there were intra-category candidates
 *     after soft cleanup, ensure at least one survives in the final
 *     selection. Falls back to recording `identityGuardrailUnavailable`
 *     in metadata when no intra-category exists.
 *
 * The `useClassWeight === false` branch keeps legacy upsampling
 * semantics (positive duplicated `negativeSamplingRatio` times) — the
 * stratified pipeline has no negatives to emit in that branch.
 */
function buildTrainingDatasetStratified(
  clients: ClientDTO[],
  clientOrderMap: Map<string, Set<string>>,
  productEmbeddingMap: Map<string, number[]>,
  products: ProductDTO[],
  options: TrainingDatasetOptions,
  temporal: PurchaseTemporalIndex,
  pooling: ProfilePoolingRuntime,
  samplingEnv: NegativeSamplingEnv,
  m22?: { manifest: M22ItemManifest; productsById: Map<string, ProductDTO> }
): TrainingDatasetBuildResult {
  const identityEnabled = m22?.manifest.identityEnabled === true

  const emptyMetadata: NegativeSamplingDatasetMetadata = {
    mode: 'stratified',
    perPositive: [],
    identityEnabled,
    identityGuardrailApplied: 0,
    identityGuardrailUnavailable: 0,
  }

  if (clients.length === 0) {
    return m22
      ? { mode: 'm22', rows: [], labels: [], samplingMetadata: emptyMetadata }
      : { inputVectors: [], labels: [], samplingMetadata: emptyMetadata }
  }

  const { negativeSamplingRatio, seed, useClassWeight = true } = options
  const baseSeed = seed ?? Date.now()

  const productsWithEmbeddings = products.filter((p) => productEmbeddingMap.has(p.id))

  const inputVectors: number[][] = []
  const m22Rows: M22ScoreRow[] = []
  const labels: number[] = []
  const metadata: NegativeSamplingDatasetMetadata = { ...emptyMetadata, perPositive: [] }

  const m22Maps: M22IndexMaps | null = m22 ? buildM22IndexMaps(m22.manifest) : null
  const priceEdges = m22?.manifest.priceBinEdges ?? []

  const rowForProduct = (product: ProductDTO, sem: number[], userVec: number[]): M22ScoreRow => {
    if (!m22 || !m22Maps) throw new Error('M22 row builder without manifest')
    const keys = keysFromProductDTO(product, priceEdges)
    const s = structuralIndicesFromInputs(keys, m22Maps)
    const cProduct = identityIndexFromId(keys.idKey, m22Maps, m22.manifest.identityEnabled)
    return {
      sem384: sem,
      user384: userVec,
      bBrand: s.bBrand,
      bCategory: s.bCategory,
      bSubcategory: s.bSubcategory,
      bPriceBucket: s.bPriceBucket,
      cProduct,
    }
  }

  let positiveCounter = 0

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
      entries.push({ embedding: emb, deltaDays: deltaDaysUtc(tRef, iso) })
    }
    if (entries.length === 0) continue

    const clientProfileVector = aggregateClientProfileEmbeddings(entries, pooling)
    const positiveProducts = productsWithEmbeddings.filter((p) => purchasedIds.has(p.id))

    for (const posProduct of positiveProducts) {
      const posEmb = productEmbeddingMap.get(posProduct.id)!

      const broadPool: SoftCleanupCandidate[] = productsWithEmbeddings
        .filter((p) => !purchasedIds.has(p.id))
        .map((p) => ({ product: p, embedding: productEmbeddingMap.get(p.id) }))

      const cleanup = applySoftCleanup(posProduct, broadPool, {
        softMaxSim: samplingEnv.softMaxSim,
        positiveEmbedding: posEmb,
      })

      const classification = classifyNegativeCandidates(
        posProduct,
        cleanup.kept.map((c) => ({ product: c.product as ProductDTO, embedding: c.embedding })),
        {
          softMaxSim: samplingEnv.softMaxSim,
          hardMinSim: samplingEnv.hardMinSim,
          mediumMinSim: samplingEnv.mediumMinSim,
          positiveEmbedding: posEmb,
        }
      )

      const positiveSeed = (baseSeed + positiveCounter) | 0
      positiveCounter += 1

      const selection = selectStratifiedNegatives(posProduct, classification.classified, {
        mode: 'stratified',
        seed: positiveSeed,
      })

      let finalSelected: SelectedNegative[] = selection.selected

      if (identityEnabled) {
        if (!classification.intraCategoryAvailable) {
          metadata.identityGuardrailUnavailable += 1
        } else {
          const hasIntra = finalSelected.some((s) => s.candidate.sameCategory)
          if (!hasIntra) {
            const swapped = applyIdentityGuardrail(
              finalSelected,
              classification.classified,
              productEmbeddingMap.get(posProduct.id)
            )
            if (swapped !== null) {
              finalSelected = swapped
              metadata.identityGuardrailApplied += 1
            } else {
              // Defensive: classification said intra exists but selection
              // exhausted them all (impossible given selector contract).
              metadata.identityGuardrailUnavailable += 1
            }
          }
        }
      }

      metadata.perPositive.push(selection.telemetry)

      if (m22 && m22Maps) {
        m22Rows.push(rowForProduct(posProduct, posEmb, clientProfileVector))
      } else {
        inputVectors.push([...posEmb, ...clientProfileVector])
      }
      labels.push(1)

      if (useClassWeight !== false) {
        for (const negSelection of finalSelected) {
          const negProduct = negSelection.candidate.product as ProductDTO
          const negEmb = productEmbeddingMap.get(negProduct.id)
          if (!negEmb) continue
          if (m22 && m22Maps) {
            m22Rows.push(rowForProduct(negProduct, negEmb, clientProfileVector))
          } else {
            inputVectors.push([...negEmb, ...clientProfileVector])
          }
          labels.push(0)
        }
      } else {
        for (let i = 0; i < negativeSamplingRatio; i++) {
          if (m22 && m22Maps) {
            m22Rows.push(rowForProduct(posProduct, posEmb, clientProfileVector))
          } else {
            inputVectors.push([...posEmb, ...clientProfileVector])
          }
          labels.push(1)
        }
      }
    }
  }

  if (m22) {
    return { mode: 'm22', rows: m22Rows, labels, samplingMetadata: metadata }
  }
  return { inputVectors, labels, samplingMetadata: metadata }
}

/**
 * M23-15 identity guardrail. Picks the best intra-category candidate
 * (highest cosine to the positive, with stable id tie-break) from the
 * full classified pool that is NOT already selected, and replaces the
 * lowest-priority non-intra slot in `selected`. Returns the new array
 * or `null` if no intra-category replacement is possible.
 *
 * Slot priority for replacement (lowest first): easy slot, then medium,
 * then hard — we never evict an already-intra slot, and we prefer to
 * displace easy/medium before hard so the "decision boundary" hard
 * negative survives.
 */
function applyIdentityGuardrail(
  selected: SelectedNegative[],
  classified: ReadonlyArray<StratifiedNegativeCandidate>,
  _positiveEmbedding: number[] | undefined
): SelectedNegative[] | null {
  const usedIds = new Set(selected.map((s) => s.candidate.product.id))
  const intraCandidates = classified.filter(
    (c) => c.sameCategory && !usedIds.has(c.product.id)
  )
  if (intraCandidates.length === 0) return null

  intraCandidates.sort((a, b) => {
    const ac = a.cosine
    const bc = b.cosine
    if (ac === null && bc === null) return a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0
    if (ac === null) return 1
    if (bc === null) return -1
    if (ac !== bc) return bc - ac
    if (a.product.id < b.product.id) return -1
    if (a.product.id > b.product.id) return 1
    return 0
  })
  const replacement = intraCandidates[0]

  const evictionOrder: Array<'easy' | 'medium' | 'hard'> = ['easy', 'medium', 'hard']
  let evictIndex = -1
  for (const bucket of evictionOrder) {
    for (let i = selected.length - 1; i >= 0; i--) {
      if (selected[i].candidate.sameCategory) continue
      if (selected[i].candidate.bucket === bucket) {
        evictIndex = i
        break
      }
    }
    if (evictIndex !== -1) break
  }
  if (evictIndex === -1) return null

  const next = selected.slice()
  next[evictIndex] = {
    product: replacement.product,
    bucket: replacement.bucket,
    fallbackFrom: null,
    candidate: replacement,
  }
  return next
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

/** M21/M22 — pairwise rows from an M22 BCE dataset (same pairing layout as `bceLabelsToPairwiseRows`). */
export function m22BceLabelsToPairwiseRows(
  rows: M22ScoreRow[],
  labels: number[]
): { rows: M22ScoreRow[]; pairCount: number } {
  const positives: M22ScoreRow[] = []
  const negatives: M22ScoreRow[] = []
  let i = 0
  while (i < labels.length) {
    if (labels[i] !== 1) {
      i++
      continue
    }
    const pos = rows[i]!
    i++
    while (i < labels.length && labels[i] === 0) {
      positives.push(pos)
      negatives.push(rows[i]!)
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
