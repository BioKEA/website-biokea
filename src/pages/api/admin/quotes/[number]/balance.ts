// src/pages/api/admin/quotes/[number]/balance.ts
//
// Staff-only (Cloudflare Access + middleware). Two-step: a plain submit
// bounces back to the admin page as a preview; confirm=true prices the
// actual counts with the same engine at the audience recorded at deposit
// time, credits the PAID deposit, and either sends the balance invoice or
// records a no-invoice settlement when nothing is owed. Spec §5.3.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type PaymentsGateway, shopifyGateway } from '@/lib/payments/gateway';
import { shopifyConfigFromEnv, type ShopifyEnv } from '@/lib/payments/shopify-env';
import { INVOICE_DAYS_UNTIL_DUE, computeBalance } from '@/lib/payments/terms';
import { parseBalanceForm } from '@/lib/payments/balance-form';
import { type EmailSender, resendSender } from '@/lib/email/resend';
import { projectSettledWithCreditEmail } from '@/lib/email/quote-payments';

export const prerender = false;

export interface BalanceDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  actorEmail: string;
  email: EmailSender;
}

// Re-exported so existing importers (this route's own tests, Task 10) keep
// working. Moved to balance-form.ts because importing it from here into the
// admin page dragged this route's gateway import into the page's module
// graph and broke Vite's dev SSR resolution.
export { parseBalanceForm };

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
    computed = computeBalance(
      form.inputs,
      quote.audience,
      {
        amountCents: deposit.amount_cents,
        invoiceLabel: deposit.order_ref
          ? `order ${deposit.order_ref}`
          : (deposit.external_id ?? 'deposit'),
        paidAt: deposit.paid_at ?? deposit.created_at,
      },
      quote.lines,
    );
  } catch {
    return seeOther(`${admin}?error=input`);
  }

  if (computed.balanceCents <= 0) {
    const settledRow = await deps.db.insertPayment({
      quote_id: quote.id,
      kind: 'balance',
      status: 'settled',
      amount_cents: computed.balanceCents,
      actual_lines: form.inputs,
      created_by: deps.actorEmail,
    });
    await deps.db.updateQuote(quote.id, { status: 'paid' });
    // The row is already committed at this point; an email failure must not
    // fail the request. projectSettledWithCreditEmail returns null when
    // there is nothing to credit, so we never send an empty email.
    if (settledRow !== 'conflict') {
      const msg = projectSettledWithCreditEmail(quote, settledRow);
      if (msg) {
        try {
          await deps.email(msg);
        } catch (err) {
          console.error('[balance] credit email failed for', quote.quote_number, err);
        }
      }
    }
    return seeOther(`${admin}?balance=settled&credit=${-computed.balanceCents}`);
  }

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'balance',
    amount_cents: computed.balanceCents,
    actual_lines: form.inputs,
    created_by: deps.actorEmail,
  });
  if (inserted === 'conflict') return seeOther(`${admin}?error=state`);

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
      kind: 'balance',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      // keyed on the payment row id — unique per attempt, so a voided/failed
      // attempt never replays a stale draft order (spec §6 'new idempotency
      // key suffix').
      paymentId: inserted.id,
      poNumber: quote.po_number,
      // Preserves the prior PO-gated behavior for this call site; §6.2's
      // intent-driven netTerms is specific to the up-front pay endpoint.
      netTerms: Boolean(quote.po_number),
      lines: computed.lines,
      credit: computed.credit,
      footer: `Balance for BioKEA quote ${quote.quote_number}, computed on actual sample counts.`,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
    });
  } catch (err) {
    console.error(
      '[balance] gateway failed for',
      quote.quote_number,
      err instanceof Error ? err.message : err,
    );
    await deps.db.deletePayment(inserted.id);
    return seeOther(`${admin}?error=gateway`);
  }

  // The invoice email is already sent at this point — failing the request
  // here would strand a live invoice with no payment record to show for
  // it, so a mismatch is logged (the alert) rather than blocking the
  // redirect.
  if (created.amountDueCents !== computed.balanceCents) {
    console.error('[payments] Shopify total mismatch', {
      quote: quote.quote_number,
      kind: 'balance',
      expected: computed.balanceCents,
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
  await deps.db.updateQuote(quote.id, { external_customer_id: created.customerId });
  // conditional step — never clobber a status the payment webhook may
  // already have advanced
  await deps.db.updateQuoteStatusIf(quote.id, 'deposit_paid', 'balance_invoiced');
  return seeOther(`${admin}?balance=invoiced`);
}

export async function POST({ request, params, locals }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
  } & ShopifyEnv;
  const shopify = shopifyConfigFromEnv(e);
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !shopify ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL
  ) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  if (!locals.adminEmail) return new Response('Forbidden', { status: 403 }); // middleware sets it; belt and braces
  const number = params.number ?? '';
  if (!/^BK-\d{4}-\d{4,}$/.test(number)) return new Response('Quote not found', { status: 404 });
  return handleBalance(request, number, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: shopifyGateway(shopify),
    actorEmail: locals.adminEmail,
    email: resendSender({
      RESEND_API_KEY: e.RESEND_API_KEY,
      CONTACT_FROM_EMAIL: e.CONTACT_FROM_EMAIL,
    }),
  });
}
