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

Or, without a local Node install, via Docker (dev server only — the
Cloudflare Worker deploy still goes through wrangler/CI):

```bash
docker compose up      # http://localhost:4321, live-reloads from ./src
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

## Payments (Stripe)

Customers pay a 50% deposit on a quote from `/quote/<token>`; staff issue the
balance from `/admin/quotes/<number>`. Design: `docs/superpowers/specs/2026-08-16-stripe-payments-design.md`.

Worker secrets (once per mode):

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # sk_test_… first, sk_live_… at go-live
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # from the dashboard webhook endpoint
```

`wrangler.toml` vars: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (Cloudflare Access app for `/admin/*`). `wrangler.toml` also enables `compatibility_flags = ["nodejs_compat"]` — the stripe SDK needs Node built-ins on Workers.

Stripe dashboard (once, in test mode, then repeat in live):

1. Settings → Payments → Payment methods: enable **ACH Direct Debit** and **Bank transfers**.
2. Settings → Billing → Invoices: upload logo/brand colour; turn on "Email finalized invoices to customers" and receipts.
3. Developers → Webhooks → Add endpoint `https://biokea.ai/api/stripe/webhook`, events
   `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`; copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

Cloudflare Zero Trust (once): Access → Applications → Add → Self-hosted; domain `biokea.ai`,
paths `/admin/*` and `/api/admin/*`; policy Allow emails ending `@biokea.ai` (Google or One-time PIN);
copy the team domain and the app's Audience (AUD) tag into `wrangler.toml`.

Local dev: copy `.dev.vars.example` → `.dev.vars` (test keys; `.dev.vars.example` lists every key including the Stripe test keys), run `npm run dev`, and in another
terminal `stripe listen --forward-to localhost:4321/api/stripe/webhook` (paste its `whsec_…` into `.dev.vars`).
Set `CF_ACCESS_DEV_EMAIL` to reach `/admin` locally.

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
