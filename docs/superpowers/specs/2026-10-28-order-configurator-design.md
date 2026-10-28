# Order configurator — design

Date: 2026-10-28. Spec 2 of the pricing/services programme (spec 1:
`2026-10-26-pricing-catalog-and-pages-design.md`, shipped). Spec 3 (admin
finalisation of consult quotes) follows this one.

## Intent

Replace the two-service quote widget with a guided order configurator that
mirrors `docs/source/mockups/order-configurator.html`, in the site's own
design system, and make it the single ordering surface on both
biokea.ai (`/quote`) and store.biokea.ai (a new **Order** page). A customer
picks a service from a menu, answers only the questions that service
needs, gives specific directions for the lab, sees a draft quote, and
either pays through Shopify checkout or, when the project needs a
conversation, saves the quote in a consult state for the lab to finalise.

Sean's words: the current "Build a quote" is "missing lots of necessary
selective options", lacks qPCR and metagenomics/metatranscriptomics, and
pre-selecting voucher-linked barcoding "is misleading". On the store, "the
client can choose from a menu and provide specific directions to follow
with their order." He chose **a single order page with the service menu**
over per-product forms.

## Goals

- One configurator, one code path, mounted on `/quote` and on the store's
  Order page. The store's product pages become entry points into it.
- Service menu first, nothing pre-selected. Four services: specimen
  barcoding, eDNA metabarcoding, metagenome/metatranscriptome sequencing,
  targeted eDNA (qPCR).
- Every selectable option in the mockup is present, with the same pricing
  rules, driven from `src/data/pricing.ts` (never hard-coded in the
  widget).
- Free-text directions per service plus a general note travel with the
  order: stored on the quote, shown in both emails, and written onto the
  Shopify draft order so the lab reads them next to the line items.
- Consult cases save a real quote (number, `/quote/<token>` page, both
  emails, visible in `/admin`) in a `consult` status, with no payment CTA.
- The existing money path is untouched: pay-in-full draft order, Net-30
  with PO, rate lock, credit on under-shipping, webhooks, admin balance.

## Non-goals

- Admin finalisation of consult quotes (converting a consult quote into a
  priced, payable one). Spec 3.
- Selling sampling kits through self-serve checkout. Kits are physical,
  taxable goods and the draft order collects no shipping address, so for
  now **ticking "Sampling kits" adds a consult trigger** (Sean's call,
  2026-10-28): the quote lists the kit count as "to be confirmed", the lab
  arranges kits, address and tax by hand. Self-serve kits return once the
  store handles taxable goods (CDTFA, shipping rates).
- Changing published prices or tier boundaries.
- Shopify cart / add-to-cart. The mockup's "adds to cart" is replaced by the
  existing draft-order checkout hand-off (Sean: "customize as much as we
  can but use shopify ultimately for check out").

## Anti-goals

- A default service. Rendering with barcoding pre-selected is the bug
  being fixed.
- Prices the widget computes that the API does not recompute. The API
  remains the pricing authority; a client total is never trusted.
- Two configurators drifting apart (site vs store). One bundle, one
  template module, one engine.

## Constraints (hard)

- `src/data/pricing.ts` `pricedServices` stays byte-compatible (spec 1
  rule); new engine inputs are added beside it, not by changing tiers.
- The quote API keeps accepting today's request shape (`lines[]` of
  `serviceSlug/count/markers`) so a cached store bundle keeps working
  during the rollout; new fields are additive and optional.
- Supabase migrations are applied by Sean by hand **before** the push that
  depends on them (PostgREST rejects inserts naming unknown columns).
  Migration `0009` must be in the plan's first task and called out in the
  deploy note.
- Widget bundle stays a self-contained IIFE (`public/widget/quote.{js,css}`),
  no Tailwind, `.bk-*` classes only, colours via the site's tokens copied
  into `quote.css` (the store does not load `tokens.css`).
- Turnstile, honeypot, origin check, CORS allowlist unchanged.
- Theme pushes go to the live Horizon theme (there is no staging theme);
  each push is confirmed with Sean and limited with `--only`.
- Bump the widget version (`package.json` → `1.3.0`) and the store's
  Custom Liquid `?v=` so the new bundle is served the day it ships.

## The configurator

### Layout and style

Single column, max width ~720px, in the site's type and colour tokens
(`--color-ink`, `--color-cream`, `--color-teal`, `--color-ochre`,
`--color-pink`, `--font-sans`, `--radius-sm/md`). Fieldsets with a bold
legend, 16px inputs, teal focus ring, pink error text. Hidden sections are
`hidden` (not display toggles on inputs), so screen readers follow. The
draft quote renders in a panel below the form, not a modal; the consult
dialog from the mockup becomes an inline panel too. Mobile: one column,
16px gutters, no horizontal scroll.

### Step 1 — Service (required, no default)

Radio cards: Voucher-linked specimen barcoding · Environmental DNA (eDNA)
metabarcoding · Metagenome and metatranscriptome sequencing · Targeted eDNA
for one or more species (qPCR). Each card carries the one-line tagline and
the price range from `priceRange()` (qPCR: "Custom quote"). Nothing else
renders until a service is chosen. `?service=<slug>` in the URL, or
`data-service` on the mount element, pre-selects one (used by store
product pages and pricing-page links).

### Step 2 — Pricing (audience)

Academic/nonprofit vs Commercial. Default **Commercial** (kept from the
pay-in-full decision). The academic attestation checkbox stays on the
details step as today.

### Step 3 — service branch

**Barcoding**

- Specimen handling: Voucher-linked (tiered) · Identification only, no
  voucher ($5 flat, `identificationOnlyBarcoding`).
- Target organism (single select): invertebrates, vertebrates, fungi,
  other. Sub-categories as checkboxes where the mockup has them.
  "Other" → describe → consult trigger.
- Genetic markers (checkboxes): COI, 12S, 16S, 18S, ITS, Other. Suggested
  markers follow the target (invertebrates COI, vertebrates COI, fungi
  ITS) and are applied until the customer edits them; a "differs from
  suggestion" note appears afterwards. "Other" → which marker → consult.
  Each marker after the first costs `barcodingExtraMarkerFraction` (75%)
  of the applied tier rate per specimen.
- Sample type: Water, Soil, Net-collected, Other, Unknown (with the
  mockup's per-service hints). Other/Unknown → describe → consult.
- How many samples will you send (bags, tubes, traps) → integer ≥ 1.
- Specimen selection: "Barcode up to N organisms per sample" with N;
  count = samples × N. Optional "Focus on unique organisms" with a
  required study-design description. With no count (checkbox off), the
  base line is "to be confirmed" and the quote goes to consult.
- Vertebrates only: "What material will you collect from the animals?"
  with the mockup's options — Swabs (buccal or skin), Hair with follicles,
  Feces, Other — and its notice asking for collection methods that do not
  harm live animals. Comments are optional unless "Other" is ticked, in
  which case they are required.
- Add-on: Bulk eDNA from preservative — priced at eDNA tiers on the sample
  count, plus eDNA extra-marker pricing for extra markers.
- Sampling kits: checkbox → consult trigger "Sampling kits (N)" with N =
  samples; shown as "to be confirmed" at `samplingKitPrice` ($20) each.
- Volume ≥ `conversationThreshold` (3,001) → consult, as today.

**eDNA metabarcoding**

- Target organisms (multi select): bacteria/archaea, phytoplankton,
  microeukaryotes, invertebrates, vertebrates, fungi, other (+ subs).
  Suggested markers: 16S, 18S, 18S, COI, 12S, ITS respectively.
- Markers as above; each extra marker `ednaAdditionalMarkerPrice` per
  sample ($12 academic / $15 commercial).
- Sample type as above. Number of samples → tiered price.
- Sampling kits: checkbox → consult trigger, N = samples, as above.

**Metagenome / metatranscriptome**

- Sequencing type (checkboxes, ≥ 1): Metagenome ($2,400 / $3,000 per
  specimen), Metatranscriptome ($3,350 / $4,200). Choosing MT shows the
  RNA-preservation note.
- What will you send: single specimens (priced) · environmental samples
  (priced at the specimen rate as an estimate; required description;
  consult trigger).
- Number of specimens/samples → integer ≥ 1. One line per assay.

**Targeted eDNA (qPCR)** — custom intake, always consult, no prices:
species of interest (required), what to measure (presence/absence,
relative abundance, both), existing assay (yes/no/not sure), sample type,
approximate number of samples. The draft quote shows "Custom quote after
consultation".

### Step 4 — Directions and details

- "Specific directions for the lab" (textarea, 2,000 chars, optional; the
  per-branch descriptions above are separate, required where the mockup
  requires them).
- Name, email, organization, Turnstile — as today.

### Draft quote panel

Line items with amount or "To be confirmed"; tier label; dead-zone
callout and honest next-tier upsell as today (engine unchanged for the
tiered lines); total at the chosen rate with the other rate named once;
status pill **Ready for checkout** or **Consultation needed before
payment**.

CTAs when ready: "Pay $X and start →" (existing chained POST `/api/quote`
→ `/api/quote/<token>/pay`), "Invoice me (Net-30)" with the PO field
optional as today, "Email me this quote". CTAs when consult: "Request consultation" (saves the quote
with `status = 'consult'`), and that's all; the pay note explains payment
opens once the lab confirms details. "Edit options" returns to the form
with the quote retired (the stale-handoff signature logic in
`src/widget/state.ts` extends to the whole config).

## Data

### Engine (`src/lib/pricing/quote.ts`)

Add a typed `ProjectConfig` (discriminated on `service`) and
`buildOrder(config, audience?) → Order { lines, total, consult: Trigger[],
tbc: boolean }`. `buildQuote(lines)` stays for the legacy request shape and
is what `buildOrder` calls for the tiered lines, so dead-zone, rate-lock
and upsell behaviour is reused, not duplicated.

**Markers stay folded into the tiered line's effective rate**, exactly as
eDNA markers are today: `priceOne` learns a second surcharge form for
barcoding (`barcodingExtraMarkerFraction` × tier rate per extra marker)
beside eDNA's flat per-sample amount, and the surcharge is charged on the
**priced** count (the dead-zone block), as it is now. The draft quote
panel shows the marker surcharge as an explanatory sub-line under the
service line; it is not a separate stored line.

New line kinds beside the tiered `service` line: `id-only` (flat $5 ×
count), `preservative-edna` (eDNA tiers on the sample count, markers
folded in the same way), `assay` (mg/mt × count). Kits are a consult
trigger, not a line (see Non-goals).
Every stored line carries `kind`, `count`, `unitRate` (per audience, the
locked rate actually applied) and `scalesWithCount: true`; only the qPCR
placeholder is non-scaling. Consult triggers are data (`{ key, label,
detail }`), not booleans, so emails and admin can list them.

**Balance / under-shipping (money path).** The policy from the pay-in-full
spec is unchanged and now applies per line: when the lab enters actual
counts, `computeBalance` re-scales every `scalesWithCount` line at its
locked `unitRate` (tiered lines keep today's rate-lock behaviour;
assays, id-only and preservative lines are `actual × unitRate`), and the
shortfall against the quoted count becomes the credit. The admin balance
form gets one actual-count input per stored line instead of one per
service. Legacy quotes (no `kind`) keep the current path untouched.

### API (`POST /api/quote`)

Accepts either today's `lines[]` or a new `config` object (zod union);
with `config`, the server runs `buildOrder` and derives `lines` from it.
Persists: `config` (jsonb), `directions` (text), `consult_triggers`
(jsonb), and `status = 'consult'` when triggers exist or `tbc` is true;
otherwise `status = 'quoted'` as today. `needs_conversation` is set from
the same condition for backwards compatibility.

Migration `migrations/0009_quote_config.sql`: add `config jsonb`,
`directions text`, `consult_triggers jsonb not null default '[]'`; extend
the `status` check to include `'consult'`. Nothing is renamed.

### Draft order (`src/lib/payments/gateway.ts` via `pay.ts`)

Line items come from the stored `lines` (one Shopify custom line per engine
line, title = engine line title, e.g. "Environmental DNA (eDNA)
Metabarcoding, 2 markers (COI, 12S)", "Metatranscriptome sequencing"). The draft order **note** gets a
plain-text summary: service, options chosen (handling, targets, markers,
sample type, material), the directions text, and the per-branch
descriptions. `customAttributes` gain `Directions` (truncated to Shopify's
limit) and `Quote` (number). A consult quote cannot reach `pay`: `pay.ts` already
redirects non-`quoted` quotes back to the quote page with a flash, and
`consult` joins that rule until spec 3 finalises it.

### Quote page and emails

`/quote/<token>` shows the configuration summary and directions; consult
quotes show "Consultation requested" and no pay button. Customer and lab
emails list the options, triggers and directions (lab email first, with
"CONSULT" in the subject when applicable). `/admin` shows a **Consult**
badge for `status = 'consult'`.

## Surfaces

### biokea.ai

- `/quote` mounts the new widget (same `#quote-widget` contract, `?service`
  honoured).
- `/pricing`: the per-section "Configure and pay online" links and the
  hero's store CTA point at `https://store.biokea.ai/pages/order?service=<slug>`
  (today: the two product URLs). "Build a quote" stays `/quote`.
- `/services` "Configure →" links become `/quote?service=<slug>`.
- Home services strip cards link to `/quote?service=<slug>` for the three
  priced services; qPCR keeps the contact link.
- `public/llms.txt` and `llms-full.txt` mention the order page.

### store.biokea.ai (Horizon theme, live)

- New `templates/page.order.json`: a page template whose main section is a
  Custom Liquid block with the widget embed (`data-source="store"`,
  `?v=1.3.0`). A new Online Store page **Order** (handle `order`) uses it.
  Page creation happens through the Shopify Admin (connector or admin UI);
  the template push and the page are both in the plan.
- Home page hero primary CTA → `/pages/order`. Main menu gains **Order**
  as the first item.
- `templates/product.quote.json`: the widget block is replaced by the
  product description and a primary button "Configure this service →"
  linking to `/pages/order?service=<slug>` (a Liquid `case` on
  `product.handle`: `specimen-barcoding` → `barcoding`, `edna-metabarcoding`
  → `metabarcoding`). The two products stay Active as catalog/SEO pages; no
  new products are created (draft orders use custom line items).
- Store header logo → `https://biokea.ai/` (already pushed 2026-10-28).
- **Theme files live in this repo** under `docs/shopify/theme/` mirroring
  the theme's paths, for the files we own: `templates/page.order.json`,
  `templates/product.quote.json`, `blocks/_header-logo.liquid`,
  `sections/header-group.json`. `docs/shopify/STORE-SETUP.md` gains the
  procedure: `shopify theme pull --live` into a scratch dir, copy our
  files over, `shopify theme check`, `shopify theme push --live --only
<files>`. Everything else in the theme stays Shopify's.
- The main menu and the home hero CTA are Navigation and section-settings
  resources, not theme files pushed with `--only`: the plan does them
  through the Shopify Admin connector (`menuUpdate`, and the `index.json`
  hero setting pushed as a theme file) with admin-UI steps written in
  STORE-SETUP as the fallback.

## Tests

- Unit: `buildOrder` for every branch and trigger (prices against the
  mockup's numbers: e.g. barcoding 3 samples × 50, COI+12S, voucher,
  academic = 150 × $16 + 150 × $12 = $4,200; eDNA 60 samples, 2 markers,
  commercial = 60 × ($160 + $15) = $10,500, and ticking kits turns it into
  a consult quote with a "Sampling kits (60)" trigger; MG+MT 2
  specimens commercial = $14,400; id-only 400 = $2,000; qPCR → consult, no
  total); template renders no checked service by default; config signature
  changes retire a hand-off; API accepts both shapes and sets `consult`.
- E2E (`tests/e2e/quote.spec.ts`, `widget.spec.ts`, `payments.spec.ts`
  rewritten): no service selected on load; each branch reveals its fields;
  eDNA happy path to the pay hand-off; qPCR and "Other marker" paths reach
  "Request consultation" and the quote page says "Consultation requested";
  directions appear on the quote page; `?service=metagenomics` pre-selects;
  pricing/services/home links updated; mobile has no horizontal scroll;
  keyboard-only completion of the eDNA path.
- Theme: `shopify theme check` clean for touched files; after push, curl
  the order page and a product page for the expected link and embed.

## Rollout

1. Migration 0009 applied in Supabase (Sean).
2. Site deploy (widget 1.3.0 + API + pages) via push to main.
3. Theme push: `page.order.json`, `product.quote.json`, header menu;
   create the Order page; set the home hero CTA.
4. Verify on both hosts; run the §6 money-path check from
   `docs/shopify/PAY-IN-FULL-VERIFICATION.md` on a real eDNA order.

## Left to the builder

- Exact `ProjectConfig` field names and the zod schema (follow the
  mockup's ids).
- How the widget keeps the form state while the quote panel is shown.
- Copy for hints and errors (lift from the mockup; site tone).
- Whether the store's Order page uses the Horizon `page` section with a
  Custom Liquid block or a dedicated section file.

## Calls I made (not Sean's words)

- Product pages become entry points with a button rather than embedding
  the configurator pre-selected: fewer surfaces to keep in sync, and it is
  what "single order page" implies.
- Barcoding quantity follows the mockup (samples × max per sample) rather
  than a direct specimen count.
- Pricing-page store links move from product URLs to the Order page.
- Audience default stays Commercial.
- Consult is a new `status` value, not a separate table.
- Marker surcharges stay inside the tiered line's effective rate (as eDNA
  does today) and are charged on the priced count in a dead zone.
- Under-shipping credit applies per line at the locked unit rate; the
  admin balance form takes one actual count per line.
- Vertebrate material options follow the mockup, not my first draft.
- PO number stays optional on the Net-30 path.
- Our theme files are committed under `docs/shopify/theme/`; menu and
  hero changes go through the Admin connector with UI fallback.
