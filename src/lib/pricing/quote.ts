// src/lib/pricing/quote.ts
//
// Pure pricing engine for /quote. No I/O — imported by both the browser
// (live recalculation) and src/pages/api/quote.ts (authoritative recompute
// before persisting). A client-supplied total is never trusted.
import {
  barcodingExtraMarkerFraction,
  ednaAdditionalMarkerPrice,
  identificationOnlyBarcoding,
  metagenomics,
  pricedServices,
  type PricedService,
  type PriceTier,
} from '@/data/pricing';

export type Audience = 'academic' | 'commercial';

/**
 * What a line prices. 'service' is a rate-card service as before; the other
 * kinds are priced variants that hang off a parent service slug. Lines stored
 * before kinds existed have no `kind` — read them as `l.kind ?? 'service'`.
 */
export type LineKind = 'service' | 'id-only' | 'preservative-edna' | 'assay';

export interface QuoteLineInput {
  serviceSlug: string;
  count: number;
  /** Number of markers; the first is included in the base rate. */
  markers?: number;
  /** Defaults to 'service'. */
  kind?: LineKind;
  /** Required for, and only meaningful on, kind 'assay'. */
  assay?: 'mg' | 'mt';
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
  kind: LineKind;
  assay?: 'mg' | 'mt';
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

/** Stable identity of a line, e.g. for de-duplicating cart entries. */
export function lineKey(l: Pick<QuoteLine, 'kind' | 'serviceSlug' | 'assay'>): string {
  return `${l.kind}:${l.serviceSlug}:${l.assay ?? ''}`;
}

/**
 * How extra markers are charged: 'fraction' = each added marker costs
 * barcodingExtraMarkerFraction of the tier's base rate; 'flat' = a fixed
 * per-unit surcharge (eDNA); 'none' = multiple markers are refused.
 */
type MarkerRule =
  | { type: 'fraction' }
  | { type: 'flat'; price: { academic: number; commercial: number } }
  | { type: 'none' };

/** Everything priceOne needs, resolved from a line's kind. */
interface PriceSource {
  tiers: PriceTier[];
  title: string;
  unitLabel: string;
  markerRule: MarkerRule;
  /** Only rate-card service lines can trigger a conversation. */
  conversationThreshold?: number;
}

/** A one-tier list: priceOne's dead-zone search becomes a no-op. */
function flatTier(range: string, academicPrice: number, commercialPrice: number): PriceTier[] {
  return [{ range, description: '', academicPrice, commercialPrice, minQty: 1 }];
}

function markerRuleFor(svc: PricedService): MarkerRule {
  if (svc.slug === 'barcoding') return { type: 'fraction' };
  if (svc.additionalMarkerPrice) return { type: 'flat', price: svc.additionalMarkerPrice };
  return { type: 'none' };
}

function priceSource(input: QuoteLineInput): PriceSource {
  const kind = input.kind ?? 'service';
  const requireSlug = (slug: string) => {
    if (input.serviceSlug !== slug) {
      throw new Error(`Line kind ${kind} is only available on ${slug}, not ${input.serviceSlug}`);
    }
  };
  switch (kind) {
    case 'service': {
      const svc = serviceFor(input.serviceSlug);
      return {
        tiers: svc.tiers,
        title: svc.title,
        unitLabel: svc.unitLabel,
        markerRule: markerRuleFor(svc),
        conversationThreshold: svc.conversationThreshold,
      };
    }
    case 'id-only': {
      requireSlug('barcoding');
      // Same price for every audience and volume, so no tiers to search.
      const p = identificationOnlyBarcoding.price;
      return {
        tiers: flatTier('flat', p, p),
        title: 'Specimen barcoding, identification only',
        unitLabel: 'specimen',
        markerRule: { type: 'fraction' },
      };
    }
    case 'preservative-edna': {
      requireSlug('metabarcoding');
      // An add-on to barcoding, but priced exactly like an eDNA sample.
      const svc = serviceFor('metabarcoding');
      return {
        tiers: svc.tiers,
        title: 'Bulk eDNA from preservative',
        unitLabel: svc.unitLabel,
        markerRule: { type: 'flat', price: ednaAdditionalMarkerPrice },
      };
    }
    case 'assay': {
      requireSlug('metagenomics');
      const assay = metagenomics.assays.find((a) => a.id === input.assay);
      if (!assay) throw new Error(`Metagenomics lines need an assay (mg or mt)`);
      return {
        tiers: flatTier('per specimen', assay.academicPrice, assay.commercialPrice),
        title: `${assay.title} sequencing`,
        unitLabel: 'specimen',
        markerRule: { type: 'none' },
      };
    }
    default:
      throw new Error(`Unknown line kind: ${String(kind)}`);
  }
}

function rateOf(tier: PriceTier, audience: Audience): number {
  return audience === 'academic' ? tier.academicPrice : tier.commercialPrice;
}

/**
 * Cost is linear in count, so markers collapse into a per-unit surcharge.
 * This is what makes whole-line best-pricing a simple min over tiers.
 */
function effectiveRate(src: PriceSource, tier: PriceTier, markers: number, a: Audience): number {
  const base = rateOf(tier, a);
  if (markers <= 1) return base;
  const rule = src.markerRule;
  if (rule.type === 'fraction') return base + (markers - 1) * base * barcodingExtraMarkerFraction;
  if (rule.type === 'flat') {
    return base + (markers - 1) * (a === 'academic' ? rule.price.academic : rule.price.commercial);
  }
  return base;
}

function tierFor(src: PriceSource, count: number): PriceTier {
  const match = src.tiers.find(
    (t) => count >= t.minQty && (t.maxQty === undefined || count <= t.maxQty),
  );
  // Tiers are contiguous and the last is open-ended, so a positive count
  // always matches; the fallback keeps TypeScript honest.
  return match ?? src.tiers[src.tiers.length - 1];
}

function priceOne(src: PriceSource, count: number, markers: number, a: Audience): PriceResult {
  const literalTier = tierFor(src, count);
  const literalTotal = count * effectiveRate(src, literalTier, markers, a);

  // Best price over the WHOLE line: for each tier, what would it cost to
  // buy up to that tier's floor (or stay at count, whichever is larger)?
  let best = { total: literalTotal, pricedCount: count, tier: literalTier };
  for (const tier of src.tiers) {
    const n = Math.max(count, tier.minQty);
    const total = n * effectiveRate(src, tier, markers, a);
    if (total < best.total) best = { total, pricedCount: n, tier };
  }

  // Fractional marker rates (e.g. $3.75) can leave cents; quotes are in
  // whole dollars. Round after the search so the comparison stays exact.
  const total = Math.round(best.total);
  const roundedLiteral = Math.round(literalTotal);
  const savings = roundedLiteral - total;
  return {
    requestedCount: count,
    pricedCount: best.pricedCount,
    total,
    effectiveRate: effectiveRate(src, best.tier, markers, a),
    tierRange: best.tier.range,
    literalTotal: roundedLiteral,
    isBetterThanLiteral: savings > 0,
    freeHeadroom: best.pricedCount - count,
    savings,
  };
}

export function buildQuote(inputs: QuoteLineInput[]): Quote {
  const lines: QuoteLine[] = inputs.map((input) => {
    const kind = input.kind ?? 'service';
    const src = priceSource(input);
    const slug = input.serviceSlug;
    const { count } = input;
    if (!Number.isInteger(count) || count < 1) {
      throw new Error(`Invalid count for ${slug}: count must be a positive whole number`);
    }
    const markers = input.markers ?? 1;
    if (!Number.isInteger(markers) || markers < 1) {
      throw new Error(`Invalid marker count for ${slug}: must be a positive whole number`);
    }
    if (markers > 1 && src.markerRule.type === 'none') {
      throw new Error(`${src.title} does not support multiple markers`);
    }
    return {
      serviceSlug: slug,
      serviceTitle: src.title,
      unitLabel: src.unitLabel,
      count,
      markers,
      academic: priceOne(src, count, markers, 'academic'),
      commercial: priceOne(src, count, markers, 'commercial'),
      needsConversation:
        src.conversationThreshold !== undefined && count >= src.conversationThreshold,
      kind,
      ...(kind === 'assay' ? { assay: input.assay } : {}),
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
  kind: LineKind = 'service',
): { additionalUnits: number; additionalCost: number; newRate: number } | null {
  // Upsells are for rate-card service lines only; flat kinds have no next
  // tier to reach.
  if (kind !== 'service') return null;
  const src = priceSource({ serviceSlug, count, markers });
  const current = priceOne(src, count, markers, audience);
  const next = src.tiers.find((t) => t.minQty > current.pricedCount);
  if (!next) return null;
  // Rounded like PriceResult.total so additionalCost is whole dollars.
  const nextTotal = Math.round(next.minQty * effectiveRate(src, next, markers, audience));
  return {
    additionalUnits: next.minQty - current.pricedCount,
    additionalCost: nextTotal - current.total,
    newRate: effectiveRate(src, next, markers, audience),
  };
}
