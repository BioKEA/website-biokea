//
// Mirrors Stripe invoice state onto quotes/quote_payments and sends the
// notifications. Signature is the only auth (spec §5.3, §7). Idempotent
// via stripe_events, recorded up front so a burst of redeliveries under
// the same event id short-circuits immediately. If anything after that
// record throws (e.g. a transient Supabase failure), we un-record the
// event and return 500 so Stripe's retry is treated as fresh instead of
// a duplicate — the alternative is losing the work silently. Once a
// transition is already fully applied (payment already paid — and, for
// `paid`, the quote already reflects it — or payment already
// void/uncollectible/settled), a redelivery under a *new* event id is a
// no-op instead of a duplicate email or an unwanted quote reset.
// Everything is awaited before returning — `void`'d work gets torn down
// with the response on Workers.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { makeStripe } from '@/lib/payments/gateway';
import { type EmailSender, resendSender } from '@/lib/email/resend';
import {
  balancePaidCustomerEmail,
  balancePaidLabEmail,
  depositPaidCustomerEmail,
  depositPaidLabEmail,
} from '@/lib/email/quote-payments';
import type { PaymentKind, PaymentRecord } from '@/lib/payments/types';

export const prerender = false;

export interface WebhookDeps {
  db: PaymentsDb;
  email: EmailSender;
  labTo: string;
  stripe: Stripe;
  webhookSecret: string;
  now?: () => Date;
}

const HANDLED = new Set(['invoice.paid', 'invoice.voided', 'invoice.marked_uncollectible']);
const ok = () =>
  new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function findPayment(db: PaymentsDb, invoice: Stripe.Invoice): Promise<PaymentRecord | null> {
  const byId = await db.findPaymentByInvoiceId(invoice.id);
  if (byId) return byId;
  // Race: our row exists but its stripe_invoice_id was not written yet.
  const quoteId = invoice.metadata?.quote_id;
  const kind = invoice.metadata?.kind as PaymentKind | undefined;
  if (!quoteId || (kind !== 'deposit' && kind !== 'balance')) return null;
  const open = (await db.listPayments(quoteId)).find(
    (p) => p.kind === kind && p.status === 'open' && p.stripe_invoice_id === null,
  );
  if (!open) return null;
  await db.updatePayment(open.id, { stripe_invoice_id: invoice.id });
  return { ...open, stripe_invoice_id: invoice.id };
}

export async function handleStripeWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const body = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(
      body,
      sig,
      deps.webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    console.error('[stripe-webhook] bad signature');
    return new Response('Bad signature', { status: 400 });
  }

  if (!HANDLED.has(event.type)) return ok();
  const fresh = await deps.db.recordStripeEvent(event.id, event.type);
  if (!fresh) return ok();

  try {
    const invoice = event.data.object as Stripe.Invoice;
    const payment = await findPayment(deps.db, invoice);
    if (!payment) return ok(); // ad-hoc dashboard invoice, not ours to track
    const quote = await deps.db.getQuoteById(payment.quote_id);
    if (!quote) return ok();

    const urls = {
      hosted_invoice_url: invoice.hosted_invoice_url ?? payment.hosted_invoice_url,
      invoice_pdf: invoice.invoice_pdf ?? payment.invoice_pdf,
    };

    if (event.type === 'invoice.paid') {
      const targetQuoteStatus = payment.kind === 'deposit' ? 'deposit_paid' : 'paid';
      // Already fully applied (a redelivery under a new event id, or a
      // retry after we un-recorded the event further along than this) —
      // nothing left to do, and re-sending would duplicate the email.
      if (payment.status === 'paid' && quote.status === targetQuoteStatus) return ok();

      const paidAt = now().toISOString();
      await deps.db.updatePayment(payment.id, { status: 'paid', paid_at: paidAt, ...urls });
      await deps.db.updateQuote(quote.id, { status: targetQuoteStatus });
      const paid: PaymentRecord = { ...payment, status: 'paid', paid_at: paidAt, ...urls };
      if (payment.kind === 'deposit') {
        await deps.email(depositPaidCustomerEmail(quote, paid));
        await deps.email(depositPaidLabEmail(quote, paid, deps.labTo));
      } else {
        await deps.email(balancePaidCustomerEmail(quote, paid));
        await deps.email(balancePaidLabEmail(quote, paid, deps.labTo));
      }
      return ok();
    }

    // voided / marked_uncollectible: the invoice is dead; step the quote
    // back so the customer (deposit) or staff (balance) can issue a fresh
    // one. Already-terminal payment → a stale redelivery, don't reset a
    // quote that has since moved on (e.g. been re-invoiced).
    if (
      payment.status === 'void' ||
      payment.status === 'uncollectible' ||
      payment.status === 'settled'
    ) {
      return ok();
    }
    const status = event.type === 'invoice.voided' ? 'void' : 'uncollectible';
    await deps.db.updatePayment(payment.id, { status, ...urls });
    await deps.db.updateQuote(quote.id, {
      status: payment.kind === 'deposit' ? 'quoted' : 'deposit_paid',
    });
    return ok();
  } catch (err) {
    console.error('[stripe-webhook] failed processing', event.id, event.type, err);
    await deps.db.deleteStripeEvent(event.id).catch(() => undefined);
    return new Response('Processing failed', { status: 500 });
  }
}

export async function POST({ request }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    CONTACT_TO_EMAIL?: string;
  };
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.STRIPE_SECRET_KEY ||
    !e?.STRIPE_WEBHOOK_SECRET ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL ||
    !e?.CONTACT_TO_EMAIL
  ) {
    return new Response('Webhook is not configured.', { status: 500 });
  }
  return handleStripeWebhook(request, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    email: resendSender({
      RESEND_API_KEY: e.RESEND_API_KEY,
      CONTACT_FROM_EMAIL: e.CONTACT_FROM_EMAIL,
    }),
    labTo: e.CONTACT_TO_EMAIL,
    stripe: makeStripe(e.STRIPE_SECRET_KEY),
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
  });
}
