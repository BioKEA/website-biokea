/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string;
  readonly CONTACT_FROM_EMAIL: string;
  readonly CONTACT_TO_EMAIL: string;
  readonly SUPABASE_URL: string;
  readonly SUPABASE_PUBLISHABLE_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// `cloudflare:workers` is a virtual module provided by the Cloudflare
// Workers runtime (and by @astrojs/cloudflare's platformProxy in dev).
// Astro v6 + @astrojs/cloudflare v13 require it for runtime env access
// — Astro.locals.runtime.env was removed.
declare module 'cloudflare:workers' {
  export const env: {
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    CONTACT_TO_EMAIL?: string;
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    // Bypasses RLS. Required by /api/quote and /quote/<token>, whose
    // `quotes` table has RLS enabled with zero policies. Worker secret
    // only — never expose to the client.
    SUPABASE_SERVICE_ROLE_KEY?: string;
    TURNSTILE_SECRET_KEY?: string;
    // Stripe — Worker secrets. sk_test_… in dev/.dev.vars, sk_live_… in prod.
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    // Cloudflare Access (admin gate) — plain vars in wrangler.toml.
    CF_ACCESS_TEAM_DOMAIN?: string; // e.g. biokea.cloudflareaccess.com
    CF_ACCESS_AUD?: string; // Application Audience tag
    // Dev-only bypass for the admin gate; ignored in production builds.
    CF_ACCESS_DEV_EMAIL?: string;
    [key: string]: unknown;
  };
}
