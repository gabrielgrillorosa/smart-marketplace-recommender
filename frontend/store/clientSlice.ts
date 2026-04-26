import type { StateCreator } from 'zustand';
import type { Client } from '@/lib/types';

export interface ClientSlice {
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
  clearSelectedClient: () => void;
}

export const createClientSlice: StateCreator<ClientSlice> = (set) => ({
  selectedClient: null,
  setSelectedClient: (client) => set({ selectedClient: client }),
  clearSelectedClient: () => set({ selectedClient: null }),
});
