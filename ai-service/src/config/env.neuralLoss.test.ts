import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseNeuralLossMode } from './neuralLossEnv.js'

describe('parseNeuralLossMode', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  afterEach(() => {
    warn.mockClear()
  })

  it('defaults to bce when unset', () => {
    expect(parseNeuralLossMode(undefined)).toBe('bce')
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts bce and pairwise (case-insensitive)', () => {
    expect(parseNeuralLossMode('bce')).toBe('bce')
    expect(parseNeuralLossMode('PAIRWISE')).toBe('pairwise')
  })

  it('warns and falls back to bce on garbage', () => {
    expect(parseNeuralLossMode('bce_pairwise')).toBe('bce')
    expect(warn).toHaveBeenCalled()
  })
})
