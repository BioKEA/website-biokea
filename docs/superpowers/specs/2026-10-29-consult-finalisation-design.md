# Consult finalisation — design

Date: 2026-10-29. Spec 3 of the pricing/services programme (spec 1:
`2026-10-26-pricing-catalog-and-pages-design.md`; spec 2:
`2026-10-28-order-configurator-design.md`, both shipped).

Sean asked for this to be built without a question round ("build Spec 3
and everything that remains. go"), so every decision below that is not
quoted from spec 2 is a call I made; they are listed at the end.

## Intent

Spec 2 saves a quote in `status = 'consult'` whenever the project needs a
conversation (sampling kits, an "other" marker or sample type, volume above
the self-serve threshold, every qPCR request). Those quotes have no payment
path: the customer is told "we'll reply with a firm quote and a payment
link", and today the lab can only do that by hand outside the system.

Spec 3 closes the loop. From `/admin/quotes/<number>` the lab turns a
consult quote into a priced, payable quote, the customer gets an email with
the link, and from there the existing pay-in-full path (Shopify draft
order, Net-30 with PO, rate lock, credit on under-shipping, admin balance)
runs unchanged.

## Goals

- A **Firm quote** form on the admin quote page for any quote that is not
  payable because it needs a conversation: `status = 'consult'`, or a
  legacy `status = 'quoted'` row with `needs_conversation = true`.
- The lab can: keep, re-count or remove the engine-priced lines; add
  engine lines (any rate-card kind); add **custom lines** with an agreed
  title, unit and unit price (academic and commercial); set how many days
  the quote is valid; write a note to the customer.
- Two-step, like the balance form: **Preview** shows the re-priced lines
  and totals; **Confirm** saves them.
- Confirm re-prices on the server with the same engine (the API stays the
  pricing authority), writes lines + totals, clears the conversation flag,
  sets `status = 'quoted'` with a conditional update, records who/when, and
  emails the customer "Your BioKEA quote is ready" with the quote link.
- The customer's quote page shows the lab's note and the normal pay panel.
- The lab may revise a quote it firmed up (same form) until a payment
  exists on it.
- Custom lines work through the whole money path: draft order line items,
  `paidInFull`, and the balance form (re-count at the agreed rate, credit
  on under-shipping).

## Non-goals

- Sending sampling kits through checkout (still a spec 2 non-goal).
- Discounts as negative lines. A negotiated price is a custom line or a
  custom rate; Shopify's draft order takes positive custom lines only.
- Editing the customer's configuration, directions or contact details.
- Re-opening a quote once a payment row exists; that goes through Shopify
  and the balance form as today.

## Anti-goals

- Any route by which a customer can set a price. Custom lines are built
  only from the Access-protected admin endpoint; the public quote API's
  line schema keeps stripping `kind` and any price fields.
- A second pricing engine. Custom lines are a new `LineKind` priced by
  `priceOne` on a one-tier list, like the flat id-only and assay kinds.

## Data

Migration `migrations/0010_quote_finalisation.sql` (applied by Sean in the
Supabase SQL editor **before** the deploy that writes it):

- `finalised_at timestamptz`, `finalised_by text` (Access email),
  `lab_note text` (≤ 2000 chars). All nullable; nothing renamed.

Only the finalise endpoint writes these columns, so a deploy that lands
before the migration breaks only that endpoint (Confirm returns an error
flash); reads use `select=*` and are unaffected.

### Custom line kind

`LineKind` gains `'custom'`. A custom `QuoteLineInput` carries
`custom: { title, unitLabel, academic, commercial }` (unit prices in
dollars, up to two decimals) and a per-quote slug `custom-1`, `custom-2`…
so `lineKey` stays unique and matches the balance form's key pattern.
The stored `QuoteLine` keeps the same `custom` object, which is how the
balance path re-prices an actual count at the agreed rate: `computeBalance`
copies the quoted line's `custom` onto the matching input before calling
`buildQuote`, and refuses a custom input with no quoted match.

The flat tier's range label is "agreed rate"; the quote page drops its
"tier" suffix for custom lines.

## Surfaces

- `POST /api/admin/quotes/<number>/finalise` — Access + middleware, same
  shape as the balance endpoint. No `confirm` → 303 back to the admin page
  with the form as query params (`preview=finalise`). `confirm=true` →
  validate, price, conditional update, email, 303 with a flash.
- Admin quote page: the Firm quote section (rows prefilled from the stored
  lines plus three blank rows; type select, count, markers, custom title,
  unit, academic and commercial price), days valid (default 30), note to
  the customer, preview table, flashes. After finalising, the header shows
  "firmed up by <email> on <date>" and the original consult reasons stay
  listed for the record.
- Customer quote page: "Note from the lab" block when `lab_note` is set.
- Email: `firmQuoteReadyEmail(quote)` — lines, totals for the recorded
  audience (both when none), the note, valid-until date, link. A send
  failure does not fail the request; the admin flash says the email did
  not go out.

## Errors and races

- Conditional update `status = <from>` and no live payment: a quote that a
  concurrent request already changed comes back as `error=state`.
- Validation errors come back on the preview with the field named.
- Revising races a checkout: the pay endpoint now claims the quote
  (`quoted` → `deposit_invoiced`) right after recording the payment row and
  before the Shopify call, then re-reads it and aborts if the lines or
  totals changed. A revision's conditional write therefore can't land on a
  quote mid-checkout, and a checkout can't bill lines a revision replaced.
  On a gateway failure the claim is released. (Found in code review.)
- Duplicate engine lines (same kind, service and assay) are refused: the
  balance form keys its inputs by that identity.

## Supabase keep-alive

The free-tier project paused itself on 2026-10-28; while paused, quotes,
subscribes and the Shopify `orders/paid` webhook all failed in production.
The Worker gets a custom entry (`src/worker.ts`, set as `main` in
`wrangler.toml`) that re-exports Astro's fetch handler and adds a
`scheduled` handler: a daily cron reads one row from `quotes` with the
service-role key and logs a failure. Moving to the Pro plan stays Sean's
decision; the cron costs nothing and is harmless if he upgrades.

## Smaller items carried from spec 2

- `llms-full.txt` mentions the store Order page (spec 2 listed it; only
  `llms.txt` got it).
- Home FAQ answer mentions the store Order page.
- Widget accessibility: each field's inline error is tied to its input
  with `aria-describedby`, and the input gets `aria-invalid` while the
  error shows.

## Tests

Unit: custom line pricing and `lineKey`; `computeBalance` on a custom line
(under-shipping credit at the agreed rate; unknown custom input refused);
form parser (valid rows, blank rows skipped, bad price, duplicate lines,
too long note); endpoint (preview bounce, confirm on consult, conditional
race, refused once a payment exists, legacy volume quote, revise a firmed
quote, email failure flash, public API still strips `kind`); email builder;
keep-alive (hits the REST endpoint, logs on failure, no-ops without env).

## Calls I made (not Sean's words)

- The form also covers legacy volume quotes (`quoted` +
  `needs_conversation`), not only `consult`.
- Revising is allowed until a payment row exists, and only for quotes the
  lab already firmed up (or that need a conversation); ordinary
  self-serve quotes are not editable here.
- Custom lines take separate academic and commercial unit prices; a blank
  academic price means the same as commercial.
- Days valid defaults to 30 (the quote API's own default) and is capped at 180.
- The consult triggers stay stored after finalising, as history.
- A daily keep-alive cron rather than weekly: Supabase's inactivity
  window is seven days, and daily leaves room for failed runs.

## Rollout

1. Sean applies `migrations/0010_quote_finalisation.sql` in the Supabase
   SQL editor and runs the check in its header (expect three rows).
2. Merge `feat/consult-finalisation` into `main` and push over HTTPS; CI
   deploys. The deploy adds the cron trigger, visible under the Worker's
   Settings → Triggers in the Cloudflare dashboard.
3. Verify: open a consult quote in `/admin`, Preview a firm quote, Confirm;
   the customer email arrives and `/quote/<token>` shows the pay panel.
   The next day, Workers Logs should show no `[keep-alive]` errors.

If step 2 happens before step 1, only the finalise action fails, with the
flash "Check that migration 0010 is applied".
