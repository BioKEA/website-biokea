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
    stripe_customer_id: null,
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
    stripe_invoice_id: 'in_1',
    hosted_invoice_url: 'https://invoice.stripe.com/i/x',
    invoice_pdf: 'https://pay.stripe.com/x.pdf',
    due_at: '2026-10-01T00:00:00Z',
    paid_at: null,
    actual_lines: null,
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('panelView', () => {
  it('offers the deposit at both rates for a fresh, valid quote', () => {
    const v = panelView(quote(), [], now);
    expect(v.kind).toBe('offer');
    if (v.kind !== 'offer') return;
    expect(v.depositAcademicCents).toBe(q.total.academic * 100 * 0.5);
    expect(v.depositCommercialCents).toBe(q.total.commercial * 100 * 0.5);
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
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/x',
      invoicePdf: 'https://pay.stripe.com/x.pdf',
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
      invoicePdf: 'https://pay.stripe.com/x.pdf',
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
          stripe_invoice_id: 'in_2',
          hosted_invoice_url: 'https://invoice.stripe.com/i/y',
          invoice_pdf: null,
        }),
      ],
      now,
    );
    expect(v.kind).toBe('invoiced');
    if (v.kind !== 'invoiced') return;
    expect(v.phase).toBe('balance');
    expect(v.amountCents).toBe(411600);
    expect(v.hostedInvoiceUrl).toBe('https://invoice.stripe.com/i/y');
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
          invoice_pdf: 'https://pay.stripe.com/y.pdf',
          paid_at: '2026-10-20T00:00:00Z',
        }),
      ],
      now,
    );
    expect(paid).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.stripe.com/x.pdf',
      balancePdf: 'https://pay.stripe.com/y.pdf',
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
          stripe_invoice_id: null,
          invoice_pdf: null,
          hosted_invoice_url: null,
        }),
      ],
      now,
    );
    expect(settled).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.stripe.com/x.pdf',
      balancePdf: null,
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
        payment({ id: 'old', status: 'void', hosted_invoice_url: 'https://old' }),
        payment({ id: 'new', hosted_invoice_url: 'https://new' }),
      ],
      now,
    );
    expect(v.kind === 'invoiced' && v.hostedInvoiceUrl).toBe('https://new');
  });
});
