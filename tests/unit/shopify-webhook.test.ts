// tests/unit/shopify-webhook.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import type { QuotePatch } from '@/lib/payments/db';
import { memorySender } from '@/lib/email/resend';
import { handleShopifyWebhook } from '@/pages/api/shopify/webhook';
import { shopifyHmacBase64 } from '@/lib/payments/shopify-hmac';
import type { QuoteRecord } from '@/lib/payments/types';

const SECRET = 'shpss_test_secret';
const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
const NOW = () => new Date('2026-09-02T10:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: 'tok',
    email: 'alice@state.edu',
    name: 'Alice',
    organization: 'State University',
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'deposit_invoiced',
    audience: 'academic',
    academic_attested_at: '2026-09-01T00:00:00Z',
    po_number: null,
    external_customer_id: null,
    ...over,
  };
}

async function send(topic: string, payload: unknown, id: string): Promise<Request> {
  const body = JSON.stringify(payload);
  const sig = await shopifyHmacBase64(body, SECRET);
  return new Request('https://biokea.ai/api/shopify/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-shopify-topic': topic,
      'x-shopify-webhook-id': id,
      'x-shopify-hmac-sha256': sig,
    },
    body,
  });
}

const orderPaid = {
  id: 5551,
  name: '#1042',
  financial_status: 'paid',
  source_name: 'shopify_draft_order',
  tags: 'biokea, deposit, payment:p1, quote:BK-2026-0142',
  note_attributes: [
    { name: 'payment_id', value: 'p1' },
    { name: 'quote_id', value: 'q1' },
    { name: 'kind', value: 'deposit' },
  ],
  order_status_url: 'https://store.biokea.ai/…/orders/xyz',
  total_price: '4800.00',
};

let db: MemoryDb;
let email: ReturnType<typeof memorySender>;
const deps = () => ({ db, email, labTo: 'contact@biokea.ai', webhookSecret: SECRET, now: NOW });

beforeEach(async () => {
  db = new MemoryDb();
  email = memorySender();
  db.quotes.push(quote());
  await db.insertPayment({
    quote_id: 'q1',
    kind: 'deposit',
    amount_cents: 480000,
    external_id: 'gid://shopify/DraftOrder/11',
    hosted_url: 'https://store.biokea.ai/11/invoices/abc',
  });
});

describe('handleShopifyWebhook', () => {
  it('rejects a bad HMAC with 401 and touches nothing', async () => {
    const req = new Request('https://biokea.ai/api/shopify/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-topic': 'orders/paid',
        'x-shopify-webhook-id': 'whid_bad',
        'x-shopify-hmac-sha256': 'not-a-real-signature',
      },
      body: '{}',
    });
    const res = await handleShopifyWebhook(req, deps());
    expect(res.status).toBe(401);
    expect(db.events.size).toBe(0);
  });

  it('401s when x-shopify-shop-domain is present and differs from the configured store domain', async () => {
    const req = await send('orders/paid', orderPaid, 'whid_domain_1');
    req.headers.set('x-shopify-shop-domain', 'someone-elses-store.myshopify.com');
    const res = await handleShopifyWebhook(req, { ...deps(), storeDomain: 'biokea.myshopify.com' });
    expect(res.status).toBe(401);
    expect(db.payments[0].status).toBe('open');
  });

  it('proceeds when x-shopify-shop-domain matches the configured store domain', async () => {
    const req = await send('orders/paid', orderPaid, 'whid_domain_2');
    req.headers.set('x-shopify-shop-domain', 'biokea.myshopify.com');
    const res = await handleShopifyWebhook(req, { ...deps(), storeDomain: 'biokea.myshopify.com' });
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('paid');
  });

  it('ignores the shop-domain header when deps has no storeDomain configured', async () => {
    const req = await send('orders/paid', orderPaid, 'whid_domain_3');
    req.headers.set('x-shopify-shop-domain', 'someone-elses-store.myshopify.com');
    const res = await handleShopifyWebhook(req, deps());
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('paid');
  });

  it('400s when the webhook id header is missing', async () => {
    const body = JSON.stringify(orderPaid);
    const sig = await shopifyHmacBase64(body, SECRET);
    const req = new Request('https://biokea.ai/api/shopify/webhook', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-topic': 'orders/paid',
        'x-shopify-hmac-sha256': sig,
      },
      body,
    });
    const res = await handleShopifyWebhook(req, deps());
    expect(res.status).toBe(400);
  });

  it('orders/paid on the deposit → payment paid, quote deposit_paid, two emails', async () => {
    const res = await handleShopifyWebhook(await send('orders/paid', orderPaid, 'whid_1'), deps());
    expect(res.status).toBe(200);
    expect(db.payments[0]).toMatchObject({
      status: 'paid',
      paid_at: '2026-09-02T10:00:00.000Z',
      order_ref: '#1042',
      external_order_id: '5551',
      hosted_url: orderPaid.order_status_url,
    });
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Deposit received — BioKEA quote BK-2026-0142',
      '[deposit paid] BK-2026-0142 · State University · $4,800.00',
    ]);
  });

  it('is idempotent on a redelivered webhook id', async () => {
    await handleShopifyWebhook(await send('orders/paid', orderPaid, 'whid_1'), deps());
    const res = await handleShopifyWebhook(await send('orders/paid', orderPaid, 'whid_1'), deps());
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(2);
  });

  it('finds the payment via note_attributes.payment_id when the tag is missing', async () => {
    const payload = { ...orderPaid, tags: 'biokea, deposit' };
    const res = await handleShopifyWebhook(await send('orders/paid', payload, 'whid_2'), deps());
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('paid');
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('falls back to external_id via draft_order_id when there is no tag or attribute', async () => {
    const payload = { ...orderPaid, tags: '', note_attributes: [], draft_order_id: 11 };
    const res = await handleShopifyWebhook(await send('orders/paid', payload, 'whid_3'), deps());
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('paid');
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('draft_orders/delete on the open deposit → payment void, quote back to quoted', async () => {
    const res = await handleShopifyWebhook(
      await send('draft_orders/delete', { id: 11 }, 'whid_4'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('void');
    expect(db.quotes[0].status).toBe('quoted');
  });

  it('orders/cancelled for an order tied to an open payment (by tag) → void, step back', async () => {
    const payload = {
      ...orderPaid,
      financial_status: 'voided',
      cancelled_at: '2026-09-05T00:00:00Z',
    };
    const res = await handleShopifyWebhook(
      await send('orders/cancelled', payload, 'whid_5'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('void');
    expect(db.quotes[0].status).toBe('quoted');
  });

  it('refunds/create for order_id matching external_order_id of a paid deposit → lab email, no state change', async () => {
    await handleShopifyWebhook(await send('orders/paid', orderPaid, 'whid_6'), deps());
    email.sent.splice(0, email.sent.length);
    const res = await handleShopifyWebhook(
      await send('refunds/create', { id: 77, order_id: 5551 }, 'whid_7'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0].subject).toBe('[refund] BK-2026-0142 · State University · order #1042');
    expect(db.payments[0].status).toBe('paid');
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('ignores topics it does not handle (200)', async () => {
    const res = await handleShopifyWebhook(
      await send('customers/create', { id: 1 }, 'whid_8'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('open');
    expect(email.sent).toHaveLength(0);
  });

  it('ignores an order it cannot match to a payment (200)', async () => {
    const payload = { id: 9999, name: '#9999', tags: '', note_attributes: [] };
    const res = await handleShopifyWebhook(await send('orders/paid', payload, 'whid_9'), deps());
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(0);
  });

  it('a DB failure mid-processing returns 500 and un-records the event', async () => {
    class FlakyDb extends MemoryDb {
      async updateQuote(id: string, patch: QuotePatch) {
        throw new Error('supabase down');
        // eslint-disable-next-line no-unreachable
        return super.updateQuote(id, patch);
      }
    }
    const flaky = new FlakyDb();
    flaky.quotes.push(quote());
    await flaky.insertPayment({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 480000,
      external_id: 'gid://shopify/DraftOrder/11',
      hosted_url: 'https://store.biokea.ai/11/invoices/abc',
    });
    const failDeps = { ...deps(), db: flaky };
    const res = await handleShopifyWebhook(
      await send('orders/paid', orderPaid, 'whid_10'),
      failDeps,
    );
    expect(res.status).toBe(500);
    expect(flaky.events.size).toBe(0);
    expect(email.sent).toHaveLength(0);
  });

  it('a stale orders/paid after the quote advanced does not regress it or resend', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    const res = await handleShopifyWebhook(await send('orders/paid', orderPaid, 'whid_11'), deps());
    expect(res.status).toBe(200);
    expect(db.quotes[0].status).toBe('balance_invoiced');
    expect(email.sent).toHaveLength(0);
  });

  it('balance orders/paid → quote paid + balance emails', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    await db.insertPayment({
      quote_id: 'q1',
      kind: 'balance',
      amount_cents: 411600,
      external_id: 'gid://shopify/DraftOrder/12',
    });
    const balanceOrder = {
      id: 6001,
      name: '#1050',
      financial_status: 'paid',
      tags: 'biokea, balance, payment:p2, quote:BK-2026-0142',
      note_attributes: [
        { name: 'payment_id', value: 'p2' },
        { name: 'quote_id', value: 'q1' },
        { name: 'kind', value: 'balance' },
      ],
      order_status_url: 'https://store.biokea.ai/…/orders/abc2',
      total_price: '4116.00',
    };
    const res = await handleShopifyWebhook(
      await send('orders/paid', balanceOrder, 'whid_12'),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.quotes[0].status).toBe('paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Paid in full — BioKEA quote BK-2026-0142',
      '[paid in full] BK-2026-0142 · State University · $4,116.00',
    ]);
  });
});
