/** M17 P2 — validated at startup (PRS-25). M21 A — attention pooling env extensions. M21 — attention_learned JSON path. */
import * as path from 'node:path'
import type { ProfilePoolingMode, ProfilePoolingRuntime } from '../profile/clientProfileAggregation.js'
import { loadAttentionParamsFromResolvedPath } from '../profile/attentionParamsJson.js'

/** Default path when `PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH` is unset (`attention_learned`). */
export function resolveAttentionLearnedJsonPath(e: NodeJS.ProcessEnv): string {
  const raw = e.PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH?.trim()
  if (raw) return path.resolve(raw)
  return path.resolve(process.cwd(), 'data', 'attention-learned.json')
}

export function parseProfilePoolingMode(raw: string | undefined): ProfilePoolingMode {
  const v = (raw ?? 'attention_learned').trim().toLowerCase()
  if (v === 'mean' || v === 'exp' || v === 'attention_light' || v === 'attention_learned') return v
  throw new Error(
    `[ai-service] PROFILE_POOLING_MODE must be "mean", "exp", "attention_light", or "attention_learned" (got ${JSON.stringify(raw)}).`
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

/**
 * Softmax temperature for `attention_light` / `attention_learned`. Omitted / empty / `inf` ⇒ +Infinity (uniform weights ⇒ arithmetic mean over the selected window).
 * Must be strictly > 0 when finite.
 */
export function parseProfilePoolingAttentionTemperature(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return Number.POSITIVE_INFINITY
  const s = raw.trim().toLowerCase()
  if (s === 'inf' || s === 'infinity' || s === '+inf') return Number.POSITIVE_INFINITY
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `[ai-service] PROFILE_POOLING_ATTENTION_TEMPERATURE must be a finite number > 0, or empty/inf for uniform softmax (got ${JSON.stringify(raw)}).`
    )
  }
  return n
}

/** 0 = unlimited (all purchases in the window). */
export function parseProfilePoolingAttentionMaxEntries(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `[ai-service] PROFILE_POOLING_ATTENTION_MAX_ENTRIES must be a non-negative integer (got ${JSON.stringify(raw)}). Use 0 or omit for unlimited.`
    )
  }
  return n
}

export function buildProfilePoolingRuntimeFromEnv(e: NodeJS.ProcessEnv): ProfilePoolingRuntime {
  const mode = parseProfilePoolingMode(e.PROFILE_POOLING_MODE)
  const halfLifeDays = parseProfilePoolingHalfLifeDays(e.PROFILE_POOLING_HALF_LIFE_DAYS)
  const attentionTemperature = parseProfilePoolingAttentionTemperature(e.PROFILE_POOLING_ATTENTION_TEMPERATURE)
  const attentionMaxEntries = parseProfilePoolingAttentionMaxEntries(e.PROFILE_POOLING_ATTENTION_MAX_ENTRIES)

  if (mode === 'attention_learned') {
    const resolvedPath = resolveAttentionLearnedJsonPath(e)
    const attentionParams = loadAttentionParamsFromResolvedPath(resolvedPath)
    return { mode, halfLifeDays, attentionTemperature, attentionMaxEntries, attentionParams }
  }

  return { mode, halfLifeDays, attentionTemperature, attentionMaxEntries }
}
