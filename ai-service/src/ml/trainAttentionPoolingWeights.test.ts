import { describe, it, expect } from 'vitest'
import { trainAttentionPoolingDense } from './trainAttentionPoolingWeights.js'

describe('trainAttentionPoolingDense', () => {
  it('fits a separable toy problem and returns w,b,lambda', async () => {
    const rows: { embedding: number[]; label: number }[] = []
    for (let i = 0; i < 24; i++) {
      rows.push({ embedding: [1, 0, 0, 0], label: 1 })
      rows.push({ embedding: [0, 1, 0, 0], label: 0 })
    }
    const r = await trainAttentionPoolingDense(rows, {
      maxEpochs: 60,
      batchSize: 8,
      validationSplit: 0.25,
      learningRate: 0.05,
      l2: 1e-5,
      earlyStopPatience: 8,
      lambdaInference: 0.75,
    })
    expect(r.params.w.length).toBe(4)
    expect(Number.isFinite(r.params.b)).toBe(true)
    expect(r.params.lambda).toBe(0.75)
    expect(r.sampleCount).toBe(48)
    expect(r.epochsCompleted).toBeGreaterThanOrEqual(1)
    expect(Number.isFinite(r.trainLoss)).toBe(true)
  })
})
