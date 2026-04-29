import { apiFetch } from '@/lib/fetch-wrapper';
import type { Cart, CheckoutResponse } from '@/lib/types';

export async function getCart(clientId: string): Promise<Cart> {
  return apiFetch<Cart>(`/api/proxy/carts/${clientId}`, { cache: 'no-store' });
}

export async function addCartItem(clientId: string, productId: string, quantity: number): Promise<Cart> {
  return apiFetch<Cart>(`/api/proxy/carts/${clientId}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, quantity }),
  });
}

export async function removeCartItem(clientId: string, productId: string): Promise<Cart> {
  return apiFetch<Cart>(`/api/proxy/carts/${clientId}/items/${productId}`, {
    method: 'DELETE',
  });
}

export async function clearCart(clientId: string): Promise<Cart> {
  return apiFetch<Cart>(`/api/proxy/carts/${clientId}`, { method: 'DELETE' });
}

export async function checkoutCart(clientId: string): Promise<CheckoutResponse> {
  return apiFetch<CheckoutResponse>(`/api/proxy/carts/${clientId}/checkout`, {
    method: 'POST',
    cache: 'no-store',
  });
}
