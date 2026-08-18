# Shopify store at store.biokea.ai — design

**Date:** 2026-08-17
**Supersedes the payment rail in:** `2026-08-16-stripe-payments-design.md`.
That design's quote-is-the-payable-object model, deposit-now/balance-on-
delivery terms, state machine, admin balance flow, and notification emails
all stand. What changes: the till is Shopify, not Stripe; the storefront is
`store.biokea.ai`; and the configurator becomes a shared widget that lives on
both sites.

## 1. Goal

One place to browse, configure, and buy: `store.biokea.ai` is a Shopify
store listing BioKEA's two priced sequencing services alongside sampling
kits, consumables, and merch. A services customer configures specimen counts
on the product page with the live rate card, pays a **50% deposit** through
Shopify checkout (card, Shop Pay, PayPal; or an emailed invoice with net
terms for institutional buyers), and later pays a **balance invoice** on
actual counts. Goods sell as normal Shopify products. Pricing rules stay in
exactly one place — our engine — and stay authoritative on our Worker.

## 2. Decisions (2026-08-17)

| Decision                      | Choice                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Storefront                    | Shopify (Basic plan), primary domain `store.biokea.ai`.                                                                                                                  |
| What's sold                   | Services first (barcoding, eDNA metabarcoding); placeholder goods: 3 sampling kits, 2 consumables, 3 merch.                                                              |
| Where services are configured | On the store's service product pages **and** on `biokea.ai/quote`, both hosting the same **quote widget** bundle served from biokea.ai.                                  |
| Pricing authority             | Our engine (`src/lib/pricing`) — client-side in the widget for live totals, server-side in `/api/quote` for the firm quote. Shopify never computes a service price.      |
| Payment object                | Shopify **Draft Order** with custom line items at our prices; customer pays via the draft's `invoiceUrl` (Shopify checkout) or the emailed invoice.                      |
| Terms                         | 50% deposit now, balance on actual counts (unchanged). Deposit due on receipt; both drafts offer Shopify payment terms (net 30) for PO buyers.                           |
| Balance credit                | The balance draft's deposit credit is a fixed-amount `appliedDiscount` titled "Deposit received (…)", since Shopify custom lines can't be negative.                      |
| Admin auth                    | Cloudflare Access gate (unchanged, live).                                                                                                                                |
| Stripe code                   | Replaced: `stripe` dependency removed; `gateway.ts` becomes the Shopify implementation; the webhook parses Shopify topics. Everything else on the merged branch is kept. |
| Data model                    | Migration `0007` renames the Stripe-specific names to provider-neutral ones (nothing is in production yet, so renames are free).                                         |
| Tax                           | Shopify Tax. Service products/lines are non-taxable (`taxable: false`); goods taxable. Closes the tax open item from the Stripe spec.                                    |

## 3. Customer journeys

**Services (store):** `store.biokea.ai/products/specimen-barcoding` → the
product page's Custom Liquid section mounts the quote widget → live pricing
→ "Get my quote" (name/email/org, Turnstile) → `POST biokea.ai/api/quote`
(CORS) → widget shows the quote number, link, and **Pay 50% deposit** →
plain form `POST biokea.ai/api/quote/<token>/deposit` (cross-origin form,
origin allow-listed) → 303 → Shopify checkout for the draft order → paid →
Shopify order confirmation + our "Deposit received" email + quote page shows
_Deposit received_.

**Services (biokea.ai):** identical, `biokea.ai/quote` mounts the same widget.
Existing links and the retrievable `/quote/<token>` page keep working.

**Institutional buyer:** same, but pays later from the emailed Shopify
invoice; net-30 payment terms on the draft; PO number in the order attributes
and on the invoice.

**Balance:** unchanged admin flow (`/admin/quotes/<n>`, preview → confirm) →
second draft order at actual counts with the deposit credited → invoice
emailed → paid → _Paid in full_.

**Goods:** ordinary Shopify cart/checkout; no code on our side.

## 4. Architecture

### 4.1 Quote widget — `src/widget/quote-widget.ts` → `public/widget/quote.js`

- The configurator markup + behaviour currently inside `src/pages/quote/index.astro` moves into a framework-free TypeScript module that renders into a mount element: `mountQuoteWidget(el, { apiBase, turnstileSiteKey, source })`. It imports `buildQuote`, `nextTierUpsell`, `pricedServices` directly — one engine, one data file.
- Built by a dedicated Vite library build (`vite.widget.config.ts`, `npm run widget:build`, part of `npm run build` via `prebuild`) to `public/widget/quote.js` (IIFE, self-contained, no globals but `BioKEAQuote`) plus `public/widget/quote.css`. Served by the Worker's static assets with long cache + a content hash in a manifest the pages read (`public/widget/manifest.json`), so a rebuild is picked up without CDN purges.
- `biokea.ai/quote` becomes a thin page: hero copy + `<div id="quote-widget">` + the script tag. Same on the Shopify product template (Custom Liquid): `<div id="quote-widget" data-source="store"></div><script src="https://biokea.ai/widget/quote.js" defer></script>`.
- The widget calls `${apiBase}/api/quote` with JSON (as today) and renders the deposit form posting to `${apiBase}/api/quote/<token>/deposit`. `apiBase` defaults to `https://biokea.ai`.
- Turnstile: the site key's allowed hostnames must include `store.biokea.ai` (dashboard change, §7).

### 4.2 CORS + origin allow-list

- `/api/quote` gains CORS for `https://store.biokea.ai` (and `https://biokea.ai`): `OPTIONS` preflight (204, `Access-Control-Allow-Origin` echo of an allow-listed origin, `-Methods: POST`, `-Headers: content-type`), and the same header on the `POST` response. Implemented once in `src/lib/cors.ts`.
- `src/lib/origin-check.ts` `ALLOWED_ORIGINS` gains `https://store.biokea.ai` so the widget's cross-origin deposit form post passes the CSRF check.

### 4.3 Gateway — `src/lib/payments/gateway.ts` (Shopify implementation)

`PaymentsGateway.createInvoice(spec)` keeps its shape with two changes:
`lines[].amountCents` must be ≥ 0, and `spec.credit?: { title: string; amountCents: number }` carries the deposit credit. Implementation via the **GraphQL Admin API** (`2026-01`, `X-Shopify-Access-Token`), no SDK:

1. `draftOrderCreate` with `email`, `note` (footer text), `tags: ['biokea', kind]`, `taxExempt: true` for service drafts, `customAttributes: [{quote_id},{quote_number},{kind},{payment_id},{po_number?}]`, `lineItems: [{ title, quantity: 1, originalUnitPrice: dollars, taxable: false, requiresShipping: false }]`, `appliedDiscount` = credit when present, `paymentTerms: { paymentTermsTemplateId }` for the net-30 template (looked up once at boot via `paymentTermsTemplates`; if lookup fails, omit → due on receipt).
2. `draftOrderInvoiceSend` → returns `invoiceUrl`, `name` (`#D12`), `id`.
3. Return `{ externalId: draftOrderGid, number: name, hostedUrl: invoiceUrl, pdfUrl: null, dueAt, amountDueCents, customerId: null }`.

Shopify amounts are decimal dollars; the gateway converts from cents at the boundary and asserts the round trip. `MemoryGateway` unchanged in spirit (records specs, deterministic ids `gid://shopify/DraftOrder/test-N`).

### 4.4 Webhook — `POST /api/shopify/webhook`

- Auth: `X-Shopify-Hmac-Sha256` = base64 HMAC-SHA256(raw body, `SHOPIFY_WEBHOOK_SECRET`), constant-time compare via WebCrypto; 401 on mismatch. Idempotency: `X-Shopify-Webhook-Id` into `webhook_events`.
- Topics (created in Shopify Admin → Settings → Notifications → Webhooks): `orders/paid`, `draft_orders/delete`, `orders/cancelled`, `refunds/create`.
- Mapping to the existing state machine (`RANK`, step-back rules unchanged):
  - `orders/paid` → the order's `note_attributes` carry `payment_id`/`quote_id`/`kind` (copied from the draft's custom attributes). Find the payment by `payment_id` (fallback: `external_id` = order's `draft_order_id` GID) → payment `paid` (+ `order_ref` = order name, `hosted_url` = order status URL if present) → quote to target → emails.
  - `draft_orders/delete` → payment `void` (if `open`) → step back per rules.
  - `orders/cancelled` (unpaid order created from a draft with terms) → same as delete.
  - `refunds/create` → log + lab email "refund recorded on <order>"; no state change (staff act in Shopify).
- Everything else identical to the Stripe webhook: try/catch → un-record + 500; unknown payment → 200.

### 4.5 Data model — `migrations/0007_shopify.sql`

```sql
alter table public.quote_payments rename column stripe_invoice_id to external_id;   -- draft order GID
alter table public.quote_payments rename column hosted_invoice_url to hosted_url;
alter table public.quote_payments rename column invoice_pdf to pdf_url;
alter table public.quote_payments add column provider text not null default 'shopify'
  check (provider in ('shopify')),
  add column order_ref text;                                                       -- Shopify order name (#1042) once paid
alter table public.quotes rename column stripe_customer_id to external_customer_id;
alter table public.stripe_events rename to webhook_events;
alter table public.webhook_events add column provider text not null default 'shopify';
```

`types.ts`, `db.ts`, `panel.ts`, pages and tests follow the renames. `settled` rows unchanged.

### 4.6 Endpoints touched

- `deposit.ts` — unchanged flow; footer text mentions the store; `credit` unused.
- `balance.ts` — builds `lines` (positive) + `credit` from `computeBalance` (which now returns `creditCents` instead of a negative line).
- `webhook.ts` → renamed to `src/pages/api/shopify/webhook.ts`; Stripe route deleted.
- Admin pages: "stripe" links become Shopify admin links (`https://admin.shopify.com/store/<handle>/draft_orders/<id>` / `/orders/<id>`), `SHOPIFY_STORE_HANDLE` var.

### 4.7 Marketing-site changes

- Nav: **Store →** (`https://store.biokea.ai`), same external-link treatment as Games.
- `/pricing`, `/services`: CTAs → `https://store.biokea.ai/products/specimen-barcoding` / `…/edna-metabarcoding` ("Configure & pay a 50% deposit"), keeping a secondary "or get a quote here" link to `/quote`.
- `/quote`: thin widget host. `/quote/<token>`: unchanged except the "Pay now" link is Shopify's.
- `subscribe.astro` `SOURCE_LABELS` gains `store`.

### 4.8 Config

Secrets: `SHOPIFY_ADMIN_TOKEN` (custom app Admin API access token, scopes `write_draft_orders`, `read_orders`, `read_products`), `SHOPIFY_WEBHOOK_SECRET` (Settings → Notifications → Webhooks signing key). Vars: `SHOPIFY_STORE_DOMAIN` (`biokea.myshopify.com`), `SHOPIFY_STORE_HANDLE`, `SHOPIFY_PAYMENT_TERMS_TEMPLATE` (`NET_30`, optional). Remove: `STRIPE_*` (already deleted from the Worker). `.dev.vars.example`, README, deploy workflow (`widget:build` before `astro build`) updated.

## 5. Shopify store setup (human, once)

1. Create the store (`biokea.myshopify.com`), Basic plan; enable Shopify Payments; currency USD.
2. **Domain:** Settings → Domains → Connect existing → `store.biokea.ai`; in Cloudflare DNS add `store` CNAME `shops.myshopify.com`, **DNS only** (grey cloud) so Shopify can issue TLS; set as primary domain.
3. **Custom app:** Settings → Apps and sales channels → Develop apps → Create app `biokea-website` → Admin API scopes above → Install → copy the Admin API access token → `wrangler secret put SHOPIFY_ADMIN_TOKEN`.
4. **Webhooks:** Settings → Notifications → Webhooks → create the four topics → URL `https://biokea.ai/api/shopify/webhook`, format JSON, latest API version; copy the signing key shown on that page → `wrangler secret put SHOPIFY_WEBHOOK_SECRET`.
5. **Payment terms:** Settings → Payments → confirm payment terms are available on draft orders (Net 30 template).
6. **Taxes:** Settings → Taxes → US; service products set non-taxable; the gateway also sends `taxExempt`/`taxable:false` on drafts.
7. **Products:** two service products (`specimen-barcoding`, `edna-metabarcoding`; price shown "from $6/specimen" / "from $115/sample" as a display price with a `quote` template — not add-to-cart-able: template hides the buy button, shows the widget); placeholder goods (3 kits, 2 consumables, 3 merch) as draft-visibility products with stand-in prices/images.
8. **Theme:** on the `product.quote` template add a Custom Liquid section with the widget mount + script; theme colours from the site tokens; nav: Services, Kits, Consumables, Merch, "About BioKEA →" (biokea.ai).
9. **Turnstile:** add `store.biokea.ai` to the widget's hostnames.

## 6. Error handling, idempotency, security

Inherited from the Stripe design and its final-review fixes: strict Supabase
reads, conditional status steps, per-attempt idempotency (Shopify: the draft
`customAttributes.payment_id` is the idempotency handle — a retry with the
same payment row finds its existing draft via `draftOrders(query:
"tag:biokea payment_id:…")` before creating another), state-guarded webhook,
un-record-on-failure, fail-closed admin. New: CORS restricted to two origins;
the widget's `apiBase` is hardcoded to biokea.ai (not read from the DOM) so a
compromised theme can't redirect quotes elsewhere; the Admin token is a
Worker secret with the narrowest scopes. The widget `<script>` on the store
is loaded from our own origin without SRI on purpose: an integrity hash would
have to be re-pasted into the Shopify theme on every widget rebuild, and the
threat SRI guards against (a third-party CDN) doesn't apply — biokea.ai is
the first party here. The tag carries no `crossorigin` attribute (with
`crossorigin="anonymous"` the browser demands a CORS header on the script;
`/widget/*` is served with `Access-Control-Allow-Origin: *` regardless).

## 7. Testing

- Unit: gateway (GraphQL request shapes, dollars↔cents, discount for credit, payment-terms omission on lookup failure, existing-draft lookup on retry); webhook (HMAC verify with a known secret, each topic, note-attribute fallback, unknown order → 200, failure → 500 + un-record); CORS helper; `computeBalance` credit shape; renames compile.
- Widget: unit-test the pure render/state functions; e2e on `/quote` (widget mounts, live total updates, dead-zone copy) replacing the current `quote.spec.ts` assertions; a Playwright test loading the built bundle in a blank page to prove it's self-contained.
- e2e: `/api/quote` preflight from `store.biokea.ai` origin → 204 with the header; from `evil.example` → no header; deposit form post with `Origin: https://store.biokea.ai` passes the CSRF gate.
- Manual (Shopify test mode / Bogus gateway): full deposit → balance → paid; delete-draft void; net-30 invoice; refund; goods checkout; store domain + TLS.

## 8. Rollout

1. `0007` migration. 2. Store setup §5 (steps 1–6). 3. Secrets/vars; deploy (`main` still holds the dormant Stripe-era code — pushing after this branch merges is the first deploy of payments). 4. Products + theme + widget embed (§5 7–8). 5. Test-mode walk-through with Shopify's Bogus Gateway; then Shopify Payments live. 6. Flip marketing CTAs (already in the branch; they point at store URLs that exist by step 4).

## 9. Housekeeping recorded here

- The 22 Stripe-era commits stay merged in local `main`; this branch replaces the provider-specific parts. Not pushed until this lands.
- `STRIPE_SECRET_KEY` deleted from the Worker (2026-08-17). `GOLDEN_WORDS`/`GOLDEN_HMAC_SECRET` remain and can be deleted any time.

## 10. Open items / assumptions

- Payment terms on draft orders for a Basic-plan store using Shopify Payments — verified in the API (`DraftOrderInput.paymentTerms`); confirm the Net-30 template exists in the store (§5.5). If not, drafts are due on receipt and PO buyers still get an invoice they can pay within its validity.
- Widget styling inside a Shopify theme inherits the theme's CSS; the widget ships its own scoped CSS (`.bk-quote …`) to stay legible.
- Deposit % and net terms remain constants.
