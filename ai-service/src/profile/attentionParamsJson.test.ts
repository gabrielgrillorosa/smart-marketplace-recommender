import { describe, it, expect } from 'vitest'
import { parseAttentionParamsJson, dotVectors } from './attentionParamsJson.js'

describe('attentionParamsJson', () => {
  it('parses valid JSON', () => {
    const p = parseAttentionParamsJson(JSON.stringify({ w: [0.1, 0.2], b: -0.5, lambda: 2 }), 'test')
    expect(p.w).toEqual([0.1, 0.2])
    expect(p.b).toBe(-0.5)
    expect(p.lambda).toBe(2)
  })

  it('defaults lambda when omitted', () => {
    const p = parseAttentionParamsJson(JSON.stringify({ w: [1, 0], b: 0 }), 'test')
    expect(p.lambda).toBeUndefined()
  })

  it('rejects invalid w', () => {
    expect(() => parseAttentionParamsJson('{"w":[],"b":0}', 'x')).toThrow(/non-empty/)
  })

  it('dotVectors', () => {
    expect(dotVectors([1, 2], [3, 4])).toBe(11)
  })
})
