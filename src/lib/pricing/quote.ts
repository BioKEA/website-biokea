// src/lib/pricing/quote.ts
//
// Pure pricing engine for /quote. No I/O — imported by both the browser
// (live recalculation) and src/pages/api/quote.ts (authoritative recompute
// before persisting). A client-supplied total is never trusted.
import { pricedServices, type PricedService, type PriceTier } from '@/data/pricing';

export type Audience = 'academic' | 'commercial';

export interface QuoteLineInput {
  serviceSlug: string;
  count: number;
  /** Number of markers. eDNA only; the first is included in the base rate. */
  markers?: number;
}

export interface PriceResult {
  /** What the customer asked for. */
  requestedCount: number;
  /** What the price is based on — larger than requestedCount inside a dead zone. */
  pricedCount: number;
  total: number;
  /** Per-unit rate actually applied, including any marker surcharge. */
  effectiveRate: number;
  /** Display label of the tier whose rate was applied, e.g. "300–999". */
  tierRange: string;
  /** What the customer's own count would have cost at its own tier. */
  literalTotal: number;
  /** True only when buying up to a tier floor genuinely costs less. */
  isBetterThanLiteral: boolean;
  /** Extra units shippable at no additional cost. 0 outside a dead zone. */
  freeHeadroom: number;
  /** literalTotal - total. 0 outside a dead zone. */
  savings: number;
}

export interface QuoteLine {
  serviceSlug: string;
  serviceTitle: string;
  unitLabel: string;
  count: number;
  markers: number;
  academic: PriceResult;
  commercial: PriceResult;
  needsConversation: boolean;
}

export interface Quote {
  lines: QuoteLine[];
  total: { academic: number; commercial: number };
  needsConversation: boolean;
}

function serviceFor(slug: string): PricedService {
  const svc = pricedServices.find((s) => s.slug === slug);
  if (!svc) throw new Error(`Unknown service: ${slug}`);
  return svc;
}

function rateOf(tier: PriceTier, audience: Audience): number {
  return audience === 'academic' ? tier.academicPrice : tier.commercialPrice;
}

/**
 * Cost is linear in count, so markers collapse into a per-unit surcharge.
 * This is what makes whole-line best-pricing a simple min over tiers.
 */
function effectiveRate(svc: PricedService, tier: PriceTier, markers: number, a: Audience): number {
  const base = rateOf(tier, a);
  if (markers <= 1) return base;
  const add = svc.additionalMarkerPrice;
  if (!add) return base;
  return base + (markers - 1) * (a === 'academic' ? add.academic : add.commercial);
}

function tierFor(svc: PricedService, count: number): PriceTier {
  const match = svc.tiers.find(
    (t) => count >= t.minQty && (t.maxQty === undefined || count <= t.maxQty),
  );
  // Tiers are contiguous and the last is open-ended, so a positive count
  // always matches; the fallback keeps TypeScript honest.
  return match ?? svc.tiers[svc.tiers.length - 1];
}

function priceOne(svc: PricedService, count: number, markers: number, a: Audience): PriceResult {
  const literalTier = tierFor(svc, count);
  const literalTotal = count * effectiveRate(svc, literalTier, markers, a);

  // Best price over the WHOLE line: for each tier, what would it cost to
  // buy up to that tier's floor (or stay at count, whichever is larger)?
  let best = { total: literalTotal, pricedCount: count, tier: literalTier };
  for (const tier of svc.tiers) {
    const n = Math.max(count, tier.minQty);
    const total = n * effectiveRate(svc, tier, markers, a);
    if (total < best.total) best = { total, pricedCount: n, tier };
  }

  const savings = literalTotal - best.total;
  return {
    requestedCount: count,
    pricedCount: best.pricedCount,
    total: best.total,
    effectiveRate: effectiveRate(svc, best.tier, markers, a),
    tierRange: best.tier.range,
    literalTotal,
    isBetterThanLiteral: savings > 0,
    freeHeadroom: best.pricedCount - count,
    savings,
  };
}

export function buildQuote(inputs: QuoteLineInput[]): Quote {
  const lines: QuoteLine[] = inputs.map((input) => {
    const svc = serviceFor(input.serviceSlug);
    const { count } = input;
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`Invalid count for ${svc.slug}: count must be a positive whole number`);
    }
    const markers = input.markers ?? 1;
    if (!Number.isInteger(markers) || markers < 1) {
      throw new Error(`Invalid marker count for ${svc.slug}: must be a positive whole number`);
    }
    if (markers > 1 && !svc.additionalMarkerPrice) {
      throw new Error(`${svc.title} does not support multiple markers`);
    }
    return {
      serviceSlug: svc.slug,
      serviceTitle: svc.title,
      unitLabel: svc.unitLabel,
      count,
      markers,
      academic: priceOne(svc, count, markers, 'academic'),
      commercial: priceOne(svc, count, markers, 'commercial'),
      needsConversation:
        svc.conversationThreshold !== undefined && count >= svc.conversationThreshold,
    };
  });

  return {
    lines,
    total: {
      academic: lines.reduce((sum, l) => sum + l.academic.total, 0),
      commercial: lines.reduce((sum, l) => sum + l.commercial.total, 0),
    },
    needsConversation: lines.some((l) => l.needsConversation),
  };
}

/**
 * The honest upsell for counts that are NOT in a dead zone: reaching the
 * next tier costs more in total but lowers the per-unit rate. Callers must
 * never label this a "saving" — see buildQuote's isBetterThanLiteral for
 * the case where "save" is actually true.
 */
export function nextTierUpsell(
  serviceSlug: string,
  count: number,
  markers: number,
  audience: Audience,
): { additionalUnits: number; additionalCost: number; newRate: number } | null {
  const svc = serviceFor(serviceSlug);
  const current = priceOne(svc, count, markers, audience);
  const next = svc.tiers.find((t) => t.minQty > current.pricedCount);
  if (!next) return null;
  const nextTotal = next.minQty * effectiveRate(svc, next, markers, audience);
  return {
    additionalUnits: next.minQty - current.pricedCount,
    additionalCost: nextTotal - current.total,
    newRate: effectiveRate(svc, next, markers, audience),
  };
}
