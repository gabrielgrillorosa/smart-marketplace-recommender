'use client';

import type { PostCheckoutOutcomeNotice as PostCheckoutOutcomeNoticeModel } from '@/lib/showcase/post-checkout-outcome';
import { cn } from '@/lib/utils';

interface PostCheckoutOutcomeNoticeProps {
  outcome: PostCheckoutOutcomeNoticeModel;
  onRefresh?: () => Promise<unknown> | void;
}

const toneByKind: Record<PostCheckoutOutcomeNoticeModel['kind'], string> = {
  rejected: 'border-amber-200 bg-amber-50 text-amber-900',
  failed: 'border-red-200 bg-red-50 text-red-900',
  unknown: 'border-gray-300 bg-gray-50 text-gray-800',
};

export function PostCheckoutOutcomeNotice({
  outcome,
  onRefresh,
}: PostCheckoutOutcomeNoticeProps) {
  return (
    <div
      className={cn('rounded-lg border px-4 py-3', toneByKind[outcome.kind])}
      data-testid="post-checkout-outcome-notice"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{outcome.title}</p>
          <p className="mt-1 text-xs">{outcome.description}</p>
          {outcome.filterSection ? (
            <div className="mt-3 rounded-md border border-gray-200 bg-white/60 p-2 text-xs text-gray-800">
              <p className="font-semibold text-gray-700">Filtros aplicados / elegibilidade</p>
              <p className="mt-1">{outcome.filterSection}</p>
            </div>
          ) : null}
          {outcome.modelSection ? (
            <div className="mt-2 rounded-md border border-blue-100 bg-blue-50/80 p-2 text-xs text-blue-950">
              <p className="font-semibold text-blue-800">O que mudou no modelo</p>
              <p className="mt-1">{outcome.modelSection}</p>
            </div>
          ) : null}
        </div>

        {outcome.kind === 'unknown' && onRefresh ? (
          <button
            type="button"
            data-testid="post-checkout-outcome-refresh"
            onClick={() => void onRefresh()}
            className="min-h-[44px] rounded-md border border-gray-400 px-3 text-sm font-medium text-gray-800 hover:bg-gray-100"
          >
            Recarregar status
          </button>
        ) : null}
      </div>
    </div>
  );
}
