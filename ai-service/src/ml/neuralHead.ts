import type { NeuralHeadKind, NeuralLossMode } from '../types/index.js'

/**
 * Maps raw `LayersModel.predict` output to the **scalar in (0,1)** consumed by the hybrid
 * (`computeFinalScore`) path — M21-02.
 *
 * | `head` | Raw | Output |
 * |--------|-----|--------|
 * | `bce_sigmoid` | probability in (0,1) from sigmoid last layer | clamped to ε..1−ε |
 * | `ranking_linear` | logit from linear last layer | `σ(logit)` then clamped |
 */
export function toHybridNeuralScalar(raw: number, head: NeuralHeadKind): number {
  const z = head === 'bce_sigmoid' ? raw : 1 / (1 + Math.exp(-raw))
  return Math.min(1 - 1e-6, Math.max(1e-6, z))
}

export function neuralLossModeToHeadKind(mode: NeuralLossMode): NeuralHeadKind {
  return mode === 'pairwise' ? 'ranking_linear' : 'bce_sigmoid'
}
