# BioKEA Works — Brief for Updating biokea.ai

**Purpose of this document:** you (an agent with no access to BioKEA's local codebases) are being asked to update the marketing website at biokea.ai to represent BioKEA's product suite, "BioKEA Works." This document is a self-contained summary of what that suite is, what each product does, and — critically — how mature each piece actually is, so the website doesn't overstate what exists today.

**Source:** compiled 2026-08-11 by directly reading BioKEA's internal monorepo (README, product specification, architecture docs, and each app's own README) across ~40 files. It is a snapshot of a live, actively-changing codebase — treat specifics (exact test counts, revision numbers, etc.) as illustrative, not to be quoted, and defer to whatever the user tells you directly if it conflicts with this snapshot.

---

## 0. The one thing to get right: this is closed-testing alpha

Every product below should be presented as **under active development, in closed/internal testing** — not as generally available, not as "live," and not with specific performance claims. This is not marketing caution for its own sake — it's what the source material itself says, repeatedly and explicitly:

- The internal product spec states outright: _"Nothing has been published, deployed, approved, or activated"_ and that the production workflow catalog (i.e., the list of actually-runnable analyses) is currently **empty**.
- Every app's own README describes its live functionality as a small, honest "foundation" or "preview" slice — e.g. Press's own public copy says _"The application boundary is live; submission, review, and publication persistence are not enabled yet."_
- Two of the eight named products (Droplet, Sequoia) have **no defined purpose yet** — they are reserved names with placeholder pages only.

**Safe framing for the website:** "BioKEA Works is a suite of scientific software products currently in closed-testing alpha" / "in active development" / "by invitation." Avoid: "available now," "production-ready," specific throughput/scale numbers, or describing any workflow as something a general user can run today.

---

## 1. What is BioKEA Works (the pitch)

BioKEA Works is a connected suite of tools for the full lifecycle of a scientific research project — built for researchers and labs working with ecological and biodiversity data (the recurring domain focus throughout is **environmental DNA / eDNA metabarcoding, marine and soil biodiversity surveys, taxonomy, and long-term ecological monitoring** — not clinical or human genomic data, which is explicitly out of scope for now).

The core idea: instead of one monolithic platform, BioKEA Works is a set of **independent products that share one identity system and one secure compute engine**, so a researcher's project, permissions, and data provenance travel with them from raw data → analysis → writing → peer review → public discovery, without forcing them through steps they don't need.

Differentiators worth using in copy:

- **Reproducibility as a headline feature, not a footnote.** Every computational result carries an immutable, versioned record of exactly what tool, what data, what parameters, and what software version produced it (internally called a "Result Manifest").
- **No silent fallback.** If an analysis fails, the system is designed to never quietly substitute fake/mock output and present it as a real result — a strong "honest science" claim.
- **Curated, not "bring your own code."** Computation only runs pre-approved, vetted, versioned tools — a safety and reproducibility feature, framed positively ("a curated library of vetted, reproducible bioinformatics tools"), not a limitation.
- **AI-assisted, human-confirmed.** Where AI assists (e.g., in drafting or review), output is labeled with confidence/source and a human must confirm it before it's treated as fact.
- **You can start anywhere.** Each product is usable on its own — there's a suggested path through the suite, but it's not a forced funnel.

---

## 2. The product suite

BioKEA Works consists of eight named products, each at its own subdomain of biokea.ai. **Only six have any real substance to describe; two are reserved placeholders (see below).**

| Product       | Subdomain           | One-line description                                                                                                                                                                     | Status                                                                                                             |
| ------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Works**     | works.biokea.ai     | Identity, projects, and permissions — the shared login and authorization layer for the whole suite                                                                                       | Foundation live; most human-facing features (project creation, people management) still closed                     |
| **Atlas**     | atlas.biokea.ai     | Public dashboards and data catalog — discover, filter, and explore published scientific datasets                                                                                         | Preview/demo data only; signature "send to Studio" flow built but gated                                            |
| **Studio**    | studio.biokea.ai    | The scientific workbench — import data, manage samples, run analyses, review results                                                                                                     | Most feature-developed product; core flows exist but remote execution requires manual approval, not self-serve yet |
| **BioInfoOS** | bioinfoos.biokea.ai | The shared compute engine — run vetted bioinformatics workflows, with full provenance tracking                                                                                           | Engine built and tested on real hardware; production workflow catalog is currently empty (no live workflow yet)    |
| **Scribe**    | scribe.biokea.ai    | Scientific authoring — turn a result into a structured, citation-linked manuscript or interactive "StoryMap"                                                                             | A local writing sandbox is genuinely usable today (non-persistent); full document/publishing pipeline not yet live |
| **Press**     | press.biokea.ai     | Peer review and publication — submission, screening, review, editorial decision, and public release (includes **Agentis**, an evidence-backed review module, at press.biokea.ai/agentis) | Deep architecture in place; only a handful of read-only preview pages are live, no real submissions yet            |
| **Droplet**   | droplet.biokea.ai   | _Reserved — no assigned purpose yet_                                                                                                                                                     | Name reserved only; literally no product logic                                                                     |
| **Sequoia**   | sequoia.biokea.ai   | _Reserved — no assigned purpose yet_                                                                                                                                                     | Name reserved only; literally no product logic                                                                     |

### 2.1 Works — identity & projects

The shared login, project, and permissions system underlying every other product. Not really a "destination" product from a user's perspective — more like the passport that lets a researcher move between Atlas, Studio, BioInfoOS, Scribe, and Press with one identity and one set of project permissions. Fine to mention as "one account, one identity across the whole suite" rather than featuring it as a standalone product page.

### 2.2 Atlas — discover

A public-facing catalog for browsing scientific/ecological datasets and published research ("StoryMaps" — see glossary). The flagship feature: a researcher browsing a public dataset can turn their exact current view (filters, selection) into their own private, reproducible dataset inside Studio, with full citation trail preserved — described internally as the suite's signature cross-product interoperability story. Good tagline material: "go from browsing public data to analyzing your own reproducible copy of it in one step."

### 2.3 Studio — analyze

The primary scientific workspace: import or receive data, manage samples (including physical/field sample tracking), validate data quality, plan and submit analyses (which run on BioInfoOS), and explore results (taxonomy, phylogenetic trees, diversity statistics, maps). This is where a researcher would spend most of their working time. Hands finished results off to Scribe for writing up.

### 2.4 BioInfoOS — compute

The engine that actually runs bioinformatics analyses — sequence quality control, taxonomic assignment, diversity statistics, phylogenetics, and more, on a pool of CPU and GPU workers. Two important framing points:

- It's not just internal plumbing — approved users can use BioInfoOS **directly**, through its own interface or a personal API, to run analyses themselves using the same engine that powers the other products.
- It only runs from a curated, versioned catalog of pre-approved tools — never arbitrary user code — which is the basis of its reproducibility and safety story.
- Every successful run produces a "Result Manifest": a verifiable record of exactly what ran, on what data, with what parameters and software versions.

### 2.5 Scribe — write

Turns a finished, versioned Studio result into a structured scientific document — narrative, figures, tables, citations — while keeping everything traceably linked back to its source data. Also supports "StoryMaps," data-driven visual narratives combining maps, charts, and text (an interactive, shareable format for a scientific story). A document doesn't have to start from Studio — it can also start blank or from an imported manuscript.

### 2.6 Press — review & publish (incl. Agentis)

Handles the editorial side: submission, automated pre-screening, independent human peer review, revision cycles, an editorial decision, and — on acceptance — public release with permanent archiving (DOI/repository deposit). Corrections and retractions are preserved as permanent history rather than quietly edited away. **Agentis** is an evidence-backed review capability that lives inside Press (at `/agentis`), linking review claims to their supporting evidence — describe it as a Press feature, not a separate product, unless BioKEA tells you otherwise (see open question in §6).

After publication, Press can also coordinate a human-approved, platform-neutral social/share campaign for that specific release — but only after publication and only with explicit editorial approval, never automatically.

### 2.7 / 2.8 Droplet & Sequoia — reserved

These are held product names with genuinely no defined purpose or functionality yet. **Do not invent capabilities for these.** If they appear on the site at all, present them plainly as reserved/future product slots ("coming soon" or simply omit them until BioKEA defines them).

---

## 3. How the products fit together

The suggested (not mandatory) path through the suite tells a clean story for a "how it works" section of the site:

**Atlas** (discover public data) → **Studio** (import & analyze) → **BioInfoOS** (compute, in the background) → **Studio** (review results) → **Scribe** (write it up) → **Press** (peer review & publish) → **Atlas** (the new result becomes publicly discoverable) → optionally back into **Studio** (someone else reproduces or extends it).

Every product can also be entered independently — a researcher doesn't have to visit Atlas first to use Studio, for example. Handoffs between products are secure and versioned (a link/reference, never raw data or credentials, and always traceable back to its source) — a good basis for language like "your data's history travels with it, securely, everywhere it goes in BioKEA Works."

---

## 4. Glossary (terms safe to use, and how to phrase them)

| Internal term                         | Marketing-safe phrasing                                                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Result Manifest                       | "Every result comes with a verifiable record of exactly how it was produced."                                             |
| StoryMap                              | "An interactive, data-driven scientific story combining maps, charts, and narrative."                                     |
| Materialization ("Analyze in Studio") | "Turn what you see in Atlas into your own reproducible dataset."                                                          |
| Evidence Passport                     | "A publication's full, verified evidence trail."                                                                          |
| Room (e.g. CalATBI, Intertidal, Oahu) | These are **external partner data sources/sites**, not BioKEA products — don't present them as BioKEA's own.              |
| Workflow catalog                      | "A curated library of vetted, reproducible bioinformatics tools" (not "run any code you want").                           |
| Screening (Press)                     | The automated pre-check stage before full human peer review — a specific editorial-pipeline term, not generic "checking." |
| eDNA                                  | Environmental DNA — shorthand the target audience (ecologists/biodiversity researchers) will recognize; fine to use.      |

---

## 5. What NOT to put on the website

- **Internal maintenance services** — BioInfoOS has several background services (a "verifier," "janitor," "artifact cleaner," "execution reaper") plus a worker agent that runs on compute hardware. These have no user interface and are purely internal reliability/integrity plumbing. They should never appear as separate products; at most, their existence supports a line like "every result is independently verified" or "self-healing job execution."
- **Shared internal platform packages** — there's a shared design system and a shared data-contract layer used across all products internally. Fine to gesture at generally ("built on one unified, secure platform where products interoperate safely") but don't name internal package names or describe the mechanism.
- **Stale duplicate folders** — there are older, pre-consolidation copies of several apps (atlas, studio, works, press, scribe, droplet, sequoia, bioinfoos) sitting in a separate local directory from the current monorepo. They're superseded/frozen snapshots with no current information value — this brief already reflects only the current, active versions.
- **Client case studies are not BioKEA Works products.** BioKEA has done specific client/research engagements — e.g., a biodiversity dashboard for a California biodiversity initiative (appears to be a branded deployment of the Atlas product line), a 2025 intertidal-species barcode-gap-analysis pipeline for another research client, and a dive-conditions demo app tied to an external dive-brand (originated as a contest entry). These are real, but they're case studies / portfolio evidence, not part of the BioKEA Works product suite — if used at all, frame them as "BioKEA's technology in action" sidebars or case studies, not as products alongside Atlas/Studio/etc.

---

## 6. Open question to confirm with BioKEA before publishing

There's a positioning ambiguity around **Agentis**: the current monorepo and product spec both describe Agentis as a feature living _inside_ Press (`press.biokea.ai/agentis`). However, a separate, more fully-developed standalone codebase for "Agentis" describes something broader — an AI-first scientific publishing platform (AI-assisted analysis pipeline → knowledge graph → peer review → StoryMap publication with data deposits to public repositories like GBIF/Zenodo). Before publishing copy about Agentis, confirm with BioKEA whether it should be presented strictly as a Press sub-feature (current documented position) or as a more prominent capability/product of its own.

---

## 7. Suggested site structure (optional starting point)

- **Home** — the one-paragraph pitch (§1) + the "how it fits together" loop (§3), framed clearly as closed alpha / early access.
- **Products** — one section/card per real product: Works, Atlas, Studio, BioInfoOS, Scribe, Press. Each gets: one-line description, 2-4 key capabilities (from §2), and a consistent "in closed testing" badge.
- **(Optional) Coming soon** — Droplet and Sequoia, named only, no feature claims.
- **(Optional) Case studies** — the client engagements from §5, clearly separated from the product suite.
- **Request access / waitlist** — since nothing is generally available, a request-access or waitlist call-to-action is more honest than a signup flow.
