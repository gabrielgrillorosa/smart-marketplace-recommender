import type { NeuralHeadKind } from '@/lib/types';

/** Rótulo curto para métricas na UI (M21 — BCE vs pairwise). */
export function describeNeuralHeadForMetrics(kind: NeuralHeadKind | undefined): string | undefined {
  if (!kind) return undefined;
  if (kind === 'bce_sigmoid') {
    return 'BCE + sigmoide (binary cross-entropy)';
  }
  return 'Pairwise + linear (ranking loss; não comparar com BCE)';
}

/** Classificação explícita BCE vs pairwise — obrigatória para interpretar loss / accuracy. */
export function classifyNeuralHead(kind: NeuralHeadKind | undefined): {
  code: 'bce_sigmoid' | 'ranking_linear' | 'unknown';
  headline: string;
  detail: string;
} {
  if (kind === 'bce_sigmoid') {
    return {
      code: 'bce_sigmoid',
      headline: 'Cabeça: BCE + sigmoide',
      detail:
        'Treino por classificação binária (cross-entropy). Use accuracy e loss neste quadro; não compare númericamente com treinos pairwise.',
    };
  }
  if (kind === 'ranking_linear') {
    return {
      code: 'ranking_linear',
      headline: 'Cabeça: Pairwise (ranking linear)',
      detail:
        'Treino por ranking / hinge. A loss não é BCE — não compare com modelos BCE; foque P@5 e ordem relativa.',
    };
  }
  return {
    code: 'unknown',
    headline: 'Cabeça neural: indefinida',
    detail: 'O estado do serviço não inclui neuralHeadKind — verifique o ai-service ou recarregue o status.',
  };
}
