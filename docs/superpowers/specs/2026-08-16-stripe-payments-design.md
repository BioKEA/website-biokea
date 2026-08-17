# Stripe payments for quoted services — design

**Date:** 2026-08-16
**Context:** Slice 3 of the "sell sequencing services online" effort laid
out in `2026-08-16-quote-calculator-design.md` §9. Slice 1 (`/quote`) is
live; this slice lets a customer pay for a quote. Sample intake (slice 2)
stays human for now — see §11.

## 1. Goal

A customer holding a BioKEA quote (`/quote/<token>`, `BK-2026-0142`) can
pay a **50% deposit** on it without talking to anyone, by card, ACH debit,
or bank transfer — and a university's AP office can do the same against a
real invoice with a PO number on it. When results ship, staff enter the
**actual** sample counts on an internal page and the customer receives a
**balance invoice** computed at the same rate card, with the deposit
credited. Every payment state is visible on the customer's quote page and
in Stripe.

## 2. Decisions taken in brainstorming (2026-08-16)

| Decision                | Choice                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| The payable object      | The existing quote. No cart, no checkout page of our own.                                                                             |
| Timing                  | Deposit now, balance on delivery.                                                                                                     |
| Deposit size            | 50% of the quoted total at the audience rate the customer selects when paying (`DEPOSIT_FRACTION = 0.5`, one constant).               |
| Payment rails           | Card, ACH debit, and US bank transfer on every invoice, regardless of size.                                                           |
| Balance creation        | Internal admin page from day one (not the Stripe dashboard by hand).                                                                  |
| Admin auth              | Cloudflare Access on `/admin/*` and `/api/admin/*`; Worker verifies the Access JWT.                                                   |
| After the deposit lands | Automated confirmation email to the customer + notification to the lab; shipping instructions and manifest still come from a human.   |
| Stripe mechanism        | Stripe **Invoices** (hosted invoice page) for both phases. No Stripe.js, no Checkout, no Stripe Quotes.                               |
| Payable services        | Only the two priced services (`barcoding`, `metabarcoding`) — the only ones with a rate card, hence the only ones `/quote` can price. |

## 3. Why Invoices, not Checkout

- The hosted invoice page natively accepts card, ACH debit, and bank
  transfer, produces the PDF invoice + receipt, sends reminders, and
  supports net terms. Checkout does card well and nothing else on that list.
- A deposit _invoice_ is exactly the artifact an institutional buyer needs
  to raise a PO — the customers most likely to spend the most.
- One mechanism for both phases means one webhook and one status model.
- Zero PCI surface and no third-party JS on our pages; CSP and the
  origin-check middleware are untouched.

## 4. Customer flow and states

The quote page is the only customer UI. Its payment panel renders by
`quotes.status`:

| `status`           | Panel shows                                                                                                                                                                        | Transition                                                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `quoted`           | Audience selector (academic w/ attestation checkbox, or commercial), optional PO number, **Pay 50% deposit — $X** button. Hidden if `needs_conversation` or the quote has expired. | Button → `POST /api/quote/<token>/deposit` → redirect to Stripe hosted invoice.                              |
| `deposit_invoiced` | "Deposit invoice for $X sent to _email_ — due _date_." **Pay now** (hosted invoice URL) · **PDF**.                                                                                 | Stripe `invoice.paid` → `deposit_paid`. Stripe `invoice.voided` / `marked_uncollectible` → back to `quoted`. |
| `deposit_paid`     | "Deposit of $X received on _date_. The lab will send shipping instructions and your sample manifest within 2 business days." Receipt PDF link.                                     | Staff create balance → `balance_invoiced`, or (actual ≤ deposit) → `paid`.                                   |
| `balance_invoiced` | "Balance invoice for $Y — due _date_." **Pay now** · **PDF**.                                                                                                                      | `invoice.paid` → `paid`. Void → `deposit_paid`.                                                              |
| `paid`             | "Paid in full — thank you." Both PDFs.                                                                                                                                             | Terminal.                                                                                                    |

Expired quotes with no deposit stay as today (no panel). An open deposit
invoice on an expired quote remains payable — the invoice's own due date
governs.

Academic pricing stays self-attested (unchanged from the quote page):
choosing the academic rate requires ticking "This work is for a
degree-granting institution, government agency, or non-profit research
organization." The choice and timestamp are recorded on the quote.

## 5. Architecture

### 5.1 Stripe object mapping

| Ours             | Stripe                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote (customer) | `Customer` — created on first deposit request; `email`, `name`, `description` = organization, `metadata.quote_id`. Reused for the balance.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Deposit          | `Invoice` — `collection_method: 'send_invoice'`, `days_until_due: 30`, `currency: 'usd'`, `auto_advance: false`. `metadata: {quote_id, quote_number, kind: 'deposit'}`. `custom_fields`: `Quote: BK-…`, and `PO number: …` when given. `payment_settings.payment_method_types: ['card','us_bank_account','customer_balance']` with `payment_method_options.customer_balance = {funding_type:'bank_transfer', bank_transfer:{type:'us_bank_transfer'}}`. Footer: "50% deposit toward BioKEA quote BK-… (valid to _date_). The balance is invoiced on actual sample counts when results are delivered." |
| Deposit lines    | One `InvoiceItem` per quote line: _"Voucher-Linked Specimen Barcoding — 50% deposit on 800 specimens (est.) @ $12/specimen, academic rate"_, `amount` = per-line deposit cents (§5.5).                                                                                                                                                                                                                                                                                                                                                                                                                |
| Balance          | `Invoice` as above, `kind: 'balance'`, `days_until_due: 30`. Lines: one per service at **actual** counts and full amount, plus one **negative** line *"Less deposit received (invoice XXXX, paid *date*)"* = −deposit cents. Footer: "Balance for BioKEA quote BK-…, computed on actual sample counts."                                                                                                                                                                                                                                                                                               |
| Payment states   | Webhook events `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Invoices are created → items attached → `finalizeInvoice` → `sendInvoice`
(Stripe emails the customer a link so they can pay later by ACH/transfer)
→ we return `hosted_invoice_url` and the browser is redirected there.
Stripe idempotency keys: `deposit:<quote_id>` and
`balance:<quote_id>:<attempt>`.

### 5.2 Data model — `migrations/0006_quote_payments.sql`

Additions to `quotes`:

```sql
alter table public.quotes
  add column status text not null default 'quoted'
    check (status in ('quoted','deposit_invoiced','deposit_paid','balance_invoiced','paid')),
  add column audience text
    check (audience in ('academic','commercial')),
  add column academic_attested_at timestamptz,
  add column po_number text check (char_length(po_number) <= 64),
  add column stripe_customer_id text;
```

New table:

```sql
create table public.quote_payments (
  id                 uuid primary key default gen_random_uuid(),
  quote_id           uuid not null references public.quotes(id),
  kind               text not null check (kind in ('deposit','balance')),
  status             text not null default 'open'
                       check (status in ('open','paid','void','uncollectible','settled')),
  amount_cents       integer not null,               -- ≤ 0 allowed only for kind='balance' status='settled'
  currency           text not null default 'usd',
  stripe_invoice_id  text unique,                    -- null only for a 'settled' no-invoice balance
  hosted_invoice_url text,
  invoice_pdf        text,
  due_at             timestamptz,
  paid_at            timestamptz,
  actual_lines       jsonb,                          -- balance only: [{serviceSlug,count,markers}]
  created_by         text,                           -- balance only: Access email
  created_at         timestamptz not null default now()
);
-- At most one live (open/paid) invoice per (quote, kind); a voided one can be reissued.
create unique index quote_payments_live_idx
  on public.quote_payments (quote_id, kind) where status in ('open','paid');

create table public.stripe_events (
  id          text primary key,      -- Stripe event id; insert-or-skip gives webhook idempotency
  type        text not null,
  received_at timestamptz not null default now()
);
```

RLS enabled with no policies on both, same as `quotes`: every read and
write goes through the Worker with the service-role key. Stripe stays the
ledger; Supabase mirrors state so the quote page and admin page can render
without calling Stripe.

### 5.3 Endpoints

All server code follows the existing pattern: an exported `handleX(request,
env, …)` that unit tests call directly, and a thin `POST` wrapper that reads
`env` from `cloudflare:workers` and 500s "not configured" if secrets are
missing.

**`POST /api/quote/[token]/deposit`** — public, same-origin form post from
the quote page (covered by the origin-check middleware).
Body: `audience` (`academic`|`commercial`), `attest` (`'true'` required
when academic), `po_number` (optional). Steps:

1. Load quote by `access_token`; 404 unknown; 409 if `needs_conversation`,
   expired with no live deposit, or `status !== 'quoted'` — except that if
   a live deposit invoice exists, respond with its `hosted_invoice_url`
   (idempotent double-click / back-button behaviour).
2. Insert the `quote_payments` row (`kind='deposit'`, `status='open'`,
   `stripe_invoice_id` null) — the partial unique index is the lock; a
   unique-violation means step 1's race lost: re-read and return the
   existing URL.
3. Ensure Stripe customer; create invoice + items; finalize; send.
4. Update the payment row with ids/URLs/`due_at`; update quote
   (`status='deposit_invoiced'`, `audience`, `academic_attested_at`,
   `po_number`, `stripe_customer_id`).
5. Respond `303 See Other` → `hosted_invoice_url` (form post) — the panel
   works with JavaScript disabled. If Stripe fails at step 3, delete the
   row and render the quote page with an error banner (500 body for the
   test harness).

**`POST /api/stripe/webhook`** — public, no origin check (Stripe sends
`application/json`, which the origin-check middleware already lets
through; the signature is the auth). Steps: raw body →
`stripe.webhooks.constructEventAsync(body, sig, STRIPE_WEBHOOK_SECRET,
undefined, Stripe.createSubtleCryptoProvider())`; 400 on bad signature.
Insert `stripe_events(id)`; on conflict return 200 (already handled).
Ignore event types we don't handle and invoices whose id we don't know
(200) — staff may create ad-hoc invoices in the dashboard without breaking
anything. Otherwise update the payment row + quote status per §4, then
send the emails (§5.6) and return 200. Emails are awaited (the subscribe
endpoint's lesson: `void`'d fetches get torn down with the response);
Stripe's webhook timeout is comfortably longer than two Resend calls.

**`GET /admin`** and **`GET /admin/quotes/[number]`** — Astro SSR pages
behind Cloudflare Access (§5.4). Index: last 100 quotes with status,
org, totals, links. Quote page: everything on the customer page plus
Stripe links, payment rows, and — when `status = 'deposit_paid'` — the
**balance form**: one row per quote line with the quoted count and an
input for the actual count (and markers for eDNA); a live server-rendered
preview is unnecessary — the page recomputes on POST and shows the result
before creating anything (see next).

**`POST /api/admin/quotes/[number]/balance`** — behind Access + origin
check. Body: `counts[<serviceSlug>]`, `markers[<serviceSlug>]`,
`confirm` (`'true'` on the second submit). First submit (no `confirm`)
re-renders the admin page with the computed table: actual lines at the
recorded audience via the **same** `buildQuote()` engine, total, deposit
credited, **balance due**, and a Confirm button. Second submit creates
the balance invoice (§5.1), inserts the payment row (`actual_lines`,
`created_by` = Access email), sets `status='balance_invoiced'`, and
redirects back. If balance due ≤ 0: no invoice; insert a `settled` row
with the (non-positive) amount, set `status='paid'`, and show "Refund
$X to the customer in Stripe (Payments → the deposit → Refund)". The
conversation-band rule does not apply here: actual counts above a
`conversationThreshold` are still priced (the human check already
happened), so `buildQuote()` gets a flag to skip that gate.

### 5.4 Cloudflare Access gate — `src/lib/access.ts` + middleware

Zero Trust application on `biokea.ai/admin/*` and `biokea.ai/api/admin/*`
(one app, two paths), policy: allow emails ending `@biokea.ai` via Google
or one-time PIN. `src/middleware.ts` gains a second rule: for those path
prefixes, require a valid `Cf-Access-Jwt-Assertion` — verified with `jose`
(`createRemoteJWKSet('https://<CF_ACCESS_TEAM_DOMAIN>/cdn-cgi/access/certs')`,
`issuer = https://<CF_ACCESS_TEAM_DOMAIN>`, `audience = CF_ACCESS_AUD`).
Puts `locals.adminEmail` on success; 403 otherwise. In `astro dev`
(`import.meta.env.DEV`) only, `CF_ACCESS_DEV_EMAIL` in `.dev.vars`
substitutes for the header so admin pages and e2e tests work locally;
the branch is compiled out of production builds.

### 5.5 Money

Totals in `quotes` are whole dollars (rates are whole dollars). Stripe
takes cents. Rules, all in `src/lib/payments/terms.ts` and unit-tested:

- `depositCents(lineTotalDollars) = Math.round(lineTotalDollars * 100 * DEPOSIT_FRACTION)` per line; the deposit total is the sum of the per-line amounts (so the invoice's lines add up exactly to its total; sub-cent drift across lines is at most one cent per line and is accepted).
- Balance: `actualTotalCents − depositPaidCents`, where `actualTotalCents = Σ line.total × 100` from `buildQuote()` at the recorded audience, and `depositPaidCents` is the **paid** deposit row's `amount_cents` (never recomputed from the quote — the customer may have paid a rounded amount).
- Currency USD only. No tax lines (see §10).

### 5.6 Emails — `src/lib/email/quote-payments.ts` via a small `src/lib/email/resend.ts`

From `notifications@biokea.ai`, reply-to `contact@biokea.ai`, same
envelope headers as the subscribe welcome. Plain text + minimal HTML.

| Trigger      | To       | Subject                              | Body gist                                                                                                                                     |
| ------------ | -------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| deposit paid | customer | Deposit received — BioKEA quote BK-… | Amount, date, "the lab will send shipping instructions and your manifest within 2 business days", link to `/quote/<token>`, receipt PDF link. |
| deposit paid | contact@ | [deposit paid] BK-… · Org · $X       | Lines/counts, audience, PO, customer email, link to `/admin/quotes/BK-…`.                                                                     |
| balance paid | customer | Paid in full — BioKEA quote BK-…     | Thanks, PDF link.                                                                                                                             |
| balance paid | contact@ | [paid in full] BK-… · Org · $Y       | Same shape.                                                                                                                                   |

Stripe additionally emails its own invoice/receipt; keep those on — they
carry the PDF.

### 5.7 Page changes

- `src/pages/quote/[token].astro`: reads the new columns + payment rows;
  renders the payment panel per §4 (a plain `<form method="post">` for
  the deposit; links otherwise). Error banner when redirected back with
  `?pay=failed`.
- `src/pages/pricing.astro` and `src/pages/services.astro`: CTA copy
  gains "…and pay a 50% deposit online" so the capability is discoverable.
  No new pages for customers.
- `src/pages/admin/index.astro`, `src/pages/admin/quotes/[number].astro`:
  new, minimal styling, `noindex`, excluded from the sitemap.

### 5.8 Config

Worker secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
`wrangler.toml` vars: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`.
`.dev.vars.example` gains `STRIPE_SECRET_KEY` (test key),
`STRIPE_WEBHOOK_SECRET` (from `stripe listen`), `CF_ACCESS_DEV_EMAIL`.
Dependencies: `stripe` (fetch HTTP client + SubtleCrypto provider), `jose`.
`DEPOSIT_FRACTION`, `INVOICE_DAYS_UNTIL_DUE = 30` live in code.

Stripe dashboard (once, test mode then live): Settings → Payments →
Payment methods: enable ACH Direct Debit and Bank transfers; Settings →
Billing → Invoices: branding, "email finalized invoices" and receipts on,
default footer blank (we set per invoice); Developers → Webhooks: endpoint
`https://biokea.ai/api/stripe/webhook`, events `invoice.paid`,
`invoice.voided`, `invoice.marked_uncollectible`; copy the signing secret.
Bank transfer needs a Stripe-provided virtual account — enabled in the
same payment-methods screen.

Cloudflare (once): Zero Trust → Access → Applications → Add self-hosted:
domain `biokea.ai`, paths `/admin/*` and `/api/admin/*`; policy allow
`@biokea.ai`; copy the Application Audience (AUD) tag and team domain into
`wrangler.toml`.

## 6. Error handling & idempotency

- Double-submit / two tabs on the deposit: DB partial unique index + Stripe
  idempotency key → the second request returns the first invoice's URL.
- Stripe down at deposit time: payment row deleted, customer sees "Payment
  service unavailable — your quote is unaffected, try again shortly"; the
  quote stays `quoted`.
- Webhook retries: `stripe_events` primary key makes every handler
  idempotent; Stripe retries on non-2xx for up to 3 days.
- Webhook arrives before our row has `stripe_invoice_id` (finalize → paid
  within milliseconds is possible with test cards): the handler looks up
  by `stripe_invoice_id`; if unknown, it falls back to
  `invoice.metadata.quote_id` + `kind` to find the open row and fills the
  id in. Unknown to both → 200 and ignore.
- Voided deposit → quote back to `quoted`; the panel offers the deposit
  again (new invoice, new idempotency key suffix).
- Actual ≤ deposit at balance time → no invoice; explicit refund
  instruction for staff (§5.3). Refunds and credit notes are performed in
  Stripe by staff; we do not model them (Stripe is the ledger).
- Amount sanity: the deposit endpoint refuses (500, logged) if the computed
  deposit is < $1 or differs from `DEPOSIT_FRACTION × total` by more than
  the number of lines in cents.

## 7. Security

- No card data touches the Worker; all payment entry is on Stripe.
- Webhook authenticated by signature only; the endpoint does nothing but
  mirror Stripe state and send notifications, so a replayed genuine event
  is harmless (idempotent) and a forged one is rejected.
- Admin surface: Cloudflare Access at the edge **and** JWT verification in
  the Worker (defence in depth — a misconfigured Access app must not expose
  `/admin`). `created_by` records the acting email.
- Existing origin-check middleware covers every form post here; the
  webhook is JSON so it passes as designed.
- Access tokens (`/quote/<token>`) remain the customer's bearer credential
  for viewing/paying their quote, as today; the deposit endpoint never
  accepts a quote number.
- Secrets in Worker secrets only; test/live keys are distinguished by
  prefix and the deploy README says which is where.

## 8. Testing

Unit (vitest, existing mocks pattern):

- `terms.ts`: deposit allocation & rounding, balance math, ≤ 0 case,
  sanity bounds.
- `handleDeposit`: 404/409 paths, idempotent re-request, happy path with
  a mocked Stripe client (assert customer/invoice/items/finalize/send
  calls, metadata, custom fields, payment method types, footer), Stripe
  failure rollback.
- `handleWebhook`: signature verification using
  `stripe.webhooks.generateTestHeaderString`, duplicate event skipped,
  unknown invoice ignored, each transition in §4, email sends asserted.
- `handleBalance`: preview vs confirm, engine reuse at recorded audience,
  conversation-threshold bypass, negative line, ≤ 0 settled path,
  `created_by`.
- `access.ts`: valid/expired/wrong-aud JWT against a locally generated
  RSA key served as a JWKS mock; dev bypass only under `DEV`.
- Migration SQL: constraint/index sanity via the same static checks used
  for `0005`.

E2E (Playwright, dev server, no Stripe/Supabase configured):

- The panel's state → view-model mapping is a pure function
  (`src/lib/payments/panel.ts`) covered by unit tests; e2e checks only that
  the quote page still renders and that a deposit form post returns the
  "not configured" 500 without breaking the page.
- `/admin` without the dev email → 403; with it → 200.
- Webhook without signature → 400.

Manual (test mode) checklist in the plan: card `4242…`, ACH test bank,
bank-transfer test flow, void, balance with counts above/below the
estimate, and `stripe listen --forward-to localhost:4321/api/stripe/webhook`.

## 9. Rollout

1. Migration `0006` in Supabase (additive; existing quotes default to
   `quoted`).
2. Deploy with **test** keys; Cloudflare Access app live; run the manual
   checklist end-to-end including a real inbox for the emails.
3. Swap to live keys + live webhook secret; re-run one $1 deposit on a
   real card and refund it.
4. Update the pricing/services CTA copy last, so nothing advertises the
   capability before it's proven live.

## 10. Assumptions and open items

- **Deposit 50%** and **net-30 due dates** are constants pending Michelle's
  sign-off; changing either is a one-line change.
- **Tax:** not modelled. Sequencing services performed in California are
  treated as untaxed services; no tangible goods are sold in this slice
  (kits are not on the rate card). Stripe Tax stays off. Revisit if kits or
  out-of-state/international shipments enter the flow.
- **Refunds/credit notes** are manual in Stripe; the admin page tells staff
  when one is owed.
- **Reissuing a balance** after a void is supported by the data model
  (partial unique index) and endpoint (attempt suffix); no UI beyond the
  same form.
- **Currency** USD only. **International** customers can still pay by card;
  bank transfer is US-only.
- **Reporting** lives in Stripe; `/admin` is operational, not analytical.
- The academic discount remains self-attested — unchanged risk from slice 1.

## 11. Where this sits

Roadmap from the quote-calculator spec §9: 1 quote ✅ → 2 sample-intake
backbone → **3 self-serve Stripe (this)** → 4 PO/invoice/net terms → 5
portal. Doing 3 before 2 is deliberate: Stripe Invoices already give
institutional buyers the PO/net-terms path (folding most of 4 into 3), and
the deposit-paid email is the hook where slice 2's automated intake pack
plugs in later as a copy change. What this slice does _not_ do is anything
with samples — the human handoff after the deposit is the contract with
the lab until slice 2 exists.
