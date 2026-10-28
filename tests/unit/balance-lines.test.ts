import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { buildOrder } from '@/lib/pricing/order';
import { computeBalance } from '@/lib/payments/terms';
import { parseBalanceForm } from '@/lib/payments/balance-form';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { handlePayment } from '@/lib/payments/pay';
import { balancePaidLabEmail } from '@/lib/email/quote-payments';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

// Same fixture as tests/unit/order.test.ts.
const edna = (over = {}) =>
  ({
    service: 'metabarcoding',
    targets: ['vertebrates'],
    markers: ['12S', 'COI'],
    sampleType: 'water',
    samples: 60,
    kits: false,
    ...over,
  }) as const;

const TOKEN = '11111111-1111-1111-1111-111111111111';
const NOW = () => new Date('2026-10-28T00:00:00Z');

function quoteRecord(lines: QuoteRecord['lines'], over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0200',
    access_token: TOKEN,
    email: 'bob@acme.com',
    name: 'Bob',
    organization: 'Acme',
    lines,
    total_academic: lines.reduce((s, l) => s + l.academic.total, 0),
    total_commercial: lines.reduce((s, l) => s + l.commercial.total, 0),
    needs_conversation: false,
    created_at: '2026-10-20T00:00:00Z',
    expires_at: '2026-11-19T00:00:00Z',
    status: 'quoted',
    audience: 'commercial',
    source: null,
    academic_attested_at: null,
    po_number: null,
    external_customer_id: null,
    config: null,
    directions: null,
    consult_triggers: [],
    ...over,
  };
}

async function pay(quote: QuoteRecord) {
  const db = new MemoryDb();
  const gateway = new MemoryGateway();
  db.quotes.push(quote);
  const res = await handlePayment(
    new Request(`https://biokea.ai/api/quote/${TOKEN}/deposit`, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        origin: 'https://biokea.ai',
      },
      body: new URLSearchParams({ audience: 'commercial' }),
    }),
    TOKEN,
    { db, gateway, now: NOW },
  );
  expect(res.status).toBe(303);
  return gateway.created[0];
}

describe('balance with line kinds', () => {
  const quoted = buildQuote([
    { serviceSlug: 'metagenomics', kind: 'assay', assay: 'mg', count: 4 },
    { serviceSlug: 'barcoding', count: 300 },
  ]).lines;
  const deposit = {
    amountCents: (4 * 2400 + 300 * 12) * 100,
    invoiceLabel: 'order #1',
    paidAt: '2026-10-28T00:00:00Z',
  };
  it('re-scales each line kind at its locked rate and uncaps nothing the quote has', () => {
    const b = computeBalance(
      [
        { serviceSlug: 'metagenomics', kind: 'assay', assay: 'mg', count: 3 },
        { serviceSlug: 'barcoding', count: 250 },
      ],
      'academic',
      deposit,
      quoted,
    );
    expect(b.uncapped).toEqual([]);
    expect(b.lines[0].amountCents).toBe(3 * 2400 * 100);
    expect(b.lines[1].amountCents).toBe((300 * 12 - 50 * 12) * 100); // held at the locked $12
  });
  it('a different assay on the same slug is not held to the other assay', () => {
    const b = computeBalance(
      [{ serviceSlug: 'metagenomics', kind: 'assay', assay: 'mt', count: 4 }],
      'academic',
      deposit,
      quoted,
    );
    expect(b.uncapped).toEqual(['metagenomics']);
  });
  it('legacy kind-less stored lines still match plain service inputs', () => {
    const legacy = buildQuote([{ serviceSlug: 'barcoding', count: 300 }]).lines.map(
      ({ kind: _k, ...rest }) => rest,
    );
    const b = computeBalance(
      [{ serviceSlug: 'barcoding', count: 250 }],
      'academic',
      deposit,
      legacy,
    );
    expect(b.uncapped).toEqual([]);
    expect(b.lines[0].amountCents).toBe((300 * 12 - 50 * 12) * 100);
  });
  it('parseBalanceForm reads per-line keys and keeps legacy service lines bare', () => {
    const fd = new URLSearchParams({
      'counts[assay:metagenomics:mg]': '3',
      'counts[service:barcoding:]': '250',
      'markers[service:barcoding:]': '2',
    });
    expect(parseBalanceForm(fd)?.inputs).toEqual([
      { serviceSlug: 'metagenomics', count: 3, kind: 'assay', assay: 'mg' },
      { serviceSlug: 'barcoding', count: 250, markers: 2 },
    ]);
  });
  it('parseBalanceForm still accepts the old bare-slug keys', () => {
    const fd = new URLSearchParams({
      'counts[barcoding]': '743',
      'counts[metabarcoding]': '58',
      'markers[metabarcoding]': '2',
    });
    expect(parseBalanceForm(fd)?.inputs).toEqual([
      { serviceSlug: 'barcoding', count: 743 },
      { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
    ]);
  });
  it('parseBalanceForm ignores a key with an unknown assay', () => {
    expect(parseBalanceForm(new URLSearchParams({ 'counts[assay:metagenomics:xx]': '3' }))).toBe(
      null,
    );
  });
  it('the draft-order footer carries the configuration and directions', async () => {
    const order = buildOrder(edna());
    const spec = await pay(
      quoteRecord(order.quote.lines, { config: edna(), directions: 'Filter on site.' }),
    );
    expect(spec.footer).toContain('Markers: 12S, COI');
    expect(spec.attributes).toEqual([{ key: 'directions', value: 'Filter on site.' }]);
  });
  it('a legacy quote keeps exactly today’s footer and no extra attributes', async () => {
    const lines = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]).lines;
    const spec = await pay(quoteRecord(lines));
    expect(spec.footer).toBe(
      'Payment in full for BioKEA quote BK-2026-0200 (valid to 2026-11-19). Your quoted per-sample rate is held for this project: ship fewer samples than quoted and the unused amount stays as credit toward another project for 12 months; ship more and we invoice the difference at the same rate. Questions: contact@biokea.ai.',
    );
    expect(spec.footer).not.toContain('Service:');
    expect(spec.attributes).toBeUndefined();
  });
  it('the lab email labels kinded actual lines', () => {
    const lines = buildQuote([{ serviceSlug: 'barcoding', count: 300 }]).lines;
    const balance = {
      id: 'p2',
      quote_id: 'q1',
      kind: 'balance',
      status: 'paid',
      amount_cents: 1000,
      currency: 'usd',
      provider: 'shopify',
      external_id: null,
      hosted_url: null,
      pdf_url: null,
      order_ref: null,
      external_order_id: null,
      due_at: null,
      paid_at: '2026-10-28T00:00:00Z',
      actual_lines: [
        { serviceSlug: 'metagenomics', count: 3, kind: 'assay', assay: 'mg' },
        { serviceSlug: 'barcoding', count: 250 },
      ],
      created_by: null,
      created_at: '2026-10-28T00:00:00Z',
    } satisfies PaymentRecord;
    const m = balancePaidLabEmail(quoteRecord(lines), balance, 'lab@biokea.ai');
    expect(m.text).toContain('  · metagenomics (assay mg): 3');
    expect(m.text).toContain('  · barcoding: 250');
  });
});
