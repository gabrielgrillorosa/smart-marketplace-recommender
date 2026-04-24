'use client';

import { useEffect, useState } from 'react';
import type { Product, ProductDetail, SearchResult } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { ProductGrid } from './ProductGrid';
import { ProductFilters, type FilterState } from './ProductFilters';
import { SemanticSearchBar } from './SemanticSearchBar';
import { ProductDetailModal } from './ProductDetailModal';
import { Skeleton } from '@/components/ui/skeleton';

const API_SERVICE_URL = process.env.NEXT_PUBLIC_API_SERVICE_URL ?? 'http://localhost:8080';

interface PageResponse {
  content?: Product[];
}

export function CatalogPanel() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<FilterState>({ category: '', country: '', supplier: '' });
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<PageResponse | Product[]>(`${API_SERVICE_URL}/api/v1/products?size=100`)
      .then((data) => {
        const products = Array.isArray(data) ? data : (data.content ?? []);
        setAllProducts(products);
      })
      .catch(() => setError('Não foi possível carregar os produtos. Verifique se o API Service está disponível.'))
      .finally(() => setLoading(false));
  }, []);

  function applyFilters(products: Product[]): Product[] {
    return products.filter((p) => {
      if (filters.category && p.category !== filters.category) return false;
      if (filters.country && !p.countries.includes(filters.country)) return false;
      if (filters.supplier && p.supplier !== filters.supplier) return false;
      return true;
    });
  }

  const displayedProducts: Product[] = searchResults !== null
    ? searchResults.map((r) => ({ ...r.product, similarityScore: r.score }))
    : applyFilters(allProducts);

  async function handleProductClick(product: Product) {
    try {
      const detail = await apiFetch<ProductDetail>(`${API_SERVICE_URL}/api/v1/products/${product.id}`);
      setSelectedProduct(detail);
    } catch {
      setSelectedProduct({ ...product, description: 'Descrição não disponível.' });
    }
  }

  if (loading) {
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
        <SemanticSearchBar
          onResults={setSearchResults}
          onClear={() => setSearchResults(null)}
        />
      </div>
      {searchResults !== null && (
        <p className="text-xs text-blue-600">
          {searchResults.length} resultado(s) para busca semântica
        </p>
      )}
      <ProductGrid products={displayedProducts} onProductClick={handleProductClick} />
      <ProductDetailModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
    </div>
  );
}
