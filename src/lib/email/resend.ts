// Minimal Resend sender behind a function type so handlers can be tested
// with memorySender(). Failures are swallowed on purpose: every caller has
// already committed the thing the email is about (same stance as
// api/contact.ts and api/subscribe.ts).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}
export type EmailSender = (msg: EmailMessage) => Promise<void>;

export function resendSender(env: {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
}): EmailSender {
  return async (msg) => {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `BioKEA <${env.CONTACT_FROM_EMAIL}>`,
          to: msg.to,
          reply_to: msg.replyTo ?? 'contact@biokea.ai',
          subject: msg.subject,
          text: msg.text,
        }),
      });
    } catch {
      // ignore — see header comment
    }
  };
}

export function memorySender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  const fn = (async (msg: EmailMessage) => {
    sent.push(msg);
  }) as EmailSender & { sent: EmailMessage[] };
  fn.sent = sent;
  return fn;
}
