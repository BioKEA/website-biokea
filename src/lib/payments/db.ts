//
// Supabase access for the payments flow, behind a small interface so the
// endpoints are unit-tested against MemoryDb. Every call uses the
// service-role key: `quotes`, `quote_payments`, `stripe_events` all have
// RLS enabled with zero policies (see migrations/0005 and 0006).
import type { PaymentRecord, QuoteRecord } from './types';

export type NewPayment = Pick<PaymentRecord, 'quote_id' | 'kind' | 'amount_cents'> &
  Partial<
    Pick<
      PaymentRecord,
      | 'status'
      | 'stripe_invoice_id'
      | 'hosted_invoice_url'
      | 'invoice_pdf'
      | 'due_at'
      | 'paid_at'
      | 'actual_lines'
      | 'created_by'
    >
  >;
export type QuotePatch = Partial<
  Pick<
    QuoteRecord,
    'status' | 'audience' | 'academic_attested_at' | 'po_number' | 'stripe_customer_id'
  >
>;
export type PaymentPatch = Partial<
  Pick<
    PaymentRecord,
    'status' | 'stripe_invoice_id' | 'hosted_invoice_url' | 'invoice_pdf' | 'due_at' | 'paid_at'
  >
>;

export interface PaymentsDb {
  getQuoteByToken(token: string): Promise<QuoteRecord | null>;
  getQuoteByNumber(quoteNumber: string): Promise<QuoteRecord | null>;
  getQuoteById(id: string): Promise<QuoteRecord | null>;
  listRecentQuotes(limit: number): Promise<QuoteRecord[]>;
  listPayments(quoteId: string): Promise<PaymentRecord[]>;
  findPaymentByInvoiceId(stripeInvoiceId: string): Promise<PaymentRecord | null>;
  insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'>;
  updatePayment(id: string, patch: PaymentPatch): Promise<void>;
  deletePayment(id: string): Promise<void>;
  updateQuote(id: string, patch: QuotePatch): Promise<void>;
  recordStripeEvent(id: string, type: string): Promise<boolean>;
  deleteStripeEvent(id: string): Promise<void>;
}

export class SupabaseDb implements PaymentsDb {
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'content-type': 'application/json',
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  private async one<T>(path: string): Promise<T | null> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, { headers: this.headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return rows[0] ?? null;
  }

  private async many<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, { headers: this.headers() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  }

  getQuoteByToken(token: string) {
    return this.one<QuoteRecord>(
      `quotes?access_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    );
  }
  getQuoteByNumber(n: string) {
    return this.one<QuoteRecord>(
      `quotes?quote_number=eq.${encodeURIComponent(n)}&select=*&limit=1`,
    );
  }
  getQuoteById(id: string) {
    return this.one<QuoteRecord>(`quotes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  }
  listRecentQuotes(limit: number) {
    return this.many<QuoteRecord>(`quotes?select=*&order=created_at.desc&limit=${limit}`);
  }
  listPayments(quoteId: string) {
    return this.many<PaymentRecord>(
      `quote_payments?quote_id=eq.${encodeURIComponent(quoteId)}&select=*&order=created_at.desc`,
    );
  }
  findPaymentByInvoiceId(inv: string) {
    return this.one<PaymentRecord>(
      `quote_payments?stripe_invoice_id=eq.${encodeURIComponent(inv)}&select=*&limit=1`,
    );
  }

  async insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'> {
    const res = await fetch(`${this.url}/rest/v1/quote_payments`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (res.status === 409) return 'conflict'; // PostgREST maps unique_violation (23505) to 409
    if (!res.ok) throw new Error(`quote_payments insert failed: ${res.status}`);
    const rows = (await res.json()) as PaymentRecord[];
    if (!rows[0]) throw new Error('quote_payments insert returned no row');
    return rows[0];
  }

  private async patch(table: string, id: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${table} update failed: ${res.status}`);
  }
  updatePayment(id: string, patch: PaymentPatch) {
    return this.patch('quote_payments', id, patch);
  }
  updateQuote(id: string, patch: QuotePatch) {
    return this.patch('quotes', id, patch);
  }

  async deletePayment(id: string): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/quote_payments?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`quote_payments delete failed: ${res.status}`);
  }

  // Insert-or-skip on the primary key. With ignore-duplicates the
  // representation is empty when the row already existed.
  async recordStripeEvent(id: string, type: string): Promise<boolean> {
    const res = await fetch(`${this.url}/rest/v1/stripe_events`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ id, type }),
    });
    if (!res.ok) throw new Error(`stripe_events insert failed: ${res.status}`);
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  }

  // Used to un-record an event when processing after the dedupe check
  // fails, so a Stripe retry sees it as fresh rather than losing the work.
  async deleteStripeEvent(id: string): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/stripe_events?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`stripe_events delete failed: ${res.status}`);
  }
}

// In-memory implementation for unit tests and local fakes. Mirrors the
// partial unique index and the event primary key.
export class MemoryDb implements PaymentsDb {
  quotes: QuoteRecord[] = [];
  payments: PaymentRecord[] = [];
  events = new Set<string>();
  private seq = 0;

  async getQuoteByToken(token: string) {
    return this.quotes.find((q) => q.access_token === token) ?? null;
  }
  async getQuoteByNumber(n: string) {
    return this.quotes.find((q) => q.quote_number === n) ?? null;
  }
  async getQuoteById(id: string) {
    return this.quotes.find((q) => q.id === id) ?? null;
  }
  async listRecentQuotes(limit: number) {
    return [...this.quotes]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  async listPayments(quoteId: string) {
    return this.payments
      .filter((p) => p.quote_id === quoteId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async findPaymentByInvoiceId(inv: string) {
    return this.payments.find((p) => p.stripe_invoice_id === inv) ?? null;
  }
  async insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'> {
    const status = row.status ?? 'open';
    const clash = this.payments.some(
      (p) =>
        p.quote_id === row.quote_id &&
        p.kind === row.kind &&
        (p.status === 'open' || p.status === 'paid'),
    );
    if (clash && (status === 'open' || status === 'paid')) return 'conflict';
    const rec: PaymentRecord = {
      id: `p${++this.seq}`,
      currency: 'usd',
      status,
      stripe_invoice_id: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      due_at: null,
      paid_at: null,
      actual_lines: null,
      created_by: null,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, this.seq)).toISOString(),
      ...row,
    };
    this.payments.push(rec);
    return rec;
  }
  async updatePayment(id: string, patch: PaymentPatch) {
    const p = this.payments.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }
  async deletePayment(id: string) {
    this.payments = this.payments.filter((p) => p.id !== id);
  }
  async updateQuote(id: string, patch: QuotePatch) {
    const q = this.quotes.find((x) => x.id === id);
    if (q) Object.assign(q, patch);
  }
  async recordStripeEvent(id: string) {
    if (this.events.has(id)) return false;
    this.events.add(id);
    return true;
  }
  async deleteStripeEvent(id: string) {
    this.events.delete(id);
  }
}
