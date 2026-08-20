import { describe, it, expect } from 'vitest';
import {
  MemoryGateway,
  shopifyGateway,
  dollars,
  type CreateInvoiceSpec,
} from '@/lib/payments/gateway';

const spec: CreateInvoiceSpec = {
  customer: { id: null, email: 'a@b.edu', name: 'Alice', organization: 'State U', quoteId: 'q1' },
  kind: 'deposit',
  quoteId: 'q1',
  quoteNumber: 'BK-2026-0142',
  paymentId: 'p1',
  poNumber: 'PO-77',
  lines: [
    { description: 'Barcoding — 50% deposit', amountCents: 400000 },
    { description: 'eDNA — 50% deposit', amountCents: 80000 },
  ],
  footer: '50% deposit toward BioKEA quote BK-2026-0142.',
  daysUntilDue: 30,
};

describe('MemoryGateway', () => {
  it('records specs and returns deterministic ids; can be told to fail once', async () => {
    const g = new MemoryGateway();
    const a = await g.createInvoice(spec);
    expect(a.externalId).toBe('gid://shopify/DraftOrder/test-1');
    expect(a.hostedUrl).toBe('https://store.biokea.test/invoices/test-1');
    expect(a.number).toBe('#D1');
    expect(a.pdfUrl).toBeNull();
    expect(a.customerId).toBeNull();
    expect(g.created).toHaveLength(1);
    expect(g.created[0]).toBe(spec);
    g.failNext = new Error('shopify down');
    await expect(g.createInvoice(spec)).rejects.toThrow('shopify down');
    const b = await g.createInvoice(spec);
    expect(b.externalId).toBe('gid://shopify/DraftOrder/test-2');
    expect(b.number).toBe('#D2');
  });

  it('amountDueCents is the sum of lines minus any credit', async () => {
    const g = new MemoryGateway();
    const out = await g.createInvoice({
      ...spec,
      lines: [{ description: 'Barcoding — 743', amountCents: 891600 }],
      credit: { title: 'Deposit received (invoice in_1, paid 2026-09-02)', amountCents: 480000 },
    });
    expect(out.amountDueCents).toBe(891600 - 480000);
  });
});

const cfg = {
  storeDomain: 'biokea.myshopify.com',
  adminToken: 'shpat_test',
  paymentTermsTemplate: 'NET_30',
};
const spec2 = { ...spec, paymentId: 'p1', poNumber: 'PO-77', credit: undefined };

// Records every GraphQL call and answers by operation name.
function fakeShopify(answers: Record<string, unknown>) {
  const calls: { op: string; variables: any; headers: Record<string, string>; url: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const op = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? 'unknown';
    calls.push({
      op,
      query: body.query as string,
      variables: body.variables,
      headers: init.headers as Record<string, string>,
      url,
    });
    return new Response(JSON.stringify({ data: answers[op] ?? {} }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

describe('dollars', () => {
  it('formats integer cents as a two-decimal string and rejects fractions', () => {
    expect(dollars(480000)).toBe('4800.00');
    expect(dollars(5)).toBe('0.05');
    expect(() => dollars(10.5)).toThrow();
  });
});

describe('shopifyGateway.createInvoice', () => {
  const okAnswers = {
    paymentTermsTemplates: {
      paymentTermsTemplates: [
        {
          id: 'gid://shopify/PaymentTermsTemplate/3',
          name: 'Net 30',
          paymentTermsType: 'NET',
          dueInDays: 30,
        },
      ],
    },
    findDraft: { draftOrders: { nodes: [] } },
    draftOrderCreate: {
      draftOrderCreate: {
        draftOrder: { id: 'gid://shopify/DraftOrder/11', name: '#D11' },
        userErrors: [],
      },
    },
    draftOrderInvoiceSend: {
      draftOrderInvoiceSend: {
        draftOrder: {
          id: 'gid://shopify/DraftOrder/11',
          name: '#D11',
          invoiceUrl: 'https://store.biokea.ai/11/invoices/abc',
          totalPriceSet: { shopMoney: { amount: '4800.00' } },
          paymentTerms: { paymentSchedules: { nodes: [{ dueAt: '2026-10-01T00:00:00Z' }] } },
        },
        userErrors: [],
      },
    },
  };

  it('looks for an existing draft by payment tag, creates one with tags/attributes/lines/terms, sends the invoice', async () => {
    const s = fakeShopify(okAnswers);
    const out = await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls.map((c) => c.op)).toEqual([
      'paymentTermsTemplates',
      'findDraft',
      'draftOrderCreate',
      'draftOrderInvoiceSend',
    ]);
    // terms were attached, so the send may select paymentTerms (read_payment_terms scope)
    expect(s.calls[3].query).toContain('paymentTerms');
    expect(s.calls[0].url).toBe('https://biokea.myshopify.com/admin/api/2026-01/graphql.json');
    expect(s.calls[0].headers['X-Shopify-Access-Token']).toBe('shpat_test');
    expect(s.calls[1].variables).toEqual({ query: 'tag:"pay:p1"' });
    const input = s.calls[2].variables.input;
    expect(input.email).toBe('a@b.edu');
    expect(input.taxExempt).toBe(true);
    expect(input.tags).toEqual(['biokea', 'deposit', 'pay:p1', 'quote:BK-2026-0142']);
    expect(input.customAttributes).toEqual([
      { key: 'quote_id', value: 'q1' },
      { key: 'quote_number', value: 'BK-2026-0142' },
      { key: 'kind', value: 'deposit' },
      { key: 'payment_id', value: 'p1' },
      { key: 'po_number', value: 'PO-77' },
    ]);
    expect(input.lineItems).toEqual([
      {
        title: 'Barcoding — 50% deposit',
        quantity: 1,
        originalUnitPrice: '4000.00',
        taxable: false,
        requiresShipping: false,
      },
      {
        title: 'eDNA — 50% deposit',
        quantity: 1,
        originalUnitPrice: '800.00',
        taxable: false,
        requiresShipping: false,
      },
    ]);
    expect(input.note).toBe(spec2.footer);
    // NET terms require an issuedAt schedule (Shopify PaymentScheduleInput).
    expect(input.paymentTerms.paymentTermsTemplateId).toBe('gid://shopify/PaymentTermsTemplate/3');
    expect(input.paymentTerms.paymentSchedules).toHaveLength(1);
    expect(input.paymentTerms.paymentSchedules[0].issuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(input.appliedDiscount).toBeUndefined();
    expect(out).toEqual({
      customerId: null,
      externalId: 'gid://shopify/DraftOrder/11',
      number: '#D11',
      hostedUrl: 'https://store.biokea.ai/11/invoices/abc',
      pdfUrl: null,
      dueAt: '2026-10-01T00:00:00Z',
      amountDueCents: 480000,
    });
  });

  it('omits paymentTerms for a self-serve buyer with no PO number, even when a template is found', async () => {
    const s = fakeShopify(okAnswers);
    await shopifyGateway(cfg, s.fetch).createInvoice({ ...spec2, poNumber: null });
    expect(s.calls[2].variables.input.paymentTerms).toBeUndefined();
    // the terms lookup itself still runs — only the assignment is gated
    expect(s.calls.map((c) => c.op)).toContain('paymentTermsTemplates');
    // and the send must not select paymentTerms (needs no read_payment_terms scope)
    const send = s.calls.find((c) => c.op === 'draftOrderInvoiceSend')!;
    expect(send.query).not.toContain('paymentTerms');
  });

  it('turns the credit into a fixed-amount appliedDiscount', async () => {
    const s = fakeShopify(okAnswers);
    await shopifyGateway(cfg, s.fetch).createInvoice({
      ...spec2,
      kind: 'balance',
      lines: [{ description: 'Barcoding — 743', amountCents: 891600 }],
      credit: { title: 'Deposit received (order #1001, paid 2026-09-02)', amountCents: 480000 },
    });
    expect(s.calls[2].variables.input.appliedDiscount).toEqual({
      title: 'Deposit received (order #1001, paid 2026-09-02)',
      description: 'Deposit received (order #1001, paid 2026-09-02)',
      value: 4800,
      valueType: 'FIXED_AMOUNT',
    });
  });

  it('reuses an OPEN draft that already carries the payment tag instead of creating a second one', async () => {
    const s = fakeShopify({
      ...okAnswers,
      findDraft: {
        draftOrders: { nodes: [{ id: 'gid://shopify/DraftOrder/9', name: '#D9', status: 'OPEN' }] },
      },
      draftOrderInvoiceSend: {
        draftOrderInvoiceSend: {
          draftOrder: {
            id: 'gid://shopify/DraftOrder/9',
            name: '#D9',
            invoiceUrl: 'https://store.biokea.ai/9/invoices/x',
            totalPriceSet: { shopMoney: { amount: '4800.00' } },
            paymentTerms: null,
          },
          userErrors: [],
        },
      },
    });
    const out = await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls.map((c) => c.op)).toEqual([
      'paymentTermsTemplates',
      'findDraft',
      'draftOrderInvoiceSend',
    ]);
    expect(out.externalId).toBe('gid://shopify/DraftOrder/9');
    expect(out.dueAt).toBeNull();
  });

  it('omits paymentTerms when the template lookup fails or has no match', async () => {
    const s = fakeShopify({ ...okAnswers, paymentTermsTemplates: { paymentTermsTemplates: [] } });
    await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls[2].variables.input.paymentTerms).toBeUndefined();
    const s2 = fakeShopify(okAnswers);
    await shopifyGateway({ ...cfg, paymentTermsTemplate: undefined }, s2.fetch).createInvoice(
      spec2,
    );
    expect(s2.calls.map((c) => c.op)[0]).toBe('findDraft'); // no lookup at all
  });

  it('throws on GraphQL userErrors and on non-2xx', async () => {
    const s = fakeShopify({
      ...okAnswers,
      draftOrderCreate: {
        draftOrderCreate: { draftOrder: null, userErrors: [{ field: ['input'], message: 'nope' }] },
      },
    });
    await expect(shopifyGateway(cfg, s.fetch).createInvoice(spec2)).rejects.toThrow(/nope/);
    const bad = (async () => new Response('down', { status: 502 })) as unknown as typeof fetch;
    await expect(shopifyGateway(cfg, bad).createInvoice(spec2)).rejects.toThrow(/502/);
  });

  it('caches the payment-terms template per gateway instance', async () => {
    const s = fakeShopify(okAnswers);
    const g = shopifyGateway(cfg, s.fetch);
    await g.createInvoice(spec2);
    await g.createInvoice({ ...spec2, paymentId: 'p2' });
    expect(s.calls.filter((c) => c.op === 'paymentTermsTemplates')).toHaveLength(1);
  });
});

describe('payment tag length', () => {
  it("keeps the payment tag within Shopify's 40-character tag limit for UUID payment ids", async () => {
    const { paymentTag, paymentIdFromTag } = await import('@/lib/payments/gateway');
    const id = '5f9c1a2b-3d4e-4f60-8a7b-9c0d1e2f3a4b';
    const tag = paymentTag(id);
    expect(tag).toBe('pay:5f9c1a2b3d4e4f608a7b9c0d1e2f3a4b');
    expect(tag.length).toBeLessThanOrEqual(40);
    expect(paymentIdFromTag(tag)).toBe(id);
    // non-UUID ids (tests, legacy) round-trip unchanged
    expect(paymentTag('p1')).toBe('pay:p1');
    expect(paymentIdFromTag('pay:p1')).toBe('p1');
    expect(paymentIdFromTag('quote:BK-1')).toBeNull();
  });
});
