//
// The one thing we ask Stripe to do: turn a list of lines into a sent,
// hosted invoice for a customer. Both the deposit and the balance go
// through createInvoice(); the callers only differ in what lines and
// metadata they pass. Spec §5.1.
import Stripe from 'stripe';
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
  lines: InvoiceLineSpec[];
  footer: string;
  customFields: { name: string; value: string }[]; // Stripe allows up to 4
  daysUntilDue: number;
  idempotencyKey: string; // e.g. `deposit:<quoteId>` / `balance:<quoteId>:<attempt>`
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

// Workers have no Node http; use the fetch client the SDK ships.
export function makeStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
}

export const PAYMENT_METHOD_TYPES = ['card', 'us_bank_account', 'customer_balance'] as const;

export function stripeGateway(stripe: Stripe): PaymentsGateway {
  return {
    async createInvoice(spec) {
      const key = spec.idempotencyKey;

      let customerId = spec.customer.id;
      if (!customerId) {
        const c = await stripe.customers.create(
          {
            email: spec.customer.email,
            name: spec.customer.name,
            description: spec.customer.organization ?? undefined,
            metadata: { quote_id: spec.customer.quoteId },
          },
          { idempotencyKey: `${key}:customer` },
        );
        customerId = c.id;
      }

      const params: Stripe.InvoiceCreateParams = {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: spec.daysUntilDue,
        currency: 'usd',
        auto_advance: false,
        metadata: { quote_id: spec.quoteId, quote_number: spec.quoteNumber, kind: spec.kind },
        footer: spec.footer,
        payment_settings: {
          payment_method_types: [...PAYMENT_METHOD_TYPES],
          payment_method_options: {
            customer_balance: {
              funding_type: 'bank_transfer',
              bank_transfer: { type: 'us_bank_transfer' },
            },
          },
        },
      };
      if (spec.customFields.length > 0) params.custom_fields = spec.customFields;

      const invoice = await stripe.invoices.create(params, { idempotencyKey: key });

      for (const [i, line] of spec.lines.entries()) {
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            invoice: invoice.id,
            currency: 'usd',
            amount: line.amountCents,
            description: line.description,
          },
          { idempotencyKey: `${key}:item:${i}` },
        );
      }

      await stripe.invoices.finalizeInvoice(invoice.id);
      // sendInvoice emails the customer Stripe's own "invoice ready" mail
      // with the hosted link, so paying later by ACH/transfer needs nothing
      // from us. Its return value carries the URLs we mirror.
      const sent = await stripe.invoices.sendInvoice(invoice.id);

      return {
        customerId,
        externalId: sent.id,
        number: sent.number ?? null,
        hostedUrl: sent.hosted_invoice_url ?? '',
        pdfUrl: sent.invoice_pdf ?? null,
        dueAt: sent.due_date ? new Date(sent.due_date * 1000).toISOString() : null,
        amountDueCents: sent.amount_due,
      };
    },
  };
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
      customerId: spec.customer.id ?? `cus_test_${n}`,
      externalId: `in_test_${n}`,
      number: `TEST-${String(n).padStart(4, '0')}`,
      hostedUrl: `https://invoice.stripe.test/in_test_${n}`,
      pdfUrl: `https://invoice.stripe.test/in_test_${n}.pdf`,
      dueAt: '2026-10-01T00:00:00.000Z',
      amountDueCents: spec.lines.reduce((s, l) => s + l.amountCents, 0),
    };
  }
}
