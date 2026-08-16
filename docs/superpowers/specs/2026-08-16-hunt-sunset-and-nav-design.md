# Golden Sample sunset + nav simplification — design

**Date:** 2026-08-16
**Slice:** A of two. Slice B (moving games to `games.biokea.ai`) follows and
has its own spec.

## 1. Goal

Retire the Golden Sample 26 hunt, which closed 2026-07-07, and restructure
the top navigation so the commercial path — Services, Pricing, and the new
`/quote` configurator — is the most prominent thing on the site.

## 2. Why this slice comes first

Slice B moves the six games to `games.biokea.ai`. The hunt's API endpoints
(`/api/golden-sample/*`) are same-origin with the games today. Moving the
games while the hunt is live would require adding CORS to all five
endpoints, then deleting them weeks later. Ending the hunt first removes
that work entirely rather than solving it.

It also shrinks what has to move: the hunt page, the overlay script, and
the leaderboard's hunt tab all disappear before the migration rather than
being ported to a new origin.

## 3. Golden Sample teardown

### 3.1 Deleted outright

- `src/pages/mission/games/golden-sample-26.astro` (814 lines)
- `src/pages/golden-sample-26.astro` (legacy 308 redirect)
- `src/pages/api/golden-sample/` — all five endpoints (`claim/[game].ts`,
  `leaderboard.ts`, `milestone.ts`, `redeem.ts`, `state.ts`)
- `src/lib/golden-sample/` — all three files (`config.ts`, `hmac.ts`,
  `validate.ts`)
- `public/golden-sample/overlay.js`, and the `injectGoldenSampleOverlay()`
  function plus its call site in `scripts/build-games.mjs`
- `tests/e2e/golden-sample-26.spec.ts`
- The gold-accented standalone nav link and the entire `standaloneLinks`
  mechanism in `Nav.astro` (nothing else uses it)
- `--color-gold` / `--color-gold-soft` in `tokens.css`, whose comment
  already scopes them to "Golden Sample Hunt only (May–Jun 2026)"
- `src/components/ui/GamePlaceholder.astro` — dead code. Verified imported
  nowhere; it exists only to tease a hunt card on project tiles.

**Deleting the endpoints is safe for game bundles already deployed.** They
fetch the overlay and call the claim API only on a milestone event. Both
will 404 silently, which is the documented existing failure mode:
`wrangler.toml` notes that without the hunt secrets "the games' fetch will
fail silently and no animation fires."

### 3.2 Rewritten

| File                                        | Change                                                                                                                                                                               |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/mission/games.astro`             | Remove the hunt CTA button and the "1 GOLDEN SAMPLE HIDDEN IN EACH" badge; past-tense the intro paragraph; drop the hunt from the newsletter blurb                                   |
| `src/pages/mission/games/leaderboard.astro` | Remove the "Hunt 🎟" tab, its panel, and its `loadHunt()` fetch — the endpoint backing it is being deleted                                                                           |
| `src/pages/subscribe.astro`                 | Drop "the Golden Sample Hunt" from the description and body copy                                                                                                                     |
| `src/pages/api/subscribe.ts`                | Remove the hunt line from the welcome email's text and HTML bodies                                                                                                                   |
| `src/pages/llms-full.txt.ts`                | Remove the Golden Sample Hunt section                                                                                                                                                |
| `src/data/games.ts`                         | Header comment no longer describes the games as "featured in the Golden Sample Hunt"                                                                                                 |
| `src/env.d.ts`                              | The `SUPABASE_SERVICE_ROLE_KEY` comment references "the Golden Sample hunt endpoints"; reword to cite `/api/quote` and `/quote/<token>` only                                         |
| `CLAUDE.md`                                 | Replace the "I won't tell. That would be cheating." instruction with a note that the hunt closed 2026-07-07 — otherwise future sessions keep guarding a secret that no longer exists |

### 3.3 `privacy.astro` — past tense, not deleted

Six clauses in the privacy policy describe hunt data handling. **These must
not simply be removed.** BioKEA still holds the data they describe —
winners' emails and US mailing addresses collected for prize fulfilment.
A privacy policy that stops disclosing retained data is worse than one
describing a finished programme.

Rewrite each in past tense: the hunt ran May–July 2026, entries went to a
Google Form, and winner addresses were used to ship sequencing kits and
return results. Keep the Children clause's 18+/US-residents note in past
tense for the same reason.

### 3.4 Kept as record

- `migrations/0004_golden_sample_hunt.sql` and the Supabase tables —
  real redemptions and winners.
- `migrations/0002`'s comment mentioning `/golden-sample-26` as a
  subscriber source — historically accurate, describes rows that exist.
- `HUNT.md`, with a header noting the hunt closed on 2026-07-07 and that
  the live machinery was removed.
- `docs/superpowers/` specs and plans for the original hunt build.

### 3.5 Manual follow-up (not code)

After merge, retire the now-unused Worker secrets:

```bash
wrangler secret delete GOLDEN_WORDS
wrangler secret delete GOLDEN_HMAC_SECRET
```

`wrangler.toml`'s comment block documenting those secrets should be
updated in the same change to note they are no longer required.

## 4. Navigation restructure

### 4.1 New shape

```
Services   Pricing   Lab   About ▾            [ Build a quote ]
                                 Mission
                                 Projects
                                 Works
                                 Press
                                 Games
```

Three dropdowns plus a standalone link become three top-level links plus
one dropdown. Services and Pricing move to top level, where they get the
most attention; everything credibility-related consolidates under About.
The nav CTA changes from "Get in touch" (`/contact`) to **"Build a quote"**
(`/quote`) — a higher-intent action, and the destination the rest of this
work exists to serve.

`/contact` remains reachable from the footer, from every page's `CtaBand`,
and from `/quote`'s own secondary CTA, so removing it from the nav button
does not strand it.

### 4.2 Resolving the "quote" label collision

The live site currently uses near-identical labels for two different
destinations. `/pricing`'s hero has **"Request a quote"** (→
`/contact?topic=sequencing`) directly beside **"Build your quote →"** (→
`/quote`). `/services` has four buttons labelled "Request a quote", all
pointing at `/contact` — the configurator is not reachable from that page
at all.

Standardise on two distinct labels:

| Path                        | Label             | Meaning                                                    |
| --------------------------- | ----------------- | ---------------------------------------------------------- |
| `/quote`                    | **Build a quote** | Instant, self-serve, itemised                              |
| `/contact?topic=sequencing` | **Talk to us**    | Human conversation for anything the calculator can't price |

Applied consistently: the nav button, `/services` (primary becomes "Build a
quote" → `/quote`; one secondary "Talk to us"), `/pricing` (same), and
`/quote`'s own `CtaBand` (which already routes to contact — relabel to
"Talk to us").

This is the change that actually drives traffic into the configurator:
`/services` currently has no path to it whatsoever.

### 4.3 Left alone

`CtaBand` labels on `/lab`, `/mission`, `/pipeline`, and `/projects`
("Get in touch", "Start a conversation") are not quote actions and keep
their current wording. Only the sequencing-quote path is being
disambiguated.

## 5. Testing

- **Delete** `tests/e2e/golden-sample-26.spec.ts` (75 lines).
- **`tests/e2e/nav.spec.ts`** — rewrite: the test titled "nav renders logo,
  three dropdown groups, Golden Sample, and Get-in-touch CTA" and the
  mobile-menu test both assert the gold standalone link. Replace with
  assertions for three top-level links, one About dropdown, and a
  "Build a quote" CTA pointing at `/quote`.
- **`tests/e2e/mission-games.spec.ts`** — remove the test asserting the
  hero CTA links to `/mission/games/golden-sample-26`.
- **New assertions** on `/services` and `/pricing` that the primary CTA
  now resolves to `/quote`, guarding the conversion path this slice
  exists to create.
- **New assertion** that no route under `/api/golden-sample/` and no
  `/mission/games/golden-sample-26` page still responds, so a partial
  teardown can't pass silently.
- Existing `/quote`, `/pricing`, and `/services` suites must continue to
  pass unchanged apart from the CTA-label updates.

## 6. Out of scope

- Moving games to `games.biokea.ai` — Slice B, separate spec.
- Dropping the hunt tables or `HUNT.md` (§3.4).
- Changes to the six `BioKEA/game-*` repos. Their golden-sample hook code
  becomes inert once the endpoints and overlay are gone; cleaning it up is
  optional and belongs with Slice B, which already touches the game build.
- Any change to `CtaBand` wording outside the sequencing-quote path (§4.3).
