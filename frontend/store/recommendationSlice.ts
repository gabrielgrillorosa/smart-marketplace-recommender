import type { StateCreator } from 'zustand';
import type { RecommendationResult } from '@/lib/types';

export interface RecommendationSlice {
  recommendations: RecommendationResult[];
  loading: boolean;
  isFallback: boolean;
  ordered: boolean;
  cachedForClientId: string | null;
  setRecommendations: (recs: RecommendationResult[], isFallback: boolean, clientId: string) => void;
  setLoading: (v: boolean) => void;
  setOrdered: (v: boolean) => void;
  clearRecommendations: () => void;
}

export const createRecommendationSlice: StateCreator<RecommendationSlice> = (set) => ({
  recommendations: [],
  loading: false,
  isFallback: false,
  ordered: false,
  cachedForClientId: null,
  setRecommendations: (recs, isFallback, clientId) =>
    set({ recommendations: recs, isFallback, cachedForClientId: clientId }),
  setLoading: (v) => set({ loading: v }),
  setOrdered: (v) => set({ ordered: v }),
  clearRecommendations: () =>
    set({ recommendations: [], isFallback: false, ordered: false, cachedForClientId: null, loading: false }),
});
