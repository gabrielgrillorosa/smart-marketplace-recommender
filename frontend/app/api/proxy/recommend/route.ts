import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from '@/lib/fetch-wrapper';
import { adaptRecommendations } from '@/lib/adapters/recommend';

const API_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = await apiFetch<unknown>(
      `${API_SERVICE_URL}/api/v1/recommend`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const { results, isFallback } = adaptRecommendations(data);
    return NextResponse.json({ results, isFallback });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
