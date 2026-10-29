// src/lib/keep-alive.ts
//
// The Supabase project is on the free tier, which pauses after a week
// without activity. It paused on 2026-10-28, and while it was paused
// quotes, subscribes and the Shopify orders/paid webhook all failed in
// production. A daily cron (wrangler.toml [triggers], src/worker.ts) runs
// this one cheap read so the project never looks idle. Harmless if the
// project moves to a paid plan.

export interface KeepAliveEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

export async function keepSupabaseAwake(
  env: KeepAliveEnv,
  fetcher: typeof fetch = fetch,
): Promise<'ok' | 'failed' | 'skipped'> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return 'skipped';
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const res = await fetcher(`${env.SUPABASE_URL}/rest/v1/quotes?select=id&limit=1`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
    if (res.ok) return 'ok';
    // Workers Logs keeps this; a paused project answers with a non-2xx.
    console.error('[keep-alive] Supabase read failed:', res.status);
  } catch (err) {
    console.error('[keep-alive] Supabase read failed:', err);
  }
  return 'failed';
}
