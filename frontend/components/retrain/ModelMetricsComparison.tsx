'use client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ModelMetrics } from '@/lib/types';

interface ModelMetricsComparisonProps {
  before: ModelMetrics | null;
  after: ModelMetrics | null;
  loading: boolean;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ModelMetricsComparison({ before, after, loading }: ModelMetricsComparisonProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-4 w-1/4" />
      </div>
    );
  }

  if (!before) {
    return (
      <p className="text-sm text-gray-500">
        Nenhum modelo treinado ainda. Aguarde um novo pedido ou use o retreino manual legado.
      </p>
    );
  }

  let comparisonBadge: React.ReactNode = null;
  if (after) {
    if (after.precisionAt5 > before.precisionAt5) {
      comparisonBadge = <Badge variant="success">↑ Melhora</Badge>;
    } else if (after.precisionAt5 === before.precisionAt5) {
      comparisonBadge = <Badge variant="warning">→ Igual</Badge>;
    } else {
      comparisonBadge = <Badge variant="destructive">↓ Regressão</Badge>;
    }
  }

  return (
    <div>
      <div
        className={cn(
          'grid gap-4',
          after ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
        )}
      >
        {/* Before column */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-700">
            {after ? 'Antes' : 'Modelo Atual'}
          </h4>
          <MetricRow label="Precision@5" value={before.precisionAt5.toFixed(4)} />
          <MetricRow label="Loss" value={before.loss.toFixed(4)} />
          <MetricRow label="Época" value={String(before.epoch)} />
          <MetricRow label="Treinado em" value={formatDate(before.trainedAt)} />
        </div>

        {/* After column */}
        {after && (
          <div
            className={cn(
              'rounded-lg border border-green-200 bg-green-50 p-4',
              'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out'
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              <h4 className="text-sm font-semibold text-gray-700">Depois</h4>
              {comparisonBadge}
            </div>
            <MetricRow label="Precision@5" value={after.precisionAt5.toFixed(4)} />
            <MetricRow label="Loss" value={after.loss.toFixed(4)} />
            <MetricRow label="Época" value={String(after.epoch)} />
            <MetricRow label="Treinado em" value={formatDate(after.trainedAt)} />
          </div>
        )}
      </div>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-800">{value}</span>
    </div>
  );
}
