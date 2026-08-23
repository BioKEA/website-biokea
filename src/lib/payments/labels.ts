//
// quotes.status keeps its original values because renaming them means a
// data migration on live rows for no customer benefit (spec §6.3). Staff
// read these labels, never the raw values.
//
// 'deposit_paid' is NOT always "paid in full": new quotes pay 100% up
// front, but legacy rows that paid a 50% deposit under the old flow sit
// in this same status and still owe a balance. This label map has no
// payment-row data to tell the two apart (the admin list page in
// particular renders quotes without loading their payments), so the
// wording here must stay true under both shapes. The quote detail page,
// which does have the payment rows, adds a precise "paid in full" /
// "balance still owed" qualifier alongside this label — see
// src/pages/admin/quotes/[number].astro.
import type { QuoteStatus } from './types';

const LABELS: Record<QuoteStatus, string> = {
  quoted: 'Quoted',
  deposit_invoiced: 'Invoiced — awaiting payment',
  deposit_paid: 'Payment received — awaiting samples',
  balance_invoiced: 'Additional samples invoiced',
  paid: 'Settled',
};

export function statusLabel(s: QuoteStatus): string {
  return LABELS[s] ?? s;
}
