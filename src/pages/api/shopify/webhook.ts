//
// Mirrors Shopify order/draft-order state onto quotes/quote_payments and
// sends the notifications. HMAC is the only auth (spec §4.4, §7).
// Idempotent via webhook_events, recorded up front so a burst of
// redeliveries under the same webhook id short-circuits immediately. If
// anything after that record throws (e.g. a transient Supabase failure), we
// un-record the event and return 500 so Shopify's retry is treated as fresh
// instead of a duplicate — the alternative is losing the work silently.
// Transitions are keyed on both the payment's and the quote's current state
// (via a RANK over QuoteStatus) rather than a blanket "already handled"
// flag, so a partial-failure retry (payment already updated, quote not yet)
// still finishes the job exactly once, a quote is never regressed once it
// has legitimately moved on, and a stale void/cancel can't reset a quote
// that's since been re-invoiced. Everything is awaited before returning —
// `void`'d work gets torn down with the response on Workers.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type EmailSender, resendSender } from '@/lib/email/resend';
import {
  balancePaidCustomerEmail,
  balancePaidLabEmail,
  depositPaidCustomerEmail,
  depositPaidLabEmail,
  refundLabEmail,
} from '@/lib/email/quote-payments';
import { verifyShopifyHmac } from '@/lib/payments/shopify-hmac';
import type { PaymentRecord, QuoteStatus } from '@/lib/payments/types';

export const prerender = false;

export interface ShopifyWebhookDeps {
  db: PaymentsDb;
  email: EmailSender;
  labTo: string;
  webhookSecret: string;
  now?: () => Date;
}

const HANDLED = new Set([
  'orders/paid',
  'draft_orders/delete',
  'orders/cancelled',
  'refunds/create',
]);
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

interface NoteAttribute {
  name: string;
  value: string;
}
interface ShopifyOrder {
  id: number;
  name?: string;
  tags?: string;
  note_attributes?: NoteAttribute[];
  order_status_url?: string | null;
  draft_order_id?: number;
}

function tagValue(tags: string | undefined, prefix: string): string | null {
  if (!tags) return null;
  const hit = tags
    .split(',')
    .map((t) => t.trim())
    .find((t) => t.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}
function attrValue(attrs: NoteAttribute[] | undefined, name: string): string | null {
  return attrs?.find((a) => a.name === name)?.value ?? null;
}

// Resolves the quote_payments row id (our own, embedded in the draft
// order's tags/customAttributes) to a payment, going through the quote it
// names so we don't need a bare "find payment by id" DB method.
async function findPaymentByRef(
  db: PaymentsDb,
  paymentId: string | null,
  quoteNumber: string | null,
  quoteId: string | null,
): Promise<PaymentRecord | null> {
  if (!paymentId) return null;
  const quote = quoteId
    ? await db.getQuoteById(quoteId)
    : quoteNumber
      ? await db.getQuoteByNumber(quoteNumber)
      : null;
  if (!quote) return null;
  return (await db.listPayments(quote.id)).find((p) => p.id === paymentId) ?? null;
}

// order['s] payment_id tag → note_attributes.payment_id → external_id built
// from the draft_order_id suffix. Spec §4.4.
async function findPaymentForOrder(
  db: PaymentsDb,
  order: ShopifyOrder,
): Promise<PaymentRecord | null> {
  const tagPaymentId = tagValue(order.tags, 'payment:');
  const tagQuoteNumber = tagValue(order.tags, 'quote:');
  const attrPaymentId = attrValue(order.note_attributes, 'payment_id');
  const attrQuoteId = attrValue(order.note_attributes, 'quote_id');
  const byRef = await findPaymentByRef(
    db,
    tagPaymentId ?? attrPaymentId,
    tagQuoteNumber,
    attrQuoteId,
  );
  if (byRef) return byRef;
  if (order.draft_order_id != null)
    return db.findPaymentByInvoiceId(`gid://shopify/DraftOrder/${order.draft_order_id}`);
  return null;
}

function findPaymentForDraftOrder(
  db: PaymentsDb,
  draftOrderId: number,
): Promise<PaymentRecord | null> {
  return db.findPaymentByInvoiceId(`gid://shopify/DraftOrder/${draftOrderId}`);
}

// draft_orders/delete and orders/cancelled: the draft/order died before
// payment. Mirrors the pre-migration invoice-void path — mark the payment
// void (only if still open; paid/settled is noise) and step the quote back
// only when
// it's still waiting on this exact payment and no other live row of the
// same kind exists, which covers the normal case and a partial-failure
// retry while leaving a quote alone that's since been re-invoiced.
async function voidPayment(db: PaymentsDb, payment: PaymentRecord): Promise<void> {
  const quote = await db.getQuoteById(payment.quote_id);
  if (!quote) return;
  if (payment.status === 'paid' || payment.status === 'settled') return;

  const waiting: QuoteStatus = payment.kind === 'deposit' ? 'deposit_invoiced' : 'balance_invoiced';
  const stepBack: QuoteStatus = payment.kind === 'deposit' ? 'quoted' : 'deposit_paid';
  if (payment.status === 'open') await db.updatePayment(payment.id, { status: 'void' });
  const others = (await db.listPayments(quote.id)).filter(
    (p) =>
      p.id !== payment.id &&
      p.kind === payment.kind &&
      (p.status === 'open' || p.status === 'paid'),
  );
  if (quote.status === waiting && others.length === 0) {
    await db.updateQuote(quote.id, { status: stepBack });
  }
}

export async function handleShopifyWebhook(
  request: Request,
  deps: ShopifyWebhookDeps,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const body = await request.text();
  const valid = await verifyShopifyHmac(
    body,
    request.headers.get('x-shopify-hmac-sha256'),
    deps.webhookSecret,
  );
  if (!valid) {
    console.error('[shopify-webhook] bad signature');
    return new Response('Bad signature', { status: 401 });
  }

  const topic = request.headers.get('x-shopify-topic') ?? '';
  const eventId = request.headers.get('x-shopify-webhook-id');
  if (!eventId) return new Response('Missing webhook id', { status: 400 });

  if (!HANDLED.has(topic)) return ok();
  const fresh = await deps.db.recordWebhookEvent(eventId, topic);
  if (!fresh) return ok();

  try {
    const payload = JSON.parse(body) as unknown;

    if (topic === 'orders/paid') {
      const order = payload as ShopifyOrder;
      const payment = await findPaymentForOrder(deps.db, order);
      if (!payment) return ok(); // ad-hoc storefront order, not ours to track
      const quote = await deps.db.getQuoteById(payment.quote_id);
      if (!quote) return ok();

      const target: QuoteStatus = payment.kind === 'deposit' ? 'deposit_paid' : 'paid';
      // Stale redelivery under a new event id — also covers a quote that
      // has legitimately advanced past the target (e.g. balance already
      // paid too). No update, no email.
      if (payment.status === 'paid' && RANK[quote.status] >= RANK[target]) return ok();

      const paidAt = now().toISOString();
      const orderRef = order.name ?? payment.order_ref;
      const hostedUrl = order.order_status_url ?? payment.hosted_url;
      await deps.db.updatePayment(payment.id, {
        status: 'paid',
        paid_at: paidAt,
        order_ref: orderRef,
        external_order_id: String(order.id),
        hosted_url: hostedUrl,
      });
      // Never regress the quote: a partial-failure retry lands here with
      // the payment already paid from the earlier attempt but the quote
      // not yet stepped, so this still runs; a quote that has moved on in
      // the meantime is left alone.
      if (RANK[quote.status] < RANK[target])
        await deps.db.updateQuote(quote.id, { status: target });
      const paid: PaymentRecord = {
        ...payment,
        status: 'paid',
        paid_at: paidAt,
        order_ref: orderRef,
        external_order_id: String(order.id),
        hosted_url: hostedUrl,
      };
      if (payment.kind === 'deposit') {
        await deps.email(depositPaidCustomerEmail(quote, paid));
        await deps.email(depositPaidLabEmail(quote, paid, deps.labTo));
      } else {
        await deps.email(balancePaidCustomerEmail(quote, paid));
        await deps.email(balancePaidLabEmail(quote, paid, deps.labTo));
      }
      return ok();
    }

    if (topic === 'draft_orders/delete') {
      const draft = payload as { id: number };
      const payment = await findPaymentForDraftOrder(deps.db, draft.id);
      if (!payment) return ok();
      await voidPayment(deps.db, payment);
      return ok();
    }

    if (topic === 'orders/cancelled') {
      const payment = await findPaymentForOrder(deps.db, payload as ShopifyOrder);
      if (!payment) return ok();
      await voidPayment(deps.db, payment);
      return ok();
    }

    // refunds/create: log + lab email; no state change (staff act in
    // Shopify — spec §4.4).
    const refund = payload as { id: number; order_id: number };
    const payment = await deps.db.findPaymentByExternalOrderId(String(refund.order_id));
    if (!payment) return ok();
    const quote = await deps.db.getQuoteById(payment.quote_id);
    if (!quote) return ok();
    await deps.email(
      refundLabEmail(quote, payment, payment.order_ref ?? String(refund.order_id), deps.labTo),
    );
    return ok();
  } catch (err) {
    console.error('[shopify-webhook] failed processing', eventId, topic, err);
    await deps.db
      .deleteWebhookEvent(eventId)
      .catch((e) => console.error('[shopify-webhook] could not un-record event', eventId, e));
    return new Response('Processing failed', { status: 500 });
  }
}

export async function POST({ request }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    SHOPIFY_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    CONTACT_TO_EMAIL?: string;
  };
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.SHOPIFY_WEBHOOK_SECRET ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL ||
    !e?.CONTACT_TO_EMAIL
  ) {
    return new Response('Webhook is not configured.', { status: 500 });
  }
  return handleShopifyWebhook(request, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    email: resendSender({
      RESEND_API_KEY: e.RESEND_API_KEY,
      CONTACT_FROM_EMAIL: e.CONTACT_FROM_EMAIL,
    }),
    labTo: e.CONTACT_TO_EMAIL,
    webhookSecret: e.SHOPIFY_WEBHOOK_SECRET,
  });
}
