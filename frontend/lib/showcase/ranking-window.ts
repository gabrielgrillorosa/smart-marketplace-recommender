export type CoverageMode = 'full' | 'diagnostic';

export type SearchStateKind = 'filtered-catalog' | 'semantic-search';

export interface RankingWindow {
  requestedLimit: number;
  totalCatalogItems: number;
  mode: CoverageMode;
  truncated: boolean;
}

export interface CoverageMeta extends RankingWindow {
  receivedCount: number;
  requestKey: string;
}

export const DEFAULT_FULL_COVERAGE_CAP = 100;

function normalizeCatalogSize(totalCatalogItems: number): number {
  if (!Number.isFinite(totalCatalogItems) || totalCatalogItems <= 0) {
    return 0;
  }

  return Math.floor(totalCatalogItems);
}

export function resolveShowcaseRankingWindow({
  totalCatalogItems,
  mode,
}: {
  totalCatalogItems: number;
  mode: CoverageMode;
}): RankingWindow {
  const normalizedCatalogSize = normalizeCatalogSize(totalCatalogItems);
  const requestedLimit =
    mode === 'diagnostic'
      ? normalizedCatalogSize
      : Math.min(normalizedCatalogSize, DEFAULT_FULL_COVERAGE_CAP);

  return {
    requestedLimit,
    totalCatalogItems: normalizedCatalogSize,
    mode,
    truncated: requestedLimit < normalizedCatalogSize,
  };
}

export function buildShowcaseRequestKey({
  clientId,
  window,
  searchStateKind,
}: {
  clientId: string;
  window: RankingWindow;
  searchStateKind: SearchStateKind;
}): string {
  return [clientId, window.mode, String(window.totalCatalogItems), searchStateKind].join(':');
}

export function buildCoverageMeta({
  window,
  requestKey,
  receivedCount,
}: {
  window: RankingWindow;
  requestKey: string;
  receivedCount: number;
}): CoverageMeta {
  return {
    ...window,
    requestKey,
    receivedCount,
    truncated: window.truncated || receivedCount < Math.min(window.requestedLimit, window.totalCatalogItems),
  };
}

export function hasSameRankingWindow(
  left: RankingWindow | null | undefined,
  right: RankingWindow | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.requestedLimit === right.requestedLimit &&
    left.totalCatalogItems === right.totalCatalogItems &&
    left.mode === right.mode &&
    left.truncated === right.truncated
  );
}
