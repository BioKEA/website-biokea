// Minimal Resend sender behind a function type so handlers can be tested
// with memorySender(). Failures are logged for observability but never thrown:
// every caller has already committed the thing the email is about (same stance
// as api/contact.ts and api/subscribe.ts).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}
export type EmailSender = (msg: EmailMessage) => Promise<void>;

/**
 * Sends through Resend. By default a failure is logged and swallowed, so a
 * notification can never fail the request that triggered it. `strict`
 * rethrows instead, for callers that must tell staff the email did not go
 * out (the admin finalise endpoint).
 */
export function resendSender(
  env: {
    RESEND_API_KEY: string;
    CONTACT_FROM_EMAIL: string;
  },
  opts: { strict?: boolean } = {},
): EmailSender {
  return async (msg) => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
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
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(
          '[email] Resend ' +
            res.status +
            ' sending "' +
            msg.subject +
            '" to ' +
            msg.to +
            ': ' +
            body,
        );
        if (opts.strict) throw new Error(`Resend ${res.status}`);
      }
    } catch (err) {
      console.error(
        '[email] Resend request failed sending "' + msg.subject + '" to ' + msg.to + ':',
        err,
      );
      if (opts.strict) throw err;
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
