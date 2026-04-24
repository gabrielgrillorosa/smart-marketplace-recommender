import type { SearchResult, Product } from '@/lib/types';

interface RawSearchItem {
  id?: string;
  name?: string;
  category?: string;
  supplier?: string;
  countries?: string[];
  country?: string;
  price?: number;
  sku?: string;
  score?: number;
  similarity?: number;
  metadata?: Record<string, unknown>;
}

function toProduct(raw: RawSearchItem, score: number): Product {
  return {
    id: String(raw.id ?? raw.metadata?.id ?? ''),
    name: String(raw.name ?? raw.metadata?.name ?? ''),
    category: String(raw.category ?? raw.metadata?.category ?? ''),
    supplier: String(raw.supplier ?? raw.metadata?.supplier ?? ''),
    countries: Array.isArray(raw.countries)
      ? raw.countries
      : raw.country
        ? [String(raw.country)]
        : [],
    price: Number(raw.price ?? raw.metadata?.price ?? 0),
    sku: String(raw.sku ?? raw.metadata?.sku ?? ''),
    similarityScore: score,
  };
}

export function adaptSearchResults(raw: unknown): SearchResult[] {
  if (!Array.isArray(raw)) return [];

  return raw.map((item: RawSearchItem) => {
    const score = Number(item.score ?? item.similarity ?? 0);
    return {
      product: toProduct(item, score),
      score,
    };
  });
}
