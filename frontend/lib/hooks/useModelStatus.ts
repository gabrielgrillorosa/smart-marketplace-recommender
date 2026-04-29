'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@/lib/fetch-wrapper';
import { getModelStatus, postModelTrain } from '@/lib/adapters/train';
import type { ModelStatusResponse } from '@/lib/types';
import { useAppStore } from '@/store';

const POLL_INTERVAL_MS = 2000;
const AWAIT_TIMEOUT_MS = 90_000;

export type ModelPanelState =
  | 'idle'
  | 'training'
  | 'promoted'
  | 'rejected'
  | 'failed'
  | 'unknown';

export interface UseModelStatusResult {
  panelState: ModelPanelState;
  modelStatus: ModelStatusResponse | null;
  loading: boolean;
  errorMessage: string | null;
  awaitingForOrderId: string | null;
  startAwaitingCheckout: (orderId: string) => Promise<void>;
  startManualRetrain: () => Promise<void>;
  refreshStatus: () => Promise<ModelStatusResponse | null>;
}

export function useModelStatus(): UseModelStatusResult {
  const selectedClient = useAppStore((s) => s.selectedClient);
  const awaitingRetrainSince = useAppStore((s) => s.awaitingRetrainSince);
  const lastObservedVersion = useAppStore((s) => s.lastObservedVersion);
  const awaitingForOrderId = useAppStore((s) => s.awaitingForOrderId);
  const startAwaitingRetrain = useAppStore((s) => s.startAwaitingRetrain);
  const clearAwaitingRetrain = useAppStore((s) => s.clearAwaitingRetrain);

  const [panelState, setPanelState] = useState<ModelPanelState>('idle');
  const [modelStatus, setModelStatus] = useState<ModelStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const evaluateModelStatus = useCallback((status: ModelStatusResponse, nowTs: number) => {
    if (awaitingRetrainSince != null) {
      if (status.lastTrainingResult === 'failed') {
        clearAwaitingRetrain();
        setPanelState('failed');
        return;
      }

      if (status.lastTrainingResult === 'rejected' && status.currentVersion === lastObservedVersion) {
        clearAwaitingRetrain();
        setPanelState('rejected');
        return;
      }

      if (status.currentVersion && status.currentVersion !== lastObservedVersion) {
        clearAwaitingRetrain();
        setPanelState('promoted');
        return;
      }

      if (nowTs - awaitingRetrainSince >= AWAIT_TIMEOUT_MS) {
        setPanelState('unknown');
        return;
      }

      setPanelState('training');
      return;
    }

    if (status.lastTrainingResult === 'failed') {
      setPanelState('failed');
      return;
    }
    if (status.lastTrainingResult === 'rejected') {
      setPanelState('rejected');
      return;
    }
    if (status.lastTrainingResult === 'promoted') {
      setPanelState('promoted');
      return;
    }
    setPanelState('idle');
  }, [awaitingRetrainSince, clearAwaitingRetrain, lastObservedVersion]);

  const refreshStatus = useCallback(async () => {
    try {
      const status = await getModelStatus();
      setModelStatus(status);
      evaluateModelStatus(status, Date.now());
      setErrorMessage(null);
      return status;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar status do modelo';
      setErrorMessage(message);
      if (awaitingRetrainSince != null) {
        setPanelState('unknown');
      }
      return null;
    }
  }, [awaitingRetrainSince, evaluateModelStatus]);

  const startAwaitingCheckout = useCallback(async (orderId: string) => {
    const status = await getModelStatus().catch(() => null);
    const observedVersion = status?.currentVersion ?? null;
    startAwaitingRetrain(orderId, observedVersion);
    if (status) {
      setModelStatus(status);
    }
    setPanelState('training');
    setErrorMessage(null);
  }, [startAwaitingRetrain]);

  const startManualRetrain = useCallback(async () => {
    const adminKey = process.env.NEXT_PUBLIC_ADMIN_API_KEY ?? '';
    setLoading(true);
    setErrorMessage(null);
    try {
      await postModelTrain(adminKey);
      const status = await getModelStatus().catch(() => null);
      startAwaitingRetrain(null, status?.currentVersion ?? null);
      if (status) {
        setModelStatus(status);
      }
      setPanelState('training');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        toast.error('Chave de admin não configurada — verifique NEXT_PUBLIC_ADMIN_API_KEY');
      } else if (err instanceof ApiError && err.status === 409) {
        toast('Retreinamento já em andamento');
      } else {
        toast.error('Erro ao iniciar retreinamento — tente novamente');
      }
      setErrorMessage(err instanceof Error ? err.message : 'Erro ao iniciar retreinamento');
      setPanelState('failed');
    } finally {
      setLoading(false);
    }
  }, [startAwaitingRetrain]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    stopPolling();
    if (!selectedClient || awaitingRetrainSince == null) {
      return;
    }

    if (Date.now() - awaitingRetrainSince >= AWAIT_TIMEOUT_MS) {
      setPanelState('unknown');
      return;
    }

    setPanelState('training');
    intervalRef.current = setInterval(() => {
      void refreshStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      stopPolling();
    };
  }, [awaitingRetrainSince, refreshStatus, selectedClient, stopPolling]);

  return {
    panelState,
    modelStatus,
    loading,
    errorMessage,
    awaitingForOrderId,
    startAwaitingCheckout,
    startManualRetrain,
    refreshStatus,
  };
}
