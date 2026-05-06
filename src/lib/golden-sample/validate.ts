// src/lib/golden-sample/validate.ts
//
// Per-slot proof-of-progress validation. Server-side only — runs
// inside the Cloudflare Worker with the SUPABASE_SERVICE_ROLE_KEY
// secret so we can read past `scores` rows + the long-form milestones
// table without anon RLS getting in the way.
//
// Each validator returns true iff the player legitimately earned the
// ticket. NO partial credit, NO "they're close enough" fallbacks —
// either the threshold is met or the claim is rejected.
//
// I won't tell. That would be cheating.

import type { SlotConfig } from './config';

interface ValidateEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

function supaHeaders(env: ValidateEnv): HeadersInit {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
  };
}

// Postgrest-encoded handle filter. citext compares case-insensitively
// so we don't have to lowercase here, but we do trim + cap length.
function encodeHandle(handle: string): string {
  return encodeURIComponent(handle.trim().slice(0, 32));
}

// Pipette Rush — slot 1 — N daily-mode rows submitted by this handle.
// "Successful" is interpreted loosely: any row in `scores` for the
// pipette-rush daily mode counts. The schema requires score >= 0 and
// the handle moderation trigger blocks abuse handles, so this is a
// reasonable proxy for "completed games."
async function validateCount(
  env: ValidateEnv,
  handle: string,
  game: string,
  threshold: number,
): Promise<boolean> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/scores` +
    `?game_id=eq.${encodeURIComponent(game)}` +
    `&player_handle=eq.${encodeHandle(handle)}` +
    `&select=id`;
  const res = await fetch(url, {
    headers: { ...supaHeaders(env), Prefer: 'count=exact' },
  });
  if (!res.ok) return false;
  // PostgREST returns the count via the Content-Range header when
  // Prefer: count=exact is set: "0-N/total".
  const range = res.headers.get('content-range') ?? '';
  const total = Number(range.split('/')[1] ?? '0');
  return Number.isFinite(total) && total >= threshold;
}

// Particle Accelerator — slot 6 — score (= seconds survived) >= N
// in any daily-mode row.
async function validateParticleTime(
  env: ValidateEnv,
  handle: string,
  threshold: number,
): Promise<boolean> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/scores` +
    `?game_id=eq.particle-survival-shooter` +
    `&mode=eq.daily` +
    `&player_handle=eq.${encodeHandle(handle)}` +
    `&score=gte.${threshold}` +
    `&select=id&limit=1`;
  const res = await fetch(url, { headers: supaHeaders(env) });
  if (!res.ok) return false;
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) && rows.length > 0;
}

// Plasmid Plinko — slot 4 — antesCleared >= N in metadata jsonb.
async function validatePlasmidAnte(
  env: ValidateEnv,
  handle: string,
  threshold: number,
): Promise<boolean> {
  // PostgREST jsonb path filter: metadata->>antesCleared cast to int
  // isn't directly expressible without an RPC, so pull rows for this
  // handle (capped) and check client-side. There won't be many — a
  // typical player has <50 lifetime plasmid rows.
  const url =
    `${env.SUPABASE_URL}/rest/v1/scores` +
    `?game_id=eq.plasmid-plinko` +
    `&mode=eq.daily` +
    `&player_handle=eq.${encodeHandle(handle)}` +
    `&select=metadata&limit=200`;
  const res = await fetch(url, { headers: supaHeaders(env) });
  if (!res.ok) return false;
  const rows = (await res.json()) as { metadata: Record<string, unknown> }[];
  for (const r of rows) {
    const v = r.metadata?.antesCleared;
    if (typeof v === 'number' && v >= threshold) return true;
  }
  return false;
}

// Codon Collider — slot 5 — highestTier >= N in metadata jsonb.
async function validateCodonTier(
  env: ValidateEnv,
  handle: string,
  threshold: number,
): Promise<boolean> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/scores` +
    `?game_id=eq.codon2048` +
    // Both classic-daily and lab-daily count — the player can hit
    // Ecosystem in either daily variant.
    `&mode=in.(classic-daily,lab-daily)` +
    `&player_handle=eq.${encodeHandle(handle)}` +
    `&select=metadata&limit=200`;
  const res = await fetch(url, { headers: supaHeaders(env) });
  if (!res.ok) return false;
  const rows = (await res.json()) as { metadata: Record<string, unknown> }[];
  for (const r of rows) {
    const v = r.metadata?.highestTier;
    if (typeof v === 'number' && v >= threshold) return true;
  }
  return false;
}

// Long-form games — slot 2 (WildCal), slot 3 (BDL) — server-tracked
// milestone counter has reached the threshold. The game POSTs its
// current count to /api/golden-sample/milestone whenever it advances.
async function validateMilestone(
  env: ValidateEnv,
  handle: string,
  game: string,
  threshold: number,
): Promise<boolean> {
  const url =
    `${env.SUPABASE_URL}/rest/v1/golden_sample_milestones` +
    `?game_id=eq.${encodeURIComponent(game)}` +
    `&player_handle=eq.${encodeHandle(handle)}` +
    `&select=count`;
  const res = await fetch(url, { headers: supaHeaders(env) });
  if (!res.ok) return false;
  const rows = (await res.json()) as { count: number }[];
  if (rows.length === 0) return false;
  return rows[0].count >= threshold;
}

export async function validateUnlock(
  env: ValidateEnv,
  config: SlotConfig,
  handle: string,
): Promise<boolean> {
  switch (config.kind) {
    case 'count':
      return validateCount(env, handle, config.game, config.threshold);
    case 'particle-time':
      return validateParticleTime(env, handle, config.threshold);
    case 'plasmid-ante':
      return validatePlasmidAnte(env, handle, config.threshold);
    case 'codon-tier':
      return validateCodonTier(env, handle, config.threshold);
    case 'milestone':
      return validateMilestone(env, handle, config.game, config.threshold);
  }
}
