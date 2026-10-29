import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import {
  FIRM_ROW_TYPES,
  finaliseFrom,
  firmQuote,
  formRows,
  parseFinaliseForm,
} from '@/lib/payments/finalise';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const base = buildQuote([{ serviceSlug: 'barcoding', count: 400, markers: 2 }]);
function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0200',
    access_token: 'tok',
    email: 'alice@state.edu',
    name: 'Alice',
    organization: null,
    lines: base.lines,
    total_academic: base.total.academic,
    total_commercial: base.total.commercial,
    needs_conversation: true,
    created_at: '2026-10-29T00:00:00Z',
    expires_at: '2026-11-28T00:00:00Z',
    status: 'consult',
    audience: 'commercial',
    source: 'site',
    academic_attested_at: null,
    po_number: null,
    external_customer_id: null,
    config: null,
    directions: null,
    consult_triggers: [],
    finalised_at: null,
    finalised_by: null,
    lab_note: null,
    ...over,
  };
}
const payment = (status: PaymentRecord['status']) => ({ kind: 'deposit', status }) as PaymentRecord;

describe('finaliseFrom', () => {
  it('a consult quote can be firmed up', () => {
    expect(finaliseFrom(quote(), [])).toBe('consult');
  });
  it('a legacy volume quote (quoted + needs_conversation) can be firmed up', () => {
    expect(finaliseFrom(quote({ status: 'quoted' }), [])).toBe('quoted');
  });
  it('a quote the lab already firmed up can be revised until it is paid', () => {
    const firmed = quote({
      status: 'quoted',
      needs_conversation: false,
      finalised_at: '2026-10-29',
    });
    expect(finaliseFrom(firmed, [])).toBe('quoted');
    expect(finaliseFrom(firmed, [payment('open')])).toBeNull();
    expect(finaliseFrom(firmed, [payment('void')])).toBe('quoted');
  });
  it('an ordinary self-serve quote is not editable here', () => {
    expect(finaliseFrom(quote({ status: 'quoted', needs_conversation: false }), [])).toBeNull();
  });
  it('nothing past quoted', () => {
    expect(finaliseFrom(quote({ status: 'deposit_invoiced' }), [])).toBeNull();
    expect(finaliseFrom(quote({ status: 'paid' }), [])).toBeNull();
  });
});

describe('formRows', () => {
  it('prefills the stored lines and adds three blank rows', () => {
    const rows = formRows(quote().lines);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ type: 'service:barcoding:', count: '400', markers: '2' });
    expect(rows[1]).toMatchObject({ type: '', count: '' });
  });
  it('a stored custom line comes back as a custom row with its price', () => {
    const q = buildQuote([
      {
        serviceSlug: 'custom-1',
        kind: 'custom',
        count: 2,
        custom: { title: 'qPCR assay', unitLabel: 'assay', academic: 900, commercial: 1200 },
      },
    ]);
    expect(formRows(q.lines)[0]).toMatchObject({
      type: 'custom',
      count: '2',
      title: 'qPCR assay',
      unit: 'assay',
      academic: '900',
      commercial: '1200',
    });
  });
  it('offers every rate-card kind plus custom', () => {
    expect(FIRM_ROW_TYPES.map((t) => t.value)).toEqual([
      'service:barcoding:',
      'id-only:barcoding:',
      'service:metabarcoding:',
      'preservative-edna:metabarcoding:',
      'assay:metagenomics:mg',
      'assay:metagenomics:mt',
      'custom',
    ]);
  });
});

const row = (i: number, f: Record<string, string>) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [`rows[${i}][${k}]`, v]));

describe('parseFinaliseForm', () => {
  it('reads engine and custom rows, skips blank rows, numbers custom slugs in order', () => {
    const r = parseFinaliseForm(
      new URLSearchParams({
        ...row(0, { type: 'service:barcoding:', count: '500', markers: '2' }),
        ...row(1, { type: '', count: '' }),
        ...row(2, {
          type: 'custom',
          count: '60',
          title: 'Sampling kits',
          unit: 'kit',
          commercial: '22',
        }),
        ...row(3, {
          type: 'custom',
          count: '1',
          title: 'Assay development',
          unit: 'project',
          academic: '1500.50',
          commercial: '2000',
        }),
        days: '45',
        note: 'Kits ship the week of Nov 10.',
        confirm: 'true',
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.confirm).toBe(true);
    expect(r.days).toBe(45);
    expect(r.note).toBe('Kits ship the week of Nov 10.');
    expect(r.inputs).toEqual([
      { serviceSlug: 'barcoding', count: 500, markers: 2 },
      {
        serviceSlug: 'custom-1',
        kind: 'custom',
        count: 60,
        custom: { title: 'Sampling kits', unitLabel: 'kit', academic: 22, commercial: 22 },
      },
      {
        serviceSlug: 'custom-2',
        kind: 'custom',
        count: 1,
        custom: {
          title: 'Assay development',
          unitLabel: 'project',
          academic: 1500.5,
          commercial: 2000,
        },
      },
    ]);
  });

  it('defaults days to 30 and the note to null', () => {
    const r = parseFinaliseForm(
      new URLSearchParams(row(0, { type: 'assay:metagenomics:mt', count: '3' })),
    );
    expect(r.ok && r.days).toBe(30);
    expect(r.ok && r.note).toBeNull();
    expect(r.ok && r.inputs).toEqual([
      { serviceSlug: 'metagenomics', kind: 'assay', assay: 'mt', count: 3 },
    ]);
  });

  it.each([
    ['no lines', {}, 'rows'],
    ['bad count', row(0, { type: 'service:barcoding:', count: '0' }), 'rows[0][count]'],
    ['unknown type', row(0, { type: 'service:qpcr:', count: '1' }), 'rows[0][type]'],
    [
      'custom without title',
      row(0, { type: 'custom', count: '1', unit: 'kit', commercial: '5' }),
      'rows[0][title]',
    ],
    [
      'custom price with 3 decimals',
      row(0, { type: 'custom', count: '1', title: 'x', unit: 'kit', commercial: '5.125' }),
      'rows[0][commercial]',
    ],
    [
      'custom zero price',
      row(0, { type: 'custom', count: '1', title: 'x', unit: 'kit', commercial: '0' }),
      'rows[0][commercial]',
    ],
    [
      'line break in title',
      row(0, { type: 'custom', count: '1', title: 'a\nb', unit: 'kit', commercial: '5' }),
      'rows[0][title]',
    ],
    [
      'markers on an assay',
      row(0, { type: 'assay:metagenomics:mg', count: '1', markers: '2' }),
      'rows[0][markers]',
    ],
    [
      'duplicate engine line',
      {
        ...row(0, { type: 'service:barcoding:', count: '1' }),
        ...row(1, { type: 'service:barcoding:', count: '2' }),
      },
      'rows[1][type]',
    ],
    [
      'days out of range',
      { ...row(0, { type: 'service:barcoding:', count: '1' }), days: '181' },
      'days',
    ],
    [
      'note too long',
      { ...row(0, { type: 'service:barcoding:', count: '1' }), note: 'x'.repeat(2001) },
      'note',
    ],
  ])('refuses %s', (_name, fields, field) => {
    const r = parseFinaliseForm(new URLSearchParams(fields as Record<string, string>));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors)).toContain(field);
  });
});

describe('firmQuote', () => {
  it('prices with the engine and clears the conversation flag, even above the volume threshold', () => {
    const q = firmQuote([{ serviceSlug: 'barcoding', count: 5000 }]);
    expect(q.needsConversation).toBe(false);
    expect(q.lines[0].needsConversation).toBe(false);
    expect(q.total.commercial).toBe(
      buildQuote([{ serviceSlug: 'barcoding', count: 5000 }]).total.commercial,
    );
  });
});
