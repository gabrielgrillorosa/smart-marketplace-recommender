'use client';

import { useState } from 'react';
import type { Client, RecommendationResult } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { useAppStore } from '@/store';
import {
  buildCoverageMeta,
  buildShowcaseRequestKey,
  resolveShowcaseRankingWindow,
} from '@/lib/showcase/ranking-window';

interface RecommendButtonProps {
  client: Client;
}

export function RecommendButton({ client }: RecommendButtonProps) {
  const setRecommendations = useAppStore((s) => s.setRecommendations);
  const clearRecommendations = useAppStore((s) => s.clearRecommendations);
  const setLoading = useAppStore((s) => s.setLoading);
  const [fetching, setFetching] = useState(false);

  async function handleClick() {
    setFetching(true);
    setLoading(true);
    try {
      const raw = await apiFetch<{ results: RecommendationResult[]; isFallback: boolean }>('/api/proxy/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, limit: 10 }),
      });
      const results = raw.results ?? [];
      const window = resolveShowcaseRankingWindow({ totalCatalogItems: results.length, mode: 'full' });
      const requestKey = buildShowcaseRequestKey({
        clientId: client.id,
        window,
        searchStateKind: 'filtered-catalog',
      });

      setRecommendations(
        results,
        raw.isFallback ?? false,
        buildCoverageMeta({
          window,
          requestKey,
          receivedCount: results.length,
        })
      );
    } catch {
      clearRecommendations();
    } finally {
      setFetching(false);
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={fetching}
      className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
    >
      {fetching ? '⏳ Buscando...' : '⭐ Obter Recomendações'}
    </button>
  );
}
