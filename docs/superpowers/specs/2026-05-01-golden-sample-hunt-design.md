# Golden Sample Hunt — Design Spec

**Date:** 2026-05-01
**Author:** Sean (with Claude)
**Status:** Draft, awaiting user review
**Launch:** Thursday, May 7, 2026 (Code with Claude · 2026)
**Deadline:** Thursday, June 5, 2026, 11:59 PM PT

---

## 1. Background

BioKEA is launching a public-interest scavenger hunt — _the Golden Sample Hunt_ — that uses the existing six BioKEA projects as the playable surface. Six Golden Sample Cards are hidden, one per project. The first ten people to collect all six clues and submit the correct final answer win real molecular sequencing of their own backyard soil, returned to them as a report, raw data, and a Claude-powered way to explore that data.

The promo is announced at Code with Claude · 2026 and runs for ~30 days.

This spec covers the website-side surface area of the launch:

- A new public landing/rules page at `/golden-sample-26`
- A restructure of the **Mission** nav: the current `/mission` becomes "Overview"; a new sister page **Game-based Storytelling** lists the six projects framed as games and hosts placeholder slots for the lightweight in-game interactions (which Sean will author later).
- A new top-level nav link, **Golden Sample**, pointing at `/golden-sample-26`.

## 2. Goals

- Give the hunt a single canonical home page (`/golden-sample-26`) that is bookmarkable, QR-linkable, and contains the full rules + submission entry point.
- Reframe the existing six projects as _games_ in a narrative layer that supports the hunt and extends BioKEA's public thesis ("the bottleneck is storytelling").
- Establish a placeholder pattern so Sean can drop in the real lightweight game logic per project after the page goes live, without further structural changes.
- Match the gold/navy aesthetic of the promo card _for that page only_, while preserving editorial calm everywhere else on the site.

## 3. Non-goals

- Authoring the actual lightweight games per project. Each game's interaction is Sean's to write later. The website provides a clearly-marked slot for each one.
- Building submission infrastructure. Submissions go to a Google Form (Sean to provision). The website embeds the form; we do not run a server-side submission endpoint.
- Internationalization. US-only promo.
- Email/marketing automation. Winner notification is manual, by Sean, via email.

## 4. Hunt mechanic (canonical)

1. **Find** — Each of the six projects (now _games_) hides a Golden Sample Card. The player discovers it through a small, project-specific interaction (the lightweight game; authored later).
2. **Clue** — Each card reveals one fragment of the final answer. Six fragments → one solution.
3. **Solve** — The player assembles the six fragments into the final answer. (Sean authors what the answer is.)
4. **Submit** — Player completes the Google Form linked from `/golden-sample-26` with their final answer plus contact + US mailing address.
5. **Win** — The first ten correct submissions win the prize.

## 5. Eligibility / fine print

- US residents only (continental US — sequencing kit must ship to and from a US address).
- 18+ at time of submission.
- One submission per email.
- Automated/bot submissions are disqualified.
- Winners notified by email; allow 4–6 weeks for kit delivery, sample return, sequencing, and report.
- Email and mailing address are used solely for prize fulfillment.

## 6. Prize

The first ten correct solvers receive:

- Real molecular sequencing of soil sampled from their own backyard.
- A full report (PDF) of what was found.
- The raw sequencing data (FASTQ).
- A Claude-powered way to explore the data. (Final shape TBD by Sean. The page will refer to it as "a Claude-powered explorer for your data" until specifics are nailed down.)

## 7. Pages affected

### 7.1 `/mission` — renamed in nav to "Overview"

- **Page content:** unchanged.
- **Page H1:** unchanged. _"The bottleneck is storytelling. We're building the commons that fixes it."_ — kept because the new sister page `/mission/games` extends this thesis.
- **Page eyebrow:** unchanged (`MISSION`).
- **Nav label:** the link in the Mission dropdown reads "Overview"; the page itself does not change its on-page wording.

### 7.2 `/mission/games` — Game-based Storytelling (new)

- **URL:** `/mission/games` (nested under Mission to reinforce the thesis lineage).
- **Eyebrow:** `STORYTELLING`
- **H1:** _"Biology, played."_
- **Lede:** Two short paragraphs extending the Mission thesis. The first paragraph names the bottleneck (synthesis/storytelling, not instrumentation). The second paragraph names the move: BioKEA hides its science inside games so the public can encounter the work as play, not as a paywalled paper.
- **Game grid:** Six tiles, one per project from `src/data/projects.ts`:
  1. California Intertidal DNA Barcode Library
  2. California Insect Barcoding Initiative
  3. DaKineDiving
  4. Bay Estuary Metabarcoding Baseline
  5. Long-read Microbial Genome Resource
  6. Colloquip
- **Each tile shows:**
  - Project hero image
  - Project title
  - A one-line **game-framing tagline** (Claude drafts six options; Sean redlines)
  - Status badge (live · revealing-soon · coming-soon)
  - "Play" link (or "Coming soon" stub) to the project's surface
  - A `<GamePlaceholder />` slot for the lightweight hunt interaction
- **Footer CTA:** Link to `/golden-sample-26` ("_Six cards are hidden. Find them all._")

### 7.3 `/golden-sample-26` — Hunt landing + rules + form (new)

Two-zone layout (Hybrid C):

**Zone A — Promo mode (full-bleed navy + gold) — above the fold:**

- Eyebrow: `ONE LAST THING · A HUNT` (gold rule)
- Headline (white serif): _"There is a hidden world all around you."_
- Sub-headline (gold italic): _"Even under your feet."_
- Lead paragraph: _"Hidden across six BioKEA games are six Golden Sample Cards. Collect the clues. Solve the puzzle."_
- Hero image: `tmp/golden-sample-card.png` moved to `public/assets/images/golden-sample-card.png`. Large, off-axis right on desktop; stacked above text on mobile.
- Two anchor CTAs: `See the games ↓` (anchors to Zone B / The Games) and `Submit your answer ↓` (anchors to Zone B / Submit).

**Zone B — Editorial mode (cream + ink + teal) — below the fold:**

1. **HOW IT WORKS** — five numbered steps mirroring §4 (Find → Clue → Solve → Submit → Win).
2. **THE GAMES** — 6-up grid linking to each project surface; each tile flags whether the lightweight game is live or coming soon, and that "a Golden Sample Card is hidden inside."
3. **THE PRIZE** — bullet list per §6.
4. **RULES** — small-print block per §5, plus deadline `June 5, 2026 · 11:59 PM PT`.
5. **SUBMIT** — embedded Google Form (`<iframe loading="lazy">`) plus a visible _"Open the form in a new tab →"_ fallback link for users with iframes blocked.
6. **Closing rule + tagline** — gold rule above, italic _"Biodiversity can be discovered anywhere."_

## 8. Nav restructure

```
[What we do ▾]   [Our work ▾]   [Mission ▾]   Golden Sample   [ Get in touch → ]
                                  ├─ Overview                  (standalone link)
                                  └─ Game-based Storytelling
```

- `Mission` changes from standalone link → dropdown with two children: `Overview` (`/mission`) and `Game-based Storytelling` (`/mission/games`).
- New standalone link `Golden Sample` between `Mission` and the `Get in touch` CTA, pointing to `/golden-sample-26`.
- Mobile: Mission becomes an accordion mirroring desktop; Golden Sample renders as a flat link.
- Active-state: `/golden-sample-26` highlights the standalone link; `/mission` and `/mission/games` both highlight the Mission dropdown trigger.

## 9. Lightweight-game placeholder pattern

A reusable Astro component placed on each game tile (and inside each project's surface, if/when Sean wants the in-project finding interaction):

```astro
<GamePlaceholder gameId="dakinediving" />
```

Visual default (when no interaction is plugged in):

```
┌──────────────────────────────────────┐
│ 🔒  GOLDEN SAMPLE CARD · HIDDEN HERE │
│     Lightweight game coming soon.    │
└──────────────────────────────────────┘
```

API:

- `gameId` (string, required) — stable id matching the project slug; lets Sean later wire per-game logic.
- Default slot — when present, replaces the locked-state UI with the real game.

This decouples the page surface from the game logic so Sean can ship interactions one at a time without re-touching the storytelling page.

## 10. Visual tokens

- Add `--color-gold` to the site's color palette. Default value: sampled from `golden-sample-card.png` at implementation time. Fallback if sampling produces a muddy result: `#D4A437` (warm gold, brought from earlier brainstorm).
- Add a `promo-section` utility (or scoped CSS) for full-bleed navy + gold accents, used **only** on `/golden-sample-26` Zone A.
- All other pages, including `/mission/games`, continue to use existing tokens (cream / ink / teal).

## 11. Submission flow

- Sean provisions a Google Form with fields: name · email · US mailing address (street, city, state, ZIP) · final answer · age confirmation (18+) · agree-to-rules checkbox.
- Sean shares the embed URL.
- The website embeds the form via iframe under §7.3 / Zone B / Submit, with a visible "Open in a new tab" fallback link for iframe-blocked clients.
- No server-side endpoint, no database, no email automation on the website's side.

## 12. SEO posture

`/golden-sample-26` is treated as a real product/event page:

- Indexable (no `noindex`).
- Listed in `sitemap.xml`.
- Surfaced in `llms-full.txt` (the LLMs-friendly content corpus).
- JSON-LD: `Event` schema with `name`, `startDate=2026-05-07`, `endDate=2026-06-05`, `eventStatus=EventScheduled`, `organizer={ '@id': 'https://biokea.ai/#org' }`, plus an `offers` block describing the prize.

`/mission/games` is treated as a normal editorial page (no special schema beyond the existing site defaults).

## 13. Timeline

- **2026-05-07** — Hunt launch (Code with Claude · 2026). Pages must be live by this date.
- **2026-05-07 → 2026-06-05** — Hunt window. No content edits to the games during this window unless Sean signals otherwise.
- **2026-06-05 23:59 PT** — Submission deadline.
- **Post-deadline** — `/golden-sample-26` updates to a closed state: hides the form, shows "Hunt closed. Winners being notified." (small follow-up task; not part of v1 build.)

## 14. Open items (not blocking design approval)

- **Six game-framing taglines** — Claude will draft six options at implementation time; Sean will redline.
- **Final answer + per-card clue fragments** — Sean authors. Not a website concern.
- **Google Form URL** — Sean provides at implementation time. Page ships with a `TODO` placeholder if not yet provisioned by build start; the embed swaps in trivially.
- **Claude prize artifact specifics** — Page describes the prize as "a Claude-powered explorer for your data" until Sean nails down the artifact (Console project, notebook, mini-app).

## 15. Out of scope

- Authoring the lightweight games themselves. Sean owns those; the website ships placeholder slots only.
- Backend submission processing, winner picking, kit dispatch logistics.
- Post-deadline "results" / "winners" page (a future follow-up).
- International eligibility.

## 16. Dependencies

- Astro project (existing).
- Tailwind / global CSS palette (existing) — needs one new `--color-gold` token.
- `src/data/projects.ts` — read-only; provides the six game tiles.
- `src/components/layout/Nav.astro` — modified for Mission dropdown + Golden Sample standalone link.
- `tmp/golden-sample-card.png` → moved to `public/assets/images/`.

## 17. Risks

- **Google Form embed UX** — iframes can feel clunky; mitigated by a visible "open in new tab" fallback.
- **Color drift** — adding gold to a palette previously limited to cream/ink/teal risks brand inconsistency. Mitigated by scoping `promo-section` exclusively to `/golden-sample-26` Zone A.
- **Placeholder fatigue** — if Sean doesn't ship the lightweight games soon after launch, the placeholder pattern becomes the actual experience. Mitigated by making the placeholder honest ("Lightweight game coming soon.") rather than vapor.

---

**End of spec.**
