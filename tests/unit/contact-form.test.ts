import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleContact } from '@/pages/api/contact';

interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  CONTACT_TO_EMAIL: string;
}

const env: Env = {
  RESEND_API_KEY: 'test-key',
  CONTACT_FROM_EMAIL: 'hello@biokea.ai',
  CONTACT_TO_EMAIL: 'team@biokea.ai',
};

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return new Request('https://biokea.ai/api/contact', { method: 'POST', body: fd });
}

describe('contact endpoint', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: 'msg_1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  });

  it('rejects when required fields missing', async () => {
    const res = await handleContact(
      makeRequest({ name: '', email: '', topic: '', message: '' }),
      env,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it('rejects invalid email', async () => {
    const res = await handleContact(
      makeRequest({ name: 'A', email: 'not-an-email', topic: 'Funding', message: 'hi' }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects when honeypot field is filled', async () => {
    const res = await handleContact(
      makeRequest({
        name: 'A',
        email: 'a@b.com',
        topic: 'Funding',
        message: 'hi',
        website: 'bot',
      }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('sends via Resend and returns ok on valid input', async () => {
    const res = await handleContact(
      makeRequest({ name: 'Alice', email: 'a@b.com', topic: 'Funding', message: 'Hello!' }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 502 when Resend fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 500 })),
    );
    const res = await handleContact(
      makeRequest({ name: 'A', email: 'a@b.com', topic: 'Funding', message: 'hi' }),
      env,
    );
    expect(res.status).toBe(502);
  });
});
