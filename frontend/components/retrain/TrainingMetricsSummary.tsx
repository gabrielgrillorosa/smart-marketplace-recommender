'use client';

import type { ModelStatusResponse } from '@/lib/types';
import {
  describeModelArchitectureForMetrics,
  describeModelArchitectureProfileForMetrics,
  describeNeuralHeadForMetrics,
  describePoolingModeForMetrics,
} from '@/lib/neuralHeadLabels';

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

/** Labels for `VersionedModelStore` / governance reason codes (API may send raw snake_case). */
function formatGovernanceReason(reason: string): string {
  const map: Record<string, string> = {
    candidate_below_tolerance_gate:
      'Candidato abaixo do limiar de P@5 (com tolerância configurada)',
    no_current_precision_baseline: 'Primeira promoção sem linha de base P@5 anterior',
    candidate_within_tolerance_band: 'Dentro da banda de tolerância frente ao modelo activo',
    architecture_change_skip_numeric_gate:
      'Mudança de arquitectura — P@5 não comparável; promoção sem gate numérico',
  };
  return map[reason] ?? reason;
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

  const decision = status.lastDecision;

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
      label: 'Perfil da arquitectura',
      value: dash(describeModelArchitectureProfileForMetrics(status.modelArchitectureProfile)),
    },
    {
      label: 'Cabeça do modelo',
      value: dash(describeNeuralHeadForMetrics(status.neuralHeadKind)),
    },
    {
      label: 'Pooling / attention',
      value: dash(describePoolingModeForMetrics(status.poolingMode)),
    },
    {
      label: 'Half-life pooling (dias)',
      value: status.poolingHalfLifeDays != null ? String(status.poolingHalfLifeDays) : '—',
    },
    {
      label: 'Temperatura attention',
      value:
        status.poolingAttentionTemperature === null
          ? 'uniforme'
          : status.poolingAttentionTemperature != null
            ? String(status.poolingAttentionTemperature)
            : '—',
    },
    {
      label: 'Janela attention (max)',
      value: status.poolingAttentionMaxEntries != null ? String(status.poolingAttentionMaxEntries) : '—',
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

  if (decision && decision.accepted === false) {
    rows.push(
      { label: 'Promoção do último candidato', value: 'Não promovido — mantém-se o checkpoint activo' },
      { label: 'Motivo (governação)', value: formatGovernanceReason(decision.reason) },
      {
        label: 'P@5 (activo vs candidato)',
        value: `${decision.currentPrecisionAt5.toFixed(4)} vs ${decision.candidatePrecisionAt5.toFixed(4)} (tol. ${decision.tolerance.toFixed(4)})`,
      }
    );
  }

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
