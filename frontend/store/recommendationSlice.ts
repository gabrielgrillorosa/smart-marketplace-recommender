import type { StateCreator } from 'zustand';
import type { RecommendationResult } from '@/lib/types';
import type { CoverageMeta, CoverageMode } from '@/lib/showcase/ranking-window';

export interface RecommendationSlice {
  recommendations: RecommendationResult[];
  loading: boolean;
  isFallback: boolean;
  ordered: boolean;
  requestKey: string | null;
  coverageMode: CoverageMode;
  coverageMeta: CoverageMeta | null;
  setRecommendations: (recs: RecommendationResult[], isFallback: boolean, coverageMeta: CoverageMeta) => void;
  setLoading: (v: boolean) => void;
  setOrdered: (v: boolean) => void;
  setCoverageMode: (mode: CoverageMode) => void;
  resetOrderedState: () => void;
  clearRecommendations: () => void;
}

export const createRecommendationSlice: StateCreator<RecommendationSlice> = (set) => ({
  recommendations: [],
  loading: false,
  isFallback: false,
  ordered: false,
  requestKey: null,
  coverageMode: 'full',
  coverageMeta: null,
  setRecommendations: (recs, isFallback, coverageMeta) =>
    set({
      recommendations: recs,
      isFallback,
      requestKey: coverageMeta.requestKey,
      coverageMeta,
    }),
  setLoading: (v) => set({ loading: v }),
  setOrdered: (v) => set({ ordered: v }),
  setCoverageMode: (mode) => set({ coverageMode: mode }),
  resetOrderedState: () =>
    set({
      recommendations: [],
      isFallback: false,
      ordered: false,
      requestKey: null,
      coverageMeta: null,
      loading: false,
    }),
  clearRecommendations: () =>
    set({
      recommendations: [],
      isFallback: false,
      ordered: false,
      requestKey: null,
      coverageMode: 'full',
      coverageMeta: null,
      loading: false,
    }),
});
