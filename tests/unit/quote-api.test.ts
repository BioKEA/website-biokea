import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleQuote } from '@/pages/api/quote';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sr_test',
  RESEND_API_KEY: 'test-key',
  CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
  CONTACT_TO_EMAIL: 'contact@biokea.ai',
};

function makeRequest(body: unknown, origin?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (origin) headers.origin = origin;
  return new Request('https://biokea.ai/api/quote', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Alice',
  email: 'alice@example.edu',
  organization: 'State University',
  lines: [{ serviceSlug: 'barcoding', count: 600 }],
};

const calls = () => (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;

function insertedRow(): Record<string, unknown> {
  const call = calls().find((c) => String(c[0]).includes('/rest/v1/quotes'))!;
  return JSON.parse((call[1] as RequestInit).body as string);
}

function emailTextTo(recipient: string): string {
  const call = calls().find((c) => {
    if (!String(c[0]).includes('api.resend.com/emails')) return false;
    const body = JSON.parse((c[1] as RequestInit).body as string);
    return body.to === recipient;
  })!;
  const body = JSON.parse((call[1] as RequestInit).body as string);
  return body.text as string;
}

function customerEmailText(): string {
  return emailTextTo(validBody.email);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/rest/v1/quotes')) {
        return new Response(
          JSON.stringify([{ quote_number: 'BK-2026-0001', access_token: 'tok-123' }]),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 'msg_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

describe('quote endpoint', () => {
  it('rejects a missing name or email', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, name: '' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, email: 'nope' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an empty lines array', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, lines: [] }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an unknown service slug', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, lines: [{ serviceSlug: 'hacked', count: 5 }] }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive count', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, lines: [{ serviceSlug: 'barcoding', count: 0 }] }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects when the honeypot is filled', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, website: 'bot' }), env);
    expect(res.status).toBe(400);
  });

  it('IGNORES a client-supplied total and persists the server recomputation', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, total_academic: 1, total_commercial: 1 }),
      env,
    );
    expect(res.status).toBe(200);
    const insertCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/rest/v1/quotes'),
    )!;
    const inserted = JSON.parse((insertCall[1] as RequestInit).body as string);
    // 600 specimens academic = 600 * 12 = 7200, NOT the injected 1.
    expect(inserted.total_academic).toBe(7200);
    expect(inserted.total_commercial).toBe(9000);
  });

  it('returns the quote number and retrieval url on success', async () => {
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.quoteNumber).toBe('BK-2026-0001');
    expect(body.url).toContain('/quote/tok-123');
  });

  it('includes the access token and defaults paymentsEnabled to false', async () => {
    const res = await handleQuote(makeRequest(validBody), env, undefined, { dev: false });
    const body = await res.json();
    expect(body.token).toBe('tok-123');
    expect(body.paymentsEnabled).toBe(false);
  });

  it('sets paymentsEnabled true when opts requests it', async () => {
    const res = await handleQuote(makeRequest(validBody), env, undefined, {
      paymentsEnabled: true,
      dev: false,
    });
    const body = await res.json();
    expect(body.paymentsEnabled).toBe(true);
  });

  it('echoes the CORS header for the store origin and omits it for a disallowed origin', async () => {
    const allowed = await handleQuote(
      makeRequest(validBody, 'https://store.biokea.ai'),
      env,
      undefined,
      { dev: false },
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://store.biokea.ai');

    const denied = await handleQuote(
      makeRequest(validBody, 'https://evil.example'),
      env,
      undefined,
      { dev: false },
    );
    expect(denied.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('emails the quote via Resend', async () => {
    await handleQuote(makeRequest(validBody), env);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 502 when the database insert fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })),
    );
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(502);
  });

  it('returns 502 rather than throwing when the insert returns no rows', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/rest/v1/quotes')) {
          return new Response('[]', {
            status: 201,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200 });
      }),
    );
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(502);
  });

  it('still returns the quote when the email send throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/rest/v1/quotes')) {
          return new Response(
            JSON.stringify([{ quote_number: 'BK-2026-0001', access_token: 'tok-123' }]),
            { status: 201, headers: { 'content-type': 'application/json' } },
          );
        }
        throw new Error('resend unreachable');
      }),
    );
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.quoteNumber).toBe('BK-2026-0001');
  });

  it('persists the audience the configurator chose', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'academic', attest: true }), env);
    const row = insertedRow();
    expect(row.audience).toBe('academic');
    expect(row.academic_attested_at).toEqual(expect.any(String));
  });

  it('records no attestation for a commercial quote', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'commercial', attest: true }), env);
    expect(insertedRow().academic_attested_at).toBeNull();
  });

  it('records an academic audience without an attestation as unattested', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'academic' }), env);
    const row = insertedRow();
    expect(row.audience).toBe('academic');
    expect(row.academic_attested_at).toBeNull();
  });

  it('accepts a body with no audience at all (stale cached widget)', async () => {
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(200);
    expect(insertedRow().audience).toBeNull();
  });

  it('rejects a junk audience', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, audience: 'student' }), env);
    expect(res.status).toBe(400);
  });

  it('closes the customer email on the pay CTA and the credit disclosure', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'commercial' }), env, undefined, {
      paymentsEnabled: true,
    });
    const text = customerEmailText();
    expect(text).toContain('Pay in full and start your project:');
    expect(text).toContain('#pay');
    expect(text).toContain('credit toward another project for 12 months');
    expect(text).toContain('purchase order');
    expect(text).not.toMatch(/deposit/i);
  });

  it('shows one total when the audience is known', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'commercial' }), env);
    const text = customerEmailText();
    expect(text).toContain('Total: $');
    expect(text).not.toContain('academic/nonprofit ·');
  });

  it('shows both totals when the audience is not known', async () => {
    await handleQuote(makeRequest(validBody), env);
    expect(customerEmailText()).toContain('academic/nonprofit ·');
  });

  it('keeps the follow-up close for a conversation-band quote', async () => {
    await handleQuote(
      makeRequest({ ...validBody, lines: [{ serviceSlug: 'barcoding', count: 5000 }] }),
      env,
      undefined,
      { paymentsEnabled: true },
    );
    const text = customerEmailText();
    expect(text).toContain("we'll follow up to confirm scheduling");
    expect(text).not.toContain('Pay in full and start your project:');
  });
});
