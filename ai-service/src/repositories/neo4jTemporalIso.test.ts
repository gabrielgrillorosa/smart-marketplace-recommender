import { describe, it, expect } from 'vitest'
import { neo4jTemporalValueToIso } from './neo4jTemporalIso.js'

describe('neo4jTemporalValueToIso', () => {
  it('passes through ISO strings', () => {
    expect(neo4jTemporalValueToIso('2026-05-01T12:00:00.000Z')).toBe('2026-05-01T12:00:00.000Z')
  })

  it('maps year/month/day map to UTC iso', () => {
    expect(neo4jTemporalValueToIso({ year: 2026, month: 5, day: 1 })).toBe('2026-05-01T00:00:00.000Z')
  })

  it('returns null for unknown', () => {
    expect(neo4jTemporalValueToIso(null)).toBeNull()
    expect(neo4jTemporalValueToIso(123)).toBeNull()
  })
})
