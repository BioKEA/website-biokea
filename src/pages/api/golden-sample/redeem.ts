// src/pages/api/golden-sample/redeem.ts
//
// Final step of the Golden Sample hunt: the player has all six
// tickets and is claiming their prize (free soil sequencing). Each
// of the six tokens is HMAC-verified, slot-uniqueness checked, all
// bound to the same handle, all issued during the campaign window.
//
// Three hard gates the user can't bypass even with all six tokens:
//
//   - Campaign window — tokens issued before/after the hunt dates
//     are rejected (see config.CAMPAIGN_OPENS_ISO/CLOSES_ISO).
//   - Prize cap — only PRIZE_CAP redemptions allowed globally.
//   - One redemption per handle — the unique constraint on
//     player_handle in golden_sample_redemptions is the belt; this
//     pre-check is the suspenders so we return a graceful error.
//
// I won't tell. That would be cheating.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import {
  CAMPAIGN_OPENS_ISO,
  CAMPAIGN_CLOSES_ISO,
  PRIZE_CAP,
  SLOTS,
} from '@/lib/golden-sample/config';
import { verifyTicket } from '@/lib/golden-sample/hmac';

export const prerender = false;

const AddressSchema = z.object({
  name: z.string().trim().min(1).max(120),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().default(''),
  city: z.string().trim().min(1).max(100),
  region: z.string().trim().max(100).optional().default(''),
  postal: z.string().trim().min(1).max(20),
  country: z.string().trim().min(2).max(60),
});

const RedeemSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/),
  email: z.string().trim().email().max(254),
  tokens: z.array(z.string().min(8).max(2048)).length(SLOTS.length),
  address: AddressSchema,
});

interface RedeemEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GOLDEN_HMAC_SECRET: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST({ request }: APIContext): Promise<Response> {
  const e = env as unknown as RedeemEnv;
  if (!e?.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY || !e.GOLDEN_HMAC_SECRET) {
    return json({ ok: false, error: 'Hunt is not configured.' }, 500);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }
  const parsed = RedeemSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, error: 'Missing or malformed fields.' }, 400);
  }
  const { handle, email, tokens, address } = parsed.data;

  // ─── Verify every token ───
  const opens = Date.parse(CAMPAIGN_OPENS_ISO);
  const closes = Date.parse(CAMPAIGN_CLOSES_ISO);
  const seenSlots = new Set<number>();
  for (const tok of tokens) {
    const payload = await verifyTicket(tok, e.GOLDEN_HMAC_SECRET);
    if (!payload) return json({ ok: false, error: 'Invalid ticket signature.' }, 400);
    if (payload.handle !== handle) {
      return json({ ok: false, error: 'Ticket does not belong to this handle.' }, 400);
    }
    if (seenSlots.has(payload.slot)) {
      return json({ ok: false, error: 'Duplicate slot in submitted tickets.' }, 400);
    }
    seenSlots.add(payload.slot);
    const issued = Date.parse(payload.issued_at);
    if (!Number.isFinite(issued) || issued < opens || issued > closes) {
      return json({ ok: false, error: 'Ticket issued outside campaign window.' }, 400);
    }
  }
  // All six slots present?
  for (const s of SLOTS) {
    if (!seenSlots.has(s.slot)) {
      return json({ ok: false, error: `Missing slot ${s.slot}.` }, 400);
    }
  }

  // ─── Belt-and-suspenders: cross-check tickets table ───
  const ticketsRes = await fetch(
    `${e.SUPABASE_URL}/rest/v1/golden_sample_tickets` +
      `?player_handle=eq.${encodeURIComponent(handle)}` +
      `&select=slot`,
    {
      headers: {
        apikey: e.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (!ticketsRes.ok) {
    return json({ ok: false, error: 'Storage read failed.' }, 502);
  }
  const heldRows = (await ticketsRes.json()) as { slot: number }[];
  const heldSlots = new Set(heldRows.map((r) => r.slot));
  for (const s of SLOTS) {
    if (!heldSlots.has(s.slot)) {
      return json(
        { ok: false, error: `Server has no record of slot ${s.slot} for this handle.` },
        400,
      );
    }
  }

  // ─── Prize cap ───
  const capRes = await fetch(`${e.SUPABASE_URL}/rest/v1/golden_sample_redemptions?select=id`, {
    headers: {
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'count=exact',
    },
  });
  if (!capRes.ok) {
    return json({ ok: false, error: 'Storage read failed.' }, 502);
  }
  const range = capRes.headers.get('content-range') ?? '';
  const redeemed = Number(range.split('/')[1] ?? '0') || 0;
  if (redeemed >= PRIZE_CAP) {
    return json(
      {
        ok: false,
        error: 'Hunt closed — all 10 prizes have been claimed.',
        sold_out: true,
      },
      409,
    );
  }

  // ─── Insert the redemption ───
  const insertRes = await fetch(`${e.SUPABASE_URL}/rest/v1/golden_sample_redemptions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: e.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      player_handle: handle,
      email,
      shipping_address: address,
    }),
  });
  if (!insertRes.ok) {
    let code: string | undefined;
    try {
      const body = (await insertRes.json()) as { code?: string };
      code = body.code;
    } catch {
      // ignore
    }
    if (code === '23505') {
      return json(
        { ok: false, error: 'This handle has already redeemed.', already_redeemed: true },
        409,
      );
    }
    return json({ ok: false, error: 'Could not record redemption.' }, 502);
  }

  return json({
    ok: true,
    handle,
    prizes_remaining: Math.max(0, PRIZE_CAP - redeemed - 1),
  });
}
