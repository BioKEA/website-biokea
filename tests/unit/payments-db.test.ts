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

  it('returns null for an empty result and on a non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([])),
    );
    expect(await new SupabaseDb(URL, KEY).getQuoteByNumber('BK-2026-9999')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'boom' }, 500)),
    );
    expect(await new SupabaseDb(URL, KEY).getQuoteById('x')).toBeNull();
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

  it('records a Stripe event once: true the first time, false on the duplicate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'evt_1' }], 201);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    expect(await db.recordStripeEvent('evt_1', 'invoice.paid')).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe(
      'resolution=ignore-duplicates,return=representation',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([], 201)),
    );
    expect(await db.recordStripeEvent('evt_1', 'invoice.paid')).toBe(false);
  });

  it('deletes a Stripe event with DELETE ...?id=eq.', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.deleteStripeEvent('evt_1');
    expect(calls[0].url).toBe(`${URL}/rest/v1/stripe_events?id=eq.evt_1`);
    expect(calls[0].init.method).toBe('DELETE');
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
    expect(calls[1].url).toBe(
      `${URL}/rest/v1/quote_payments?stripe_invoice_id=eq.in_2&select=*&limit=1`,
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
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(true);
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(false);
  });

  it('un-records an event on delete so a later record succeeds again', async () => {
    const db = new MemoryDb();
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(true);
    await db.deleteStripeEvent('e');
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(true);
  });
});
