# BioKEA Site Overhaul — Design Spec

**Date:** 2026-04-18
**Status:** Draft — awaiting user review
**Scope:** Full rebuild of biokea.ai. Site-level design, IA, visual system, content, and stack choice. Implementation plan follows separately.

---

## 1. Goal

Replace the current Next.js 13 dark-mode site with a rebuild that:

1. Reads as a credible, mission-forward front door for **BioKEA the organization** — not as a generic AI startup.
2. Uses the **physical Berkeley lab + Large Data Collider (LDC) hardware** as the primary proof point.
3. Leads visitors toward one of two actions: exploring the evidence, or booking a capabilities call.
4. Treats BioinfoOS and Agentis **conservatively** — teased as part of the story, not marketed as products.
5. Uses the **existing artwork the team has already invested in**, recolored where palette mismatches are disruptive.

### Audience weighting

The site is tuned, in order, for:

| Priority | Audience                         | What they need                                                             |
| -------- | -------------------------------- | -------------------------------------------------------------------------- |
| 60%      | Funders / institutions           | Mission, public-good narrative, lab evidence, milestones, team credibility |
| 35%      | Scientific peers / collaborators | Lab capabilities, hardware, methods, pipeline detail                       |
| 5%       | Broader public-science community | Light participation invitation (Bluesky, citizen science)                  |

### Primary action

Visitors should **explore the lab + LDC evidence** and then **request an intro / capabilities call** as the natural next step. The site itself is the pitch; contact is the conversion.

---

## 2. Brand architecture (clarified)

- **BioKEA** — the organization, mission, team, lab space. The parent.
- **BioKEA LDC** (Large Data Collider) — the physical compute + wet-lab hardware operated by BioKEA.
- **BioinfoOS** — the software layer being built _by BioKEA_, running _on the LDC_.
- **Agentis** — the publishing output, lives at **agentis.science**. Teased on biokea.ai; detailed there.
- **Droplet** — the eDNA / field-to-data lab service (kept per existing artwork).
- **Labhus** — discontinued (commit `c09ac2b`). Not included in this site.

Every reference on biokea.ai should respect this hierarchy. The current site flattens BioKEA / BioinfoOS / LDC into sibling products; the overhaul fixes this.

---

## 3. Information architecture

Five-page narrative structure:

```
/                 Home — the full pitch in summary form
/lab              The Lab & LDC — physical space, hardware, capabilities
/pipeline         Soil to Claim — the 6-stage pipeline; BioinfoOS & Agentis tease
/mission          Mission & team — origin story, thesis, team, partners, milestones
/contact          Collaborate — intro request, capabilities call
                  → agentis.science (external)
```

Two current pages (`/bioinfoos`, `/agentis-journal`) collapse into `/pipeline` as contextual teases. `/team` merges into `/mission`. Orphaned pages (`labhus-automation.tsx`, `documentation.tsx`, `blog.tsx`, `/api/contact.ts`) are removed. A contact form endpoint will be re-added via a simple Cloudflare Workers function or a no-code form service.

---

## 4. Visual system — "α + β hybrid"

**Philosophy: quiet confidence, with evidence.** Calm institutional rhythm by default; precise live-data moments where the work earns them.

### Palette

| Role                  | Token              | Hex                        | Usage                                                       |
| --------------------- | ------------------ | -------------------------- | ----------------------------------------------------------- |
| Background (primary)  | `bg/cream`         | `#F3EFE6`                  | Default page background                                     |
| Background (warm)     | `bg/cream-warm`    | `#F6F2E9`                  | Alt sections, subtle variety                                |
| Surface (dark)        | `surface/ink`      | `#0b1f1a`                  | Nav, footer, CTA bands, headline text                       |
| Text (body)           | `text/slate`       | `#475569`                  | Body copy                                                   |
| Accent (primary)      | `accent/teal`      | `#0f766e`                  | Eyebrows, links, primary structure                          |
| Accent (teal lighter) | `accent/teal-soft` | `rgba(15,118,110,.08-.12)` | Stat-pill backgrounds                                       |
| Signal (reserved)     | `signal/pink`      | `#be185d`                  | **Only for live / novel / active content.** Used sparingly. |
| Grid line             | `grid/ink`         | `rgba(30,41,59,.03-.05)`   | Blueprint grid background texture                           |

Pink is **earned**, not decorative. A pipeline run that just completed, a freshly published novel lineage, a "live capacity" indicator — those get pink. Nothing else does.

### Typography

- **Display / headlines:** Inter (or system sans), 600 weight, tight letter-spacing (-0.015em to -0.025em).
- **Body:** Inter, 400/500, 14-15px, line-height 1.55.
- **Mono / data labels:** JetBrains Mono — eyebrows, stats, sample IDs, pipeline status, coordinates. Never for body copy.

### Grid / texture

Subtle blueprint grid (22-28px, ~3-5% opacity slate lines) on cream backgrounds. Reinforces the "infrastructure / lab" identity without dominating.

### Two registers

The system has two registers that shift by section context:

- **α · Calm editorial** — Used for hero, mission, thesis, team, origin. Big confident headlines, light meta, generous whitespace, no pink, minimal decoration.
- **β · Data-rich** — Used for lab/LDC, capability grids, pipeline, publications, live stats. Visible mono data labels, stat pills, photo annotations, pink earned where live.

One typeface system, one palette — **density** changes contextually, not the toolkit.

### Photo treatment

Real lab photos are shown full-bleed or in bordered cards, with optional JetBrains Mono overlays in the corner (sample ID, coordinates, date) when in β register. Portraits (painterly Sean / Frederik illustrations) sit in simple cream cards with a thin warm border.

---

## 5. Existing artwork — integration plan

### Keep as-is

| Asset                  | Placement                                         | Rationale                                                                   |
| ---------------------- | ------------------------------------------------- | --------------------------------------------------------------------------- |
| `logo2.png`            | Nav (inverted on dark), footer, favicon reference | Dark-teal wordmark + mascot reads native on cream; already fits the palette |
| `profile-sean.png`     | Origin section, team strip                        | Painterly watercolor; warm sepia loves cream                                |
| `profile-frederik.png` | Origin section, team strip                        | Same                                                                        |

### Recolor to cream + teal palette (required)

These are featured prominently; keeping their dark-navy + yellow neon palette would force dark-panel "specimen frames" that interrupt the cream rhythm and undercut the editorial voice.

| Asset                             | Where used                                      | Why recolor                                              |
| --------------------------------- | ----------------------------------------------- | -------------------------------------------------------- |
| `BioKEA-Large-Data-Collider.webp` | Hero badge + /lab page anchor                   | Featured in hero; biggest single palette violation       |
| `Pillar1-BioinfoOS.webp`          | /pipeline ecosystem strip                       | Mid-page tile — a row of dark panels breaks cream rhythm |
| `Pillar2-Agentis.webp`            | /pipeline ecosystem strip, footer link-out card | Same                                                     |
| `Pillar3-Droplet.webp`            | /pipeline ecosystem strip, /lab page            | Same                                                     |

**Direction for recolors:**

- Background: transparent or cream (`#F3EFE6`)
- Line work: accent teal (`#0f766e`) primary; ink (`#0b1f1a`) secondary
- Optional accent highlights: ochre (`#92400e`) for warmth; pink (`#be185d`) reserved for collision/novelty moments on the LDC illustration only
- Preserve the original shapes and compositions — this is a palette swap, not a redesign

Recoloring can be done via Illustrator/Figma on the original vector sources if available, or via AI-assisted regeneration with the cream palette specified. The implementation plan will detail the specific workflow.

### Retire

| Asset                                  | Reason                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------- |
| `Pillar4-Labhus.webp`                  | Product discontinued (commit `c09ac2b`)                                    |
| `BioKEA_LDC_logo.jpg` (4-pillar wheel) | Still shows Labhus; fundamentally outdated                                 |
| `team1.png`                            | Robot/character grid; tone mismatch with funder audience                   |
| `team2.jpg`                            | Same. Candidate for a small easter-egg / "archive" moment if desired later |
| `videoV2.jpg`                          | Current hero background; superseded by lab-photo-driven hero               |

### Needed (asset gap)

The single biggest asset gap: **real lab photos are not in the repo.** The two warehouse interior shots from the "New Berkeley Labspace Capabilities" slide of the Capabilities deck (Jan 2025) are the most important photographic content for the site and don't exist as web-ready files. Plus: close-ups of the KingFisher robots, the DiversityScanner, and any recent in-situ sampling photos.

The implementation plan will include an "asset sourcing" step before the build can ship.

---

## 6. Homepage composition

Six content sections plus nav/footer, in this order:

| #   | Section        | Register | Purpose                    | Key content                                                                                                                                                                |
| --- | -------------- | -------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01  | Hero           | α        | **What is BioKEA?**        | Eyebrow, big headline, supporting paragraph, primary CTA ("See what we're running") + secondary ("Schedule a call"). Recolored LDC illustration as hero inset badge.       |
| 02  | Thesis         | α        | **Why does it exist?**     | One-line mission quote: _"The bottleneck in modern biology is no longer data generation. It is scientific storytelling and synthesis."_ Minimal chrome, silence around it. |
| 03  | Evidence / LDC | β        | **Is it real?**            | Lab photo + "The Large Data Collider" + stats strip (7,000 sq ft · 2.4M reads/run · 5 novel lineages). Link to `/lab`.                                                     |
| 04  | Ecosystem      | β        | **What can I do with it?** | Three recolored tiles — Droplet (field-to-data) · BioinfoOS (compute layer) · Agentis (publish, links to agentis.science). Conservative tone; no AI-marketing language.    |
| 05  | Origin + team  | α        | **Who's behind it?**       | SFSU-lab-rescue narrative, DOE Berkeley Lab / marine / Bay Area environmental heritage. Two painterly portraits. Partner marks strip.                                      |
| 06  | CTA band       | —        | **How do I engage?**       | Dark band: "Collaborate, fund, or plug into the pipeline." Single button: "Schedule a call."                                                                               |

Nav: `logo2.png` (inverted) + Lab · Pipeline · Mission · Contact · `agentis.science ↗`.
Footer: logo + copyright + Bluesky / GitHub / Contact / external Agentis link.

---

## 7. The other four pages (summaries)

### `/lab` — The Lab & LDC

**Purpose:** Give a funder or collaborator the full ground-truth of the physical infrastructure.

Sections: (1) The Berkeley warehouse — full-bleed photos, the "7,000 sq ft, free space, built alongside a shuttered marine lab" story. (2) The LDC pipeline — Extraction (2× KingFisher) → Prep/Amplification → Quantification → Sequencing → Sorting (Phase 2) → ReadUntil feedback loop. Diagram + hardware captions. (3) DiversityScanner — roboticized species discovery, heatmap examples. (4) Current operations — live stats, recent samples processed, novel lineages identified. (5) CTA: "Work with our lab" → `/contact`.

### `/pipeline` — Soil to Claim

**Purpose:** Tell the 6-stage narrative from the AI-First Publishing deck, at a level that demonstrates substance without overselling AI features.

Sections: (1) Thesis restated. (2) Six-stage pipeline walkthrough — Ingest (Universal Envelope) · Analyze (LDC) · Draft (AI-assisted narrative) · Review (multi-agent) · Broadcast (interactive StoryMap) · Amplify (ATProto / Bluesky). Each stage: one paragraph + one diagram. (3) **BioinfoOS** tease — 2-3 sentences on what it is and that it's being developed. No screenshots of UIs that don't exist yet. (4) **Agentis** tease — 2-3 sentences + clear "→ agentis.science" link. (5) Trust layer — AT Protocol, FAIR, GBIF/NCBI SRA/Zenodo, one paragraph. (6) CTA: "Want to plug a sample into this?" → `/contact`.

Tone rule: every sentence about AI or agents should be conservative, specific, and backed by a concrete noun (a pipeline, a model, a dataset, a run). No abstract "AI-powered" marketing language.

### `/mission` — Mission & team

**Purpose:** Establish credibility, origin, and the public-good orientation that funders want to see.

Sections: (1) The thesis, extended — 2-3 paragraphs on the "storytelling is the bottleneck" argument and why an open, public-interest lab is needed. (2) Origin — SFSU marine lab closure, March 2025 spin-out, Berkeley space. (3) The team — painterly portraits, short bios. (4) Partners — CIB, DOE Berkeley Lab alumni network, SFSU alumni network. Logos / word marks. (5) Milestones — a timeline: founded March 2025 · Berkeley space · CIB collaboration · first soil eDNA pilot (Santa Monica Mountains) · etc. (6) Commitment — public-domain / open-science / FAIR / AT Protocol stance stated plainly.

### `/contact` — Collaborate

**Purpose:** Convert. One focused page.

Sections: (1) One sentence: "We're taking partnership, capabilities, and funding conversations." (2) Simple form (name / org / what they want to discuss / message). (3) Direct email + Bluesky + LinkedIn as alternates. (4) Optional: a "capabilities deck" download or Calendly link — to be decided in implementation.

No contact form on other pages. One canonical place.

---

## 8. Content model

All page content lives in **MDX files** (`src/content/pages/*.mdx`), not hard-coded in components. A thin set of shared Astro components handles layout, sections, stat pills, photo cards, and the pipeline diagram. Copy edits never require touching component code.

Structured content (team members, partner list, pipeline stages, milestones, stats) lives in **TypeScript data files** (`src/data/team.ts`, `src/data/partners.ts`, `src/data/pipeline.ts`, `src/data/milestones.ts`, `src/data/stats.ts`) — single source of truth, easy to update, strongly typed.

No CMS in v1. Content volume doesn't justify one yet. MDX + data files scale cleanly to a CMS later if needed.

---

## 9. Tech stack

| Layer      | Choice                                                        | Why                                                                                                           |
| ---------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Framework  | **Astro 5.x**                                                 | Content-first, MDX-native, near-zero JS on marketing pages, static output, designed for exactly this use case |
| Styling    | **Tailwind CSS 4**                                            | Latest major; maps cleanly to Astro. Tokens from §4 exposed as CSS variables / Tailwind theme                 |
| Typography | Inter (sans), JetBrains Mono (mono)                           | Both loaded via local fonts or the Astro font plugin for performance                                          |
| Images     | Astro `<Image />` + `sharp`                                   | Automatic resizing, format conversion, lazy loading                                                           |
| Content    | MDX + typed data files                                        | §8                                                                                                            |
| Forms      | Cloudflare Workers function (POST → email)                    | Replaces current Next.js API route; keeps the site fully static otherwise                                     |
| Deploy     | Cloudflare Workers (static assets)                            | Preserves current deploy target; `wrangler.toml` updated for Astro output                                     |
| CI         | GitHub Actions → `wrangler deploy`                            | Preview deploys on PRs                                                                                        |
| Analytics  | Cloudflare Web Analytics (primary) with Plausible as fallback | Cookieless, lightweight, matches the open-science posture; Cloudflare integrates with existing deploy         |

The existing `/out` deploy target, Cloudflare compatibility date, and KV asset handler all transfer. This is not a hosting migration.

### Component architecture (Astro)

```
src/
  components/
    layout/         — Nav, Footer, Page, Seo
    sections/       — Hero, Thesis, Evidence, Ecosystem, Origin, CTA
    ui/             — StatPill, Eyebrow, PhotoCard, Portrait, PipelineStep, PartnerMark
  content/
    pages/          — home.mdx, lab.mdx, pipeline.mdx, mission.mdx, contact.mdx
  data/             — team.ts, partners.ts, pipeline.ts, milestones.ts, stats.ts
  styles/           — tokens.css (design tokens), global.css
  pages/
    index.astro, lab.astro, pipeline.astro, mission.astro, contact.astro, 404.astro
  assets/           — logo2.png, recolored pillars, LDC, portraits, lab photos
```

Every section component is ≤150 lines. Every page file is ~30-50 lines (imports a layout, imports an MDX file, wires in props). Components are content-agnostic — reusable across pages.

---

## 10. Copy & voice

### Hero tagline

**Working placeholder:** _"Biology, decoded in the public interest."_

This is directional. The final tagline should be reviewed during implementation. Secondary options to test: _"An open lab for a more verifiable biology." / "From soil to published claim — in the public domain."_

### The full name

**"BioKEA"** is the primary mark everywhere. **"Biology Knowledge Exploration Assistant"** appears once on `/mission`, in the origin section, as a factual expansion. Not repeated elsewhere.

### Voice rules

1. **Conservative on AI.** Every AI-adjacent claim pairs with a concrete noun: _a pipeline_, _a validation step_, _a Claude Vision image check_, _an AT Protocol record_. Never standalone "AI-powered" or "intelligent" adjectives.
2. **Public-good language, specific.** "Built for the commons" / "in the public domain" / "open science" — tied to concrete commitments (FAIR, GBIF, NCBI SRA, Zenodo, ATProto). Not vibes.
3. **Evidence over adjectives.** Numbers where available: 7,000 sq ft, 2.4M reads, 4m 23s processing time, 5 novel lineages. Let counts do the work adjectives try to do.
4. **Short sentences, quiet authority.** Long paragraphs break into short ones. Confident tone without hyperbole.
5. **No AI-generated lorem.** Every paragraph is written for what it says. If we don't know the fact, we don't publish the sentence.

---

## 11. Accessibility, SEO, performance

- Target **Lighthouse ≥ 95 across all four categories** on every page.
- Semantic HTML throughout (proper `<nav>`, `<main>`, `<section>`, `<article>`, heading hierarchy).
- Every image has meaningful `alt` text. Portraits and pillars especially.
- Color contrast meets WCAG AA (cream + slate/teal passes comfortably; the one risk is teal-on-cream for small body copy — will verify with tooling).
- Per-page `<title>`, `<meta description>`, OpenGraph + Twitter card, canonical URL. Structured data: `Organization` and `Research Project` schema on home; `Person` on team.
- `robots.txt` + `sitemap.xml` generated automatically by Astro.
- All text content in MDX (server-rendered to HTML) so it's fully indexable without JS.
- Images served as AVIF/WebP with fallbacks; lazy-loaded below the fold.
- No third-party scripts on marketing pages (no chat widgets, no tag managers). Analytics is first-party or cookieless only.

---

## 12. Out of scope for v1

Explicitly NOT part of this rebuild:

- A blog or news/updates page (the current placeholder goes away; add later if there's real content volume).
- Interactive pipeline demos (Agentis has its own site for those).
- A public data portal (again, belongs on agentis.science or a dedicated subdomain).
- Internationalization (English only).
- Dark mode toggle (the cream editorial direction IS the mode).
- User accounts, logins, commenting, newsletter signup forms beyond the capabilities-call form.
- Any feature that requires a backend database.
- Integration with Bluesky feeds / AT Protocol reads (footer link is enough).

If demand emerges later, each of these can be added cleanly on top of the Astro foundation.

---

## 13. Success criteria

The overhaul is complete when:

1. A funder visiting biokea.ai from cold can, within 60 seconds of scanning, answer: _What does BioKEA do? Is it real? Who's behind it? How do I contact them?_
2. A scientific collaborator can reach the `/lab` and `/pipeline` pages and find enough detail to decide whether to pursue a collaboration conversation.
3. All five pages ship on Astro 5 + Tailwind 4, deploying to Cloudflare Workers, with Lighthouse ≥ 95 across categories.
4. The four prominent artworks are recolored to the cream + teal palette.
5. Real Berkeley lab photos are sourced and integrated.
6. No content is hard-coded in React/Astro components — MDX + typed data files only.
7. `/contact` submits to a working endpoint that emails the team.
8. `Labhus`, outdated pillar wheels, robot-character grids, and current orphaned pages are removed.

---

## 14. Open questions to resolve in implementation

These are deferred to the implementation plan, not blocking spec approval:

- Exact hero tagline (final wording).
- Recolor workflow: Illustrator on original vectors, Figma recomposition, or AI-assisted regeneration?
- Which lab photos are pulled from the Capabilities deck vs. reshoot vs. newly sourced.
- Contact form: which email-sending service the Workers function calls (Resend vs. Postmark vs. plain SMTP).
- Analytics: confirm Cloudflare Web Analytics meets needs, or drop in Plausible.
- Whether to offer a gated "capabilities deck" download on `/contact`.
- Whether `/mission` links out to any already-published BioKEA papers or drafts.
