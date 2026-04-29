'use client';

import { cn } from '@/lib/utils';
import type { CoverageMeta, SearchStateKind } from '@/lib/showcase/ranking-window';

interface CoverageStatusBannerProps {
  ordered: boolean;
  loading: boolean;
  coverageMeta: CoverageMeta | null;
  visibleProductCount: number;
  scoredVisibleCount: number;
  searchStateKind: SearchStateKind;
  onEnableDiagnostic?: () => void;
}

export function CoverageStatusBanner({
  ordered,
  loading,
  coverageMeta,
  visibleProductCount,
  scoredVisibleCount,
  searchStateKind,
  onEnableDiagnostic,
}: CoverageStatusBannerProps) {
  if (!ordered) {
    return null;
  }

  const uncoveredVisibleCount = Math.max(visibleProductCount - scoredVisibleCount, 0);
  const showWarning = !loading && uncoveredVisibleCount > 0;
  const semanticSearchNote =
    searchStateKind === 'semantic-search'
      ? 'A busca semântica mantém sua própria ordem; a cobertura abaixo mostra apenas os scores disponíveis para estes itens.'
      : null;

  return (
    <div
      data-testid="catalog-coverage-banner"
      role="status"
      aria-live="polite"
      className={cn(
        'rounded-lg border px-4 py-3 text-sm motion-safe:transition-opacity motion-safe:duration-200',
        showWarning
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-blue-100 bg-blue-50 text-blue-900'
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium">
            {loading
              ? 'Atualizando a cobertura de score da grade atual...'
              : visibleProductCount === 0
                ? 'Nenhum produto visível para pontuar nesta janela.'
                : showWarning
                  ? `${scoredVisibleCount} de ${visibleProductCount} produtos visíveis receberam score nesta janela. ${uncoveredVisibleCount} ficaram fora da cobertura atual.`
                  : `${scoredVisibleCount} de ${visibleProductCount} produtos visíveis receberam score nesta janela.`}
          </p>
          {!loading && coverageMeta && (
            <p className="text-xs opacity-80">
              Janela atual: {coverageMeta.receivedCount}/{coverageMeta.totalCatalogItems} itens ranqueados
              {coverageMeta.mode === 'diagnostic' ? ' em modo diagnóstico' : ''}.
            </p>
          )}
          {semanticSearchNote && <p className="text-xs opacity-80">{semanticSearchNote}</p>}
        </div>

        {!loading && showWarning && coverageMeta?.mode === 'full' && onEnableDiagnostic && (
          <button
            type="button"
            data-testid="catalog-order-diagnostic"
            onClick={onEnableDiagnostic}
            className="min-h-[44px] rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Ampliar com modo diagnóstico
          </button>
        )}
      </div>
    </div>
  );
}
