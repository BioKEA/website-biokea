import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import {
  CREDIT_MONTHS,
  usdCents,
  assertPaymentSane,
  computeBalance,
  creditFrom,
  paymentLines,
  paymentTotalCents,
} from '@/lib/payments/terms';
import type { PaymentRecord } from '@/lib/payments/types';

const bar = (n: number) => buildQuote([{ serviceSlug: 'barcoding', count: n }]);

describe('usdCents', () => {
  it('formats cents as US dollars', () => {
    expect(usdCents(123450)).toBe('$1,234.50');
    expect(usdCents(0)).toBe('$0.00');
    expect(usdCents(-500)).toBe('-$5.00');
  });
});

describe('paymentLines', () => {
  it('bills the whole quote, not half of it', () => {
    const q = bar(800); // academic: 300–999 tier @ $12 => $9,600
    expect(q.total.academic).toBe(9600);
    expect(paymentTotalCents(paymentLines(q.lines, 'academic'))).toBe(960000);
  });

  it('describes the line without the word deposit', () => {
    const [line] = paymentLines(bar(800).lines, 'academic');
    expect(line.description).toContain('800 specimens');
    expect(line.description).toContain('$12/specimen');
    expect(line.description).not.toMatch(/deposit/i);
  });
});

describe('assertPaymentSane', () => {
  it('accepts the full total', () => {
    expect(() => assertPaymentSane(9600, 960000, 1)).not.toThrow();
  });

  it('rejects a half-total left over from the deposit era', () => {
    expect(() => assertPaymentSane(9600, 480000, 1)).toThrow(/payment/i);
  });
});

// Spec §4.2. Each row is the whole reason the rate lock exists; if you are
// tempted to simplify the rule, one of these will catch you.
describe('computeBalance rate lock', () => {
  const paid = (cents: number) => ({
    amountCents: cents,
    invoiceLabel: 'order #1001',
    paidAt: '2026-09-02T10:00:00Z',
  });
  const settle = (quotedCount: number, actualCount: number) => {
    const quoted = bar(quotedCount);
    const prepaid = paymentTotalCents(paymentLines(quoted.lines, 'academic'));
    const r = computeBalance(
      [{ serviceSlug: 'barcoding', count: actualCount }],
      'academic',
      paid(prepaid),
      quoted.lines,
    );
    return { prepaid, settled: r.actualTotalCents, balance: r.balanceCents, uncapped: r.uncapped };
  };

  it('shipping exactly what was quoted owes and credits nothing', () => {
    const r = settle(800, 800);
    expect(r.settled).toBe(960000);
    expect(r.balance).toBe(0);
  });

  it('under-shipping credits at the LOCKED rate, beating the engine', () => {
    // engine would settle 250 at $3,600 (dead-zone buy-up to the 300 floor);
    // the locked $12 rate settles it at $3,000 — $600 more credit.
    const r = settle(800, 250);
    expect(r.settled).toBe(300000);
    expect(r.balance).toBe(-660000);
  });

  it('over-shipping still earns the better tier', () => {
    // 1,100 reaches the 1,000–4,999 tier at $10 => $11,000. The cap must NOT
    // clamp this back to the $9,600 they prepaid.
    const r = settle(800, 1100);
    expect(r.settled).toBe(1100000);
    expect(r.balance).toBe(140000);
  });

  it('a dead-zone quote shipped exactly gets NO spurious credit', () => {
    // 250 is priced as a 300-slot block ($3,600). Measuring the shortfall
    // against pricedCount instead of count would credit $600 here.
    const r = settle(250, 250);
    expect(r.settled).toBe(360000);
    expect(r.balance).toBe(0);
  });

  it('free headroom is honoured — 250 quoted, 300 shipped, nothing owed', () => {
    const r = settle(250, 300);
    expect(r.balance).toBe(0);
  });

  it('past the headroom, the extra is billed at the locked rate', () => {
    const r = settle(250, 320); // 20 past the 300 block @ $12 => $240
    expect(r.balance).toBe(24000);
  });

  it('when the engine beats the cap, the customer keeps the engine price', () => {
    const r = settle(250, 100);
    expect(r.settled).toBe(160000);
    expect(r.balance).toBe(-200000);
  });

  it('flags a line that matches nothing in the quote as uncapped', () => {
    const quoted = bar(800);
    const r = computeBalance(
      [
        { serviceSlug: 'barcoding', count: 800 },
        { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
      ],
      'academic',
      paid(960000),
      quoted.lines,
    );
    expect(r.uncapped).toEqual(['metabarcoding']);
  });

  it('treats a changed marker count as uncapped', () => {
    const quoted = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]);
    const r = computeBalance(
      [{ serviceSlug: 'metabarcoding', count: 60, markers: 3 }],
      'academic',
      paid(1),
      quoted.lines,
    );
    expect(r.uncapped).toEqual(['metabarcoding']);
  });
});

describe('creditFrom', () => {
  const row = (over: Partial<PaymentRecord>): PaymentRecord =>
    ({
      id: 'p1',
      quote_id: 'q1',
      kind: 'balance',
      status: 'settled',
      amount_cents: -660000,
      currency: 'usd',
      provider: 'shopify',
      external_id: null,
      hosted_url: null,
      pdf_url: null,
      order_ref: null,
      external_order_id: null,
      due_at: null,
      paid_at: null,
      actual_lines: null,
      created_by: null,
      created_at: '2026-09-10T00:00:00Z',
      ...over,
    }) as PaymentRecord;

  it('turns a negative settled balance into a positive credit', () => {
    const c = creditFrom(row({}));
    expect(c).toEqual({ amountCents: 660000, expiresAt: '2027-09-10T00:00:00.000Z' });
  });

  it(`expires ${CREDIT_MONTHS} months out`, () => {
    expect(CREDIT_MONTHS).toBe(12);
  });

  it('is null for every non-credit shape', () => {
    expect(creditFrom(row({ amount_cents: 0 }))).toBeNull();
    expect(creditFrom(row({ amount_cents: 1000 }))).toBeNull();
    expect(creditFrom(row({ status: 'paid' }))).toBeNull();
    expect(creditFrom(row({ kind: 'deposit' }))).toBeNull();
  });
});
