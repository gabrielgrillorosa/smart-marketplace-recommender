'use client';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { ScoreBadge } from '@/components/catalog/ScoreBadge';
import type { RecommendationResult } from '@/lib/types';

type ColorScheme = 'gray' | 'blue' | 'emerald' | 'violet';

export interface RecommendationColumnProps {
  title: string;
  badge?: React.ReactNode;
  recommendations: RecommendationResult[] | null;
  loading?: boolean;
  emptyMessage?: string;
  colorScheme: ColorScheme;
  capturedAt?: string;
  hideScore?: boolean;
}

const headerColorMap: Record<ColorScheme, string> = {
  gray: 'bg-gray-100 text-gray-700',
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  violet: 'bg-violet-50 text-violet-700',
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function RecommendationColumn({
  title,
  badge,
  recommendations,
  loading = false,
  emptyMessage = 'Aguardando dados...',
  colorScheme,
  capturedAt,
  hideScore = false,
}: RecommendationColumnProps) {
  // Derive visibility directly from props — CSS transition handles the fade-in.
  // Using requestAnimationFrame + cleanup was cancelling the animation on re-renders.
  const hasItems = recommendations !== null && recommendations.length > 0;

  const headerClass = headerColorMap[colorScheme];

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className={cn('flex items-center justify-between gap-2 px-3 py-2', headerClass)}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          {badge}
        </div>
        {capturedAt && (
          <time
            dateTime={capturedAt}
            className="text-xs opacity-70"
            aria-label={`Capturado às ${formatTime(capturedAt)}`}
          >
            {formatTime(capturedAt)}
          </time>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 bg-white p-2">
        {loading ? (
          <ul aria-label={`Recomendações ${title} carregando`} className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="h-12 w-full animate-pulse" />
              </li>
            ))}
          </ul>
        ) : !hasItems ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-gray-400">
            <span className="mb-2 text-2xl">⏳</span>
            <p className="text-xs">{emptyMessage}</p>
          </div>
        ) : (
          <ul
            role="list"
            aria-label={`Recomendações ${title}`}
            className="space-y-1.5 motion-safe:transition-opacity motion-safe:duration-300 motion-safe:ease-out opacity-100"
          >
            {recommendations!.map((rec, index) => (
              <li
                key={rec.product.id}
                className="flex min-h-[44px] items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1.5"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                  {index + 1}
                </span>
                <span className="flex-1 truncate text-xs font-medium text-gray-800">
                  {rec.product.name}
                </span>
                {!hideScore && (
                  <ScoreBadge
                    finalScore={rec.finalScore}
                    neuralScore={rec.neuralScore ?? 0}
                    semanticScore={rec.semanticScore ?? 0}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
