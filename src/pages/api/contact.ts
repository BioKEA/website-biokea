// src/pages/api/contact.ts
import type { APIContext } from 'astro';
import { z } from 'zod';

export const prerender = false;

// Reject control/CR/LF anywhere in single-line fields that reach email
// headers (Subject, Reply-To). Defense-in-depth against header-injection
// even though Resend's JSON API encodes before SMTP.
const NoLineBreaks = /^[^\r\n]+$/;

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NoLineBreaks),
  email: z.string().trim().email(),
  organization: z
    .string()
    .trim()
    .max(200)
    .regex(NoLineBreaks)
    .optional()
    .or(z.literal(''))
    .default(''),
  topic: z.enum([
    'Partnership / collaboration',
    'Capabilities / lab work',
    'Funding',
    'Agentis — early access',
    'Something else',
  ]),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  CONTACT_TO_EMAIL: string;
  // Optional: when set, the endpoint requires a valid Cloudflare Turnstile
  // token before accepting submissions. Local dev can omit both.
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

export async function handleContact(
  request: Request,
  env: Env,
  remoteIp?: string,
): Promise<Response> {
  const fields: Record<string, string> = {};
  try {
    const form = await request.formData();
    for (const [k, v] of form.entries()) fields[k] = typeof v === 'string' ? v : '';
  } catch {
    return json({ ok: false, error: 'Invalid form payload' }, 400);
  }

  const parsed = ContactSchema.safeParse(fields);
  if (!parsed.success) {
    return json({ ok: false, error: 'Please fill in all required fields with valid values.' }, 400);
  }

  // Honeypot — real users never fill this.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: false, error: 'Invalid submission' }, 400);
  }

  // Optional Turnstile challenge. If no secret is configured, skip verification
  // (keeps local dev + initial prod friction-free until a site key is issued).
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

  const { name, email, organization, topic, message } = parsed.data;

  const subject = `[biokea.ai] ${topic} — ${name}`;
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${organization || '—'}`,
    `Topic: ${topic}`,
    '',
    message,
  ].join('\n');

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: email,
      subject,
      text,
    }),
  });

  if (!resendRes.ok) {
    return json(
      { ok: false, error: 'Unable to deliver right now. Please email contact@biokea.ai.' },
      502,
    );
  }

  return json({ ok: true }, 200);
}

export async function POST({ request, locals, clientAddress }: APIContext): Promise<Response> {
  const env = (locals as { runtime?: { env?: Env } }).runtime?.env;
  if (!env?.RESEND_API_KEY) {
    return json({ ok: false, error: 'Contact form is not configured.' }, 500);
  }
  return handleContact(request, env, clientAddress);
}
