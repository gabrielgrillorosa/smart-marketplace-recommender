'use client';

import { useMemo } from 'react';
import type { RecommendationResult } from '@/lib/types';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { seededShuffle } from '@/lib/utils/shuffle';
import { RecommendationCard } from './RecommendationCard';

interface ShuffledColumnProps {
  results: RecommendationResult[];
}

export function ShuffledColumn({ results }: ShuffledColumnProps) {
  const { selectedClient } = useSelectedClient();
  const shuffled = useMemo(
    () => seededShuffle(results, selectedClient?.id ?? 'default'),
    [results, selectedClient?.id]
  );

  return (
    <div className="flex-1">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-500">
        <span>🎲</span> Sem IA
        <span className="text-xs font-normal text-gray-400">(ordem aleatória)</span>
      </h3>
      <div className="space-y-2">
        {shuffled.map((result, i) => (
          <RecommendationCard key={result.product.id} result={result} rank={i + 1} showScore={false} />
        ))}
      </div>
    </div>
  );
}
