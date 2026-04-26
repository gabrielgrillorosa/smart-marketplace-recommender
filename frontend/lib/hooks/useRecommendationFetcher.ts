import { useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store';
import { apiFetch } from '@/lib/fetch-wrapper';
import type { RecommendationResult } from '@/lib/types';

interface RecommendResponse {
  recommendations?: RecommendationResult[];
  results?: RecommendationResult[];
  isFallback?: boolean;
}

export function useRecommendationFetcher() {
  const loadingRef = useRef(false);

  const loading = useAppStore((s) => s.loading);
  const cachedForClientId = useAppStore((s) => s.cachedForClientId);
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setLoading = useAppStore((s) => s.setLoading);
  const setRecommendations = useAppStore((s) => s.setRecommendations);
  const setOrdered = useAppStore((s) => s.setOrdered);

  async function fetch(clientId: string): Promise<void> {
    if (loadingRef.current || loading) return;
    if (cachedForClientId === clientId) {
      // Cache válido — apenas reativa a ordenação sem novo fetch
      setOrdered(true);
      return;
    }

    loadingRef.current = true;
    setLoading(true);

    try {
      const data = await apiFetch<RecommendResponse>('/api/proxy/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, limit: 10 }),
      });

      const recs = data.recommendations ?? data.results ?? [];
      setRecommendations(recs, data.isFallback ?? false, clientId);
      setOrdered(true);

      const clientName = selectedClient?.name ?? clientId;
      toast.success(`✓ Recomendações carregadas para ${clientName}`, { duration: 3000 });
    } catch {
      setOrdered(false);
      toast.error('Erro ao carregar recomendações — tente novamente');
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  return { fetch };
}
