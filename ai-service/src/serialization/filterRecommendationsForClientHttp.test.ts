import { describe, it, expect } from 'vitest'
import { filterRecommendationsForClientHttp } from './filterRecommendationsForClientHttp.js'
import type { RecommendationResult } from '../types/index.js'

const base = (): Omit<RecommendationResult, 'eligible' | 'eligibilityReason'> => ({
  id: 'x',
  name: 'n',
  category: 'c',
  price: 1,
  sku: 's',
  finalScore: null,
  neuralScore: null,
  semanticScore: null,
  matchReason: null,
  suppressionUntil: null,
})

describe('filterRecommendationsForClientHttp (M18)', () => {
  it('keeps eligible, recently_purchased, and legacy rows without eligible flag', () => {
    const rows: RecommendationResult[] = [
      { ...base(), id: 'e1', eligible: true, eligibilityReason: 'eligible', finalScore: 0.9, matchReason: 'neural' },
      {
        ...base(),
        id: 'r1',
        eligible: false,
        eligibilityReason: 'recently_purchased',
        suppressionUntil: '2026-06-01T00:00:00.000Z',
      },
      { ...base(), id: 'n1', eligible: false, eligibilityReason: 'no_embedding' },
      { ...base(), id: 'c1', eligible: false, eligibilityReason: 'in_cart' },
      { ...base(), id: 'legacy', finalScore: 0.5, matchReason: 'hybrid' } as RecommendationResult,
    ]
    const out = filterRecommendationsForClientHttp(rows)
    expect(out.map((r) => r.id).sort()).toEqual(['e1', 'legacy', 'r1'].sort())
  })

  it('returns empty when input only has omitted reasons', () => {
    const rows: RecommendationResult[] = [
      { ...base(), id: 'n1', eligible: false, eligibilityReason: 'no_embedding' },
      { ...base(), id: 'c1', eligible: false, eligibilityReason: 'in_cart' },
    ]
    expect(filterRecommendationsForClientHttp(rows)).toEqual([])
  })
})
