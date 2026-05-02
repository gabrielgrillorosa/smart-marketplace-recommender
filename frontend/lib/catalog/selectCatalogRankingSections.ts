import type { Product, RecommendationResult } from '@/lib/types';
import type { EligibilityItem } from './eligibility';
import type { ProductDetailScoreSummary } from '@/components/catalog/ScoreBadge';

export type CatalogRankScoreEntry = ProductDetailScoreSummary;

/**
 * M18 — split catalog grid after «Ordenar por IA»: ranked eligible block + footer of `recently_purchased` only.
 */
export function selectCatalogRankingSections(args: {
  displayedProducts: Product[];
  mergedEligibilityMap: Map<string, EligibilityItem>;
  scoreMap: Map<string, CatalogRankScoreEntry>;
  activeRecommendations: RecommendationResult[];
}): { primaryRanked: Product[]; footerRecent: Product[] } {
  const { displayedProducts, mergedEligibilityMap, scoreMap, activeRecommendations } = args;

  const primaryRanked: Product[] = [];
  for (const p of displayedProducts) {
    if (scoreMap.has(p.id)) primaryRanked.push(p);
  }

  primaryRanked.sort((a, b) => {
    const sa = scoreMap.get(a.id);
    const sb = scoreMap.get(b.id);
    const ra = sa?.rankScore;
    const rb = sb?.rankScore;
    if (ra != null && rb != null) return rb - ra;
    return (sb?.finalScore ?? 0) - (sa?.finalScore ?? 0);
  });

  const recentOrder = activeRecommendations
    .filter((r) => r.eligible === false && r.eligibilityReason === 'recently_purchased')
    .map((r) => r.product.id);
  const orderIdx = new Map(recentOrder.map((id, i) => [id, i]));

  const footerRecent: Product[] = [];
  for (const p of displayedProducts) {
    const row = mergedEligibilityMap.get(p.id);
    if (row?.eligible === false && row.reason === 'recently_purchased') {
      footerRecent.push(p);
    }
  }
  footerRecent.sort((a, b) => (orderIdx.get(a.id) ?? 999) - (orderIdx.get(b.id) ?? 999));

  return { primaryRanked, footerRecent };
}
