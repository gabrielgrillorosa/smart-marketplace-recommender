/**
 * M23 — T23-4: Deterministic stratified negative selector + telemetry.
 *
 * Pure helper that takes the bucket-classified candidates produced by
 * `negativeSamplingBuckets.ts` (T23-3) and selects exactly the M23 target
 * distribution `1 hard + 2 medium + 1 easy` per positive (`ratio = 4`),
 * with explicit, deterministic fallback when buckets are incomplete.
 *
 * Selection contract (M23-07, M23-08, M23-09, M23-10, M23-13):
 *
 *  - Slot template is fixed to `[hard, medium, medium, easy]` in this
 *    order. The returned `selected` preserves slot order, so the final
 *    composition AND final order are reproducible.
 *  - Within a bucket, candidates are ordered deterministically by:
 *      1. structural priority (`sameCategory` AND (`sameSupplier` OR
 *         `sameBrand === true`)) before everything else;
 *      2. semantic proximity appropriate to the bucket — `hard` and
 *         `medium` prefer higher cosine; `easy` prefers lower cosine.
 *         A `null` cosine sorts last on this axis;
 *      3. `product.id` ascending as a stable, tie-breaker of last resort.
 *  - Fallback sequence (no duplicates across slots):
 *      hard slot:   hard pool -> best medium -> next available
 *                   (`fallback_hard_to_medium` / `fallback_hard_to_other`).
 *      medium slot: medium pool -> remaining hard -> remaining easy
 *                   (`fallback_medium_to_hard` / `fallback_medium_to_easy`).
 *      easy slot:   easy pool -> remaining medium -> remaining hard
 *                   (`fallback_easy_to_medium` / `fallback_easy_to_hard`).
 *  - The selector never duplicates a product across the returned slots.
 *  - When the pool is smaller than the target, it returns fewer slots
 *    rather than padding with `undefined` or duplicates.
 *
 * Determinism (M23-13):
 *
 *  - The selector is fully deterministic on `(positive, candidates,
 *    options)`. The same `seed` and configuration yield the same
 *    composition and the same final order.
 *  - `seed` is propagated to telemetry for reproducibility audits and is
 *    accepted in `options` even though the deterministic ordering above
 *    fully resolves ties without RNG. This keeps the interface stable for
 *    the orchestrator in T23-5 / `ModelTrainer` (T23-6) and matches the
 *    M23-13 contract that "same seed + same configuration produce same
 *    output".
 *
 * Telemetry (M23-14):
 *
 *  - The `telemetry` object aggregates per-positive availability and
 *    selection counts per bucket, fallback usage by slot, intra-category
 *    coverage, plus `mode` and `seed`. The contract is intentionally
 *    minimal at this task level; downstream `training-utils` / benchmark
 *    aggregate per-run / per-epoch on top of this.
 *
 * Purity:
 *
 *  - Inputs are read-only. The selector copies bucket pools internally
 *    and never mutates the caller's arrays or candidate objects.
 *  - No global state, no I/O, no logging.
 */

import type {
  BucketInputProduct,
  BucketLabel,
  StratifiedNegativeCandidate,
} from './negativeSamplingBuckets.js'
import type { NegativeSamplingMode } from '../config/negativeSamplingEnv.js'

/**
 * Fallback signal attached to the slot when the candidate did not come
 * from the slot's natural bucket. `null` means the slot was filled from
 * its primary bucket without fallback.
 */
export type SelectionFallbackKind =
  | 'hard_to_medium'
  | 'hard_to_other'
  | 'medium_to_hard'
  | 'medium_to_easy'
  | 'easy_to_medium'
  | 'easy_to_hard'

export interface SelectedNegative {
  product: BucketInputProduct
  /** Bucket of the underlying candidate (its actual classification). */
  bucket: BucketLabel
  /** `null` when filled from its target bucket; otherwise the fallback path used. */
  fallbackFrom: SelectionFallbackKind | null
  /** Underlying classified candidate (passed through for downstream use). */
  candidate: StratifiedNegativeCandidate
}

export interface NegativeSamplingTelemetry {
  mode: NegativeSamplingMode
  seed: number
  hardAvailable: number
  hardSelected: number
  mediumAvailable: number
  mediumSelected: number
  easyAvailable: number
  easySelected: number
  intraCategoryAvailable: number
  intraCategorySelected: number
  fallbackHardToMedium: number
  fallbackHardToOther: number
  fallbackMediumToHard: number
  fallbackMediumToEasy: number
  fallbackEasyToMedium: number
  fallbackEasyToHard: number
}

export interface NegativeSamplingSelectorOptions {
  mode: NegativeSamplingMode
  seed: number
}

export interface NegativeSamplingSelectionResult {
  selected: SelectedNegative[]
  telemetry: NegativeSamplingTelemetry
}

/**
 * Slot template for `ratio=4`. Fixed in M23 (`1 hard + 2 medium + 1 easy`).
 */
const SLOT_TEMPLATE: ReadonlyArray<BucketLabel> = ['hard', 'medium', 'medium', 'easy']

function hasStructuralPriority(c: StratifiedNegativeCandidate): boolean {
  return c.sameCategory && (c.sameSupplier || c.sameBrand === true)
}

/**
 * Compares two candidates within a bucket for deterministic intra-bucket
 * ordering. Returns < 0 if `a` should come before `b`.
 */
function compareWithinBucket(
  a: StratifiedNegativeCandidate,
  b: StratifiedNegativeCandidate,
  bucket: BucketLabel
): number {
  const sa = hasStructuralPriority(a) ? 1 : 0
  const sb = hasStructuralPriority(b) ? 1 : 0
  if (sa !== sb) return sb - sa

  const ac = a.cosine
  const bc = b.cosine
  if (ac === null && bc !== null) return 1
  if (ac !== null && bc === null) return -1
  if (ac !== null && bc !== null && ac !== bc) {
    return bucket === 'easy' ? ac - bc : bc - ac
  }

  if (a.product.id < b.product.id) return -1
  if (a.product.id > b.product.id) return 1
  return 0
}

interface BucketPools {
  hard: StratifiedNegativeCandidate[]
  medium: StratifiedNegativeCandidate[]
  easy: StratifiedNegativeCandidate[]
}

function partitionBuckets(
  candidates: ReadonlyArray<StratifiedNegativeCandidate>
): BucketPools {
  const hard: StratifiedNegativeCandidate[] = []
  const medium: StratifiedNegativeCandidate[] = []
  const easy: StratifiedNegativeCandidate[] = []
  for (const c of candidates) {
    if (c.bucket === 'hard') hard.push(c)
    else if (c.bucket === 'medium') medium.push(c)
    else easy.push(c)
  }
  return { hard, medium, easy }
}

/**
 * Picks the best not-yet-used candidate from `pool`, using the slot's
 * preference axis (`slotLabel`) for intra-pool ordering. This is what
 * makes the "next closest available" fallback semantics work correctly:
 * when filling a `hard` slot from the `easy` pool we want the highest
 * cosine (closest substitute), not the most-easy candidate; conversely,
 * when filling an `easy` slot from `medium`/`hard`, we want the lowest
 * cosine of those pools.
 *
 * This mutates `pool` (removes the picked candidate) and is only called
 * from the selector's main loop on internal copies, never on caller
 * input. Stable tie-break by `productId` ascending is preserved.
 */
function takeBestForSlot(
  pool: StratifiedNegativeCandidate[],
  slotLabel: BucketLabel,
  used: Set<string>
): StratifiedNegativeCandidate | undefined {
  let bestIndex = -1
  for (let i = 0; i < pool.length; i++) {
    const c = pool[i]
    if (used.has(c.product.id)) continue
    if (bestIndex === -1 || compareWithinBucket(c, pool[bestIndex], slotLabel) < 0) {
      bestIndex = i
    }
  }
  if (bestIndex === -1) return undefined
  const picked = pool[bestIndex]
  pool.splice(bestIndex, 1)
  return picked
}

/**
 * Slot fill order per slot kind, used when the natural bucket runs out.
 * Each entry is `(label, fallbackKind | null)`. The first entry is the
 * primary bucket (no fallback); the rest are explicit fallback paths.
 */
const SLOT_FILL_ORDER: Record<
  BucketLabel,
  ReadonlyArray<{ from: BucketLabel; fallback: SelectionFallbackKind | null }>
> = {
  hard: [
    { from: 'hard', fallback: null },
    { from: 'medium', fallback: 'hard_to_medium' },
    { from: 'easy', fallback: 'hard_to_other' },
  ],
  medium: [
    { from: 'medium', fallback: null },
    { from: 'hard', fallback: 'medium_to_hard' },
    { from: 'easy', fallback: 'medium_to_easy' },
  ],
  easy: [
    { from: 'easy', fallback: null },
    { from: 'medium', fallback: 'easy_to_medium' },
    { from: 'hard', fallback: 'easy_to_hard' },
  ],
}

function emptyTelemetry(opts: NegativeSamplingSelectorOptions): NegativeSamplingTelemetry {
  return {
    mode: opts.mode,
    seed: opts.seed,
    hardAvailable: 0,
    hardSelected: 0,
    mediumAvailable: 0,
    mediumSelected: 0,
    easyAvailable: 0,
    easySelected: 0,
    intraCategoryAvailable: 0,
    intraCategorySelected: 0,
    fallbackHardToMedium: 0,
    fallbackHardToOther: 0,
    fallbackMediumToHard: 0,
    fallbackMediumToEasy: 0,
    fallbackEasyToMedium: 0,
    fallbackEasyToHard: 0,
  }
}

function bumpFallback(
  telemetry: NegativeSamplingTelemetry,
  kind: SelectionFallbackKind
): void {
  switch (kind) {
    case 'hard_to_medium':
      telemetry.fallbackHardToMedium += 1
      return
    case 'hard_to_other':
      telemetry.fallbackHardToOther += 1
      return
    case 'medium_to_hard':
      telemetry.fallbackMediumToHard += 1
      return
    case 'medium_to_easy':
      telemetry.fallbackMediumToEasy += 1
      return
    case 'easy_to_medium':
      telemetry.fallbackEasyToMedium += 1
      return
    case 'easy_to_hard':
      telemetry.fallbackEasyToHard += 1
      return
  }
}

function bumpSelectedByBucket(
  telemetry: NegativeSamplingTelemetry,
  bucket: BucketLabel
): void {
  if (bucket === 'hard') telemetry.hardSelected += 1
  else if (bucket === 'medium') telemetry.mediumSelected += 1
  else telemetry.easySelected += 1
}

/**
 * Selects the M23 target distribution `1 hard + 2 medium + 1 easy` from
 * the pre-classified candidate pool, applying explicit fallback when a
 * bucket is short and never duplicating a product. See module docstring
 * for the full ordering and fallback contract.
 *
 * The returned `selected` is in slot order, so the final composition and
 * order are reproducible for `(positive, candidates, options)`.
 */
export function selectStratifiedNegatives(
  _positive: BucketInputProduct,
  candidates: ReadonlyArray<StratifiedNegativeCandidate>,
  options: NegativeSamplingSelectorOptions
): NegativeSamplingSelectionResult {
  const telemetry = emptyTelemetry(options)
  const pools = partitionBuckets(candidates)

  telemetry.hardAvailable = pools.hard.length
  telemetry.mediumAvailable = pools.medium.length
  telemetry.easyAvailable = pools.easy.length
  telemetry.intraCategoryAvailable = candidates.reduce(
    (acc, c) => (c.intraCategoryAvailable ? acc + 1 : acc),
    0
  )

  const selected: SelectedNegative[] = []
  const used = new Set<string>()

  for (const slotLabel of SLOT_TEMPLATE) {
    const fillOrder = SLOT_FILL_ORDER[slotLabel]
    let picked: { candidate: StratifiedNegativeCandidate; fallback: SelectionFallbackKind | null } | null =
      null

    for (const step of fillOrder) {
      const taken = takeBestForSlot(pools[step.from], slotLabel, used)
      if (taken !== undefined) {
        picked = { candidate: taken, fallback: step.fallback }
        break
      }
    }

    if (picked === null) {
      break
    }

    used.add(picked.candidate.product.id)
    bumpSelectedByBucket(telemetry, picked.candidate.bucket)
    if (picked.candidate.intraCategoryAvailable) {
      telemetry.intraCategorySelected += 1
    }
    if (picked.fallback !== null) {
      bumpFallback(telemetry, picked.fallback)
    }

    selected.push({
      product: picked.candidate.product,
      bucket: picked.candidate.bucket,
      fallbackFrom: picked.fallback,
      candidate: picked.candidate,
    })
  }

  return { selected, telemetry }
}
