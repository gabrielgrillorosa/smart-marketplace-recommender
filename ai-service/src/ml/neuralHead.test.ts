import { describe, it, expect } from 'vitest'
import { neuralLossModeToHeadKind, toHybridNeuralScalar } from './neuralHead.js'

describe('toHybridNeuralScalar', () => {
  it('clamps bce_sigmoid probabilities', () => {
    expect(toHybridNeuralScalar(0.5, 'bce_sigmoid')).toBeCloseTo(0.5, 5)
    expect(toHybridNeuralScalar(1, 'bce_sigmoid')).toBeLessThan(1)
    expect(toHybridNeuralScalar(0, 'bce_sigmoid')).toBeGreaterThan(0)
  })

  it('applies sigmoid to ranking_linear logits', () => {
    expect(toHybridNeuralScalar(0, 'ranking_linear')).toBeCloseTo(0.5, 5)
    expect(toHybridNeuralScalar(10, 'ranking_linear')).toBeGreaterThan(0.99)
  })
})

describe('neuralLossModeToHeadKind', () => {
  it('maps training modes to persisted head kinds', () => {
    expect(neuralLossModeToHeadKind('bce')).toBe('bce_sigmoid')
    expect(neuralLossModeToHeadKind('pairwise')).toBe('ranking_linear')
  })
})
