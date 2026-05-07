// src/pages/api/golden-sample/state.ts
//
// Read the current Golden Sample inventory + sentence words for a
// given handle. Used by /golden-sample-26's collection wall to
// render the player's slots. Words are returned for slots the
// player has already earned — the rest stay sealed.
//
// I won't tell. That would be cheating.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { SLOTS, PRIZE_CAP } from '@/lib/golden-sample/config';

export const prerender = false;

const StateQuery = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  // Optional. When provided AND it matches the client_id stored on a
  // ticket row, the word for that slot is returned. When absent or
  // mismatched, only the held flag is returned — handles are public
  // (they're on every leaderboard) but the words must stay sealed
  // until the requester can prove they're the device that earned
  // them. Without this, anyone could type a leader's handle and see
  // the sentence.
  client_id: z.string().uuid().optional(),
});

interface StateEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOLDEN_WORDS: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function readWordsMap(env: StateEnv): Record<string, string> {
  try {
    return JSON.parse(env.GOLDEN_WORDS) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function GET({ url }: APIContext): Promise<Response> {
  const e = env as unknown as StateEnv;
  if (!e?.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY || !e.GOLDEN_WORDS) {
    return json({ ok: false, error: 'Hunt is not configured.' }, 500);
  }

  const handleRaw = url.searchParams.get('handle') ?? '';
  const clientIdRaw = url.searchParams.get('client_id') ?? undefined;
  const parsed = StateQuery.safeParse({
    handle: handleRaw,
    client_id: clientIdRaw && clientIdRaw.length > 0 ? clientIdRaw : undefined,
  });
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid handle.' }, 400);
  }
  const { handle, client_id: requesterClientId } = parsed.data;

  // Two queries in parallel: tickets for this handle, and the global
  // redemption count (so the wall can show "8 of 10 prizes claimed").
  const [ticketsRes, redemptionsRes] = await Promise.all([
    fetch(
      // client_id is now part of the select so each slot can be gated
      // on per-ticket ownership before the word is disclosed.
      `${e.SUPABASE_URL}/rest/v1/golden_sample_tickets` +
        `?player_handle=eq.${encodeURIComponent(handle)}` +
        `&select=slot,game_id,client_id,issued_at&order=slot.asc`,
      {
        headers: {
          apikey: e.SUPABASE_SERVICE_ROLE_KEY,
          authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    ),
    fetch(`${e.SUPABASE_URL}/rest/v1/golden_sample_redemptions?select=id`, {
      headers: {
        apikey: e.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: 'count=exact',
      },
    }),
  ]);

  if (!ticketsRes.ok) {
    return json({ ok: false, error: 'Storage read failed.' }, 502);
  }
  const tickets = (await ticketsRes.json()) as {
    slot: number;
    game_id: string;
    client_id: string;
    issued_at: string;
  }[];

  // Count redemptions from the Content-Range header.
  let redemptionsCount = 0;
  if (redemptionsRes.ok) {
    const range = redemptionsRes.headers.get('content-range') ?? '';
    redemptionsCount = Number(range.split('/')[1] ?? '0') || 0;
  }
  const prizesRemaining = Math.max(0, PRIZE_CAP - redemptionsCount);

  const heldSlots = new Set(tickets.map((t) => t.slot));
  const words = readWordsMap(e);

  // Build the public collection wall payload — slots the player has
  // earned are flagged held, but the word is disclosed ONLY when the
  // requester's client_id matches the device that earned that ticket.
  // This stops a curious visitor who types a leader's handle from
  // reading the leader's words off the wall (and assembling the
  // sentence). Multi-device players see "earned, played elsewhere"
  // for slots they didn't earn on the device they're viewing from —
  // they can replay any game on the current device to repopulate
  // their local word cache.
  const slots = SLOTS.map((s) => {
    const ticket = tickets.find((t) => t.slot === s.slot);
    const held = !!ticket;
    const ownsThisDevice = held && !!requesterClientId && ticket.client_id === requesterClientId;
    return {
      slot: s.slot,
      game: s.game,
      hint: s.hint,
      held,
      // True iff requester proved ownership for this slot. Front-end
      // uses this to render different UI for "earned by you, here"
      // vs "earned by this handle, but not on this device".
      owned_by_requester: ownsThisDevice,
      word: ownsThisDevice ? (words[s.game] ?? null) : null,
      issued_at: held ? (ticket.issued_at ?? null) : null,
    };
  });
  const earnedCount = tickets.length;

  return json({
    ok: true,
    handle,
    slots,
    earned_count: earnedCount,
    prizes_remaining: prizesRemaining,
    prize_cap: PRIZE_CAP,
    complete: earnedCount === SLOTS.length,
  });
}
