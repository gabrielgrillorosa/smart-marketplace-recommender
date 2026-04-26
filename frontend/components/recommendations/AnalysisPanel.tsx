'use client';

import { useEffect, useRef, useState } from 'react';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useRetrainJob } from '@/lib/hooks/useRetrainJob';
import { useAppStore } from '@/store';
import { ClientProfileCard } from '@/components/client/ClientProfileCard';
import { RetrainPanel } from '@/components/retrain/RetrainPanel';
import { RecommendationColumn } from '@/components/analysis/RecommendationColumn';
import { seededShuffle } from '@/lib/utils/shuffle';
import type { RecommendationResult } from '@/lib/types';

async function fetchRecs(clientId: string): Promise<RecommendationResult[]> {
  const res = await fetch('/api/proxy/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, limit: 10 }),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  // The proxy already runs adaptRecommendations and returns { results, isFallback }
  const data = await res.json() as { results?: RecommendationResult[] };
  return Array.isArray(data?.results) ? data.results : [];
}

export function AnalysisPanel() {
  const { selectedClient } = useSelectedClient();

  const analysis = useAppStore((s) => s.analysis);
  const captureInitial = useAppStore((s) => s.captureInitial);
  const captureDemo = useAppStore((s) => s.captureDemo);
  const captureRetrained = useAppStore((s) => s.captureRetrained);
  const resetAnalysis = useAppStore((s) => s.resetAnalysis);
  const demoBoughtByClient = useAppStore((s) => s.demoBoughtByClient);

  const retrainJob = useRetrainJob();
  const { status: jobStatus } = retrainJob;

  const [noAiRecs, setNoAiRecs] = useState<RecommendationResult[] | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [retrainedLoading, setRetrainedLoading] = useState(false);

  const prevDemoCountRef = useRef(0);
  const prevJobStatusRef = useRef<string>('idle');
  // Ref for analysis.phase to read current value without adding it as effect dependency
  const analysisPhaseRef = useRef(analysis.phase);
  useEffect(() => { analysisPhaseRef.current = analysis.phase; }, [analysis.phase]);

  // Stable refs for store actions — prevents useEffect dependency churn
  const captureInitialRef = useRef(captureInitial);
  const captureDemoRef = useRef(captureDemo);
  const captureRetrainedRef = useRef(captureRetrained);
  useEffect(() => { captureInitialRef.current = captureInitial; }, [captureInitial]);
  useEffect(() => { captureDemoRef.current = captureDemo; }, [captureDemo]);
  useEffect(() => { captureRetrainedRef.current = captureRetrained; }, [captureRetrained]);

  // PHASE 1 — fetch initial snapshot when client is selected.
  // Reads analysis.phase via ref so the effect never re-runs when phase changes
  // (which would cancel the in-flight fetch and lock initialLoading=true forever).
  useEffect(() => {
    if (!selectedClient) return;
    if (analysisPhaseRef.current !== 'empty') return;

    let cancelled = false;
    setInitialLoading(true);

    fetchRecs(selectedClient.id)
      .then((recs) => {
        if (cancelled) return;
        setNoAiRecs(seededShuffle(recs, selectedClient.id));
        captureInitialRef.current(selectedClient.id, recs);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setInitialLoading(false); });

    return () => { cancelled = true; };
  // Only re-run when the client changes — phase read via ref
  }, [selectedClient?.id]);

  // Reset local state when analysis is reset (phase goes back to empty)
  useEffect(() => {
    if (analysis.phase === 'empty') {
      setNoAiRecs(null);
      prevDemoCountRef.current = 0;
      prevJobStatusRef.current = 'idle';
      // Re-trigger initial fetch by re-running the Phase 1 effect would require
      // selectedClient?.id to change — instead we call it directly here
      if (selectedClient) {
        let cancelled = false;
        setInitialLoading(true);
        fetchRecs(selectedClient.id)
          .then((recs) => {
            if (cancelled) return;
            setNoAiRecs(seededShuffle(recs, selectedClient.id));
            captureInitialRef.current(selectedClient.id, recs);
          })
          .catch(() => {})
          .finally(() => { if (!cancelled) setInitialLoading(false); });
        return () => { cancelled = true; };
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.phase]);

  // Also keep selectedClient in a ref so Phase 2 and Phase 3 closures are never stale
  const selectedClientRef = useRef(selectedClient);
  useEffect(() => { selectedClientRef.current = selectedClient; }, [selectedClient]);

  // PHASE 2 — fire when demoBoughtByClient changes; read phase via ref to avoid effect restart
  useEffect(() => {
    const client = selectedClientRef.current;
    if (!client) return;
    if (analysisPhaseRef.current !== 'initial') return;

    const demoBought = demoBoughtByClient[client.id] ?? [];
    const demoCount = demoBought.length;

    if (demoCount === 0) { prevDemoCountRef.current = 0; return; }
    if (demoCount === prevDemoCountRef.current) return;
    prevDemoCountRef.current = demoCount;

    let cancelled = false;
    setDemoLoading(true);

    fetchRecs(client.id)
      .then((recs) => { if (!cancelled) captureDemoRef.current(client.id, recs); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDemoLoading(false); });

    return () => { cancelled = true; };
  // Only re-run when demo purchases change — phase and client read via refs
  }, [demoBoughtByClient]);

  // PHASE 3 — fire when jobStatus changes; read phase via ref to avoid effect restart
  useEffect(() => {
    const prev = prevJobStatusRef.current;
    prevJobStatusRef.current = jobStatus;

    if (jobStatus !== 'done' || prev === 'done') return;

    const client = selectedClientRef.current;
    if (!client) return;
    if (analysisPhaseRef.current !== 'demo' && analysisPhaseRef.current !== 'initial') return;

    let cancelled = false;
    setRetrainedLoading(true);

    fetchRecs(client.id)
      .then((recs) => { if (!cancelled) captureRetrainedRef.current(client.id, recs); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setRetrainedLoading(false); });

    return () => { cancelled = true; };
  // Only re-run when jobStatus changes — phase and client read via refs
  }, [jobStatus]);

  // Derive snapshot data for each column
  const initialRecs = analysis.phase !== 'empty' ? analysis.initial.recommendations : null;
  const initialCapturedAt = analysis.phase !== 'empty' ? analysis.initial.capturedAt : undefined;
  const demoRecs = (analysis.phase === 'demo' || analysis.phase === 'retrained') ? analysis.demo.recommendations : null;
  const demoCapturedAt = (analysis.phase === 'demo' || analysis.phase === 'retrained') ? analysis.demo.capturedAt : undefined;
  const retrainedRecs = analysis.phase === 'retrained' ? analysis.retrained.recommendations : null;
  const retrainedCapturedAt = analysis.phase === 'retrained' ? analysis.retrained.capturedAt : undefined;

  const clientSection = selectedClient ? (
    <ClientProfileCard client={selectedClient} />
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
        colorScheme="gray"
        recommendations={noAiRecs}
        loading={initialLoading}
        emptyMessage="Selecione um cliente na navbar"
        hideScore
      />
      <RecommendationColumn
        title="Com IA"
        colorScheme="blue"
        recommendations={initialRecs}
        capturedAt={initialCapturedAt}
        loading={initialLoading}
        emptyMessage="Selecione um cliente na navbar"
      />
      <RecommendationColumn
        title="Com Demo"
        colorScheme="emerald"
        recommendations={demoRecs}
        capturedAt={demoCapturedAt}
        loading={demoLoading}
        emptyMessage="Faça uma compra demo no catálogo"
      />
      <RecommendationColumn
        title="Pós-Retreino"
        colorScheme="violet"
        recommendations={retrainedRecs}
        capturedAt={retrainedCapturedAt}
        loading={retrainedLoading}
        emptyMessage="Retreine o modelo acima para ver"
      />
    </>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {clientSection}
        <RetrainPanel retrainJob={retrainJob} />
      </div>

      <div className="border-t border-gray-200 pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-800">📊 AI Learning Showcase</h2>
            <p className="mt-1 text-xs text-gray-500">
              Acompanhe as 4 fases: selecione cliente → faça compras demo → retreine o modelo.
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
        <div className="hidden lg:grid lg:grid-cols-4 lg:gap-3">{columns}</div>
        <div className="grid grid-cols-1 gap-3 lg:hidden">{columns}</div>
      </div>
    </div>
  );
}
