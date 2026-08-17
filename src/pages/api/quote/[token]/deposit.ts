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
import { type PaymentsGateway, makeStripe, stripeGateway } from '@/lib/payments/gateway';
import {
  DEPOSIT_FRACTION,
  INVOICE_DAYS_UNTIL_DUE,
  assertDepositSane,
  depositLines,
  depositTotalCents,
} from '@/lib/payments/terms';
import type { QuoteRecord } from '@/lib/payments/types';

export const prerender = false;

const FormSchema = z
  .object({
    audience: z.enum(['academic', 'commercial']),
    attest: z.string().optional(),
    po_number: z
      .string()
      .trim()
      .max(64)
      .regex(/^[^\r\n]*$/)
      .optional()
      .or(z.literal('')),
  })
  .refine((f) => f.audience !== 'academic' || f.attest === 'true', {
    message: 'academic requires attestation',
  });

export interface DepositDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  now?: () => Date;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
const back = (token: string, reason: 'unavailable' | 'failed') =>
  seeOther(`/quote/${token}?pay=${reason}`);

async function liveDepositUrl(db: PaymentsDb, quote: QuoteRecord): Promise<string | null> {
  const payments = await db.listPayments(quote.id);
  const live = payments.find(
    (p) => p.kind === 'deposit' && (p.status === 'open' || p.status === 'paid'),
  );
  return live?.hosted_invoice_url ?? null;
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

  const lines = depositLines(quote.lines, form.audience);
  const amountCents = depositTotalCents(lines);
  const total = form.audience === 'academic' ? quote.total_academic : quote.total_commercial;
  assertDepositSane(total, amountCents, lines.length); // throws → 500 via the wrapper; deliberate

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
  const customFields = [{ name: 'Quote', value: quote.quote_number }];
  if (poNumber) customFields.push({ name: 'PO number', value: poNumber });

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
      kind: 'deposit',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lines,
      footer:
        `${pct} deposit toward BioKEA quote ${quote.quote_number} (valid to ${quote.expires_at.slice(0, 10)}).` +
        ` The balance is invoiced on actual sample counts when results are delivered.`,
      customFields,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
      idempotencyKey: `deposit:${quote.id}`,
    });
  } catch {
    await deps.db.deletePayment(inserted.id);
    return back(token, 'failed');
  }

  await deps.db.updatePayment(inserted.id, {
    stripe_invoice_id: created.invoiceId,
    hosted_invoice_url: created.hostedInvoiceUrl,
    invoice_pdf: created.invoicePdf,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    status: 'deposit_invoiced',
    audience: form.audience,
    academic_attested_at: form.audience === 'academic' ? now().toISOString() : null,
    po_number: poNumber,
    stripe_customer_id: created.customerId,
  });

  return seeOther(created.hostedInvoiceUrl);
}

export async function POST({ request, params }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
  };
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !e?.STRIPE_SECRET_KEY) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  const token = params.token ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Quote not found', { status: 404 });
  }
  return handleDeposit(request, token, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: stripeGateway(makeStripe(e.STRIPE_SECRET_KEY)),
  });
}
