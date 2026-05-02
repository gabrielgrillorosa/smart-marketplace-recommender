import type { Product, RecommendationResult } from '@/lib/types';

export interface EligibilityItem {
  eligible: boolean;
  reason: 'recently_purchased' | 'no_country' | 'no_embedding' | 'in_cart' | 'eligible';
  suppressionUntil: string | null;
}

export interface EligibilityBadge {
  label: string;
  variant: 'amber' | 'gray' | 'blue';
  suppressionUntil?: string;
}

export interface ResolveEligibilityBadgeOptions {
  /**
   * M18 — vitrine: prefetch pode marcar compra recente, mas a copy «fora do ranking nesta janela»
   * só faz sentido após «Ordenar por IA». Quando true, não devolve badge para `recently_purchased`.
   */
  suppressRecentPurchaseOutsideRanking?: boolean;
}

/** Precedence: in_cart > recently_purchased > no_country > no_embedding > eligible (null). */
export function resolveEligibilityBadge(
  productId: string,
  eligibilityMap: Map<string, EligibilityItem>,
  cartProductIds: Set<string>,
  options?: ResolveEligibilityBadgeOptions
): EligibilityBadge | null {
  if (cartProductIds.has(productId)) {
    return null;
  }
  const row = eligibilityMap.get(productId);
  if (!row || row.eligible) return null;
  if (row.reason === 'recently_purchased') {
    if (options?.suppressRecentPurchaseOutsideRanking) {
      return null;
    }
    return {
      label: 'Comprado recentemente — fora do ranking nesta janela',
      variant: 'amber',
      suppressionUntil: row.suppressionUntil ?? undefined,
    };
  }
  if (row.reason === 'no_country') {
    return { label: 'Indisponível no país do cliente', variant: 'gray' };
  }
  if (row.reason === 'no_embedding') {
    return { label: 'Sem embedding — não ranqueado', variant: 'gray' };
  }
  if (row.reason === 'in_cart') {
    return null;
  }
  return null;
}

export interface SuppressedItem {
  product: Product;
  item: EligibilityItem;
}

export function filterSuppressedItems(
  eligibilityMap: Map<string, EligibilityItem>,
  allProducts: Product[]
): SuppressedItem[] {
  const out: SuppressedItem[] = [];
  for (const p of allProducts) {
    const item = eligibilityMap.get(p.id);
    if (item && !item.eligible && item.reason === 'recently_purchased') {
      out.push({ product: p, item });
    }
  }
  return out;
}

export function eligibilityFromRecommendation(r: RecommendationResult): EligibilityItem {
  const raw = r.eligibilityReason ?? 'eligible';
  const reason: EligibilityItem['reason'] =
    raw === 'recently_purchased' ||
    raw === 'no_country' ||
    raw === 'no_embedding' ||
    raw === 'in_cart' ||
    raw === 'eligible'
      ? raw
      : 'eligible';
  return {
    eligible: r.eligible !== false,
    reason,
    suppressionUntil: r.suppressionUntil ?? null,
  };
}

export function mergeRecommendationEligibility(
  base: Map<string, EligibilityItem>,
  recommendations: RecommendationResult[]
): Map<string, EligibilityItem> {
  const next = new Map(base);
  for (const r of recommendations) {
    next.set(r.product.id, eligibilityFromRecommendation(r));
  }
  return next;
}
