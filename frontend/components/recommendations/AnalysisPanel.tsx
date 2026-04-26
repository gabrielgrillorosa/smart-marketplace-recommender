'use client';

import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useRecommendations } from '@/lib/hooks/useRecommendations';
import { ClientProfileCard } from '@/components/client/ClientProfileCard';
import { FallbackBanner } from './FallbackBanner';
import { RecommendationSkeleton } from './RecommendationSkeleton';
import { RecommendedColumn } from './RecommendedColumn';
import { ShuffledColumn } from './ShuffledColumn';

export function AnalysisPanel() {
  const { selectedClient } = useSelectedClient();
  const { recommendations, loading, isFallback } = useRecommendations();

  return (
    <div className="space-y-6">
      {/* Client profile section */}
      {selectedClient ? (
        <ClientProfileCard client={selectedClient} />
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-400">
          <p className="text-3xl mb-2">👤</p>
          <p className="text-sm">Selecione um cliente na navbar para ver o perfil</p>
        </div>
      )}

      {/* Recommendation comparison section */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-gray-800">
          Comparação: Sem IA vs Com IA
        </h2>

        {loading ? (
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
        ) : recommendations.length === 0 ? (
          <div className="rounded-lg border border-dashed border-blue-200 bg-blue-50 px-6 py-8 text-center text-blue-700">
            <p className="text-3xl mb-2">✨</p>
            <p className="text-sm font-medium">
              Use &quot;✨ Ordenar por IA&quot; no Catálogo para ver a comparação aqui.
            </p>
            <p className="mt-1 text-xs text-blue-500">
              Selecione um cliente na navbar, vá ao Catálogo e clique em &quot;✨ Ordenar por IA&quot;.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {isFallback && <FallbackBanner />}
            <div className="flex gap-6">
              <ShuffledColumn results={recommendations} />
              <RecommendedColumn results={recommendations} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
