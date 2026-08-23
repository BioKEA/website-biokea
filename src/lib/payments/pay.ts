// src/lib/payments/pay.ts
//
// "Pay in full" on /quote/<token>. Creates the Shopify draft order + sends
// the invoice, then either sends the browser to Shopify's hosted invoice
// (checkout) page (intent=pay) or back to the quote page (intent=invoice,
// which attaches net terms for institutional purchasing). A plain form
// post so it works without JavaScript; every non-success path is a 303
// back to the quote page with ?pay=… (spec §5.3, with the redirect
// deviation noted in the plan's Global Constraints).
import { z } from 'zod';
import type { PaymentsDb } from '@/lib/payments/db';
import type { PaymentsGateway } from '@/lib/payments/gateway';
import {
  INVOICE_DAYS_UNTIL_DUE,
  assertPaymentSane,
  paymentLines,
  paymentTotalCents,
} from '@/lib/payments/terms';
import type { QuoteRecord } from '@/lib/payments/types';

const FormSchema = z.object({
  // Optional: the widget now records the audience on the quote at creation
  // time, so a form that omits it falls back to quote.audience.
  audience: z.enum(['academic', 'commercial']).optional(),
  attest: z.string().optional(),
  intent: z.enum(['pay', 'invoice']).default('pay'),
  po_number: z
    .string()
    .trim()
    .max(64)
    .regex(/^[^\r\n]*$/)
    .optional()
    .or(z.literal('')),
});

export interface PaymentDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  now?: () => Date;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
// Carry the buyer's selections through the bounce so the panel comes back
// prefilled, and anchor to it so they land on the panel, not the page top.
const back = (
  token: string,
  reason: 'unavailable' | 'failed' | 'attest',
  keep?: { audience?: string; po?: string },
) => {
  const qs = new URLSearchParams({ pay: reason });
  if (keep?.audience) qs.set('audience', keep.audience);
  if (keep?.po) qs.set('po', keep.po);
  return seeOther(`/quote/${token}?${qs.toString()}#pay`);
};

async function liveDepositUrl(db: PaymentsDb, quote: QuoteRecord): Promise<string | null> {
  const payments = await db.listPayments(quote.id);
  const live = payments.find(
    (p) => p.kind === 'deposit' && (p.status === 'open' || p.status === 'paid'),
  );
  return live?.hosted_url ?? null;
}

export async function handlePayment(
  request: Request,
  token: string,
  deps: PaymentDeps,
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

  const audience = form.audience ?? quote.audience;
  if (!audience) return back(token, 'unavailable');

  // Server-authoritative, as before — but the attestation may have been
  // captured in the configurator and already persisted on the quote.
  if (audience === 'academic' && form.attest !== 'true' && !quote.academic_attested_at)
    return back(token, 'attest', { audience, po: form.po_number || undefined });

  const lines = paymentLines(quote.lines, audience);
  const amountCents = paymentTotalCents(lines);
  const total = audience === 'academic' ? quote.total_academic : quote.total_commercial;
  try {
    assertPaymentSane(total, amountCents, lines.length);
  } catch (err) {
    console.error('[pay] sanity check failed for', quote.quote_number, err);
    return back(token, 'failed', { audience, po: form.po_number || undefined });
  }

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'deposit',
    amount_cents: amountCents,
  });
  if (inserted === 'conflict') {
    // Lost a race with a concurrent submit; that one owns the invoice.
    const url = await liveDepositUrl(deps.db, quote);
    return url ? seeOther(url) : back(token, 'failed', { audience });
  }

  const poNumber = form.po_number && form.po_number.length > 0 ? form.po_number : null;

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
      netTerms: form.intent === 'invoice',
      lines,
      footer:
        `Payment in full for BioKEA quote ${quote.quote_number} (valid to ${quote.expires_at.slice(0, 10)}).` +
        ` Your quoted per-sample rate is held for this project: ship fewer samples than quoted and the` +
        ` unused amount stays as credit toward another project for 12 months; ship more and we invoice` +
        ` the difference at the same rate. Questions: contact@biokea.ai.`,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
    });
  } catch (err) {
    console.error(
      '[pay] gateway failed for',
      quote.quote_number,
      err instanceof Error ? err.message : err,
    );
    await deps.db.deletePayment(inserted.id);
    return back(token, 'failed', { audience, po: poNumber ?? undefined });
  }

  // The invoice email is already sent at this point — failing the request
  // here would strand a live invoice with no payment record to show for
  // it, so a mismatch is logged (the alert) rather than blocking checkout.
  if (created.amountDueCents !== amountCents) {
    console.error('[payments] Shopify total mismatch', {
      quote: quote.quote_number,
      kind: 'deposit',
      expected: amountCents,
      got: created.amountDueCents,
      draft: created.externalId,
    });
  }

  await deps.db.updatePayment(inserted.id, {
    external_id: created.externalId,
    hosted_url: created.hostedUrl,
    pdf_url: created.pdfUrl,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    audience,
    academic_attested_at: audience === 'academic' ? now().toISOString() : null,
    po_number: poNumber,
    external_customer_id: created.customerId,
  });
  // conditional step — never clobber a status the payment webhook may
  // already have advanced
  await deps.db.updateQuoteStatusIf(quote.id, 'quoted', 'deposit_invoiced');

  return form.intent === 'invoice'
    ? seeOther(`/quote/${token}?pay=invoiced#pay`)
    : seeOther(created.hostedUrl);
}
