# Games to `games.biokea.ai` — design

**Date:** 2026-08-16
**Slice:** B of two. Slice A (Golden Sample sunset + nav simplification,
`2026-08-16-hunt-sunset-and-nav-design.md`) is merged.

## 1. Goal

Move the six BioKEA games — the index, the handle picker, the leaderboard,
the `handle-check` endpoint, and the built game bundles — off biokea.ai
and onto a standalone site at `games.biokea.ai`, built from a new repo
`BioKEA/games-site`. biokea.ai keeps a single external "Games" link in the
nav and nothing else games-related.

Three reasons, all wanted:

1. **Decouple builds and deploys.** Every biokea.ai deploy currently
   clones and Vite-builds six game repos (~3–4 min). After this slice the
   marketing site deploys in about a minute and the games ship on their
   own cadence.
2. **Fit the Works subdomain scheme.** BioKEA products each live at their
   own subdomain; the games are a distinct product surface and get one too.
3. **Keep the marketing site lean.** Game pages, scripts, data modules,
   and their tests leave this repo.

## 2. What exists today

- `scripts/build-games.mjs` runs as a prebuild step of `npm run build`.
  It reads slug/repo pairs from `src/data/games.ts`, clones each
  `BioKEA/game-<slug>` repo, runs `vite build --base /mission/games/<slug>/`,
  copies `dist/` into `public/mission/games/<slug>/` (git-ignored), and
  injects three things into each `index.html`: a root-relative
  "← All Games" back button, a root-relative "Lab updates →" pill linking
  to `/subscribe?source=<slug>`, and the shared GA snippet
  (`G-WYL7J2D7SG`).
- `src/pages/mission/games.astro` — index: hero, `HandlePicker`, daily
  leaderboard card, six tiles, and an embedded `SubscribeForm` that POSTs
  to `/api/subscribe`.
- `src/pages/mission/games/leaderboard.astro` — Today / Week / All-time
  tabs; reads Supabase REST directly with the publishable key.
- `src/components/games/HandlePicker.astro` — writes
  `biokea:player:handle` (+ `biokea:player:handle-confirmed`) to
  `localStorage`. The games read the same key at mount, which only works
  because they share the biokea.ai origin.
- `src/pages/api/handle-check.ts` — server endpoint using
  `SUPABASE_SERVICE_ROLE_KEY` to give the picker instant "handle not
  allowed" feedback (mirrors the DB trigger).
- `src/data/games.ts`, `src/data/leaderboard-games.ts` — game metadata.
- No game calls any biokea.ai API. Leaderboard reads/writes go straight
  to Supabase from the browser. (The hunt endpoints that would have
  needed CORS were deleted in Slice A.)

## 3. `BioKEA/games-site` — the new project

### 3.1 Stack

A slimmed copy of this repo's scaffold so conventions carry over: Astro v6
(`output: 'server'`), `@astrojs/cloudflare` with `platformProxy`, Tailwind
v4 via `@tailwindcss/vite`, `src/styles/tokens.css` and the Inter /
JetBrains Mono setup copied verbatim, Prettier + lint-staged, Vitest,
Playwright. `site: 'https://games.biokea.ai'`. Public repository, matching
the `BioKEA/game-*` repos. No MDX, no sitemap integration, no Turnstile.

### 3.2 Routes

| Route               | Source                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/`                 | Ported `games.astro`: hero, `HandlePicker`, daily card, six tiles. `SubscribeForm` replaced by a link-out (§3.4). |
| `/leaderboard`      | Ported `leaderboard.astro`, unchanged apart from `playUrl`s and the "← All games" link → `/`.                     |
| `/api/handle-check` | Ported `handle-check.ts`, unchanged. Needs the `SUPABASE_SERVICE_ROLE_KEY` Worker secret.                         |
| `/<slug>/`          | Built game bundles, static assets under `public/<slug>/` (git-ignored).                                           |
| `/404`              | Minimal page linking back to `/`.                                                                                 |

No redirects from the old `/mission/games/...` paths — the games have not
been live long enough for inbound links to matter, and biokea.ai will
simply stop serving those routes (§4).

### 3.3 Layout and nav

One `BaseLayout` with `<head>` metadata, the GA snippet for
`G-WYL7J2D7SG` (same property as biokea.ai, so games traffic stays under
one report), skip link, and a small dark nav:

```
[BioKEA logo → https://biokea.ai]      Games   Leaderboard   [ Lab updates → ]
```

"Games" → `/`, "Leaderboard" → `/leaderboard`, "Lab updates →" →
`https://biokea.ai/subscribe?source=games`. Footer: © line, "Privacy" →
`https://biokea.ai/privacy`, "biokea.ai →". Cream/ink/teal/pink/ochre
tokens, same type stack.

### 3.4 Subscribe

The index's embedded `SubscribeForm` is not ported. It POSTs to
`/api/subscribe`, which is Turnstile-protected; running it cross-origin
would need CORS on biokea.ai's endpoint plus a second Turnstile site key.
Instead the index's newsletter block becomes a short blurb with a button
to `https://biokea.ai/subscribe?source=games`. The per-game injected pill
already links to `/subscribe`; it becomes an absolute link (§3.5).

### 3.5 Build script

`scripts/build-games.mjs` moves to the new repo with these changes:

- `vite build --base /<slug>/`; output `public/<slug>/`.
- Injected back button `href="/"`.
- Injected subscribe pill `href="https://biokea.ai/subscribe?source=<slug>"`.
- Comment header rewritten; behaviour otherwise identical (token from
  `GITHUB_TOKEN` or `gh auth token`, build-local gitconfig, per-game
  non-fatal failures, always exit 0, `LEADERBOARD_ENABLED` set,
  stub/live Supabase env).

`src/data/games.ts` moves with `playUrl: '/<slug>/'` and `thumb` paths
under `/assets/games/` (thumbnails move too). `src/data/leaderboard-games.ts`
moves with `playUrl`s updated. The regex `readGames()` coupling between the
script and `games.ts` stays.

### 3.6 Deploy

`.github/workflows/deploy.yml` mirrors this repo's: on push to `main` and
`workflow_dispatch`, `test` job (lint, check, unit, e2e) then `deploy` job
(`npm ci`, `npm run build` with `GITHUB_TOKEN`, `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, then `cloudflare/wrangler-action@v3 deploy`).

- `wrangler.toml`: `name = "biokea-games"`, `[vars]` `SUPABASE_URL` and
  `SUPABASE_PUBLISHABLE_KEY` (public), comment documenting the one Worker
  secret `SUPABASE_SERVICE_ROLE_KEY`.
- Repo secrets to set: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` — same values as
  `website-biokea`.
- Manual Cloudflare step, documented in the new repo's README: add the
  custom domain `games.biokea.ai` to the `biokea-games` Worker (Workers →
  Settings → Domains & Routes). Cloudflare manages the DNS record.

### 3.7 Handle picker

Works unchanged. The picker, the leaderboard page, and every game bundle
now share the `games.biokea.ai` origin, so the `biokea:player:handle`
`localStorage` key is visible to all of them. Handles set on biokea.ai
before the move are not carried over; players pick again once.

## 4. `website-biokea` — after the move

### 4.1 Deleted

- `src/pages/mission/games.astro`
- `src/pages/mission/games/leaderboard.astro`
- `src/components/games/HandlePicker.astro` (and the now-empty
  `src/components/games/`)
- `src/pages/api/handle-check.ts`
- `src/data/games.ts`, `src/data/leaderboard-games.ts`
- `scripts/build-games.mjs`
- `public/assets/games/*-thumb.png` (moved to games-site)
- `tests/e2e/mission-games.spec.ts`
- The `/public/mission/games/` entries in `.gitignore` and `.dockerignore`

### 4.2 Rewritten

| File                                       | Change                                                                                                                                                                        |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                             | `"build": "astro build"` — no games prebuild.                                                                                                                                 |
| `.github/workflows/deploy.yml`             | Drop `GITHUB_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` from the build step env and the comments describing them.                                                     |
| `src/components/layout/Nav.astro`          | About ▾ "Games" → `https://games.biokea.ai` (external; keep it in the About group).                                                                                           |
| `src/pages/subscribe.astro`                | The `/mission/games/` link in the body copy → `https://games.biokea.ai/`.                                                                                                     |
| `src/pages/api/subscribe.ts`               | Header + inline comments; welcome email's "new game drops on biokea.ai/mission/games/" (text and HTML) → `games.biokea.ai`. `source` values keep working (`games`, per-slug). |
| `src/components/forms/SubscribeForm.astro` | Comment referencing `/mission/games/` updated.                                                                                                                                |
| `src/pages/privacy.astro`                  | Subscription clause's `/mission/games/` link → `https://games.biokea.ai/`; game-scores clause notes scores are submitted from games at games.biokea.ai. Bump `lastUpdated`.   |
| `CLAUDE.md`, `README.md`                   | Repo-basics bullet: games are built and served by `BioKEA/games-site` at games.biokea.ai; drop the build-games note.                                                          |
| `wrangler.toml`                            | Comment on `SUPABASE_PUBLISHABLE_KEY` no longer cites the `/mission/games/` leaderboard panel.                                                                                |

### 4.3 Kept

- Supabase `scores`, `ranked_modes`, handle-pattern tables and their
  migrations — the games still use them.
- `SUPABASE_SERVICE_ROLE_KEY` Worker secret on `biokeawebsite` — still
  required by `/api/quote` and `/quote/<token>`.
- Privacy disclosures about game scores — the data is still collected,
  just from another origin BioKEA controls.

## 5. Rollout order

1. Create `BioKEA/games-site`, land the port, set repo secrets and the
   Worker secret, deploy, add the `games.biokea.ai` custom domain.
2. Verify `https://games.biokea.ai/`, `/leaderboard`, and each `/<slug>/`
   return 200 and a game loads with the back button and subscribe pill
   pointing at the right places.
3. Only then merge the `website-biokea` removal (§4). Games are never
   unreachable during the switch.

## 6. Testing

**games-site**

- `tests/e2e/index.spec.ts`: six tiles render; each play link resolves to
  `/<slug>/`; the newsletter button points at
  `https://biokea.ai/subscribe?source=games`.
- `tests/e2e/handle.spec.ts`: with `/api/handle-check` mocked to allow,
  picking a handle writes `biokea:player:handle` and the "Playing as"
  state survives a reload.
- `tests/e2e/leaderboard.spec.ts`: three tabs (Today / Week / All-time),
  no Hunt tab; `#week` deep link selects the Week tab.
- `tests/e2e/api.spec.ts`: `/api/handle-check` accepts a clean handle and
  rejects a blocked one (mocked or against the live table, as the ported
  test does today).
- Post-build check in CI: after `npm run build`, every `/<slug>/index.html`
  exists and contains `id="biokea-back"` with `href="/"` and the absolute
  subscribe pill. This guards the injection rewrites.

**website-biokea**

- `nav.spec.ts`: About ▾ "Games" href is `https://games.biokea.ai`.
- New assertion: `/mission/games` and `/mission/games/leaderboard` return
  404 and `/api/handle-check` returns 404.
- Everything else unchanged.

## 7. Out of scope

- Redirects from `/mission/games/*` (explicitly declined).
- Any change to the six `BioKEA/game-*` repos. Their leftover Golden
  Sample hook code stays inert; cleaning it up is optional later work.
- Redesign of the games index — this is a port. A games-homepage redesign
  can follow once the site exists.
- A CORS-enabled `/api/subscribe` on biokea.ai (link-out chosen instead).
