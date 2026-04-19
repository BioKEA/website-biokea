# Contributing to biokea.ai

This is the BioKEA website — Astro 6 + Tailwind 4, deploying to Cloudflare Workers.
External contributions are welcome, but most work lands via internal PRs.

## Local setup

```bash
npm install
npm run dev            # http://localhost:4321
```

## Before you open a PR

Run all three in order. CI runs the same three.

```bash
npm run check          # astro check (TypeScript + Astro diagnostics)
npm test               # vitest — unit
npm run test:e2e       # playwright — per-page smokes + API endpoints
```

If you touched imagery, design tokens, or UI, also verify visually in the browser.
Lighthouse shouldn't regress perf / a11y / best-practices / SEO on affected pages.

## Branches

- `main` — production. Auto-deploys via `.github/workflows/deploy.yml`.
- Feature branches: `feat/…`, `copy/…`, `chore/…`, `fix/…` — anything else lands via PR.
- Commits follow the scope-prefix style: `feat(home): …`, `copy(projects): …`,
  `chore(docs): …`, `fix(lab): …`. Keep subject under ~70 chars.

## Where things live

| Path                           | Purpose                                                                                  |
| ------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/pages/`                   | Routes (`.astro` pages + `api/contact.ts` + `api/*.json.ts`)                             |
| `src/components/layout/`       | Chrome: Nav, Footer, Seo                                                                 |
| `src/components/sections/`     | Reusable page sections (Hero, Thesis, Evidence, Ecosystem, Origin, CtaBand)              |
| `src/components/ui/`           | Leaf components (Eyebrow, StatPill, PhotoCard, Portrait, ProjectCard, PartnerMark)       |
| `src/data/`                    | Typed content modules (team, partners, projects, milestones, stats, pipeline, equipment) |
| `src/styles/`                  | `tokens.css` (design tokens) + `global.css` (Tailwind entry)                             |
| `src/layouts/BaseLayout.astro` | Global wrapper — accepts `noindex` prop                                                  |
| `public/llms.txt`              | Agent-first site summary (per llmstxt.org)                                               |
| `public/assets/images/`        | Production imagery                                                                       |
| `tests/unit/`                  | Vitest — data-shape + contact endpoint                                                   |
| `tests/e2e/`                   | Playwright — per-page smokes, JSON-LD, and `/api/*.json`                                 |
| `docs/`                        | Source material, briefs, references, and archive (see `docs/README.md`)                  |

## Content changes (no code)

Most content lives in typed modules under `src/data/`. Edit there, don't hardcode copy
into pages.

- Team / advisors → `src/data/team.ts`
- Partners → `src/data/partners.ts` (url + description surface in the PartnerMark + JSON-LD)
- Projects → `src/data/projects.ts`
- Milestones → `src/data/milestones.ts`
- Stats → `src/data/stats.ts`

If the change adds a new first-use acronym to a page, add an inline expansion or
`<abbr title>` and, if the concept is broad, a line in the `Vocabulary` section of
`public/llms.txt`.

## Deploy

Cloudflare Workers via `wrangler`. CI handles this automatically on push to `main`.
Manual:

```bash
npm run build
wrangler deploy
```

Secrets:

```bash
wrangler secret put RESEND_API_KEY
# non-secret envs (CONTACT_FROM_EMAIL, CONTACT_TO_EMAIL) live in wrangler.toml
```

## Reporting issues

Use the GitHub issue templates:

- **Bug report** — something's broken or visually wrong
- **Content change** — roster / partner / copy / imagery update

Partnership / capabilities / funding inquiries go through the website contact form,
not GitHub.
