import type { StateCreator } from 'zustand';
import type { RankingConfig, RecommendationResult } from '@/lib/types';
import type { CoverageMeta, CoverageMode } from '@/lib/showcase/ranking-window';

export interface RecommendationSlice {
  recommendations: RecommendationResult[];
  rankingConfig: RankingConfig | null;
  loading: boolean;
  isFallback: boolean;
  ordered: boolean;
  requestKey: string | null;
  coverageMode: CoverageMode;
  coverageMeta: CoverageMeta | null;
  setRecommendations: (
    recs: RecommendationResult[],
    isFallback: boolean,
    coverageMeta: CoverageMeta,
    rankingConfig?: RankingConfig | null
  ) => void;
  setLoading: (v: boolean) => void;
  setOrdered: (v: boolean) => void;
  setCoverageMode: (mode: CoverageMode) => void;
  resetOrderedState: () => void;
  clearRecommendations: () => void;
}

export const createRecommendationSlice: StateCreator<RecommendationSlice> = (set) => ({
  recommendations: [],
  rankingConfig: null,
  loading: false,
  isFallback: false,
  ordered: false,
  requestKey: null,
  coverageMode: 'full',
  coverageMeta: null,
  setRecommendations: (recs, isFallback, coverageMeta, rankingConfig) =>
    set({
      recommendations: recs,
      isFallback,
      requestKey: coverageMeta.requestKey,
      coverageMeta,
      rankingConfig: rankingConfig ?? null,
    }),
  setLoading: (v) => set({ loading: v }),
  setOrdered: (v) => set({ ordered: v }),
  setCoverageMode: (mode) => set({ coverageMode: mode }),
  resetOrderedState: () =>
    set({
      recommendations: [],
      rankingConfig: null,
      isFallback: false,
      ordered: false,
      requestKey: null,
      coverageMeta: null,
      loading: false,
    }),
  clearRecommendations: () =>
    set({
      recommendations: [],
      rankingConfig: null,
      isFallback: false,
      ordered: false,
      requestKey: null,
      coverageMode: 'full',
      coverageMeta: null,
      loading: false,
    }),
});
