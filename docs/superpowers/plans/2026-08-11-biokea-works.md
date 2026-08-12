# BioKEA Works Website Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Represent the BioKEA Works product suite on biokea.ai as closed-testing alpha, retiring the standalone Agentis/Sequoia/Droplet/BioinfoOS narrative that predates it.

**Architecture:** One new page (`/works`) built from one new typed data module (`src/data/works.ts`), reusing every existing layout/UI convention (Eyebrow, CtaBand, cream/ink palette, mono-uppercase labels) and the existing `/contact` endpoint for "request access." Everything else is edits to existing files that currently make claims the brief contradicts, plus deletion of the standalone `/agentis` page.

**Tech Stack:** Astro v6 (`.astro` pages/components), TypeScript data modules, Tailwind v4 utility classes, Zod (contact form schema), Vitest (unit), Playwright (e2e).

## Global Constraints

- Every mention of BioKEA Works or any of its 6 real products must read as **closed-testing alpha** — never "available now," "production-ready," or a specific throughput/scale claim.
- Use **"BioInfoOS"** (capital I) as the product name going forward — the brief's spelling — replacing the old ad hoc "BioinfoOS" everywhere it appears in copy being touched by this plan.
- Droplet and Sequoia get **name only, no feature claims** anywhere they're mentioned.
- No new npm dependencies. No backend/Supabase/migration changes — "request access" reuses the existing `/contact` endpoint end-to-end.
- Follow existing design system conventions exactly (`Eyebrow.astro`, `CtaBand.astro`, `stringifyJsonLd`, the cream-warm-card + mono-uppercase-label visual language already used on `/pipeline` and the old `/agentis`) — no new shared components for a 6-card single page.
- Source spec: `docs/superpowers/specs/2026-08-11-biokea-works-design.md`. Source brief: `BIOKEA_WORKS_WEBSITE_BRIEF.md` (repo root).

---

### Task 1: `works.ts` data module

**Files:**

- Create: `src/data/works.ts`
- Modify: `tests/unit/content-data.test.ts`

**Interfaces:**

- Produces: `WorksProduct { slug: string; name: string; subdomain: string; tagline: string; capabilities: string[] }`, exported array `worksProducts: WorksProduct[]` (6 entries, in this order: Works, Atlas, Studio, BioInfoOS, Scribe, Press). Also `ReservedProduct { slug: string; name: string }`, exported array `worksReserved: ReservedProduct[]` (2 entries: Droplet, Sequoia). Later tasks (3) import both.

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/content-data.test.ts`, alongside the other `import` lines at the top:

```ts
import { worksProducts, worksReserved } from '@/data/works';
```

Add this new `describe` block at the end of the file:

```ts
describe('works data', () => {
  it('has exactly 6 real products', () => {
    expect(worksProducts).toHaveLength(6);
  });
  it('lists Works, Atlas, Studio, BioInfoOS, Scribe, and Press in that order', () => {
    expect(worksProducts.map((p) => p.name)).toEqual([
      'Works',
      'Atlas',
      'Studio',
      'BioInfoOS',
      'Scribe',
      'Press',
    ]);
  });
  it('every product has a *.biokea.ai subdomain, a tagline, and at least 2 capabilities', () => {
    for (const p of worksProducts) {
      expect(p.subdomain).toMatch(/^[a-z]+\.biokea\.ai$/);
      expect(p.tagline).toBeTruthy();
      expect(p.capabilities.length).toBeGreaterThanOrEqual(2);
    }
  });
  it('has exactly 2 reserved names: Droplet and Sequoia', () => {
    expect(worksReserved.map((r) => r.name)).toEqual(['Droplet', 'Sequoia']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- content-data`
Expected: FAIL — `Cannot find module '@/data/works'` (or similar resolution error), since `src/data/works.ts` doesn't exist yet.

- [ ] **Step 3: Write the data module**

Create `src/data/works.ts`:

```ts
// src/data/works.ts
export interface WorksProduct {
  slug: string;
  name: string;
  subdomain: string;
  tagline: string;
  capabilities: string[];
}

export const worksProducts: WorksProduct[] = [
  {
    slug: 'works',
    name: 'Works',
    subdomain: 'works.biokea.ai',
    tagline: 'Identity, projects, and permissions — one account across the whole suite.',
    capabilities: [
      'One login and one identity across Atlas, Studio, BioInfoOS, Scribe, and Press',
      'Project creation and permissions management',
      "The passport that carries a researcher's access between every product",
    ],
  },
  {
    slug: 'atlas',
    name: 'Atlas',
    subdomain: 'atlas.biokea.ai',
    tagline: 'Discover, filter, and explore published scientific datasets.',
    capabilities: [
      'Public dashboards and data catalog',
      'Turn what you see into your own reproducible dataset inside Studio, citation trail included',
      'Every published result becomes discoverable here',
    ],
  },
  {
    slug: 'studio',
    name: 'Studio',
    subdomain: 'studio.biokea.ai',
    tagline:
      'The scientific workbench — import data, manage samples, run analyses, review results.',
    capabilities: [
      'Import data and track physical/field samples',
      'Plan and submit analyses that run on BioInfoOS',
      'Explore results: taxonomy, phylogenetic trees, diversity statistics, maps',
      'Hands finished results to Scribe for writing up',
    ],
  },
  {
    slug: 'bioinfoos',
    name: 'BioInfoOS',
    subdomain: 'bioinfoos.biokea.ai',
    tagline: 'The shared compute engine that runs vetted bioinformatics workflows.',
    capabilities: [
      'A curated library of vetted, reproducible bioinformatics tools — never arbitrary code',
      'Every run produces a Result Manifest: a verifiable record of what ran, on what data, with what parameters',
      'Approved users can run analyses directly, through its own interface or a personal API',
    ],
  },
  {
    slug: 'scribe',
    name: 'Scribe',
    subdomain: 'scribe.biokea.ai',
    tagline:
      'Scientific authoring — turn a result into a structured manuscript or interactive StoryMap.',
    capabilities: [
      'Narrative, figures, tables, and citations traceably linked back to source data',
      'StoryMaps — interactive, data-driven scientific narratives combining maps, charts, and text',
      'Documents can start from a Studio result, blank, or an imported manuscript',
    ],
  },
  {
    slug: 'press',
    name: 'Press',
    subdomain: 'press.biokea.ai',
    tagline: 'Peer review and publication — submission through public release.',
    capabilities: [
      'Submission, automated screening, independent human peer review, and editorial decision',
      'Agentis: an evidence-backed review capability linking review claims to their supporting evidence',
      'Public release with permanent archiving (DOI/repository deposit); corrections and retractions preserved as history, never quietly edited away',
    ],
  },
];

export interface ReservedProduct {
  slug: string;
  name: string;
}

export const worksReserved: ReservedProduct[] = [
  { slug: 'droplet', name: 'Droplet' },
  { slug: 'sequoia', name: 'Sequoia' },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- content-data`
Expected: PASS (all `works data` tests green, all pre-existing tests in the file still green).

- [ ] **Step 5: Commit**

```bash
git add src/data/works.ts tests/unit/content-data.test.ts
git commit -m "feat(works): add BioKEA Works product data module"
```

---

### Task 2: Swap the Agentis contact topic for BioKEA Works

**Files:**

- Modify: `src/pages/api/contact.ts:27-35`
- Modify: `src/pages/contact.astro:8-15,96-98`
- Modify: `tests/unit/contact-form.test.ts` (no change expected, verify only)
- Modify: `tests/e2e/contact.spec.ts`
- Delete: `tests/e2e/agentis.spec.ts`

**Interfaces:**

- Produces: contact topic string `'BioKEA Works — request access'`, and the URL preset key `works` (used as `/contact?topic=works`). Task 3's `/works` CTA depends on this exact preset key and topic string.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/contact.spec.ts`:

```ts
test('contact form preselects BioKEA Works topic when ?topic=works', async ({ page }) => {
  await page.goto('/contact?topic=works');
  await expect(page.getByLabel('Topic')).toHaveValue('BioKEA Works — request access');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test contact.spec.ts -g "BioKEA Works topic"`
Expected: FAIL — the `<select>` has no option with that value yet, so `toHaveValue` fails (the select falls back to its default/empty value).

- [ ] **Step 3: Swap the topic in both contact files**

In `src/pages/api/contact.ts`, in the `ContactSchema` enum:

```ts
  topic: z.enum([
    'Sequencing service inquiry',
    'Partnership / collaboration',
    'Funding',
    'Press / media',
    'Hiring',
    'BioKEA Works — request access',
    'Something else',
  ]),
```

In `src/pages/contact.astro`, update `TOPIC_PRESET_MAP`:

```ts
const TOPIC_PRESET_MAP: Record<string, string> = {
  works: 'BioKEA Works — request access',
  sequencing: 'Sequencing service inquiry',
  partnership: 'Partnership / collaboration',
  funding: 'Funding',
  press: 'Press / media',
  hiring: 'Hiring',
};
```

And update the `<option>` list:

```astro
<option selected={presetTopic === 'Hiring'}>Hiring</option>
<option selected={presetTopic === 'BioKEA Works — request access'}>
  BioKEA Works — request access
</option>
<option selected={presetTopic === 'Something else'}>Something else</option>
```

- [ ] **Step 4: Delete the now-obsolete Agentis e2e spec**

`tests/e2e/agentis.spec.ts` tests the standalone `/agentis` page (retiring in Task 9) and the old `?topic=agentis` preset (just removed). Delete it:

```bash
rm tests/e2e/agentis.spec.ts
```

- [ ] **Step 5: Run tests to verify everything passes**

Run: `npx playwright test contact.spec.ts`
Expected: PASS, including the new "BioKEA Works topic" test.

Run: `npm test -- contact-form`
Expected: PASS unchanged — `contact-form.test.ts` exercises `handleContact` with the `'Funding'` topic and never referenced `'Agentis — early access'`, so it's unaffected.

- [ ] **Step 6: Commit**

```bash
git add src/pages/api/contact.ts src/pages/contact.astro tests/e2e/contact.spec.ts
git rm tests/e2e/agentis.spec.ts
git commit -m "feat(contact): swap Agentis early-access topic for BioKEA Works request access"
```

---

### Task 3: Build the `/works` page

**Files:**

- Create: `src/pages/works.astro`
- Create: `tests/e2e/works.spec.ts`

**Interfaces:**

- Consumes: `worksProducts`, `worksReserved` from `@/data/works` (Task 1); `stringifyJsonLd` from `@/lib/json-ld`; `Eyebrow` from `@/components/ui/Eyebrow.astro`; `CtaBand` from `@/components/sections/CtaBand.astro`; `/contact?topic=works` (Task 2).
- Produces: route `/works`, with in-page anchors `#products`, and per-product anchors `#works`, `#atlas`, `#studio`, `#bioinfoos`, `#scribe`, `#press` (used by later tasks' `/works#bioinfoos` and `/works#press` links).

- [ ] **Step 1: Write the failing test**

Create `tests/e2e/works.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('works page renders hero and all 6 products', async ({ page }) => {
  await page.goto('/works');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'One identity. One compute engine.',
  );
  await expect(page.getByText(/closed-testing alpha/i).first()).toBeVisible();
  for (const name of ['Works', 'Atlas', 'Studio', 'BioInfoOS', 'Scribe', 'Press']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
});

test('coming-soon section names Droplet and Sequoia with no feature claims', async ({ page }) => {
  await page.goto('/works');
  await expect(page.getByText('Droplet', { exact: true })).toBeVisible();
  await expect(page.getByText('Sequoia', { exact: true })).toBeVisible();
});

test('every product card links out to its gated subdomain', async ({ page }) => {
  await page.goto('/works');
  await expect(page.getByRole('link', { name: 'atlas.biokea.ai ↗' })).toHaveAttribute(
    'href',
    'https://atlas.biokea.ai',
  );
  await expect(page.getByRole('link', { name: 'press.biokea.ai ↗' })).toHaveAttribute(
    'href',
    'https://press.biokea.ai',
  );
});

test('request access CTA routes to contact with the works topic', async ({ page }) => {
  await page.goto('/works');
  const cta = page.getByRole('link', { name: 'Request access' }).first();
  await expect(cta).toHaveAttribute('href', '/contact?topic=works');
});

test('works page exposes a SoftwareApplication JSON-LD entry per product', async ({ page }) => {
  await page.goto('/works');
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  const graph = scripts
    .map((s) => {
      try {
        return JSON.parse(s);
      } catch {
        return null;
      }
    })
    .find((j) => j && Array.isArray(j['@graph']));
  expect(graph).toBeDefined();
  const names = graph['@graph'].map((n: { name: string }) => n.name);
  expect(names).toEqual(['Works', 'Atlas', 'Studio', 'BioInfoOS', 'Scribe', 'Press']);
  for (const node of graph['@graph']) {
    expect(node.releaseNotes).toBe('In closed-testing alpha.');
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test works.spec.ts`
Expected: FAIL — 404, no route at `/works` yet.

- [ ] **Step 3: Build the page**

Create `src/pages/works.astro`:

```astro
---
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import CtaBand from '@/components/sections/CtaBand.astro';
import { worksProducts, worksReserved } from '@/data/works';
import { stringifyJsonLd } from '@/lib/json-ld';

const flow = ['Atlas', 'Studio', 'BioInfoOS', 'Studio', 'Scribe', 'Press', 'Atlas'];
---

<BaseLayout
  title="BioKEA Works — the product suite"
  description="BioKEA Works is a connected suite of scientific software products for the full lifecycle of a research project — currently in closed-testing alpha."
>
  <section class="max-w-6xl mx-auto px-6 pt-16 pb-8">
    <Eyebrow>BIOKEA WORKS · CLOSED-TESTING ALPHA</Eyebrow>
    <h1
      class="mt-3 text-4xl md:text-5xl font-semibold tracking-[-0.025em] leading-[1.05] text-[var(--color-ink)] max-w-[26ch]"
    >
      One identity. One compute engine. Six independent products.
    </h1>
    <p class="mt-5 max-w-[62ch] text-slate-600 leading-relaxed">
      BioKEA Works is a connected suite of tools for the full lifecycle of a scientific research
      project — from raw data to analysis to writing to peer review to public discovery. Every
      product shares one identity and one secure compute engine, but each is usable entirely on its
      own.
    </p>
    <ul class="mt-6 space-y-2 max-w-[62ch] text-sm text-slate-600 leading-relaxed">
      <li>· Every result carries a verifiable record of exactly how it was produced.</li>
      <li>· If an analysis fails, the system never quietly substitutes a fake result.</li>
      <li>· Computation runs only pre-approved, vetted, versioned tools.</li>
      <li>· Where AI assists, a human confirms before anything is treated as fact.</li>
      <li>· Start anywhere — there's a suggested path, but it's not a forced funnel.</li>
    </ul>
    <p
      class="mt-6 inline-block font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--color-ochre)] bg-[rgba(146,64,14,0.1)] px-3 py-1.5 rounded-sm"
    >
      In closed-testing alpha — by invitation
    </p>
    <div class="mt-6 flex items-center gap-4">
      <a
        href="/contact?topic=works"
        class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
      >
        Request access
      </a>
      <a href="#products" class="text-[var(--color-teal)] text-sm font-medium">
        See the products →
      </a>
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-8">
    <Eyebrow>HOW IT FITS TOGETHER</Eyebrow>
    <div class="mt-5 flex flex-wrap items-center gap-2">
      {
        flow.map((step, i) => (
          <>
            <span class="font-mono text-[11px] tracking-[0.1em] uppercase bg-[var(--color-cream-warm)] border border-slate-900/10 px-3 py-1.5 rounded-sm text-[var(--color-ink)]">
              {step}
            </span>
            {i < flow.length - 1 && (
              <span class="text-slate-400" aria-hidden="true">
                →
              </span>
            )}
          </>
        ))
      }
    </div>
    <p class="mt-4 max-w-[62ch] text-sm text-slate-600 leading-relaxed">
      The suggested path — not mandatory. Every product can be entered independently; a researcher
      doesn't have to visit Atlas first to use Studio.
    </p>
  </section>

  <section id="products" class="max-w-6xl mx-auto px-6 py-12 scroll-mt-24">
    <Eyebrow>PRODUCTS</Eyebrow>
    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
      Six products, one identity.
    </h2>
    <div class="mt-8 grid md:grid-cols-2 gap-6">
      {
        worksProducts.map((p) => (
          <article
            id={p.slug}
            class="bg-[var(--color-cream-warm)] border border-slate-900/10 rounded-md p-6 scroll-mt-24"
          >
            <div class="flex items-baseline justify-between gap-4">
              <h3 class="text-lg font-semibold text-[var(--color-ink)]">{p.name}</h3>
              <span class="font-mono text-[9.5px] font-semibold tracking-[0.14em] uppercase px-2 py-1 rounded-sm bg-[rgba(71,85,105,0.12)] text-slate-600 shrink-0">
                Closed testing
              </span>
            </div>
            <p class="mt-2 text-sm text-slate-600 leading-relaxed">{p.tagline}</p>
            <ul class="mt-4 space-y-1.5 text-sm text-slate-600 leading-relaxed">
              {p.capabilities.map((c) => (
                <li class="flex items-baseline gap-2">
                  <span class="font-mono text-[10px] text-[var(--color-teal)] shrink-0">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
            <a
              href={`https://${p.subdomain}`}
              target="_blank"
              rel="noopener"
              class="mt-4 inline-block font-mono text-[12px] text-[var(--color-pink)]"
            >
              {p.subdomain} ↗
            </a>
          </article>
        ))
      }
    </div>
  </section>

  <section class="max-w-6xl mx-auto px-6 py-12">
    <Eyebrow>COMING SOON</Eyebrow>
    <p class="mt-3 max-w-[62ch] text-sm text-slate-600 leading-relaxed">
      Two more product names are reserved. No features yet — we'll say more when there's something
      real to describe.
    </p>
    <ul class="mt-4 flex gap-3 flex-wrap">
      {
        worksReserved.map((r) => (
          <li class="font-mono text-sm tracking-[0.04em] text-slate-500 bg-white/70 border border-slate-900/10 px-3 py-1.5 rounded-sm">
            {r.name}
          </li>
        ))
      }
    </ul>
  </section>

  <CtaBand
    title="Request access to BioKEA Works."
    subtitle="Every product is in closed-testing alpha, by invitation."
    cta={{ href: '/contact?topic=works', label: 'Request access' }}
  />

  <script
    type="application/ld+json"
    is:inline
    set:html={stringifyJsonLd({
      '@context': 'https://schema.org',
      '@graph': worksProducts.map((p) => ({
        '@type': 'SoftwareApplication',
        '@id': `https://biokea.ai/works#${p.slug}`,
        name: p.name,
        applicationCategory: 'Scientific research software',
        operatingSystem: 'Web',
        url: `https://${p.subdomain}`,
        description: p.tagline,
        creator: { '@id': 'https://biokea.ai/#org' },
        provider: { '@id': 'https://biokea.ai/#org' },
        releaseNotes: 'In closed-testing alpha.',
        featureList: p.capabilities,
      })),
    })}
  />
</BaseLayout>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test works.spec.ts`
Expected: PASS, all 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/works.astro tests/e2e/works.spec.ts
git commit -m "feat(works): add the BioKEA Works product suite page"
```

---

### Task 4: Swap Agentis for Works in nav and footer

**Files:**

- Modify: `src/components/layout/Nav.astro:31`
- Modify: `src/components/layout/Footer.astro:68`
- Modify: `tests/e2e/nav.spec.ts:39-47,111-114`

**Interfaces:**

- Consumes: `/works` route (Task 3).

- [ ] **Step 1: Write the failing test**

In `tests/e2e/nav.spec.ts`, replace the test at line 39:

```ts
test('"Our work" dropdown reveals Projects, Works, and Press', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  const desktop = nav.locator('div.hidden.md\\:flex').first();
  await desktop.getByText('Our work', { exact: true }).click();
  await expect(desktop.getByRole('link', { name: 'Projects', exact: true })).toBeVisible();
  await expect(desktop.getByRole('link', { name: 'Works', exact: true })).toHaveAttribute(
    'href',
    '/works',
  );
  await expect(desktop.getByRole('link', { name: 'Press', exact: true })).toBeVisible();
});
```

And update the footer assertion at line 111-114:

```ts
await expect(footer.getByRole('link', { name: 'Works', exact: true })).toHaveAttribute(
  'href',
  '/works',
);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test nav.spec.ts -g "Our work"`
Expected: FAIL — nav still has an "Agentis" link, not "Works".

- [ ] **Step 3: Swap the links**

In `src/components/layout/Nav.astro`, in the `"Our work"` group's `items`:

```ts
  {
    label: 'Our work',
    items: [
      { href: '/projects', label: 'Projects' },
      { href: '/works', label: 'Works' },
      { href: '/press', label: 'Press' },
    ],
  },
```

In `src/components/layout/Footer.astro`, line 68:

```astro
<li><a href="/works">Works</a></li>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test nav.spec.ts`
Expected: PASS, all tests in the file (the "Our work" test and the footer-links test).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Nav.astro src/components/layout/Footer.astro tests/e2e/nav.spec.ts
git commit -m "feat(nav): swap Agentis for Works in primary nav and footer"
```

---

### Task 5: Update the homepage (ecosystem tiles + FAQ)

**Files:**

- Modify: `src/pages/index.astro:14-49,130-141,233,238-241`
- Modify: `tests/e2e/home.spec.ts:18-22,86`

**Interfaces:**

- Consumes: `/works` route (Task 3).

- [ ] **Step 1: Write the failing tests**

In `tests/e2e/home.spec.ts`, replace the test at line 18:

```ts
test('ecosystem tile for BioKEA Works links to the /works page', async ({ page }) => {
  await page.goto('/');
  const link = page.getByRole('link', { name: /See BioKEA Works/ }).first();
  await expect(link).toHaveAttribute('href', '/works');
});
```

And change line 86:

```ts
expect(questions).toContain('What is BioKEA Works?');
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test home.spec.ts -g "ecosystem tile|FAQPage"`
Expected: FAIL — the homepage still has an Agentis tile/FAQ entry, not a BioKEA Works one.

- [ ] **Step 3: Rename the Droplet tile and replace the Agentis tile**

In `src/pages/index.astro`, replace the `ecosystemTiles` array:

```ts
const ecosystemTiles = [
  {
    image: '/assets/images/Pillar3-Droplet.webp',
    imageAlt: 'Aquatic eDNA and metabarcoding specialist illustration',
    label: 'Aquatic eDNA',
    name: 'Field to species',
    description:
      'An aquatic eDNA specialist — sample collection, metabarcoding, and taxonomic identification.',
    href: '/services',
    external: false,
    linkLabel: 'See services →',
  },
  {
    image: '/assets/images/Pillar1-BioinfoOS.webp',
    imageAlt:
      'Editorial illustration representing the Large Data Collider — compute + wet-lab platform',
    label: 'The infrastructure',
    name: 'The LDC',
    description:
      '5,000+ sq ft Berkeley wet-lab. ONT Promethion 2 plus ~80 instruments, sourced through Bay Area biotech auctions at roughly one-tenth retail.',
    href: '/lab',
    external: false,
    linkLabel: 'See the lab →',
  },
  {
    image: '/assets/images/Pillar4-Labhus.webp',
    imageAlt: 'BioKEA Works — placeholder illustration',
    label: 'The suite',
    name: 'BioKEA Works',
    description:
      'A connected suite of scientific software products for the full research lifecycle — in closed-testing alpha.',
    href: '/works',
    external: false,
    linkLabel: 'See BioKEA Works →',
  },
];
```

(The Droplet tile keeps its image, href, and description — only its `name`/`label`/`imageAlt` change, per the design decision to free up the "Droplet" name. The `Pillar4-Labhus.webp` asset already exists in `public/assets/images/` and was previously unused — see design spec §3.)

- [ ] **Step 4: Drop the retired AT-Protocol/publishing claims from the org-level JSON-LD**

Still in `src/pages/index.astro`, in the `Organization` node's `knowsAbout` array (currently lines 130-141), remove the `'AT Protocol'` and `'Open-access publishing'` entries — they were specific to the retired standalone-Agentis vision, not a claim `team.ts`'s per-person tags make (which stay, see design spec §3):

```ts
          knowsAbout: [
            'Environmental DNA',
            'Metabarcoding',
            'Biodiversity informatics',
            'DNA barcoding',
            'Long-read nanopore sequencing',
            'Oxford Nanopore Promethion 2',
            'FAIR data',
            'Darwin Core Archive',
          ],
```

- [ ] **Step 5: Update the FAQ JSON-LD**

Update the "How do I engage..." answer (line 233):

```ts
            text: 'Reach out via the contact form at biokea.ai/contact. Engagement routes include partnership/collaboration, capabilities/lab work, funding, and BioKEA Works access.',
```

Replace the "What is Agentis?" question (lines 237-243) with:

```ts
        {
          '@type': 'Question',
          name: 'What is BioKEA Works?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "BioKEA Works is BioKEA's suite of scientific software products — Works, Atlas, Studio, BioInfoOS, Scribe, and Press — covering the full lifecycle of a research project, from raw data to peer-reviewed publication. Currently in closed-testing alpha.",
          },
        },
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test home.spec.ts`
Expected: PASS, all tests in the file.

- [ ] **Step 7: Commit**

```bash
git add src/pages/index.astro tests/e2e/home.spec.ts
git commit -m "feat(home): rename Droplet tile, replace Agentis tile with BioKEA Works"
```

---

### Task 6: Rewrite the pipeline's BioInfoOS and Agentis sections

**Files:**

- Modify: `src/data/pipeline.ts:37-44` (stage 06 only)
- Modify: `src/pages/pipeline.astro:68-103`
- Modify: `tests/e2e/pipeline.spec.ts:9-17`

**Interfaces:**

- Consumes: `/works#bioinfoos`, `/works#press` anchors (Task 3).

- [ ] **Step 1: Write the failing test**

Replace the test in `tests/e2e/pipeline.spec.ts` (lines 9-17):

```ts
test('pipeline page teases BioInfoOS and Press with links into BioKEA Works', async ({ page }) => {
  await page.goto('/pipeline');
  await expect(page.getByRole('heading', { name: 'BioInfoOS' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Press' })).toBeVisible();
  await expect(page.getByRole('link', { name: /See BioInfoOS in BioKEA Works/ })).toHaveAttribute(
    'href',
    '/works#bioinfoos',
  );
  await expect(page.getByRole('link', { name: /See Press in BioKEA Works/ })).toHaveAttribute(
    'href',
    '/works#press',
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test pipeline.spec.ts -g "BioInfoOS and Press"`
Expected: FAIL — the page still has an "Agentis" heading and no "BioInfoOS"-cased heading or `/works` links.

- [ ] **Step 3: Reword stage 06 in the pipeline data**

In `src/data/pipeline.ts`, replace the `'06'` stage:

```ts
  {
    number: '06',
    title: 'Amplify',
    subtitle: 'Press · human-approved',
    body: 'Publishing is the starting line, not the finish. Once a result is live, Press can coordinate a human-approved, platform-neutral share campaign for that release — never automatically, and only after publication.',
  },
```

- [ ] **Step 4: Rewrite the BioInfoOS and Agentis sections on the pipeline page**

In `src/pages/pipeline.astro`, replace the "BEING BUILT" section (lines 68-91):

```astro
<section class="max-w-6xl mx-auto px-6 py-12">
  <Eyebrow>COMPUTE ENGINE</Eyebrow>
  <h2 class="mt-3 text-2xl font-semibold">BioInfoOS</h2>
  <p class="mt-3 text-slate-600 max-w-[62ch] leading-relaxed">
    The software layer running on the BioKEA Large Data Collider (LDC) — and, as part of BioKEA
    Works, a compute product approved researchers can use directly. In-house AI-assisted modules
    cover:
  </p>
  <ul class="mt-4 space-y-1.5 text-sm text-slate-600 leading-relaxed max-w-[62ch]">
    <li>· Extraction-run QC (Claude Vision over plate images)</li>
    <li>· Taxonomy reconciliation against BOLD, NCBI, and GBIF</li>
    <li>
      · FAIR (Findable, Accessible, Interoperable, Reusable) package validation — DwC-A, Darwin
      Core, Zenodo DOI-ready
    </li>
    <li>· Draft narrative generation tethered to pipeline outputs</li>
    <li>
      · Operational Taxonomic Unit (OTU) clustering, amplicon denoising, and chimera filtering
    </li>
  </ul>
  <p class="mt-4 text-slate-600 max-w-[62ch] leading-relaxed">
    Modules ship incrementally; BioInfoOS is in closed-testing alpha and runs on the same LDC
    hardware used by the molecular sequencing service.
  </p>
  <a href="/works#bioinfoos" class="mt-3 inline-block font-mono text-sm text-[var(--color-pink)]">
    See BioInfoOS in BioKEA Works →
  </a>
</section>
```

Replace the "PUBLISHED AT" section (lines 93-103):

```astro
<section class="max-w-6xl mx-auto px-6 py-12">
  <Eyebrow>PUBLISHED VIA</Eyebrow>
  <h2 class="mt-3 text-2xl font-semibold">Press</h2>
  <p class="mt-3 text-slate-600 max-w-[62ch] leading-relaxed">
    Pipeline outputs publish through Press, part of the BioKEA Works suite — submission, peer
    review, and public release, including Agentis, an evidence-backed review capability. In
    closed-testing alpha.
  </p>
  <a href="/works#press" class="mt-3 inline-block font-mono text-sm text-[var(--color-pink)]">
    See Press in BioKEA Works →
  </a>
</section>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test pipeline.spec.ts`
Expected: PASS, both tests in the file (stage-order test is unaffected; the new BioInfoOS/Press test passes).

Run: `npm test -- content-data`
Expected: PASS unchanged — the `pipeline data` tests only check stage count and numbering (`01`–`06`), not subtitle/body text.

- [ ] **Step 6: Commit**

```bash
git add src/data/pipeline.ts src/pages/pipeline.astro tests/e2e/pipeline.spec.ts
git commit -m "feat(pipeline): reframe BioInfoOS and Agentis sections as BioKEA Works pointers"
```

---

### Task 7: Remove the Agentis and Sequoia project entries

**Files:**

- Modify: `src/data/projects.ts:178-213` (remove 2 entries)
- Modify: `src/pages/projects.astro:69-88` (remove hand-written Sequoia JSON-LD node)

**Interfaces:**

- None consumed from other tasks. Nothing downstream depends on these two entries (confirmed: `content-data.test.ts` and `tests/e2e/projects.spec.ts` assert only on `dakinediving`, never on `agentis` or `sequoia-foundation-model`).

- [ ] **Step 1: Write the failing test**

Add to `tests/unit/content-data.test.ts`, inside (or near) the existing `describe('projects data — DaKineDiving', ...)` block, a new block:

```ts
describe('projects data — no Works-suite overlap', () => {
  it('does not include agentis or sequoia-foundation-model as case-study slugs', () => {
    const slugs = projects.map((p) => p.slug);
    expect(slugs).not.toContain('agentis');
    expect(slugs).not.toContain('sequoia-foundation-model');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- content-data`
Expected: FAIL — both slugs are still present in `projects.ts`.

- [ ] **Step 3: Remove the two entries from `projects.ts`**

Delete the `agentis` entry (the object with `slug: 'agentis'`) and the `sequoia-foundation-model` entry (the object with `slug: 'sequoia-foundation-model'`) from the `projects` array in `src/data/projects.ts`, including their trailing commas, so the array ends with the `colloquip` entry.

- [ ] **Step 4: Remove the hand-written Sequoia JSON-LD node**

`src/pages/projects.astro`'s JSON-LD `@graph` is hand-written per project, not generated from the `projects` array — removing the data entry above does **not** remove this node. Delete the `SoftwareApplication` object for `@id: 'https://biokea.ai/projects#sequoia-foundation-model'` (the first object in the `@graph` array, lines 69-88 including its trailing comma) from `src/pages/projects.astro`, so the graph starts with the `intertidal-gap` node.

(There is no corresponding hand-written Agentis node in this file — nothing else to remove there.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- content-data`
Expected: PASS.

Run: `npx playwright test projects.spec.ts`
Expected: PASS unchanged (none of its assertions reference `agentis` or `sequoia-foundation-model`).

- [ ] **Step 6: Commit**

```bash
git add src/data/projects.ts src/pages/projects.astro tests/unit/content-data.test.ts
git commit -m "feat(projects): remove Agentis and Sequoia entries superseded by BioKEA Works"
```

---

### Task 8: Update services and press page copy

**Files:**

- Modify: `src/pages/services.astro:71` (casing fix) and after line 231 (`</dl>` close of the FAQ section)
- Modify: `src/pages/press.astro:11`

**Interfaces:**

- Consumes: `/works#bioinfoos` anchor (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/services.spec.ts`:

```ts
test('services FAQ links BioInfoOS to BioKEA Works', async ({ page }) => {
  await page.goto('/services');
  const link = page.getByRole('link', { name: 'BioKEA Works' }).last();
  await expect(link).toHaveAttribute('href', '/works#bioinfoos');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test services.spec.ts -g "BioInfoOS to BioKEA Works"`
Expected: FAIL — no such link exists yet.

- [ ] **Step 3: Fix the FAQ answer casing and add the link**

In `src/pages/services.astro`, fix the casing in the FAQ answer at line 71:

```ts
  {
    q: 'Can I use my own bioinformatic pipeline?',
    a: 'Yes. We can deliver raw FASTQ plus full metadata for downstream pipelines run by you or your collaborators. We also run our in-house BioInfoOS pipeline on request.',
  },
```

Immediately after the FAQ `<dl>` closes (after line 231, `</dl>`), add a link paragraph matching the existing pattern used after the WORKFLOW list (lines 207-213):

```astro
<p class="mt-6 text-sm text-slate-500 leading-relaxed">
  BioInfoOS is also available directly, as part of
  <a href="/works#bioinfoos" class="underline decoration-slate-400 hover:text-[var(--color-teal)]">
    BioKEA Works
  </a>.
</p>
```

- [ ] **Step 4: Reword the Press page summary paragraph**

In `src/pages/press.astro`, replace the end of `oneParagraph` (line 11):

```ts
const oneParagraph = `BioKEA — Biology Knowledge Exploration Assistant — is an independent biology company in Berkeley, California, founded in March 2025. The company operates the Large Data Collider (LDC), a combined wet-lab and compute platform built around an Oxford Nanopore Promethion 2 long-read sequencer and ~80 instruments sourced through Bay Area biotech auctions. BioKEA runs molecular sequencing as a service (DNA barcoding, environmental DNA, and long-read genomics) for environmental-DNA and biodiversity-omics customers, and is building BioKEA Works, a suite of scientific software products — including Press, for peer review and publication — currently in closed-testing alpha.`;
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test services.spec.ts press.spec.ts`
Expected: PASS, all tests in both files (`press.spec.ts` has no assertion on the exact paragraph text, so it's unaffected by Step 4).

- [ ] **Step 6: Commit**

```bash
git add src/pages/services.astro src/pages/press.astro tests/e2e/services.spec.ts
git commit -m "feat(services,press): fix BioInfoOS casing, link to BioKEA Works, reword Press summary"
```

---

### Task 9: Delete the standalone Agentis page

**Files:**

- Delete: `src/pages/agentis.astro`

**Interfaces:**

- None. This is the last task that can safely remove the file, now that Tasks 2, 4, 5, 6, 7 have removed every inbound reference to `/agentis` from contact presets, nav, footer, homepage, and pipeline.

- [ ] **Step 1: Confirm no remaining inbound references**

Run:

```bash
grep -rn "'/agentis'\|\"/agentis\"\|href=\"/agentis\"\|href='/agentis'" src/ --include="*.astro" --include="*.ts"
```

Expected: no matches outside `src/pages/agentis.astro` itself. (`src/pages/llms-full.txt.ts` and `public/llms.txt` still reference `/agentis` in prose at this point — that's expected and fixed in Tasks 10–11, which run next; they're plain-text files, not routes that break the build.)

- [ ] **Step 2: Delete the page**

```bash
rm src/pages/agentis.astro
```

- [ ] **Step 3: Run the full e2e suite to confirm nothing links to a 404**

Run: `npm run test:e2e`
Expected: PASS. In particular, `nav.spec.ts`, `home.spec.ts`, and `pipeline.spec.ts` (already updated in Tasks 4–6) confirm no remaining UI links to `/agentis`.

- [ ] **Step 4: Commit**

```bash
git add -A src/pages/agentis.astro
git commit -m "feat(works): remove standalone Agentis page, superseded by BioKEA Works/Press"
```

---

### Task 10: Rewrite `llms-full.txt.ts`

**Files:**

- Modify: `src/pages/llms-full.txt.ts:112-114,138,193`

**Interfaces:**

- None. `## Projects` in this file is generated from `projects.ts` via `renderProjects()`, so Task 7's removal of the `agentis`/`sequoia-foundation-model` entries already fixed that section — no edit needed here for it.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/llms-txt.spec.ts`:

```ts
test('llms-full.txt describes BioKEA Works instead of standalone Agentis', async ({ page }) => {
  const response = await page.goto('/llms-full.txt');
  const body = (await response?.text()) ?? '';
  expect(body).toContain('BioKEA Works');
  expect(body).toContain('BioInfoOS');
  expect(body).not.toContain('forthcoming AI-first open-access scientific journal');
  expect(body).not.toContain('aquatic eDNA and metabarcoding specialist service line');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test llms-txt.spec.ts -g "BioKEA Works instead"`
Expected: FAIL — the current text still describes Agentis as a forthcoming standalone journal and Droplet as a service line.

- [ ] **Step 3: Rewrite the Operations bullets and remaining mentions**

In `src/pages/llms-full.txt.ts`, replace lines 112-114:

```ts
- **BioInfoOS** — the compute engine behind BioKEA Works: a curated library of vetted, reproducible bioinformatics tools with a Result Manifest on every run. Also runs the in-house LDC modules (AI-assisted extraction QC, taxonomy reconciliation, FAIR-package validation, draft narrative generation).
- **BioKEA Works** — a connected suite of software (Works, Atlas, Studio, BioInfoOS, Scribe, Press) for the full research lifecycle, currently in closed-testing alpha. Press includes Agentis, an evidence-backed review capability. Droplet and Sequoia are reserved product names with no defined purpose yet. See ${SITE}/works.
```

Fix the casing at line 138:

```ts
BioKEA participates in major cloud and AI infrastructure programs that supply compute, credits, and engineering support behind the LDC and BioInfoOS:
```

Replace line 193:

```ts
biokea.ai/contact — partnership / capabilities / funding / BioKEA Works access.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test llms-txt.spec.ts`
Expected: PASS, both the new test and the pre-existing `llms-full.txt is served...` test (which asserts on Team/Projects/Milestones content untouched by this edit).

- [ ] **Step 5: Commit**

```bash
git add src/pages/llms-full.txt.ts tests/e2e/llms-txt.spec.ts
git commit -m "feat(llms): rewrite llms-full.txt operations section for BioKEA Works"
```

---

### Task 11: Rewrite `public/llms.txt`

**Files:**

- Modify: `public/llms.txt` (hand-maintained; independent of `llms-full.txt.ts`)

**Interfaces:**

- None.

- [ ] **Step 1: Write the failing test**

Add to `tests/e2e/llms-txt.spec.ts`:

```ts
test('llms.txt describes BioKEA Works instead of standalone Agentis/Droplet', async ({ page }) => {
  const response = await page.goto('/llms.txt');
  const body = (await response?.text()) ?? '';
  expect(body).toContain('BioKEA Works');
  expect(body).toContain('BioInfoOS');
  expect(body).not.toContain('forthcoming AI-first open-access scientific journal');
  expect(body).not.toContain('aquatic eDNA/metabarcoding service line');
  expect(body).not.toContain('AT Protocol');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test llms-txt.spec.ts -g "Works instead of standalone"`
Expected: FAIL — the current file still makes all of these claims.

- [ ] **Step 3: Rewrite `public/llms.txt`**

Apply these replacements (line numbers refer to the file's current state before this task):

Line 5 — drop the AT-Protocol claim:

```
BioKEA (**Bi**ology **K**nowledge **E**xploration **A**ssistant) is an independent biology company in Berkeley, California. Founded March 2025 as a spin-out from biodiversity and environmental omics research, accelerated by revolutionary AI tooling. Operations span field sampling, wet-lab processing, bioinformatics, and the BioKEA Works software suite for the full research lifecycle.
```

Lines 9-12 (under `## What BioKEA operates`) — drop the standalone Droplet/Agentis bullets, fix BioInfoOS casing, add a BioKEA Works bullet:

```
- **The Large Data Collider (LDC)** — combined wet-lab + compute infrastructure in Berkeley (5,000+ sq ft, operational March 2026)
- **BioInfoOS** — the compute engine behind BioKEA Works: a curated library of vetted, reproducible bioinformatics tools with a Result Manifest on every run; also runs the in-house LDC modules (AI-assisted extraction QC, taxonomy reconciliation, FAIR-package validation, draft narrative generation)
- **BioKEA Works** — a connected software suite (Works, Atlas, Studio, BioInfoOS, Scribe, Press) covering the full research lifecycle from raw data to peer-reviewed publication; currently in closed-testing alpha. Press includes Agentis, an evidence-backed review capability. Droplet and Sequoia are reserved product names with no defined purpose yet.
```

Line 27:

```
Engagement routes (Contact-form topics): Sequencing service inquiry, Partnership / collaboration, Funding, Press / media, Hiring, BioKEA Works — request access, Something else.
```

Line 37 (under `## Key pages`):

```
- [BioKEA Works](https://biokea.ai/works): the product suite (Works, Atlas, Studio, BioInfoOS, Scribe, Press) — closed-testing alpha, request access
```

Line 39:

```
- [Contact](https://biokea.ai/contact): sequencing inquiry / partnership / funding / press / hiring / BioKEA Works access intake
```

Line 66 — casing fix:

```
BioKEA participates in major cloud and AI infrastructure programs that supply the compute, credits, and engineering support behind the LDC and BioInfoOS:
```

Line 82 — casing fix:

```
BioKEA is set up as a molecular sequencing service for the eDNA and biodiversity-omics community. The service model runs on the same LDC hardware and BioInfoOS pipeline that powers BioKEA's own research. Customers get reproducible, FAIR-compliant output with verifiable chain of custody from field sample to published artifact — not just raw reads.
```

Lines 101-103 (pipeline stages 4-6) — drop the AT-Protocol/Bluesky specifics, matching Task 6's `pipeline.ts` rewrite:

```
4. **Review** — multi-agent review panel: AI pre-screen (~2 hours) + verified human experts, weighted transparent scoring.
5. **Broadcast** — Interactive StoryMap: explorable digital artifact tethered to its FAIR data package (GBIF, NCBI SRA, Zenodo) rather than a dead PDF.
6. **Amplify** — Press, human-approved: publishing is the starting line — once live, Press can coordinate a human-approved, platform-neutral share campaign for that release.
```

Line 117 — **leave unchanged** (`- 2025-04 · Agentis conceived (AI-reviewed science journal)` stays; it's accurate history, per design spec §3).

Lines 126-132 (`## Vocabulary`) — replace the BioinfoOS/Agentis/Droplet entries, add Sequoia, and remove the now-unreferenced AT-Protocol/DID entries:

```
- **LDC** = Large Data Collider (BioKEA's combined wet-lab + compute instrument)
- **BioInfoOS** = the compute engine behind BioKEA Works; also BioKEA's in-house bioinformatics operating layer on the LDC
- **BioKEA Works** = BioKEA's suite of scientific software products (Works, Atlas, Studio, BioInfoOS, Scribe, Press), in closed-testing alpha
- **Agentis** = an evidence-backed peer-review capability inside Press, part of BioKEA Works
- **Droplet** = a reserved BioKEA Works product name; no defined purpose yet
- **Sequoia** = a reserved BioKEA Works product name; no defined purpose yet
- **FAIR** = Findable, Accessible, Interoperable, Reusable (data standards principle)
- **DwC-A** = Darwin Core Archive (biodiversity data exchange format)
- **OTU** = Operational Taxonomic Unit
- **eDNA** = environmental DNA
- **GBIF** = Global Biodiversity Information Facility
- **NCBI SRA** = NCBI Sequence Read Archive
- **BOLD** = Barcode of Life Data System
- **CIB** = California Institute for Biodiversity
- **SFEI** = San Francisco Estuary Institute
```

(This drops the old `AT Protocol / ATProto` and `DID` lines — nothing else in the file references either term after the edits above.)

Line 149 (`## Public-good commitments`):

```
Data packages land in GBIF, NCBI SRA, and Zenodo. Every result carries a verifiable record of how it was produced (a Result Manifest), and Press preserves corrections and retractions as permanent history rather than editing them away. Open-source defaults. Infrastructure is intended to be as open as the science it carries.
```

Line 157:

```
Contact topics accepted via the site form: partnership / collaboration, capabilities / lab work, funding, BioKEA Works — request access.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test llms-txt.spec.ts`
Expected: PASS, all 3 tests in the file (the pre-existing `llms.txt is served...` test asserts on `## What BioKEA operates` — the heading is unchanged, only its bullets — plus Team/Partners/Vocabulary/Programs content untouched by this edit).

- [ ] **Step 5: Commit**

```bash
git add public/llms.txt tests/e2e/llms-txt.spec.ts
git commit -m "feat(llms): rewrite public llms.txt for BioKEA Works, drop AT-Protocol claims"
```

---

### Task 12: Full verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Type-check**

Run: `npm run check`
Expected: no TypeScript/Astro diagnostics errors.

- [ ] **Step 2: Unit tests**

Run: `npm test`
Expected: all suites pass, including the new `works data` and `no Works-suite overlap` blocks from Tasks 1 and 7.

- [ ] **Step 3: Full e2e suite**

Run: `npm run test:e2e`
Expected: all specs pass, including `works.spec.ts` (new), and the updated `contact.spec.ts`, `nav.spec.ts`, `home.spec.ts`, `pipeline.spec.ts`, `services.spec.ts`, `llms-txt.spec.ts`. Confirms `agentis.spec.ts` is gone and nothing else references `/agentis`.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no Prettier formatting violations across every file touched in Tasks 1-11.

- [ ] **Step 5: Manual spot-check**

Start the dev server (`docker compose up -d` or `npm run dev`) and visually confirm in a browser:

- `/works` renders all 6 product cards + 2 reserved names + working CTA
- `/` shows the renamed "Field to species" tile and the new "BioKEA Works" tile
- `/pipeline` shows "BioInfoOS" and "Press" sections linking into `/works`
- `/agentis` returns a 404
- Nav "Our work" dropdown shows Projects / Works / Press

- [ ] **Step 6: Commit** (only if Step 4's lint run modified any files)

```bash
git add -A
git commit -m "chore: lint fixes from BioKEA Works implementation"
```
