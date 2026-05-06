// src/pages/api/golden-sample/claim/[game].ts
//
// Issue a Golden Sample ticket. The game's in-engine unlock-detection
// hits this endpoint when a player meets the threshold; we validate
// the proof against Supabase + insert a ticket row + return the word
// + a signed token for the in-game animation and the /golden-sample-26
// collection wall.
//
// I won't tell. That would be cheating.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { slotForGame } from '@/lib/golden-sample/config';
import { validateUnlock } from '@/lib/golden-sample/validate';
import { signTicket } from '@/lib/golden-sample/hmac';

export const prerender = false;

const ClaimSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  client_id: z.string().uuid(),
});

interface ClaimEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOLDEN_WORDS: string; // JSON map of {gameId: word}
  GOLDEN_HMAC_SECRET: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function readWord(env: ClaimEnv, game: string): string | null {
  try {
    const map = JSON.parse(env.GOLDEN_WORDS) as Record<string, unknown>;
    const v = map[game];
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

interface InsertResult {
  ok: boolean;
  alreadyHeld: boolean;
}

async function insertTicket(
  env: ClaimEnv,
  row: { player_handle: string; client_id: string; game_id: string; slot: number },
): Promise<InsertResult> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/golden_sample_tickets`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (res.ok) return { ok: true, alreadyHeld: false };
  // 23505 = unique_violation — handle already has this ticket. That's
  // fine; first earn already animated, this is a replay.
  let code: string | undefined;
  try {
    const body = (await res.json()) as { code?: string };
    code = body.code;
  } catch {
    // ignore
  }
  if (code === '23505') return { ok: true, alreadyHeld: true };
  return { ok: false, alreadyHeld: false };
}

export async function POST({ request, params }: APIContext): Promise<Response> {
  const e = env as unknown as ClaimEnv;
  if (
    !e?.SUPABASE_URL ||
    !e.SUPABASE_SERVICE_ROLE_KEY ||
    !e.GOLDEN_WORDS ||
    !e.GOLDEN_HMAC_SECRET
  ) {
    return json({ ok: false, error: 'Hunt is not configured.' }, 500);
  }

  const game = params.game;
  if (typeof game !== 'string') {
    return json({ ok: false, error: 'Missing game.' }, 400);
  }
  const config = slotForGame(game);
  if (!config) {
    return json({ ok: false, error: 'Unknown game.' }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }
  const parsed = ClaimSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid handle or client_id.' }, 400);
  }

  const { handle, client_id } = parsed.data;

  // Validate proof-of-progress against Supabase. Either the player
  // has the rows that prove they earned this, or the claim is denied.
  const earned = await validateUnlock(e, config, handle);
  if (!earned) {
    return json({ ok: false, error: 'Unlock not yet earned.' }, 403);
  }

  const word = readWord(e, game);
  if (!word) {
    // Shouldn't happen if GOLDEN_WORDS is configured correctly.
    return json({ ok: false, error: 'Hunt configuration error.' }, 500);
  }

  // Insert the ticket — idempotent on (handle, game).
  const inserted = await insertTicket(e, {
    player_handle: handle,
    client_id,
    game_id: game,
    slot: config.slot,
  });
  if (!inserted.ok) {
    return json({ ok: false, error: 'Could not record ticket.' }, 502);
  }

  const issuedAt = new Date().toISOString();
  const token = await signTicket(
    { game, slot: config.slot, handle, client_id, issued_at: issuedAt },
    e.GOLDEN_HMAC_SECRET,
  );

  return json({
    ok: true,
    slot: config.slot,
    word,
    token,
    issued_at: issuedAt,
    // True only on the very first earn for this (handle, game). The
    // game uses this to decide whether to play the full animation or
    // the small replay toast.
    first_earn: !inserted.alreadyHeld,
  });
}
