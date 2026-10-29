// src/worker.ts — the Worker entry (wrangler.toml `main`).
//
// Astro's Cloudflare adapter serves every request through its own handler;
// this entry re-exports it and adds the scheduled handler for the daily
// Supabase keep-alive (src/lib/keep-alive.ts, cron in wrangler.toml).
import { handle } from '@astrojs/cloudflare/handler';
import { keepSupabaseAwake, type KeepAliveEnv } from './lib/keep-alive';

export default {
  fetch: handle,
  // Typed locally: the project doesn't load @cloudflare/workers-types globally.
  async scheduled(
    _controller: unknown,
    env: KeepAliveEnv,
    ctx: { waitUntil(p: Promise<unknown>): void },
  ) {
    ctx.waitUntil(keepSupabaseAwake(env));
  },
};
