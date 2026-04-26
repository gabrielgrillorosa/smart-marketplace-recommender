import type { StateCreator } from 'zustand';
import type { Message } from '@/lib/types';

export interface DemoSlice {
  demoBoughtByClient: Record<string, string[]>;
  demoBuyLoading: Record<string, boolean>;
  chatHistory: Message[];
  addDemoBought: (clientId: string, productId: string) => void;
  removeDemoBought: (clientId: string, productId: string) => void;
  clearDemoForClient: (clientId: string) => void;
  setDemoBuyLoading: (productId: string, loading: boolean) => void;
  setChatHistory: (messages: Message[]) => void;
}

export const createDemoSlice: StateCreator<DemoSlice> = (set) => ({
  demoBoughtByClient: {},
  demoBuyLoading: {},
  chatHistory: [],
  addDemoBought: (clientId, productId) =>
    set((state) => ({
      demoBoughtByClient: {
        ...state.demoBoughtByClient,
        [clientId]: [...(state.demoBoughtByClient[clientId] ?? []), productId],
      },
    })),
  removeDemoBought: (clientId, productId) =>
    set((state) => ({
      demoBoughtByClient: {
        ...state.demoBoughtByClient,
        [clientId]: (state.demoBoughtByClient[clientId] ?? []).filter((id) => id !== productId),
      },
    })),
  clearDemoForClient: (clientId) =>
    set((state) => {
      const next = { ...state.demoBoughtByClient };
      delete next[clientId];
      return { demoBoughtByClient: next };
    }),
  setDemoBuyLoading: (productId, loading) =>
    set((state) => ({
      demoBuyLoading: { ...state.demoBuyLoading, [productId]: loading },
    })),
  setChatHistory: (messages) => set({ chatHistory: messages }),
});
