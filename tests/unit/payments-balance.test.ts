import { describe, it, expect, beforeEach } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { handleBalance, parseBalanceForm } from '@/pages/api/admin/quotes/[number]/balance';
import type { QuoteRecord } from '@/lib/payments/types';

const N = 'BK-2026-0142';
const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const deps = () => ({ db, gateway, actorEmail: 'michelle@biokea.ai' });

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
      title: 'Deposit received (order #1001, paid 2026-09-02)',
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

  it('confirm with actual <= deposit: no invoice, settled row, quote paid, refund amount in the redirect', async () => {
    const res = await handleBalance(
      post({ 'counts[barcoding]': '100', confirm: 'true' }),
      N,
      deps(),
    );
    const actual = buildQuote([{ serviceSlug: 'barcoding', count: 100 }]).total.academic * 100;
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
    });
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=invoiced`);
    expect(db.quotes[0].status).toBe('paid');
    expect(db.quotes[0].external_customer_id).toBeNull();
  });
});
