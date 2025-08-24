import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

const str = (v: any) => (typeof v === 'string' ? v : '') as string;

function toFlatArray(input: any) {
  // Eingabe kann Array oder Objekt sein
  const obj = Array.isArray(input) ? input[0] : input;

  // Schon flach? (topic/details vorhanden) → als Array zurückgeben
  if (obj && typeof obj === 'object' && 'topic' in obj && 'details' in obj) {
    return [obj];
  }

  // Verschachtelte Struktur mit pressData:
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
    const raw = await req.json();
    const url = new URL(req.url);

    // 1) Normalisieren (immer: Array mit 1 flachem Objekt)
    const payload = toFlatArray(raw);

    // Echo-Modus zum lokalen Testen (um Make auszuschließen)
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, payload }, { headers: corsHeaders });
    }

    // 2) An Make weiterreichen
    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    // 3) Antwort robust weiterreichen (JSON/Text)
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
