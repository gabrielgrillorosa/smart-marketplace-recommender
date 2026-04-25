import type { RecommendationResult, Product } from '@/lib/types';

interface RawRecommendItem {
  product?: {
    id?: string;
    name?: string;
    category?: string;
    supplier?: string;
    supplierName?: string;
    countries?: string[];
    availableCountries?: string[];
    country?: string;
    price?: number;
    sku?: string;
  };
  id?: string;
  name?: string;
  category?: string;
  supplier?: string;
  supplierName?: string;
  countries?: string[];
  availableCountries?: string[];
  country?: string;
  price?: number;
  sku?: string;
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
  let items: RawRecommendItem[];
  let isFallback = false;

  if (Array.isArray(raw)) {
    items = raw as RawRecommendItem[];
  } else {
    const data = raw as RawRecommendResponse;
    items = data?.recommendations ?? data?.products ?? [];
    isFallback = Boolean(data?.isFallback ?? data?.fallback ?? false);
  }

  const results: RecommendationResult[] = items.map((item: RawRecommendItem) => {
    const productSrc = item.product ?? item;
    const product: Product = {
      id: String(productSrc.id ?? ''),
      name: String(productSrc.name ?? ''),
      category: String(productSrc.category ?? ''),
      supplier: String(productSrc.supplierName ?? productSrc.supplier ?? ''),
      countries: Array.isArray(productSrc.availableCountries)
        ? productSrc.availableCountries
        : Array.isArray(productSrc.countries)
        ? productSrc.countries
        : productSrc.country
        ? [String(productSrc.country)]
        : [],
      price: Number(productSrc.price ?? 0),
      sku: String(productSrc.sku ?? ''),
    };
    return {
      product,
      finalScore: Number(item.finalScore ?? item.score ?? 0),
      neuralScore: item.neuralScore !== undefined ? Number(item.neuralScore) : undefined,
      semanticScore: item.semanticScore !== undefined ? Number(item.semanticScore) : undefined,
      matchReason: toMatchReason(item.matchReason),
    };
  });

  return { results, isFallback };
}
