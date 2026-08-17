// src/middleware.ts
//
// Replaces Astro's built-in CSRF origin check (disabled in astro.config.mjs)
// with the same rules plus an allow-list for games.biokea.ai — see
// src/lib/origin-check.ts for the why.
import { defineMiddleware } from 'astro:middleware';
import { rejectCrossSiteForm } from '@/lib/origin-check';

export const onRequest = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();
  const rejection = rejectCrossSiteForm(context.request, context.url);
  return rejection ?? next();
});
