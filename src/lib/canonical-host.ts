// src/lib/canonical-host.ts
//
// www.biokea.ai resolves to the same Worker as the apex, but nothing
// should be served from it: every page declares https://biokea.ai as
// canonical, and the quote widget only treats the apex as "same site" —
// on www it posts cross-origin to biokea.ai, whose CORS allow-list
// doesn't include www, so the browser drops the request and the widget
// reports a network error. Redirecting at the host level fixes that for
// every page at once. Applied from src/middleware.ts.

const CANONICAL_HOST = 'biokea.ai';
const WWW_HOST = `www.${CANONICAL_HOST}`;

/**
 * 301 to the same URL on the apex when `url` is on the www host,
 * otherwise null (nothing to do).
 */
export function canonicalHostRedirect(url: URL): Response | null {
  if (url.hostname !== WWW_HOST) return null;
  const target = new URL(url);
  target.hostname = CANONICAL_HOST;
  return Response.redirect(target.toString(), 301);
}
