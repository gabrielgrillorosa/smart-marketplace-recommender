import type { StateCreator } from 'zustand';
import type { Cart } from '@/lib/types';

function loadingKey(clientId: string, productId: string): string {
  return `${clientId}:${productId}`;
}

export interface CartSlice {
  cartByClient: Record<string, Cart>;
  cartItemLoading: Record<string, boolean>;
  checkoutPendingByClient: Record<string, boolean>;
  checkoutErrorByClient: Record<string, string | null>;
  setCart: (clientId: string, cart: Cart) => void;
  setCartItemLoading: (clientId: string, productId: string, loading: boolean) => void;
  setCheckoutPending: (clientId: string, pending: boolean) => void;
  setCheckoutError: (clientId: string, error: string | null) => void;
  clearCartStateForClient: (clientId: string) => void;
}

export const createCartSlice: StateCreator<CartSlice> = (set) => ({
  cartByClient: {},
  cartItemLoading: {},
  checkoutPendingByClient: {},
  checkoutErrorByClient: {},

  setCart: (clientId, cart) =>
    set((state) => ({
      cartByClient: {
        ...state.cartByClient,
        [clientId]: cart,
      },
    })),

  setCartItemLoading: (clientId, productId, loading) =>
    set((state) => ({
      cartItemLoading: {
        ...state.cartItemLoading,
        [loadingKey(clientId, productId)]: loading,
      },
    })),

  setCheckoutPending: (clientId, pending) =>
    set((state) => ({
      checkoutPendingByClient: {
        ...state.checkoutPendingByClient,
        [clientId]: pending,
      },
    })),

  setCheckoutError: (clientId, error) =>
    set((state) => ({
      checkoutErrorByClient: {
        ...state.checkoutErrorByClient,
        [clientId]: error,
      },
    })),

  clearCartStateForClient: (clientId) =>
    set((state) => {
      const nextCartByClient = { ...state.cartByClient };
      delete nextCartByClient[clientId];

      const nextCheckoutPendingByClient = { ...state.checkoutPendingByClient };
      delete nextCheckoutPendingByClient[clientId];

      const nextCheckoutErrorByClient = { ...state.checkoutErrorByClient };
      delete nextCheckoutErrorByClient[clientId];

      const nextCartItemLoading = Object.fromEntries(
        Object.entries(state.cartItemLoading).filter(([key]) => !key.startsWith(`${clientId}:`))
      );

      return {
        cartByClient: nextCartByClient,
        checkoutPendingByClient: nextCheckoutPendingByClient,
        checkoutErrorByClient: nextCheckoutErrorByClient,
        cartItemLoading: nextCartItemLoading,
      };
    }),
});
