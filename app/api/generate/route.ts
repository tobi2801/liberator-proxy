import { NextResponse } from 'next/server';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

// ---- Hilfen --------------------------------------------------------

const str = (v: any) => (typeof v === 'string' ? v : '') as string;

function toFlatArray(input: any) {
  const obj = Array.isArray(input) ? input[0] : input;

  // Bereits flach?
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

// Body sicher lesen (einmal). Wenn schon konsumiert: clone versuchen.
async function readBodyOnce(req: Request): Promise<string> {
  try {
    return await req.text();
  } catch (e) {
    // Falls bereits konsumiert (z. B. von Middleware), versuche Clone
    try {
      const clone = req.clone();
      return await clone.text();
    } catch (e2) {
      throw e; // ursprünglichen Fehler weiterreichen
    }
  }
}

// ---- Route ---------------------------------------------------------

export async function POST(req: Request) {
  try {
    // 1) Body genau einmal lesen
    const bodyText = await readBodyOnce(req);

    let raw: any = bodyText;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      // kein JSON → lassen wir als Text (für echo-Tests)
    }

    const url = new URL(req.url);
    const payload = typeof raw === 'string' ? raw : toFlatArray(raw);

    // Debug ohne Make
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, payload }, { headers: corsHeaders });
    }

    // 2) An Make (Body einmal erzeugen)
    const bodyForMake =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const makeResp = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyForMake,
      cache: 'no-store',
    });

    // 3) Make-Antwort genau einmal konsumieren
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
      {
        error: err?.message ?? 'Proxy error',
        hint:
          'Stelle sicher, dass die Response im Frontend nur einmal gelesen wird und kein zweiter Request gesendet wird.',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
