import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseNeuralArchProfileEnv } from './neuralArchEnv.js'

describe('parseNeuralArchProfileEnv', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

  afterEach(() => {
    warn.mockClear()
  })

  it('defaults to baseline when unset', () => {
    expect(parseNeuralArchProfileEnv(undefined)).toBe('baseline')
    expect(warn).not.toHaveBeenCalled()
  })

  it('defaults to baseline when empty', () => {
    expect(parseNeuralArchProfileEnv('   ')).toBe('baseline')
    expect(warn).not.toHaveBeenCalled()
  })

  it('accepts allowed profiles', () => {
    expect(parseNeuralArchProfileEnv('baseline')).toBe('baseline')
    expect(parseNeuralArchProfileEnv('deep128_64')).toBe('deep128_64')
    expect(parseNeuralArchProfileEnv('deep256')).toBe('deep256')
  })

  it('warns and falls back to baseline on invalid profile', () => {
    expect(parseNeuralArchProfileEnv('deep999')).toBe('baseline')
    expect(warn).toHaveBeenCalled()
  })
})
