import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

// kleine Helfer
const str = (v: any) => (typeof v === 'string' ? v : '') as string;

function toFlatArray(input: any) {
  const obj = Array.isArray(input) ? input[0] : input;

  // schon flach?
  if (obj && typeof obj === 'object' && 'topic' in obj && 'details' in obj) {
    return [obj];
  }

  const tool = obj?.tool ?? 'press';
  const organization = obj?.organization ?? '';
  const pd = obj?.pressData ?? {};
  const quotes: any[] = Array.isArray(pd.quotes) ? pd.quotes : [];

  const q = (i: number) => ({
    name: str(quotes[i]?.name),
    func: str(quotes[i]?.function),
  });

  const q1 = q(0);
  const q2 = q(1);
  const q3 = q(2);

  const contact = pd.contact ?? {};

  const flat = {
    tool: String(tool),
    organization: String(organization),
    topic: str(pd.topic),
    details: str(pd.details),

    quote1_name: q1.name,
    quote1_function: q1.func,
    quote2_name: q2.name,
    quote2_function: q2.func,
    quote3_name: q3.name,
    quote3_function: q3.func,

    contact_name: str(contact.name),
    contact_function: str(contact.function),
    contact_details: str(contact.contactDetails),

    include_organization: Boolean(pd.includeOrganization),
    organization_unit: str(pd.organizationUnit),
  };

  return [flat];
}

export async function POST(req: Request) {
  try {
    // ---- WICHTIG: Body nur EINMAL lesen (als Text) ----
    const bodyText = await req.text();               // <- kein req.json()
    let raw: any;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      // wenn kein JSON: trotzdem weiterreichen (z. B. für echo‑Tests)
      raw = bodyText;
    }

    const url = new URL(req.url);

    // Normalisieren (immer: Array mit 1 flachem Objekt)
    const payload = typeof raw === 'string' ? raw : toFlatArray(raw);

    // Nur Transformation prüfen, ohne Make (Debug):
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, payload }, { headers: corsHeaders });
    }

    // An Make senden – Body ebenfalls nur EINMAL erzeugen
    const bodyForMake =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyForMake,
      cache: 'no-store',
    });

    // Make‑Antwort genau EINMAL lesen
    const ct = makeResp.headers.get('content-type') || '';
    let out: any;
    if (ct.includes('application/json')) {
      try {
        out = await makeResp.json();
      } catch {
        out = { result: await makeResp.text() };
      }
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
