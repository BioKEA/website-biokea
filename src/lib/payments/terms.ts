//
// Money rules for the pay-in-full / balance flow. Everything here is pure so
// the payment endpoint, the balance endpoint, the admin preview, and the
// customer panel all agree to the cent. Spec §5.5.
import {
  buildQuote,
  type Audience,
  type QuoteLine,
  type QuoteLineInput,
} from '@/lib/pricing/quote';
import type { InvoiceLineSpec, PaymentRecord, QuoteRecord } from './types';

export const INVOICE_DAYS_UNTIL_DUE = 30;
/** How long an under-shipping credit stays redeemable. Spec §4.3. */
export const CREDIT_MONTHS = 12;

export function usdCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const plural = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}s`;
const markerNote = (markers: number) => (markers > 1 ? ` × ${markers} markers` : '');

/** One description for both the payment invoice and the balance invoice —
 * they bill the same thing at the same rate, so they read the same. Never
 * used for a held (rate-locked) line — see heldLineDescription for why
 * that needs different math, not just a suffix. */
function lineDescription(l: QuoteLine, audience: Audience, rate: number): string {
  return (
    `${l.serviceTitle} — ${plural(l.count, l.unitLabel)}${markerNote(l.markers)}` +
    ` @ $${rate}/${l.unitLabel}, ${audience} rate`
  );
}

/**
 * The held-line description, used only when the rate lock (spec §4.2)
 * actually reduced the bill below the engine's own price for the actual
 * count.
 *
 * `count × rate` is NOT this line's amount when the *quoted* line was
 * itself a dead-zone buy-up (e.g. 250 specimens priced as a 300-slot
 * block): the cap subtracts the shortfall from the quoted BLOCK total,
 * not from `actual count × rate`, so a description built the same way as
 * the non-held one would silently misstate the money. This one names the
 * quoted block and the shortfall explicitly so the reader can reconcile
 * quotedTotal − shortfall × lockedRate themselves.
 */
function heldLineDescription(
  l: QuoteLine,
  quoted: QuoteLine,
  audience: Audience,
  lockedRate: number,
  shortfall: number,
): string {
  const quotedTotal = Math.round(quoted[audience].total).toLocaleString('en-US');
  return (
    `${l.serviceTitle} — quoted ${plural(quoted.count, l.unitLabel)}` +
    ` ($${quotedTotal} at the ${quoted[audience].tierRange} rate);` +
    ` ${plural(l.count, l.unitLabel)} received${markerNote(l.markers)},` +
    ` ${shortfall.toLocaleString('en-US')} short credited at $${lockedRate}/${l.unitLabel},` +
    ` ${audience} rate (quoted rate held)`
  );
}

/** The up-front invoice: 100% of the quote. Spec §4.1. One line per quote
 * line, each rounded independently, so the invoice's lines add up to its
 * total exactly. */
export function paymentLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[] {
  return lines.map((l) => {
    const p = l[audience];
    return {
      description: lineDescription(l, audience, p.effectiveRate),
      amountCents: Math.round(p.total * 100),
    };
  });
}

export function paymentTotalCents(lines: InvoiceLineSpec[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

/** Refuse to invoice an amount that isn't this quote's total — a guard
 * against a future pricing change silently producing nonsense invoices. */
export function assertPaymentSane(
  totalDollars: number,
  amountCents: number,
  lineCount: number,
): void {
  if (amountCents < 100) throw new Error(`Refusing payment under $1 (${amountCents} cents)`);
  const expected = totalDollars * 100;
  if (Math.abs(amountCents - expected) > lineCount) {
    throw new Error(`Payment ${amountCents} cents is not the ${totalDollars} dollar total`);
  }
}

export interface DepositCredit {
  amountCents: number; // the PAID payment row's amount — never recomputed
  invoiceLabel: string; // human label for the memo (order name or draft id)
  paidAt: string; // ISO
}

/**
 * Settles actual counts against the quoted lines. Spec §4.2 — the rate lock.
 *
 * The engine alone can't produce a bill for under-shipping: its best price
 * is non-decreasing in count, so a smaller actual count always reprices at
 * or below the quote, silently shrinking the customer's credit down to
 * whatever tier the smaller count lands in. The cap below holds the
 * customer to the rate they locked at quote time instead.
 */
export function computeBalance(
  inputs: QuoteLineInput[],
  audience: Audience,
  deposit: DepositCredit,
  quotedLines: QuoteLine[],
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  credit: { title: string; amountCents: number };
  actualLines: QuoteLine[];
  uncapped: string[];
} {
  const actual = buildQuote(inputs); // throws on bad input, same as /api/quote
  const uncapped: string[] = [];

  const lines: InvoiceLineSpec[] = actual.lines.map((l) => {
    const p = l[audience];
    const engineCents = Math.round(p.total * 100);
    // Matched on markers too: a different marker count is a different rate,
    // so there is nothing honest to hold it to.
    const quoted = quotedLines.find(
      (q) => q.serviceSlug === l.serviceSlug && q.markers === l.markers,
    );
    if (!quoted) {
      uncapped.push(l.serviceSlug);
      return {
        description: lineDescription(l, audience, p.effectiveRate),
        amountCents: engineCents,
      };
    }

    const lockedRate = quoted[audience].effectiveRate;
    // Against `count`, NEVER `pricedCount`: inside a dead zone the engine
    // buys up to the next tier floor and the extra units are advertised as
    // free headroom, so measuring against pricedCount would credit a
    // customer who shipped exactly what they quoted.
    const shortfall = Math.max(0, quoted.count - l.count);
    // Skipped when nothing is short, because over-shipping must be allowed
    // to RAISE the total — clamping there would sell 1,100 at the 800 price.
    const capCents =
      shortfall > 0
        ? Math.round(quoted[audience].total * 100) - Math.round(shortfall * lockedRate * 100)
        : engineCents;

    const held = capCents < engineCents;
    const amountCents = held ? capCents : engineCents;
    return {
      description: held
        ? heldLineDescription(l, quoted, audience, lockedRate, shortfall)
        : lineDescription(l, audience, p.effectiveRate),
      amountCents,
    };
  });

  const actualTotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  return {
    actualTotalCents,
    balanceCents: actualTotalCents - deposit.amountCents,
    lines,
    // `invoiceLabel` already carries any "invoice"/"order" prefix the
    // caller wants in the memo (see the payment/balance endpoints).
    credit: {
      title: `Payment received (${deposit.invoiceLabel}, paid ${deposit.paidAt.slice(0, 10)})`,
      amountCents: deposit.amountCents,
    },
    actualLines: actual.lines,
    uncapped,
  };
}

/** The credit a settled, negative balance row represents. That row is the
 * whole credit ledger — there is no separate table. Spec §4.3. */
export function creditFrom(p: PaymentRecord): { amountCents: number; expiresAt: string } | null {
  if (p.kind !== 'balance' || p.status !== 'settled' || p.amount_cents >= 0) return null;
  const expires = new Date(p.created_at);
  expires.setUTCMonth(expires.getUTCMonth() + CREDIT_MONTHS);
  return { amountCents: -p.amount_cents, expiresAt: expires.toISOString() };
}

/**
 * Did this payment cover the whole quote?
 *
 * `quote_payments.kind` is frozen at 'deposit' (spec §6.3), so a new
 * pay-in-full payment and a legacy 50% deposit are the same row shape and
 * the amount alone cannot tell them apart. Comparing against the quote's
 * own total can.
 *
 * Returns null when the quote records no audience — a pre-configurator row
 * has no rate to price against, so the honest answer is "cannot confirm",
 * and every caller must fall back to wording that is true either way.
 *
 * This is the single definition; panelView, the admin page, the payment
 * emails and the balance endpoint all read it from here, because four
 * copies of one comparison is four chances to drift.
 */
export function paidInFull(quote: QuoteRecord, payment: PaymentRecord): boolean | null {
  if (!quote.audience) return null;
  return payment.amount_cents >= paymentTotalCents(paymentLines(quote.lines, quote.audience));
}
