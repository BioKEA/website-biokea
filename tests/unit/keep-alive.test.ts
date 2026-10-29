import { describe, it, expect, vi } from 'vitest';
import { keepSupabaseAwake } from '@/lib/keep-alive';

const env = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sr' };

describe('keepSupabaseAwake', () => {
  it('reads one quote id with the service-role key', async () => {
    const fetcher = vi.fn(async () => new Response('[]', { status: 200 }));
    expect(await keepSupabaseAwake(env, fetcher)).toBe('ok');
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/rest/v1/quotes?select=id&limit=1');
    expect((init.headers as Record<string, string>).apikey).toBe('sr');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer sr');
  });

  it('logs and reports a failed read without throwing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetcher = vi.fn(async () => new Response('paused', { status: 540 }));
    expect(await keepSupabaseAwake(env, fetcher)).toBe('failed');
    expect(err).toHaveBeenCalled();
    const boom = vi.fn(async () => {
      throw new Error('dns');
    });
    expect(await keepSupabaseAwake(env, boom)).toBe('failed');
    err.mockRestore();
  });

  it('does nothing when Supabase is not configured', async () => {
    const fetcher = vi.fn();
    expect(await keepSupabaseAwake({}, fetcher)).toBe('skipped');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
