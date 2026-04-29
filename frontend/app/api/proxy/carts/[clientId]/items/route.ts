import { NextRequest, NextResponse } from 'next/server';

const API_SERVICE_URL = process.env.API_SERVICE_URL ?? 'http://localhost:8080';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const { clientId } = await params;
    const body = await request.json();

    const response = await fetch(`${API_SERVICE_URL}/api/v1/carts/${clientId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({ error: 'Upstream error' }));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
