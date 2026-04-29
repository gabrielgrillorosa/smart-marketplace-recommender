import { NextRequest, NextResponse } from 'next/server';

const API_SERVICE_URL = process.env.API_SERVICE_URL ?? 'http://localhost:8080';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ clientId: string; productId: string }> }
) {
  try {
    const { clientId, productId } = await params;
    const response = await fetch(`${API_SERVICE_URL}/api/v1/carts/${clientId}/items/${productId}`, {
      method: 'DELETE',
    });

    const data = await response.json().catch(() => ({ error: 'Upstream error' }));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
