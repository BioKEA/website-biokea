import { describe, it, expect, vi } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { resendSender, memorySender } from '@/lib/email/resend';
import {
  depositPaidCustomerEmail,
  depositPaidLabEmail,
  balancePaidCustomerEmail,
  balancePaidLabEmail,
  refundLabEmail,
} from '@/lib/email/quote-payments';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const quote: QuoteRecord = {
  id: 'q1',
  quote_number: 'BK-2026-0142',
  access_token: 'tok',
  email: 'alice@state.edu',
  name: 'Alice',
  organization: 'State University',
  lines: q.lines,
  total_academic: q.total.academic,
  total_commercial: q.total.commercial,
  needs_conversation: false,
  created_at: '2026-08-20T00:00:00Z',
  expires_at: '2026-09-19T00:00:00Z',
  status: 'deposit_paid',
  audience: 'academic',
  academic_attested_at: '2026-09-01T00:00:00Z',
  po_number: 'PO-77',
  external_customer_id: 'cus_1',
};
const deposit: PaymentRecord = {
  id: 'p1',
  quote_id: 'q1',
  kind: 'deposit',
  status: 'paid',
  amount_cents: 480000,
  currency: 'usd',
  provider: 'shopify',
  external_id: 'in_1',
  hosted_url: 'https://invoice.example.com/i/x',
  pdf_url: 'https://pay.example.com/x.pdf',
  order_ref: null,
  external_order_id: null,
  due_at: null,
  paid_at: '2026-09-02T10:00:00Z',
  actual_lines: null,
  created_by: null,
  created_at: '2026-09-01T00:00:00Z',
};
const balance: PaymentRecord = {
  ...deposit,
  id: 'p2',
  kind: 'balance',
  amount_cents: 411600,
  external_id: 'in_2',
  pdf_url: 'https://pay.example.com/y.pdf',
  paid_at: '2026-10-20T00:00:00Z',
};

describe('payment emails', () => {
  it('deposit paid → customer: amount, next steps, quote link, receipt', () => {
    const m = depositPaidCustomerEmail(quote, deposit);
    expect(m.to).toBe('alice@state.edu');
    expect(m.subject).toBe('Deposit received — BioKEA quote BK-2026-0142');
    expect(m.replyTo).toBe('contact@biokea.ai');
    expect(m.text).toContain('$4,800.00');
    expect(m.text).toContain('within 2 business days');
    expect(m.text).toContain('https://biokea.ai/quote/tok');
    expect(m.text).toContain('https://pay.example.com/x.pdf');
  });

  it('deposit paid → lab: lines, audience, PO, customer, admin link', () => {
    const m = depositPaidLabEmail(quote, deposit, 'contact@biokea.ai');
    expect(m.to).toBe('contact@biokea.ai');
    expect(m.subject).toBe('[deposit paid] BK-2026-0142 · State University · $4,800.00');
    expect(m.replyTo).toBe('alice@state.edu');
    expect(m.text).toContain('Voucher-Linked Specimen Barcoding: 800 specimens');
    expect(m.text).toContain('× 2 markers');
    expect(m.text).toContain('Rate: academic');
    expect(m.text).toContain('PO number: PO-77');
    expect(m.text).toContain('https://biokea.ai/admin/quotes/BK-2026-0142');
  });

  it('balance paid → customer and lab', () => {
    const c = balancePaidCustomerEmail(quote, balance);
    expect(c.subject).toBe('Paid in full — BioKEA quote BK-2026-0142');
    expect(c.text).toContain('$4,116.00');
    expect(c.text).toContain('https://pay.example.com/y.pdf');
    const l = balancePaidLabEmail(quote, balance, 'contact@biokea.ai');
    expect(l.subject).toBe('[paid in full] BK-2026-0142 · State University · $4,116.00');
  });

  it('uses the customer name when there is no organization', () => {
    const m = depositPaidLabEmail({ ...quote, organization: null }, deposit, 'contact@biokea.ai');
    expect(m.subject).toBe('[deposit paid] BK-2026-0142 · Alice · $4,800.00');
  });

  it('refund lab email: subject, no-state-change message, admin link', () => {
    const m = refundLabEmail(quote, deposit, '#1042', 'contact@biokea.ai');
    expect(m.to).toBe('contact@biokea.ai');
    expect(m.replyTo).toBe('alice@state.edu');
    expect(m.subject).toBe('[refund] BK-2026-0142 · State University · order #1042');
    expect(m.text).toContain(
      'A refund was recorded in Shopify on order #1042 for quote BK-2026-0142.',
    );
    expect(m.text).toContain('No status change was made; review in Shopify admin.');
    expect(m.text).toContain('https://biokea.ai/admin/quotes/BK-2026-0142');
  });

  it('refund lab email uses the customer name when there is no organization', () => {
    const m = refundLabEmail(
      { ...quote, organization: null },
      deposit,
      '#1042',
      'contact@biokea.ai',
    );
    expect(m.subject).toBe('[refund] BK-2026-0142 · Alice · order #1042');
  });
});

describe('resendSender', () => {
  it('posts to Resend with the shared envelope and never throws on success', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return new Response('{"id":"m"}', { status: 200 });
      }),
    );
    const send = resendSender({
      RESEND_API_KEY: 'k',
      CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
    });
    await send({ to: 'x@y.z', subject: 'S', text: 'T', replyTo: 'contact@biokea.ai' });
    expect(calls[0]).toEqual({
      from: 'BioKEA <notifications@biokea.ai>',
      to: 'x@y.z',
      reply_to: 'contact@biokea.ai',
      subject: 'S',
      text: 'T',
    });
  });

  it('logs Resend non-2xx errors and never throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"message":"invalid key"}', {
            status: 401,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const send = resendSender({
      RESEND_API_KEY: 'k',
      CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
    });
    await expect(send({ to: 'x@y.z', subject: 'Test', text: 'T' })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain('Resend 401');
    spy.mockRestore();
  });

  it('logs network errors and never throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net down');
      }),
    );
    const send = resendSender({
      RESEND_API_KEY: 'k',
      CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
    });
    await expect(send({ to: 'x@y.z', subject: 'Test', text: 'T' })).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('memorySender records messages', async () => {
    const s = memorySender();
    await s({ to: 'a', subject: 'b', text: 'c' });
    expect(s.sent).toEqual([{ to: 'a', subject: 'b', text: 'c' }]);
  });

  it('shows actual invoiced counts in balance-paid lab email when present', () => {
    const balanceWithActual: PaymentRecord = {
      ...balance,
      actual_lines: [
        { serviceSlug: 'barcoding', count: 743, markers: 0 },
        { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
      ],
    };
    const m = balancePaidLabEmail(quote, balanceWithActual, 'contact@biokea.ai');
    expect(m.text).toContain('Actual counts (invoiced):');
    expect(m.text).toContain('barcoding: 743');
    expect(m.text).toContain('metabarcoding: 58 × 2 markers');
  });

  it('does not show actual counts in deposit lab email', () => {
    const m = depositPaidLabEmail(quote, deposit, 'contact@biokea.ai');
    expect(m.text).not.toContain('Actual counts');
  });
});
