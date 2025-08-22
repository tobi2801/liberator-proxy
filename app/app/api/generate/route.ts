import { NextResponse } from 'next/server';

// Browser-Test: GET /api/generate
export async function GET() {
  return NextResponse.json({ ok: true, route: '/api/generate' });
}

// cURL/Postman-Test: POST /api/generate
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return NextResponse.json({ ok: true, echo: body ?? null });
}
