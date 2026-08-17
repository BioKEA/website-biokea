import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { handleDeposit } from '@/pages/api/quote/[token]/deposit';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const TOKEN = '11111111-1111-1111-1111-111111111111';
const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const NOW = () => new Date('2026-09-01T00:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: TOKEN,
    email: 'alice@state.edu',
    name: 'Alice',
    organization: 'State University',
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'quoted',
    audience: null,
    academic_attested_at: null,
    po_number: null,
    external_customer_id: null,
    ...over,
  };
}
function post(token: string, fields: Record<string, string>) {
  return new Request(`https://biokea.ai/api/quote/${token}/deposit`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://biokea.ai' },
    body: new URLSearchParams(fields),
  });
}

class RacyDb extends MemoryDb {
  // First listPayments() (the pre-check) sees nothing; insertPayment() reports the
  // partial-index conflict as if a concurrent request won; the re-read then sees
  // the winner's row (or nothing, in the second test).
  winner: PaymentRecord | null = null;
  calls = 0;
  override async listPayments(quoteId: string) {
    this.calls++;
    return this.calls === 1 ? [] : this.winner ? [this.winner] : [];
  }
  override async insertPayment(): Promise<PaymentRecord | 'conflict'> {
    return 'conflict';
  }
}

let db: MemoryDb;
let gateway: MemoryGateway;
beforeEach(() => {
  db = new MemoryDb();
  gateway = new MemoryGateway();
  db.quotes.push(quote());
});

describe('handleDeposit', () => {
  it('404s an unknown token', async () => {
    const res = await handleDeposit(
      post('22222222-2222-2222-2222-222222222222', { audience: 'commercial' }),
      '22222222-2222-2222-2222-222222222222',
      { db, gateway, now: NOW },
    );
    expect(res.status).toBe(404);
  });

  it('creates the deposit invoice at the commercial rate and redirects to the hosted page', async () => {
    const res = await handleDeposit(
      post(TOKEN, { audience: 'commercial', po_number: 'PO-77' }),
      TOKEN,
      { db, gateway, now: NOW },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://store.biokea.test/invoices/test-1');

    const spec = gateway.created[0];
    expect(spec.kind).toBe('deposit');
    expect(spec.customer).toEqual({
      id: null,
      email: 'alice@state.edu',
      name: 'Alice',
      organization: 'State University',
      quoteId: 'q1',
    });
    expect(spec.quoteNumber).toBe('BK-2026-0142');
    expect(spec.daysUntilDue).toBe(30);
    expect(spec.paymentId).toBe('p1');
    expect(spec.poNumber).toBe('PO-77');
    expect(spec.footer).toBe(
      '50% deposit toward BioKEA quote BK-2026-0142 (valid to 2026-09-19). The balance is invoiced on actual sample counts when results are delivered. Pay here or from the emailed invoice; questions: contact@biokea.ai.',
    );
    const expected =
      Math.round(q.lines[0].commercial.total * 100 * 0.5) +
      Math.round(q.lines[1].commercial.total * 100 * 0.5);
    expect(spec.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(expected);

    const p = db.payments[0];
    expect(p).toMatchObject({
      quote_id: 'q1',
      kind: 'deposit',
      status: 'open',
      amount_cents: expected,
      external_id: 'gid://shopify/DraftOrder/test-1',
      hosted_url: 'https://store.biokea.test/invoices/test-1',
      due_at: '2026-10-01T00:00:00.000Z',
    });
    expect(db.quotes[0]).toMatchObject({
      status: 'deposit_invoiced',
      audience: 'commercial',
      po_number: 'PO-77',
      external_customer_id: null,
      academic_attested_at: null,
    });
  });

  it('records the academic attestation timestamp when the academic rate is chosen', async () => {
    await handleDeposit(post(TOKEN, { audience: 'academic', attest: 'true' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(db.quotes[0].audience).toBe('academic');
    expect(db.quotes[0].academic_attested_at).toBe('2026-09-01T00:00:00.000Z');
    expect(gateway.created[0].poNumber).toBeNull();
  });

  it('refuses academic without the attestation, and unknown audiences', async () => {
    for (const fields of [{ audience: 'academic' }, { audience: 'academic', attest: 'no' }]) {
      const res = await handleDeposit(post(TOKEN, fields), TOKEN, { db, gateway, now: NOW });
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=attest`);
    }
    for (const fields of [{ audience: 'wholesale' }, {}]) {
      const res = await handleDeposit(post(TOKEN, fields), TOKEN, { db, gateway, now: NOW });
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
    }
    expect(gateway.created).toHaveLength(0);
    expect(db.payments).toHaveLength(0);
  });

  it('is unavailable for conversation-band, expired, or already-progressed quotes', async () => {
    for (const over of [
      { needs_conversation: true },
      { expires_at: '2026-08-31T00:00:00Z' },
      { status: 'deposit_paid' as const },
    ]) {
      db.quotes[0] = quote(over);
      const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
        db,
        gateway,
        now: NOW,
      });
      expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
    }
    expect(gateway.created).toHaveLength(0);
  });

  it('is idempotent: a second submit returns the existing live invoice URL without calling the gateway again', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, { db, gateway, now: NOW });
    const res = await handleDeposit(post(TOKEN, { audience: 'academic', attest: 'true' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe('https://store.biokea.test/invoices/test-1');
    expect(gateway.created).toHaveLength(1);
    expect(db.payments).toHaveLength(1);
    expect(db.quotes[0].audience).toBe('commercial'); // first choice sticks
  });

  it('still returns the live URL when the quote expired after the invoice was issued', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, { db, gateway, now: NOW });
    db.quotes[0].expires_at = '2026-08-31T00:00:00Z';
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe('https://store.biokea.test/invoices/test-1');
  });

  it('rolls back the row and redirects with ?pay=failed when the gateway throws', async () => {
    gateway.failNext = new Error('gateway down');
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=failed`);
    expect(db.payments).toHaveLength(0);
    expect(db.quotes[0].status).toBe('quoted');
    // and the customer can try again
    const again = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(again.headers.get('location')).toBe('https://store.biokea.test/invoices/test-1');
  });

  it('trims and length-limits the PO number', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial', po_number: '  PO-1  ' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(db.quotes[0].po_number).toBe('PO-1');
    db.quotes[0] = quote();
    db.payments = [];
    gateway = new MemoryGateway();
    const res = await handleDeposit(
      post(TOKEN, { audience: 'commercial', po_number: 'x'.repeat(65) }),
      TOKEN,
      { db, gateway, now: NOW },
    );
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
  });

  it('on a lost insert race, redirects to the winning invoice without calling the gateway', async () => {
    const racy = new RacyDb();
    racy.quotes.push(quote());
    racy.winner = {
      id: 'pX',
      quote_id: 'q1',
      kind: 'deposit',
      status: 'open',
      amount_cents: 1,
      currency: 'usd',
      provider: 'shopify',
      external_id: 'in_w',
      hosted_url: 'https://invoice.example.test/in_w',
      pdf_url: null,
      order_ref: null,
      external_order_id: null,
      due_at: null,
      paid_at: null,
      actual_lines: null,
      created_by: null,
      created_at: '2026-09-01T00:00:00Z',
    };
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db: racy,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe('https://invoice.example.test/in_w');
    expect(gateway.created).toHaveLength(0);
  });

  it('on a conflict with no live row to fall back to, redirects with ?pay=failed', async () => {
    const racy = new RacyDb();
    racy.quotes.push(quote());
    racy.winner = null;
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db: racy,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=failed`);
    expect(gateway.created).toHaveLength(0);
  });

  it('never clobbers a status the webhook already advanced while the gateway call was in flight', async () => {
    class RacingGateway extends MemoryGateway {
      constructor(private readonly db: MemoryDb) {
        super();
      }
      override async createInvoice(spec: Parameters<MemoryGateway['createInvoice']>[0]) {
        // Simulate invoice.paid landing (via the webhook) mid-call.
        this.db.quotes[0].status = 'deposit_paid';
        return super.createInvoice(spec);
      }
    }
    const racingGateway = new RacingGateway(db);
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway: racingGateway,
      now: NOW,
    });
    expect(res.status).toBe(303);
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(db.quotes[0].audience).toBe('commercial');
    expect(db.quotes[0].external_customer_id).toBeNull();
  });

  it('logs and redirects with ?pay=failed when the deposit sanity check fails, without calling the gateway', async () => {
    db.quotes[0] = quote({ total_commercial: 1 }); // tampered total vs. the line prices
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=failed`);
    expect(gateway.created).toHaveLength(0);
    expect(db.payments).toHaveLength(0);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
