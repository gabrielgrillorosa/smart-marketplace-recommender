import type { NeuralLossMode } from '../types/index.js'

/**
 * Parses `NEURAL_LOSS_MODE` for M21 T1. Invalid or empty values fall back to **`bce`**
 * (documented — service does not exit on typo; operator sees warning in logs).
 */
export function parseNeuralLossMode(raw: string | undefined): NeuralLossMode {
  if (raw === undefined || raw.trim() === '') return 'bce'
  const v = raw.trim().toLowerCase()
  if (v === 'bce') return 'bce'
  if (v === 'pairwise') return 'pairwise'
  console.warn(
    `[ai-service] NEURAL_LOSS_MODE="${raw ?? ''}" is invalid — using default "bce". Valid values: bce, pairwise.`
  )
  return 'bce'
}
