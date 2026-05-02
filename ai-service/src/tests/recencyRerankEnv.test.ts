import { describe, it, expect } from 'vitest'
import { parseRecencyAnchorCount, parseRecencyRerankWeight } from '../config/recencyRerankEnv.js'

describe('recencyRerankEnv (M17)', () => {
  describe('parseRecencyRerankWeight', () => {
    it('defaults to 0 when unset or empty', () => {
      expect(parseRecencyRerankWeight(undefined)).toBe(0)
      expect(parseRecencyRerankWeight('')).toBe(0)
      expect(parseRecencyRerankWeight('   ')).toBe(0)
    })
    it('accepts non-negative finite numbers', () => {
      expect(parseRecencyRerankWeight('0')).toBe(0)
      expect(parseRecencyRerankWeight('0.25')).toBe(0.25)
    })
    it('rejects negative and non-finite values', () => {
      expect(() => parseRecencyRerankWeight('-1')).toThrow(/RECENCY_RERANK_WEIGHT/)
      expect(() => parseRecencyRerankWeight('NaN')).toThrow(/RECENCY_RERANK_WEIGHT/)
    })
  })

  describe('parseRecencyAnchorCount', () => {
    it('defaults to 1 when unset or empty', () => {
      expect(parseRecencyAnchorCount(undefined)).toBe(1)
      expect(parseRecencyAnchorCount('')).toBe(1)
    })
    it('accepts integers 1–10', () => {
      expect(parseRecencyAnchorCount('1')).toBe(1)
      expect(parseRecencyAnchorCount('10')).toBe(10)
    })
    it('rejects out of range', () => {
      expect(() => parseRecencyAnchorCount('0')).toThrow(/RECENCY_ANCHOR_COUNT/)
      expect(() => parseRecencyAnchorCount('11')).toThrow(/RECENCY_ANCHOR_COUNT/)
      expect(() => parseRecencyAnchorCount('abc')).toThrow(/RECENCY_ANCHOR_COUNT/)
    })
  })
})
