'use client';

import type { ModelStatusResponse } from '@/lib/types';
import { describeModelArchitectureForMetrics, describeNeuralHeadForMetrics } from '@/lib/neuralHeadLabels';

interface TrainingMetricsSummaryProps {
  status: ModelStatusResponse | null;
  /** True enquanto o painel está a fazer polling do treino — métricas podem actualizar a cada poucos segundos. */
  metricsSyncActive?: boolean;
}

function formatModelStatus(status: string | undefined): string {
  if (!status) return '—';
  const map: Record<string, string> = {
    untrained: 'Sem modelo treinado',
    trained: 'Treinado',
    training: 'Treino em curso',
  };
  return map[status] ?? status;
}

function dash(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

/**
 * Tabela de métricas do último treino / estado do modelo.
 * Mantém-se sempre visível quando há `status` da API (usa «—» para campos ausentes).
 * Nota: versões anteriores ocultavam o bloco inteiro quando todas as métricas numéricas
 * vinham vazias (cold start), o que parecia «remoção» da UI — ver discussão em ADR/spec do projeto.
 */
export function TrainingMetricsSummary({ status, metricsSyncActive }: TrainingMetricsSummaryProps) {
  if (!status) {
    return (
      <p className="text-xs text-gray-500" data-testid="training-metrics-empty">
        Métricas indisponíveis até o próximo status do modelo.
      </p>
    );
  }

  const rows: { label: string; value: string }[] = [
    { label: 'Estado (serviço)', value: formatModelStatus(status.status) },
    { label: 'Versão activa', value: dash(status.currentVersion) },
    { label: 'Artefacto / checkpoint', value: dash(status.currentModel) },
    { label: 'Treinado em', value: dash(status.trainedAt) },
    { label: 'Último resultado de treino', value: dash(status.lastTrainingResult) },
    { label: 'Disparado por', value: dash(status.lastTrainingTriggeredBy) },
    {
      label: 'Arquitectura (checkpoint)',
      value: dash(describeModelArchitectureForMetrics(status.modelArchitecture)),
    },
    {
      label: 'Cabeça do modelo',
      value: dash(describeNeuralHeadForMetrics(status.neuralHeadKind)),
    },
    { label: 'Loss final', value: status.finalLoss != null ? status.finalLoss.toFixed(4) : '—' },
    { label: 'Accuracy', value: status.finalAccuracy != null ? status.finalAccuracy.toFixed(4) : '—' },
    { label: 'Amostras', value: status.trainingSamples != null ? String(status.trainingSamples) : '—' },
    { label: 'P@5', value: status.precisionAt5 != null ? status.precisionAt5.toFixed(4) : '—' },
    { label: 'Duração (ms)', value: status.durationMs != null ? String(status.durationMs) : '—' },
    { label: 'Sincronizado (Neo4j)', value: dash(status.syncedAt) },
    {
      label: 'Épocas (cfg / efectivas)',
      value:
        status.epochsConfigured != null || status.epochsEffective != null
          ? `${status.epochsConfigured ?? '—'} / ${status.epochsEffective ?? '—'}`
          : '—',
    },
  ];

  return (
    <section
      className="rounded-md border border-gray-200 bg-gray-50/80 p-3"
      data-testid="training-metrics-summary"
      aria-labelledby="training-metrics-heading"
      aria-busy={metricsSyncActive ? true : undefined}
    >
      <h4 id="training-metrics-heading" className="flex items-center gap-2 text-xs font-medium text-gray-800">
        Métricas do último treino
        {metricsSyncActive ? (
          <span
            className="inline-flex h-2 w-2 shrink-0 rounded-full bg-sky-400 motion-safe:animate-pulse"
            title="Sincronização com o servidor em curso"
            aria-hidden
          />
        ) : null}
      </h4>
      <dl className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">{r.label}</dt>
            <dd className="text-xs text-gray-900">{r.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
