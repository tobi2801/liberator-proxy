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
    // 1) Rohdaten holen (Objekt oder Array ist ok)
    const body = await req.json();
    console.log('[proxy] incoming body:', body);

    // 2) Optionaler Echo-Modus zum schnellen Test:
    const url = new URL(req.url);
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, echoed: body }, { headers: corsHeaders });
    }

    // 3) An Make weiterleiten
    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const ct = makeResp.headers.get('content-type') || '';
    let out: any;

    if (ct.includes('application/json')) {
      try {
        out = await makeResp.json();
      } catch {
        const txt = await makeResp.text();
        out = { result: txt };
      }
    } else {
      const txt = await makeResp.text();
      out = { result: txt };
    }

    console.log('[proxy] make status:', makeResp.status, 'out:', out);

    return NextResponse.json(out, {
      status: makeResp.status || 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error('[proxy] error:', err);
    return NextResponse.json(
      { error: err?.message ?? 'Proxy error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
