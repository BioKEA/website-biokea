# Pricing page — design

**Date:** 2026-08-12
**Source:** `BioKEA_Pricing_Page_2.html` (repo root; a standalone HTML mockup with
real, approved dollar pricing — content source of truth, not visual/styling
source of truth)

## 1. Goal

Add a dedicated `/pricing` page publishing real, tiered dollar pricing for
BioKEA's two flagship high-volume sequencing offerings — DNA barcoding and
eDNA metabarcoding — built to be the highest-conversion page on the site for
driving people into the sequencing service.

## 2. Policy context (confirmed with user)

The site currently has a deliberate, tested "no published prices" policy:
`src/data/services.ts`'s header comment says "no published prices," and
`tests/e2e/services.spec.ts` asserts `/services` contains zero `$` and zero
`priceSpecification` JSON-LD. **This does not need to change.** `/services`
stays exactly as dollar-free as it is today — it only gains links pointing
_out_ to the new page. The site's stance becomes: no prices cluttering the
general catalog, full transparency on one dedicated pricing page. No existing
test on `/services` needs to change.

**Confirmed decisions:**

- Publish real pricing now — this is a deliberate business decision, not a
  policy accident.
- Every dollar figure in the source file is final and ships as-is, including
  the flagged thin-margin 5,000+ specimen tier.
- "Request a Quote" routes through the existing `/contact` form
  (`?topic=sequencing`), not the source file's placeholder
  `mailto:hello@biokea.ai` — consistent with every other CTA on the site,
  and keeps lead capture/spam protection intact.
- `/pricing` joins the "What we do" nav dropdown (Services, Pricing, Lab) —
  not a new standalone top-level link.
- `/pricing` carries real structured `Offer`/`priceSpecification` JSON-LD.
  `/services` keeps its no-`priceSpecification` policy unchanged.

**Must never ship:** the source file's internal HTML comment (addressed to
Michelle) containing BioKEA's real gross-margin target and references to
internal cost-model spreadsheets. Strip it entirely — an HTML comment is
still visible via view-source.

## 3. Page structure — `/pricing`

1. **Hero** — eyebrow, H1/subhead adapted from the source file. Primary CTA
   "Request a quote" → `/contact?topic=sequencing`. Secondary link back to
   `/services` ("Need something else? See our full service catalog →") for
   the 5 offerings that aren't fixed-rate (study design, custom assay design,
   field collection, etc.).
2. **Credibility strip** (new, not in the source file) — one line reusing
   the site's existing, already-established phrase about equipment "sourced
   through Bay Area biotech auctions at roughly one-tenth retail," linking to
   `/lab`. Ties the pricing's credibility to the company's real origin story
   instead of asserting low rates out of nowhere.
3. **Barcoding panel** — service tag, title, tagline, description, 3
   "advantages" cards, "what's included" checklist, 4-tier rate ladder
   (1–300 / 300–1,000 / 1,000–5,000 / 5,000+ specimens), add-on note.
4. **eDNA Metabarcoding panel** — same structure, 3-tier rate ladder (1–48 /
   49–200 / 200+ samples), plus the multi-marker add-on note.
5. **Comparison table** — Barcoding vs. eDNA Metabarcoding (what it tells
   you, input required, resolution, best for), carried over from the source
   file almost verbatim.
6. **CTA band** (`CtaBand` component) — "Not sure which service — or need a
   project-specific number?" → `/contact?topic=sequencing`.
7. **Fine print** — standard disclaimer paragraph, adapted from the source.
8. **JSON-LD** — one `Service` node per offering (matching `/services`'
   existing per-offering pattern), each with an `offers` array: one `Offer`
   per tier, carrying `eligibleQuantity` (the volume range) and a two-entry
   `priceSpecification` array (`UnitPriceSpecification` for academic vs.
   commercial rates, `priceCurrency: "USD"`).

## 4. Components and data

- **New `src/data/pricing.ts`** — typed `PricedService[]` (slug, service tag,
  title, tagline, description, advantages, included list, unit label, tier
  array with `minQty`/`maxQty` for JSON-LD). Two entries: `barcoding`,
  `metabarcoding`.
- **New `src/components/ui/PriceLadder.astro`** — shared between both panels
  (genuinely reused twice, unlike `/works`'s one-off cards). Props: a tier
  array + unit label. Each tier is a bordered row, teal left-accent by
  default, switching to **ochre** (not gold — tokens.css reserves gold
  strictly for the Golden Sample Hunt) with a "Best rate" badge on the
  top-volume tier, matching the existing ochre-badge convention used for
  "revealing soon" on `/projects`. Range + description left, academic/
  commercial price pair right; stacks vertically on mobile.
- **New `src/pages/pricing.astro`** — assembles the above using existing
  `Eyebrow` and `CtaBand` components and the site's actual Tailwind/token
  system (cream/ink/teal/pink/ochre, Inter + JetBrains Mono) — the source
  file's own CSS/fonts (Fraunces, IBM Plex Mono, its own color variables)
  are not used; only its copy and numbers are.
- Comparison-table markup stays inline in the page (used once — doesn't
  need a data model).

## 5. Cross-linking (the actual conversion mechanism)

- `src/data/services.ts`'s two matching offerings — "DNA-based identification
  of organisms (barcoding)" and "qPCR / eDNA assay (single + multi-species)"
  — get an inline "See pricing →" link on `/services` to `/pricing#barcoding`
  / `/pricing#metabarcoding`.
- `/pricing`'s hero links back to `/services` for everything else.
- `src/components/layout/Nav.astro` — "What we do" group becomes: Services,
  Pricing, Lab.
- `src/components/layout/Footer.astro` — add a Pricing link alongside
  Press/Works/Pipeline.
- Sitemap: `/pricing` is fully indexed (not added to `hiddenFromSitemap`).

## 6. Reconciliation checklist

**New:**

- `src/data/pricing.ts`
- `src/components/ui/PriceLadder.astro`
- `src/pages/pricing.astro`
- `tests/e2e/pricing.spec.ts`

**Edited:**

- `src/data/services.ts` — update header comment for accuracy (two of seven
  offerings now have published pricing); no structural change.
- `src/pages/services.astro` — inline "See pricing →" links on the two
  matching catalog rows.
- `src/components/layout/Nav.astro` — add Pricing to "What we do".
- `src/components/layout/Footer.astro` — add Pricing link.
- `tests/unit/content-data.test.ts` — add `pricing data` block.
- `tests/e2e/services.spec.ts` — add one test for the new inline links.
- `tests/e2e/nav.spec.ts` — update "What we do" dropdown + footer link
  assertions to include Pricing.

**Deleted (after content is extracted):**

- `BioKEA_Pricing_Page_2.html` — the source mockup, once its content has
  been fully carried into `pricing.ts`/`pricing.astro`. Never referenced by
  any route; not meant to ship as a static file.

**Explicitly unchanged:** `tests/e2e/services.spec.ts`'s existing
"no dollar-sign" and "no priceSpecification" tests — still valid, since
`/services` itself remains dollar-free.

## 7. Testing

- `tests/unit/content-data.test.ts`: 2 priced services, correct tier counts
  (4 for barcoding, 3 for eDNA), academic price strictly decreasing as
  volume increases (a real behavioral check, not just a count).
- `tests/e2e/pricing.spec.ts`: hero renders; both panels render all tiers
  with correct dollar amounts; best-rate badge on the correct (top-volume)
  tier; comparison table renders; CTA routes to `/contact?topic=sequencing`;
  JSON-LD has the correct number of `Offer`/tier nodes per service.
- `tests/e2e/services.spec.ts`: new test for the two inline "See pricing"
  links routing to the right anchors.
- `tests/e2e/nav.spec.ts`: "What we do" dropdown and footer both include
  Pricing.

## 8. Out of scope

- Any change to `/services`' existing no-dollar-sign / no-priceSpecification
  tests or policy — unchanged.
- An academic-vs-commercial toggle or visitor-detection mechanism — both
  rates display side by side, matching the source file.
- A new `/contact` topic specific to pricing — reuses the existing
  "Sequencing service inquiry" topic, consistent with `/services`' own CTA.
