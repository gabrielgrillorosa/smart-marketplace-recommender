'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { useClient } from '@/lib/contexts/ClientContext';
import { useRecommendations } from '@/lib/contexts/RecommendationContext';
import { ClientSelector } from './ClientSelector';
import { ClientProfileCard } from './ClientProfileCard';
import { RecommendButton } from './RecommendButton';

const API_SERVICE_URL = '';

interface PageResponse {
  content?: Client[];
  items?: RawClient[];
}

interface RawClient {
  id: string;
  name: string;
  segment: string;
  countryCode: string;
}

function toClient(raw: RawClient): Client {
  return {
    id: raw.id,
    name: raw.name,
    segment: raw.segment,
    country: raw.countryCode,
    totalOrders: 0,
    recentProducts: [],
  };
}

export function ClientPanel() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { selectedClient, setSelectedClient } = useClient();
  const { clearRecommendations } = useRecommendations();

  useEffect(() => {
    apiFetch<PageResponse | Client[]>(`/backend/api/v1/clients?size=100`)
      .then((data) => {
        let raw: RawClient[] | Client[];
        if (Array.isArray(data)) {
          raw = data;
        } else if (data.items) {
          raw = data.items;
        } else {
          raw = data.content ?? [];
        }
        const list = (raw as RawClient[]).map((item) =>
          'country' in item ? (item as unknown as Client) : toClient(item)
        );
        setClients(list);
      })
      .catch(() => setError('Não foi possível carregar os clientes.'))
      .finally(() => setLoadingClients(false));
  }, []);

  function handleClientChange(client: Client) {
    clearRecommendations();
    setSelectedClient(client);
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {loadingClients ? (
        <p className="text-sm text-gray-500">Carregando clientes...</p>
      ) : (
        <ClientSelector
          clients={clients}
          selectedId={selectedClient?.id ?? null}
          onChange={handleClientChange}
        />
      )}
      {selectedClient && (
        <div className="space-y-4">
          <ClientProfileCard client={selectedClient} />
          <RecommendButton client={selectedClient} />
          <p className="text-xs text-gray-400">
            As recomendações serão exibidas no painel &quot;Recomendações&quot;.
          </p>
        </div>
      )}
      {!selectedClient && !loadingClients && (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-400">
          <p className="text-4xl mb-2">👤</p>
          <p className="text-sm">Selecione um cliente para ver o perfil e obter recomendações</p>
        </div>
      )}
    </div>
  );
}
