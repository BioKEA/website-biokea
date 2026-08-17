import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { stripeGateway, MemoryGateway, type CreateInvoiceSpec } from '@/lib/payments/gateway';

function fakeStripe() {
  const calls: Record<string, unknown[]> = {
    customersCreate: [],
    invoicesCreate: [],
    itemsCreate: [],
    finalize: [],
    send: [],
  };
  const stripe = {
    customers: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.customersCreate.push([p, o]);
        return { id: 'cus_1' };
      }),
    },
    invoices: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.invoicesCreate.push([p, o]);
        return { id: 'in_1' };
      }),
      finalizeInvoice: vi.fn(async (id: string) => {
        calls.finalize.push(id);
        return { id };
      }),
      sendInvoice: vi.fn(async (id: string) => {
        calls.send.push(id);
        return {
          id,
          number: 'A1B2C3D4-0001',
          hosted_invoice_url: 'https://invoice.stripe.com/i/x',
          invoice_pdf: 'https://pay.stripe.com/x.pdf',
          due_date: 1790000000,
          amount_due: 480000,
        };
      }),
    },
    invoiceItems: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.itemsCreate.push([p, o]);
        return { id: 'ii' };
      }),
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const spec: CreateInvoiceSpec = {
  customer: { id: null, email: 'a@b.edu', name: 'Alice', organization: 'State U', quoteId: 'q1' },
  kind: 'deposit',
  quoteId: 'q1',
  quoteNumber: 'BK-2026-0142',
  lines: [
    { description: 'Barcoding — 50% deposit', amountCents: 400000 },
    { description: 'eDNA — 50% deposit', amountCents: 80000 },
  ],
  footer: '50% deposit toward BioKEA quote BK-2026-0142.',
  customFields: [
    { name: 'Quote', value: 'BK-2026-0142' },
    { name: 'PO number', value: 'PO-77' },
  ],
  daysUntilDue: 30,
  idempotencyKey: 'deposit:q1',
};

describe('stripeGateway.createInvoice', () => {
  it('creates the customer when there is no id, then invoice → items → finalize → send, with idempotency keys', async () => {
    const { stripe, calls } = fakeStripe();
    const out = await stripeGateway(stripe).createInvoice(spec);

    expect(calls.customersCreate[0]).toEqual([
      { email: 'a@b.edu', name: 'Alice', description: 'State U', metadata: { quote_id: 'q1' } },
      { idempotencyKey: 'deposit:q1:customer' },
    ]);
    const [invParams, invOpts] = calls.invoicesCreate[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(invParams).toEqual({
      customer: 'cus_1',
      collection_method: 'send_invoice',
      days_until_due: 30,
      currency: 'usd',
      auto_advance: false,
      metadata: { quote_id: 'q1', quote_number: 'BK-2026-0142', kind: 'deposit' },
      custom_fields: [
        { name: 'Quote', value: 'BK-2026-0142' },
        { name: 'PO number', value: 'PO-77' },
      ],
      footer: '50% deposit toward BioKEA quote BK-2026-0142.',
      payment_settings: {
        payment_method_types: ['card', 'us_bank_account', 'customer_balance'],
        payment_method_options: {
          customer_balance: {
            funding_type: 'bank_transfer',
            bank_transfer: { type: 'us_bank_transfer' },
          },
        },
      },
    });
    expect(invOpts).toEqual({ idempotencyKey: 'deposit:q1' });
    expect(calls.itemsCreate).toHaveLength(2);
    expect(calls.itemsCreate[0]).toEqual([
      {
        customer: 'cus_1',
        invoice: 'in_1',
        currency: 'usd',
        amount: 400000,
        description: 'Barcoding — 50% deposit',
      },
      { idempotencyKey: 'deposit:q1:item:0' },
    ]);
    expect(calls.finalize).toEqual(['in_1']);
    expect(calls.send).toEqual(['in_1']);
    expect(out).toEqual({
      customerId: 'cus_1',
      invoiceId: 'in_1',
      invoiceNumber: 'A1B2C3D4-0001',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/x',
      invoicePdf: 'https://pay.stripe.com/x.pdf',
      dueAt: new Date(1790000000 * 1000).toISOString(),
      amountDueCents: 480000,
    });
  });

  it('reuses an existing customer id and skips customers.create', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({
      ...spec,
      customer: { ...spec.customer, id: 'cus_existing' },
    });
    expect(calls.customersCreate).toHaveLength(0);
    expect((calls.invoicesCreate[0] as [Record<string, unknown>])[0].customer).toBe('cus_existing');
  });

  it('passes negative amounts through unchanged (deposit credit on the balance invoice)', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({
      ...spec,
      kind: 'balance',
      lines: [
        { description: 'Barcoding — 743', amountCents: 891600 },
        { description: 'Less deposit', amountCents: -480000 },
      ],
    });
    expect((calls.itemsCreate[1] as [Record<string, unknown>])[0].amount).toBe(-480000);
  });

  it('omits custom_fields when there are none', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({ ...spec, customFields: [] });
    expect((calls.invoicesCreate[0] as [Record<string, unknown>])[0]).not.toHaveProperty(
      'custom_fields',
    );
  });
});

describe('MemoryGateway', () => {
  it('records specs and returns deterministic ids; can be told to fail once', async () => {
    const g = new MemoryGateway();
    const a = await g.createInvoice(spec);
    expect(a.invoiceId).toBe('in_test_1');
    expect(a.hostedInvoiceUrl).toBe('https://invoice.stripe.test/in_test_1');
    expect(g.created).toHaveLength(1);
    g.failNext = new Error('stripe down');
    await expect(g.createInvoice(spec)).rejects.toThrow('stripe down');
    expect((await g.createInvoice(spec)).invoiceId).toBe('in_test_2');
  });
});
