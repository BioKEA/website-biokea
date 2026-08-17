// The four notifications the Stripe webhook sends. Pure builders — the
// webhook handler decides when; these decide what. Spec §5.6.
import type { EmailMessage } from './resend';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';
import { usdCents } from '@/lib/payments/terms';

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

export function depositPaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Deposit received — BioKEA quote ${q.quote_number}`,
    text: [
      `Thanks — we've received your deposit of ${usdCents(p.amount_cents)} toward quote ${q.quote_number}.`,
      ``,
      `What happens next: the lab will email you shipping instructions and your sample`,
      `manifest within 2 business days. Once your samples arrive and pass QC, we start`,
      `sequencing; the balance is invoiced on the actual counts when results are delivered.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.pdf_url ? `Receipt / invoice PDF: ${p.pdf_url}` : '',
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

export function depositPaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage {
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[deposit paid] ${q.quote_number} · ${who(q)} · ${usdCents(p.amount_cents)}`,
    text: labBody(
      q,
      p,
      `Deposit paid on ${q.quote_number} — send shipping instructions + manifest.`,
    ),
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
