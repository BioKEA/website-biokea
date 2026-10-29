// src/pages/api/admin/quotes/[number]/finalise.ts
//
// Staff-only (Cloudflare Access + middleware). Firms up a consult quote
// (spec 3: docs/superpowers/specs/2026-10-29-consult-finalisation-design.md).
// Two-step like the balance endpoint: a plain submit, or any invalid form,
// bounces back to the admin page as a preview; confirm=true re-prices the
// lines with the engine, writes them with a conditional update, and emails
// the customer that the quote is ready to pay.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { finaliseFrom, parseFinaliseForm, priceFirm } from '@/lib/payments/finalise';
import { type EmailSender, resendSender } from '@/lib/email/resend';
import { firmQuoteReadyEmail } from '@/lib/email/quote-finalised';

export const prerender = false;

export interface FinaliseDeps {
  db: PaymentsDb;
  actorEmail: string;
  email: EmailSender;
  now?: () => Date;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
const DAY_MS = 24 * 60 * 60 * 1000;

export async function handleFinalise(
  request: Request,
  quoteNumber: string,
  deps: FinaliseDeps,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const admin = `/admin/quotes/${quoteNumber}`;
  const quote = await deps.db.getQuoteByNumber(quoteNumber);
  if (!quote) return new Response('Quote not found', { status: 404 });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return seeOther(`${admin}?error=finalise-input#firm`);
  }

  const form = parseFinaliseForm(fd);
  const priced = form.ok ? priceFirm(form.inputs) : null;
  // The page re-parses these params and shows the preview or the errors,
  // so an invalid form never needs its own error channel.
  if (!form.ok || !form.confirm || !priced?.ok) {
    const qs = new URLSearchParams({ preview: 'finalise' });
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && k !== 'confirm') qs.set(k, v);
    return seeOther(`${admin}?${qs.toString()}#firm`);
  }

  const from = finaliseFrom(quote, await deps.db.listPayments(quote.id));
  if (!from) return seeOther(`${admin}?error=finalise-state#firm`);

  // Read before the update: the quote object may be the stored row itself.
  const revised = Boolean(quote.finalised_at);
  const firm = priced.quote;
  const finalisedAt = now();
  const patch = {
    lines: firm.lines,
    total_academic: firm.total.academic,
    total_commercial: firm.total.commercial,
    needs_conversation: false,
    status: 'quoted' as const,
    expires_at: new Date(finalisedAt.getTime() + form.days * DAY_MS).toISOString(),
    finalised_at: finalisedAt.toISOString(),
    finalised_by: deps.actorEmail,
    lab_note: form.note,
  };
  let saved: boolean;
  try {
    saved = await deps.db.finaliseQuoteIf(quote.id, from, patch);
  } catch (err) {
    // Most likely migration 0010 is not applied yet (PostgREST rejects a
    // PATCH naming an unknown column).
    console.error('[finalise] update failed for', quote.quote_number, err);
    return seeOther(`${admin}?error=finalise-db#firm`);
  }
  if (!saved) return seeOther(`${admin}?error=finalise-state#firm`);

  try {
    await deps.email(firmQuoteReadyEmail({ ...quote, ...patch }, revised));
  } catch (err) {
    console.error('[finalise] email failed for', quote.quote_number, err);
    return seeOther(`${admin}?finalised=email-failed#firm`);
  }
  return seeOther(`${admin}?finalised=sent#firm`);
}

export async function POST({ request, params, locals }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
  };
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL
  ) {
    return new Response('Quotes are not configured.', { status: 500 });
  }
  if (!locals.adminEmail) return new Response('Forbidden', { status: 403 }); // middleware sets it; belt and braces
  const number = params.number ?? '';
  if (!/^BK-\d{4}-\d{4,}$/.test(number)) return new Response('Quote not found', { status: 404 });
  return handleFinalise(request, number, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    actorEmail: locals.adminEmail,
    email: resendSender(
      { RESEND_API_KEY: e.RESEND_API_KEY, CONTACT_FROM_EMAIL: e.CONTACT_FROM_EMAIL },
      { strict: true },
    ),
  });
}
