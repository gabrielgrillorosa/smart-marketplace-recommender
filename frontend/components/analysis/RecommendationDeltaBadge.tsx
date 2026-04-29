'use client';

import { cn } from '@/lib/utils';
import type { RecommendationDelta } from '@/lib/showcase/deltas';

interface RecommendationDeltaBadgeProps {
  delta: RecommendationDelta;
  dataTestId?: string;
}

function formatScoreDelta(scoreDelta: number): string {
  const rounded = Number(scoreDelta.toFixed(2));
  if (rounded === 0) {
    return '0.00';
  }

  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(2)}`;
}

function getBadgeContent(delta: RecommendationDelta): {
  label: string;
  ariaLabel: string;
  className: string;
} {
  if (delta.kind === 'moved') {
    const directionLabel = delta.direction === 'up' ? 'subiu' : 'caiu';
    return {
      label: `${directionLabel} ${delta.previousRank}→${delta.currentRank} · ${formatScoreDelta(delta.scoreDelta)}`,
      ariaLabel: `${directionLabel} da posição ${delta.previousRank} para ${delta.currentRank} com variação de score ${formatScoreDelta(delta.scoreDelta)}`,
      className:
        delta.direction === 'up'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (delta.kind === 'unchanged') {
    return {
      label: `sem mudança · ${formatScoreDelta(delta.scoreDelta)}`,
      ariaLabel: `sem mudança entre as posições ${delta.previousRank} e ${delta.currentRank}, com variação de score ${formatScoreDelta(delta.scoreDelta)}`,
      className: 'border-gray-200 bg-gray-100 text-gray-700',
    };
  }

  if (delta.kind === 'outOfWindow') {
    return {
      label: 'fora do ranking',
      ariaLabel: `fora do ranking anterior, agora na posição ${delta.currentRank}`,
      className: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: 'novo',
    ariaLabel: `novo na posição ${delta.currentRank}`,
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  };
}

export function RecommendationDeltaBadge({ delta, dataTestId }: RecommendationDeltaBadgeProps) {
  const content = getBadgeContent(delta);

  return (
    <span
      data-testid={dataTestId}
      aria-label={content.ariaLabel}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium motion-safe:transition-opacity motion-safe:duration-200',
        content.className
      )}
    >
      {content.label}
    </span>
  );
}
