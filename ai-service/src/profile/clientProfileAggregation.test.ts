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

  it('attention_light with infinite temperature matches mean (M21 A)', () => {
    const mean = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 10 },
        { embedding: e1, deltaDays: 99 },
      ],
      'mean',
      30
    )
    const attn = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 10 },
        { embedding: e1, deltaDays: 99 },
      ],
      {
        mode: 'attention_light',
        halfLifeDays: 30,
        attentionTemperature: Number.POSITIVE_INFINITY,
      }
    )
    expect(attn[0]).toBeCloseTo(mean[0]!, 6)
    expect(attn[1]).toBeCloseTo(mean[1]!, 6)
  })

  it('attention_light T=1 matches exp weights (golden, M21 A)', () => {
    const H = 30
    const expOut = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 0 },
        { embedding: e1, deltaDays: 30 },
      ],
      'exp',
      H
    )
    const attnOut = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 0 },
        { embedding: e1, deltaDays: 30 },
      ],
      { mode: 'attention_light', halfLifeDays: H, attentionTemperature: 1 }
    )
    expect(attnOut[0]).toBeCloseTo(expOut[0]!, 6)
    expect(attnOut[1]).toBeCloseTo(expOut[1]!, 6)
  })

  it('attention_light maxEntries=1 keeps only most recent purchase (smallest delta)', () => {
    const out = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 100 },
        { embedding: e1, deltaDays: 1 },
      ],
      { mode: 'attention_light', halfLifeDays: 30, attentionTemperature: 1, attentionMaxEntries: 1 }
    )
    expect(out).toEqual(e1)
  })

  it('attention_learned uniform temperature matches mean (M21)', () => {
    const mean = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 10 },
        { embedding: e1, deltaDays: 99 },
      ],
      'mean',
      30
    )
    const learned = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 10 },
        { embedding: e1, deltaDays: 99 },
      ],
      {
        mode: 'attention_learned',
        halfLifeDays: 30,
        attentionTemperature: Number.POSITIVE_INFINITY,
        attentionParams: { w: [1, 0, 0, 0], b: 0 },
      }
    )
    expect(learned[0]).toBeCloseTo(mean[0]!, 6)
    expect(learned[1]).toBeCloseTo(mean[1]!, 6)
  })

  it('attention_learned without attentionParams throws when temperature is finite', () => {
    expect(() =>
      aggregateClientProfileEmbeddings(
        [
          { embedding: e0, deltaDays: 0 },
          { embedding: e1, deltaDays: 1 },
        ],
        {
          mode: 'attention_learned',
          halfLifeDays: 30,
          attentionTemperature: 1,
        } as import('./clientProfileAggregation.js').ProfilePoolingRuntime
      )
    ).toThrow(/attentionParams/)
  })

  it('attention_learned biases aggregate toward higher w·embedding (lambda=0)', () => {
    const out = aggregateClientProfileEmbeddings(
      [
        { embedding: e0, deltaDays: 0 },
        { embedding: e1, deltaDays: 0 },
      ],
      {
        mode: 'attention_learned',
        halfLifeDays: 30,
        attentionTemperature: 0.5,
        attentionParams: { w: [8, 0, 0, 0], b: 0, lambda: 0 },
      }
    )
    expect(out[0]).toBeGreaterThan(0.95)
    expect(out[1]).toBeLessThan(0.08)
  })
})
