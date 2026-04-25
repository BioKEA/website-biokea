# Team & advisor bios on `/mission` — design

**Date:** 2026-04-25
**Status:** Draft, pending user review

## Problem

Every entry in `src/data/team.ts` has an optional `bio?: string` field, but
none are populated. `/mission` renders a slate paragraph below each team
portrait when `bio` is set, but the advisor grid renders only the
Portrait — there is no bio render slot for advisors.

The mission page reads as a sequence of names + roles + (for Sean) two
ochre credential lines. Visitors can't tell what each person actually
does without leaving the site.

## Goals

- Add 2-3 sentence bios for the three team members (Sean, Michelle,
  Austin), and 1-sentence bios for the two advisors (Sunit, Greg).
- Keep Sean's two ochre credential lines visually distinct (Anthropic
  Claude Community Ambassador, Built with Claude Sonnet 4.5 Challenge
  Winner) — the bio paragraph sits _below_ those lines in the Portrait
  card; the credential lines continue to do the visual standout work.
- Match the existing 4-column advisor grid layout — 1-sentence bios
  slot under `size="sm"` cards without forcing a wider grid.

## Non-goals

- No JSON-LD changes (the existing `Person.knowsAbout` arrays already
  capture the structured biographical signal; bios are prose for human
  readers).
- No `llms.txt` changes (agent-readable summary is already structured
  via team JSON and Person nodes).
- No copy changes to roles, titles, or credentials.

## Design

### Bios (populate `team.ts` `bio` field)

**Sean Jungbluth, PhD** — `team` tier:

> Microbial genomicist building computational and AI tooling for
> environmental biology. Lecturer at Stanford on microbial genomics;
> previously studied deep-sea and subsurface microbial diversity across
> three submersible expeditions to ~2,650 m. Author of open-source
> pipelines and a contributor to FAIR data standards (MIxS, MIEM).

**Michelle Jungbluth, PhD** — `team` tier:

> Marine and estuarine ecologist focused on zooplankton communities and
> food-web dynamics. Combines field sampling with DNA barcoding, eDNA,
> qPCR, and metabarcoding to track threatened estuarine fishes —
> including longfin smelt — and identify indicator species in
> human-impacted wetlands. Lead investigator on BioKEA's San Francisco
> Bay metabarcoding baseline.

**Austin Baker, PhD** — `team` tier:

> Entomologist and biodiversity scientist at the Natural History Museum
> of Los Angeles County. Spearheads the California Insect Barcoding
> Initiative — over 1 million specimens barcoded, with recent work
> estimating that at least one third of the state's insect biodiversity
> remains undiscovered. PhD on parasitoid-wasp systematics.

**Sunit Jain, MS** — `advisor` tier:

> Bioinformatics scientist with 13+ years building agentic, multi-agent
> systems for microbial-community analysis. Author of Colloquip.

**Greg Fedewa, PhD** — `advisor` tier:

> Bioinformatics scientist (Caltech, Centre for Pathogen Evolution)
> developing computational methods for immunological and antigenic data
> analysis.

### Render — team grid

No code change needed. `mission.astro` already renders:

```astro
{p.bio && <p class="mt-3 text-xs text-slate-600 leading-relaxed">{p.bio}</p>}
```

below each team portrait when `bio` is populated. Adding the bio
strings to `team.ts` is sufficient for Sean / Michelle / Austin.

### Render — advisor grid

The advisor map currently renders only the Portrait:

```astro
team .filter((p) => p.tier === 'advisor') .map((p) => (
<Portrait
  src={p.image}
  alt={p.alt}
  name={p.name}
  role={p.role}
  postNominal={p.postNominal}
  credentials={credentialsFor(p.name).map((c) => c.label)}
  size="sm"
/>
))
```

Wrap each in a `<div>` and add a slightly tighter bio paragraph under
the portrait — smaller text and `leading-snug` to suit the `size="sm"`
context:

```astro
team .filter((p) => p.tier === 'advisor') .map((p) => (
<div>
  <Portrait
    src={p.image}
    alt={p.alt}
    name={p.name}
    role={p.role}
    postNominal={p.postNominal}
    credentials={credentialsFor(p.name).map((c) => c.label)}
    size="sm"
  />
  {p.bio && <p class="mt-2 text-[10px] text-slate-600 leading-snug">{p.bio}</p>}
</div>
))
```

The grid container (`grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 max-w-3xl`)
stays as-is. With ~17-word bios, vertical growth per card is one or two
lines.

### Tests

E2E (`tests/e2e/mission.spec.ts`) — append:

- `getByText(/Microbial genomicist/i)` is visible (Sean's bio surfaces)
- `getByText(/Author of Colloquip/i)` is visible (Sunit's bio surfaces)

That's enough — they confirm both the team and advisor render paths
work with the new data. We don't need to assert each bio's text since
unit data tests would just duplicate the data.

Unit (`tests/unit/content-data.test.ts`) — extend the existing
`describe('team data', ...)` block with:

- Every `team` entry has a non-empty `bio`.

## Open items

None.
