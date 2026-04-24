import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/fetch-wrapper';
import { adaptRagResponse } from '@/lib/adapters/rag';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3000';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await apiFetch<unknown>(
      `${AI_SERVICE_URL}/api/v1/rag/query`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90000),
      }
    );
    return NextResponse.json(adaptRagResponse(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
