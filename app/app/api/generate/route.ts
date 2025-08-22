import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true, info: 'Use POST to /api/generate' });
}

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const response = await fetch(process.env.MAKE_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
