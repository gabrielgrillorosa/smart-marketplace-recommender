/**
 * M17 P2 — single shared profile pooling for training, inference, and offline eval (ADR-065).
 * M21 A — `attention_light` (fixed recency softmax).
 * M21 — `attention_learned` (logits w·e + b − λΔ/τ, softmax; params from JSON — ADR-073).
 */

import { dotVectors, type AttentionParams } from './attentionParamsJson.js'

export type { AttentionParams } from './attentionParamsJson.js'

export type ProfilePoolingMode = 'mean' | 'exp' | 'attention_light' | 'attention_learned'

export interface ProfilePoolEntry {
  embedding: number[]
  /** Age of purchase vs reference instant, in days (caller clamps negatives to 0). */
  deltaDays: number
}

export interface ProfilePoolingRuntime {
  mode: ProfilePoolingMode
  halfLifeDays: number
  /**
   * M21 A — softmax temperature for `attention_light` / `attention_learned` (+Infinity = uniform weights).
   * Ignored for `mean` / `exp`.
   */
  attentionTemperature?: number
  /**
   * M21 A — keep only the `attentionMaxEntries` most recent purchases (smallest `deltaDays`); 0 = unlimited.
   * Ignored for `mean` / `exp`.
   */
  attentionMaxEntries?: number
  /**
   * M21 — required for `attention_learned` (loaded at startup from JSON path).
   * Ignored for `attention_light` and other modes.
   */
  attentionParams?: AttentionParams
}

const LN2 = Math.LN2

export interface ProfileAggLogger {
  warn: (msg: string) => void
}

function isProfilePoolingRuntime(x: unknown): x is ProfilePoolingRuntime {
  return (
    typeof x === 'object' &&
    x !== null &&
    'mode' in x &&
    'halfLifeDays' in x &&
    typeof (x as ProfilePoolingRuntime).halfLifeDays === 'number'
  )
}

function softmaxNormalized(logits: number[]): number[] {
  if (logits.length === 0) return []
  const m = Math.max(...logits)
  const exps = logits.map((z) => Math.exp(z - m))
  const s = exps.reduce((a, b) => a + b, 0)
  if (s <= 0 || !Number.isFinite(s)) return logits.map(() => 1 / logits.length)
  return exps.map((e) => e / s)
}

function selectEntriesForAttention(entries: ProfilePoolEntry[], maxEntries: number): ProfilePoolEntry[] {
  if (maxEntries <= 0 || entries.length <= maxEntries) return entries
  const indexed = entries.map((e, i) => ({ e, i }))
  indexed.sort((a, b) => {
    const d = a.e.deltaDays - b.e.deltaDays
    return d !== 0 ? d : a.i - b.i
  })
  return indexed.slice(0, maxEntries).map((x) => x.e)
}

function finishWeightedProfile(
  work: ProfilePoolEntry[],
  weights: number[],
  dims: number,
  pooling: ProfilePoolingRuntime,
  logger?: ProfileAggLogger
): number[] {
  let wSum = 0
  for (const w of weights) wSum += w
  if (wSum <= 0 || !Number.isFinite(wSum)) {
    const flat = work.map((e) => ({ embedding: e.embedding, deltaDays: 0 as number }))
    return aggregateClientProfileEmbeddings(flat, { mode: 'mean', halfLifeDays: pooling.halfLifeDays }, logger)
  }

  const acc = new Array<number>(dims).fill(0)
  for (let j = 0; j < work.length; j++) {
    const wt = weights[j]!
    for (let i = 0; i < dims; i++) acc[i] += wt * work[j]!.embedding[i]!
  }
  return acc
}

/** Shared tail for `attention_light` and `attention_learned` (window + softmax + weighted sum). */
function aggregateAttentionFamily(
  entries: ProfilePoolEntry[],
  pooling: ProfilePoolingRuntime,
  variant: 'attention_light' | 'attention_learned',
  logger?: ProfileAggLogger
): number[] {
  const maxEntries = pooling.attentionMaxEntries ?? 0
  const work = selectEntriesForAttention(entries, maxEntries)
  const dims = work[0]!.embedding.length
  const tau = pooling.halfLifeDays / LN2
  const T = pooling.attentionTemperature
  const useUniform = T === undefined || !Number.isFinite(T) || T > 1e100

  let weights: number[]
  if (useUniform) {
    weights = work.map(() => 1 / work.length)
  } else if (variant === 'attention_light') {
    const logits = work.map((e) => {
      let delta = e.deltaDays
      if (delta < 0) {
        logger?.warn(`[profilePooling] clamped negative deltaDays (${delta}) to 0`)
        delta = 0
      }
      return -(delta / tau) / T
    })
    weights = softmaxNormalized(logits)
  } else {
    const params = pooling.attentionParams
    if (!params) {
      throw new Error(
        'aggregateClientProfileEmbeddings: attention_learned requires attentionParams (PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH at startup)'
      )
    }
    if (params.w.length !== dims) {
      throw new Error(
        `aggregateClientProfileEmbeddings: attention_learned vector w length ${params.w.length} !== embedding dimension ${dims}`
      )
    }
    const lambda = params.lambda ?? 1.0
    const logits = work.map((e) => {
      let delta = e.deltaDays
      if (delta < 0) {
        logger?.warn(`[profilePooling] clamped negative deltaDays (${delta}) to 0`)
        delta = 0
      }
      const learnedScore = dotVectors(params.w, e.embedding) + params.b
      return learnedScore - lambda * (delta / tau)
    })
    weights = softmaxNormalized(logits.map((z) => z / T))
  }

  return finishWeightedProfile(work, weights, dims, pooling, logger)
}

function aggregateCore(entries: ProfilePoolEntry[], pooling: ProfilePoolingRuntime, logger?: ProfileAggLogger): number[] {
  if (entries.length === 0) {
    throw new Error('aggregateClientProfileEmbeddings: empty entries')
  }
  const dims = entries[0].embedding.length
  for (const e of entries) {
    if (e.embedding.length !== dims) {
      throw new Error('aggregateClientProfileEmbeddings: embedding dimension mismatch')
    }
  }

  if (pooling.mode === 'mean') {
    const mean = new Array<number>(dims).fill(0)
    for (const e of entries) {
      for (let i = 0; i < dims; i++) mean[i] += e.embedding[i]
    }
    const n = entries.length
    return mean.map((v) => v / n)
  }

  if (pooling.mode === 'attention_light') {
    return aggregateAttentionFamily(entries, pooling, 'attention_light', logger)
  }

  if (pooling.mode === 'attention_learned') {
    return aggregateAttentionFamily(entries, pooling, 'attention_learned', logger)
  }

  // exp
  const tau = pooling.halfLifeDays / LN2
  let weightSum = 0
  const acc = new Array<number>(dims).fill(0)
  for (const e of entries) {
    let delta = e.deltaDays
    if (delta < 0) {
      logger?.warn(`[profilePooling] clamped negative deltaDays (${delta}) to 0`)
      delta = 0
    }
    const w = Math.exp(-delta / tau)
    weightSum += w
    for (let i = 0; i < dims; i++) acc[i] += w * e.embedding[i]
  }

  if (weightSum <= 0 || !Number.isFinite(weightSum)) {
    const flat = entries.map((e) => ({ embedding: e.embedding, deltaDays: 0 as number }))
    return aggregateClientProfileEmbeddings(flat, { mode: 'mean', halfLifeDays: pooling.halfLifeDays }, logger)
  }

  return acc.map((v) => v / weightSum)
}

/**
 *Days between reference instant and purchase ISO time; negative ages clamp to 0 (spec edge case).
 */
export function deltaDaysUtc(tRef: Date, purchaseIso: string, logger?: ProfileAggLogger): number {
  const ms = Date.parse(purchaseIso)
  if (Number.isNaN(ms)) return 0
  const diffMs = tRef.getTime() - ms
  if (diffMs < 0) {
    logger?.warn(
      `[profilePooling] purchase iso ${purchaseIso} is after reference — using deltaDays=0`
    )
    return 0
  }
  return diffMs / 86_400_000
}

export function aggregateClientProfileEmbeddings(
  entries: ProfilePoolEntry[],
  pooling: ProfilePoolingRuntime,
  logger?: ProfileAggLogger
): number[]
export function aggregateClientProfileEmbeddings(
  entries: ProfilePoolEntry[],
  mode: ProfilePoolingMode,
  halfLifeDays: number,
  logger?: ProfileAggLogger
): number[]
export function aggregateClientProfileEmbeddings(
  entries: ProfilePoolEntry[],
  modeOrRuntime: ProfilePoolingMode | ProfilePoolingRuntime,
  halfLifeOrLogger?: number | ProfileAggLogger,
  logger?: ProfileAggLogger
): number[] {
  let pooling: ProfilePoolingRuntime
  let log: ProfileAggLogger | undefined

  if (isProfilePoolingRuntime(modeOrRuntime)) {
    pooling = modeOrRuntime
    log = halfLifeOrLogger as ProfileAggLogger | undefined
  } else {
    pooling = { mode: modeOrRuntime, halfLifeDays: halfLifeOrLogger as number }
    log = logger
  }

  return aggregateCore(entries, pooling, log)
}
