// src/pages/api/quote/[token]/deposit.ts
//
// "Pay 50% deposit" on /quote/<token>. Creates the Stripe customer +
// deposit invoice and sends the browser to Stripe's hosted invoice page.
// A plain form post so it works without JavaScript; every non-success
// path is a 303 back to the quote page with ?pay=… (spec §5.3, with the
// redirect deviation noted in the plan's Global Constraints).
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type PaymentsGateway, shopifyGateway } from '@/lib/payments/gateway';
import {
  DEPOSIT_FRACTION,
  INVOICE_DAYS_UNTIL_DUE,
  assertDepositSane,
  depositLines,
  depositTotalCents,
} from '@/lib/payments/terms';
import type { QuoteRecord } from '@/lib/payments/types';

export const prerender = false;

const FormSchema = z.object({
  audience: z.enum(['academic', 'commercial']),
  attest: z.string().optional(),
  po_number: z
    .string()
    .trim()
    .max(64)
    .regex(/^[^\r\n]*$/)
    .optional()
    .or(z.literal('')),
});

export interface DepositDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  now?: () => Date;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
const back = (token: string, reason: 'unavailable' | 'failed' | 'attest') =>
  seeOther(`/quote/${token}?pay=${reason}`);

async function liveDepositUrl(db: PaymentsDb, quote: QuoteRecord): Promise<string | null> {
  const payments = await db.listPayments(quote.id);
  const live = payments.find(
    (p) => p.kind === 'deposit' && (p.status === 'open' || p.status === 'paid'),
  );
  return live?.hosted_url ?? null;
}

export async function handleDeposit(
  request: Request,
  token: string,
  deps: DepositDeps,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const quote = await deps.db.getQuoteByToken(token);
  if (!quote) return new Response('Quote not found', { status: 404 });

  // Idempotency first: a second submit (double click, back button, or the
  // quote expiring after the invoice went out) just goes to the invoice.
  const existing = await liveDepositUrl(deps.db, quote);
  if (existing) return seeOther(existing);

  const expired = Date.parse(quote.expires_at) < now().getTime();
  if (quote.status !== 'quoted' || quote.needs_conversation || expired)
    return back(token, 'unavailable');

  let form: z.infer<typeof FormSchema>;
  try {
    const fd = await request.formData();
    const fields: Record<string, string> = {};
    for (const [k, v] of fd.entries()) fields[k] = typeof v === 'string' ? v : '';
    const parsed = FormSchema.safeParse(fields);
    if (!parsed.success) return back(token, 'unavailable');
    form = parsed.data;
  } catch {
    return back(token, 'unavailable');
  }

  if (form.audience === 'academic' && form.attest !== 'true') return back(token, 'attest');

  const lines = depositLines(quote.lines, form.audience);
  const amountCents = depositTotalCents(lines);
  const total = form.audience === 'academic' ? quote.total_academic : quote.total_commercial;
  try {
    assertDepositSane(total, amountCents, lines.length);
  } catch (err) {
    console.error('[deposit] sanity check failed for', quote.quote_number, err);
    return back(token, 'failed');
  }

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'deposit',
    amount_cents: amountCents,
  });
  if (inserted === 'conflict') {
    // Lost a race with a concurrent submit; that one owns the invoice.
    const url = await liveDepositUrl(deps.db, quote);
    return url ? seeOther(url) : back(token, 'failed');
  }

  const poNumber = form.po_number && form.po_number.length > 0 ? form.po_number : null;
  const pct = `${Math.round(DEPOSIT_FRACTION * 100)}%`;

  let created;
  try {
    created = await deps.gateway.createInvoice({
      customer: {
        id: quote.external_customer_id,
        email: quote.email,
        name: quote.name,
        organization: quote.organization,
        quoteId: quote.id,
      },
      kind: 'deposit',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      // keyed on the payment row id — unique per attempt, so a voided/failed
      // attempt never replays a stale draft order (spec §6 'new idempotency
      // key suffix').
      paymentId: inserted.id,
      poNumber,
      lines,
      footer:
        `${pct} deposit toward BioKEA quote ${quote.quote_number} (valid to ${quote.expires_at.slice(0, 10)}).` +
        ` The balance is invoiced on actual sample counts when results are delivered.` +
        ` Pay here or from the emailed invoice; questions: contact@biokea.ai.`,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
    });
  } catch {
    await deps.db.deletePayment(inserted.id);
    return back(token, 'failed');
  }

  await deps.db.updatePayment(inserted.id, {
    external_id: created.externalId,
    hosted_url: created.hostedUrl,
    pdf_url: created.pdfUrl,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    audience: form.audience,
    academic_attested_at: form.audience === 'academic' ? now().toISOString() : null,
    po_number: poNumber,
    external_customer_id: created.customerId,
  });
  // conditional step — never clobber a status the payment webhook may
  // already have advanced
  await deps.db.updateQuoteStatusIf(quote.id, 'quoted', 'deposit_invoiced');

  return seeOther(created.hostedUrl);
}

export async function POST({ request, params }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SHOPIFY_STORE_DOMAIN?: string;
    SHOPIFY_ADMIN_TOKEN?: string;
    SHOPIFY_PAYMENT_TERMS_TEMPLATE?: string;
  };
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.SHOPIFY_ADMIN_TOKEN ||
    !e?.SHOPIFY_STORE_DOMAIN
  ) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  const token = params.token ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Quote not found', { status: 404 });
  }
  return handleDeposit(request, token, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: shopifyGateway({
      storeDomain: e.SHOPIFY_STORE_DOMAIN,
      adminToken: e.SHOPIFY_ADMIN_TOKEN,
      paymentTermsTemplate: e.SHOPIFY_PAYMENT_TERMS_TEMPLATE ?? 'NET_30',
    }),
  });
}
