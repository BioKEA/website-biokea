# store.biokea.ai — Shopify store setup

One-time, human checklist for standing up the Shopify side of the payment
rail described in `docs/superpowers/specs/2026-08-17-shopify-store-design.md`
§5. Do these in order — later steps assume earlier ones are done. The Worker
side (secrets, vars, deploy) is covered in the README's Payments section;
this doc is everything that happens in the Shopify admin.

## 1. Create the store

- shopify.com → Start a free trial → **Basic** plan.
- Settings → General: store name "BioKEA", currency **USD**.
- Settings → Payments: enable **Shopify Payments**.

## 2. Domain — `store.biokea.ai`

- Shopify admin → Settings → Domains → **Connect existing domain** → enter
  `store.biokea.ai`.
- In Cloudflare DNS (biokea.ai zone): add a `store` **CNAME** record pointing
  at `shops.myshopify.com`, proxy status **DNS only** (grey cloud, not
  orange) — Shopify needs to see the real CNAME to issue its own TLS
  certificate; a proxied record breaks domain verification.
- Back in Shopify, once verification passes, set `store.biokea.ai` as the
  **primary domain**.

## 3. App credentials — Admin API access

Shopify now creates apps in the **Dev Dashboard** (dev.shopify.com), which
exposes a Client ID + Client secret rather than a permanent Admin API token.
Our Worker supports both:

**Dev Dashboard app (current Shopify UI — preferred):**

- dev.shopify.com → Apps → Create app → name `biokea-website`.
- Configure Admin API access scopes on the app version:
  `write_draft_orders`, `read_draft_orders`, `read_orders`, `read_products`
  → release the version.
- Distribution → **Custom distribution** → your store → generate the
  install link → open it → **Install**. (The store admin then lists the app
  under Settings → Apps and sales channels.)
- App → **Settings** → copy **Client ID** and **Client secret** (`shpss_…`).
- On the Worker: `wrangler secret put SHOPIFY_CLIENT_ID` and
  `wrangler secret put SHOPIFY_CLIENT_SECRET`. The Worker mints 24-hour
  Admin API tokens itself (client-credentials grant) and refreshes them.
- Do **not** use the `atkn_…` "app automation" token (that is for the
  Shopify CLI) or the API secret as an Admin token.

**Legacy custom app (older stores that still offer it):**

- Store admin → Settings → Apps and sales channels → Develop apps → Create
  an app → Configuration → Admin API scopes as above → Install → API
  credentials → **Admin API access token** (`shpat_…`) →
  `wrangler secret put SHOPIFY_ADMIN_TOKEN`.

### Store domain for the Worker

`SHOPIFY_STORE_DOMAIN` in `wrangler.toml` must be the store's **real**
`*.myshopify.com` domain (Settings → Domains shows it, e.g.
`a9zmvz-xs.myshopify.com`) — not the admin handle. Webhooks are stamped with
that domain in `x-shopify-shop-domain` and the Worker rejects mismatches.
`SHOPIFY_STORE_HANDLE` is the admin URL handle (`admin.shopify.com/store/<handle>`).

## 4. Webhooks

Settings → Notifications → scroll to **Webhooks** → create four, all
format **JSON**, latest API version, all pointed at:

```
https://biokea.ai/api/shopify/webhook
```

Topics:

- `orders/paid`
- `draft_orders/delete`
- `orders/cancelled`
- `refunds/create`

The **Webhook signing key** shown at the top of that page is shared by all
webhooks on the store — copy it once. On the Worker:
`wrangler secret put SHOPIFY_WEBHOOK_SECRET`.

## 5. Payment terms

Settings → Payments → confirm draft orders can offer payment terms, and
that a **Net 30** template exists (Shopify ships this as a default
template; if the store doesn't have one, create it). This is what lets
institutional / PO buyers get an emailed invoice with 30-day terms instead
of due-on-receipt. If no Net 30 template is found at invoice time, the
gateway falls back to due-on-receipt rather than failing — see spec §10 —
so this step is a nice-to-have, not a blocker.

## 6. Taxes

Settings → Taxes and duties → enable **US** tax collection at the
company's nexus state(s). The two service products (below) ship with
"Charge tax on this product" turned **off** — sequencing services are
non-taxable; the gateway also sends `taxable: false` / `taxExempt: true`
on every service draft order as a second guard. Placeholder goods are
ordinary taxable products.

## 7. Products

### Service products (quote-configured, not add-to-cart)

Create as two products, each: no variants, **Draft** or **Active**
visibility (Active once the Order page is live — step 8), and
assigned the `product.quote` template (step 8) so the buy button is hidden
and a **Configure this service →** button to the Order page shows instead.

| Handle               | Title                                  | Description                                                                                                                                                                                           | Display price    |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `specimen-barcoding` | Voucher-Linked Specimen Barcoding      | Species-level DNA barcode ID for individual specimens — non-destructive extraction, Nanopore sequencing, voucher + image per specimen. Configure your project on our Order page for an instant quote. | from $6/specimen |
| `edna-metabarcoding` | Environmental DNA (eDNA) Metabarcoding | Whole-assemblage species detection from a water, soil, sediment, or air sample — no specimens required. Configure your project on our Order page for an instant quote.                                | from $115/sample |

The "from" price is the lowest per-unit academic rate at the top volume
tier (`src/data/pricing.ts`) — shown as a **display price** only; Shopify
never computes the real total, the widget does (spec §2, "Pricing
authority").

### Placeholder goods (draft-visibility, "Coming soon")

Ordinary Shopify products — variants, images, add-to-cart as normal.
Placeholder prices below are stand-ins; swap for real ones before setting
any of these **Active**. Keep all eight **Draft** visibility with a
"Coming soon" tag/badge until there's real inventory and pricing.

Sampling kits:

- Freshwater eDNA Sampling Kit — $85
- Marine eDNA Sampling Kit — $95
- Soil eDNA Sampling Kit — $75

Consumables:

- DNA Preservation Buffer, 100 mL — $25
- Sterile Filter Packs ×10 — $40

Merch:

- BioKEA Field Tee — $28
- BioKEA Cap — $22
- Sticker Pack — $8

## 8. Theme: Order page, entry points, nav

The theme is Horizon. The files we changed by hand are copied, with what in
each is ours, under [`theme/`](./theme/README.md). Its README has the pull →
check → push procedure. Push from a fresh pull, never from the repo copies.

- **Order page.** Online Store → Pages → a page titled **Order**, handle
  `order`, content empty, theme template **`order`**
  (`templates/page.order.json`). That template's only content block is a
  Custom Liquid block that mounts the quote widget from
  `https://biokea.ai/widget/quote.css` / `quote.js` with a `?v=<widget
version>` cache-buster (the Worker ignores `?v=`). Bump it in
  `page.order.json` when the widget version changes. The widget reads
  `?service=barcoding|metabarcoding` from the page URL itself.
- **Service products.** The `product.quote` template (assigned to the two
  service products in step 7, buy buttons disabled) no longer embeds the
  widget. The editor's description block shows the product description,
  and our Custom Liquid block adds a **Configure this service →** button to `/pages/order?service=barcoding`
  (or `metabarcoding` for `edna-metabarcoding`).
- **Main menu.** Online Store → Navigation → Main menu: **Order** →
  `/pages/order` as the **first** item, then Services, Kits, Consumables,
  Merch, and a trailing **"About BioKEA →"** link back to
  `https://biokea.ai`.
- **Home hero.** The hero button (`button_H9gpTf` in
  `templates/index.json`) reads **Configure a sequencing order** and links
  to `/pages/order`. The theme editor rewrites `index.json`, so redo this
  edit on a fresh pull if the hero is ever pushed from the CLI.
- **Header logo.** It links to `https://biokea.ai/` (the `logo_link`
  setting we added to `blocks/_header-logo.liquid`, set in
  `sections/header-group.json`).
- Do **not** add `crossorigin="anonymous"` to the widget `<script>` tag. It
  makes the browser require a CORS header on the script and blocks the
  script if the header is missing (the Worker serves `/widget/*` with one
  anyway).
- Theme colours: pull from the site's design tokens (`src/styles/tokens.css`)
  so the store doesn't look like a different company.

## 9. Turnstile

The quote widget's Turnstile challenge is keyed to a site key whose
allowed hostnames must include the store domain. Cloudflare dashboard →
Turnstile → the widget used by `/api/quote` and `/api/subscribe` → Settings
→ **Domains** → add `store.biokea.ai` (in addition to `biokea.ai`).
Without this step the widget on the store renders a broken/erroring
challenge and quote submissions from `store.biokea.ai` fail Turnstile
verification.

## Housekeeping

If our Worker fails between creating a draft and sending its invoice, an
OPEN draft tagged `pay:<id>` may remain in Shopify without a matching
payment row; it is safe to delete.

## Verify

- `https://store.biokea.ai/pages/order` loads over HTTPS with a valid
  cert, and the quote widget renders and returns a live total.
- `https://store.biokea.ai/products/specimen-barcoding` and
  `/products/edna-metabarcoding` show the **Configure this service →**
  button, and it opens the Order page with that service preselected.
- Submitting a quote from the Order page reaches
  `POST https://biokea.ai/api/quote` (browser devtools → Network) and gets
  a 200 with a token.
- Paying in full lands on Shopify checkout (Bogus Gateway in test mode);
  a completed test payment fires `orders/paid` and the quote page shows
  "Payment received".
- Complete a **net-30** draft (the PO buyer path) and confirm no
  `draft_orders/delete` webhook arrives for it (`webhook_events` shows only
  `orders/*` topics for that draft) and the quote does NOT drop back to
  `quoted`.
- Confirm the customer invoice URL forces payment (due on receipt, no net
  terms) when no PO number was given.
- Confirm a service draft's `totalPriceSet` equals our cents exactly (no
  tax) — the Worker logs `[payments] Shopify total mismatch` otherwise.

## Optional: GA4 on the store

The quote widget fires GA4 funnel events (`quote_widget_engaged`,
`quote_created`, `begin_checkout`) through whatever `gtag` the host page
provides — it never injects one. biokea.ai already loads `G-WYL7J2D7SG`;
to get the same funnel from store.biokea.ai, add that tag to the theme
(Online Store → Preferences → Google Analytics, or a `theme.liquid`
snippet). Without it the widget's events are a silent no-op there.
