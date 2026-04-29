import { apiFetch } from '@/lib/fetch-wrapper';
import type { ClientDetailResponse, OrderHistoryResponse } from '@/lib/types';

export async function getClientDetail(
  clientId: string,
  signal?: AbortSignal
): Promise<ClientDetailResponse> {
  return apiFetch<ClientDetailResponse>(
    `/backend/api/v1/clients/${clientId}`,
    { cache: 'no-store' },
    signal
  );
}

export async function getClientOrders(
  clientId: string,
  size: number = 10,
  signal?: AbortSignal
): Promise<OrderHistoryResponse> {
  return apiFetch<OrderHistoryResponse>(
    `/backend/api/v1/clients/${clientId}/orders?size=${size}`,
    { cache: 'no-store' },
    signal
  );
}
