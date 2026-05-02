import type { NeuralHeadKind } from '../types/index.js'

/** Sidecar next to `model.json` under a versioned checkpoint directory (written on promotion). */
export const TRAINING_METADATA_FILENAME = 'training-metadata.json'

export interface PersistedTrainingMetadata {
  trainedAt: string
  finalLoss: number
  finalAccuracy: number
  trainingSamples: number
  durationMs: number
  syncedAt?: string
  precisionAt5?: number
  neuralHeadKind?: NeuralHeadKind
}

/** Decode `model-2026-05-01T22-40-18-110Z.json` → ISO `2026-05-01T22:40:18.110Z` (checkpoint naming in VersionedModelStore). */
export function modelFilenameToCheckpointIso(filename: string): string | null {
  const m = filename.match(/^model-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d+)Z\.json$/i)
  if (!m) return null
  const [, date, hh, mm, ss, msDigits] = m
  return `${date}T${hh}:${mm}:${ss}.${msDigits}Z`
}

export function parsePersistedTrainingMetadataJson(text: string): PersistedTrainingMetadata | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const o = parsed as Record<string, unknown>
  const trainedAt = o.trainedAt
  const finalLoss = o.finalLoss
  const finalAccuracy = o.finalAccuracy
  const trainingSamples = o.trainingSamples
  const durationMs = o.durationMs
  if (typeof trainedAt !== 'string') return null
  if (typeof finalLoss !== 'number' || Number.isNaN(finalLoss)) return null
  if (typeof finalAccuracy !== 'number' || Number.isNaN(finalAccuracy)) return null
  if (typeof trainingSamples !== 'number' || !Number.isFinite(trainingSamples)) return null
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs)) return null

  const out: PersistedTrainingMetadata = {
    trainedAt,
    finalLoss,
    finalAccuracy,
    trainingSamples,
    durationMs,
  }
  if (typeof o.syncedAt === 'string') out.syncedAt = o.syncedAt
  if (typeof o.precisionAt5 === 'number' && Number.isFinite(o.precisionAt5)) {
    out.precisionAt5 = o.precisionAt5
  }
  const head = o.neuralHeadKind
  if (head === 'bce_sigmoid' || head === 'ranking_linear') out.neuralHeadKind = head

  return out
}
