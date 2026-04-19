// src/pages/api/contact.ts
import type { APIContext } from 'astro';
import { z } from 'zod';

export const prerender = false;

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  organization: z.string().trim().max(200).optional().default(''),
  topic: z.enum([
    'Partnership / collaboration',
    'Capabilities / lab work',
    'Funding',
    'Agentis — early access',
    'Something else',
  ]),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
});

interface Env {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  CONTACT_TO_EMAIL: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function handleContact(request: Request, env: Env): Promise<Response> {
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

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const env = (locals as { runtime?: { env?: Env } }).runtime?.env;
  if (!env?.RESEND_API_KEY) {
    return json({ ok: false, error: 'Contact form is not configured.' }, 500);
  }
  return handleContact(request, env);
}
