import type { RecommendationResult } from '../types/index.js'

/**
 * M18 (AD-055 / CSL-01): HTTP responses omit ineligible rows whose reason is `no_embedding` or `in_cart`.
 * Keeps eligible rows, `recently_purchased`, and legacy payloads without explicit eligibility (backward compatible).
 */
export function filterRecommendationsForClientHttp(rows: RecommendationResult[]): RecommendationResult[] {
  return rows.filter((row) => {
    if (row.eligible !== false) return true
    const r = row.eligibilityReason
    if (r === 'no_embedding' || r === 'in_cart') return false
    return true
  })
}
