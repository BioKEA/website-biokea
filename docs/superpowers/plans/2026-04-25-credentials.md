# Credentials & program memberships — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface BioKEA's three company-level program memberships (AWS for Startups, Google Cloud for Startups, NVIDIA Inception) and Sean Jungbluth's Anthropic Claude Community Ambassador credential across the marketing site, JSON-LD, and `llms.txt`, in a way that's honest, agent-discoverable, and easy to extend.

**Architecture:** A single typed data module `src/data/credentials.ts` is the source of truth for visual rendering and JSON-LD. A new `ProgramsStrip` component renders compact-or-expanded variants in the footer (every page) and a dedicated `/mission` section. Sean's portrait gains an optional credential line via a new `credential?: string` prop on `Portrait.astro`. JSON-LD adds `Organization.memberOf` on the homepage and `Person.award` + `affiliation` on Sean's mission entry. `llms.txt` is hand-edited to mirror the same content.

**Tech Stack:** Astro 6 (server output), TypeScript strict, Tailwind 4, Vitest (unit), Playwright (e2e). No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-25-credentials-design.md`

---

## File structure

**Create:**

- `src/data/credentials.ts` — Programs and PersonalCredential data + types
- `src/components/sections/ProgramsStrip.astro` — `compact` and `expanded` variants

**Modify:**

- `src/components/ui/Portrait.astro` — add optional `credential?: string` prop
- `src/components/layout/Footer.astro` — render `<ProgramsStrip variant="compact" />`
- `src/pages/mission.astro` — render `<ProgramsStrip variant="expanded" />` section, look up credentials and pass to `Portrait`, extend Sean's JSON-LD
- `src/pages/index.astro` — add `memberOf` to Organization JSON-LD
- `public/llms.txt` — new "Programs & support" section + Sean inline append
- `tests/unit/content-data.test.ts` — `credentials` describe block
- `tests/e2e/mission.spec.ts` — assert programs section + Sean's credential line + JSON-LD `award`
- `tests/e2e/home.spec.ts` — assert footer programs strip + Organization `memberOf`
- `tests/e2e/llms-txt.spec.ts` — assert new section + Sean inline credential

Each task lands one file (or one tightly-coupled pair) and commits before the next.

---

## Task 1: Add the `credentials` data module

**Files:**

- Create: `src/data/credentials.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Append to `tests/unit/content-data.test.ts`:

```ts
import { programs, personalCredentials } from '@/data/credentials';

describe('credentials data', () => {
  it('has at least three programs', () => {
    expect(programs.length).toBeGreaterThanOrEqual(3);
  });

  it('every program has a non-empty name and an https URL', () => {
    for (const p of programs) {
      expect(p.name).toBeTruthy();
      expect(p.url).toMatch(/^https:\/\//);
    }
  });

  it('includes AWS, Google Cloud, and NVIDIA programs', () => {
    const names = programs.map((p) => p.name);
    expect(names.some((n) => /AWS for Startups/i.test(n))).toBe(true);
    expect(names.some((n) => /Google Cloud for Startups/i.test(n))).toBe(true);
    expect(names.some((n) => /NVIDIA Inception/i.test(n))).toBe(true);
  });

  it('every personalCredential.memberName matches a real team member', () => {
    const teamNames = team.map((m) => m.name);
    for (const c of personalCredentials) {
      expect(teamNames).toContain(c.memberName);
    }
  });

  it('Sean has the Anthropic Claude Community Ambassador credential', () => {
    const sean = personalCredentials.find((c) => c.memberName === 'Sean Jungbluth');
    expect(sean).toBeDefined();
    expect(sean!.label).toBe('Anthropic Claude Community Ambassador');
    expect(sean!.issuer).toBe('Anthropic');
    expect(sean!.issuerUrl).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- content-data`
Expected: FAIL with module-not-found / cannot resolve `@/data/credentials`.

- [ ] **Step 3: Create the data module**

Create `src/data/credentials.ts`:

```ts
// src/data/credentials.ts

export interface Program {
  name: string;
  url: string;
  shortLabel?: string;
}

export interface PersonalCredential {
  memberName: string; // must match a name in src/data/team.ts
  label: string;
  url?: string; // optional public directory URL for the holder's credential
  issuer: string; // for JSON-LD affiliation.name
  issuerUrl: string; // for JSON-LD affiliation.url
}

export const programs: Program[] = [
  { name: 'AWS for Startups', url: 'https://aws.amazon.com/startups/' },
  { name: 'Google Cloud for Startups', url: 'https://cloud.google.com/startup' },
  { name: 'NVIDIA Inception', url: 'https://www.nvidia.com/en-us/startups/' },
];

export const personalCredentials: PersonalCredential[] = [
  {
    memberName: 'Sean Jungbluth',
    label: 'Anthropic Claude Community Ambassador',
    issuer: 'Anthropic',
    issuerUrl: 'https://www.anthropic.com/',
  },
];
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- content-data`
Expected: all `credentials data` tests PASS, existing tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/credentials.ts tests/unit/content-data.test.ts
git commit -m "feat(data): add credentials module for programs + personal credentials"
```

---

## Task 2: Update `llms.txt` with Programs & support section

**Files:**

- Modify: `public/llms.txt`
- Modify: `tests/e2e/llms-txt.spec.ts`

- [ ] **Step 1: Write the failing e2e assertions**

Append to `tests/e2e/llms-txt.spec.ts` (inside the existing single test, after the `LDC` assertion):

```ts
expect(body).toContain('## Programs & support');
expect(body).toContain('AWS for Startups');
expect(body).toContain('Google Cloud for Startups');
expect(body).toContain('NVIDIA Inception');
expect(body).toContain('Anthropic Claude Community Ambassador');
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- llms-txt`
Expected: FAIL — strings not found in `body`.

- [ ] **Step 3: Edit `public/llms.txt`**

Find the existing line `- **Sean Jungbluth** — CEO / CTO, Founder` under `## Team` and replace it with:

```markdown
- **Sean Jungbluth** — CEO / CTO, Founder · Anthropic Claude Community Ambassador
```

Insert a new section between `## Team`/`## Advisors` and `## Partners` (after the advisors list, before `## Partners`):

```markdown
## Programs & support

BioKEA participates in major cloud and AI infrastructure programs that supply the compute, credits, and engineering support behind the LDC and BioinfoOS:

- **AWS for Startups** — https://aws.amazon.com/startups/
- **Google Cloud for Startups** — https://cloud.google.com/startup
- **NVIDIA Inception** — https://www.nvidia.com/en-us/startups/

Sean Jungbluth is an **Anthropic Claude Community Ambassador**, recognized for contributions to the Claude developer community (https://www.anthropic.com/).
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- llms-txt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add public/llms.txt tests/e2e/llms-txt.spec.ts
git commit -m "docs(llms): add Programs & support section + Sean ambassador credential"
```

---

## Task 3: Add `memberOf` to homepage Organization JSON-LD

**Files:**

- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`

The `Organization` node lives at `src/pages/index.astro:103` (begins `'@type': 'Organization'`, `'@id': 'https://biokea.ai/#org'`). The `mission.astro` JSON-LD has only `Person` nodes — no Organization — so this change is homepage-only. Pages that want to reference the organization use the `@id` URL.

- [ ] **Step 1: Write the failing e2e assertion**

Append to `tests/e2e/home.spec.ts` as a new test:

```ts
test('home Organization JSON-LD includes program memberships', async ({ page }) => {
  await page.goto('/');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const org = parsed['@graph']?.find(
    (node: { '@type': string }) => node['@type'] === 'Organization',
  );
  expect(org).toBeDefined();
  expect(Array.isArray(org.memberOf)).toBe(true);
  const memberNames = org.memberOf.map((m: { name: string }) => m.name);
  expect(memberNames).toContain('AWS for Startups');
  expect(memberNames).toContain('Google Cloud for Startups');
  expect(memberNames).toContain('NVIDIA Inception');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- home`
Expected: FAIL — `org.memberOf` is undefined.

- [ ] **Step 3: Update homepage Organization JSON-LD**

In `src/pages/index.astro`, add an import at the top of the frontmatter (preserve existing imports):

```ts
import { programs } from '@/data/credentials';
```

In the Organization node (currently around lines 102–151), insert a `memberOf` field after `knowsAbout` and before `location`:

```ts
          memberOf: programs.map((p) => ({
            '@type': 'Organization',
            name: p.name,
            url: p.url,
          })),
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- home`
Expected: all home tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/index.astro tests/e2e/home.spec.ts
git commit -m "feat(seo): add Organization.memberOf for cloud + AI startup programs"
```

---

## Task 4: Add `award` + `affiliation` to Sean's Person JSON-LD

**Files:**

- Modify: `src/pages/mission.astro`
- Modify: `tests/e2e/mission.spec.ts`

- [ ] **Step 1: Write the failing e2e assertion**

Append to `tests/e2e/mission.spec.ts` as a new test:

```ts
test('mission Person JSON-LD records Sean Anthropic Ambassador award', async ({ page }) => {
  await page.goto('/mission');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const sean = parsed['@graph']?.find(
    (node: { '@id'?: string }) => node['@id'] === 'https://biokea.ai/mission#sean',
  );
  expect(sean).toBeDefined();
  expect(sean.award).toBe('Anthropic Claude Community Ambassador');
  expect(sean.affiliation?.name).toBe('Anthropic');
  expect(sean.affiliation?.url).toBe('https://www.anthropic.com/');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- mission`
Expected: FAIL — `sean.award` is undefined.

- [ ] **Step 3: Update Sean's Person node**

Add an import to the existing imports at the top of `src/pages/mission.astro`:

```ts
import { personalCredentials } from '@/data/credentials';
```

Add a derived helper at the top of the frontmatter (after the imports):

```ts
const seanCredential = personalCredentials.find((c) => c.memberName === 'Sean Jungbluth');
```

Find the Sean Person node (around lines 177–192). After the `knowsAbout` array, add:

```ts
          ...(seanCredential
            ? {
                award: seanCredential.label,
                affiliation: {
                  '@type': 'Organization',
                  name: seanCredential.issuer,
                  url: seanCredential.issuerUrl,
                },
              }
            : {}),
```

The full Sean node should now read:

```ts
        {
          '@type': 'Person',
          '@id': 'https://biokea.ai/mission#sean',
          name: 'Sean Jungbluth',
          jobTitle: 'CEO / CTO, Founder',
          worksFor: { '@id': 'https://biokea.ai/#org' },
          image: 'https://biokea.ai/assets/images/portrait-sean.webp',
          knowsAbout: [
            'Environmental DNA',
            'Metabarcoding',
            'Biodiversity informatics',
            'Long-read sequencing',
            'FAIR data',
            'AT Protocol',
          ],
          ...(seanCredential
            ? {
                award: seanCredential.label,
                affiliation: {
                  '@type': 'Organization',
                  name: seanCredential.issuer,
                  url: seanCredential.issuerUrl,
                },
              }
            : {}),
        },
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- mission`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/mission.astro tests/e2e/mission.spec.ts
git commit -m "feat(seo): add Person.award + affiliation for Sean ambassador credential"
```

---

## Task 5: Create the `ProgramsStrip` component

**Files:**

- Create: `src/components/sections/ProgramsStrip.astro`

This task ships an unused component (no caller yet). Tasks 6 and 7 wire it in. Splitting this way keeps each commit small and lets visual review happen via `localhost:4321` in tasks 6/7 once the strip is rendered somewhere.

- [ ] **Step 1: Create the component**

Create `src/components/sections/ProgramsStrip.astro`:

```astro
---
// src/components/sections/ProgramsStrip.astro
import { programs } from '@/data/credentials';

interface Props {
  variant: 'compact' | 'expanded';
}
const { variant } = Astro.props;

// Render program names as inline links separated by commas (compact) or middots (expanded)
---

{
  variant === 'compact' && (
    <div class="text-xs">
      <p class="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-bright)]">
        Programs & support
      </p>
      <p class="mt-2 text-slate-400 leading-relaxed">
        Supported by{' '}
        {programs.map((p, i) => (
          <>
            <a
              href={p.url}
              rel="noopener"
              class="underline decoration-slate-600 hover:text-slate-200"
            >
              {p.name}
            </a>
            {i < programs.length - 2 && ', '}
            {i === programs.length - 2 && ', and '}
          </>
        ))}
        .
      </p>
    </div>
  )
}

{
  variant === 'expanded' && (
    <section class="max-w-6xl mx-auto px-6 py-12">
      <p class="font-mono text-[11px] tracking-[0.12em] uppercase text-[var(--color-teal)]">
        Programs & support
      </p>
      <p class="mt-3 max-w-[62ch] text-slate-600 leading-relaxed">
        BioKEA is supported by leading cloud and AI infrastructure programs that supply the compute
        and credits behind the LDC and BioinfoOS.
      </p>
      <p class="mt-4 text-[var(--color-ink)]">
        {programs.map((p, i) => (
          <>
            <a
              href={p.url}
              rel="noopener"
              class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
            >
              {p.name}
            </a>
            {i < programs.length - 1 && (
              <span class="text-slate-400 mx-2" aria-hidden="true">
                ·
              </span>
            )}
          </>
        ))}
      </p>
    </section>
  )
}
```

- [ ] **Step 2: Run type check to confirm clean compile**

Run: `npm run check`
Expected: 0 errors, 0 warnings (or no new errors beyond pre-existing baseline).

- [ ] **Step 3: Commit**

```bash
git add src/components/sections/ProgramsStrip.astro
git commit -m "feat(ui): add ProgramsStrip component with compact + expanded variants"
```

---

## Task 6: Render `ProgramsStrip` in the footer (every page)

**Files:**

- Modify: `src/components/layout/Footer.astro`
- Modify: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Write the failing e2e assertion**

Append to `tests/e2e/home.spec.ts` as a new test:

```ts
test('footer renders Programs & support strip with all three programs', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('footer');
  await expect(footer.getByText('Programs & support')).toBeVisible();
  await expect(footer.getByRole('link', { name: 'AWS for Startups' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Google Cloud for Startups' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'NVIDIA Inception' })).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- home`
Expected: FAIL — "Programs & support" not visible in footer.

- [ ] **Step 3: Update `Footer.astro`**

Add an import at the top of the frontmatter (after the existing `marginalia` declaration):

```ts
import ProgramsStrip from '@/components/sections/ProgramsStrip.astro';
```

Insert `<ProgramsStrip variant="compact" />` so it sits between the marginalia row and the existing copyright/social row. The replacement of the relevant block in the template:

```astro
<div class="flex items-center gap-4">
  {
    marginalia.map((m) => (
      <img
        src={m.src}
        alt={m.alt}
        width="200"
        height="200"
        class="h-7 w-7 invert brightness-125 opacity-50"
        loading="lazy"
        aria-hidden="true"
      />
    ))
  }
  <span class="font-mono text-[11px] tracking-[0.16em] uppercase text-slate-300">
    · soil · water · specimen ·
  </span>
</div>

<div class="mt-6 border-t border-slate-800 pt-6">
  <ProgramsStrip variant="compact" />
</div>

<div
  class="mt-6 border-t border-slate-800 pt-6 flex flex-col md:flex-row justify-between gap-6 text-xs"
>
</div>
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- home`
Expected: all home tests PASS.

- [ ] **Step 5: Manually eyeball localhost:4321**

Dev server is already running. Open `http://localhost:4321/` and scroll to the footer. Confirm the Programs strip renders cleanly above the social/press-kit row, and that the program names are readable links on the dark footer background. Click each link to confirm `target` and URL.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/Footer.astro tests/e2e/home.spec.ts
git commit -m "feat(footer): show Programs & support strip on every page"
```

---

## Task 7: Render `ProgramsStrip` (expanded) on `/mission`

**Files:**

- Modify: `src/pages/mission.astro`
- Modify: `tests/e2e/mission.spec.ts`

- [ ] **Step 1: Write the failing e2e assertion**

Append to `tests/e2e/mission.spec.ts` as a new test:

```ts
test('mission page renders expanded Programs & support section', async ({ page }) => {
  await page.goto('/mission');
  const main = page.locator('main, body');
  await expect(main.getByText('Programs & support').first()).toBeVisible();
  await expect(
    main.getByText(/supported by leading cloud and AI infrastructure programs/i),
  ).toBeVisible();
  await expect(main.getByRole('link', { name: 'AWS for Startups' }).first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'Google Cloud for Startups' }).first()).toBeVisible();
  await expect(main.getByRole('link', { name: 'NVIDIA Inception' }).first()).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- mission`
Expected: FAIL — the framing sentence is not yet in `/mission`.

- [ ] **Step 3: Add the section to `mission.astro`**

Add an import at the top of the frontmatter:

```ts
import ProgramsStrip from '@/components/sections/ProgramsStrip.astro';
```

Insert `<ProgramsStrip variant="expanded" />` as a new section between the team section (which ends with the `figure` containing `moving-day.jpg`) and the existing `<section>` containing `<Eyebrow>PARTNERS</Eyebrow>`. The component already wraps itself in a `<section>` tag, so just place it directly:

```astro
<figcaption class="mt-3 text-xs text-slate-500 leading-relaxed">
  Move-in day, <time datetime="2026-03">March 2026</time>. Austin, Sean, Michelle — and Cora, the
  team's youngest. The 5,000+ sq ft Berkeley warehouse, newly empty and waiting.
</figcaption>

<ProgramsStrip variant="expanded" />

<section class="max-w-6xl mx-auto px-6 py-12">
  <Eyebrow>PARTNERS</Eyebrow>
</section>
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- mission`
Expected: PASS.

- [ ] **Step 5: Manually eyeball localhost:4321/mission**

Confirm the new section sits between team and partners, that the framing sentence reads naturally, and that the three program names render in a single line with middot separators on desktop. Resize down to mobile width and confirm the line wraps cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/pages/mission.astro tests/e2e/mission.spec.ts
git commit -m "feat(mission): add Programs & support section between team and partners"
```

---

## Task 8: Add `credential` prop to `Portrait` and wire Sean's credential

**Files:**

- Modify: `src/components/ui/Portrait.astro`
- Modify: `src/pages/mission.astro`
- Modify: `tests/e2e/mission.spec.ts`

- [ ] **Step 1: Write the failing e2e assertion**

Append to `tests/e2e/mission.spec.ts` as a new test:

```ts
test('Sean portrait shows the Anthropic Ambassador credential line', async ({ page }) => {
  await page.goto('/mission');
  const seanPortrait = page.locator('article', { hasText: 'Sean Jungbluth' }).first();
  await expect(seanPortrait.getByText('Anthropic Claude Community Ambassador')).toBeVisible();
});

test('Other team portraits do not render a credential line', async ({ page }) => {
  await page.goto('/mission');
  const austinPortrait = page.locator('article', { hasText: 'Austin Baker' }).first();
  await expect(austinPortrait.getByText('Anthropic Claude Community Ambassador')).toHaveCount(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:e2e -- mission`
Expected: the new "Sean portrait" test FAILS (text not present); the other-portraits test passes vacuously.

- [ ] **Step 3: Extend `Portrait.astro` with optional credential**

Replace the contents of `src/components/ui/Portrait.astro` with:

```astro
---
// src/components/ui/Portrait.astro
interface Props {
  src: string;
  alt: string;
  name: string;
  role: string;
  credential?: string;
  size?: 'md' | 'sm';
}
const { src, alt, name, role, credential, size = 'md' } = Astro.props;

const padding = size === 'sm' ? 'p-2' : 'p-3';
const nameSize = size === 'sm' ? 'text-xs' : 'text-sm';
const roleSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
const credSize = size === 'sm' ? 'text-[8px]' : 'text-[9px]';
---

<article
  class:list={['bg-[var(--color-cream)] border border-[rgba(120,53,15,0.15)] rounded-sm', padding]}
>
  <img
    src={src}
    alt={alt}
    width="500"
    height="550"
    class="w-full rounded-[2px] block aspect-[10/11] object-cover"
    loading="lazy"
  />
  <p class:list={['font-semibold mt-2 text-[var(--color-ink)]', nameSize]}>{name}</p>
  <p class:list={['font-mono tracking-[0.1em] uppercase text-[var(--color-teal)] mt-1', roleSize]}>
    {role}
  </p>
  {
    credential && (
      <p
        class:list={[
          'font-mono tracking-[0.1em] uppercase text-[var(--color-ochre)] mt-1',
          credSize,
        ]}
      >
        {credential}
      </p>
    )
  }
</article>
```

The credential line uses `--color-ochre` to visually differentiate from the role line (which is teal). The user can adjust to a different token if preferred during visual review.

- [ ] **Step 4: Wire credentials lookup in `mission.astro`**

`personalCredentials` is already imported (Task 4 added it). Add a derived helper near the existing `seanCredential` line in the frontmatter:

```ts
const credentialFor = (name: string) =>
  personalCredentials.find((c) => c.memberName === name)?.label;
```

Update the team and advisors map calls to pass `credential`:

Replace the existing team-grid block:

```astro
{
  team
    .filter((p) => p.tier !== 'advisor')
    .map((p) => (
      <div>
        <Portrait src={p.image} alt={p.alt} name={p.name} role={p.role} />
        {p.bio && <p class="mt-3 text-xs text-slate-600 leading-relaxed">{p.bio}</p>}
      </div>
    ))
}
```

with:

```astro
{
  team
    .filter((p) => p.tier !== 'advisor')
    .map((p) => (
      <div>
        <Portrait
          src={p.image}
          alt={p.alt}
          name={p.name}
          role={p.role}
          credential={credentialFor(p.name)}
        />
        {p.bio && <p class="mt-3 text-xs text-slate-600 leading-relaxed">{p.bio}</p>}
      </div>
    ))
}
```

And the advisors block:

```astro
{
  team
    .filter((p) => p.tier === 'advisor')
    .map((p) => <Portrait src={p.image} alt={p.alt} name={p.name} role={p.role} size="sm" />)
}
```

with:

```astro
{
  team
    .filter((p) => p.tier === 'advisor')
    .map((p) => (
      <Portrait
        src={p.image}
        alt={p.alt}
        name={p.name}
        role={p.role}
        credential={credentialFor(p.name)}
        size="sm"
      />
    ))
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test:e2e -- mission`
Expected: all mission tests PASS, including the new "Sean portrait" and "Other team portraits" tests.

- [ ] **Step 6: Manually eyeball `localhost:4321/mission`**

Confirm:

- Sean's portrait now shows three lines: name, role, "ANTHROPIC CLAUDE COMMUNITY AMBASSADOR"
- Michelle, Austin, Sunit, Greg portraits remain unchanged (two lines)
- Spacing between role and credential matches the existing role-margin (mt-1)
- The ochre color reads as distinct from teal but harmonious with the existing palette. If it clashes, adjust the `text-[var(--color-ochre)]` token in `Portrait.astro` (e.g., to `text-[var(--color-teal)]` for unified treatment, or `text-slate-600` for muted treatment).

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/Portrait.astro src/pages/mission.astro tests/e2e/mission.spec.ts
git commit -m "feat(mission): show Sean's Anthropic Ambassador credential on portrait"
```

---

## Final verification

After all 8 tasks land:

- [ ] **Run the full test suite:**

  ```bash
  npm run check && npm test && npm run test:e2e
  ```

  Expected: all green.

- [ ] **Walk the site at `localhost:4321`:**
  - `/` — footer Programs strip visible
  - `/mission` — footer strip + expanded mission section + Sean's credential line
  - `/lab`, `/projects`, `/pipeline`, `/contact`, `/agentis` — footer strip visible on every page
  - View page source on `/` — confirm `Organization.memberOf` array in JSON-LD
  - View page source on `/mission` — confirm Sean Person node has `award` and `affiliation`
  - Fetch `http://localhost:4321/llms.txt` — confirm "Programs & support" section + Sean inline credential

- [ ] **No follow-up work expected** unless the visual review surfaces palette/spacing changes — those are one-line edits to `ProgramsStrip.astro` or `Portrait.astro`.
