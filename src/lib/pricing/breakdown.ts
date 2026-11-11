// src/lib/pricing/breakdown.ts
//
// How a multi-marker line's money reads: units × the tier's per-unit rate,
// plus a charge per unit for each marker after the first. The engine prices
// the two together (effectiveRate), which is right for finding the best
// tier but reads as one blended rate; every surface that shows or bills a
// line uses this split instead, so the widget, the quote page, the emails
// and the Shopify invoice all show the same arithmetic.
import type { Audience, QuoteLine } from './quote';

export interface LineBreakdown {
  /** Units billed: the priced count, which a dead-zone buy-up can raise. */
  units: number;
  baseRate: number;
  baseTotal: number;
  extraMarkers: number;
  /** Per unit, per added marker. Can carry cents (barcoding fractions). */
  markerRate: number;
  /** Whatever the line total leaves after the base, so the parts always sum. */
  markerTotal: number;
}

export function lineBreakdown(l: QuoteLine, audience: Audience): LineBreakdown | null {
  const p = l[audience];
  if (l.markers <= 1 || p.baseRate === undefined) return null;
  const extraMarkers = l.markers - 1;
  const baseTotal = Math.round(p.pricedCount * p.baseRate);
  return {
    units: p.pricedCount,
    baseRate: p.baseRate,
    baseTotal,
    extraMarkers,
    markerRate: Math.round(((p.effectiveRate - p.baseRate) / extraMarkers) * 100) / 100,
    markerTotal: p.total - baseTotal,
  };
}

/** $1,234 for whole dollars, $3.75 otherwise. */
export const money = (n: number): string =>
  '$' +
  (Number.isInteger(n)
    ? n.toLocaleString('en-US')
    : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const plural = (n: number, unit: string): string =>
  `${n.toLocaleString('en-US')} ${unit}${n === 1 ? '' : 's'}`;

/** "60 samples × $160 = $9,600" */
export const baseText = (b: LineBreakdown, unit: string): string =>
  `${plural(b.units, unit)} × ${money(b.baseRate)} = ${money(b.baseTotal)}`;

/** "1 added marker × 60 samples × $15 = $900" (or without the " = $900"
 * where the amount sits in its own column). */
export const markerText = (b: LineBreakdown, unit: string, withTotal = true): string =>
  `${plural(b.extraMarkers, 'added marker')} × ${plural(b.units, unit)} × ${money(b.markerRate)}` +
  (withTotal ? ` = ${money(b.markerTotal)}` : '');
