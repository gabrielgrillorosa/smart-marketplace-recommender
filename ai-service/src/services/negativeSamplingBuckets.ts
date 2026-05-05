/**
 * M23 — T23-3: Bucket classifier for stratified negative sampling.
 *
 * Pure helper that takes a positive product and a list of (already
 * soft-cleaned, see `negativeSamplingSoftCleanup.ts`) negative candidates
 * and emits a per-candidate classification of `hard | medium | easy`,
 * together with the structural and pool-level signals required by the
 * downstream deterministic selector and the M22/ID-tower guardrail.
 *
 * Cosine bucket bands (parameterized by runtime; defaults from T23-1):
 *
 *  - `hard`   : cosine in `[hardMinSim, softMaxSim]`
 *  - `medium` : cosine in `[mediumMinSim, hardMinSim)`
 *  - `easy`   : cosine `< mediumMinSim`
 *
 * Both `hardMinSim` and `softMaxSim` are inclusive on the hard band.
 * `softMaxSim` is the same value used by `applySoftCleanup` to remove
 * candidates whose cosine is *strictly greater than* `softMaxSim`, so a
 * candidate with cosine exactly equal to `softMaxSim` is allowed and
 * belongs to the `hard` bucket.
 *
 * Structural priority (M23-11): if a candidate shares the positive
 * category AND shares the supplier OR brand signal, it is promoted to the
 * `hard` bucket regardless of the cosine band. This replaces the legacy
 * global rule of excluding `same category + supplierName` — those pairs
 * are now the primary source of hard negatives.
 *
 * Brand semantics: `ProductDTO` does not currently carry an explicit
 * `brand` field. To stay consistent with the M22 sparse extractor (which
 * derives `brand` from a normalized `supplierName`), this helper accepts
 * an optional `brandResolver(product)` and computes `sameBrand`
 * independently of `sameSupplier`. When no resolver is provided,
 * `sameBrand` is left `undefined` (explicit absence; the structural rule
 * then triggers only on `sameSupplier`). This is a deliberately bounded
 * choice — we never broaden the hard bucket by inferring brand from the
 * absence of metadata.
 *
 * Graceful degradation:
 *  - missing/zero-norm/length-mismatched embeddings degrade `cosine` to
 *    `null` and the candidate falls back to `easy` with reason
 *    `cosine_unavailable_default_easy` (no broadening of hard);
 *  - missing supplier/brand metadata sets the corresponding signal to
 *    `false`/`undefined` and never widens hard;
 *  - structural priority can still fire when cosine is `null`, provided
 *    the structural condition holds — the design treats structural
 *    proximity as primary signal for hard negatives, see M23-11.
 *
 * Pool-level metadata: `intraCategoryAvailable` is `true` whenever any
 * candidate shares the positive category, irrespective of bucket. The
 * downstream selector uses it to enforce the M22/ID-tower guardrail
 * (M23-15): when `identityEnabled` is on and intra-category candidates
 * exist, at least one must survive in the final selection.
 *
 * Requirements covered: M23-11, M23-12, M23-15.
 */

/**
 * Narrow input shape required by the helper. This is a structural subset
 * of `ProductDTO` (training-utils) so the helper does not couple to the
 * broader training module while still working with `ProductDTO` instances
 * directly.
 */
export interface BucketInputProduct {
  id: string
  name: string
  category: string
  sku: string
  /**
   * Optional, used both for `sameSupplier` and (by default) as the proxy
   * for the brand signal when no `brandResolver` is supplied. Compared
   * case-insensitively after trimming.
   */
  supplierName?: string
}

export interface BucketCandidateInput {
  product: BucketInputProduct
  embedding?: number[]
}

export type BucketLabel = 'hard' | 'medium' | 'easy'

export type BucketReason =
  | 'cosine_hard_range'
  | 'cosine_medium_range'
  | 'cosine_easy_range'
  | 'cosine_unavailable_default_easy'
  | 'structural_priority_same_category_same_supplier'
  | 'structural_priority_same_category_same_brand'
  | 'structural_priority_same_category_same_supplier_and_brand'

export interface BucketClassifierOptions {
  /** T23-1 default `0.92`; inclusive upper bound of the hard band. */
  softMaxSim: number
  /** T23-1 default `0.70`; inclusive lower bound of the hard band. */
  hardMinSim: number
  /** T23-1 default `0.40`; inclusive lower bound of the medium band. */
  mediumMinSim: number
  /** Optional embedding for the positive product; absence forces all candidates without structural signal into the `easy` bucket. */
  positiveEmbedding?: number[]
  /**
   * Optional brand resolver. When provided, the helper computes
   * `sameBrand` by comparing normalized brand strings on positive vs
   * candidate. When omitted, `sameBrand` stays `undefined` and only
   * `sameSupplier` participates in structural priority.
   */
  brandResolver?: (product: BucketInputProduct) => string | undefined
}

export interface StratifiedNegativeCandidate {
  product: BucketInputProduct
  embedding?: number[]
  /** `null` when the cosine cannot be computed (degraded gracefully). */
  cosine: number | null
  bucket: BucketLabel
  bucketReason: BucketReason
  sameCategory: boolean
  sameSupplier: boolean
  /** `undefined` when no brand resolver was supplied (explicit absence). */
  sameBrand?: boolean
  /**
   * Per-candidate copy of the pool-level `intraCategoryAvailable` flag,
   * provided so the downstream M22/ID-tower guardrail can decide on a
   * per-candidate basis without re-walking the whole pool. Mirrors
   * `sameCategory` semantically when read in isolation, but is preserved
   * for the guardrail to express intent ("this candidate counts toward
   * intra-category coverage").
   */
  intraCategoryAvailable: boolean
}

export interface BucketClassificationResult {
  classified: StratifiedNegativeCandidate[]
  /** `true` when at least one candidate shares the positive category. */
  intraCategoryAvailable: boolean
}

const VALID_BUCKET_LABELS: ReadonlySet<string> = new Set<BucketLabel>([
  'hard',
  'medium',
  'easy',
])

const VALID_BUCKET_REASONS: ReadonlySet<string> = new Set<BucketReason>([
  'cosine_hard_range',
  'cosine_medium_range',
  'cosine_easy_range',
  'cosine_unavailable_default_easy',
  'structural_priority_same_category_same_supplier',
  'structural_priority_same_category_same_brand',
  'structural_priority_same_category_same_supplier_and_brand',
])

export function isBucketLabel(value: unknown): value is BucketLabel {
  return typeof value === 'string' && VALID_BUCKET_LABELS.has(value)
}

export function isBucketReason(value: unknown): value is BucketReason {
  return typeof value === 'string' && VALID_BUCKET_REASONS.has(value)
}

function normalizeKey(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const v = value.trim().toLowerCase()
  return v === '' ? null : v
}

function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length !== b.length || a.length === 0) return null
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  if (denom === 0) return null
  return dot / denom
}

function computeCosine(
  positiveEmbedding: number[] | undefined,
  candidateEmbedding: number[] | undefined
): number | null {
  if (!positiveEmbedding || !candidateEmbedding) return null
  if (positiveEmbedding.length === 0 || candidateEmbedding.length === 0) return null
  return cosineSimilarity(positiveEmbedding, candidateEmbedding)
}

function bucketFromCosine(
  cosine: number | null,
  options: BucketClassifierOptions
): { bucket: BucketLabel; reason: BucketReason } {
  if (cosine === null) {
    return { bucket: 'easy', reason: 'cosine_unavailable_default_easy' }
  }
  if (cosine >= options.hardMinSim && cosine <= options.softMaxSim) {
    return { bucket: 'hard', reason: 'cosine_hard_range' }
  }
  if (cosine >= options.mediumMinSim && cosine < options.hardMinSim) {
    return { bucket: 'medium', reason: 'cosine_medium_range' }
  }
  return { bucket: 'easy', reason: 'cosine_easy_range' }
}

function structuralReason(
  sameSupplier: boolean,
  sameBrand: boolean | undefined
): BucketReason | null {
  const supplierHit = sameSupplier
  const brandHit = sameBrand === true
  if (supplierHit && brandHit) {
    return 'structural_priority_same_category_same_supplier_and_brand'
  }
  if (supplierHit) {
    return 'structural_priority_same_category_same_supplier'
  }
  if (brandHit) {
    return 'structural_priority_same_category_same_brand'
  }
  return null
}

/**
 * Classifies negative candidates into `hard | medium | easy` buckets and
 * preserves the metadata required by the deterministic selector and the
 * M22/ID-tower guardrail.
 *
 * Pure: same input → same output, no global state, deterministic order
 * (input order is preserved in `classified`).
 */
export function classifyNegativeCandidates(
  positive: BucketInputProduct,
  candidates: ReadonlyArray<BucketCandidateInput>,
  options: BucketClassifierOptions
): BucketClassificationResult {
  const positiveSupplierKey = normalizeKey(positive.supplierName)
  const positiveBrandKey =
    options.brandResolver !== undefined ? normalizeKey(options.brandResolver(positive)) : null

  let intraCategoryAvailable = false
  for (const candidate of candidates) {
    if (candidate.product.category === positive.category) {
      intraCategoryAvailable = true
      break
    }
  }

  const classified: StratifiedNegativeCandidate[] = []

  for (const candidate of candidates) {
    const sameCategory = candidate.product.category === positive.category

    const candidateSupplierKey = normalizeKey(candidate.product.supplierName)
    const sameSupplier =
      positiveSupplierKey !== null &&
      candidateSupplierKey !== null &&
      positiveSupplierKey === candidateSupplierKey

    let sameBrand: boolean | undefined
    if (options.brandResolver !== undefined) {
      const candidateBrandKey = normalizeKey(options.brandResolver(candidate.product))
      sameBrand =
        positiveBrandKey !== null &&
        candidateBrandKey !== null &&
        positiveBrandKey === candidateBrandKey
    }

    const cosine = computeCosine(options.positiveEmbedding, candidate.embedding)
    const cosineBucket = bucketFromCosine(cosine, options)

    const structural = sameCategory ? structuralReason(sameSupplier, sameBrand) : null

    let bucket: BucketLabel
    let bucketReason: BucketReason
    if (structural !== null) {
      bucket = 'hard'
      bucketReason = cosineBucket.bucket === 'hard' ? cosineBucket.reason : structural
    } else {
      bucket = cosineBucket.bucket
      bucketReason = cosineBucket.reason
    }

    classified.push({
      product: candidate.product,
      embedding: candidate.embedding,
      cosine,
      bucket,
      bucketReason,
      sameCategory,
      sameSupplier,
      sameBrand,
      intraCategoryAvailable: sameCategory,
    })
  }

  return { classified, intraCategoryAvailable }
}
