// src/pages/api/quote.ts
import type { APIContext, APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { buildQuote } from '@/lib/pricing/quote';
import { preflight, withCors } from '@/lib/cors';
import { shopifyConfigured, type ShopifyEnv } from '@/lib/payments/shopify-env';

export const prerender = false;

const NoLineBreaks = /^[^\r\n]+$/;

const QuoteSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NoLineBreaks),
  email: z.string().trim().email().max(254).regex(NoLineBreaks),
  organization: z.string().trim().max(200).regex(NoLineBreaks).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  lines: z
    .array(
      z.object({
        serviceSlug: z.string().regex(/^[a-z0-9-]{1,64}$/),
        count: z.number().int().positive().max(1_000_000),
        markers: z.number().int().positive().max(20).optional(),
      }),
    )
    .min(1)
    .max(4),
  // Optional so a cached widget bundle on the store keeps working; absent
  // means the pay endpoint collects them instead.
  audience: z.enum(['academic', 'commercial']).optional(),
  attest: z.boolean().optional(),
  website: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

interface Env extends ShopifyEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  CONTACT_TO_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
}

interface HandleQuoteOpts {
  paymentsEnabled?: boolean;
  dev?: boolean;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append('remoteip', remoteIp);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

const usd = (n: number) => '$' + n.toLocaleString('en-US');

export async function handleQuote(
  request: Request,
  e: Env,
  remoteIp?: string,
  opts?: HandleQuoteOpts,
): Promise<Response> {
  const res = await handleQuoteInner(request, e, remoteIp, opts);
  return withCors(res, request.headers.get('origin'), opts?.dev ?? false);
}

async function handleQuoteInner(
  request: Request,
  e: Env,
  remoteIp?: string,
  opts?: HandleQuoteOpts,
): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const parsed = QuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: 'Please fill in all required fields with valid values.' }, 400);
  }

  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: false, error: 'Invalid submission' }, 400);
  }

  if (e.TURNSTILE_SECRET_KEY) {
    const token = parsed.data['cf-turnstile-response'];
    if (!token) return json({ ok: false, error: 'Captcha missing. Please reload.' }, 400);
    const ok = await verifyTurnstile(token, e.TURNSTILE_SECRET_KEY, remoteIp);
    if (!ok) return json({ ok: false, error: 'Captcha failed. Please reload.' }, 400);
  }

  // Authoritative recompute. Anything the client sent about price is discarded.
  let quote;
  try {
    quote = buildQuote(parsed.data.lines);
  } catch {
    return json({ ok: false, error: 'That configuration is not valid.' }, 400);
  }

  const { name, email, organization, note } = parsed.data;
  const row = {
    email,
    name,
    organization: organization && organization.length > 0 ? organization : null,
    note: note && note.length > 0 ? note : null,
    lines: quote.lines,
    total_academic: quote.total.academic,
    total_commercial: quote.total.commercial,
    needs_conversation: quote.needsConversation,
    audience: parsed.data.audience ?? null,
    // Only meaningful for the academic rate, and only the pay endpoint may
    // rely on it — it re-checks before any money moves.
    academic_attested_at:
      parsed.data.audience === 'academic' && parsed.data.attest === true
        ? new Date().toISOString()
        : null,
  };

  // `quotes` has RLS enabled with zero policies, which denies anon/authenticated
  // every operation — including SELECT, which Postgres also applies to
  // `INSERT ... RETURNING`. The publishable key would insert the row but come
  // back with zero rows, so we'd never learn the generated quote_number/
  // access_token. SUPABASE_SERVICE_ROLE_KEY bypasses RLS and is required here.
  const insertRes = await fetch(`${e.SUPABASE_URL}/rest/v1/quotes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!insertRes.ok) {
    return json(
      { ok: false, error: 'Unable to save your quote right now. Please try again.' },
      502,
    );
  }

  // The row is already committed at this point, so a malformed or empty
  // RETURNING payload must produce a clean error rather than an unhandled
  // throw — the caller needs to know the quote may exist without a link.
  let inserted: { quote_number?: string; access_token?: string }[] = [];
  try {
    inserted = (await insertRes.json()) as typeof inserted;
  } catch {
    inserted = [];
  }
  const quoteNumber = inserted[0]?.quote_number;
  const accessToken = inserted[0]?.access_token;
  if (!quoteNumber || !accessToken) {
    return json(
      {
        ok: false,
        error:
          'Your quote was saved but we could not build its link. Please email contact@biokea.ai.',
      },
      502,
    );
  }
  const url = `https://biokea.ai/quote/${accessToken}`;

  const summary = quote.lines
    .map((l) => {
      const markerNote = l.markers > 1 ? ` × ${l.markers} markers` : '';
      const head = `  · ${l.serviceTitle}: ${l.count.toLocaleString()} ${l.unitLabel}s${markerNote}`;
      const academic =
        `      academic/nonprofit: ${usd(l.academic.total)} (${l.academic.tierRange} tier` +
        (l.academic.freeHeadroom > 0
          ? `, ships up to ${l.academic.pricedCount.toLocaleString()}`
          : '') +
        `)`;
      const commercial =
        `      commercial: ${usd(l.commercial.total)} (${l.commercial.tierRange} tier` +
        (l.commercial.freeHeadroom > 0
          ? `, ships up to ${l.commercial.pricedCount.toLocaleString()}`
          : '') +
        `)`;
      return [head, academic, commercial].join('\n');
    })
    .join('\n');

  const { audience } = parsed.data;
  const totalLine = audience
    ? `Total: ${usd(quote.total[audience])} (${audience === 'academic' ? 'academic/nonprofit' : 'commercial'} rate)`
    : `Total: ${usd(quote.total.academic)} academic/nonprofit · ${usd(quote.total.commercial)} commercial`;

  const closing = quote.needsConversation
    ? `Because of the volume involved, we'll follow up to confirm scheduling and final pricing before anything is committed.`
    : opts?.paymentsEnabled
      ? [
          `Pay in full and start your project:`,
          `${url}#pay`,
          ``,
          `Card, Shop Pay, and PayPal are accepted. Paying by purchase order?`,
          `The same page will email you a Net-30 invoice to forward to purchasing.`,
          ``,
          `Paying in full locks your rate and reserves lab capacity. Your quoted`,
          `per-sample rate is held for this project — send fewer samples than quoted`,
          `and the unused amount stays as credit toward another project for 12 months;`,
          `send more and we invoice the difference at the same rate.`,
          ``,
          `Quote valid for 30 days. Full terms: https://biokea.ai/terms`,
        ].join('\n')
      : `Quote valid for 30 days. Reply to this email to start a project.`;

  const text = [
    `Your BioKEA quote — ${quoteNumber}`,
    ``,
    summary,
    ``,
    totalLine,
    ``,
    `View or print this quote: ${url}`,
    ``,
    closing,
    ``,
    `— The BioKEA team`,
    `https://biokea.ai/`,
  ].join('\n');

  // The quote is already persisted and retrievable via `url`, so an email
  // failure must not fail the request. Swallow both non-2xx responses and
  // thrown network errors; the user still gets their number and link.
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${e.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `BioKEA <${e.CONTACT_FROM_EMAIL}>`,
        to: email,
        reply_to: 'contact@biokea.ai',
        subject: `Your BioKEA quote — ${quoteNumber}`,
        text,
      }),
    });
  } catch {
    // ignore — the quote is saved and the response carries the link
  }

  // Notify BioKEA. Separate try/catch for the same reason as above: the
  // quote is already saved, so no email outcome may fail the request.
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${e.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `BioKEA <${e.CONTACT_FROM_EMAIL}>`,
        to: e.CONTACT_TO_EMAIL,
        reply_to: email,
        subject: `[quote] ${quoteNumber} — ${name}${organization ? ` (${organization})` : ''}`,
        text: [
          `New quote request — ${quoteNumber}`,
          ``,
          `Name: ${name}`,
          `Email: ${email}`,
          `Organization: ${organization || '—'}`,
          `Rate: ${audience ?? '—'}`,
          ``,
          summary,
          ``,
          `Total: ${usd(quote.total.academic)} academic/nonprofit · ${usd(quote.total.commercial)} commercial`,
          quote.needsConversation ? `\nFLAGGED: volume requires a capacity conversation.` : '',
          ``,
          `Note from customer:`,
          note && note.length > 0 ? note : '(none)',
          ``,
          `Quote: ${url}`,
        ].join('\n'),
      }),
    });
  } catch {
    // ignore — the quote is saved and the customer already has their link
  }

  return json(
    { ok: true, quoteNumber, url, token: accessToken, paymentsEnabled: !!opts?.paymentsEnabled },
    200,
  );
}

export async function POST({ request, clientAddress }: APIContext): Promise<Response> {
  const e = env as unknown as Env;
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL ||
    !e?.CONTACT_TO_EMAIL
  ) {
    return withCors(
      json({ ok: false, error: 'Quotes are not configured.' }, 500),
      request.headers.get('origin'),
      import.meta.env.DEV,
    );
  }
  return handleQuote(request, e, clientAddress, {
    paymentsEnabled: shopifyConfigured(e),
    dev: import.meta.env.DEV,
  });
}

export const OPTIONS: APIRoute = ({ request }) => preflight(request, import.meta.env.DEV);
