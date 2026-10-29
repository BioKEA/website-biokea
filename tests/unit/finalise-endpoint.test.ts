import { describe, it, expect, beforeEach } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import type { EmailMessage } from '@/lib/email/resend';
import { handleFinalise } from '@/pages/api/admin/quotes/[number]/finalise';
import { firmQuoteReadyEmail } from '@/lib/email/quote-finalised';
import type { QuoteRecord } from '@/lib/payments/types';
import { panelView } from '@/lib/payments/panel';

const N = 'BK-2026-0300';
const NOW = new Date('2026-11-02T12:00:00Z');
const qpcrTrigger = { key: 'qpcr' as const, label: 'Targeted eDNA (qPCR)', detail: 'Delta smelt' };

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: N,
    access_token: 'tok-300',
    email: 'rae@agency.gov',
    name: 'Rae',
    organization: 'State Water Agency',
    lines: [],
    total_academic: 0,
    total_commercial: 0,
    needs_conversation: true,
    created_at: '2026-10-29T00:00:00Z',
    expires_at: '2026-11-28T00:00:00Z',
    status: 'consult',
    audience: 'commercial',
    source: 'store',
    academic_attested_at: null,
    po_number: null,
    external_customer_id: null,
    config: null,
    directions: null,
    consult_triggers: [qpcrTrigger],
    finalised_at: null,
    finalised_by: null,
    lab_note: null,
    ...over,
  };
}

const firm = {
  'rows[0][type]': 'custom',
  'rows[0][count]': '48',
  'rows[0][title]': 'Delta smelt qPCR',
  'rows[0][unit]': 'sample',
  'rows[0][commercial]': '85',
  'rows[0][academic]': '70',
  'rows[1][type]': 'service:metabarcoding:',
  'rows[1][count]': '12',
  'rows[2][type]': '',
  days: '45',
  note: 'Includes assay validation on your positive controls.',
};
function post(fields: Record<string, string>) {
  return new Request(`https://biokea.ai/api/admin/quotes/${N}/finalise`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

let db: MemoryDb;
let sent: EmailMessage[];
let emailFails: boolean;
const deps = () => ({
  db,
  actorEmail: 'michelle@biokea.ai',
  email: async (m: EmailMessage) => {
    if (emailFails) throw new Error('resend down');
    sent.push(m);
  },
  now: () => NOW,
});
beforeEach(() => {
  db = new MemoryDb();
  db.quotes.push(quote());
  sent = [];
  emailFails = false;
});
const location = (r: Response) => r.headers.get('location') ?? '';

describe('POST /api/admin/quotes/<n>/finalise', () => {
  it('without confirm, bounces the form back to the admin page as a preview', async () => {
    const res = await handleFinalise(post(firm), N, deps());
    expect(res.status).toBe(303);
    const url = new URL(location(res), 'https://biokea.ai');
    expect(url.pathname).toBe(`/admin/quotes/${N}`);
    expect(url.searchParams.get('preview')).toBe('finalise');
    expect(url.searchParams.get('rows[0][title]')).toBe('Delta smelt qPCR');
    expect(url.hash).toBe('#firm');
    expect(db.quotes[0].status).toBe('consult');
  });

  it('confirm firms up a consult quote and emails the customer', async () => {
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    expect(location(res)).toBe(`/admin/quotes/${N}?finalised=sent#firm`);
    const q = db.quotes[0];
    const expected = buildQuote([
      {
        serviceSlug: 'custom-1',
        kind: 'custom',
        count: 48,
        custom: { title: 'Delta smelt qPCR', unitLabel: 'sample', academic: 70, commercial: 85 },
      },
      { serviceSlug: 'metabarcoding', count: 12 },
    ]);
    expect(q.status).toBe('quoted');
    expect(q.needs_conversation).toBe(false);
    expect(q.total_commercial).toBe(expected.total.commercial);
    expect(q.total_academic).toBe(expected.total.academic);
    expect(q.lines.map((l) => l.serviceTitle)).toEqual([
      'Delta smelt qPCR',
      'Environmental DNA (eDNA) Metabarcoding',
    ]);
    expect(q.expires_at).toBe('2026-12-17T12:00:00.000Z');
    expect(q.finalised_at).toBe(NOW.toISOString());
    expect(q.finalised_by).toBe('michelle@biokea.ai');
    expect(q.lab_note).toBe('Includes assay validation on your positive controls.');
    // The consult reasons stay stored as history.
    expect(q.consult_triggers).toEqual([qpcrTrigger]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe('rae@agency.gov');
    expect(sent[0].subject).toBe(`Your BioKEA quote ${N} is ready`);
  });

  it('a firmed-up quote gets the customer pay offer for the firm total', async () => {
    expect(panelView(db.quotes[0], [], NOW)).toEqual({ kind: 'none' });
    await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    const q = db.quotes[0];
    expect(panelView(q, [], NOW)).toMatchObject({
      kind: 'offer',
      audience: 'commercial',
      amountCommercialCents: q.total_commercial * 100,
    });
  });

  it('an invalid form bounces to the preview even with confirm', async () => {
    const res = await handleFinalise(
      post({ ...firm, 'rows[0][commercial]': 'free', confirm: 'true' }),
      N,
      deps(),
    );
    const url = new URL(location(res), 'https://biokea.ai');
    expect(url.searchParams.get('preview')).toBe('finalise');
    expect(url.searchParams.get('confirm')).toBeNull();
    expect(db.quotes[0].status).toBe('consult');
    expect(sent).toHaveLength(0);
  });

  it('refuses once a payment exists on the quote', async () => {
    db.quotes[0] = quote({ status: 'quoted', needs_conversation: false, finalised_at: 'x' });
    await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 100 });
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    expect(location(res)).toBe(`/admin/quotes/${N}?error=finalise-state#firm`);
  });

  it('refuses an ordinary self-serve quote', async () => {
    db.quotes[0] = quote({ status: 'quoted', needs_conversation: false });
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    expect(location(res)).toBe(`/admin/quotes/${N}?error=finalise-state#firm`);
  });

  it('loses a race cleanly: the quote moved on after it was read', async () => {
    const racing = new MemoryDb();
    racing.quotes.push(quote());
    racing.finaliseQuoteIf = async () => false;
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, {
      ...deps(),
      db: racing,
    });
    expect(location(res)).toBe(`/admin/quotes/${N}?error=finalise-state#firm`);
    expect(sent).toHaveLength(0);
  });

  it('firms up a legacy volume quote', async () => {
    const big = buildQuote([{ serviceSlug: 'barcoding', count: 4000 }]);
    db.quotes[0] = quote({
      status: 'quoted',
      lines: big.lines,
      total_academic: big.total.academic,
      total_commercial: big.total.commercial,
      consult_triggers: [],
    });
    const res = await handleFinalise(
      post({ 'rows[0][type]': 'service:barcoding:', 'rows[0][count]': '4000', confirm: 'true' }),
      N,
      deps(),
    );
    expect(location(res)).toBe(`/admin/quotes/${N}?finalised=sent#firm`);
    expect(db.quotes[0].needs_conversation).toBe(false);
    expect(db.quotes[0].lines[0].needsConversation).toBe(false);
  });

  it('revising a firm quote sends the revised wording', async () => {
    db.quotes[0] = quote({ status: 'quoted', needs_conversation: false, finalised_at: 'x' });
    await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    expect(sent[0].subject).toBe(`Your BioKEA quote ${N} has been updated`);
  });

  it('an email failure still saves the quote and says so', async () => {
    emailFails = true;
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, deps());
    expect(location(res)).toBe(`/admin/quotes/${N}?finalised=email-failed#firm`);
    expect(db.quotes[0].status).toBe('quoted');
  });

  it('a database outage redirects with a flash instead of a bare 500', async () => {
    const down = new MemoryDb();
    down.getQuoteByNumber = async () => {
      throw new Error('paused');
    };
    const res = await handleFinalise(post({ ...firm, confirm: 'true' }), N, {
      ...deps(),
      db: down,
    });
    expect(location(res)).toBe(`/admin/quotes/${N}?error=finalise-unavailable#firm`);
  });

  it('404s an unknown quote', async () => {
    const res = await handleFinalise(post(firm), 'BK-2026-9999', deps());
    expect(res.status).toBe(404);
  });
});

describe('firmQuoteReadyEmail', () => {
  it('lists the lines at the recorded rate, the note, the expiry and the link', () => {
    const lines = buildQuote([{ serviceSlug: 'metabarcoding', count: 12 }]);
    const msg = firmQuoteReadyEmail(
      quote({
        status: 'quoted',
        lines: lines.lines,
        total_academic: lines.total.academic,
        total_commercial: lines.total.commercial,
        lab_note: 'Line one.\nLine two.',
        expires_at: '2026-12-17T12:00:00.000Z',
      }),
      false,
    );
    expect(msg.replyTo).toBe('contact@biokea.ai');
    expect(msg.text).toContain('Environmental DNA (eDNA) Metabarcoding: 12 samples');
    expect(msg.text).toContain(
      `Total (commercial rate): $${lines.total.commercial.toLocaleString('en-US')}`,
    );
    expect(msg.text).toContain('Line one.\nLine two.');
    expect(msg.text).toContain('valid until 2026-12-17');
    expect(msg.text).toContain('https://biokea.ai/quote/tok-300');
  });

  it('shows both rates when the quote records no audience', () => {
    const lines = buildQuote([{ serviceSlug: 'metabarcoding', count: 12 }]);
    const msg = firmQuoteReadyEmail(
      quote({
        audience: null,
        status: 'quoted',
        lines: lines.lines,
        total_academic: lines.total.academic,
        total_commercial: lines.total.commercial,
      }),
      false,
    );
    expect(msg.text).toContain('Total: $');
    expect(msg.text).toMatch(/academic \/ \$[\d,]+ commercial/);
  });
});
