# Golden Sample Hunt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Code-with-Claude-2026 promo at `/golden-sample-26`, plus a Mission nav restructure with a new "Game-based Storytelling" page (`/mission/games`) that frames the six existing projects as games and provides placeholder slots for lightweight in-game interactions Sean will author later.

**Architecture:** Three pages (one new public landing, one new editorial page, one rename-only) + one nav-component edit + one new placeholder component + one new color token. Hybrid visual treatment: `/golden-sample-26` uses a full-bleed navy/gold "promo zone" above the fold and the standard editorial palette below; everything else stays in the existing cream/ink/teal system. Submissions go to a Google Form (URL provided by Sean at build time); no server-side endpoint.

**Tech Stack:** Astro 6 + Tailwind v4 + `@astrojs/cloudflare`. Tokens in `src/styles/tokens.css` via `@theme`. Playwright e2e tests in `tests/e2e/`. JSON-LD via `@/lib/json-ld`. Prerendered `llms-full.txt.ts` corpus.

**Spec:** `docs/superpowers/specs/2026-05-01-golden-sample-hunt-design.md`

---

## File map

**Created:**

- `public/assets/images/golden-sample-card.png` — moved from `tmp/`
- `src/components/ui/GamePlaceholder.astro` — locked-card placeholder slot
- `src/pages/mission/games.astro` — `/mission/games` (Game-based Storytelling)
- `src/pages/golden-sample-26.astro` — `/golden-sample-26` (hunt landing + rules + form)
- `tests/e2e/mission-games.spec.ts`
- `tests/e2e/golden-sample-26.spec.ts`

**Modified:**

- `src/styles/tokens.css` — add `--color-gold`
- `src/components/layout/Nav.astro` — Mission becomes dropdown, add Golden Sample standalone
- `src/pages/llms-full.txt.ts` — append a Golden Sample Hunt section
- `tests/e2e/nav.spec.ts` — update existing assertions, add new
- `tests/e2e/mission.spec.ts` — leave content tests; update only the Mission nav assertion that breaks

**Untouched:** `src/pages/mission.astro` (content unchanged; still resolves to `/mission`).

---

## Task 1: Move card asset, add gold token

**Files:**

- Create: `public/assets/images/golden-sample-card.png`
- Modify: `src/styles/tokens.css`

- [ ] **Step 1.1: Move card asset**

```bash
mv tmp/golden-sample-card.png public/assets/images/golden-sample-card.png
```

- [ ] **Step 1.2: Verify the file landed**

Run: `ls -la public/assets/images/golden-sample-card.png`
Expected: file present, ~3.5 MB.

- [ ] **Step 1.3: Add gold token to tokens.css**

Edit `src/styles/tokens.css`. After the `--color-ochre: #92400e;` line, add:

```css
/* Promo — Golden Sample Hunt only (May–Jun 2026) */
--color-gold: #d4a437;
--color-gold-soft: #f5d27a;
```

- [ ] **Step 1.4: Sanity check — dev server still compiles**

Dev server should already be running on 4321 (background task `bntnz1xzs`). If not, start `npm run dev`.

Run: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/`
Expected: `200`.

- [ ] **Step 1.5: Commit**

```bash
git add public/assets/images/golden-sample-card.png src/styles/tokens.css
git commit -m "feat(promo): move Golden Sample card asset + add gold color token"
```

---

## Task 2: GamePlaceholder component

A reusable slot rendered on each game tile. Default state shows "card hidden here / lightweight game coming soon"; if a slot is provided, the slot content replaces the locked-state UI.

**Files:**

- Create: `src/components/ui/GamePlaceholder.astro`

- [ ] **Step 2.1: Write the component**

Create `src/components/ui/GamePlaceholder.astro`:

```astro
---
// src/components/ui/GamePlaceholder.astro
// A placeholder slot for the lightweight Golden Sample Hunt game on a
// project tile. Default state: shows a locked "card hidden here" UI.
// When a slot is provided, the slot replaces the default UI — Sean can
// drop in a real interaction per project without changing this file.

interface Props {
  gameId: string;
  class?: string;
}
const { gameId, class: klass = '' } = Astro.props;
const hasSlot = Astro.slots.has('default');
---

<div
  data-game-id={gameId}
  class:list={[
    'rounded-md border border-dashed text-sm',
    hasSlot ? 'border-transparent p-0' : 'border-slate-900/20 bg-slate-50/60 p-4',
    klass,
  ]}
>
  {
    hasSlot ? (
      <slot />
    ) : (
      <div class="flex items-center gap-3 text-slate-600">
        <span aria-hidden="true" class="text-base">
          🔒
        </span>
        <div>
          <p class="font-mono-label text-[var(--color-ochre)]">Golden Sample Card · hidden here</p>
          <p class="mt-1 text-xs text-slate-500">Lightweight game coming soon.</p>
        </div>
      </div>
    )
  }
</div>
```

- [ ] **Step 2.2: Commit**

```bash
git add src/components/ui/GamePlaceholder.astro
git commit -m "feat(ui): add GamePlaceholder component for hunt slots"
```

---

## Task 3: `/mission/games` — Game-based Storytelling page

**Files:**

- Create: `src/pages/mission/games.astro`
- Create: `tests/e2e/mission-games.spec.ts`

- [ ] **Step 3.1: Write the failing Playwright test**

Create `tests/e2e/mission-games.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('mission/games renders headline, lede, and 6 game tiles', async ({ page }) => {
  await page.goto('/mission/games');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biology, played.');
  // Six game tiles, one per project in src/data/projects.ts
  await expect(page.getByText('Intertidal Biodiversity DNA Barcode Library')).toBeVisible();
  await expect(page.getByText('California Insect Barcoding Initiative')).toBeVisible();
  await expect(page.getByText('DaKineDiving', { exact: false })).toBeVisible();
  await expect(page.getByText('Bay estuary metabarcoding baseline')).toBeVisible();
  await expect(page.getByText('Long-read microbial genome resource')).toBeVisible();
  await expect(page.getByText('Colloquip', { exact: false })).toBeVisible();
});

test('mission/games shows a GamePlaceholder slot per tile', async ({ page }) => {
  await page.goto('/mission/games');
  // Six placeholder slots, one per project
  const slots = page.locator('[data-game-id]');
  await expect(slots).toHaveCount(6);
});

test('mission/games footer CTA links to /golden-sample-26', async ({ page }) => {
  await page.goto('/mission/games');
  const cta = page.getByRole('link', { name: /Six cards are hidden/i });
  await expect(cta).toHaveAttribute('href', '/golden-sample-26');
});
```

- [ ] **Step 3.2: Run test, confirm it fails**

Run: `npx playwright test tests/e2e/mission-games.spec.ts`
Expected: all 3 tests FAIL (route 404).

- [ ] **Step 3.3: Create the page**

Create `src/pages/mission/games.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import GamePlaceholder from '@/components/ui/GamePlaceholder.astro';
import { projects } from '@/data/projects';

// First-draft taglines per project. Sean to redline.
const tagline: Record<string, string> = {
  'california-intertidal-gap-analysis': "Find what hasn't been found yet.",
  'california-insect-barcoding': 'A million tiny names, mapped.',
  dakinediving: 'Read the ocean before you dive.',
  'bay-estuary-metabarcoding-baseline': 'Listen to a watershed in molecules.',
  'long-read-microbial-resource': 'The genomes nobody else will sequence.',
  colloquip: 'Watch six scientists argue. Pick a side.',
};

const statusLabel: Record<string, string> = {
  live: 'Live',
  'revealing-soon': 'Revealing soon',
  'coming-soon': 'Coming soon',
};
---

<BaseLayout
  title="Game-based Storytelling — BioKEA"
  description="Six BioKEA projects, framed as games. Biology you can play with — and a hunt that pays out real sequencing of your backyard soil."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-10">
    <Eyebrow>STORYTELLING</Eyebrow>
    <h1
      class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[24ch]"
    >
      Biology, played.
    </h1>
    <div class="mt-6 max-w-[62ch] text-slate-600 leading-relaxed space-y-4">
      <p>
        Modern biology's bottleneck is not instruments — it is storytelling. The data exists; the
        layer that turns it into something a person can <em>encounter</em> is what's missing.
      </p>
      <p>
        BioKEA hides its science inside games. Each of the six projects below is also a play
        surface. Inside one of them, a Golden Sample Card is hidden. Find all six and you can win
        real sequencing of your own backyard soil.
      </p>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-8">
    <Eyebrow>THE SIX GAMES</Eyebrow>
    <ul class="mt-6 grid md:grid-cols-2 gap-6">
      {
        projects.map((p) => (
          <li class="border border-slate-900/10 rounded-md overflow-hidden bg-[var(--color-cream-warm)]">
            {p.hero && (
              <img
                src={p.hero}
                alt={p.heroAlt ?? ''}
                width={p.heroWidth ?? 1200}
                height={p.heroHeight ?? 675}
                class="w-full aspect-[16/9] object-cover"
                loading="lazy"
              />
            )}
            <div class="p-5">
              <p class="font-mono-label text-[var(--color-teal)]">
                {statusLabel[p.status] ?? p.status}
              </p>
              <h2 class="mt-2 text-xl font-semibold text-[var(--color-ink)]">{p.title}</h2>
              <p class="mt-1 italic text-slate-600">{tagline[p.slug]}</p>
              <p class="mt-3 text-sm text-slate-600 leading-relaxed">{p.summary}</p>
              <div class="mt-4">
                <GamePlaceholder gameId={p.slug} />
              </div>
              {p.link && (
                <a
                  href={p.link}
                  class="mt-4 inline-block text-sm font-medium underline decoration-slate-400 hover:text-[var(--color-teal)]"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Play / explore →
                </a>
              )}
            </div>
          </li>
        ))
      }
    </ul>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <a
      href="/golden-sample-26"
      class="inline-flex items-center gap-2 font-mono-label text-[var(--color-ochre)] hover:text-[var(--color-teal)]"
    >
      Six cards are hidden. Find them all. →
    </a>
  </section>
</BaseLayout>
```

- [ ] **Step 3.4: Run test, confirm it passes**

Run: `npx playwright test tests/e2e/mission-games.spec.ts`
Expected: all 3 tests PASS.

- [ ] **Step 3.5: Commit**

```bash
git add src/pages/mission/games.astro tests/e2e/mission-games.spec.ts
git commit -m "feat(mission): add Game-based Storytelling page with 6 game tiles"
```

---

## Task 4: `/golden-sample-26` — promo landing + rules + form

**Files:**

- Create: `src/pages/golden-sample-26.astro`
- Create: `tests/e2e/golden-sample-26.spec.ts`

The Google Form URL is unknown at plan time. Ship with `GOOGLE_FORM_URL` constant set to a clearly-marked TODO placeholder and a visible note. Sean swaps the constant when he provisions the form. Tests assert the form _anchor_ exists (and has the placeholder ID), not the iframe URL.

- [ ] **Step 4.1: Write the failing Playwright test**

Create `tests/e2e/golden-sample-26.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('golden-sample-26 promo hero renders headline, sub, and card image', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.getByText('ONE LAST THING · A HUNT')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'There is a hidden world all around you.',
  );
  await expect(page.getByText('Even under your feet.')).toBeVisible();
  await expect(page.getByAltText(/Golden Sample Card/i)).toBeVisible();
});

test('golden-sample-26 lists 5 how-it-works steps', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.getByText('HOW IT WORKS')).toBeVisible();
  for (const step of ['Find', 'Clue', 'Solve', 'Submit', 'Win']) {
    await expect(page.getByRole('heading', { name: step, exact: true })).toBeVisible();
  }
});

test('golden-sample-26 lists the prize bullets', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.getByText('THE PRIZE')).toBeVisible();
  await expect(page.getByText(/Real molecular sequencing of soil/i)).toBeVisible();
  await expect(page.getByText(/full report/i)).toBeVisible();
  await expect(page.getByText(/raw sequencing data/i)).toBeVisible();
  await expect(page.getByText(/Claude-powered explorer/i)).toBeVisible();
});

test('golden-sample-26 surfaces deadline + US-only + 18+ rules', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.getByText(/June 5, 2026/)).toBeVisible();
  await expect(page.getByText(/US residents only/i)).toBeVisible();
  await expect(page.getByText(/18\+/)).toBeVisible();
});

test('golden-sample-26 has a Submit section anchor and form region', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.locator('#submit')).toBeVisible();
  await expect(page.getByText('SUBMIT YOUR ANSWER')).toBeVisible();
});

test('golden-sample-26 emits Event JSON-LD with launch + deadline dates', async ({ page }) => {
  await page.goto('/golden-sample-26');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  expect(parsed['@type']).toBe('Event');
  expect(parsed.startDate).toBe('2026-05-07');
  expect(parsed.endDate).toBe('2026-06-05');
  expect(parsed.eventStatus).toBe('https://schema.org/EventScheduled');
});

test('golden-sample-26 closes with the tagline', async ({ page }) => {
  await page.goto('/golden-sample-26');
  await expect(page.getByText('Biodiversity can be discovered anywhere.')).toBeVisible();
});
```

- [ ] **Step 4.2: Run test, confirm it fails**

Run: `npx playwright test tests/e2e/golden-sample-26.spec.ts`
Expected: all tests FAIL (route 404).

- [ ] **Step 4.3: Create the page**

Create `src/pages/golden-sample-26.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { projects } from '@/data/projects';
import { stringifyJsonLd } from '@/lib/json-ld';

// Sean swaps this when the Google Form is provisioned.
const GOOGLE_FORM_URL: string | null = null; // TODO: paste embed URL

const launchDate = '2026-05-07';
const deadlineDate = '2026-06-05';

const eventLd = {
  '@context': 'https://schema.org',
  '@type': 'Event',
  name: 'BioKEA Golden Sample Hunt',
  startDate: launchDate,
  endDate: deadlineDate,
  eventStatus: 'https://schema.org/EventScheduled',
  eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
  description:
    'A 30-day public scavenger hunt across six BioKEA projects. The first ten correct solvers win real molecular sequencing of their own backyard soil.',
  organizer: { '@id': 'https://biokea.ai/#org' },
  location: {
    '@type': 'VirtualLocation',
    url: 'https://biokea.ai/golden-sample-26',
  },
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
    availability: 'https://schema.org/InStock',
    url: 'https://biokea.ai/golden-sample-26',
  },
};
---

<BaseLayout
  title="The Golden Sample Hunt — BioKEA"
  description="A 30-day public hunt across six BioKEA games. Collect six cards, solve the puzzle, win real sequencing of your own backyard soil. Launches May 7, 2026; deadline June 5, 2026."
  ogImage="/assets/images/golden-sample-card.png"
  preloadImage="/assets/images/golden-sample-card.png"
  preloadImageType="image/png"
>
  <!-- ZONE A — promo hero (full-bleed navy + gold) -->
  <section class="bg-[var(--color-ink)] text-[var(--color-cream)]">
    <div
      class="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-[1.1fr_1fr] gap-10 items-center"
    >
      <div>
        <p
          class="font-mono text-[11px] tracking-[0.2em] uppercase font-semibold text-[var(--color-gold)]"
        >
          ONE LAST THING · A HUNT
        </p>
        <h1
          class="mt-4 text-4xl md:text-5xl lg:text-6xl font-semibold tracking-[-0.025em] leading-[1.05]"
        >
          There is a hidden world<br />all around you.
        </h1>
        <p class="mt-4 italic text-2xl md:text-3xl text-[var(--color-gold)]">
          Even under your feet.
        </p>
        <p class="mt-8 max-w-[52ch] text-slate-300 leading-relaxed">
          Hidden across six BioKEA games are six Golden Sample Cards. Collect the clues. Solve the
          puzzle.
        </p>
        <div class="mt-8 flex flex-wrap gap-3">
          <a
            href="#the-games"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-[var(--color-gold)] text-[var(--color-gold)] hover:bg-[var(--color-gold)] hover:text-[var(--color-ink)] transition"
          >
            See the games ↓
          </a>
          <a
            href="#submit"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-[var(--color-gold)] text-[var(--color-ink)] font-semibold hover:bg-[var(--color-gold-soft)] transition"
          >
            Submit your answer ↓
          </a>
        </div>
      </div>
      <figure class="md:justify-self-end">
        <img
          src="/assets/images/golden-sample-card.png"
          alt="The Golden Sample Card — gold and navy ornamental keepsake card depicting a swirling galaxy of soil, water, and specimen icons."
          width="1200"
          height="720"
          class="w-full max-w-[520px] rounded-md shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        />
      </figure>
    </div>
  </section>

  <!-- ZONE B — editorial mode -->

  <section class="max-w-3xl mx-auto px-6 py-16">
    <Eyebrow>HOW IT WORKS</Eyebrow>
    <ol class="mt-6 space-y-6">
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span class="font-mono text-[var(--color-ochre)] font-semibold">01</span>
        <div>
          <h2 class="text-lg font-semibold text-[var(--color-ink)]">Find</h2>
          <p class="mt-1 text-slate-600 leading-relaxed">
            Six BioKEA games. Six hidden Golden Sample Cards. One per game.
          </p>
        </div>
      </li>
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span class="font-mono text-[var(--color-ochre)] font-semibold">02</span>
        <div>
          <h2 class="text-lg font-semibold text-[var(--color-ink)]">Clue</h2>
          <p class="mt-1 text-slate-600 leading-relaxed">
            Each card carries one fragment of the final answer.
          </p>
        </div>
      </li>
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span class="font-mono text-[var(--color-ochre)] font-semibold">03</span>
        <div>
          <h2 class="text-lg font-semibold text-[var(--color-ink)]">Solve</h2>
          <p class="mt-1 text-slate-600 leading-relaxed">
            Assemble all six fragments into the solution.
          </p>
        </div>
      </li>
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span class="font-mono text-[var(--color-ochre)] font-semibold">04</span>
        <div>
          <h2 class="text-lg font-semibold text-[var(--color-ink)]">Submit</h2>
          <p class="mt-1 text-slate-600 leading-relaxed">
            Send your answer through the form below — your shipping address is required because the
            prize ships to you.
          </p>
        </div>
      </li>
      <li class="grid grid-cols-[40px_1fr] gap-4">
        <span class="font-mono text-[var(--color-ochre)] font-semibold">05</span>
        <div>
          <h2 class="text-lg font-semibold text-[var(--color-ink)]">Win</h2>
          <p class="mt-1 text-slate-600 leading-relaxed">
            The first ten correct submissions get real sequencing of their backyard soil.
          </p>
        </div>
      </li>
    </ol>
  </section>

  <section id="the-games" class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>THE GAMES</Eyebrow>
    <p class="mt-3 max-w-[62ch] text-slate-600 leading-relaxed">
      A card is hidden inside each one. Some games are live now; others reveal during the hunt
      window.
    </p>
    <ul class="mt-6 grid md:grid-cols-3 gap-4">
      {
        projects.map((p) => (
          <li class="border border-slate-900/10 rounded-md p-4 bg-[var(--color-cream-warm)]">
            <p class="font-mono-label text-[var(--color-teal)]">
              {p.status === 'live'
                ? 'Live'
                : p.status === 'revealing-soon'
                  ? 'Revealing soon'
                  : 'Coming soon'}
            </p>
            <h3 class="mt-2 font-semibold text-[var(--color-ink)]">{p.title}</h3>
            <p class="mt-1 text-xs font-mono text-[var(--color-ochre)]">
              🔒 Golden Sample Card · hidden inside
            </p>
            {p.link && (
              <a
                href={p.link}
                target="_blank"
                rel="noopener noreferrer"
                class="mt-3 inline-block text-sm underline decoration-slate-400 hover:text-[var(--color-teal)]"
              >
                Open game →
              </a>
            )}
          </li>
        ))
      }
    </ul>
  </section>

  <section class="max-w-3xl mx-auto px-6 py-12">
    <Eyebrow>THE PRIZE</Eyebrow>
    <p class="mt-3 text-slate-600 leading-relaxed">The first ten correct solvers receive:</p>
    <ul class="mt-4 space-y-2 text-slate-700">
      <li>· Real molecular sequencing of soil sampled from your own backyard.</li>
      <li>· A full report (PDF) of what was found.</li>
      <li>· The raw sequencing data (FASTQ).</li>
      <li>· A Claude-powered explorer for asking your data questions in plain English.</li>
    </ul>
  </section>

  <section class="max-w-3xl mx-auto px-6 py-12">
    <Eyebrow>RULES</Eyebrow>
    <ul class="mt-4 space-y-2 text-sm text-slate-600 leading-relaxed">
      <li>
        · Deadline: <strong>June 5, 2026, 11:59 PM PT</strong>. Hunt opens
        <strong>May 7, 2026</strong>.
      </li>
      <li>· US residents only.</li>
      <li>· Must be 18+ at the time of submission.</li>
      <li>· One submission per email address.</li>
      <li>· Automated or bot submissions will be disqualified.</li>
      <li>
        · Winners are notified by email; allow 4–6 weeks for kit delivery, sample return,
        sequencing, and report.
      </li>
      <li>· Email and address are used only for prize fulfillment.</li>
    </ul>
  </section>

  <section id="submit" class="max-w-3xl mx-auto px-6 py-12">
    <Eyebrow>SUBMIT YOUR ANSWER</Eyebrow>
    {
      GOOGLE_FORM_URL ? (
        <>
          <iframe
            src={GOOGLE_FORM_URL}
            loading="lazy"
            class="mt-6 w-full h-[900px] border border-slate-900/10 rounded-md bg-white"
            title="Golden Sample Hunt — submission form"
          />
          <p class="mt-3 text-xs text-slate-500">
            <a
              href={GOOGLE_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
            >
              Open the form in a new tab →
            </a>
          </p>
        </>
      ) : (
        <p class="mt-6 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-600">
          Submission form is being prepared. Check back here at launch (May 7, 2026).
        </p>
      )
    }
  </section>

  <section class="max-w-3xl mx-auto px-6 py-16 text-center">
    <hr class="border-t border-[var(--color-gold)] w-16 mx-auto" />
    <p class="mt-6 italic text-slate-700 text-lg">Biodiversity can be discovered anywhere.</p>
  </section>

  <script type="application/ld+json" is:inline set:html={stringifyJsonLd(eventLd)} />
</BaseLayout>
```

- [ ] **Step 4.4: Run test, confirm it passes**

Run: `npx playwright test tests/e2e/golden-sample-26.spec.ts`
Expected: all 7 tests PASS.

- [ ] **Step 4.5: Visual smoke test in browser**

Open: `http://localhost:4321/golden-sample-26`
Expected: navy hero with gold accents above the fold, card image right-aligned, editorial sections below. Footer rule + tagline at bottom.

- [ ] **Step 4.6: Commit**

```bash
git add src/pages/golden-sample-26.astro tests/e2e/golden-sample-26.spec.ts
git commit -m "feat(promo): add /golden-sample-26 hunt landing page"
```

---

## Task 5: Nav restructure — Mission dropdown + Golden Sample standalone

**Files:**

- Modify: `src/components/layout/Nav.astro`
- Modify: `tests/e2e/nav.spec.ts`

The current nav has Mission as a standalone link. We're converting it to a dropdown with Overview + Game-based Storytelling, and adding a separate Golden Sample standalone link between Mission and the CTA.

- [ ] **Step 5.1: Update existing failing test in nav.spec.ts**

Edit `tests/e2e/nav.spec.ts`. Replace the first test (`'nav renders logo, dropdown groups, Mission, and Get-in-touch CTA'`) with this updated version, and add three new tests at the end of the file:

```typescript
test('nav renders logo, three dropdown groups, Golden Sample, and Get-in-touch CTA', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toBeVisible();

  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await expect(desktop.getByText('What we do', { exact: true })).toBeVisible();
  await expect(desktop.getByText('Our work', { exact: true })).toBeVisible();
  await expect(desktop.getByText('Mission', { exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Golden Sample', exact: true })).toHaveAttribute(
    'href',
    '/golden-sample-26',
  );
  await expect(desktop.getByRole('link', { name: /Get in touch/ })).toHaveAttribute(
    'href',
    '/contact',
  );
});

test('"Mission" dropdown reveals Overview and Game-based Storytelling', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('Mission', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Overview', exact: true })).toHaveAttribute(
    'href',
    '/mission',
  );
  await expect(
    desktop.getByRole('link', { name: 'Game-based Storytelling', exact: true }),
  ).toHaveAttribute('href', '/mission/games');
});

test('Golden Sample link is between Mission and Get-in-touch in the desktop nav', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  const goldenSample = desktop.getByRole('link', { name: 'Golden Sample', exact: true });
  await expect(goldenSample).toBeVisible();
});

test('mobile menu shows Mission accordion + Golden Sample link', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  await page.getByRole('button', { name: /open menu/i }).click();
  const mobile = page.locator('#mobile-menu');
  await expect(mobile.getByText('Mission', { exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Golden Sample', exact: true })).toHaveAttribute(
    'href',
    '/golden-sample-26',
  );
});
```

Also remove these now-stale assertions from the existing tests in this file:

- In the `'nav renders logo, dropdown groups, Mission, and Get-in-touch CTA'` test (now replaced above) — this whole test was rewritten.
- In the `'mobile nav toggle opens menu with grouped accordion + CTA'` test, the line `await expect(mobile.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();` no longer matches — Mission is now a `<details>` accordion, not a `<a role="link">`. Replace that line with:

```typescript
await expect(mobile.getByText('Mission', { exact: true })).toBeVisible();
```

- [ ] **Step 5.2: Run nav tests, confirm they fail**

Run: `npx playwright test tests/e2e/nav.spec.ts`
Expected: at least the three new Mission/Golden Sample assertions FAIL.

- [ ] **Step 5.3: Update Nav.astro**

Edit `src/components/layout/Nav.astro`. Change the `navGroups` and `standaloneLinks` definitions (lines 18–35) to:

```typescript
const navGroups: NavGroup[] = [
  {
    label: 'What we do',
    items: [
      { href: '/services', label: 'Services' },
      { href: '/lab', label: 'Lab' },
    ],
  },
  {
    label: 'Our work',
    items: [
      { href: '/projects', label: 'Projects' },
      { href: '/press', label: 'Press' },
    ],
  },
  {
    label: 'Mission',
    items: [
      { href: '/mission', label: 'Overview' },
      { href: '/mission/games', label: 'Game-based Storytelling' },
    ],
  },
];

const standaloneLinks: NavLink[] = [{ href: '/golden-sample-26', label: 'Golden Sample' }];

const cta: NavLink = { href: '/contact', label: 'Get in touch' };
```

The desktop and mobile rendering blocks (which iterate over `navGroups` and `standaloneLinks`) need no changes — they pick up the new structure automatically.

- [ ] **Step 5.4: Run nav tests, confirm they pass**

Run: `npx playwright test tests/e2e/nav.spec.ts`
Expected: all nav tests PASS.

- [ ] **Step 5.5: Run mission test to confirm no regressions**

Run: `npx playwright test tests/e2e/mission.spec.ts`
Expected: all mission tests still PASS (page content unchanged).

- [ ] **Step 5.6: Commit**

```bash
git add src/components/layout/Nav.astro tests/e2e/nav.spec.ts
git commit -m "feat(nav): Mission dropdown (Overview + Storytelling) + Golden Sample link"
```

---

## Task 6: SEO — surface the hunt in llms-full.txt

The Event JSON-LD is already on the page (Task 4). Sitemap auto-includes new pages via `@astrojs/sitemap`. The remaining surface is `llms-full.txt`, which is hand-curated.

**Files:**

- Modify: `src/pages/llms-full.txt.ts`

- [ ] **Step 6.1: Inspect current llms-full.txt to understand structure**

Run: `head -200 src/pages/llms-full.txt.ts` and skim. The file builds sections via `render*()` functions and concatenates them in the GET handler at the bottom.

- [ ] **Step 6.2: Add a Golden Sample Hunt section**

In `src/pages/llms-full.txt.ts`, add a new render function near the other `render*` functions:

```typescript
const renderGoldenSampleHunt = () => `## Golden Sample Hunt — Code with Claude · 2026

A 30-day public scavenger hunt. Six BioKEA projects (also known as "games") each hide one Golden Sample Card. Players collect six clue fragments, assemble them into a final answer, and submit through a Google Form. The first ten correct submissions win:

- Real molecular sequencing of soil from the player's own backyard
- A full report (PDF)
- The raw sequencing data (FASTQ)
- A Claude-powered explorer for the data

Hunt window: May 7, 2026 → June 5, 2026 (deadline 11:59 PM PT). US residents only, 18+, one submission per email. Page: ${SITE}/golden-sample-26
`;
```

Then in the GET handler at the bottom of the file (search for `export const GET`), insert `renderGoldenSampleHunt()` into the concatenation order — place it after the projects section and before the partners/team sections, so it reads naturally to an LLM agent.

- [ ] **Step 6.3: Verify llms-full.txt renders the new section**

Run: `curl -s http://localhost:4321/llms-full.txt | grep -i "Golden Sample Hunt"`
Expected: matches the heading line.

Also verify the existing llms-full test still passes:

Run: `npx playwright test tests/e2e/llms-txt.spec.ts`
Expected: PASS.

- [ ] **Step 6.4: Commit**

```bash
git add src/pages/llms-full.txt.ts
git commit -m "feat(seo): surface Golden Sample Hunt in llms-full.txt"
```

---

## Task 7: Verification pass

**Files:** none modified unless a failure surfaces.

- [ ] **Step 7.1: Run typecheck**

Run: `npx astro check`
Expected: 0 errors.

If errors: fix inline, recommit with `fix(types): ...`.

- [ ] **Step 7.2: Run full Playwright suite**

Run: `npx playwright test`
Expected: all green. Mission, nav, mission-games, golden-sample-26, llms-txt, plus all preexisting tests.

- [ ] **Step 7.3: Build the site**

Run: `npm run build`
Expected: build succeeds; `dist/` is populated; no warnings about missing routes.

- [ ] **Step 7.4: Visual walkthrough on dev server**

Open in browser:

- `http://localhost:4321/` — verify nav has the new Mission dropdown + Golden Sample link
- `http://localhost:4321/mission` — verify content unchanged
- `http://localhost:4321/mission/games` — verify six game tiles, taglines, placeholders
- `http://localhost:4321/golden-sample-26` — verify navy hero, gold accents, card image, all sections, closing tagline
- `http://localhost:4321/llms-full.txt` — verify Golden Sample Hunt section appears

- [ ] **Step 7.5: Final commit (only if anything was fixed in 7.1)**

If no fixes were needed, skip this step. Otherwise:

```bash
git add -A
git commit -m "fix: address typecheck/test issues from verification pass"
```

---

## Self-review checklist (run before handoff)

After completing all tasks above, verify against the spec:

- [ ] Spec §4 hunt mechanic — covered in `golden-sample-26.astro` HOW IT WORKS (Task 4.3).
- [ ] Spec §5 eligibility — covered in golden-sample-26 RULES section (Task 4.3).
- [ ] Spec §6 prize — covered in golden-sample-26 THE PRIZE section (Task 4.3).
- [ ] Spec §7.1 Mission Overview rename — covered by Nav.astro change (Task 5.3); page content untouched.
- [ ] Spec §7.2 Game-based Storytelling — covered (Task 3).
- [ ] Spec §7.3 Hybrid C layout — covered (Task 4: navy/gold above fold, editorial below).
- [ ] Spec §8 nav restructure — covered (Task 5).
- [ ] Spec §9 GamePlaceholder pattern — covered (Task 2), wired into mission/games tiles.
- [ ] Spec §10 visual tokens — `--color-gold` + `--color-gold-soft` added (Task 1).
- [ ] Spec §11 Google Form embed — wired with `null` placeholder + visible "coming soon" fallback (Task 4); Sean swaps the constant when form is provisioned.
- [ ] Spec §12 SEO posture — Event JSON-LD on page (Task 4), llms-full.txt entry (Task 6), sitemap auto-includes via existing `@astrojs/sitemap` integration.
- [ ] Spec §13 timeline — May 7 launch / June 5 deadline reflected in JSON-LD startDate/endDate and on-page copy.
- [ ] Spec §14 open items — game taglines drafted in Task 3.3 with comment "Sean to redline"; Google Form URL placeholder explicit; Claude prize artifact described as "a Claude-powered explorer."
- [ ] Spec §15 out of scope — confirmed: no game logic written, no submission backend, no winners page.
