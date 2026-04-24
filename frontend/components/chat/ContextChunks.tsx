import type { RagChunk } from '@/lib/types';

interface ContextChunksProps {
  chunks: RagChunk[];
}

export function ContextChunks({ chunks }: ContextChunksProps) {
  return (
    <details className="w-full max-w-[80%] rounded-lg border border-gray-200 bg-gray-50 text-xs">
      <summary className="cursor-pointer px-3 py-2 font-medium text-gray-600 hover:text-gray-900">
        📚 Contexto recuperado ({chunks.length} fonte{chunks.length !== 1 ? 's' : ''})
      </summary>
      <div className="divide-y divide-gray-200 px-3 pb-2">
        {chunks.map((chunk, i) => (
          <div key={i} className="py-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-800">{chunk.productName}</span>
              <span className="text-gray-400">score: {chunk.score.toFixed(3)}</span>
            </div>
            {chunk.excerpt && (
              <p className="mt-1 text-gray-600 line-clamp-2">{chunk.excerpt}</p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}
