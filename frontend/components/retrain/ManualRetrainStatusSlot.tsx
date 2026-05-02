'use client';

import { cn } from '@/lib/utils';

export type ManualRetrainBanner =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'warning'; message: string };

interface ManualRetrainStatusSlotProps {
  showProgress: boolean;
  banner: ManualRetrainBanner | null;
}

/**
 * Área ao lado do botão de retreino: barra de progresso (polling) ou resultado inline (alinhado aos toasts Sonner).
 */
export function ManualRetrainStatusSlot({ showProgress, banner }: ManualRetrainStatusSlotProps) {
  if (showProgress) {
    return (
      <div
        className="flex min-h-[44px] w-full min-w-0 flex-1 flex-col justify-center rounded-md border border-sky-200 bg-sky-50 px-3 py-2 sm:max-w-md"
        data-testid="manual-retrain-progress"
        role="status"
        aria-live="polite"
      >
        <div className="h-2 w-full overflow-hidden rounded bg-sky-100">
          <div className="h-full w-full origin-left animate-pulse bg-sky-500 motion-reduce:animate-none" />
        </div>
        <p className="mt-1.5 text-xs font-medium text-sky-950">A sincronizar com o servidor do modelo…</p>
      </div>
    );
  }

  if (banner) {
    const tone =
      banner.kind === 'success'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
        : banner.kind === 'error'
          ? 'border-red-200 bg-red-50 text-red-950'
          : 'border-amber-200 bg-amber-50 text-amber-950';

    return (
      <div
        className={cn(
          'flex min-h-[44px] w-full min-w-0 flex-1 items-center rounded-md border px-3 py-2 text-xs font-medium sm:max-w-md',
          tone
        )}
        data-testid={`manual-retrain-banner-${banner.kind}`}
        role="status"
        aria-live="polite"
      >
        {banner.message}
      </div>
    );
  }

  return null;
}
