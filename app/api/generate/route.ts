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
    // 1) Body 1:1 übernehmen (Lovable sendet Array mit einem Objekt)
    const body = await req.json();

    // 2) An Make weiterleiten
    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // 3) Robust parsen: JSON? -> json(); sonst -> text()
    const ct = makeResp.headers.get('content-type') || '';
    let out: any;
    if (ct.includes('application/json')) {
      try {
        out = await makeResp.json();
      } catch {
        // Header sagt JSON, Body ist es aber nicht -> auf Text fallen
        const txt = await makeResp.text();
        out = { result: txt };
      }
    } else {
      const txt = await makeResp.text();
      // Wenn Make Fehltext liefert, trotzdem gültiges JSON zurückgeben
      out = { result: txt };
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
