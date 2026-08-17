# Games to `games.biokea.ai` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `BioKEA/games-site` serving the games index, handle picker, leaderboard, `handle-check` API, and six built game bundles at `games.biokea.ai`; then remove all of that from `website-biokea`, leaving one external "Games" nav link.

**Architecture:** Part A creates a new Astro v6 + Cloudflare Worker project by porting files verbatim from `website-biokea` at commit `3629438` and applying exact, listed edits (paths, links, base URLs). Part B strips the same surface out of `website-biokea`. Part B only starts after `https://games.biokea.ai/` is verified live, so the games are never unreachable.

**Tech Stack:** Astro v6 (`output: 'server'`), `@astrojs/cloudflare`, Tailwind v4 (`@tailwindcss/vite`), Playwright (e2e), Vitest (unit), Prettier + lint-staged, GitHub Actions → `wrangler deploy`.

**Spec:** `docs/superpowers/specs/2026-08-16-games-subdomain-design.md`

## Global Constraints

- **Source of truth for the port:** `website-biokea` at commit `3629438`. Every "copy from" step means: `git -C $SITE show 3629438:<path> > <dest>` where `$SITE` is your local `website-biokea` checkout. Copy first, then apply only the edits the step lists — do not "improve" ported files.
- **No redirects** from `/mission/games/*` on biokea.ai. Explicitly declined.
- **New repo is public** (`BioKEA/games-site`), like the `BioKEA/game-*` repos.
- **Same GA property** in both sites: `G-WYL7J2D7SG`.
- **Two secrets stay put on `website-biokea`:** `SUPABASE_SERVICE_ROLE_KEY` (used by `/api/quote`, `/quote/<token>`) — never delete it there.
- **Handle storage key** the games read: `biokea:player:handle` (+ `biokea:player:handle-confirmed`). Do not rename.
- **Cross-site links are absolute:** games-site → `https://biokea.ai/...`; website-biokea → `https://games.biokea.ai`.
- **Rollout gate:** Part B (Tasks 8–10) must not merge until Task 7's live verification passes.
- Follow existing conventions: cream/ink/teal/pink/ochre tokens, Inter + JetBrains Mono, `font-mono-label` utility, `Eyebrow` component. Prettier config copied verbatim.
- No new npm dependencies beyond those `website-biokea` already uses (minus MDX/sitemap, which games-site drops).

---

# Part A — `BioKEA/games-site` (Tasks 1–7)

Work in a fresh clone of the new repo. Set `SITE=/path/to/website-biokea` in your shell for the copy commands.

### Task 1: Create the repo and scaffold with layout, nav, footer, 404

**Files:**

- Create: `package.json`, `astro.config.mjs`, `wrangler.toml`, `tsconfig.json`, `playwright.config.ts`, `vitest.config.ts`, `.prettierrc`, `.prettierignore`, `.gitignore`, `.husky/pre-commit`, `.dev.vars.example`
- Create: `src/styles/tokens.css`, `src/styles/global.css` (copied)
- Create: `src/env.d.ts`, `src/layouts/BaseLayout.astro`, `src/components/layout/Nav.astro`, `src/components/layout/Footer.astro`, `src/components/ui/Eyebrow.astro`, `src/pages/404.astro`
- Create: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`, `public/safari-pinned.svg`, `public/site.webmanifest`, `public/robots.txt`, `public/assets/images/logo2-white.png`, `public/assets/images/og-home.jpg` (copied)
- Create: `tests/e2e/layout.spec.ts`, `tests/unit/__mocks__/cloudflare-workers.ts`

**Interfaces:**

- Produces: `BaseLayout` with props `{ title: string; description: string; noindex?: boolean }`; `Eyebrow` (slot); `Nav`/`Footer` used by every later page. `@/` alias → `src/`.

- [ ] **Step 1: Create the repository**

```bash
gh repo create BioKEA/games-site --public --description "BioKEA games at games.biokea.ai — index, leaderboard, and the six built game bundles" --clone
cd games-site
git switch -c main 2>/dev/null || true
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "biokea-games-site",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "node scripts/build-games.mjs && astro build",
    "games:build": "node scripts/build-games.mjs",
    "games:verify": "node scripts/verify-games.mjs",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "prettier --check \"src/**/*.{astro,ts,tsx,md,css}\" \"scripts/**/*.mjs\" \"tests/**/*.ts\"",
    "format": "prettier --write \"src/**/*.{astro,ts,tsx,md,css}\" \"scripts/**/*.mjs\" \"tests/**/*.ts\"",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{astro,ts,tsx,md,mjs,json,css}": ["prettier --write"]
  },
  "dependencies": {
    "@astrojs/cloudflare": "^13.0.0",
    "@tailwindcss/vite": "^4.2.0",
    "astro": "^6.0.0",
    "tailwindcss": "^4.2.0",
    "zod": "^4.0.0"
  },
  "overrides": {
    "vite": "^7.0.0"
  },
  "devDependencies": {
    "@astrojs/check": "^0.9.8",
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "prettier": "^3.8.1",
    "prettier-plugin-astro": "^0.14.0",
    "typescript": "^5.9.3",
    "vitest": "^4.1.4"
  }
}
```

Note: `scripts/build-games.mjs` and `scripts/verify-games.mjs` arrive in Task 5. Until then `npm run build` will fail at the first command; use `npx astro build` if you need a build before Task 5.

- [ ] **Step 3: Copy the config files verbatim, then adjust**

```bash
mkdir -p src/styles src/layouts src/components/layout src/components/ui src/pages public/assets/images tests/e2e tests/unit/__mocks__ .husky
for f in tsconfig.json .prettierrc .prettierignore playwright.config.ts src/styles/tokens.css src/styles/global.css \
         public/favicon.svg public/favicon.ico public/apple-touch-icon.png public/safari-pinned.svg public/site.webmanifest \
         public/assets/images/logo2-white.png public/assets/images/og-home.jpg tests/unit/__mocks__/cloudflare-workers.ts .husky/pre-commit; do
  git -C "$SITE" show "3629438:$f" > "$f"
done
git -C "$SITE" show 3629438:src/components/ui/Eyebrow.astro > src/components/ui/Eyebrow.astro
```

Write `astro.config.mjs`:

```js
// astro.config.mjs
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://games.biokea.ai',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  vite: {
    plugins: [tailwindcss()],
  },
});
```

Write `wrangler.toml`:

```toml
name = "biokea-games"
compatibility_date = "2026-04-18"

# Astro's Cloudflare adapter emits the worker entry + static assets;
# wrangler deploy picks them up from dist/ via `astro build`.
# Deployed by .github/workflows/deploy.yml on push to main; the custom
# domain games.biokea.ai is attached to this Worker in the Cloudflare
# dashboard (Workers → biokea-games → Settings → Domains & Routes).
#
# Secrets — set once:
#   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
#     # Read by /api/handle-check to load forbidden_handle_patterns
#     # (RLS-locked). Never expose to the client.

[vars]
SUPABASE_URL = "https://xkmfsxcaapyuxachtcsy.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_HmeteofpCTVchDfmzrMAxg_y0ea1IM1"
```

(No `main`/`assets` keys — `website-biokea`'s `wrangler.toml` at `3629438` has none either; the adapter emits them into `dist/` at build time.)

Write `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // Stub the cloudflare:workers virtual module so unit tests can import
      // API endpoint files without the Workers runtime.
      'cloudflare:workers': fileURLToPath(
        new URL('./tests/unit/__mocks__/cloudflare-workers.ts', import.meta.url),
      ),
    },
  },
});
```

Write `.gitignore`:

```
node_modules
dist
.astro/
/test-results/
/playwright-report/
# Built game bundles — produced by scripts/build-games.mjs at build time.
/public/*/
!/public/assets/
.env
.env*.local
.dev.vars
.wrangler/
.DS_Store
*.log
```

(`/public/*/` ignores every subdirectory of `public/` — that is where the six bundles land — while `!/public/assets/` keeps thumbnails and images tracked. Top-level files like `favicon.svg` are unaffected.)

Write `.dev.vars.example`:

```
# Copy to .dev.vars for local dev. Only needed for /api/handle-check.
SUPABASE_SERVICE_ROLE_KEY=
```

Write `src/env.d.ts`:

```ts
/// <reference types="astro/client" />

declare module 'cloudflare:workers' {
  export const env: {
    SUPABASE_URL?: string;
    SUPABASE_PUBLISHABLE_KEY?: string;
    // Bypasses RLS. Required by /api/handle-check to read
    // forbidden_handle_patterns. Worker secret only — never expose to
    // the client.
    SUPABASE_SERVICE_ROLE_KEY?: string;
  };
}
```

Write `public/robots.txt`:

```
User-agent: *
Allow: /
```

- [ ] **Step 4: Write the layout, nav, footer, and 404 page**

`src/layouts/BaseLayout.astro`:

```astro
---
// src/layouts/BaseLayout.astro
import '@/styles/global.css';
import Nav from '@/components/layout/Nav.astro';
import Footer from '@/components/layout/Footer.astro';

interface Props {
  title: string;
  description: string;
  noindex?: boolean;
}
const { title, description, noindex = false } = Astro.props;
const fullTitle = title.includes('BioKEA') ? title : `${title} — BioKEA Games`;
const canonicalUrl = new URL(Astro.url.pathname, Astro.site).toString();
const ogUrl = new URL('/assets/images/og-home.jpg', Astro.site).toString();
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="mask-icon" href="/safari-pinned.svg" color="#0f766e" />
    <link rel="manifest" href="/site.webmanifest" />
    <meta name="theme-color" content="#0b1f1a" />
    {noindex && <meta name="robots" content="noindex,nofollow" />}
    <title>{fullTitle}</title>
    <meta name="description" content={description} />
    <link rel="canonical" href={canonicalUrl} />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="BioKEA Games" />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:url" content={canonicalUrl} />
    <meta property="og:image" content={ogUrl} />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content={fullTitle} />
    <meta name="twitter:description" content={description} />
    <meta name="twitter:image" content={ogUrl} />
    <!-- Google tag (gtag.js) — same property as biokea.ai -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-WYL7J2D7SG"></script>
    <script is:inline>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());
      gtag('config', 'G-WYL7J2D7SG');
    </script>
  </head>
  <body>
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-[var(--color-ink)] focus:text-[var(--color-cream)] focus:p-2 focus:rounded"
    >
      Skip to content
    </a>
    <Nav />
    <main id="main"><slot /></main>
    <Footer />
  </body>
</html>
```

`src/components/layout/Nav.astro`:

```astro
---
// src/components/layout/Nav.astro
// Games-site nav: logo back to the marketing site, two local links, and a
// CTA to the lab-updates subscribe page on biokea.ai (link-out — no
// cross-origin form posts from this site).
const links = [
  { href: '/', label: 'Games' },
  { href: '/leaderboard', label: 'Leaderboard' },
];
const cta = { href: 'https://biokea.ai/subscribe?source=games', label: 'Lab updates' };
---

<nav aria-label="Primary" class="bg-[var(--color-ink)] text-[var(--color-cream)]">
  <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
    <a href="https://biokea.ai" aria-label="BioKEA home" class="flex items-center gap-3 shrink-0">
      <img
        src="/assets/images/logo2-white.png"
        alt=""
        width="256"
        height="136"
        class="h-14 w-auto"
      />
      <span class="sr-only">BioKEA</span>
    </a>
    <div class="flex items-center gap-5 sm:gap-7">
      <ul
        class="flex items-center gap-5 sm:gap-7 text-base font-medium text-slate-300 tracking-wide"
      >
        {
          links.map((link) => (
            <li>
              <a href={link.href} class="hover:text-[var(--color-teal-bright)] transition">
                {link.label}
              </a>
            </li>
          ))
        }
      </ul>
      <a
        href={cta.href}
        class="bg-[var(--color-cream)] text-[var(--color-ink)] px-4 py-2 rounded-sm text-base font-semibold hover:bg-[var(--color-teal-bright)] transition whitespace-nowrap"
      >
        {cta.label} →
      </a>
    </div>
  </div>
</nav>
```

`src/components/layout/Footer.astro`:

```astro
---
// src/components/layout/Footer.astro
const year = new Date().getFullYear();
---

<footer class="bg-[var(--color-ink)] text-slate-400 mt-24">
  <div
    class="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-sm"
  >
    <p>© {year} BioKEA · Berkeley, CA</p>
    <ul class="flex items-center gap-6 font-mono text-[11px] tracking-[0.1em] uppercase">
      <li>
        <a href="https://biokea.ai/privacy" class="hover:text-[var(--color-teal-bright)]">Privacy</a
        >
      </li>
      <li>
        <a href="https://biokea.ai" class="hover:text-[var(--color-teal-bright)]">biokea.ai →</a>
      </li>
    </ul>
  </div>
</footer>
```

`src/pages/404.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
---

<BaseLayout title="Not found — BioKEA Games" description="That page doesn't exist." noindex>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-24">
    <Eyebrow>404</Eyebrow>
    <h1 class="mt-3 text-4xl font-semibold tracking-[-0.025em] text-[var(--color-ink)]">
      Nothing here.
    </h1>
    <p class="mt-4 text-slate-600">
      <a href="/" class="text-[var(--color-teal)] underline">Back to all games →</a>
    </p>
  </section>
</BaseLayout>
```

- [ ] **Step 5: Write the failing layout test**

`tests/e2e/layout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('nav links to biokea.ai, Games, Leaderboard, and the lab-updates subscribe page', async ({
  page,
}) => {
  await page.goto('/does-not-exist');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: /BioKEA home/i })).toHaveAttribute(
    'href',
    'https://biokea.ai',
  );
  await expect(nav.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute('href', '/');
  await expect(nav.getByRole('link', { name: 'Leaderboard', exact: true })).toHaveAttribute(
    'href',
    '/leaderboard',
  );
  await expect(nav.getByRole('link', { name: /Lab updates/ })).toHaveAttribute(
    'href',
    'https://biokea.ai/subscribe?source=games',
  );
});

test('unknown routes render the 404 page with a way back', async ({ page }) => {
  const res = await page.goto('/does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nothing here.');
  await expect(page.getByRole('link', { name: /Back to all games/ })).toHaveAttribute('href', '/');
});

test('footer links back to the privacy policy on biokea.ai', async ({ page }) => {
  await page.goto('/does-not-exist');
  await expect(page.locator('footer').getByRole('link', { name: 'Privacy' })).toHaveAttribute(
    'href',
    'https://biokea.ai/privacy',
  );
});
```

- [ ] **Step 6: Install and run the test to verify it fails**

```bash
npm install
npx playwright install --with-deps chromium
npx playwright test layout.spec.ts
```

Expected: FAIL only if a file above is missing or malformed (this task's deliverable is the scaffold itself, so once every file exists the tests should pass on first run). If `astro dev` errors on `wrangler.toml`, diff it against `git -C "$SITE" show 3629438:wrangler.toml`.

- [ ] **Step 7: Run check, lint, and the test to verify they pass**

```bash
npm run check
npm run lint || npm run format
npx playwright test layout.spec.ts
```

Expected: `astro check` 0 errors; lint clean after format; 3 tests pass.

- [ ] **Step 8: Commit and push**

```bash
git add -A
git commit -m "feat: scaffold games-site — Astro + Cloudflare, layout, nav, footer, 404"
git push -u origin main
```

---

### Task 2: Port the data modules, handle picker, and index page

**Files:**

- Create: `src/data/games.ts`, `src/data/leaderboard-games.ts` (copied + edited)
- Create: `src/components/games/HandlePicker.astro` (copied verbatim)
- Create: `src/pages/index.astro` (copied from `src/pages/mission/games.astro` + edited)
- Create: `public/assets/games/*-thumb.png` (6 files, copied)
- Test: `tests/e2e/index.spec.ts`, `tests/e2e/handle.spec.ts`

**Interfaces:**

- Consumes: `BaseLayout`, `Eyebrow` from Task 1.
- Produces: `games: Game[]` with `playUrl: '/<slug>/'`; `LEADERBOARD_GAMES`, `KNOWN_HANDLE_KEYS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from `@/data/leaderboard-games` — used by Task 3.

- [ ] **Step 1: Write the failing tests**

`tests/e2e/index.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

const TITLES = [
  'Codon Collider',
  'Pipette Rush',
  'Plasmid Plinko',
  'Particle Accelerator',
  'Biodiversity Discovery Lab',
  'WildCal',
];

test('index renders headline and six game tiles', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Biology, played.');
  await expect(page.locator('[data-game-slug]')).toHaveCount(6);
  for (const t of TITLES) {
    await expect(page.getByRole('heading', { name: t, exact: true })).toBeVisible();
  }
});

test('tile play links resolve to /<slug>/ on this origin', async ({ page }) => {
  await page.goto('/');
  await expect(
    page
      .locator('[data-game-slug="codon2048"]')
      .getByRole('link', { name: 'Play Codon Collider ↗' }),
  ).toHaveAttribute('href', '/codon2048/');
  await expect(
    page
      .locator('[data-game-slug="3d-biodiversity-collect-em-all"]')
      .getByRole('link', { name: 'Play WildCal ↗' }),
  ).toHaveAttribute('href', '/3d-biodiversity-collect-em-all/');
});

test('daily card links to /leaderboard and the newsletter block links out to biokea.ai', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Full leaderboard/ })).toHaveAttribute(
    'href',
    '/leaderboard',
  );
  await expect(page.getByRole('link', { name: /Get lab updates/ })).toHaveAttribute(
    'href',
    'https://biokea.ai/subscribe?source=games',
  );
  // The embedded subscribe form is not ported — no email input on this page.
  await expect(page.locator('#main input[type="email"]')).toHaveCount(0);
});
```

`tests/e2e/handle.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('picking a handle stores biokea:player:handle and survives a reload', async ({ page }) => {
  // handle-check needs the service-role secret; mock the allow response so
  // this test is deterministic in dev and CI.
  await page.route('**/api/handle-check**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, allowed: true }),
    }),
  );
  await page.goto('/');
  const picker = page.locator('[data-handle-picker]');
  await picker.locator('input').fill('DrBio');
  await picker.locator('[data-handle-save]').click();
  await expect(picker.locator('[data-handle-display]')).toHaveText('DrBio');

  const stored = await page.evaluate(() => localStorage.getItem('biokea:player:handle'));
  expect(stored).toBe('DrBio');

  await page.reload();
  await expect(page.locator('[data-handle-picker] [data-handle-display]')).toHaveText('DrBio');
});

test('a blocked handle is rejected with a message and not stored', async ({ page }) => {
  await page.route('**/api/handle-check**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, allowed: false, reason: 'forbidden' }),
    }),
  );
  await page.goto('/');
  const picker = page.locator('[data-handle-picker]');
  await picker.locator('input').fill('badword');
  await picker.locator('[data-handle-save]').click();
  await expect(picker.locator('[data-handle-status]')).toContainText("isn't allowed");
  expect(await page.evaluate(() => localStorage.getItem('biokea:player:handle'))).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test index.spec.ts handle.spec.ts`
Expected: FAIL — `/` is a 404 (no index page yet).

- [ ] **Step 3: Copy the data modules, picker, and thumbnails; edit paths**

```bash
mkdir -p src/data src/components/games public/assets/games
git -C "$SITE" show 3629438:src/data/games.ts > src/data/games.ts
git -C "$SITE" show 3629438:src/data/leaderboard-games.ts > src/data/leaderboard-games.ts
git -C "$SITE" show 3629438:src/components/games/HandlePicker.astro > src/components/games/HandlePicker.astro
for f in $(git -C "$SITE" ls-tree --name-only 3629438 public/assets/games/); do
  git -C "$SITE" show "3629438:$f" > "$f"
done
sed -i '' "s#playUrl: '/mission/games/#playUrl: '/#g" src/data/games.ts src/data/leaderboard-games.ts
```

Then in `src/data/games.ts` replace the header comment (the block above `export interface Game`) with:

```ts
// src/data/games.ts
// The six BioKEA games — browser games built around what the lab actually
// does. Each is a self-contained Vite/React app served as static assets
// under public/<slug>/ on games.biokea.ai (built by scripts/build-games.mjs).
```

and edit the `repo?` doc comment so it reads `the pre-bundled artifact under public/<slug>/` (drop `mission/games/`).

In `src/data/leaderboard-games.ts` the header comment says "(3) add the slug to LEADERBOARD_ENABLED in scripts/build-games.mjs" — that stays true here; no change needed.

Verify: `grep -n "mission/games" src/data/*.ts src/components/games/HandlePicker.astro` → no matches.

- [ ] **Step 4: Copy the index page and edit it**

```bash
git -C "$SITE" show 3629438:src/pages/mission/games.astro > src/pages/index.astro
```

Apply these edits to `src/pages/index.astro`:

1. Delete the import line `import SubscribeForm from '@/components/forms/SubscribeForm.astro';`.
2. Change the `BaseLayout` props to:

```astro
<BaseLayout
  title="BioKEA Games"
  description="Six BioKEA games. Biology you can play with — built around what we actually do in the lab."
/>
```

3. Change `href="/mission/games/leaderboard"` (the "Full leaderboard →" link) to `href="/leaderboard"`.
4. Replace the newsletter `<li>` — the last item in the games list, from `<li` with `md:col-span-2 lg:col-span-3` through its `</li>` — with:

```astro
<li
  class="bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md p-6 flex flex-col md:col-span-2 lg:col-span-3"
>
  <div class="font-mono text-[10px] tracking-[0.22em] uppercase text-[var(--color-ochre)]">
    Lab updates
  </div>
  <h2 class="mt-2 text-lg font-semibold text-[var(--color-ink)] leading-tight">
    Be the first to play the next one.
  </h2>
  <p class="mt-3 text-sm text-slate-600 leading-relaxed">
    New games, papers, and lab milestones — straight to your inbox.
  </p>
  <div class="mt-5 pt-4 border-t border-slate-900/10">
    <a
      href="https://biokea.ai/subscribe?source=games"
      class="inline-block bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
    >
      Get lab updates →
    </a>
  </div>
</li>
```

Verify: `grep -n "SubscribeForm\|mission/games" src/pages/index.astro` → no matches.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test index.spec.ts handle.spec.ts layout.spec.ts && npm run check`
Expected: all pass; 0 check errors.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "feat: port games index, handle picker, and game data"
git push
```

---

### Task 3: Port the leaderboard page

**Files:**

- Create: `src/pages/leaderboard.astro` (copied from `src/pages/mission/games/leaderboard.astro` + edited)
- Test: `tests/e2e/leaderboard.spec.ts`

**Interfaces:**

- Consumes: `LEADERBOARD_GAMES`, `KNOWN_HANDLE_KEYS`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from Task 2.

- [ ] **Step 1: Write the failing test**

`tests/e2e/leaderboard.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('leaderboard renders three tabs and no Hunt tab', async ({ page }) => {
  await page.goto('/leaderboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Leaderboard');
  await expect(page.locator('[data-tab="today"]')).toBeVisible();
  await expect(page.locator('[data-tab="week"]')).toBeVisible();
  await expect(page.locator('[data-tab="all"]')).toBeVisible();
  await expect(page.locator('[data-tab="hunt"]')).toHaveCount(0);
});

test('#week deep link selects the Week tab', async ({ page }) => {
  await page.goto('/leaderboard#week');
  await expect(page.locator('[data-tab="week"]')).toHaveAttribute('data-active', 'true');
  await expect(page.locator('[data-tab="today"]')).not.toHaveAttribute('data-active', 'true');
});

test('back links go to the games index on this origin', async ({ page }) => {
  await page.goto('/leaderboard');
  const back = page.getByRole('link', { name: /All games/i });
  await expect(back.first()).toHaveAttribute('href', '/');
  await expect(page.getByRole('link', { name: /Back to all games/i })).toHaveAttribute('href', '/');
});
```

(The tab buttons carry `data-tab="today|week|all"` and mark the selected one with `data-active="true"`; the `#week` hash is read on load by the page's own script.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test leaderboard.spec.ts`
Expected: FAIL — `/leaderboard` is a 404.

- [ ] **Step 3: Copy and edit the page**

```bash
git -C "$SITE" show 3629438:src/pages/mission/games/leaderboard.astro > src/pages/leaderboard.astro
sed -i '' 's#href="/mission/games/"#href="/"#g' src/pages/leaderboard.astro
```

Then change the `BaseLayout` title prop from `"Daily Leaderboard — BioKEA Games"` — it already ends in "BioKEA Games", so leave it. Verify: `grep -n "mission/games" src/pages/leaderboard.astro` → no matches (the `playUrl`s come from the data module and were fixed in Task 2).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test leaderboard.spec.ts && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat: port the daily leaderboard page"
git push
```

---

### Task 4: Port the handle-check API

**Files:**

- Create: `src/pages/api/handle-check.ts` (copied verbatim)
- Test: `tests/e2e/api.spec.ts`

**Interfaces:**

- Produces: `GET /api/handle-check?handle=<h>` → `{ ok: true, allowed: boolean }` | `{ ok: false, error }`. Consumed by `HandlePicker` (Task 2) via a same-origin fetch.

- [ ] **Step 1: Write the failing test**

`tests/e2e/api.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('handle-check rejects malformed handles with 400', async ({ request }) => {
  for (const bad of ['', 'has space', 'x'.repeat(33), 'emoji🙂']) {
    const res = await request.get(`/api/handle-check?handle=${encodeURIComponent(bad)}`);
    expect(res.status(), `handle=${JSON.stringify(bad)}`).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'Invalid handle.' });
  }
});

test('handle-check answers JSON for a well-formed handle', async ({ request }) => {
  const res = await request.get('/api/handle-check?handle=DrBio');
  // 200 when SUPABASE_SERVICE_ROLE_KEY is configured (.dev.vars / Worker
  // secret); 500 "not configured" otherwise. Both are JSON with `ok`.
  expect([200, 500]).toContain(res.status());
  const body = await res.json();
  expect(typeof body.ok).toBe('boolean');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test api.spec.ts`
Expected: FAIL — route returns 404.

- [ ] **Step 3: Copy the endpoint**

```bash
mkdir -p src/pages/api
git -C "$SITE" show 3629438:src/pages/api/handle-check.ts > src/pages/api/handle-check.ts
```

Edit only the header comment: change `Used by HandlePicker on /mission/games/` to `Used by HandlePicker on the games index (/)`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test api.spec.ts handle.spec.ts && npm run check`
Expected: PASS; 0 errors.

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "feat: port /api/handle-check"
git push
```

---

### Task 5: Port the game build script and add a post-build verifier

**Files:**

- Create: `scripts/build-games.mjs` (copied + edited)
- Create: `scripts/verify-games.mjs`
- Test: `tests/unit/verify-games.test.ts`

**Interfaces:**

- Produces: `npm run games:build` populates `public/<slug>/` for each entry in `src/data/games.ts`; `npm run games:verify` exits non-zero unless every bundle exists with the rewritten injections. `verify-games.mjs` exports `checkBundle(indexHtml: string, slug: string): string[]` (list of problems, empty when OK) for the unit test.

- [ ] **Step 1: Write the failing unit test**

`tests/unit/verify-games.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { checkBundle } from '../../scripts/verify-games.mjs';

const GOOD =
  '<html><head><script async src="https://www.googletagmanager.com/gtag/js?id=G-WYL7J2D7SG"></script></head>' +
  '<body><a href="/" id="biokea-back">All Games</a>' +
  '<a href="https://biokea.ai/subscribe?source=codon2048" id="biokea-subscribe">Lab updates</a></body></html>';

describe('checkBundle', () => {
  it('accepts a bundle with the rewritten injections', () => {
    expect(checkBundle(GOOD, 'codon2048')).toEqual([]);
  });

  it('flags a back button that still points at the old marketing path', () => {
    const html = GOOD.replace(
      'href="/" id="biokea-back"',
      'href="/mission/games/" id="biokea-back"',
    );
    expect(checkBundle(html, 'codon2048')).toContain('back button href is not "/"');
  });

  it('flags a relative subscribe pill', () => {
    const html = GOOD.replace(
      'https://biokea.ai/subscribe?source=codon2048',
      '/subscribe?source=codon2048',
    );
    expect(checkBundle(html, 'codon2048')).toContain('subscribe pill is not absolute to biokea.ai');
  });

  it('flags a missing analytics snippet', () => {
    const html = GOOD.replace('G-WYL7J2D7SG', 'G-NOPE');
    expect(checkBundle(html, 'codon2048')).toContain('GA snippet missing');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../scripts/verify-games.mjs`.

- [ ] **Step 3: Copy the build script and apply the path edits**

```bash
mkdir -p scripts
git -C "$SITE" show 3629438:scripts/build-games.mjs > scripts/build-games.mjs
```

Edits, each a single exact replacement:

1. In `BACK_BUTTON_HTML`, change `<a href="/mission/games/" id="biokea-back"` to `<a href="/" id="biokea-back"`.
2. In `subscribeLinkHtml(slug)`, change ``const href = `/subscribe?source=${encodeURIComponent(slug)}`;`` to ``const href = `https://biokea.ai/subscribe?source=${encodeURIComponent(slug)}`;``.
3. Change ``run(`npx vite build --base /mission/games/${game.slug}/`, {`` to ``run(`npx vite build --base /${game.slug}/`, {``.
4. Change `const out = join(root, 'public', 'mission', 'games', game.slug);` to `const out = join(root, 'public', game.slug);`.
5. In the no-token warning string, change `/mission/games/<slug>/ routes will 404 unless public/mission/games/ already populated locally.` to `/<slug>/ routes will 404 unless public/<slug>/ is already populated locally.`
6. In the per-game failure message, change `bundled fallback under public/mission/games/${game.slug}/ remains in place.` to `bundled fallback under public/${game.slug}/ remains in place.`
7. Replace the header comment block (everything from `// scripts/build-games.mjs` down to the blank line before `import { execSync }`) with:

```js
// scripts/build-games.mjs
//
// Clones each game's GitHub repo, builds it with vite, and writes the dist
// output into public/<slug>/. Runs as a prebuild step of `npm run build`
// so games stay sourced from their per-game repos but are served from
// games.biokea.ai at /<slug>/.
//
// Auth: reads GITHUB_TOKEN from env. For local dev, falls back to
// `gh auth token` if available. If neither is set, the script logs a
// warning and exits 0 — whatever is already under public/<slug>/ serves.
//
// Failures per-game are non-fatal: a network blip or a broken upstream
// keeps the previous bundle in place rather than failing the deploy.
```

8. In the `readGames()` comment, change `public/games/<slug>/` to `public/<slug>/`.

Verify: `grep -n "mission/games" scripts/build-games.mjs` → no matches.

- [ ] **Step 4: Write the verifier**

`scripts/verify-games.mjs`:

```js
#!/usr/bin/env node
// scripts/verify-games.mjs
//
// Post-build guard: every game listed in src/data/games.ts must have a
// built bundle under public/<slug>/ whose index.html carries the three
// injections build-games.mjs adds — back button to "/", an absolute
// subscribe pill on biokea.ai, and the GA snippet. Exits 1 with a report
// if anything is off, so a mis-rewritten base path can't ship silently.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GA_MEASUREMENT_ID = 'G-WYL7J2D7SG';

export function checkBundle(html, slug) {
  const problems = [];
  const back = html.match(/<a href="([^"]*)" id="biokea-back"/);
  if (!back) problems.push('back button missing');
  else if (back[1] !== '/') problems.push('back button href is not "/"');
  const sub = html.match(/<a href="([^"]*)" id="biokea-subscribe"/);
  if (!sub) problems.push('subscribe pill missing');
  else if (sub[1] !== `https://biokea.ai/subscribe?source=${encodeURIComponent(slug)}`)
    problems.push('subscribe pill is not absolute to biokea.ai');
  if (!html.includes(`gtag/js?id=${GA_MEASUREMENT_ID}`)) problems.push('GA snippet missing');
  return problems;
}

function readSlugs(root) {
  const src = readFileSync(join(root, 'src', 'data', 'games.ts'), 'utf-8');
  return Array.from(src.matchAll(/slug:\s*['"]([^'"]+)['"]/g), (m) => m[1]);
}

// Only run the CLI when executed directly (not when imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  let failed = 0;
  for (const slug of readSlugs(root)) {
    const indexHtml = join(root, 'public', slug, 'index.html');
    if (!existsSync(indexHtml)) {
      console.error(`[games-verify] ${slug}: ✗ public/${slug}/index.html missing`);
      failed++;
      continue;
    }
    const problems = checkBundle(readFileSync(indexHtml, 'utf-8'), slug);
    if (problems.length) {
      console.error(`[games-verify] ${slug}: ✗ ${problems.join('; ')}`);
      failed++;
    } else {
      console.log(`[games-verify] ${slug}: ✓`);
    }
  }
  process.exit(failed ? 1 : 0);
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 6: Build the games locally and verify**

Requires `gh auth login` (or `GITHUB_TOKEN`) so the script can clone the public game repos, and takes several minutes:

```bash
npm run games:build
npm run games:verify
ls public/
```

Expected: `[games-build] done. 6 ok · 0 failed`; verifier prints six `✓` lines and exits 0; `public/` now contains six slug directories (git-ignored — `git status` must not list them).

If a game fails to build for an upstream reason, the verifier fails for that slug. Do not skip it — report which repo broke.

- [ ] **Step 7: Serve a bundle and check the injections render**

```bash
npx astro dev &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/codon2048/
curl -s http://localhost:4321/codon2048/ | grep -o 'id="biokea-back"[^>]*' | head -1
kill %1
```

Expected: `200`; the grep shows the back-button anchor. Open `http://localhost:4321/codon2048/` in a browser and confirm the game loads and the "← All Games" pill goes to `/`.

- [ ] **Step 8: Commit and push**

```bash
git add scripts/build-games.mjs scripts/verify-games.mjs tests/unit/verify-games.test.ts
git commit -m "feat: build the six games into public/<slug>/ and verify injections post-build"
git push
```

---

### Task 6: Deploy workflow, README, and first deploy

**Files:**

- Create: `.github/workflows/deploy.yml`
- Create: `README.md`

**Interfaces:**

- Consumes: `npm run build` (Task 5) and `npm run games:verify`.
- Produces: a live Worker `biokea-games` on every push to `main`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run check
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - name: Upload Playwright report on failure
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  deploy:
    needs: test
    if: (github.event_name == 'push' || github.event_name == 'workflow_dispatch') && github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment:
      name: production
      url: https://games.biokea.ai
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - name: Build (clones + builds the six BioKEA/game-* repos, then astro build)
        run: npm run build
        env:
          # scripts/build-games.mjs clones the per-game repos. They are
          # public, so the default per-run token is sufficient.
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # Shared Supabase project for the @biokea/leaderboard client.
          # Injected only into LEADERBOARD_ENABLED games by build-games.mjs.
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
      - name: Verify every game bundle carries the rewritten injections
        run: npm run games:verify
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

- [ ] **Step 2: Write the README**

`README.md`:

````markdown
# BioKEA Games — games.biokea.ai

The six BioKEA browser games, their daily leaderboard, and the shared
handle picker. Astro v6 on a Cloudflare Worker. Game code lives in the
`BioKEA/game-*` repos; this repo builds them into `public/<slug>/` at
deploy time and serves them at `https://games.biokea.ai/<slug>/`.

## Run locally

```bash
npm install
npm run games:build    # clones + builds the six games (needs `gh auth login` or GITHUB_TOKEN)
npm run dev            # http://localhost:4321
```

`/api/handle-check` needs `SUPABASE_SERVICE_ROLE_KEY` in `.dev.vars`
(see `.dev.vars.example`); without it the handle picker reports
"Handle check is not configured."

## Test

```bash
npm run check          # astro check
npm test               # vitest (scripts/verify-games)
npm run test:e2e       # playwright
```

## Deploy

Pushes to `main` run `.github/workflows/deploy.yml`: test → build (games +
astro) → `games:verify` → `wrangler deploy` of the `biokea-games` Worker.

Repo secrets (Settings → Secrets → Actions): `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — same
values as `BioKEA/website-biokea`.

Worker secret, once: `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`.

Custom domain, once: Cloudflare dashboard → Workers & Pages →
`biokea-games` → Settings → Domains & Routes → Add → Custom domain
`games.biokea.ai`. Cloudflare creates the DNS record.

## Adding a game

1. Add an entry to `src/data/games.ts` (slug, title, tagline, thumb, `playUrl: '/<slug>/'`, repo).
2. If it posts scores: insert a `ranked_modes` row, add it to `LEADERBOARD_GAMES`
   in `src/data/leaderboard-games.ts`, and to `LEADERBOARD_ENABLED` in
   `scripts/build-games.mjs`.
3. Drop a 1200×675 thumbnail in `public/assets/games/`.
````

- [ ] **Step 3: Lint, commit, push**

```bash
npm run format && npm run lint
git add -A
git commit -m "ci: deploy biokea-games Worker on push to main; document setup"
git push
```

- [ ] **Step 4: Set repo secrets and the Worker secret**

These values are not readable from `website-biokea`'s secrets — the user supplies them. Run, pasting each value when prompted:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo BioKEA/games-site
gh secret set CLOUDFLARE_ACCOUNT_ID --repo BioKEA/games-site
gh secret set SUPABASE_URL --repo BioKEA/games-site
gh secret set SUPABASE_PUBLISHABLE_KEY --repo BioKEA/games-site
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # requires `npx wrangler login` first
```

If you cannot obtain the values, stop here and hand the four `gh secret set` lines and the `wrangler secret put` line to the user.

- [ ] **Step 5: Trigger the deploy and watch it**

```bash
gh workflow run deploy.yml --repo BioKEA/games-site --ref main
gh run watch --repo BioKEA/games-site
```

Expected: `test` and `deploy` both green. Note the `*.workers.dev` URL wrangler prints in the deploy log.

- [ ] **Step 6: Attach the custom domain**

Manual: Cloudflare dashboard → Workers & Pages → `biokea-games` → Settings → Domains & Routes → Add → Custom domain → `games.biokea.ai`. Wait for the certificate to become active (usually a minute or two).

---

### Task 7: Live verification (gate for Part B)

**Files:** none.

- [ ] **Step 1: Verify the routes**

```bash
for p in / /leaderboard /codon2048/ /pipette-rush/ /plasmid-plinko/ /particle-survival-shooter/ /cal-field-lab-collectible/ /3d-biodiversity-collect-em-all/ "/api/handle-check?handle=DrBio" "/api/handle-check?handle=bad%20one"; do
  printf "%-45s %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' "https://games.biokea.ai$p")"
done
```

Expected: every page and bundle `200`; `handle=DrBio` → `200`; `handle=bad one` → `400`. If `DrBio` returns `500`, the Worker secret from Task 6 Step 4 is missing.

- [ ] **Step 2: Verify the injections on the live bundle**

```bash
curl -s https://games.biokea.ai/codon2048/ | grep -o '<a href="[^"]*" id="biokea-back"'
curl -s https://games.biokea.ai/codon2048/ | grep -o '<a href="[^"]*" id="biokea-subscribe"'
```

Expected: `<a href="/" id="biokea-back"` and `<a href="https://biokea.ai/subscribe?source=codon2048" id="biokea-subscribe"`.

- [ ] **Step 3: Play-test in a browser**

Open `https://games.biokea.ai/`, pick a handle, open Codon Collider, play until the score prompt appears and confirm it offers "Save score as <handle>?" (the games read `biokea:player:handle` from the shared origin). Open `/leaderboard` and confirm today's tab loads rows or "be first".

Only when Steps 1–3 pass, proceed to Part B.

---

# Part B — `website-biokea` removal (Tasks 8–10)

Work in `website-biokea` on a branch `games-subdomain` created from `main` (use `superpowers:using-git-worktrees`).

### Task 8: Remove the games surface and the games prebuild

**Files:**

- Delete: `src/pages/mission/games.astro`, `src/pages/mission/games/leaderboard.astro`, `src/components/games/HandlePicker.astro`, `src/pages/api/handle-check.ts`, `src/data/games.ts`, `src/data/leaderboard-games.ts`, `scripts/build-games.mjs`, `public/assets/games/` (6 thumbnails), `tests/e2e/mission-games.spec.ts`
- Modify: `package.json`, `.github/workflows/deploy.yml`, `.gitignore`, `.dockerignore`, `src/components/layout/Nav.astro`
- Test: `tests/e2e/nav.spec.ts`

**Interfaces:**

- Produces: nav About ▾ "Games" → `https://games.biokea.ai`; `/mission/games`, `/mission/games/leaderboard`, `/api/handle-check` return 404; `npm run build` = `astro build`.

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/nav.spec.ts`, in the test `'"About" dropdown reveals Mission, Projects, Works, Press, and Games'`, change the Games assertion from

```ts
await expect(desktop.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
  'href',
  '/mission/games',
);
```

to

```ts
await expect(desktop.getByRole('link', { name: 'Games', exact: true })).toHaveAttribute(
  'href',
  'https://games.biokea.ai',
);
```

Append to the same file:

```ts
test('the games surface has moved off this origin', async ({ page }) => {
  for (const path of [
    '/mission/games',
    '/mission/games/leaderboard',
    '/api/handle-check?handle=x',
  ]) {
    const res = await page.goto(path);
    expect(res?.status(), `${path} should be gone`).toBe(404);
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test nav.spec.ts`
Expected: FAIL — Games href is still `/mission/games`; the three routes still respond 200.

- [ ] **Step 3: Delete the files**

```bash
git rm src/pages/mission/games.astro src/pages/mission/games/leaderboard.astro \
  src/components/games/HandlePicker.astro src/pages/api/handle-check.ts \
  src/data/games.ts src/data/leaderboard-games.ts scripts/build-games.mjs \
  tests/e2e/mission-games.spec.ts
git rm -r public/assets/games
```

Verify nothing else imports them: `grep -rn "data/games\|leaderboard-games\|HandlePicker\|build-games" src/ scripts/ tests/ package.json` → only the `package.json` `build`/`games:build` lines, fixed next.

- [ ] **Step 4: Drop the prebuild and the games env from CI**

In `package.json`:

- `"build": "node scripts/build-games.mjs && astro build"` → `"build": "astro build"`
- delete the line `"games:build": "node scripts/build-games.mjs",`

In `.github/workflows/deploy.yml`, replace the build step

```yaml
- name: Build site (incl. cloning + building 6 games from BioKEA/game-* repos)
  run: npm run build
  env:
    # scripts/build-games.mjs reads GITHUB_TOKEN to clone the per-game
    # repos. All BioKEA/game-* repos (and games-leaderboard-js) are
    # public, so the default per-run GH Actions token is sufficient —
    # any authenticated request can read public repos.
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    # Shared Supabase project for the @biokea/leaderboard client.
    # build-games.mjs only injects these into LEADERBOARD_ENABLED games
    # (codon2048, pipette-rush, plasmid-plinko, particle-survival-shooter);
    # the other two ship with stub env so leaderboards no-op.
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}
    # Cloudflare Turnstile site key — public, baked into the client
```

with

```yaml
- name: Build site
  run: npm run build
  env:
    # Cloudflare Turnstile site key — public, baked into the client
```

(The remaining `PUBLIC_TURNSTILE_SITE_KEY` lines under that comment stay.)

In `.gitignore` delete the line `/public/mission/games/`. In `.dockerignore` delete the line `public/mission/games`.

- [ ] **Step 5: Point the nav at the new origin**

In `src/components/layout/Nav.astro`, change

```ts
      { href: '/mission/games', label: 'Games' },
```

to

```ts
      { href: 'https://games.biokea.ai', label: 'Games' },
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx playwright test nav.spec.ts
npm run check
```

Expected: nav suite passes (including the new 404 test); 0 check errors. If `astro check` reports an unresolved import, something still references a deleted module — fix that, don't restore the file.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(games): move the games surface to games.biokea.ai; drop the games prebuild"
```

---

### Task 9: Update copy, docs, and comments that named `/mission/games/`

**Files:**

- Modify: `src/pages/subscribe.astro`, `src/pages/api/subscribe.ts`, `src/pages/privacy.astro`, `wrangler.toml`, `CLAUDE.md`
- Test: `tests/e2e/privacy.spec.ts`

**Interfaces:** none.

- [ ] **Step 1: Write the failing test**

Append to `tests/e2e/privacy.spec.ts`:

```ts
test('privacy policy points at games.biokea.ai, not the retired /mission/games path', async ({
  page,
}) => {
  await page.goto('/privacy');
  await expect(page.locator('main a[href="/mission/games/"]')).toHaveCount(0);
  await expect(page.locator('main a[href="https://games.biokea.ai/"]').first()).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test privacy.spec.ts`
Expected: FAIL — the subscription clause still links to `/mission/games/`.

- [ ] **Step 3: Apply the copy edits**

`src/pages/privacy.astro` — in the "Lab-updates subscription" list item, replace

```astro
<a href="/mission/games/">/mission/games/</a>):</strong
```

with

```astro
<a href="https://games.biokea.ai/">games.biokea.ai</a>):</strong
```

and in the "Game scores" item, change `if you submit a score from one of our four leaderboard games,` to `if you submit a score from one of our four leaderboard games at games.biokea.ai,`. Bump `const lastUpdated = '2026-08-16';` to the date you make this change.

`src/pages/subscribe.astro` — replace

```astro
<a href="/mission/games/" class="text-[var(--color-teal)] underline">/mission/games/</a>, a
```

with

```astro
<a href="https://games.biokea.ai/" class="text-[var(--color-teal)] underline">games.biokea.ai</a>, a
```

`src/pages/api/subscribe.ts`:

- line 3 comment: `// Opt-in endpoint for the "Lab updates" form on /mission/games/,` → `// Opt-in endpoint for the "Lab updates" form on /subscribe (linked from games.biokea.ai),`
- the comment mentioning `/mission/games/ leaderboard panel already use` → `the games.biokea.ai leaderboard panel already uses`
- welcome-email text line `` `  · new game drops on biokea.ai/mission/games/`, `` → `` `  · new game drops on games.biokea.ai`, ``
- welcome-email HTML `<li>new game drops on <a href="https://biokea.ai/mission/games/">biokea.ai/mission/games/</a></li>` → `<li>new game drops on <a href="https://games.biokea.ai/">games.biokea.ai</a></li>`

`wrangler.toml` — the `SUPABASE_PUBLISHABLE_KEY` comment `the /mission/games/ Game Leaderboard panel` → `the games.biokea.ai leaderboard (BioKEA/games-site)`.

`CLAUDE.md` — replace the two "Repo basics" lines

```markdown
- Built-in games at `/mission/games/<slug>/` are cloned + built from
  `BioKEA/game-<slug>` repos by `scripts/build-games.mjs`
```

with

```markdown
- The six games live at games.biokea.ai, built and deployed by
  `BioKEA/games-site` from the `BioKEA/game-<slug>` repos
```

`README.md` — at `3629438` it has no games mentions (`grep -ci game README.md` → 0); nothing to change unless one has since been added.

- [ ] **Step 4: Verify and run tests**

```bash
grep -rn "mission/games\|build-games" src/ scripts/ tests/ wrangler.toml CLAUDE.md README.md package.json .github/
npx playwright test privacy.spec.ts subscribe.spec.ts 2>/dev/null || npx playwright test privacy.spec.ts
npm run check
```

Expected: grep → no matches; tests pass; 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: point subscribe/privacy/docs at games.biokea.ai"
```

---

### Task 10: Full verification sweep

**Files:** none (plus a possible lint-fix commit).

- [ ] **Step 1: Confirm nothing games-related remains in live code**

```bash
grep -rn -i "mission/games\|handle-check\|HandlePicker\|leaderboard-games\|build-games" src/ public/ scripts/ tests/ .github/ package.json
```

Expected: only `tests/e2e/nav.spec.ts` (the 404 guard) and `tests/e2e/privacy.spec.ts` (the link guard).

- [ ] **Step 2: Type-check, unit, lint**

```bash
npm run check
npm test
npm run lint || (npm run format && npm run lint)
```

Expected: 0 errors; all unit tests pass; lint clean.

- [ ] **Step 3: Full e2e**

Run: `npm run test:e2e`
Expected: all pass.

- [ ] **Step 4: Build timing**

Run: `time npm run build`
Expected: completes without cloning anything (no `[games-build]` lines) — well under the previous 3–4 minutes.

- [ ] **Step 5: Manual spot-check**

With `npm run dev` running: nav About ▾ → Games opens `https://games.biokea.ai`; `/mission/games` is a 404; `/privacy` and `/subscribe` link to games.biokea.ai.

- [ ] **Step 6: Commit lint fixes if any, then finish the branch**

```bash
git add -u && git commit -m "chore: lint fixes from games subdomain move" || true
```

Then use `superpowers:finishing-a-development-branch` to merge `games-subdomain` into `main`. Pushing `main` triggers the (now faster) biokea.ai deploy.
