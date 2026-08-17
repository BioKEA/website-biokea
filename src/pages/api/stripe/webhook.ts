//
// Mirrors Stripe invoice state onto quotes/quote_payments and sends the
// notifications. Signature is the only auth (spec §5.3, §7). Idempotent
// via webhook_events, recorded up front so a burst of redeliveries under
// the same event id short-circuits immediately. If anything after that
// record throws (e.g. a transient Supabase failure), we un-record the
// event and return 500 so Stripe's retry is treated as fresh instead of
// a duplicate — the alternative is losing the work silently. Transitions
// are keyed on both the payment's and the quote's current state (via a
// RANK over QuoteStatus) rather than a blanket "already handled" flag,
// so a partial-failure retry (payment already updated, quote not yet)
// still finishes the job exactly once, a quote is never regressed once
// it has legitimately moved on, and a stale void/uncollectible can't
// reset a quote that's since been re-invoiced. Everything is awaited
// before returning — `void`'d work gets torn down with the response on
// Workers.
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
import type { PaymentKind, PaymentRecord, QuoteStatus } from '@/lib/payments/types';

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
const RANK: Record<QuoteStatus, number> = {
  quoted: 0,
  deposit_invoiced: 1,
  deposit_paid: 2,
  balance_invoiced: 3,
  paid: 4,
};
const ok = () =>
  new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function findPayment(db: PaymentsDb, invoice: Stripe.Invoice): Promise<PaymentRecord | null> {
  const byId = await db.findPaymentByInvoiceId(invoice.id);
  if (byId) return byId;
  // Race: our row exists but its external_id was not written yet.
  const quoteId = invoice.metadata?.quote_id;
  const kind = invoice.metadata?.kind as PaymentKind | undefined;
  if (!quoteId || (kind !== 'deposit' && kind !== 'balance')) return null;
  const open = (await db.listPayments(quoteId)).find(
    (p) => p.kind === kind && p.status === 'open' && p.external_id === null,
  );
  if (!open) return null;
  await db.updatePayment(open.id, { external_id: invoice.id });
  return { ...open, external_id: invoice.id };
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
  const fresh = await deps.db.recordWebhookEvent(event.id, event.type);
  if (!fresh) return ok();

  try {
    const invoice = event.data.object as Stripe.Invoice;
    const payment = await findPayment(deps.db, invoice);
    if (!payment) return ok(); // ad-hoc dashboard invoice, not ours to track
    const quote = await deps.db.getQuoteById(payment.quote_id);
    if (!quote) return ok();

    const urls = {
      hosted_url: invoice.hosted_invoice_url ?? payment.hosted_url,
      pdf_url: invoice.invoice_pdf ?? payment.pdf_url,
    };

    if (event.type === 'invoice.paid') {
      const target: QuoteStatus = payment.kind === 'deposit' ? 'deposit_paid' : 'paid';
      // Stale redelivery under a new event id — also covers a quote that
      // has legitimately advanced past the target (e.g. balance already
      // paid too). No update, no email.
      if (payment.status === 'paid' && RANK[quote.status] >= RANK[target]) return ok();

      const paidAt = now().toISOString();
      await deps.db.updatePayment(payment.id, { status: 'paid', paid_at: paidAt, ...urls });
      // Never regress the quote: a partial-failure retry lands here with
      // the payment already paid from the earlier attempt but the quote
      // not yet stepped, so this still runs; a quote that has moved on in
      // the meantime is left alone. EmailSender never throws by contract
      // (src/lib/email/resend.ts logs and swallows), so a partial-failure
      // retry can only be caused by a DB write failing — meaning once we
      // reach the emails below they have not been sent yet, and this
      // ordering makes the retry finish the quote update and send them
      // exactly once.
      if (RANK[quote.status] < RANK[target])
        await deps.db.updateQuote(quote.id, { status: target });
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

    // voided / marked_uncollectible: the invoice is dead. Stripe can't
    // void/uncollectible a paid invoice, so a paid/settled payment here is
    // noise — ignore it. Otherwise mark the payment, then step the quote
    // back only if it's still waiting on this exact invoice and no other
    // live (open/paid) row of the same kind exists for the quote — that
    // covers the normal case and a partial-failure retry, while leaving a
    // quote alone that has since been re-invoiced.
    if (payment.status === 'paid' || payment.status === 'settled') return ok();

    const waiting: QuoteStatus =
      payment.kind === 'deposit' ? 'deposit_invoiced' : 'balance_invoiced';
    const stepBack: QuoteStatus = payment.kind === 'deposit' ? 'quoted' : 'deposit_paid';
    const status = event.type === 'invoice.voided' ? 'void' : 'uncollectible';
    if (payment.status === 'open') {
      await deps.db.updatePayment(payment.id, { status, ...urls });
    }
    const others = (await deps.db.listPayments(quote.id)).filter(
      (p) =>
        p.id !== payment.id &&
        p.kind === payment.kind &&
        (p.status === 'open' || p.status === 'paid'),
    );
    if (quote.status === waiting && others.length === 0) {
      await deps.db.updateQuote(quote.id, { status: stepBack });
    }
    return ok();
  } catch (err) {
    console.error('[stripe-webhook] failed processing', event.id, event.type, err);
    await deps.db
      .deleteWebhookEvent(event.id)
      .catch((e) => console.error('[stripe-webhook] could not un-record event', event.id, e));
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
