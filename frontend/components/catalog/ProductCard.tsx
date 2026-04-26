'use client';

import type { Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from './CategoryIcon';
import { ScoreBadge, type ScoreBadgeProps } from './ScoreBadge';

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
  isDemo?: boolean;
  isDemoBuyLoading?: boolean;
  onDemoBuy?: () => void;
  onDemoUndo?: () => void;
  showDemoBuy?: boolean;
}

export function ProductCard({
  product,
  onClick,
  scoreBadge,
  isDemo,
  isDemoBuyLoading,
  onDemoBuy,
  onDemoUndo,
  showDemoBuy,
}: ProductCardProps) {
  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <span className="text-3xl">
            <CategoryIcon category={product.category} />
          </span>
          {scoreBadge && (
            <span className="ml-auto group">
              <ScoreBadge {...scoreBadge} />
            </span>
          )}
          {!scoreBadge && product.similarityScore !== undefined && (
            <Badge variant="info" className="ml-auto text-xs">
              {Math.round(product.similarityScore * 100)}% match
            </Badge>
          )}
          {isDemo && (
            <Badge className="ml-auto bg-yellow-100 text-yellow-800 text-xs border border-yellow-300">
              demo
            </Badge>
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
        {(showDemoBuy || isDemo) && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            {isDemo ? (
              <button
                type="button"
                onClick={onDemoUndo}
                disabled={isDemoBuyLoading}
                className={`w-full rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isDemoBuyLoading
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 opacity-60'
                    : 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                }`}
              >
                {isDemoBuyLoading ? '...' : '↩ Desfazer'}
              </button>
            ) : (
              <button
                type="button"
                onClick={onDemoBuy}
                disabled={isDemoBuyLoading}
                className={`w-full rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  isDemoBuyLoading
                    ? 'cursor-not-allowed bg-gray-100 text-gray-400 opacity-60'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                }`}
              >
                {isDemoBuyLoading ? '...' : '🛒 Demo Comprar'}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
