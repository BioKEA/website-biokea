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

function labEmailSubject(): string {
  const call = calls().find((c) => {
    if (!String(c[0]).includes('api.resend.com/emails')) return false;
    const body = JSON.parse((c[1] as RequestInit).body as string);
    return body.to === env.CONTACT_TO_EMAIL;
  })!;
  const body = JSON.parse((call[1] as RequestInit).body as string);
  return body.subject as string;
}

// Copied from tests/unit/order.test.ts: a payable 60-sample eDNA order.
const edna = (over = {}) =>
  ({
    service: 'metabarcoding',
    targets: ['vertebrates'],
    markers: ['12S', 'COI'],
    sampleType: 'water',
    samples: 60,
    kits: false,
    ...over,
  }) as const;

// The customer is whoever the request named, so read the one Resend call
// not addressed to the lab rather than assuming validBody's email.
function customerEmailText(): string {
  const call = calls().find((c) => {
    if (!String(c[0]).includes('api.resend.com/emails')) return false;
    const body = JSON.parse((c[1] as RequestInit).body as string);
    return body.to !== env.CONTACT_TO_EMAIL;
  })!;
  return JSON.parse((call[1] as RequestInit).body as string).text as string;
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

  // The customer's own email should describe their quote the way the
  // configurator and the quote page do — one rate. Listing both per line
  // is the two-prices-side-by-side display this whole change removed.
  it('prices each line at the chosen rate only, and names the other rate once', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'academic' }), env);
    const text = customerEmailText();
    // 600 barcoding: $12/specimen academic = $7,200, $15 commercial = $9,000
    expect(text).toContain('$7,200 (300–999 tier)');
    expect(text).not.toContain('academic/nonprofit: $7,200');
    expect(text).not.toContain('commercial: $9,000');
    expect(text).toContain('Commercial rate for this configuration: $9,000');
  });

  it('names the academic rate as the alternate for a commercial quote', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'commercial' }), env);
    const text = customerEmailText();
    expect(text).toContain('$9,000 (300–999 tier)');
    expect(text).toContain('Academic/nonprofit rate for this configuration: $7,200');
  });

  it('falls back to both rates per line when no audience was recorded', async () => {
    await handleQuote(makeRequest(validBody), env);
    const text = customerEmailText();
    expect(text).toContain('academic/nonprofit: $7,200');
    expect(text).toContain('commercial: $9,000');
    expect(text).not.toContain('rate for this configuration:');
  });

  it('persists the widget source for attribution', async () => {
    await handleQuote(makeRequest({ ...validBody, source: 'store' }), env);
    expect(insertedRow().source).toBe('store');
  });

  it('stores a null source when the client sends none (non-widget callers)', async () => {
    await handleQuote(makeRequest(validBody), env);
    expect(insertedRow().source).toBeNull();
  });

  it('rejects a junk source', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, source: 'BAD*' }), env);
    expect(res.status).toBe(400);
  });

  it('names the source in the lab notification', async () => {
    await handleQuote(makeRequest({ ...validBody, source: 'store' }), env);
    expect(emailTextTo(env.CONTACT_TO_EMAIL)).toContain('Source: store');
  });

  it('keeps BOTH rates in the lab notification — staff want the comparison', async () => {
    await handleQuote(makeRequest({ ...validBody, audience: 'academic' }), env);
    const lab = emailTextTo(env.CONTACT_TO_EMAIL);
    expect(lab).toContain('academic/nonprofit: $7,200');
    expect(lab).toContain('commercial: $9,000');
    expect(lab).toContain('Rate: academic');
  });
});

describe('config requests', () => {
  const base = { name: 'Ada', email: 'ada@example.org', audience: 'commercial', source: 'store' };
  it('legacy lines-only bodies still insert a quoted row with empty config fields', async () => {
    const res = await handleQuote(
      makeRequest({ ...base, lines: [{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }] }),
      env,
    );
    expect(res.status).toBe(200);
    expect(insertedRow()).toMatchObject({ config: null, directions: null, consult_triggers: [] });
    expect(insertedRow()).not.toHaveProperty('status');
  });
  it('a payable config inserts status quoted with the config and directions', async () => {
    const res = await handleQuote(
      makeRequest({ ...base, config: edna(), directions: 'Filter on site.' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, consult: false });
    expect(insertedRow()).toMatchObject({
      status: 'quoted',
      directions: 'Filter on site.',
      total_commercial: 10500,
      config: expect.objectContaining({ service: 'metabarcoding' }),
    });
    expect(customerEmailText()).toContain('Markers: 12S, COI');
  });
  it('a consult config inserts status consult, lists triggers in both emails, and offers no payment', async () => {
    const res = await handleQuote(
      makeRequest({
        ...base,
        config: {
          service: 'targeted-edna',
          species: 'Dreissena',
          measure: 'both',
          assayExists: 'no',
          sampleType: 'water',
        },
      }),
      env,
      undefined,
      { paymentsEnabled: true },
    );
    expect(await res.json()).toMatchObject({ ok: true, consult: true });
    expect(insertedRow()).toMatchObject({
      status: 'consult',
      needs_conversation: true,
      consult_triggers: [expect.objectContaining({ key: 'qpcr' })],
    });
    expect(customerEmailText()).not.toContain('#pay');
    expect(customerEmailText()).toContain('custom quote after consultation');
    expect(emailTextTo(env.CONTACT_TO_EMAIL)).toContain('Dreissena');
    expect(labEmailSubject()).toMatch(/^\[consult\]/);
  });
  it('an invalid config is a 400', async () => {
    const res = await handleQuote(makeRequest({ ...base, config: edna({ markers: [] }) }), env);
    expect(res.status).toBe(400);
  });
  it('a body with neither lines nor config is a 400', async () => {
    expect((await handleQuote(makeRequest(base), env)).status).toBe(400);
  });
});
