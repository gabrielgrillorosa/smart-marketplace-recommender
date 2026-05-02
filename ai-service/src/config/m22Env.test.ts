import { describe, it, expect } from 'vitest'
import { assertM22EnvCombinationsOrThrow, parseM22EnvFlags } from './m22Env.js'

describe('M22 env', () => {
  it('parses defaults as all false', () => {
    const f = parseM22EnvFlags({})
    expect(f.enabled).toBe(false)
    expect(f.structural).toBe(false)
    expect(f.identity).toBe(false)
  })

  it('fail-fast when identity is on without structural', () => {
    expect(() =>
      assertM22EnvCombinationsOrThrow({
        enabled: true,
        structural: false,
        identity: true,
      })
    ).toThrow(/M22_IDENTITY/)
  })

  it('allows identity with structural', () => {
    expect(() =>
      assertM22EnvCombinationsOrThrow({
        enabled: true,
        structural: true,
        identity: true,
      })
    ).not.toThrow()
  })
})
