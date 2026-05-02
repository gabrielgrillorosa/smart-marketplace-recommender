import { useAppStore } from '@/store';

export function useRecommendations() {
  const recommendations = useAppStore((s) => s.recommendations);
  const rankingConfig = useAppStore((s) => s.rankingConfig);
  const loading = useAppStore((s) => s.loading);
  const isFallback = useAppStore((s) => s.isFallback);
  const requestKey = useAppStore((s) => s.requestKey);
  const coverageMeta = useAppStore((s) => s.coverageMeta);
  const coverageMode = useAppStore((s) => s.coverageMode);

  return { recommendations, rankingConfig, loading, isFallback, requestKey, coverageMeta, coverageMode };
}
