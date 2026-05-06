// src/pages/api/golden-sample/leaderboard.ts
//
// Public hunt-progress leaderboard. For each handle that has earned at
// least one ticket, return how many they hold (1..6) and when they
// last earned one. The collection wall on /golden-sample-26 is the
// per-player surface; this endpoint backs the cross-player view on
// /mission/games/leaderboard.
//
// No PII exposed — handles are already public via the per-game daily
// leaderboards.
//
// I won't tell. That would be cheating.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { SLOTS } from '@/lib/golden-sample/config';

export const prerender = false;

interface LbEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      // Tiny edge cache to absorb burst load on the leaderboard page —
      // hunt progress is interesting in real-time but a 30-second lag
      // is invisible to humans.
      'cache-control': 'public, max-age=30',
    },
  });
}

export async function GET(_ctx: APIContext): Promise<Response> {
  const e = env as unknown as LbEnv;
  if (!e?.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Hunt is not configured.' }, 500);
  }

  // Pull every ticket row. The schema caps tickets at 6 per handle
  // (UNIQUE on player_handle, slot) — so the row count is at most
  // 6 × (number of unique handles that have earned anything).
  // Bounded population, cheap to aggregate in the Worker.
  const url =
    `${e.SUPABASE_URL}/rest/v1/golden_sample_tickets` +
    `?select=player_handle,slot,issued_at` +
    `&order=issued_at.asc&limit=10000`;
  const res = await fetch(url, {
    headers: {
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) return json({ ok: false, error: 'Storage read failed.' }, 502);

  const rows = (await res.json()) as {
    player_handle: string;
    slot: number;
    issued_at: string;
  }[];

  // Aggregate per handle.
  const byHandle = new Map<string, { handle: string; tickets: number; latestEarn: string }>();
  for (const r of rows) {
    const cur = byHandle.get(r.player_handle);
    if (!cur) {
      byHandle.set(r.player_handle, {
        handle: r.player_handle,
        tickets: 1,
        latestEarn: r.issued_at,
      });
    } else {
      cur.tickets += 1;
      if (r.issued_at > cur.latestEarn) cur.latestEarn = r.issued_at;
    }
  }

  // Sort: most tickets first; among handles tied on count, earliest
  // *latest-earn* wins (i.e., whoever finished their N-th first ranks
  // higher than someone still working their way up to N).
  const ranked = Array.from(byHandle.values()).sort((a, b) => {
    if (b.tickets !== a.tickets) return b.tickets - a.tickets;
    return a.latestEarn.localeCompare(b.latestEarn);
  });

  return json({
    ok: true,
    total_handles: ranked.length,
    slot_count: SLOTS.length,
    ranked: ranked.slice(0, 50),
  });
}
