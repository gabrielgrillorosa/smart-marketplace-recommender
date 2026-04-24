'use client';

import { useEffect, useRef, useState } from 'react';
import type { Message, RagResponse } from '@/lib/types';
import { apiFetch } from '@/lib/fetch-wrapper';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ExamplePrompts } from './ExamplePrompts';

function makeId() {
  return Math.random().toString(36).slice(2);
}

export function RAGChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSubmit(query: string) {
    const userMessage: Message = {
      id: makeId(),
      role: 'user',
      content: query,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setLoading(true);
    setPendingPrompt('');

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const data = await apiFetch<RagResponse>(
        '/api/proxy/rag',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query }),
          signal: ctrl.signal,
        }
      );
      const assistantMessage: Message = {
        id: makeId(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        chunks: data.chunks,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const errorMessage: Message = {
        id: makeId(),
        role: 'assistant',
        content: 'Erro ao consultar o AI Service. Verifique se o serviço está disponível.',
        timestamp: new Date(),
        isError: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  }

  function handleExampleSelect(prompt: string) {
    setPendingPrompt(prompt);
    handleSubmit(prompt);
  }

  return (
    <div className="flex h-[calc(100vh-200px)] flex-col gap-4">
      <ExamplePrompts onSelect={handleExampleSelect} disabled={loading} />
      <div className="flex-1 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-center text-gray-400">
            <div>
              <p className="text-4xl mb-2">💬</p>
              <p className="text-sm">Faça uma pergunta sobre o catálogo de produtos</p>
              <p className="text-xs mt-1">Ou clique em um dos exemplos acima</p>
            </div>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {loading && (
          <div className="flex items-start gap-2">
            <div className="rounded-2xl rounded-bl-sm bg-gray-100 px-4 py-2 text-sm text-gray-500">
              ⏳ Consultando...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput
        onSubmit={handleSubmit}
        loading={loading}
        value={pendingPrompt}
        onChange={setPendingPrompt}
      />
    </div>
  );
}
