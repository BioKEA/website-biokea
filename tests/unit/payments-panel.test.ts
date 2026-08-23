import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { panelView } from '@/lib/payments/panel';
import type { PaymentRecord, QuoteRecord, QuoteStatus } from '@/lib/payments/types';

const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
const now = new Date('2026-09-01T00:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: 't',
    email: 'a@b.edu',
    name: 'Alice',
    organization: null,
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
function payment(over: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'p1',
    quote_id: 'q1',
    kind: 'deposit',
    status: 'open',
    amount_cents: 480000,
    currency: 'usd',
    provider: 'shopify',
    external_id: 'in_1',
    hosted_url: 'https://invoice.example.com/i/x',
    pdf_url: 'https://pay.example.com/x.pdf',
    order_ref: null,
    external_order_id: null,
    due_at: '2026-10-01T00:00:00Z',
    paid_at: null,
    actual_lines: null,
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('panelView', () => {
  it('offers the payment at both rates for a fresh, valid quote', () => {
    const v = panelView(quote(), [], now);
    expect(v.kind).toBe('offer');
    if (v.kind !== 'offer') return;
    expect(v.amountAcademicCents).toBe(q.total.academic * 100);
    expect(v.amountCommercialCents).toBe(q.total.commercial * 100);
  });

  it('offers a single amount when the quote knows its audience', () => {
    const v = panelView(quote({ audience: 'academic' }), [], now);
    expect(v).toMatchObject({ kind: 'offer', audience: 'academic' });
  });

  it('offers both amounts for a legacy quote with no audience', () => {
    const v = panelView(quote({ audience: null }), [], now);
    // PanelView is a union — narrow before reading the offer's fields.
    expect(v.kind).toBe('offer');
    if (v.kind !== 'offer') throw new Error('unreachable');
    expect(v.audience).toBeNull();
    expect(v.amountAcademicCents).toBeGreaterThan(0);
    expect(v.amountCommercialCents).toBeGreaterThan(0);
  });

  it('asks for an attestation only when academic and not yet attested', () => {
    expect(
      panelView(quote({ audience: 'academic', academic_attested_at: null }), [], now),
    ).toMatchObject({ needsAttestation: true });
    expect(
      panelView(
        quote({ audience: 'academic', academic_attested_at: '2026-08-22T00:00:00Z' }),
        [],
        now,
      ),
    ).toMatchObject({ needsAttestation: false });
    expect(panelView(quote({ audience: 'commercial' }), [], now)).toMatchObject({
      needsAttestation: false,
    });
  });

  it('offers the full total, not half of it', () => {
    const v = panelView(quote({ audience: 'academic' }), [], now);
    if (v.kind !== 'offer') throw new Error('expected an offer');
    expect(v.amountAcademicCents).toBe(Math.round(q.total.academic * 100));
  });

  it('surfaces a credit on a settled project', () => {
    const paidPayment = payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    const settledNegative = payment({
      id: 'p2',
      kind: 'balance',
      status: 'settled',
      amount_cents: -660000,
      external_id: null,
      pdf_url: null,
      hosted_url: null,
      created_at: '2026-09-10T00:00:00Z',
    });
    const v = panelView(quote({ status: 'paid' }), [paidPayment, settledNegative], now);
    expect(v).toMatchObject({
      kind: 'paid',
      creditCents: 660000,
      creditExpiresAt: '2027-09-10T00:00:00.000Z',
    });
  });

  it('reports no credit when the project settled square', () => {
    const paidPayment = payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    const settledZero = payment({
      id: 'p2',
      kind: 'balance',
      status: 'settled',
      amount_cents: 0,
      external_id: null,
      pdf_url: null,
      hosted_url: null,
      created_at: '2026-09-10T00:00:00Z',
    });
    const v = panelView(quote({ status: 'paid' }), [paidPayment, settledZero], now);
    expect(v).toMatchObject({ kind: 'paid', creditCents: null });
  });

  it('shows nothing for conversation-band or expired quotes with no deposit', () => {
    expect(panelView(quote({ needs_conversation: true }), [], now).kind).toBe('none');
    expect(panelView(quote({ expires_at: '2026-08-31T00:00:00Z' }), [], now).kind).toBe('none');
  });

  it('shows the open deposit invoice, even after the quote itself expired', () => {
    const v = panelView(
      quote({ status: 'deposit_invoiced', expires_at: '2026-08-31T00:00:00Z' }),
      [payment({})],
      now,
    );
    expect(v).toEqual({
      kind: 'invoiced',
      phase: 'deposit',
      amountCents: 480000,
      dueAt: '2026-10-01T00:00:00Z',
      hostedUrl: 'https://invoice.example.com/i/x',
      pdfUrl: 'https://pay.example.com/x.pdf',
    });
  });

  it('shows deposit received', () => {
    const v = panelView(
      quote({ status: 'deposit_paid' }),
      [payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' })],
      now,
    );
    expect(v).toEqual({
      kind: 'deposit_paid',
      amountCents: 480000,
      paidAt: '2026-09-02T10:00:00Z',
      pdfUrl: 'https://pay.example.com/x.pdf',
    });
  });

  it('shows the open balance invoice', () => {
    const v = panelView(
      quote({ status: 'balance_invoiced' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          amount_cents: 411600,
          external_id: 'in_2',
          hosted_url: 'https://invoice.example.com/i/y',
          pdf_url: null,
        }),
      ],
      now,
    );
    expect(v.kind).toBe('invoiced');
    if (v.kind !== 'invoiced') return;
    expect(v.phase).toBe('balance');
    expect(v.amountCents).toBe(411600);
    expect(v.hostedUrl).toBe('https://invoice.example.com/i/y');
  });

  it('shows paid in full with both PDFs (balance PDF absent when settled without an invoice)', () => {
    const paid = panelView(
      quote({ status: 'paid' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          status: 'paid',
          pdf_url: 'https://pay.example.com/y.pdf',
          paid_at: '2026-10-20T00:00:00Z',
        }),
      ],
      now,
    );
    expect(paid).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.example.com/x.pdf',
      balancePdf: 'https://pay.example.com/y.pdf',
      creditCents: null,
      creditExpiresAt: null,
    });
    const settled = panelView(
      quote({ status: 'paid' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          status: 'settled',
          amount_cents: -1200,
          external_id: null,
          pdf_url: null,
          hosted_url: null,
        }),
      ],
      now,
    );
    expect(settled).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.example.com/x.pdf',
      balancePdf: null,
      creditCents: 1200,
      creditExpiresAt: '2027-09-01T00:00:00.000Z',
    });
  });

  it('shows nothing for a pre-migration row with an unrecognized/undefined status', () => {
    const v = panelView({ ...quote(), status: undefined as unknown as QuoteStatus }, [], now);
    expect(v).toEqual({ kind: 'none' });
  });

  it('ignores voided rows when picking the live payment', () => {
    const v = panelView(
      quote({ status: 'deposit_invoiced' }),
      [
        payment({ id: 'old', status: 'void', hosted_url: 'https://old' }),
        payment({ id: 'new', hosted_url: 'https://new' }),
      ],
      now,
    );
    expect(v.kind === 'invoiced' && v.hostedUrl).toBe('https://new');
  });
});
