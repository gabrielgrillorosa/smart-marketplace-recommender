'use client';

import type { ProductDetail } from '@/lib/types';
import type { ScoreBadgeProps } from './ScoreBadge';
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
  scoreSummary?: ScoreBadgeProps;
  onClose: () => void;
}

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

export function ProductDetailModal({ product, scoreSummary, onClose }: ProductDetailModalProps) {
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
              {scoreSummary && (
                <div
                  data-testid="product-detail-score-summary"
                  className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Resumo do score atual</p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[11px] text-blue-700">Score final</p>
                      <p className="font-semibold">{formatPercent(scoreSummary.finalScore)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-700">Neural</p>
                      <p className="font-semibold">{scoreSummary.neuralScore.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-700">Semântico</p>
                      <p className="font-semibold">{scoreSummary.semanticScore.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}
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
