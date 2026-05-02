import { describe, it, expect } from 'vitest'
import {
  modelFilenameToCheckpointIso,
  parsePersistedTrainingMetadataJson,
} from '../services/trainingMetadata.js'

describe('trainingMetadata', () => {
  describe('modelFilenameToCheckpointIso', () => {
    it('decodes checkpoint filename to ISO', () => {
      expect(modelFilenameToCheckpointIso('model-2026-05-01T22-40-18-110Z.json')).toBe(
        '2026-05-01T22:40:18.110Z'
      )
    })

    it('returns null for unexpected names', () => {
      expect(modelFilenameToCheckpointIso('weights.bin')).toBeNull()
      expect(modelFilenameToCheckpointIso('model-2026.json')).toBeNull()
    })
  })

  describe('parsePersistedTrainingMetadataJson', () => {
    it('parses valid JSON', () => {
      const text = JSON.stringify({
        trainedAt: '2026-05-01T22:00:00.000Z',
        finalLoss: 0.12,
        finalAccuracy: 0,
        trainingSamples: 240,
        durationMs: 5000,
        precisionAt5: 0.55,
        neuralHeadKind: 'ranking_linear',
      })
      const m = parsePersistedTrainingMetadataJson(text)
      expect(m).toMatchObject({
        trainedAt: '2026-05-01T22:00:00.000Z',
        finalLoss: 0.12,
        trainingSamples: 240,
        neuralHeadKind: 'ranking_linear',
      })
    })

    it('returns null on invalid payload', () => {
      expect(parsePersistedTrainingMetadataJson('not json')).toBeNull()
      expect(parsePersistedTrainingMetadataJson('{}')).toBeNull()
      expect(parsePersistedTrainingMetadataJson('{"trainedAt":"x"}')).toBeNull()
    })
  })
})
