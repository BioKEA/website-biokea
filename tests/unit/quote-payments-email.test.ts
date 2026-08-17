import { describe, it, expect, vi } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { resendSender, memorySender } from '@/lib/email/resend';
import {
  depositPaidCustomerEmail,
  depositPaidLabEmail,
  balancePaidCustomerEmail,
  balancePaidLabEmail,
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
  stripe_customer_id: 'cus_1',
};
const deposit: PaymentRecord = {
  id: 'p1',
  quote_id: 'q1',
  kind: 'deposit',
  status: 'paid',
  amount_cents: 480000,
  currency: 'usd',
  stripe_invoice_id: 'in_1',
  hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  invoice_pdf: 'https://pay.stripe.com/x.pdf',
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
  stripe_invoice_id: 'in_2',
  invoice_pdf: 'https://pay.stripe.com/y.pdf',
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
    expect(m.text).toContain('https://pay.stripe.com/x.pdf');
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
    expect(c.text).toContain('https://pay.stripe.com/y.pdf');
    const l = balancePaidLabEmail(quote, balance, 'contact@biokea.ai');
    expect(l.subject).toBe('[paid in full] BK-2026-0142 · State University · $4,116.00');
  });

  it('uses the customer name when there is no organization', () => {
    const m = depositPaidLabEmail({ ...quote, organization: null }, deposit, 'contact@biokea.ai');
    expect(m.subject).toBe('[deposit paid] BK-2026-0142 · Alice · $4,800.00');
  });
});

describe('resendSender', () => {
  it('posts to Resend with the shared envelope and never throws', async () => {
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
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      }),
    );
    await expect(send({ to: 'x@y.z', subject: 'S', text: 'T' })).resolves.toBeUndefined();
  });

  it('memorySender records messages', async () => {
    const s = memorySender();
    await s({ to: 'a', subject: 'b', text: 'c' });
    expect(s.sent).toEqual([{ to: 'a', subject: 'b', text: 'c' }]);
  });
});
