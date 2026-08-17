// src/pages/api/admin/quotes/[number]/balance.ts
//
// Staff-only (Cloudflare Access + middleware). Two-step: a plain submit
// bounces back to the admin page as a preview; confirm=true prices the
// actual counts with the same engine at the audience recorded at deposit
// time, credits the PAID deposit, and either sends the balance invoice or
// records a no-invoice settlement when nothing is owed. Spec §5.3.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import type { QuoteLineInput } from '@/lib/pricing/quote';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type PaymentsGateway, makeStripe, stripeGateway } from '@/lib/payments/gateway';
import { INVOICE_DAYS_UNTIL_DUE, computeBalance } from '@/lib/payments/terms';

export const prerender = false;

export interface BalanceDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  actorEmail: string;
}

const COUNT_KEY = /^counts\[([a-z0-9-]{1,64})\]$/;
const MARKER_KEY = /^markers\[([a-z0-9-]{1,64})\]$/;
const isPosInt = (s: string) => /^\d{1,7}$/.test(s) && Number(s) > 0;

// Also used by the admin page to render the preview from the query string
// (FormData on POST, URLSearchParams on the preview GET).
export function parseBalanceForm(
  fd: FormData | URLSearchParams,
): { inputs: QuoteLineInput[]; confirm: boolean } | null {
  const counts = new Map<string, number>();
  const markers = new Map<string, number>();
  for (const [k, v] of fd.entries()) {
    const val = typeof v === 'string' ? v.trim() : '';
    const c = k.match(COUNT_KEY);
    if (c) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      counts.set(c[1], Number(val));
      continue;
    }
    const m = k.match(MARKER_KEY);
    if (m) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      markers.set(m[1], Number(val));
    }
  }
  if (counts.size === 0) return null;
  const inputs: QuoteLineInput[] = [];
  for (const [slug, count] of counts) {
    const mk = markers.get(slug);
    inputs.push(
      mk && mk > 1 ? { serviceSlug: slug, count, markers: mk } : { serviceSlug: slug, count },
    );
  }
  return { inputs, confirm: fd.get('confirm') === 'true' };
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });

export async function handleBalance(
  request: Request,
  quoteNumber: string,
  deps: BalanceDeps,
): Promise<Response> {
  const admin = `/admin/quotes/${quoteNumber}`;
  const quote = await deps.db.getQuoteByNumber(quoteNumber);
  if (!quote) return new Response('Quote not found', { status: 404 });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return seeOther(`${admin}?error=input`);
  }
  const form = parseBalanceForm(fd);
  if (!form) return seeOther(`${admin}?error=input`);

  if (!form.confirm) {
    const qs = new URLSearchParams({ preview: '1' });
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && k !== 'confirm') qs.set(k, v);
    return seeOther(`${admin}?${qs.toString()}`);
  }

  const payments = await deps.db.listPayments(quote.id);
  const deposit = payments.find((p) => p.kind === 'deposit' && p.status === 'paid');
  if (quote.status !== 'deposit_paid' || !deposit || !quote.audience)
    return seeOther(`${admin}?error=state`);

  let computed: ReturnType<typeof computeBalance>;
  try {
    computed = computeBalance(form.inputs, quote.audience, {
      amountCents: deposit.amount_cents,
      invoiceLabel: deposit.stripe_invoice_id ?? 'deposit',
      paidAt: deposit.paid_at ?? deposit.created_at,
    });
  } catch {
    return seeOther(`${admin}?error=input`);
  }

  if (computed.balanceCents <= 0) {
    await deps.db.insertPayment({
      quote_id: quote.id,
      kind: 'balance',
      status: 'settled',
      amount_cents: computed.balanceCents,
      actual_lines: form.inputs,
      created_by: deps.actorEmail,
    });
    await deps.db.updateQuote(quote.id, { status: 'paid' });
    return seeOther(`${admin}?balance=settled&refund=${-computed.balanceCents}`);
  }

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'balance',
    amount_cents: computed.balanceCents,
    actual_lines: form.inputs,
    created_by: deps.actorEmail,
  });
  if (inserted === 'conflict') return seeOther(`${admin}?error=state`);
  const attempt = payments.filter((p) => p.kind === 'balance').length + 1;

  const customFields = [{ name: 'Quote', value: quote.quote_number }];
  if (quote.po_number) customFields.push({ name: 'PO number', value: quote.po_number });

  let created;
  try {
    created = await deps.gateway.createInvoice({
      customer: {
        id: quote.stripe_customer_id,
        email: quote.email,
        name: quote.name,
        organization: quote.organization,
        quoteId: quote.id,
      },
      kind: 'balance',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lines: computed.lines,
      footer: `Balance for BioKEA quote ${quote.quote_number}, computed on actual sample counts.`,
      customFields,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
      idempotencyKey: `balance:${quote.id}:${attempt}`,
    });
  } catch {
    await deps.db.deletePayment(inserted.id);
    return seeOther(`${admin}?error=stripe`);
  }

  await deps.db.updatePayment(inserted.id, {
    stripe_invoice_id: created.invoiceId,
    hosted_invoice_url: created.hostedInvoiceUrl,
    invoice_pdf: created.invoicePdf,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    status: 'balance_invoiced',
    stripe_customer_id: created.customerId,
  });
  return seeOther(`${admin}?balance=invoiced`);
}

export async function POST({ request, params, locals }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
  };
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !e?.STRIPE_SECRET_KEY) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  if (!locals.adminEmail) return new Response('Forbidden', { status: 403 }); // middleware sets it; belt and braces
  const number = params.number ?? '';
  if (!/^BK-\d{4}-\d{4,}$/.test(number)) return new Response('Quote not found', { status: 404 });
  return handleBalance(request, number, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: stripeGateway(makeStripe(e.STRIPE_SECRET_KEY)),
    actorEmail: locals.adminEmail,
  });
}
