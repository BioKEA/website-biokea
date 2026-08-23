// src/widget/state.ts
//
// A quote (and the checkout hand-off it can turn into) is only valid for
// the configuration it was priced from. The widget remembers the signature
// of the configuration a quote was created for, so that changing a count, a
// marker, or a service afterwards can retire the stale hand-off rather than
// let the hidden form post the old token at the old amount.
import type { QuoteLineInput } from '@/lib/pricing/quote';

/**
 * A stable, order-sensitive fingerprint of a configuration. `markers` is
 * normalized because an omitted marker count and an explicit 1 describe the
 * same project — the pricing engine treats them identically.
 */
export function configSignature(lines: QuoteLineInput[]): string {
  return JSON.stringify(lines.map((l) => [l.serviceSlug, l.count, l.markers ?? 1]));
}
