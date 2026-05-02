import { describe, it, expect } from 'vitest'
import { parseNeuralHeadManifestJson } from './neuralHeadManifest.js'

describe('parseNeuralHeadManifestJson', () => {
  it('parses valid heads', () => {
    expect(parseNeuralHeadManifestJson('{"head":"bce_sigmoid"}')).toBe('bce_sigmoid')
    expect(parseNeuralHeadManifestJson('{"head":"ranking_linear"}')).toBe('ranking_linear')
  })

  it('rejects unknown head', () => {
    expect(() => parseNeuralHeadManifestJson('{"head":"mystery"}')).toThrow(/unknown head/)
  })

  it('rejects invalid JSON', () => {
    expect(() => parseNeuralHeadManifestJson('not-json')).toThrow(/invalid JSON/)
  })
})
