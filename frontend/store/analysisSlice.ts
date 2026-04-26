import type { StateCreator } from 'zustand';
import type { RecommendationResult } from '@/lib/types';

export type Snapshot = {
  recommendations: RecommendationResult[];
  capturedAt: string;
};

export type AnalysisState =
  | { phase: 'empty' }
  | { phase: 'initial'; clientId: string; initial: Snapshot }
  | { phase: 'demo'; clientId: string; initial: Snapshot; demo: Snapshot }
  | { phase: 'retrained'; clientId: string; initial: Snapshot; demo: Snapshot; retrained: Snapshot };

export interface AnalysisSlice {
  analysis: AnalysisState;
  captureInitial: (clientId: string, recs: RecommendationResult[]) => void;
  captureDemo: (clientId: string, recs: RecommendationResult[]) => void;
  captureRetrained: (clientId: string, recs: RecommendationResult[]) => void;
  resetAnalysis: () => void;
}

export const createAnalysisSlice: StateCreator<AnalysisSlice> = (set, get) => ({
  analysis: { phase: 'empty' },

  captureInitial: (clientId, recs) => {
    const current = get().analysis;
    if (current.phase !== 'empty') return;
    set({
      analysis: {
        phase: 'initial',
        clientId,
        initial: { recommendations: recs, capturedAt: new Date().toISOString() },
      },
    });
  },

  captureDemo: (clientId, recs) => {
    const current = get().analysis;
    if (current.phase !== 'initial') return;
    if (current.clientId !== clientId) return;
    set({
      analysis: {
        phase: 'demo',
        clientId,
        initial: current.initial,
        demo: { recommendations: recs, capturedAt: new Date().toISOString() },
      },
    });
  },

  captureRetrained: (clientId, recs) => {
    const current = get().analysis;
    if (current.phase !== 'demo' && current.phase !== 'initial') return;
    if (current.clientId !== clientId) return;
    const demoSnapshot: Snapshot = current.phase === 'demo'
      ? current.demo
      : { recommendations: [], capturedAt: new Date().toISOString() };
    set({
      analysis: {
        phase: 'retrained',
        clientId,
        initial: current.initial,
        demo: demoSnapshot,
        retrained: { recommendations: recs, capturedAt: new Date().toISOString() },
      },
    });
  },

  resetAnalysis: () => {
    set({ analysis: { phase: 'empty' } });
  },
});
