'use client';

import type { Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from './CategoryIcon';
import { ScoreBadge, type ScoreBadgeProps } from './ScoreBadge';
import { EligibilityBadge } from './EligibilityBadge';
import type { EligibilityBadge as EligibilityBadgeModel } from '@/lib/catalog/eligibility';

const FLAG_EMOJI: Record<string, string> = {
  BR: '🇧🇷',
  MX: '🇲🇽',
  CO: '🇨🇴',
  NL: '🇳🇱',
  RO: '🇷🇴',
};

interface ProductCardProps {
  product: Product;
  onClick?: () => void;
  scoreBadge?: ScoreBadgeProps;
  /** M16 — when set, score badge must stay off (mutually exclusive). */
  eligibilityBadge?: EligibilityBadgeModel | null;
  /** M16 — ranking mode ineligible styling (badge area only). */
  ineligibleRanking?: boolean;
  /** Fora da janela de supressão: texto curto «última compra» (evita duplicar badge âmbar). */
  purchaseHistorySubtitle?: string | null;
  isInCart?: boolean;
  isCartActionLoading?: boolean;
  onAddToCart?: () => void;
  onRemoveFromCart?: () => void;
  showCartAction?: boolean;
  cartActionDisabledReason?: string | null;
}

export function ProductCard({
  product,
  onClick,
  scoreBadge,
  eligibilityBadge,
  ineligibleRanking,
  purchaseHistorySubtitle,
  isInCart,
  isCartActionLoading,
  onAddToCart,
  onRemoveFromCart,
  showCartAction,
  cartActionDisabledReason,
}: ProductCardProps) {
  const hasTopBadge =
    Boolean(scoreBadge) ||
    Boolean(eligibilityBadge) ||
    product.similarityScore !== undefined ||
    isInCart ||
    Boolean(purchaseHistorySubtitle);
  const disabledReasonId = cartActionDisabledReason ? `catalog-add-cart-reason-${product.id}` : undefined;
  const disabledReasonClass = cartActionDisabledReason?.includes('Indisponível')
    ? 'text-amber-700'
    : 'text-gray-500';

  return (
    <Card
      data-testid={`catalog-product-card-${product.id}`}
      data-ineligible={ineligibleRanking ? 'true' : undefined}
      aria-label={eligibilityBadge ? `${product.name} — ${eligibilityBadge.label}` : undefined}
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-start gap-2">
          <span className="text-3xl">
            <CategoryIcon category={product.category} />
          </span>
          {hasTopBadge && (
            <div
              className={`ml-auto flex flex-col items-end gap-1 ${
                ineligibleRanking && eligibilityBadge
                  ? 'motion-safe:transition-opacity motion-safe:duration-200 motion-safe:ease-out opacity-60 ring-1 ring-amber-200 rounded-md p-1'
                  : ''
              }`}
            >
              {eligibilityBadge ? (
                <EligibilityBadge badge={eligibilityBadge} />
              ) : null}
              {scoreBadge && (
                <span className="group" data-testid={`catalog-score-${product.id}`}>
                  <ScoreBadge {...scoreBadge} />
                </span>
              )}
              {!scoreBadge && product.similarityScore !== undefined && (
                <Badge variant="info" className="text-xs">
                  {Math.round(product.similarityScore * 100)}% similaridade
                </Badge>
              )}
              {isInCart && (
                <Badge className="border border-emerald-300 bg-emerald-100 text-xs text-emerald-800">
                  no carrinho
                </Badge>
              )}
              {purchaseHistorySubtitle ? (
                <span
                  className="max-w-[9rem] truncate text-right text-[10px] font-medium text-slate-500"
                  title={`Última compra: ${purchaseHistorySubtitle}`}
                >
                  ✓ {purchaseHistorySubtitle}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900">{product.name}</h3>
        <p className="mb-2 text-lg font-bold text-blue-600">
          ${product.price.toFixed(2)}
        </p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-xs">
            {product.category}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {product.supplier}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {product.countries.map((code) => (
            <span key={code} className="text-sm" title={code}>
              {FLAG_EMOJI[code] ?? code}
            </span>
          ))}
        </div>
        {(showCartAction || isInCart) && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            {isInCart ? (
              <button
                type="button"
                data-testid={`catalog-remove-cart-${product.id}`}
                onClick={onRemoveFromCart}
                disabled={isCartActionLoading}
                aria-busy={isCartActionLoading ? 'true' : undefined}
                className={`w-full rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isCartActionLoading
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 opacity-60'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {isCartActionLoading ? 'Removendo...' : 'Remover'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  data-testid={`catalog-add-cart-${product.id}`}
                  onClick={onAddToCart}
                  disabled={Boolean(cartActionDisabledReason) || isCartActionLoading}
                  aria-describedby={disabledReasonId}
                  aria-busy={isCartActionLoading ? 'true' : undefined}
                  className={`w-full rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    Boolean(cartActionDisabledReason) || isCartActionLoading
                      ? 'cursor-not-allowed bg-gray-100 text-gray-400 opacity-60'
                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                  }`}
                >
                  {isCartActionLoading ? 'Adicionando...' : 'Adicionar ao Carrinho'}
                </button>
                {cartActionDisabledReason ? (
                  <p id={disabledReasonId} className={`mt-1 text-[11px] ${disabledReasonClass}`}>
                    {cartActionDisabledReason}
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
