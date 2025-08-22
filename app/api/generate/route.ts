import { NextResponse } from 'next/server';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',               // oder deine Domain
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store',
};

// 1) Preflight beantworten
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// 2) Optionaler GET-Check im Browser
export async function GET() {
  return NextResponse.json(
    { ok: true, info: 'Use POST to /api/generate' },
    { headers: CORS_HEADERS }
  );
}

// 3) Eigentlicher Proxy zu Make
export async function POST(req: Request) {
  try {
    const payload = await req.json();

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 30000);

    const r = await fetch(process.env.MAKE_WEBHOOK_URL as string, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(t);

    const text = await r.text();
    let data: any; try { data = JSON.parse(text); } catch { data = { result: text }; }

    return NextResponse.json(data, {
      status: r.ok ? 200 : r.status,
      headers: CORS_HEADERS,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'proxy-error' },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}
