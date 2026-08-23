//
// quotes.status keeps its original values because renaming them means a
// data migration on live rows for no customer benefit (spec §6.3). The
// up-front payment is 100% now, so 'deposit_paid' means "paid in full,
// awaiting samples" — staff read these labels, never the raw values.
import type { QuoteStatus } from './types';

const LABELS: Record<QuoteStatus, string> = {
  quoted: 'Quoted',
  deposit_invoiced: 'Invoiced — awaiting payment',
  deposit_paid: 'Paid — awaiting samples',
  balance_invoiced: 'Additional samples invoiced',
  paid: 'Settled',
};

export function statusLabel(s: QuoteStatus): string {
  return LABELS[s] ?? s;
}
