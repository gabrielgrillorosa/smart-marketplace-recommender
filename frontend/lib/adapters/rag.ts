import type { RagResponse, RagChunk } from '@/lib/types';

interface RawRagChunk {
  productName?: string;
  name?: string;
  score?: number;
  similarity?: number;
  excerpt?: string;
  content?: string;
  pageContent?: string;
}

interface RawRagResponse {
  answer?: string;
  response?: string;
  chunks?: RawRagChunk[];
  context?: RawRagChunk[];
  sources?: RawRagChunk[];
  durationMs?: number;
  duration?: number;
}

export function adaptRagResponse(raw: unknown): RagResponse {
  const data = raw as RawRagResponse;
  const rawChunks = data?.chunks ?? data?.context ?? data?.sources ?? [];

  const chunks: RagChunk[] = rawChunks.map((c: RawRagChunk) => ({
    productName: String(c.productName ?? c.name ?? 'Unknown'),
    score: Number(c.score ?? c.similarity ?? 0),
    excerpt: String(c.excerpt ?? c.content ?? c.pageContent ?? ''),
  }));

  return {
    answer: String(data?.answer ?? data?.response ?? ''),
    chunks,
    durationMs: Number(data?.durationMs ?? data?.duration ?? 0),
  };
}
