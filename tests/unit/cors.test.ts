import { describe, it, expect } from 'vitest';
import { corsHeaders, preflight, withCors } from '@/lib/cors';

describe('cors', () => {
  it('echoes only allow-listed origins', () => {
    expect(corsHeaders('https://store.biokea.ai')).toEqual({
      'access-control-allow-origin': 'https://store.biokea.ai',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    });
    expect(corsHeaders('https://evil.example')).toEqual({});
    expect(corsHeaders(null)).toEqual({});
    expect(corsHeaders('http://localhost:4321', true)['access-control-allow-origin']).toBe(
      'http://localhost:4321',
    );
    expect(corsHeaders('http://localhost:4321', false)).toEqual({});
  });

  it('preflight is 204 with headers for allowed origins and 204 bare otherwise', () => {
    const ok = preflight(
      new Request('https://biokea.ai/api/quote', {
        method: 'OPTIONS',
        headers: { origin: 'https://store.biokea.ai' },
      }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://store.biokea.ai');
    const no = preflight(
      new Request('https://biokea.ai/api/quote', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(no.status).toBe(204);
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('withCors adds headers to an existing response without changing status/body', async () => {
    const r = withCors(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      'https://store.biokea.ai',
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('{"ok":true}');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://store.biokea.ai');
    expect(r.headers.get('content-type')).toBe('application/json');
  });
});
