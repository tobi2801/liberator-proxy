import { NextResponse } from 'next/server';

// Optionaler Browser-Check
export async function GET() {
  return NextResponse.json({ ok: true, info: 'Use POST to /api/generate' });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();

    // kleines Timeout, damit Requests nicht ewig hängen
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);

    const r = await fetch(process.env.MAKE_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(t);

    // Make schickt JSON { "result": "..." } – fallback auf Text falls nötig
    const text = await r.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { result: text }; }

    return NextResponse.json(data, { status: r.ok ? 200 : r.status });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'proxy-error' },
      { status: 502 }
    );
  }
}
