import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { memorySender, type EmailMessage } from '@/lib/email/resend';
import { handleBalance, parseBalanceForm } from '@/pages/api/admin/quotes/[number]/balance';
import type { QuoteRecord } from '@/lib/payments/types';

const N = 'BK-2026-0142';
const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const deps = () => ({ db, gateway, actorEmail: 'michelle@biokea.ai', email: memorySender() });

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: N,
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
    status: 'deposit_paid',
    audience: 'academic',
    source: null,
    academic_attested_at: '2026-09-01T00:00:00Z',
    po_number: 'PO-77',
    external_customer_id: 'cus_1',
    ...over,
  };
}
function post(fields: Record<string, string>) {
  return new Request(`https://biokea.ai/api/admin/quotes/${N}/balance`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://biokea.ai' },
    body: new URLSearchParams(fields),
  });
}

let db: MemoryDb;
let gateway: MemoryGateway;
const DEPOSIT = 480000;
beforeEach(async () => {
  db = new MemoryDb();
  gateway = new MemoryGateway();
  db.quotes.push(quote());
  await db.insertPayment({
    quote_id: 'q1',
    kind: 'deposit',
    amount_cents: DEPOSIT,
    status: 'paid',
    external_id: 'gid://shopify/DraftOrder/1',
    order_ref: '#1001',
    paid_at: '2026-09-02T10:00:00Z',
  });
});

describe('parseBalanceForm', () => {
  it('reads counts[slug] and markers[slug] into engine inputs, dropping blanks', () => {
    const fd = new FormData();
    fd.set('counts[barcoding]', '743');
    fd.set('counts[metabarcoding]', '58');
    fd.set('markers[metabarcoding]', '2');
    fd.set('confirm', 'true');
    expect(parseBalanceForm(fd)).toEqual({
      inputs: [
        { serviceSlug: 'barcoding', count: 743 },
        { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
      ],
      confirm: true,
    });
  });
  it('returns null on a non-integer or missing count', () => {
    const fd = new FormData();
    fd.set('counts[barcoding]', '7.5');
    expect(parseBalanceForm(fd)).toBeNull();
    expect(parseBalanceForm(new FormData())).toBeNull();
  });
});

describe('handleBalance', () => {
  it('404s an unknown quote', async () => {
    expect(
      (await handleBalance(post({ 'counts[barcoding]': '1' }), 'BK-2026-9999', deps())).status,
    ).toBe(404);
  });

  it('preview: redirects back to the admin page carrying the fields', async () => {
    const res = await handleBalance(
      post({
        'counts[barcoding]': '743',
        'counts[metabarcoding]': '58',
        'markers[metabarcoding]': '2',
      }),
      N,
      deps(),
    );
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!, 'https://biokea.ai');
    expect(loc.pathname).toBe(`/admin/quotes/${N}`);
    expect(loc.searchParams.get('preview')).toBe('1');
    expect(loc.searchParams.get('counts[barcoding]')).toBe('743');
    expect(loc.searchParams.get('markers[metabarcoding]')).toBe('2');
    expect(gateway.created).toHaveLength(0);
  });

  it('confirm: creates the balance invoice at the recorded audience with the deposit credited', async () => {
    const res = await handleBalance(
      post({
        'counts[barcoding]': '743',
        'counts[metabarcoding]': '58',
        'markers[metabarcoding]': '2',
        confirm: 'true',
      }),
      N,
      deps(),
    );
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=invoiced`);
    const spec = gateway.created[0];
    expect(spec.kind).toBe('balance');
    expect(spec.customer.id).toBe('cus_1');
    expect(spec.paymentId).toBe('p2');
    expect(spec.poNumber).toBe('PO-77');
    expect(spec.footer).toBe(`Balance for BioKEA quote ${N}, computed on actual sample counts.`);
    const actual = buildQuote([
      { serviceSlug: 'barcoding', count: 743 },
      { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
    ]);
    expect(spec.credit).toEqual({
      title: 'Payment received (order #1001, paid 2026-09-02)',
      amountCents: DEPOSIT,
    });
    expect(spec.lines.every((l) => l.amountCents >= 0)).toBe(true);
    expect(spec.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(actual.total.academic * 100);

    const balance = db.payments.find((p) => p.kind === 'balance')!;
    expect(balance).toMatchObject({
      status: 'open',
      amount_cents: actual.total.academic * 100 - DEPOSIT,
      external_id: 'gid://shopify/DraftOrder/test-1',
      created_by: 'michelle@biokea.ai',
    });
    expect(balance.actual_lines).toEqual([
      { serviceSlug: 'barcoding', count: 743 },
      { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
    ]);
    expect(db.quotes[0].status).toBe('balance_invoiced');
  });

  it('confirm with actual <= deposit on a LEGACY part-payment: settles as a refund', async () => {
    const d = deps();
    const res = await handleBalance(post({ 'counts[barcoding]': '100', confirm: 'true' }), N, d);
    // The rate lock (spec §4.2) holds: 800 quoted @ $12/specimen, 700 short,
    // so the shortfall is credited at $12, not the standalone 1–299 tier's
    // $16 the raw engine would charge for 100 alone. Settled: $9,600 minus
    // 700 × $12 = $1,200 (120000 cents) — below the engine's own $1,600.
    const actual = 120000;
    // DEPOSIT (480000) is far below this quote's full academic total, so
    // paidInFull() is false: this customer bought under the old 50%-deposit
    // terms and is settled with cash back, not credit.
    expect(res.headers.get('location')).toBe(
      `/admin/quotes/${N}?balance=settled&refund=${DEPOSIT - actual}`,
    );
    expect(gateway.created).toHaveLength(0);
    expect(db.payments.find((p) => p.kind === 'balance')).toMatchObject({
      status: 'settled',
      amount_cents: actual - DEPOSIT,
      external_id: null,
      created_by: 'michelle@biokea.ai',
    });
    expect(db.quotes[0].status).toBe('paid');
    expect(d.email.sent).toHaveLength(1);
    expect(d.email.sent[0].text).toMatch(/refund/i);
    expect(d.email.sent[0].text).not.toMatch(/credit/i);
  });

  it('emails a LEGACY part-payer their refund when the actuals come in under', async () => {
    const sent: EmailMessage[] = [];
    const res = await handleBalance(post({ confirm: 'true', 'counts[barcoding]': '250' }), N, {
      ...deps(),
      email: async (m: EmailMessage) => void sent.push(m),
    });
    expect(res.headers.get('location')).toContain('refund=');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/refund/i);
    expect(sent[0].text).not.toMatch(/credit/i);
  });

  it('emails a PAID-IN-FULL quote their credit when the actuals come in under', async () => {
    // Same scenario, but the payment covered the whole quote — so this one
    // bought under the credit terms and must not be offered cash back.
    await db.updatePayment('p1', { amount_cents: q.total.academic * 100 });
    const sent: EmailMessage[] = [];
    const res = await handleBalance(post({ confirm: 'true', 'counts[barcoding]': '250' }), N, {
      ...deps(),
      email: async (m: EmailMessage) => void sent.push(m),
    });
    expect(res.headers.get('location')).toContain('credit=');
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toMatch(/credit/i);
    expect(sent[0].text).not.toMatch(/refund/i);
  });

  // Regression guard: every other test's `email` fn succeeds, so nothing
  // else exercises the try/catch around the credit send in balance.ts. If
  // that try/catch is ever removed or narrowed, this test fails — either
  // the handler rejects with `boom` instead of returning, or it returns
  // something other than the settled redirect — even though the settled
  // payment row and the quote's 'paid' status are already durably written
  // *before* the email is attempted. A thrown-away try/catch here would
  // turn an already-successful settlement into a 500 for staff, inviting a
  // retry on money that has already moved.
  it('a failing credit email does not fail the settle request — the row and status are already committed', async () => {
    const boom = new Error('resend is down');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBalance(post({ 'counts[barcoding]': '100', confirm: 'true' }), N, {
      ...deps(),
      email: async () => {
        throw boom;
      },
    });
    const actual = 120000; // see the rate-lock comment above
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe(
      `/admin/quotes/${N}?balance=settled&refund=${DEPOSIT - actual}`,
    );
    expect(db.payments.find((p) => p.kind === 'balance')).toMatchObject({
      status: 'settled',
      amount_cents: actual - DEPOSIT,
    });
    expect(db.quotes[0].status).toBe('paid');
    expect(errSpy).toHaveBeenCalledWith('[balance] settlement email failed for', N, boom);
    errSpy.mockRestore();
  });

  it('exact settlement (balanceCents === 0): no credit, so no email is sent', async () => {
    // Deposit set to exactly the quoted total, and actual counts submitted
    // identical to the quoted lines, so the rate lock is a no-op and the
    // balance lands on exactly 0 — the boundary the `<=` check and the
    // `if (msg)` guard both need to handle without sending anything.
    await db.updatePayment('p1', { amount_cents: q.total.academic * 100 });
    const d = deps();
    const res = await handleBalance(
      post({
        'counts[barcoding]': '800',
        'counts[metabarcoding]': '60',
        'markers[metabarcoding]': '2',
        confirm: 'true',
      }),
      N,
      d,
    );
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=settled&credit=0`);
    expect(db.quotes[0].status).toBe('paid');
    expect(d.email.sent).toHaveLength(0);
  });

  it('refuses when the quote is not deposit_paid or has no paid deposit', async () => {
    db.quotes[0].status = 'deposit_invoiced';
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '1', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=state`);
    db.quotes[0].status = 'deposit_paid';
    await db.updatePayment('p1', { status: 'void' });
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '1', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=state`);
  });

  it('refuses bad input', async () => {
    expect(
      (await handleBalance(post({ 'counts[barcoding]': 'lots' }), N, deps())).headers.get(
        'location',
      ),
    ).toBe(`/admin/quotes/${N}?error=input`);
    expect(
      (await handleBalance(post({ 'counts[nope]': '5', confirm: 'true' }), N, deps())).headers.get(
        'location',
      ),
    ).toBe(`/admin/quotes/${N}?error=input`);
  });

  it('reissues after a void with the next idempotency attempt', async () => {
    await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, deps());
    const first = db.payments.find((p) => p.kind === 'balance')!;
    await db.updatePayment(first.id, { status: 'void' });
    await db.updateQuote('q1', { status: 'deposit_paid' });
    await handleBalance(post({ 'counts[barcoding]': '750', confirm: 'true' }), N, deps());
    expect(gateway.created[1].paymentId).toBe('p3');
    expect(db.payments.filter((p) => p.kind === 'balance')).toHaveLength(2);
  });

  it("logs (but still redirects to invoiced) when Shopify's total disagrees with our cents", async () => {
    class MismatchGateway extends MemoryGateway {
      override async createInvoice(spec: Parameters<MemoryGateway['createInvoice']>[0]) {
        const out = await super.createInvoice(spec);
        return { ...out, amountDueCents: out.amountDueCents + 1 };
      }
    }
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, {
      db,
      gateway: new MismatchGateway(),
      actorEmail: 'michelle@biokea.ai',
      email: memorySender(),
    });
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=invoiced`);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining('total mismatch'),
      expect.objectContaining({ quote: N, kind: 'balance' }),
    );
    errSpy.mockRestore();
  });

  it('rolls back and reports a gateway failure', async () => {
    gateway.failNext = new Error('down');
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=gateway`);
    expect(db.payments.filter((p) => p.kind === 'balance')).toHaveLength(0);
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('never clobbers a status the webhook already advanced while the gateway call was in flight', async () => {
    class RacingGateway extends MemoryGateway {
      constructor(private readonly db: MemoryDb) {
        super();
      }
      override async createInvoice(spec: Parameters<MemoryGateway['createInvoice']>[0]) {
        // Simulate invoice.paid landing (via the webhook) mid-call.
        this.db.quotes[0].status = 'paid';
        return super.createInvoice(spec);
      }
    }
    const racingGateway = new RacingGateway(db);
    const res = await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, {
      db,
      gateway: racingGateway,
      actorEmail: 'michelle@biokea.ai',
      email: memorySender(),
    });
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=invoiced`);
    expect(db.quotes[0].status).toBe('paid');
    expect(db.quotes[0].external_customer_id).toBeNull();
  });
});
