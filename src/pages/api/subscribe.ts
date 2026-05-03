// src/pages/api/subscribe.ts
//
// Opt-in endpoint for the "Lab updates" form on /mission/games/,
// /golden-sample-26, /subscribe, and the in-game injected pill.
// Writes to public.subscribers in the shared Supabase project (RLS
// allows anonymous inserts) and queues a welcome email via Resend.
// Mirrors the validation+honeypot+optional-Turnstile pattern of
// src/pages/api/contact.ts so the two endpoints stay shaped alike.
import type { APIContext } from 'astro';
// In Astro v6 + @astrojs/cloudflare v13, runtime env moved from
// Astro.locals.runtime.env to the cloudflare:workers virtual module.
// platformProxy in astro.config.mjs makes this resolvable in dev too.
import { env } from 'cloudflare:workers';
import { z } from 'zod';

export const prerender = false;

const NoLineBreaks = /^[^\r\n]+$/;

const SubscribeSchema = z.object({
  email: z.string().trim().email().max(254).regex(NoLineBreaks),
  source: z.string().regex(/^[a-z0-9-]{1,64}$/),
  handle: z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,32}$/)
    .optional()
    .or(z.literal(''))
    .default(''),
  consent: z.literal('true'),
  website: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

interface Env {
  // Reuse the same publishable Supabase URL+anon key the games and the
  // /mission/games/ leaderboard panel already use. Anon insert is
  // allowed by the subscribers_public_insert RLS policy.
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append('remoteip', remoteIp);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

interface SupabaseInsertResult {
  ok: boolean;
  alreadyExists: boolean;
  error?: string;
}

async function insertSubscriber(
  env: Env,
  row: { email: string; source: string; handle: string | null },
): Promise<SupabaseInsertResult> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/subscribers`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      // Don't ask for the row back; reduces payload + avoids needing select RLS.
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });

  if (res.ok) return { ok: true, alreadyExists: false };

  // Postgres errors come back as JSON with a `code` field. 23505 is unique_violation
  // and means this email is already subscribed — treat as success, skip the welcome.
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body = (await res.json()) as { code?: string; message?: string };
    code = body.code;
    message = body.message;
  } catch {
    // ignore
  }
  if (code === '23505') return { ok: true, alreadyExists: true };
  return { ok: false, alreadyExists: false, error: message ?? `Supabase ${res.status}` };
}

async function sendWelcomeEmail(env: Env, email: string): Promise<boolean> {
  const subject = `Welcome to BioKEA lab updates`;
  const text = [
    `Thanks for subscribing.`,
    ``,
    `What you'll get from us, and only this:`,
    `  · new game drops on biokea.ai/mission/games/`,
    `  · papers, datasets, and lab milestones we want to share`,
    `  · the Golden Sample Hunt and any future challenges`,
    ``,
    `That's it. No spam, no shared lists, no third-party tracking.`,
    `Unsubscribe any time by replying to this email with "unsubscribe",`,
    `or write to contact@biokea.ai.`,
    ``,
    `— The BioKEA team`,
    `https://biokea.ai/`,
  ].join('\n');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: email,
      subject,
      text,
    }),
  });
  return res.ok;
}

export async function handleSubscribe(
  request: Request,
  env: Env,
  remoteIp?: string,
): Promise<Response> {
  const fields: Record<string, string> = {};
  const contentType = request.headers.get('content-type') ?? '';
  try {
    if (contentType.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [k, v] of Object.entries(body)) fields[k] = typeof v === 'string' ? v : String(v);
    } else {
      const form = await request.formData();
      for (const [k, v] of form.entries()) fields[k] = typeof v === 'string' ? v : '';
    }
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const parsed = SubscribeSchema.safeParse(fields);
  if (!parsed.success) {
    return json({ ok: false, error: 'Please enter a valid email and confirm consent.' }, 400);
  }

  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: false, error: 'Invalid submission' }, 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const token = parsed.data['cf-turnstile-response'];
    if (!token) {
      return json({ ok: false, error: 'Captcha missing. Please reload and try again.' }, 400);
    }
    const ok = await verifyTurnstile(token, env.TURNSTILE_SECRET_KEY, remoteIp);
    if (!ok) {
      return json({ ok: false, error: 'Captcha failed. Please reload and try again.' }, 400);
    }
  }

  const { email, source, handle } = parsed.data;
  const result = await insertSubscriber(env, {
    email,
    source,
    handle: handle && handle.length > 0 ? handle : null,
  });

  if (!result.ok) {
    return json({ ok: false, error: 'Unable to save right now. Please try again shortly.' }, 502);
  }

  // Don't re-send the welcome email if they were already subscribed.
  if (!result.alreadyExists) {
    // Fire-and-forget; if Resend is briefly down we still tell the user
    // success so they don't double-submit. They can email us if it never lands.
    void sendWelcomeEmail(env, email);
  }

  return json({ ok: true, alreadySubscribed: result.alreadyExists }, 200);
}

export async function POST({ request, clientAddress }: APIContext): Promise<Response> {
  const e = env as unknown as Env;
  if (!e?.RESEND_API_KEY || !e.SUPABASE_URL || !e.SUPABASE_PUBLISHABLE_KEY) {
    return json({ ok: false, error: 'Subscribe form is not configured.' }, 500);
  }
  return handleSubscribe(request, e, clientAddress);
}
