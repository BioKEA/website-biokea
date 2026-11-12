# "What you get back" Sample Report Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new `/sample-report` page with a banner and a two-plate interactive 96-well explorer (AA0022 barcoded, AA0055 high-res awaiting barcodes) that sends visitors to `/quote`.

**Architecture:** A one-off Node export script reads the local drive data, applies the clean-highlights filter (pure, unit-tested functions), and writes one committed JSON file per plate plus resized WebP images under `public/`. An Astro page renders the plate grid server-side from that JSON; a small inline script swaps tabs and the selected-well card, loading each large image only on selection.

**Tech Stack:** Astro v6 on Cloudflare Workers, Tailwind, `sharp` (already in node_modules) for images, Vitest (unit), Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-12-sample-report-page-design.md`

## Global Constraints

- Clean highlights only: no text about contamination, blank-well DNA, swaps, non-target hits (e.g. _Wolbachia_), candidate new species, or second organisms may reach the repo or the page.
- Banner copy, verbatim: eyebrow "WHAT YOU GET BACK · INSECT DNA BARCODING"; headline "Every insect. Photographed. Named."
- Tab labels, verbatim: "Plate AA0022 · photographed + barcoded" and "Plate AA0055 · new high-res microscope".
- Captions, verbatim: AA0022 "95 insects, each photographed in its well and named from its DNA barcode." AA0055 "Our newer microscope photographs each insect at higher magnification before it is picked. This plate is sequencing now; its barcodes will appear here and on calatbi.biokea.ai."
- Stats band, verbatim values: "30+" 96-well plates sequenced; "70" plates picked by BugPicker; "98%" median barcode agreement; "CIB" anchor partner.
- AA0055 card status, verbatim: "HIGH-RES IMAGE · BARCODE IN THE QUEUE"; size line format "7.0 × 5.9 mm as picked" (one decimal, `×`).
- No downloads. Links: primary "Build a quote" → `/quote`; "New datasets on calatbi.biokea.ai" → `https://calatbi.biokea.ai/`.
- No raw run data, read files, or flagged fields in the repo: the committed JSON holds display fields only.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit anything under `.superpowers/`.
- Deploy and push only on Sean's go.

## Review Focus

1. A flagged detail leaking into the committed JSON (e.g. `Wolbachia`, "candidate", "contamin", "swap", the H12 control's termite ID) → Task 1 test asserts the transform drops them; Task 2 test scans the committed JSON files.
2. Phone width (375 px): the 12-column grid must fit without horizontal page scroll → Task 3 e2e at 375 px.
3. First load pulling ~190 large images → Task 3 e2e asserts no `l-*.webp` request before a click.
4. Keyboard users: wells must be buttons reachable by Tab, with an accessible name → Task 3 e2e presses Enter on a well.
5. An AA0055 well with no occupied pick attempt (no size) → Task 1 test: size omitted, not "undefined × undefined".

---

## File Structure

- `scripts/sample-report/transform.mjs`: pure functions (clean filter, common names, sizes). No I/O.
- `scripts/sample-report/export.mjs`: I/O only: reads the drives, calls transform, writes JSON and images.
- `src/data/sample-report/aa0022.json`, `aa0055.json`: committed display data.
- `src/data/sample-report.ts`: types plus the two plates, typed, with tab copy.
- `public/assets/sample-report/<plate>/t-<well>.webp` (thumb) and `l-<well>.webp` (large); `public/assets/sample-report/banner.webp`.
- `src/components/ui/PlateExplorer.astro`: tabs, grid, card, inline script.
- `src/pages/sample-report.astro`: banner, explorer, stats, CTA, JSON-LD.
- Modify: `src/components/layout/Nav.astro`, `src/pages/services.astro`, `src/pages/pricing.astro`, `src/pages/index.astro`, `public/llms.txt`.
- Tests: `tests/unit/sample-report-transform.test.ts`, `tests/unit/sample-report-data.test.ts`, `tests/e2e/sample-report.spec.ts`, plus edits to `tests/e2e/nav.spec.ts`, `services.spec.ts`, `llms-txt.spec.ts`.

---

### Task 1: Clean-highlights transform

**Files:**

- Create: `scripts/sample-report/transform.mjs`
- Test: `tests/unit/sample-report-transform.test.ts`

**Interfaces:**

- Produces:
  - `type DisplayWell = { well: string; status: 'species' | 'genus' | 'order' | 'awaiting'; label: string; name?: string; reads?: number; match?: number; size?: string }`
  - `toBarcodedWell(raw): DisplayWell | null`: `raw` is one row of `aa0022_wells.json` (`well, cat, order_recorded, family, genus, species, reads, gb_pid, …`). Returns `null` for `cat === 'control'`.
  - `latestSizes(lines: object[]): Map<string, string>`: well → size string, from `plate_attempts.jsonl` objects.
  - `toHiresWell(well: string, sizes: Map<string,string>): DisplayWell`
  - `COMMON_NAMES: Record<string, string>` keyed by species.

Rules (from the spec, plus one ruling):

- `species`: `status 'species'`, `label` = `COMMON_NAMES[species] ?? family`, `name` = species, `reads`, `match` = `Number(gb_pid)` rounded to 1 decimal.
- `genus`: `status 'genus'`, `label` = family (fall back to `bold_order`), `name` = `` `${genus} sp.` ``, `reads`; no `match`.
- any other non-control `cat`: `status 'order'`, `label` = `order_recorded || 'Insect'`; no name, reads, or match.
- `COMMON_NAMES` exactly: `Lasioglossum hyalinum` → "A sweat bee"; `Orius tristicolor` → "Minute pirate bug"; `Dicyphus hesperus` → "A predatory plant bug used in biocontrol"; `Liriomyza septentrionalis` → "A leafminer fly"; `Acrodactyla quadrisculpta` → "A wasp that rides on spiders"; `Reticulitermes hesperus` → "Western subterranean termite".
- Sizes (ruling: the log mixes "well QA occupied", "well QA empty", "bottom QA empty", "manual occupied review"; an "empty" attempt has no meaningful size): per well, take the attempt with the latest `logged_at` whose `confirmation` contains `occupied`; format `` `${w.toFixed(1)} × ${h.toFixed(1)} mm as picked` `` from `scan_bbox_width_mm` / `scan_bbox_height_mm`. No such attempt → no entry.
- `toHiresWell`: `status 'awaiting'`, `label` = `` `Specimen ${well}` ``, `size` if present.

- [ ] **Step 1: Write the failing tests**

```ts
import {
  toBarcodedWell,
  latestSizes,
  toHiresWell,
} from '../../scripts/sample-report/transform.mjs';

const row = (o) => ({
  well: 'A1',
  cat: 'species',
  order_recorded: 'Hymenoptera',
  bold_order: 'Hymenoptera',
  family: 'Halictidae',
  genus: 'Lasioglossum',
  species: 'Lasioglossum hyalinum',
  reads: 24965,
  gb_pid: '100.0',
  ...o,
});

test('species well gets common name, latin name, reads and match', () => {
  expect(toBarcodedWell(row({}))).toEqual({
    well: 'A1',
    status: 'species',
    label: 'A sweat bee',
    name: 'Lasioglossum hyalinum',
    reads: 24965,
    match: 100,
  });
});
test('species without a common name falls back to family', () => {
  expect(toBarcodedWell(row({ species: 'Nysius tenellus', family: 'Lygaeidae' })).label).toBe(
    'Lygaeidae',
  );
});
test('genus well shows family and "Genus sp." with no match', () => {
  const w = toBarcodedWell(
    row({ cat: 'genus', species: '', genus: 'Nysius', family: 'Lygaeidae', reads: 100 }),
  );
  expect(w).toEqual({
    well: 'A1',
    status: 'genus',
    label: 'Lygaeidae',
    name: 'Nysius sp.',
    reads: 100,
  });
});
test.each(['cand_hi', 'cand_lo', 'coarse', 'nontarget'])(
  '%s well shows only the recorded order',
  (cat) => {
    const w = toBarcodedWell(
      row({
        cat,
        order_recorded: 'Hemiptera',
        species: 'Wolbachia endosymbiont',
        family: 'Anaplasmataceae',
      }),
    );
    expect(w).toEqual({ well: 'A1', status: 'order', label: 'Hemiptera' });
    expect(JSON.stringify(w)).not.toMatch(/Wolbachia|Anaplasmataceae|candidate/i);
  },
);
test('control well is dropped', () => {
  expect(
    toBarcodedWell(row({ well: 'H12', cat: 'control', species: 'Reticulitermes hesperus' })),
  ).toBeNull();
});
test('sizes use the latest occupied attempt per well', () => {
  const s = latestSizes([
    {
      well: 'C5',
      logged_at: '2026-09-23T10:00:00Z',
      confirmation: 'well QA occupied',
      scan_bbox_width_mm: 1,
      scan_bbox_height_mm: 1,
    },
    {
      well: 'C5',
      logged_at: '2026-09-24T10:00:00Z',
      confirmation: 'well QA occupied',
      scan_bbox_width_mm: 7.04,
      scan_bbox_height_mm: 5.91,
    },
    {
      well: 'C5',
      logged_at: '2026-09-25T10:00:00Z',
      confirmation: 'well QA empty',
      scan_bbox_width_mm: 9,
      scan_bbox_height_mm: 9,
    },
  ]);
  expect(s.get('C5')).toBe('7.0 × 5.9 mm as picked');
});
test('hi-res well with no occupied attempt has no size', () => {
  const w = toHiresWell(
    'D1',
    latestSizes([
      {
        well: 'D1',
        logged_at: 'x',
        confirmation: 'bottom QA empty',
        scan_bbox_width_mm: 2,
        scan_bbox_height_mm: 2,
      },
    ]),
  );
  expect(w).toEqual({ well: 'D1', status: 'awaiting', label: 'Specimen D1' });
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/unit/sample-report-transform.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `scripts/sample-report/transform.mjs`** per the rules above (ESM, JSDoc types for `DisplayWell`).
- [ ] **Step 4: Run to verify pass.** Same command → all PASS.
- [ ] **Step 5: Commit** `feat(sample-report): clean-highlights transform for plate data`.

---

### Task 2: Export script, plate data, and images

**Files:**

- Create: `scripts/sample-report/export.mjs`, `src/data/sample-report.ts`, `src/data/sample-report/aa0022.json`, `src/data/sample-report/aa0055.json`, `public/assets/sample-report/**`
- Test: `tests/unit/sample-report-data.test.ts`
- Modify: `package.json` (add `"sample-report:export": "node scripts/sample-report/export.mjs"`)

**Interfaces:**

- Consumes: Task 1's `toBarcodedWell`, `latestSizes`, `toHiresWell`.
- Produces (`src/data/sample-report.ts`):
  - `export type { DisplayWell }` (same shape as Task 1, as a TS type)
  - `export interface Plate { id: 'aa0022' | 'aa0055'; code: string; tab: string; caption: string; wells: DisplayWell[]; defaultWell: string }`
  - `export const plates: Plate[]`: AA0055 first (it opens first), `defaultWell` `'C5'`; AA0022 `defaultWell` `'H2'`. Tab and caption strings from Global Constraints.
  - Image paths are derived, not stored: `/assets/sample-report/${id}/t-${well}.webp`, `/assets/sample-report/${id}/l-${well}.webp`.
  - `export const bannerImage = '/assets/sample-report/banner.webp'`

Export details:

- Sources (read-only): AA0022 rows `/Volumes/28TB_A/Projects/ONT-Insect-Barcoding/runs/AA0003-AA0024/demo/aa0022_wells.json`; AA0022 photos `/Volumes/28TB_B/BugPicker-Image-Pipeline/Plate_insect_images/P-AA0022/IMG-DNA-AA0022-<well>_well.png`; AA0055 photos `.../P-AA0055/IMG-DNA-AA0055-<well>_hires.png`; sizes `.../P-AA0055/plate_attempts.jsonl`. Exit with a clear error if `/Volumes/28TB_A` or `/Volumes/28TB_B` is not mounted.
- Wells are written in row-major order A1…H12; a well with no source photo is skipped.
- Images with `sharp`: thumbs 160×160 WebP, quality 70, centre crop (AA0022 well photos: centre square crop of the 1920×1080 frame first, since the tube sits centred); large 1000 px wide WebP, quality 80. Banner: AA0055 C5 hi-res at 1600 px wide, quality 80.
- Write JSON with 2-space indent and a trailing newline.

- [ ] **Step 1: Write the failing data test** (`tests/unit/sample-report-data.test.ts`):

```ts
import { plates } from '@/data/sample-report';
import { existsSync, readFileSync, statSync } from 'node:fs';

const byId = (id) => plates.find((p) => p.id === id)!;
test('AA0022 has 95 wells: 37 species, 48 genus, 10 order-only, no H12', () => {
  const w = byId('aa0022').wells;
  expect(w).toHaveLength(95);
  expect(w.filter((x) => x.status === 'species')).toHaveLength(37);
  expect(w.filter((x) => x.status === 'genus')).toHaveLength(48);
  expect(w.filter((x) => x.status === 'order')).toHaveLength(10);
  expect(w.find((x) => x.well === 'H12')).toBeUndefined();
});
test('AA0055 has 95 awaiting wells and opens first on C5', () => {
  expect(plates[0].id).toBe('aa0055');
  expect(byId('aa0055').wells.every((x) => x.status === 'awaiting')).toBe(true);
  expect(byId('aa0055').wells).toHaveLength(95);
  expect(byId('aa0055').defaultWell).toBe('C5');
});
test('committed plate data carries no flagged detail', () => {
  for (const f of ['aa0022', 'aa0055']) {
    const s = readFileSync(`src/data/sample-report/${f}.json`, 'utf8');
    expect(s).not.toMatch(
      /wolbachia|rickettsi|candidate|contamin|swap|second organism|\bcontrol\b|xiphinema|nematode|CIBI\d|DNA-AA/i,
    );
  }
});
test('every well has a thumb and a large image, each under 200 KB', () => {
  for (const p of plates)
    for (const w of p.wells)
      for (const k of ['t', 'l']) {
        const f = `public/assets/sample-report/${p.id}/${k}-${w.well}.webp`;
        expect(existsSync(f), f).toBe(true);
        expect(statSync(f).size).toBeLessThan(200_000);
      }
  expect(existsSync('public/assets/sample-report/banner.webp')).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure.** `npx vitest run tests/unit/sample-report-data.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `export.mjs` and `src/data/sample-report.ts`**, then run `npm run sample-report:export`.
- [ ] **Step 4: Run to verify pass.** Same command → PASS. Check total size: `du -sh public/assets/sample-report` should be under 25 MB; report the figure.
- [ ] **Step 5: Commit** the script, data module, both JSON files, and `public/assets/sample-report/` (`feat(sample-report): export plate data and web images`).

---

### Task 3: The page and the plate explorer

**Files:**

- Create: `src/components/ui/PlateExplorer.astro`, `src/pages/sample-report.astro`
- Test: `tests/e2e/sample-report.spec.ts`

**Interfaces:**

- Consumes: `plates`, `bannerImage`, `DisplayWell` from `@/data/sample-report`.
- Produces: DOM hooks the e2e test uses (keep these exact):
  - tabs: `role="tab"`, names equal to the tab strings; `aria-selected`.
  - each plate grid: `role="tabpanel"`, `data-plate="<id>"`.
  - each well: `<button data-well="<well>" aria-label="Well <well>: <label>">` containing the thumb `<img loading="lazy">`.
  - card: `data-card`, with `data-card-img`, `data-card-status`, `data-card-label`, `data-card-name`, `data-card-meta`.

Behaviour:

- Server-render both grids (8 rows × 12 columns; rows A–H, columns 1–12 headers); wells without data (H12) render as an empty, non-interactive circle. Hidden panel uses `hidden`.
- Ring colour by status (builder picks the exact tokens from the site palette): species, genus, order, awaiting each distinct.
- Card status text: species "NAMED TO SPECIES"; genus "NAMED TO GENUS"; order "ORDER RECORDED AT PICKING"; awaiting "HIGH-RES IMAGE · BARCODE IN THE QUEUE"; shown as "WELL <id> · <status>".
- Card meta: species `"<reads with thousands separators> reads · <match>% match"`; genus `"<reads> reads"`; awaiting the size string; else empty.
- Server-render the card for the first plate's `defaultWell`. The inline script (no framework) sets the card `img.src` to the large image only when a well is selected, so no other `l-*.webp` loads on first paint. Switching tabs selects that plate's `defaultWell`.
- Grid cell size shrinks on small screens so 12 columns + row label fit in 343 px (16 px gutters at 375 px wide).
- Page (`BaseLayout`, title "What you get back", description one sentence in the site voice): banner (`bannerImage`, darkened, verbatim eyebrow and headline, the spec's one-line subhead), explorer, stats band, then the primary "Build a quote" link to `/quote` and the calatbi link. JSON-LD: a `WebPage` node with `about` DefinedTerms "DNA barcoding" and "Insect biodiversity", `isPartOf` `https://biokea.ai/#website` (match how other pages reference the site/org).

- [ ] **Step 1: Write the failing e2e tests** (`tests/e2e/sample-report.spec.ts`):

```ts
test('banner, tabs and CTA render', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.getByText('WHAT YOU GET BACK · INSECT DNA BARCODING')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Every insect. Photographed. Named.',
  );
  await expect(
    page.getByRole('tab', { name: 'Plate AA0055 · new high-res microscope' }),
  ).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('link', { name: /Build a quote/ }).last()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByText('30+')).toBeVisible();
});
test('AA0055 opens on C5 with size and queue status', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.locator('[data-card-status]')).toHaveText(
    'WELL C5 · HIGH-RES IMAGE · BARCODE IN THE QUEUE',
  );
  await expect(page.locator('[data-card-meta]')).toHaveText(/^\d+\.\d × \d+\.\d mm as picked$/);
});
test('switching to AA0022 shows the sweat bee in H2, and clicking a well updates the card', async ({
  page,
}) => {
  await page.goto('/sample-report');
  await page.getByRole('tab', { name: 'Plate AA0022 · photographed + barcoded' }).click();
  await expect(page.locator('[data-card-label]')).toHaveText('A sweat bee');
  await expect(page.locator('[data-card-name]')).toHaveText('Lasioglossum hyalinum');
  await expect(page.locator('[data-card-meta]')).toHaveText('24,965 reads · 100.0% match');
  await page.locator('[data-plate="aa0022"] [data-well="E11"]').click();
  await expect(page.locator('[data-card-label]')).toHaveText('Minute pirate bug');
  await expect(page.locator('[data-card-img]')).toHaveAttribute(
    'src',
    '/assets/sample-report/aa0022/l-E11.webp',
  );
});
test('wells are keyboard-operable', async ({ page }) => {
  await page.goto('/sample-report');
  await page.locator('[data-plate="aa0055"] [data-well="A1"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-card-status]')).toContainText('WELL A1');
});
test('no large well image loads before a click', async ({ page }) => {
  const larges: string[] = [];
  page.on('request', (r) => {
    if (/\/l-[A-H]\d+\.webp$/.test(r.url())) larges.push(r.url());
  });
  await page.goto('/sample-report');
  await page.waitForLoadState('networkidle');
  expect(larges.length).toBeLessThanOrEqual(1); // only the default card image
});
test('fits a 375px phone without horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/sample-report');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
test('page has no flagged wording', async ({ page }) => {
  await page.goto('/sample-report');
  await expect(page.locator('body')).not.toContainText(
    /Wolbachia|candidate new species|contaminat|swap/i,
  );
});
```

- [ ] **Step 2: Run to verify failure.** `npm run build && npx playwright test tests/e2e/sample-report.spec.ts` → FAIL (404).
- [ ] **Step 3: Implement `PlateExplorer.astro` and `sample-report.astro`.**
- [ ] **Step 4: Run to verify pass.** Same command → all PASS. Also `npx tsc --noEmit` clean.
- [ ] **Step 5: Commit** `feat(sample-report): "what you get back" page with plate explorer`.

---

### Task 4: Links, services fix, llms.txt

**Files:**

- Modify: `src/components/layout/Nav.astro` (About group: add `{ href: '/sample-report', label: 'Sample report' }` as the first item; top-level stays Services, Pricing, Lab).
- Modify: `src/pages/services.astro` (a link "See a real plate →" to `/sample-report` in the barcoding service block, beside the existing pricing link; change line 43 "sequencing on the ONT Promethion 2" to "sequencing on the ONT Promethion 2 or Illumina MiSeq i100"). Do not change the 4–8 week turnaround.
- Modify: `src/pages/pricing.astro` (in the barcoding section, one line linking "See what a barcoded plate looks like" to `/sample-report`).
- Modify: `src/pages/index.astro` (one link to `/sample-report` near the services strip or the Evidence section, builder's placement, label "See what you get back →").
- Modify: `public/llms.txt` (under the barcoding bullet, add: "Example results: a real 96-well plate with specimen photos and IDs at https://biokea.ai/sample-report").
- Test: `tests/e2e/nav.spec.ts`, `tests/e2e/services.spec.ts`, `tests/e2e/llms-txt.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// nav.spec.ts
test('About menu links the sample report', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Sample report' }).first()).toHaveAttribute(
    'href',
    '/sample-report',
  );
});
// services.spec.ts
test('services links the sample report and names both sequencers', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: /See a real plate/ })).toHaveAttribute(
    'href',
    '/sample-report',
  );
  await expect(page.getByText(/Promethion 2 or Illumina MiSeq i100/)).toBeVisible();
});
// llms-txt.spec.ts
test('llms.txt points to the sample report', async ({ request }) => {
  const body = await (await request.get('/llms.txt')).text();
  expect(body).toContain('https://biokea.ai/sample-report');
});
```

Also add to `tests/e2e/sample-report.spec.ts`: `/pricing` and `/` each have a link with `href="/sample-report"`.

- [ ] **Step 2: Run to verify failure.** `npm run build && npx playwright test tests/e2e/nav.spec.ts tests/e2e/services.spec.ts tests/e2e/llms-txt.spec.ts tests/e2e/sample-report.spec.ts` → the new tests FAIL.
- [ ] **Step 3: Make the edits above.**
- [ ] **Step 4: Full verification.** `npx vitest run`, `npx tsc --noEmit`, `npm run build`, `npx playwright test` → all green (existing skips unchanged).
- [ ] **Step 5: Commit** `feat(sample-report): link the sample report from nav, services, pricing, home, llms.txt`.

---

### Task 5: Finish

- [ ] Stop and report to Sean, including the open item from the spec (is CIB fine being named with its plates shown?) and the `/services` 4–8 week turnaround flag. Merge, deploy (`npm run build && npx wrangler deploy`) and push only on his go.
