'use client';

import type { RecommendationResult } from '@/lib/types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ScoreTooltipProps {
  result: RecommendationResult;
  children: React.ReactNode;
}

export function ScoreTooltip({ result, children }: ScoreTooltipProps) {
  const neural = result.neuralScore !== undefined ? result.neuralScore.toFixed(2) : 'N/A';
  const semantic = result.semanticScore !== undefined ? result.semanticScore.toFixed(2) : 'N/A';

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <p>neuralScore: <span className="font-mono">{neural}</span></p>
            <p>semanticScore: <span className="font-mono">{semantic}</span></p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
