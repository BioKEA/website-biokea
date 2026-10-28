import { describe, it, expect } from 'vitest';
import { buildOrder, validateConfig, summarizeConfig, barcodingCount } from '@/lib/pricing/order';
import { ConfigSchema } from '@/lib/pricing/config-schema';

const bc = (over = {}) =>
  ({
    service: 'barcoding',
    handling: 'voucher',
    target: 'invertebrates',
    markers: ['COI'],
    sampleType: 'water',
    samples: 3,
    perSample: 50,
    preservativeEdna: false,
    kits: false,
    ...over,
  }) as const;
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

describe('buildOrder', () => {
  it('barcoding: samples × per-sample, COI+12S academic = $4,200, no triggers', () => {
    const o = buildOrder(bc({ markers: ['COI', '12S'] }));
    expect(barcodingCount(bc())).toBe(150);
    expect(o.inputs).toEqual([
      { serviceSlug: 'barcoding', count: 150, markers: 2, kind: 'service' },
    ]);
    expect(o.quote.total.academic).toBe(4200);
    expect(o.consult).toBe(false);
  });
  it('barcoding without a per-sample maximum is to-be-confirmed and consult', () => {
    const o = buildOrder(bc({ perSample: undefined }));
    expect(o.inputs).toEqual([]);
    expect(o.tbc[0].title).toMatch(/identification|barcoding/i);
    expect(o.triggers.map((t) => t.key)).toEqual(['count-unknown']);
    expect(o.consult).toBe(true);
  });
  it('id-only 400 specimens = $2,000', () => {
    const o = buildOrder(bc({ handling: 'idOnly', samples: 8 }));
    expect(o.inputs[0].kind).toBe('id-only');
    expect(o.quote.total.commercial).toBe(2000);
  });
  it('preservative eDNA adds a second line on the sample count', () => {
    const o = buildOrder(bc({ preservativeEdna: true }));
    expect(o.inputs[1]).toEqual({
      serviceSlug: 'metabarcoding',
      kind: 'preservative-edna',
      count: 3,
      markers: 1,
    });
  });
  it('eDNA 60 samples, 2 markers, commercial = $10,500; kits turn it into consult', () => {
    expect(buildOrder(edna()).quote.total.commercial).toBe(10500);
    const k = buildOrder(edna({ kits: true }));
    expect(k.consult).toBe(true);
    expect(k.triggers[0]).toEqual({
      key: 'kits',
      label: 'Sampling kits (60)',
      detail: '60 × $20, confirmed in consultation',
    });
  });
  it('other target, other marker, and unknown sample type each trigger consult with the detail text', () => {
    const o = buildOrder(
      edna({
        targets: ['other'],
        targetOther: 'tardigrades',
        markers: ['other'],
        markerOther: 'rbcL',
        sampleType: 'unknown',
        sampleOther: 'mystery',
      }),
    );
    expect(o.triggers.map((t) => [t.key, t.detail])).toEqual([
      ['target-other', 'tardigrades'],
      ['marker-other', 'rbcL'],
      ['sample-type', 'mystery'],
    ]);
  });
  it('MG+MT on 2 specimens commercial = $14,400; environmental source is consult but still priced', () => {
    const o = buildOrder({
      service: 'metagenomics',
      assays: ['mg', 'mt'],
      source: 'specimens',
      count: 2,
    });
    expect(o.quote.total.commercial).toBe(14400);
    expect(o.consult).toBe(false);
    const env = buildOrder({
      service: 'metagenomics',
      assays: ['mg'],
      source: 'environmental',
      envNotes: 'pond water',
      count: 4,
    });
    expect(env.consult).toBe(true);
    expect(env.quote.total.academic).toBe(9600);
  });
  it('qPCR is always consult with no lines and a zero total', () => {
    const o = buildOrder({
      service: 'targeted-edna',
      species: 'Dreissena',
      measure: 'presence',
      assayExists: 'unsure',
      sampleType: 'water',
    });
    expect(o.quote.lines).toEqual([]);
    expect(o.triggers[0].key).toBe('qpcr');
    expect(o.quote.total).toEqual({ academic: 0, commercial: 0 });
  });
  it('3,001 barcoding specimens is a volume consult', () => {
    const o = buildOrder(bc({ samples: 3001, perSample: 1 }));
    expect(o.triggers.map((t) => t.key)).toEqual(['volume']);
    expect(o.consult).toBe(true);
  });
});

describe('validateConfig', () => {
  it('returns {} for a valid config and names each missing field', () => {
    expect(validateConfig(bc())).toEqual({});
    const errs = validateConfig(edna({ markers: [], targets: ['other'], sampleType: 'other' }));
    expect(Object.keys(errs).sort()).toEqual(['markers', 'sampleOther', 'targetOther']);
    expect(validateConfig(bc({ material: ['other'] }))).toHaveProperty('materialNotes');
    expect(
      validateConfig({
        service: 'targeted-edna',
        species: '',
        measure: 'both',
        assayExists: 'no',
        sampleType: '',
      }),
    ).toEqual(
      expect.objectContaining({ species: expect.any(String), sampleType: expect.any(String) }),
    );
  });
});

describe('summarizeConfig', () => {
  it('lists the chosen options and the directions as plain lines', () => {
    const lines = summarizeConfig(bc({ markers: ['COI', '12S'], directions: 'Keep legs.' }));
    expect(lines[0]).toBe('Service: Voucher-linked specimen barcoding');
    expect(lines).toContain('Markers: COI, 12S');
    expect(lines).toContain('Samples: 3, up to 50 organisms each');
    expect(lines[lines.length - 1]).toBe('Directions: Keep legs.');
  });
});

describe('ConfigSchema', () => {
  it('accepts each service and rejects an unknown one', () => {
    expect(ConfigSchema.safeParse(bc()).success).toBe(true);
    expect(ConfigSchema.safeParse({ service: 'plasmids' }).success).toBe(false);
    expect(ConfigSchema.safeParse(bc({ samples: 0 })).success).toBe(false);
  });
});
