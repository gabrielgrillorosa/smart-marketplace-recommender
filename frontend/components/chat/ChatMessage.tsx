import type { Message } from '@/lib/types';
import { ContextChunks } from './ContextChunks';

interface ChatMessageProps {
  message: Message;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : message.isError
              ? 'bg-red-50 text-red-700 border border-red-200 rounded-bl-sm'
              : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        {message.content}
      </div>
      <span className="text-xs text-gray-400">{formatTime(message.timestamp)}</span>
      {!isUser && message.chunks && message.chunks.length > 0 && (
        <ContextChunks chunks={message.chunks} />
      )}
    </div>
  );
}
