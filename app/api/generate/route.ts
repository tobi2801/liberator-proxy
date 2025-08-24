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

const s = (v: any) => (typeof v === 'string' ? v : '') as string;
const b = (v: any) => Boolean(v);

/** Body genau einmal lesen (verhindert "Body has already been read") */
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
    const isJson = (r.headers.get('content-type') || '').includes('application/json');

    const out = isJson
      ? (() => { try { return JSON.parse(txt); } catch { return { result: txt }; } })()
      : { result: txt };

    // Make-Engpass: 400 + "Queue is full."
    if (r.status === 400 && typeof out.result === 'string' && out.result.includes('Queue is full')) {
      if (i < max - 1) {
        await new Promise(res => setTimeout(res, (i + 1) * 1200)); // 1.2s, 2.4s
        continue;
      }
    }
    return { status: r.status, out };
  }
  return { status: 400, out: { result: 'Queue is full (retries exceeded).' } };
}

/* -----------------------------------------------------------
 * Normalisierung: verschachtelte Lovable-Payload → flaches Schema
 * für Make. Unterstützt press, motion, speech, social + Fallback.
 * Rückgabe ist IMMER: [ <ein flaches Objekt> ]
 * --------------------------------------------------------- */

function normalizePayload(raw: any) {
  const obj = Array.isArray(raw) ? raw[0] : (raw || {});
  const tool = String(obj?.tool ?? 'press');
  const organization = String(obj?.organization ?? '');

  // Falls bereits "flach": tool vorhanden und irgendein Kernfeld
  const looksFlat =
    obj && typeof obj === 'object' && 'tool' in obj &&
    (
      'topic' in obj || 'details' in obj || 'idea' in obj ||
      'content' in obj || 'input_text' in obj || 'inputText' in obj ||
      'platforms' in obj || 'rhetoric_pattern' in obj || 'duration_minutes' in obj
    );
  if (looksFlat) return [obj];

  const out: any = { tool, organization };

  switch (tool) {
    case 'press': {
      const pd = obj?.pressData ?? {};
      const quotes: any[] = Array.isArray(pd.quotes) ? pd.quotes : [];
      const q = (i: number) => ({ name: s(quotes[i]?.name), func: s(quotes[i]?.function) });
      const c = pd.contact ?? {};
      Object.assign(out, {
        topic: s(pd.topic),
        details: s(pd.details),

        // bis zu 3 Zitate
        quote1_name: q(0).name, quote1_function: q(0).func,
        quote2_name: q(1).name, quote2_function: q(1).func,
        quote3_name: q(2).name, quote3_function: q(2).func,

        // Kontakt
        contact_name: s(c.name),
        contact_function: s(c.function),
        contact_details: s(c.contactDetails),

        include_organization: b(pd.includeOrganization),
        organization_unit: s(pd.organizationUnit),
      });
      break;
    }

    case 'motion': {
      const md = obj?.motionData ?? {};
      Object.assign(out, {
        idea: s(md.idea),
        details: s(md.details),
        include_research: b(md.includeResearch),
      });
      break;
    }

    case 'speech': {
      const sd = obj?.speechData ?? {};
      const duration = Array.isArray(sd.duration) ? Number(sd.duration[0]) : Number(sd.duration ?? 0);
      Object.assign(out, {
        topic: s(sd.topic),
        rhetoric_pattern: s(sd.rhetoricPattern),
        duration_minutes: isNaN(duration) ? 0 : duration,
      });
      break;
    }

    case 'social': {
      const so = obj?.socialData ?? {};
      const platforms = Array.isArray(so.platforms) ? so.platforms.map(String) : [];
      Object.assign(out, {
        platforms,
        topic: s(so.topic),
        content: s(so.content),
        include_organization: b(so.includeOrganization),
        organization_unit: s(so.organizationUnit),
      });
      break;
    }

    default: {
      // Fallback: Freitext / generisch
      out.input_text = s(obj?.inputText ?? obj?.text ?? '');
      break;
    }
  }

  return [out];
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

    // 2) JSON parsen (falls möglich)
    let raw: any = bodyText;
    try { raw = JSON.parse(bodyText); } catch { /* wenn kein JSON → als Text weiterreichen */ }

    // 3) Normalisieren zu flachem Schema
    const payload =
      typeof raw === 'string'
        ? [{ tool: 'generic', input_text: raw }]
        : normalizePayload(raw);

    // 4) Echo-Test (Debug)
    const url = new URL(req.url);
    if (url.searchParams.get('echo') === '1') {
      return NextResponse.json({ ok: true, payload }, { headers: corsHeaders });
    }

    // 5) An Make mit Retries
    const bodyForMake = JSON.stringify(payload);
    const { status, out } = await postToMake(bodyForMake);

    // 6) Antwort an Lovable
    return NextResponse.json(out, {
      status: status || 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message ?? 'Proxy error',
        hint: 'Stelle sicher, dass der Client nur EINEN POST sendet und die Response nur EINMAL liest.',
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
