import { NextRequest, NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const adminKey = request.headers.get('X-Admin-Key') ?? '';
    const response = await fetch(`${AI_SERVICE_URL}/api/v1/model/train`, {
      method: 'POST',
      headers: {
        'X-Admin-Key': adminKey,
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
