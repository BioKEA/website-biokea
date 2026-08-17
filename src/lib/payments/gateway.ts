//
// The one thing we ask the payments provider to do: turn a list of lines
// into a sent, hosted invoice for a customer. Both the deposit and the
// balance go through createInvoice(); the callers only differ in what
// lines and metadata they pass. Spec §5.1.
import type { InvoiceLineSpec, PaymentKind } from './types';

export interface InvoiceCustomer {
  id: string | null; // existing external customer id, or null to create one
  email: string;
  name: string;
  organization: string | null;
  quoteId: string;
}

export interface CreateInvoiceSpec {
  customer: InvoiceCustomer;
  kind: PaymentKind;
  quoteId: string;
  quoteNumber: string;
  paymentId: string; // the quote_payments row id — the gateway's idempotency + webhook lookup key
  poNumber: string | null;
  lines: InvoiceLineSpec[]; // amountCents always >= 0
  credit?: { title: string; amountCents: number }; // deposit credit on the balance invoice
  footer: string;
  daysUntilDue: number;
}

export interface CreatedInvoice {
  customerId: string | null;
  externalId: string;
  number: string | null;
  hostedUrl: string;
  pdfUrl: string | null;
  dueAt: string | null;
  amountDueCents: number;
}

export interface PaymentsGateway {
  createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice>;
}

// Task 3 adds the real Shopify Draft Orders implementation. This
// placeholder only exists so the POST wrappers below compile until then.
export function shopifyGateway(): PaymentsGateway {
  throw new Error('not implemented until Task 3');
}

// Test double: records every spec, hands back deterministic ids.
export class MemoryGateway implements PaymentsGateway {
  created: CreateInvoiceSpec[] = [];
  failNext?: Error;
  private seq = 0;
  async createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = undefined;
      throw err;
    }
    this.created.push(spec);
    const n = ++this.seq;
    return {
      customerId: null,
      externalId: `gid://shopify/DraftOrder/test-${n}`,
      number: `#D${n}`,
      hostedUrl: `https://store.biokea.test/invoices/test-${n}`,
      pdfUrl: null,
      dueAt: '2026-10-01T00:00:00.000Z',
      amountDueCents:
        spec.lines.reduce((s, l) => s + l.amountCents, 0) - (spec.credit?.amountCents ?? 0),
    };
  }
}
