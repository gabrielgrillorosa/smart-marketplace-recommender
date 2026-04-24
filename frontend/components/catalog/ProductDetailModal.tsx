'use client';

import type { ProductDetail } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { CategoryIcon } from './CategoryIcon';

const FLAG_EMOJI: Record<string, string> = {
  BR: '🇧🇷',
  MX: '🇲🇽',
  CO: '🇨🇴',
  NL: '🇳🇱',
  RO: '🇷🇴',
};

interface ProductDetailModalProps {
  product: ProductDetail | null;
  onClose: () => void;
}

export function ProductDetailModal({ product, onClose }: ProductDetailModalProps) {
  return (
    <Dialog open={product !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CategoryIcon category={product.category} />
                {product.name}
              </DialogTitle>
              <DialogDescription>SKU: {product.sku}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-700">{product.description}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">{product.category}</Badge>
                <Badge variant="outline">{product.supplier}</Badge>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-gray-500">Países disponíveis</p>
                <div className="flex gap-1">
                  {product.countries.map((code) => (
                    <span key={code} className="text-lg" title={code}>
                      {FLAG_EMOJI[code] ?? code}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-2xl font-bold text-blue-600">${product.price.toFixed(2)}</p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
