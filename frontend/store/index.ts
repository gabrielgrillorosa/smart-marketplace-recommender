import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createClientSlice, type ClientSlice } from './clientSlice';
import { createDemoSlice, type DemoSlice } from './demoSlice';
import { createRecommendationSlice, type RecommendationSlice } from './recommendationSlice';
import { createAnalysisSlice, type AnalysisSlice } from './analysisSlice';

type CombinedStore = ClientSlice & DemoSlice & RecommendationSlice & AnalysisSlice;

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
            get().clearDemoForClient(prevId);
            get().clearRecommendations();
            get().resetAnalysis();
          }
        },
        get,
        api
      ),
      ...createDemoSlice(set, get, api),
      ...createRecommendationSlice(set, get, api),
      ...createAnalysisSlice(set, get, api),
      setSelectedClient: (client) => {
        const prevClient = get().selectedClient;
        set({ selectedClient: client });
        const prevId = prevClient?.id;
        const newId = client?.id;
        if (prevId && prevId !== newId) {
          get().clearDemoForClient(prevId);
          get().clearRecommendations();
          get().resetAnalysis();
        }
      },
    }),
    {
      name: 'smr-client',
      partialize: (state) => ({ selectedClient: state.selectedClient }),
      skipHydration: true,
    }
  )
);
