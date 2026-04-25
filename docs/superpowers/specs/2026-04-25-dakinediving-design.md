# DaKineDiving project + Anthropic milestones — design

**Date:** 2026-04-25
**Status:** Draft, pending user review

## Problem

Sean built **DaKineDiving**, a real-time dive intelligence platform for
O'ahu, as a solo entry to Anthropic's _Built with Claude Sonnet 4.5_
Challenge in October 2025 — and won the contest. In February 2026 Sean
also joined Anthropic's Claude Community Ambassador program. Neither of
these is currently surfaced on the BioKEA website, on `/mission`, in
JSON-LD, or in `llms.txt`.

The project is software, not BioKEA wet-lab biology, but its GBIF marine
biodiversity layer connects directly to BioKEA's eDNA / biodiversity
informatics theme. The contest win and Ambassador appointment are
third-party validations of Sean's AI-assisted-build practice that
strengthen the company's "AI co. with a wet-lab moat" thesis.

## Goals

- Add DaKineDiving to `/projects` with provenance honest about its
  origin (Sean's solo contest entry, not BioKEA lab work).
- Make the contest win prominent on the project card so visitors don't
  miss the third-party validation.
- Expand Sean's `/mission` portrait to show both Anthropic credentials
  (Ambassador + Challenge winner) without other portraits changing.
- Reflect both credentials in JSON-LD (`Person.award` as array,
  `sameAs` including the X post URL) and `llms.txt` so LLM agents
  surface them.
- Add company-timeline milestones for both events so the `/mission`
  milestone block reflects the full validation arc.

## Non-goals

- No homepage callout (Sean's personal credential should not pull focus
  from the BioKEA company thesis).
- No hero image for DaKineDiving in this pass (Sean can drop a screenshot
  at `public/assets/images/project-dakinediving.webp` later — wiring will
  be a one-line edit).
- No new pages, no new top-level navigation, no new components beyond
  the existing `ProjectCard` extension.
- No new top-level section in `llms.txt` for DaKineDiving — the project
  is already exposed via the existing `/api/projects.json` link in
  `llms.txt`.

## Design

### Project entry (data)

Append to `src/data/projects.ts`:

```ts
{
  slug: 'dakinediving',
  title: 'DaKineDiving — real-time dive intelligence for O\'ahu',
  summary:
    'A real-time dive intelligence platform for O\'ahu, Hawai\'i. Combines NOAA tide data, PacIOOS wave buoys, and GBIF biodiversity records to surface conditions, encounter probabilities for 100+ marine species, and Marine Life Conservation District boundaries on an interactive map. Built with Claude Sonnet 4.5.',
  type: 'Web application',
  year: '2025',
  tags: ['marine', 'biodiversity', 'GBIF', 'eDNA-adjacent', 'Hawaii', 'AI-assisted build'],
  status: 'live',
  team: [{ name: 'Sean', lead: true }],
  originIndependent: true,
  originNote: 'Built by Sean as a solo entry to Anthropic\'s Built with Claude Sonnet 4.5 Challenge (October 2025); winner of the contest. Surfaced under BioKEA because of the GBIF biodiversity layer; not part of the BioKEA wet-lab pipeline.',
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
}
```

### Schema additions

Two optional fields on `Project` in `src/data/projects.ts`:

```ts
export interface ProjectAward {
  label: string;
  url: string;
}

export interface ProjectVideo {
  label: string;
  url: string;
}

export interface Project {
  // ... existing fields
  award?: ProjectAward;
  videos?: ProjectVideo[];
}
```

Both are additive; all existing project entries remain valid without
changes.

### `ProjectCard.astro` rendering

Two new conditional blocks. Each renders only when the corresponding
field is set, so existing project cards are unaffected.

**Award badge** — placed near the title, before the type/year line. Pill
style: ochre background, cream text, mono uppercase, ~10px, tight
horizontal padding. Trophy emoji prefix. Inline link to `award.url`,
opens in a new tab.

**Videos row** — placed below the summary. Mono uppercase "VIDEOS"
eyebrow in teal, followed by inline links separated by middots, each
labeled per `videos[i].label`. New tab.

### Sean's second credential line on `/mission`

Add a second `PersonalCredential` entry in `src/data/credentials.ts`:

```ts
{
  memberName: 'Sean Jungbluth',
  label: 'Built with Claude Sonnet 4.5 Challenge — Winner',
  issuer: 'Anthropic',
  issuerUrl: 'https://www.anthropic.com/',
  url: 'https://x.com/alexalbert__/status/1978220407716245581',
},
```

Replace the single-credential helper with a multi-credential helper:

```ts
const credentialsFor = (name: string) => personalCredentials.filter((c) => c.memberName === name);
```

The existing `credentialFor` helper and the derived `seanCredential`
constant in `mission.astro` are removed — the new JSON-LD code below
uses `credentialsFor` directly, so the singular helper has no remaining
consumers.

### `Portrait.astro` extension

Replace the `credential?: string` prop with `credentials?: string[]`.
Render each as a separate `<p>` line in the existing ochre style, with
`mt-1` between them. When the array is empty or undefined, no extra
lines render.

In `src/pages/mission.astro`, update both Portrait call-sites to pass:

```astro
credentials={credentialsFor(p.name).map((c) => c.label)}
```

### JSON-LD on `/mission`

Update Sean's Person node to render `award` as an array and add `sameAs`
for credentials with public URLs:

```ts
const seanCredentials = credentialsFor('Sean Jungbluth');
// ...
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

Schema.org allows `Person.award` to be a single value or an array;
`sameAs` is an array of URLs identifying the same entity. The X post
URL serves as a public reference for the contest win.

### Milestones

Append to `src/data/milestones.ts`, slotted chronologically:

```ts
{
  date: '2025-10',
  title: 'Built with Claude Sonnet 4.5 Challenge — winner',
  body: 'Sean wins Anthropic\'s Built with Claude Sonnet 4.5 Challenge with DaKineDiving, a real-time dive intelligence platform for O\'ahu.',
},
{
  date: '2026-02',
  title: 'Sean becomes Anthropic Claude Community Ambassador',
  body: 'Sean joins the Claude Community Ambassador program, deepening BioKEA\'s ties to the Anthropic developer community.',
},
```

Existing milestones must remain in chronological order. Insert the
2025-10 entry between the 2025-09 lab-planning milestone and the 2025-11
contracts milestone. Insert the 2026-02 entry between 2025-11 and
2026-03.

### `llms.txt` updates

Three edits to `public/llms.txt`:

1. Sean's Team line:

   ```markdown
   - **Sean Jungbluth, PhD** — CEO / CTO, Founder · Anthropic Claude Community Ambassador · Built with Claude Sonnet 4.5 Challenge winner
   ```

2. The existing Programs & support paragraph mentioning Sean:

   ```markdown
   Sean Jungbluth is an **Anthropic Claude Community Ambassador** (joined February 2026) and winner of Anthropic's **Built with Claude Sonnet 4.5 Challenge** (October 2025) — recognized for contributions to the Claude developer community (https://www.anthropic.com/, https://x.com/alexalbert__/status/1978220407716245581).
   ```

3. No new top-level section. The DaKineDiving project is exposed
   through the existing `/api/projects.json` link already in `llms.txt`,
   which will surface the new `award` and `videos` fields once the
   schema is extended.

### Tests

**Unit** (`tests/unit/content-data.test.ts`):

- `projects` array contains a `dakinediving` slug
- DaKineDiving entry has `award.label` non-empty and `award.url`
  matches `^https://`
- DaKineDiving `videos` array has length 2; every entry has non-empty
  `label` and `url` matching `^https://`
- `personalCredentials` has at least two entries with
  `memberName === 'Sean Jungbluth'`
- `credentialsFor('Sean Jungbluth')` returns an array of length 2; the
  labels include both "Anthropic Claude Community Ambassador" and
  "Built with Claude Sonnet 4.5 Challenge — Winner"

**E2E** (`tests/e2e/projects.spec.ts`):

- DaKineDiving card is visible on `/projects`
- Award badge is visible with the contest label, linked to the X post
- Both video labels are visible as links

**E2E** (`tests/e2e/mission.spec.ts`):

- Sean's portrait shows the existing Ambassador credential AND the new
  Challenge winner credential (two ochre lines)
- Other team portraits still show no credential lines (regression check)
- The two new milestone titles are visible somewhere on `/mission`
- Person JSON-LD on `/mission`:
  - `sean.award` is an array containing both credential labels
  - `sean.sameAs` is an array containing the X post URL
  - `sean.affiliation.name === 'Anthropic'` (unchanged)

**E2E** (`tests/e2e/llms-txt.spec.ts`):

- Body contains "Built with Claude Sonnet 4.5 Challenge winner"
- Body contains "https://x.com/alexalbert__/status/1978220407716245581"

**E2E** (`tests/e2e/api-endpoints.spec.ts`):

- `/api/projects.json` payload includes a `dakinediving` slug

## Open items

- No DaKineDiving hero image in this pass. Sean can drop a screenshot at
  `public/assets/images/project-dakinediving.webp` later; wiring is a
  one-line edit on the project entry.
- The `award` field on `Project` is currently shaped as a single object.
  If a future project has multiple awards, we'd need to widen the field
  to an array. YAGNI applies here.
- The trophy emoji on the award badge can be removed if it reads as
  noisy in the design context. Decision can wait for visual review.
