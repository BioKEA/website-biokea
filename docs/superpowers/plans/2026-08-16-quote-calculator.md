# Quote Calculator + Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An interactive project configurator at `/quote` that produces firm, retrievable, PO-ready sequencing quotes — with no payment processing.

**Architecture:** A pure pricing engine (`src/lib/pricing/quote.ts`) is the single source of truth, imported by both the browser (live updates) and the API route (authoritative recompute before persisting). Quotes persist to Supabase with a human-readable quote number plus an unguessable access token, and render at `/quote/<token>` as a print-styled document.

**Tech Stack:** Astro v6, TypeScript, Tailwind v4, Zod, Supabase (REST), Resend, Vitest (unit), Playwright (e2e).

## Global Constraints

- Tier boundaries are unambiguous and the **better tier starts at the boundary**: barcoding `1–299 @ $16 · 300–999 @ $12 · 1,000–4,999 @ $10 · 5,000+ @ $6`; eDNA `1–48 @ $165 · 49–199 @ $130 · 200+ @ $115`. Commercial rates unchanged: barcoding `20/15/13/8`, eDNA `205/160/145`.
- Additional eDNA markers: **$12/sample academic, $15/sample commercial** — provisional pending Michelle's cost-model confirmation, and must be marked as such in a code comment.
- **Conversation band is exactly `barcoding count >= 3001`.** eDNA quotes firmly at every size.
- **Never trust a client-supplied total.** The API recomputes with the shared engine before persisting.
- **Never gate the price behind a form.** The total renders live; email capture is offered afterward.
- **"Save" wording only ever appears when the best price genuinely beats the literal price.** Upsell toward a higher tier that costs more in total must never use "save".
- No new npm dependencies. No payment processing of any kind.
- Follow existing conventions: `Eyebrow`/`CtaBand` components, cream/ink/teal/pink/ochre tokens, Inter + JetBrains Mono, vanilla `<script>` for interactivity (no framework islands), and the `contact.ts`/`subscribe.ts` API shape (zod, honeypot, optional Turnstile, `prerender = false`, `cloudflare:workers` env).
- Source spec: `docs/superpowers/specs/2026-08-16-quote-calculator-design.md`.

---

### Task 1: Correct the pricing data

**Files:**

- Modify: `src/data/pricing.ts`
- Test: `tests/unit/content-data.test.ts`

**Interfaces:**

- Produces: `PriceTier` gains required `maxQty` on all non-final tiers (no overlaps). `PricedService` gains `additionalMarkerPrice?: { academic: number; commercial: number }` and `conversationThreshold?: number`. Task 2's engine reads all of these.

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/content-data.test.ts`:

```ts
describe('pricing data — unambiguous tiers', () => {
  it('no count belongs to two tiers, for any service', () => {
    for (const s of pricedServices) {
      for (let i = 1; i < s.tiers.length; i++) {
        const prev = s.tiers[i - 1];
        const cur = s.tiers[i];
        expect(prev.maxQty).toBeDefined();
        expect(cur.minQty).toBe(prev.maxQty! + 1);
      }
    }
  });

  it('only the final tier is open-ended', () => {
    for (const s of pricedServices) {
      const last = s.tiers[s.tiers.length - 1];
      expect(last.maxQty).toBeUndefined();
      for (const t of s.tiers.slice(0, -1)) expect(t.maxQty).toBeDefined();
    }
  });

  it('barcoding tiers are 1-299 / 300-999 / 1000-4999 / 5000+', () => {
    const b = pricedServices.find((s) => s.slug === 'barcoding')!;
    expect(b.tiers.map((t) => [t.minQty, t.maxQty])).toEqual([
      [1, 299],
      [300, 999],
      [1000, 4999],
      [5000, undefined],
    ]);
  });

  it('eDNA tiers are 1-48 / 49-199 / 200+', () => {
    const e = pricedServices.find((s) => s.slug === 'metabarcoding')!;
    expect(e.tiers.map((t) => [t.minQty, t.maxQty])).toEqual([
      [1, 48],
      [49, 199],
      [200, undefined],
    ]);
  });

  it('eDNA has a firm additional-marker price; barcoding has none', () => {
    const e = pricedServices.find((s) => s.slug === 'metabarcoding')!;
    expect(e.additionalMarkerPrice).toEqual({ academic: 12, commercial: 15 });
    const b = pricedServices.find((s) => s.slug === 'barcoding')!;
    expect(b.additionalMarkerPrice).toBeUndefined();
  });

  it('barcoding has a conversation threshold of 3001; eDNA has none', () => {
    const b = pricedServices.find((s) => s.slug === 'barcoding')!;
    expect(b.conversationThreshold).toBe(3001);
    const e = pricedServices.find((s) => s.slug === 'metabarcoding')!;
    expect(e.conversationThreshold).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- content-data`
Expected: FAIL — tiers currently overlap (`maxQty: 300` then `minQty: 300`), and `additionalMarkerPrice` / `conversationThreshold` don't exist on the type.

- [ ] **Step 3: Update the interfaces**

In `src/data/pricing.ts`, replace the two interface declarations:

```ts
export interface PriceTier {
  range: string; // display label, e.g. "1–299"
  description: string;
  academicPrice: number;
  commercialPrice: number;
  minQty: number;
  maxQty?: number; // undefined ONLY on the final, open-ended tier
  best?: boolean;
}

export interface PricedService {
  slug: string;
  serviceTag: string;
  title: string;
  tagline: string;
  description: string;
  advantages: { title: string; body: string }[];
  included: string[];
  unitLabel: string; // "specimen" | "sample"
  tiers: PriceTier[];
  addonNote: string;
  // Per-unit surcharge for each marker beyond the first. eDNA only.
  // PROVISIONAL — pending Michelle's confirmation against the cost model.
  // Published ranges were $10–13 (academic) / $13–16 (commercial); these
  // sit inside both and preserve the documented ~25% commercial premium.
  additionalMarkerPrice?: { academic: number; commercial: number };
  // At or above this count, the configurator shows an indicative range
  // instead of a firm quote and routes to a conversation — covering both
  // the expensive dead zone and a sequencing-capacity check.
  conversationThreshold?: number;
}
```

- [ ] **Step 4: Fix the barcoding tiers and add the threshold**

Replace the barcoding entry's `tiers` array with:

```ts
    tiers: [
      {
        range: '1–299',
        description: 'Small batches & pilot runs',
        academicPrice: 16,
        commercialPrice: 20,
        minQty: 1,
        maxQty: 299,
      },
      {
        range: '300–999',
        description: 'Standard project size',
        academicPrice: 12,
        commercialPrice: 15,
        minQty: 300,
        maxQty: 999,
      },
      {
        range: '1,000–4,999',
        description: 'Multi-flow-cell projects',
        academicPrice: 10,
        commercialPrice: 13,
        minQty: 1000,
        maxQty: 4999,
      },
      {
        range: '5,000+',
        description: 'Large-scale monitoring programs',
        academicPrice: 6,
        commercialPrice: 8,
        minQty: 5000,
        best: true,
      },
    ],
```

And add `conversationThreshold: 3001,` immediately after that `tiers` array, before `addonNote`.

- [ ] **Step 5: Fix the eDNA tiers, marker price, and add-on note**

Replace the metabarcoding entry's `tiers` array with:

```ts
    tiers: [
      {
        range: '1–48',
        description: 'Small batches & pilot runs',
        academicPrice: 165,
        commercialPrice: 205,
        minQty: 1,
        maxQty: 48,
      },
      {
        range: '49–199',
        description: 'Standard project size',
        academicPrice: 130,
        commercialPrice: 160,
        minQty: 49,
        maxQty: 199,
      },
      {
        range: '200+',
        description: 'Large monitoring programs',
        academicPrice: 115,
        commercialPrice: 145,
        minQty: 200,
        best: true,
      },
    ],
    additionalMarkerPrice: { academic: 12, commercial: 15 },
```

And replace that entry's `addonNote` with:

```ts
    addonNote:
      'Running more than one marker? Each additional target (e.g. stacking fish + invertebrate + general-eukaryote panels on the same samples) adds $12/sample (academic/nonprofit) or $15/sample (commercial).',
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- content-data`
Expected: PASS, including the pre-existing `pricing data` block (tier counts are unchanged at 4 and 3; academic prices still strictly decrease; commercial still exceeds academic; only the last tier is `best`).

Run: `npx playwright test pricing.spec.ts`
Expected: PASS unchanged — its assertions target dollar amounts and the `5,000+` / `200+` labels, none of which changed.

- [ ] **Step 7: Commit**

```bash
git add src/data/pricing.ts tests/unit/content-data.test.ts
git commit -m "fix(pricing): remove overlapping tier boundaries, pin marker add-on"
```

---

### Task 2: The pricing engine

**Files:**

- Create: `src/lib/pricing/quote.ts`
- Test: `tests/unit/pricing-engine.test.ts`

**Interfaces:**

- Consumes: `pricedServices`, `PricedService`, `PriceTier` from `@/data/pricing` (Task 1).
- Produces — all later tasks depend on these exact signatures:
  - `type Audience = 'academic' | 'commercial'`
  - `interface QuoteLineInput { serviceSlug: string; count: number; markers?: number }`
  - `interface PriceResult { requestedCount, pricedCount, total, effectiveRate, tierRange, literalTotal, isBetterThanLiteral, freeHeadroom, savings }`
  - `interface QuoteLine { serviceSlug, serviceTitle, unitLabel, count, markers, academic: PriceResult, commercial: PriceResult, needsConversation }`
  - `interface Quote { lines: QuoteLine[]; total: { academic: number; commercial: number }; needsConversation: boolean }`
  - `function buildQuote(inputs: QuoteLineInput[]): Quote`
  - `function nextTierUpsell(serviceSlug, count, markers, audience): { additionalUnits, additionalCost, newRate } | null`

**Key algorithm — read before implementing.** A line's cost is linear in count, so markers fold into an _effective rate_:

```
effectiveRate(tier) = tier[audience]Price + (markers - 1) * additionalMarkerPrice[audience]
lineTotal(n, tier)  = n * effectiveRate(tier)
bestTotal           = min over all tiers of  lineTotal(max(count, tier.minQty), tier)
```

Computing best price on the **whole line** (not the base alone) is required for correctness. Worked counter-example: 177 eDNA samples with 3 markers, academic — pricing the base alone would pick 200 samples ($23,000 + $4,800 markers = $27,800), which is _worse_ than staying at 177 ($23,010 + $4,248 = $27,258). Dead zones shift with marker count; they must never be hardcoded.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/pricing-engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildQuote, nextTierUpsell } from '@/lib/pricing/quote';

const bc = (count: number) => buildQuote([{ serviceSlug: 'barcoding', count }]);
const ed = (count: number, markers = 1) =>
  buildQuote([{ serviceSlug: 'metabarcoding', count, markers }]);

describe('pricing engine — plain tier pricing', () => {
  it('prices a small barcoding batch at the $16 tier', () => {
    const q = bc(150);
    expect(q.lines[0].academic.total).toBe(2400);
    expect(q.lines[0].commercial.total).toBe(3000);
    expect(q.lines[0].academic.isBetterThanLiteral).toBe(false);
  });

  it('prices exactly 300 specimens at the $12 tier (boundary starts better tier)', () => {
    expect(bc(300).lines[0].academic.total).toBe(3600);
  });

  it('prices exactly 1000 at $10 and exactly 5000 at $6', () => {
    expect(bc(1000).lines[0].academic.total).toBe(10000);
    expect(bc(5000).lines[0].academic.total).toBe(30000);
  });

  it('prices eDNA boundaries 49 and 200 at the better tier', () => {
    expect(ed(49).lines[0].academic.total).toBe(6370);
    expect(ed(200).lines[0].academic.total).toBe(23000);
  });
});

describe('pricing engine — dead zones', () => {
  it('auto-applies the 300 rate for 275 specimens and reports headroom', () => {
    const r = bc(275).lines[0].academic;
    expect(r.total).toBe(3600);
    expect(r.literalTotal).toBe(4400);
    expect(r.pricedCount).toBe(300);
    expect(r.freeHeadroom).toBe(25);
    expect(r.savings).toBe(800);
    expect(r.isBetterThanLiteral).toBe(true);
  });

  it('auto-applies the 1000 rate for 900 specimens', () => {
    const r = bc(900).lines[0].academic;
    expect(r.total).toBe(10000);
    expect(r.savings).toBe(800);
    expect(r.freeHeadroom).toBe(100);
  });

  it('auto-applies the 49 rate for 44 eDNA samples', () => {
    const r = ed(44).lines[0].academic;
    expect(r.total).toBe(6370);
    expect(r.savings).toBe(890);
  });

  it('auto-applies the 200 rate for 185 eDNA samples', () => {
    const r = ed(185).lines[0].academic;
    expect(r.total).toBe(23000);
    expect(r.savings).toBe(1050);
  });

  it('reports no saving and no headroom outside a dead zone', () => {
    const r = bc(600).lines[0].academic;
    expect(r.total).toBe(7200);
    expect(r.savings).toBe(0);
    expect(r.freeHeadroom).toBe(0);
    expect(r.isBetterThanLiteral).toBe(false);
  });
});

describe('pricing engine — multi-marker', () => {
  it('charges the first marker in the base rate', () => {
    expect(ed(100, 1).lines[0].academic.total).toBe(13000);
  });

  it('adds $12/sample per additional marker (academic)', () => {
    // 100 samples, 3 markers: 100*130 + 2*12*100 = 13000 + 2400
    expect(ed(100, 3).lines[0].academic.total).toBe(15400);
  });

  it('adds $15/sample per additional marker (commercial)', () => {
    // 100 samples, 3 markers: 100*160 + 2*15*100 = 16000 + 3000
    expect(ed(100, 3).lines[0].commercial.total).toBe(19000);
  });

  it('markers shift where dead zones are — 177 samples x3 markers is NOT a dead zone', () => {
    const r = ed(177, 3).lines[0].academic;
    // staying at 177 (27,258) beats buying up to 200 (27,800)
    expect(r.total).toBe(27258);
    expect(r.pricedCount).toBe(177);
    expect(r.isBetterThanLiteral).toBe(false);
  });

  it('177 samples x1 marker IS a dead zone', () => {
    const r = ed(177).lines[0].academic;
    expect(r.total).toBe(23000);
    expect(r.pricedCount).toBe(200);
  });
});

describe('pricing engine — invariants', () => {
  const counts = Array.from({ length: 260 }, (_, i) => i + 1).concat([
    299, 300, 833, 834, 999, 1000, 2999, 3000, 4999, 5000, 5001, 9999, 10000,
  ]);

  it('best price never exceeds the literal price (barcoding)', () => {
    for (const n of counts) {
      const r = bc(n).lines[0].academic;
      expect(r.total).toBeLessThanOrEqual(r.literalTotal);
    }
  });

  it('total is monotonically non-decreasing in count — ordering more never costs less', () => {
    let prev = 0;
    for (let n = 1; n <= 6000; n++) {
      const total = bc(n).lines[0].academic.total;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it('monotonicity also holds for eDNA with 3 markers', () => {
    let prev = 0;
    for (let n = 1; n <= 400; n++) {
      const total = ed(n, 3).lines[0].academic.total;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });
});

describe('pricing engine — conversation band', () => {
  it('flags barcoding at and above 3001 specimens', () => {
    expect(bc(3000).needsConversation).toBe(false);
    expect(bc(3001).needsConversation).toBe(true);
    expect(bc(10000).needsConversation).toBe(true);
  });

  it('never flags eDNA at any size', () => {
    expect(ed(1).needsConversation).toBe(false);
    expect(ed(5000).needsConversation).toBe(false);
  });

  it('flags the whole quote when any line needs a conversation', () => {
    const q = buildQuote([
      { serviceSlug: 'metabarcoding', count: 50 },
      { serviceSlug: 'barcoding', count: 4000 },
    ]);
    expect(q.needsConversation).toBe(true);
  });
});

describe('pricing engine — multi-service quotes', () => {
  it('sums line totals across services', () => {
    const q = buildQuote([
      { serviceSlug: 'barcoding', count: 600 },
      { serviceSlug: 'metabarcoding', count: 100 },
    ]);
    expect(q.total.academic).toBe(7200 + 13000);
    expect(q.total.commercial).toBe(9000 + 16000);
  });
});

describe('pricing engine — upsell (non-dead-zone nudge)', () => {
  it('reports the cost of reaching the next tier from 600 specimens', () => {
    const u = nextTierUpsell('barcoding', 600, 1, 'academic')!;
    expect(u.additionalUnits).toBe(400);
    expect(u.additionalCost).toBe(2800); // 10000 - 7200
    expect(u.newRate).toBe(10);
  });

  it('returns null when already on the top tier', () => {
    expect(nextTierUpsell('barcoding', 6000, 1, 'academic')).toBeNull();
  });
});

describe('pricing engine — input validation', () => {
  it('throws on an unknown service slug', () => {
    expect(() => buildQuote([{ serviceSlug: 'nope', count: 10 }])).toThrow(/unknown service/i);
  });

  it('throws on a non-positive or non-integer count', () => {
    expect(() => bc(0)).toThrow(/count/i);
    expect(() => bc(-5)).toThrow(/count/i);
    expect(() => bc(1.5)).toThrow(/count/i);
  });

  it('throws when markers are requested for a service that has none', () => {
    expect(() => buildQuote([{ serviceSlug: 'barcoding', count: 10, markers: 2 }])).toThrow(
      /marker/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pricing-engine`
Expected: FAIL — `Cannot find module '@/lib/pricing/quote'`.

- [ ] **Step 3: Write the engine**

Create `src/lib/pricing/quote.ts`:

```ts
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
    additionalUnits: next.minQty - count,
    additionalCost: nextTotal - current.total,
    newRate: rateOf(next, audience),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- pricing-engine`
Expected: PASS, all suites — including both invariants (`best ≤ literal`, and monotonicity across 6,000 counts).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts tests/unit/pricing-engine.test.ts
git commit -m "feat(pricing): add pure quote pricing engine with dead-zone handling"
```

---

### Task 3: Quotes table migration

**Files:**

- Create: `migrations/0005_quotes.sql`

**Interfaces:**

- Produces: a `public.quotes` table. Task 4 inserts into it via PostgREST with the publishable key; Task 6 reads from it with the service-role key. Columns Task 4 writes: `email`, `name`, `organization`, `note`, `lines` (jsonb), `total_academic`, `total_commercial`, `needs_conversation`. Columns generated by the DB: `id`, `quote_number`, `access_token`, `created_at`, `expires_at`.

- [ ] **Step 1: Write the migration**

Create `migrations/0005_quotes.sql`:

```sql
-- 0005_quotes.sql
--
-- `quotes` — lead capture for the /quote configurator. A quote records the
-- exact configuration and both audience totals as computed SERVER-SIDE by
-- src/lib/pricing/quote.ts. Client-supplied totals are never persisted.
--
-- Two identifiers on purpose:
--   quote_number  human-readable (BK-2026-0142); goes on PO requisitions.
--   access_token  unguessable; the only thing in the retrieval URL. A
--                 sequential number in the URL would let anyone enumerate
--                 other customers' quotes.
--
-- RLS mirrors `subscribers`: anonymous insert is allowed (the API route
-- posts with the publishable key), and there is no select policy, so
-- reads require service_role. /quote/<token> renders server-side on the
-- Worker using SUPABASE_SERVICE_ROLE_KEY.
--
-- Apply via Supabase Dashboard → SQL Editor, paste, run.

create sequence if not exists public.quote_number_seq start 1;

create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text not null unique
                       default 'BK-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('public.quote_number_seq')::text, 4, '0'),
  access_token       uuid not null unique default gen_random_uuid(),

  email              citext not null,
  name               text not null,
  organization       text,
  note               text,

  -- One object per configured service, as returned by buildQuote().
  lines              jsonb not null,
  total_academic     integer not null,
  total_commercial   integer not null,
  needs_conversation boolean not null default false,

  created_at         timestamptz not null default now(),
  -- Quotes are valid for 30 days; surfaced on the printed quote so
  -- institutional buyers know how long the number is good for.
  expires_at         timestamptz not null default now() + interval '30 days',

  constraint quotes_email_format
    check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  constraint quotes_name_length
    check (char_length(name) between 1 and 200),
  constraint quotes_totals_nonneg
    check (total_academic >= 0 and total_commercial >= 0),
  constraint quotes_lines_is_array
    check (jsonb_typeof(lines) = 'array')
);

create index quotes_created_idx on public.quotes (created_at desc);
create index quotes_token_idx   on public.quotes (access_token);

alter table public.quotes enable row level security;

-- Anonymous inserts allowed (the API route recomputes prices before
-- inserting). No select policy: reads require service_role.
create policy quotes_public_insert
  on public.quotes for insert
  with check (true);
```

- [ ] **Step 2: Verify it applies cleanly**

Apply via Supabase Dashboard → SQL Editor. Then confirm the defaults work by running, in the SQL editor:

```sql
insert into public.quotes (email, name, lines, total_academic, total_commercial)
values ('test@example.com', 'Test', '[]'::jsonb, 100, 125)
returning quote_number, access_token, expires_at;
```

Expected: returns a row with `quote_number` shaped `BK-2026-0001`, a UUID `access_token`, and `expires_at` roughly 30 days out. Then clean up:

```sql
delete from public.quotes where email = 'test@example.com';
```

- [ ] **Step 3: Commit**

```bash
git add migrations/0005_quotes.sql
git commit -m "feat(quotes): add quotes table migration"
```

---

### Task 4: Quote API endpoint

**Files:**

- Create: `src/pages/api/quote.ts`
- Test: `tests/unit/quote-api.test.ts`

**Interfaces:**

- Consumes: `buildQuote`, `QuoteLineInput` from `@/lib/pricing/quote` (Task 2); the `quotes` table (Task 3).
- Produces: `export async function handleQuote(request: Request, env: Env, remoteIp?: string): Promise<Response>` plus a `POST` wrapper, mirroring `contact.ts`. On success returns `{ ok: true, quoteNumber: string, url: string }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/quote-api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleQuote } from '@/pages/api/quote';

const env = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'pk_test',
  RESEND_API_KEY: 'test-key',
  CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
};

function makeRequest(body: unknown) {
  return new Request('https://biokea.ai/api/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: 'Alice',
  email: 'alice@example.edu',
  organization: 'State University',
  lines: [{ serviceSlug: 'barcoding', count: 600 }],
};

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('/rest/v1/quotes')) {
        return new Response(
          JSON.stringify([{ quote_number: 'BK-2026-0001', access_token: 'tok-123' }]),
          { status: 201, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ id: 'msg_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }),
  );
});

describe('quote endpoint', () => {
  it('rejects a missing name or email', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, name: '' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid email', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, email: 'nope' }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an empty lines array', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, lines: [] }), env);
    expect(res.status).toBe(400);
  });

  it('rejects an unknown service slug', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, lines: [{ serviceSlug: 'hacked', count: 5 }] }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects a non-positive count', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, lines: [{ serviceSlug: 'barcoding', count: 0 }] }),
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects when the honeypot is filled', async () => {
    const res = await handleQuote(makeRequest({ ...validBody, website: 'bot' }), env);
    expect(res.status).toBe(400);
  });

  it('IGNORES a client-supplied total and persists the server recomputation', async () => {
    const res = await handleQuote(
      makeRequest({ ...validBody, total_academic: 1, total_commercial: 1 }),
      env,
    );
    expect(res.status).toBe(200);
    const insertCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('/rest/v1/quotes'),
    )!;
    const inserted = JSON.parse((insertCall[1] as RequestInit).body as string);
    // 600 specimens academic = 600 * 12 = 7200, NOT the injected 1.
    expect(inserted.total_academic).toBe(7200);
    expect(inserted.total_commercial).toBe(9000);
  });

  it('returns the quote number and retrieval url on success', async () => {
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.quoteNumber).toBe('BK-2026-0001');
    expect(body.url).toContain('/quote/tok-123');
  });

  it('emails the quote via Resend', async () => {
    await handleQuote(makeRequest(validBody), env);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns 502 when the database insert fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"boom"}', { status: 500 })),
    );
    const res = await handleQuote(makeRequest(validBody), env);
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- quote-api`
Expected: FAIL — `Cannot find module '@/pages/api/quote'`.

- [ ] **Step 3: Write the endpoint**

Create `src/pages/api/quote.ts`:

```ts
// src/pages/api/quote.ts
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { buildQuote } from '@/lib/pricing/quote';

export const prerender = false;

const NoLineBreaks = /^[^\r\n]+$/;

const QuoteSchema = z.object({
  name: z.string().trim().min(1).max(200).regex(NoLineBreaks),
  email: z.string().trim().email().max(254).regex(NoLineBreaks),
  organization: z.string().trim().max(200).regex(NoLineBreaks).optional().or(z.literal('')),
  note: z.string().trim().max(2000).optional().or(z.literal('')),
  lines: z
    .array(
      z.object({
        serviceSlug: z.string().regex(/^[a-z0-9-]{1,64}$/),
        count: z.number().int().positive().max(1_000_000),
        markers: z.number().int().positive().max(20).optional(),
      }),
    )
    .min(1)
    .max(4),
  website: z.string().optional(),
  'cf-turnstile-response': z.string().optional(),
});

interface Env {
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
  TURNSTILE_SECRET_KEY?: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function verifyTurnstile(token: string, secret: string, remoteIp?: string): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) body.append('remoteip', remoteIp);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body,
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

const usd = (n: number) => '$' + n.toLocaleString('en-US');

export async function handleQuote(request: Request, e: Env, remoteIp?: string): Promise<Response> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, error: 'Invalid request body.' }, 400);
  }

  const parsed = QuoteSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ ok: false, error: 'Please fill in all required fields with valid values.' }, 400);
  }

  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: false, error: 'Invalid submission' }, 400);
  }

  if (e.TURNSTILE_SECRET_KEY) {
    const token = parsed.data['cf-turnstile-response'];
    if (!token) return json({ ok: false, error: 'Captcha missing. Please reload.' }, 400);
    const ok = await verifyTurnstile(token, e.TURNSTILE_SECRET_KEY, remoteIp);
    if (!ok) return json({ ok: false, error: 'Captcha failed. Please reload.' }, 400);
  }

  // Authoritative recompute. Anything the client sent about price is discarded.
  let quote;
  try {
    quote = buildQuote(parsed.data.lines);
  } catch {
    return json({ ok: false, error: 'That configuration is not valid.' }, 400);
  }

  const { name, email, organization, note } = parsed.data;
  const row = {
    email,
    name,
    organization: organization && organization.length > 0 ? organization : null,
    note: note && note.length > 0 ? note : null,
    lines: quote.lines,
    total_academic: quote.total.academic,
    total_commercial: quote.total.commercial,
    needs_conversation: quote.needsConversation,
  };

  const insertRes = await fetch(`${e.SUPABASE_URL}/rest/v1/quotes`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: e.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${e.SUPABASE_PUBLISHABLE_KEY}`,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  });

  if (!insertRes.ok) {
    return json(
      { ok: false, error: 'Unable to save your quote right now. Please try again.' },
      502,
    );
  }

  const inserted = (await insertRes.json()) as { quote_number: string; access_token: string }[];
  const { quote_number: quoteNumber, access_token: accessToken } = inserted[0];
  const url = `https://biokea.ai/quote/${accessToken}`;

  const summary = quote.lines
    .map(
      (l) =>
        `  · ${l.serviceTitle}: ${l.count.toLocaleString()} ${l.unitLabel}s` +
        (l.markers > 1 ? ` × ${l.markers} markers` : '') +
        ` — ${usd(l.academic.total)} academic / ${usd(l.commercial.total)} commercial`,
    )
    .join('\n');

  const text = [
    `Your BioKEA quote — ${quoteNumber}`,
    ``,
    summary,
    ``,
    `Total: ${usd(quote.total.academic)} academic/nonprofit · ${usd(quote.total.commercial)} commercial`,
    ``,
    `View or print this quote: ${url}`,
    ``,
    quote.needsConversation
      ? `Because of the volume involved, we'll follow up to confirm scheduling and final pricing before anything is committed.`
      : `Quote valid for 30 days. Reply to this email to start a project.`,
    ``,
    `— The BioKEA team`,
    `https://biokea.ai/`,
  ].join('\n');

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${e.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: `BioKEA <${e.CONTACT_FROM_EMAIL}>`,
      to: email,
      reply_to: 'contact@biokea.ai',
      subject: `Your BioKEA quote — ${quoteNumber}`,
      text,
    }),
  });

  return json({ ok: true, quoteNumber, url }, 200);
}

export async function POST({ request, clientAddress }: APIContext): Promise<Response> {
  const e = env as unknown as Env;
  if (!e?.SUPABASE_URL || !e?.RESEND_API_KEY) {
    return json({ ok: false, error: 'Quotes are not configured.' }, 500);
  }
  return handleQuote(request, e, clientAddress);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- quote-api`
Expected: PASS, all cases — especially the tampered-total test, which must show `7200` persisted rather than the injected `1`.

- [ ] **Step 5: Commit**

```bash
git add src/pages/api/quote.ts tests/unit/quote-api.test.ts
git commit -m "feat(quotes): add quote API with server-side price recomputation"
```

---

### Task 5: The configurator page

**Files:**

- Create: `src/pages/quote/index.astro`
- Test: `tests/e2e/quote.spec.ts`

**Interfaces:**

- Consumes: `pricedServices` from `@/data/pricing`; `buildQuote`, `nextTierUpsell` from `@/lib/pricing/quote` (Task 2); `POST /api/quote` (Task 4); `Eyebrow`, `CtaBand`.
- Produces: route `/quote`. Task 7 links to it.

**Note on the script tag:** use a plain `<script>` (NOT `is:inline`) so Vite bundles it and the `@/lib/pricing/quote` import resolves. `is:inline` scripts are not processed and cannot import modules.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/quote.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('quote page renders with a default configuration and a live total', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Build your quote');
  await expect(page.locator('[data-total-academic]')).not.toBeEmpty();
});

test('changing the specimen count updates the total live', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$7,200');
  await expect(page.locator('[data-total-commercial]')).toHaveText('$9,000');
});

test('a dead-zone count auto-applies the better rate and shows headroom', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('275');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$3,600');
  const callout = page.locator('[data-deadzone-callout]');
  await expect(callout).toBeVisible();
  await expect(callout).toContainText('25 more');
});

test('"save" wording never appears outside a dead zone', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('600');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-deadzone-callout]')).toBeHidden();
  const summary = await page.locator('[data-summary-panel]').innerText();
  expect(summary.toLowerCase()).not.toContain('save');
});

test('the conversation band swaps the CTA and hides the firm total', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-count-input="barcoding"]').fill('4000');
  await page.locator('[data-count-input="barcoding"]').blur();
  await expect(page.locator('[data-conversation-notice]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Request a project quote/i })).toBeVisible();
});

test('eDNA markers change the total', async ({ page }) => {
  await page.goto('/quote');
  await page.locator('[data-service-toggle="metabarcoding"]').check();
  await page.locator('[data-service-toggle="barcoding"]').uncheck();
  await page.locator('[data-count-input="metabarcoding"]').fill('100');
  await page.locator('[data-count-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$13,000');
  await page.locator('[data-markers-input="metabarcoding"]').fill('3');
  await page.locator('[data-markers-input="metabarcoding"]').blur();
  await expect(page.locator('[data-total-academic]')).toHaveText('$15,400');
});

test('the price is visible without submitting any form', async ({ page }) => {
  await page.goto('/quote');
  await expect(page.locator('[data-total-academic]')).toBeVisible();
  await expect(page.locator('#quote-name')).toBeHidden();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test quote.spec.ts`
Expected: FAIL — 404, no `/quote` route.

- [ ] **Step 3: Build the page**

Create `src/pages/quote/index.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { pricedServices } from '@/data/pricing';

const turnstileSiteKey = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY as string | undefined;
---

<BaseLayout
  title="Build your quote — BioKEA"
  description="Configure your sequencing project and get an instant, itemized quote for DNA barcoding and eDNA metabarcoding."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-8">
    <Eyebrow>QUOTE · MOLECULAR SEQUENCING</Eyebrow>
    <h1
      class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[24ch]"
    >
      Build your quote.
    </h1>
    <p class="mt-5 max-w-[62ch] text-slate-600 leading-relaxed">
      Configure your project below. Pricing updates as you go — no email required to see it.
      Academic/nonprofit and commercial rates are shown side by side.
    </p>
  </section>

  <section
    class="max-w-6xl mx-auto px-6 pb-16 grid lg:grid-cols-[1fr_minmax(0,26rem)] gap-10 items-start"
  >
    <!-- ─── configuration ─── -->
    <div class="flex flex-col gap-6">
      {
        pricedServices.map((svc, i) => (
          <div class="bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md p-6">
            <label class="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                data-service-toggle={svc.slug}
                checked={i === 0}
                class="w-4 h-4 accent-[var(--color-teal)]"
              />
              <span class="font-semibold text-[var(--color-ink)]">{svc.title}</span>
            </label>
            <p class="mt-2 text-sm text-slate-600 leading-relaxed">{svc.tagline}</p>

            <div class="mt-5" data-service-body={svc.slug}>
              <label
                class="block font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500 mb-2"
                for={`count-${svc.slug}`}
              >
                Number of {svc.unitLabel}s
              </label>
              <div class="flex items-center gap-4">
                <input
                  id={`count-${svc.slug}`}
                  type="number"
                  min="1"
                  step="1"
                  value="100"
                  data-count-input={svc.slug}
                  class="w-32 border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70 text-[var(--color-ink)]"
                />
                <input
                  type="range"
                  min="0"
                  max="100"
                  value="0"
                  data-count-slider={svc.slug}
                  aria-label={`${svc.title} volume slider`}
                  class="flex-1 accent-[var(--color-teal)]"
                />
              </div>

              {svc.additionalMarkerPrice && (
                <div class="mt-4">
                  <label
                    class="block font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500 mb-2"
                    for={`markers-${svc.slug}`}
                  >
                    Number of markers
                  </label>
                  <input
                    id={`markers-${svc.slug}`}
                    type="number"
                    min="1"
                    max="20"
                    step="1"
                    value="1"
                    data-markers-input={svc.slug}
                    class="w-24 border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70 text-[var(--color-ink)]"
                  />
                  <p class="mt-2 text-xs text-slate-500 leading-relaxed">
                    First marker included. Each additional adds $
                    {svc.additionalMarkerPrice.academic}/{svc.unitLabel} (academic) or $
                    {svc.additionalMarkerPrice.commercial}/{svc.unitLabel} (commercial).
                  </p>
                </div>
              )}

              <ul class="mt-5 pt-4 border-t border-slate-900/10 flex flex-col gap-1.5">
                {svc.included.map((item) => (
                  <li class="flex gap-2 items-start text-[13px] text-slate-600 leading-relaxed">
                    <span class="mt-1 shrink-0 w-3.5 h-3.5 rounded-full bg-[var(--color-teal)] flex items-center justify-center text-white text-[9px]">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))
      }
    </div>

    <!-- ─── live summary ─── -->
    <aside
      data-summary-panel
      class="lg:sticky lg:top-6 bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md overflow-hidden"
    >
      <div class="bg-[var(--color-ink)] text-[var(--color-cream)] px-6 py-5">
        <div class="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--color-ochre)]">
          Your quote
        </div>
        <div class="mt-3 grid grid-cols-2 gap-4">
          <div>
            <div data-total-academic class="text-2xl font-semibold leading-none">$0</div>
            <div class="mt-1 font-mono text-[10px] text-[var(--color-cream)]/70">
              academic/nonprofit
            </div>
          </div>
          <div>
            <div data-total-commercial class="text-2xl font-semibold leading-none">$0</div>
            <div class="mt-1 font-mono text-[10px] text-[var(--color-cream)]/70">commercial</div>
          </div>
        </div>
      </div>

      <div class="p-6">
        <ul data-line-list class="flex flex-col gap-3 text-sm text-slate-600"></ul>

        <div
          data-deadzone-callout
          hidden
          class="mt-4 text-[13px] leading-relaxed text-[var(--color-ink)] bg-[rgba(146,64,14,0.1)] border-l-2 border-[var(--color-ochre)] rounded-r-sm px-3 py-2"
        >
        </div>

        <div
          data-upsell-callout
          hidden
          class="mt-4 text-[13px] leading-relaxed text-slate-600 bg-white/60 border border-slate-900/10 rounded-sm px-3 py-2"
        >
        </div>

        <div
          data-conversation-notice
          hidden
          class="mt-4 text-[13px] leading-relaxed text-[var(--color-ink)] bg-white/70 border border-slate-900/15 rounded-sm px-3 py-2"
        >
          At this volume we quote per project — sequencing capacity and timeline need confirming
          before we commit to a price. The figures above are indicative.
        </div>

        <p class="mt-4 text-xs text-slate-500 leading-relaxed">
          Turnaround is typically 4–8 weeks from sample receipt. Final pricing is confirmed on the
          count we actually receive.
        </p>

        <button
          type="button"
          data-open-form
          class="mt-5 w-full bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-3 rounded-sm font-semibold text-sm"
        >
          Email me this quote
        </button>

        <!-- capture form, revealed only after the price is already visible -->
        <form data-quote-form hidden class="mt-5 grid gap-3" novalidate>
          <label class="grid gap-1.5">
            <span class="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-teal)]"
              >Name</span
            >
            <input
              required
              id="quote-name"
              name="name"
              type="text"
              autocomplete="name"
              class="border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70"
            />
          </label>
          <label class="grid gap-1.5">
            <span class="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-teal)]"
              >Email</span
            >
            <input
              required
              id="quote-email"
              name="email"
              type="email"
              autocomplete="email"
              class="border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70"
            />
          </label>
          <label class="grid gap-1.5">
            <span class="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-teal)]"
              >Organization (optional)</span
            >
            <input
              id="quote-org"
              name="organization"
              type="text"
              autocomplete="organization"
              class="border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70"
            />
          </label>
          <label class="grid gap-1.5">
            <span class="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-teal)]"
              >Anything we should know? (optional)</span
            >
            <textarea
              id="quote-note"
              name="note"
              rows="3"
              class="border border-slate-900/15 rounded-sm px-3 py-2 bg-white/70"></textarea>
          </label>
          <input
            type="text"
            name="website"
            tabindex="-1"
            autocomplete="off"
            class="hidden"
            aria-hidden="true"
          />
          {
            turnstileSiteKey && (
              <div class="cf-turnstile" data-sitekey={turnstileSiteKey} data-size="flexible" />
            )
          }
          <button
            type="submit"
            class="bg-[var(--color-teal)] text-white px-4 py-3 rounded-sm font-semibold text-sm"
          >
            Send my quote →
          </button>
          <p data-quote-status role="status" aria-live="polite" class="text-sm text-slate-600"></p>
        </form>
      </div>
    </aside>
  </section>

  {
    turnstileSiteKey && (
      <script is:inline src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
    )
  }

  <!-- NOT is:inline — Vite must bundle this so the engine import resolves. -->
  <script>
    import { buildQuote, nextTierUpsell } from '@/lib/pricing/quote';

    const usd = (n: number) => '$' + n.toLocaleString('en-US');
    // Non-linear slider: 0–100 maps onto 1–6000 with resolution where it
    // matters. A linear scale would squash 1–300 into a few pixels.
    const sliderToCount = (v: number) => Math.max(1, Math.round(Math.pow(v / 100, 2.2) * 6000));
    const countToSlider = (c: number) => Math.round(Math.pow(c / 6000, 1 / 2.2) * 100);

    const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel);
    const summary = $('[data-summary-panel]')!;
    const lineList = $<HTMLUListElement>('[data-line-list]')!;
    const deadzone = $<HTMLElement>('[data-deadzone-callout]')!;
    const upsell = $<HTMLElement>('[data-upsell-callout]')!;
    const conversation = $<HTMLElement>('[data-conversation-notice]')!;
    const openFormBtn = $<HTMLButtonElement>('[data-open-form]')!;
    const form = $<HTMLFormElement>('[data-quote-form]')!;
    const status = $<HTMLElement>('[data-quote-status]')!;

    function readConfig() {
      const lines: { serviceSlug: string; count: number; markers?: number }[] = [];
      document.querySelectorAll<HTMLInputElement>('[data-service-toggle]').forEach((toggle) => {
        const slug = toggle.dataset.serviceToggle!;
        const body = document.querySelector<HTMLElement>(`[data-service-body="${slug}"]`)!;
        body.style.display = toggle.checked ? '' : 'none';
        if (!toggle.checked) return;
        const countEl = document.querySelector<HTMLInputElement>(`[data-count-input="${slug}"]`)!;
        const markersEl = document.querySelector<HTMLInputElement>(
          `[data-markers-input="${slug}"]`,
        );
        const count = Math.max(1, Math.floor(Number(countEl.value) || 1));
        const markers = markersEl ? Math.max(1, Math.floor(Number(markersEl.value) || 1)) : 1;
        lines.push(
          markers > 1 ? { serviceSlug: slug, count, markers } : { serviceSlug: slug, count },
        );
      });
      return lines;
    }

    function render() {
      const lines = readConfig();
      if (lines.length === 0) {
        $('[data-total-academic]')!.textContent = '$0';
        $('[data-total-commercial]')!.textContent = '$0';
        lineList.innerHTML =
          '<li class="italic text-slate-400">Select a service to see pricing.</li>';
        deadzone.hidden = upsell.hidden = conversation.hidden = true;
        return;
      }

      const quote = buildQuote(lines);
      $('[data-total-academic]')!.textContent = usd(quote.total.academic);
      $('[data-total-commercial]')!.textContent = usd(quote.total.commercial);

      lineList.innerHTML = quote.lines
        .map((l) => {
          const markerNote = l.markers > 1 ? ` · ${l.markers} markers` : '';
          return `<li class="flex justify-between gap-3 border-b border-slate-900/5 pb-2">
            <span>${l.serviceTitle}<br><span class="text-xs text-slate-500">${l.count.toLocaleString()} ${l.unitLabel}s${markerNote} · ${l.academic.tierRange} tier</span></span>
            <span class="font-mono text-[13px] whitespace-nowrap">${usd(l.academic.total)}</span>
          </li>`;
        })
        .join('');

      // Dead zone: buying up to a tier floor genuinely costs LESS. Only
      // here is the word "save" truthful.
      const saver = quote.lines.find((l) => l.academic.isBetterThanLiteral);
      if (saver) {
        deadzone.hidden = false;
        deadzone.innerHTML =
          `<strong>Priced at our ${saver.academic.tierRange} rate.</strong> ` +
          `That's ${usd(saver.academic.savings)} less than ${saver.count.toLocaleString()} ` +
          `${saver.unitLabel}s would cost — and you can send ${saver.academic.freeHeadroom.toLocaleString()} more ` +
          `${saver.unitLabel}s at no extra cost.`;
      } else {
        deadzone.hidden = true;
      }

      // Upsell: reaching the next tier costs MORE but lowers the unit rate.
      // Never described as a saving.
      upsell.hidden = true;
      if (!saver && quote.lines.length === 1 && !quote.needsConversation) {
        const l = quote.lines[0];
        const next = nextTierUpsell(l.serviceSlug, l.count, l.markers, 'academic');
        if (next && next.additionalCost > 0) {
          upsell.hidden = false;
          upsell.innerHTML =
            `${next.additionalUnits.toLocaleString()} more ${l.unitLabel}s costs ` +
            `${usd(next.additionalCost)} more — and drops your rate to $${next.newRate}/${l.unitLabel}.`;
        }
      }

      conversation.hidden = !quote.needsConversation;
      openFormBtn.textContent = quote.needsConversation
        ? 'Request a project quote'
        : 'Email me this quote';
    }

    document.querySelectorAll<HTMLInputElement>('[data-count-input]').forEach((el) => {
      const slug = el.dataset.countInput!;
      const slider = document.querySelector<HTMLInputElement>(`[data-count-slider="${slug}"]`);
      if (slider) slider.value = String(countToSlider(Number(el.value) || 1));
      el.addEventListener('input', () => {
        if (slider) slider.value = String(countToSlider(Number(el.value) || 1));
        render();
      });
      slider?.addEventListener('input', () => {
        el.value = String(sliderToCount(Number(slider.value)));
        render();
      });
    });
    document
      .querySelectorAll<HTMLInputElement>('[data-markers-input], [data-service-toggle]')
      .forEach((el) => el.addEventListener('input', render));

    openFormBtn.addEventListener('click', () => {
      form.hidden = false;
      openFormBtn.hidden = true;
      form.querySelector<HTMLInputElement>('#quote-name')?.focus();
    });

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      status.textContent = 'Sending…';
      status.style.color = '';
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') ?? ''),
        email: String(fd.get('email') ?? ''),
        organization: String(fd.get('organization') ?? ''),
        note: String(fd.get('note') ?? ''),
        website: String(fd.get('website') ?? ''),
        'cf-turnstile-response': String(fd.get('cf-turnstile-response') ?? ''),
        lines: readConfig(),
      };
      try {
        const res = await fetch('/api/quote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await res.json();
        if (res.ok && body.ok) {
          status.innerHTML = `Sent — your quote is <strong>${body.quoteNumber}</strong>. <a class="underline" href="${body.url}">View it</a>.`;
          status.style.color = 'var(--color-teal)';
          form.reset();
        } else {
          status.textContent = body.error ?? 'Something went wrong. Email contact@biokea.ai.';
          status.style.color = 'var(--color-pink)';
        }
      } catch {
        status.textContent = 'Network error. Please email contact@biokea.ai.';
        status.style.color = 'var(--color-pink)';
      }
    });

    render();
  </script>
</BaseLayout>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test quote.spec.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/quote/index.astro tests/e2e/quote.spec.ts
git commit -m "feat(quotes): add the /quote configurator page"
```

---

### Task 6: Retrievable quote page

**Files:**

- Create: `src/pages/quote/[token].astro`
- Test: `tests/e2e/quote.spec.ts` (append)

**Interfaces:**

- Consumes: the `quotes` table (Task 3), read server-side with `SUPABASE_SERVICE_ROLE_KEY`; the `QuoteLine` shape persisted by Task 4.
- Produces: route `/quote/<access_token>`.

**Security note:** this page must render only line items, totals, organization, quote number, and validity — never the submitter's email address. The token is the only credential, so treat the page as public.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/quote.spec.ts`:

```ts
test('an unknown quote token returns 404', async ({ page }) => {
  const res = await page.goto('/quote/00000000-0000-0000-0000-000000000000');
  expect(res?.status()).toBe(404);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test quote.spec.ts -g "unknown quote token"`
Expected: FAIL — the route doesn't exist, so Astro's 404 handling isn't exercised through this page yet. (It may pass incidentally; the meaningful verification is Step 4's manual check with a real token.)

- [ ] **Step 3: Build the page**

Create `src/pages/quote/[token].astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

interface QuoteLineRow {
  serviceTitle: string;
  unitLabel: string;
  count: number;
  markers: number;
  academic: { total: number; tierRange: string; pricedCount: number; freeHeadroom: number };
  commercial: { total: number };
}
interface QuoteRow {
  quote_number: string;
  organization: string | null;
  lines: QuoteLineRow[];
  total_academic: number;
  total_commercial: number;
  needs_conversation: boolean;
  created_at: string;
  expires_at: string;
}

const { token } = Astro.params;
const e = env as unknown as { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string };

// UUID shape check first — avoids a pointless round trip on junk tokens.
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token ?? '');

let quote: QuoteRow | null = null;
if (isUuid && e?.SUPABASE_URL && e?.SUPABASE_SERVICE_ROLE_KEY) {
  // Service role: the quotes table has no anonymous select policy. The page
  // renders on the Worker, so this key is never exposed to the client.
  const res = await fetch(
    `${e.SUPABASE_URL}/rest/v1/quotes?access_token=eq.${encodeURIComponent(token!)}&select=*`,
    {
      headers: {
        apikey: e.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  );
  if (res.ok) {
    const rows = (await res.json()) as QuoteRow[];
    quote = rows[0] ?? null;
  }
}

if (!quote) return new Response('Quote not found', { status: 404 });

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const fmtDate = (iso: string) => iso.slice(0, 10);
const expired = Date.parse(quote.expires_at) < Date.now();
---

<BaseLayout
  title={`Quote ${quote.quote_number} — BioKEA`}
  description="BioKEA sequencing quote."
  noindex
>
  <section class="max-w-3xl mx-auto px-6 pt-16 pb-8">
    <Eyebrow>QUOTE {quote.quote_number}</Eyebrow>
    <h1 class="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
      Sequencing quote
    </h1>
    {quote.organization && <p class="mt-2 text-slate-600">Prepared for {quote.organization}</p>}
    <p class="mt-1 font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">
      Issued {fmtDate(quote.created_at)} · {expired ? 'Expired' : 'Valid until'}
      {!expired && fmtDate(quote.expires_at)}
    </p>
  </section>

  <section class="max-w-3xl mx-auto px-6 pb-10">
    <table
      class="w-full border-collapse bg-white border border-slate-900/10 rounded-md overflow-hidden"
    >
      <thead>
        <tr class="bg-[var(--color-ink)] text-white text-left">
          <th class="px-4 py-3 text-[13px] font-semibold">Service</th>
          <th class="px-4 py-3 text-[13px] font-semibold text-right">Academic</th>
          <th class="px-4 py-3 text-[13px] font-semibold text-right">Commercial</th>
        </tr>
      </thead>
      <tbody>
        {
          quote.lines.map((l) => (
            <tr class="border-t border-slate-900/10">
              <td class="px-4 py-4 text-sm text-[var(--color-ink)]">
                <div class="font-semibold">{l.serviceTitle}</div>
                <div class="text-xs text-slate-500 mt-1">
                  {l.count.toLocaleString()} {l.unitLabel}s
                  {l.markers > 1 && ` · ${l.markers} markers`} · {l.academic.tierRange} tier
                  {l.academic.freeHeadroom > 0 &&
                    ` · may ship up to ${l.academic.pricedCount.toLocaleString()} at this price`}
                </div>
              </td>
              <td class="px-4 py-4 text-sm font-mono text-right whitespace-nowrap">
                {usd(l.academic.total)}
              </td>
              <td class="px-4 py-4 text-sm font-mono text-right whitespace-nowrap">
                {usd(l.commercial.total)}
              </td>
            </tr>
          ))
        }
        <tr class="border-t-2 border-slate-900/20 bg-[var(--color-cream)]">
          <td class="px-4 py-4 text-sm font-semibold text-[var(--color-ink)]">Total</td>
          <td class="px-4 py-4 font-mono font-semibold text-right">{usd(quote.total_academic)}</td>
          <td class="px-4 py-4 font-mono font-semibold text-right">{usd(quote.total_commercial)}</td
          >
        </tr>
      </tbody>
    </table>

    {
      quote.needs_conversation && (
        <p class="mt-5 text-sm text-[var(--color-ink)] bg-[rgba(146,64,14,0.1)] border-l-2 border-[var(--color-ochre)] rounded-r-sm px-4 py-3 leading-relaxed">
          At this volume, figures are indicative. We'll confirm sequencing capacity, timeline, and
          final pricing before anything is committed.
        </p>
      )
    }

    <div class="mt-6 text-xs text-slate-500 leading-relaxed">
      <p>
        Academic/nonprofit rates require eligible institutional status, confirmed at ordering. Final
        pricing is based on the {quote.lines[0]?.unitLabel ?? 'sample'} count actually received. Turnaround
        is typically 4–8 weeks from sample receipt.
      </p>
      <p class="mt-2">
        Questions? <a href="mailto:contact@biokea.ai" class="text-[var(--color-teal)] underline"
          >contact@biokea.ai</a
        > · BioKEA · Berkeley, CA
      </p>
    </div>

    <button
      type="button"
      onclick="window.print()"
      class="mt-8 bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium print:hidden"
    >
      Print / save as PDF
    </button>
  </section>
</BaseLayout>
```

- [ ] **Step 4: Verify end to end with a real quote**

Start the dev server (`npm run dev`), open `http://localhost:4321/quote`, configure 600 barcoding specimens, submit the form with a real email, then follow the returned link.

Expected: the quote page renders with quote number, both totals ($7,200 / $9,000), the tier label, and a working "Print / save as PDF" button. Confirm via view-source that **no email address appears anywhere** in the served HTML.

- [ ] **Step 5: Run tests**

Run: `npx playwright test quote.spec.ts`
Expected: PASS, all tests including the 404 case.

- [ ] **Step 6: Commit**

```bash
git add src/pages/quote/\[token\].astro tests/e2e/quote.spec.ts
git commit -m "feat(quotes): add retrievable print-styled quote page"
```

---

### Task 7: Cross-links from nav, footer, pricing, and services

**Files:**

- Modify: `src/components/layout/Nav.astro`
- Modify: `src/components/layout/Footer.astro`
- Modify: `src/pages/pricing.astro`
- Modify: `src/pages/services.astro`
- Test: `tests/e2e/nav.spec.ts`, `tests/e2e/pricing.spec.ts`

**Interfaces:**

- Consumes: route `/quote` (Task 5).

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/nav.spec.ts`, replace the `"What we do" dropdown` test body's assertions with a version that also expects Quote:

```ts
test('"What we do" dropdown reveals Services, Pricing, Quote, and Lab', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('What we do', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
    'href',
    '/pricing',
  );
  await expect(desktop.getByRole('link', { name: 'Quote', exact: true })).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(desktop.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
});
```

Append to `tests/e2e/pricing.spec.ts`:

```ts
test('pricing page links to the quote configurator', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('link', { name: /Build your quote/i }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test nav.spec.ts pricing.spec.ts`
Expected: FAIL — no Quote nav item, no link from `/pricing`.

- [ ] **Step 3: Add the nav and footer links**

In `src/components/layout/Nav.astro`, update the "What we do" group:

```ts
  {
    label: 'What we do',
    items: [
      { href: '/services', label: 'Services' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/quote', label: 'Quote' },
      { href: '/lab', label: 'Lab' },
    ],
  },
```

In `src/components/layout/Footer.astro`, add a Quote entry right after the Pricing one:

```astro
<li><a href="/quote">Quote</a></li>
```

- [ ] **Step 4: Add the CTA on /pricing**

In `src/pages/pricing.astro`, in the hero's button row, add a link immediately after the existing "Request a quote" anchor:

```astro
<a
  href="/quote"
  class="bg-[var(--color-teal)] text-white px-4 py-2.5 rounded-sm text-sm font-medium"
>
  Build your quote →
</a>
```

- [ ] **Step 5: Point the /services pricing links at the configurator**

In `src/pages/services.astro`, the two catalog rows currently link to `/pricing#<anchor>`. Leave those as they are (they point at the rate card, which is the right destination for "what does this cost"), and add one line after the existing BioInfoOS paragraph at the end of the FAQ section:

```astro
<p class="mt-3 text-sm text-slate-500 leading-relaxed">
  Know your sample count?
  <a href="/quote" class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
    >Build an itemized quote in about a minute</a
  >.
</p>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test nav.spec.ts pricing.spec.ts services.spec.ts`
Expected: PASS, all tests in all three files.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Nav.astro src/components/layout/Footer.astro \
  src/pages/pricing.astro src/pages/services.astro \
  tests/e2e/nav.spec.ts tests/e2e/pricing.spec.ts
git commit -m "feat(quotes): link the quote configurator from nav, footer, pricing, services"
```

---

### Task 8: Full verification sweep

**Files:** none (verification only, plus a possible lint-fix commit).

- [ ] **Step 1: Type-check**

Run: `npm run check`
Expected: 0 errors. (7 pre-existing hints about deprecated zod `.email()`/`.uuid()` are expected and unrelated.)

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all pass, including the new `pricing-engine` and `quote-api` suites and the updated `content-data` suite.

- [ ] **Step 3: Full e2e suite**

Run: `npm run test:e2e`
Expected: all pass. `pricing.spec.ts` in particular must still pass unchanged apart from the new link test — the tier label edits in Task 1 don't touch the dollar amounts or the `5,000+` / `200+` labels it asserts on.

- [ ] **Step 4: Lint**

Run: `npm run lint`
If violations are reported, run `npm run format`, then re-run `npm run lint` to confirm it's clean.

- [ ] **Step 5: Manual spot-check**

With the dev server running, confirm in a browser:

- `/quote` — count 275 shows **$3,600** with the dead-zone callout mentioning 25 more specimens
- `/quote` — count 600 shows **$7,200**, no dead-zone callout, and the word "save" appears nowhere in the summary
- `/quote` — count 4000 shows the conversation notice and a "Request a project quote" button
- `/quote` — eDNA at 100 samples × 3 markers shows **$15,400**
- `/pricing` — tier labels now read `1–299`, `300–999`, `1,000–4,999`, `5,000+`
- Nav "What we do" shows Services / Pricing / Quote / Lab

- [ ] **Step 6: Commit** (only if Step 4 modified files)

```bash
git add -u
git commit -m "chore: lint fixes from quote calculator implementation"
```
