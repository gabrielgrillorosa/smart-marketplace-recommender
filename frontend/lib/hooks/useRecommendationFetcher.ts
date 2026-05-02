import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useAppStore } from '@/store';
import { apiFetch } from '@/lib/fetch-wrapper';
import { adaptRecommendations } from '@/lib/adapters/recommend';
import { buildCoverageMeta, type RankingWindow } from '@/lib/showcase/ranking-window';

export type FetchRecommendationsOptions = {
  window: RankingWindow;
  requestKey: string;
  force?: boolean;
  /** When non-empty, uses cart-aware ranking (`/recommend/from-cart`). */
  cartProductIds?: string[];
  /** When true, skip success toast (e.g. cart-driven reorder). */
  silent?: boolean;
};

export function useRecommendationFetcher() {
  const fetchAbortRef = useRef<AbortController | null>(null);

  const requestKeyInStore = useAppStore((s) => s.requestKey);
  const coverageMeta = useAppStore((s) => s.coverageMeta);
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setLoading = useAppStore((s) => s.setLoading);
  const setRecommendations = useAppStore((s) => s.setRecommendations);
  const setOrdered = useAppStore((s) => s.setOrdered);
  const resetOrderedState = useAppStore((s) => s.resetOrderedState);

  const fetch = useCallback(async (clientId: string, options: FetchRecommendationsOptions): Promise<void> => {
    if (!options.force && requestKeyInStore === options.requestKey && coverageMeta !== null) {
      setOrdered(true);
      return;
    }

    fetchAbortRef.current?.abort();
    const ac = new AbortController();
    fetchAbortRef.current = ac;

    setLoading(true);

    const cartIds = options.cartProductIds?.length ? [...options.cartProductIds].sort() : [];
    const useCartAware = cartIds.length > 0;

    try {
      const data = useCartAware
        ? await apiFetch<unknown>(
            '/api/proxy/recommend/from-cart',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId,
                productIds: cartIds,
                limit: options.window.requestedLimit,
              }),
            },
            ac.signal
          )
        : await apiFetch<unknown>(
            '/api/proxy/recommend',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId, limit: options.window.requestedLimit }),
            },
            ac.signal
          );

      const { results: recs, isFallback, rankingConfig } = adaptRecommendations(data);
      setRecommendations(
        recs,
        isFallback,
        buildCoverageMeta({
          window: options.window,
          requestKey: options.requestKey,
          receivedCount: recs.length,
        }),
        rankingConfig ?? null
      );
      setOrdered(true);

      if (!options.silent) {
        const clientName = selectedClient?.name ?? clientId;
        toast.success(
          useCartAware
            ? `✓ Ranking actualizado com o carrinho (${cartIds.length} itens) — ${clientName}`
            : `✓ Recomendações carregadas para ${clientName}`,
          { duration: 2800 }
        );
      }
    } catch {
      if (ac.signal.aborted) return;
      resetOrderedState();
      toast.error('Erro ao carregar recomendações — tente novamente');
    } finally {
      setLoading(false);
    }
  }, [coverageMeta, requestKeyInStore, resetOrderedState, selectedClient, setLoading, setOrdered, setRecommendations]);

  return { fetch };
}
