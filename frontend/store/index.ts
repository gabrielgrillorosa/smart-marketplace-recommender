import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClientSlice, type ClientSlice } from './clientSlice';
import { createRecommendationSlice, type RecommendationSlice } from './recommendationSlice';
import { createAnalysisSlice, type AnalysisSlice } from './analysisSlice';
import { createCartSlice, type CartSlice } from './cartSlice';

type CombinedStore = ClientSlice & RecommendationSlice & AnalysisSlice & CartSlice;

export const useAppStore = create<CombinedStore>()(
  persist(
    (set, get, api) => ({
      ...createClientSlice(
        (partial) => {
          const prevClient = get().selectedClient;
          set(partial);
          const nextState = get();
          const newClient = nextState.selectedClient;
          const prevId = prevClient?.id;
          const newId = newClient?.id;
          if (prevId && prevId !== newId) {
            get().clearRecommendations();
            get().resetAnalysis();
            get().clearCartStateForClient(prevId);
          }
        },
        get,
        api
      ),
      ...createRecommendationSlice(set, get, api),
      ...createAnalysisSlice(set, get, api),
      ...createCartSlice(set, get, api),
      setSelectedClient: (client) => {
        const prevClient = get().selectedClient;
        const prevId = prevClient?.id;
        const newId = client?.id;
        set({ selectedClient: client });
        if (prevId !== newId) {
          if (prevId && prevId !== newId) {
            get().clearRecommendations();
            get().resetAnalysis();
            get().clearCartStateForClient(prevId);
          }
        }
      },
    }),
    {
      name: 'smr-client',
      partialize: (state) => ({
        selectedClient: state.selectedClient,
        awaitingRetrainSince: state.awaitingRetrainSince,
        lastObservedVersion: state.lastObservedVersion,
        awaitingForOrderId: state.awaitingForOrderId,
        awaitOutcomeBaselineSnapshot: state.awaitOutcomeBaselineSnapshot,
      }),
      skipHydration: true,
    }
  )
);
