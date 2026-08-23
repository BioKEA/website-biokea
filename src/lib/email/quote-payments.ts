// The notifications the Shopify webhook (and the admin balance endpoint)
// send. Pure builders — the caller decides when; these decide what. Spec
// §5.6, §7.3.
import type { EmailMessage } from './resend';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';
import { creditFrom, paymentLines, paymentTotalCents, usdCents } from '@/lib/payments/terms';

export const SITE_URL = 'https://biokea.ai';

const who = (q: QuoteRecord) => q.organization ?? q.name;
const date = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');
const quoteUrl = (q: QuoteRecord) => `${SITE_URL}/quote/${q.access_token}`;
const adminUrl = (q: QuoteRecord) => `${SITE_URL}/admin/quotes/${q.quote_number}`;

function lineSummary(q: QuoteRecord): string {
  return q.lines
    .map((l) => {
      const markers = l.markers > 1 ? ` × ${l.markers} markers` : '';
      return `  · ${l.serviceTitle}: ${l.count.toLocaleString('en-US')} ${l.unitLabel}s${markers}`;
    })
    .join('\n');
}

function actualCountsSummary(
  actual_lines: { serviceSlug: string; count: number; markers?: number }[],
): string {
  return actual_lines
    .map((l) => {
      const markers = (l.markers ?? 1) > 1 ? ` × ${l.markers} markers` : '';
      return `  · ${l.serviceSlug}: ${l.count.toLocaleString('en-US')}${markers}`;
    })
    .join('\n');
}

function labBody(q: QuoteRecord, p: PaymentRecord, headline: string): string {
  const hasActualLines =
    p.kind === 'balance' && p.actual_lines && p.actual_lines.length > 0 ? p.actual_lines : null;
  const quotedLabel = hasActualLines ? 'Quoted:' : '';

  const lines = [
    headline,
    ``,
    `Customer: ${q.name} <${q.email}>`,
    `Organization: ${q.organization ?? '—'}`,
    `Rate: ${q.audience ?? '—'}`,
    `PO number: ${q.po_number ?? '—'}`,
    ``,
    quotedLabel,
    lineSummary(q),
  ];

  if (hasActualLines) {
    lines.push('', `Actual counts (invoiced):`, actualCountsSummary(hasActualLines));
  }

  lines.push(
    ``,
    `Amount: ${usdCents(p.amount_cents)} · paid ${date(p.paid_at)}`,
    p.pdf_url ? `Invoice PDF: ${p.pdf_url}` : '',
    ``,
    `Admin: ${adminUrl(q)}`,
  );

  return lines.filter((l) => l !== '').join('\n');
}

/**
 * Whether `p` (kind:'deposit') actually covers the whole quote. That kind
 * is frozen for both a new pay-in-full quote and a legacy 50% deposit still
 * awaiting a balance invoice, so the amount alone can't tell them apart.
 * Same rule as panelView() (src/lib/payments/panel.ts:80-82) and the admin
 * detail page's qualifier. null when quote.audience is unset (legacy,
 * pre-configurator quote) — there is then no rate to compare against, so
 * callers must fall back to neutral, true-under-both wording rather than
 * assert "paid in full".
 */
function paidInFull(q: QuoteRecord, p: PaymentRecord): boolean | null {
  return q.audience ? p.amount_cents >= paymentTotalCents(paymentLines(q.lines, q.audience)) : null;
}

export function paymentReceivedCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  const full = paidInFull(q, p) === true;
  const body = full
    ? [
        `Thanks — quote ${q.quote_number} is paid in full (${usdCents(p.amount_cents)}).`,
        ``,
        `What happens next: the lab will email you shipping instructions and your`,
        `sample manifest within 2 business days. Once your samples arrive and pass`,
        `QC, we start sequencing.`,
        ``,
        `Your quoted per-sample rate is held for this project. If fewer samples`,
        `arrive than you quoted, the unused amount stays as credit toward another project for 12 months;`,
        `if more arrive, we invoice the difference at the same rate.`,
      ]
    : [
        `Thanks — we've received your payment of ${usdCents(p.amount_cents)} toward quote ${q.quote_number}.`,
        ``,
        `What happens next: the lab will email you shipping instructions and your`,
        `sample manifest within 2 business days. Once your samples arrive and pass`,
        `QC, we start sequencing.`,
        ``,
        `Any remaining balance on this quote is invoiced once your results are`,
        `delivered and the final counts are confirmed.`,
      ];
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Payment received — BioKEA quote ${q.quote_number}`,
    text: [
      ...body,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.pdf_url ? `Receipt / invoice PDF: ${p.pdf_url}` : '',
      `Full terms: ${SITE_URL}/terms`,
      ``,
      `Questions? Just reply to this email.`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}

export function paymentReceivedLabEmail(
  q: QuoteRecord,
  p: PaymentRecord,
  labTo: string,
): EmailMessage {
  const full = paidInFull(q, p) === true;
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[paid] ${q.quote_number} · ${who(q)} · ${usdCents(p.amount_cents)}`,
    text: labBody(
      q,
      p,
      full
        ? `Paid in full on ${q.quote_number} — send shipping instructions + manifest.`
        : `Payment received on ${q.quote_number} (${usdCents(p.amount_cents)}) — balance may still be owed; send shipping instructions + manifest.`,
    ),
  };
}

/** The under-shipping close-out. Sent instead of a balance invoice when the
 * actual counts came in at or under what was paid for. Spec §4.3 — we issue
 * credit, not a refund, so this email is the customer's only record of it. */
export function projectSettledWithCreditEmail(
  q: QuoteRecord,
  p: PaymentRecord,
): EmailMessage | null {
  const credit = creditFrom(p);
  if (!credit) return null;
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Project settled — ${usdCents(credit.amountCents)} credit on BioKEA ${q.quote_number}`,
    text: [
      `Your project on quote ${q.quote_number} is complete and settled.`,
      ``,
      `Fewer samples arrived than the quote covered, so the unused amount is`,
      `held as credit:`,
      ``,
      `  Credit: ${usdCents(credit.amountCents)}`,
      `  Valid until: ${credit.expiresAt.slice(0, 10)}`,
      ``,
      `To use it, reply to this email or mention quote ${q.quote_number} when you`,
      `next configure a project, and we'll apply it to that invoice.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      `Full terms: ${SITE_URL}/terms`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ].join('\n'),
  };
}

export function balancePaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Paid in full — BioKEA quote ${q.quote_number}`,
    text: [
      `Thanks — your balance of ${usdCents(p.amount_cents)} for quote ${q.quote_number} is paid, and the project is settled in full.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.pdf_url ? `Invoice PDF: ${p.pdf_url}` : '',
      ``,
      `Thank you for working with BioKEA.`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}

export function balancePaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage {
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[paid in full] ${q.quote_number} · ${who(q)} · ${usdCents(p.amount_cents)}`,
    text: labBody(q, p, `Balance paid on ${q.quote_number} — project settled.`),
  };
}

// Shopify's refunds/create webhook: no status change (staff act in Shopify),
// just a heads-up to the lab inbox. Spec §4.4.
export function refundLabEmail(
  q: QuoteRecord,
  p: PaymentRecord,
  orderRef: string,
  labTo: string,
): EmailMessage {
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[refund] ${q.quote_number} · ${who(q)} · order ${orderRef}`,
    text: [
      `A refund was recorded in Shopify on order ${orderRef} for quote ${q.quote_number}.`,
      `No status change was made; review in Shopify admin.`,
      ``,
      `Amount on file: ${usdCents(p.amount_cents)}`,
      `Admin: ${adminUrl(q)}`,
    ].join('\n'),
  };
}
