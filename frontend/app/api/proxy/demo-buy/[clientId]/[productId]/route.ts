import { NextRequest, NextResponse } from 'next/server';
import { adaptRecommendations } from '@/lib/adapters/recommend';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3001';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; productId: string }> }
) {
  try {
    const { clientId, productId } = await params;
    const response = await fetch(`${AI_SERVICE_URL}/api/v1/demo-buy/${clientId}/${productId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Upstream error' }));
      return NextResponse.json(err, { status: response.status });
    }

    const data = await response.json();
    const { results } = adaptRecommendations(data);
    return NextResponse.json({ recommendations: results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
