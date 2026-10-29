// src/lib/email/quote-finalised.ts
//
// "Your quote is ready": sent when the lab firms up a consult quote from
// /admin (spec 3), and again with "updated" wording when it revises one.
import type { EmailMessage } from './resend';
import type { QuoteRecord } from '@/lib/payments/types';
import { SITE_URL } from './quote-payments';

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const plural = (n: number, unit: string) =>
  `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

export function firmQuoteReadyEmail(q: QuoteRecord, revised: boolean): EmailMessage {
  const a = q.audience;
  const amount = (l: QuoteRecord['lines'][number]) =>
    a
      ? usd(l[a].total)
      : `${usd(l.academic.total)} academic / ${usd(l.commercial.total)} commercial`;
  const lines = q.lines.map((l) => {
    const markers = l.markers > 1 ? ` × ${l.markers} markers` : '';
    return `  · ${l.serviceTitle}: ${plural(l.count, l.unitLabel)}${markers} — ${amount(l)}`;
  });
  const total = a
    ? `Total (${a} rate): ${usd(a === 'academic' ? q.total_academic : q.total_commercial)}`
    : `Total: ${usd(q.total_academic)} academic / ${usd(q.total_commercial)} commercial`;

  const text = [
    revised
      ? `We've updated your BioKEA quote ${q.quote_number}. The firm price is below.`
      : `Thanks for waiting — your BioKEA quote ${q.quote_number} is ready, with a firm price.`,
    ``,
    ...lines,
    total,
    ...(q.lab_note ? [``, `A note from the lab:`, q.lab_note] : []),
    ``,
    `The quote is valid until ${q.expires_at.slice(0, 10)}. You can pay online or request`,
    `an invoice with net-30 terms from the quote page:`,
    `${SITE_URL}/quote/${q.access_token}`,
    ``,
    `Questions? Just reply to this email.`,
    ``,
    `— The BioKEA team`,
    `${SITE_URL}/`,
  ].join('\n');

  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: revised
      ? `Your BioKEA quote ${q.quote_number} has been updated`
      : `Your BioKEA quote ${q.quote_number} is ready`,
    text,
  };
}
