import { describe, it, expect } from 'vitest';
import { rejectCrossSiteForm, ALLOWED_ORIGINS } from '@/lib/origin-check';

const url = new URL('https://biokea.ai/api/subscribe');

function req(init: { method?: string; origin?: string | null; contentType?: string | null }) {
  const headers = new Headers();
  if (init.origin) headers.set('origin', init.origin);
  if (init.contentType) headers.set('content-type', init.contentType);
  return new Request(url, { method: init.method ?? 'POST', headers });
}

const FORM = 'application/x-www-form-urlencoded';

describe('rejectCrossSiteForm', () => {
  it('lets safe methods through regardless of origin', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(rejectCrossSiteForm(req({ method, origin: 'https://evil.example' }), url)).toBeNull();
    }
  });

  it('allows same-origin form posts', () => {
    expect(
      rejectCrossSiteForm(req({ origin: 'https://biokea.ai', contentType: FORM }), url),
    ).toBeNull();
  });

  it('allows form posts from games.biokea.ai (the in-game Lab-updates pill)', () => {
    expect(ALLOWED_ORIGINS).toContain('https://games.biokea.ai');
    expect(
      rejectCrossSiteForm(req({ origin: 'https://games.biokea.ai', contentType: FORM }), url),
    ).toBeNull();
    expect(
      rejectCrossSiteForm(
        req({ origin: 'https://games.biokea.ai', contentType: 'multipart/form-data; boundary=x' }),
        url,
      ),
    ).toBeNull();
  });

  it('rejects form posts from any other origin with a 403', () => {
    const res = rejectCrossSiteForm(
      req({ origin: 'https://evil.example', contentType: FORM }),
      url,
    );
    expect(res?.status).toBe(403);
    expect(
      rejectCrossSiteForm(req({ origin: 'https://evil.example', contentType: 'text/plain' }), url)
        ?.status,
    ).toBe(403);
    // Lookalike hosts must not match.
    expect(
      rejectCrossSiteForm(
        req({ origin: 'https://games.biokea.ai.evil.example', contentType: FORM }),
        url,
      )?.status,
    ).toBe(403);
    expect(
      rejectCrossSiteForm(req({ origin: 'http://games.biokea.ai', contentType: FORM }), url)
        ?.status,
    ).toBe(403);
  });

  it('rejects unsafe methods with no content-type from a foreign origin, and with no origin at all', () => {
    expect(rejectCrossSiteForm(req({ origin: 'https://evil.example' }), url)?.status).toBe(403);
    expect(rejectCrossSiteForm(req({ contentType: FORM }), url)?.status).toBe(403);
    expect(rejectCrossSiteForm(req({}), url)?.status).toBe(403);
  });

  it('does not touch non-form content types (they cannot be sent cross-site without a CORS preflight)', () => {
    expect(
      rejectCrossSiteForm(
        req({ origin: 'https://evil.example', contentType: 'application/json' }),
        url,
      ),
    ).toBeNull();
  });
});
