# DaKineDiving + Anthropic milestones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land DaKineDiving as an `originIndependent` project with an award badge + dual video links, expand Sean's `/mission` portrait to show two credentials (Ambassador + Challenge winner), reflect both in JSON-LD and `llms.txt`, and add company-timeline milestones for both validation events.

**Architecture:** All content originates from typed data modules (`src/data/projects.ts`, `src/data/credentials.ts`, `src/data/milestones.ts`). The `Project` interface gains two additive optional fields. `Portrait.astro` swaps its single-credential prop for a string array. `ProjectCard.astro` gains two conditional render blocks (award badge, videos row) and a small fix to its footer for live projects that lack a `link`.

**Tech Stack:** Astro 6 (server), TypeScript strict, Tailwind 4, Vitest (unit), Playwright (e2e). No new dependencies.

**Source spec:** `docs/superpowers/specs/2026-04-25-dakinediving-design.md`

**User instruction:** Stay on `main`. **Do not commit per task** — single consolidated commit at the very end after the final review.

---

## File structure

**Modify only — no new files this round:**

- `src/data/projects.ts` — add `ProjectAward` + `ProjectVideo` interfaces, extend `Project`, append DaKineDiving entry
- `src/data/credentials.ts` — add Sean's second `PersonalCredential`; export new `credentialsFor` helper
- `src/data/milestones.ts` — append the 2025-10 contest-win and 2026-02 ambassador milestones (slotted chronologically)
- `src/components/ui/Portrait.astro` — replace `credential?: string` prop with `credentials?: string[]`; render each as its own ochre line
- `src/components/ui/ProjectCard.astro` — render award badge, videos row, and fix the footer block for live projects without `link`
- `src/pages/mission.astro` — replace local `credentialFor`/`seanCredential` with `credentialsFor`; update both Portrait call-sites; update Sean's Person JSON-LD to render `award` as an array + add `sameAs`
- `public/llms.txt` — update Sean's Team line; expand the Programs & support paragraph
- `tests/unit/content-data.test.ts` — extend with award/videos/multi-credential/milestone assertions
- `tests/e2e/projects.spec.ts` — DaKineDiving card, award badge, video links, footer behavior
- `tests/e2e/mission.spec.ts` — Sean's second credential line; both new milestones visible; updated JSON-LD assertions (`award` as array, `sameAs` URL)
- `tests/e2e/llms-txt.spec.ts` — new content assertions
- `tests/e2e/api-endpoints.spec.ts` — `dakinediving` slug in `/api/projects.json`

---

## Task 1: Extend `Project` schema and append DaKineDiving entry

**Files:**

- Modify: `src/data/projects.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Write failing unit tests**

Append to the existing `describe('projects data', ...)` block in `tests/unit/content-data.test.ts` (it currently lives at the bottom of the file — extend it; if it doesn't exist, create one with these tests). Note: the file already imports `team` and other data modules; add `import { projects } from '@/data/projects';` if it isn't already imported.

```ts
describe('projects data — DaKineDiving', () => {
  it('includes a dakinediving slug', () => {
    const slugs = projects.map((p) => p.slug);
    expect(slugs).toContain('dakinediving');
  });

  it('DaKineDiving entry has an award with https url', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk).toBeDefined();
    expect(dk!.award).toBeDefined();
    expect(dk!.award!.label).toMatch(/Built with Claude Sonnet 4\.5/);
    expect(dk!.award!.url).toMatch(/^https:\/\//);
  });

  it('DaKineDiving entry has two videos with https urls', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk!.videos).toBeDefined();
    expect(dk!.videos!).toHaveLength(2);
    for (const v of dk!.videos!) {
      expect(v.label).toBeTruthy();
      expect(v.url).toMatch(/^https:\/\//);
    }
  });

  it('DaKineDiving is originIndependent and live', () => {
    const dk = projects.find((p) => p.slug === 'dakinediving');
    expect(dk!.originIndependent).toBe(true);
    expect(dk!.status).toBe('live');
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- content-data`
Expected: 4 new tests FAIL because the slug doesn't exist yet (or the schema fields aren't defined).

- [ ] **Step 3: Extend the `Project` interface and append the DaKineDiving entry**

In `src/data/projects.ts`, before the existing `export interface Project { ... }`, add:

```ts
export interface ProjectAward {
  label: string;
  url: string;
}

export interface ProjectVideo {
  label: string;
  url: string;
}
```

Then add two fields to the existing `Project` interface (anywhere; group with the other optional fields):

```ts
  award?: ProjectAward;
  videos?: ProjectVideo[];
```

Append a new entry to the `projects` array (after the `colloquip` entry):

```ts
  {
    slug: 'dakinediving',
    title: "DaKineDiving — real-time dive intelligence for O'ahu",
    summary:
      "A real-time dive intelligence platform for O'ahu, Hawai'i. Combines NOAA tide data, PacIOOS wave buoys, and GBIF biodiversity records to surface conditions, encounter probabilities for 100+ marine species, and Marine Life Conservation District boundaries on an interactive map. Built with Claude Sonnet 4.5.",
    type: 'Web application',
    year: '2025',
    tags: ['marine', 'biodiversity', 'GBIF', 'eDNA-adjacent', 'Hawaii', 'AI-assisted build'],
    status: 'live',
    team: [{ name: 'Sean', lead: true }],
    originIndependent: true,
    originNote:
      "Built by Sean as a solo entry to Anthropic's Built with Claude Sonnet 4.5 Challenge (October 2025); winner of the contest. Surfaced under BioKEA because of the GBIF biodiversity layer; not part of the BioKEA wet-lab pipeline.",
    award: {
      label: 'Built with Claude Sonnet 4.5 Challenge — Winner',
      url: 'https://x.com/alexalbert__/status/1978220407716245581',
    },
    videos: [
      {
        label: 'Walkthrough',
        url: 'https://drive.google.com/file/d/1eYVxautzXZERbk1Oez_VfE5xeEnx85dR/view?usp=drive_link',
      },
      {
        label: 'Walkthrough · biology features',
        url: 'https://drive.google.com/file/d/1artFfslcNR90__Jx9xeEAYPUDBjUkeAL/view?usp=sharing',
      },
    ],
  },
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- content-data`
Expected: all tests in the file PASS, including the 4 new DaKineDiving cases.

- [ ] **Step 5: Do not commit** — leave changes in working tree.

---

## Task 2: Add the second PersonalCredential and `credentialsFor` helper

**Files:**

- Modify: `src/data/credentials.ts`
- Modify: `tests/unit/content-data.test.ts`

- [ ] **Step 1: Write failing unit tests**

Append to the existing `describe('credentials data', ...)` block in `tests/unit/content-data.test.ts`:

```ts
import { credentialsFor } from '@/data/credentials';

describe('credentials data — Sean has two credentials', () => {
  it('credentialsFor returns 2 entries for Sean Jungbluth', () => {
    const found = credentialsFor('Sean Jungbluth');
    expect(found).toHaveLength(2);
  });

  it('Sean credential labels include Ambassador and Challenge Winner', () => {
    const labels = credentialsFor('Sean Jungbluth').map((c) => c.label);
    expect(labels).toContain('Anthropic Claude Community Ambassador');
    expect(labels).toContain('Built with Claude Sonnet 4.5 Challenge — Winner');
  });

  it('Challenge credential has a public url', () => {
    const challenge = credentialsFor('Sean Jungbluth').find((c) => c.label.includes('Challenge'));
    expect(challenge?.url).toMatch(/^https:\/\/x\.com\//);
  });
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- content-data`
Expected: 3 new tests FAIL (`credentialsFor` not exported, only one credential for Sean).

- [ ] **Step 3: Update `src/data/credentials.ts`**

Append a second entry to `personalCredentials`:

```ts
  {
    memberName: 'Sean Jungbluth',
    label: 'Built with Claude Sonnet 4.5 Challenge — Winner',
    issuer: 'Anthropic',
    issuerUrl: 'https://www.anthropic.com/',
    url: 'https://x.com/alexalbert__/status/1978220407716245581',
  },
```

After the array, export the new helper:

```ts
export const credentialsFor = (name: string): PersonalCredential[] =>
  personalCredentials.filter((c) => c.memberName === name);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- content-data`
Expected: all tests PASS.

- [ ] **Step 5: Do not commit.**

---

## Task 3: Add the two new milestones

**Files:**

- Modify: `src/data/milestones.ts`
- Modify: `tests/unit/content-data.test.ts` (append milestone-content assertion)
- Modify: `tests/e2e/mission.spec.ts` (assert milestones are visible on `/mission`)

- [ ] **Step 1: Write failing unit + e2e assertions**

In `tests/unit/content-data.test.ts`, append to the existing `describe('milestones data', ...)` block (or create one if absent):

```ts
describe('milestones data — Anthropic events', () => {
  it('includes the 2025-10 Challenge winner milestone', () => {
    const m = milestones.find((m) => m.date === '2025-10');
    expect(m).toBeDefined();
    expect(m!.title).toMatch(/Built with Claude Sonnet 4\.5 Challenge/i);
  });

  it('includes the 2026-02 Ambassador milestone', () => {
    const m = milestones.find((m) => m.date === '2026-02');
    expect(m).toBeDefined();
    expect(m!.title).toMatch(/Ambassador/i);
  });

  it('milestones remain in chronological order', () => {
    const dates = milestones.map((m) => m.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
```

In `tests/e2e/mission.spec.ts`, append a new test:

```ts
test('mission page shows the new Anthropic milestones', async ({ page }) => {
  await page.goto('/mission');
  await expect(page.getByText(/Built with Claude Sonnet 4\.5 Challenge/i)).toBeVisible();
  await expect(page.getByText(/Anthropic Claude Community Ambassador/i).first()).toBeVisible();
  // Both date timestamps should appear in the milestone list
  await expect(page.locator('[data-milestone-date][datetime="2025-10"]')).toBeVisible();
  await expect(page.locator('[data-milestone-date][datetime="2026-02"]')).toBeVisible();
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test -- content-data && npm run test:e2e -- mission`
Expected: new milestone assertions FAIL.

- [ ] **Step 3: Update `src/data/milestones.ts`**

Insert these entries chronologically. The current order is `2025-03`, `2025-04`, `2025-09`, `2025-11`, `2026-03`, `2026-04`. Insert `2025-10` between `2025-09` and `2025-11`; insert `2026-02` between `2025-11` and `2026-03`. The full new array should read (existing entries plus the two insertions):

```ts
  {
    date: '2025-09',
    title: 'Berkeley lab planning begins',
    body: 'Start planning the 5,000+ sq ft Berkeley lab space.',
  },
  {
    date: '2025-10',
    title: 'Built with Claude Sonnet 4.5 Challenge — winner',
    body:
      "Sean wins Anthropic's Built with Claude Sonnet 4.5 Challenge with DaKineDiving, a real-time dive intelligence platform for O'ahu.",
  },
  {
    date: '2025-11',
    title: 'Contracts begin; ONT Promethion 2 arrives',
    body: 'Major new contracts begin and the Oxford Nanopore Promethion 2 sequencer lands on site.',
  },
  {
    date: '2026-02',
    title: 'Sean becomes Anthropic Claude Community Ambassador',
    body:
      "Sean joins the Claude Community Ambassador program, deepening BioKEA's ties to the Anthropic developer community.",
  },
  {
    date: '2026-03',
    title: 'Move into Berkeley space',
    body: 'Team takes possession of the 5,000+ sq ft Berkeley lab.',
  },
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- content-data && npm run test:e2e -- mission`
Expected: all milestone tests PASS.

- [ ] **Step 5: Do not commit.**

---

## Task 4: Update `Portrait.astro` to accept multiple credentials

**Files:**

- Modify: `src/components/ui/Portrait.astro`

This task ships an interface change without updating callers. Task 5 wires the new prop in `mission.astro`. We split this way because the component change can be reviewed in isolation. **Tests will temporarily fail between Task 4 and Task 5** — accept that and run them again at the end of Task 5.

- [ ] **Step 1: Replace the `credential?: string` prop with `credentials?: string[]`**

The current component frontmatter:

```ts
interface Props {
  src: string;
  alt: string;
  name: string;
  role: string;
  credential?: string;
  postNominal?: string;
  size?: 'md' | 'sm';
}
const { src, alt, name, role, credential, postNominal, size = 'md' } = Astro.props;
```

Replace with:

```ts
interface Props {
  src: string;
  alt: string;
  name: string;
  role: string;
  credentials?: string[];
  postNominal?: string;
  size?: 'md' | 'sm';
}
const { src, alt, name, role, credentials = [], postNominal, size = 'md' } = Astro.props;
```

The current credential render block:

```text
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
```

Replace with:

```text
  {
    credentials.map((c) => (
      <p
        class:list={[
          'font-mono tracking-[0.1em] uppercase text-[var(--color-ochre)] mt-1',
          credSize,
        ]}
      >
        {c}
      </p>
    ))
  }
```

- [ ] **Step 2: Run `npm run check` — expect failures because callers still use the old prop**

Run: `npm run check`
Expected: TypeScript errors at the two `mission.astro` Portrait call-sites that pass `credential={...}` (now removed from the interface). This is intentional. Task 5 fixes them.

- [ ] **Step 3: Do not commit.**

---

## Task 5: Wire `credentialsFor` into `mission.astro` (Portrait calls + JSON-LD)

**Files:**

- Modify: `src/pages/mission.astro`
- Modify: `tests/e2e/mission.spec.ts`

- [ ] **Step 1: Write failing e2e assertions**

In `tests/e2e/mission.spec.ts`, append:

```ts
test('Sean portrait shows both ambassador and challenge winner credential lines', async ({
  page,
}) => {
  await page.goto('/mission');
  const seanPortrait = page.locator('article', { hasText: 'Sean Jungbluth' }).first();
  await expect(seanPortrait.getByText('Anthropic Claude Community Ambassador')).toBeVisible();
  await expect(
    seanPortrait.getByText('Built with Claude Sonnet 4.5 Challenge — Winner'),
  ).toBeVisible();
});

test('mission Person JSON-LD reflects both Sean credentials', async ({ page }) => {
  await page.goto('/mission');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const sean = parsed['@graph']?.find(
    (node: { '@id'?: string }) => node['@id'] === 'https://biokea.ai/mission#sean',
  );
  expect(sean).toBeDefined();
  expect(Array.isArray(sean.award)).toBe(true);
  expect(sean.award).toContain('Anthropic Claude Community Ambassador');
  expect(sean.award).toContain('Built with Claude Sonnet 4.5 Challenge — Winner');
  expect(sean.affiliation?.name).toBe('Anthropic');
  expect(Array.isArray(sean.sameAs)).toBe(true);
  expect(sean.sameAs).toContain('https://x.com/alexalbert__/status/1978220407716245581');
});
```

The pre-existing test `mission Person JSON-LD records Sean Anthropic Ambassador award` still asserts `sean.award === 'Anthropic Claude Community Ambassador'` (a string equality on what is now an array). Update that test in place to use array containment:

```ts
test('mission Person JSON-LD records Sean Anthropic Ambassador award', async ({ page }) => {
  await page.goto('/mission');
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  const parsed = JSON.parse(ld!);
  const sean = parsed['@graph']?.find(
    (node: { '@id'?: string }) => node['@id'] === 'https://biokea.ai/mission#sean',
  );
  expect(sean).toBeDefined();
  expect(sean.award).toContain('Anthropic Claude Community Ambassador');
  expect(sean.affiliation?.name).toBe('Anthropic');
  expect(sean.affiliation?.url).toBe('https://www.anthropic.com/');
});
```

The pre-existing single-credential test `Sean portrait shows the Anthropic Ambassador credential line` (lines ~48-52) keeps working because `getByText('Anthropic Claude Community Ambassador')` still matches the first credential line — leave it untouched.

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:e2e -- mission`
Expected: new tests FAIL; pre-existing JSON-LD test FAILS until step 3 lands the array shape.

- [ ] **Step 3: Update `src/pages/mission.astro`**

In the frontmatter, replace:

```ts
import { personalCredentials } from '@/data/credentials';

const credentialFor = (name: string) => personalCredentials.find((c) => c.memberName === name);

const seanCredential = credentialFor('Sean Jungbluth');
```

with:

```ts
import { credentialsFor } from '@/data/credentials';

const seanCredentials = credentialsFor('Sean Jungbluth');
```

Update the team-grid Portrait call. Currently:

```text
              <Portrait
                src={p.image}
                alt={p.alt}
                name={p.name}
                role={p.role}
                postNominal={p.postNominal}
                credential={credentialFor(p.name)?.label}
              />
```

Replace with:

```text
              <Portrait
                src={p.image}
                alt={p.alt}
                name={p.name}
                role={p.role}
                postNominal={p.postNominal}
                credentials={credentialsFor(p.name).map((c) => c.label)}
              />
```

Update the advisors-grid Portrait call the same way:

```text
              <Portrait
                src={p.image}
                alt={p.alt}
                name={p.name}
                role={p.role}
                postNominal={p.postNominal}
                credentials={credentialsFor(p.name).map((c) => c.label)}
                size="sm"
              />
```

Update Sean's Person node JSON-LD. Currently:

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

Replace with:

```ts
          ...(seanCredentials.length > 0
            ? {
                award: seanCredentials.map((c) => c.label),
                affiliation: {
                  '@type': 'Organization',
                  name: seanCredentials[0].issuer,
                  url: seanCredentials[0].issuerUrl,
                },
                sameAs: seanCredentials.filter((c) => c.url).map((c) => c.url!),
              }
            : {}),
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run check && npm run test:e2e -- mission`
Expected: TypeScript clean; all mission e2e tests PASS, including the two new tests and the updated `Sean Anthropic Ambassador award` test.

- [ ] **Step 5: Do not commit.**

---

## Task 6: Update `llms.txt` and its e2e test

**Files:**

- Modify: `public/llms.txt`
- Modify: `tests/e2e/llms-txt.spec.ts`

- [ ] **Step 1: Write failing assertions**

Append to the existing single test in `tests/e2e/llms-txt.spec.ts`, after the final `expect(body).toContain('LDC');` assertion:

```ts
expect(body).toContain('Built with Claude Sonnet 4.5 Challenge winner');
expect(body).toContain('https://x.com/alexalbert__/status/1978220407716245581');
```

- [ ] **Step 2: Run test to verify failure**

Run: `npm run test:e2e -- llms-txt`
Expected: FAIL — strings not yet in the body.

- [ ] **Step 3: Edit `public/llms.txt`**

Find Sean's existing Team line:

```markdown
- **Sean Jungbluth, PhD** — CEO / CTO, Founder · Anthropic Claude Community Ambassador
```

Replace with:

```markdown
- **Sean Jungbluth, PhD** — CEO / CTO, Founder · Anthropic Claude Community Ambassador · Built with Claude Sonnet 4.5 Challenge winner
```

Find the existing paragraph (currently the closing line of the Programs & support section):

```markdown
Sean Jungbluth is an **Anthropic Claude Community Ambassador**, recognized for contributions to the Claude developer community (https://www.anthropic.com/).
```

Replace with:

```markdown
Sean Jungbluth is an **Anthropic Claude Community Ambassador** (joined February 2026) and winner of Anthropic's **Built with Claude Sonnet 4.5 Challenge** (October 2025) — recognized for contributions to the Claude developer community (https://www.anthropic.com/, https://x.com/alexalbert__/status/1978220407716245581).
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run test:e2e -- llms-txt`
Expected: PASS.

- [ ] **Step 5: Do not commit.**

---

## Task 7: Render award badge + videos row + footer fix in `ProjectCard.astro`

**Files:**

- Modify: `src/components/ui/ProjectCard.astro`
- Modify: `tests/e2e/projects.spec.ts`

This is the visual surface of the feature. After Task 7, do a manual visual review at `localhost:4321/projects`.

- [ ] **Step 1: Write failing e2e assertions**

Append to `tests/e2e/projects.spec.ts`:

```ts
test('DaKineDiving card renders with award badge and video links', async ({ page }) => {
  await page.goto('/projects');
  const card = page.locator('article').filter({ hasText: 'DaKineDiving' });
  await expect(card).toBeVisible();

  // Award badge linked to the X post, opens in new tab
  const awardLink = card.getByRole('link', { name: /Built with Claude Sonnet 4\.5 Challenge/ });
  await expect(awardLink).toBeVisible();
  await expect(awardLink).toHaveAttribute(
    'href',
    'https://x.com/alexalbert__/status/1978220407716245581',
  );
  await expect(awardLink).toHaveAttribute('target', '_blank');
  await expect(awardLink).toHaveAttribute('rel', /noopener/);

  // Both video labels render as links
  const videoOne = card.getByRole('link', { name: 'Walkthrough' });
  await expect(videoOne).toBeVisible();
  await expect(videoOne).toHaveAttribute('target', '_blank');

  const videoTwo = card.getByRole('link', { name: 'Walkthrough · biology features' });
  await expect(videoTwo).toBeVisible();
});

test('DaKineDiving card does not show "Revealing soon" fallback in its footer', async ({
  page,
}) => {
  await page.goto('/projects');
  const card = page.locator('article').filter({ hasText: 'DaKineDiving' });
  await expect(card.getByText(/Revealing soon/i)).toHaveCount(0);
});
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:e2e -- projects`
Expected: 2 new tests FAIL.

- [ ] **Step 3: Update `src/components/ui/ProjectCard.astro`**

Three render changes inside the `<div class="p-6 flex-1 flex flex-col">` block.

**(a)** Insert the award badge right after the title `<h3>` (before the partner block). Find:

```text
    <h3 class="mt-2 text-lg font-semibold text-[var(--color-ink)] leading-tight">
      {project.title}
    </h3>

    {
      project.partner && (
```

Replace with:

```text
    <h3 class="mt-2 text-lg font-semibold text-[var(--color-ink)] leading-tight">
      {project.title}
    </h3>

    {
      project.award && (
        <a
          href={project.award.url}
          target="_blank"
          rel="noopener noreferrer"
          class="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-[0.1em] uppercase bg-[var(--color-ochre)] text-[var(--color-cream)] hover:opacity-90 self-start"
        >
          🏆 {project.award.label}
        </a>
      )
    }

    {
      project.partner && (
```

**(b)** Insert the videos row between the summary `<p>` and the existing originIndependent block. Find:

```text
    <p class="mt-3 text-sm text-slate-600 leading-relaxed">{project.summary}</p>

    {
      project.originIndependent && (
```

Replace with:

```text
    <p class="mt-3 text-sm text-slate-600 leading-relaxed">{project.summary}</p>

    {
      project.videos && project.videos.length > 0 && (
        <div class="mt-3 text-xs text-slate-600">
          <span class="font-mono uppercase tracking-[0.1em] text-[var(--color-teal)]">Videos</span>
          {project.videos.map((v, i) => (
            <>
              {i === 0 ? ' ' : (
                <span class="text-slate-400 mx-1" aria-hidden="true">·</span>
              )}
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                class="underline decoration-slate-400 hover:text-[var(--color-teal)]"
              >
                {v.label}
              </a>
            </>
          ))}
        </div>
      )
    }

    {
      project.originIndependent && (
```

**(c)** Fix the footer so live projects without a `link` don't render the "Revealing soon" fallback. Find:

```text
    <div class="mt-5 pt-4 border-t border-slate-900/10">
      {
        isLive && project.link ? (
          <a
            href={project.link}
            rel="noopener"
            target="_blank"
            class="font-mono text-[12px] text-[var(--color-pink)]"
          >
            {project.link.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
          </a>
        ) : (
          <p class="font-mono text-[11px] tracking-[0.08em] text-slate-500">
            {project.revealTarget ? `Target reveal · ${project.revealTarget}` : 'Revealing soon'}
          </p>
        )
      }
    </div>
```

Replace with:

```text
    {
      (isLive && project.link) || !isLive ? (
        <div class="mt-5 pt-4 border-t border-slate-900/10">
          {isLive && project.link ? (
            <a
              href={project.link}
              rel="noopener"
              target="_blank"
              class="font-mono text-[12px] text-[var(--color-pink)]"
            >
              {project.link.replace(/^https?:\/\//, '').replace(/\/$/, '')} ↗
            </a>
          ) : (
            <p class="font-mono text-[11px] tracking-[0.08em] text-slate-500">
              {project.revealTarget ? `Target reveal · ${project.revealTarget}` : 'Revealing soon'}
            </p>
          )}
        </div>
      ) : null
    }
```

This causes the entire footer block to render only when there's a meaningful affordance: a real link for live projects, or the "Revealing soon"/"Target reveal" text for non-live ones. Live projects with `videos` but no `link` (DaKineDiving) skip the footer entirely.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:e2e -- projects`
Expected: all projects e2e tests PASS, including the existing tests for the Intertidal card and the badges.

- [ ] **Step 5: Manually eyeball localhost:4321/projects**

Confirm:

- DaKineDiving card sits among the others; ochre award badge with trophy emoji is visible just below the title and before the type/year line; clicking it opens the X post in a new tab
- Videos row sits below the summary with "VIDEOS" eyebrow in teal + two middot-separated links
- The bottom footer block (the pink Shiny app link on the Intertidal card) is absent on the DaKineDiving card — there's no orphan "Revealing soon" or empty border-top
- Other project cards are unchanged

- [ ] **Step 6: Do not commit.** Wait for user approval before proceeding.

---

## Task 8: Assert `dakinediving` slug in `/api/projects.json`

**Files:**

- Modify: `tests/e2e/api-endpoints.spec.ts`

- [ ] **Step 1: Write failing assertion**

In the existing `/api/projects.json returns valid projects payload` test, append:

```ts
expect(slugs).toContain('dakinediving');
```

immediately after the existing `expect(slugs).toContain('colloquip');` line.

- [ ] **Step 2: Run test**

Run: `npm run test:e2e -- api-endpoints`

The test should already PASS now because Task 1 added the slug to `projects.ts`. This task exists to lock in the API surface assertion. If it fails, the projects endpoint isn't reading the data module — investigate `src/pages/api/projects.json.ts`.

- [ ] **Step 3: Do not commit.**

---

## Final verification

After all 8 tasks land:

- [ ] **Run the full test suite:**

  ```bash
  npm run check && npm test && npm run test:e2e
  ```

  Expected: all green (target ≥ 50 e2e tests + ≥ 22 unit tests).

- [ ] **Walk the site at `localhost:4321`:**
  - `/projects` — DaKineDiving card with award badge + videos row; existing cards unchanged
  - `/mission` — Sean's portrait shows two ochre credential lines (Ambassador, Challenge winner); milestone list shows the 2025-10 and 2026-02 entries in chronological place
  - `/mission` view-source — Sean's Person JSON-LD has `award` as an array, `sameAs` containing the X URL, `affiliation.name === 'Anthropic'`
  - `/llms.txt` — Sean's line has both credentials; Programs & support paragraph lists both events with the X URL
  - Footer Programs strip on every page is unchanged

- [ ] **Single consolidated commit** of all 12 modified files (per user instruction). The commit message should describe DaKineDiving + the milestone additions + the credential expansion + the schema additions, in that order.

- [ ] **Final whole-branch code review** before committing — dispatch the code-reviewer agent across the working-tree changes.
