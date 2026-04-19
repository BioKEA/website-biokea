# biokea.ai

The BioKEA website — Astro 6 + Tailwind 4, deploying to Cloudflare Workers.

## Run locally

```bash
npm install
npm run dev            # http://localhost:4321
```

## Test

```bash
npm test               # unit (Vitest)
npm run test:e2e       # end-to-end (Playwright)
npm run check          # type-check
```

## Build + preview

```bash
npm run build          # outputs to dist/
npm run preview
```

## Deploy

Cloudflare Workers, via `wrangler deploy`. Secrets:

```bash
wrangler secret put RESEND_API_KEY
# non-secret vars CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL are in wrangler.toml
```

## Architecture

```
src/
├── pages/                      # Routes (.astro + api/contact.ts)
├── layouts/BaseLayout.astro    # Global chrome (Nav + slot + Footer)
├── components/
│   ├── layout/                 # Nav, Footer, Seo
│   ├── sections/               # Hero, Thesis, Evidence, Ecosystem, Origin, CtaBand
│   └── ui/                     # Eyebrow, StatPill, PhotoCard, Portrait, PipelineStep, PartnerMark
├── data/                       # Typed content (team, partners, pipeline, milestones, stats)
└── styles/                     # tokens.css (design tokens), global.css (Tailwind entry)

public/assets/images/           # Logo, portraits, lab photos, illustrations
tests/
├── unit/                       # Vitest (content shape, contact endpoint)
└── e2e/                        # Playwright (per-page smokes)
```

## Content updates

- Page copy lives in the corresponding `src/pages/*.astro` file for now; large content blocks (team, partners, pipeline stages, milestones, stats) live in typed `src/data/*.ts` files.
- New team members or partners: edit `src/data/team.ts` or `src/data/partners.ts`.
- New milestone: edit `src/data/milestones.ts`.
- Stat updates: edit `src/data/stats.ts`.

## Specs

- Design spec: `docs/superpowers/specs/2026-04-18-biokea-site-overhaul-design.md`
- Implementation plan: `docs/superpowers/plans/2026-04-18-biokea-site-overhaul.md`

## Known open items

- Portrait images for Michelle Jungbluth and Austin Baker (currently using placeholder SVG)
- Final homepage stats beyond `5,000 sq ft` (placeholders `—` in `src/data/stats.ts`)
- Cream-palette recolors of the 4 neon illustrations (hero badge, 3 pillars) — original assets still referenced
- Cloudflare Web Analytics token — placeholder `REPLACE_WITH_CF_BEACON_TOKEN` in `BaseLayout.astro`
- Resend account + domain verification for the contact form
