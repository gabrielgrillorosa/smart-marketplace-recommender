'use client';

import { useState } from 'react';

interface ChatInputProps {
  onSubmit: (query: string) => void;
  loading: boolean;
  value?: string;
  onChange?: (value: string) => void;
}

export function ChatInput({ onSubmit, loading, value, onChange }: ChatInputProps) {
  const [internal, setInternal] = useState('');
  const controlled = value !== undefined && onChange !== undefined;
  const query = controlled ? value : internal;

  function setQuery(v: string) {
    if (controlled) onChange(v);
    else setInternal(v);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleSubmit() {
    if (!query.trim() || loading) return;
    onSubmit(query.trim());
    setQuery('');
  }

  return (
    <div className="flex gap-2">
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Faça uma pergunta sobre o catálogo... (Enter para enviar, Shift+Enter para nova linha)"
        rows={2}
        disabled={loading}
        className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        onClick={handleSubmit}
        disabled={loading || !query.trim()}
        className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? '⏳' : '↑ Enviar'}
      </button>
    </div>
  );
}
