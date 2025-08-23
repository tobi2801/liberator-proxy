import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const raw = await req.json();
    // Array → erstes Element, sonst Objekt beibehalten
    const body = Array.isArray(raw) ? raw[0] : raw;

    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const ct = makeResp.headers.get('content-type') || '';
    let out: any;
    if (ct.includes('application/json')) {
      try { out = await makeResp.json(); }
      catch { out = { result: await makeResp.text() }; }
    } else {
      out = { result: await makeResp.text() };
    }

    return NextResponse.json(out, {
      status: makeResp.status || 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? 'Proxy error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
