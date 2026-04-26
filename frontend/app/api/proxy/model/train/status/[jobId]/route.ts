import { NextResponse } from 'next/server';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:3001';

export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const { jobId } = params;
    const response = await fetch(`${AI_SERVICE_URL}/api/v1/model/train/status/${jobId}`, {
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream error';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
