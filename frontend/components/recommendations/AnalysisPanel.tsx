'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useModelStatus } from '@/lib/hooks/useModelStatus';
import { useSelectedClientProfile } from '@/lib/hooks/useSelectedClientProfile';
import { useAppStore } from '@/store';
import { ClientProfileCard } from '@/components/client/ClientProfileCard';
import { TrainingMetricsSummary } from '@/components/retrain/TrainingMetricsSummary';
import {
  ManualRetrainStatusSlot,
  type ManualRetrainBanner,
} from '@/components/retrain/ManualRetrainStatusSlot';
import { RecommendationColumn } from '@/components/analysis/RecommendationColumn';
import { seededShuffle } from '@/lib/utils/shuffle';
import { cn } from '@/lib/utils';
import type { RecommendationResult } from '@/lib/types';
import {
  DEFAULT_FULL_COVERAGE_CAP,
  hasSameRankingWindow,
  resolveShowcaseRankingWindow,
} from '@/lib/showcase/ranking-window';
import { buildRecommendationDeltaMap } from '@/lib/showcase/deltas';

async function fetchRecs(clientId: string, limit: number): Promise<RecommendationResult[]> {
  const res = await fetch('/api/proxy/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, limit }),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  // The proxy already runs adaptRecommendations and returns { results, isFallback }
  const data = await res.json() as { results?: RecommendationResult[] };
  return Array.isArray(data?.results) ? data.results : [];
}

async function fetchCartAwareRecs(
  clientId: string,
  productIds: string[],
  limit: number
): Promise<RecommendationResult[]> {
  const res = await fetch('/api/proxy/recommend/from-cart', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, productIds, limit }),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const data = await res.json() as { results?: RecommendationResult[] };
  return Array.isArray(data?.results) ? data.results : [];
}

export function AnalysisPanel() {
  const { selectedClient } = useSelectedClient();

  const analysis = useAppStore((s) => s.analysis);
  const cartSnapshotStale = useAppStore((s) => s.cartSnapshotStale);
  const captureInitial = useAppStore((s) => s.captureInitial);
  const captureCartAware = useAppStore((s) => s.captureCartAware);
  const clearCartAware = useAppStore((s) => s.clearCartAware);
  const clearCartSnapshotStale = useAppStore((s) => s.clearCartSnapshotStale);
  const captureRetrained = useAppStore((s) => s.captureRetrained);
  const applyPostRetrainToInitial = useAppStore((s) => s.applyPostRetrainToInitial);
  const resetAnalysis = useAppStore((s) => s.resetAnalysis);
  const resetAnalysisSnapshots = useAppStore((s) => s.resetAnalysisSnapshots);
  const cartByClient = useAppStore((s) => s.cartByClient);
  const coverageMode = useAppStore((s) => s.coverageMode);
  const catalogCoverageMeta = useAppStore((s) => s.coverageMeta);
  const modelStatus = useModelStatus();
  const selectedClientProfile = useSelectedClientProfile(selectedClient);

  const [retrainBanner, setRetrainBanner] = useState<ManualRetrainBanner | null>(null);
  const prevPanelStateRef = useRef(modelStatus.panelState);

  useEffect(() => {
    const p = modelStatus.panelState;
    const prev = prevPanelStateRef.current;
    const ms = modelStatus.modelStatus;

    if (p === 'training') {
      setRetrainBanner(null);
    }

    if (prev === 'training' && p === 'promoted' && ms) {
      const name = (ms.currentModel ?? ms.currentVersion ?? '').trim() || '—';
      setRetrainBanner({
        kind: 'success',
        message: `Modelo treinado com sucesso. Novo modelo activo: ${name}.`,
      });
    } else if (prev === 'training' && p === 'rejected' && ms) {
      const kept =
        (ms.currentVersion ?? ms.currentModel ?? ms.lastDecision?.currentVersion ?? '').trim() ||
        'versão anterior';
      setRetrainBanner({
        kind: 'error',
        message: `Treino não promovido. Mantém-se o modelo: ${kept}.`,
      });
    } else if (prev === 'training' && p === 'failed' && ms) {
      const kept =
        (ms.currentVersion ?? ms.currentModel ?? ms.lastDecision?.currentVersion ?? '').trim() ||
        'versão anterior';
      setRetrainBanner({
        kind: 'error',
        message: `Treino falhou. Mantém-se o modelo: ${kept}.`,
      });
    } else if (prev === 'training' && p === 'unknown') {
      setRetrainBanner({
        kind: 'warning',
        message:
          'Resultado do treino ainda sem confirmação. Verifique as métricas ou actualize o estado.',
      });
    }

    prevPanelStateRef.current = p;
  }, [modelStatus.modelStatus, modelStatus.panelState]);

  useEffect(() => {
    if (!retrainBanner) return undefined;
    const id = window.setTimeout(() => setRetrainBanner(null), 14000);
    return () => window.clearTimeout(id);
  }, [retrainBanner]);

  const showRetrainProgress =
    modelStatus.panelState === 'training' || modelStatus.loading;

  const [noAiRecs, setNoAiRecs] = useState<RecommendationResult[] | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [cartLoading, setCartLoading] = useState(false);
  const [postCheckoutLoading, setPostCheckoutLoading] = useState(false);

  const prevCartKeyRef = useRef<string>('');
  const lastCapturedVersionRef = useRef<string | null>(null);
  const analysisCatalogSize = catalogCoverageMeta?.totalCatalogItems ?? DEFAULT_FULL_COVERAGE_CAP;
  const analysisWindow = useMemo(
    () => resolveShowcaseRankingWindow({ totalCatalogItems: analysisCatalogSize, mode: coverageMode }),
    [analysisCatalogSize, coverageMode]
  );

  useEffect(() => {
    prevCartKeyRef.current = '';
    lastCapturedVersionRef.current = null;
    setNoAiRecs(null);
  }, [selectedClient?.id]);

  const cartProductIds = useMemo(() => {
    if (!selectedClient) return [];
    return (cartByClient[selectedClient.id]?.items ?? []).map((item) => item.productId);
  }, [cartByClient, selectedClient]);

  useEffect(() => {
    if (!selectedClient) return;
    if (analysis.phase === 'empty' || analysis.clientId !== selectedClient.id) return;
    if (hasSameRankingWindow(analysis.initial.window, analysisWindow)) return;

    prevCartKeyRef.current = '';
    lastCapturedVersionRef.current = null;
    setNoAiRecs(null);
    // Reset only the snapshots (keep `awaitingRetrainSince` and
    // `lastObservedVersion` intact) so a post-checkout retrain in flight is
    // still detected correctly when the ranking window changes mid-flow.
    resetAnalysisSnapshots();
  }, [analysis, analysisWindow, resetAnalysisSnapshots, selectedClient]);

  // Phase 1: baseline snapshots (`Sem IA` + `Com IA`)
  useEffect(() => {
    if (!selectedClient) return;
    if (
      analysis.phase !== 'empty' &&
      analysis.clientId === selectedClient.id &&
      hasSameRankingWindow(analysis.initial.window, analysisWindow)
    ) {
      setNoAiRecs(seededShuffle(analysis.initial.recommendations, selectedClient.id));
      return;
    }
    if (analysis.phase !== 'empty' && analysis.clientId === selectedClient.id) return;

    let cancelled = false;
    setInitialLoading(true);

    fetchRecs(selectedClient.id, analysisWindow.requestedLimit)
      .then((recs) => {
        if (cancelled) return;
        setNoAiRecs(seededShuffle(recs, selectedClient.id));
        captureInitial(selectedClient.id, recs, analysisWindow);
      })
      .catch(() => {})
      // Always clear the loading flag, even when the effect was cancelled by a
      // re-run (e.g. captureInitial mutates `analysis` which is a dependency).
      // Otherwise the column stays in skeleton state forever.
      .finally(() => { setInitialLoading(false); });

    return () => { cancelled = true; };
  }, [analysis, analysisWindow, captureInitial, selectedClient]);

  // Phase 2: cart-aware snapshot (`Com Carrinho`)
  useEffect(() => {
    if (!selectedClient) return;
    if (analysis.phase === 'empty' || analysis.clientId !== selectedClient.id) return;

    const key = cartProductIds.join(',');
    if (key === prevCartKeyRef.current) return;
    prevCartKeyRef.current = key;

    if (cartProductIds.length === 0) {
      // After checkout the UI cart is empty but we must keep the slice cart
      // snapshot for a história do showcase; checkout marca stale primeiro.
      if (analysis.phase !== 'postCheckout' && !cartSnapshotStale) {
        clearCartAware(selectedClient.id);
      }
      // Cart is empty: ensure no stale loading flag from a previous cart-aware fetch
      // keeps the skeletons visible. When checkout consumed the cart, keep the
      // last `Com Carrinho` snapshot on screen as stale comparison data.
      setCartLoading(false);
      return;
    }

    let cancelled = false;
    if (cartSnapshotStale) {
      clearCartSnapshotStale(selectedClient.id);
    }
    setCartLoading(true);
    fetchCartAwareRecs(selectedClient.id, cartProductIds, analysisWindow.requestedLimit)
      .then((recs) => {
        if (cancelled) return;
        captureCartAware(selectedClient.id, recs, analysisWindow);
      })
      .catch(() => {})
      // Always clear the loading flag, even when the effect is cancelled by a
      // subsequent cart change. Otherwise the column gets stuck on skeletons
      // after the user clears the cart.
      .finally(() => {
        setCartLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    analysis,
    analysisWindow,
    captureCartAware,
    cartProductIds,
    cartSnapshotStale,
    clearCartAware,
    clearCartSnapshotStale,
    selectedClient,
  ]);

  // Phase 3: capture «Pós retreino» quando o modelo promovido é detectado no estado do serviço.
  useEffect(() => {
    if (!selectedClient) return;
    if (modelStatus.panelState !== 'promoted') return;
    const currentVersion = modelStatus.modelStatus?.currentVersion ?? null;
    if (!currentVersion || currentVersion === lastCapturedVersionRef.current) return;

    lastCapturedVersionRef.current = currentVersion;
    setPostCheckoutLoading(true);

    fetchRecs(selectedClient.id, analysisWindow.requestedLimit)
      .then((recs) => {
        // Capture the snapshot even if the effect was cancelled by a subsequent
        // model-status update (e.g. a follow-up retrain that was rejected). The
        // user already saw a promotion happen and we want the matching column
        // populated so the showcase reflects what was observed.
        captureRetrained(selectedClient.id, recs, analysisWindow);
      })
      .catch(() => {})
      // Always clear the loading flag, even when the effect was cancelled.
      .finally(() => {
        setPostCheckoutLoading(false);
      });
  }, [analysisWindow, captureRetrained, modelStatus.modelStatus?.currentVersion, modelStatus.panelState, selectedClient]);

  // Derive snapshot data for each column
  const initialSnapshot = analysis.phase !== 'empty' ? analysis.initial : null;
  const cartSnapshot =
    analysis.phase === 'cart' ? analysis.cart : analysis.phase === 'postCheckout' ? analysis.cart : null;
  const postCheckoutSnapshot = analysis.phase === 'postCheckout' ? analysis.postCheckout : null;

  const initialRecs = initialSnapshot?.recommendations ?? null;
  const initialCapturedAt = initialSnapshot?.capturedAt;
  const cartRecs = cartSnapshot?.recommendations ?? null;
  const cartCapturedAt = cartSnapshot?.capturedAt;
  const cartIsStale = cartSnapshotStale && cartSnapshot !== null && cartProductIds.length === 0;
  const postCheckoutRecs = postCheckoutSnapshot?.recommendations ?? null;
  const postCheckoutCapturedAt = postCheckoutSnapshot?.capturedAt;
  const postCheckoutEmptyMessage =
    'Ainda sem ranking pós-retreino. Quando o treino completar com sucesso, as recomendações aparecem aqui.';

  const cartDeltaByProductId = useMemo(
    () => buildRecommendationDeltaMap(initialSnapshot, cartSnapshot),
    [cartSnapshot, initialSnapshot]
  );
  /** Pós retreino vs Com IA antigo: `initial` é congelado até «Fixa novos Scores» (mesmo snapshot da coluna azul antes do retreino). */
  const postCheckoutDeltaByProductId = useMemo(
    () => buildRecommendationDeltaMap(initialSnapshot, postCheckoutSnapshot),
    [initialSnapshot, postCheckoutSnapshot]
  );
  const postCheckoutDeltaEmptyDegraded = useMemo((): 'no_baseline' | 'window_mismatch' | undefined => {
    if (analysis.phase !== 'postCheckout') return undefined;
    if (!postCheckoutRecs?.length) return undefined;
    if (Object.keys(postCheckoutDeltaByProductId).length > 0) return undefined;
    if (!initialSnapshot && postCheckoutSnapshot) return 'no_baseline';
    if (
      initialSnapshot &&
      postCheckoutSnapshot &&
      !hasSameRankingWindow(initialSnapshot.window, postCheckoutSnapshot.window)
    ) {
      return 'window_mismatch';
    }
    return undefined;
  }, [
    analysis.phase,
    initialSnapshot,
    postCheckoutDeltaByProductId,
    postCheckoutRecs?.length,
    postCheckoutSnapshot,
  ]);
  const cartBadge = cartIsStale ? (
    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
      stale
    </span>
  ) : null;

  const clientSection = selectedClient ? (
    selectedClientProfile ? <ClientProfileCard profile={selectedClientProfile} /> : null
  ) : (
    <div className="rounded-lg border border-dashed border-gray-300 py-8 text-center text-gray-400">
      <p className="text-3xl mb-2">👤</p>
      <p className="text-sm">Selecione um cliente na navbar para começar</p>
    </div>
  );

  const columns = (
    <>
      <RecommendationColumn
        title="Sem IA"
        columnTestId="analysis-column-no-ai"
        colorScheme="gray"
        recommendations={noAiRecs}
        loading={initialLoading}
        emptyMessage="Selecione um cliente na navbar"
        hideScore
      />
      <RecommendationColumn
        title="Com IA"
        columnTestId="analysis-column-initial"
        colorScheme="blue"
        recommendations={initialRecs}
        capturedAt={initialCapturedAt}
        loading={initialLoading}
        emptyMessage="Selecione um cliente na navbar"
      />
      <RecommendationColumn
        title="Com Carrinho"
        columnTestId="analysis-column-cart"
        colorScheme="emerald"
        badge={cartBadge}
        recommendations={cartRecs}
        capturedAt={cartCapturedAt}
        loading={cartLoading}
        emptyMessage="Adicione itens ao carrinho no catálogo"
        stale={cartIsStale}
        deltaByProductId={cartDeltaByProductId}
      />
      <div id="pos-retreino">
        <RecommendationColumn
          title="Pós retreino"
          columnTestId="analysis-column-post-checkout"
          colorScheme="violet"
          recommendations={postCheckoutRecs}
          capturedAt={postCheckoutCapturedAt}
          loading={postCheckoutLoading}
          emptyMessage={postCheckoutEmptyMessage}
          deltaByProductId={postCheckoutDeltaByProductId}
          deltaEmptyDegraded={postCheckoutDeltaEmptyDegraded}
        />
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {clientSection}
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between lg:gap-4">
                <p className="max-w-xl text-xs text-gray-600 lg:pt-2">
                  Retreino manual com os dados já sincronizados (não depende só do checkout).
                </p>
                <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-end lg:max-w-[720px] lg:flex-1">
                  <ManualRetrainStatusSlot showProgress={showRetrainProgress} banner={retrainBanner} />
                  <button
                    type="button"
                    data-testid="model-status-manual-retrain"
                    onClick={() => void modelStatus.startManualRetrain()}
                    disabled={modelStatus.loading}
                    className={cn(
                      'min-h-[44px] shrink-0 rounded-md px-3 text-sm font-medium sm:self-start',
                      modelStatus.loading
                        ? 'cursor-not-allowed bg-gray-200 text-gray-500'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    )}
                  >
                    {modelStatus.loading ? 'A executar retreino…' : 'Executar retreino manual'}
                  </button>
                </div>
              </div>

              <div className="mt-2 border-t border-gray-100 pt-10">
                <TrainingMetricsSummary status={modelStatus.modelStatus} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">📊 Showcase de aprendizagem com carrinho</h2>
            <p className="mt-1 text-xs text-gray-500">
              Quatro colunas: baseline → recomendação IA → carrinho → após retreino. Use{' '}
              <strong className="font-medium text-gray-600">Fixa novos Scores</strong> para promover o ranking pós-retreino
              ao novo «Com IA», ou <strong className="font-medium text-gray-600">Limpar showcase</strong> para recomeçar.
            </p>
          </div>
          {analysis.phase !== 'empty' ? (
            <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
              {analysis.phase === 'postCheckout' && postCheckoutRecs && postCheckoutRecs.length > 0 ? (
                <button
                  type="button"
                  data-testid="showcase-apply-post-retrain"
                  title="Torna o ranking pós-retreino o novo baseline em Com IA"
                  onClick={() => {
                    if (analysis.phase === 'postCheckout') {
                      applyPostRetrainToInitial(analysis.clientId);
                    }
                  }}
                  className="rounded-md border border-violet-300 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-800 shadow-sm transition-colors hover:bg-violet-100"
                >
                  Fixa novos Scores
                </button>
              ) : null}
              <button
                type="button"
                data-testid="showcase-reset-analysis"
                onClick={resetAnalysis}
                className="text-xs text-gray-400 transition-colors hover:text-red-500"
                title="Zerar fases e snapshots do showcase"
              >
                ↺ Limpar showcase
              </button>
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-3">{columns}</div>
      </div>
    </div>
  );
}
