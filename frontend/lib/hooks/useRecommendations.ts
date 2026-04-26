import { useAppStore } from '@/store';

export function useRecommendations() {
  const recommendations = useAppStore((s) => s.recommendations);
  const loading = useAppStore((s) => s.loading);
  const isFallback = useAppStore((s) => s.isFallback);
  const cachedForClientId = useAppStore((s) => s.cachedForClientId);

  return { recommendations, loading, isFallback, cachedForClientId };
}
