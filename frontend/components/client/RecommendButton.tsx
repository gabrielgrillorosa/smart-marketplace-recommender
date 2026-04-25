'use client';

import { useState } from 'react';
import type { Client, RecommendationResult } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { useRecommendations } from '@/lib/contexts/RecommendationContext';

interface RecommendButtonProps {
  client: Client;
}

export function RecommendButton({ client }: RecommendButtonProps) {
  const { setRecommendations, setLoading } = useRecommendations();
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
      setRecommendations(raw.results ?? [], raw.isFallback ?? false);
    } catch {
      setRecommendations([], false);
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
