// tests/unit/payments-webhook.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Stripe from 'stripe';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import type { QuotePatch } from '@/lib/payments/db';
import { memorySender } from '@/lib/email/resend';
import { handleStripeWebhook } from '@/pages/api/stripe/webhook';
import type { QuoteRecord } from '@/lib/payments/types';

const SECRET = 'whsec_test_secret';
// Only the webhooks helper is used; the key is never sent anywhere.
const stripe = new Stripe('sk_test_unused', { httpClient: Stripe.createFetchHttpClient() });
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
    stripe_customer_id: 'cus_1',
    ...over,
  };
}

function event(id: string, type: string, invoice: Record<string, unknown>) {
  const payload = JSON.stringify({
    id,
    object: 'event',
    type,
    data: { object: { object: 'invoice', ...invoice } },
  });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return new Request('https://biokea.ai/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
}
const depositInvoice = {
  id: 'in_1',
  invoice_pdf: 'https://pay.stripe.com/x.pdf',
  hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  metadata: { quote_id: 'q1', kind: 'deposit' },
};

let db: MemoryDb;
let email: ReturnType<typeof memorySender>;
const deps = () => ({
  db,
  email,
  labTo: 'contact@biokea.ai',
  stripe,
  webhookSecret: SECRET,
  now: NOW,
});

beforeEach(async () => {
  db = new MemoryDb();
  email = memorySender();
  db.quotes.push(quote());
  await db.insertPayment({
    quote_id: 'q1',
    kind: 'deposit',
    amount_cents: 480000,
    stripe_invoice_id: 'in_1',
    hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  });
});

describe('handleStripeWebhook', () => {
  it('rejects a bad signature with 400 and touches nothing', async () => {
    const req = new Request('https://biokea.ai/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=bad' },
      body: '{}',
    });
    expect((await handleStripeWebhook(req, deps())).status).toBe(400);
    expect(db.events.size).toBe(0);
  });

  it('invoice.paid on the deposit → payment paid, quote deposit_paid, two emails', async () => {
    const res = await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    expect(res.status).toBe(200);
    expect(db.payments[0]).toMatchObject({
      status: 'paid',
      paid_at: '2026-09-02T10:00:00.000Z',
      invoice_pdf: 'https://pay.stripe.com/x.pdf',
    });
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Deposit received — BioKEA quote BK-2026-0142',
      '[deposit paid] BK-2026-0142 · State University · $4,800.00',
    ]);
  });

  it('is idempotent on a redelivered event', async () => {
    await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    const res = await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(2);
  });

  it('invoice.voided on the deposit → payment void, quote back to quoted, no email', async () => {
    await handleStripeWebhook(event('evt_2', 'invoice.voided', depositInvoice), deps());
    expect(db.payments[0].status).toBe('void');
    expect(db.quotes[0].status).toBe('quoted');
    expect(email.sent).toHaveLength(0);
  });

  it('invoice.marked_uncollectible behaves like void for the quote status', async () => {
    await handleStripeWebhook(
      event('evt_3', 'invoice.marked_uncollectible', depositInvoice),
      deps(),
    );
    expect(db.payments[0].status).toBe('uncollectible');
    expect(db.quotes[0].status).toBe('quoted');
  });

  it('balance: paid → quote paid + two emails; voided → back to deposit_paid', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    await db.insertPayment({
      quote_id: 'q1',
      kind: 'balance',
      amount_cents: 411600,
      stripe_invoice_id: 'in_2',
    });
    const balanceInvoice = {
      id: 'in_2',
      invoice_pdf: 'https://pay.stripe.com/y.pdf',
      metadata: { quote_id: 'q1', kind: 'balance' },
    };

    await handleStripeWebhook(event('evt_4', 'invoice.voided', balanceInvoice), deps());
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(db.payments.find((p) => p.id === 'p2')?.status).toBe('void');

    await db.insertPayment({
      quote_id: 'q1',
      kind: 'balance',
      amount_cents: 411600,
      stripe_invoice_id: 'in_3',
    });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    await handleStripeWebhook(
      event('evt_5', 'invoice.paid', { ...balanceInvoice, id: 'in_3' }),
      deps(),
    );
    expect(db.quotes[0].status).toBe('paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Paid in full — BioKEA quote BK-2026-0142',
      '[paid in full] BK-2026-0142 · State University · $4,116.00',
    ]);
  });

  it('falls back to metadata (quote_id + kind) when the row has no invoice id yet, and fills it in', async () => {
    await db.updatePayment('p1', { stripe_invoice_id: null });
    await handleStripeWebhook(event('evt_6', 'invoice.paid', depositInvoice), deps());
    expect(db.payments[0]).toMatchObject({ status: 'paid', stripe_invoice_id: 'in_1' });
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('ignores invoices it does not know and event types it does not handle (200)', async () => {
    expect(
      (
        await handleStripeWebhook(
          event('evt_7', 'invoice.paid', { id: 'in_manual', metadata: {} }),
          deps(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleStripeWebhook(event('evt_8', 'customer.created', { id: 'cus_9' }), deps()))
        .status,
    ).toBe(200);
    expect(db.payments[0].status).toBe('open');
    expect(email.sent).toHaveLength(0);
  });

  it('a DB failure mid-processing returns 500, un-records the event, and the redelivery succeeds', async () => {
    class FlakyDb extends MemoryDb {
      private failedOnce = false;
      async updateQuote(id: string, patch: QuotePatch) {
        if (!this.failedOnce) {
          this.failedOnce = true;
          throw new Error('supabase down');
        }
        return super.updateQuote(id, patch);
      }
    }
    const flaky = new FlakyDb();
    flaky.quotes.push(quote());
    await flaky.insertPayment({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 480000,
      stripe_invoice_id: 'in_1',
      hosted_invoice_url: 'https://invoice.stripe.com/i/x',
    });
    const failDeps = { ...deps(), db: flaky };

    const res1 = await handleStripeWebhook(
      event('evt_9', 'invoice.paid', depositInvoice),
      failDeps,
    );
    expect(res1.status).toBe(500);
    expect(flaky.events.size).toBe(0);
    expect(flaky.quotes[0].status).toBe('deposit_invoiced');
    expect(email.sent).toHaveLength(0);

    const res2 = await handleStripeWebhook(
      event('evt_9', 'invoice.paid', depositInvoice),
      failDeps,
    );
    expect(res2.status).toBe(200);
    expect(flaky.quotes[0].status).toBe('deposit_paid');
    expect(email.sent).toHaveLength(2);
  });

  it('a redelivered void for an old deposit does not reset a re-invoiced quote', async () => {
    await db.updatePayment('p1', { status: 'void' });
    await db.insertPayment({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 480000,
      stripe_invoice_id: 'in_9',
    });
    await db.updateQuote('q1', { status: 'deposit_invoiced' });

    const res = await handleStripeWebhook(
      event('evt_10', 'invoice.voided', depositInvoice),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.quotes[0].status).toBe('deposit_invoiced');
    expect(db.payments[0].status).toBe('void');
  });

  it('invoice.paid redelivered under a new event id for an already-paid payment sends no second email', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'deposit_paid' });

    const res = await handleStripeWebhook(
      event('evt_dup2', 'invoice.paid', depositInvoice),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(0);
  });

  it('a stale deposit invoice.paid after the quote advanced does not regress it or resend', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'balance_invoiced' });

    const res = await handleStripeWebhook(event('evt_11', 'invoice.paid', depositInvoice), deps());
    expect(res.status).toBe(200);
    expect(db.quotes[0].status).toBe('balance_invoiced');
    expect(email.sent).toHaveLength(0);
  });

  it('a DB failure after the payment void is recovered on redelivery', async () => {
    class FlakyVoidDb extends MemoryDb {
      private failedOnce = false;
      async updateQuote(id: string, patch: QuotePatch) {
        if (!this.failedOnce) {
          this.failedOnce = true;
          throw new Error('supabase down');
        }
        return super.updateQuote(id, patch);
      }
    }
    const flaky = new FlakyVoidDb();
    flaky.quotes.push(quote());
    await flaky.insertPayment({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 480000,
      stripe_invoice_id: 'in_1',
      hosted_invoice_url: 'https://invoice.stripe.com/i/x',
    });
    const failDeps = { ...deps(), db: flaky };

    const res1 = await handleStripeWebhook(
      event('evt_12', 'invoice.voided', depositInvoice),
      failDeps,
    );
    expect(res1.status).toBe(500);
    expect(flaky.events.size).toBe(0);
    expect(flaky.payments[0].status).toBe('void');
    expect(flaky.quotes[0].status).toBe('deposit_invoiced');

    const res2 = await handleStripeWebhook(
      event('evt_12', 'invoice.voided', depositInvoice),
      failDeps,
    );
    expect(res2.status).toBe(200);
    expect(flaky.quotes[0].status).toBe('quoted');
  });

  it('voiding a paid invoice event is ignored', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'deposit_paid' });

    const res = await handleStripeWebhook(
      event('evt_13', 'invoice.voided', depositInvoice),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(db.payments[0].status).toBe('paid');
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('an un-record failure is logged', async () => {
    class DoublyFlakyDb extends MemoryDb {
      async updateQuote(): Promise<void> {
        throw new Error('supabase down');
      }
      async deleteStripeEvent(): Promise<void> {
        throw new Error('delete also down');
      }
    }
    const flaky = new DoublyFlakyDb();
    flaky.quotes.push(quote());
    await flaky.insertPayment({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 480000,
      stripe_invoice_id: 'in_1',
      hosted_invoice_url: 'https://invoice.stripe.com/i/x',
    });
    const failDeps = { ...deps(), db: flaky };
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await handleStripeWebhook(
      event('evt_14', 'invoice.paid', depositInvoice),
      failDeps,
    );
    expect(res.status).toBe(500);
    expect(errSpy.mock.calls.some((args) => String(args[0]).includes('could not un-record'))).toBe(
      true,
    );

    errSpy.mockRestore();
  });
});
