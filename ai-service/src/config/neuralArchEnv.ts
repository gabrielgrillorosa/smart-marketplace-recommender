import type { NeuralArchProfile } from '../ml/neuralModelFactory.js'

const ALLOWED_NEURAL_ARCH_PROFILES: NeuralArchProfile[] = [
  'baseline',
  'deep64_32',
  'deep128_64',
  'deep256',
  'deep512',
]

const ALLOWED_SET = new Set<string>(ALLOWED_NEURAL_ARCH_PROFILES)

export function parseNeuralArchProfileEnv(raw: string | undefined): NeuralArchProfile {
  if (raw === undefined || raw.trim() === '') return 'baseline'

  const normalized = raw.trim()
  if (ALLOWED_SET.has(normalized)) {
    return normalized as NeuralArchProfile
  }

  console.warn(
    `[ai-service] NEURAL_ARCH_PROFILE="${raw}" is invalid. ` +
      `Using default baseline. Allowed: ${ALLOWED_NEURAL_ARCH_PROFILES.join(', ')}`
  )
  return 'baseline'
}
