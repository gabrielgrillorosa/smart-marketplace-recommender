import type { RecommendationResult } from '@/lib/types';
import { RecommendationCard } from './RecommendationCard';

interface RecommendedColumnProps {
  results: RecommendationResult[];
}

export function RecommendedColumn({ results }: RecommendedColumnProps) {
  return (
    <div className="flex-1">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-green-700">
        <span>🤖</span> Com IA
        <span className="text-xs font-normal text-gray-500">(ranqueado por score híbrido)</span>
      </h3>
      <div className="space-y-2">
        {results.map((result, i) => (
          <RecommendationCard key={result.product.id} result={result} rank={i + 1} showScore />
        ))}
      </div>
    </div>
  );
}
