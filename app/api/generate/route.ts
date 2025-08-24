// app/api/generate/route.ts
import { NextResponse } from 'next/server';

/**
 * CORS-Header: erlaubt direkten Aufruf aus Lovable (Browser)
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

/** Healthcheck (Browser-Aufruf GET /api/generate) */
export async function GET() {
  return NextResponse.json(
    { ok: true, route: '/api/generate' },
    { headers: corsHeaders }
  );
}

/* -----------------------------------------------------------
 * Hilfsfunktionen
 * --------------------------------------------------------- */

/** sichere String-Konvertierung */
const str = (v: any) => (typeof v === 'string' ? v : '') as string;

/**
 * Lovable liefert verschachtelt (pressData…). Wir formen es in das
 * flache Schema um, das du in Make verwendest.
 */
function toFlatArray(input: any) {
  const obj = Array.isArray(input) ? input[0] : input;

  // Falls schon flach (topic/details existieren) → unverändert
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

/** Body genau einmal lesen */
async function readBodyOnce(req: Request): Promise<string> {
  try {
    return await req.text();
  } catch {
    const clone = req.clone();
    return await clone.text();
  }
}

/**
 * POST zu Make mit sanftem Retry, falls Make „Queue is full“ liefert.
 */
async function postToMake(bodyForMake: string) {
  const max = 3;
  for (let i = 0; i < max; i++) {
    const r = await fetch(process.env.MAKE_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: bodyForMake,
      cache: 'no-store',
    });

    const txt = await r.text();
    const isJson =
      (r.headers.get('content-type') || '').includes('application/json');

    const out = isJson
      ? (() => {
          try {
            return JSON.parse(txt);
          } catch {
            return { result: txt };
          }
        })()
      : { result: txt };

    // Make-Engpass: 400 + "Queue is full."
    if (
      r.status === 400 &&
      typeof out.result === 'string' &&
      out.result.includes('Queue is full')
    ) {
      if (i < max - 1) {
        await new Promise((res) => setTimeout(res, (i + 1) * 1200));
        continue;
      }
    }

    return { status: r.status, out };
  }
  return { status: 400, out: { result: 'Queue is full (retries exceeded).' } };
}

/* -----------------------------------------------------------
 * Route: POST /api/generate
 * --------------------------------------------------------- */
export async function POST(req: Request) {
  try {
    if (!process.env.MAKE_WEBHOOK_URL) {
      return NextResponse.json(
        { error: 'MAKE_WEBHOOK_URL is not set' },
        { status: 500, headers: corsHeaders }
      );
    }

    // 1) Body **einmal** lesen
    const bodyText = await readBodyOnce(req);

    let raw: any = bodyText;
    try {
      raw = JSON.parse(bodyText);
    } catch {
      // wenn kein JSON → als Text weiterreichen
    }

    // 2) Transformation nach flachem Schema
    const payload = typeof raw === 'string' ? raw : toFlatArray(raw);

    // 3) Echo-Test (Debug)
    const url = new URL(req.url);
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, payload }, { headers: corsHeaders });
    }

    // 4) An Make mit Retries
    const bodyForMake =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    const { status, out } = await postToMake(bodyForMake);

    // 5) Antwort an Lovable
    return NextResponse.json(out, {
      status: status || 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message ?? 'Proxy error',
        hint:
          'Stelle sicher, dass der Client nur EINEN POST sendet und die Response nur EINMAL liest.',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
