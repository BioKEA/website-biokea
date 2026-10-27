# Pricing Catalog and Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish all four sequencing services with approved prices on `/pricing`, make `/services` the no-prices "how we work" page, and add a four-card services strip with honest price ranges to the homepage, all rendered from one data file.

**Architecture:** `src/data/pricing.ts` stays the single source of truth and grows additively (new exports; the existing `pricedServices` export is left byte-compatible for the live widget and pricing engine). `src/data/services.ts` gains a `kind` so pages and text feeds can group offerings. Three Astro pages are rebuilt or trimmed from that data; one new section component renders the homepage strip. No engine, API, widget, or Shopify code changes.

**Tech Stack:** Astro v6 (server output, Cloudflare adapter), Tailwind v4 utilities with the site's CSS tokens, TypeScript, Vitest (unit, `tests/unit`), Playwright (e2e, `tests/e2e`, runs against `npm run dev` on port 4321), Prettier via lint-staged on commit.

**Spec:** `docs/superpowers/specs/2026-10-26-pricing-catalog-and-pages-design.md`

## Global Constraints

- `pricedServices` keeps its export name, its two slugs `barcoding` and `metabarcoding`, the `PriceTier` shape, every tier number, `additionalMarkerPrice: { academic: 12, commercial: 15 }` on eDNA, and `conversationThreshold: 3001` on barcoding. Its two `title` strings (`Voucher-Linked Specimen Barcoding`, `Environmental DNA (eDNA) Metabarcoding`) are unchanged: payment emails and their tests print them.
- `/services` renders no `$` anywhere in body text, and its Service JSON-LD nodes carry no `offers`.
- The eDNA anchor is `#metabarcoding` everywhere. Never `#edna`.
- Nothing is added to `public/` except the one-line edit to `public/llms.txt`.
- No change to `src/lib/pricing/`, `src/widget/`, `src/pages/api/`, `src/lib/payments/`, or `src/data/version.ts`.
- Copy for the four services is lifted from `docs/source/mockups/pricing.html`; the site's own design system (Inter, cream, ink, teal, existing components) is used, never the mockup's CSS.
- Every dollar figure rendered on a page comes from `src/data/pricing.ts`, formatted with `usd()` from `src/lib/pricing/format.ts`. No hand-typed prices in `.astro` files.
- Run `npm run check` (astro check) before each commit that touches `.astro` files. Run `npm run lint` before the final commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. **A tier with equal academic and commercial prices** (none today, but the data file is edited by hand): `priceRange()` must still return a correct min and max rather than assume commercial is always higher. Pinned in Task 1 by the `priceRange` test that computes expectations from the data, not from literals alone.
2. **A visitor on a 360px phone reading the comparison table**: four columns must scroll horizontally inside the page rather than widen the whole page. Pinned in Task 3 by an e2e test that sets a 360px viewport and asserts `document.documentElement.scrollWidth <= window.innerWidth`.
3. **A screen-reader user on `/pricing`**: each section's `<h2>` must be the accessible name reached from the sticky nav, and the comparison table must have a caption. Pinned in Task 3 by the e2e test that finds every section by `getByRole('heading', { name })` and asserts a visually hidden caption exists.
4. **An unknown slug passed to `priceRange()`** (a typo in a future page): must return `null`, not throw or return `{ Infinity, -Infinity }`. Pinned in Task 1.
5. **The services page accidentally printing a price** when someone later adds a description containing a dollar amount: pinned in Task 4 by the existing "no `$`" e2e test, which is kept, plus a unit test in Task 2 asserting no `serviceOffering.description` contains `$`.

---

### Task 1: Extend the pricing data file

**Files:**

- Modify: `src/data/pricing.ts` (whole file replaced; the `pricedServices` numbers are unchanged)
- Create: `src/lib/pricing/format.ts`
- Test: `tests/unit/content-data.test.ts` (append a new `describe` block)

**Interfaces:**

- Consumes: nothing new.
- Produces (all exported from `src/data/pricing.ts`):
  - `pricedServices: PricedService[]` (unchanged shape except `addonNote` → `addons: { title: string; body: string }[]`)
  - `identificationOnlyBarcoding: { slug: 'barcoding-id-only'; title: string; price: 5; description: string }`
  - `barcodingExtraMarkerFraction: 0.75`
  - `confidenceRatings: { level: 'High' | 'Moderate' | 'Unresolved'; meaning: string }[]`
  - `metagenomics: { slug: 'metagenomics'; serviceTag; title; tagline; description; included: string[]; assays: Assay[]; unitLabel: 'specimen'; notes: string[] }` where `Assay = { id: 'mg' | 'mt'; title; description; academicPrice; commercialPrice }`
  - `targetedEdna: { slug: 'targeted-edna'; serviceTag; title; tagline; description; customQuote: true }`
  - `samplingKitPrice: 20`
  - `comparisonRows: { label; barcoding; metabarcoding; metagenomics; targetedEdna }[]`
  - `pricingSections: { id: string; label: string }[]`
  - `priceRange(slug: string): { min: number; max: number; unit: string } | null`
  - from `src/lib/pricing/format.ts`: `usd(n: number): string` → `'$' + n.toLocaleString('en-US')`

- [ ] **Step 1: Write the failing tests**

Add the two `import` lines below to the import block at the top of `tests/unit/content-data.test.ts`, and append the `describe` block to the end of the file:

```ts
import {
  identificationOnlyBarcoding,
  barcodingExtraMarkerFraction,
  confidenceRatings,
  metagenomics,
  targetedEdna,
  samplingKitPrice,
  comparisonRows,
  pricingSections,
  priceRange,
} from '@/data/pricing';
import { usd } from '@/lib/pricing/format';

describe('pricing data — catalog additions (spec 2026-10-26)', () => {
  it('identification-only barcoding is a flat $5', () => {
    expect(identificationOnlyBarcoding.slug).toBe('barcoding-id-only');
    expect(identificationOnlyBarcoding.price).toBe(5);
    expect(identificationOnlyBarcoding.description.length).toBeGreaterThan(40);
  });

  it('extra barcoding markers cost 75% of the per-specimen rate', () => {
    expect(barcodingExtraMarkerFraction).toBe(0.75);
  });

  it('three confidence ratings, High / Moderate / Unresolved, each with a meaning', () => {
    expect(confidenceRatings.map((r) => r.level)).toEqual(['High', 'Moderate', 'Unresolved']);
    for (const r of confidenceRatings) expect(r.meaning.length).toBeGreaterThan(10);
  });

  it('metagenomics has two assays priced per specimen, commercial above academic', () => {
    expect(metagenomics.slug).toBe('metagenomics');
    expect(metagenomics.unitLabel).toBe('specimen');
    expect(metagenomics.assays.map((a) => a.id)).toEqual(['mg', 'mt']);
    const mg = metagenomics.assays[0];
    const mt = metagenomics.assays[1];
    expect([mg.academicPrice, mg.commercialPrice]).toEqual([2400, 3000]);
    expect([mt.academicPrice, mt.commercialPrice]).toEqual([3350, 4200]);
    for (const a of metagenomics.assays) expect(a.commercialPrice).toBeGreaterThan(a.academicPrice);
    expect(metagenomics.included.length).toBeGreaterThanOrEqual(4);
    expect(metagenomics.notes.length).toBeGreaterThanOrEqual(1);
  });

  it('targeted eDNA is a custom quote with no prices', () => {
    expect(targetedEdna.slug).toBe('targeted-edna');
    expect(targetedEdna.customQuote).toBe(true);
    expect(JSON.stringify(targetedEdna)).not.toMatch(/price/i);
  });

  it('sampling kits are $20', () => {
    expect(samplingKitPrice).toBe(20);
  });

  it('comparison rows fill every column', () => {
    expect(comparisonRows.length).toBeGreaterThanOrEqual(4);
    for (const row of comparisonRows) {
      for (const key of [
        'label',
        'barcoding',
        'metabarcoding',
        'metagenomics',
        'targetedEdna',
      ] as const) {
        expect(row[key].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('pricing sections are the four anchors in display order', () => {
    expect(pricingSections.map((s) => s.id)).toEqual([
      'barcoding',
      'metabarcoding',
      'metagenomics',
      'targeted-edna',
    ]);
    for (const s of pricingSections) expect(s.label.length).toBeGreaterThan(0);
  });

  it('priceRange spans every tier and both audiences, and is computed from the data', () => {
    expect(priceRange('barcoding')).toEqual({ min: 6, max: 20, unit: 'specimen' });
    expect(priceRange('metabarcoding')).toEqual({ min: 115, max: 205, unit: 'sample' });
    expect(priceRange('metagenomics')).toEqual({ min: 2400, max: 4200, unit: 'specimen' });
    // Cross-check against the data rather than trusting the literals above.
    const b = pricedServices.find((s) => s.slug === 'barcoding')!;
    const all = b.tiers.flatMap((t) => [t.academicPrice, t.commercialPrice]);
    expect(priceRange('barcoding')).toEqual({
      min: Math.min(...all),
      max: Math.max(...all),
      unit: b.unitLabel,
    });
  });

  it('priceRange is null for custom-quote and unknown slugs', () => {
    expect(priceRange('targeted-edna')).toBeNull();
    expect(priceRange('no-such-service')).toBeNull();
  });

  it('barcoding and eDNA have structured add-ons instead of a free-text note', () => {
    for (const s of pricedServices) {
      expect(Array.isArray(s.addons)).toBe(true);
      expect(s.addons.length).toBeGreaterThanOrEqual(1);
      for (const a of s.addons) {
        expect(a.title.length).toBeGreaterThan(0);
        expect(a.body.length).toBeGreaterThan(0);
      }
      expect((s as unknown as { addonNote?: string }).addonNote).toBeUndefined();
    }
  });

  it('usd formats whole dollars with thousands separators', () => {
    expect(usd(5)).toBe('$5');
    expect(usd(2400)).toBe('$2,400');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/content-data.test.ts`
Expected: FAIL — `identificationOnlyBarcoding` (and the other new names) are not exported from `@/data/pricing`; `@/lib/pricing/format` cannot be resolved.

- [ ] **Step 3: Create the formatter**

Create `src/lib/pricing/format.ts`:

```ts
// src/lib/pricing/format.ts
//
// One dollar formatter for pages. The widget (src/widget/template.ts) and
// the quote API each carry their own copy because the widget bundle must
// stay self-contained; pages import this one.
export const usd = (n: number): string => '$' + n.toLocaleString('en-US');
```

- [ ] **Step 4: Replace `src/data/pricing.ts`**

Replace the whole file with the following. The `pricedServices` tier numbers, slugs, titles, `additionalMarkerPrice`, and `conversationThreshold` are identical to the current file.

```ts
// src/data/pricing.ts
// Published pricing for BioKEA's sequencing services. Source of truth for
// /pricing, the homepage services strip, the Service/Offer JSON-LD on
// /pricing, and (via `pricedServices`) the quote widget and pricing engine.
//
// `pricedServices` holds the two volume-tiered offerings the quote widget
// and src/lib/pricing/quote.ts price today. Its shape and numbers are load-
// bearing for the money path; change them only with the engine (spec 2).
// Everything below it is page content added by the 2026-10-26 catalog spec.

export interface PriceTier {
  range: string; // display label, e.g. "1–299"
  description: string;
  academicPrice: number;
  commercialPrice: number;
  minQty: number;
  maxQty?: number; // undefined ONLY on the final, open-ended tier
  best?: boolean;
}

export interface Addon {
  title: string;
  body: string;
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
  addons: Addon[];
  // Per-unit surcharge for each marker beyond the first. eDNA only.
  additionalMarkerPrice?: { academic: number; commercial: number };
  // At or above this count, the configurator shows an indicative range
  // instead of a firm quote and routes to a conversation — covering both
  // the expensive dead zone and a sequencing-capacity check.
  conversationThreshold?: number;
}

export const pricedServices: PricedService[] = [
  {
    slug: 'barcoding',
    serviceTag: 'Specimen-level identification',
    title: 'Voucher-Linked Specimen Barcoding',
    tagline: 'Identify individual specimens, with a confidence rating on every result.',
    description:
      'Every specimen is imaged, DNA-barcoded, and identified to the finest level the reference data support. Each identification comes with a confidence rating, a preserved voucher image, and a reference sequence. Built for bulk-sorted bycatch, biodiversity surveys, and museum and collection backlogs.',
    advantages: [
      {
        title: 'Specimen-level confirmation',
        body: 'Every identification is tied to one physical, re-examinable voucher, not just a community-level signal.',
      },
      {
        title: 'A useful complement to eDNA',
        body: 'Ground-truth eDNA detections, or build the reference sequences your eDNA assays are matched against.',
      },
      {
        title: 'Voucher and image included',
        body: 'Every specimen is preserved and imaged, so results can be re-checked or re-examined at any time.',
      },
    ],
    included: [
      'Imaging and non-destructive DNA extraction of every specimen (voucher preserved)',
      'COI barcode sequencing on Oxford Nanopore',
      'Taxonomic identification against BOLD and NCBI reference databases',
      'A confidence rating for every identification',
      'Sample summary: species list, counts, and diversity per sample',
      'Quality controls on every plate, plus the reason for any specimen we couldn’t identify',
      'An interactive data dashboard, plus data files with the image, sequence, and ID for each specimen, ready for BOLD and GBIF',
    ],
    unitLabel: 'specimen',
    tiers: [
      {
        range: '1–299',
        description: 'Small batches and pilot runs',
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
    conversationThreshold: 3001,
    addons: [
      {
        title: 'Other or multiple markers',
        body: '16S, 18S, ITS, 12S, and more, in place of or alongside COI. Each added marker is 75% of your per-specimen rate.',
      },
      {
        title: 'Bulk eDNA from the sample preservative',
        body: 'Detects taxa too small, damaged, or missed at sorting. Priced per sample at the eDNA metabarcoding rates, including any additional markers.',
      },
    ],
  },
  {
    slug: 'metabarcoding',
    serviceTag: 'Community-level detection',
    title: 'Environmental DNA (eDNA) Metabarcoding',
    tagline: 'Survey whole communities from a single sample.',
    description:
      'No specimens required. From an already-collected water, soil, sediment, or air sample, detect species within your group of interest, such as fish, invertebrates, or general eukaryotes, using a targeted marker. Run one marker, or stack several in the same project.',
    advantages: [],
    included: [
      'Extraction from your already-collected samples (water, soil, sediment, or air filters)',
      'PCR amplification for each target marker',
      'Library indexing, pooling, and Oxford Nanopore sequencing',
      'Bioinformatics: taxonomic assignment and quality control',
      'Digital report: full list of taxa detected within your target group, per sample',
    ],
    unitLabel: 'sample',
    tiers: [
      {
        range: '1–48',
        description: 'Small batches and pilot runs',
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
    addons: [
      {
        title: 'Additional markers',
        body: 'Stack fish, invertebrate, and general-eukaryote panels on the same samples. $12 per sample, per added marker (academic and nonprofit) or $15 (commercial).',
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Catalog additions (2026-10-26). Page content only until spec 2 teaches the
// engine and the widget about them.

export const identificationOnlyBarcoding = {
  slug: 'barcoding-id-only',
  title: 'Identification only, no voucher',
  price: 5, // per specimen, flat, any volume, any client type
  description:
    'A lower-cost option when you don’t need specimens kept. You receive a DNA identification and confidence rating for each specimen, at a flat rate for any volume and any client type. Specimens aren’t retained as vouchers, but you’ll receive an image of each one in its sample well.',
} as const;

/** Each marker after the first adds this fraction of the per-specimen tier rate. */
export const barcodingExtraMarkerFraction = 0.75;

export const confidenceRatings: {
  level: 'High' | 'Moderate' | 'Unresolved';
  meaning: string;
}[] = [
  { level: 'High', meaning: 'Confident species-level match.' },
  { level: 'Moderate', meaning: 'Reliable to genus, or a close but not exact species match.' },
  {
    level: 'Unresolved',
    meaning: 'No close reference match. The specimen may be undescribed or not yet barcoded.',
  },
];

export interface Assay {
  id: 'mg' | 'mt';
  title: string;
  description: string;
  academicPrice: number;
  commercialPrice: number;
}

export const metagenomics = {
  slug: 'metagenomics',
  serviceTag: 'Whole-community sequencing',
  title: 'Metagenome and metatranscriptome sequencing',
  tagline: 'See everything living in and on a specimen, and what it’s doing.',
  description:
    'Available for single specimens. A metagenome sequences all the DNA in a specimen: the organism itself plus its microbiome, symbionts, and pathogens. A metatranscriptome sequences RNA to show which genes the specimen and its microbes are actively using.',
  included: [
    'High molecular weight DNA extraction (metagenome) or RNA extraction (metatranscriptome)',
    'Library preparation for long-read sequencing',
    'Oxford Nanopore sequencing on a dedicated flow cell for each specimen',
    'Data analysis',
    'Access to your data and visualizations in a custom dashboard',
  ],
  assays: [
    {
      id: 'mg',
      title: 'Metagenome',
      description: 'All the DNA in the specimen',
      academicPrice: 2400,
      commercialPrice: 3000,
    },
    {
      id: 'mt',
      title: 'Metatranscriptome',
      description: 'Active genes, from RNA',
      academicPrice: 3350,
      commercialPrice: 4200,
    },
  ] as Assay[],
  unitLabel: 'specimen',
  notes: [
    'Metatranscriptomes need specimens preserved for RNA, such as flash-frozen or stored in an RNA preservative.',
    'Working with environmental samples like water, soil, or sediment? We’ll consult on your project and quote at a similar rate.',
  ],
};

export const targetedEdna = {
  slug: 'targeted-edna',
  serviceTag: 'Species-specific detection',
  title: 'Targeted eDNA for one or more species',
  tagline: 'Custom quotes for detecting and measuring the species you care about.',
  description:
    'We specialize in applying qPCR to measure the presence and abundance of species in a variety of sample types, and in developing custom assays for species of interest. Reach out to discuss your needs and we’ll be happy to provide a custom quote.',
  customQuote: true as const,
};

/** Per kit, any sample type. Sold by the configurator from spec 2 onward. */
export const samplingKitPrice = 20;

export interface ComparisonRow {
  label: string;
  barcoding: string;
  metabarcoding: string;
  metagenomics: string;
  targetedEdna: string;
}

export const comparisonRows: ComparisonRow[] = [
  {
    label: 'What it tells you',
    barcoding: 'One identification per physical specimen, with a confidence rating.',
    metabarcoding:
      'Which taxa in your group of interest are present across a whole assemblage, based on the markers applied.',
    metagenomics:
      'All the DNA in a specimen, including its microbiome, symbionts, and pathogens, or which genes are active (from RNA).',
    targetedEdna:
      'Whether specific species are present and, if needed, how much of their DNA is in the sample.',
  },
  {
    label: 'Input required',
    barcoding: 'Physical specimens, sorted or bulk-collected.',
    metabarcoding: 'An already-collected water, soil, sediment, or air sample or filter.',
    metagenomics:
      'Single specimens. Metatranscriptomes need specimens preserved for RNA. Environmental samples by consultation.',
    targetedEdna: 'Water, soil, sediment, air, tissue, or swab samples.',
  },
  {
    label: 'Resolution',
    barcoding:
      'Individual specimen, with an image and, for voucher-linked barcoding, a preserved voucher.',
    metabarcoding:
      'Community-wide presence or absence across many taxa at once, not individual counts.',
    metagenomics:
      'Genome- and gene-level detail across the organisms in the specimen, from long reads.',
    targetedEdna:
      'One or a few target species, detected with high sensitivity. Measures DNA quantity, not individual counts.',
  },
  {
    label: 'Best for',
    barcoding:
      'Bulk-sorted bycatch, biodiversity surveys, museum and collection backlogs, reference-library building.',
    metabarcoding:
      'Rapid biodiversity screening, monitoring cryptic or elusive species, sites where physical collection is impractical.',
    metagenomics:
      'Host-microbe and symbiont studies, pathogen screening, and understanding what an organism and its microbes are doing.',
    targetedEdna:
      'Early detection of invasive species, monitoring rare or listed species, tracking a known pest or pathogen.',
  },
  {
    label: 'Pricing',
    barcoding: 'Per specimen, by volume tier.',
    metabarcoding: 'Per sample, by volume tier.',
    metagenomics: 'Per specimen.',
    targetedEdna: 'Custom quote.',
  },
];

/** Display order and anchors for /pricing, the homepage strip, and in-page nav. */
export const pricingSections: { id: string; label: string }[] = [
  { id: 'barcoding', label: 'Barcoding' },
  { id: 'metabarcoding', label: 'eDNA' },
  { id: 'metagenomics', label: 'Metagenomics' },
  { id: 'targeted-edna', label: 'Targeted eDNA' },
];

/**
 * Honest price range for a service across all tiers and both audiences.
 * `null` for custom-quote services and unknown slugs. Used wherever a page
 * summarises a service in one line, so "from $6" never appears: only the
 * largest academic programme gets that rate.
 */
export function priceRange(slug: string): { min: number; max: number; unit: string } | null {
  const svc = pricedServices.find((s) => s.slug === slug);
  if (svc) {
    const all = svc.tiers.flatMap((t) => [t.academicPrice, t.commercialPrice]);
    return { min: Math.min(...all), max: Math.max(...all), unit: svc.unitLabel };
  }
  if (slug === metagenomics.slug) {
    const all = metagenomics.assays.flatMap((a) => [a.academicPrice, a.commercialPrice]);
    return { min: Math.min(...all), max: Math.max(...all), unit: metagenomics.unitLabel };
  }
  return null;
}
```

- [ ] **Step 5: Run the unit tests to verify they pass**

Run: `npx vitest run tests/unit/content-data.test.ts tests/unit/widget-template.test.ts tests/unit/payments-terms.test.ts tests/unit/quote-payments-email.test.ts`
Expected: all PASS. The three non-content suites prove the widget, the engine, and the payment emails still read `pricedServices` unchanged.

- [ ] **Step 6: Fix the one compile error the rename causes**

`src/pages/pricing.astro` still reads `service.addonNote`. Task 3 replaces that file entirely, but the type check must stay green now. Open `src/pages/pricing.astro` and change the one line

```astro
{service.addonNote}
```

to

```astro
{service.addons.map((a) => `${a.title}: ${a.body}`).join(' ')}
```

Run: `npm run check`
Expected: `0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/data/pricing.ts src/lib/pricing/format.ts tests/unit/content-data.test.ts src/pages/pricing.astro
git commit -m "feat(pricing): catalog data for all four services, price ranges, structured add-ons

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Restructure the services catalog data

**Files:**

- Modify: `src/data/services.ts` (whole file replaced)
- Modify: `src/pages/llms-full.txt.ts:89-95` (`renderServiceOfferings`)
- Test: `tests/unit/content-data.test.ts` (append)

**Interfaces:**

- Consumes: `pricingSections` from Task 1.
- Produces: `serviceOfferings: ServiceOffering[]` with
  `ServiceOffering = { name: string; description?: string; kind: 'priced' | 'project-rate'; pricingAnchor?: string; configurable?: boolean }`.

- [ ] **Step 1: Write the failing tests**

Add `import { serviceOfferings } from '@/data/services';` to the import block at the top of `tests/unit/content-data.test.ts`, and append to the end of the file:

```ts
describe('services data — priced and project-rate groups (spec 2026-10-26)', () => {
  it('has eight offerings: four priced, then four project-rate', () => {
    expect(serviceOfferings).toHaveLength(8);
    expect(serviceOfferings.slice(0, 4).every((s) => s.kind === 'priced')).toBe(true);
    expect(serviceOfferings.slice(4).every((s) => s.kind === 'project-rate')).toBe(true);
  });

  it('priced rows anchor to the four pricing sections in order', () => {
    const anchors = serviceOfferings.filter((s) => s.kind === 'priced').map((s) => s.pricingAnchor);
    expect(anchors).toEqual(pricingSections.map((s) => s.id));
  });

  it('only barcoding and eDNA are configurable in the quote widget today', () => {
    const byAnchor = Object.fromEntries(
      serviceOfferings
        .filter((s) => s.kind === 'priced')
        .map((s) => [s.pricingAnchor, s.configurable]),
    );
    expect(byAnchor).toEqual({
      barcoding: true,
      metabarcoding: true,
      metagenomics: false,
      'targeted-edna': false,
    });
  });

  it('project-rate rows carry no anchor and no configurable flag', () => {
    for (const s of serviceOfferings.filter((s) => s.kind === 'project-rate')) {
      expect(s.pricingAnchor).toBeUndefined();
      expect(s.configurable).toBeUndefined();
    }
  });

  it('no description contains a dollar sign — /services must stay price-free', () => {
    for (const s of serviceOfferings) {
      expect(s.name).not.toContain('$');
      expect(s.description ?? '').not.toContain('$');
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/content-data.test.ts`
Expected: FAIL — `serviceOfferings` has 7 entries and no `kind`.

- [ ] **Step 3: Replace `src/data/services.ts`**

```ts
// src/data/services.ts
// Service offerings catalog. Source of truth for /services (grouped into
// priced and project-rate), the Service JSON-LD on that page, and the
// services block of /llms-full.txt. Prices themselves live only in
// src/data/pricing.ts and are rendered only on /pricing and the homepage
// strip; /services stays dollar-free by policy (tests/e2e/services.spec.ts).

export interface ServiceOffering {
  name: string;
  description?: string;
  /** `priced` rows have a rate card on /pricing; `project-rate` rows are quoted per request. */
  kind: 'priced' | 'project-rate';
  /** Section id on /pricing. Priced rows only. */
  pricingAnchor?: string;
  /** True when /quote can price the service today. Priced rows only.
   * Metagenomics flips to true with the configurator work (spec 2);
   * targeted eDNA is always a consultation and stays false. */
  configurable?: boolean;
}

export const serviceOfferings: ServiceOffering[] = [
  {
    name: 'Voucher-linked specimen barcoding',
    description:
      'Every specimen imaged, non-destructively extracted, COI-barcoded on Oxford Nanopore, and identified with a confidence rating. Other markers available.',
    kind: 'priced',
    pricingAnchor: 'barcoding',
    configurable: true,
  },
  {
    name: 'Environmental DNA (eDNA) metabarcoding',
    description:
      'Community-level detection from water, soil, sediment, or air samples, one marker or several stacked on the same samples.',
    kind: 'priced',
    pricingAnchor: 'metabarcoding',
    configurable: true,
  },
  {
    name: 'Metagenome and metatranscriptome sequencing',
    description:
      'All the DNA in a specimen, or the genes it and its microbes are actively using, on a dedicated long-read flow cell per specimen.',
    kind: 'priced',
    pricingAnchor: 'metagenomics',
    configurable: false,
  },
  {
    name: 'Targeted eDNA (qPCR) for one or more species',
    description:
      'Presence and abundance of specific species by qPCR, with custom assay development where no published assay exists.',
    kind: 'priced',
    pricingAnchor: 'targeted-edna',
    configurable: false,
  },
  {
    name: 'Study design',
    description: 'Best-practices consultation on sampling, replication, controls, and analysis.',
    kind: 'project-rate',
  },
  {
    name: 'Bioinformatic data analysis and interpretation',
    description: 'Read processing, taxonomy reconciliation, downstream statistics, written report.',
    kind: 'project-rate',
  },
  {
    name: 'Custom eDNA / qPCR assay design and validation',
    description:
      'New-species or cross-species assay design including primer/probe optimization and specificity validation.',
    kind: 'project-rate',
  },
  {
    name: 'Field collection assistance',
    description:
      'Sampling protocol development and field collection support. Bay Area projects in person; remote consult elsewhere.',
    kind: 'project-rate',
  },
];
```

- [ ] **Step 4: Group the offerings in `llms-full.txt`**

In `src/pages/llms-full.txt.ts`, replace the `renderServiceOfferings` function (currently lines 89–95):

```ts
const renderServiceOfferings = () => {
  const row = (s: (typeof serviceOfferings)[number]) => {
    const desc = s.description ? `\n  ${s.description}` : '';
    const link = s.pricingAnchor ? `\n  Pricing: ${SITE}/pricing#${s.pricingAnchor}` : '';
    return `- **${s.name}**${desc}${link}`;
  };
  const priced = serviceOfferings
    .filter((s) => s.kind === 'priced')
    .map(row)
    .join('\n');
  const projectRate = serviceOfferings
    .filter((s) => s.kind === 'project-rate')
    .map(row)
    .join('\n');
  return [
    '### Priced services (rate cards on /pricing; academic/nonprofit and commercial rates)',
    priced,
    '',
    '### Project-rate services (quoted per request)',
    projectRate,
  ].join('\n');
};
```

`SITE` is already defined near the top of that file (grep `const SITE`).

- [ ] **Step 5: Run the tests and the type check**

Run: `npx vitest run tests/unit/content-data.test.ts && npm run check`
Expected: unit PASS; `astro check` reports errors only in `src/pages/services.astro` if any (it reads `pricingAnchor` which still exists, so expect 0 errors).

- [ ] **Step 6: Commit**

```bash
git add src/data/services.ts src/pages/llms-full.txt.ts tests/unit/content-data.test.ts
git commit -m "feat(services): group offerings into priced and project-rate; fix the qPCR anchor

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Rebuild `/pricing`

**Files:**

- Create: `src/components/ui/NamedPriceRows.astro`
- Create: `src/components/ui/AddonsPanel.astro`
- Modify: `src/pages/pricing.astro` (whole file replaced)
- Test: `tests/e2e/pricing.spec.ts` (whole file replaced)

**Interfaces:**

- Consumes: everything exported by `src/data/pricing.ts` (Task 1), `usd` (Task 1), `PriceLadder`, `PageNav`, `Eyebrow`, `CtaBand`, `stringifyJsonLd`.
- Produces: section ids `barcoding`, `metabarcoding`, `metagenomics`, `targeted-edna`, `compare` on `/pricing`, which Tasks 4 and 5 link to.

- [ ] **Step 1: Write the failing e2e tests**

Replace `tests/e2e/pricing.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const jsonLdGraph = async (page: import('@playwright/test').Page) => {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']));
};

test('pricing page renders hero and all four service sections', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Pricing for barcoding, eDNA, and metagenomic sequencing',
  );
  await expect(
    page.getByRole('heading', { name: 'Voucher-Linked Specimen Barcoding' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Environmental DNA (eDNA) Metabarcoding' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Metagenome and metatranscriptome sequencing' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Targeted eDNA for one or more species' }),
  ).toBeVisible();
});

test('in-page nav lists the four sections and each anchor exists', async ({ page }) => {
  await page.goto('/pricing');
  const nav = page.getByRole('navigation', { name: 'Pricing sections' });
  for (const id of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna']) {
    await expect(nav.locator(`a[href="#${id}"]`)).toHaveCount(1);
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
});

test('barcoding section shows all 4 tier prices, best rate on 5,000+, and the $5 id-only option', async ({
  page,
}) => {
  await page.goto('/pricing');
  const panel = page.locator('#barcoding');
  for (const price of ['$16', '$20', '$12', '$15', '$10', '$13', '$6', '$8']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '5,000+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
  await expect(
    panel.getByRole('heading', { name: /Identification only, no voucher: \$5 per specimen/ }),
  ).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Confidence ratings' })).toBeVisible();
  await expect(panel.getByText('75% of your per-specimen rate')).toBeVisible();
  await expect(panel.getByRole('link', { name: /Configure and pay online/ })).toHaveAttribute(
    'href',
    'https://store.biokea.ai/products/specimen-barcoding',
  );
});

test('eDNA section shows all 3 tier prices, best rate on 200+, and the marker add-on', async ({
  page,
}) => {
  await page.goto('/pricing');
  const panel = page.locator('#metabarcoding');
  for (const price of ['$165', '$205', '$130', '$160', '$115', '$145']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  const bestRow = panel.locator('div', { hasText: '200+' }).first();
  await expect(bestRow.getByText('Best rate')).toBeVisible();
  await expect(panel.getByText(/\$12 per sample, per added marker/)).toBeVisible();
  await expect(panel.getByRole('link', { name: /Configure and pay online/ })).toHaveAttribute(
    'href',
    'https://store.biokea.ai/products/edna-metabarcoding',
  );
});

test('metagenomics section prices both assays and routes to a conversation', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#metagenomics');
  for (const price of ['$2,400', '$3,000', '$3,350', '$4,200']) {
    await expect(panel.getByText(price, { exact: true }).first()).toBeVisible();
  }
  await expect(panel.getByText(/preserved for RNA/)).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(panel.getByRole('link', { name: /build a quote/i })).toHaveCount(0);
});

test('targeted eDNA section has no prices and a custom-quote button', async ({ page }) => {
  await page.goto('/pricing');
  const panel = page.locator('#targeted-edna');
  expect(await panel.innerText()).not.toContain('$');
  await expect(panel.getByRole('link', { name: 'Request a custom quote' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('comparison table has four service columns, a caption, and links to each section', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('heading', { name: 'Which service fits your project?' }),
  ).toBeVisible();
  const table = page.locator('#compare table');
  await expect(table.locator('caption')).toHaveCount(1);
  for (const [name, id] of [
    ['Specimen DNA barcoding', 'barcoding'],
    ['eDNA metabarcoding', 'metabarcoding'],
    ['Metagenome and metatranscriptome', 'metagenomics'],
    ['Targeted eDNA (qPCR)', 'targeted-edna'],
  ]) {
    const th = page.getByRole('columnheader', { name });
    await expect(th).toBeVisible();
    await expect(th.getByRole('link')).toHaveAttribute('href', `#${id}`);
  }
  await expect(page.getByRole('rowheader', { name: 'Pricing' })).toBeVisible();
});

test('comparison table scrolls inside the page on a narrow phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.goto('/pricing');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const scroller = page.locator('#compare [data-table-scroll]');
  const canScroll = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(canScroll).toBe(true);
});

test('pricing hero CTAs: store, quote, contact, and the services catalog link', async ({
  page,
}) => {
  await page.goto('/pricing');
  await expect(
    page.getByRole('link', { name: /Configure and pay online/i }).first(),
  ).toHaveAttribute('href', 'https://store.biokea.ai/products/specimen-barcoding');
  await expect(page.getByRole('link', { name: 'or build a quote' }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Talk to us →' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(page.getByRole('link', { name: /See our full service catalog/ })).toHaveAttribute(
    'href',
    '/services',
  );
  await expect(page.getByRole('link', { name: /Build a quote/i }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});

test('pricing JSON-LD has four Service nodes with the right offer counts', async ({ page }) => {
  await page.goto('/pricing');
  const graph = await jsonLdGraph(page);
  expect(graph).toBeDefined();
  expect(graph['@graph']).toHaveLength(4);
  const byName = Object.fromEntries(graph['@graph'].map((n: { name: string }) => [n.name, n]));
  expect(byName['Voucher-Linked Specimen Barcoding'].offers).toHaveLength(5);
  expect(byName['Voucher-Linked Specimen Barcoding'].offers[0].priceSpecification).toHaveLength(2);
  expect(byName['Voucher-Linked Specimen Barcoding'].offers[4].priceSpecification[0].price).toBe(5);
  expect(byName['Environmental DNA (eDNA) Metabarcoding'].offers).toHaveLength(3);
  expect(byName['Metagenome and metatranscriptome sequencing'].offers).toHaveLength(2);
  expect(byName['Targeted eDNA for one or more species'].offers).toBeUndefined();
});

test('no internal cost-model comment leaks into the served HTML', async ({ page }) => {
  const response = await page.goto('/pricing');
  const body = (await response?.text()) ?? '';
  expect(body).not.toContain('Michelle');
  expect(body).not.toContain('gross margin');
  expect(body).not.toContain('cost model');
});
```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `npx playwright test tests/e2e/pricing.spec.ts`
Expected: most tests FAIL (old H1, two sections, no in-page nav, two JSON-LD nodes). The dev server on port 4321 is reused if already running.

- [ ] **Step 3: Create `NamedPriceRows.astro`**

A sibling of `PriceLadder` for rows named by assay rather than by tier range.

```astro
---
// src/components/ui/NamedPriceRows.astro
// Like PriceLadder, but each row is a named product (e.g. an assay) rather
// than a volume tier. Same legend, same two-price layout, no "best" badge.
import { usd } from '@/lib/pricing/format';

interface Row {
  title: string;
  description: string;
  academicPrice: number;
  commercialPrice: number;
}
interface Props {
  rows: Row[];
  unitLabel: string;
}
const { rows, unitLabel } = Astro.props;
---

<div class="flex flex-col gap-3">
  <div class="flex gap-4 font-mono text-[11px] text-slate-500">
    <span class="flex items-center gap-1.5">
      <span class="w-2 h-2 rounded-full bg-[var(--color-teal)]"></span>
      Academic &amp; nonprofit — per {unitLabel}
    </span>
    <span class="flex items-center gap-1.5">
      <span class="w-2 h-2 rounded-full bg-[var(--color-ink)]"></span>
      Commercial — per {unitLabel}
    </span>
  </div>
  {
    rows.map((r) => (
      <div class="flex flex-wrap items-center justify-between gap-4 bg-white border border-slate-900/10 border-l-4 border-l-[var(--color-teal)] rounded-md px-5 py-3.5">
        <div class="flex flex-col gap-0.5 min-w-[150px]">
          <span class="font-semibold text-[15px] text-[var(--color-ink)]">{r.title}</span>
          <span class="text-[12.5px] text-slate-500">{r.description}</span>
        </div>
        <div class="flex items-stretch gap-4">
          <div class="flex flex-col items-end min-w-[90px]">
            <span class="font-semibold text-[22px] leading-none text-[var(--color-teal)]">
              {usd(r.academicPrice)}
            </span>
            <span class="font-medium text-[10.5px] text-slate-500 mt-1 whitespace-nowrap">
              academic/nonprofit
            </span>
          </div>
          <div class="w-px bg-slate-900/10" />
          <div class="flex flex-col items-end min-w-[90px]">
            <span class="font-semibold text-[22px] leading-none text-[var(--color-ink)]">
              {usd(r.commercialPrice)}
            </span>
            <span class="font-medium text-[10.5px] text-slate-500 mt-1 whitespace-nowrap">
              commercial
            </span>
          </div>
        </div>
      </div>
    ))
  }
</div>
```

- [ ] **Step 4: Create `AddonsPanel.astro`**

```astro
---
// src/components/ui/AddonsPanel.astro
// The ochre "Add-ons" panel used beside each priced service's included list.
import type { Addon } from '@/data/pricing';

interface Props {
  addons: Addon[];
}
const { addons } = Astro.props;
---

<div
  class="bg-[var(--color-cream-warm)] border border-[var(--color-ochre)]/30 border-t-[3px] border-t-[var(--color-ochre)] rounded-md px-5 py-4"
>
  <h3 class="font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-ochre)] font-bold">
    Add-ons
  </h3>
  <ul class="mt-3 flex flex-col">
    {
      addons.map((a, i) => (
        <li
          class:list={[
            'py-2.5 text-[14px] leading-relaxed',
            i > 0 && 'border-t border-[var(--color-ochre)]/20',
          ]}
        >
          <strong class="block text-[var(--color-ink)]">{a.title}</strong>
          <span class="text-slate-600">{a.body}</span>
        </li>
      ))
    }
  </ul>
</div>
```

- [ ] **Step 5: Replace `src/pages/pricing.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import PageNav from '@/components/ui/PageNav.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import PriceLadder from '@/components/ui/PriceLadder.astro';
import NamedPriceRows from '@/components/ui/NamedPriceRows.astro';
import AddonsPanel from '@/components/ui/AddonsPanel.astro';
import {
  pricedServices,
  identificationOnlyBarcoding,
  confidenceRatings,
  metagenomics,
  targetedEdna,
  comparisonRows,
  pricingSections,
} from '@/data/pricing';
import { usd } from '@/lib/pricing/format';
import { stringifyJsonLd } from '@/lib/json-ld';

const barcoding = pricedServices.find((s) => s.slug === 'barcoding')!;
const edna = pricedServices.find((s) => s.slug === 'metabarcoding')!;

const storeUrl: Record<string, string> = {
  barcoding: 'https://store.biokea.ai/products/specimen-barcoding',
  metabarcoding: 'https://store.biokea.ai/products/edna-metabarcoding',
};

const contactHref = '/contact?topic=sequencing';

const ratingClass: Record<string, string> = {
  High: 'bg-[rgba(15,118,110,0.1)] text-[var(--color-teal)]',
  Moderate: 'bg-[#e6eef7] text-[#1f4f82]',
  Unresolved: 'bg-[#eeeeea] text-[#4a4a45]',
};

const compareColumns = [
  { key: 'barcoding', label: 'Specimen DNA barcoding', id: 'barcoding' },
  { key: 'metabarcoding', label: 'eDNA metabarcoding', id: 'metabarcoding' },
  { key: 'metagenomics', label: 'Metagenome and metatranscriptome', id: 'metagenomics' },
  { key: 'targetedEdna', label: 'Targeted eDNA (qPCR)', id: 'targeted-edna' },
] as const;

const unitSpec = (name: string, price: number, unitText: string) => ({
  '@type': 'UnitPriceSpecification',
  name,
  price,
  priceCurrency: 'USD',
  unitText,
});

const tieredOffers = (svc: typeof barcoding) =>
  svc.tiers.map((t) => ({
    '@type': 'Offer',
    name: `${t.range} ${svc.unitLabel}s`,
    eligibleQuantity: {
      '@type': 'QuantitativeValue',
      minValue: t.minQty,
      ...(t.maxQty ? { maxValue: t.maxQty } : {}),
      unitText: svc.unitLabel,
    },
    priceSpecification: [
      unitSpec('Academic & nonprofit', t.academicPrice, svc.unitLabel),
      unitSpec('Commercial', t.commercialPrice, svc.unitLabel),
    ],
  }));

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: barcoding.title,
      description: barcoding.description,
      provider: { '@id': 'https://biokea.ai/#org' },
      offers: [
        ...tieredOffers(barcoding),
        {
          '@type': 'Offer',
          name: identificationOnlyBarcoding.title,
          eligibleQuantity: { '@type': 'QuantitativeValue', minValue: 1, unitText: 'specimen' },
          priceSpecification: [
            unitSpec('Any client type', identificationOnlyBarcoding.price, 'specimen'),
          ],
        },
      ],
    },
    {
      '@type': 'Service',
      name: edna.title,
      description: edna.description,
      provider: { '@id': 'https://biokea.ai/#org' },
      offers: tieredOffers(edna),
    },
    {
      '@type': 'Service',
      name: metagenomics.title,
      description: metagenomics.description,
      provider: { '@id': 'https://biokea.ai/#org' },
      offers: metagenomics.assays.map((a) => ({
        '@type': 'Offer',
        name: a.title,
        eligibleQuantity: {
          '@type': 'QuantitativeValue',
          minValue: 1,
          unitText: metagenomics.unitLabel,
        },
        priceSpecification: [
          unitSpec('Academic & nonprofit', a.academicPrice, metagenomics.unitLabel),
          unitSpec('Commercial', a.commercialPrice, metagenomics.unitLabel),
        ],
      })),
    },
    {
      '@type': 'Service',
      name: targetedEdna.title,
      description: targetedEdna.description,
      provider: { '@id': 'https://biokea.ai/#org' },
    },
  ],
};
---

<BaseLayout
  title="Pricing — BioKEA"
  description="Transparent pricing for DNA barcoding, environmental DNA (eDNA) metabarcoding, and metagenome and metatranscriptome sequencing."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-10">
    <Eyebrow>PRICING · MOLECULAR SEQUENCING</Eyebrow>
    <h1
      class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[22ch]"
    >
      Pricing for barcoding, eDNA, and metagenomic sequencing
    </h1>
    <p class="mt-5 max-w-[62ch] text-slate-600 leading-relaxed">
      High-throughput species identification and biodiversity monitoring, built on non-destructive
      extraction, Nanopore sequencing, and a lab workflow designed to get cheaper as your project
      scales.
    </p>
    <div class="mt-6 flex items-center gap-4 flex-wrap">
      <a
        href={storeUrl.barcoding}
        class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
      >
        Configure and pay online →
      </a>
      <a href="/quote" class="text-[var(--color-teal)] text-sm font-medium">or build a quote</a>
      <a href={contactHref} class="text-[var(--color-teal)] text-sm font-medium">Talk to us →</a>
    </div>
    <p class="mt-3 text-sm text-slate-500">
      Configure a quote in a minute and pay online by card, Shop Pay, or PayPal. Need something
      else? <a
        href="/services"
        class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
        >See our full service catalog →</a
      >
    </p>
    <p class="mt-2 text-sm text-slate-500 leading-relaxed">
      Rates reflect equipment sourced through Bay Area biotech auctions at roughly one-tenth retail.
      <a href="/lab" class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
        >See the lab →</a
      >
    </p>
  </section>

  <PageNav sections={pricingSections} ariaLabel="Pricing sections" />

  <!-- Specimen barcoding -->
  <section id="barcoding" class="max-w-6xl mx-auto px-6 py-14 border-t border-slate-900/10">
    <div class="max-w-[70ch]">
      <span
        class="inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.1em] uppercase text-[var(--color-teal)] bg-[rgba(15,118,110,0.08)] border border-[rgba(15,118,110,0.2)] px-3 py-1 rounded-full font-semibold"
      >
        {barcoding.serviceTag}
      </span>
      <h2
        class="mt-4 text-3xl md:text-4xl font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
      >
        {barcoding.title}
      </h2>
      <p class="mt-2 font-semibold text-[var(--color-teal)]">{barcoding.tagline}</p>
      <p class="mt-3 text-sm text-slate-600 leading-relaxed">{barcoding.description}</p>
    </div>

    <div class="grid sm:grid-cols-3 gap-3.5 mt-8">
      {
        barcoding.advantages.map((a) => (
          <div class="bg-white border border-slate-900/10 border-t-[3px] border-t-[var(--color-teal)] rounded-md p-4">
            <strong class="block text-sm text-[var(--color-ink)] mb-1">{a.title}</strong>
            <span class="text-[13px] text-slate-500 leading-relaxed">{a.body}</span>
          </div>
        ))
      }
    </div>

    <div class="grid md:grid-cols-[1.15fr_1fr] gap-10 mt-10">
      <div>
        <h3
          class="font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-teal)] font-bold mb-4"
        >
          What's included
        </h3>
        <ul class="flex flex-col">
          {
            barcoding.included.map((item, i) => (
              <li
                class:list={[
                  'flex gap-2.5 items-start text-[15px] text-[var(--color-ink)] leading-relaxed py-2.5',
                  i > 0 && 'border-t border-slate-900/10',
                ]}
              >
                <span class="mt-1 shrink-0 w-4 h-4 rounded-full bg-[var(--color-teal)] flex items-center justify-center text-white text-[10px]">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))
          }
        </ul>
      </div>
      <div class="flex flex-col gap-4">
        <div class="bg-white border border-slate-900/10 rounded-md px-5 py-4">
          <h3 class="font-semibold text-[var(--color-ink)]">Confidence ratings</h3>
          <ul class="mt-3 flex flex-col">
            {
              confidenceRatings.map((r, i) => (
                <li
                  class:list={[
                    'grid grid-cols-[110px_1fr] gap-3 items-start py-2 text-[14px]',
                    i > 0 && 'border-t border-slate-900/10',
                  ]}
                >
                  <span
                    class:list={[
                      'inline-block justify-self-start rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold',
                      ratingClass[r.level],
                    ]}
                  >
                    {r.level}
                  </span>
                  <span class="text-slate-600 leading-relaxed">{r.meaning}</span>
                </li>
              ))
            }
          </ul>
        </div>
        <AddonsPanel addons={barcoding.addons} />
      </div>
    </div>

    <div class="mt-12">
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500 mb-1.5">
        Price by volume tier
      </p>
      <p class="text-[13px] text-slate-500 mb-4 leading-relaxed">
        Every number below is the rate
        <strong class="text-[var(--color-ink)]">per {barcoding.unitLabel}</strong> at that tier, not a
        total for the whole batch.
      </p>
      <PriceLadder tiers={barcoding.tiers} unitLabel={barcoding.unitLabel} />
      <div class="mt-5 bg-white border border-slate-900/10 rounded-md px-5 py-4">
        <h3 class="font-semibold text-[var(--color-ink)]">
          {identificationOnlyBarcoding.title}: {usd(identificationOnlyBarcoding.price)} per specimen
        </h3>
        <p class="mt-1.5 text-sm text-slate-600 leading-relaxed">
          {identificationOnlyBarcoding.description}
        </p>
      </div>
      <p class="mt-4 text-sm text-slate-500">
        Contact us for volume commitments, recurring programs, or multi-project pricing.
      </p>
      <div class="mt-6 flex items-center gap-4 flex-wrap">
        <a
          href={storeUrl.barcoding}
          class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
        >
          Configure and pay online →
        </a>
        <a href="/quote" class="text-[var(--color-teal)] text-sm font-medium">or build a quote</a>
      </div>
    </div>
  </section>

  <!-- eDNA metabarcoding -->
  <section id="metabarcoding" class="max-w-6xl mx-auto px-6 py-14 border-t border-slate-900/10">
    <div class="max-w-[70ch]">
      <span
        class="inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.1em] uppercase text-[var(--color-teal)] bg-[rgba(15,118,110,0.08)] border border-[rgba(15,118,110,0.2)] px-3 py-1 rounded-full font-semibold"
      >
        {edna.serviceTag}
      </span>
      <h2
        class="mt-4 text-3xl md:text-4xl font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
      >
        {edna.title}
      </h2>
      <p class="mt-2 font-semibold text-[var(--color-teal)]">{edna.tagline}</p>
      <p class="mt-3 text-sm text-slate-600 leading-relaxed">{edna.description}</p>
    </div>

    <div class="grid md:grid-cols-[1.15fr_1fr] gap-10 mt-10">
      <div>
        <h3
          class="font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-teal)] font-bold mb-4"
        >
          What's included
        </h3>
        <ul class="flex flex-col">
          {
            edna.included.map((item, i) => (
              <li
                class:list={[
                  'flex gap-2.5 items-start text-[15px] text-[var(--color-ink)] leading-relaxed py-2.5',
                  i > 0 && 'border-t border-slate-900/10',
                ]}
              >
                <span class="mt-1 shrink-0 w-4 h-4 rounded-full bg-[var(--color-teal)] flex items-center justify-center text-white text-[10px]">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))
          }
        </ul>
      </div>
      <div>
        <AddonsPanel addons={edna.addons} />
      </div>
    </div>

    <div class="mt-12">
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500 mb-1.5">
        Price by volume tier
      </p>
      <p class="text-[13px] text-slate-500 mb-4 leading-relaxed">
        Every number below is the rate
        <strong class="text-[var(--color-ink)]">per {edna.unitLabel}</strong> at that tier, not a total
        for the whole batch.
      </p>
      <PriceLadder tiers={edna.tiers} unitLabel={edna.unitLabel} />
      <div class="mt-6 flex items-center gap-4 flex-wrap">
        <a
          href={storeUrl.metabarcoding}
          class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
        >
          Configure and pay online →
        </a>
        <a href="/quote" class="text-[var(--color-teal)] text-sm font-medium">or build a quote</a>
      </div>
    </div>
  </section>

  <!-- Metagenomics -->
  <section id="metagenomics" class="max-w-6xl mx-auto px-6 py-14 border-t border-slate-900/10">
    <div class="max-w-[70ch]">
      <span
        class="inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.1em] uppercase text-[var(--color-teal)] bg-[rgba(15,118,110,0.08)] border border-[rgba(15,118,110,0.2)] px-3 py-1 rounded-full font-semibold"
      >
        {metagenomics.serviceTag}
      </span>
      <h2
        class="mt-4 text-3xl md:text-4xl font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
      >
        {metagenomics.title}
      </h2>
      <p class="mt-2 font-semibold text-[var(--color-teal)]">{metagenomics.tagline}</p>
      <p class="mt-3 text-sm text-slate-600 leading-relaxed">{metagenomics.description}</p>
    </div>

    <div class="grid md:grid-cols-[1.15fr_1fr] gap-10 mt-10">
      <div>
        <h3
          class="font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-teal)] font-bold mb-4"
        >
          What's included
        </h3>
        <ul class="flex flex-col">
          {
            metagenomics.included.map((item, i) => (
              <li
                class:list={[
                  'flex gap-2.5 items-start text-[15px] text-[var(--color-ink)] leading-relaxed py-2.5',
                  i > 0 && 'border-t border-slate-900/10',
                ]}
              >
                <span class="mt-1 shrink-0 w-4 h-4 rounded-full bg-[var(--color-teal)] flex items-center justify-center text-white text-[10px]">
                  ✓
                </span>
                <span>{item}</span>
              </li>
            ))
          }
        </ul>
      </div>
      <div>
        <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500 mb-1.5">
          Price per {metagenomics.unitLabel}
        </p>
        <NamedPriceRows rows={metagenomics.assays} unitLabel={metagenomics.unitLabel} />
        {
          metagenomics.notes.map((n) => (
            <p class="mt-4 text-sm text-slate-500 leading-relaxed">{n}</p>
          ))
        }
        <div class="mt-6">
          <a
            href={contactHref}
            class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium inline-block"
          >
            Talk to us →
          </a>
        </div>
      </div>
    </div>
  </section>

  <!-- Targeted eDNA -->
  <section id="targeted-edna" class="max-w-6xl mx-auto px-6 py-14 border-t border-slate-900/10">
    <div class="max-w-[70ch]">
      <span
        class="inline-flex items-center gap-2 font-mono text-[11.5px] tracking-[0.1em] uppercase text-[var(--color-teal)] bg-[rgba(15,118,110,0.08)] border border-[rgba(15,118,110,0.2)] px-3 py-1 rounded-full font-semibold"
      >
        {targetedEdna.serviceTag}
      </span>
      <h2
        class="mt-4 text-3xl md:text-4xl font-semibold tracking-[-0.01em] text-[var(--color-ink)]"
      >
        {targetedEdna.title}
      </h2>
      <p class="mt-2 font-semibold text-[var(--color-teal)]">{targetedEdna.tagline}</p>
      <p class="mt-3 text-sm text-slate-600 leading-relaxed">{targetedEdna.description}</p>
      <div class="mt-6">
        <a
          href={contactHref}
          class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium inline-block"
        >
          Request a custom quote
        </a>
      </div>
    </div>
  </section>

  <!-- Comparison -->
  <section id="compare" class="max-w-6xl mx-auto px-6 py-14 border-t border-slate-900/10">
    <h2 class="text-2xl md:text-3xl font-semibold text-[var(--color-ink)] text-center">
      Which service fits your project?
    </h2>
    <p class="mt-2 text-sm text-slate-500 text-center max-w-[560px] mx-auto">
      How our four services compare. Many programs combine them.
    </p>
    <div class="mt-8 overflow-x-auto" data-table-scroll>
      <table
        class="w-full min-w-[900px] border-collapse bg-white rounded-lg overflow-hidden shadow-sm table-fixed"
      >
        <caption class="sr-only">Comparison of BioKEA's four sequencing services</caption>
        <thead>
          <tr>
            <th
              scope="col"
              class="bg-[var(--color-ink)] text-white text-left text-[13.5px] font-semibold px-5 py-4 w-[16%]"
            >
              <span class="sr-only">Feature</span>
            </th>
            {
              compareColumns.map((c) => (
                <th
                  scope="col"
                  class="bg-[var(--color-ink)] text-white text-left text-[13.5px] font-semibold px-5 py-4"
                >
                  <a href={`#${c.id}`} class="hover:underline">
                    {c.label}
                  </a>
                </th>
              ))
            }
          </tr>
        </thead>
        <tbody>
          {
            comparisonRows.map((row) => (
              <tr class="border-t border-slate-900/10">
                <th
                  scope="row"
                  class="font-mono text-[11.5px] tracking-[0.04em] uppercase text-slate-500 bg-[var(--color-cream)] text-left px-5 py-4 align-top"
                >
                  {row.label}
                </th>
                {compareColumns.map((c) => (
                  <td class="text-sm text-[var(--color-ink)] px-5 py-4 align-top">{row[c.key]}</td>
                ))}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
    <p class="mt-4 text-sm text-slate-600 max-w-[75ch]">
      Many programs combine services: eDNA metabarcoding for broad screening, targeted qPCR to track
      priority species, barcoding to confirm and voucher the specimens that matter most, and
      metagenomes to see what lives in and on them.
    </p>
  </section>

  <CtaBand
    title="Not sure which service, or need a project-specific number?"
    subtitle="Build an itemized quote instantly, or send us your sample count and goals and we'll put one together."
    cta={{ href: '/quote', label: 'Build a quote' }}
  />

  <p class="max-w-6xl mx-auto px-6 pt-8 pb-12 text-xs text-slate-500 leading-relaxed">
    Pricing reflects standard turnaround and workflow as of 2026 and is provided as a general guide.
    Final quotes may vary based on sample condition, marker selection, and project timeline.
  </p>

  <script type="application/ld+json" is:inline set:html={stringifyJsonLd(jsonLd)} />
</BaseLayout>
```

- [ ] **Step 6: Type-check and run the e2e tests**

Run: `npm run check && npx playwright test tests/e2e/pricing.spec.ts`
Expected: `0 errors`; all pricing tests PASS.

If the "scrolls inside the page" test fails on `overflow`, the culprit is almost always the hero `h1` `max-w-[22ch]` or the PageNav track; confirm with `page.evaluate` which element is wider than the viewport before changing anything.

- [ ] **Step 7: Look at the page**

Run: `npx playwright screenshot --viewport-size=1280,900 --full-page http://localhost:4321/pricing /tmp/pricing.png` and open it. Check: four sections in order, ochre add-ons panels, confidence pills, both ladders, the metagenomics rows, the four-column table.

- [ ] **Step 8: Commit**

```bash
git add src/pages/pricing.astro src/components/ui/NamedPriceRows.astro src/components/ui/AddonsPanel.astro tests/e2e/pricing.spec.ts
git commit -m "feat(pricing): four-service catalog page with id-only barcoding, metagenomics, targeted eDNA, and a four-way comparison

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Trim `/services` to "how we work"

**Files:**

- Modify: `src/pages/services.astro` (whole file replaced)
- Test: `tests/e2e/services.spec.ts` (whole file replaced)

**Interfaces:**

- Consumes: `serviceOfferings` with `kind`, `pricingAnchor`, `configurable` (Task 2); section ids on `/pricing` (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing e2e tests**

Replace `tests/e2e/services.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const findGraph = async (
  page: import('@playwright/test').Page,
  pick: (j: Record<string, unknown>) => boolean,
) => {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && pick(j));
};

test('services page renders hero and lede', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Sequencing services for biodiversity research',
  );
  await expect(
    page.getByText(/DNA barcoding, environmental DNA, and long-read genomics/i).first(),
  ).toBeVisible();
});

test('services page has no dollar-sign prices anywhere', async ({ page }) => {
  await page.goto('/services');
  const bodyText = (await page.locator('body').innerText()) ?? '';
  expect(bodyText).not.toContain('$');
});

test('priced rows link to their pricing anchors and the right next step', async ({ page }) => {
  await page.goto('/services');
  const priced = page.locator('[data-offerings="priced"] li');
  await expect(priced).toHaveCount(4);

  const barcoding = priced.filter({ hasText: 'Voucher-linked specimen barcoding' });
  await expect(barcoding.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#barcoding',
  );
  await expect(barcoding.getByRole('link', { name: 'Configure →' })).toHaveAttribute(
    'href',
    '/quote',
  );

  const edna = priced.filter({ hasText: 'Environmental DNA (eDNA) metabarcoding' });
  await expect(edna.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metabarcoding',
  );
  await expect(edna.getByRole('link', { name: 'Configure →' })).toHaveAttribute('href', '/quote');

  const meta = priced.filter({ hasText: 'Metagenome and metatranscriptome sequencing' });
  await expect(meta.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metagenomics',
  );
  await expect(meta.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );

  const qpcr = priced.filter({ hasText: 'Targeted eDNA (qPCR)' });
  await expect(qpcr.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#targeted-edna',
  );
  await expect(qpcr.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('project-rate rows are listed with a human path', async ({ page }) => {
  await page.goto('/services');
  const rows = page.locator('[data-offerings="project-rate"] li');
  await expect(rows).toHaveCount(4);
  await expect(rows.filter({ hasText: 'Study design' })).toHaveCount(1);
  await expect(rows.filter({ hasText: 'Field collection assistance' })).toHaveCount(1);
  for (const row of await rows.all()) {
    await expect(row.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
      'href',
      '/contact?topic=sequencing',
    );
  }
});

test('the store checkout buttons no longer live on /services', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: /pay online/i })).toHaveCount(0);
  await expect(page.locator('a[href^="https://store.biokea.ai/products/"]')).toHaveCount(0);
});

test('services Service JSON-LD has eight nodes and no priceSpecification', async ({ page }) => {
  await page.goto('/services');
  const graph = await findGraph(
    page,
    (j) =>
      Array.isArray(j['@graph']) &&
      (j['@graph'] as { '@type': string }[])[0]?.['@type'] === 'Service',
  );
  expect(graph).toBeDefined();
  expect(graph['@graph']).toHaveLength(8);
  for (const node of graph['@graph']) expect(node.offers).toBeUndefined();
});

test('services primary CTA leads to the configurator and a human path survives', async ({
  page,
}) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: 'Build a quote' }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Talk to us →' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});

test('services FAQPage JSON-LD includes turnaround, minimum-volume, and the which-service question', async ({
  page,
}) => {
  await page.goto('/services');
  const faq = await findGraph(
    page,
    (j) => j['@type'] === 'FAQPage' && String(j['@id']).includes('services#faq'),
  );
  expect(faq).toBeDefined();
  const questions = faq.mainEntity.map((q: { name: string }) => q.name);
  expect(questions.some((q: string) => /turnaround/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /minimum sample volume/i.test(q))).toBe(true);
  expect(questions.some((q: string) => /difference between barcoding/i.test(q))).toBe(true);
  await expect(page.getByRole('link', { name: /compare them side by side/i })).toHaveAttribute(
    'href',
    '/pricing#compare',
  );
});

test('contact form preselects Sequencing service inquiry topic when ?topic=sequencing', async ({
  page,
}) => {
  await page.goto('/contact?topic=sequencing');
  await expect(page.getByLabel('Topic')).toHaveValue('Sequencing service inquiry');
});

test('services FAQ links BioInfoOS to BioKEA Works', async ({ page }) => {
  await page.goto('/services');
  const link = page.getByRole('link', { name: 'BioKEA Works' }).last();
  await expect(link).toHaveAttribute('href', '/works#bioinfoos');
});

test('barcoding row names BugPicker and links to its lab section', async ({ page }) => {
  await page.goto('/services');
  const link = page.getByRole('link', { name: /see it running/i });
  await expect(link).toHaveAttribute('href', '/lab#lab-bugpicker');
  await expect(page.getByText(/BugPicker/).first()).toBeVisible();
});
```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `npx playwright test tests/e2e/services.spec.ts`
Expected: FAIL on the priced-rows, project-rate, store-buttons, eight-nodes, and which-service tests.

- [ ] **Step 3: Replace `src/pages/services.astro`**

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { serviceOfferings } from '@/data/services';
import { stringifyJsonLd } from '@/lib/json-ld';

const contactHref = '/contact?topic=sequencing';
const priced = serviceOfferings.filter((s) => s.kind === 'priced');
const projectRate = serviceOfferings.filter((s) => s.kind === 'project-rate');

const audiences = [
  'Conservation nonprofits',
  'State and federal agencies (DFW, USGS, NPS, EPA, NOAA)',
  'Academic labs and graduate research programs',
  'Environmental and ecological consultancies',
  'Long-term biodiversity monitoring programs',
];

const deliverables = [
  'Darwin Core Archive (DwC-A) deposit-ready package',
  'GBIF (Global Biodiversity Information Facility) record',
  'NCBI SRA (Sequence Read Archive) submission for raw reads',
  'Zenodo DOI for the final data package',
  'Written analysis report with methods, results, and provenance trail',
  'Raw FASTQ + metadata on request for customers running their own pipelines',
];

const workflow = [
  {
    step: '01',
    title: 'Discuss',
    body: 'Free 30-minute scoping call. We help shape sampling design, primer choice, replication, and analysis goals — then send a written quote.',
  },
  {
    step: '02',
    title: 'Send samples',
    body: 'Shipping instructions, chain-of-custody manifest, and packaging guidance provided once a project is initiated. International samples accepted with appropriate import permits.',
  },
  {
    step: '03',
    title: 'We sequence and analyze',
    body: 'Samples flow through the BioKEA six-stage pipeline at the Berkeley LDC: extraction, prep, quantification, sequencing on the ONT Promethion 2, and bioinformatic analysis with full provenance.',
  },
  {
    step: '04',
    title: 'Receive deliverables',
    body: 'A FAIR-compliant data package — DwC-A, GBIF, SRA, Zenodo DOI — plus a written report. Optional interactive StoryMap publication through Press, part of BioKEA Works (currently in closed-testing alpha).',
  },
];

const faqs: { q: string; a: string; link?: { href: string; label: string } }[] = [
  {
    q: "What's the typical turnaround time?",
    a: 'Typical projects complete in 4–8 weeks from sample receipt; custom assay design can extend timelines. We provide a project-specific timeline at quote.',
  },
  {
    q: "What's the minimum sample volume or batch size?",
    a: 'Per-assay minimums vary. For eDNA water samples we typically accept 1–2 L filtered samples. For bulk specimens, 96-well-plate-compatible batches are most efficient. Single-specimen barcoding has no batch minimum.',
  },
  {
    q: "What's the difference between barcoding, eDNA metabarcoding, metagenomics, and targeted qPCR?",
    a: 'Barcoding identifies individual physical specimens one at a time; eDNA metabarcoding detects whole communities from a water, soil, sediment, or air sample; metagenomics sequences everything living in and on a single specimen; targeted qPCR detects or measures one or a few named species with high sensitivity. Many programs combine them.',
    link: { href: '/pricing#compare', label: 'Compare them side by side →' },
  },
  {
    q: 'Do you accept international samples?',
    a: 'Yes, with appropriate import permits and CITES documentation where required. We help first-time importers walk through the paperwork.',
  },
  {
    q: 'What primer choices are available for amplicon work?',
    a: 'Standard primers stocked: COI, 16S, 18S, ITS, rbcL, matK. Custom primer design is part of the eDNA / qPCR assay design service.',
  },
  {
    q: 'Are GBIF, NCBI SRA, and Zenodo deposits automatic?',
    a: 'Yes — they are part of the standard deliverable. Customers can request a hold or embargo on public deposits where institutional or publication considerations require it.',
  },
  {
    q: 'Can I use my own bioinformatic pipeline?',
    a: 'Yes. We can deliver raw FASTQ plus full metadata for downstream pipelines run by you or your collaborators. We also run our in-house BioInfoOS pipeline on request.',
  },
];

// Schema.org Service JSON-LD nodes — one per offering, attached to the
// BioKEA Organization. No `offers` / priceSpecification here by policy:
// prices are published on /pricing only, and that page carries the Offer
// nodes.
const serviceJsonLd = serviceOfferings.map((s) => ({
  '@type': 'Service',
  name: s.name,
  description: s.description,
  provider: { '@id': 'https://biokea.ai/#org' },
  ...(s.pricingAnchor ? { url: `https://biokea.ai/pricing#${s.pricingAnchor}` } : {}),
}));
---

<BaseLayout
  title="Sequencing services — BioKEA"
  description="DNA barcoding, environmental DNA, and long-read genomics — sample to FAIR-compliant data package, run out of the BioKEA Berkeley LDC."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-10">
    <Eyebrow>SERVICES · MOLECULAR SEQUENCING</Eyebrow>
    <h1
      class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[24ch]"
    >
      Sequencing services for biodiversity research.
    </h1>
    <p class="mt-5 max-w-[62ch] text-slate-600 leading-relaxed">
      DNA barcoding, environmental DNA, and long-read genomics — sample to FAIR-compliant data
      package, run out of the BioKEA Berkeley Large Data Collider.
    </p>
    <div class="mt-6 flex items-center gap-4 flex-wrap">
      <a
        href="/quote"
        class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
      >
        Build a quote
      </a>
      <a href={contactHref} class="text-[var(--color-teal)] text-sm font-medium">Talk to us →</a>
      <a href="/lab" class="text-[var(--color-teal)] text-sm font-medium">See the lab →</a>
    </div>
    <p class="mt-3 text-sm text-slate-500">
      Configure a quote in a minute — and pay online by card, Shop Pay, or PayPal.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>WHO IT'S FOR</Eyebrow>
    <ul class="mt-5 grid sm:grid-cols-2 gap-3 max-w-[62ch]">
      {
        audiences.map((a) => (
          <li class="flex items-baseline gap-3 text-sm text-slate-600 leading-relaxed">
            <span class="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-teal)] shrink-0">
              ·
            </span>
            <span>{a}</span>
          </li>
        ))
      }
    </ul>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>CATALOG</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
      What we offer
    </h2>
    <p class="mt-3 max-w-[62ch] text-sm text-slate-600 leading-relaxed">
      Four sequencing services with published rate cards, and the consulting that wraps around them.
      Rates are on the
      <a href="/pricing" class="text-[var(--color-teal)] underline">pricing page</a>; everything
      else is scoped per request.
    </p>

    <h3
      class="mt-8 font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-teal)] font-bold"
    >
      Priced services
    </h3>
    <ul class="mt-3 border-t border-slate-900/10" data-offerings="priced">
      {
        priced.map((s) => (
          <li class="border-b border-slate-900/10 py-5">
            <div class="flex items-baseline justify-between gap-4 flex-wrap">
              <div class="font-semibold text-[var(--color-ink)]">{s.name}</div>
              <div class="flex items-baseline gap-4 shrink-0 font-mono text-[12px]">
                <a href={`/pricing#${s.pricingAnchor}`} class="text-[var(--color-pink)]">
                  See pricing →
                </a>
                {s.configurable ? (
                  <a href="/quote" class="text-[var(--color-teal)]">
                    Configure →
                  </a>
                ) : (
                  <a href={contactHref} class="text-[var(--color-teal)]">
                    Talk to us →
                  </a>
                )}
              </div>
            </div>
            {s.description && (
              <p class="mt-1 text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                {s.description}
              </p>
            )}
            {s.pricingAnchor === 'barcoding' && (
              <p class="mt-2 text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                Bulk samples are imaged, triaged, and plated by <strong>BugPicker</strong>, our
                in-house picking robot —{' '}
                <a href="/lab#lab-bugpicker" class="text-[var(--color-teal)] underline">
                  see it running on the lab bench →
                </a>
              </p>
            )}
          </li>
        ))
      }
    </ul>

    <h3
      class="mt-10 font-mono text-[13px] tracking-[0.08em] uppercase text-[var(--color-teal)] font-bold"
    >
      Project-rate services
    </h3>
    <ul class="mt-3 border-t border-slate-900/10" data-offerings="project-rate">
      {
        projectRate.map((s) => (
          <li class="border-b border-slate-900/10 py-5">
            <div class="flex items-baseline justify-between gap-4 flex-wrap">
              <div class="font-semibold text-[var(--color-ink)]">{s.name}</div>
              <a href={contactHref} class="font-mono text-[12px] text-[var(--color-teal)] shrink-0">
                Talk to us →
              </a>
            </div>
            {s.description && (
              <p class="mt-1 text-sm text-slate-600 leading-relaxed max-w-[68ch]">
                {s.description}
              </p>
            )}
          </li>
        ))
      }
    </ul>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>WHAT YOU GET BACK</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
      FAIR-compliant data package by default.
    </h2>
    <ul class="mt-5 space-y-2.5 max-w-[62ch]">
      {
        deliverables.map((d) => (
          <li class="flex items-baseline gap-3 text-sm text-slate-600 leading-relaxed">
            <span class="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-teal)] shrink-0">
              ·
            </span>
            <span>{d}</span>
          </li>
        ))
      }
    </ul>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>WORKFLOW</Eyebrow>
    <ol class="mt-6 grid md:grid-cols-2 gap-6">
      {
        workflow.map((s) => (
          <li class="border-t border-slate-900/10 pt-4">
            <div class="font-mono text-sm text-[var(--color-teal)] font-semibold tracking-[0.1em]">
              {s.step}
            </div>
            <div class="mt-1 font-semibold text-[var(--color-ink)]">{s.title}</div>
            <p class="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
          </li>
        ))
      }
    </ol>
    <p class="mt-6 text-sm text-slate-500 leading-relaxed">
      The internal six-stage pipeline that runs under every project — Ingest, Analyze, Draft,
      Review, Broadcast, Amplify —
      <a href="/pipeline" class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
        >is documented in detail on the pipeline page</a
      >.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>FAQ</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
      Common questions from sequencing customers
    </h2>
    <dl class="mt-6 space-y-6 max-w-[68ch]">
      {
        faqs.map((f) => (
          <div class="border-t border-slate-900/10 pt-4">
            <dt class="font-semibold text-[var(--color-ink)]">{f.q}</dt>
            <dd class="mt-2 text-sm text-slate-600 leading-relaxed">
              {f.a}
              {f.link && (
                <>
                  {' '}
                  <a href={f.link.href} class="text-[var(--color-teal)] underline">
                    {f.link.label}
                  </a>
                </>
              )}
            </dd>
          </div>
        ))
      }
    </dl>
    <p class="mt-6 text-sm text-slate-500 leading-relaxed">
      BioInfoOS is also available directly, as part of
      <a
        href="/works#bioinfoos"
        class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
      >
        BioKEA Works
      </a>
      (currently in closed-testing alpha).
    </p>
    <p class="mt-3 text-sm text-slate-500 leading-relaxed">
      Know your sample count?
      <a href="/quote" class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
        >Build an itemized quote in about a minute</a
      >.
    </p>
  </section>

  <CtaBand
    title="Ready to send samples?"
    subtitle="Build an itemized quote in about a minute, or tell us about your project and we'll respond within a few days."
    cta={{ href: '/quote', label: 'Build a quote' }}
  />

  <script
    type="application/ld+json"
    is:inline
    set:html={stringifyJsonLd({
      '@context': 'https://schema.org',
      '@graph': serviceJsonLd,
    })}
  />

  <script
    type="application/ld+json"
    is:inline
    set:html={stringifyJsonLd({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': 'https://biokea.ai/services#faq',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    })}
  />
</BaseLayout>
```

- [ ] **Step 4: Type-check and run the e2e tests**

Run: `npm run check && npx playwright test tests/e2e/services.spec.ts`
Expected: `0 errors`; all services tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/services.astro tests/e2e/services.spec.ts
git commit -m "feat(services): how-we-work page; priced and project-rate groups, no prices, which-service FAQ

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Homepage services strip

**Files:**

- Create: `src/components/sections/ServicesStrip.astro`
- Modify: `src/pages/index.astro` (import, place after `<Hero>`, rewrite one FAQ answer)
- Test: `tests/e2e/home.spec.ts` (append two tests)

**Interfaces:**

- Consumes: `pricedServices`, `metagenomics`, `targetedEdna`, `priceRange` (Task 1); `usd` (Task 1); section ids on `/pricing` (Task 3).
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/home.spec.ts`:

```ts
test('home shows a four-card services strip with honest price ranges', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Four services. One Berkeley lab.' }),
  ).toBeVisible();
  const cards = page.locator('[data-services-strip] article');
  await expect(cards).toHaveCount(4);

  const barcoding = cards.filter({ hasText: 'Specimen barcoding' });
  await expect(barcoding).toContainText('$6–$20 per specimen');
  await expect(barcoding.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#barcoding',
  );

  const edna = cards.filter({ hasText: 'eDNA metabarcoding' });
  await expect(edna).toContainText('$115–$205 per sample');
  await expect(edna.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metabarcoding',
  );

  const meta = cards.filter({ hasText: 'Metagenomics' });
  await expect(meta).toContainText('$2,400–$4,200 per specimen');
  await expect(meta.getByRole('link', { name: 'See pricing →' })).toHaveAttribute(
    'href',
    '/pricing#metagenomics',
  );

  const qpcr = cards.filter({ hasText: 'Targeted eDNA (qPCR)' });
  await expect(qpcr).toContainText('Custom quote');
  await expect(qpcr.getByRole('link', { name: 'Talk to us →' })).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );

  // The strip never leads with the lowest rate as if everyone got it.
  const stripText = await page.locator('[data-services-strip]').innerText();
  expect(stripText).not.toMatch(/from \$/i);
  await expect(
    page
      .locator('[data-services-strip]')
      .getByRole('link', { name: /Build a quote in about a minute/ }),
  ).toHaveAttribute('href', '/quote');
});

test('home FAQ names all four priced services', async ({ page }) => {
  await page.goto('/');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const faq = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && j['@type'] === 'FAQPage');
  const answer = faq.mainEntity.find(
    (q: { name: string }) => q.name === 'What services does BioKEA offer?',
  ).acceptedAnswer.text as string;
  for (const needle of ['barcoding', 'eDNA metabarcoding', 'metatranscriptome', 'qPCR']) {
    expect(answer).toContain(needle);
  }
});
```

- [ ] **Step 2: Run the e2e tests to verify they fail**

Run: `npx playwright test tests/e2e/home.spec.ts`
Expected: the two new tests FAIL (no strip heading; FAQ answer lacks `qPCR`). All existing home tests PASS.

- [ ] **Step 3: Create `ServicesStrip.astro`**

```astro
---
// src/components/sections/ServicesStrip.astro
// Four-card summary of the sequencing services, placed under the homepage
// hero. Every price line is a range across all tiers and both audiences,
// computed from src/data/pricing.ts, so the strip can never disagree with
// /pricing and never says "from $6" (a rate only the largest academic
// programme gets).
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { pricedServices, metagenomics, targetedEdna, priceRange } from '@/data/pricing';
import { usd } from '@/lib/pricing/format';

const contactHref = '/contact?topic=sequencing';

const rangeLine = (slug: string, tiered: boolean): string => {
  const r = priceRange(slug);
  if (!r) return 'Custom quote';
  return `${usd(r.min)}–${usd(r.max)} per ${r.unit}${tiered ? ' · volume-tiered' : ''}`;
};

const barcoding = pricedServices.find((s) => s.slug === 'barcoding')!;
const edna = pricedServices.find((s) => s.slug === 'metabarcoding')!;

const cards = [
  {
    tag: barcoding.serviceTag,
    name: 'Specimen barcoding',
    body: 'One identification per physical specimen, imaged and vouchered, with a confidence rating.',
    price: rangeLine('barcoding', true),
    href: '/pricing#barcoding',
    linkLabel: 'See pricing →',
  },
  {
    tag: edna.serviceTag,
    name: 'eDNA metabarcoding',
    body: 'Whole communities from a single water, soil, sediment, or air sample. Stack markers on the same samples.',
    price: rangeLine('metabarcoding', true),
    href: '/pricing#metabarcoding',
    linkLabel: 'See pricing →',
  },
  {
    tag: metagenomics.serviceTag,
    name: 'Metagenomics',
    body: 'All the DNA in a specimen, or the genes it and its microbes are actively using, on a dedicated flow cell.',
    price: rangeLine('metagenomics', false),
    href: '/pricing#metagenomics',
    linkLabel: 'See pricing →',
  },
  {
    tag: targetedEdna.serviceTag,
    name: 'Targeted eDNA (qPCR)',
    body: 'Detect or measure one or a few named species with high sensitivity. Custom assays where none exists.',
    price: rangeLine('targeted-edna', false),
    href: contactHref,
    linkLabel: 'Talk to us →',
  },
];
---

<section class="max-w-6xl mx-auto px-6 py-16" data-services-strip>
  <Eyebrow>WHAT WE SEQUENCE</Eyebrow>
  <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
    Four services. One Berkeley lab.
  </h2>
  <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
    {
      cards.map((c) => (
        <article class="bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md p-5 flex flex-col">
          <div class="font-mono text-[10px] tracking-[0.14em] text-[var(--color-teal)] uppercase">
            {c.tag}
          </div>
          <h3 class="mt-1 font-semibold text-[var(--color-ink)]">{c.name}</h3>
          <p class="mt-1 text-xs text-slate-600 leading-relaxed">{c.body}</p>
          <p class="mt-4 font-semibold text-[15px] text-[var(--color-ink)]">{c.price}</p>
          <a href={c.href} class="inline-block mt-3 font-mono text-[11px] text-[var(--color-pink)]">
            {c.linkLabel}
          </a>
        </article>
      ))
    }
  </div>
  <p class="mt-6 text-sm text-slate-600">
    Academic and nonprofit rates on every service.
    <a href="/quote" class="text-[var(--color-teal)] underline">Build a quote in about a minute →</a
    >
  </p>
</section>
```

- [ ] **Step 4: Mount it on the homepage and rewrite the FAQ answer**

In `src/pages/index.astro`:

Add the import after the `Hero` import:

```astro
import ServicesStrip from '@/components/sections/ServicesStrip.astro';
```

Insert `<ServicesStrip />` on its own line directly after the closing `/>` of the `<Hero … />` element and before `<Thesis`.

Replace the FAQ answer text for `What services does BioKEA offer?` (currently beginning `Molecular sequencing as a service for environmental-DNA…`) with:

```ts
text: 'Four priced sequencing services with academic/nonprofit and commercial rates: voucher-linked specimen barcoding, eDNA metabarcoding, metagenome and metatranscriptome sequencing, and targeted eDNA (qPCR). Plus project-rate study design, bioinformatics, custom assay design, and field collection support. Rates at biokea.ai/pricing; instant quotes at biokea.ai/quote.',
```

- [ ] **Step 5: Type-check and run the home e2e tests**

Run: `npm run check && npx playwright test tests/e2e/home.spec.ts`
Expected: `0 errors`; all home tests PASS.

- [ ] **Step 6: Look at the page**

Run: `npx playwright screenshot --viewport-size=1280,900 --full-page http://localhost:4321/ /tmp/home.png` and open it. The strip must sit between the hero and the mission quote with four equal cards.

- [ ] **Step 7: Commit**

```bash
git add src/components/sections/ServicesStrip.astro src/pages/index.astro tests/e2e/home.spec.ts
git commit -m "feat(home): four-card services strip with price ranges under the hero

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Text feed, full verification

**Files:**

- Modify: `public/llms.txt:13-26` (Services section)
- Test: `tests/e2e/llms-txt.spec.ts` (append one test)

**Interfaces:**

- Consumes: the four priced services and their ranges (Task 1) as literal text, because `public/llms.txt` is a static file.
- Produces: nothing.

- [ ] **Step 1: Write the failing e2e test**

Append to `tests/e2e/llms-txt.spec.ts`:

```ts
test('llms.txt lists the four priced services with their ranges and pricing anchors', async ({
  page,
}) => {
  const response = await page.goto('/llms.txt');
  const text = (await response?.text()) ?? '';
  expect(text).toContain('https://biokea.ai/pricing#barcoding');
  expect(text).toContain('https://biokea.ai/pricing#metabarcoding');
  expect(text).toContain('https://biokea.ai/pricing#metagenomics');
  expect(text).toContain('https://biokea.ai/pricing#targeted-edna');
  expect(text).toContain('$6–$20 per specimen');
  expect(text).toContain('$115–$205 per sample');
  expect(text).toContain('$2,400–$4,200 per specimen');
  expect(text).not.toMatch(/from \$/i);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/e2e/llms-txt.spec.ts`
Expected: the new test FAILS (no pricing anchors in the file).

- [ ] **Step 3: Rewrite the Services section of `public/llms.txt`**

Replace everything from the line `## Services (molecular sequencing as a service)` down to (but not including) the line beginning `Engagement routes (Contact-form topics):` with:

```markdown
## Services (molecular sequencing as a service)

BioKEA offers molecular sequencing as a service out of the Berkeley LDC, targeted at environmental DNA (eDNA) and related customers — conservation nonprofits, state/federal agencies, academic labs, and environmental consultancies. Four services have published rate cards with academic/nonprofit and commercial rates; consulting is quoted per request.

Priced services (full rate cards at https://biokea.ai/pricing; instant quotes at https://biokea.ai/quote):

- **Voucher-linked specimen barcoding** — every specimen imaged, non-destructively extracted, COI-barcoded on Oxford Nanopore, identified against BOLD/NCBI with a confidence rating. $6–$20 per specimen by volume tier; identification-only (no voucher) $5 flat. Other markers at 75% of the per-specimen rate. https://biokea.ai/pricing#barcoding
- **Environmental DNA (eDNA) metabarcoding** — community-level detection from water, soil, sediment, or air samples; one marker or several stacked. $115–$205 per sample by volume tier; extra markers $12–$15 per sample. https://biokea.ai/pricing#metabarcoding
- **Metagenome and metatranscriptome sequencing** — all the DNA in a specimen, or its active genes from RNA, on a dedicated long-read flow cell. $2,400–$4,200 per specimen. https://biokea.ai/pricing#metagenomics
- **Targeted eDNA (qPCR)** — presence and abundance of one or more named species; custom assay development. Custom quote. https://biokea.ai/pricing#targeted-edna

Project-rate services (quoted per request): study design; bioinformatic data analysis and interpretation; custom eDNA / qPCR assay design and validation; field collection assistance. Every service output lands as a DwC-A archive plus NCBI SRA / GBIF / Zenodo deposits, not a PDF. See https://biokea.ai/services for how projects run.
```

(Keep one blank line before `Engagement routes`.)

- [ ] **Step 4: Run the whole verification set**

Run, in order:

```bash
npm run check
npm run lint
npx vitest run
npx playwright test
```

Expected: `astro check` 0 errors; prettier clean (if not, run `npm run format` and re-stage); all unit suites PASS; all e2e suites PASS, including the untouched `nav.spec.ts`, `widget.spec.ts`, `quote.spec.ts`, `payments.spec.ts`, and `llms-txt.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add public/llms.txt tests/e2e/llms-txt.spec.ts
git commit -m "docs(llms): list the four priced services with ranges and pricing anchors

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 6: Final look**

Open `http://localhost:4321/`, `/pricing`, and `/services` in a browser at desktop and at 360px wide. Confirm the strip, the four pricing sections, the sticky section nav, the comparison scroller, and the services groups. Report any visual defect as a follow-up rather than silently patching copy.
