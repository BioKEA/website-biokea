# Order Configurator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-service quote widget with a guided, four-service order configurator (service menu first, nothing pre-selected, per-service options and directions, consult state) that is the single ordering surface on biokea.ai/quote and on a new store.biokea.ai Order page.

**Architecture:** The pure pricing engine (`src/lib/pricing/quote.ts`) grows line _kinds_ (flat id-only, preservative eDNA, metagenomic assays) and the barcoding marker fraction, all still producing today's `QuoteLine` shape so the stored `lines`, draft-order lines, balance maths, emails and admin pages keep working. A new pure module `src/lib/pricing/order.ts` turns a typed `ProjectConfig` into engine inputs plus consult triggers. The API accepts either the legacy `lines[]` or a `config`, persists both, and sets `status = 'consult'` when the lab must talk first. The widget (`src/widget/*`) is rebuilt from the mockup as template strings over `src/data/configurator.ts`; the same bundle mounts on `/quote` and on the store's Order page.

**Tech Stack:** Astro v6 (server output, Cloudflare adapter), TypeScript, zod, Vitest (`npm test`), Playwright (`npm run test:e2e`, dev server on :4321), Vite IIFE widget build (`npm run widget:build`), Supabase (PostgREST), Shopify Admin GraphQL (draft orders), Shopify CLI 5 (`shopify theme push --live --only …`, store `a9zmvz-xs.myshopify.com`, theme Horizon #145016914154).

**Spec:** `docs/superpowers/specs/2026-10-28-order-configurator-design.md`

## Global Constraints

- `pricedServices` in `src/data/pricing.ts` stays byte-compatible: no change to tiers, titles, slugs, `additionalMarkerPrice`, `conversationThreshold`.
- `POST /api/quote` keeps accepting today's `{ lines: [{ serviceSlug, count, markers? }] }` body unchanged; new fields are additive and optional.
- Migration `migrations/0009_quote_config.sql` is applied by Sean in Supabase **before** the push that depends on it; the deploy note in the final task says so.
- Widget bundle stays a self-contained IIFE: no Tailwind, `.bk-*` classes only, colours as literal hex copied from `src/styles/tokens.css` with the `var(--color-*, #hex)` fallback pattern already used in `quote.css`.
- Turnstile, honeypot (`website`), origin check and CORS allowlist unchanged.
- Audience default is `commercial`.
- Service slugs: `barcoding`, `metabarcoding`, `metagenomics`, `targeted-edna`.
- Prices come from `src/data/pricing.ts` exports only: `barcodingExtraMarkerFraction = 0.75`, `ednaAdditionalMarkerPrice = {12, 15}`, `identificationOnlyBarcoding.price = 5`, `metagenomics.assays` (mg 2400/3000, mt 3350/4200), `samplingKitPrice = 20`, barcoding `conversationThreshold = 3001`.
- Line totals are whole dollars: `Math.round` per line (only id-only extra markers, 0.75 × $5, can produce fractions).
- Widget version: `package.json` and `src/data/version.ts` both become `1.3.0` (tests/unit/version.test.ts asserts they match).
- Theme pushes go to the live theme with `--only <files>`; every push is confirmed with Sean first. Theme files we own live in `docs/shopify/theme/<theme path>`.
- Commits run Prettier via lint-staged; re-read a file after committing before editing it again.
- Attribution line on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Review Focus

1. A barcoding count of exactly 3,001 specimens (samples × per-sample) must save as `consult` with a `volume` trigger and no pay CTA, not as a payable quote. Test in Task 3.
2. A store-cached 1.2.0 bundle still posts `{ lines, audience, source }` with no `config`; the API must create a normal `quoted` row. Test in Task 4.
3. An admin entering actual counts for a quote with an `assay` line and a `service` line must get both lines re-scaled, never `uncapped` for a line the quote actually has. Test in Task 5.
4. A customer who ticks "Other" marker, then unticks it, must end with no stale consult trigger and a payable quote. Test in Task 8.
5. `?service=nonsense` must render the menu with nothing selected, not throw. Test in Task 8.

---

### Task 1: Configurator catalog data

**Files:**

- Create: `src/data/configurator.ts`
- Test: `tests/unit/content-data.test.ts` (append a `describe('configurator catalog')`)

**Interfaces:**

- Produces:
  ```ts
  export type ServiceSlug = 'barcoding' | 'metabarcoding' | 'metagenomics' | 'targeted-edna';
  export type TargetId =
    | 'bacteria'
    | 'phytoplankton'
    | 'microeuk'
    | 'invertebrates'
    | 'vertebrates'
    | 'fungi'
    | 'other';
  export type MarkerId = 'COI' | '12S' | '16S' | '18S' | 'ITS' | 'other';
  export type SampleTypeId = 'water' | 'soil' | 'net' | 'other' | 'unknown';
  export type MaterialId = 'swabs' | 'hair' | 'feces' | 'other';
  export interface ServiceChoice {
    slug: ServiceSlug;
    title: string;
    tagline: string;
    priceLine: string;
  }
  export interface Target {
    id: TargetId;
    label: string;
    services: ServiceSlug[];
    marker?: Partial<Record<ServiceSlug, MarkerId>>;
    subs?: { all?: string[]; metabarcoding?: string[] };
    consult?: true;
  }
  export interface Marker {
    id: MarkerId;
    label: string;
    desc: string;
    consult?: true;
  }
  export interface SampleType {
    id: SampleTypeId;
    label: string;
    hints?: Partial<Record<ServiceSlug, string>>;
    consult?: true;
  }
  export interface Material {
    id: MaterialId;
    label: string;
  }
  export const serviceChoices: ServiceChoice[]; // four, in the mockup's order
  export const targets: Target[];
  export const markers: Marker[];
  export const sampleTypes: SampleType[];
  export const materials: Material[];
  export const vertebrateNotice: string; // the mockup's no-harm notice
  export function suggestedMarkers(service: ServiceSlug, targetIds: TargetId[]): MarkerId[];
  ```
- Consumes: `priceRange`, `pricedServices`, `metagenomics`, `targetedEdna` from `src/data/pricing.ts`.

Values: copy targets, subs, markers (labels and descriptions) and sample types from `docs/source/mockups/order-configurator.html` lines 333–431 verbatim; mockup service id `edna` → slug `metabarcoding`, `meta` → `metagenomics`, `qpcr` → `targeted-edna`. `materials` = Swabs (buccal or skin), Hair with follicles, Feces, Other. `priceLine` = `"$6–$20 per specimen"` style from `priceRange()`, `"Custom quote"` for targeted-edna. `suggestedMarkers` returns the unique `marker[service]` of each selected target in selection order, falling back to `['COI']` for barcoding and `[]` for metabarcoding.

- [ ] **Step 1: Write the failing tests**

```ts
describe('configurator catalog', () => {
  it('lists the four services in menu order with a price line each', () => {
    expect(serviceChoices.map((s) => s.slug)).toEqual([
      'barcoding',
      'metabarcoding',
      'metagenomics',
      'targeted-edna',
    ]);
    expect(serviceChoices[0].priceLine).toBe('$6–$20 per specimen');
    expect(serviceChoices[3].priceLine).toBe('Custom quote');
  });
  it('marks the consult-only options', () => {
    expect(targets.find((t) => t.id === 'other')?.consult).toBe(true);
    expect(markers.find((m) => m.id === 'other')?.consult).toBe(true);
    expect(sampleTypes.filter((s) => s.consult).map((s) => s.id)).toEqual(['other', 'unknown']);
  });
  it('suggests markers per service from the selected targets', () => {
    expect(suggestedMarkers('metabarcoding', ['bacteria', 'vertebrates'])).toEqual(['16S', '12S']);
    expect(suggestedMarkers('barcoding', ['fungi'])).toEqual(['ITS']);
    expect(suggestedMarkers('barcoding', [])).toEqual(['COI']);
    expect(suggestedMarkers('metabarcoding', [])).toEqual([]);
  });
  it('offers bacteria and phytoplankton only for eDNA', () => {
    expect(targets.find((t) => t.id === 'bacteria')?.services).toEqual(['metabarcoding']);
    expect(targets.find((t) => t.id === 'invertebrates')?.services).toEqual([
      'barcoding',
      'metabarcoding',
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/content-data.test.ts -t "configurator catalog"`
Expected: FAIL, cannot resolve `@/data/configurator`.

- [ ] **Step 3: Create `src/data/configurator.ts` with the exports above**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/content-data.test.ts`
Expected: PASS (all describes).

- [ ] **Step 5: Commit**

```bash
git add src/data/configurator.ts tests/unit/content-data.test.ts
git commit -m "feat(configurator): catalog data for targets, markers, sample types, materials"
```

---

### Task 2: Engine line kinds and the barcoding marker fraction

**Files:**

- Modify: `src/lib/pricing/quote.ts` (`QuoteLineInput` L10–15, `QuoteLine` L37–46, `effectiveRate` L67–74, `buildQuote` L112–145, `nextTierUpsell` L155+)
- Test: `tests/unit/pricing-engine.test.ts` (append `describe('line kinds')`)

**Interfaces:**

- Produces:
  ```ts
  export type LineKind = 'service' | 'id-only' | 'preservative-edna' | 'assay';
  export interface QuoteLineInput {
    serviceSlug: string;
    count: number;
    markers?: number;
    kind?: LineKind;
    assay?: 'mg' | 'mt';
  }
  export interface QuoteLine {
    /* existing fields */ kind: LineKind;
    assay?: 'mg' | 'mt';
  }
  export function lineKey(l: Pick<QuoteLine, 'kind' | 'serviceSlug' | 'assay'>): string; // `${kind}:${serviceSlug}:${assay ?? ''}`
  ```
  `buildQuote(inputs)` unchanged in signature. `nextTierUpsell` unchanged in signature; returns `null` for non-`service` kinds.
- Rules:
  - `kind` defaults to `'service'`; legacy stored lines without `kind` are treated as `'service'` everywhere (`l.kind ?? 'service'`).
  - `effectiveRate` for `barcoding`: `base + (markers - 1) * base * barcodingExtraMarkerFraction`. eDNA unchanged. Any slug with neither rule and `markers > 1` still throws.
  - `id-only`: `serviceSlug` must be `barcoding`; flat tier `{ range: 'flat', minQty: 1, academicPrice: 5, commercialPrice: 5 }`; markers use the barcoding fraction on $5; `serviceTitle = 'Specimen barcoding, identification only'`, `unitLabel = 'specimen'`.
  - `preservative-edna`: `serviceSlug` must be `metabarcoding`; prices exactly like the eDNA service line; `serviceTitle = 'Bulk eDNA from preservative'`.
  - `assay`: `serviceSlug` must be `metagenomics`; `assay` required; flat tier from `metagenomics.assays`; markers must be 1; `serviceTitle` = `'Metagenome sequencing'` / `'Metatranscriptome sequencing'`; `unitLabel = 'specimen'`; `tierRange = 'per specimen'`.
  - Every `PriceResult.total` is `Math.round`ed.
  - `needsConversation` only for `service` kind lines (threshold on `pricedServices`).

- [ ] **Step 1: Write the failing tests**

```ts
describe('line kinds', () => {
  it('prices barcoding extra markers at 75% of the tier rate on the priced count', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 150, markers: 2 }]);
    expect(q.lines[0].academic.total).toBe(150 * 16 + 150 * 12); // 4200
    expect(q.lines[0].academic.effectiveRate).toBe(28);
  });
  it('still refuses markers on a service with no marker rule', () => {
    expect(() =>
      buildQuote([
        { serviceSlug: 'metagenomics', count: 1, kind: 'assay', assay: 'mg', markers: 2 },
      ]),
    ).toThrow();
  });
  it('prices id-only barcoding flat at $5 for both audiences and rounds fractions', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 400, kind: 'id-only' }]);
    expect(q.lines[0].academic.total).toBe(2000);
    expect(q.lines[0].commercial.total).toBe(2000);
    expect(q.lines[0].serviceTitle).toBe('Specimen barcoding, identification only');
    const two = buildQuote([{ serviceSlug: 'barcoding', count: 3, kind: 'id-only', markers: 2 }]);
    expect(two.lines[0].academic.total).toBe(Math.round(3 * (5 + 3.75))); // 26
  });
  it('prices preservative eDNA at the eDNA tiers with eDNA marker pricing', () => {
    const q = buildQuote([
      { serviceSlug: 'metabarcoding', count: 60, markers: 2, kind: 'preservative-edna' },
    ]);
    expect(q.lines[0].commercial.total).toBe(60 * (160 + 15));
    expect(q.lines[0].serviceTitle).toBe('Bulk eDNA from preservative');
  });
  it('prices metagenome and metatranscriptome assays per specimen', () => {
    const q = buildQuote([
      { serviceSlug: 'metagenomics', count: 2, kind: 'assay', assay: 'mg' },
      { serviceSlug: 'metagenomics', count: 2, kind: 'assay', assay: 'mt' },
    ]);
    expect(q.total.commercial).toBe(2 * 3000 + 2 * 4200); // 14400
    expect(q.lines[1].serviceTitle).toBe('Metatranscriptome sequencing');
    expect(q.needsConversation).toBe(false);
  });
  it('rejects a kind on the wrong service and a missing assay', () => {
    expect(() =>
      buildQuote([{ serviceSlug: 'metabarcoding', count: 1, kind: 'id-only' }]),
    ).toThrow();
    expect(() => buildQuote([{ serviceSlug: 'metagenomics', count: 1, kind: 'assay' }])).toThrow();
  });
  it('legacy inputs produce kind service and the same totals as before', () => {
    const q = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]);
    expect(q.lines[0].kind).toBe('service');
    expect(q.lines[0].commercial.total).toBe(60 * 175);
  });
  it('lineKey distinguishes kinds and assays', () => {
    expect(lineKey({ kind: 'assay', serviceSlug: 'metagenomics', assay: 'mt' })).toBe(
      'assay:metagenomics:mt',
    );
    expect(lineKey({ kind: 'service', serviceSlug: 'barcoding' })).toBe('service:barcoding:');
  });
  it('offers no tier upsell for flat lines', () => {
    expect(nextTierUpsell('barcoding', 10, 1, 'academic', 'id-only')).toBeNull();
  });
});
```

Note the last test: give `nextTierUpsell` a fifth optional parameter `kind: LineKind = 'service'`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/pricing-engine.test.ts -t "line kinds"`
Expected: FAIL (throws on `kind`, `lineKey` undefined).

- [ ] **Step 3: Implement in `src/lib/pricing/quote.ts`**

Add a private `priceSource(input): { tiers: PriceTier[]; title: string; unitLabel: string; markerRule: 'fraction' | 'flat' | 'none'; conversationThreshold?: number }` that resolves the kind, then run the existing `priceOne` loop over `tiers`. Keep `priceOne`'s dead-zone logic untouched; a one-tier list makes it a no-op.

- [ ] **Step 4: Run the whole unit suite**

Run: `npm test`
Expected: PASS, including the existing 28 engine tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/quote.ts tests/unit/pricing-engine.test.ts
git commit -m "feat(pricing): line kinds (id-only, preservative eDNA, assays) and the barcoding marker fraction"
```

---

### Task 3: `ProjectConfig`, `buildOrder`, validation, summary

**Files:**

- Create: `src/lib/pricing/order.ts`, `src/lib/pricing/config-schema.ts`
- Test: `tests/unit/order.test.ts`

**Interfaces:**

- Consumes: Task 1 catalog, Task 2 `buildQuote`/`QuoteLineInput`/`Quote`, `samplingKitPrice`.
- Produces (`order.ts`):
  ```ts
  export interface BarcodingConfig {
    service: 'barcoding';
    handling: 'voucher' | 'idOnly';
    target: TargetId;
    targetOther?: string;
    subs?: string[];
    markers: MarkerId[];
    markerOther?: string;
    sampleType: SampleTypeId;
    sampleOther?: string;
    samples: number;
    perSample?: number;
    uniqueOrganisms?: string;
    material?: MaterialId[];
    materialNotes?: string;
    preservativeEdna: boolean;
    kits: boolean;
    directions?: string;
  }
  export interface MetabarcodingConfig {
    service: 'metabarcoding';
    targets: TargetId[];
    targetOther?: string;
    subs?: Partial<Record<TargetId, string[]>>;
    markers: MarkerId[];
    markerOther?: string;
    sampleType: SampleTypeId;
    sampleOther?: string;
    samples: number;
    kits: boolean;
    directions?: string;
  }
  export interface MetagenomicsConfig {
    service: 'metagenomics';
    assays: ('mg' | 'mt')[];
    source: 'specimens' | 'environmental';
    envNotes?: string;
    count: number;
    directions?: string;
  }
  export interface TargetedEdnaConfig {
    service: 'targeted-edna';
    species: string;
    measure: 'presence' | 'abundance' | 'both' | 'unsure';
    assayExists: 'yes' | 'no' | 'unsure';
    sampleType: string;
    approxSamples?: number;
    directions?: string;
  }
  export type ProjectConfig =
    | BarcodingConfig
    | MetabarcodingConfig
    | MetagenomicsConfig
    | TargetedEdnaConfig;
  export type TriggerKey =
    | 'target-other'
    | 'marker-other'
    | 'sample-type'
    | 'count-unknown'
    | 'unique-organisms'
    | 'kits'
    | 'environmental'
    | 'qpcr'
    | 'volume';
  export interface ConsultTrigger {
    key: TriggerKey;
    label: string;
    detail: string;
  }
  export interface TbcLine {
    title: string;
    desc: string;
  } // "to be confirmed" rows (no amount)
  export interface Order {
    inputs: QuoteLineInput[];
    quote: Quote;
    triggers: ConsultTrigger[];
    tbc: TbcLine[];
    consult: boolean;
  }
  export function buildOrder(config: ProjectConfig): Order;
  export function validateConfig(config: ProjectConfig): Record<string, string>; // field → message; {} when valid
  export function summarizeConfig(config: ProjectConfig): string[]; // plain-text lines for emails and the draft-order note
  export function barcodingCount(c: BarcodingConfig): number | null; // samples × perSample, null when perSample unset
  ```
- Produces (`config-schema.ts`): `export const ConfigSchema: z.ZodType<ProjectConfig>` (discriminated union on `service`; strings trimmed, `max(2000)` on free text, counts `int().positive().max(1_000_000)`, `samples ≤ 100_000`, `perSample ≤ 1_000`).
- Rules for `buildOrder`:
  - barcoding: `kind = handling === 'idOnly' ? 'id-only' : 'service'`, `count = barcodingCount(c)`, `markers = c.markers.length` (an `other` marker counts). `count === null` → no priced line; `tbc` row "Specimen barcoding (COI) — number of specimens confirmed in consultation"; trigger `count-unknown`. `preservativeEdna` → extra input `{ serviceSlug: 'metabarcoding', kind: 'preservative-edna', count: samples, markers }`. `kits` → trigger `kits` with label `Sampling kits (N)` and `tbc` row `"N × $20, confirmed in consultation"` where N = samples. Triggers: `target === 'other'` → `target-other` (detail `targetOther`); `markers.includes('other')` → `marker-other`; sampleType consult → `sample-type` (label `Sample type: Other|Unknown`, detail `sampleOther`); `uniqueOrganisms` and `count === null` → `unique-organisms`; `quote.needsConversation` → `volume` (label "Volume", detail `"<count> specimens"`).
  - metabarcoding: one `service` input `{ serviceSlug: 'metabarcoding', count: samples, markers }`; same target/marker/sample/kits triggers (`targets.includes('other')`), kits N = samples.
  - metagenomics: one `assay` input per assay with `count`; `source === 'environmental'` → trigger `environmental` (detail `envNotes`), quote still priced (estimate).
  - targeted-edna: no inputs, `quote = { lines: [], total: {0,0}, needsConversation: false }`, trigger `qpcr` with detail = `species`.
  - `consult = triggers.length > 0`.
- Rules for `validateConfig` (messages are the mockup's): barcoding/metabarcoding need ≥1 marker (`markers`), `markerOther` when `other` ticked, `targetOther` when target other, `sampleOther` when sample type consult, `samples ≥ 1`; barcoding `perSample ≥ 1` when set, `uniqueOrganisms` non-empty when the field is present (empty string = ticked but blank → error), `materialNotes` when `material` includes `other`; metagenomics `assays.length ≥ 1`, `count ≥ 1`, `envNotes` when environmental; targeted-edna `species` non-empty, `sampleType` non-empty.
- `summarizeConfig` lines, in order: `Service: …`, then per service the chosen options one per line (`Handling: Voucher-linked`, `Target: Invertebrates (Insects (beetles, flies))`, `Markers: COI, 12S`, `Sample type: Water`, `Samples: 3, up to 50 organisms each`, `Material from animals: Swabs (buccal or skin)`, `Add-on: bulk eDNA from preservative`, `Sampling kits: 3 (to be confirmed)`, `Sequencing: Metagenome and Metatranscriptome`, `Source: environmental samples — <envNotes>`, qPCR fields), then `Directions: <text>` when present.

- [ ] **Step 1: Write the failing tests**

```ts
import { buildOrder, validateConfig, summarizeConfig, barcodingCount } from '@/lib/pricing/order';
import { ConfigSchema } from '@/lib/pricing/config-schema';

const bc = (over = {}) =>
  ({
    service: 'barcoding',
    handling: 'voucher',
    target: 'invertebrates',
    markers: ['COI'],
    sampleType: 'water',
    samples: 3,
    perSample: 50,
    preservativeEdna: false,
    kits: false,
    ...over,
  }) as const;
const edna = (over = {}) =>
  ({
    service: 'metabarcoding',
    targets: ['vertebrates'],
    markers: ['12S', 'COI'],
    sampleType: 'water',
    samples: 60,
    kits: false,
    ...over,
  }) as const;

describe('buildOrder', () => {
  it('barcoding: samples × per-sample, COI+12S academic = $4,200, no triggers', () => {
    const o = buildOrder(bc({ markers: ['COI', '12S'] }));
    expect(barcodingCount(bc())).toBe(150);
    expect(o.inputs).toEqual([
      { serviceSlug: 'barcoding', count: 150, markers: 2, kind: 'service' },
    ]);
    expect(o.quote.total.academic).toBe(4200);
    expect(o.consult).toBe(false);
  });
  it('barcoding without a per-sample maximum is to-be-confirmed and consult', () => {
    const o = buildOrder(bc({ perSample: undefined }));
    expect(o.inputs).toEqual([]);
    expect(o.tbc[0].title).toMatch(/identification|barcoding/i);
    expect(o.triggers.map((t) => t.key)).toEqual(['count-unknown']);
    expect(o.consult).toBe(true);
  });
  it('id-only 400 specimens = $2,000', () => {
    const o = buildOrder(bc({ handling: 'idOnly', samples: 8 }));
    expect(o.inputs[0].kind).toBe('id-only');
    expect(o.quote.total.commercial).toBe(2000);
  });
  it('preservative eDNA adds a second line on the sample count', () => {
    const o = buildOrder(bc({ preservativeEdna: true }));
    expect(o.inputs[1]).toEqual({
      serviceSlug: 'metabarcoding',
      kind: 'preservative-edna',
      count: 3,
      markers: 1,
    });
  });
  it('eDNA 60 samples, 2 markers, commercial = $10,500; kits turn it into consult', () => {
    expect(buildOrder(edna()).quote.total.commercial).toBe(10500);
    const k = buildOrder(edna({ kits: true }));
    expect(k.consult).toBe(true);
    expect(k.triggers[0]).toEqual({
      key: 'kits',
      label: 'Sampling kits (60)',
      detail: '60 × $20, confirmed in consultation',
    });
  });
  it('other target, other marker, and unknown sample type each trigger consult with the detail text', () => {
    const o = buildOrder(
      edna({
        targets: ['other'],
        targetOther: 'tardigrades',
        markers: ['other'],
        markerOther: 'rbcL',
        sampleType: 'unknown',
        sampleOther: 'mystery',
      }),
    );
    expect(o.triggers.map((t) => [t.key, t.detail])).toEqual([
      ['target-other', 'tardigrades'],
      ['marker-other', 'rbcL'],
      ['sample-type', 'mystery'],
    ]);
  });
  it('MG+MT on 2 specimens commercial = $14,400; environmental source is consult but still priced', () => {
    const o = buildOrder({
      service: 'metagenomics',
      assays: ['mg', 'mt'],
      source: 'specimens',
      count: 2,
    });
    expect(o.quote.total.commercial).toBe(14400);
    expect(o.consult).toBe(false);
    const env = buildOrder({
      service: 'metagenomics',
      assays: ['mg'],
      source: 'environmental',
      envNotes: 'pond water',
      count: 4,
    });
    expect(env.consult).toBe(true);
    expect(env.quote.total.academic).toBe(9600);
  });
  it('qPCR is always consult with no lines and a zero total', () => {
    const o = buildOrder({
      service: 'targeted-edna',
      species: 'Dreissena',
      measure: 'presence',
      assayExists: 'unsure',
      sampleType: 'water',
    });
    expect(o.quote.lines).toEqual([]);
    expect(o.triggers[0].key).toBe('qpcr');
    expect(o.quote.total).toEqual({ academic: 0, commercial: 0 });
  });
  it('3,001 barcoding specimens is a volume consult', () => {
    const o = buildOrder(bc({ samples: 3001, perSample: 1 }));
    expect(o.triggers.map((t) => t.key)).toEqual(['volume']);
    expect(o.consult).toBe(true);
  });
});

describe('validateConfig', () => {
  it('returns {} for a valid config and names each missing field', () => {
    expect(validateConfig(bc())).toEqual({});
    const errs = validateConfig(edna({ markers: [], targets: ['other'], sampleType: 'other' }));
    expect(Object.keys(errs).sort()).toEqual(['markers', 'sampleOther', 'targetOther']);
    expect(validateConfig(bc({ material: ['other'] }))).toHaveProperty('materialNotes');
    expect(
      validateConfig({
        service: 'targeted-edna',
        species: '',
        measure: 'both',
        assayExists: 'no',
        sampleType: '',
      }),
    ).toEqual(
      expect.objectContaining({ species: expect.any(String), sampleType: expect.any(String) }),
    );
  });
});

describe('summarizeConfig', () => {
  it('lists the chosen options and the directions as plain lines', () => {
    const lines = summarizeConfig(bc({ markers: ['COI', '12S'], directions: 'Keep legs.' }));
    expect(lines[0]).toBe('Service: Voucher-linked specimen barcoding');
    expect(lines).toContain('Markers: COI, 12S');
    expect(lines).toContain('Samples: 3, up to 50 organisms each');
    expect(lines[lines.length - 1]).toBe('Directions: Keep legs.');
  });
});

describe('ConfigSchema', () => {
  it('accepts each service and rejects an unknown one', () => {
    expect(ConfigSchema.safeParse(bc()).success).toBe(true);
    expect(ConfigSchema.safeParse({ service: 'plasmids' }).success).toBe(false);
    expect(ConfigSchema.safeParse(bc({ samples: 0 })).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/order.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `order.ts` and `config-schema.ts`**

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/unit/order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pricing/order.ts src/lib/pricing/config-schema.ts tests/unit/order.test.ts
git commit -m "feat(pricing): ProjectConfig → order: engine inputs, consult triggers, validation, summary"
```

---

### Task 4: Migration, record types, API accepts `config`, consult status, emails

**Files:**

- Create: `migrations/0009_quote_config.sql`
- Modify: `src/lib/payments/types.ts` (`QuoteStatus` L6–11, `QuoteRecord` L15–35), `src/lib/payments/labels.ts` (L18–24), `src/lib/payments/panel.ts` (switch at L56), `src/pages/api/quote.ts` (`QuoteSchema` L13–38, recompute L118–123, `row` L125–140, `renderSummary`/emails L193–320, response L322–325)
- Test: `tests/unit/quote-api.test.ts` (append `describe('config requests')`), `tests/unit/quote-payments-email.test.ts` only if `panelView` tests live there (check; otherwise add to `tests/unit/order.test.ts` a `describe('panelView consult')`)

**Interfaces:**

- Consumes: Task 3 `ConfigSchema`, `buildOrder`, `summarizeConfig`, `ConsultTrigger`.
- Produces:
  - `QuoteStatus` gains `'consult'`; `QuoteRecord` gains `config: ProjectConfig | null; directions: string | null; consult_triggers: ConsultTrigger[]`.
  - `statusLabel('consult') === 'Consultation requested'`; `panelView` returns `{ kind: 'none' }` for `consult`.
  - API response JSON gains `consult: boolean`.
  - `QuoteSchema`: `lines` optional, `config: ConfigSchema.optional()`, `directions: z.string().trim().max(2000).optional().or(z.literal(''))`, `.refine(d => d.lines || d.config)`.
- Migration SQL (verbatim):
  ```sql
  -- 0009_quote_config.sql — configurator state and consult status (spec 2).
  -- Apply via Supabase Dashboard -> SQL Editor BEFORE deploying.
  alter table public.quotes
    add column if not exists config jsonb,
    add column if not exists directions text check (directions is null or char_length(directions) <= 2000),
    add column if not exists consult_triggers jsonb not null default '[]'::jsonb
      check (jsonb_typeof(consult_triggers) = 'array');
  alter table public.quotes drop constraint if exists quotes_status_check;
  alter table public.quotes add constraint quotes_status_check
    check (status in ('quoted','consult','deposit_invoiced','deposit_paid','balance_invoiced','paid'));
  ```
- API behaviour with `config`: `order = buildOrder(config)` (400 "That configuration is not valid." on throw, or when `validateConfig` returns errors); `quote = order.quote`; row adds `config`, `directions`, `consult_triggers: order.triggers`, `status: order.consult ? 'consult' : 'quoted'`, `needs_conversation: order.consult`. With legacy `lines`: row adds `config: null, directions: null, consult_triggers: []` and no `status` key (DB default). Customer email: after the line summary, a `Your configuration` block = `summarizeConfig(config)` lines, then for consult quotes a `What happens next` paragraph: "We'll review the points below and reply with a firm quote and a payment link:" followed by `- <label>: <detail>` per trigger and the `tbc` rows; no pay URL. Lab email: subject prefix `[consult]` instead of `[quote]` when consult; same configuration and trigger blocks; `Directions:` block. Totals for a qPCR quote: `Total: custom quote after consultation`.

- [ ] **Step 1: Write the failing tests** (copy the `edna()` fixture helper from `tests/unit/order.test.ts`)

```ts
describe('config requests', () => {
  const base = { name: 'Ada', email: 'ada@example.org', audience: 'commercial', source: 'store' };
  it('legacy lines-only bodies still insert a quoted row with empty config fields', async () => {
    const res = await handleQuote(
      makeRequest({ ...base, lines: [{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }] }),
      env,
    );
    expect(res.status).toBe(200);
    expect(insertedRow()).toMatchObject({ config: null, directions: null, consult_triggers: [] });
    expect(insertedRow()).not.toHaveProperty('status');
  });
  it('a payable config inserts status quoted with the config and directions', async () => {
    const res = await handleQuote(
      makeRequest({ ...base, config: edna(), directions: 'Filter on site.' }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, consult: false });
    expect(insertedRow()).toMatchObject({
      status: 'quoted',
      directions: 'Filter on site.',
      total_commercial: 10500,
      config: expect.objectContaining({ service: 'metabarcoding' }),
    });
    expect(customerEmailText()).toContain('Markers: 12S, COI');
  });
  it('a consult config inserts status consult, lists triggers in both emails, and offers no payment', async () => {
    const res = await handleQuote(
      makeRequest({
        ...base,
        config: {
          service: 'targeted-edna',
          species: 'Dreissena',
          measure: 'both',
          assayExists: 'no',
          sampleType: 'water',
        },
      }),
      env,
      undefined,
      { paymentsEnabled: true },
    );
    expect(await res.json()).toMatchObject({ ok: true, consult: true });
    expect(insertedRow()).toMatchObject({
      status: 'consult',
      needs_conversation: true,
      consult_triggers: [expect.objectContaining({ key: 'qpcr' })],
    });
    expect(customerEmailText()).not.toContain('#pay');
    expect(customerEmailText()).toContain('custom quote after consultation');
    expect(emailTextTo(env.CONTACT_TO_EMAIL)).toContain('Dreissena');
    expect(labEmailSubject()).toMatch(/^\[consult\]/);
  });
  it('an invalid config is a 400', async () => {
    const res = await handleQuote(makeRequest({ ...base, config: edna({ markers: [] }) }), env);
    expect(res.status).toBe(400);
  });
  it('a body with neither lines nor config is a 400', async () => {
    expect((await handleQuote(makeRequest(base), env)).status).toBe(400);
  });
});
```

Add a `labEmailSubject()` helper beside `emailTextTo` reading the Resend call's `subject`. For `panelView` and `statusLabel`:

```ts
it('consult quotes have no payment panel and a human label', () => {
  expect(panelView({ ...quoteFixture, status: 'consult' }, [], new Date()).kind).toBe('none');
  expect(statusLabel('consult')).toBe('Consultation requested');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/quote-api.test.ts`
Expected: FAIL (400 on config bodies; missing `consult` in response).

- [ ] **Step 3: Write the migration, extend the types, labels, panel, and the API**

Use `summarizeConfig` for both emails; do not re-implement the summary in the route.

- [ ] **Step 4: Run the unit suite and the type check**

Run: `npm test && npm run check`
Expected: PASS; `astro check` 0 errors (the `QuoteStatus` union change may surface switch statements to update: `panel.ts`, `src/pages/admin/quotes/[number].astro`).

- [ ] **Step 5: Commit**

```bash
git add migrations/0009_quote_config.sql src/lib/payments/types.ts src/lib/payments/labels.ts src/lib/payments/panel.ts src/pages/api/quote.ts tests/unit
git commit -m "feat(api): accept a ProjectConfig, persist it, save consult quotes with status consult"
```

---

### Task 5: Money path — per-line balance, admin inputs, draft-order note

**Files:**

- Modify: `src/lib/payments/terms.ts` (`computeBalance` L111–182: the `quoted` lookup), `src/lib/payments/balance-form.ts` (key regexes), `src/pages/admin/quotes/[number].astro` (table L284–330), `src/lib/payments/pay.ts` (`footer` L145–149, add `customAttributes` via spec), `src/lib/payments/gateway.ts` (`CreateInvoiceSpec` L16–28, `attrs` L203–209), `src/lib/email/quote-payments.ts` (L25–40 actual-lines rendering)
- Test: `tests/unit/quote-payments-email.test.ts` or a new `tests/unit/balance-lines.test.ts`

**Interfaces:**

- `computeBalance(inputs, audience, deposit, quotedLines)` unchanged signature; matches `quoted` by `lineKey(q) === lineKey(l) && q.markers === l.markers` (legacy lines: `kind ?? 'service'`).
- `parseBalanceForm`: keys become `counts[<lineKey>]` and `markers[<lineKey>]` where `lineKey` matches `/^[a-z-]+:[a-z0-9-]{1,64}:(mg|mt)?$/`; each produces `{ serviceSlug, count, markers?, kind, assay? }` (omit `kind` when `'service'` and `assay` when empty, so legacy quotes round-trip unchanged).
- Admin table: one row per stored line, `name={`counts[${lineKey(l)}]`}`; markers input shown when `l.serviceSlug === 'metabarcoding' || l.serviceSlug === 'barcoding'`.
- `CreateInvoiceSpec` gains `attributes?: { key: string; value: string }[]` appended to `attrs`; `pay.ts` passes `[{ key: 'directions', value: (quote.directions ?? '').slice(0, 255) }]` when directions exist, and the footer becomes the existing sentence + `'\n\n' + summarizeConfig(quote.config).join('\n')` when `quote.config` exists.

- [ ] **Step 1: Write the failing tests**

```ts
describe('balance with line kinds', () => {
  const quoted = buildQuote([
    { serviceSlug: 'metagenomics', kind: 'assay', assay: 'mg', count: 4 },
    { serviceSlug: 'barcoding', count: 300 },
  ]).lines;
  const deposit = {
    amountCents: (4 * 2400 + 300 * 12) * 100,
    invoiceLabel: 'order #1',
    paidAt: '2026-10-28T00:00:00Z',
  };
  it('re-scales each line kind at its locked rate and uncaps nothing the quote has', () => {
    const b = computeBalance(
      [
        { serviceSlug: 'metagenomics', kind: 'assay', assay: 'mg', count: 3 },
        { serviceSlug: 'barcoding', count: 250 },
      ],
      'academic',
      deposit,
      quoted,
    );
    expect(b.uncapped).toEqual([]);
    expect(b.lines[0].amountCents).toBe(3 * 2400 * 100);
    expect(b.lines[1].amountCents).toBe((300 * 12 - 50 * 12) * 100); // held at the locked $12
  });
  it('parseBalanceForm reads per-line keys and keeps legacy service lines bare', () => {
    const fd = new URLSearchParams({
      'counts[assay:metagenomics:mg]': '3',
      'counts[service:barcoding:]': '250',
      'markers[service:barcoding:]': '2',
    });
    expect(parseBalanceForm(fd)?.inputs).toEqual([
      { serviceSlug: 'metagenomics', count: 3, kind: 'assay', assay: 'mg' },
      { serviceSlug: 'barcoding', count: 250, markers: 2 },
    ]);
  });
  it('the draft-order footer carries the configuration and directions', () => {
    // via handlePayment with MemoryDb seeded with a quote whose config = edna() and
    // directions = 'Filter on site.', plus a recording gateway, as the existing pay tests do
    expect(recorded.spec.footer).toContain('Markers: 12S, COI');
    expect(recorded.spec.attributes).toEqual([{ key: 'directions', value: 'Filter on site.' }]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/balance-lines.test.ts`
Expected: FAIL (`uncapped` lists `metagenomics`; keys unparsed).

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the unit suite and type check**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments src/pages/admin/quotes src/lib/email/quote-payments.ts tests/unit
git commit -m "feat(payments): per-line balance keys, configuration on the draft order note"
```

---

### Task 6: Quote page and admin show configuration, directions, consult

**Files:**

- Modify: `src/pages/quote/[token].astro` (after the lines table L101–152; the `needs_conversation` notice L155–162), `src/pages/admin/index.astro` (status cell L79–83), `src/pages/admin/quotes/[number].astro` (header area: add configuration + triggers + directions)
- Test: `tests/e2e/quote.spec.ts` (new tests at the end; they create quotes through `/api/quote` with the dev server's env, as the existing hand-off tests do)

**Interfaces:**

- Consumes: `summarizeConfig`, `QuoteRecord.consult_triggers`, `statusLabel`.
- Page behaviour: a `<section data-config-summary>` listing `summarizeConfig(quote.config)` as `<dl>` rows when `config` exists; `<p data-directions>` when `directions`; for `status === 'consult'` a notice `data-consult-notice` with heading "Consultation requested" and the trigger list, and the pay panel absent. `tbc` rows are not stored, so the consult notice lists the triggers (which carry the same information) instead of adding rows to the lines table. Admin list: `statusLabel` already renders "Consultation requested"; add class `bg-[rgba(146,64,14,0.12)]` on that cell when consult. Admin detail: `data-admin-config` block with the same summary, triggers and directions.

- [ ] **Step 1: Write the failing e2e tests**

```ts
test('a consult quote page shows the request, the triggers, the directions, and no pay panel', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/quote', {
    data: {
      name: 'Ada',
      email: 'ada@example.org',
      audience: 'commercial',
      source: 'site',
      directions: 'Filter on site.',
      config: {
        service: 'targeted-edna',
        species: 'Dreissena',
        measure: 'both',
        assayExists: 'no',
        sampleType: 'water',
      },
    },
  });
  const { token } = await res.json();
  await page.goto(`/quote/${token}`);
  await expect(page.locator('[data-consult-notice]')).toContainText('Consultation requested');
  await expect(page.locator('[data-consult-notice]')).toContainText('Dreissena');
  await expect(page.locator('[data-directions]')).toContainText('Filter on site.');
  await expect(page.locator('#pay')).toHaveCount(0);
});
test('a priced config quote page lists the configuration beside the lines', async ({
  page,
  request,
}) => {
  const res = await request.post('/api/quote', {
    data: {
      name: 'Ada',
      email: 'ada@example.org',
      audience: 'commercial',
      source: 'site',
      config: {
        service: 'metabarcoding',
        targets: ['vertebrates'],
        markers: ['12S', 'COI'],
        sampleType: 'water',
        samples: 60,
        kits: false,
      },
    },
  });
  const { token } = await res.json();
  await page.goto(`/quote/${token}`);
  await expect(page.locator('[data-config-summary]')).toContainText('Markers: 12S, COI');
  await expect(page.getByText('$10,500').first()).toBeVisible();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/quote.spec.ts -g "consult quote page|priced config quote page"`
Expected: FAIL (no `[data-consult-notice]`).

- [ ] **Step 3: Implement the three pages**

- [ ] **Step 4: Run the two tests, then `npm run check`**

Expected: PASS, 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/pages/quote/[token].astro src/pages/admin tests/e2e/quote.spec.ts
git commit -m "feat(quote): configuration, directions, and consult state on the quote and admin pages"
```

---

### Task 7: Widget template — service menu, branches, draft quote panel

**Files:**

- Rewrite: `src/widget/template.ts`
- Modify: `src/widget/quote.css` (new `.bk-*` classes for radio cards, fieldsets, errors, status pill, tbc rows, consult panel; keep existing summary/CTA classes)
- Test: `tests/unit/widget-template.test.ts` (rewrite)

**Interfaces:**

- Consumes: Task 1 catalog, Task 3 `Order`, `ConsultTrigger`, `TbcLine`; `Audience`, `Quote` from the engine; `nextTierUpsell`.
- Produces:
  ```ts
  export function renderWidgetHtml(opts: { turnstileSiteKey?: string }): string;
  export function renderQuotePanel(order: Order | null, audience: Audience): string; // '' when null
  export function renderError(field: string, msg: string): string; // the controller writes it into [data-error-for=field]
  export { esc, usd, renderDeadzone, renderUpsell }; // unchanged signatures, now over `order.quote`
  ```
- Markup contract (`data-*` hooks are what the controller and e2e use; ids reuse the mockup's):
  - `<fieldset data-step="service">` with four `<label class="bk-choice">` radios `name="bk-service" value="<slug>" data-service-choice="<slug>"`, none `checked`; each shows title, tagline, `priceLine`.
  - `<fieldset data-step="audience">` radios `data-audience-toggle` (commercial checked) — kept from today.
  - One `<div data-branch="<slug>" hidden>` per service holding that branch's fieldsets. Inputs carry `data-field="<name>"` matching `ProjectConfig` keys: barcoding `handling` (radios), `target` (select), `subs` (checkboxes), `markers` (checkboxes `value=<MarkerId>`), `markerOther`, `sampleType` (select), `sampleOther`, `samples`, `perSampleOn` (checkbox) + `perSample`, `uniqueOn` + `uniqueOrganisms`, `material` (checkboxes), `materialNotes`, `preservativeEdna`, `kits`; metabarcoding `targets` (checkboxes), `subs-<targetId>`, `markers`, `markerOther`, `sampleType`, `sampleOther`, `samples`, `kits`; metagenomics `assays`, `source`, `envNotes`, `count`; targeted-edna `species`, `measure`, `assayExists`, `qSampleType`, `approxSamples`.
  - Each conditional field sits in a wrapper `data-show-when="<field>=<value>"` (e.g. `markerOther=on`, `target=other`, `material-wrap` when `target=vertebrates`); the controller toggles `hidden`. `<p data-error-for="<field>" class="bk-error" hidden>` after each validated field. `<p data-marker-suggest>` under markers.
  - `<fieldset data-step="directions">` with `<textarea data-field="directions" maxlength="2000">` labelled "Specific directions for the lab (optional)".
  - `<section data-quote-panel hidden>` whose inner HTML is `renderQuotePanel`: `data-status-pill` ("Ready for checkout" / "Consultation needed before payment" / "Custom quote after consultation"), `data-line-list` rows (service lines with a `.bk-line-sub` marker note when `markers > 1`; `tbc` rows with `data-tbc` and "To be confirmed"), `data-total`, `data-total-alt`, `data-deadzone-callout`, `data-upsell-callout`, `data-trigger-list` (consult only), then the CTAs: `data-cta-pay` + `data-cta-amount` + `data-pay-disclosure`, `data-cta-invoice` ("Paying by purchase order? Get a Net-30 invoice →"), `data-cta-email`, and `data-cta-consult` ("Request consultation →"); the details form `data-details-form` (name, email, organization, `data-attest-field`, `data-po-field`, honeypot, Turnstile, `data-quote-status`) and the hidden `data-handoff-form` — all as today's markup.
  - The old `note` textarea is removed (directions replaces it; the API's `note` stays unused by the widget).

- [ ] **Step 1: Write the failing tests** (move the `bc()`/`edna()` helpers from `tests/unit/order.test.ts` into `tests/unit/fixtures/configs.ts` and add `qpcr()`; import them in both files)

```ts
describe('renderWidgetHtml (configurator)', () => {
  const html = renderWidgetHtml({ turnstileSiteKey: '1x000' });
  it('renders the four service choices with nothing checked', () => {
    for (const s of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna'])
      expect(html).toContain(`data-service-choice="${s}"`);
    expect(html).not.toMatch(/data-service-choice="[a-z-]+"[^>]*checked/);
    expect(html).toContain('$6–$20 per specimen');
  });
  it('renders one hidden branch per service with the mockup fields', () => {
    for (const s of ['barcoding', 'metabarcoding', 'metagenomics', 'targeted-edna'])
      expect(html).toMatch(new RegExp(`data-branch="${s}"[^>]*hidden`));
    for (const f of [
      'handling',
      'target',
      'markers',
      'sampleType',
      'samples',
      'perSample',
      'uniqueOrganisms',
      'material',
      'preservativeEdna',
      'kits',
      'targets',
      'assays',
      'source',
      'count',
      'species',
      'measure',
      'assayExists',
      'directions',
    ])
      expect(html).toContain(`data-field="${f}"`);
    expect(html).toContain('Swabs (buccal or skin)');
    expect(html).toContain(vertebrateNotice);
  });
  it('keeps the checkout contract hooks and the audience default', () => {
    for (const hook of [
      'data-quote-panel',
      'data-details-form',
      'data-handoff-form',
      'data-attest-field',
      'data-po-field',
      'data-quote-status',
    ])
      expect(html).toContain(hook);
    expect(html).toMatch(/data-audience-toggle="commercial"[^>]*checked/);
    expect(html).toContain('data-sitekey="1x000"');
  });
});
describe('renderQuotePanel', () => {
  it('payable order: status pill, lines, total, pay CTA with amount, no consult CTA', () => {
    const p = renderQuotePanel(buildOrder(edna()), 'commercial');
    expect(p).toContain('Ready for checkout');
    expect(p).toContain('$10,500');
    expect(p).toContain('data-cta-pay');
    expect(p).not.toContain('data-cta-consult');
  });
  it('consult order: pill, trigger list, tbc rows, consult CTA, no pay/invoice CTAs', () => {
    const p = renderQuotePanel(buildOrder(bc({ perSample: undefined, kits: true })), 'academic');
    expect(p).toContain('Consultation needed before payment');
    expect(p).toContain('data-trigger-list');
    expect(p).toContain('To be confirmed');
    expect(p).toContain('data-cta-consult');
    expect(p).not.toContain('data-cta-pay');
    expect(p).not.toContain('data-cta-invoice');
  });
  it('qPCR order: custom-quote pill and no total line', () => {
    const p = renderQuotePanel(buildOrder(qpcr()), 'commercial');
    expect(p).toContain('Custom quote after consultation');
    expect(p).not.toContain('data-total"');
  });
  it('marker surcharge shows as a sub-line, not a separate line', () => {
    const p = renderQuotePanel(buildOrder(edna()), 'commercial');
    expect(p.match(/class="bk-line"/g)).toHaveLength(1);
    expect(p).toContain('2 markers');
  });
});
```

Keep the existing `renderDeadzone`/`renderUpsell` tests, passing `order.quote`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/widget-template.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rewrite `template.ts`; extend `quote.css`**

Copy for legends, hints, placeholders and error messages comes from the mockup. Style tokens: ink `#0b1a1f`-style values copied from `src/styles/tokens.css` as `var(--color-x, #hex)`.

- [ ] **Step 4: Run the unit suite; build the bundle**

Run: `npm test && npm run widget:build`
Expected: PASS; `public/widget/quote.js` builds with no warnings about unresolved imports.

- [ ] **Step 5: Commit**

```bash
git add src/widget/template.ts src/widget/quote.css tests/unit/widget-template.test.ts
git commit -m "feat(widget): configurator template — service menu, per-service branches, draft quote panel"
```

---

### Task 8: Widget controller — state, validation, live quote, consult and checkout

**Files:**

- Rewrite: `src/widget/quote-widget.ts`
- Modify: `src/widget/state.ts` (`configSignature`), `src/widget/entry.ts` (read `?service` / `data-service`), `src/pages/quote/index.astro` (lede copy), `package.json` + `src/data/version.ts` → `1.3.0`
- Test: `tests/unit/widget-state.test.ts`, `tests/e2e/quote.spec.ts` (rewrite), `tests/e2e/widget.spec.ts` (update selectors)

**Interfaces:**

- `configSignature(config: ProjectConfig | null): string` (JSON of the config with keys sorted; `''` for null).
- `WidgetOptions` gains `service?: ServiceSlug`; `entry.ts` autoMount passes `el.dataset.service ?? new URLSearchParams(location.search).get('service')` when it is one of the four slugs, else undefined.
- Controller behaviour:
  - `readConfig(): ProjectConfig | null` builds the config from the chosen service's branch (`null` with no service). Count fields clamp on `change` as today. Checkbox groups read `value`s. `perSample` only when `perSampleOn` is checked; `uniqueOrganisms` only when `uniqueOn`; `material`/`materialNotes` only when target is vertebrates.
  - On any input: toggle `data-show-when` wrappers, apply `suggestedMarkers` until the customer edits markers (then show the "differs from suggestion" note), `render()`.
  - `render()`: `config = readConfig()`; if null hide the panel and every branch; else show the branch, `errors = validateConfig(config)`; write errors into `data-error-for` (hide empty); the panel renders only when `errors` is empty; otherwise the panel stays hidden and a `data-form-status` line says "Finish the highlighted fields to see your quote." When valid, `order = buildOrder(config)`, `panel.innerHTML = renderQuotePanel(order, audience)`, wire CTA listeners on the fresh panel, invalidate the hand-off when `configSignature(config)` changed.
  - CTAs: pay/invoice/email open the details form with `intent` as today; `data-cta-consult` opens it with `intent = 'consult'` (no attestation, no PO).
  - Submit: payload `{ name, email, organization, directions: config.directions, website, 'cf-turnstile-response', source, config, audience, attest }` (no `lines`). On success: status line as today; if `intent === 'pay' | 'invoice'` and `body.paymentsEnabled && !body.consult && isQuoteToken(body.token) && signature unchanged` → hand-off submit as today; `intent === 'consult'` → status "Consultation requested — we'll reply with a firm quote. Your reference is <number>." GA events unchanged (`quote_created` value = `order.quote.total[audience]`).
  - `destroy()` unchanged contract.

- [ ] **Step 1: Write the failing unit test for the signature**

```ts
it('configSignature is stable across key order and empty for no config', () => {
  expect(
    configSignature({ service: 'metagenomics', assays: ['mg'], source: 'specimens', count: 2 }),
  ).toBe(
    configSignature({
      count: 2,
      source: 'specimens',
      assays: ['mg'],
      service: 'metagenomics',
    } as any),
  );
  expect(configSignature(null)).toBe('');
});
```

- [ ] **Step 2: Rewrite `tests/e2e/quote.spec.ts`**

Replace the 25 tests with these (keep the helpers for intercepting `/api/quote` and `gtag`):

```ts
test('nothing is selected on load: menu only, no branch, no quote panel');
test('?service=metagenomics pre-selects that service and shows its branch');
test('?service=nonsense renders the menu with nothing selected'); // Review Focus 5
test('picking barcoding reveals handling, target, markers, sample type, samples, selection');
test('vertebrates reveals the material fieldset and the no-harm notice');
test('eDNA: 60 water samples, vertebrates → 12S suggested; adding COI prices $10,500 commercial');
test('switching the rate switches the headline total');
test('a dead-zone eDNA count shows the headroom callout');
test('ticking kits turns the panel into consult with a "Sampling kits (60)" trigger');
test('ticking "Other" marker then unticking it leaves no trigger and restores the pay CTA'); // Review Focus 4
test('metagenomics: MG+MT on 2 specimens = $14,400; environmental source adds a consult trigger');
test(
  'qPCR shows the custom intake and "Custom quote after consultation" with only the consult CTA',
);
test('a missing required field hides the panel and shows the inline error');
test('the academic attestation appears only for the academic rate on pay/invoice');
test('the PO field appears only on the invoice path');
test('paying chains the quote post (with config, no lines) into the pay endpoint');
test('the email-me path creates a quote and does NOT hand off');
test('the consult path posts the config and shows the reference without a hand-off');
test('changing the configuration while the request is in flight does not chain a stale hand-off');
test('keyboard-only: tab through the eDNA path to the pay CTA');
test('phone width: no horizontal scroll with the barcoding branch open');
test('quote_widget_engaged, quote_created, begin_checkout fire as before');
test('an unknown quote token returns 404');
```

Each test asserts through the `data-*` hooks from Task 7; e.g. the eDNA happy path:

```ts
await page.goto('/quote');
await page.locator('[data-service-choice="metabarcoding"]').check();
await page
  .locator('[data-branch="metabarcoding"] [data-field="targets"][value="vertebrates"]')
  .check();
await expect(
  page.locator('[data-branch="metabarcoding"] [data-field="markers"][value="12S"]'),
).toBeChecked();
await page.locator('[data-branch="metabarcoding"] [data-field="markers"][value="COI"]').check();
await page.locator('[data-branch="metabarcoding"] [data-field="sampleType"]').selectOption('water');
await page.locator('[data-branch="metabarcoding"] [data-field="samples"]').fill('60');
await expect(page.locator('[data-total]')).toHaveText('$10,500');
await expect(page.locator('[data-status-pill]')).toHaveText('Ready for checkout');
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run tests/unit/widget-state.test.ts && npx playwright test tests/e2e/quote.spec.ts`
Expected: FAIL.

- [ ] **Step 4: Rewrite the controller, update `state.ts`, `entry.ts`, versions, the `/quote` lede ("Pick a service, answer a few questions, and see your price. Nothing to submit until you're ready.")**

- [ ] **Step 5: Run everything**

Run: `npm test && npm run widget:build && npm run check && npx playwright test tests/e2e/quote.spec.ts tests/e2e/widget.spec.ts`
Expected: PASS. (Dev server must be running: `npm run dev` in the background; if Vite's SSR cache is stale, `rm -rf node_modules/.vite` and restart.)

- [ ] **Step 6: Commit**

```bash
git add src/widget src/pages/quote/index.astro src/data/version.ts package.json tests
git commit -m "feat(widget): configurator controller — live validation, consult path, checkout hand-off; widget 1.3.0"
```

---

### Task 9: Site links and copy point at the configurator and the store Order page

**Files:**

- Modify: `src/pages/pricing.astro` (`storeUrl` map L25–26 → `https://store.biokea.ai/pages/order?service=<slug>`; "Configure and pay online" links unchanged in label), `src/pages/services.astro` (`Configure →` links L171 → `/quote?service=<slug>`), `src/components/sections/ServicesStrip.astro` (card links for the three priced services → `/quote?service=<slug>`), `public/llms.txt` L17 and `src/pages/llms-full.txt.ts` (add "or on the store at https://store.biokea.ai/pages/order")
- Test: `tests/e2e/pricing.spec.ts` (L59–62, L76–79, L164–166), `tests/e2e/services.spec.ts` (L53–56, L63), `tests/e2e/home.spec.ts` (strip links), `tests/e2e/payments.spec.ts` L48 test, `tests/e2e/llms-txt.spec.ts`

- [ ] **Step 1: Update the assertions to the new hrefs** (e.g. `'https://store.biokea.ai/pages/order?service=barcoding'`, `'/quote?service=metabarcoding'`)

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/pricing.spec.ts tests/e2e/services.spec.ts tests/e2e/home.spec.ts tests/e2e/payments.spec.ts tests/e2e/llms-txt.spec.ts`
Expected: FAIL on the changed hrefs only.

- [ ] **Step 3: Change the links and copy**

- [ ] **Step 4: Run the same e2e files**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages src/components public/llms.txt tests/e2e
git commit -m "feat(site): route configure links to /quote?service= and the store Order page"
```

---

### Task 10: Store theme — Order page, product entry points, menu, hero; repo copies

**Files:**

- Create: `docs/shopify/theme/templates/page.order.json`, `docs/shopify/theme/templates/product.quote.json`, `docs/shopify/theme/blocks/_header-logo.liquid`, `docs/shopify/theme/sections/header-group.json` (the last two copied from the scratch theme as pushed on 2026-10-28), `docs/shopify/theme/README.md` (pull → copy → check → push procedure, verbatim commands)
- Modify: `docs/shopify/STORE-SETUP.md` §7–8 (Order page, product template now a button, menu item, hero CTA; link to the README), delete `docs/shopify/product-quote-section.liquid` (superseded)

**Interfaces:**

- `page.order.json`: a `main-page` section whose blocks are the title text block and a `custom-liquid` block (type `custom-liquid` as in `product.quote.json` L15–21) with:
  ```liquid
  <link rel="stylesheet" href="https://biokea.ai/widget/quote.css?v=1.3.0">
  <div id="quote-widget" data-source="store"></div>
  <script src="https://biokea.ai/widget/quote.js?v=1.3.0" defer></script>
  ```
  (no `crossorigin`; the widget reads `?service=` itself.)
- `product.quote.json`: replace block `custom_liquid_CGdHbB`'s liquid with the product description plus a button:
  ```liquid
  {%- assign svc = 'barcoding' -%}
  {%- if product.handle == 'edna-metabarcoding' -%}{%- assign svc = 'metabarcoding' -%}{%- endif -%}
  <div class="rte">{{ product.description }}</div>
  <a class="button" href="/pages/order?service={{ svc }}">Configure this service →</a>
  ```
- Admin resources (not theme files): page "Order" (handle `order`, template suffix `order`), main menu item "Order" → `/pages/order` first, home hero `button_H9gpTf` in `templates/index.json` → label "Configure a sequencing order", link `/pages/order` (this one _is_ a theme file; include `templates/index.json`'s block edit in the push only after pulling the live copy fresh).

- [ ] **Step 1: Pull the live theme fresh into the scratchpad and copy our four owned files + `templates/index.json` into place; make the edits above**

Run: `shopify theme pull --store a9zmvz-xs.myshopify.com --live --path <scratch>/horizon-theme`

- [ ] **Step 2: Theme check**

Run: `shopify theme check --path <scratch>/horizon-theme --fail-level error`
Expected: exit 0 (pre-existing warnings in `sections/header.liquid` and `snippets/divider.liquid` only).

- [ ] **Step 3: Create the Order page** through the Shopify connector (`pageCreate` with `templateSuffix: "order"`) or, if the connector is not signed in, give Sean the admin-UI steps and wait.

- [ ] **Step 4: Confirm with Sean, then push**

Run: `shopify theme push --store a9zmvz-xs.myshopify.com --live --allow-live --path <scratch>/horizon-theme --only templates/page.order.json --only templates/product.quote.json --only templates/index.json`

- [ ] **Step 5: Menu item** via the connector (`menuUpdate` on the main menu) or admin UI (Online Store → Navigation → Main menu).

- [ ] **Step 6: Verify live**

```bash
curl -sL https://store.biokea.ai/pages/order | tr '\n' ' ' | grep -o 'widget/quote.js?v=1.3.0'
curl -sL https://store.biokea.ai/products/specimen-barcoding | tr '\n' ' ' | grep -o 'href="/pages/order?service=barcoding"'
curl -sL https://store.biokea.ai/ | tr '\n' ' ' | grep -o 'href="/pages/order"' | head -2
```

Expected: each grep prints its match.

- [ ] **Step 7: Commit the repo copies and docs**

```bash
git add docs/shopify
git commit -m "docs(shopify): theme files we own (Order page, product entry points, header), push procedure"
```

---

### Task 11: Rollout and verification

- [ ] **Step 1: Full local gate**

Run: `npm test && npm run check && npm run lint && npx playwright test`
Expected: all PASS.

- [ ] **Step 2: Sean applies `migrations/0009_quote_config.sql` in Supabase** (blocking; the API inserts `config`, `directions`, `consult_triggers` and `status='consult'`).

Then run the constraint check from the migration header and expect one check listing `'consult'`:

```sql
select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.quotes'::regclass and contype='c';
```

- [ ] **Step 3: Store Order page rollout BEFORE the site deploy.** Follow `docs/shopify/theme/ORDER-PAGE-ROLLOUT.md` sections 1–4 (page, product descriptions, theme push, menu). The Worker serves `/widget/*` regardless of `?v=`, so a theme pushed before the site deploy works at once (it loads the current widget until the deploy swaps in 1.3.0); a site deploy before the Order page exists leaves the pricing page's "Configure and pay online" links pointing at a live 404.

- [ ] **Step 4: Merge to `main`, push over HTTPS, watch CI**

```bash
git checkout main && git merge --no-ff <branch>
git -c credential.helper='!gh auth git-credential' push https://github.com/BioKEA/website-biokea.git main
gh run watch
```

- [ ] **Step 5: Verify live site and store end to end**

```bash
curl -s https://biokea.ai/widget/quote.js?v=1.3.0 | grep -c 'data-service-choice'
curl -sL https://biokea.ai/quote | grep -o 'quote.js?v=1.3.0'
```

Then run section 5 of `ORDER-PAGE-ROLLOUT.md`. In a browser: `/quote?service=metagenomics` pre-selects; a qPCR submission lands in `/admin` as "Consultation requested" and both emails arrive. On the store Order page: eDNA 60 samples → "Pay $10,500 and start" → Shopify checkout opens with the configuration in the order note. Record the result in `docs/shopify/PAY-IN-FULL-VERIFICATION.md`.
