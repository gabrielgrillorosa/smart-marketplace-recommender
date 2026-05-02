import { NextRequest, NextResponse } from 'next/server';
import { adaptRecommendations } from '@/lib/adapters/recommend';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${AI_SERVICE_URL}/api/v1/recommend/from-cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({ error: 'Upstream error' }));
    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    const parsed = adaptRecommendations(data);
    return NextResponse.json(
      {
        results: parsed.results,
        isFallback: parsed.isFallback,
        ...(parsed.rankingConfig ? { rankingConfig: parsed.rankingConfig } : {}),
      },
      { status: response.status }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
