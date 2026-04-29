import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store';
import { apiFetch } from '@/lib/fetch-wrapper';
import type { RecommendationResult } from '@/lib/types';
import { buildCoverageMeta, type RankingWindow } from '@/lib/showcase/ranking-window';

interface RecommendResponse {
  recommendations?: RecommendationResult[];
  results?: RecommendationResult[];
  isFallback?: boolean;
}

export function useRecommendationFetcher() {
  const loadingRef = useRef(false);

  const loading = useAppStore((s) => s.loading);
  const requestKeyInStore = useAppStore((s) => s.requestKey);
  const coverageMeta = useAppStore((s) => s.coverageMeta);
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setLoading = useAppStore((s) => s.setLoading);
  const setRecommendations = useAppStore((s) => s.setRecommendations);
  const setOrdered = useAppStore((s) => s.setOrdered);
  const resetOrderedState = useAppStore((s) => s.resetOrderedState);

  const fetch = useCallback(async (
    clientId: string,
    options: { window: RankingWindow; requestKey: string; force?: boolean }
  ): Promise<void> => {
    if (loadingRef.current || loading) return;

    if (!options.force && requestKeyInStore === options.requestKey && coverageMeta !== null) {
      setOrdered(true);
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    try {
      const data = await apiFetch<RecommendResponse>('/api/proxy/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, limit: options.window.requestedLimit }),
      });

      const recs = data.recommendations ?? data.results ?? [];
      setRecommendations(
        recs,
        data.isFallback ?? false,
        buildCoverageMeta({
          window: options.window,
          requestKey: options.requestKey,
          receivedCount: recs.length,
        })
      );
      setOrdered(true);

      const clientName = selectedClient?.name ?? clientId;
      toast.success(`✓ Recomendações carregadas para ${clientName}`, { duration: 3000 });
    } catch {
      resetOrderedState();
      toast.error('Erro ao carregar recomendações — tente novamente');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [coverageMeta, loading, requestKeyInStore, resetOrderedState, selectedClient, setLoading, setOrdered, setRecommendations]);

  return { fetch };
}
