'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Product, ProductDetail, SearchResult } from '@/lib/types';
import { ApiError, apiFetch } from '@/lib/fetch-wrapper';
import { ProductFilters, type FilterState } from './ProductFilters';
import { SemanticSearchBar } from './SemanticSearchBar';
import { ProductDetailModal } from './ProductDetailModal';
import { ProductCard } from './ProductCard';
import { CoverageStatusBanner } from './CoverageStatusBanner';
import { Skeleton } from '@/components/ui/skeleton';
import { ReorderableGrid } from '@/components/ReorderableGrid/ReorderableGrid';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useCatalogOrdering } from '@/lib/hooks/useCatalogOrdering';
import { useRecommendationFetcher } from '@/lib/hooks/useRecommendationFetcher';
import { useRecommendations } from '@/lib/hooks/useRecommendations';
import { useAppStore } from '@/store';
import {
  addCartItem,
  checkoutCart,
  clearCart,
  getCart,
  removeCartItem,
} from '@/lib/adapters/cart';
import { CartSummaryBar } from '@/components/cart/CartSummaryBar';
import { getModelStatus } from '@/lib/adapters/train';
import {
  buildShowcaseRequestKey,
  resolveShowcaseRankingWindow,
  type SearchStateKind,
} from '@/lib/showcase/ranking-window';
import { collectCartIntegrityIssues, resolveCartActionAvailability } from '@/lib/cart-integrity';

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

interface RawProductDetail extends RawProduct {
  description?: string;
  supplier?: string;
  countries?: string[];
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

function toProductDetail(raw: RawProductDetail | ProductDetail): ProductDetail {
  const supplierName = 'supplierName' in raw ? raw.supplierName : undefined;
  const availableCountries = 'availableCountries' in raw ? raw.availableCountries : undefined;

  return {
    id: raw.id,
    name: raw.name,
    category: raw.category,
    supplier: raw.supplier ?? supplierName ?? '',
    countries: raw.countries ?? availableCountries ?? [],
    price: raw.price,
    sku: raw.sku,
    description: raw.description ?? 'Descrição não disponível.',
  };
}

export function CatalogPanel() {
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [filters, setFilters] = useState<FilterState>({ category: '', country: '', supplier: '' });
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductDetail | null>(null);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const lastRequestedOrderedSessionRef = useRef<string | null>(null);

  const { selectedClient } = useSelectedClient();
  const { ordered, coverageMode, enableDiagnostic, reset } = useCatalogOrdering();
  const { fetch: fetchRecommendations } = useRecommendationFetcher();
  const { recommendations, loading: recLoading, coverageMeta } = useRecommendations();

  const cartByClient = useAppStore((s) => s.cartByClient);
  const cartItemLoading = useAppStore((s) => s.cartItemLoading);
  const checkoutPendingByClient = useAppStore((s) => s.checkoutPendingByClient);
  const checkoutErrorByClient = useAppStore((s) => s.checkoutErrorByClient);
  const setCart = useAppStore((s) => s.setCart);
  const setCartItemLoading = useAppStore((s) => s.setCartItemLoading);
  const setCheckoutPending = useAppStore((s) => s.setCheckoutPending);
  const setCheckoutError = useAppStore((s) => s.setCheckoutError);
  const startAwaitingRetrain = useAppStore((s) => s.startAwaitingRetrain);
  const clearRecommendations = useAppStore((s) => s.clearRecommendations);

  const clientId = selectedClient?.id ?? '';
  const cartForClient = clientId ? cartByClient[clientId] ?? null : null;
  const checkoutPending = clientId ? checkoutPendingByClient[clientId] ?? false : false;
  const checkoutError = clientId ? checkoutErrorByClient[clientId] ?? null : null;
  const cartProductIds = new Set((cartForClient?.items ?? []).map((item) => item.productId));

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

  useEffect(() => {
    if (!selectedClient) return;

    getCart(selectedClient.id)
      .then((cart) => {
        setCart(selectedClient.id, cart);
      })
      .catch(() => {
        setCheckoutError(selectedClient.id, 'Não foi possível carregar o carrinho');
      });
  }, [selectedClient, setCart, setCheckoutError]);

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

  const searchStateKind: SearchStateKind = searchResults !== null ? 'semantic-search' : 'filtered-catalog';
  const rankingWindow = useMemo(
    () => resolveShowcaseRankingWindow({ totalCatalogItems: allProducts.length, mode: coverageMode }),
    [allProducts.length, coverageMode]
  );
  const requestKey = clientId
    ? buildShowcaseRequestKey({ clientId, window: rankingWindow, searchStateKind })
    : null;
  const visibleCatalogSignature = useMemo(
    () => displayedProducts.map((product) => product.id).join(','),
    [displayedProducts]
  );
  const activeOrderedSession = requestKey ? `${requestKey}|${visibleCatalogSignature}` : null;
  const activeRecommendations = useMemo(
    () => (ordered && !recLoading ? recommendations : []),
    [ordered, recLoading, recommendations]
  );

  const scoreMap = useMemo(
    () =>
      new Map(
        activeRecommendations.map((r) => [
          r.product.id,
          { finalScore: r.finalScore, neuralScore: r.neuralScore ?? 0, semanticScore: r.semanticScore ?? 0 },
        ])
      ),
    [activeRecommendations]
  );
  const scoredVisibleCount = useMemo(
    () => displayedProducts.filter((product) => scoreMap.has(product.id)).length,
    [displayedProducts, scoreMap]
  );

  useEffect(() => {
    if (!selectedClient || !requestKey || !activeOrderedSession) {
      lastRequestedOrderedSessionRef.current = null;
      return;
    }

    if (!ordered) {
      lastRequestedOrderedSessionRef.current = null;
      return;
    }

    if (recLoading) {
      return;
    }

    if (lastRequestedOrderedSessionRef.current === activeOrderedSession) {
      return;
    }

    lastRequestedOrderedSessionRef.current = activeOrderedSession;
    void fetchRecommendations(selectedClient.id, { window: rankingWindow, requestKey, force: true });
  }, [activeOrderedSession, fetchRecommendations, ordered, rankingWindow, recLoading, requestKey, selectedClient]);

  async function handleProductClick(product: Product) {
    try {
      const detail = await apiFetch<RawProductDetail | ProductDetail>(`/backend/api/v1/products/${product.id}`);
      setSelectedProduct(toProductDetail(detail));
    } catch {
      setSelectedProduct({ ...product, description: 'Descrição não disponível.' });
    }
  }

  async function handleSortByAI() {
    if (!selectedClient || !requestKey || !activeOrderedSession) return;
    lastRequestedOrderedSessionRef.current = activeOrderedSession;
    await fetchRecommendations(selectedClient.id, { window: rankingWindow, requestKey });
  }

  async function handleAddToCart(productId: string) {
    if (!selectedClient) return;
    setCartItemLoading(selectedClient.id, productId, true);
    try {
      const cart = await addCartItem(selectedClient.id, productId, 1);
      setCart(selectedClient.id, cart);
      setCheckoutError(selectedClient.id, null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar item no carrinho';

      if (err instanceof ApiError && err.status === 422) {
        const refreshedCart = await getCart(selectedClient.id).catch(() => null);
        if (refreshedCart) {
          setCart(selectedClient.id, refreshedCart);
        }
      }

      toast.error(message);
    } finally {
      setCartItemLoading(selectedClient.id, productId, false);
    }
  }

  async function handleRemoveFromCart(productId: string) {
    if (!selectedClient) return;
    setCartItemLoading(selectedClient.id, productId, true);
    try {
      const cart = await removeCartItem(selectedClient.id, productId);
      setCart(selectedClient.id, cart);
      setCheckoutError(selectedClient.id, null);
    } catch {
      toast.error('Erro ao remover item do carrinho');
    } finally {
      setCartItemLoading(selectedClient.id, productId, false);
    }
  }

  async function handleClearCart() {
    if (!selectedClient) return;
    try {
      const cart = await clearCart(selectedClient.id);
      setCart(selectedClient.id, cart);
      setCheckoutError(selectedClient.id, null);
    } catch {
      toast.error('Erro ao limpar carrinho');
    }
  }

  async function handleCheckout() {
    if (!selectedClient) return;
    if (integrityIssues.length > 0) {
      const message =
        integrityIssues.length === 1
          ? `${integrityIssues[0].productName}: ${integrityIssues[0].message}`
          : 'Remova os itens indisponíveis do carrinho antes de efetivar o pedido.';
      setCheckoutError(selectedClient.id, message);
      toast.error(message);
      return;
    }

    setCheckoutPending(selectedClient.id, true);
    setCheckoutError(selectedClient.id, null);
    try {
      const result = await checkoutCart(selectedClient.id);
      const refreshedCart = await getCart(selectedClient.id);
      setCart(selectedClient.id, refreshedCart);
      const status = await getModelStatus().catch(() => null);
      if (result.expectedTrainingTriggered) {
        startAwaitingRetrain(result.orderId, status?.currentVersion ?? null);
      }
      toast.success('Checkout concluído com sucesso');
      clearRecommendations();
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao efetivar pedido';
      setCheckoutError(selectedClient.id, message);
      toast.error(message);
    } finally {
      setCheckoutPending(selectedClient.id, false);
    }
  }

  const productsById = useMemo(() => {
    return Object.fromEntries(allProducts.map((product) => [product.id, product]));
  }, [allProducts]);
  const integrityIssues = useMemo(
    () =>
      selectedClient ? collectCartIntegrityIssues(cartForClient, productsById, selectedClient.country) : [],
    [cartForClient, productsById, selectedClient]
  );

  const renderItem = useCallback(
    (product: Product) => {
      const scores = ordered && !recLoading ? scoreMap.get(product.id) : undefined;
      const isInCart = cartProductIds.has(product.id);
      const loadingKey = `${clientId}:${product.id}`;
      const cartActionAvailability = resolveCartActionAvailability(selectedClient, product);
      const cartActionDisabledReason =
        cartActionAvailability.kind === 'enabled' ? null : cartActionAvailability.message;
      return (
        <ProductCard
          product={product}
          onClick={() => handleProductClick(product)}
          scoreBadge={scores}
          isInCart={isInCart}
          isCartActionLoading={cartItemLoading[loadingKey] ?? false}
          showCartAction
          cartActionDisabledReason={cartActionDisabledReason}
          onAddToCart={() => handleAddToCart(product.id)}
          onRemoveFromCart={() => handleRemoveFromCart(product.id)}
        />
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ordered, recLoading, scoreMap, cartProductIds, cartItemLoading, selectedClient, clientId]
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

      {/* AI Sort + cart-aware coverage toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {!ordered ? (
          <span title={!selectedClient ? 'Selecione um cliente na navbar' : undefined}>
            <button
              type="button"
              data-testid="catalog-order-ai"
              aria-disabled={!selectedClient || recLoading}
              aria-pressed={false}
              aria-busy={recLoading ? 'true' : undefined}
              onClick={selectedClient && !recLoading ? handleSortByAI : undefined}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selectedClient && !recLoading
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
            data-testid="catalog-order-reset"
            aria-pressed={true}
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300 transition-colors"
          >
            ✕ Ordenação original
          </button>
        )}
      </div>

      <CoverageStatusBanner
        ordered={ordered || recLoading}
        loading={recLoading}
        coverageMeta={coverageMeta}
        visibleProductCount={displayedProducts.length}
        scoredVisibleCount={scoredVisibleCount}
        searchStateKind={searchStateKind}
        onEnableDiagnostic={coverageMode === 'full' ? enableDiagnostic : undefined}
      />

      <CartSummaryBar
        cart={cartForClient}
        productsById={productsById}
        integrityIssues={integrityIssues}
        checkoutPending={checkoutPending}
        checkoutError={checkoutError}
        onClear={handleClearCart}
        onCheckout={handleCheckout}
      />

      {searchResults !== null && (
        <p className="text-xs text-blue-600">{searchResults.length} resultado(s) para busca semântica</p>
      )}

      <ReorderableGrid
        items={displayedProducts}
        getKey={(p) => p.id}
        getScore={(p) => scoreMap.get(p.id)?.finalScore}
        renderItem={renderItem}
        ordered={ordered && !recLoading && searchResults === null}
      />

      <ProductDetailModal
        product={selectedProduct}
        scoreSummary={selectedProduct ? scoreMap.get(selectedProduct.id) : undefined}
        onClose={() => setSelectedProduct(null)}
      />
    </div>
  );
}
