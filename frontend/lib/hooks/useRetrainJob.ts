'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/fetch-wrapper';
import { postModelTrain, getModelStatus, pollTrainStatus } from '@/lib/adapters/train';
import type { JobStatus, ModelMetrics, TrainStatusResponse } from '@/lib/types';

interface RetrainJobState {
  status: JobStatus;
  epoch: number;
  totalEpochs: number;
  loss: number | null;
  eta: number | null;
  beforeMetrics: ModelMetrics | null;
  afterMetrics: ModelMetrics | null;
  errorMessage: string | null;
}

export interface UseRetrainJobResult extends RetrainJobState {
  startRetrain: () => void;
}

export function useRetrainJob(): UseRetrainJobResult {
  const [state, setState] = useState<RetrainJobState>({
    status: 'idle',
    epoch: 0,
    totalEpochs: 0,
    loss: null,
    eta: null,
    beforeMetrics: null,
    afterMetrics: null,
    errorMessage: null,
  });

  const [jobId, setJobId] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consecutiveErrorsRef = useRef(0);

  // ADR-025: keep ref in sync with jobId state to avoid stale closure in setInterval
  useEffect(() => {
    jobIdRef.current = jobId;
  }, [jobId]);

  // On mount: fetch current model metrics for beforeMetrics
  useEffect(() => {
    let cancelled = false;
    getModelStatus()
      .then((data) => {
        if (cancelled) return;
        if (data.status === 'trained' && data.trainedAt) {
          setState((prev) => ({
            ...prev,
            beforeMetrics: {
              precisionAt5: data.precisionAt5 ?? 0,
              loss: data.finalLoss ?? 0,
              accuracy: data.finalAccuracy ?? 0,
              trainingSamples: data.trainingSamples ?? 0,
              epoch: 20,
              trainedAt: data.trainedAt!,
            },
          }));
        }
      })
      .catch(() => {
        // silent — beforeMetrics stays null → "Nenhum modelo treinado"
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (initialStatus: JobStatus) => {
      stopPolling();
      // Fixed 2s interval — simpler and avoids stale-closure bugs from dynamic interval adjustment
      void initialStatus;

      const tick = async () => {
        const id = jobIdRef.current;
        if (!id) return;

        try {
          const data = await pollTrainStatus(id);
          consecutiveErrorsRef.current = 0;

          if (data.status === 'done') {
            stopPolling();
            // Fetch final precisionAt5 from model/status since job status doesn't include it
            let precisionAt5 = 0;
            try {
              const modelStatus = await getModelStatus();
              precisionAt5 = modelStatus.precisionAt5 ?? 0;
            } catch {
              // non-fatal — afterMetrics will show 0 for precisionAt5
            }
            setState((prev) => ({
              ...prev,
              status: 'done',
              epoch: data.epoch ?? prev.epoch,
              totalEpochs: data.totalEpochs ?? prev.totalEpochs,
              loss: data.loss != null ? data.loss : prev.loss,
              afterMetrics: {
                precisionAt5,
                loss: data.loss != null ? data.loss : 0,
                epoch: data.epoch ?? 20,
                trainedAt: new Date().toISOString(),
              },
            }));
            return;
          }

          if (data.status === 'failed') {
            stopPolling();
            setState((prev) => ({
              ...prev,
              status: 'failed',
              errorMessage: 'Retreinamento falhou',
            }));
            return;
          }

          setState((prev) => ({
            ...prev,
            status: data.status,
            epoch: data.epoch ?? prev.epoch,
            totalEpochs: data.totalEpochs ?? prev.totalEpochs,
            loss: data.loss != null ? data.loss : prev.loss,
            eta: typeof data.eta === 'number' && !isNaN(data.eta) ? data.eta : null,
          }));
        } catch (err) {
          if (err instanceof ApiError && err.status === 404) {
            stopPolling();
            setState((prev) => ({
              ...prev,
              status: 'idle',
              errorMessage: null,
            }));
            return;
          }
          consecutiveErrorsRef.current += 1;
          if (consecutiveErrorsRef.current >= 3) {
            stopPolling();
            setState((prev) => ({
              ...prev,
              status: 'network-error',
              errorMessage: 'Erro de conexão — tente novamente',
            }));
          }
        }
      };

      // Register interval first, then fire immediately so stopPolling() inside tick
      // always has a valid ref to cancel
      intervalRef.current = setInterval(tick, 2000);
      // Small delay before first tick ensures setInterval ref is set
      // before any async done/failed handling calls stopPolling()
      setTimeout(() => void tick(), 100);
    },
    [stopPolling]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, [stopPolling]);

  const startRetrain = useCallback(async () => {
    const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';

    setState((prev) => ({
      ...prev,
      status: 'queued',
      epoch: 0,
      totalEpochs: 0,
      loss: null,
      eta: null,
      afterMetrics: null,
      errorMessage: null,
    }));

    try {
      const data = await postModelTrain(adminKey);
      setJobId(data.jobId);
      jobIdRef.current = data.jobId;
      startPolling('queued');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) {
          toast.error('Chave de admin não configurada — verifique NEXT_PUBLIC_ADMIN_API_KEY');
          setState((prev) => ({ ...prev, status: 'idle' }));
          return;
        }
        if (err.status === 409) {
          toast('Retreinamento já em andamento');
          // err.message holds jobId for 409 when present
          const existingJobId = err.message;
          if (existingJobId && existingJobId !== `HTTP 409`) {
            setJobId(existingJobId);
            jobIdRef.current = existingJobId;
            startPolling('queued');
          } else {
            setState((prev) => ({ ...prev, status: 'idle' }));
          }
          return;
        }
      }
      toast.error('Erro ao iniciar retreinamento — tente novamente');
      setState((prev) => ({ ...prev, status: 'idle', errorMessage: 'Erro ao iniciar retreinamento' }));
    }
  }, [startPolling]);

  return {
    ...state,
    startRetrain,
  };
}
