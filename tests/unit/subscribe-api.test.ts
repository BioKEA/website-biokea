import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleSubscribe } from '@/pages/api/subscribe';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon_test',
  RESEND_API_KEY: 'test-key',
  CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
  TURNSTILE_SECRET_KEY: 'secret_xxx',
};

function makeRequest(fields: Record<string, string>) {
  return new Request('https://biokea.ai/api/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
}

const valid = { email: 'a@b.com', source: 'codon2048', handle: 'alice', consent: 'true' };

// Records which upstreams were hit so tests can assert "no insert / no
// welcome" on rejection and "insert + welcome" on acceptance.
let calls: string[];
function stubUpstreams(siteverifySuccess: boolean) {
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('siteverify')) {
        calls.push('siteverify');
        return new Response(JSON.stringify({ success: siteverifySuccess }), { status: 200 });
      }
      if (u.includes('/rest/v1/subscribers')) {
        calls.push('insert');
        return new Response(null, { status: 201 });
      }
      calls.push('resend');
      return new Response(JSON.stringify({ id: 'msg_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
}

describe('subscribe endpoint — Turnstile is verified when present, optional otherwise', () => {
  beforeEach(() => stubUpstreams(true));

  it('accepts a submission with no Turnstile token even when the secret is configured (in-game opt-in)', async () => {
    const res = await handleSubscribe(makeRequest(valid), env);
    expect(res.status).toBe(200);
    expect(calls).toEqual(['insert', 'resend']);
  });

  it('still rejects a submission whose Turnstile token fails siteverify', async () => {
    stubUpstreams(false);
    const res = await handleSubscribe(
      makeRequest({ ...valid, 'cf-turnstile-response': 'bad-token' }),
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/captcha/i);
    expect(calls).toEqual(['siteverify']);
  });

  it('accepts a submission whose Turnstile token passes siteverify', async () => {
    const res = await handleSubscribe(
      makeRequest({ ...valid, 'cf-turnstile-response': 'good-token' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(calls).toEqual(['siteverify', 'insert', 'resend']);
  });

  it('never calls siteverify when no secret is configured', async () => {
    const res = await handleSubscribe(
      makeRequest({ ...valid, 'cf-turnstile-response': 'whatever' }),
      { ...env, TURNSTILE_SECRET_KEY: undefined },
    );
    expect(res.status).toBe(200);
    expect(calls).toEqual(['insert', 'resend']);
  });

  it('still rejects the honeypot and invalid email before touching any upstream', async () => {
    expect((await handleSubscribe(makeRequest({ ...valid, website: 'x' }), env)).status).toBe(400);
    expect((await handleSubscribe(makeRequest({ ...valid, email: 'nope' }), env)).status).toBe(400);
    expect(calls).toEqual([]);
  });
});
