// src/pages/api/quote.ts
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { buildQuote } from '@/lib/pricing/quote';

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
  website: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

interface Env {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
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

export async function handleQuote(request: Request, e: Env, remoteIp?: string): Promise<Response> {
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

  const inserted = (await insertRes.json()) as { quote_number: string; access_token: string }[];
  const { quote_number: quoteNumber, access_token: accessToken } = inserted[0];
  const url = `https://biokea.ai/quote/${accessToken}`;

  const summary = quote.lines
    .map(
      (l) =>
        `  · ${l.serviceTitle}: ${l.count.toLocaleString()} ${l.unitLabel}s` +
        (l.markers > 1 ? ` × ${l.markers} markers` : '') +
        ` — ${usd(l.academic.total)} academic / ${usd(l.commercial.total)} commercial`,
    )
    .join('\n');

  const text = [
    `Your BioKEA quote — ${quoteNumber}`,
    ``,
    summary,
    ``,
    `Total: ${usd(quote.total.academic)} academic/nonprofit · ${usd(quote.total.commercial)} commercial`,
    ``,
    `View or print this quote: ${url}`,
    ``,
    quote.needsConversation
      ? `Because of the volume involved, we'll follow up to confirm scheduling and final pricing before anything is committed.`
      : `Quote valid for 30 days. Reply to this email to start a project.`,
    ``,
    `— The BioKEA team`,
    `https://biokea.ai/`,
  ].join('\n');

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

  return json({ ok: true, quoteNumber, url }, 200);
}

export async function POST({ request, clientAddress }: APIContext): Promise<Response> {
  const e = env as unknown as Env;
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !e?.RESEND_API_KEY) {
    return json({ ok: false, error: 'Quotes are not configured.' }, 500);
  }
  return handleQuote(request, e, clientAddress);
}
