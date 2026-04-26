'use client';

import { cn } from '@/lib/utils';
import type { JobStatus } from '@/lib/types';

interface TrainingProgressBarProps {
  status: JobStatus;
  epoch: number;
  totalEpochs: number;
  loss: number | null;
  eta: number | null;
}

export function TrainingProgressBar({
  status,
  epoch,
  totalEpochs,
  loss,
  eta,
}: TrainingProgressBarProps) {
  if (status === 'idle') return null;

  const isIndeterminate =
    status === 'queued' || totalEpochs === 0 || totalEpochs == null;

  const fraction = !isIndeterminate && status === 'running'
    ? Math.min(epoch / totalEpochs, 1)
    : status === 'done'
    ? 1
    : 0;

  const fillColor =
    status === 'done'
      ? 'bg-green-500'
      : status === 'failed'
      ? 'bg-red-500'
      : status === 'network-error'
      ? 'bg-gray-400'
      : 'bg-blue-500';

  let statusText: string;
  if (status === 'queued' || isIndeterminate) {
    statusText = 'Aguardando início...';
  } else if (status === 'running') {
    const lossText = loss !== null ? ` — Loss: ${loss.toFixed(4)}` : '';
    statusText = `Epoch ${epoch} / ${totalEpochs}${lossText}`;
  } else if (status === 'done') {
    statusText = 'Retreinamento concluído ✅';
  } else if (status === 'failed') {
    statusText = 'Retreinamento falhou';
  } else {
    statusText = 'Erro de conexão — tente novamente';
  }

  let etaText: string | null = null;
  if (status === 'running' && eta !== null) {
    etaText = eta <= 3 ? 'Finalizando...' : `~${Math.round(eta)}s restantes`;
  }

  return (
    <div className="space-y-1">
      <div
        role="progressbar"
        aria-valuenow={Math.round(fraction * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progresso do retreinamento"
        className="relative h-3 w-full overflow-hidden rounded-full bg-gray-200"
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-full origin-left rounded-full',
            fillColor,
            isIndeterminate && status !== 'done' && status !== 'failed' && status !== 'network-error'
              ? 'motion-safe:animate-pulse'
              : 'motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out'
          )}
          style={{ transform: `scaleX(${isIndeterminate ? 1 : fraction})` }}
        />
      </div>
      <div aria-live="polite" className="flex items-center justify-between text-xs text-gray-600">
        <span>{statusText}</span>
        {etaText && <span className="text-gray-500">{etaText}</span>}
      </div>
    </div>
  );
}
