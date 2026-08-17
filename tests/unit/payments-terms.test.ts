import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import {
  DEPOSIT_FRACTION,
  usdCents,
  depositLines,
  depositTotalCents,
  assertDepositSane,
  computeBalance,
} from '@/lib/payments/terms';

const quote = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);

describe('usdCents', () => {
  it('formats cents as US dollars', () => {
    expect(usdCents(123450)).toBe('$1,234.50');
    expect(usdCents(0)).toBe('$0.00');
    expect(usdCents(-500)).toBe('-$5.00');
  });
});

describe('depositLines', () => {
  it('halves each line at the chosen audience rate, in cents, one line per service', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(lines).toHaveLength(2);
    expect(lines[0].amountCents).toBe(
      Math.round(quote.lines[0].academic.total * 100 * DEPOSIT_FRACTION),
    );
    expect(lines[1].amountCents).toBe(
      Math.round(quote.lines[1].academic.total * 100 * DEPOSIT_FRACTION),
    );
  });

  it('describes the line with title, estimated count, rate, and audience', () => {
    const [barcoding, edna] = depositLines(quote.lines, 'commercial');
    expect(barcoding.description).toBe(
      `Voucher-Linked Specimen Barcoding — 50% deposit on 800 specimens (est.) @ $${quote.lines[0].commercial.effectiveRate}/specimen, commercial rate`,
    );
    expect(edna.description).toContain('× 2 markers');
    expect(edna.description).toContain('commercial rate');
  });

  it('uses the commercial total when asked', () => {
    const [a] = depositLines(quote.lines, 'academic');
    const [c] = depositLines(quote.lines, 'commercial');
    expect(c.amountCents).toBeGreaterThan(a.amountCents);
  });
});

describe('depositTotalCents + assertDepositSane', () => {
  it('sums the per-line amounts', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(depositTotalCents(lines)).toBe(lines[0].amountCents + lines[1].amountCents);
  });

  it('accepts a deposit within one cent per line of half the total', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(() =>
      assertDepositSane(quote.total.academic, depositTotalCents(lines), lines.length),
    ).not.toThrow();
  });

  it('rejects a deposit under $1 or far from half the total', () => {
    expect(() => assertDepositSane(1, 50, 1)).toThrow(/deposit/i);
    expect(() => assertDepositSane(10000, 100, 1)).toThrow(/deposit/i);
  });
});

describe('computeBalance', () => {
  const deposit = {
    amountCents: 480000,
    invoiceLabel: 'invoice A1B2C3D4-0001',
    paidAt: '2026-09-01T00:00:00Z',
  };

  it('prices actual counts with the engine at the recorded audience and credits the deposit', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 743 }], 'academic', deposit);
    const expectedTotal =
      buildQuote([{ serviceSlug: 'barcoding', count: 743 }]).total.academic * 100;
    expect(r.actualTotalCents).toBe(expectedTotal);
    expect(r.balanceCents).toBe(expectedTotal - 480000);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].amountCents).toBe(expectedTotal);
    expect(r.lines[0].description).toMatch(
      /^Voucher-Linked Specimen Barcoding — 743 specimens @ \$\d+\/specimen, academic rate$/,
    );
    expect(r.lines.every((l) => l.amountCents >= 0)).toBe(true);
    expect(r.credit).toEqual({
      title: 'Deposit received (invoice A1B2C3D4-0001, paid 2026-09-01)',
      amountCents: 480000,
    });
    expect(r.actualLines[0].count).toBe(743);
  });

  it('returns a non-positive balance when the actual total is at or under the deposit', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 100 }], 'academic', deposit);
    expect(r.balanceCents).toBeLessThanOrEqual(0);
  });

  it('still prices counts above the conversation threshold (the human check already happened)', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 5000 }], 'commercial', deposit);
    expect(r.actualTotalCents).toBe(
      buildQuote([{ serviceSlug: 'barcoding', count: 5000 }]).total.commercial * 100,
    );
  });

  it('throws on an unknown service or a bad count, like the engine', () => {
    expect(() =>
      computeBalance([{ serviceSlug: 'nope', count: 1 }], 'academic', deposit),
    ).toThrow();
    expect(() =>
      computeBalance([{ serviceSlug: 'barcoding', count: 0 }], 'academic', deposit),
    ).toThrow();
  });
});
