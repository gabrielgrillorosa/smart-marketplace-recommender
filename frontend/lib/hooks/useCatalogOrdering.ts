import { useAppStore } from '@/store';

export function useCatalogOrdering() {
  const ordered = useAppStore((s) => s.ordered);
  const coverageMode = useAppStore((s) => s.coverageMode);
  const clearRecommendations = useAppStore((s) => s.clearRecommendations);
  const setCoverageMode = useAppStore((s) => s.setCoverageMode);

  function enableDiagnostic() {
    setCoverageMode('diagnostic');
  }

  function reset() {
    clearRecommendations();
  }

  return { ordered, coverageMode, enableDiagnostic, reset };
}
