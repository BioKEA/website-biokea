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

export interface MarkerPart {
  /** The marker's name, or "Marker 1" / "Added marker 2" on lines saved
   * without names. */
  name: string;
  /** True for the first marker, which the tier rate covers. */
  tierRate: boolean;
  units: number;
  rate: number;
  total: number;
}

/** One part per marker: the first at the tier rate, each added one at the
 * marker rate. The last part takes any rounding cents so the parts sum to
 * the line total exactly. */
export function markerParts(l: QuoteLine, audience: Audience): MarkerPart[] | null {
  const b = lineBreakdown(l, audience);
  if (!b) return null;
  const names = l.markerNames?.length === l.markers ? l.markerNames : null;
  const parts: MarkerPart[] = [
    {
      name: names?.[0] ?? 'Marker 1',
      tierRate: true,
      units: b.units,
      rate: b.baseRate,
      total: b.baseTotal,
    },
  ];
  let left = b.markerTotal;
  for (let i = 1; i <= b.extraMarkers; i++) {
    const total = i === b.extraMarkers ? left : Math.round(b.units * b.markerRate);
    left -= total;
    parts.push({
      name: names?.[i] ?? `Added marker ${i + 1}`,
      tierRate: false,
      units: b.units,
      rate: b.markerRate,
      total,
    });
  }
  return parts;
}

/** "COI — 60 samples × $160 (tier rate)" — the amount goes alongside. */
export const markerPartText = (m: MarkerPart, unit: string): string =>
  `${m.name} — ${plural(m.units, unit)} × ${money(m.rate)} (${m.tierRate ? 'tier rate' : 'added marker'})`;
