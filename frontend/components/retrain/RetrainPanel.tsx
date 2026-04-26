'use client';

import { cn } from '@/lib/utils';
import { useRetrainJob } from '@/lib/hooks/useRetrainJob';
import { TrainingProgressBar } from './TrainingProgressBar';
import { ModelMetricsComparison } from './ModelMetricsComparison';

export function RetrainPanel() {
  const {
    status,
    epoch,
    totalEpochs,
    loss,
    eta,
    beforeMetrics,
    afterMetrics,
    startRetrain,
  } = useRetrainJob();

  const isActive = status === 'queued' || status === 'running';
  const isDisabled = isActive;

  const buttonLabel = isActive ? 'Retreinando...' : '🔄 Retreinar Modelo';

  const metricsLoading = status === 'idle' && beforeMetrics === null;

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-800">Retreinar Modelo</h3>
        <button
          onClick={startRetrain}
          disabled={isDisabled}
          aria-disabled={isDisabled ? 'true' : undefined}
          aria-label={isDisabled ? 'Retreinamento em andamento' : undefined}
          className={cn(
            'min-h-11 rounded-md px-4 text-sm font-medium transition-colors',
            isDisabled
              ? 'cursor-not-allowed bg-gray-200 text-gray-400'
              : 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
          )}
        >
          {buttonLabel}
        </button>
      </div>

      <TrainingProgressBar
        status={status}
        epoch={epoch}
        totalEpochs={totalEpochs}
        loss={loss}
        eta={eta}
      />

      <ModelMetricsComparison
        before={beforeMetrics}
        after={afterMetrics}
        loading={metricsLoading}
      />
    </div>
  );
}
