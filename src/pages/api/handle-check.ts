// src/pages/api/handle-check.ts
//
// Public read-only check that mirrors the server-side
// scores_check_handle() trigger from migration 0002. Used by
// HandlePicker on /mission/games/ to give the player immediate
// "this handle isn't allowed" feedback at pick time, instead of
// discovering rejection later when their score post is rebuffed
// by the BEFORE-INSERT trigger.
//
// Source of truth is still the trigger — this endpoint can lag the
// pattern table by up to CACHE_TTL_MS (60s in-Worker memory). The
// trigger uses the live table on every insert.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';

export const prerender = false;

const HandleSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/);

interface CheckEnv {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

// Same translate() pair as the trigger:
//   translate(lower(player_handle), '01345789@', 'olesatbga')
// Map: 0→o 1→l 3→e 4→s 5→a 7→t 8→b 9→g @→a
const LEET_FROM = '01345789@';
const LEET_TO = 'olesatbga';

function leetNormalize(s: string): string {
  let out = '';
  for (const c of s) {
    const i = LEET_FROM.indexOf(c);
    out += i === -1 ? c : LEET_TO[i];
  }
  return out;
}

let patternCache: { fetchedAt: number; patterns: string[] } | null = null;
const CACHE_TTL_MS = 60_000;

async function fetchPatterns(env: CheckEnv): Promise<string[]> {
  if (patternCache && Date.now() - patternCache.fetchedAt < CACHE_TTL_MS) {
    return patternCache.patterns;
  }
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/forbidden_handle_patterns?select=pattern`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  const rows = (await res.json()) as { pattern: string }[];
  const patterns = rows.map((r) => r.pattern);
  patternCache = { fetchedAt: Date.now(), patterns };
  return patterns;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60',
    },
  });
}

export async function GET({ url }: APIContext): Promise<Response> {
  const e = env as unknown as CheckEnv;
  if (!e?.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: false, error: 'Handle check is not configured.' }, 500);
  }
  const handleRaw = url.searchParams.get('handle') ?? '';
  const parsed = HandleSchema.safeParse(handleRaw);
  if (!parsed.success) {
    return json({ ok: false, error: 'Invalid handle.' }, 400);
  }
  const handle = parsed.data;
  const lower = handle.toLowerCase();
  const normalized = leetNormalize(lower);

  let patterns: string[];
  try {
    patterns = await fetchPatterns(e);
  } catch {
    return json({ ok: false, error: 'service unavailable' }, 502);
  }

  for (const p of patterns) {
    let re: RegExp;
    try {
      re = new RegExp(p, 'i');
    } catch {
      continue;
    }
    if (re.test(lower) || re.test(normalized)) {
      return json({ ok: true, allowed: false, reason: 'forbidden' });
    }
  }
  return json({ ok: true, allowed: true });
}
