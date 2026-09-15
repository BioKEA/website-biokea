import { describe, it, expect } from 'vitest';
import { canonicalHostRedirect } from '@/lib/canonical-host';

describe('canonicalHostRedirect', () => {
  it('sends www.biokea.ai to the apex, keeping path and query', () => {
    const res = canonicalHostRedirect(new URL('https://www.biokea.ai/quote?ref=x#pay'));
    expect(res?.status).toBe(301);
    expect(res?.headers.get('location')).toBe('https://biokea.ai/quote?ref=x#pay');
  });

  it('leaves the apex and other hosts alone', () => {
    expect(canonicalHostRedirect(new URL('https://biokea.ai/quote'))).toBeNull();
    expect(canonicalHostRedirect(new URL('http://localhost:4321/quote'))).toBeNull();
    expect(canonicalHostRedirect(new URL('https://store.biokea.ai/'))).toBeNull();
  });
});
