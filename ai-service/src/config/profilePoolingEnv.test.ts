import { describe, it, expect } from 'vitest'
import { parseProfilePoolingHalfLifeDays, parseProfilePoolingMode } from './profilePoolingEnv.js'

describe('profilePoolingEnv', () => {
  it('parses mode mean/exp', () => {
    expect(parseProfilePoolingMode(undefined)).toBe('mean')
    expect(parseProfilePoolingMode('EXP')).toBe('exp')
  })

  it('rejects invalid mode', () => {
    expect(() => parseProfilePoolingMode('weighted')).toThrow(/PROFILE_POOLING_MODE/)
  })

  it('parses half-life default 30', () => {
    expect(parseProfilePoolingHalfLifeDays(undefined)).toBe(30)
    expect(parseProfilePoolingHalfLifeDays('45')).toBe(45)
  })

  it('rejects invalid half-life', () => {
    expect(() => parseProfilePoolingHalfLifeDays('0')).toThrow(/PROFILE_POOLING_HALF_LIFE_DAYS/)
    expect(() => parseProfilePoolingHalfLifeDays('nan')).toThrow(/PROFILE_POOLING_HALF_LIFE_DAYS/)
  })
})
