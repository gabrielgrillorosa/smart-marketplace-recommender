'use client';

import { useSelectedClient } from '@/lib/hooks/useSelectedClient';
import { ClientProfileCard } from './ClientProfileCard';

export function ClientPanel() {
  const { selectedClient } = useSelectedClient();

  if (!selectedClient) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-400">
        <p className="text-4xl mb-2">👤</p>
        <p className="text-sm">Selecione um cliente na navbar para ver o perfil</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ClientProfileCard client={selectedClient} />
      <p className="text-xs text-gray-400">
        Use &quot;✨ Ordenar por IA&quot; no Catálogo para obter recomendações para este cliente.
      </p>
    </div>
  );
}
