import type { RecommendationResult } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScoreTooltip } from './ScoreTooltip';

const REASON_VARIANT: Record<string, 'default' | 'secondary' | 'info'> = {
  semantic: 'info',
  neural: 'default',
  hybrid: 'secondary',
};

interface RecommendationCardProps {
  result: RecommendationResult;
  rank: number;
  showScore?: boolean;
}

export function RecommendationCard({ result, rank, showScore = true }: RecommendationCardProps) {
  return (
    <Card className="flex items-start gap-3 p-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
        {rank}
      </span>
      <CardContent className="flex-1 p-0">
        <p className="text-sm font-medium text-gray-900 line-clamp-2">{result.product.name}</p>
        <p className="text-xs text-gray-500">{result.product.category}</p>
        {showScore && result.finalScore != null && (
          <div className="mt-1 flex items-center gap-2">
            <ScoreTooltip result={result}>
              <span className="cursor-help text-sm font-bold text-blue-600">
                {result.finalScore.toFixed(2)}
              </span>
            </ScoreTooltip>
            <Badge variant={REASON_VARIANT[result.matchReason ?? 'hybrid'] ?? 'secondary'} className="text-xs">
              {result.matchReason ?? 'hybrid'}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
