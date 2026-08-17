// src/lib/payments/types.ts
// Row shapes for quotes + payments as read from Supabase, and the one
// invoice-line shape shared by the deposit and balance paths.
import type { Audience, QuoteLine, QuoteLineInput } from '@/lib/pricing/quote';

export type QuoteStatus =
  | 'quoted'
  | 'deposit_invoiced'
  | 'deposit_paid'
  | 'balance_invoiced'
  | 'paid';
export type PaymentKind = 'deposit' | 'balance';
export type PaymentStatus = 'open' | 'paid' | 'void' | 'uncollectible' | 'settled';

export interface QuoteRecord {
  id: string;
  quote_number: string;
  access_token: string;
  email: string;
  name: string;
  organization: string | null;
  lines: QuoteLine[];
  total_academic: number;
  total_commercial: number;
  needs_conversation: boolean;
  created_at: string;
  expires_at: string;
  status: QuoteStatus;
  audience: Audience | null;
  academic_attested_at: string | null;
  po_number: string | null;
  stripe_customer_id: string | null;
}

export interface PaymentRecord {
  id: string;
  quote_id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_at: string | null;
  paid_at: string | null;
  actual_lines: QuoteLineInput[] | null;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceLineSpec {
  description: string;
  amountCents: number; // may be negative (deposit credit on the balance invoice)
}
