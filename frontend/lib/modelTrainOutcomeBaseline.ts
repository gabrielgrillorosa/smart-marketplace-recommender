import type { ModelStatusResponse } from '@/lib/types';

/**
 * Assinatura estável do «último resultado conhecido» em GET /model/status.
 * Usada para não confundir o resultado **histórico** (rejected/failed) de um
 * treino anterior com o desfecho do treino **actual** enquanto `awaitingRetrainSince`
 * está activo — o backend mantém `lastTrainingResult` até o próximo ciclo terminar.
 */
export function modelTrainOutcomeFingerprint(status: ModelStatusResponse | null | undefined): string {
  if (!status) return '';
  const version = (status.currentVersion ?? status.currentModel ?? '').trim();
  return [status.trainedAt ?? '', status.lastTrainingResult ?? '', version, status.modelArchitecture ?? ''].join('\u001f');
}
