# Conversion Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move visitors toward the deposit: persist quote attribution (`source`), instrument the configurator funnel with GA4 events, rewrite the customer quote email around the pay-deposit CTA, add payment-assurance copy beside the widget, and give the homepage a commercial CTA.

**Architecture:** Five independent, small changes to existing flows. No new services. The widget stays self-contained (events fire only when the host page already has `gtag`); the API gains one persisted column; the email change lives in `handleQuote`.

**Tech Stack:** Existing — Astro/Workers, Supabase REST, zod, the widget bundle, GA4 property `G-WYL7J2D7SG` (already loaded by `BaseLayout` on biokea.ai and by the games).

**Spec:** none — decisions are recorded here. Explicitly out of scope (user decision 2026-08-22): any follow-up automation on unpaid quotes/invoices. Also out of scope: SEO content, subscriber announcement copy, Google Merchant listings (human/content work).

## Global Constraints

- `source` values: `^[a-z0-9-]{1,32}$`, nullable; expected values today `site`, `store` (the widget already sends them — `src/widget/quote-widget.ts:102,274`).
- GA4 events (exact names/params): `quote_widget_engaged` `{ source }` fired once per mount on first user input; `quote_created` `{ source, currency: 'USD', value: <commercial total dollars> }`; `deposit_continue` `{ source, currency: 'USD', value: <deposit dollars> }` on the deposit form submit. Fire via `window.gtag?.(…)` — never inject gtag from the widget; absent gtag → silent no-op.
- The quote email's deposit CTA appears only when `paymentsEnabled` is true AND the quote is not `needsConversation`; link is `${url}#pay`.
- Widget `data-*` hooks unchanged; `tests/e2e/quote.spec.ts` existing tests must pass untouched.
- Prettier + `astro check` + `npm run lint` + `npm test` + `npx playwright test` green before each commit; commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Bump `src/data/version.ts` + `package.json` to `1.1.0` in the widget task (T3) so the `?v=` cache-buster picks up the new bundle (both files must stay equal — the unit test enforces it).

---

### Task 1: Persist quote `source` (migration 0008, API, lab email, admin)

**Files:**

- Create: `migrations/0008_quote_source.sql`
- Modify: `src/pages/api/quote.ts`, `src/lib/payments/types.ts` (`QuoteRecord.source`), `src/lib/email/quote-payments.ts` (`labBody` line), `src/pages/admin/index.astro` (source column), `src/pages/admin/quotes/[number].astro` (header line)
- Test: `tests/unit/quote-api.test.ts`, `tests/unit/quote-payments-email.test.ts`

**Interfaces:**

- Produces: `QuoteRecord.source: string | null`; the quotes insert row includes `source`; lab notification lines include `Source: <source or —>`.

- [ ] **Step 1: Migration**

```sql
-- 0008_quote_source.sql
-- Where the quote was configured: 'site' (biokea.ai/quote) or 'store'
-- (store.biokea.ai product pages). Sent by the quote widget since v1.0;
-- persisted for conversion attribution. Nullable: pre-existing rows and
-- non-widget clients have no source.
alter table public.quotes
  add column if not exists source text
    check (source is null or source ~ '^[a-z0-9-]{1,32}$');
```

- [ ] **Step 2: Failing tests** — in `tests/unit/quote-api.test.ts`: `validBody` gains `source: 'store'`; assert the Supabase insert body (captured by the fetch mock) contains `source: 'store'`; a body without `source` inserts `source: null`; `source: 'BAD*'` → 400. In `tests/unit/quote-payments-email.test.ts`: the `quote` fixture gains `source: 'store'`; `depositPaidLabEmail(...).text` contains `Source: store`; with `source: null` contains `Source: —`.
- [ ] **Step 3: Implement** — `QuoteSchema` gains `source: z.string().regex(/^[a-z0-9-]{1,32}$/).optional()`; the insert `row` gains `source: parsed.data.source ?? null`; `QuoteRecord` gains `source: string | null`; `labBody` adds `` `Source: ${q.source ?? '—'}`, `` after the `Rate:` line; admin index table adds a muted `source` next to the status cell; admin quote page header line appends `· source {quote.source ?? '—'}`. The two `.astro` fixtures/tests in `tests/unit/payments-panel.test.ts` etc. need `source: null` added to `QuoteRecord` literals (compiler will list them).
- [ ] **Step 4: Verify + commit** — `npx vitest run tests/unit && npm run check`; commit `feat(quotes): persist widget source for attribution (migration 0008); surface in lab email + admin`.
- [ ] **Step 5: HUMAN** — apply `0008` in Supabase SQL Editor (safe anytime; column is nullable).

---

### Task 2: Quote email sells the deposit

**Files:**

- Modify: `src/pages/api/quote.ts` (customer email `text` in `handleQuote`)
- Test: `tests/unit/quote-api.test.ts`

**Interfaces:**

- Consumes: `opts.paymentsEnabled` (already threaded), `quote.needsConversation`, `url`.

- [ ] **Step 1: Failing tests** — capture the customer-email Resend payload in the existing fetch mock and assert: with `paymentsEnabled: true` and a non-conversation quote, the text contains `Start your project now — pay the 50% deposit online:` and `${url}#pay` and `purchase-order / Net-30`; with `paymentsEnabled: false` it contains none of those and keeps `Reply to this email to start a project.`; with a conversation-band quote (5,000+ count) it keeps the existing follow-up sentence and no deposit CTA.
- [ ] **Step 2: Implement** — replace the closing block of the customer email text with:

```ts
const closing = quote.needsConversation
  ? `Because of the volume involved, we'll follow up to confirm scheduling and final pricing before anything is committed.`
  : opts?.paymentsEnabled
    ? [
        `Start your project now — pay the 50% deposit online:`,
        `${url}#pay`,
        ``,
        `Card, Shop Pay, and PayPal are accepted. Paying for an institution?`,
        `Enter your purchase-order number on the payment page for a purchase-order / Net-30 invoice.`,
        `The balance is invoiced on the actual counts we receive — you never pay for specimens that don't arrive.`,
        ``,
        `Quote valid for 30 days.`,
      ].join('\n')
    : `Quote valid for 30 days. Reply to this email to start a project.`;
```

and use `closing` in the `text` array (replacing the current ternary line).

- [ ] **Step 3: Verify + commit** — tests + check; commit `feat(quotes): customer quote email leads with the online-deposit CTA (with PO/Net-30 path)`.

---

### Task 3: Funnel events in the widget

**Files:**

- Modify: `src/widget/quote-widget.ts`, `src/data/version.ts` + `package.json` (→ 1.1.0)
- Test: `tests/e2e/quote.spec.ts` (one new test), `tests/unit/version.test.ts` (passes by bumping both)

**Interfaces:**

- Produces: the three GA4 events from Global Constraints, via a tiny helper:

```ts
function track(event: string, params: Record<string, unknown>): void {
  try {
    (window as { gtag?: (...a: unknown[]) => void }).gtag?.('event', event, params);
  } catch {
    /* analytics must never break the widget */
  }
}
```

- [ ] **Step 1: Failing e2e** — new test in `tests/e2e/quote.spec.ts`: `page.addInitScript(() => { (window as any).__ga = []; (window as any).gtag = (...a: any[]) => (window as any).__ga.push(a); })`; load `/quote`; type into `[data-count-input="barcoding"]` → `__ga` contains one `['event','quote_widget_engaged',{source:'site'}]` (and only one after further input); stub `/api/quote` (same route-stub pattern as the deposit-invalidation test) and submit the form → `__ga` contains `['event','quote_created',{source:'site',currency:'USD',value:<number>}]`; submit the deposit form (intercept the POST with `page.route` fulfilling a 303 → about:blank is fine, or just assert the event fired before navigation via `deposit_continue` in `__ga`).
- [ ] **Step 2: Implement** — add `track()`; call `track('quote_widget_engaged', { source })` once (boolean latch) from the first `input` listener invocation; `track('quote_created', { source, currency: 'USD', value: quote.total.commercial })` in the submit-success branch (before revealing the deposit panel); `track('deposit_continue', { source, currency: 'USD', value: depositCents / 100 })` in the deposit form's submit listener. Bump version files to `1.1.0`.
- [ ] **Step 3: Verify + commit** — `npm run widget:build && npx vitest run tests/unit && npx playwright test tests/e2e/quote.spec.ts tests/e2e/widget.spec.ts && npm run check`; commit `feat(widget): GA4 funnel events (engaged/created/deposit) when the host page has gtag; v1.1.0`.
- [ ] **Step 4: Note in report** — store.biokea.ai fires these only if GA is added to the Shopify theme; add one line to `docs/shopify/STORE-SETUP.md` (§8): "Optional: add the same GA4 tag (`G-WYL7J2D7SG`) to the theme (Online Store → Preferences → Google Analytics, or a `theme.liquid` snippet) — the quote widget then reports funnel events from the store too."

---

### Task 4: Payment-assurance copy beside the widget

**Files:**

- Modify: `src/widget/template.ts` (fine-print block), `src/widget/quote.css` (if a class is needed)
- Test: `tests/unit/widget-template.test.ts`

- [ ] **Step 1: Failing test** — `renderWidgetHtml(...)` output contains `you never pay for specimens that don't arrive` and `mailto:contact@biokea.ai`.
- [ ] **Step 2: Implement** — in the summary panel's fine-print paragraph (the existing "Turnaround is typically 4–8 weeks…" block), extend to:

```
Turnaround is typically 4–8 weeks from sample receipt. Pay a 50% deposit to
start; the balance is invoiced on the actual counts we receive — you never
pay for specimens that don't arrive. Questions?
<a class="bk-link" href="mailto:contact@biokea.ai">contact@biokea.ai</a>.
```

(escaped/joined per the file's existing style; add `.bk-link { color: var(--color-teal, #0f766e); text-decoration: underline; }` if no link style exists).

- [ ] **Step 3: Verify + commit** — template tests + `npm run widget:build` + quote e2e; commit `feat(widget): payment-assurance fine print + contact escape hatch`. (Version already bumped in T3 if same deploy; if this task ships separately, bump to 1.1.1.)

---

### Task 5: Homepage commercial CTA

**Files:**

- Modify: `src/pages/index.astro`
- Test: `tests/e2e/home.spec.ts`

- [ ] **Step 1: Failing test** — home page has a visible link to `/quote` with text matching `/instant.*quote/i` in the hero region; the existing home tests keep passing (read them first — update any assertion pinned to the old primary CTA label/href).
- [ ] **Step 2: Implement** — `Hero` props change: `ctaPrimary={{ href: '/quote', label: 'Get an instant sequencing quote' }}`, `ctaSecondary={{ href: '/lab', label: "See what we're building" }}` (the partnership "Schedule a call" stays available in the closing `CtaBand` and `/contact`). Do not restructure the Hero component.
- [ ] **Step 3: Verify + commit** — `npx playwright test tests/e2e/home.spec.ts && npm run check`; commit `feat(home): hero leads with the instant-quote CTA`.

---

## Self-review

- Excluded per user decision: follow-up automation (and the aging-invoice cron), SFEI references anywhere, SEO/announcement content.
- Order matters only for T3/T4 (both touch the widget + version bump); run T3 before T4 or combine their version bump.
- T1's `QuoteRecord` change ripples into test fixtures — the compiler enumerates them; no behavioural change.
- All five tasks are independently shippable; one deploy at the end covers all.
