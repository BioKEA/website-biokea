# Pay-in-full — pre-deploy verification

One-time human checklist for the pay-in-full pivot (spec:
`docs/superpowers/specs/2026-08-22-pay-in-full-checkout-design.md`). Nothing
here can be automated: it exercises the real Shopify Admin API, real draft
orders, and real Resend delivery.

**Run this before pushing.** `main` carries the whole pivot unpushed, and
pushing auto-deploys. `platformProxy` is enabled in `astro.config.mjs`, so
`npm run dev` reads `.dev.vars` and talks to the **real** store — you can
check everything below against production Shopify without deploying the
site.

## 0. Setup

```bash
cp .dev.vars.example .dev.vars     # then fill in the real values
npm run dev                        # http://localhost:4321
```

`.dev.vars` is gitignored. You need `SUPABASE_*`, `RESEND_*`, `CONTACT_*`,
`SHOPIFY_CLIENT_ID`/`SHOPIFY_CLIENT_SECRET`, and `CF_ACCESS_DEV_EMAIL` (the
`/admin` bypass — without it step 5 is unreachable and one Playwright test
skips itself).

**Confirm Shopify Payments is still in test mode** before paying anything
(Settings → Payments). If it is, use Shopify's documented test card. If it
is not, use a small real quote — one barcoding specimen is $20 commercial —
and refund yourself afterwards.

## 1. One price, one button

- `/quote` → the summary panel shows **one** total with a rate selector,
  defaulting to **Commercial**, and the academic rate as a muted line under
  it. Two competing totals is the bug this pivot fixed.
- Switch to Academic → the headline total changes and the attestation
  checkbox appears once you open the details form.
- Untick every service → the CTAs and the credit disclosure disappear.
  A "Pay $0 and start" button is a regression.
- Set barcoding to 3,001+ → CTAs collapse to "Request a project quote →"
  with no pay button and no disclosure. Those quotes have no firm price.

## 2. Pay in full (the main path)

Configure a small quote, Commercial, click **Pay $X and start →**, fill in
the details, submit.

- [ ] You land on **Shopify checkout** for the **full** amount — not half.
- [ ] The Shopify draft order has **no payment terms** attached (due on
      receipt). Admin → Orders → Drafts → the order → Payment terms.
- [ ] The quote email arrived and its closing sells paying, states the
      12-month credit rule, and never says "deposit".

## 3. Academic attestation

- [ ] Academic rate, attestation left unticked → submitting is **blocked in
      the widget** with a visible message. You should never reach Shopify
      and then get bounced to an error page.
- [ ] Tick it → checkout proceeds.

## 4. Purchase order / Net-30

Same quote, click **"Paying by purchase order? Get a Net-30 invoice →"**,
enter a PO number.

- [ ] You land back on `/quote/<token>` with an "invoice sent" note — you
      are **not** redirected out to checkout.
- [ ] The invoice email arrived.
- [ ] The draft order **does** carry NET_30 terms and prints the PO number.
      If terms are missing, check the Worker logs for the
      `paymentTermsTemplate` error added in this branch — a renamed or
      absent NET_30 template now logs instead of silently falling back.

## 5. Settlement — the part worth the most attention

Shopify posts `orders/paid` to a **public** URL, so the webhook will not
reach localhost. Two options:

- run a tunnel (`cloudflared tunnel --url http://localhost:4321`) and point
  a temporary Shopify webhook at it; or
- skip the webhook and set the quote's `status` to `deposit_paid` and the
  payment row's `status` to `paid` directly in Supabase, then continue.

Then, in `/admin/quotes/<number>`, run the balance step with actual counts.

- [ ] **Fewer than quoted, on a quote that paid in full** → "credit
      recorded, valid 12 months. No refund is issued", and the customer gets
      a **credit** email naming the amount, the expiry, and the quote number.
- [ ] **Fewer than quoted, on a legacy 50%-deposit quote** → "refund … in
      Shopify" instead, and the customer gets a **refund** email. This is the
      split added after review: legacy customers keep the terms they agreed
      to. Worth testing explicitly if any legacy quotes are still open.
- [ ] **Exactly as quoted** → "Nothing further owed", no email at all.
- [ ] **More than quoted** → a balance invoice at the **locked** rate, or a
      better tier rate if the larger count earns one — never worse than the
      quoted per-unit rate.

## 6. Credit arithmetic spot-check

The one number worth checking by hand, because it is the promise `/terms`
makes. Quote **250** barcoding academic — the engine prices that as a
300-specimen block at $12 ($3,600, with 50 free) — then settle with **200**
actually shipped.

- [ ] Credit should be **$600**, not $1,200. (Shortfall 50 × $12. The
      earlier wording implied 200 × $12 and overstated it.)
- [ ] Settle a 250-quote with exactly **250** shipped → credit **$0**. If
      this ever shows a credit, the dead-zone bug is back.

## 7. After deploying

- [ ] `store.biokea.ai` product pages host the widget from the same bundle —
      confirm the new one loaded (`?v=1.1.0`) and that paying from the store
      origin still reaches Shopify checkout. That path is a cross-origin
      form post and is the one thing localhost cannot fully prove.
- [ ] Delete `src/pages/api/quote/[token]/deposit.ts` one release after
      widget 1.1.0 has rolled out. It exists only so cached store bundles
      posting to the old path keep working.
