# Handoff — order configurator rollout (2026-10-29)

For the next session (new Claude account, same machine and checkout).
Delete this file once the "Remaining steps" are done.

## Where things stand

Deployed and verified live on 2026-10-29:

- biokea.ai/quote serves widget 1.3.0: service menu with nothing
  pre-selected; barcoding, eDNA metabarcoding, metagenome/metatranscriptome,
  targeted eDNA (qPCR); per-service options and directions; consult path.
- Pricing page links point at the store Order page
  (`https://store.biokea.ai/pages/order`, per-section `?service=`); services
  page and home strip link to `/quote?service=…`.
- store.biokea.ai: Order page live (`/pages/order`, template `page.order`),
  product pages show "Configure this service →", home hero reads
  "Configure a sequencing order". Header logo links to biokea.ai.
- Supabase project restored (it had been paused) and migration
  `migrations/0009_quote_config.sql` applied; the status check includes
  `consult`.
- `main` is pushed and level with `origin/main`. CI now pins both jobs to
  `ubuntu-24.04` (Playwright cannot install Chromium on the new
  `ubuntu-latest` 26.04 image).

Spec: `docs/superpowers/specs/2026-10-28-order-configurator-design.md`.
Plan: `docs/superpowers/plans/2026-10-28-order-configurator.md`.
Theme files and procedure: `docs/shopify/theme/README.md`.
Rollout steps: `docs/shopify/theme/ORDER-PAGE-ROLLOUT.md` (delete after).

## Remaining steps (Shopify admin)

Both need the Shopify Admin API. Routes: the claude.ai Shopify connector
(must be added and signed in on the new account — it kept dropping the
session on the old one), or the Shopify admin UI by hand. The Shopify CLI
cannot do these (theme files only).

### 1. Product descriptions (two products)

Replace ONLY the final sentence of each description.

| Product handle       | Old final sentence                                      | New final sentence                                             |
| -------------------- | ------------------------------------------------------- | -------------------------------------------------------------- |
| `specimen-barcoding` | Configure your count below for an instant quote.        | Configure your project on our Order page for an instant quote. |
| `edna-metabarcoding` | Configure your sample count below for an instant quote. | Configure your project on our Order page for an instant quote. |

Connector: `search_products` with `handle:specimen-barcoding OR
handle:edna-metabarcoding` to get the GIDs, read each `descriptionHtml`,
then `update-product` with the edited HTML (show before/after first).
Admin UI: Products → open each product → edit the description → Save.

### 2. Main menu: "Order" first

Add a menu item titled **Order** linking to `/pages/order` as the FIRST
item of the main menu.

Connector: read the menu first (`menus(first: 10)` → the one with handle
`main-menu`, with its `items { id title type url resourceId tags items {…} }`),
then `menuUpdate` resending EVERY existing item plus the new one at the
front — `menuUpdate` replaces the whole list. The query/mutation shapes are
in `ORDER-PAGE-ROLLOUT.md` §4.
Admin UI: Online Store → Navigation → Main menu → Add menu item → Name
"Order", Link `/pages/order` → drag to the top → Save.

### 3. Verify, then clean up

```bash
curl -sL https://store.biokea.ai/ | tr '\n' ' ' | grep -o 'href="/pages/order"[^>]*>[^<]*Order' | head -2
curl -sL https://store.biokea.ai/products/specimen-barcoding | grep -c 'Order page for an instant quote'
curl -sL https://store.biokea.ai/products/edna-metabarcoding | grep -c 'Order page for an instant quote'
```

Then `git rm docs/shopify/theme/ORDER-PAGE-ROLLOUT.md docs/HANDOFF-2026-10-29-order-configurator.md`
and commit.

## Follow-ups owed

- **Real-Supabase e2e run.** Create `.dev.vars` from `.dev.vars.example`
  with the Supabase keys, start `npm run dev`, run
  `npx playwright test tests/e2e/quote.spec.ts`. The consult and
  quote-page tests skip without it and have never executed end to end.
- **Money check.** Place one real eDNA order through the store Order page
  and run `docs/shopify/PAY-IN-FULL-VERIFICATION.md` §6. The pay path is
  unchanged in policy; the draft order now carries the configuration and
  directions in its note.
- **Supabase pausing.** While the project was paused, quotes, subscribes
  and the Shopify `orders/paid` webhook all failed in production. Decide:
  Pro plan, or a weekly keep-alive read from the Worker (small cron
  trigger in `wrangler.toml`).
- **Spec 3**: admin finalisation of consult quotes into payable ones
  (`status 'consult'` → priced lines → `quoted`), the next piece of this
  programme.
- Deferred minors from the reviews are listed in the merge commits'
  history and in `docs/superpowers/specs/2026-10-28-order-configurator-design.md`
  "Calls I made"; none block anything.

## Environment notes for the new session

- Dev server: `npm run dev` (builds the widget, then Astro on :4321). The
  Playwright suite reuses it. If Vite's SSR cache goes stale:
  `kill $(lsof -ti:4321); rm -rf node_modules/.vite`.
- Git push over SSH fails from Claude's shell; use
  `git -c credential.helper='!gh auth git-credential' push https://github.com/BioKEA/website-biokea.git main`
  (`gh` is logged in as jungbluth).
- Shopify CLI 5 is installed and logged in (store `a9zmvz-xs.myshopify.com`,
  theme Horizon #145016914154); unaffected by the Claude account switch.
- Claude Code plugins (superpowers, shopify-ai-toolkit) are installed at
  user scope on this machine and persist. The claude.ai connectors
  (Shopify, etc.) are per account and must be re-added.
- Claude's memory for this project lives at
  `~/.claude/projects/-Users-biokea-08-Documents-BioKEA-website-biokea/memory/`
  (see `order-configurator-rollout.md`, `shopify-theme-tooling.md`,
  `payments-shopify-state.md`).
