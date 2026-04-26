'use client';

import * as Tooltip from '@radix-ui/react-tooltip';

export interface ScoreBadgeProps {
  finalScore: number;
  neuralScore: number;
  semanticScore: number;
}

function colorClass(score: number): string {
  if (score >= 0.7) return 'bg-green-100 text-green-800 border-green-200';
  if (score >= 0.4) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  return 'bg-gray-100 text-gray-500 border-gray-200';
}

export function ScoreBadge({ finalScore, neuralScore, semanticScore }: ScoreBadgeProps) {
  const pct = Math.round(finalScore * 100);
  const tooltipId = `score-breakdown-${pct}`;

  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <span
            aria-label={`Score: ${pct}% match`}
            aria-describedby={tooltipId}
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium motion-safe:transition-opacity motion-safe:duration-150 ${colorClass(finalScore)}`}
          >
            {pct}% match
          </span>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            id={tooltipId}
            side="top"
            className="rounded bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-md"
          >
            <p>Neural: {neuralScore.toFixed(2)}</p>
            <p>Semântico: {semanticScore.toFixed(2)}</p>
            <Tooltip.Arrow className="fill-gray-900" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
