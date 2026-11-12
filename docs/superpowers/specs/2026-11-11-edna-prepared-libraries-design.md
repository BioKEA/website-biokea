# eDNA metabarcoding from client-prepared libraries — design

Date: 2026-11-11 · Status: draft for Sean's review (builder check done)

## Why

Some eDNA clients arrive with libraries they have already built. For them the
lab does only sequencing and bioinformatics, so the cost is labor, the
sequencing kit, consumables, and overhead — not extraction or PCR. Today's
eDNA price assumes BioKEA does everything from extraction through sequencing,
so these clients are overcharged or have to ask for a custom quote.

Separately, the eDNA price assumes most orders are 10 samples or more. Smaller
orders have to be combined with other runs so the lab doesn't lose money on
them. The site should say so.

## Goals

1. A **prepared-libraries** option for eDNA metabarcoding, priced and orderable
   in the quote builder with a firm quote and the normal checkout, like the
   full service.
2. It costs **75% of what the same order costs as the full service**, for
   now (Sean, 2026-11-11). Priced per sample like the full service, with the
   same tiers (1–48, 49–199, 200+, by sample count) and the added-marker
   charge also at 75%, so it is always about a quarter cheaper.
3. The client gets **reads plus the same bioinformatics and taxa report** as
   the full service.
4. Libraries can be for **Illumina (in-house MiSeq i100) or Oxford Nanopore**;
   the full service can also run on either. Prices are the same on both platforms for now.
5. Orders **under 10** are allowed at the normal price, with a plain note that
   small orders are batched with other runs and may take longer. No
   turnaround number. Applies to the full service and prepared libraries.

## Non-goals

- No per-platform price difference yet (Sean answered "different prices",
  then set 75% across the board "for now"). The data shape should make a
  later split easy, but nothing on the site varies by platform today.
- No minimum charge, small-batch fee, or consult for small orders.
- No detailed library spec sheet on the site.
- No change to barcoding, metagenomics, targeted eDNA, or the bulk-eDNA
  preservative add-on (it keeps full-service eDNA pricing).

## Anti-goals

- Billing a prepared-library line at the full-service rate, or the reverse,
  anywhere in the money path (quote API, admin finalise, balance, Shopify).
- Breaking stored quotes: rows without the new fields must read and bill
  exactly as before.

## Decisions (Sean's)

| Question                        | Answer                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform for prepared libraries | Client's choice: Illumina or Nanopore                                                                                                                                                                                             |
| Pricing shape                   | Per unit, tiered, academic and commercial                                                                                                                                                                                         |
| Price level                     | 75% of the full-service tier price, for now                                                                                                                                                                                       |
| Tier boundaries                 | Same as full service: 1–48, 49–199, 200+                                                                                                                                                                                          |
| Multiple markers                | Like the full service: per sample, plus an added-marker charge, all at 75%. (Sean first chose per-library pricing; the builder check showed it made multi-marker orders dearer than the full service, and Sean switched to this.) |
| Illumina instrument             | In-house Illumina MiSeq i100                                                                                                                                                                                                      |
| Deliverable                     | Reads + bioinformatics + the same taxa report                                                                                                                                                                                     |
| Ordering                        | In the quote builder, firm quote + normal checkout                                                                                                                                                                                |
| Library requirements            | Short note: libraries must be indexed and meet our QC requirements; spec sheet sent on request                                                                                                                                    |
| Full-service platform           | Either platform; say so on the page                                                                                                                                                                                               |
| Under 10                        | Allowed, same price, "batched with other runs and may take longer", no number                                                                                                                                                     |
| Under-10 scope                  | Both the full service and prepared libraries                                                                                                                                                                                      |

## Prices

75% of each full-service rate, rounded to whole dollars (half up) — my call,
so the ladder shows whole-dollar rates like every other price on the site:

| Tier (samples)                | Academic | Commercial | Full service (acad / comm) |
| ----------------------------- | -------- | ---------- | -------------------------- |
| 1–48                          | $124     | $154       | $165 / $205                |
| 49–199                        | $98      | $120       | $130 / $160                |
| 200+                          | $86      | $109       | $115 / $145                |
| Each added marker, per sample | $9       | $11        | $12 / $15                  |

Rounding the rates means a total can differ from exactly 75% of the
full-service total by a few dollars (20 samples × 3 markers, academic:
20 × ($124 + 2 × $9) = $2,840, against exactly 75% of $3,780 = $2,835).

Derive these from the full-service data with a named constant
(`preparedLibraryFraction = 0.75` in `src/data/pricing.ts`) rather than
hard-coding them, so changing the full-service price or the fraction moves
both.

## How it fits the existing code

The engine already has priced variants that hang off a parent service
(`LineKind` in `src/lib/pricing/quote.ts`: `id-only` on barcoding,
`preservative-edna` on metabarcoding). The new option is one more:

- **Line kind `prepared-library`**, parent slug `metabarcoding`. Title
  "eDNA metabarcoding, prepared libraries"; unit label `sample`; tiers as
  above; marker rule `flat` at the derived $9 / $11. It can trigger the same
  conversation threshold as the full service if one is ever set (none
  today).
- **Count** = samples, and markers = number of markers, exactly as the
  full-service line (`metabarcodingOrder` in `src/lib/pricing/order.ts`);
  only the kind differs.
- **Config** (`MetabarcodingConfig`, `src/lib/pricing/config-schema.ts`): add
  `starting: 'samples' | 'libraries'` and `platform: 'illumina' | 'nanopore'
| 'none'` (no preference). Both optional on read; missing means
  `samples` / `none`, so stored configs parse unchanged. For prepared
  libraries the platform is required and can't be `none` — a library runs
  only on the platform it was built for (my call, from the builder check).
- **Payments**: Shopify bills custom line items
  (`src/lib/payments/gateway.ts`), so no new Shopify product is needed. The
  new kind must be added wherever kinds are listed or matched: the balance
  form's `KINDS` (`src/lib/payments/balance-form.ts`), the admin finalise
  options (`src/lib/payments/finalise.ts`), and line descriptions in
  `src/lib/payments/terms.ts` and `src/widget/template.ts`. `lineKey`
  already separates kinds, so a held balance can't borrow the full-service
  rate.

## Quote builder (eDNA branch)

At the top of the eDNA form, a choice: **What will you send us?**

- _Samples_ — water, soil, sediment, or air samples or filters (today's flow).
- _Prepared libraries_ — indexed libraries ready to sequence.

With _Prepared libraries_:

- Keep the target and marker questions (the bioinformatics needs them).
- Hide the sample-type question and the sampling-kits add-on.
- The count question asks how many samples the libraries come from.
- Show the requirements note.

For both choices, a **platform** question: Illumina, Oxford Nanopore, or (full
service only) no preference. Required for prepared libraries. It doesn't
change the price; it goes into the order summary.

**Under-10 note**: when the sample count is under 10, show a hint under the count: "Small orders
are batched with other runs, so they may take longer." It goes into the
order summary and the emailed quote too. It doesn't block, price, or route
to a consult.

## Pages and copy

- **`/pricing` eDNA section** (`src/pages/pricing.astro`, data in
  `src/data/pricing.ts`): add a "From prepared libraries" price ladder with
  its own short "what's included" (sequencing, bioinformatics, taxa report),
  the requirements note, and the under-10 note. Change the full-service
  "included" list from "Oxford Nanopore sequencing" to "Illumina or Oxford
  Nanopore sequencing". Add the new offer to the page's Service/Offer
  JSON-LD.
- **Homepage services strip / `/services`**: price ranges come from the data
  (`priceRange` in `src/data/pricing.ts`); decide whether the eDNA range
  should now start at $86 (see "Left to the builder").
- **`llms.txt` / `llms-full.txt`**: describe the option, prices, and the
  under-10 note.
- **Equipment, lab, press, capabilities**: add the in-house Illumina MiSeq
  i100 alongside the Promethion 2 (`src/data/equipment.ts`,
  `src/pages/lab.astro`, `src/pages/press.astro`,
  `src/pages/api/capabilities.json.ts`, `public/llms.txt`). eDNA entries in
  capabilities name both instruments. No photo yet: use the equipment
  card's no-image layout if there is one, otherwise a placeholder, and list
  it as owed.

## Left to the builder

- Exact copy for labels and notes, matching the site's voice.
- Whether the homepage eDNA range shows the prepared-library floor or stays
  full-service only (my lean: full service only, with "from prepared
  libraries" mentioned on /pricing).
- Test coverage: engine prices for each tier and audience, multi-marker example (20 × 3 = $2,840 academic), stored-config back-compat, held-balance kind separation, widget
  show/hide, under-10 hint at 9 and not at 10, platform required for prepared libraries.

## Rollout

Same path as earlier pricing changes: build and test on a branch, check the
quote builder on a local preview, then commit, deploy, push. The live money
check still owed from the order-configurator rollout (a real eDNA order
through store.biokea.ai/pages/order) would cover this option too.
