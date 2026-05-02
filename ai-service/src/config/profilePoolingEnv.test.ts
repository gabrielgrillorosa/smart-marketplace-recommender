import { describe, it, expect } from 'vitest'
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseProfilePoolingHalfLifeDays,
  parseProfilePoolingMode,
  parseProfilePoolingAttentionTemperature,
  parseProfilePoolingAttentionMaxEntries,
  buildProfilePoolingRuntimeFromEnv,
  resolveAttentionLearnedJsonPath,
} from './profilePoolingEnv.js'

describe('profilePoolingEnv', () => {
  it('parses mode mean/exp/attention_light/attention_learned', () => {
    expect(parseProfilePoolingMode(undefined)).toBe('attention_learned')
    expect(parseProfilePoolingMode('EXP')).toBe('exp')
    expect(parseProfilePoolingMode('Attention_Light')).toBe('attention_light')
    expect(parseProfilePoolingMode('ATTENTION_LEARNED')).toBe('attention_learned')
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

  it('parses attention temperature (M21 A)', () => {
    expect(parseProfilePoolingAttentionTemperature(undefined)).toBe(Number.POSITIVE_INFINITY)
    expect(parseProfilePoolingAttentionTemperature('')).toBe(Number.POSITIVE_INFINITY)
    expect(parseProfilePoolingAttentionTemperature('inf')).toBe(Number.POSITIVE_INFINITY)
    expect(parseProfilePoolingAttentionTemperature('2')).toBe(2)
  })

  it('rejects invalid attention temperature', () => {
    expect(() => parseProfilePoolingAttentionTemperature('0')).toThrow(/PROFILE_POOLING_ATTENTION_TEMPERATURE/)
  })

  it('parses attention max entries', () => {
    expect(parseProfilePoolingAttentionMaxEntries(undefined)).toBe(0)
    expect(parseProfilePoolingAttentionMaxEntries('5')).toBe(5)
  })

  it('buildProfilePoolingRuntimeFromEnv matches discrete fields for legacy env', () => {
    const r = buildProfilePoolingRuntimeFromEnv({
      PROFILE_POOLING_MODE: 'exp',
      PROFILE_POOLING_HALF_LIFE_DAYS: '45',
    })
    expect(r).toEqual({
      mode: 'exp',
      halfLifeDays: 45,
      attentionTemperature: Number.POSITIVE_INFINITY,
      attentionMaxEntries: 0,
    })
  })

  it('resolveAttentionLearnedJsonPath defaults under data/', () => {
    const p = resolveAttentionLearnedJsonPath({})
    expect(p).toMatch(/data[/\\]attention-learned\.json$/)
  })

  it('attention_learned loads attentionParams from explicit JSON path', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pp-learned-'))
    try {
      const fp = join(dir, 'params.json')
      writeFileSync(fp, JSON.stringify({ w: [1, 0, 0, 0], b: 0, lambda: 1 }), 'utf8')
      const r = buildProfilePoolingRuntimeFromEnv({
        PROFILE_POOLING_MODE: 'attention_learned',
        PROFILE_POOLING_HALF_LIFE_DAYS: '30',
        PROFILE_POOLING_ATTENTION_TEMPERATURE: '1',
        PROFILE_POOLING_ATTENTION_LEARNED_JSON_PATH: fp,
      })
      expect(r.mode).toBe('attention_learned')
      expect(r.attentionParams?.w).toEqual([1, 0, 0, 0])
      expect(r.attentionParams?.b).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
