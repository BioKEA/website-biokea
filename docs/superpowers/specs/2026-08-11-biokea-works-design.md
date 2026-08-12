# BioKEA Works — website integration design

**Date:** 2026-08-11
**Source brief:** `BIOKEA_WORKS_WEBSITE_BRIEF.md` (repo root; compiled 2026-08-11 from BioKEA's internal monorepo)

## 1. Goal

Represent BioKEA Works — BioKEA's suite of eight named scientific-software
products — on biokea.ai, honestly framed as **closed-testing alpha**. Six
products (Works, Atlas, Studio, BioInfoOS, Scribe, Press) have real
substance; two (Droplet, Sequoia) are reserved names only.

## 2. Conflict with existing site content (why this isn't just "add a page")

The live site already has substantial content that contradicts the brief,
predating BioKEA's internal consolidation into the Works suite:

| Topic     | What the site currently says                                                                                                                                     | What the brief says                                                            |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Agentis   | Standalone AI-first journal on the AT Protocol, own page at `/agentis`, launching at `agentis.science`, homepage pillar, nav item, JSON-LD `SoftwareApplication` | A feature living _inside_ Press (`press.biokea.ai/agentis`)                    |
| Sequoia   | Full "foundation model for global biodiversity" project entry in `projects.ts` (Seed/Forest tiers)                                                               | Reserved name, no product logic at all                                         |
| Droplet   | Homepage ecosystem tile: "aquatic eDNA and metabarcoding specialist service line"; same framing in `llms-full.txt.ts` / `public/llms.txt`                        | Reserved name, no product logic at all                                         |
| BioInfoOS | Internal-only LDC software layer (QC, taxonomy reconciliation, FAIR validation)                                                                                  | A customer-facing compute product with its own subdomain and direct API access |

**Decision (confirmed with user): BioKEA Works supersedes this content.**
The standalone Agentis narrative is retired and folded into Press. Sequoia
and Droplet drop back to reserved-name-only. BioInfoOS is reframed as a
suite product (its internal-only framing becomes supporting detail, not
the whole story).

Additional naming collision found during reconciliation: the homepage's
third ecosystem tile is labeled "Droplet" but is unrelated to the reserved
product name — it's a marketing label for BioKEA's existing aquatic-eDNA
service angle (links to `/services`, never mentioned by that name on
`/services` itself). **Decision: rename the tile**, keep its content/link,
so "Droplet" stays free for whatever BioKEA Works eventually defines it as.

## 3. Confirmed decisions

- **Subdomains are live but gated.** `atlas.biokea.ai` etc. are real,
  reachable apps today (closed-testing/login-walled), not vaporware — safe
  to link out to them directly.
- **IA: one `/works` page, not one page per product.** A single overview
  page with one card per product (name, one-liner, 2–4 capabilities,
  consistent "closed testing" badge, outbound link to the gated subdomain).
  Matches the brief's suggested §7 structure. Revisit dedicated per-product
  pages later if a product needs more depth than a card can carry.
- **Nav placement:** swap the "Our work" group's `Agentis` item for `Works`
  → _Projects, Works, Press_. No structural nav change.
- **`/agentis` page: delete outright.** No redirect. The page has no
  meaningful external backlinks yet; a clean removal is simpler than
  maintaining a redirect for content that no longer exists in any form.
- **Request-access CTA reuses `/contact`.** Swap the `'Agentis — early
access'` topic for `'BioKEA Works — request access'` in both
  `api/contact.ts`'s zod enum and `contact.astro`'s duplicate
  `TOPIC_PRESET_MAP`/`<option>`. `/works`'s CTA points to
  `/contact?topic=works`. Zero new backend work.
- **Coming soon section on `/works`:** list Droplet and Sequoia by name
  only, no feature claims, visually distinct (quieter) from the 6 real
  product cards.
- **`projects.ts` cleanup:** remove the `agentis` and
  `sequoia-foundation-model` entries. Neither was a real case study; both
  overstate a name the brief says has no product logic (Sequoia) or a
  product now positioned differently (Agentis).
- **`pipeline.ts` stage 06 ("Amplify") rewrite.** Its subtitle/body
  ("ATProto / Bluesky" / "Seamless AT Protocol integration pushes
  verifiable scientific artifacts into decentralized social graphs") is the
  retired AT-Protocol vision baked into data, not just prose. Reword to
  match the brief's actual Press feature: a human-approved, platform-neutral
  share campaign after publication, dropping AT-Protocol/Bluesky specifics.
  Stage 05 ("Broadcast" / "Interactive StoryMap") stays as-is — StoryMap
  remains valid BioKEA Works terminology per the brief's glossary.
- **Homepage Works tile image:** no dedicated "BioKEA Works" art exists.
  Reuse the already-present, currently-unwired `Pillar4-Labhus.webp` as a
  placeholder until real art is commissioned.
- **Left unchanged (judgment calls, flagged, no objection raised):**
  - `src/data/milestones.ts` — "2025-04 · Agentis started" timeline entry
    stays. It's accurate history, not a forward claim about the current
    product.
  - `src/data/team.ts` — "AT Protocol" stays in Sean's `knowsAbout` list.
    It's a fact about his personal skills, not a claim about what BioKEA
    Works uses today.

## 4. `/works` page structure

1. **Hero** — suite pitch (brief §1): shared identity + compute engine
   across independent products; differentiators (reproducibility via
   Result Manifests, no silent fallback, curated tool library, AI-assisted
   human-confirmed, start-anywhere). Explicit "closed-testing alpha" badge.
2. **How it fits together** — compact text/pill flow of the suggested path
   (brief §3): Atlas → Studio → BioInfoOS → Studio → Scribe → Press →
   Atlas, with a line noting every product is independently usable.
3. **Products** — 6 cards, one per real product, content drawn from brief
   §2.1–2.6:
   - **Works** (works.biokea.ai) — identity/projects/permissions, "one
     account, one identity across the whole suite."
   - **Atlas** (atlas.biokea.ai) — discover public data; flagship
     "materialize into Studio" capability.
   - **Studio** (studio.biokea.ai) — the scientific workbench; primary
     workspace, hands off to Scribe.
   - **BioInfoOS** (bioinfoos.biokea.ai) — the compute engine; curated
     vetted-tool catalog; Result Manifest on every run; direct API access
     for approved users.
   - **Scribe** (scribe.biokea.ai) — authoring; result → structured
     manuscript or StoryMap; non-persistent sandbox usable today.
   - **Press** (press.biokea.ai) — review & publish, including Agentis
     (evidence-backed review, at `/agentis` under Press) as a named
     sub-feature, not a separate card.
     Each card: consistent "Closed testing" badge, outbound link styled like
     `ProjectCard.astro`'s live-external treatment (`slug.biokea.ai ↗`,
     `target="_blank" rel="noopener"`).
4. **Coming soon** — Droplet, Sequoia: name only.
5. **CTA band** — "Request access" → `/contact?topic=works`.
6. **JSON-LD** — one `@graph`, one `SoftwareApplication` per real product,
   each `releaseNotes: "In closed-testing alpha."`, mirroring the pattern
   the old `/agentis` page used for its own single entry.

## 5. Reconciliation checklist (existing files to change)

**New:**

- `src/data/works.ts` — typed product array (slug, name, subdomain,
  tagline, capabilities, status) + reserved-names array (Droplet, Sequoia).
- `src/pages/works.astro` — built from `works.ts`, following
  `pipeline.astro`'s section-per-topic layout conventions. No new shared
  card component — 6 inline-mapped cards on one page doesn't warrant one.
- `tests/e2e/works.spec.ts`.

**Deleted:**

- `src/pages/agentis.astro`
- `tests/e2e/agentis.spec.ts`

**Edited:**

- `src/components/layout/Nav.astro` — swap Agentis → Works in "Our work".
- `src/components/layout/Footer.astro` — swap `/agentis` link → `/works`.
- `src/pages/index.astro` — ecosystem tiles (Droplet renamed, Agentis
  tile → Works tile w/ placeholder image); FAQ JSON-LD ("What is
  Agentis?" → "What is BioKEA Works?"; engagement-routes answer).
- `src/data/projects.ts` — remove `agentis`, `sequoia-foundation-model`.
- `src/data/pipeline.ts` — reword stage 06 ("Amplify").
- `src/pages/pipeline.astro` — "BEING BUILT" (BioinfoOS → link to
  `/works#bioinfoos`) and "PUBLISHED AT" (Agentis pitch → pointer to
  Press/Works) sections.
- `src/pages/services.astro` — FAQ answer gets a `/works#bioinfoos` link.
- `src/pages/press.astro` — reword the `oneParagraph` summary (Agentis
  as a forthcoming standalone platform → Agentis as a Press sub-feature).
- `src/pages/api/contact.ts` — topic enum swap.
- `src/pages/contact.astro` — `TOPIC_PRESET_MAP` + `<option>` swap, kept in
  sync with `contact.ts`.
- `src/pages/llms-full.txt.ts` — BioinfoOS/Agentis/Droplet bullets rewritten
  to current reality.
- `public/llms.txt` — same rewrite, independently (hand-maintained file,
  not generated from `llms-full.txt.ts`).
- `src/components/sections/ProgramsStrip.astro` — no change needed; its
  "LDC and BioinfoOS" credits mention is still accurate once BioInfoOS is a
  suite product (same underlying engine).

**Explicitly left unchanged:** `src/data/milestones.ts`, `src/data/team.ts`
(see §3).

## 6. Testing

- `tests/e2e/works.spec.ts` (new): page renders; all 6 products + 2
  reserved names visible; each product card links to its subdomain;
  "Request access" CTA routes to `/contact?topic=works`.
- `tests/e2e/agentis.spec.ts`: deleted.
- `tests/e2e/pipeline.spec.ts`: update the "teases BioinfoOS and Agentis
  with external link" assertion to match the new BioInfoOS/Press framing.
- `tests/e2e/home.spec.ts`: update the Agentis ecosystem-tile assertion and
  the "What is Agentis?" FAQ assertion.
- `tests/e2e/nav.spec.ts`: update "Our work" dropdown and footer link
  assertions (Agentis → Works).
- `tests/unit/content-data.test.ts`: update if it asserts `projects` array
  length or specific slugs (`agentis`, `sequoia-foundation-model` removed).
- No backend/DB changes, so no migration or API-contract tests needed.

## 7. Out of scope

- Dedicated per-product pages (e.g. `/works/atlas`) — revisit if a product
  outgrows a card.
- Real "BioKEA Works" art asset — using `Pillar4-Labhus.webp` as a
  placeholder; commissioning real art is a follow-up.
- Any change to `src/data/milestones.ts` or `src/data/team.ts`.
- Any backend/Supabase change — this is a content/IA change reusing
  existing `/contact` infra end-to-end.
