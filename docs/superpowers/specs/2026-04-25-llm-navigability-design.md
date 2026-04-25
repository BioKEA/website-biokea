# LLM-navigability comprehensive pass — design

**Date:** 2026-04-25
**Status:** Draft, pending user review

## Problem

Recent feature work (DaKineDiving, expanded credentials, bios,
milestones, CIB fixes) updated the site's human-facing surfaces but
left agent-readable surfaces partially in drift:

- `llms.txt` was missing DaKineDiving and the new bio summaries
- `/projects` page JSON-LD didn't reflect DaKineDiving at all
- `/mission` Person nodes didn't surface bios as `description`
- `robots.txt` was generic; named LLM crawlers had no explicit policy
- No long-form `llms-full.txt` for agents that want richer context
- No `FAQPage` JSON-LD for common BioKEA questions

The site is meant to be agent-discoverable as a load-bearing part of
the BioKEA thesis. Closing these gaps in a single pass keeps the
agent-readable surfaces consistent and current.

## Goals

- Explicit `robots.txt` policy for major LLM crawlers (open to all).
- `llms.txt` reflects all current site state: projects, bios, credentials.
- `llms-full.txt` build-time generated from data modules; agents that want
  more depth than `llms.txt` get a comprehensive single fetch.
- `FAQPage` JSON-LD on the homepage so agent answers about "what is
  BioKEA / where / how to engage" land in structured form.
- Each Person on `/mission` carries its bio in `description`, plus
  `knowsAbout` and `sameAs` data-driven from `team.ts`.
- DaKineDiving has a proper JSON-LD entry on `/projects` with award,
  sameAs, and video objects.

## Non-goals

- No `/.well-known/` agent discovery file (no settled standard;
  `llms.txt` is the working convention).
- No visible FAQ section on the homepage (HTML stays unchanged; the
  JSON-LD is the agent-readable surface).
- No build-time generator for `llms.txt` itself (`-full` only).
- No new pages, no nav changes, no copy changes to existing surfaces
  beyond what was already shipped (CIB rename, Austin "managing", etc.).

## Design

### `public/robots.txt`

Replace generic file with named-bot allow-rules for GPTBot, ChatGPT-User,
OAI-SearchBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended,
CCBot — all `Allow: /`. Wildcard `User-agent: *` rule retained. Sitemap
pointer unchanged. Already applied to working tree.

### `public/llms.txt`

Three additions, already applied to working tree:

1. New `DaKineDiving` line in the Active & forthcoming projects list,
   marked LIVE + independent origin, with the contest-win note and X
   post URL.
2. New `**About the team in brief:**` paragraph after the Team list,
   compressing each member's bio to one clause. Austin uses "managing"
   not "leading".
3. New `**About the advisors:**` paragraph after the Advisors list, same
   compression for Sunit and Greg.

### `src/data/team.ts`

Extend `TeamMember` interface with two new optional fields:

```ts
knowsAbout?: string[]; // Schema.org Person.knowsAbout source
sameAs?: string[];     // Schema.org Person.sameAs source
```

Populate each member with their existing inline `knowsAbout` from
`mission.astro` (Sean: Environmental DNA / Metabarcoding / Biodiversity
informatics / Long-read sequencing / FAIR data / AT Protocol; Michelle:
Marine biology / Estuarine ecology / Zooplankton / Metabarcoding;
Austin: DNA barcoding / Entomology / California insect biodiversity /
Conservation biology; Sunit: Multi-agent AI / Scientific deliberation /
Bioinformatics; Greg: empty or one tag — leave empty if unknown).

Sunit gets `sameAs: ['https://github.com/sunitj']` (currently inline
in mission.astro JSON-LD).

### `src/pages/mission.astro`

Refactor the Person `@graph` block to be data-driven. Replace the
hand-written 5-Person literal with `team.map((p) => { ... })` building
each Person from the data module. The mapping renders:

- `@type: 'Person'`
- `@id: https://biokea.ai/mission#<first-name-lowercase>`
- `name`, `honorificSuffix` (if `postNominal`), `jobTitle: p.role`
- `worksFor: { '@id': 'https://biokea.ai/#org' }`
- `image` if non-placeholder (skip placeholder SVGs)
- `description: p.bio` (when present)
- `knowsAbout: p.knowsAbout` (when present)
- `sameAs: p.sameAs` (when present, merged with credential URLs for Sean)
- `award` / `affiliation` from `credentialsFor(p.name)` (when present)

Sean's existing `award` array, `affiliation`, `sameAs` continue to derive
from `credentialsFor` (no behavior change for the existing fields).

### `src/pages/index.astro`

Two additions:

1. New `<link rel="alternate" type="text/markdown" href="/llms-full.txt">`
   in the `<head>` (via `BaseLayout` slot or directly in `<Fragment slot="head">`).
2. Second `<script type="application/ld+json" is:inline>` block emitting
   a `FAQPage` with the 6 approved questions and answers (verbatim from
   the brainstorming Section 4 list). Uses the existing `stringifyJsonLd`
   helper for `</script>` and U+2028 escaping.

### `src/pages/projects.astro`

Append a new node to the existing `@graph` array for DaKineDiving:

```ts
{
  '@type': 'WebApplication',
  '@id': 'https://biokea.ai/projects#dakinediving',
  name: 'DaKineDiving',
  description: <pulled from projects.ts dakinediving.summary>,
  applicationCategory: 'EnvironmentalInformaticsApplication',
  operatingSystem: 'Web',
  creator: { '@id': 'https://biokea.ai/mission#sean' },
  award: <projects.ts dakinediving.award.label>,
  sameAs: [<projects.ts dakinediving.award.url>],
  video: dakinediving.videos.map(v => ({
    '@type': 'VideoObject',
    name: v.label,
    contentUrl: v.url,
  })),
  about: [
    { '@type': 'DefinedTerm', name: 'eDNA' },
    { '@type': 'DefinedTerm', name: 'Marine biodiversity' },
    { '@type': 'DefinedTerm', name: 'Hawaiian marine ecosystems' },
  ],
}
```

Imports the `dakinediving` entry from `projects` array via
`projects.find(p => p.slug === 'dakinediving')` (or destructure from a
named lookup) so prose strings stay in `projects.ts` only.

### `src/pages/llms-full.txt.ts` (NEW)

Astro static endpoint with `prerender: true` returning `text/plain;
charset=utf-8`. Imports all data modules and emits comprehensive
markdown:

1. **Header** — TL;DR identical to `llms.txt`, plus a note that this is
   the long-form variant
2. **Operations** — full LDC + BioinfoOS + Agentis + Droplet
3. **Services** — every service line with full description
4. **Team** — every team + advisor's `name`, `postNominal`, `role`,
   `bio`, `knowsAbout`, `credentials`, `sameAs`
5. **Programs & support** — full programs + Sean's two Anthropic
   credentials with URLs
6. **Partners** — every partner's `name`, `description`, `url`
7. **Six-stage pipeline** — every `pipelineStages` entry with `number`,
   `title`, `subtitle`, `body`
8. **Equipment** — every stage from `equipment.ts` with full inventory
9. **Projects** — every project's full `summary`, `originNote`, `award`,
   `videos`, `link`, `team`, `tags`, `status`
10. **Milestones** — every milestone's `date`, `title`, `body`
11. **Vocabulary** — verbatim glossary copied from `llms.txt`

Cache header `public, max-age=3600` matching the JSON endpoints.

### Tests

- **Unit** (`tests/unit/content-data.test.ts`):
  - Every `team` entry has `knowsAbout` of length ≥ 1 (Greg may be
    empty — relax to ≥ 0 if needed; assert structure is array)
  - The Sean entry has `sameAs` undefined or array (no fixed length)
- **E2E** (`tests/e2e/home.spec.ts`):
  - Page contains a JSON-LD script with `@type: 'FAQPage'`
  - The 6 question strings each appear as a `name` in `mainEntity[]`
  - Page `<head>` contains `link[rel="alternate"][type="text/markdown"][href="/llms-full.txt"]`
- **E2E** (`tests/e2e/mission.spec.ts`):
  - Every Person node in the `@graph` has a `description` field
  - The `@graph` contains exactly 5 Person nodes (current count)
  - Sean's Person still has `award` array, `sameAs`, `affiliation`
- **E2E** (`tests/e2e/projects.spec.ts`):
  - The JSON-LD `@graph` contains a DaKineDiving node with
    `@id` ending in `#dakinediving`
  - That node has `award` containing "Built with Claude"
  - That node has `sameAs` containing the X post URL
  - That node has `video` array of length 2
- **E2E** (`tests/e2e/llms-txt.spec.ts`):
  - `GET /llms-full.txt` returns 200
  - Body contains `## Team`, `Microbial genomicist` (Sean's bio),
    `## Projects`, `DaKineDiving`, `## Milestones`, and the
    Built-with-Claude X URL

## Open items

None. All decisions made during the brainstorming exchange.
