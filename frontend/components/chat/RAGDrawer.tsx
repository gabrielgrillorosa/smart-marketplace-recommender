'use client';

import { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { toast } from 'sonner';
import type { Client } from '@/lib/types';
import { RAGChatPanel } from '@/components/chat/RAGChatPanel';

const LLM_TIMEOUT_MS = 10_000;

interface RAGDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedClient: Client | null;
}

export function RAGDrawer({ open, onClose, selectedClient }: RAGDrawerProps) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      timeoutRef.current = setTimeout(() => {
        toast.info('Aguardando resposta do LLM...');
      }, LLM_TIMEOUT_MS);
    } else {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-safe:transition-all" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-label="Chat RAG"
          className="fixed inset-y-0 right-0 z-50 flex w-full flex-col bg-white shadow-xl focus:outline-none sm:w-[420px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right motion-safe:duration-300"
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">
              {selectedClient ? `Chat RAG — ${selectedClient.name}` : 'Chat RAG'}
            </h2>
            <Dialog.Close
              className="rounded-sm p-1 text-gray-400 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Fechar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-hidden px-4 pb-4 pt-2">
            <RAGChatPanel />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
