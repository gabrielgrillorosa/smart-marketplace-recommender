/**
 * M23 — T23-2: Soft cleanup helper (minimalista e preciso).
 *
 * Pure function that removes from the negative pool ONLY structurally
 * equivalent candidates relative to a positive product. It deliberately
 * does NOT reintroduce the legacy broad exclusions (same `category +
 * supplierName`, low semantic threshold around 0.65). When metadata is
 * missing, the helper degrades gracefully and never broadens the scope of
 * exclusion.
 *
 * Exclusion rules (closed and documented; see M23 spec/design):
 *
 *  1. `same_product_id`
 *      candidate.id === positive.id.
 *
 *  2. `same_sku_family`
 *      Both SKUs yield the same derivable family key via
 *      `deriveSkuFamilyKey` — i.e., they share a prefix and both end in a
 *      short variant tail (numeric or up to 3 alphanumeric chars). Missing
 *      family on either side disables the rule (graceful degradation).
 *
 *  3. `trivial_variation`
 *      Narrow, bounded, deterministic packaging/unit rule. Fires ONLY when
 *      ALL of the following hold:
 *       - positive and candidate share the same normalized name (lowercase,
 *         trimmed, internal whitespace collapsed);
 *       - positive and candidate share the same category;
 *       - their SKUs share the same prefix when split by `-`, differing
 *         only in the LAST segment;
 *       - both last segments match a closed unit/packaging pattern such as
 *         `500ML`, `1L`, `200G`, `2KG`, `12OZ`, `6PCS`, `UN`, `UNIT`.
 *      No fuzzy heuristics, no name similarity. Missing or undecidable
 *      metadata disables the rule.
 *
 *  4. `above_soft_max_sim`
 *      cosine(candidateEmbedding, positiveEmbedding) strictly greater than
 *      `softMaxSim`. Missing embeddings or zero-norm vectors disable the
 *      rule (no broadening).
 *
 * Requirements covered: M23-02, M23-03, M23-04, M23-05.
 */

/**
 * Narrow input shape required by the helper. This is a structural subset of
 * `ProductDTO` (training-utils) so the helper does not couple to the broader
 * training module while still working with `ProductDTO` instances directly.
 */
export interface SoftCleanupInputProduct {
  id: string
  name: string
  category: string
  sku: string
  /** Optional, currently unused for exclusion (kept for forward-compat). */
  supplierName?: string
}

export interface SoftCleanupCandidate {
  product: SoftCleanupInputProduct
  embedding?: number[]
}

export type SoftCleanupExclusionReason =
  | 'same_product_id'
  | 'same_sku_family'
  | 'trivial_variation'
  | 'above_soft_max_sim'

export interface SoftCleanupExclusion {
  product: SoftCleanupInputProduct
  embedding?: number[]
  reason: SoftCleanupExclusionReason
}

export interface SoftCleanupOptions {
  /** Strictly-greater-than threshold; M23 default is 0.92 (T23-1). */
  softMaxSim: number
  /** Embedding for the positive product; optional — when absent, the cosine rule is skipped. */
  positiveEmbedding?: number[]
}

export interface SoftCleanupResult {
  kept: SoftCleanupCandidate[]
  excluded: SoftCleanupExclusion[]
}

const VALID_EXCLUSION_REASONS: ReadonlySet<string> = new Set([
  'same_product_id',
  'same_sku_family',
  'trivial_variation',
  'above_soft_max_sim',
])

export function isSoftCleanupExclusion(value: unknown): value is SoftCleanupExclusionReason {
  return typeof value === 'string' && VALID_EXCLUSION_REASONS.has(value)
}

/**
 * Closed list of unit/packaging suffix tokens admitted by the trivial
 * variation rule. Anchor `^...$` is enforced at the matcher.
 *
 * Patterns supported:
 *  - `<digits>ML`, `<digits>L` (volumes)
 *  - `<digits>G`, `<digits>KG` (mass)
 *  - `<digits>OZ`, `<digits>LB` (imperial mass/volume)
 *  - `<digits>PCS` (multi-pack count)
 *  - `UN`, `UNIT` (unit marker)
 */
const UNIT_PACKAGING_PATTERN = /^(?:\d+(?:ML|L|G|KG|OZ|LB|PCS)|UN|UNIT)$/

/**
 * Deterministic SKU family derivation. Returns the prefix before the last
 * hyphen-separated segment when:
 *  - the SKU has at least two non-empty segments after trimming/uppercasing;
 *  - the last segment looks like a variant tail (purely numeric, or a short
 *    token of length <= 3 with only A-Z0-9 characters such as `V2`, `XL`).
 *
 * Returns `null` otherwise (degraded gracefully — caller MUST treat this as
 * "no SKU family derivable" and skip the family-based exclusion).
 *
 * Note: unit/packaging suffixes (e.g. `500ML`) intentionally do NOT yield a
 * family here, because the trivial-variation rule handles those explicitly
 * with stricter co-requirements (same name + same category + matching unit
 * tokens on both sides).
 */
export function deriveSkuFamilyKey(sku: string | undefined): string | null {
  if (typeof sku !== 'string') return null
  const trimmed = sku.trim().toUpperCase()
  if (trimmed === '') return null
  const segments = trimmed.split('-').filter((s) => s.length > 0)
  if (segments.length < 2) return null
  const last = segments[segments.length - 1]
  if (!isVariantTail(last)) return null
  return segments.slice(0, -1).join('-')
}

function isVariantTail(token: string): boolean {
  if (token.length === 0) return false
  if (/^\d+$/.test(token)) return true
  if (token.length <= 3 && /^[A-Z0-9]+$/.test(token)) return true
  return false
}

function normalizeName(name: string | undefined): string {
  if (typeof name !== 'string') return ''
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Splits a SKU into uppercased non-empty segments, or returns `null` if no
 * segmentation is possible (graceful degradation contract for the trivial
 * variation rule).
 */
function skuSegments(sku: string | undefined): string[] | null {
  if (typeof sku !== 'string') return null
  const trimmed = sku.trim().toUpperCase()
  if (trimmed === '') return null
  const segments = trimmed.split('-').filter((s) => s.length > 0)
  if (segments.length < 2) return null
  return segments
}

function isTrivialPackagingVariation(
  positive: SoftCleanupInputProduct,
  candidate: SoftCleanupInputProduct
): boolean {
  if (normalizeName(positive.name) !== normalizeName(candidate.name)) return false
  if (positive.category !== candidate.category) return false

  const posSegments = skuSegments(positive.sku)
  const candSegments = skuSegments(candidate.sku)
  if (posSegments === null || candSegments === null) return false
  if (posSegments.length !== candSegments.length) return false

  const posLast = posSegments[posSegments.length - 1]
  const candLast = candSegments[candSegments.length - 1]
  if (posLast === candLast) return false
  if (!UNIT_PACKAGING_PATTERN.test(posLast)) return false
  if (!UNIT_PACKAGING_PATTERN.test(candLast)) return false

  for (let i = 0; i < posSegments.length - 1; i++) {
    if (posSegments[i] !== candSegments[i]) return false
  }
  return true
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
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

function classify(
  positive: SoftCleanupInputProduct,
  candidate: SoftCleanupCandidate,
  options: SoftCleanupOptions
): SoftCleanupExclusionReason | null {
  if (candidate.product.id === positive.id) {
    return 'same_product_id'
  }

  const positiveFamily = deriveSkuFamilyKey(positive.sku)
  const candidateFamily = deriveSkuFamilyKey(candidate.product.sku)
  if (
    positiveFamily !== null &&
    candidateFamily !== null &&
    positiveFamily === candidateFamily
  ) {
    return 'same_sku_family'
  }

  if (isTrivialPackagingVariation(positive, candidate.product)) {
    return 'trivial_variation'
  }

  const posEmb = options.positiveEmbedding
  const candEmb = candidate.embedding
  if (posEmb && candEmb && posEmb.length === candEmb.length && posEmb.length > 0) {
    const sim = cosineSimilarity(posEmb, candEmb)
    if (sim > options.softMaxSim) {
      return 'above_soft_max_sim'
    }
  }

  return null
}

/**
 * Soft cleanup pass over a list of negative candidates relative to one
 * positive product. Pure: same input → same output, no global state.
 */
export function applySoftCleanup(
  positive: SoftCleanupInputProduct,
  candidates: ReadonlyArray<SoftCleanupCandidate>,
  options: SoftCleanupOptions
): SoftCleanupResult {
  const kept: SoftCleanupCandidate[] = []
  const excluded: SoftCleanupExclusion[] = []

  for (const candidate of candidates) {
    const reason = classify(positive, candidate, options)
    if (reason === null) {
      kept.push(candidate)
    } else {
      excluded.push({
        product: candidate.product,
        embedding: candidate.embedding,
        reason,
      })
    }
  }

  return { kept, excluded }
}
