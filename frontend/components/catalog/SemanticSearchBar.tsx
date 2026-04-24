'use client';

import { useRef, useState } from 'react';
import type { SearchResult } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';

interface SemanticSearchBarProps {
  onResults: (results: SearchResult[]) => void;
  onClear: () => void;
}

export function SemanticSearchBar({ onResults, onClear }: SemanticSearchBarProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleSubmit() {
    if (!query.trim()) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(null);

    try {
      const results = await apiFetch<SearchResult[]>(
        '/api/proxy/search',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: query.trim(), limit: 50 }),
        },
        ctrl.signal
      );
      onResults(results);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setError('Erro na busca semântica. Verifique se o AI Service está disponível.');
    } finally {
      setLoading(false);
    }
  }

  function handleClear() {
    setQuery('');
    setError(null);
    onClear();
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="Busca semântica... (ex: bebidas sem açúcar)"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? '...' : '🔍 Buscar'}
        </button>
        {query && (
          <button
            onClick={handleClear}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            ✕ Limpar
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
