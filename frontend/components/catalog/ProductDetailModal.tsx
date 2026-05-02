'use client';

import type { ProductDetail, RankingConfig } from '@/lib/types';
import type { ProductDetailScoreSummary } from './ScoreBadge';
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
  scoreSummary?: ProductDetailScoreSummary;
  rankingConfig?: RankingConfig | null;
  eligibilityNote?: string;
  onClose: () => void;
}

function formatPercent(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function formatPts(n: number): string {
  return n.toFixed(4);
}

function hybridTerms(s: ProductDetailScoreSummary, cfg: RankingConfig | null | undefined) {
  const neural =
    s.hybridNeuralTerm ?? (cfg ? cfg.neuralWeight * s.neuralScore : undefined);
  const semantic =
    s.hybridSemanticTerm ?? (cfg ? cfg.semanticWeight * s.semanticScore : undefined);
  return { neural, semantic };
}

function recencyBoostValue(s: ProductDetailScoreSummary, cfg: RankingConfig | null | undefined): number | undefined {
  if (s.recencyBoostTerm !== undefined) return s.recencyBoostTerm;
  if (cfg && s.recencySimilarity !== undefined && s.recencySimilarity !== null) {
    return cfg.recencyRerankWeight * s.recencySimilarity;
  }
  return undefined;
}

export function ProductDetailModal({
  product,
  scoreSummary,
  rankingConfig,
  eligibilityNote,
  onClose,
}: ProductDetailModalProps) {
  const wr = rankingConfig?.recencyRerankWeight ?? 0;
  const hybrid = scoreSummary ? hybridTerms(scoreSummary, rankingConfig ?? undefined) : null;
  const boost = scoreSummary ? recencyBoostValue(scoreSummary, rankingConfig ?? undefined) : undefined;
  const rankInc =
    scoreSummary?.rankScore != null && scoreSummary.finalScore != null
      ? scoreSummary.rankScore - scoreSummary.finalScore
      : undefined;

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
              {eligibilityNote ? (
                <div
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
                  role="status"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Elegibilidade</p>
                  <p className="mt-1">{eligibilityNote}</p>
                </div>
              ) : null}
              {scoreSummary && (
                <div
                  data-testid="product-detail-score-summary"
                  className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-950"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Resumo do score atual</p>
                  <p className="mt-1 text-[11px] text-blue-800">
                    Híbrido puro: a percentagem abaixo reflecte apenas rede + semântico ponderados — não inclui o
                    boost de recência na ordenação.
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[11px] text-blue-700">Score final (híbrido)</p>
                      <p className="font-semibold">{formatPercent(scoreSummary.finalScore)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-700">Neural (bruto)</p>
                      <p className="font-semibold">{scoreSummary.neuralScore.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-700">Semântico (bruto)</p>
                      <p className="font-semibold">{scoreSummary.semanticScore.toFixed(2)}</p>
                    </div>
                  </div>

                  {!rankingConfig ? (
                    <p className="mt-2 text-xs text-amber-900">
                      Pesos runtime indisponíveis nesta versão do serviço — parcelas em pontos não puderam ser
                      confirmadas face ao backend.
                    </p>
                  ) : (
                    <p className="mt-2 text-[11px] text-blue-800">
                      Pesos efectivos: w<sub>n</sub>={rankingConfig.neuralWeight}, w<sub>s</sub>=
                      {rankingConfig.semanticWeight}, w<sub>r</sub>={rankingConfig.recencyRerankWeight}
                    </p>
                  )}

                  {hybrid && (hybrid.neural !== undefined || hybrid.semantic !== undefined) ? (
                    <div className="mt-3 grid gap-1 border-t border-blue-200 pt-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[11px] text-blue-700">Contribuição neural (pontos)</p>
                        <p className="font-mono text-xs font-semibold">
                          {hybrid.neural !== undefined ? formatPts(hybrid.neural) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-blue-700">Contribuição semântica (pontos)</p>
                        <p className="font-mono text-xs font-semibold">
                          {hybrid.semantic !== undefined ? formatPts(hybrid.semantic) : '—'}
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {rankingConfig && wr === 0 ? (
                    <p className="mt-2 text-xs text-blue-900">Recência inactiva (w_r = 0).</p>
                  ) : null}

                  {rankingConfig && wr > 0 ? (
                    <div className="mt-3 space-y-1 border-t border-blue-200 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-800">
                        Recência na ordenação
                      </p>
                      <p className="text-xs">
                        Similaridade máx. a âncoras:{' '}
                        <span className="font-mono font-semibold">
                          {scoreSummary.recencySimilarity != null
                            ? formatPts(scoreSummary.recencySimilarity)
                            : '—'}
                        </span>
                      </p>
                      <p className="text-xs">
                        Termo w<sub>r</sub>× similaridade:{' '}
                        <span className="font-mono font-semibold">
                          {boost !== undefined ? formatPts(boost) : '—'}
                        </span>
                      </p>
                      {rankInc !== undefined ? (
                        <p className="text-xs">
                          Incremento na ordenação (rankScore − score final):{' '}
                          <span className="font-mono font-semibold">{formatPts(rankInc)}</span>
                        </p>
                      ) : null}
                      {scoreSummary.rankScore != null ? (
                        <p className="text-xs">
                          <span className="font-semibold">Ordenação (rankScore)</span>:{' '}
                          <span className="font-mono font-semibold">{formatPts(scoreSummary.rankScore)}</span>
                          <span className="text-[11px] text-blue-800"> — chave usada na grelha em modo ranking</span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
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
