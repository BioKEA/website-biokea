# Pricing catalog and pages — design

**Date:** 2026-10-26
**Status:** spec 1 of 3 in the "show off pricing and services" programme.
**Sources:** `docs/source/mockups/pricing.html` and
`docs/source/mockups/order-configurator.html` (content and interaction
sources of truth; not visual sources — the site's own design system applies).

## 0. The programme this belongs to

The owner wants the site to show off pricing and services better, with as
much of the buying flow as possible built by us and Shopify kept as the till.
Decisions taken on 2026-10-26:

| Decision           | Choice                                                                                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configurator       | One guided configurator replaces the current widget everywhere (biokea.ai and the Shopify product pages). Checkout stays a Shopify draft order via `/api/quote`. |
| Prices             | Every number in the pricing mockup is final and publishable.                                                                                                     |
| Consultation cases | Saved as a quote in a consult state, with the full intake, a quote number, a `/quote/<token>` page, and emails to both sides.                                    |
| Page roles         | `/pricing` is the catalog (four services, what's included, rates, comparison). `/services` is "how we work" and carries no prices.                               |
| Homepage           | Gains a four-card services strip with honest price ranges under the hero.                                                                                        |
| Look               | The site's existing design system (Inter, cream, ink, teal; existing Nav, Footer, Eyebrow, PriceLadder, PageNav, CtaBand).                                       |
| Approach           | Extend the existing architecture (one data file, one engine, one widget bundle) rather than a parallel intake page or Shopify-native options.                    |

The work is split into three specs, built in order:

1. **This spec — catalog and pages.** Data file, `/pricing`, `/services`,
   homepage strip, SEO. No money-path changes. Shippable alone.
2. **Configurator and consultations.** Engine extensions, the guided widget,
   API intake, consult status, emails, store embed.
3. **Admin finalize.** Staff turn a consult quote into a priced one and send
   the Shopify payment link from `/admin`.

## 1. Goal

Publish all four sequencing services with their approved prices on
`/pricing`, make `/services` the page about how BioKEA works, and put the
services with price ranges on the homepage — all rendered from one data file
so a price can never disagree with itself across pages.

## 2. Hard constraints

- `pricedServices` in `src/data/pricing.ts` keeps its export name, its two
  slugs (`barcoding`, `metabarcoding`), the `PriceTier` shape, every tier
  number, `additionalMarkerPrice`, and `conversationThreshold`. The live
  widget (`src/widget/*`) and the pricing engine (`src/lib/pricing/quote.ts`)
  import it and must keep working untouched. Spec 2 is where they change.
- `/services` renders no dollar amounts and its Service JSON-LD carries no
  `offers`. (Existing policy, kept.)
- The eDNA anchor stays `#metabarcoding`. Links from `/services`, the store,
  and past emails depend on it.
- Nothing from `public/` is used as a page. The two mockups move to
  `docs/source/mockups/` in this spec; anything left in `public/` ships to
  production as a bare URL.

## 3. Data

### 3.1 `src/data/pricing.ts`

Stays the single source of truth and grows additively.

**Changes inside the existing `pricedServices` entries**

- Barcoding `included` becomes the mockup's seven items (imaging and
  non-destructive extraction; COI on Oxford Nanopore; identification against
  BOLD and NCBI; a confidence rating per identification; per-sample summary;
  plate QC with reasons for unidentified specimens; interactive dashboard
  plus per-specimen image, sequence and ID ready for BOLD and GBIF).
- eDNA `included` keeps its five items with the mockup's wording.
- `addonNote: string` is replaced by `addons: { title: string; body: string }[]`.
  Barcoding lists two add-ons (other or multiple markers at 75% of the
  per-specimen rate; bulk eDNA from the preservative at eDNA rates). eDNA
  lists one (additional markers at $12 / $15 per sample).
- `advantages` and `tagline` take the mockup's wording where it differs.

**New exports** (every `…` below is copy lifted verbatim from the pricing
mockup; nothing is left to invent at build time)

```ts
export const identificationOnlyBarcoding = {
  slug: 'barcoding-id-only',
  title: 'Identification only, no voucher',
  price: 5, // per specimen, flat, both audiences
  description: '…',
};

export const barcodingExtraMarkerFraction = 0.75;

export const confidenceRatings: { level: 'High' | 'Moderate' | 'Unresolved'; meaning: string }[];

export const metagenomics = {
  slug: 'metagenomics',
  serviceTag: 'Whole-community sequencing',
  title: 'Metagenome and metatranscriptome sequencing',
  tagline: '…',
  description: '…',
  included: string[],
  assays: [
    { id: 'mg', title: 'Metagenome', description: 'All the DNA in the specimen', academicPrice: 2400, commercialPrice: 3000 },
    { id: 'mt', title: 'Metatranscriptome', description: 'Active genes, from RNA', academicPrice: 3350, commercialPrice: 4200 },
  ],
  unitLabel: 'specimen',
  notes: string[], // RNA preservation; environmental samples by consultation
};

export const targetedEdna = {
  slug: 'targeted-edna',
  serviceTag: 'Species-specific detection',
  title: 'Targeted eDNA for one or more species',
  tagline: '…',
  description: '…',
  customQuote: true as const,
};

export const samplingKitPrice = 20;

export const comparisonRows: {
  label: string;
  barcoding: string;
  metabarcoding: string;
  metagenomics: string;
  targetedEdna: string;
}[];

/** Display order and anchors for /pricing and the homepage strip. */
export const pricingSections: { id: string; label: string }[] = [
  { id: 'barcoding', label: 'Barcoding' },
  { id: 'metabarcoding', label: 'eDNA' },
  { id: 'metagenomics', label: 'Metagenomics' },
  { id: 'targeted-edna', label: 'Targeted eDNA' },
];

/** Honest price range for a service across all tiers and both audiences. */
export function priceRange(slug: string): { min: number; max: number; unit: string } | null;
```

`priceRange` returns `null` for `targeted-edna`. For barcoding it spans the
tiered rates only (6–20); the $5 identification-only option is a separate
product and is not folded into the range.

Target organisms, markers, sample types and consultation triggers are **not**
added. Nothing in this spec renders them; they arrive with spec 2.

### 3.2 `src/data/services.ts`

```ts
export interface ServiceOffering {
  name: string;
  description?: string;
  kind: 'priced' | 'project-rate';
  pricingAnchor?: string; // priced only
  configurable?: boolean; // priced only: true when /quote can price it today
}
```

Eight rows, in this order:

| name                                           | kind         | anchor        | configurable |
| ---------------------------------------------- | ------------ | ------------- | ------------ |
| Voucher-linked specimen barcoding              | priced       | barcoding     | true         |
| Environmental DNA (eDNA) metabarcoding         | priced       | metabarcoding | true         |
| Metagenome and metatranscriptome sequencing    | priced       | metagenomics  | false        |
| Targeted eDNA (qPCR) for one or more species   | priced       | targeted-edna | false        |
| Study design                                   | project-rate |               |              |
| Bioinformatic data analysis and interpretation | project-rate |               |              |
| Custom eDNA / qPCR assay design and validation | project-rate |               |              |
| Field collection assistance                    | project-rate |               |              |

This fixes the current row that points qPCR at the eDNA anchor.
`configurable` flips to `true` for metagenomics in spec 2; targeted eDNA
stays `false` (it is always a consultation).

### 3.3 Mockups

`public/pricing.html` and `public/order-configurator.html` move to
`docs/source/mockups/`. They are untracked today; they are committed only in
their new home.

## 4. `/pricing`

`src/pages/pricing.astro`, rebuilt. All copy comes from the data file or the
mockup. Components: `BaseLayout`, `Eyebrow`, `PageNav`, `PriceLadder` (plus a
small named-row variant), `CtaBand`.

1. **Hero.** Eyebrow `PRICING · MOLECULAR SEQUENCING`. H1 "Pricing for
   barcoding, eDNA, and metagenomic sequencing". Lede from the mockup.
   Actions: `Configure and pay online →` to
   `https://store.biokea.ai/products/specimen-barcoding`; `or build a quote`
   to `/quote`; `Talk to us →` to `/contact?topic=sequencing`. Fine print:
   the pay-online line with a `See our full service catalog` link to
   `/services`, and the auction-sourced-equipment line linking `/lab`.
2. **PageNav** with the four `pricingSections`.
3. **Barcoding** `<section id="barcoding">`: service tag, H2, tagline,
   description; three advantage cards; two columns — "What's included"
   checklist left; right, a Confidence ratings panel (three pills: High in
   teal, Moderate in slate-blue, Unresolved in grey) and an Add-ons panel in
   the ochre accent. Below: "Price by volume tier" with the per-specimen
   note and `PriceLadder`; then a bordered panel "Identification only, no
   voucher: $5 per specimen" with its description; then the
   volume-commitments line. Store CTA for barcoding under the ladder.
4. **eDNA** `<section id="metabarcoding">`: same skeleton without advantage
   cards or ratings; Add-ons panel with the extra-marker price;
   `PriceLadder` with three tiers; store CTA for eDNA
   (`https://store.biokea.ai/products/edna-metabarcoding`).
5. **Metagenomics** `<section id="metagenomics">`: service tag, H2, tagline,
   description, included list, then a two-row named-price ladder
   (Metagenome; Metatranscriptome) showing academic and commercial per
   specimen, then the two notes. CTA: `Talk to us →` to contact. (The
   configurator cannot price this until spec 2, so no `/quote` link here.)
6. **Targeted eDNA** `<section id="targeted-edna">`: service tag, H2,
   tagline, description, one button `Request a custom quote` to contact.
7. **Comparison** `<section id="compare">`: H2 "Which service fits your
   project?", four-column table from `comparisonRows`, horizontally
   scrollable below 900px, column headers link to their sections, the
   combining-services footnote.
8. **CtaBand** "Not sure which service, or need a project-specific number?"
   to `/quote`, then the pricing disclaimer paragraph.

**JSON-LD.** One `Service` node per section, `provider` the org. Offers:

- barcoding: four tiered `Offer`s as today, plus a fifth flat offer for
  identification-only (`eligibleQuantity` min 1, one `UnitPriceSpecification`
  at $5 named "Any client type").
- metabarcoding: three tiered offers as today.
- metagenomics: two offers, one per assay, each with academic and commercial
  `UnitPriceSpecification`s and `eligibleQuantity` min 1, unit "specimen".
- targeted-edna: no `offers`.

The "See exactly what you receive" link in the mockup targets a page that
does not exist and is dropped.

## 5. `/services`

`src/pages/services.astro`, trimmed. No dollar amounts anywhere on the page.

1. **Hero.** Unchanged copy; actions `Build a quote` → `/quote`,
   `Talk to us →`, `See the lab →`. The "pay online by card" fine-print line
   stays.
2. **Who it's for.** Unchanged.
3. **What we offer.** Two groups from `serviceOfferings`:
   - **Priced services** (`kind === 'priced'`): name, description, and two
     links — `See pricing →` to `/pricing#<anchor>`, and either
     `Configure →` to `/quote` (`configurable`) or `Talk to us →` to contact.
     The BugPicker sentence with its `/lab#lab-bugpicker` link stays under
     the barcoding row.
   - **Project-rate services** (`kind === 'project-rate'`): name,
     description, `Talk to us →`.
   - The two store "Configure … & pay online" buttons leave this page; they
     live next to the numbers on `/pricing`.
4. **What you get back, Workflow.** Unchanged.
5. **FAQ.** Existing six questions plus one: "What's the difference between
   barcoding, eDNA metabarcoding, metagenomics, and targeted qPCR?" —
   two-sentence answer and a link to `/pricing#compare`.
6. **CtaBand.** Unchanged.

**JSON-LD.** Eight `Service` nodes, no `offers`. `FAQPage` gains the new
question.

## 6. Homepage strip

New `src/components/sections/ServicesStrip.astro`, placed in
`src/pages/index.astro` directly after `<Hero>` and before `<Thesis>`.

- Eyebrow `WHAT WE SEQUENCE`; H2 "Four services. One Berkeley lab."
- Four cards, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, styled like the
  Ecosystem tiles (cream-warm, hairline border, rounded). Each card: service
  tag (mono eyebrow), name, one sentence, a price line, a link.

| Card                 | Price line                             | Link                           |
| -------------------- | -------------------------------------- | ------------------------------ |
| Specimen barcoding   | `$6–$20 per specimen · volume-tiered`  | See pricing → `#barcoding`     |
| eDNA metabarcoding   | `$115–$205 per sample · volume-tiered` | See pricing → `#metabarcoding` |
| Metagenomics         | `$2,400–$4,200 per specimen`           | See pricing → `#metagenomics`  |
| Targeted eDNA (qPCR) | `Custom quote`                         | Talk to us → contact           |

Ranges come from `priceRange()`, never typed by hand. "From $6" is not used
anywhere: only the largest academic programme gets that rate.

- Under the cards, one line: "Academic and nonprofit rates on every service.
  Build a quote in about a minute →" linking `/quote`.

The home FAQ answer to "What services does BioKEA offer?" is rewritten to
name the four priced services and the project-rate consulting.

## 7. Text feeds and SEO

- `public/llms.txt`: the Services section lists the four priced services,
  each with its range and the `/pricing` anchor, and notes academic/nonprofit
  vs commercial rates.
- `src/pages/llms-full.txt.ts` renders from `serviceOfferings`; it groups by
  `kind` and links priced rows to their anchors. No other change.
- `/api/capabilities.json` is unchanged (it describes lab capability, not
  price).

## 8. Testing

**Unit (`tests/unit/content-data.test.ts`)**

- Existing `pricedServices` assertions stay green unchanged.
- New: `identificationOnlyBarcoding.price === 5`;
  `barcodingExtraMarkerFraction === 0.75`; metagenomics has two assays with
  commercial > academic; `priceRange('barcoding')` is `{6, 20, 'specimen'}`,
  `priceRange('metabarcoding')` is `{115, 205, 'sample'}`,
  `priceRange('metagenomics')` is `{2400, 4200, 'specimen'}`,
  `priceRange('targeted-edna')` is `null`; `pricingSections` has the four
  ids in order; `serviceOfferings` has four priced rows whose anchors match
  `pricingSections`, and each priced row's anchor exists; `comparisonRows`
  has a non-empty cell in every column.
- `tests/unit/widget-template.test.ts`: still renders both services from
  `pricedServices` with their counts and the eDNA marker field.

**E2E**

- `tests/e2e/pricing.spec.ts`: H1 text; four section headings; all barcoding
  tier prices plus `$5`; all eDNA tier prices; metagenomics shows `$2,400`,
  `$3,000`, `$3,350`, `$4,200`; targeted section has the custom-quote
  button; comparison has four column headers; hero CTAs as today; JSON-LD
  graph has four Service nodes, barcoding has five offers, targeted has
  none; no internal comment leaks (`Michelle`, `cost model`, `gross margin`).
- `tests/e2e/services.spec.ts`: no `$` in body text; eight Service nodes
  without offers; priced rows link to the right anchors; metagenomics and
  targeted rows link to contact, barcoding and eDNA rows link to `/quote`;
  the store buttons are gone from this page; FAQ JSON-LD contains the new
  question; existing BugPicker and BioInfoOS link checks stay.
- `tests/e2e/home.spec.ts`: strip heading visible; four cards; the barcoding
  card contains `$6–$20`; the qPCR card contains "Custom quote"; existing
  checks stay.
- `tests/e2e/nav.spec.ts` and `widget.spec.ts`: untouched and must stay
  green.

## 9. Out of scope (later specs)

- The guided configurator, intake vocabulary (targets, markers, sample
  types), consultation capture and status, sampling-kit sales, pricing
  metagenomics or qPCR in the widget, the store embed, and any admin work.
- Any change to the pricing engine, the quote API, the Shopify flow, or the
  widget bundle version.
