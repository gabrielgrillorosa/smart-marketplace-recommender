import { describe, it, expect, vi } from 'vitest'
import {
  aggregateClientProfileEmbeddings,
  deltaDaysUtc,
} from './clientProfileAggregation.js'

describe('aggregateClientProfileEmbeddings', () => {
  const e0 = [1, 0, 0, 0]
  const e1 = [0, 1, 0, 0]

  it('mean mode matches arithmetic mean (PRS-11)', () => {
    const m = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 10 },
        { embedding: e1, deltaDays: 99 },
      ],
      'mean',
      30
    )
    expect(m[0]).toBeCloseTo(0.5, 6)
    expect(m[1]).toBeCloseTo(0.5, 6)
    expect(m[2]).toBe(0)
    expect(m[3]).toBe(0)
  })

  it('exp mode uses half-life τ = H / ln 2 and normalizes weights (golden)', () => {
    const H = 30
    const tau = H / Math.LN2
    const d0 = 0
    const d1 = 30
    const w0 = Math.exp(-d0 / tau)
    const w1 = Math.exp(-d1 / tau)
    const expMean = [
      (w0 * 1 + w1 * 0) / (w0 + w1),
      (w0 * 0 + w1 * 1) / (w0 + w1),
      0,
      0,
    ]
    const out = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: d0 },
        { embedding: e1, deltaDays: d1 },
      ],
      'exp',
      H
    )
    expect(out[0]).toBeCloseTo(expMean[0], 6)
    expect(out[1]).toBeCloseTo(expMean[1], 6)
  })

  it('negative deltaDays clamps to 0 with optional warn', () => {
    const warn = vi.fn()
    const out = aggregateClientProfileEmbeddings(
      [{ embedding: e0, deltaDays: -5 }],
      'exp',
      30,
      { warn }
    )
    expect(out).toEqual(e0)
    expect(warn).toHaveBeenCalled()
  })

  it('deltaDaysUtc clamps future purchase', () => {
    const tRef = new Date('2026-06-01T12:00:00.000Z')
    const warn = vi.fn()
    expect(deltaDaysUtc(tRef, '2026-07-01T00:00:00.000Z', { warn })).toBe(0)
    expect(warn).toHaveBeenCalled()
  })
})
