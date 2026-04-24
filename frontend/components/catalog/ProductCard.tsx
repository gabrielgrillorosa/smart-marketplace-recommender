'use client';

import type { Product } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from './CategoryIcon';

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
}

export function ProductCard({ product, onClick }: ProductCardProps) {
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
          {product.similarityScore !== undefined && (
            <Badge variant="info" className="ml-auto text-xs">
              {Math.round(product.similarityScore * 100)}% match
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
      </CardContent>
    </Card>
  );
}
