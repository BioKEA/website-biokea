import { describe, it, expect } from 'vitest';
import { MemoryGateway, type CreateInvoiceSpec } from '@/lib/payments/gateway';

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
