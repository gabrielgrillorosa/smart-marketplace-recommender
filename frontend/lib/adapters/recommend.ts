import type { RankingConfig, RecommendationResult, Product } from '@/lib/types';

interface RawRecommendItem {
  product?: {
    id?: string;
    name?: string;
    category?: string;
    supplier?: string;
    supplierName?: string;
    countries?: string[];
    availableCountries?: string[];
    country?: string;
    price?: number;
    sku?: string;
  };
  id?: string;
  name?: string;
  category?: string;
  supplier?: string;
  supplierName?: string;
  countries?: string[];
  availableCountries?: string[];
  country?: string;
  price?: number;
  sku?: string;
  finalScore?: number | null;
  score?: number;
  neuralScore?: number | null;
  semanticScore?: number | null;
  matchReason?: string | null;
  recencySimilarity?: number | null;
  rankScore?: number | null;
  hybridNeuralTerm?: number;
  hybridSemanticTerm?: number;
  recencyBoostTerm?: number;
  eligible?: boolean;
  eligibilityReason?: string;
  suppressionUntil?: string | null;
  lastPurchaseAt?: string | null;
}

interface RawRecommendResponse {
  recommendations?: RawRecommendItem[];
  products?: RawRecommendItem[];
  /** Next.js `/api/proxy/recommend` returns `adaptRecommendations` output — list is under `results`. */
  results?: RawRecommendItem[];
  isFallback?: boolean;
  fallback?: boolean;
  modelStatus?: string;
  rankingConfig?: RawRankingConfig;
}

interface RawRankingConfig {
  neuralWeight?: number;
  semanticWeight?: number;
  recencyRerankWeight?: number;
  profilePoolingMode?: string;
  profilePoolingHalfLifeDays?: number;
}

function parseRankingConfig(raw: RawRankingConfig | undefined): RankingConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const nw = raw.neuralWeight;
  const sw = raw.semanticWeight;
  const wr = raw.recencyRerankWeight;
  if (typeof nw !== 'number' || typeof sw !== 'number' || typeof wr !== 'number') return undefined;
  if (!Number.isFinite(nw) || !Number.isFinite(sw) || !Number.isFinite(wr)) return undefined;
  const cfg: RankingConfig = { neuralWeight: nw, semanticWeight: sw, recencyRerankWeight: wr };
  const mode = raw.profilePoolingMode;
  if (mode === 'mean' || mode === 'exp') cfg.profilePoolingMode = mode;
  const hl = raw.profilePoolingHalfLifeDays;
  if (typeof hl === 'number' && Number.isFinite(hl)) cfg.profilePoolingHalfLifeDays = hl;
  return cfg;
}

function toMatchReason(raw: string | null | undefined): RecommendationResult['matchReason'] {
  if (raw === 'semantic' || raw === 'neural' || raw === 'hybrid') return raw;
  return 'hybrid';
}

export function adaptRecommendations(raw: unknown): {
  results: RecommendationResult[];
  isFallback: boolean;
  rankingConfig?: RankingConfig;
} {
  let items: RawRecommendItem[];
  let isFallback = false;
  let rankingConfig: RankingConfig | undefined;

  if (Array.isArray(raw)) {
    items = raw as RawRecommendItem[];
  } else {
    const data = raw as RawRecommendResponse;
    items = data?.recommendations ?? data?.products ?? data?.results ?? [];
    isFallback = Boolean(data?.isFallback ?? data?.fallback ?? false);
    rankingConfig = parseRankingConfig(data?.rankingConfig);
  }

  const results: RecommendationResult[] = items.map((item: RawRecommendItem) => {
    const productSrc = item.product ?? item;
    const product: Product = {
      id: String(productSrc.id ?? ''),
      name: String(productSrc.name ?? ''),
      category: String(productSrc.category ?? ''),
      supplier: String(productSrc.supplierName ?? productSrc.supplier ?? ''),
      countries: Array.isArray(productSrc.availableCountries)
        ? productSrc.availableCountries
        : Array.isArray(productSrc.countries)
          ? productSrc.countries
          : productSrc.country
            ? [String(productSrc.country)]
            : [],
      price: Number(productSrc.price ?? 0),
      sku: String(productSrc.sku ?? ''),
    };

    const eligibleUnknown = item.eligible === undefined;
    const eligible = eligibleUnknown ? true : Boolean(item.eligible);

    const rawFinal = item.finalScore !== undefined && item.finalScore !== null ? item.finalScore : item.score;
    let finalScore: number | null;
    if (!eligible) {
      finalScore = null;
    } else if (rawFinal === undefined || rawFinal === null) {
      finalScore = 0;
    } else {
      finalScore = Number(rawFinal);
    }

    const neuralScore =
      item.neuralScore !== undefined && item.neuralScore !== null ? Number(item.neuralScore) : undefined;
    const semanticScore =
      item.semanticScore !== undefined && item.semanticScore !== null ? Number(item.semanticScore) : undefined;

    const recencySimilarity =
      item.recencySimilarity !== undefined && item.recencySimilarity !== null
        ? Number(item.recencySimilarity)
        : undefined;
    const rankScore =
      item.rankScore !== undefined && item.rankScore !== null ? Number(item.rankScore) : undefined;

    const hybridNeuralTerm =
      item.hybridNeuralTerm !== undefined && Number.isFinite(item.hybridNeuralTerm)
        ? Number(item.hybridNeuralTerm)
        : undefined;
    const hybridSemanticTerm =
      item.hybridSemanticTerm !== undefined && Number.isFinite(item.hybridSemanticTerm)
        ? Number(item.hybridSemanticTerm)
        : undefined;
    const recencyBoostTerm =
      item.recencyBoostTerm !== undefined && Number.isFinite(item.recencyBoostTerm)
        ? Number(item.recencyBoostTerm)
        : undefined;

    const rawLp = item.lastPurchaseAt;
    const lastPurchaseAt =
      typeof rawLp === 'string' && rawLp.length > 0 ? rawLp : null;

    return {
      product,
      finalScore,
      neuralScore,
      semanticScore,
      matchReason: toMatchReason(item.matchReason ?? undefined),
      ...(recencySimilarity !== undefined ? { recencySimilarity } : {}),
      ...(rankScore !== undefined ? { rankScore } : {}),
      ...(hybridNeuralTerm !== undefined ? { hybridNeuralTerm } : {}),
      ...(hybridSemanticTerm !== undefined ? { hybridSemanticTerm } : {}),
      ...(recencyBoostTerm !== undefined ? { recencyBoostTerm } : {}),
      eligible,
      eligibilityReason: item.eligibilityReason ?? (eligible ? 'eligible' : 'unknown'),
      suppressionUntil: item.suppressionUntil ?? null,
      lastPurchaseAt,
    };
  });

  return { results, isFallback, ...(rankingConfig ? { rankingConfig } : {}) };
}
