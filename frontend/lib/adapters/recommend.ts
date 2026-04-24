import type { RecommendationResult, Product } from '@/lib/types';

interface RawRecommendItem {
  product?: {
    id?: string;
    name?: string;
    category?: string;
    supplier?: string;
    countries?: string[];
    country?: string;
    price?: number;
    sku?: string;
  };
  finalScore?: number;
  score?: number;
  neuralScore?: number;
  semanticScore?: number;
  matchReason?: string;
}

interface RawRecommendResponse {
  recommendations?: RawRecommendItem[];
  products?: RawRecommendItem[];
  isFallback?: boolean;
  fallback?: boolean;
  modelStatus?: string;
}

function toProduct(raw: RawRecommendItem['product']): Product {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    category: String(raw?.category ?? ''),
    supplier: String(raw?.supplier ?? ''),
    countries: Array.isArray(raw?.countries) ? raw.countries : raw?.country ? [String(raw.country)] : [],
    price: Number(raw?.price ?? 0),
    sku: String(raw?.sku ?? ''),
  };
}

function toMatchReason(raw: string | undefined): RecommendationResult['matchReason'] {
  if (raw === 'semantic' || raw === 'neural' || raw === 'hybrid') return raw;
  return 'hybrid';
}

export function adaptRecommendations(raw: unknown): { results: RecommendationResult[]; isFallback: boolean } {
  const data = raw as RawRecommendResponse;
  const items = data?.recommendations ?? data?.products ?? [];
  const isFallback = Boolean(data?.isFallback ?? data?.fallback ?? false);

  const results: RecommendationResult[] = items.map((item: RawRecommendItem) => ({
    product: toProduct(item.product),
    finalScore: Number(item.finalScore ?? item.score ?? 0),
    neuralScore: item.neuralScore !== undefined ? Number(item.neuralScore) : undefined,
    semanticScore: item.semanticScore !== undefined ? Number(item.semanticScore) : undefined,
    matchReason: toMatchReason(item.matchReason),
  }));

  return { results, isFallback };
}
