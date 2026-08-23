// src/lib/payments/panel.ts
// Pure mapping from (quote row, payment rows) to what the customer's quote
// page shows. Kept out of the .astro file so it can be unit-tested and so
// the page stays a template. Spec §4.
import { creditFrom, paymentLines, paymentTotalCents } from './terms';
import type { Audience } from '@/lib/pricing/quote';
import type { PaymentKind, PaymentRecord, QuoteRecord } from './types';

export type PanelView =
  | { kind: 'none' }
  | {
      kind: 'offer';
      audience: Audience | null;
      needsAttestation: boolean;
      amountAcademicCents: number;
      amountCommercialCents: number;
    }
  | {
      kind: 'invoiced';
      phase: PaymentKind;
      amountCents: number;
      dueAt: string | null;
      hostedUrl: string | null;
      pdfUrl: string | null;
    }
  | { kind: 'deposit_paid'; amountCents: number; paidAt: string; pdfUrl: string | null }
  | {
      kind: 'paid';
      depositPdf: string | null;
      balancePdf: string | null;
      creditCents: number | null;
      creditExpiresAt: string | null;
    };

const LIVE = new Set(['open', 'paid', 'settled']);
const live = (payments: PaymentRecord[], kind: PaymentKind) =>
  payments.find((p) => p.kind === kind && LIVE.has(p.status)) ?? null;

export function panelView(quote: QuoteRecord, payments: PaymentRecord[], now: Date): PanelView {
  const deposit = live(payments, 'deposit');
  const balance = live(payments, 'balance');

  switch (quote.status) {
    case 'quoted': {
      const expired = Date.parse(quote.expires_at) < now.getTime();
      if (quote.needs_conversation || expired) return { kind: 'none' };
      return {
        kind: 'offer',
        audience: quote.audience,
        needsAttestation: quote.audience === 'academic' && quote.academic_attested_at === null,
        amountAcademicCents: paymentTotalCents(paymentLines(quote.lines, 'academic')),
        amountCommercialCents: paymentTotalCents(paymentLines(quote.lines, 'commercial')),
      };
    }
    case 'deposit_invoiced':
      if (!deposit) return { kind: 'none' };
      return {
        kind: 'invoiced',
        phase: 'deposit',
        amountCents: deposit.amount_cents,
        dueAt: deposit.due_at,
        hostedUrl: deposit.hosted_url,
        pdfUrl: deposit.pdf_url,
      };
    case 'deposit_paid':
      if (!deposit || !deposit.paid_at) return { kind: 'none' };
      return {
        kind: 'deposit_paid',
        amountCents: deposit.amount_cents,
        paidAt: deposit.paid_at,
        pdfUrl: deposit.pdf_url,
      };
    case 'balance_invoiced':
      if (!balance) return { kind: 'none' };
      return {
        kind: 'invoiced',
        phase: 'balance',
        amountCents: balance.amount_cents,
        dueAt: balance.due_at,
        hostedUrl: balance.hosted_url,
        pdfUrl: balance.pdf_url,
      };
    case 'paid': {
      // `live()` deliberately excludes 'settled', so the settled balance row
      // (the credit, if any — spec §4.3) has to be found directly.
      const settled = payments.find((p) => p.kind === 'balance' && p.status === 'settled');
      const credit = settled ? creditFrom(settled) : null;
      return {
        kind: 'paid',
        depositPdf: deposit?.pdf_url ?? null,
        balancePdf: balance?.pdf_url ?? null,
        creditCents: credit?.amountCents ?? null,
        creditExpiresAt: credit?.expiresAt ?? null,
      };
    }
    default:
      // Covers a pre-migration row whose `status` column hasn't been
      // backfilled yet (undefined at runtime despite the type).
      return { kind: 'none' };
  }
}
