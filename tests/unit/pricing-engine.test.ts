import { describe, it, expect } from 'vitest';
import { buildQuote, lineKey, nextTierUpsell } from '@/lib/pricing/quote';

const bc = (count: number) => buildQuote([{ serviceSlug: 'barcoding', count }]);
const ed = (count: number, markers = 1) =>
  buildQuote([{ serviceSlug: 'metabarcoding', count, markers }]);

describe('pricing engine — plain tier pricing', () => {
  it('prices a small barcoding batch at the $16 tier', () => {
    const q = bc(150);
    expect(q.lines[0].academic.total).toBe(2400);
    expect(q.lines[0].commercial.total).toBe(3000);
    expect(q.lines[0].academic.isBetterThanLiteral).toBe(false);
  });

  it('prices exactly 300 specimens at the $12 tier (boundary starts better tier)', () => {
    expect(bc(300).lines[0].academic.total).toBe(3600);
  });

  it('prices exactly 1000 at $10 and exactly 5000 at $6', () => {
    expect(bc(1000).lines[0].academic.total).toBe(10000);
    expect(bc(5000).lines[0].academic.total).toBe(30000);
  });

  it('prices eDNA boundaries 49 and 200 at the better tier', () => {
    expect(ed(49).lines[0].academic.total).toBe(6370);
    expect(ed(200).lines[0].academic.total).toBe(23000);
  });
});

describe('pricing engine — dead zones', () => {
  it('auto-applies the 300 rate for 275 specimens and reports headroom', () => {
    const r = bc(275).lines[0].academic;
    expect(r.total).toBe(3600);
    expect(r.literalTotal).toBe(4400);
    expect(r.pricedCount).toBe(300);
    expect(r.freeHeadroom).toBe(25);
    expect(r.savings).toBe(800);
    expect(r.isBetterThanLiteral).toBe(true);
  });

  it('auto-applies the 1000 rate for 900 specimens', () => {
    const r = bc(900).lines[0].academic;
    expect(r.total).toBe(10000);
    expect(r.savings).toBe(800);
    expect(r.freeHeadroom).toBe(100);
  });

  it('auto-applies the 49 rate for 44 eDNA samples', () => {
    const r = ed(44).lines[0].academic;
    expect(r.total).toBe(6370);
    expect(r.savings).toBe(890);
  });

  it('auto-applies the 200 rate for 185 eDNA samples', () => {
    const r = ed(185).lines[0].academic;
    expect(r.total).toBe(23000);
    expect(r.savings).toBe(1050);
  });

  it('reports no saving and no headroom outside a dead zone', () => {
    const r = bc(600).lines[0].academic;
    expect(r.total).toBe(7200);
    expect(r.savings).toBe(0);
    expect(r.freeHeadroom).toBe(0);
    expect(r.isBetterThanLiteral).toBe(false);
  });
});

describe('pricing engine — multi-marker', () => {
  it('charges the first marker in the base rate', () => {
    expect(ed(100, 1).lines[0].academic.total).toBe(13000);
  });

  it('adds $12/sample per additional marker (academic)', () => {
    // 100 samples, 3 markers: 100*130 + 2*12*100 = 13000 + 2400
    expect(ed(100, 3).lines[0].academic.total).toBe(15400);
  });

  it('adds $15/sample per additional marker (commercial)', () => {
    // 100 samples, 3 markers: 100*160 + 2*15*100 = 16000 + 3000
    expect(ed(100, 3).lines[0].commercial.total).toBe(19000);
  });

  it('markers shift where dead zones are — 177 samples x3 markers is NOT a dead zone', () => {
    const r = ed(177, 3).lines[0].academic;
    // staying at 177 (27,258) beats buying up to 200 (27,800)
    expect(r.total).toBe(27258);
    expect(r.pricedCount).toBe(177);
    expect(r.isBetterThanLiteral).toBe(false);
  });

  it('177 samples x1 marker IS a dead zone', () => {
    const r = ed(177).lines[0].academic;
    expect(r.total).toBe(23000);
    expect(r.pricedCount).toBe(200);
  });
});

describe('pricing engine — invariants', () => {
  const counts = Array.from({ length: 260 }, (_, i) => i + 1).concat([
    299, 300, 833, 834, 999, 1000, 2999, 3000, 4999, 5000, 5001, 9999, 10000,
  ]);

  it('best price never exceeds the literal price (barcoding)', () => {
    for (const n of counts) {
      const r = bc(n).lines[0].academic;
      expect(r.total).toBeLessThanOrEqual(r.literalTotal);
    }
  });

  it('total is monotonically non-decreasing in count — ordering more never costs less', () => {
    let prev = 0;
    for (let n = 1; n <= 6000; n++) {
      const total = bc(n).lines[0].academic.total;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it('monotonicity also holds for eDNA with 3 markers', () => {
    let prev = 0;
    for (let n = 1; n <= 400; n++) {
      const total = ed(n, 3).lines[0].academic.total;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });
});

describe('pricing engine — conversation band', () => {
  it('flags barcoding at and above 3001 specimens', () => {
    expect(bc(3000).needsConversation).toBe(false);
    expect(bc(3001).needsConversation).toBe(true);
    expect(bc(10000).needsConversation).toBe(true);
  });

  it('never flags eDNA at any size', () => {
    expect(ed(1).needsConversation).toBe(false);
    expect(ed(5000).needsConversation).toBe(false);
  });

  it('flags the whole quote when any line needs a conversation', () => {
    const q = buildQuote([
      { serviceSlug: 'metabarcoding', count: 50 },
      { serviceSlug: 'barcoding', count: 4000 },
    ]);
    expect(q.needsConversation).toBe(true);
  });
});

describe('pricing engine — multi-service quotes', () => {
  it('sums line totals across services', () => {
    const q = buildQuote([
      { serviceSlug: 'barcoding', count: 600 },
      { serviceSlug: 'metabarcoding', count: 100 },
    ]);
    expect(q.total.academic).toBe(7200 + 13000);
    expect(q.total.commercial).toBe(9000 + 16000);
  });
});

describe('pricing engine — upsell (non-dead-zone nudge)', () => {
  it('reports the cost of reaching the next tier from 600 specimens', () => {
    const u = nextTierUpsell('barcoding', 600, 1, 'academic')!;
    expect(u.additionalUnits).toBe(400);
    expect(u.additionalCost).toBe(2800); // 10000 - 7200
    expect(u.newRate).toBe(10);
  });

  it('returns null when already on the top tier', () => {
    expect(nextTierUpsell('barcoding', 6000, 1, 'academic')).toBeNull();
  });

  it('newRate includes the marker surcharge for multi-marker services', () => {
    // eDNA 100 samples x3 markers: next tier is 200+ at $115 base,
    // effective rate is 115 + 2*12 = 139.
    const u = nextTierUpsell('metabarcoding', 100, 3, 'academic')!;
    expect(u.newRate).toBe(139);
    expect(u.additionalUnits).toBe(100);
    // 200 * 139 = 27800, current 100 * 154 = 15400
    expect(u.additionalCost).toBe(12400);
  });

  it('additionalUnits measures from the priced count, not the requested count', () => {
    // 275 specimens is dead-zoned up to 300; reaching the 1000 tier needs
    // 700 more from there, not 725 from the raw request.
    const u = nextTierUpsell('barcoding', 275, 1, 'academic')!;
    expect(u.additionalUnits).toBe(700);
  });
});

describe('pricing engine — input validation', () => {
  it('throws on an unknown service slug', () => {
    expect(() => buildQuote([{ serviceSlug: 'nope', count: 10 }])).toThrow(/unknown service/i);
  });

  it('throws on a non-positive or non-integer count', () => {
    expect(() => bc(0)).toThrow(/count/i);
    expect(() => bc(-5)).toThrow(/count/i);
    expect(() => bc(1.5)).toThrow(/count/i);
  });

  it('throws when markers are requested for a service that has none', () => {
    // Barcoding gained a marker rule (75% per added marker); assays have none.
    expect(() =>
      buildQuote([
        { serviceSlug: 'metagenomics', count: 10, kind: 'assay', assay: 'mg', markers: 2 },
      ]),
    ).toThrow(/marker/i);
  });
});

describe('line kinds', () => {
  it('prices barcoding extra markers at 75% of the tier rate on the priced count', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 150, markers: 2 }]);
    expect(q.lines[0].academic.total).toBe(150 * 16 + 150 * 12); // 4200
    expect(q.lines[0].academic.effectiveRate).toBe(28);
  });
  it('still refuses markers on a service with no marker rule', () => {
    expect(() =>
      buildQuote([
        { serviceSlug: 'metagenomics', count: 1, kind: 'assay', assay: 'mg', markers: 2 },
      ]),
    ).toThrow();
  });
  it('prices id-only barcoding flat at $5 for both audiences and rounds fractions', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 400, kind: 'id-only' }]);
    expect(q.lines[0].academic.total).toBe(2000);
    expect(q.lines[0].commercial.total).toBe(2000);
    expect(q.lines[0].serviceTitle).toBe('Specimen barcoding, identification only');
    const two = buildQuote([{ serviceSlug: 'barcoding', count: 3, kind: 'id-only', markers: 2 }]);
    expect(two.lines[0].academic.total).toBe(Math.round(3 * (5 + 3.75))); // 26
  });
  it('prices preservative eDNA at the eDNA tiers with eDNA marker pricing', () => {
    const q = buildQuote([
      { serviceSlug: 'metabarcoding', count: 60, markers: 2, kind: 'preservative-edna' },
    ]);
    expect(q.lines[0].commercial.total).toBe(60 * (160 + 15));
    expect(q.lines[0].serviceTitle).toBe('Bulk eDNA from preservative');
  });
  it('prices metagenome and metatranscriptome assays per specimen', () => {
    const q = buildQuote([
      { serviceSlug: 'metagenomics', count: 2, kind: 'assay', assay: 'mg' },
      { serviceSlug: 'metagenomics', count: 2, kind: 'assay', assay: 'mt' },
    ]);
    expect(q.total.commercial).toBe(2 * 3000 + 2 * 4200); // 14400
    expect(q.lines[1].serviceTitle).toBe('Metatranscriptome sequencing');
    expect(q.needsConversation).toBe(false);
  });
  it('rejects a kind on the wrong service and a missing assay', () => {
    expect(() =>
      buildQuote([{ serviceSlug: 'metabarcoding', count: 1, kind: 'id-only' }]),
    ).toThrow();
    expect(() => buildQuote([{ serviceSlug: 'metagenomics', count: 1, kind: 'assay' }])).toThrow();
  });
  it('legacy inputs produce kind service and the same totals as before', () => {
    const q = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]);
    expect(q.lines[0].kind).toBe('service');
    expect(q.lines[0].commercial.total).toBe(60 * 175);
  });
  it('lineKey distinguishes kinds and assays', () => {
    expect(lineKey({ kind: 'assay', serviceSlug: 'metagenomics', assay: 'mt' })).toBe(
      'assay:metagenomics:mt',
    );
    expect(lineKey({ kind: 'service', serviceSlug: 'barcoding' })).toBe('service:barcoding:');
    // Rows stored before kinds existed have no kind; they are service lines.
    expect(lineKey({ serviceSlug: 'barcoding' })).toBe('service:barcoding:');
  });
  it('offers no tier upsell for flat lines', () => {
    expect(nextTierUpsell('barcoding', 10, 1, 'academic', 'id-only')).toBeNull();
  });
});
