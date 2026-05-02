'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useModelStatus } from '@/lib/hooks/useModelStatus';
import { useSelectedClientProfile } from '@/lib/hooks/useSelectedClientProfile';
import { useAppStore } from '@/store';
import { ClientProfileCard } from '@/components/client/ClientProfileCard';
import { ModelStatusPanel } from '@/components/retrain/ModelStatusPanel';
import { RecommendationColumn } from '@/components/analysis/RecommendationColumn';
import { PostCheckoutOutcomeNotice } from '@/components/analysis/PostCheckoutOutcomeNotice';
import { seededShuffle } from '@/lib/utils/shuffle';
import type { RecommendationResult } from '@/lib/types';
import {
  DEFAULT_FULL_COVERAGE_CAP,
  hasSameRankingWindow,
  resolveShowcaseRankingWindow,
} from '@/lib/showcase/ranking-window';
import { buildRecommendationDeltaMap } from '@/lib/showcase/deltas';
import { buildPostCheckoutOutcome } from '@/lib/showcase/post-checkout-outcome';

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
  const resetAnalysis = useAppStore((s) => s.resetAnalysis);
  const resetAnalysisSnapshots = useAppStore((s) => s.resetAnalysisSnapshots);
  const cartByClient = useAppStore((s) => s.cartByClient);
  const coverageMode = useAppStore((s) => s.coverageMode);
  const catalogCoverageMeta = useAppStore((s) => s.coverageMeta);
  const modelStatus = useModelStatus();
  const selectedClientProfile = useSelectedClientProfile(selectedClient);

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
      // snapshot for Pos-Efetivar deltas (M19 / Node B). Checkout marks stale first.
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

  // Phase 3: post-checkout capture (`Pos-Efetivar`) when model promotion is detected.
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
  const postCheckoutOutcome = useMemo(
    () =>
      buildPostCheckoutOutcome(
        modelStatus.panelState,
        modelStatus.modelStatus,
        postCheckoutSnapshot !== null
      ),
    [modelStatus.modelStatus, modelStatus.panelState, postCheckoutSnapshot]
  );
  const postCheckoutEmptyMessage = postCheckoutOutcome
    ? postCheckoutOutcome.kind === 'rejected'
      ? 'Sem novo ranking visível: o modelo atual foi mantido.'
      : postCheckoutOutcome.kind === 'failed'
        ? 'Sem novo snapshot: o retreinamento pós-checkout não concluiu.'
        : 'Aguardando confirmação do resultado pós-checkout.'
    : 'Efetive o checkout para capturar recomendações atualizadas';

  const cartDeltaByProductId = useMemo(
    () => buildRecommendationDeltaMap(initialSnapshot, cartSnapshot),
    [cartSnapshot, initialSnapshot]
  );
  const postCheckoutDeltaByProductId = useMemo(
    () => buildRecommendationDeltaMap(cartSnapshot, postCheckoutSnapshot),
    [cartSnapshot, postCheckoutSnapshot]
  );
  const postCheckoutDeltaEmptyDegraded = useMemo((): 'no_baseline' | 'window_mismatch' | undefined => {
    if (analysis.phase !== 'postCheckout') return undefined;
    if (!postCheckoutRecs?.length) return undefined;
    if (Object.keys(postCheckoutDeltaByProductId).length > 0) return undefined;
    if (!cartSnapshot && postCheckoutSnapshot) return 'no_baseline';
    if (
      cartSnapshot &&
      postCheckoutSnapshot &&
      !hasSameRankingWindow(cartSnapshot.window, postCheckoutSnapshot.window)
    ) {
      return 'window_mismatch';
    }
    return undefined;
  }, [
    analysis.phase,
    cartSnapshot,
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
      <div id="pos-efetivar">
        {postCheckoutOutcome ? (
          <div className="mb-3">
            <PostCheckoutOutcomeNotice
              outcome={postCheckoutOutcome}
              onRefresh={postCheckoutOutcome.kind === 'unknown' ? modelStatus.refreshStatus : undefined}
            />
          </div>
        ) : null}
        <RecommendationColumn
          title="Pós efetivar"
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
        <ModelStatusPanel modelStatusHook={modelStatus} />
      </div>

      <div className="border-t border-gray-200 pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">📊 Showcase de aprendizagem com carrinho</h2>
            <p className="mt-1 text-xs text-gray-500">
              Acompanhe as 4 fases: selecione cliente → monte carrinho → checkout → captura pós-efetivar.
            </p>
          </div>
          {analysis.phase !== 'empty' && (
            <button
              onClick={resetAnalysis}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              title="Reiniciar showcase"
            >
              ↺ Reiniciar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4 lg:gap-3">{columns}</div>
      </div>
    </div>
  );
}
