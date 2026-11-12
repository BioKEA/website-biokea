# eDNA Prepared Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let eDNA clients order sequencing + bioinformatics on libraries they prepared themselves, at 75% of the full-service price, on Illumina or Nanopore; tell small (<10 sample) orders they may wait for a shared run; list the in-house Illumina MiSeq i100.

**Architecture:** A new engine line kind `prepared-library` on the `metabarcoding` slug, priced from tiers and an added-marker price derived from the full-service data. The eDNA config gains `starting` and `platform`; the order builder picks the kind from `starting`. Everything downstream (quote API, admin firm quote, balance, Shopify custom line items) already keys on `lineKey` and only needs the kind listed.

**Tech Stack:** Astro 6, TypeScript, zod, Vitest, Playwright, Cloudflare Workers.

**Spec:** `docs/superpowers/specs/2026-11-11-edna-prepared-libraries-design.md`

## Global Constraints

- Prepared-library rates = `Math.round(0.75 × full-service rate)` per tier and per audience; added marker likewise: tiers $124/$154, $98/$120, $86/$109; marker $9/$11 (academic/commercial). Same tier boundaries (1–48, 49–199, 200+), counted in **samples**.
- Unit label is `sample`. Count = samples; markers = number of markers (same as the full-service line).
- Prepared libraries require platform `illumina` or `nanopore`; the full service also allows `none` (no preference). Platform never changes price.
- Small-batch note when samples < 10, both kinds: "Small orders are batched with other runs, so they may take longer." No price change, no consult, no block.
- Requirements note (exact copy): "Libraries must be indexed and meet our QC requirements. We'll send the spec sheet on request."
- Stored configs and quote lines without the new fields must parse, price and bill exactly as before (`starting` missing ⇒ `samples`, `platform` missing ⇒ `none`).
- Work on branch `feat/edna-prepared-libraries`; commit per task; no deploy until Sean says so.

## Review Focus

1. A stored eDNA quote (no `starting`/`platform`) re-read for a balance or firm quote → billed at the full-service rate, unchanged. (Task 2 test.)
2. Admin firm quote with a `prepared-library` row and a balance where the customer ships fewer samples → held at the prepared-library rate, never the full-service rate. (Task 3 test.)
3. Customer switches the widget from _Prepared libraries_ back to _Samples_ after choosing a platform → no stale `sampleType: 'unknown'`, kits and sample type reappear, quote reverts to full-service price. (Task 4 e2e.)
4. Prepared libraries with platform `none` arriving at `/api/quote` (forged or stale client) → rejected as invalid, not quoted. (Task 2 test.)
5. Exactly 10 samples → no small-batch note; 9 → note, on both kinds. (Task 2 and Task 4 tests.)

---

### Task 1: Pricing data and engine kind

**Files:**

- Modify: `src/data/pricing.ts` (after `ednaAdditionalMarkerPrice`, ~line 50)
- Modify: `src/lib/pricing/quote.ts` (`LineKind`, `priceSource`)
- Test: `tests/unit/pricing-engine.test.ts`

**Interfaces:**

- Produces (in `src/data/pricing.ts`):
  - `export const preparedLibraryFraction = 0.75;`
  - `export const preparedLibraryTiers: PriceTier[]` — the metabarcoding tiers with both prices scaled and rounded; same `range`, `minQty`, `maxQty`, `best`; `description` copied.
  - `export const preparedLibraryMarkerPrice: { academic: number; commercial: number }` — `{ academic: 9, commercial: 11 }` by derivation.
  - `export const preparedLibraries = { title: 'eDNA metabarcoding from prepared libraries', included: string[], requirementsNote: string }` — `included`: `['Sequencing on Illumina (MiSeq i100) or Oxford Nanopore', 'Bioinformatics: taxonomic assignment and quality control', 'Digital report: full list of taxa detected within your target group, per sample']`; `requirementsNote` per Global Constraints.
  - `export const smallBatchThreshold = 10;` and `export const smallBatchNote = 'Small orders are batched with other runs, so they may take longer.';`
- Produces (in `quote.ts`): `LineKind` gains `'prepared-library'`; line title `'eDNA metabarcoding, prepared libraries'`.

- [ ] **Step 1: Write the failing tests** in a new `describe('pricing engine — prepared libraries')`:

```ts
it('derives tiers and marker price at 75%, whole dollars', () => {
  expect(preparedLibraryTiers.map((t) => [t.academicPrice, t.commercialPrice])).toEqual([
    [124, 154],
    [98, 120],
    [86, 109],
  ]);
  expect(preparedLibraryMarkerPrice).toEqual({ academic: 9, commercial: 11 });
});
it('prices 60 samples × 2 markers at the 49–199 prepared rate', () => {
  const l = buildQuote([
    { serviceSlug: 'metabarcoding', kind: 'prepared-library', count: 60, markers: 2 },
  ]).lines[0];
  expect(l.academic.total).toBe(6420); // 60 × (98 + 9)
  expect(l.commercial.total).toBe(7860); // 60 × (120 + 11)
  expect(l.serviceTitle).toBe('eDNA metabarcoding, prepared libraries');
  expect(l.unitLabel).toBe('sample');
});
it('20 samples × 3 markers, academic, is $2,840', () => {
  const l = buildQuote([
    { serviceSlug: 'metabarcoding', kind: 'prepared-library', count: 20, markers: 3 },
  ]).lines[0];
  expect(l.academic.total).toBe(2840);
});
it('applies dead-zone pricing at 44 samples like the full service', () => {
  const l = buildQuote([{ serviceSlug: 'metabarcoding', kind: 'prepared-library', count: 44 }])
    .lines[0];
  expect(l.academic.pricedCount).toBe(49);
  expect(l.academic.total).toBe(49 * 98);
});
it('refuses prepared-library on another slug', () => {
  expect(() =>
    buildQuote([{ serviceSlug: 'barcoding', kind: 'prepared-library', count: 5 }]),
  ).toThrow();
});
it('offers the next-tier upsell for prepared libraries', () => {
  expect(nextTierUpsell('metabarcoding', 10, 1, 'academic', 'prepared-library')?.newBaseRate).toBe(
    98,
  );
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/pricing-engine.test.ts` — expect FAIL (missing exports / unknown kind).
- [ ] **Step 3: Implement** the exports in `pricing.ts`, the `prepared-library` case in `priceSource` (`requireSlug('metabarcoding')`, tiers `preparedLibraryTiers`, `markerRule: { type: 'flat', price: preparedLibraryMarkerPrice }`, `conversationThreshold` from the metabarcoding service). In `nextTierUpsell`, allow kind `'prepared-library'` as well as `'service'` and pass the kind to `priceSource`.
- [ ] **Step 4: Run** the same command — expect PASS; then `npx vitest run tests/unit` — all pass.
- [ ] **Step 5: Commit** `feat(pricing): prepared-library line kind at 75% of eDNA rates`.

---

### Task 2: Config, validation, order builder, summary

**Files:**

- Modify: `src/lib/pricing/order.ts` (`MetabarcodingConfig`, `metabarcodingOrder`, `validateConfig`, `metabarcodingSummary`)
- Modify: `src/lib/pricing/config-schema.ts` (`metabarcoding` object)
- Test: `tests/unit/order.test.ts`, `tests/unit/quote-api.test.ts`

**Interfaces:**

- Consumes: Task 1 kind and `smallBatchThreshold`, `smallBatchNote`.
- Produces: `MetabarcodingConfig` gains `starting?: 'samples' | 'libraries'` and `platform?: 'illumina' | 'nanopore' | 'none'`. Helper `export function ednaStarting(c: MetabarcodingConfig): 'samples' | 'libraries'` (missing ⇒ `'samples'`). Error key `platform`, message `'Choose the platform your libraries were built for.'`

- [ ] **Step 1: Write the failing tests** (use the `edna()` fixture):

```ts
it('prepared libraries price as a prepared-library line', () => {
  const o = buildOrder(edna({ starting: 'libraries', platform: 'illumina' }));
  expect(o.inputs[0]).toMatchObject({ kind: 'prepared-library', count: 60, markers: 2 });
  expect(o.quote.total.commercial).toBe(7860);
});
it('a stored config without starting prices as the full service', () => {
  expect(buildOrder(edna()).quote.total.commercial).toBe(10500);
});
it('prepared libraries need a real platform', () => {
  expect(validateConfig(edna({ starting: 'libraries', platform: 'none' })).platform).toBeTruthy();
  expect(validateConfig(edna({ starting: 'libraries' })).platform).toBeTruthy();
  expect(validateConfig(edna({ platform: 'none' })).platform).toBeUndefined();
});
it('prepared libraries skip the sample-type check', () => {
  expect(
    validateConfig(edna({ starting: 'libraries', platform: 'nanopore', sampleType: '' as never }))
      .sampleType,
  ).toBeUndefined();
});
it('prepared libraries never add sampling kits', () => {
  const o = buildOrder(edna({ starting: 'libraries', platform: 'illumina', kits: true }));
  expect(o.inputs).toHaveLength(1);
});
it('summary names the starting point, platform, and small-batch note under 10', () => {
  const s = summarizeConfig(edna({ starting: 'libraries', platform: 'illumina', samples: 9 }));
  expect(s).toContain('Starting from: prepared libraries');
  expect(s).toContain('Platform: Illumina');
  expect(s).toContain(`Note: ${smallBatchNote}`);
  expect(s.some((l) => l.startsWith('Sample type:'))).toBe(false);
  expect(summarizeConfig(edna({ samples: 10 }))).not.toContain(`Note: ${smallBatchNote}`);
});
```

In `quote-api.test.ts`, add: a POST with `starting: 'libraries', platform: 'none'` returns the API's invalid response; one with `platform: 'nanopore'` returns a quote whose line `kind` is `prepared-library`.

- [ ] **Step 2: Run** `npx vitest run tests/unit/order.test.ts tests/unit/quote-api.test.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Schema: `starting: z.enum(['samples','libraries']).optional()`, `platform: z.enum(['illumina','nanopore','none']).optional()`. `metabarcodingOrder`: kind from `ednaStarting`; skip `kitsParts` for libraries. `validateConfig` metabarcoding: for libraries, skip the sample-type checks inside `validateChoices` (pass a flag) and require `platform` ∈ {illumina, nanopore}. Summary, in order: `Starting from: samples` / `Starting from: prepared libraries`; targets; markers; sample type (samples only); `Samples: N`; `Platform: Illumina` / `Oxford Nanopore` / `No preference` (omit when `platform` missing); kits (samples only); `Note: ${smallBatchNote}` when `samples < smallBatchThreshold`. Barcoding summary and order are untouched.
- [ ] **Step 4: Run** the same command, then `npx vitest run tests/unit` — all PASS.
- [ ] **Step 5: Commit** `feat(order): eDNA starting point, platform, and small-batch note`.

---

### Task 3: Admin firm quote and balance know the kind

**Files:**

- Modify: `src/lib/payments/finalise.ts` (`FIRM_ROW_TYPES`)
- Modify: `src/lib/payments/balance-form.ts` (`KINDS`)
- Modify: `src/widget/template.ts` (`tierText` only if a case is needed — default `${tierRange} tier` is correct, so likely no change)
- Test: `tests/unit/finalise-form.test.ts`, `tests/unit/balance-lines.test.ts`

**Interfaces:**

- Consumes: Task 1 kind.
- Produces: firm-quote row value `'prepared-library:metabarcoding:'`, label `'eDNA metabarcoding, prepared libraries'`, `markers: true`, placed right after `'service:metabarcoding:'`.

- [ ] **Step 1: Write the failing tests.** finalise-form: the form offers `prepared-library:metabarcoding:` and a submitted row with it builds a line priced at 60 × (120 + 11) commercial for 60 samples × 2 markers. balance-lines: a quoted `prepared-library` line of 60 samples, balance for 55 shipped → amount equals quoted total minus 5 × 131 commercial (held at the prepared rate); and a quoted full-service line is not matched by a `prepared-library` balance line (bills uncapped at the prepared rate).
- [ ] **Step 2: Run** `npx vitest run tests/unit/finalise-form.test.ts tests/unit/balance-lines.test.ts` — expect FAIL.
- [ ] **Step 3: Implement:** add the row type and add `'prepared-library'` to `KINDS`.
- [ ] **Step 4: Run** the same, then `npx vitest run tests/unit` — PASS.
- [ ] **Step 5: Commit** `feat(payments): firm quotes and balances accept prepared-library lines`.

---

### Task 4: Quote builder (widget) eDNA branch

**Files:**

- Modify: `src/widget/branches.ts` (`metabarcodingBranch` and new fieldsets)
- Modify: `src/widget/config-reader.ts` (`readMetabarcoding`, `syncHints`)
- Test: `tests/unit/widget-template.test.ts`, `tests/e2e/quote.spec.ts`

**Interfaces:**

- Consumes: Task 1 `preparedLibraries.requirementsNote`, `smallBatchThreshold`, `smallBatchNote`; Task 2 config fields.
- Produces: radio field `starting` (values `samples` default-checked, `libraries`; legend "What will you send us?"; labels "Samples" with desc "Water, soil, sediment, or air samples or filters" and "Prepared libraries" with desc "Indexed libraries, ready to sequence"); radio field `platform` (legend "Sequencing platform"; `illumina` "Illumina (MiSeq i100)", `nanopore` "Oxford Nanopore", `none` "No preference" default-checked and wrapped in `data-show-when="starting=samples"`); hint element `data-small-batch-hint` under the sample count.

- [ ] **Step 1: Write the failing tests.** Unit (widget-template): the eDNA branch HTML contains the `starting` and `platform` fields, the requirements note inside `data-show-when="starting=libraries"`, and the sample-type field and kits fieldset each wrapped in `data-show-when="starting=samples"`. E2E (quote.spec.ts), new test `eDNA prepared libraries price at the prepared rate and switch back cleanly`: open the eDNA quote, 60 samples, markers 12S + COI, choose Prepared libraries + Illumina → commercial total shows $7,860; sample type and kits hidden; requirements note visible; switch to Samples → $10,500, sample type visible. Second test `small eDNA orders show the batching note below 10`: 9 samples → note visible; 10 → hidden.
- [ ] **Step 2: Run** `npx vitest run tests/unit/widget-template.test.ts` and `npx playwright test tests/e2e/quote.spec.ts` — expect FAIL.
- [ ] **Step 3: Implement.** Branch order: starting, targets, markers, sample type (samples only), sample count (with `data-small-batch-hint`), platform, requirements note (libraries only), kits (samples only). `readMetabarcoding`: read `starting` and `platform`; for libraries set `sampleType: 'unknown'` and `kits: false` and drop `sampleOther`; if `platform` is `none` while libraries is chosen, keep it so validation reports it. `syncHints`: for metabarcoding set `data-small-batch-hint` text to `smallBatchNote` when `0 < samples < smallBatchThreshold`, else `''`. Add `platform` to the error slots so the message shows under the platform field.
- [ ] **Step 4: Run** the same two commands — PASS; then `npx vitest run tests/unit`.
- [ ] **Step 5: Commit** `feat(widget): prepared-libraries choice, platform, and small-batch hint for eDNA`.

---

### Task 5: Pricing page, services copy, llms files

**Files:**

- Modify: `src/data/pricing.ts` (metabarcoding `included[2]`, eDNA description sentence)
- Modify: `src/pages/pricing.astro` (eDNA section, Service/Offer JSON-LD)
- Modify: `public/llms.txt`, `src/pages/llms-full.txt.ts`, `src/data/services.ts` if it states eDNA is Nanopore-only
- Test: `tests/e2e/pricing.spec.ts`, `tests/e2e/llms-txt.spec.ts`

**Interfaces:**

- Consumes: Task 1 exports.

- [ ] **Step 1: Write the failing tests.** pricing.spec: new test `eDNA section shows the prepared-libraries ladder and notes` — within `#metabarcoding`: heading "From prepared libraries", prices $124, $154, $98, $120, $86, $109, text "$9" and "$11" per added marker, the requirements note, the small-batch note, and "Illumina or Oxford Nanopore". JSON-LD on /pricing has an Offer named for prepared libraries. llms-txt.spec: `llms.txt` mentions "prepared libraries" and "MiSeq i100".
- [ ] **Step 2: Run** `npx playwright test tests/e2e/pricing.spec.ts tests/e2e/llms-txt.spec.ts` — FAIL.
- [ ] **Step 3: Implement.** Full-service `included[2]` → `'Library indexing, pooling, and sequencing on Illumina (MiSeq i100) or Oxford Nanopore'`. In the eDNA section, after the full-service ladder: a sub-block "From prepared libraries" with one sentence (send indexed libraries; we sequence and run the same bioinformatics and report, at 75% of the rates above), `preparedLibraries.included` list, `<PriceLadder tiers={preparedLibraryTiers} unitLabel="sample" />`, the added-marker line, the requirements note, and the small-batch note (the small-batch note also applies to the full service — place it once below both ladders). JSON-LD: add an Offer mirroring the existing eDNA one, with the prepared-library price range. llms.txt and llms-full: one bullet for the option with prices, the small-batch note, platform line. Homepage strip range stays full-service only (spec).
- [ ] **Step 4: Run** the same — PASS; also `npx playwright test tests/e2e/store-prices.spec.ts tests/e2e/services.spec.ts tests/e2e/home.spec.ts`.
- [ ] **Step 5: Commit** `content(pricing): prepared-libraries rates, platform and small-batch notes`.

---

### Task 6: Illumina MiSeq i100 on equipment, lab, press, capabilities

**Files:**

- Modify: `src/data/equipment.ts` (Sequencing stage `secondary`)
- Modify: `src/pages/lab.astro` (~lines 415, 442), `src/pages/press.astro` (~line 17 and `oneParagraph`), `src/pages/api/capabilities.json.ts`, `public/llms.txt` (equipment line ~82)
- Test: `tests/e2e/lab.spec.ts`, `tests/e2e/api-endpoints.spec.ts`

- [ ] **Step 1: Write the failing tests.** lab.spec: /lab mentions "Illumina MiSeq i100". api-endpoints: `/api/capabilities.json` eDNA service has `primaryInstrument` containing both "Oxford Nanopore Promethion 2" and "Illumina MiSeq i100", and `lab.sequencers` lists both.
- [ ] **Step 2: Run** `npx playwright test tests/e2e/lab.spec.ts tests/e2e/api-endpoints.spec.ts` — FAIL.
- [ ] **Step 3: Implement.** Sequencing stage: keep the Promethion hero and photo; add secondary line `'Illumina MiSeq i100 for short-read amplicon sequencing, including client-prepared libraries.'` (no new photo needed). Capabilities: eDNA `primaryInstrument: 'Oxford Nanopore Promethion 2; Illumina MiSeq i100'`, add `lab.sequencers: ['Oxford Nanopore Promethion 2', 'Illumina MiSeq i100']` keeping `sequencer` for compatibility. Lab page and press: add the MiSeq i100 beside the Promethion where the sequencer is named; eDNA amplicon line says "on the ONT Promethion 2 or Illumina MiSeq i100". llms.txt equipment line adds it.
- [ ] **Step 4: Run** the same — PASS.
- [ ] **Step 5: Commit** `content(lab): list the in-house Illumina MiSeq i100`.

---

### Task 7: Full verification and hand-off

- [ ] **Step 1:** `npx vitest run` — all pass. `npm run build` — "Complete!". `npx playwright test` — all pass (note any pre-existing skips).
- [ ] **Step 2:** Local preview (`npm run dev`): screenshot /pricing eDNA section and the quote builder in _Prepared libraries_ mode; check against the spec.
- [ ] **Step 3:** Merge `feat/edna-prepared-libraries` into `main`. Stop and report to Sean; deploy (`npx wrangler deploy`) and push only on his go. After deploy, re-check live /pricing and the store Order page widget, and note that the owed real-money eDNA check now covers prepared libraries too.
