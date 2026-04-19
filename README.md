# biokea.ai

The BioKEA website — Astro 6 + Tailwind 4, deploying to Cloudflare Workers.

BioKEA is an AI company with a wet-lab moat: a 5,000+ sq ft Berkeley lab and an AI
pipeline from field sample to verifiable scientific claim. The LDC also runs as a
molecular sequencing service for environmental-DNA and biodiversity-omics customers.

## Run locally

```bash
npm install
npm run dev            # http://localhost:4321
```

## Test

```bash
npm run check          # astro check (TypeScript + Astro diagnostics)
npm test               # vitest — unit tests
npm run test:e2e       # playwright — per-page smokes + API endpoints
```

CI runs the same three on every PR (`.github/workflows/deploy.yml`).

## Build + preview

```bash
npm run build          # outputs to dist/
npm run preview
```

## Deploy

Cloudflare Workers, via `wrangler deploy`. CI handles this automatically on push to
`main`. Secrets:

```bash
wrangler secret put RESEND_API_KEY
# non-secret vars (CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL) live in wrangler.toml
```

## Architecture

```
src/
├── pages/
│   ├── *.astro                 # Routes (/, /mission, /lab, /pipeline, /projects,
│   │                           #         /agentis, /contact, 404)
│   └── api/
│       ├── contact.ts          # POST — contact form → Resend
│       ├── team.json.ts        # GET — static JSON of team
│       ├── projects.json.ts    # GET — static JSON of projects
│       └── capabilities.json.ts # GET — lab + services + equipment + partners
├── layouts/BaseLayout.astro    # Global chrome; accepts noindex prop
├── components/
│   ├── layout/                 # Nav, Footer, Seo
│   ├── sections/               # Hero, Thesis, Evidence, Ecosystem, Origin, CtaBand
│   └── ui/                     # Eyebrow, StatPill, PhotoCard, Portrait, PipelineStep,
│                               # PartnerMark, ProjectCard
├── data/                       # Typed content modules
│   ├── team.ts  partners.ts  projects.ts
│   ├── milestones.ts  stats.ts  pipeline.ts  equipment.ts
└── styles/                     # tokens.css (design tokens), global.css (Tailwind entry)

public/
├── llms.txt                    # Agent-first site summary (llmstxt.org)
├── assets/images/              # Logo, portraits, lab photos, illustrations
└── favicon.*, robots.txt, site.webmanifest

tests/
├── unit/                       # Vitest — content shape + contact endpoint
└── e2e/                        # Playwright — per-page + JSON-LD + /api/*.json

docs/                           # Briefs, references, source material, archive.
                                # See docs/README.md.
```

## Agent-facing surface

- `/llms.txt` — agent-first site summary per [llmstxt.org](https://llmstxt.org)
- `/api/team.json`, `/api/projects.json`, `/api/capabilities.json` — machine-readable data
- Per-page JSON-LD `@graph`: Organization, Person, ResearchOrganization, Place,
  Service, SoftwareApplication, Dataset, SoftwareSourceCode, HowTo

## Content changes

Most content lives in `src/data/*.ts`. Editing those files is usually enough — the
pages + JSON-LD + `/api/*.json` endpoints all read from them.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full workflow.

## Docs

`docs/` is source material and planning, not shipped content. See
[`docs/README.md`](docs/README.md) for the layout.

- `docs/briefs/` — LDC visual style guide, imagery production brief
- `docs/references/` — external PDFs (AI-first bio-publishing deck, capabilities deck,
  CIBI Ecography proof)
- `docs/source/` — raw inputs for `public/assets/images/`
- `docs/imagery-production-pack/` — the delivered 13-asset cream-palette pack
- `docs/superpowers/` — design spec + implementation plan for the Astro overhaul
- `docs/archive/` — pre-Astro-migration artifacts (see `archive/README.md` for
  pointers to the old Next.js source in git history)

## Known open items

- Cloudflare Web Analytics token — placeholder `REPLACE_WITH_CF_BEACON_TOKEN` in
  `src/layouts/BaseLayout.astro`
- Replace advisor placeholder portraits (`portrait-placeholder.svg`) with real photos
  for Sunit Jain and Greg Fedewa
- Dependabot is wired up (`.github/dependabot.yml`); review the initial wave of PRs
  when they land
