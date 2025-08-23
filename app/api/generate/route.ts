import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  // Für Preflight-Anfragen (CORS Check)
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    // den kompletten Body (Lovable schickt JSON-Array mit einem Objekt)
    const body = await req.json();

    // an Make weiterreichen
    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), // Rohdaten weiterleiten
    });

    const data = await makeResp.json();

    return NextResponse.json(data, {
      status: makeResp.status,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? 'Proxy error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
