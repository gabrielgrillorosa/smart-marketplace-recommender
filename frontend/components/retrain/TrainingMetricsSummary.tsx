'use client';

import type { ModelStatusResponse } from '@/lib/types';
import { describeNeuralHeadForMetrics } from '@/lib/neuralHeadLabels';

interface TrainingMetricsSummaryProps {
  status: ModelStatusResponse | null;
  defaultOpen?: boolean;
}

export function TrainingMetricsSummary({ status, defaultOpen = false }: TrainingMetricsSummaryProps) {
  if (!status) {
    return (
      <p className="text-xs text-gray-500" data-testid="training-metrics-empty">
        Métricas indisponíveis até o próximo status do modelo.
      </p>
    );
  }

  const headDescription = describeNeuralHeadForMetrics(status.neuralHeadKind);

  const rows: { label: string; value: string | undefined }[] = [
    {
      label: 'Modo de treino (cabeça)',
      value: headDescription,
    },
    { label: 'Loss final', value: status.finalLoss != null ? status.finalLoss.toFixed(4) : undefined },
    { label: 'Accuracy', value: status.finalAccuracy != null ? status.finalAccuracy.toFixed(4) : undefined },
    { label: 'Amostras', value: status.trainingSamples != null ? String(status.trainingSamples) : undefined },
    { label: 'P@5', value: status.precisionAt5 != null ? status.precisionAt5.toFixed(4) : undefined },
    { label: 'Duração (ms)', value: status.durationMs != null ? String(status.durationMs) : undefined },
    { label: 'Sincronizado (Neo4j)', value: status.syncedAt },
    { label: 'Épocas (cfg / efetivas)', value:
        status.epochsConfigured != null || status.epochsEffective != null
          ? `${status.epochsConfigured ?? '—'} / ${status.epochsEffective ?? '—'}`
          : undefined,
    },
  ];

  const hasAny = rows.some((r) => r.value);
  if (!hasAny) {
    return null;
  }

  return (
    <details
      className="mt-3 rounded-md border border-gray-200 bg-gray-50/80 p-3"
      data-testid="training-metrics-summary"
      open={defaultOpen}
    >
      <summary className="cursor-pointer text-xs font-medium text-gray-700">Métricas do último treino</summary>
      <dl className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows
          .filter((r) => r.value)
          .map((r) => (
            <div key={r.label} className="flex flex-col">
              <dt className="text-[10px] uppercase tracking-wide text-gray-500">{r.label}</dt>
              <dd className="text-xs text-gray-900">{r.value}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}
