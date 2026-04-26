'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Product, ProductDetail, SearchResult } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { ProductFilters, type FilterState } from './ProductFilters';
import { SemanticSearchBar } from './SemanticSearchBar';
import { ProductDetailModal } from './ProductDetailModal';
import { ProductCard } from './ProductCard';
import { Skeleton } from '@/components/ui/skeleton';
import { ReorderableGrid } from '@/components/ReorderableGrid/ReorderableGrid';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useCatalogOrdering } from '@/lib/hooks/useCatalogOrdering';
import { useRecommendationFetcher } from '@/lib/hooks/useRecommendationFetcher';
import { useRecommendations } from '@/lib/hooks/useRecommendations';

interface PageResponse {
  content?: Product[];
  items?: RawProduct[];
}

interface RawProduct {
  id: string;
  name: string;
  category: string;
  supplierName: string;
  availableCountries: string[];
  price: number;
  sku: string;
}

function toProduct(raw: RawProduct): Product {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    supplier: raw.supplierName,
    countries: raw.availableCountries,
    price: raw.price,
    sku: raw.sku,
  };
}

export function CatalogPanel() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<FilterState>({ category: '', country: '', supplier: '' });
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { selectedClient } = useSelectedClient();
  const { ordered, reset } = useCatalogOrdering();
  const { fetch: fetchRecommendations } = useRecommendationFetcher();
  const { recommendations, loading: recLoading } = useRecommendations();

  useEffect(() => {
    apiFetch<PageResponse | Product[]>('/backend/api/v1/products?size=100')
      .then((data) => {
        let raw: RawProduct[] | Product[];
        if (Array.isArray(data)) {
          raw = data;
        } else if ((data as PageResponse).items) {
          raw = (data as PageResponse).items!;
        } else {
          raw = (data as PageResponse).content ?? [];
        }
        const products = (raw as RawProduct[]).map((item) =>
          'supplier' in item ? (item as unknown as Product) : toProduct(item)
        );
        setAllProducts(products);
      })
      .catch(() => setError('Não foi possível carregar os produtos. Verifique se o API Service está disponível.'))
      .finally(() => setLoadingProducts(false));
  }, []);

  function applyFilters(products: Product[]): Product[] {
    return products.filter((p) => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.country && !p.countries.includes(filters.country)) return false;
      if (filters.supplier && p.supplier !== filters.supplier) return false;
      return true;
    });
  }

  const displayedProducts: Product[] =
    searchResults !== null
      ? searchResults.map((r) => ({ ...r.product, similarityScore: r.score }))
      : applyFilters(allProducts);

  // Build a score map from recommendations for quick lookup
  const scoreMap = new Map(
    recommendations.map((r) => [
      r.product.id,
      { finalScore: r.finalScore, neuralScore: r.neuralScore ?? 0, semanticScore: r.semanticScore ?? 0 },
    ])
  );

  async function handleProductClick(product: Product) {
    try {
      const detail = await apiFetch<ProductDetail>(`/backend/api/v1/products/${product.id}`);
      setSelectedProduct(detail);
    } catch {
      setSelectedProduct({ ...product, description: 'Descrição não disponível.' });
    }
  }

  async function handleSortByAI() {
    if (!selectedClient) return;
    await fetchRecommendations(selectedClient.id);
  }

  const renderItem = useCallback(
    (product: Product) => {
      const scores = ordered ? scoreMap.get(product.id) : undefined;
      return (
        <ProductCard
          product={product}
          onClick={() => handleProductClick(product)}
          scoreBadge={scores}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordered, recommendations]
  );

  if (loadingProducts) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <ProductFilters products={allProducts} filters={filters} onChange={setFilters} />
        <SemanticSearchBar onResults={setSearchResults} onClear={() => setSearchResults(null)} />
      </div>

      {/* AI Sort toolbar */}
      <div className="flex items-center gap-2">
        {!ordered ? (
          <span title={!selectedClient ? 'Selecione um cliente na navbar' : undefined}>
            <button
              type="button"
              aria-disabled={!selectedClient}
              aria-pressed={false}
              onClick={selectedClient ? handleSortByAI : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedClient
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
            >
              {recLoading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Carregando...
                </>
              ) : (
                <>✨ Ordenar por IA</>
              )}
            </button>
          </span>
        ) : (
          <button
            type="button"
            aria-pressed={true}
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 transition-colors"
          >
            ✕ Ordenação original
          </button>
        )}
      </div>

      {searchResults !== null && (
        <p className="text-xs text-blue-600">{searchResults.length} resultado(s) para busca semântica</p>
      )}

      <ReorderableGrid
        items={displayedProducts}
        getKey={(p) => p.id}
        getScore={(p) => scoreMap.get(p.id)?.finalScore}
        renderItem={renderItem}
        ordered={ordered}
      />

      <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
