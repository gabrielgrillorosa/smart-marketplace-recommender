'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { useSelectedClient } from '@/lib/hooks/useSelectedClient';

const FLAG_EMOJI: Record<string, string> = {
  BR: '🇧🇷',
  MX: '🇲🇽',
  CO: '🇨🇴',
  NL: '🇳🇱',
  RO: '🇷🇴',
};

interface RawClient {
  id: string;
  name: string;
  segment: string;
  countryCode: string;
}

interface PageResponse {
  content?: RawClient[];
  items?: RawClient[];
}

function toClient(raw: RawClient): Client {
  return {
    id: raw.id,
    name: raw.name,
    segment: raw.segment,
    country: raw.countryCode,
  };
}

export function ClientSelectorDropdown() {
  const { selectedClient, setSelectedClient } = useSelectedClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch<PageResponse | RawClient[]>('/backend/api/v1/clients?size=100')
      .then((data) => {
        let raw: RawClient[];
        if (Array.isArray(data)) {
          raw = data as RawClient[];
        } else if ((data as PageResponse).items) {
          raw = (data as PageResponse).items!;
        } else {
          raw = (data as PageResponse).content ?? [];
        }
        const list = raw.map(toClient);
        setClients(list);
      })
      .catch(() => setError(true))
      .finally(() => setLoadingClients(false));
  }, []);

  const flag = selectedClient ? (FLAG_EMOJI[selectedClient.country] ?? selectedClient.country) : '';

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Selecionar cliente"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {loadingClients ? (
          <span className="text-gray-400">⏳</span>
        ) : error ? (
          <span className="text-gray-400 text-xs">Clientes indisponíveis</span>
        ) : selectedClient ? (
          <>
            <span aria-hidden="true">{flag}</span>
            <span className="hidden sm:inline truncate max-w-[120px]">{selectedClient.name}</span>
          </>
        ) : (
          <span className="text-gray-400 text-xs hidden sm:inline">Selecionar cliente...</span>
        )}
        <svg className="ml-1 h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !loadingClients && !error && (
        <ul
          role="listbox"
          aria-label="Clientes"
          className="absolute right-0 z-50 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-gray-200 bg-white py-1 shadow-lg text-sm"
        >
          {clients.map((client) => (
            <li
              key={client.id}
              role="option"
              aria-selected={selectedClient?.id === client.id}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-blue-50 ${
                selectedClient?.id === client.id ? 'bg-blue-50 font-medium text-blue-700' : 'text-gray-700'
              }`}
              onClick={() => {
                setSelectedClient(client);
                setOpen(false);
              }}
            >
              <span aria-hidden="true">{FLAG_EMOJI[client.country] ?? client.country}</span>
              <span className="truncate">{client.name}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
