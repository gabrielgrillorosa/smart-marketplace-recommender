'use client';

import { useRecommendations } from '@/lib/contexts/RecommendationContext';
import { EmptyState } from './EmptyState';
import { FallbackBanner } from './FallbackBanner';
import { RecommendationSkeleton } from './RecommendationSkeleton';
import { RecommendedColumn } from './RecommendedColumn';
import { ShuffledColumn } from './ShuffledColumn';

export function RecommendationPanel() {
  const { recommendations, loading, isFallback } = useRecommendations();

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-500">🎲 Sem IA</h3>
          <RecommendationSkeleton />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-green-700">🤖 Com IA</h3>
          <RecommendationSkeleton />
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      {isFallback && <FallbackBanner />}
      <div className="flex gap-6">
        <ShuffledColumn results={recommendations} />
        <RecommendedColumn results={recommendations} />
      </div>
    </div>
  );
}
