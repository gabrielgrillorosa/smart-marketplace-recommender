'use client';

import { useEffect, useState } from 'react';
import { getClientDetail, getClientOrders } from '@/lib/adapters/clients';
import type {
  Client,
  ClientDetailResponse,
  ClientProfileViewModel,
  OrderHistoryResponse,
  ProductSummary,
} from '@/lib/types';

const RECENT_PRODUCTS_LIMIT = 5;
const ORDERS_PAGE_SIZE = 10;

const DETAIL_FAILURE_WARNING = 'Não foi possível carregar o resumo de compras.';
const ORDERS_FAILURE_WARNING = 'Não foi possível carregar o histórico de pedidos.';

function buildIdleViewModel(baseClient: Client): ClientProfileViewModel {
  return {
    status: 'loading',
    baseClient,
    totalOrders: null,
    totalSpent: null,
    lastOrderAt: null,
    recentProducts: [],
    warnings: [],
  };
}

function deriveRecentProducts(orders: OrderHistoryResponse): ProductSummary[] {
  const seen = new Set<string>();
  const result: ProductSummary[] = [];
  for (const order of orders.items) {
    for (const item of order.items) {
      if (seen.has(item.productId)) continue;
      seen.add(item.productId);
      result.push({ id: item.productId, name: item.productName });
      if (result.length >= RECENT_PRODUCTS_LIMIT) return result;
    }
  }
  return result;
}

function composeViewModel(
  baseClient: Client,
  detail: PromiseSettledResult<ClientDetailResponse>,
  orders: PromiseSettledResult<OrderHistoryResponse>
): ClientProfileViewModel {
  const detailOk = detail.status === 'fulfilled';
  const ordersOk = orders.status === 'fulfilled';

  if (!detailOk && !ordersOk) {
    return {
      status: 'unavailable',
      baseClient,
      totalOrders: null,
      totalSpent: null,
      lastOrderAt: null,
      recentProducts: [],
      warnings: [DETAIL_FAILURE_WARNING, ORDERS_FAILURE_WARNING],
    };
  }

  const summary = detailOk ? detail.value.purchaseSummary : null;
  const recentProducts = ordersOk ? deriveRecentProducts(orders.value) : [];
  const warnings: string[] = [];
  if (!detailOk) warnings.push(DETAIL_FAILURE_WARNING);
  if (!ordersOk) warnings.push(ORDERS_FAILURE_WARNING);

  let status: ClientProfileViewModel['status'];
  if (!detailOk || !ordersOk) {
    status = 'partial';
  } else if ((summary?.totalOrders ?? 0) === 0 && recentProducts.length === 0) {
    status = 'empty';
  } else {
    status = 'ready';
  }

  return {
    status,
    baseClient,
    totalOrders: detailOk ? summary?.totalOrders ?? 0 : null,
    totalSpent: detailOk ? summary?.totalSpent ?? 0 : null,
    lastOrderAt: detailOk ? summary?.lastOrderAt ?? null : null,
    recentProducts,
    warnings,
  };
}

export function useSelectedClientProfile(
  selectedClient: Client | null
): ClientProfileViewModel | null {
  const [viewModel, setViewModel] = useState<ClientProfileViewModel | null>(
    selectedClient ? buildIdleViewModel(selectedClient) : null
  );

  useEffect(() => {
    if (!selectedClient) {
      setViewModel(null);
      return;
    }

    setViewModel(buildIdleViewModel(selectedClient));

    let cancelled = false;
    const controller = new AbortController();
    Promise.allSettled([
      getClientDetail(selectedClient.id, controller.signal),
      getClientOrders(selectedClient.id, ORDERS_PAGE_SIZE, controller.signal),
    ]).then(([detail, orders]) => {
      if (cancelled) return;
      setViewModel(composeViewModel(selectedClient, detail, orders));
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [selectedClient]);

  return viewModel;
}
