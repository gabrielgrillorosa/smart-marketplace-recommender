/**
 * M17 P2 — single shared profile pooling for training, inference, and offline eval (ADR-065).
 */

export type ProfilePoolingMode = 'mean' | 'exp'

export interface ProfilePoolEntry {
  embedding: number[]
  /** Age of purchase vs reference instant, in days (caller clamps negatives to 0). */
  deltaDays: number
}

export interface ProfilePoolingRuntime {
  mode: ProfilePoolingMode
  halfLifeDays: number
}

const LN2 = Math.LN2

export interface ProfileAggLogger {
  warn: (msg: string) => void
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
  mode: ProfilePoolingMode,
  halfLifeDays: number,
  logger?: ProfileAggLogger
): number[] {
  if (entries.length === 0) {
    throw new Error('aggregateClientProfileEmbeddings: empty entries')
  }
  const dims = entries[0].embedding.length
  for (const e of entries) {
    if (e.embedding.length !== dims) {
      throw new Error('aggregateClientProfileEmbeddings: embedding dimension mismatch')
    }
  }

  if (mode === 'mean') {
    const mean = new Array<number>(dims).fill(0)
    for (const e of entries) {
      for (let i = 0; i < dims; i++) mean[i] += e.embedding[i]
    }
    const n = entries.length
    return mean.map((v) => v / n)
  }

  const tau = halfLifeDays / LN2
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
    return aggregateClientProfileEmbeddings(flat, 'mean', halfLifeDays, logger)
  }

  return acc.map((v) => v / weightSum)
}
