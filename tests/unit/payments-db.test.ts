import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseDb, MemoryDb } from '@/lib/payments/db';

const URL = 'https://example.supabase.co';
const KEY = 'sr_test';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SupabaseDb', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls.length = 0;
  });

  it('reads a quote by access token with the service-role headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'q1', quote_number: 'BK-2026-0001' }]);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    const q = await db.getQuoteByToken('11111111-1111-1111-1111-111111111111');
    expect(q?.id).toBe('q1');
    expect(calls[0].url).toBe(
      `${URL}/rest/v1/quotes?access_token=eq.11111111-1111-1111-1111-111111111111&select=*&limit=1`,
    );
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.apikey).toBe(KEY);
    expect(h.authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns null for a genuinely empty result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([])),
    );
    expect(await new SupabaseDb(URL, KEY).getQuoteByNumber('BK-2026-9999')).toBeNull();
  });

  it('throws (does not silently return null) on a non-2xx read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'boom' }, 500)),
    );
    await expect(new SupabaseDb(URL, KEY).getQuoteById('x')).rejects.toThrow(/read failed/);
  });

  it('throws (does not silently return []) on a non-2xx list read', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'boom' }, 500)),
    );
    await expect(new SupabaseDb(URL, KEY).listPayments('q1')).rejects.toThrow(/read failed/);
  });

  it('inserts a payment and returns the representation; maps a unique violation to "conflict"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes(
          [{ id: 'p1', quote_id: 'q1', kind: 'deposit', status: 'open', amount_cents: 100 }],
          201,
        );
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    const row = await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 100 });
    expect(row).toMatchObject({ id: 'p1' });
    expect(calls[0].url).toBe(`${URL}/rest/v1/quote_payments`);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe('return=representation');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 100,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonRes(
          {
            code: '23505',
            message: 'duplicate key value violates unique constraint "quote_payments_live_idx"',
          },
          409,
        ),
      ),
    );
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 100 })).toBe(
      'conflict',
    );
  });

  it('throws on any other insert failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'nope' }, 500)),
    );
    await expect(
      new SupabaseDb(URL, KEY).insertPayment({
        quote_id: 'q1',
        kind: 'deposit',
        amount_cents: 100,
      }),
    ).rejects.toThrow(/insert/i);
  });

  it('patches a payment / quote with PATCH ...?id=eq.', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T00:00:00Z' });
    await db.updateQuote('q1', { status: 'deposit_paid' });
    expect(calls[0].url).toBe(`${URL}/rest/v1/quote_payments?id=eq.p1`);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[1].url).toBe(`${URL}/rest/v1/quotes?id=eq.q1`);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ status: 'deposit_paid' });
  });

  it('records a webhook event once: true the first time, false on the duplicate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'evt_1' }], 201);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    expect(await db.recordWebhookEvent('evt_1', 'invoice.paid')).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe(
      'resolution=ignore-duplicates,return=representation',
    );
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      id: 'evt_1',
      type: 'invoice.paid',
      provider: 'shopify',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([], 201)),
    );
    expect(await db.recordWebhookEvent('evt_1', 'invoice.paid')).toBe(false);
  });

  it('deletes a webhook event with DELETE ...?id=eq.', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.deleteWebhookEvent('evt_1');
    expect(calls[0].url).toBe(`${URL}/rest/v1/webhook_events?id=eq.evt_1`);
    expect(calls[0].init.method).toBe('DELETE');
  });

  it('conditionally updates a quote status only when it still matches "from"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'q1' }], 200);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    expect(await db.updateQuoteStatusIf('q1', 'quoted', 'deposit_invoiced')).toBe(true);
    expect(calls[0].url).toBe(`${URL}/rest/v1/quotes?id=eq.q1&status=eq.quoted`);
    expect(calls[0].init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ status: 'deposit_invoiced' });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([], 200)),
    );
    expect(await db.updateQuoteStatusIf('q1', 'quoted', 'deposit_invoiced')).toBe(false);
  });

  it('lists payments newest first and finds by invoice id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push({ url, init: {} });
        return jsonRes([{ id: 'p2' }]);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.listPayments('q1');
    expect(calls[0].url).toBe(
      `${URL}/rest/v1/quote_payments?quote_id=eq.q1&select=*&order=created_at.desc`,
    );
    expect(await db.findPaymentByInvoiceId('in_2')).toMatchObject({ id: 'p2' });
    expect(calls[1].url).toBe(`${URL}/rest/v1/quote_payments?external_id=eq.in_2&select=*&limit=1`);
  });

  it('finds a payment by external_order_id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push({ url, init: {} });
        return jsonRes([{ id: 'p3' }]);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    expect(await db.findPaymentByExternalOrderId('5551')).toMatchObject({ id: 'p3' });
    expect(calls[0].url).toBe(
      `${URL}/rest/v1/quote_payments?external_order_id=eq.5551&select=*&limit=1`,
    );
  });
});

describe('MemoryDb', () => {
  it('enforces the live (quote_id, kind) uniqueness like the partial index', async () => {
    const db = new MemoryDb();
    const a = await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 });
    expect(a).not.toBe('conflict');
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 })).toBe(
      'conflict',
    );
    await db.updatePayment((a as { id: string }).id, { status: 'void' });
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 })).not.toBe(
      'conflict',
    );
  });

  it('records events once', async () => {
    const db = new MemoryDb();
    expect(await db.recordWebhookEvent('e', 'invoice.paid')).toBe(true);
    expect(await db.recordWebhookEvent('e', 'invoice.paid')).toBe(false);
  });

  it('un-records an event on delete so a later record succeeds again', async () => {
    const db = new MemoryDb();
    expect(await db.recordWebhookEvent('e', 'invoice.paid')).toBe(true);
    await db.deleteWebhookEvent('e');
    expect(await db.recordWebhookEvent('e', 'invoice.paid')).toBe(true);
  });

  it('conditionally updates a quote status only when it still matches "from"', async () => {
    const db = new MemoryDb();
    db.quotes.push({
      id: 'q1',
      quote_number: 'BK-2026-0001',
      access_token: 't',
      email: 'a@b.edu',
      name: 'Alice',
      organization: null,
      lines: [],
      total_academic: 0,
      total_commercial: 0,
      needs_conversation: false,
      created_at: '2026-08-20T00:00:00Z',
      expires_at: '2026-09-19T00:00:00Z',
      status: 'quoted',
      audience: null,
      academic_attested_at: null,
      po_number: null,
      external_customer_id: null,
    });
    expect(await db.updateQuoteStatusIf('q1', 'quoted', 'deposit_invoiced')).toBe(true);
    expect(db.quotes[0].status).toBe('deposit_invoiced');
    expect(await db.updateQuoteStatusIf('q1', 'quoted', 'deposit_invoiced')).toBe(false);
    expect(db.quotes[0].status).toBe('deposit_invoiced');
  });

  it('finds a payment by external_order_id', async () => {
    const db = new MemoryDb();
    const inserted = await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 });
    await db.updatePayment((inserted as { id: string }).id, { external_order_id: '5551' });
    expect(await db.findPaymentByExternalOrderId('5551')).toMatchObject({
      id: (inserted as { id: string }).id,
    });
    expect(await db.findPaymentByExternalOrderId('nope')).toBeNull();
  });
});
