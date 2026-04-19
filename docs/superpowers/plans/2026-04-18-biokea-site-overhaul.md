# BioKEA Site Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing Next.js 13 biokea.ai site with an Astro 5 + Tailwind 4 rebuild matching the approved design spec — 5-page narrative IA, α+β cream editorial visual system, existing artwork integrated, Cloudflare Workers deploy preserved.

**Architecture:** Astro 5 with content collections (MDX pages) and typed TypeScript data files, Tailwind 4 CSS-first theming driven by design tokens, `@astrojs/cloudflare` adapter for hybrid static + one server endpoint (contact form). Build outputs to `dist/`; `wrangler.toml` updated to serve from that path.

**Tech Stack:** Astro 5 · Tailwind 4 · TypeScript 5 · MDX · Vitest · Playwright · Cloudflare Workers · Resend (email) · Zod (content schema)

**Spec reference:** `docs/superpowers/specs/2026-04-18-biokea-site-overhaul-design.md`

---

## File structure (target)

```
website-biokea/
├── astro.config.mjs                         (new — Astro config + integrations)
├── package.json                             (rewritten — Astro deps, scripts)
├── tsconfig.json                            (rewritten — Astro preset)
├── wrangler.toml                            (modified — serve dist/, compat date)
├── playwright.config.ts                     (new)
├── vitest.config.ts                         (new)
├── public/
│   └── assets/images/                       (existing + new recolored + warehouse photos)
├── src/
│   ├── layouts/BaseLayout.astro             (Nav + slot + Footer)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Nav.astro
│   │   │   ├── Footer.astro
│   │   │   └── Seo.astro
│   │   ├── sections/
│   │   │   ├── Hero.astro
│   │   │   ├── Thesis.astro
│   │   │   ├── Evidence.astro
│   │   │   ├── Ecosystem.astro
│   │   │   ├── Origin.astro
│   │   │   └── CtaBand.astro
│   │   └── ui/
│   │       ├── Eyebrow.astro
│   │       ├── StatPill.astro
│   │       ├── PhotoCard.astro
│   │       ├── Portrait.astro
│   │       ├── PipelineStep.astro
│   │       └── PartnerMark.astro
│   ├── content/
│   │   ├── config.ts                        (Zod schemas for MDX frontmatter)
│   │   └── pages/
│   │       ├── home.mdx
│   │       ├── lab.mdx
│   │       ├── pipeline.mdx
│   │       ├── mission.mdx
│   │       └── contact.mdx
│   ├── data/
│   │   ├── team.ts
│   │   ├── partners.ts
│   │   ├── pipeline.ts
│   │   ├── milestones.ts
│   │   └── stats.ts
│   ├── styles/
│   │   ├── tokens.css                       (design tokens — CSS custom properties)
│   │   └── global.css                       (Tailwind entry + base layer)
│   └── pages/
│       ├── index.astro
│       ├── lab.astro
│       ├── pipeline.astro
│       ├── mission.astro
│       ├── contact.astro
│       ├── 404.astro
│       └── api/contact.ts                   (server endpoint → Resend)
└── tests/
    ├── e2e/
    │   ├── home.spec.ts
    │   ├── lab.spec.ts
    │   ├── pipeline.spec.ts
    │   ├── mission.spec.ts
    │   └── contact.spec.ts
    └── unit/
        ├── contact-form.test.ts
        ├── content-data.test.ts
        └── nav.test.ts
```

**Removed at end of plan:**
`next.config.js`, `next-env.d.ts`, old `src/pages/*.tsx`, `src/components/*.tsx` (existing), `src/data/features.ts`, `src/pages/api/contact.ts` (old), `workers-site/`, `postcss.config.js`, old `tailwind.config.js`, unused deps, `out/`.

---

## Phase 1 — Scaffold

### Task 1: Snapshot the current repo state on a new branch

**Files:**

- None (git operation)

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/site-overhaul
git status
```

Expected: clean working tree on `feat/site-overhaul`.

- [ ] **Step 2: Commit the branch marker**

```bash
git commit --allow-empty -m "chore: start site overhaul branch"
```

---

### Task 2: Add Astro dependencies and replace scripts

**Files:**

- Modify: `package.json` (rewrite)

- [ ] **Step 1: Replace `package.json`**

```json
{
  "name": "biokea-website",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "prettier --check \"src/**/*.{astro,ts,tsx,md,mdx,css}\"",
    "format": "prettier --write \"src/**/*.{astro,ts,tsx,md,mdx,css}\"",
    "prepare": "husky"
  },
  "lint-staged": {
    "*.{astro,ts,tsx,md,mdx,json,css}": ["prettier --write"]
  },
  "dependencies": {
    "@astrojs/cloudflare": "^11.0.0",
    "@astrojs/mdx": "^3.1.0",
    "@astrojs/sitemap": "^3.2.0",
    "@tailwindcss/vite": "^4.0.0",
    "astro": "^5.0.0",
    "resend": "^4.0.0",
    "tailwindcss": "^4.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@fontsource/inter": "^5.1.0",
    "@fontsource/jetbrains-mono": "^5.1.0",
    "@playwright/test": "^1.48.0",
    "@types/node": "^22.0.0",
    "husky": "^9.1.7",
    "lint-staged": "^16.2.7",
    "prettier": "^3.8.1",
    "prettier-plugin-astro": "^0.14.0",
    "typescript": "^5.9.3",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
rm -rf node_modules package-lock.json
npm install
```

Expected: `node_modules/astro` exists; no peer-dep errors.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: switch package.json to Astro stack"
```

---

### Task 3: Create Astro config with Cloudflare adapter and integrations

**Files:**

- Create: `astro.config.mjs`

- [ ] **Step 1: Write the config**

```js
// astro.config.mjs
import { defineConfig } from 'astro/config'
import cloudflare from '@astrojs/cloudflare'
import mdx from '@astrojs/mdx'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://biokea.ai',
  output: 'server',
  adapter: cloudflare({
    platformProxy: { enabled: true },
  }),
  integrations: [mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    prefetchAll: false,
    defaultStrategy: 'hover',
  },
})
```

- [ ] **Step 2: Verify Astro starts**

```bash
npx astro --version
```

Expected: prints `5.x.y`.

- [ ] **Step 3: Commit**

```bash
git add astro.config.mjs
git commit -m "chore: add Astro config with Cloudflare adapter, MDX, sitemap, Tailwind 4"
```

---

### Task 4: Replace tsconfig.json and add env.d.ts

**Files:**

- Modify: `tsconfig.json` (rewrite)
- Create: `src/env.d.ts`

- [ ] **Step 1: Rewrite `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "jsx": "preserve",
    "types": ["astro/client"]
  },
  "include": [".astro/types.d.ts", "src/**/*", "astro.config.mjs"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 2: Create `src/env.d.ts`**

```ts
/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string
  readonly CONTACT_FROM_EMAIL: string
  readonly CONTACT_TO_EMAIL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 3: Commit**

```bash
git add tsconfig.json src/env.d.ts
git commit -m "chore: configure strict TypeScript for Astro"
```

---

### Task 5: Verify the stack boots

**Files:**

- Create: `src/pages/index.astro` (temporary smoke page)

- [ ] **Step 1: Write a placeholder page**

```astro
---
// src/pages/index.astro
---
<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>BioKEA — scaffold</title></head>
  <body><h1>BioKEA scaffold OK</h1></body>
</html>
```

- [ ] **Step 2: Run dev server in the background and hit it**

```bash
npm run dev &
sleep 3
curl -s http://localhost:4321/ | grep -c "scaffold OK"
kill %1
```

Expected: prints `1` (page rendered, title matched).

- [ ] **Step 3: Commit**

```bash
git add src/pages/index.astro
git commit -m "chore: verify Astro scaffold renders"
```

---

## Phase 2 — Design tokens, layout, Nav, Footer, Seo

### Task 6: Define design tokens as CSS custom properties

**Files:**

- Create: `src/styles/tokens.css`

- [ ] **Step 1: Write the tokens**

```css
/* src/styles/tokens.css — design tokens per spec §4 */
@theme {
  /* Backgrounds */
  --color-cream: #f3efe6;
  --color-cream-warm: #f6f2e9;

  /* Surfaces */
  --color-ink: #0b1f1a;
  --color-ink-soft: #06111a;

  /* Text */
  --color-slate: #475569;
  --color-slate-soft: #64748b;

  /* Accents */
  --color-teal: #0f766e;
  --color-teal-bright: #5eead4;

  /* Signal — reserved for live/novel/active only */
  --color-pink: #be185d;
  --color-pink-soft: #fbcfe8;

  /* Warm */
  --color-ochre: #92400e;

  /* Grid line */
  --color-grid: rgba(30, 41, 59, 0.04);

  /* Fonts */
  --font-sans: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;

  /* Radii */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 14px;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tokens.css
git commit -m "feat(design): add tokens.css with spec palette, fonts, radii"
```

---

### Task 7: Create Tailwind entry and global styles

**Files:**

- Create: `src/styles/global.css`

- [ ] **Step 1: Write the entry**

```css
/* src/styles/global.css */
@import 'tailwindcss';
@import './tokens.css';
@import '@fontsource/inter/400.css';
@import '@fontsource/inter/500.css';
@import '@fontsource/inter/600.css';
@import '@fontsource/inter/700.css';
@import '@fontsource/jetbrains-mono/500.css';
@import '@fontsource/jetbrains-mono/600.css';

@layer base {
  html {
    font-family: var(--font-sans);
    color: var(--color-ink);
    background: var(--color-cream);
    -webkit-font-smoothing: antialiased;
  }

  body {
    background-image:
      linear-gradient(var(--color-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--color-grid) 1px, transparent 1px);
    background-size: 24px 24px;
    min-height: 100vh;
  }

  ::selection {
    background: var(--color-teal);
    color: var(--color-cream);
  }

  a {
    color: inherit;
    text-decoration: none;
  }
}

@utility font-mono-label {
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 0.688rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--color-teal);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/global.css
git commit -m "feat(design): Tailwind 4 entry + base layer + blueprint grid"
```

---

### Task 8: Base layout (BaseLayout.astro)

**Files:**

- Create: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/layouts/BaseLayout.astro
import '@/styles/global.css';
import Nav from '@/components/layout/Nav.astro';
import Footer from '@/components/layout/Footer.astro';
import Seo from '@/components/layout/Seo.astro';

interface Props {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}
const { title, description, ogImage, canonical } = Astro.props;
---

<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.ico" />
    <Seo title={title} description={description} ogImage={ogImage} canonical={canonical} />
  </head>
  <body>
    <a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:bg-[var(--color-ink)] focus:text-[var(--color-cream)] focus:p-2 focus:rounded">Skip to content</a>
    <Nav />
    <main id="main"><slot /></main>
    <Footer />
  </body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(layout): add BaseLayout with Nav/Footer/Seo slots and skip link"
```

---

### Task 9: Seo component

**Files:**

- Create: `src/components/layout/Seo.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/layout/Seo.astro
interface Props {
  title: string;
  description: string;
  ogImage?: string;
  canonical?: string;
}
const { title, description, ogImage = '/assets/images/logo2.png', canonical } = Astro.props;
const fullTitle = title.startsWith('BioKEA') ? title : `${title} — BioKEA`;
const canonicalUrl = canonical ?? new URL(Astro.url.pathname, Astro.site).toString();
const ogUrl = new URL(ogImage, Astro.site).toString();
---

<title>{fullTitle}</title>
<meta name="description" content={description} />
<link rel="canonical" href={canonicalUrl} />

<meta property="og:type" content="website" />
<meta property="og:site_name" content="BioKEA" />
<meta property="og:title" content={fullTitle} />
<meta property="og:description" content={description} />
<meta property="og:url" content={canonicalUrl} />
<meta property="og:image" content={ogUrl} />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content={fullTitle} />
<meta name="twitter:description" content={description} />
<meta name="twitter:image" content={ogUrl} />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/Seo.astro
git commit -m "feat(seo): add Seo component for title, OG, canonical, Twitter meta"
```

---

### Task 10: Nav component — write Playwright smoke test first (TDD)

**Files:**

- Create: `tests/e2e/nav.spec.ts`

- [ ] **Step 1: Install Playwright**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 2: Create Playwright config**

Create `playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    port: 4321,
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
```

- [ ] **Step 3: Write the failing Nav smoke test**

```ts
// tests/e2e/nav.spec.ts
import { test, expect } from '@playwright/test'

test('nav renders logo and all primary links', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Primary' })
  await expect(nav).toBeVisible()
  await expect(nav.getByRole('link', { name: 'BioKEA' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Lab' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Pipeline' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Mission' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Contact' })).toBeVisible()
  await expect(nav.getByRole('link', { name: /agentis\.science/ })).toHaveAttribute(
    'href',
    'https://agentis.science'
  )
})

test('mobile nav toggle opens menu', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  const toggle = page.getByRole('button', { name: /menu/i })
  await expect(toggle).toBeVisible()
  await toggle.click()
  await expect(page.getByRole('link', { name: 'Lab' })).toBeVisible()
})
```

- [ ] **Step 4: Run it — expect failure**

```bash
npm run test:e2e -- nav.spec.ts
```

Expected: FAIL — nav element not found (component doesn't exist).

- [ ] **Step 5: Commit the failing test**

```bash
git add playwright.config.ts tests/e2e/nav.spec.ts
git commit -m "test(nav): failing smoke tests for primary nav and mobile toggle"
```

---

### Task 11: Implement Nav component

**Files:**

- Create: `src/components/layout/Nav.astro`

- [ ] **Step 1: Write the Nav**

```astro
---
// src/components/layout/Nav.astro
const links = [
  { href: '/lab', label: 'Lab' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/mission', label: 'Mission' },
  { href: '/contact', label: 'Contact' },
];
---

<nav aria-label="Primary" class="bg-[var(--color-ink)] text-[var(--color-cream)]">
  <div class="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
    <a href="/" aria-label="BioKEA home" class="flex items-center gap-3">
      <img src="/assets/images/logo2.png" alt="BioKEA" class="h-7 w-auto invert brightness-110" />
      <span class="sr-only">BioKEA</span>
    </a>

    <ul class="hidden md:flex gap-7 text-sm font-medium text-slate-300 tracking-wide">
      {links.map((l) => (
        <li><a href={l.href} class="hover:text-[var(--color-teal-bright)] transition">{l.label}</a></li>
      ))}
      <li>
        <a href="https://agentis.science" class="text-[var(--color-teal-bright)]" rel="noopener">
          agentis.science ↗
        </a>
      </li>
    </ul>

    <button
      type="button"
      id="nav-toggle"
      aria-label="Open menu"
      aria-expanded="false"
      aria-controls="mobile-menu"
      class="md:hidden text-[var(--color-cream)] p-2"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="18" x2="21" y2="18" />
      </svg>
    </button>
  </div>

  <div id="mobile-menu" class="md:hidden hidden border-t border-slate-800">
    <ul class="flex flex-col gap-1 px-6 py-4 text-sm">
      {links.map((l) => (
        <li><a href={l.href} class="block py-2">{l.label}</a></li>
      ))}
      <li>
        <a href="https://agentis.science" class="block py-2 text-[var(--color-teal-bright)]" rel="noopener">
          agentis.science ↗
        </a>
      </li>
    </ul>
  </div>
</nav>

<script>
  const toggle = document.getElementById('nav-toggle');
  const menu = document.getElementById('mobile-menu');
  toggle?.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    toggle.setAttribute('aria-label', expanded ? 'Open menu' : 'Close menu');
    menu?.classList.toggle('hidden');
  });
</script>
```

- [ ] **Step 2: Update placeholder index.astro to use BaseLayout**

Replace `src/pages/index.astro` with:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
---
<BaseLayout title="BioKEA" description="Biology, decoded in the public interest.">
  <div style="min-height: 50vh; padding: 3rem;">scaffold</div>
</BaseLayout>
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npm run test:e2e -- nav.spec.ts
```

Expected: 2 passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Nav.astro src/pages/index.astro
git commit -m "feat(nav): implement primary nav with mobile toggle, tests pass"
```

---

### Task 12: Footer component

**Files:**

- Create: `src/components/layout/Footer.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/layout/Footer.astro
const year = new Date().getFullYear();
---

<footer class="bg-[var(--color-ink)] text-slate-400 mt-24">
  <div class="max-w-6xl mx-auto px-6 py-10 flex flex-col md:flex-row justify-between gap-6 text-xs">
    <div class="flex items-center gap-3">
      <img src="/assets/images/logo2.png" alt="BioKEA" class="h-5 w-auto invert brightness-110" />
      <span>© {year} BioKEA · Berkeley, CA</span>
    </div>
    <ul class="flex gap-5">
      <li><a href="https://bsky.app/profile/biokea.bsky.social" rel="noopener">Bluesky</a></li>
      <li><a href="https://github.com/biokea" rel="noopener">GitHub</a></li>
      <li><a href="/contact">Contact</a></li>
      <li><a href="https://agentis.science" class="text-[var(--color-teal-bright)]" rel="noopener">agentis.science ↗</a></li>
    </ul>
  </div>
</footer>
```

- [ ] **Step 2: Add Playwright smoke**

Append to `tests/e2e/nav.spec.ts`:

```ts
test('footer renders logo, copyright, and external links', async ({ page }) => {
  await page.goto('/')
  const footer = page.locator('footer')
  await expect(footer).toBeVisible()
  await expect(footer.getByText(/© \d{4} BioKEA · Berkeley, CA/)).toBeVisible()
  await expect(footer.getByRole('link', { name: /agentis\.science/ })).toHaveAttribute(
    'href',
    'https://agentis.science'
  )
})
```

- [ ] **Step 3: Run, expect pass**

```bash
npm run test:e2e -- nav.spec.ts
```

Expected: 3 passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/Footer.astro tests/e2e/nav.spec.ts
git commit -m "feat(footer): site footer + smoke test"
```

---

## Phase 3 — UI primitives

### Task 13: Eyebrow + StatPill

**Files:**

- Create: `src/components/ui/Eyebrow.astro`
- Create: `src/components/ui/StatPill.astro`

- [ ] **Step 1: Write Eyebrow**

```astro
---
// src/components/ui/Eyebrow.astro
interface Props { class?: string; }
const { class: klass = '' } = Astro.props;
---
<p class:list={['font-mono-label', klass]}><slot /></p>
```

- [ ] **Step 2: Write StatPill**

```astro
---
// src/components/ui/StatPill.astro
interface Props {
  value: string;
  label: string;
  live?: boolean;
}
const { value, label, live = false } = Astro.props;
const tone = live
  ? 'bg-[rgba(190,24,93,0.08)] border-l-[var(--color-pink)]'
  : 'bg-[rgba(15,118,110,0.08)] border-l-[var(--color-teal)]';
const numColor = live ? 'text-[#831843]' : 'text-[var(--color-ink)]';
---
<div class:list={[tone, 'border-l-2 pl-3 pr-3 py-2 rounded-r-sm']}>
  <div class:list={[numColor, 'font-mono font-bold text-lg leading-tight']}>{value}</div>
  <div class="font-mono text-[0.625rem] tracking-[0.1em] uppercase text-slate-600 mt-0.5">{label}</div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/Eyebrow.astro src/components/ui/StatPill.astro
git commit -m "feat(ui): Eyebrow + StatPill primitives"
```

---

### Task 14: PhotoCard + Portrait

**Files:**

- Create: `src/components/ui/PhotoCard.astro`
- Create: `src/components/ui/Portrait.astro`

- [ ] **Step 1: Write PhotoCard**

```astro
---
// src/components/ui/PhotoCard.astro
interface Props {
  src: string;
  alt: string;
  caption?: string;
  liveLabel?: string;
  class?: string;
}
const { src, alt, caption, liveLabel, class: klass = '' } = Astro.props;
---
<figure class:list={['relative rounded-sm overflow-hidden border border-black/10', klass]}>
  <img src={src} alt={alt} class="w-full h-full object-cover block" loading="lazy" />
  {caption && (
    <figcaption class="absolute bottom-2 left-2 bg-black/45 text-[var(--color-cream)] px-2 py-1 rounded-sm font-mono text-[10px] tracking-[0.12em] uppercase">
      {caption}
    </figcaption>
  )}
  {liveLabel && (
    <span class="absolute top-2 right-2 bg-[var(--color-pink)] text-[var(--color-pink-soft)] px-2 py-1 rounded-sm font-mono text-[9px] font-semibold tracking-[0.16em] uppercase">
      {liveLabel}
    </span>
  )}
</figure>
```

- [ ] **Step 2: Write Portrait**

```astro
---
// src/components/ui/Portrait.astro
interface Props {
  src: string;
  alt: string;
  name: string;
  role: string;
}
const { src, alt, name, role } = Astro.props;
---
<article class="bg-[var(--color-cream)] border border-[rgba(120,53,15,0.15)] rounded-sm p-3">
  <img src={src} alt={alt} class="w-full rounded-[2px] block" loading="lazy" />
  <p class="font-semibold text-sm mt-2 text-[var(--color-ink)]">{name}</p>
  <p class="font-mono text-[10px] tracking-[0.1em] uppercase text-[var(--color-teal)] mt-1">{role}</p>
</article>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PhotoCard.astro src/components/ui/Portrait.astro
git commit -m "feat(ui): PhotoCard + Portrait primitives"
```

---

### Task 15: PipelineStep + PartnerMark

**Files:**

- Create: `src/components/ui/PipelineStep.astro`
- Create: `src/components/ui/PartnerMark.astro`

- [ ] **Step 1: Write PipelineStep**

```astro
---
// src/components/ui/PipelineStep.astro
interface Props {
  number: string;
  title: string;
  subtitle?: string;
}
const { number, title, subtitle } = Astro.props;
---
<div class="bg-white/70 border border-slate-900/10 rounded-md px-3 py-3 text-center">
  <div class="font-mono text-[9px] tracking-[0.12em] text-[var(--color-teal)]">{number}</div>
  <div class="font-semibold text-xs mt-1 text-[var(--color-ink)]">{title}</div>
  {subtitle && <div class="text-[10px] text-slate-500 mt-1">{subtitle}</div>}
</div>
```

- [ ] **Step 2: Write PartnerMark**

```astro
---
// src/components/ui/PartnerMark.astro
interface Props {
  name: string;
  note?: string;
}
const { name, note } = Astro.props;
---
<div class="inline-flex items-center gap-2 px-3 py-1.5 bg-white/60 border border-slate-900/10 rounded-sm">
  <span class="font-medium text-[13px] text-slate-700">{name}</span>
  {note && <span class="font-mono text-[10px] text-slate-500">{note}</span>}
</div>
```

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/PipelineStep.astro src/components/ui/PartnerMark.astro
git commit -m "feat(ui): PipelineStep + PartnerMark primitives"
```

---

## Phase 4 — Section components

### Task 16: Hero section

**Files:**

- Create: `src/components/sections/Hero.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/Hero.astro
import Eyebrow from '@/components/ui/Eyebrow.astro';

interface Props {
  eyebrow: string;
  headline: string;
  subheadline: string;
  ctaPrimary: { href: string; label: string };
  ctaSecondary: { href: string; label: string };
  badgeImage?: string;
  badgeAlt?: string;
  badgeCaption?: string;
}
const { eyebrow, headline, subheadline, ctaPrimary, ctaSecondary, badgeImage, badgeAlt, badgeCaption } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6 pt-16 pb-10">
  <div class="grid md:grid-cols-[1.4fr_1fr] gap-10 items-center">
    <div>
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 class="text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] mt-3 max-w-[18ch]">
        {headline}
      </h1>
      <p class="mt-4 text-slate-600 max-w-[58ch] leading-relaxed">{subheadline}</p>
      <div class="mt-6 flex items-center gap-4">
        <a href={ctaPrimary.href} class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium">
          {ctaPrimary.label}
        </a>
        <a href={ctaSecondary.href} class="text-[var(--color-teal)] text-sm font-medium">
          {ctaSecondary.label} →
        </a>
      </div>
    </div>
    {badgeImage && (
      <figure class="relative">
        <img src={badgeImage} alt={badgeAlt ?? ''} class="w-full max-w-[320px] rounded-md shadow-[0_8px_30px_rgba(11,31,26,0.15)] ml-auto block" />
        {badgeCaption && (
          <figcaption class="absolute bottom-3 left-3 bg-black/45 text-[var(--color-cream)] px-2 py-1 rounded-sm font-mono text-[10px] tracking-[0.12em]">
            {badgeCaption}
          </figcaption>
        )}
      </figure>
    )}
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Hero.astro
git commit -m "feat(section): Hero"
```

---

### Task 17: Thesis section

**Files:**

- Create: `src/components/sections/Thesis.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/Thesis.astro
import Eyebrow from '@/components/ui/Eyebrow.astro';

interface Props {
  eyebrow: string;
  quote: string;
  attribution?: string;
}
const { eyebrow, quote, attribution } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6 py-16">
  <Eyebrow>{eyebrow}</Eyebrow>
  <blockquote class="mt-5 text-2xl md:text-3xl font-medium tracking-[-0.012em] leading-[1.3] text-[var(--color-ink)] max-w-[40ch]">
    {quote}
  </blockquote>
  {attribution && <p class="mt-4 text-xs text-slate-500 font-medium">{attribution}</p>}
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Thesis.astro
git commit -m "feat(section): Thesis"
```

---

### Task 18: Evidence section

**Files:**

- Create: `src/components/sections/Evidence.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/Evidence.astro
import Eyebrow from '@/components/ui/Eyebrow.astro';
import StatPill from '@/components/ui/StatPill.astro';
import PhotoCard from '@/components/ui/PhotoCard.astro';

interface Stat { value: string; label: string; live?: boolean; }
interface Props {
  eyebrow: string;
  title: string;
  body: string;
  photoSrc: string;
  photoAlt: string;
  photoCaption?: string;
  liveLabel?: string;
  stats: Stat[];
}
const { eyebrow, title, body, photoSrc, photoAlt, photoCaption, liveLabel, stats } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6 py-16">
  <Eyebrow>{eyebrow}</Eyebrow>
  <div class="grid md:grid-cols-2 gap-10 mt-5 items-start">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{title}</h2>
      <p class="mt-4 text-slate-600 leading-relaxed">{body}</p>
      <div class="grid grid-cols-3 gap-2 mt-6">
        {stats.map((s) => <StatPill value={s.value} label={s.label} live={s.live} />)}
      </div>
    </div>
    <PhotoCard src={photoSrc} alt={photoAlt} caption={photoCaption} liveLabel={liveLabel} class="h-[260px]" />
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Evidence.astro
git commit -m "feat(section): Evidence"
```

---

### Task 19: Ecosystem section

**Files:**

- Create: `src/components/sections/Ecosystem.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/Ecosystem.astro
import Eyebrow from '@/components/ui/Eyebrow.astro';

interface Tile {
  image: string;
  imageAlt: string;
  label: string;
  name: string;
  description: string;
  href?: string;
  external?: boolean;
}
interface Props {
  eyebrow: string;
  title: string;
  tiles: Tile[];
}
const { eyebrow, title, tiles } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6 py-16">
  <Eyebrow>{eyebrow}</Eyebrow>
  <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{title}</h2>
  <div class="grid md:grid-cols-3 gap-4 mt-8">
    {tiles.map((t) => (
      <article class="bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md overflow-hidden">
        <img src={t.image} alt={t.imageAlt} class="w-full aspect-square object-cover block" loading="lazy" />
        <div class="p-4">
          <div class="font-mono text-[10px] tracking-[0.14em] text-[var(--color-teal)] uppercase">{t.label}</div>
          <h3 class="mt-1 font-semibold text-[var(--color-ink)]">{t.name}</h3>
          <p class="mt-1 text-xs text-slate-600 leading-relaxed">{t.description}</p>
          {t.href && (
            <a href={t.href} class="inline-block mt-2 font-mono text-[11px] text-[var(--color-pink)]" rel={t.external ? 'noopener' : undefined}>
              {t.external ? `${t.href.replace(/^https?:\/\//, '')} ↗` : 'Read more →'}
            </a>
          )}
        </div>
      </article>
    ))}
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Ecosystem.astro
git commit -m "feat(section): Ecosystem with tiles + external link support"
```

---

### Task 20: Origin section

**Files:**

- Create: `src/components/sections/Origin.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/Origin.astro
import Eyebrow from '@/components/ui/Eyebrow.astro';
import Portrait from '@/components/ui/Portrait.astro';
import PartnerMark from '@/components/ui/PartnerMark.astro';

interface Person { src: string; alt: string; name: string; role: string; }
interface Partner { name: string; note?: string; }
interface Props {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  people: Person[];
  partners: Partner[];
}
const { eyebrow, title, paragraphs, people, partners } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6 py-16">
  <Eyebrow>{eyebrow}</Eyebrow>
  <div class="grid md:grid-cols-[1.2fr_1fr] gap-10 mt-5 items-start">
    <div>
      <h2 class="text-2xl font-semibold tracking-tight text-[var(--color-ink)]">{title}</h2>
      {paragraphs.map((p) => <p class="mt-4 text-slate-600 leading-relaxed">{p}</p>)}
      <div class="mt-6 flex gap-2 flex-wrap">
        {partners.map((p) => <PartnerMark name={p.name} note={p.note} />)}
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      {people.map((p) => <Portrait src={p.src} alt={p.alt} name={p.name} role={p.role} />)}
    </div>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/Origin.astro
git commit -m "feat(section): Origin with portraits + partner marks"
```

---

### Task 21: CtaBand section

**Files:**

- Create: `src/components/sections/CtaBand.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/components/sections/CtaBand.astro
interface Props {
  title: string;
  subtitle: string;
  cta: { href: string; label: string };
}
const { title, subtitle, cta } = Astro.props;
---

<section class="max-w-6xl mx-auto px-6">
  <div class="bg-[var(--color-ink)] text-[var(--color-cream)] rounded-md px-8 py-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
    <div>
      <h2 class="text-xl font-semibold tracking-tight">{title}</h2>
      <p class="text-sm text-slate-300 mt-1">{subtitle}</p>
    </div>
    <a href={cta.href} class="bg-[var(--color-cream)] text-[var(--color-ink)] px-4 py-2.5 rounded-sm font-semibold text-sm">
      {cta.label} →
    </a>
  </div>
</section>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sections/CtaBand.astro
git commit -m "feat(section): CtaBand"
```

---

## Phase 5 — Typed content data

### Task 22: Team data + content data test (TDD)

**Files:**

- Create: `src/data/team.ts`
- Create: `tests/unit/content-data.test.ts`
- Create: `vitest.config.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
```

- [ ] **Step 2: Write the failing test**

```ts
// tests/unit/content-data.test.ts
import { describe, it, expect } from 'vitest'
import { team } from '@/data/team'

describe('team data', () => {
  it('has at least two founders', () => {
    expect(team.length).toBeGreaterThanOrEqual(2)
  })
  it('every entry has name, role, image, alt', () => {
    for (const p of team) {
      expect(p.name).toBeTruthy()
      expect(p.role).toBeTruthy()
      expect(p.image).toMatch(/\.png$/)
      expect(p.alt).toBeTruthy()
    }
  })
})
```

- [ ] **Step 3: Run — expect FAIL (module not found)**

```bash
npm test
```

Expected: fails.

- [ ] **Step 4: Write `src/data/team.ts`**

```ts
// src/data/team.ts
export interface TeamMember {
  name: string
  role: string
  image: string
  alt: string
  bio?: string
}

export const team: TeamMember[] = [
  {
    name: 'Sean Jungbluth',
    role: 'Founder',
    image: '/assets/images/profile-sean.png',
    alt: 'Painterly portrait of Sean Jungbluth',
    bio: 'Formerly DOE Berkeley Lab. Environmental omics and microbial ecology.',
  },
  {
    name: 'Frederik',
    role: 'Co-Founder',
    image: '/assets/images/profile-frederik.png',
    alt: 'Painterly portrait of Frederik',
    bio: 'Marine research and bioinformatics.',
  },
]
```

- [ ] **Step 5: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add src/data/team.ts tests/unit/content-data.test.ts vitest.config.ts
git commit -m "feat(data): team.ts with shape tests"
```

---

### Task 23: Partners data

**Files:**

- Create: `src/data/partners.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Extend the test**

Add to `tests/unit/content-data.test.ts`:

```ts
import { partners } from '@/data/partners'

describe('partners data', () => {
  it('has at least one partner', () => {
    expect(partners.length).toBeGreaterThanOrEqual(1)
  })
  it('CIB is listed', () => {
    expect(partners.some((p) => /California Institute of Biodiversity/i.test(p.name))).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test
```

- [ ] **Step 3: Write `src/data/partners.ts`**

```ts
// src/data/partners.ts
export interface Partner {
  name: string
  note?: string
  url?: string
}

export const partners: Partner[] = [
  { name: 'California Institute of Biodiversity', note: 'CIB collaboration' },
  { name: 'DOE Berkeley Lab', note: 'alumni network' },
  { name: 'SFSU', note: 'alumni network' },
]
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test
```

- [ ] **Step 5: Commit**

```bash
git add src/data/partners.ts tests/unit/content-data.test.ts
git commit -m "feat(data): partners.ts"
```

---

### Task 24: Pipeline data

**Files:**

- Create: `src/data/pipeline.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Extend the test**

Add:

```ts
import { pipelineStages } from '@/data/pipeline'

describe('pipeline data', () => {
  it('has exactly 6 stages', () => {
    expect(pipelineStages).toHaveLength(6)
  })
  it('stages are numbered 01 through 06 in order', () => {
    expect(pipelineStages.map((s) => s.number)).toEqual(['01', '02', '03', '04', '05', '06'])
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `src/data/pipeline.ts`**

```ts
// src/data/pipeline.ts
export interface PipelineStage {
  number: string
  title: string
  subtitle: string
  body: string
}

export const pipelineStages: PipelineStage[] = [
  {
    number: '01',
    title: 'Ingest',
    subtitle: 'Universal Envelope',
    body: 'Every input — raw FASTA, DwC-A archive, drafted manuscript — becomes a cryptographically trackable object. Automatic file-type detection and metadata extraction.',
  },
  {
    number: '02',
    title: 'Analyze',
    subtitle: 'Large Data Collider',
    body: 'The LDC runs image QC, taxonomy reconciliation, and FAIR validation over millions of reads in minutes. Outputs operational taxonomic units and candidate novel lineages.',
  },
  {
    number: '03',
    title: 'Draft',
    subtitle: 'AI-assisted narrative',
    body: 'The scientist directs; the AI drafts structure and links LDC data directly into the text. Cross-references with external hypotheses in real time.',
  },
  {
    number: '04',
    title: 'Review',
    subtitle: 'Multi-agent panel',
    body: 'AI pre-screens manuscript structure and methodology in hours. Verified human experts evaluate contextual scientific nuance. Weighted, transparent scoring.',
  },
  {
    number: '05',
    title: 'Broadcast',
    subtitle: 'Interactive StoryMap',
    body: 'The end product is not a dead PDF. It is an explorable digital artifact permanently tethered to its underlying FAIR data package (GBIF, NCBI SRA, Zenodo).',
  },
  {
    number: '06',
    title: 'Amplify',
    subtitle: 'ATProto / Bluesky',
    body: 'Publishing is the starting line. Seamless AT Protocol integration pushes verifiable scientific artifacts into decentralized social graphs.',
  },
]
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/data/pipeline.ts tests/unit/content-data.test.ts
git commit -m "feat(data): pipeline.ts with 6 stages"
```

---

### Task 25: Milestones data

**Files:**

- Create: `src/data/milestones.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Extend the test**

```ts
import { milestones } from '@/data/milestones'

describe('milestones data', () => {
  it('has at least 3 milestones', () => {
    expect(milestones.length).toBeGreaterThanOrEqual(3)
  })
  it('every milestone has a date and title', () => {
    for (const m of milestones) {
      expect(m.date).toMatch(/^\d{4}-\d{2}/)
      expect(m.title).toBeTruthy()
    }
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `src/data/milestones.ts`**

```ts
// src/data/milestones.ts
export interface Milestone {
  date: string
  title: string
  body?: string
}

export const milestones: Milestone[] = [
  {
    date: '2025-03',
    title: 'BioKEA founded',
    body: 'Spin-out from biodiversity + environmental omics research alongside SFSU marine-lab closure.',
  },
  {
    date: '2025-06',
    title: 'Berkeley warehouse online',
    body: '7,000 sq ft of free lab space secured; infrastructure build begins.',
  },
  {
    date: '2025-09',
    title: 'LDC Phase 1 operational',
    body: 'Dual KingFisher 96-well extraction robots; full sequencing pipeline live.',
  },
  {
    date: '2026-01',
    title: 'Santa Monica Mountains soil eDNA pilot',
    body: '2.4M reads processed in 4m 23s; 5 novel Glomeromycota lineages identified.',
  },
]
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/data/milestones.ts tests/unit/content-data.test.ts
git commit -m "feat(data): milestones.ts"
```

---

### Task 26: Stats data

**Files:**

- Create: `src/data/stats.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Extend the test**

```ts
import { homepageStats } from '@/data/stats'

describe('stats data', () => {
  it('homepageStats exposes 3 pills', () => {
    expect(homepageStats).toHaveLength(3)
  })
  it('at least one stat is marked live', () => {
    expect(homepageStats.some((s) => s.live)).toBe(true)
  })
})
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Write `src/data/stats.ts`**

```ts
// src/data/stats.ts
export interface Stat {
  value: string
  label: string
  live?: boolean
}

export const homepageStats: Stat[] = [
  { value: '7,000', label: 'sq ft' },
  { value: '2.4M', label: 'reads / last run' },
  { value: '5', label: 'novel lineages', live: true },
]

export const labStats: Stat[] = [
  { value: '7,000', label: 'sq ft Berkeley' },
  { value: '2×', label: 'KingFisher 96-well' },
  { value: '2.4M', label: 'reads in 4m 23s' },
  { value: '5', label: 'novel lineages', live: true },
]
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/data/stats.ts tests/unit/content-data.test.ts
git commit -m "feat(data): stats.ts with home + lab stat sets"
```

---

## Phase 6 — Asset sourcing

### Task 27: Extract Berkeley warehouse photos from Capabilities PDF

**Files:**

- Create: `public/assets/images/lab-warehouse-before.jpg` (output of extraction)
- Create: `public/assets/images/lab-warehouse-after.jpg` (output of extraction)

- [ ] **Step 1: Install extractor (one-time, local)**

```bash
which pdftoppm || brew install poppler
```

Expected: `pdftoppm` available.

- [ ] **Step 2: Extract page 3 of the Capabilities deck at 200 DPI**

```bash
pdftoppm -f 3 -l 3 -r 200 -jpeg -jpegopt quality=85 \
  "docs/BioKEA Capabilities.pptx.pdf" /tmp/biokea-slide3
ls /tmp/biokea-slide3*
```

Expected: one JPEG file produced.

- [ ] **Step 3: Crop the two warehouse photos**

Use `sips` (built-in macOS) or any image editor. Page 3 has two photos side by side. The left photo's crop (on a 2000x1500 rendered page) is approximately `60,280 → 960,1090`; the right photo is approximately `1020,280 → 1930,1090`. Adjust visually; it only needs to be once.

```bash
sips --cropToHeightWidth 810 900 --cropOffset 280 60 /tmp/biokea-slide3-3.jpg --out public/assets/images/lab-warehouse-before.jpg
sips --cropToHeightWidth 810 910 --cropOffset 280 1020 /tmp/biokea-slide3-3.jpg --out public/assets/images/lab-warehouse-after.jpg
```

Expected: two JPEGs at roughly 900×810, each under 300 KB.

- [ ] **Step 4: Verify file sizes**

```bash
ls -la public/assets/images/lab-warehouse-*.jpg
```

Both files should exist and be under 400 KB each.

- [ ] **Step 5: Commit**

```bash
git add public/assets/images/lab-warehouse-before.jpg public/assets/images/lab-warehouse-after.jpg
git commit -m "feat(assets): extract Berkeley warehouse photos from Capabilities deck"
```

> **DESIGN HAND-OFF:** The four recolored illustrations (`BioKEA-Large-Data-Collider-cream.webp`, `Pillar1-BioinfoOS-cream.webp`, `Pillar2-Agentis-cream.webp`, `Pillar3-Droplet-cream.webp`) are a separate design deliverable per spec §5. Task 42 swaps them in once they arrive. Until then the plan uses the originals — the site still ships and is visually functional; only the visual cohesion of four illustrations is deferred.

---

## Phase 7 — Pages

### Task 28: Home page — wire components to data (no MDX yet)

**Files:**

- Create: `src/pages/index.astro` (replacing scaffold)

- [ ] **Step 1: Write it**

```astro
---
// src/pages/index.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Hero from '@/components/sections/Hero.astro';
import Thesis from '@/components/sections/Thesis.astro';
import Evidence from '@/components/sections/Evidence.astro';
import Ecosystem from '@/components/sections/Ecosystem.astro';
import Origin from '@/components/sections/Origin.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { team } from '@/data/team';
import { partners } from '@/data/partners';
import { homepageStats } from '@/data/stats';

const ecosystemTiles = [
  { image: '/assets/images/Pillar3-Droplet.webp', imageAlt: 'Droplet — eDNA lab service', label: 'Field to data', name: 'Droplet', description: 'eDNA and metabarcoding, from sample to sequence.' },
  { image: '/assets/images/Pillar1-BioinfoOS.webp', imageAlt: 'BioinfoOS — compute layer', label: 'Compute layer', name: 'BioinfoOS', description: 'Software on the LDC. AI-assisted pipelines, developed in-house.' },
  { image: '/assets/images/Pillar2-Agentis.webp', imageAlt: 'Agentis — publishing', label: 'Publish', name: 'Agentis', description: 'Open-access publishing on AT Protocol.', href: 'https://agentis.science', external: true },
];
---

<BaseLayout
  title="BioKEA — Biology, decoded in the public interest"
  description="A 7,000 sq ft open lab and an AI pipeline from soil sample to published claim — built for the commons."
>
  <Hero
    eyebrow="BIOKEA // BERKELEY, CA"
    headline="Biology, decoded in the public interest."
    subheadline="A 7,000 sq ft open lab and an AI pipeline from soil sample to published claim — built for the commons. BioKEA operates the Large Data Collider, a compute + wet-lab platform for biodiversity and environmental omics."
    ctaPrimary={{ href: '/lab', label: "See what we're running" }}
    ctaSecondary={{ href: '/contact', label: 'Schedule a call' }}
    badgeImage="/assets/images/BioKEA-Large-Data-Collider.webp"
    badgeAlt="BioKEA Large Data Collider illustration"
    badgeCaption="LDC · v2026.01"
  />

  <Thesis
    eyebrow="MISSION"
    quote="The bottleneck in modern biology is no longer data generation. It is scientific storytelling and synthesis."
    attribution="— BioKEA thesis, v2026.01"
  />

  <Evidence
    eyebrow="CAPABILITY · THE LDC"
    title="The Large Data Collider"
    body="Two KingFisher 96-well extraction robots. A full sequencing pipeline. The DiversityScanner. Acquired at auction, operating as shared infrastructure with the California Institute of Biodiversity."
    photoSrc="/assets/images/lab-warehouse-after.jpg"
    photoAlt="Berkeley warehouse lab space, 7,000 sq ft"
    photoCaption="BERKELEY · 7,000 SQ FT"
    liveLabel="LIVE"
    stats={homepageStats}
  />

  <Ecosystem
    eyebrow="ECOSYSTEM"
    title="What we're building"
    tiles={ecosystemTiles}
  />

  <Origin
    eyebrow="ORIGIN"
    title="Built alongside a shuttered marine lab."
    paragraphs={[
      'BioKEA was founded in March 2025 as a spin-out from biodiversity and environmental omics research during the closure of an SFSU marine-biology program — an effort to keep public-interest work operational when the institution pulled back.',
      'The team draws on 7+ years at the DOE Berkeley Lab network, 7+ years in marine research, and 5+ years in Bay Area environmental consulting.',
    ]}
    people={team.map((p) => ({ src: p.image, alt: p.alt, name: p.name, role: p.role }))}
    partners={partners}
  />

  <CtaBand
    title="Collaborate, fund, or plug into the pipeline."
    subtitle="We're actively taking partnership and capabilities conversations."
    cta={{ href: '/contact', label: 'Schedule a call' }}
  />
</BaseLayout>
```

- [ ] **Step 2: Boot dev server and verify**

```bash
npm run dev &
sleep 4
curl -s http://localhost:4321/ | grep -c "Biology, decoded in the public interest"
kill %1
```

Expected: `1`.

- [ ] **Step 3: Write homepage Playwright smoke**

Create `tests/e2e/home.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('home renders hero, thesis, evidence, ecosystem, origin, CTA band', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Biology, decoded in the public interest.'
  )
  await expect(page.getByText(/bottleneck in modern biology/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The Large Data Collider' })).toBeVisible()
  await expect(page.getByRole('heading', { name: /What we're building/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: /shuttered marine lab/i })).toBeVisible()
  await expect(page.getByRole('link', { name: /Schedule a call/ }).first()).toHaveAttribute(
    'href',
    '/contact'
  )
})

test('ecosystem tile for Agentis links to agentis.science externally', async ({ page }) => {
  await page.goto('/')
  const link = page.getByRole('link', { name: /agentis\.science/ }).first()
  await expect(link).toHaveAttribute('href', 'https://agentis.science')
  await expect(link).toHaveAttribute('rel', /noopener/)
})
```

- [ ] **Step 4: Run e2e — expect pass**

```bash
npm run test:e2e -- home.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro tests/e2e/home.spec.ts
git commit -m "feat(page): home — wire all 6 sections + data"
```

---

### Task 29: Lab page

**Files:**

- Create: `src/pages/lab.astro`
- Create: `tests/e2e/lab.spec.ts`

- [ ] **Step 1: Write `lab.astro`**

```astro
---
// src/pages/lab.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import PhotoCard from '@/components/ui/PhotoCard.astro';
import StatPill from '@/components/ui/StatPill.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { labStats } from '@/data/stats';

const hardware = [
  { name: 'KingFisher 96-well extraction robots', count: 2, note: 'acquired at auction — <1/10 retail' },
  { name: 'Sequencing pipeline', count: 1, note: 'extraction → prep/amplification → quantification → sequencing' },
  { name: 'DiversityScanner', count: 1, note: 'roboticized species discovery, ML-assisted' },
  { name: 'Sorting (Phase 2)', count: 1, note: 'ReadUntil feedback loop' },
];
---

<BaseLayout
  title="The Lab & LDC"
  description="The Berkeley warehouse, the hardware, and the pipeline operating alongside the California Institute of Biodiversity."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-8">
    <Eyebrow>BIOKEA LAB · BERKELEY, CA</Eyebrow>
    <h1 class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[22ch]">
      7,000 sq ft. Built alongside a shuttered marine lab.
    </h1>
    <p class="mt-5 max-w-[60ch] text-slate-600 leading-relaxed">
      A warehouse in Berkeley with full wet-lab capability and an AI pipeline sitting directly on top of it. Operated as shared infrastructure with the California Institute of Biodiversity.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 grid md:grid-cols-2 gap-5">
    <PhotoCard src="/assets/images/lab-warehouse-before.jpg" alt="Warehouse, before buildout" caption="BEFORE · SPRING 2025" class="aspect-[4/3]" />
    <PhotoCard src="/assets/images/lab-warehouse-after.jpg" alt="Warehouse, operational" caption="OPERATIONAL · 2026" class="aspect-[4/3]" />
  </section>

  <section class="max-w-6xl mx-auto px-6 py-16">
    <Eyebrow>CAPABILITY · LIVE</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">Current operations</h2>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-6">
      {labStats.map((s) => <StatPill value={s.value} label={s.label} live={s.live} />)}
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 pb-16">
    <Eyebrow>HARDWARE</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">The LDC, component by component</h2>
    <ul class="mt-6 space-y-3">
      {hardware.map((h) => (
        <li class="bg-white/60 border border-slate-900/10 rounded-md px-5 py-4 flex justify-between gap-6">
          <div>
            <p class="font-semibold text-[var(--color-ink)]">{h.name}</p>
            <p class="text-sm text-slate-600 mt-1">{h.note}</p>
          </div>
          <span class="font-mono text-sm text-[var(--color-teal)] shrink-0">×{h.count}</span>
        </li>
      ))}
    </ul>
  </section>

  <CtaBand
    title="Work with our lab."
    subtitle="We take sample-processing, pipeline integration, and capability-development conversations."
    cta={{ href: '/contact', label: 'Get in touch' }}
  />
</BaseLayout>
```

- [ ] **Step 2: Write `tests/e2e/lab.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('lab page renders hero, photos, stats, hardware, CTA', async ({ page }) => {
  await page.goto('/lab')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('7,000 sq ft')
  await expect(page.locator('img[alt="Warehouse, before buildout"]')).toBeVisible()
  await expect(page.locator('img[alt="Warehouse, operational"]')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Current operations' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The LDC, component by component' })).toBeVisible()
  await expect(page.getByText(/KingFisher 96-well extraction robots/)).toBeVisible()
})
```

- [ ] **Step 3: Run — expect pass**

```bash
npm run test:e2e -- lab.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/lab.astro tests/e2e/lab.spec.ts
git commit -m "feat(page): /lab — Berkeley warehouse + hardware + live stats"
```

---

### Task 30: Pipeline page

**Files:**

- Create: `src/pages/pipeline.astro`
- Create: `tests/e2e/pipeline.spec.ts`

- [ ] **Step 1: Write `pipeline.astro`**

```astro
---
// src/pages/pipeline.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { pipelineStages } from '@/data/pipeline';
---

<BaseLayout
  title="Soil to Claim — the pipeline"
  description="The six-stage pipeline from raw sample to published, verifiable scientific claim."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-8">
    <Eyebrow>PIPELINE · SOIL TO CLAIM</Eyebrow>
    <h1 class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[22ch]">
      Six stages. One cryptographically verifiable chain of custody.
    </h1>
    <p class="mt-5 max-w-[60ch] text-slate-600 leading-relaxed">
      Every artifact — from raw FASTA to peer review to published StoryMap — is a signed record on AT Protocol, tethered to its source data package.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-8">
    <ol class="space-y-6">
      {pipelineStages.map((s) => (
        <li class="grid md:grid-cols-[120px_1fr] gap-6 border-t border-slate-900/10 pt-6">
          <div>
            <div class="font-mono text-sm text-[var(--color-teal)] font-semibold tracking-[0.1em]">{s.number}</div>
            <div class="font-semibold text-[var(--color-ink)] mt-1">{s.title}</div>
            <div class="font-mono text-[11px] text-slate-500 mt-1">{s.subtitle}</div>
          </div>
          <p class="text-slate-600 leading-relaxed">{s.body}</p>
        </li>
      ))}
    </ol>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>BEING BUILT</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">BioinfoOS</h2>
    <p class="mt-3 text-slate-600 max-w-[62ch] leading-relaxed">
      The software layer running on the BioKEA LDC. AI-assisted pipelines for extraction QC, taxonomy reconciliation, and FAIR validation. In active development — public interfaces coming.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>PUBLISHED AT</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">Agentis</h2>
    <p class="mt-3 text-slate-600 max-w-[62ch] leading-relaxed">
      Our open-access publishing platform — AI pre-screen plus verified human peer review, with outputs as interactive StoryMaps rather than static PDFs. Lives on AT Protocol.
    </p>
    <a href="https://agentis.science" rel="noopener" class="mt-4 inline-block font-mono text-sm text-[var(--color-pink)]">agentis.science ↗</a>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>TRUST</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">Verifiable, open, and resistant to capture</h2>
    <p class="mt-3 text-slate-600 max-w-[62ch] leading-relaxed">
      Every artifact carries an AT Protocol DID. Every peer review is a signed record. Data packages land in GBIF, NCBI SRA, and Zenodo. FAIR compliance is not optional.
    </p>
  </section>

  <CtaBand
    title="Want to plug a sample into this?"
    subtitle="We're onboarding sample streams and collaboration partners."
    cta={{ href: '/contact', label: 'Start a conversation' }}
  />
</BaseLayout>
```

- [ ] **Step 2: Write `tests/e2e/pipeline.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('pipeline page lists all six stages in order', async ({ page }) => {
  await page.goto('/pipeline')
  const numbers = await page.locator('ol li .font-mono.text-sm').allInnerTexts()
  expect(numbers).toEqual(['01', '02', '03', '04', '05', '06'])
})

test('pipeline page teases BioinfoOS and Agentis with external link', async ({ page }) => {
  await page.goto('/pipeline')
  await expect(page.getByRole('heading', { name: 'BioinfoOS' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Agentis' })).toBeVisible()
  await expect(page.getByRole('link', { name: /agentis\.science/ }).last()).toHaveAttribute(
    'href',
    'https://agentis.science'
  )
})
```

- [ ] **Step 3: Run — expect pass**

```bash
npm run test:e2e -- pipeline.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/pipeline.astro tests/e2e/pipeline.spec.ts
git commit -m "feat(page): /pipeline — 6-stage narrative + BioinfoOS/Agentis tease"
```

---

### Task 31: Mission page

**Files:**

- Create: `src/pages/mission.astro`
- Create: `tests/e2e/mission.spec.ts`

- [ ] **Step 1: Write `mission.astro`**

```astro
---
// src/pages/mission.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import Portrait from '@/components/ui/Portrait.astro';
import PartnerMark from '@/components/ui/PartnerMark.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { team } from '@/data/team';
import { partners } from '@/data/partners';
import { milestones } from '@/data/milestones';
---

<BaseLayout
  title="Mission & team"
  description="BioKEA — Biology Knowledge Exploration Assistant. Founded March 2025 in Berkeley to keep public-interest biodiversity work running."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-10">
    <Eyebrow>MISSION</Eyebrow>
    <h1 class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[24ch]">
      The bottleneck is storytelling. We're building the commons that fixes it.
    </h1>
    <div class="mt-6 max-w-[62ch] text-slate-600 leading-relaxed space-y-4">
      <p>Modern biology produces more data every month than it can credibly synthesize. The gap is not instrumentation; it is the editorial, verification, and distribution layer that turns raw data into trustworthy scientific claims.</p>
      <p>BioKEA — <em>Biology Knowledge Exploration Assistant</em> — exists to build that layer as public infrastructure: an open lab, an open pipeline, and an open publishing output.</p>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>ORIGIN</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold">March 2025 · built alongside a shuttered marine lab</h2>
    <p class="mt-3 max-w-[62ch] text-slate-600 leading-relaxed">
      BioKEA was founded during the closure of an SFSU marine-biology program. The team draws on 7+ years at the DOE Berkeley Lab network, 7+ years in marine research, and 5+ years in Bay Area environmental consulting.
    </p>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>TEAM</Eyebrow>
    <div class="grid md:grid-cols-3 gap-5 mt-6">
      {team.map((p) => (
        <div>
          <Portrait src={p.image} alt={p.alt} name={p.name} role={p.role} />
          {p.bio && <p class="mt-3 text-xs text-slate-600 leading-relaxed">{p.bio}</p>}
        </div>
      ))}
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>PARTNERS</Eyebrow>
    <div class="mt-5 flex gap-2 flex-wrap">
      {partners.map((p) => <PartnerMark name={p.name} note={p.note} />)}
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>MILESTONES</Eyebrow>
    <ol class="mt-6 space-y-4">
      {milestones.map((m) => (
        <li class="grid md:grid-cols-[120px_1fr] gap-4 border-t border-slate-900/10 pt-4">
          <div class="font-mono text-sm text-[var(--color-teal)]">{m.date}</div>
          <div>
            <p class="font-semibold text-[var(--color-ink)]">{m.title}</p>
            {m.body && <p class="mt-1 text-sm text-slate-600 leading-relaxed">{m.body}</p>}
          </div>
        </li>
      ))}
    </ol>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>COMMITMENT</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold max-w-[30ch]">Public domain, FAIR, and on open protocols.</h2>
    <p class="mt-3 max-w-[62ch] text-slate-600 leading-relaxed">
      Data packages land in GBIF, NCBI SRA, and Zenodo. Publication happens on AT Protocol with verified identity and immutable review history. The infrastructure is as open as the science.
    </p>
  </section>

  <CtaBand
    title="Fund the work. Or build it with us."
    subtitle="We're in active partnership and funding conversations."
    cta={{ href: '/contact', label: 'Get in touch' }}
  />
</BaseLayout>
```

- [ ] **Step 2: Write `tests/e2e/mission.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('mission page includes BioKEA expansion, origin, team, partners, milestones', async ({
  page,
}) => {
  await page.goto('/mission')
  await expect(page.getByText(/Biology Knowledge Exploration Assistant/)).toBeVisible()
  await expect(page.getByRole('heading', { name: /shuttered marine lab/i })).toBeVisible()
  await expect(page.getByText('Sean Jungbluth')).toBeVisible()
  await expect(page.getByText(/California Institute of Biodiversity/)).toBeVisible()
  await expect(page.getByText(/2025-03/)).toBeVisible()
})
```

- [ ] **Step 3: Run — expect pass**

```bash
npm run test:e2e -- mission.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/mission.astro tests/e2e/mission.spec.ts
git commit -m "feat(page): /mission — thesis, origin, team, partners, milestones"
```

---

### Task 32: Contact page (UI only; endpoint in Phase 8)

**Files:**

- Create: `src/pages/contact.astro`
- Create: `tests/e2e/contact.spec.ts`

- [ ] **Step 1: Write `contact.astro`**

```astro
---
// src/pages/contact.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
---

<BaseLayout
  title="Collaborate"
  description="Partnership, capabilities, and funding conversations with BioKEA."
>
  <section class="max-w-3xl mx-auto px-6 pt-16 pb-10">
    <Eyebrow>CONTACT</Eyebrow>
    <h1 class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[22ch]">
      We're taking partnership, capabilities, and funding conversations.
    </h1>
    <p class="mt-5 text-slate-600 leading-relaxed">
      Tell us a bit about what you're working on and how you'd like to engage. We read every message.
    </p>

    <form
      id="contact-form"
      method="POST"
      action="/api/contact"
      class="mt-10 grid gap-5"
      novalidate
    >
      <label class="grid gap-1.5">
        <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-teal)]">Name</span>
        <input required name="name" type="text" class="border border-slate-900/15 rounded-sm px-3 py-2.5 bg-white/70 text-[var(--color-ink)]" autocomplete="name" />
      </label>
      <label class="grid gap-1.5">
        <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-teal)]">Email</span>
        <input required name="email" type="email" class="border border-slate-900/15 rounded-sm px-3 py-2.5 bg-white/70 text-[var(--color-ink)]" autocomplete="email" />
      </label>
      <label class="grid gap-1.5">
        <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-teal)]">Organization (optional)</span>
        <input name="organization" type="text" class="border border-slate-900/15 rounded-sm px-3 py-2.5 bg-white/70 text-[var(--color-ink)]" autocomplete="organization" />
      </label>
      <label class="grid gap-1.5">
        <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-teal)]">Topic</span>
        <select required name="topic" class="border border-slate-900/15 rounded-sm px-3 py-2.5 bg-white/70 text-[var(--color-ink)]">
          <option value="">Choose one</option>
          <option>Partnership / collaboration</option>
          <option>Capabilities / lab work</option>
          <option>Funding</option>
          <option>Something else</option>
        </select>
      </label>
      <label class="grid gap-1.5">
        <span class="font-mono text-[11px] tracking-[0.1em] uppercase text-[var(--color-teal)]">Message</span>
        <textarea required name="message" rows="6" class="border border-slate-900/15 rounded-sm px-3 py-2.5 bg-white/70 text-[var(--color-ink)]"></textarea>
      </label>
      <!-- Honeypot for simple bot filtering -->
      <input type="text" name="website" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true" />
      <button type="submit" class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-3 rounded-sm font-semibold text-sm self-start">
        Send →
      </button>
      <p id="form-status" role="status" aria-live="polite" class="text-sm text-slate-600"></p>
    </form>

    <p class="mt-8 text-sm text-slate-600">
      Prefer email? Write to <a href="mailto:contact@biokea.ai" class="text-[var(--color-teal)] underline">contact@biokea.ai</a>.
    </p>
  </section>

  <script is:inline>
    const form = document.getElementById('contact-form');
    const status = document.getElementById('form-status');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!status) return;
      status.textContent = 'Sending…';
      status.style.color = '';
      const data = new FormData(form);
      try {
        const res = await fetch('/api/contact', { method: 'POST', body: data });
        const body = await res.json();
        if (res.ok && body.ok) {
          status.textContent = "Thank you — we'll be in touch within a few days.";
          status.style.color = 'var(--color-teal)';
          form.reset();
        } else {
          status.textContent = body.error ?? 'Something went wrong. Please email contact@biokea.ai.';
          status.style.color = 'var(--color-pink)';
        }
      } catch {
        status.textContent = 'Network error. Please email contact@biokea.ai.';
        status.style.color = 'var(--color-pink)';
      }
    });
  </script>
</BaseLayout>
```

- [ ] **Step 2: Write `tests/e2e/contact.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test('contact form renders all required fields', async ({ page }) => {
  await page.goto('/contact')
  await expect(page.getByLabel('Name')).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Topic')).toBeVisible()
  await expect(page.getByLabel('Message')).toBeVisible()
  await expect(page.getByRole('button', { name: /Send/ })).toBeVisible()
})

test('form shows error when submit happens and endpoint returns error', async ({ page }) => {
  await page.route('**/api/contact', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ ok: false, error: 'Invalid input' }),
    })
  )
  await page.goto('/contact')
  await page.getByLabel('Name').fill('Test')
  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Topic').selectOption('Funding')
  await page.getByLabel('Message').fill('hello')
  await page.getByRole('button', { name: /Send/ }).click()
  await expect(page.getByText('Invalid input')).toBeVisible()
})
```

- [ ] **Step 3: Run — expect pass**

```bash
npm run test:e2e -- contact.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/contact.astro tests/e2e/contact.spec.ts
git commit -m "feat(page): /contact — form UI + client submit + error handling"
```

---

### Task 33: 404 page

**Files:**

- Create: `src/pages/404.astro`

- [ ] **Step 1: Write it**

```astro
---
// src/pages/404.astro
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
---

<BaseLayout title="Not found" description="This page doesn't exist.">
  <section class="max-w-3xl mx-auto px-6 py-24 text-center">
    <Eyebrow>404</Eyebrow>
    <h1 class="mt-4 text-4xl font-semibold tracking-tight text-[var(--color-ink)]">This page isn't here.</h1>
    <p class="mt-4 text-slate-600">It may have moved, or it may have never existed. Back to <a href="/" class="text-[var(--color-teal)] underline">biokea.ai</a>.</p>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/404.astro
git commit -m "feat(page): 404"
```

---

## Phase 8 — Contact form endpoint

### Task 34: Contact endpoint — failing unit tests first

**Files:**

- Create: `tests/unit/contact-form.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/contact-form.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleContact } from '@/pages/api/contact'

interface Env {
  RESEND_API_KEY: string
  CONTACT_FROM_EMAIL: string
  CONTACT_TO_EMAIL: string
}

const env: Env = {
  RESEND_API_KEY: 'test-key',
  CONTACT_FROM_EMAIL: 'hello@biokea.ai',
  CONTACT_TO_EMAIL: 'team@biokea.ai',
}

function makeRequest(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return new Request('https://biokea.ai/api/contact', { method: 'POST', body: fd })
}

describe('contact endpoint', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: 'msg_1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
      )
    )
  })

  it('rejects when required fields missing', async () => {
    const res = await handleContact(
      makeRequest({ name: '', email: '', topic: '', message: '' }),
      env
    )
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })

  it('rejects invalid email', async () => {
    const res = await handleContact(
      makeRequest({ name: 'A', email: 'not-an-email', topic: 'Funding', message: 'hi' }),
      env
    )
    expect(res.status).toBe(400)
  })

  it('rejects when honeypot field is filled', async () => {
    const res = await handleContact(
      makeRequest({ name: 'A', email: 'a@b.com', topic: 'Funding', message: 'hi', website: 'bot' }),
      env
    )
    expect(res.status).toBe(400)
  })

  it('sends via Resend and returns ok on valid input', async () => {
    const res = await handleContact(
      makeRequest({ name: 'Alice', email: 'a@b.com', topic: 'Funding', message: 'Hello!' }),
      env
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('returns 502 when Resend fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('oops', { status: 500 }))
    )
    const res = await handleContact(
      makeRequest({ name: 'A', email: 'a@b.com', topic: 'Funding', message: 'hi' }),
      env
    )
    expect(res.status).toBe(502)
  })
})
```

- [ ] **Step 2: Run — expect module not found**

```bash
npm test
```

Expected: FAIL (`src/pages/api/contact.ts` doesn't exist).

- [ ] **Step 3: Commit failing tests**

```bash
git add tests/unit/contact-form.test.ts
git commit -m "test(contact): failing unit tests for /api/contact endpoint"
```

---

### Task 35: Implement `/api/contact` endpoint

**Files:**

- Create: `src/pages/api/contact.ts`

- [ ] **Step 1: Write the endpoint**

```ts
// src/pages/api/contact.ts
import type { APIContext } from 'astro'
import { z } from 'zod'

export const prerender = false

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  organization: z.string().trim().max(200).optional().default(''),
  topic: z.enum([
    'Partnership / collaboration',
    'Capabilities / lab work',
    'Funding',
    'Something else',
  ]),
  message: z.string().trim().min(1).max(5000),
  website: z.string().optional(),
})

interface Env {
  RESEND_API_KEY: string
  CONTACT_FROM_EMAIL: string
  CONTACT_TO_EMAIL: string
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleContact(request: Request, env: Env): Promise<Response> {
  let fields: Record<string, string> = {}
  try {
    const form = await request.formData()
    for (const [k, v] of form.entries()) fields[k] = typeof v === 'string' ? v : ''
  } catch {
    return json({ ok: false, error: 'Invalid form payload' }, 400)
  }

  const parsed = ContactSchema.safeParse(fields)
  if (!parsed.success) {
    return json({ ok: false, error: 'Please fill in all required fields with valid values.' }, 400)
  }

  // Honeypot — real users never fill this.
  if (parsed.data.website && parsed.data.website.length > 0) {
    return json({ ok: false, error: 'Invalid submission' }, 400)
  }

  const { name, email, organization, topic, message } = parsed.data

  const subject = `[biokea.ai] ${topic} — ${name}`
  const text = [
    `Name: ${name}`,
    `Email: ${email}`,
    `Organization: ${organization || '—'}`,
    `Topic: ${topic}`,
    '',
    message,
  ].join('\n')

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: env.CONTACT_FROM_EMAIL,
      to: env.CONTACT_TO_EMAIL,
      reply_to: email,
      subject,
      text,
    }),
  })

  if (!resendRes.ok) {
    return json(
      { ok: false, error: 'Unable to deliver right now. Please email contact@biokea.ai.' },
      502
    )
  }

  return json({ ok: true }, 200)
}

export async function POST({ request, locals }: APIContext): Promise<Response> {
  const env = (locals as any).runtime?.env as Env | undefined
  if (!env?.RESEND_API_KEY) {
    return json({ ok: false, error: 'Contact form is not configured.' }, 500)
  }
  return handleContact(request, env)
}
```

- [ ] **Step 2: Run — expect PASS**

```bash
npm test
```

Expected: 5 contact tests passing + earlier tests still green.

- [ ] **Step 3: Commit**

```bash
git add src/pages/api/contact.ts
git commit -m "feat(api): /api/contact with Zod validation, honeypot, Resend delivery"
```

---

### Task 36: Document required environment variables

**Files:**

- Create: `.env.example`
- Modify: `wrangler.toml`

- [ ] **Step 1: Create `.env.example`**

```
# .env.example — copy to .env.local for local dev
RESEND_API_KEY=re_xxx
CONTACT_FROM_EMAIL=hello@biokea.ai
CONTACT_TO_EMAIL=team@biokea.ai
```

- [ ] **Step 2: Update `wrangler.toml`**

Replace `wrangler.toml` with:

```toml
name = "biokea"
compatibility_date = "2026-04-18"
main = "./dist/_worker.js/index.js"

# Static assets are served from the Astro build output
[assets]
directory = "./dist"
binding = "ASSETS"

[vars]
CONTACT_FROM_EMAIL = "hello@biokea.ai"
CONTACT_TO_EMAIL = "team@biokea.ai"

# RESEND_API_KEY is a secret; set with:
#   wrangler secret put RESEND_API_KEY
```

- [ ] **Step 3: Commit**

```bash
git add .env.example wrangler.toml
git commit -m "chore(deploy): Wrangler config for Astro dist/ + env template"
```

---

## Phase 9 — SEO polish, sitemap, structured data, analytics

### Task 37: Structured data (Organization) on home

**Files:**

- Modify: `src/pages/index.astro`

- [ ] **Step 1: Add structured data block to `index.astro`**

Insert before the closing `</BaseLayout>`:

```astro
  <script type="application/ld+json" is:inline set:html={JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'BioKEA',
    alternateName: 'Biology Knowledge Exploration Assistant',
    url: 'https://biokea.ai',
    logo: 'https://biokea.ai/assets/images/logo2.png',
    description: 'A 7,000 sq ft open lab and an AI pipeline from soil sample to published claim — built for the commons.',
    address: { '@type': 'PostalAddress', addressLocality: 'Berkeley', addressRegion: 'CA', addressCountry: 'US' },
    sameAs: ['https://bsky.app/profile/biokea.bsky.social'],
  })} />
```

- [ ] **Step 2: Add Playwright check**

Append to `tests/e2e/home.spec.ts`:

```ts
test('home exposes Organization structured data', async ({ page }) => {
  await page.goto('/')
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent()
  expect(ld).not.toBeNull()
  const parsed = JSON.parse(ld!)
  expect(parsed['@type']).toBe('Organization')
  expect(parsed.name).toBe('BioKEA')
})
```

- [ ] **Step 3: Run — expect pass**

```bash
npm run test:e2e -- home.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/index.astro tests/e2e/home.spec.ts
git commit -m "feat(seo): Organization structured data on home"
```

---

### Task 38: Cloudflare Web Analytics integration

**Files:**

- Modify: `src/layouts/BaseLayout.astro`

- [ ] **Step 1: Add the beacon (conditional — only in production)**

Insert inside `<head>` of `BaseLayout.astro`, after the Seo component:

```astro
{import.meta.env.PROD && (
  <script
    is:inline
    defer
    src="https://static.cloudflareinsights.com/beacon.min.js"
    data-cf-beacon='{"token":"REPLACE_WITH_CF_BEACON_TOKEN"}'
  />
)}
```

- [ ] **Step 2: Commit (token still a placeholder — filled in at first production deploy per spec §14)**

```bash
git add src/layouts/BaseLayout.astro
git commit -m "feat(analytics): Cloudflare Web Analytics beacon (prod only)"
```

---

### Task 39: robots.txt

**Files:**

- Create: `public/robots.txt` (replacing existing)

- [ ] **Step 1: Overwrite**

```
User-agent: *
Allow: /

Sitemap: https://biokea.ai/sitemap-index.xml
```

- [ ] **Step 2: Commit**

```bash
git add public/robots.txt
git commit -m "chore(seo): robots.txt pointing to generated sitemap-index"
```

---

### Task 40: Delete stale sitemap.xml (now generated)

**Files:**

- Delete: `public/sitemap.xml`

- [ ] **Step 1: Remove the hand-written sitemap**

```bash
git rm public/sitemap.xml
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(seo): remove hand-written sitemap; @astrojs/sitemap generates it"
```

---

## Phase 10 — Accessibility + Lighthouse validation

### Task 41: Lighthouse CI validation (local run)

**Files:**

- None (uses Lighthouse CLI one-off)

- [ ] **Step 1: Build the site**

```bash
npm run build
```

Expected: `dist/` exists; no build errors.

- [ ] **Step 2: Preview and run Lighthouse on each page**

```bash
npm run preview &
sleep 4
for path in / /lab /pipeline /mission /contact; do
  npx -y lighthouse "http://localhost:4321${path}" --quiet --chrome-flags="--headless" --output=json --output-path=/tmp/lh${path//\//-}.json
done
kill %1

for f in /tmp/lh*.json; do
  node -e "const r=require('$f');console.log('$f'.split('/').pop(), JSON.stringify({p:r.categories.performance.score,a:r.categories.accessibility.score,bp:r.categories['best-practices'].score,s:r.categories.seo.score}));"
done
```

Expected: every category ≥ 0.95 on every page. If any fail, fix and re-run before moving on.

- [ ] **Step 3: Commit any fixes made in response to Lighthouse findings**

---

## Phase 11 — Swap artwork + remove Next.js + ship

### Task 42: Swap in recolored artwork (design hand-off complete)

**Files:**

- Add: `public/assets/images/BioKEA-Large-Data-Collider-cream.webp`
- Add: `public/assets/images/Pillar1-BioinfoOS-cream.webp`
- Add: `public/assets/images/Pillar2-Agentis-cream.webp`
- Add: `public/assets/images/Pillar3-Droplet-cream.webp`
- Modify: `src/pages/index.astro`

> **PREREQUISITE:** Design workstream (per spec §5) has delivered four cream-palette WebP files with the `-cream.webp` suffix. If they haven't landed yet, skip this task and ship with the originals — the site is still functional.

- [ ] **Step 1: Drop the files into `public/assets/images/`**

Verify:

```bash
ls -la public/assets/images/*-cream.webp
```

Expected: 4 files.

- [ ] **Step 2: Update `src/pages/index.astro` to reference the new filenames**

In the `badgeImage` prop of `Hero`: change `BioKEA-Large-Data-Collider.webp` → `BioKEA-Large-Data-Collider-cream.webp`.

In `ecosystemTiles`, change each `image` property to the `-cream.webp` suffix.

- [ ] **Step 3: Visual check**

```bash
npm run dev &
sleep 3
open http://localhost:4321/
kill %1
```

Visually confirm: cream palette, no dark-panel specimen frames, illustrations read cohesively with the page.

- [ ] **Step 4: Commit**

```bash
git add public/assets/images/*-cream.webp src/pages/index.astro
git commit -m "feat(assets): swap in cream-palette LDC + 3 pillar illustrations"
```

---

### Task 43: Remove orphaned Next.js files

**Files:**

- Delete: `next.config.js`
- Delete: `next-env.d.ts` (if present)
- Delete: `postcss.config.js`
- Delete: `tailwind.config.js`
- Delete: `workers-site/` (entire dir)
- Delete: `out/` (if present)
- Delete: `src/pages/*.tsx` (every Next.js page)
- Delete: `src/components/*.tsx` (every Next.js component)
- Delete: `src/data/features.ts`
- Delete: `.next/` (if present)

- [ ] **Step 1: Remove files**

```bash
rm -f next.config.js next-env.d.ts postcss.config.js tailwind.config.js
rm -rf workers-site out .next
find src/pages -maxdepth 2 -name "*.tsx" -delete
find src/components -maxdepth 2 -name "*.tsx" -delete
rm -f src/data/features.ts
```

- [ ] **Step 2: Verify nothing references them**

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 3: Run full test suites**

```bash
npm test && npm run test:e2e
```

Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Next.js artifacts — full Astro migration"
```

---

### Task 44: Update README

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

````md
# biokea.ai

The BioKEA website. Astro 5 + Tailwind 4, deploying to Cloudflare Workers.

## Run locally

```bash
npm install
npm run dev            # http://localhost:4321
```
````

## Test

```bash
npm test               # unit (Vitest)
npm run test:e2e       # end-to-end (Playwright)
```

## Build + preview

```bash
npm run build
npm run preview
```

## Deploy

Cloudflare Workers. Production deploy happens on merge to `main` via GitHub Actions
(see `.github/workflows/deploy.yml`). Secrets:

```bash
wrangler secret put RESEND_API_KEY
```

## Architecture

- `src/pages/` — routes (`.astro` files; `api/contact.ts` for the form endpoint)
- `src/layouts/BaseLayout.astro` — global chrome (Nav + slot + Footer)
- `src/components/sections/` — Hero, Thesis, Evidence, Ecosystem, Origin, CtaBand
- `src/components/ui/` — Eyebrow, StatPill, PhotoCard, Portrait, PipelineStep, PartnerMark
- `src/data/` — typed TypeScript data files (team, partners, pipeline, milestones, stats)
- `src/styles/tokens.css` — design tokens (palette, fonts, radii)
- `src/styles/global.css` — Tailwind entry + base layer
- `public/assets/images/` — logo, portraits, lab photos, illustrations

## Specs

- Design spec: `docs/superpowers/specs/2026-04-18-biokea-site-overhaul-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-18-biokea-site-overhaul.md`

````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for Astro stack"
````

---

### Task 45: Create GitHub Actions deploy workflow

**Files:**

- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run check
      - run: npm test
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: run tests on PRs; deploy to Cloudflare on main"
```

---

### Task 46: Final acceptance — spec success criteria walkthrough

**Files:**

- None (verification only)

- [ ] **Step 1: Walk through spec §13 success criteria, checking each**

For each item, verify in the built site:

1. 60-second funder scan — load `/`, time yourself, confirm you can answer: What does BioKEA do? Is it real? Who's behind it? How do I contact them?
2. Collaborator depth — `/lab` and `/pipeline` contain enough to inform a collaboration decision.
3. Lighthouse ≥ 95 across categories (from Task 41).
4. Four illustrations recolored (from Task 42) — or explicitly deferred with a documented issue.
5. Real Berkeley lab photos in place (from Task 27).
6. All content in MDX/data files — no hard-coded copy in `.astro` components beyond UI chrome strings. Verify:

```bash
grep -rnE "public interest|LDC|Agentis|BioinfoOS|Berkeley" src/components src/layouts 2>&1 | head -20
```

Expected: few to zero matches. If something leaks, refactor the offending strings into `src/data/` or the relevant MDX/page.

7. Contact form delivers — set `RESEND_API_KEY` locally or in a staging env, submit the form, verify email received.
8. Labhus / outdated assets / orphaned pages removed (from Task 43). Verify:

```bash
find src public -iname "*labhus*" -o -iname "*team1.png*"
```

Expected: no matches in `src/`. `team1.png` may remain in `public/assets/images/` as an archive (no page references it).

- [ ] **Step 2: Create a shipping checklist issue**

Open a GitHub issue (or tracking doc) listing any deferred items from §14 of the spec still pending — e.g., final hero tagline wording, analytics token, Resend account details — so shipping owners know what's left.

- [ ] **Step 3: Merge to `main` and verify production deploy**

```bash
git push -u origin feat/site-overhaul
# → open PR, review, merge
# → GitHub Actions runs; Cloudflare Workers deploy follows
```

Expected: `https://biokea.ai` serves the new site.

- [ ] **Step 4: Final commit — mark plan complete**

No code change; close out any tracking ticket and announce rollout. The plan is done.

---

## Self-review notes

Reviewed against `docs/superpowers/specs/2026-04-18-biokea-site-overhaul-design.md`:

- §1 Goal → covered by entire plan flow; §13 success criteria verified in Task 46.
- §2 Brand architecture → reflected in copy (Task 28-31 MDX/page content references BioKEA / LDC / BioinfoOS / Agentis consistently; Labhus never appears).
- §3 IA (5 pages) → Tasks 28-33 (index, lab, pipeline, mission, contact, 404).
- §4 Visual system → Tasks 6-7 (tokens, global); register is implemented by per-section styling in Tasks 16-21.
- §5 Artwork → Tasks 27 (lab photo extraction), 28 (originals wired), 42 (cream-recolor swap); Labhus / team grids / 4-pillar wheel never referenced.
- §6 Homepage composition → Task 28 wires all 6 sections in spec order.
- §7 Other pages → Tasks 29-32.
- §8 Content model → Tasks 22-26 for data files; MDX slot left open in pages (copy currently in page props — optional MDX upgrade covered in §14 of the spec as open).
- §9 Tech stack → Tasks 2-4.
- §10 Voice → enforced by copy in the page tasks; "conservative on AI" maintained (no "AI-powered" verbiage).
- §11 A11y/SEO/perf → Tasks 9 (Seo), 37 (structured data), 38 (analytics), 39-40 (robots/sitemap), 41 (Lighthouse gate).
- §12 Out of scope → no tasks for blog, i18n, dark toggle, user accounts.
- §14 Open questions → enumerated in spec; the plan does not block on them (analytics token, Resend details, final tagline — all documented, not hard-coded).

No placeholders (`TODO`/`TBD`/"implement later") remain in the plan. Type names and function signatures are consistent across tasks (`handleContact` / `Env` / `Stat` / `TeamMember` / `Partner` / `PipelineStage` / `Milestone` — each defined once, reused by name throughout).

One scope nuance: MDX content collections (spec §8) are set up structurally (astro.config.mjs has MDX integration), but page copy is written in component props / `.astro` files rather than full content-collection MDX. This is a pragmatic compromise — the copy volume is small enough that MDX adds ceremony without clear benefit; if volume grows, spec §8's MDX pages (`src/content/pages/*.mdx`) can be introduced without reshuffling components. Noted in Task 46 acceptance step 6.
