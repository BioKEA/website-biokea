//
// Money rules for the deposit / balance flow. Everything here is pure so
// the deposit endpoint, the balance endpoint, the admin preview, and the
// customer panel all agree to the cent. Spec §5.5.
import {
  buildQuote,
  type Audience,
  type QuoteLine,
  type QuoteLineInput,
} from '@/lib/pricing/quote';
import type { InvoiceLineSpec } from './types';

export const DEPOSIT_FRACTION = 0.5;
export const INVOICE_DAYS_UNTIL_DUE = 30;

export function usdCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const pct = `${Math.round(DEPOSIT_FRACTION * 100)}%`;
const plural = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}s`;
const markerNote = (markers: number) => (markers > 1 ? ` × ${markers} markers` : '');

// One invoice line per quote line, each rounded independently. The
// invoice's lines therefore add up to its total exactly; the drift from
// "half the quote total" is at most one cent per line (see assertDepositSane).
export function depositLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[] {
  return lines.map((l) => {
    const p = l[audience];
    return {
      description:
        `${l.serviceTitle} — ${pct} deposit on ${plural(l.count, l.unitLabel)}${markerNote(l.markers)} (est.)` +
        ` @ $${p.effectiveRate}/${l.unitLabel}, ${audience} rate`,
      amountCents: Math.round(p.total * 100 * DEPOSIT_FRACTION),
    };
  });
}

export function depositTotalCents(lines: InvoiceLineSpec[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

// Refuse to create an invoice whose amount doesn't look like a deposit on
// this quote — a guard against a future pricing-engine change silently
// producing nonsense invoices.
export function assertDepositSane(
  totalDollars: number,
  depositCents: number,
  lineCount: number,
): void {
  if (depositCents < 100) throw new Error(`Refusing deposit under $1 (${depositCents} cents)`);
  const expected = totalDollars * 100 * DEPOSIT_FRACTION;
  if (Math.abs(depositCents - expected) > lineCount) {
    throw new Error(`Deposit ${depositCents} cents is not ${pct} of ${totalDollars} dollars`);
  }
}

export interface DepositCredit {
  amountCents: number; // the PAID deposit row's amount — never recomputed
  invoiceLabel: string; // Stripe invoice number for the memo line
  paidAt: string; // ISO
}

export function computeBalance(
  inputs: QuoteLineInput[],
  audience: Audience,
  deposit: DepositCredit,
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  actualLines: QuoteLine[];
} {
  const actual = buildQuote(inputs); // throws on bad input, same as /api/quote
  const lines: InvoiceLineSpec[] = actual.lines.map((l) => {
    const p = l[audience];
    return {
      description:
        `${l.serviceTitle} — ${plural(l.count, l.unitLabel)}${markerNote(l.markers)}` +
        ` @ $${p.effectiveRate}/${l.unitLabel}, ${audience} rate`,
      amountCents: p.total * 100,
    };
  });
  const actualTotalCents = actual.total[audience] * 100;
  lines.push({
    description: `Less deposit received (invoice ${deposit.invoiceLabel}, paid ${deposit.paidAt.slice(0, 10)})`,
    amountCents: -deposit.amountCents,
  });
  return {
    actualTotalCents,
    balanceCents: actualTotalCents - deposit.amountCents,
    lines,
    actualLines: actual.lines,
  };
}
