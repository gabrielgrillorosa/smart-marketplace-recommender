'use client';

import { useMemo, useState } from 'react';
import type { Cart, Product } from '@/lib/types';
import type { CartIntegrityIssue } from '@/lib/cart-integrity';
import { cn } from '@/lib/utils';

interface CartSummaryBarProps {
  cart: Cart | null;
  productsById: Record<string, Product>;
  integrityIssues: CartIntegrityIssue[];
  checkoutPending: boolean;
  checkoutError: string | null;
  onClear: () => void;
  onCheckout: () => void;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function CartSummaryBar({
  cart,
  productsById,
  integrityIssues,
  checkoutPending,
  checkoutError,
  onClear,
  onCheckout,
}: CartSummaryBarProps) {
  const [mobileReviewOpen, setMobileReviewOpen] = useState(false);

  const items = cart?.items;
  const itemCount = cart?.itemCount ?? 0;
  const isEmpty = itemCount === 0;
  const hasIntegrityIssues = integrityIssues.length > 0;
  const checkoutDisabled = isEmpty || checkoutPending || hasIntegrityIssues;

  const estimatedTotal = useMemo(
    () =>
      (items ?? []).reduce((sum, item) => {
        const product = productsById[item.productId];
        if (!product) return sum;
        return sum + product.price * item.quantity;
      }, 0),
    [items, productsById]
  );

  const reviewSheetId = 'cart-review-sheet';

  const itemChips = (
    <div className="flex flex-wrap gap-2">
      {(items ?? []).map((item) => (
        <span
          key={item.productId}
          className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"
        >
          {(productsById[item.productId]?.name ?? item.productId)} x{item.quantity}
        </span>
      ))}
    </div>
  );

  function renderIntegritySummary(testId: string) {
    if (!hasIntegrityIssues) {
      return null;
    }

    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
        data-testid={testId}
        role="status"
      >
        <p className="font-medium">Revise o carrinho antes de efetivar o pedido:</p>
        <ul className="mt-2 space-y-1">
          {integrityIssues.map((issue) => (
            <li key={issue.productId}>
              <span className="font-medium">{issue.productName}:</span> {issue.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <div
          className={cn(
            'sticky top-2 z-20 rounded-lg border bg-white p-3 shadow-sm',
            'motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out'
          )}
          data-testid="cart-summary-desktop"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Carrinho</p>
              <p className="text-xs text-gray-500">
                {isEmpty
                  ? 'Carrinho vazio'
                  : `${itemCount} item(ns) • Total estimado ${formatCurrency(estimatedTotal)}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                data-testid="cart-clear"
                onClick={onClear}
                disabled={isEmpty || checkoutPending}
                className={cn(
                  'min-h-[44px] rounded-md px-3 text-sm font-medium',
                  isEmpty || checkoutPending
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                )}
              >
                Esvaziar Carrinho
              </button>
              <button
                type="button"
                data-testid="cart-checkout"
                onClick={onCheckout}
                disabled={checkoutDisabled}
                aria-busy={checkoutPending ? 'true' : undefined}
                className={cn(
                  'min-h-[44px] rounded-md px-3 text-sm font-medium text-white',
                  checkoutDisabled
                    ? 'cursor-not-allowed bg-blue-300'
                    : 'bg-blue-600 hover:bg-blue-700'
                )}
              >
                {checkoutPending ? 'Efetivando...' : 'Efetivar pedido'}
              </button>
            </div>
          </div>
          {hasIntegrityIssues ? <div className="mt-3">{renderIntegritySummary('cart-integrity-issues')}</div> : null}
          {!isEmpty && <div className="mt-3">{itemChips}</div>}
          {checkoutError && (
            <p className="mt-2 text-xs text-red-600" data-testid="cart-checkout-error">{checkoutError}</p>
          )}
        </div>
      </div>

      <div className="md:hidden">
        <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="cart-review-toggle"
              aria-expanded={mobileReviewOpen}
              aria-controls={reviewSheetId}
              onClick={() => setMobileReviewOpen((value) => !value)}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700"
            >
              Revisar ({itemCount})
            </button>
            <button
              type="button"
              data-testid="cart-clear-mobile"
              onClick={onClear}
              disabled={isEmpty || checkoutPending}
              className={cn(
                'min-h-[44px] rounded-md px-3 text-sm font-medium',
                isEmpty || checkoutPending
                  ? 'cursor-not-allowed bg-gray-100 text-gray-400'
                  : 'bg-gray-200 text-gray-700'
              )}
            >
                Esvaziar Carrinho
            </button>
            <button
              type="button"
              data-testid="cart-checkout-mobile"
              onClick={onCheckout}
              disabled={checkoutDisabled}
              aria-busy={checkoutPending ? 'true' : undefined}
              className={cn(
                'ml-auto min-h-[44px] rounded-md px-3 text-sm font-medium text-white',
                checkoutDisabled
                  ? 'cursor-not-allowed bg-blue-300'
                  : 'bg-blue-600'
              )}
            >
                {checkoutPending ? 'Efetivando...' : 'Efetivar'}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {isEmpty ? 'Carrinho vazio' : `Total estimado ${formatCurrency(estimatedTotal)}`}
          </p>
          {hasIntegrityIssues ? (
            <div className="mt-2">{renderIntegritySummary('cart-integrity-issues-mobile')}</div>
          ) : null}
          {checkoutError && (
            <p className="mt-1 text-xs text-red-600" data-testid="cart-checkout-error-mobile">{checkoutError}</p>
          )}
        </div>

        <div
          id={reviewSheetId}
          className={cn(
            'fixed inset-x-0 bottom-[88px] z-20 max-h-56 overflow-auto border-t bg-white p-3 shadow-lg',
            mobileReviewOpen ? 'block' : 'hidden',
            'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out'
          )}
        >
          <p className="mb-2 text-xs font-semibold text-gray-700">Itens do carrinho</p>
          {isEmpty ? <p className="text-xs text-gray-500">Nenhum item no carrinho.</p> : itemChips}
        </div>
      </div>
    </>
  );
}
