# Pay-in-full checkout — design

**Status:** approved 2026-08-22 · supersedes parts of
`docs/superpowers/plans/2026-08-22-conversion-optimization.md` (see §11).

## 1. Why

A real customer went through `/quote` and reported two things:

> Tried it. A bit confused by the "email me a quote" given that the price
> was listed. Also confused by the 50% deposit thing.
> Why isn't this as simple as pay 100% up front with credit card?

Both complaints are accurate readings of the current design.

- The configurator shows **two** totals (academic and commercial) side by
  side and never asks which one is theirs until the payment step, so "the
  price" is genuinely ambiguous.
- Its only terminal CTA is `Email me this quote` — a lead-capture button at
  the point where a ready buyer wants a buy button.
- `DEPOSIT_FRACTION = 0.5` (`src/lib/payments/terms.ts:13`) is the _only_
  self-serve payment path. There is no way to pay in full.

The fix is to make the configurator end in one price and one button, and to
make that button charge 100%.

## 2. Decisions taken (owner, 2026-08-22)

1. **The up-front payment is 100%.** `DEPOSIT_FRACTION` is deleted. There is
   no self-serve 50% option; large-project deposits are arranged by hand in
   the Shopify admin, which needs no code.
2. **Under-shipping produces credit, not a refund.** If fewer samples arrive
   than were quoted, the unused amount becomes credit toward another project
   for 12 months. No cash is returned.

Decision 2 is only defensible alongside a **rate lock** (§4), and only if it
is disclosed at the point of sale rather than in a footer (§7). Both are
requirements of this design, not decoration.

## 3. What the customer buys

One sentence, and every piece of copy in this design derives from it:

> **N samples at a locked per-sample rate.**

- Ship exactly N → nothing further is owed.
- Ship fewer → the unused amount is credit, valid 12 months.
- Ship more → we invoice the extra at the same locked rate, or at a better
  tier rate if the larger count now earns one.

## 4. Money rules

### 4.1 The payment

`depositLines(lines, audience)` becomes `paymentLines(lines, audience)` and
bills 100% of the line total. `assertDepositSane` becomes
`assertPaymentSane` and asserts the invoice equals the quote total to within
one cent per line. `DEPOSIT_FRACTION` and the `pct` string it feeds are
removed.

### 4.2 The rate lock

`computeBalance` currently reprices actual counts through the tier engine
from scratch.

This cannot produce a _bill_ for under-shipping: `priceOne`'s best price is
`min` over tiers of `max(count, tier.minQty) * rate(tier)`, and every term is
non-decreasing in `count`, so a smaller actual count always settles at or
below what was prepaid. What it does instead is silently reprice the customer
at the **smaller count's** tier, shrinking the credit they get back.

Worked example, academic barcoding: quote 800 specimens → the 300–999 tier at
$12 → **$9,600 prepaid**. 250 arrive. The engine's best price for 250 is
$3,600 (itself a dead-zone buy-up to the 300 floor), so the credit is $6,000 —
even though the customer paid for those 250 specimens at $12 each, or $3,000.
**$600 of credit quietly lost**, and an effective rate of $14.40 on a project
they prepaid at $12. Under a no-refund policy that is not defensible.

`computeBalance` gains a fourth argument, the quoted lines (`quote.lines`,
already stored as jsonb on the row and already loaded by every caller). New
rule, per line:

```
// The engine's price for what actually arrived. computeBalance already calls
// buildQuote(inputs); this is that line's `[audience]` PriceResult, whose
// `total` keeps the dead-zone buy-up win. priceOne is module-private — do not
// reach for it.
engineTotal = buildQuote(inputs).lines[i][audience].total

// The quoted line matched on serviceSlug AND markers; null if there is none.
quoted      = quotedLines.find(q => q.serviceSlug === slug && q.markers === m)
lockedRate  = quoted[audience].effectiveRate
quotedTotal = quoted[audience].total

shortfall   = max(0, quoted.count - actualCount)     // NOT pricedCount
capTotal    = quotedTotal - shortfall * lockedRate

lineTotal   = quoted === null || shortfall === 0
                ? engineTotal
                : Math.min(engineTotal, capTotal)
```

**A shortfall is credited at the rate you locked, and you never pay more than
the engine would have charged.** The two halves matter independently, and
getting either wrong is a real bug:

- `shortfall` is measured against `quoted.count` — the count the customer
  _asked for_ — **not** `pricedCount`. Inside a dead zone the engine buys up
  to the next tier floor, so a 250-specimen quote is priced as a 300-slot
  block and the extra 50 are advertised as free headroom. Measuring the
  shortfall against `pricedCount` would hand every dead-zone customer a
  spurious credit for shipping exactly what they quoted.
- The `min` with `engineTotal` is skipped when `shortfall === 0`, because
  over-shipping must be allowed to _raise_ the total. Applying the cap there
  would let someone quote 800 and ship 1,100 for the 800 price.

Verified against the real engine (academic barcoding, `$12` locked at the
300–999 tier):

| Quoted → actual           | Paid   | Engine  | Settled | Credit  | Why                                |
| ------------------------- | ------ | ------- | ------- | ------- | ---------------------------------- |
| 800 → 800                 | $9,600 | $9,600  | $9,600  | $0      | exact                              |
| 800 → 250                 | $9,600 | $3,600  | $3,000  | $6,600  | cap beats engine — the whole point |
| 800 → 1,100               | $9,600 | $11,000 | $11,000 | −$1,400 | owes extra at the _better_ tier    |
| 250 → 250 (dead zone)     | $3,600 | $3,600  | $3,600  | $0      | no spurious credit                 |
| 250 → 300 (free headroom) | $3,600 | $3,600  | $3,600  | $0      | headroom promise holds             |
| 250 → 320                 | $3,600 | $3,840  | $3,840  | −$240   | 20 past the block, at $12          |
| 250 → 100 (dead zone)     | $3,600 | $1,600  | $1,600  | $2,000  | engine beats cap — customer wins   |

A line whose `serviceSlug`/`markers` match nothing in the quote (a service
added after the fact, or a changed marker count) is priced by the engine with
no cap, and `computeBalance` reports it in a new `uncapped: string[]` field of
service slugs so the admin preview can flag it.

Consequences:

- The per-sample rate can only ever go down, never up.
- The cap binds **only on the under-ship side**. Over-shipping raises the
  count, which can only earn an equal or better tier, so `engineTotal` already
  wins there — the customer keeps the better rate on the extra samples.
- The rate lock's entire practical effect is therefore to **make the credit
  bigger**. That is precisely the mitigation that makes decision 2 fair.

### 4.3 The credit

No new table and no new column. The negative `settled` balance row that
`handleBalance` already writes (`balance.ts:79`) _is_ the credit record —
`quote_payments.amount_cents < 0`, `status = 'settled'`, `kind = 'balance'`,
permitted today by `quote_payments_positive_unless_settled` (migration 0006).

A pure helper derives the customer-facing view:

```ts
creditFrom(payment): { amountCents: number; expiresAt: string } | null
// null unless kind='balance' && status='settled' && amount_cents < 0
// expiresAt = created_at + 12 months
```

Redemption is manual: the customer mentions their quote number and staff
apply a fixed-amount discount to the next draft order. Automating this is
explicitly out of scope.

## 5. The configurator

### 5.1 One price

A rate selector sits at the top of the summary panel:

```
Rates for:  [• Commercial]  [ Academic / nonprofit ]

  $12,345                            <- one number, large
  Academic/nonprofit rate: $8,600 — switch
```

- Default **Commercial**. We never headline a price the visitor may not be
  eligible for; the academic rate stays visible so the discount still sells.
- Line items render one audience's column instead of two.
- The dead-zone and upsell callouts render for the selected audience only.
  `renderDeadzone` currently reports whichever audiences benefit; it takes an
  `audience` argument and reports just that one. Its honesty gate
  (`isBetterThanLiteral`) is unchanged — that logic is correct and stays.

### 5.2 Three CTAs, ranked

Replacing the lone `Email me this quote`:

1. **`Pay $12,345 and start →`** — primary button.
2. `Paying by purchase order? Get a Net-30 invoice →` — text link.
3. `Just want the numbers? Email me this quote →` — text link.

These are three different intentions — card buyer, institutional purchasing,
not-ready-yet — not three variants of one thing. The `needs_conversation`
volume band still collapses everything to `Request a project quote`.

All three open the same details form (name, email, organization, note,
Turnstile). The academic attestation checkbox appears in it only when the
academic rate is selected, and only paths 1 and 2 require it.

### 5.3 Checkout in one click

Paying is two server steps today — create the quote, then form-post to the
payment endpoint. Both steps stay: the quote must exist even if Shopify
fails, and the emailed link is the retry path. The widget **chains** them so
it reads as one click:

```
submit details
  → POST /api/quote                     (creates the row, sends the emails)
  → on ok: populate a hidden form, form.submit()
  → POST /api/quote/<token>/pay         (creates the draft, sends the invoice)
  → 303 to Shopify checkout
```

The second post is a native form submit, so the 303 to Shopify is a
top-level navigation and works cross-origin from `store.biokea.ai`.

If step 2 fails, the widget shows the quote link and the customer can pay
from `/quote/<token>`, exactly as today. `configSignature` (`state.ts`) and
its stale-panel invalidation are kept for that retry state.

## 6. Endpoints

### 6.1 `POST /api/quote`

New optional fields on `QuoteSchema`:

- `audience: 'academic' | 'commercial'` → persisted to `quotes.audience`
  (column already exists, nullable).
- `attest: boolean` → when `audience === 'academic'`, sets
  `academic_attested_at` (column already exists).

Both optional so a stale cached widget bundle keeps working; absent →
`null`, and the payment step collects them instead.

The response gains nothing. The customer email is rewritten (§7).

### 6.2 `POST /api/quote/[token]/pay`

The current `deposit.ts` handler moves to `src/lib/payments/pay.ts`.
`pay.ts` is the new route; **`deposit.ts` stays as a deprecated alias that
delegates to the same handler**, because the flow is deployed and a cached
widget bundle on the store will still post to the old path. Remove the alias
one release later.

Form gains `intent`:

| `intent`        | Terms                 | After success                            |
| --------------- | --------------------- | ---------------------------------------- |
| `pay` (default) | due on receipt        | 303 to the Shopify checkout URL          |
| `invoice`       | NET_30 when available | 303 to `/quote/<token>?pay=invoiced#pay` |

`invoiced` is a new value for the existing `pay` flash param on
`/quote/[token]` (today: `unavailable` | `failed` | `attest`). It renders a
success note — "Invoice sent to you@lab.edu" — above the panel, which
`panelView` is already showing as `kind: 'invoiced'` by that point.

- `audience` falls back to `quote.audience` when the form omits it.
- Attestation stays server-authoritative: `audience === 'academic'` requires
  `attest=true` **or** a non-null `quote.academic_attested_at`.
- `po_number` is optional metadata on both paths — it no longer decides
  whether net terms are attached. `CreateInvoiceSpec` gains `netTerms:
boolean` and `gateway.ts` switches on that instead of `spec.poNumber`.
- Idempotency, the `pay:<uuid>` tag, the sanity check, the mismatch log, and
  the `quoted → deposit_invoiced` conditional advance are all unchanged.

### 6.3 Status machine — unchanged

`quoted → deposit_invoiced → deposit_paid → balance_invoiced → paid` stays
exactly as it is, and so do the `kind` values `'deposit'` / `'balance'`.
These are internal ledger terms and renaming them would mean a data
migration on live rows for no customer benefit. `deposit_paid` now means
"paid in full, awaiting samples"; the admin UI renders every status through
a label map so the lab team never reads the stale word.

## 7. Copy

### 7.1 The disclosure

Directly under the pay button — not a footer, not a terms link:

> Pay in full to lock your rate and reserve lab capacity. Your quoted
> per-sample rate is held for this project. Send fewer samples than quoted
> and the unused amount stays as credit toward another project for 12
> months; send more and we invoice the difference at the same rate.

### 7.2 `/terms`

There is no terms page on the site. A no-refund policy needs one. New
`src/pages/terms.astro` covering: what the payment buys, the rate lock, the
credit and its 12-month expiry, turnaround, academic eligibility, and data
deposit/embargo. Linked from the pay panel, the footer, and both emails.

### 7.3 Emails

- **Customer quote email** (`api/quote.ts`): closes on the pay CTA and the
  §7.1 disclosure. Shows one total when `audience` is known, both when it
  is not. The `needs_conversation` branch is unchanged.
- `depositPaidCustomerEmail` → **`paymentReceivedCustomerEmail`**: "Paid in
  full", rate-lock and credit sentences, shipping instructions within 2
  business days.
- `depositPaidLabEmail` → **`paymentReceivedLabEmail`** (subject
  `[paid] …`).
- **New `projectSettledWithCreditEmail`**: the `balanceCents <= 0` branch
  sends nothing today. It must tell the customer the project settled, what
  their credit is, and when it expires.
- `balancePaidCustomerEmail` stays, reframed as additional samples received.

### 7.4 Marketing copy

`pricing.astro:91,104`, `services.astro:115,150,187`, `README.md:66` all
advertise the 50% deposit. All become pay-in-full.

## 8. Customer quote page and admin

- `panelView` `offer` gains `audience` and `needsAttestation`; it shows a
  single amount when `quote.audience` is set and both when it is null
  (legacy quotes). Copy becomes "Pay in full".
- `panelView` `paid` gains `creditCents` / `creditExpiresAt`, rendered as
  "$1,240 credit toward a future project, valid until 2027-08-22".
- Admin: status label map; `?refund=` becomes `?credit=`; the balance
  preview shows the capped rate per line and flags uncapped lines; the
  "Refund $X in Shopify" instruction becomes "Credit $X recorded — no
  refund is issued".

## 9. Backward compatibility

The payment rail is deployed and at least one customer has used it. Every
change must tolerate live rows:

- Quotes with `audience = null` → panel shows both rates, as today.
- A **paid 50% deposit** on an existing quote → its `amount_cents` is
  credited by `computeBalance` unchanged, and the balance comes back
  positive. Works today, works after.
- The rate lock (§4.2) applies to legacy quotes too. It can only reduce what
  a customer owes, so it is safe to apply universally.
- `POST /api/quote/[token]/deposit` keeps working (§6.2).

**No migration.** Every column this design needs already exists.

## 10. Testing

- Unit: `paymentLines` bills 100%; `assertPaymentSane` rejects a 50% figure;
  `computeBalance` caps the rate (under-ship never yields a positive
  balance), keeps the dead-zone win, leaves unmatched lines uncapped;
  `creditFrom` returns null for every non-credit row shape; `panelView`
  single vs dual audience; each email builder.
- Widget unit: rate selector switches the rendered total; the attestation
  field appears only for academic; the three CTAs are present.
- E2E: `tests/e2e/quote.spec.ts:105–151` (deposit-panel tests) and
  `tests/e2e/payments.spec.ts:48` ("advertise the online deposit") are
  rewritten, not deleted. New: paying chains both posts with a stubbed
  `/api/quote` and a stubbed pay endpoint; the invoice intent lands back on
  the quote page instead of redirecting out.

## 11. Interaction with the conversion-optimization plan

`docs/superpowers/plans/2026-08-22-conversion-optimization.md` is written
but unimplemented (no migration 0008, no `source` on `QuoteRecord`).

- **Task 2** (deposit-first quote email) — superseded by §7.3.
- **Task 4** ("pay a 50% deposit to start" assurance copy) — superseded by
  §7.1.
- **Task 3** (GA4 funnel events) — survives, but `deposit_continue` becomes
  `begin_checkout` with the full amount as `value`.
- **Tasks 1 and 5** (source attribution, homepage CTA) — unaffected.

## 12. Out of scope

- Automated credit redemption (manual discount on the next draft order).
- Any 50% deposit UI. Deposits are arranged by hand in Shopify.
- Refunds. Staff can still refund in Shopify if they choose; nothing in the
  product offers it.
- Renaming the `deposit` / `balance` ledger values (§6.3).
