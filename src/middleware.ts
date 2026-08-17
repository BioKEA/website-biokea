// src/middleware.ts
//
// 1. CSRF: replaces Astro's built-in origin check (disabled in
//    astro.config.mjs) with the same rules plus an allow-list for
//    games.biokea.ai — see src/lib/origin-check.ts.
// 2. Admin gate: /admin/* and /api/admin/* require a valid Cloudflare
//    Access JWT — see src/lib/access.ts. In `astro dev` only,
//    CF_ACCESS_DEV_EMAIL stands in for the header.
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { rejectCrossSiteForm } from '@/lib/origin-check';
import { isAdminPath, remoteAccessKeys, verifyAccessJwt } from '@/lib/access';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const rejection = rejectCrossSiteForm(context.request, context.url);
  if (rejection) return rejection;

  if (isAdminPath(context.url.pathname)) {
    const e = env as {
      CF_ACCESS_TEAM_DOMAIN?: string;
      CF_ACCESS_AUD?: string;
      CF_ACCESS_DEV_EMAIL?: string;
    };
    if (import.meta.env.DEV && e?.CF_ACCESS_DEV_EMAIL) {
      context.locals.adminEmail = e.CF_ACCESS_DEV_EMAIL;
      return next();
    }
    const token = context.request.headers.get('cf-access-jwt-assertion');
    if (!token || !e?.CF_ACCESS_TEAM_DOMAIN || !e?.CF_ACCESS_AUD) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      context.locals.adminEmail = await verifyAccessJwt(
        token,
        { teamDomain: e.CF_ACCESS_TEAM_DOMAIN, aud: e.CF_ACCESS_AUD },
        remoteAccessKeys(e.CF_ACCESS_TEAM_DOMAIN),
      );
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return next();
});
