# Quote calculator + lead capture — design

**Date:** 2026-08-16
**Context:** First slice of a larger "sell sequencing services online" effort
(Stripe checkout, sample intake, customer portal). See §9 for the full
decomposition and why this slice comes first.

## 1. Goal

An interactive project configurator at `/quote` that turns "what would this
cost?" into a firm, retrievable, PO-ready quote — without moving any money.
Optimized to drive real sequencing engagements: transparent pricing, no
gating, and active nudges toward volume tiers that are cheaper for the
customer and larger for BioKEA.

## 2. Why this slice first

Taking payments forces tax determination, terms of service, refund policy,
and sample-intake logistics to all be settled up front. This slice moves no
money, so none of that blocks it. It also produces the data needed to set
payment thresholds later: what order sizes people actually configure, and
what the academic/commercial split looks like.

## 3. Blocking findings from the current pricing data

### 3.1 Tier boundaries overlap (must fix)

`src/data/pricing.ts` currently defines tiers whose boundaries belong to two
tiers at once: `1–300` and `300–1,000` both claim 300; `1,000–5,000` and
`5,000+` both claim 5,000. A naive lookup resolves 5,000 specimens to the
$10 rate ($50,000) instead of the $6 rate ($30,000) — a $20,000 ambiguity.

**Decision:** the better tier starts at the boundary.

| Service   | Corrected tiers                                               |
| --------- | ------------------------------------------------------------- |
| Barcoding | 1–299 @ $16 · 300–999 @ $12 · 1,000–4,999 @ $10 · 5,000+ @ $6 |
| eDNA      | 1–48 @ $165 · 49–199 @ $130 · 200+ @ $115                     |

Rates are unchanged; only the range labels change. This is a visible copy
change to the live `/pricing` page.

### 3.2 Flat tiers create dead zones

Because a flat tier applies its rate to _every_ unit, each boundary has a
band where ordering more costs less in absolute dollars:

| Service   | Dead zone   | Example                                  |
| --------- | ----------- | ---------------------------------------- |
| Barcoding | 226–299     | 299 costs $4,784; 300 costs $3,600       |
| Barcoding | 834–999     | 999 costs $11,988; 1,000 costs $10,000   |
| Barcoding | 3,001–4,999 | 4,999 costs $49,990; 5,000 costs $30,000 |
| eDNA      | 39–48       | 48 costs $7,920; 49 costs $6,370         |
| eDNA      | 177–199     | 199 costs $25,870; 200 costs $23,000     |

**Marginal/bracket pricing was evaluated and rejected for this slice.**
Applying the same published rates as brackets raises prices sharply (5,000
specimens: $30,000 → $53,200, +77%; 10,000: $60,000 → $83,200, +39%),
because brackets only apply the low rate to units _above_ the threshold.
Landing near today's totals would require re-deriving every bracket rate
against the cost model, and the $6 tier is already documented as near-cost
(~$6.26/specimen). That is a pricing exercise for Michelle, not a
calculator feature. Revisit separately if desired.

**Decision — hybrid handling:**

- **Small boundaries** (226–299, 834–999, 39–48, 177–199): auto-apply the
  best achievable price and explain it. Each costs $800–$1,050, cheap
  insurance against displaying an irrational quote next to a public rate
  card.
- **Barcoding 3,001–4,999**: do _not_ auto-quote. Costs $10,000 in
  forgone billing _and_ entitles the customer to send up to 1,000 more
  specimens — roughly $6,260 of real consumables and flow-cell time at
  modeled cost, so ~$16,000 of combined exposure. Show an indicative range
  and route to a conversation, which also gets a capacity check on the
  largest orders.

### 3.3 Multi-marker eDNA is not computable (must fix)

`pricing.ts` states each additional marker "typically adds $10–13/sample
(academic) or $13–16/sample (commercial)" — a range. A configurator cannot
turn that into a total.

**Decision:** pin a fixed per-marker add-on for each audience in
`pricing.ts`.

**Proposed provisional values: $12/sample academic, $15/sample
commercial.** These sit inside both published ranges and preserve the
documented ~25% commercial premium exactly ($12 × 1.25 = $15). They ship
marked provisional in a code comment until Michelle confirms them against
the cost model. The `/pricing` add-on note changes from a range to these
firm numbers.

## 4. Page structure

**New `/quote`** — the interactive configurator. `/pricing` remains the
browsable rate card (valuable for search traffic on queries like "eDNA
metabarcoding cost") and gains a prominent CTA into `/quote`. The two
priced rows on `/services` link there as well.

**Core principle: never gate the number behind a form.** The total updates
live as the visitor configures. Email capture is offered _after_, to
produce a formal quote document. Gating price behind a lead form would
contradict a company that just published its full rate card.

### 4.1 Inputs (left column)

- **Service** — Barcoding, eDNA metabarcoding, or **both**. A combined
  project is a first-class path, since `/pricing`'s comparison table
  already tells visitors many programs run both.
- **Count** — numeric input paired with a slider. The slider must use
  non-linear steps; on a linear 1–5,000 scale the 1–300 range collapses
  into an unusable sliver.
- **Markers** (eDNA only) — first marker included, each additional at the
  pinned add-on rate.
- No audience toggle — academic and commercial rates display side by side,
  mirroring `/pricing`. This avoids introducing the self-attestation
  problem in a phase where no money moves.

### 4.2 Live summary (right column, sticky)

Shows both audience totals, the per-unit rate, which tier applied,
turnaround ("typically 4–8 weeks from sample receipt"), and the existing
`included` checklist from `pricing.ts`.

The nudge has **two states that must never be conflated**:

| Situation                        | Framing                                   | Example                                                                                                                  |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Dead zone (auto-applied)         | "Save" — literally true                   | 900 specimens → "Priced at our 1,000-specimen rate: $10,000, down from $10,800. You can send 100 more at no extra cost." |
| Near next tier (not a dead zone) | "More volume, better rate" — never "save" | 600 specimens → "400 more specimens costs $2,800 more, but drops your rate from $12 to $10."                             |

At 600 specimens the next tier costs _more_ in total, so "save" would be
false. These two cases partition exactly: "save" wording is provably only
ever true inside a dead zone, so the engine gates that wording on precisely
that condition.

### 4.3 Call to action

- **Normal orders:** "Email me this quote" → short form (name, email,
  organization, optional note) → generates a quote number, persists, emails
  a link. The configuration itself is the qualification, so the form stays
  short.
- **Conversation band:** CTA becomes "Request a project quote," showing an
  indicative range rather than a firm total.

  **The band is exactly `barcoding ≥ 3,001 specimens`** — one rule, chosen
  because it covers both problems at once: the expensive 3,001–4,999 dead
  zone, and every order large enough that committing to a price without a
  sequencing-queue check would be reckless. Below 3,001, barcoding quotes
  firmly. eDNA quotes firmly at every size, since all of its dead zones are
  in the cheap-to-absorb band and no eDNA volume approaches the same
  capacity risk.

## 5. Architecture

### 5.1 Pricing engine — `src/lib/pricing/quote.ts`

Pure functions, no I/O:

- `rateFor(service, count)` — the applicable unit rate
- `bestPrice(service, count, audience)` — total, applied tier, and any
  free-headroom upgrade
- `needsConversation(service, count)` — conversation-band detection
- `quoteFor(config)` — assembles a full multi-service quote

**The same module runs client-side and server-side.** The browser uses it
for live updates; the API re-computes with it before persisting. A
client-supplied total is never trusted — otherwise a user could edit the
DOM and email themselves a $1 quote carrying a real quote number.

### 5.2 API — `src/pages/api/quote.ts`

POST endpoint following the established `contact.ts` / `subscribe.ts`
pattern: zod validation, honeypot field, optional Turnstile, `prerender =
false`, runtime env via `cloudflare:workers`. Recomputes price server-side,
allocates a quote number, persists to Supabase, sends the email via Resend.

### 5.3 Persistence — `migrations/0005_quotes.sql`

A `quotes` table storing the configuration (service, count, markers),
both audience totals, applied tier, status, and a validity date.

**Two identifiers, deliberately:**

- `quote_number` — human-readable (`BK-2026-0142`), for PO requisitions.
  Allocated from a Postgres sequence so it is unique under concurrency.
- `access_token` — unguessable random UUID, used in the URL.

Sequential numbers in a retrieval URL would let anyone enumerate other
customers' quotes. RLS mirrors the `subscribers` table: anonymous insert
permitted via the API route, no anonymous select.

### 5.4 Retrievable quote — `/quote/<access_token>`

A print-styled page rendering the quote's line items, totals, quote number,
and validity date. This replaces server-side PDF generation, which is
painful on the Cloudflare Workers runtime; institutional buyers print to
PDF from the browser, and the link stays live and shareable. The page shows
organization and line items — not the submitter's email.

### 5.5 Client interactivity

Vanilla JS in an Astro `<script>` (bundled, so it can import the shared
pricing engine), consistent with how `Nav.astro`, the leaderboard, and the
contact form already work. No framework island is added to a codebase that
has none.

## 6. Data changes — `src/data/pricing.ts`

- Correct every tier's `minQty`/`maxQty` so no count belongs to two tiers
  (§3.1), and update the displayed `range` labels to match.
- Add `additionalMarkerPrice: { academic: number; commercial: number }` to
  the metabarcoding entry, replacing the range in `addonNote`.
- Add a `conversationThreshold` to the barcoding entry (3,001), above which
  the configurator shows an indicative range instead of a firm quote.
  eDNA has none.

`/pricing` re-renders from this data, so its tier labels and add-on note
update automatically.

## 7. Testing

**Pricing engine (heaviest coverage — bugs here cost real money):**

- Every boundary: 299/300, 999/1,000, 4,999/5,000, 48/49, 199/200
- Every dead-zone entry and exit
- Multi-marker math, both audiences, combined multi-service quotes
- Conversation-band detection
- Two invariants asserted directly:
  - `bestPrice(n) ≤ literalPrice(n)` for all n
  - **`bestPrice` is monotonically non-decreasing in n** — ordering more
    must never cost less. This single property makes dead zones
    structurally impossible to reintroduce.

**API:** a tampered client-supplied total is ignored in favor of the
server recomputation; zod validation and honeypot behavior, mirroring
`tests/unit/contact-form.test.ts`.

**e2e (`tests/e2e/quote.spec.ts`):** page renders; changing the count
updates the total live; the dead-zone callout fires at the correct counts
and not outside them; "save" wording never appears outside a dead zone;
the CTA swaps in the conversation band; quote submission returns a number;
the retrievable quote page renders for a valid token and 404s otherwise.

**Existing suites:** `/pricing` e2e assertions covering tier labels need
updating for the corrected ranges. Nav and footer tests gain a `/quote`
entry.

## 8. Open item for BioKEA

The pinned per-marker add-on (§3.3 — proposed $12 academic / $15
commercial) needs Michelle's confirmation against the cost model before
this page is considered final. It ships marked provisional in the
meantime, so implementation is not blocked. Everything else in this slice
is derivable from already-approved figures.

## 9. Decomposition — where this sits

Full effort, in recommended order:

1. **Quote calculator + lead capture** ← this spec
2. Order + sample-intake backbone (manifests, chain of custody, box
   barcodes) — the piece the lab cannot operate without
3. Self-serve Stripe checkout for small orders
4. Quote → PO → invoice → net terms for institutional buyers
5. Customer order portal (status, results delivery)

**Explicitly out of scope here:** Stripe and all payments, sample intake,
academic verification, tax determination, capacity/queue checks beyond
routing large orders to a human, order portal, recurring
monitoring-program pricing.

### 9.1 Constraints already identified for the payments slices

Recorded now so they are not rediscovered later:

- **Card authorizations expire in ~7 days**, but turnaround is 4–8 weeks
  from sample receipt. "Authorize now, capture on delivery" is not
  viable — the options are pay-upfront, deposit + balance, or
  `SetupIntent` plus an off-session charge once samples pass QC.
- **The final price is not knowable at checkout.** A customer estimating
  800 specimens may ship 743, which can change both the total and the
  tier. Any first charge is an estimate and needs a documented true-up
  path in both directions.
- **Fees invert at scale.** ~$870 on a $30,000 card payment versus ~$5
  over ACH. Above roughly $5–10k, card is the wrong rail.
- **Payment method tracks institution type, not order size.** A
  university spending $800 often cannot use a card (PO, W-9, net-30,
  quote number on the requisition); a consultancy spending $25,000 may
  prefer one. Size and rail are independent axes.
- **Academic pricing is a 25% discount on self-attestation**, with no
  verification today.
- **Capacity is finite** — one PromethION 2. Self-serve purchase of a
  5,000-specimen project with no queue check would oversell the lab.
- **Tax is unresolved.** California services are generally untaxed, but
  shipped sampling kits are tangible personal property; international
  orders add permits, CITES, and VAT.
