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

## Migrations

Supabase schema changes live in `migrations/*.sql`, applied by hand:

- `migrations/0005_quotes.sql`
- `migrations/0006_quote_payments.sql`
- `migrations/0007_shopify.sql`

Apply in the Supabase Dashboard → SQL Editor, in order; **0006 must be
applied before the first deploy of the payments code** (existing quotes get
`status = 'quoted'`), and **0007 before the first deploy of the Shopify
gateway** (renames the Stripe-era column names to provider-neutral ones —
free, since nothing had reached production on the old names).

## Payments (Shopify)

Customers configure a quote and pay in full either from `/quote` (or
`/quote/<token>` for a saved quote) or from a service product page on
`store.biokea.ai` — both host the same quote widget bundle. Under-shipping
settles as a 12-month credit, not a refund — see the spec. Staff issue the
balance invoice from `/admin/quotes/<number>` when more samples arrive than
quoted. The payment rail is Shopify Draft Orders: no card data touches our
infrastructure, and pricing stays authoritative on our Worker — Shopify
never computes a service price.
Design: `docs/superpowers/specs/2026-08-17-shopify-store-design.md`. Store
setup (domain, custom app, webhooks, products, theme, Turnstile hostname):
`docs/shopify/STORE-SETUP.md`.

Secrets:

```bash
wrangler secret put SHOPIFY_ADMIN_TOKEN     # custom app Admin API token — write_draft_orders, read_orders, read_products
wrangler secret put SHOPIFY_WEBHOOK_SECRET  # Settings → Notifications → Webhooks signing key
```

Vars (`wrangler.toml`): `SHOPIFY_STORE_DOMAIN` (`biokea.myshopify.com`),
`SHOPIFY_STORE_HANDLE` (`biokea` — builds the `admin.shopify.com/store/<handle>/…`
links on the admin quote page), `SHOPIFY_PAYMENT_TERMS_TEMPLATE` (optional,
default `NET_30` — net terms on the draft order for PO buyers).

Rollout order:

1. Apply `migrations/0007_shopify.sql` in Supabase (see Migrations, above).
2. Create the Cloudflare Access app and set `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` in `wrangler.toml`
   (unchanged from before payments): Zero Trust → Access → Applications → Add → Self-hosted; domain
   `biokea.ai`, paths `/admin/*` and `/api/admin/*`; policy Allow emails ending `@biokea.ai`.
3. Walk `docs/shopify/STORE-SETUP.md` steps 1–6: create the store, connect `store.biokea.ai` (DNS-only
   CNAME), create the `biokea-website` custom app and copy its Admin API token, create the four
   webhook topics pointed at `https://biokea.ai/api/shopify/webhook` and copy the signing key, confirm
   Net 30 payment terms are available, mark the service products non-taxable.
4. `wrangler secret put SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_WEBHOOK_SECRET`, confirm the vars above, deploy.
5. `STORE-SETUP.md` steps 7–8: create the two service products (`specimen-barcoding`,
   `edna-metabarcoding`) and the eight placeholder goods; on the `product.quote` template, add a
   Custom Liquid section pasting in `docs/shopify/product-quote-section.liquid` — it mounts the same
   widget bundle served from `biokea.ai/widget/quote.js` and `.css`.
6. Add `store.biokea.ai` to the Turnstile widget's allowed hostnames (Cloudflare dashboard).
7. Walk the test-mode checklist with Shopify's Bogus Gateway (deposit → balance → paid, draft delete,
   net-30 invoice, refund, goods checkout, domain + TLS), then switch on Shopify Payments live.
8. Marketing CTAs (`/pricing`, `/services`, the Nav "Store" link) already point at the store — nothing
   left to flip.

Local dev: copy `.dev.vars.example` → `.dev.vars` — it lists every key the Worker reads, including a
Shopify test-app token. `npm run dev` builds the widget bundle first (`widget:build`, gitignored
output at `public/widget/quote.{js,css}`) and then starts the dev server. Set `CF_ACCESS_DEV_EMAIL` to
reach `/admin` locally.

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
