'use client';

import { useState } from 'react';
import { useServiceHealth } from '@/lib/hooks/useServiceHealth';
import { ServiceStatusBadge } from './ServiceStatusBadge';
import { ClientSelectorDropdown } from './ClientSelectorDropdown';
import { RAGDrawer } from '@/components/chat/RAGDrawer';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { useAppStore } from '@/store';
import { useEffect } from 'react';

export function Header() {
  const { apiStatus, aiStatus } = useServiceHealth();
  const { selectedClient } = useSelectedClient();
  const [isOpen, setIsOpen] = useState(false);

  // Rehydrate persisted client on mount
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);

  return (
    <>
      <header className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🛒</span>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Smart Marketplace Recommender</h1>
              <p className="text-xs text-gray-500">AI-powered B2B product recommendations</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              aria-label="Abrir Chat RAG"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <span aria-hidden="true">💬</span>
              <span className="hidden sm:inline">Chat RAG</span>
            </button>
            <ClientSelectorDropdown />
            <ServiceStatusBadge label="API Service" status={apiStatus} />
            <ServiceStatusBadge label="AI Service" status={aiStatus} />
          </div>
        </div>
      </header>
      <RAGDrawer
        open={isOpen}
        onClose={() => setIsOpen(false)}
        selectedClient={selectedClient}
      />
    </>
  );
}
