# Golden Sample Sunset + Nav Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retire the Golden Sample 26 hunt (closed 2026-07-07) and restructure the nav so Services, Pricing, and the `/quote` configurator lead.

**Architecture:** References are removed before their targets, so no commit in this branch ever leaves a broken link. Copy first (Task 1), then machinery (Task 2), then legal text, docs, nav, and CTA labels as separately reviewable units.

**Tech Stack:** Astro v6, Tailwind v4, Cloudflare Workers, Playwright (e2e), Vitest (unit).

## Global Constraints

- **Do NOT delete `SUPABASE_SERVICE_ROLE_KEY` or its documentation.** `wrangler.toml` files it under a comment block headed "Golden Sample 26 hunt secrets", but it is now _also_ required by `/api/quote` and `/quote/<token>`, whose `quotes` table is RLS-locked with zero policies. Only `GOLDEN_WORDS` and `GOLDEN_HMAC_SECRET` are being retired. Deleting the service-role key would break the quote feature.
- **`privacy.astro`'s hunt clauses go past-tense, never deleted.** BioKEA still holds the data they disclose — winners' emails and US mailing addresses. A privacy policy that stops disclosing retained data is worse than one describing a finished programme.
- Keep as historical record: `migrations/0004_golden_sample_hunt.sql`, the Supabase hunt tables, `migrations/0002`'s comment referencing `/golden-sample-26`, `HUNT.md`, and the `docs/superpowers/` hunt spec and plan.
- Two quote labels, used consistently: **"Build a quote"** → `/quote` (instant, self-serve) and **"Talk to us"** → `/contact?topic=sequencing` (human conversation).
- No new npm dependencies. Follow existing conventions: `Eyebrow`/`CtaBand`, cream/ink/teal/pink/ochre tokens, Inter + JetBrains Mono.
- Source spec: `docs/superpowers/specs/2026-08-16-hunt-sunset-and-nav-design.md`.

---

### Task 1: Remove hunt promo copy and links from user-facing pages

**Files:**

- Modify: `src/pages/mission/games.astro`
- Modify: `src/pages/mission/games/leaderboard.astro`
- Modify: `src/pages/subscribe.astro`
- Modify: `src/pages/api/subscribe.ts`
- Modify: `src/pages/llms-full.txt.ts`
- Modify: `tests/e2e/mission-games.spec.ts`

**Interfaces:**

- Produces: after this task, nothing on the site links to `/mission/games/golden-sample-26` or calls `/api/golden-sample/leaderboard`. Task 2 deletes those targets and relies on this.

- [ ] **Step 1: Update the failing test**

In `tests/e2e/mission-games.spec.ts`, delete this entire test (lines 24–32):

```ts
test('mission/games hero CTA links to /mission/games/golden-sample-26', async ({ page }) => {
  await page.goto('/mission/games');
  // The hunt CTA is the prominent "Golden Sample Hunt · Six golden samples
  // · 10 prizes" dark-pill button under the intro paragraph. The page
  // was moved from /golden-sample-26 to /mission/games/golden-sample-26
  // to match the convention of the other game-area pages.
  const cta = page.getByRole('link', { name: /Golden Sample Hunt/i }).first();
  await expect(cta).toHaveAttribute('href', '/mission/games/golden-sample-26');
});
```

And append this one:

```ts
test('mission/games no longer promotes the closed hunt', async ({ page }) => {
  await page.goto('/mission/games');
  const body = await page.locator('body').innerText();
  expect(body).not.toContain('Golden Sample Hunt');
  expect(body).not.toContain('GOLDEN SAMPLE HIDDEN');
  await expect(page.getByRole('link', { name: /Golden Sample/i })).toHaveCount(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test mission-games.spec.ts`
Expected: FAIL — the page still renders the hunt CTA button and the "1 GOLDEN SAMPLE HIDDEN IN EACH" badge.

- [ ] **Step 3: Strip the hunt from `/mission/games`**

In `src/pages/mission/games.astro`, replace the second intro paragraph:

```astro
<p>
  BioKEA hides its science inside games. The six below are real, playable, and built around what we
  actually do in the lab. Each one hides a Golden Sample — find all six and you can win real
  sequencing of your own backyard soil.
</p>
```

with:

```astro
<p>
  BioKEA hides its science inside games. The six below are real, playable, and built around what we
  actually do in the lab.
</p>
```

Delete the entire hunt CTA anchor (the `<a href="/mission/games/golden-sample-26" ...>` block containing "Golden Sample Hunt", "Six golden samples · 10 prizes").

Replace the badge row:

```astro
<div class="mt-4 flex gap-3 flex-wrap font-mono text-[11px] tracking-[0.08em] uppercase">
  <span class="text-[var(--color-teal)]">{games.length} PLAYABLE</span>
  <span class="text-slate-400">·</span>
  <span class="text-[var(--color-ochre)]">1 GOLDEN SAMPLE HIDDEN IN EACH</span>
</div>
```

with:

```astro
<div class="mt-6 flex gap-3 flex-wrap font-mono text-[11px] tracking-[0.08em] uppercase">
  <span class="text-[var(--color-teal)]">{games.length} PLAYABLE</span>
</div>
```

Replace the newsletter blurb:

```astro
New games, papers, and the Golden Sample Hunt — straight to your inbox.
```

with:

```astro
New games, papers, and lab milestones — straight to your inbox.
```

- [ ] **Step 4: Remove the leaderboard's hunt tab**

In `src/pages/mission/games/leaderboard.astro`:

- Delete the `<button ... data-tab="hunt" ...>Hunt 🎟</button>` element.
- Delete the entire `<section ... data-panel="hunt">` block (the "Golden Sample Hunt" heading, its description, the `data-hunt-rows` list, and the `data-hunt-meta` paragraph).
- Delete the whole `async function loadHunt() { … }` definition.
- In the tab dispatcher, delete the line `else if (tab === 'hunt') void loadHunt();`.
- Change `const loaded = { today: false, week: false, all: false, hunt: false };` to `const loaded = { today: false, week: false, all: false };`.
- Delete the `} else if (tabName === 'hunt' && !loaded.hunt) { loaded.hunt = true; void loadHunt(); }` branch.
- Change `const validTabs = ['today', 'week', 'all', 'hunt'];` to `const validTabs = ['today', 'week', 'all'];` and update the comment above it, which currently says the hunt page links here with `#hunt`.

- [ ] **Step 5: Remove hunt copy from the subscribe surfaces**

In `src/pages/subscribe.astro`, change the description prop:

```astro
description="Subscribe to occasional updates from BioKEA: new games, papers, and lab milestones."
```

and change the body sentence ending `a paper or dataset goes out, the Golden Sample Hunt opens.` to:

```astro
paper or dataset goes out.
```

In `src/pages/api/subscribe.ts`, in the welcome email's plain-text array delete the line:

```ts
    `  · the Golden Sample Hunt and any future challenges`,
```

and in the HTML body delete:

```html
<li>the Golden Sample Hunt and any future challenges</li>
```

- [ ] **Step 6: Remove the hunt section from `llms-full.txt.ts`**

Delete the entire `## Golden Sample Hunt — Code with Claude · 2026` section — its heading, the descriptive paragraph, the four-item prize list, and the "Hunt window: …" line — leaving `## Projects` followed directly by `## Milestones`.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx playwright test mission-games.spec.ts llms-txt.spec.ts`
Expected: PASS. `llms-txt.spec.ts` asserts on Team/Projects/Milestones sections, none of which this touches.

- [ ] **Step 8: Commit**

```bash
git add src/pages/mission/games.astro src/pages/mission/games/leaderboard.astro \
  src/pages/subscribe.astro src/pages/api/subscribe.ts src/pages/llms-full.txt.ts \
  tests/e2e/mission-games.spec.ts
git commit -m "feat(hunt): remove Golden Sample promo copy and links"
```

---

### Task 2: Delete the hunt machinery

**Files:**

- Delete: `src/pages/mission/games/golden-sample-26.astro`, `src/pages/golden-sample-26.astro`
- Delete: `src/pages/api/golden-sample/` (whole directory, 5 files)
- Delete: `src/lib/golden-sample/` (whole directory, 3 files)
- Delete: `public/golden-sample/overlay.js`
- Delete: `src/components/ui/GamePlaceholder.astro`
- Delete: `tests/e2e/golden-sample-26.spec.ts`
- Modify: `scripts/build-games.mjs`
- Modify: `src/styles/tokens.css`
- Test: `tests/e2e/mission-games.spec.ts`

**Interfaces:**

- Consumes: Task 1 removed every reference to these files.
- Produces: `/mission/games/golden-sample-26`, `/golden-sample-26`, and all `/api/golden-sample/*` routes stop existing.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/mission-games.spec.ts`:

```ts
test('every Golden Sample route is gone', async ({ page }) => {
  for (const path of [
    '/mission/games/golden-sample-26',
    '/golden-sample-26',
    '/api/golden-sample/state',
    '/api/golden-sample/leaderboard',
    '/golden-sample/overlay.js',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should not exist`).toBe(404);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test mission-games.spec.ts -g "every Golden Sample route"`
Expected: FAIL — those routes currently return 200 (or a 308 redirect for `/golden-sample-26`).

- [ ] **Step 3: Delete the files**

```bash
git rm src/pages/mission/games/golden-sample-26.astro
git rm src/pages/golden-sample-26.astro
git rm -r src/pages/api/golden-sample
git rm -r src/lib/golden-sample
git rm public/golden-sample/overlay.js
git rm src/components/ui/GamePlaceholder.astro
git rm tests/e2e/golden-sample-26.spec.ts
```

`GamePlaceholder.astro` is dead code — verify with `grep -rn "GamePlaceholder" src/` before deleting; the only hit should be the file itself.

- [ ] **Step 4: Remove the overlay injection from the games build**

In `scripts/build-games.mjs`, delete the entire `injectGoldenSampleOverlay()` function together with its leading comment block (which begins "Drops the shared Golden Sample reveal overlay into every game"), and delete the line that calls it inside the per-game build loop.

- [ ] **Step 5: Remove the gold tokens**

In `src/styles/tokens.css`, delete these four lines:

```css
/* Promo — Golden Sample Hunt only (May–Jun 2026) */
--color-gold: #d4a437;
--color-gold-soft: #f5d27a;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test mission-games.spec.ts`
Expected: PASS, including the new route-removal test.

Run: `npm run check`
Expected: 0 errors. If `astro check` reports an unresolved import, something still references a deleted module — fix that rather than restoring the file.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(hunt): delete Golden Sample pages, APIs, overlay, and gold tokens"
```

---

### Task 3: Past-tense the privacy policy

**Files:**

- Modify: `src/pages/privacy.astro`
- Test: `tests/e2e/` — new file `tests/e2e/privacy.spec.ts`

**Interfaces:**

- None consumed or produced. Standalone legal-text change.

**Why this is not a deletion:** BioKEA still holds winners' emails and US mailing addresses collected during the hunt. Removing the disclosures while retaining the data would make the policy less accurate, not more.

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/privacy.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('privacy policy still discloses retained hunt data, in past tense', async ({ page }) => {
  await page.goto('/privacy');
  const body = await page.locator('body').innerText();
  // The data is still held, so the disclosure must remain.
  expect(body).toContain('Golden Sample Hunt');
  // But it must not read as an ongoing programme.
  expect(body).not.toContain('the Golden Sample Hunt opens');
  expect(body).toContain('ran from May to July 2026');
});

test('privacy policy no longer links to the deleted hunt page', async ({ page }) => {
  await page.goto('/privacy');
  await expect(page.locator('a[href="/mission/games/golden-sample-26"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test privacy.spec.ts`
Expected: FAIL — the page still links to the deleted hunt page and describes the hunt in the present tense.

- [ ] **Step 3: Rewrite the four hunt clauses**

In `src/pages/privacy.astro`, replace the "What we collect" hunt list item:

```astro
<li>
  <strong
    >Golden Sample Hunt (<a href="/mission/games/golden-sample-26"
      >/mission/games/golden-sample-26</a
    >):</strong
  > if you submit the hunt form, the answers go to a Google Form (Google's terms apply there). If you
  win, we use the email and US mailing address you provide to ship a sequencing kit and return your results.
  We don't use that information for anything else.
</li>
```

with:

```astro
<li>
  <strong>Golden Sample Hunt (closed):</strong> the hunt ran from May to July 2026. Entries went to a
  Google Form (Google's terms applied there). Winners' emails and US mailing addresses were used to ship
  a sequencing kit and return results, and for nothing else. We still hold those records; the hunt is
  no longer running and no new entries are collected.
</li>
```

Replace the "lab updates" bullet:

```astro
<li>
  Sending you the lab updates you opted into. Examples: a new game drops, a paper goes out, the
  Golden Sample Hunt opens. No shared lists, no pixel tracking, no third-party re-targeting.
</li>
```

with:

```astro
<li>
  Sending you the lab updates you opted into. Examples: a new game drops, a paper goes out. No
  shared lists, no pixel tracking, no third-party re-targeting.
</li>
```

Replace the prize-fulfilment bullet:

```astro
<li>Fulfilling Golden Sample Hunt prizes if you win.</li>
```

with:

```astro
<li>Fulfilling Golden Sample Hunt prizes, for the hunt that ran from May to July 2026.</li>
```

Replace the Google Forms processor line:

```astro
<li>
  <strong>Google Forms</strong> — collects Golden Sample Hunt entries (Google's privacy policy applies).
</li>
```

with:

```astro
<li>
  <strong>Google Forms</strong> — collected Golden Sample Hunt entries while it ran (Google's privacy
  policy applies).
</li>
```

Replace the Children paragraph:

```astro
The Golden Sample Hunt is restricted to US residents 18 and over. For everything else, the games are
family-friendly but the site isn't intentionally directed at children under 13, and we don't
knowingly collect their information.
```

with:

```astro
The Golden Sample Hunt, which ran from May to July 2026, was restricted to US residents 18 and over.
The games are family-friendly, but the site isn't intentionally directed at children under 13, and
we don't knowingly collect their information.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test privacy.spec.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/privacy.astro tests/e2e/privacy.spec.ts
git commit -m "docs(privacy): past-tense the Golden Sample clauses, keep the disclosure"
```

---

### Task 4: Update project docs and secret documentation

**Files:**

- Modify: `CLAUDE.md`
- Modify: `HUNT.md`
- Modify: `wrangler.toml`
- Modify: `src/data/games.ts`
- Modify: `src/env.d.ts`

**Interfaces:**

- None consumed or produced.

**Critical:** `wrangler.toml` documents `SUPABASE_SERVICE_ROLE_KEY` inside a comment block headed "Golden Sample 26 hunt secrets". That key is **still required** — `/api/quote` and `/quote/<token>` both use it. Only `GOLDEN_WORDS` and `GOLDEN_HMAC_SECRET` are retired.

- [ ] **Step 1: Replace the hunt section in `CLAUDE.md`**

Replace the entire `## Golden Sample 26 hunt` section — from that heading down to (but not including) `## Repo basics` — with:

```markdown
## Golden Sample 26 hunt — closed

The hunt ran 2026-05-07 → 2026-07-07 and is over. Its pages, API
endpoints, and in-game overlay have been removed; the `GOLDEN_WORDS` and
`GOLDEN_HMAC_SECRET` Worker secrets are retired. The Supabase tables and
`HUNT.md` are kept as a record of who played and what was redeemed.

There is no longer a secret to protect here. If a user asks about the
hunt, it's fine to explain how it worked.
```

Also update the "Repo basics" bullet that reads `Supabase backs leaderboards, subscribers, and the hunt` to:

```markdown
- Supabase backs leaderboards, subscribers, and sequencing quotes
```

- [ ] **Step 2: Add a closed header to `HUNT.md`**

Insert immediately after the `# Golden Sample 26 — hunt notes` title line:

```markdown
> **CLOSED.** This hunt ran 2026-05-07 → 2026-07-07. The pages, API
> endpoints, validation logic, and in-game overlay described below have
> all been removed from the codebase; the `GOLDEN_WORDS` and
> `GOLDEN_HMAC_SECRET` secrets are retired. This file is kept as a record
> of how the campaign worked. Nothing below is live.
```

- [ ] **Step 3: Rewrite the secrets block in `wrangler.toml`**

Replace the whole comment block that begins `# Golden Sample 26 hunt secrets — required for /api/golden-sample/*` and ends with the `GOLDEN_WORDS` description with:

```toml
# Supabase service-role key — required by /api/quote and /quote/<token>.
# The `quotes` table has RLS enabled with zero policies, so both the write
# and the read must bypass RLS. Set with:
#
#   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
#
# The Golden Sample 26 hunt closed 2026-07-07; its GOLDEN_WORDS and
# GOLDEN_HMAC_SECRET secrets are retired and can be deleted with
# `wrangler secret delete <name>`.
```

- [ ] **Step 4: Update the two code comments**

In `src/data/games.ts`, replace the header lines:

```ts
// src/data/games.ts
// The six BioKEA "games" featured in the Golden Sample Hunt
// (Code with Claude · 2026). Each game is a self-contained Vite/React
```

with:

```ts
// src/data/games.ts
// The six BioKEA "games" — browser games built around what the lab
// actually does. Each game is a self-contained Vite/React
```

In `src/env.d.ts`, replace the comment above `SUPABASE_SERVICE_ROLE_KEY`:

```ts
// Bypasses RLS. Required by the Golden Sample hunt endpoints and by
// /api/quote + /quote/<token>, whose `quotes` table has RLS enabled
// with zero policies. Worker secret only — never expose to the client.
```

with:

```ts
// Bypasses RLS. Required by /api/quote and /quote/<token>, whose
// `quotes` table has RLS enabled with zero policies. Worker secret
// only — never expose to the client.
```

- [ ] **Step 5: Verify nothing broke**

Run: `npm run check`
Expected: 0 errors.

Run: `grep -rn "GOLDEN_WORDS\|GOLDEN_HMAC_SECRET" src/ scripts/`
Expected: no matches — both secrets are referenced only in docs now.

Run: `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/ wrangler.toml`
Expected: matches in `src/env.d.ts`, `src/pages/api/quote.ts`, `src/pages/quote/[token].astro`, and `wrangler.toml`. If `wrangler.toml` has no match, the block was over-deleted — restore it.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md HUNT.md wrangler.toml src/data/games.ts src/env.d.ts
git commit -m "docs: record the hunt as closed, keep service-role key documented"
```

---

### Task 5: Restructure the navigation

**Files:**

- Modify: `src/components/layout/Nav.astro`
- Test: `tests/e2e/nav.spec.ts`

**Interfaces:**

- Produces: nav exposing three top-level links (Services, Pricing, Lab), one "About" dropdown (Mission, Projects, Works, Press, Games), and a CTA reading "Build a quote" pointing at `/quote`.

- [ ] **Step 1: Rewrite the failing tests**

In `tests/e2e/nav.spec.ts`, replace the first test entirely:

```ts
test('nav renders logo, three top-level links, About dropdown, and Build-a-quote CTA', async ({
  page,
}) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toBeVisible();

  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await expect(desktop.getByRole('link', { name: 'Services', exact: true })).toHaveAttribute(
    'href',
    '/services',
  );
  await expect(desktop.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
    'href',
    '/pricing',
  );
  await expect(desktop.getByRole('link', { name: 'Lab', exact: true })).toHaveAttribute(
    'href',
    '/lab',
  );
  await expect(desktop.getByText('About', { exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: /Build a quote/ })).toHaveAttribute(
    'href',
    '/quote',
  );
});

test('the old grouped labels and the Golden Sample link are gone', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByText('What we do', { exact: true })).toHaveCount(0);
  await expect(nav.getByText('Our work', { exact: true })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: /Golden Sample/i })).toHaveCount(0);
});

test('"About" dropdown reveals Mission, Projects, Works, Press, and Games', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toHaveAttribute(
    'href',
    '/mission',
  );
  await expect(desktop.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Works', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Press', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
    'href',
    '/mission/games',
  );
});
```

Delete these now-obsolete tests entirely: `'"What we do" dropdown reveals Services, Pricing, Quote, and Lab'`, `'"Our work" dropdown reveals Projects, Works, and Press'`, and `'Pipeline is not in the desktop nav (demoted to footer)'`.

Replace the mobile test:

```ts
test('mobile nav toggle opens menu with links, About accordion, and CTA', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /open menu/i });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const mobile = page.locator('#mobile-menu');
  await expect(mobile.getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Pricing', exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: 'Lab', exact: true })).toBeVisible();
  await expect(mobile.getByText('About', { exact: true })).toBeVisible();
  await expect(mobile.getByRole('link', { name: /Build a quote/ })).toBeVisible();
});
```

Leave the two dropdown-behaviour tests (`'only one dropdown stays open at a time'` and `'clicking outside the nav closes any open dropdown'`) in place but change every `desktop.getByText('What we do', { exact: true })` to `desktop.getByText('About', { exact: true })`, and every assertion on a `'Services'` dropdown link to assert on `'Mission'` instead. With only one dropdown remaining, the one-at-a-time test can no longer open a second — replace its body with:

```ts
test('the About dropdown opens and closes on click', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeVisible();
  await desktop.getByText('About', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Mission', exact: true })).toBeHidden();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test nav.spec.ts`
Expected: FAIL — the nav still renders three dropdowns, the gold Golden Sample link, and a "Get in touch" CTA.

- [ ] **Step 3: Rewrite the nav frontmatter**

In `src/components/layout/Nav.astro`, replace everything from the opening `---` through the `const cta` line with:

```astro
---
// src/components/layout/Nav.astro
// Editorial-style top nav: 3 top-level links + 1 grouped dropdown + a
// right-aligned CTA button. The commercial path (Services, Pricing) sits
// flat at top level rather than nested, so it reads first. Native
// <details>/<summary> for the dropdown — keyboard-accessible, zero JS
// overhead. Mobile renders the same structure as a flat accordion inside
// the hamburger.

interface NavLink {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  items: NavLink[];
}

const topLevelLinks: NavLink[] = [
  { href: '/services', label: 'Services' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/lab', label: 'Lab' },
];

const navGroups: NavGroup[] = [
  {
    label: 'About',
    items: [
      { href: '/mission', label: 'Mission' },
      { href: '/projects', label: 'Projects' },
      { href: '/works', label: 'Works' },
      { href: '/press', label: 'Press' },
      { href: '/mission/games', label: 'Games' },
    ],
  },
];

const cta: NavLink = { href: '/quote', label: 'Build a quote' };
---
```

- [ ] **Step 4: Update the desktop markup**

In the desktop `<ul class="flex items-center gap-7 ...">` there are currently two expression blocks: `{ navGroups.map(...) }` (the dropdowns) followed by `{ standaloneLinks.map(...) }` (the gold link).

Make two edits:

1. **Delete** the entire `{ standaloneLinks.map((link) => ( ... )) }` block, including its gold/`accent` conditional classes.
2. **Insert** this new block immediately _before_ the `{ navGroups.map(...) }` block, so top-level links render first:

```astro
{
  topLevelLinks.map((link) => (
    <li>
      <a href={link.href} class="hover:text-[var(--color-teal-bright)] transition">
        {link.label}
      </a>
    </li>
  ))
}
```

Do not otherwise modify the `{ navGroups.map(...) }` block — its dropdown markup is unchanged.

- [ ] **Step 5: Update the mobile markup**

In the mobile `<ul class="flex flex-col gap-1 px-6 py-4 text-base">`, make the same two edits:

1. **Delete** the entire `{ standaloneLinks.map((link) => ( ... )) }` block, including its `accent === 'gold'` conditional class.
2. **Insert** this new block immediately _before_ the `{ navGroups.map(...) }` accordion block:

```astro
{
  topLevelLinks.map((link) => (
    <li>
      <a href={link.href} class="block py-2 border-b border-slate-800">
        {link.label}
      </a>
    </li>
  ))
}
```

Do not otherwise modify the `{ navGroups.map(...) }` accordion block. The CTA `<li class="pt-3">` at the end stays as it is — it renders from `cta`, which now points at `/quote`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test nav.spec.ts`
Expected: PASS, all tests in the file.

Run: `grep -n "standaloneLinks\|accent" src/components/layout/Nav.astro`
Expected: no matches — both the array and the `accent` property are fully gone.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Nav.astro tests/e2e/nav.spec.ts
git commit -m "feat(nav): flatten to Services/Pricing/Lab + About, CTA to /quote"
```

---

### Task 6: Standardise the quote CTA labels

**Files:**

- Modify: `src/pages/services.astro`
- Modify: `src/pages/pricing.astro`
- Modify: `src/pages/quote/index.astro`
- Test: `tests/e2e/services.spec.ts`, `tests/e2e/pricing.spec.ts`

**Interfaces:**

- Consumes: `/quote` route.
- Produces: "Build a quote" → `/quote` and "Talk to us" → `/contact?topic=sequencing` used consistently across all three pages.

**Why this matters most:** `/services` currently has four buttons labelled "Request a quote", every one pointing at `/contact`. The configurator is unreachable from that page.

- [ ] **Step 1: Write the failing tests**

Append to `tests/e2e/services.spec.ts`:

```ts
test('services primary CTA now leads to the configurator', async ({ page }) => {
  await page.goto('/services');
  const primary = page.getByRole('link', { name: 'Build a quote' }).first();
  await expect(primary).toHaveAttribute('href', '/quote');
  // The old ambiguous label is gone everywhere on the page.
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});

test('services still offers a human path', async ({ page }) => {
  await page.goto('/services');
  await expect(page.getByRole('link', { name: 'Talk to us' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
});
```

Append to `tests/e2e/pricing.spec.ts`:

```ts
test('pricing hero leads with Build a quote and offers Talk to us', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('link', { name: 'Build a quote' }).first()).toHaveAttribute(
    'href',
    '/quote',
  );
  await expect(page.getByRole('link', { name: 'Talk to us' }).first()).toHaveAttribute(
    'href',
    '/contact?topic=sequencing',
  );
  await expect(page.getByRole('link', { name: 'Request a quote' })).toHaveCount(0);
});
```

Note: `pricing.spec.ts:88` already asserts a link named `/Build your quote/i` resolves to `/quote`. Change that locator to match the new label:

```ts
await expect(page.getByRole('link', { name: /Build a quote/i }).first()).toHaveAttribute(
  'href',
  '/quote',
);
```

`tests/e2e/quote.spec.ts` needs **no** change — verified it contains no assertion on the `CtaBand` label.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test services.spec.ts pricing.spec.ts`
Expected: FAIL — both pages still use "Request a quote" / "Build your quote →".

- [ ] **Step 3: Rewrite the `/services` CTAs**

In `src/pages/services.astro`, the hero button row becomes a primary configurator link plus a human path:

```astro
<div class="mt-6 flex items-center gap-4 flex-wrap">
  <a
    href="/quote"
    class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
  >
    Build a quote
  </a>
  <a href="/contact?topic=sequencing" class="text-[var(--color-teal)] text-sm font-medium">
    Talk to us →
  </a>
  <a href="/lab" class="text-[var(--color-teal)] text-sm font-medium"> See the lab → </a>
</div>
```

Both mid-page buttons (the one above the catalog list and the one below it) currently read "Request a quote" and point at `/contact?topic=sequencing`. Change **both** to:

```astro
<a
  href="/quote"
  class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium inline-block"
>
  Build a quote
</a>
```

And the `CtaBand` at the end:

```astro
<CtaBand
  title="Ready to send samples?"
  subtitle="Build an itemized quote in about a minute, or tell us about your project and we'll respond within a few days."
  cta={{ href: '/quote', label: 'Build a quote' }}
/>
```

- [ ] **Step 4: Rewrite the `/pricing` CTAs**

In `src/pages/pricing.astro`, the hero row currently has "Request a quote" (→ contact) then "Build your quote →" (→ /quote). Reorder so the configurator leads, and relabel:

```astro
<div class="mt-6 flex items-center gap-4 flex-wrap">
  <a
    href="/quote"
    class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
  >
    Build a quote
  </a>
  <a href="/contact?topic=sequencing" class="text-[var(--color-teal)] text-sm font-medium">
    Talk to us →
  </a>
  <a href="/services" class="text-[var(--color-teal)] text-sm font-medium">
    Need something else? See our full service catalog →
  </a>
</div>
```

And the `CtaBand`:

```astro
<CtaBand
  title="Not sure which service — or need a project-specific number?"
  subtitle="Build an itemized quote instantly, or send us your sample count and goals and we'll put one together."
  cta={{ href: '/quote', label: 'Build a quote' }}
/>
```

- [ ] **Step 5: Relabel the `/quote` CtaBand**

In `src/pages/quote/index.astro`, the `CtaBand` currently reads "Start a conversation". Since this page _is_ the configurator, its escape hatch is the human path:

```astro
<CtaBand
  title="Need something the calculator doesn't cover?"
  subtitle="Study design, custom assay development, field collection, or anything bespoke — tell us about your project."
  cta={{ href: '/contact?topic=sequencing', label: 'Talk to us' }}
/>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test services.spec.ts pricing.spec.ts quote.spec.ts`
Expected: PASS. `quote.spec.ts` asserts only on the configurator's own behaviour (live totals, dead-zone callouts, the conversation band) and never on the `CtaBand` label, so it should pass unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/pages/services.astro src/pages/pricing.astro src/pages/quote/index.astro \
  tests/e2e/services.spec.ts tests/e2e/pricing.spec.ts tests/e2e/quote.spec.ts
git commit -m "feat(cta): standardise on Build a quote vs Talk to us"
```

---

### Task 7: Full verification sweep

**Files:** none (verification only, plus a possible lint-fix commit).

- [ ] **Step 1: Confirm the hunt is fully gone from live code**

Run:

```bash
grep -rn -i "golden.sample\|GOLDEN_WORDS\|GOLDEN_HMAC" src/ public/ scripts/ tests/
```

Expected: matches only in `src/pages/privacy.astro` (the retained past-tense disclosures) and `tests/e2e/privacy.spec.ts` / `tests/e2e/mission-games.spec.ts` (the assertions guarding them). Any match in `src/lib/`, `src/pages/api/`, `scripts/`, or `public/` means the teardown is incomplete.

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: 0 errors. Pre-existing hints about deprecated zod `.email()`/`.uuid()` are expected.

- [ ] **Step 3: Unit tests**

Run: `npm test`
Expected: all pass.

- [ ] **Step 4: Full e2e suite**

Run: `npm run test:e2e`
Expected: all pass. If the webServer times out on the first run, that is cold-start compilation after the file deletions — re-run once before treating it as a failure.

- [ ] **Step 5: Lint**

Run: `npm run lint`
If violations are reported, run `npm run format`, then re-run `npm run lint` to confirm clean.

- [ ] **Step 6: Manual spot-check**

With the dev server running, confirm in a browser:

- Nav shows **Services · Pricing · Lab · About ▾** and a **Build a quote** button; no gold link
- `/mission/games` renders six tiles, no hunt CTA, no "GOLDEN SAMPLE HIDDEN" badge
- `/mission/games/leaderboard` has three tabs (Today / Week / All time), no Hunt tab
- `/mission/games/golden-sample-26` returns 404
- `/services` leads with **Build a quote** → `/quote`
- `/privacy` still discloses the hunt data, in past tense

- [ ] **Step 7: Commit** (only if Step 5 modified files)

```bash
git add -u
git commit -m "chore: lint fixes from hunt sunset and nav simplification"
```
