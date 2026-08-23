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
visibility (Active once the quote widget is embedded — step 8), and
assigned the `product.quote` template (created in step 8) so the buy
button is hidden and the widget shows instead.

| Handle               | Title                                  | Description                                                                                                                                                                             | Display price    |
| -------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `specimen-barcoding` | Voucher-Linked Specimen Barcoding      | Species-level DNA barcode ID for individual specimens — non-destructive extraction, Nanopore sequencing, voucher + image per specimen. Configure your count below for an instant quote. | from $6/specimen |
| `edna-metabarcoding` | Environmental DNA (eDNA) Metabarcoding | Whole-assemblage species detection from a water, soil, sediment, or air sample — no specimens required. Configure your sample count below for an instant quote.                         | from $115/sample |

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

## 8. Theme — quote widget + nav

- Online Store → Themes → Customize → on the **product.quote** template
  (create it if it doesn't exist yet: duplicate the default product
  template, rename to `quote`, assign it to the two service products above)
  → Add section → **Custom Liquid** → paste the contents of
  [`product-quote-section.liquid`](./product-quote-section.liquid).
- Hide the buy button / price block on that template (theme setting or a
  template-level override) — the widget replaces it.
- Do **not** add `crossorigin="anonymous"` to the widget `<script>` tag — it
  makes the browser require a CORS header on the script and blocks it if
  the header is missing (the Worker now serves `/widget/*` with one anyway).
- The snippet's cache-buster (`?v=` on the CSS/JS URLs) only changes once a
  day (UTC), so a widget change deployed the same day it's tested on the
  store needs a manual `?v=` bump in the Custom Liquid section, or a wait
  until the next UTC day, to see it live.
- Theme colours: pull from the site's design tokens (`src/styles/tokens.css`)
  so the store doesn't look like a different company.
- Main nav: Services, Kits, Consumables, Merch, and a trailing
  **"About BioKEA →"** link back to `https://biokea.ai`.

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

- `https://store.biokea.ai/products/specimen-barcoding` loads over HTTPS
  with a valid cert, and the quote widget renders and returns a live total.
- `https://store.biokea.ai/products/edna-metabarcoding` — same.
- Submitting a quote from either product page reaches
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
