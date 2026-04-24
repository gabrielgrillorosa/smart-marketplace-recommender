'use client';

import type { Client } from '@/lib/types';

interface ClientSelectorProps {
  clients: Client[];
  selectedId: string | null;
  onChange: (client: Client) => void;
}

export function ClientSelector({ clients, selectedId, onChange }: ClientSelectorProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const client = clients.find((c) => c.id === e.target.value);
    if (client) onChange(client);
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">Selecionar Cliente</label>
      <select
        value={selectedId ?? ''}
        onChange={handleChange}
        className="w-full max-w-sm rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">-- Selecione um cliente --</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.country})
          </option>
        ))}
      </select>
    </div>
  );
}
