// src/lib/cors.ts
//
// CORS allow-list for endpoints called cross-origin from store.biokea.ai
// (the Shopify storefront's embedded quote widget) as well as biokea.ai
// itself. Origins outside the list get no CORS headers at all, which is
// the same as denying the request from the browser's point of view.

export const CORS_ORIGINS: readonly string[] = ['https://store.biokea.ai', 'https://biokea.ai'];

const DEV_ORIGIN = 'http://localhost:4321';

function isAllowed(origin: string, dev: boolean): boolean {
  return CORS_ORIGINS.includes(origin) || (dev && origin === DEV_ORIGIN);
}

/**
 * Returns the CORS response headers for `origin`, or `{}` when the origin
 * isn't allow-listed (in which case the caller should add no CORS headers
 * at all — never echo a disallowed origin).
 */
export function corsHeaders(origin: string | null, dev = false): Record<string, string> {
  if (!origin || !isAllowed(origin, dev)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}

/**
 * Answers a CORS preflight request: 204 with the allow headers when the
 * request's Origin is allow-listed, 204 with no CORS headers otherwise
 * (the browser will then block the real request as cross-origin).
 */
export function preflight(request: Request, dev = false): Response {
  const headers = corsHeaders(request.headers.get('origin'), dev);
  return new Response(null, { status: 204, headers });
}

/**
 * Clones `res` and adds CORS headers for `origin`, leaving status and body
 * untouched.
 */
export function withCors(res: Response, origin: string | null, dev = false): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin, dev))) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
