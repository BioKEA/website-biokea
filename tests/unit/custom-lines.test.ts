import { describe, it, expect } from 'vitest';
import { buildQuote, lineKey, type QuoteLineInput } from '@/lib/pricing/quote';
import { computeBalance, paymentLines, paymentTotalCents } from '@/lib/payments/terms';
import { parseBalanceForm } from '@/lib/payments/balance-form';

const kits: QuoteLineInput = {
  serviceSlug: 'custom-1',
  kind: 'custom',
  count: 60,
  custom: { title: 'Sampling kits', unitLabel: 'kit', academic: 18.5, commercial: 22 },
};

describe('custom lines', () => {
  it('price count × the agreed unit rate per audience, rounded to whole dollars', () => {
    const q = buildQuote([kits]);
    const l = q.lines[0];
    expect(l.serviceTitle).toBe('Sampling kits');
    expect(l.unitLabel).toBe('kit');
    expect(l.kind).toBe('custom');
    expect(l.custom).toEqual(kits.custom);
    expect(l.academic.total).toBe(1110);
    expect(l.commercial.total).toBe(1320);
    expect(l.academic.effectiveRate).toBe(18.5);
    expect(l.academic.tierRange).toBe('agreed rate');
    expect(l.needsConversation).toBe(false);
    expect(q.total).toEqual({ academic: 1110, commercial: 1320 });
  });

  it('keys on the per-quote slug so two custom lines stay apart', () => {
    const q = buildQuote([kits, { ...kits, serviceSlug: 'custom-2', count: 1 }]);
    expect(q.lines.map(lineKey)).toEqual(['custom:custom-1:', 'custom:custom-2:']);
  });

  it('refuses a custom line without its price, a bad slug, or markers', () => {
    expect(() => buildQuote([{ serviceSlug: 'custom-1', kind: 'custom', count: 1 }])).toThrow();
    expect(() => buildQuote([{ ...kits, serviceSlug: 'barcoding' }])).toThrow();
    expect(() => buildQuote([{ ...kits, markers: 2 }])).toThrow();
    expect(() => buildQuote([{ ...kits, custom: { ...kits.custom!, commercial: 0 } }])).toThrow();
  });

  it('go on the payment invoice as their own line', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 100 }, kits]);
    const lines = paymentLines(q.lines, 'commercial');
    expect(lines[1]).toEqual({
      description: 'Sampling kits — 60 kits @ $22/kit, commercial rate',
      amountCents: 132000,
    });
    expect(paymentTotalCents(lines)).toBe(q.total.commercial * 100);
  });

  it('balance: re-count a custom line at the agreed rate and credit the shortfall', () => {
    const q = buildQuote([kits]);
    const form = parseBalanceForm(new URLSearchParams({ 'counts[custom:custom-1:]': '50' }));
    expect(form).not.toBeNull();
    const b = computeBalance(
      form!.inputs,
      'commercial',
      { amountCents: 132000, invoiceLabel: 'order #1', paidAt: '2026-11-01T00:00:00Z' },
      q.lines,
    );
    expect(b.actualTotalCents).toBe(110000);
    expect(b.balanceCents).toBe(-22000);
    expect(b.uncapped).toEqual([]);
  });

  it('balance: refuses a custom input that matches no quoted line', () => {
    const q = buildQuote([kits]);
    expect(() =>
      computeBalance(
        [{ serviceSlug: 'custom-9', kind: 'custom', count: 1 }],
        'commercial',
        { amountCents: 100, invoiceLabel: 'x', paidAt: '2026-11-01T00:00:00Z' },
        q.lines,
      ),
    ).toThrow();
  });
});
