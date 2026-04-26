import { useAppStore } from '@/store';
import type { Client } from '@/lib/types';

export function useSelectedClient() {
  const selectedClient = useAppStore((s) => s.selectedClient);
  const setSelectedClient = useAppStore((s) => s.setSelectedClient);
  const clearSelectedClient = useAppStore((s) => s.clearSelectedClient);

  return { selectedClient, setSelectedClient, clearSelectedClient };
}

export type { Client };
