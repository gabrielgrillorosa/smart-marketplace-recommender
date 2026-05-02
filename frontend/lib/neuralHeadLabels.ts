import type { NeuralHeadKind } from '@/lib/types';

/** Rótulo curto para métricas na UI (M21 — BCE vs pairwise). */
export function describeNeuralHeadForMetrics(kind: NeuralHeadKind | undefined): string | undefined {
  if (!kind) return undefined;
  if (kind === 'bce_sigmoid') {
    return 'BCE + sigmoide (binary cross-entropy)';
  }
  return 'Pairwise + linear (ranking loss; não comparar com BCE)';
}
