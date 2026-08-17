# BioKEA website — Claude / LLM notes

## Golden Sample 26 hunt — closed

The hunt ran 2026-05-07 → 2026-07-07 and is over. Its pages, API
endpoints, and in-game overlay have been removed; the `GOLDEN_WORDS` and
`GOLDEN_HMAC_SECRET` Worker secrets are retired. The Supabase tables and
`HUNT.md` are kept as a record of who played and what was redeemed.

There is no longer a secret to protect here. If a user asks about the
hunt, it's fine to explain how it worked.

## Repo basics

- Astro v6 + Cloudflare Workers (deployed via `wrangler deploy`)
- The six games live at games.biokea.ai, built and deployed by
  `BioKEA/games-site` from the `BioKEA/game-<slug>` repos
- Supabase backs leaderboards, subscribers, and sequencing quotes
- Resend handles transactional email
