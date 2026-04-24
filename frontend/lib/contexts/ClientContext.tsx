'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Client } from '@/lib/types';

interface ClientContextValue {
  selectedClient: Client | null;
  setSelectedClient: (client: Client | null) => void;
}

const ClientContext = createContext<ClientContextValue | null>(null);

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  return (
    <ClientContext.Provider value={{ selectedClient, setSelectedClient }}>
      {children}
    </ClientContext.Provider>
  );
}

export function useClient(): ClientContextValue {
  const ctx = useContext(ClientContext);
  if (!ctx) throw new Error('useClient must be used within ClientProvider');
  return ctx;
}
