// src/lib/origin-check.ts
//
// Cross-site form-submission (CSRF) guard with an allow-list.
//
// Astro's built-in guard (`security.checkOrigin`, on by default in server
// output) rejects any POST/PUT/PATCH/DELETE whose Origin isn't the request's
// own origin. That's exactly right for /contact and /quote — but the
// in-game "Lab updates" pill on games.biokea.ai posts form-encoded to
// https://biokea.ai/api/subscribe, which the built-in check 403s. It runs
// before user middleware and takes no allow-list, so astro.config.mjs turns
// it off and src/middleware.ts applies this function instead. The rules
// below mirror Astro's `createOriginCheckMiddleware` exactly, plus
// ALLOWED_ORIGINS.

export const ALLOWED_ORIGINS: readonly string[] = [
  'https://games.biokea.ai',
  'https://store.biokea.ai',
];

const FORM_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isFormLike(contentType: string | null): boolean {
  if (!contentType) return false;
  const ct = contentType.toLowerCase();
  return FORM_CONTENT_TYPES.some((t) => ct.includes(t));
}

/**
 * Returns a 403 Response when `request` is a cross-site form-style
 * submission from an origin we don't trust, otherwise null (let it through).
 */
export function rejectCrossSiteForm(request: Request, url: URL): Response | null {
  if (SAFE_METHODS.has(request.method)) return null;

  const origin = request.headers.get('origin');
  const trusted = origin !== null && (origin === url.origin || ALLOWED_ORIGINS.includes(origin));
  if (trusted) return null;

  // Non-form content types (e.g. application/json) can't be sent cross-site
  // without a CORS preflight, so — like Astro — only form-like bodies, or
  // requests with no content-type at all, are blocked.
  const contentType = request.headers.get('content-type');
  if (contentType !== null && !isFormLike(contentType)) return null;

  return new Response(`Cross-site ${request.method} form submissions are forbidden`, {
    status: 403,
  });
}
