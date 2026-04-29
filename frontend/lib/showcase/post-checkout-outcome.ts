import type { ModelPanelState } from '@/lib/hooks/useModelStatus';
import type { ModelStatusResponse } from '@/lib/types';

export type PostCheckoutOutcomeNotice =
  | { kind: 'rejected'; title: string; description: string }
  | { kind: 'failed'; title: string; description: string }
  | { kind: 'unknown'; title: string; description: string };

function describeRejectedOutcome(
  modelStatus: ModelStatusResponse | null
): PostCheckoutOutcomeNotice {
  const reason = modelStatus?.lastDecision?.reason?.trim();
  const description = reason
    ? `O modelo candidato foi rejeitado (${reason}); por isso, Pos-Efetivar reutiliza as recomendações do modelo atual e a ausência de mudança visível é esperada.`
    : 'O modelo candidato foi rejeitado pelo gate de promoção; por isso, Pos-Efetivar reutiliza as recomendações do modelo atual e a ausência de mudança visível é esperada.';

  return {
    kind: 'rejected',
    title: 'Modelo atual mantido após o checkout',
    description,
  };
}

function describeFailedOutcome(): PostCheckoutOutcomeNotice {
  return {
    kind: 'failed',
    title: 'Nenhum novo snapshot pós-checkout aplicado',
    description:
      'O retreinamento pós-checkout falhou; nenhum novo snapshot foi promovido e Pos-Efetivar continua exibindo as recomendações do modelo anterior.',
  };
}

function describeUnknownOutcome(): PostCheckoutOutcomeNotice {
  return {
    kind: 'unknown',
    title: 'Resultado do retreinamento ainda não confirmado',
    description:
      'A captura pós-checkout ainda não foi confirmada dentro do tempo esperado. Use o refresh manual para reconsultar o status sem assumir sucesso ou falha.',
  };
}

export function buildPostCheckoutOutcome(
  panelState: ModelPanelState,
  modelStatus: ModelStatusResponse | null,
  hasPostCheckoutSnapshot: boolean
): PostCheckoutOutcomeNotice | null {
  if (hasPostCheckoutSnapshot) {
    return null;
  }

  switch (panelState) {
    case 'rejected':
      return describeRejectedOutcome(modelStatus);
    case 'failed':
      return describeFailedOutcome();
    case 'unknown':
      return describeUnknownOutcome();
    case 'idle':
    case 'training':
    case 'promoted':
      return null;
    default:
      return null;
  }
}
