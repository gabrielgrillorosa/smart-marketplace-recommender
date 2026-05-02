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
        className="flex min-h-[44px] w-full min-w-[10rem] items-center rounded-md border border-sky-200 bg-sky-50 px-3 py-2"
        data-testid="manual-retrain-progress"
        role="status"
        aria-live="polite"
        aria-label="Retreino em curso. A sincronizar estado com o servidor do modelo."
      >
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-sky-100" aria-hidden>
          <div className="h-full w-full rounded-full bg-sky-400/80 motion-safe:animate-pulse motion-reduce:animate-none" />
        </div>
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
          'flex min-h-[44px] w-full min-w-0 items-center rounded-md border px-3 py-2 text-xs font-medium',
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
