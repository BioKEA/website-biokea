// src/pages/api/golden-sample/milestone.ts
//
// Long-form games (cal-field-lab-collectible / Biodiversity Discovery
// Lab; 3d-biodiversity-collect-em-all / WildCal) don't post to the
// `scores` table, so they can't be validated like the four arcade
// games. Instead, they POST their current progress count here every
// time it advances. The server stores `max(observed, current)` so:
//
//   - Repeat / replayed POSTs are idempotent (no double-counting).
//   - A player's count never *decreases* (defensive against client
//     state corruption or savefile resets).
//   - Each long-form game has its own counter — they don't collide.
//
// I won't tell. That would be cheating.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { SLOTS } from '@/lib/golden-sample/config';

export const prerender = false;

// Only games whose slot kind is 'milestone' can POST progress here.
const MILESTONE_GAMES = new Set(SLOTS.filter((s) => s.kind === 'milestone').map((s) => s.game));

const MilestoneSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  game: z.string().regex(/^[a-z0-9-]{1,64}$/),
  // Bounded so a malicious client can't insert {count: 1e9} and
  // unlock instantly. Long-form games' realistic ceilings:
  //   BDL specimens: ~50
  //   WildCal animals: ~120
  // A hard cap of 1000 leaves headroom and blocks abuse.
  count: z.number().int().nonnegative().max(1000),
});

interface MilestoneEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST({ request }: APIContext): Promise<Response> {
  const e = env as unknown as MilestoneEnv;
  if (!e?.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Hunt is not configured.' }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }
  const parsed = MilestoneSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid milestone payload.' }, 400);
  }

  const { handle, game, count } = parsed.data;
  if (!MILESTONE_GAMES.has(game)) {
    return json({ ok: false, error: 'Game does not track milestones.' }, 400);
  }

  // Upsert with `count = greatest(existing, incoming)` so the server
  // stores the player's high-water mark, never a regression.
  // PostgREST upsert via Prefer: resolution=merge-duplicates updates
  // the row but does NOT support arbitrary expressions in the update.
  // Instead we read-then-write: cheap (one row, primary-key lookup).
  const readUrl =
    `${e.SUPABASE_URL}/rest/v1/golden_sample_milestones` +
    `?player_handle=eq.${encodeURIComponent(handle)}` +
    `&game_id=eq.${encodeURIComponent(game)}` +
    `&select=count`;
  const readRes = await fetch(readUrl, {
    headers: {
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!readRes.ok) {
    return json({ ok: false, error: 'Storage read failed.' }, 502);
  }
  const rows = (await readRes.json()) as { count: number }[];
  const existing = rows[0]?.count ?? 0;
  if (count <= existing) {
    // Idempotent — already at or above this mark.
    return json({ ok: true, stored: existing });
  }

  // Upsert (insert or update) the new high-water mark.
  const upsertRes = await fetch(
    `${e.SUPABASE_URL}/rest/v1/golden_sample_milestones?on_conflict=player_handle,game_id`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: e.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        player_handle: handle,
        game_id: game,
        count,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  if (!upsertRes.ok) {
    return json({ ok: false, error: 'Storage write failed.' }, 502);
  }

  return json({ ok: true, stored: count });
}
