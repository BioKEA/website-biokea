import { describe, it, expect } from 'vitest';
import { buildQuote, nextTierUpsell } from '@/lib/pricing/quote';
import { baseText, lineBreakdown, markerText } from '@/lib/pricing/breakdown';
import { paymentLines, paymentTotalCents } from '@/lib/payments/terms';

// Sean, 2026-11-10: with several eDNA markers the total must read as
// samples × the tier's per-sample rate, plus $12 (academic) or $15
// (commercial) per sample per added marker — not one blended rate.
const edna60x2 = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]).lines[0];

describe('lineBreakdown', () => {
  it('splits a two-marker eDNA line into the tier rate and the marker charge', () => {
    expect(lineBreakdown(edna60x2, 'commercial')).toEqual({
      units: 60,
      baseRate: 160,
      baseTotal: 9600,
      extraMarkers: 1,
      markerRate: 15,
      markerTotal: 900,
    });
    expect(lineBreakdown(edna60x2, 'academic')).toMatchObject({
      baseRate: 130,
      baseTotal: 7800,
      markerRate: 12,
      markerTotal: 720,
    });
  });

  it('three markers: two added markers per sample', () => {
    const l = buildQuote([{ serviceSlug: 'metabarcoding', count: 250, markers: 3 }]).lines[0];
    const b = lineBreakdown(l, 'commercial')!;
    expect(b).toMatchObject({ baseRate: 145, extraMarkers: 2, markerRate: 15 });
    expect(b.baseTotal + b.markerTotal).toBe(l.commercial.total);
    expect(b.markerTotal).toBe(250 * 2 * 15);
  });

  it('parts always add up to the line total, cents and all (barcoding fractions)', () => {
    const l = buildQuote([{ serviceSlug: 'barcoding', count: 7, markers: 2, kind: 'id-only' }])
      .lines[0];
    const b = lineBreakdown(l, 'commercial')!;
    expect(b.markerRate).toBe(3.75);
    expect(b.baseTotal + b.markerTotal).toBe(l.commercial.total);
  });

  it('is null for one marker and for lines stored before baseRate existed', () => {
    const one = buildQuote([{ serviceSlug: 'metabarcoding', count: 60 }]).lines[0];
    expect(lineBreakdown(one, 'commercial')).toBeNull();
    const legacy = structuredClone(edna60x2);
    delete legacy.commercial.baseRate;
    expect(lineBreakdown(legacy, 'commercial')).toBeNull();
  });

  it('reads as sentences', () => {
    const b = lineBreakdown(edna60x2, 'commercial')!;
    expect(baseText(b, 'sample')).toBe('60 samples × $160 = $9,600');
    expect(markerText(b, 'sample')).toBe('1 added marker × 60 samples × $15 = $900');
  });
});

describe('Shopify invoice lines', () => {
  it('bill the marker charge as its own line, same total', () => {
    const lines = paymentLines([edna60x2], 'commercial');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ amountCents: 960000 });
    expect(lines[0].description).toContain('60 samples @ $160/sample');
    expect(lines[1]).toMatchObject({ amountCents: 90000 });
    expect(lines[1].description).toContain('1 added marker × 60 samples @ $15');
    expect(paymentTotalCents(lines)).toBe(1050000);
  });

  it('a one-marker line stays one invoice line', () => {
    const one = buildQuote([{ serviceSlug: 'metabarcoding', count: 60 }]).lines;
    expect(paymentLines(one, 'commercial')).toHaveLength(1);
  });
});

describe('upsell', () => {
  it('names the next tier base rate separately from the marker charge', () => {
    const u = nextTierUpsell('metabarcoding', 60, 2, 'commercial')!;
    expect(u.newBaseRate).toBe(145);
    expect(u.newRate).toBe(160);
  });
});

describe('emails', () => {
  it('the firm-quote email shows the marker arithmetic for the recorded audience', async () => {
    const { firmQuoteReadyEmail } = await import('@/lib/email/quote-finalised');
    const msg = firmQuoteReadyEmail(
      {
        id: 'q',
        quote_number: 'BK-2026-0001',
        access_token: 't',
        email: 'a@b.org',
        name: 'A',
        organization: null,
        lines: [edna60x2],
        total_academic: edna60x2.academic.total,
        total_commercial: edna60x2.commercial.total,
        needs_conversation: false,
        created_at: '2026-11-10T00:00:00Z',
        expires_at: '2026-12-10T00:00:00Z',
        status: 'quoted',
        audience: 'commercial',
        source: 'site',
        academic_attested_at: null,
        po_number: null,
        external_customer_id: null,
        config: null,
        directions: null,
        consult_triggers: [],
      },
      false,
    );
    expect(msg.text).toContain('60 samples × $160 = $9,600');
    expect(msg.text).toContain('+ 1 added marker × 60 samples × $15 = $900');
    expect(msg.text).toContain('$10,500');
  });
});
