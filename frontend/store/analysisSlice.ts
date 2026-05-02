import type { StateCreator } from 'zustand';
import type { RecommendationResult } from '@/lib/types';
import type { RankingWindow } from '@/lib/showcase/ranking-window';

export type Snapshot = {
  recommendations: RecommendationResult[];
  capturedAt: string;
  window: RankingWindow;
};

export type AnalysisState =
  | { phase: 'empty' }
  | { phase: 'initial'; clientId: string; initial: Snapshot }
  | { phase: 'cart'; clientId: string; initial: Snapshot; cart: Snapshot }
  | { phase: 'postCheckout'; clientId: string; initial: Snapshot; cart: Snapshot | null; postCheckout: Snapshot };

export interface AnalysisSlice {
  analysis: AnalysisState;
  cartSnapshotStale: boolean;
  awaitingRetrainSince: number | null;
  lastObservedVersion: string | null;
  awaitingForOrderId: string | null;
  captureInitial: (clientId: string, recs: RecommendationResult[], window: RankingWindow) => void;
  captureCartAware: (clientId: string, recs: RecommendationResult[], window: RankingWindow) => void;
  clearCartAware: (clientId: string) => void;
  markCartSnapshotStale: (clientId: string) => void;
  clearCartSnapshotStale: (clientId?: string) => void;
  captureRetrained: (clientId: string, recs: RecommendationResult[], window: RankingWindow) => void;
  startAwaitingRetrain: (orderId: string | null, observedVersion: string | null) => void;
  clearAwaitingRetrain: () => void;
  resetAnalysis: () => void;
  // Resets only the snapshots (keeps awaiting-retrain state). Used when the
  // ranking window changes and we need to recapture, but a checkout-triggered
  // retrain is in flight and we must not lose its `lastObservedVersion`.
  resetAnalysisSnapshots: () => void;
}

export const createAnalysisSlice: StateCreator<AnalysisSlice> = (set, get) => ({
  analysis: { phase: 'empty' },
  cartSnapshotStale: false,
  awaitingRetrainSince: null,
  lastObservedVersion: null,
  awaitingForOrderId: null,

  captureInitial: (clientId, recs, window) => {
    const current = get().analysis;
    if (current.phase !== 'empty') return;
    set({
      analysis: {
        phase: 'initial',
        clientId,
        initial: { recommendations: recs, capturedAt: new Date().toISOString(), window },
      },
      cartSnapshotStale: false,
    });
  },

  captureCartAware: (clientId, recs, window) => {
    const current = get().analysis;
    if (current.phase === 'empty') return;
    if (current.clientId !== clientId) return;

    const cartSnapshot: Snapshot = {
      recommendations: recs,
      capturedAt: new Date().toISOString(),
      window,
    };
    if (current.phase === 'initial') {
      set({
        analysis: {
          phase: 'cart',
          clientId,
          initial: current.initial,
          cart: cartSnapshot,
        },
      });
      return;
    }

    if (current.phase === 'cart') {
      set({
        analysis: {
          phase: 'cart',
          clientId,
          initial: current.initial,
          cart: cartSnapshot,
        },
      });
      return;
    }

    set({
      analysis: {
        phase: 'postCheckout',
        clientId,
        initial: current.initial,
        cart: cartSnapshot,
        postCheckout: current.postCheckout,
      },
    });
  },

  clearCartAware: (clientId) => {
    const current = get().analysis;
    if (current.phase === 'empty' || current.clientId !== clientId) return;
    // M19 / ADR-048: never drop the cart snapshot in postCheckout — Pos-Efetivar
    // needs the pre-checkout cart-aware baseline for buildRecommendationDeltaMap.
    if (current.phase === 'postCheckout') return;
    if (current.phase === 'initial') return;

    if (current.phase === 'cart') {
      set({
        analysis: {
          phase: 'initial',
          clientId,
          initial: current.initial,
        },
        cartSnapshotStale: false,
      });
    }
  },

  markCartSnapshotStale: (clientId) => {
    const current = get().analysis;
    if (current.phase === 'empty' || current.clientId !== clientId) return;
    set({ cartSnapshotStale: true });
  },

  clearCartSnapshotStale: (clientId) => {
    const current = get().analysis;
    if (clientId && current.phase !== 'empty' && current.clientId !== clientId) return;
    set({ cartSnapshotStale: false });
  },

  captureRetrained: (clientId, recs, window) => {
    const current = get().analysis;
    if (current.phase === 'empty') return;
    if (current.clientId !== clientId) return;

    set({
      analysis: {
        phase: 'postCheckout',
        clientId,
        initial: current.initial,
        cart: current.phase === 'initial' ? null : current.cart,
        postCheckout: { recommendations: recs, capturedAt: new Date().toISOString(), window },
      },
      awaitingRetrainSince: null,
      lastObservedVersion: null,
      awaitingForOrderId: null,
    });
  },

  startAwaitingRetrain: (orderId, observedVersion) => {
    set({
      awaitingRetrainSince: Date.now(),
      lastObservedVersion: observedVersion,
      awaitingForOrderId: orderId,
    });
  },

  clearAwaitingRetrain: () => {
    set({
      awaitingRetrainSince: null,
      lastObservedVersion: null,
      awaitingForOrderId: null,
    });
  },

  resetAnalysis: () => {
    set({
      analysis: { phase: 'empty' },
      cartSnapshotStale: false,
      awaitingRetrainSince: null,
      lastObservedVersion: null,
      awaitingForOrderId: null,
    });
  },

  resetAnalysisSnapshots: () => {
    set({
      analysis: { phase: 'empty' },
      cartSnapshotStale: false,
    });
  },
});
