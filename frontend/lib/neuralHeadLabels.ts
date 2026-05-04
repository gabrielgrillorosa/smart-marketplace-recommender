import type { ModelArchitectureKind, NeuralArchProfile, NeuralHeadKind, ProfilePoolingMode } from '@/lib/types';

/** Rótulo curto para métricas na UI (M21 — BCE vs pairwise). */
export function describeNeuralHeadForMetrics(kind: NeuralHeadKind | undefined): string | undefined {
  if (!kind) return undefined;
  if (kind === 'bce_sigmoid') {
    return 'BCE + sigmoide (binary cross-entropy)';
  }
  return 'Pairwise + linear (ranking loss; não comparar com BCE)';
}

/** M22 — rótulo para métricas (checkpoint baseline vs torre híbrida). */
export function describeModelArchitectureForMetrics(
  arch: ModelArchitectureKind | undefined
): string | undefined {
  if (!arch) return undefined;
  if (arch === 'm22') {
    return 'M22 — híbrido (HF + esparsa + opcional identity)';
  }
  return 'Baseline — MLP 768-d (semântico ‖ utilizador)';
}

export function describeModelArchitectureProfileForMetrics(
  profile: NeuralArchProfile | undefined
): string | undefined {
  if (!profile) return undefined;
  const map: Record<NeuralArchProfile, string> = {
    baseline: 'baseline (64)',
    deep64_32: 'deep64_32 (64→32)',
    deep128_64: 'deep128_64 (128→64)',
    deep256: 'deep256 (256→128→64)',
    deep512: 'deep512 (512→256→128→64)',
  };
  return map[profile];
}

export function describePoolingModeForMetrics(mode: ProfilePoolingMode | undefined): string | undefined {
  if (!mode) return undefined;
  const map: Record<ProfilePoolingMode, string> = {
    mean: 'mean (média simples)',
    exp: 'exp (decaimento exponencial)',
    attention_light: 'attention_light (recência + softmax)',
    attention_learned: 'attention_learned (pesos aprendidos)',
  };
  return map[mode];
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
