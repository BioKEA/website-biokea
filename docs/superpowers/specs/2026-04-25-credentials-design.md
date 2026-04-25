# BioKEA credentials & program memberships — design

**Date:** 2026-04-25
**Status:** Draft, pending user review

## Problem

BioKEA participates in three major company-level programs and Sean holds a
personal AI-community credential. None of these are currently visible on
the marketing site, in JSON-LD, or in `llms.txt`. They are real validation
signals for prospects, grantmakers, peer researchers, and LLM agents
summarizing the company — and the site should surface them honestly without
overclaiming.

The credentials:

1. **NVIDIA Inception** — company-level program membership
2. **Google Cloud for Startups** — company-level program membership
3. **AWS for Startups** — company-level program membership
4. **Anthropic Claude Community Ambassador** — personal to Sean Jungbluth

## Goals

- Surface all four credentials so they reach four audience classes — prospective
  customers, grantmakers/investors, peer researchers, and LLM agents — without
  overweighting any single audience.
- Keep the company-level programs distinct from Sean's personal credential.
  Don't lump them in the same visual block.
- Be honest about what each credential signifies. No "Backed by" framing
  for what are program memberships with credits and support.
- Make every credential agent-discoverable via JSON-LD and `llms.txt`,
  not just visually present.

## Non-goals

- No real program logos. Text-only treatment for now; revisit if/when
  brand-use rights are confirmed for each program.
- No dedicated `/credentials` or `/about` page.
- No content-collection migration. Continue using typed data modules
  in `src/data/`.
- No changes to body content of `/contact`, `/lab`, `/projects`,
  `/pipeline`, or `/agentis` — they inherit the footer strip automatically.

## Design

### Data model

New module `src/data/credentials.ts`:

```ts
export interface Program {
  name: string;
  url: string;
  shortLabel?: string;
}

export interface PersonalCredential {
  memberName: string; // must match a name in src/data/team.ts
  label: string;
  url?: string;
  issuer: string; // for JSON-LD affiliation
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
    // url: TBD — add when a public directory page exists
  },
];
```

Programs are listed alphabetically by default. Re-ordering is a one-line
edit and carries no other code impact.

### Visual placement

**Footer (every page) — compact.**
Eyebrow `PROGRAMS & SUPPORT` (mono, teal, uppercase, ~11px, tracked) above
a single body line:

> Supported by AWS for Startups, Google Cloud for Startups, and
> NVIDIA Inception.

Program names link inline to each program's canonical URL. Renders above
the existing social/press-kit row in `Footer.astro`.

**`/mission` page — expanded section.**
A new section between the team grid and the existing partners section.
Same eyebrow + body treatment, more vertical breathing room, plus one
short framing sentence:

> `PROGRAMS & SUPPORT`
>
> BioKEA is supported by leading cloud and AI infrastructure programs
> that supply the compute and credits behind the LDC and BioinfoOS.
>
> AWS for Startups · Google Cloud for Startups · NVIDIA Inception

The list is rendered with middot separators and inline links.

**Sean's portrait on `/mission` — credential line.**
Beneath his role, a third line in the existing eyebrow style:

> Sean Jungbluth
> CEO / CTO, Founder
> `ANTHROPIC CLAUDE COMMUNITY AMBASSADOR`

Renders only when a `PersonalCredential` exists for that team member. Other
team members are unaffected.

### Components

- **New** `src/components/sections/ProgramsStrip.astro` — accepts a
  `variant` prop with values `compact` (footer) and `expanded` (mission).
  Reads from `credentials.ts`. Single component, no fork.
- **Update** `src/components/layout/Footer.astro` — renders
  `<ProgramsStrip variant="compact" />` above the existing social/press-kit
  row.
- **Update** `src/pages/mission.astro` — renders
  `<ProgramsStrip variant="expanded" />` as a new section between the team
  grid and partners.
- **Update** `src/components/ui/Portrait.astro` — accepts an optional
  `credential?: string` prop. When present, renders a third line below
  `role` in the existing eyebrow style. `mission.astro` looks up each
  member's credential by name from `credentials.ts` and passes it in.

### JSON-LD

**Organization node** (homepage and `/mission`) — add `memberOf`:

```json
"memberOf": [
  { "@type": "Organization",
    "name": "AWS for Startups",
    "url": "https://aws.amazon.com/startups/" },
  { "@type": "Organization",
    "name": "Google Cloud for Startups",
    "url": "https://cloud.google.com/startup" },
  { "@type": "Organization",
    "name": "NVIDIA Inception",
    "url": "https://www.nvidia.com/en-us/startups/" }
]
```

**Sean's `Person` node** on `/mission` — add `award` and `affiliation`:

```json
{
  "@type": "Person",
  "@id": "https://biokea.ai/mission#sean",
  "name": "Sean Jungbluth",
  "jobTitle": "CEO / CTO, Founder",
  "award": "Anthropic Claude Community Ambassador",
  "affiliation": {
    "@type": "Organization",
    "name": "Anthropic",
    "url": "https://www.anthropic.com/"
  }
}
```

`award` is used rather than another `memberOf` because the Ambassador
status is a recognized personal credential, not corporate membership.
`sameAs` to a public directory page is added later if/when one exists.

JSON-LD content is generated from `credentials.ts` so that the data module
is the single source of truth.

### `llms.txt` updates

Two edits to `public/llms.txt`:

1. New section, placed between "Team" and "Partners":

```markdown
## Programs & support

BioKEA participates in major cloud and AI infrastructure programs that
supply the compute, credits, and engineering support behind the LDC and
BioinfoOS:

- **AWS for Startups** — https://aws.amazon.com/startups/
- **Google Cloud for Startups** — https://cloud.google.com/startup
- **NVIDIA Inception** — https://www.nvidia.com/en-us/startups/

Sean Jungbluth is an **Anthropic Claude Community Ambassador**, recognized
for contributions to the Claude developer community
(https://www.anthropic.com/).
```

2. Inline append to the existing Sean entry under `## Team`:

```markdown
- **Sean Jungbluth** — CEO / CTO, Founder · Anthropic Claude Community Ambassador
```

`llms.txt` remains hand-edited (low-churn surface). Keeping the data values
identical between `credentials.ts` and `llms.txt` is a manual step.

### Tests

- **Unit** (`tests/unit/content-data.test.ts`) — extend with a
  `credentials` block:
  - `programs` has at least three entries; each has a non-empty `name`
    and a valid HTTPS `url`.
  - Every `personalCredentials.memberName` matches a real entry in
    `team`.
- **E2E** (`tests/e2e/mission.spec.ts`) — assert the Programs & Support
  section is visible with all three program names; assert
  "Anthropic Claude Community Ambassador" renders in Sean's portrait
  block.
- **E2E** (`tests/e2e/home.spec.ts` or a new shared footer assertion) —
  assert the footer Programs strip is visible on the homepage.
- **E2E** (`tests/e2e/llms-txt.spec.ts`) — assert `llms.txt` contains the
  "Programs & support" heading and the three program names.

## Open items

- Sean's Anthropic Ambassador `url` (public directory page) is unset.
  Update `credentials.ts` and JSON-LD `sameAs` once a public link exists.
- Real program logos and brand-use rights — explicitly deferred. If/when
  permission is confirmed, swap text strip for a logo strip behind the
  same `ProgramsStrip` component (no API change for callers).
