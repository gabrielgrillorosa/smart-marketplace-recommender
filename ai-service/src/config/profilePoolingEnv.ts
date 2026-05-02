/** M17 P2 — validated at startup (PRS-25). */
import type { ProfilePoolingMode } from '../profile/clientProfileAggregation.js'

export function parseProfilePoolingMode(raw: string | undefined): ProfilePoolingMode {
  const v = (raw ?? 'mean').trim().toLowerCase()
  if (v === 'mean' || v === 'exp') return v
  throw new Error(
    `[ai-service] PROFILE_POOLING_MODE must be "mean" or "exp" (got ${JSON.stringify(raw)}).`
  )
}

export function parseProfilePoolingHalfLifeDays(raw: string | undefined): number {
  const n = raw === undefined || raw.trim() === '' ? 30 : Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `[ai-service] PROFILE_POOLING_HALF_LIFE_DAYS must be a finite number > 0 (got ${JSON.stringify(raw)}). Default when omitted is 30.`
    )
  }
  return n
}
