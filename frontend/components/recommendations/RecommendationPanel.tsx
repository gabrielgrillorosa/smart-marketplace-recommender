'use client';

import { useRecommendations } from '@/lib/hooks/useRecommendations';
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
    return (
      <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 px-6 py-10 text-center text-blue-700">
        <p className="text-3xl mb-2">✨</p>
        <p className="text-sm font-medium">Use &quot;✨ Ordenar por IA&quot; no Catálogo para obter recomendações.</p>
        <p className="mt-1 text-xs text-blue-500">
          Selecione um cliente na navbar, vá ao Catálogo e clique em &quot;✨ Ordenar por IA&quot;.
        </p>
      </div>
    );
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
