# Pay-in-Full Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 50%-deposit, dual-price, "Email me this quote" flow with a single-price configurator whose primary CTA charges 100% up front by card, keeping an invoice/PO path and a quote-by-email path for institutional buyers.

**Architecture:** Five layers change in dependency order — pure money rules (`terms.ts`), the payment endpoint, the quote API, the widget, then the pages that render results. No database migration: every column needed already exists, and the negative `settled` balance row that `handleBalance` already writes _is_ the credit record.

**Tech Stack:** Astro v6 on Cloudflare Workers, Supabase REST (service role), Shopify Admin GraphQL Draft Orders, Resend, zod, vitest (unit), Playwright (e2e), framework-free widget bundle built by `vite build --config vite.widget.config.ts`.

**Spec:** `docs/superpowers/specs/2026-08-22-pay-in-full-checkout-design.md` — read it first. §4.2 in particular; the rate-lock formula has two failure modes that look like harmless simplifications.

## Global Constraints

- **No migration.** If you find yourself writing `migrations/0008_*.sql` for this plan, stop — the design needs no new columns. (`migrations/0008_quote_source.sql` belongs to a different, unimplemented plan; see "Interaction" below.)
- **The payment rail is deployed.** `origin/main` carries it and at least one real customer has used it. Every change must tolerate live rows: quotes with `audience = null`, and quotes with a **paid 50% deposit** whose `amount_cents` is half the total.
- **Ledger values are frozen.** `quote_payments.kind` stays `'deposit'`/`'balance'` and `quotes.status` stays `quoted → deposit_invoiced → deposit_paid → balance_invoiced → paid`. These are internal; renaming them means a data migration on live rows for no customer benefit. `deposit_paid` now _means_ "paid in full, awaiting samples", and the admin UI renders every status through a label map so staff never read the stale word.
- **The disclosure copy is contractual.** Verbatim, wherever it appears (widget pay panel, quote page pay panel, customer quote email):

  > Pay in full to lock your rate and reserve lab capacity. Your quoted per-sample rate is held for this project. Send fewer samples than quoted and the unused amount stays as credit toward another project for 12 months; send more and we invoice the difference at the same rate.

- `CREDIT_MONTHS = 12`. `INVOICE_DAYS_UNTIL_DUE = 30` (unchanged).
- Widget `data-*` attributes are contractual — `tests/e2e/quote.spec.ts` and `quote-widget.ts` address the widget through them. Adding hooks is free; renaming one means updating both.
- Bump `src/data/version.ts` **and** `package.json` to `1.1.0` together in Task 6 — `tests/unit/version.test.ts` asserts they are equal, and `?v=` is the widget's only cache-buster.
- Before every commit: `npx prettier --write` on touched files, then `npm run check && npm test`. Playwright (`npx playwright test`) where the task says so.
- Commit messages end with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

**Interaction with `docs/superpowers/plans/2026-08-22-conversion-optimization.md`** (written, unimplemented): its Task 2 (deposit-first quote email) and Task 4 (50%-deposit assurance copy) are **superseded** by Tasks 3 and 6 here — do not implement them. Its Task 3 survives with `deposit_continue` renamed to `begin_checkout`. Its Tasks 1 and 5 are unaffected.

---

### Task 1: Money rules — 100% payment, rate lock, credit

Pure functions. Everything downstream depends on these names, so do this first.

**Files:**

- Modify: `src/lib/payments/terms.ts`
- Modify (mechanical rename of call sites only, no behaviour change): `src/pages/api/quote/[token]/deposit.ts`, `src/lib/payments/panel.ts`, `src/widget/quote-widget.ts`, `src/pages/api/admin/quotes/[number]/balance.ts`, `src/pages/admin/quotes/[number].astro`
- Test: `tests/unit/payments-terms.test.ts`, `tests/unit/payments-balance.test.ts`

**Interfaces:**

- Produces:
  ```ts
  export const CREDIT_MONTHS = 12;
  export function paymentLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[];
  export function paymentTotalCents(lines: InvoiceLineSpec[]): number;
  export function assertPaymentSane(
    totalDollars: number,
    amountCents: number,
    lineCount: number,
  ): void;
  export function computeBalance(
    inputs: QuoteLineInput[],
    audience: Audience,
    deposit: DepositCredit,
    quotedLines: QuoteLine[],
  ): {
    actualTotalCents: number;
    balanceCents: number;
    lines: InvoiceLineSpec[];
    credit: { title: string; amountCents: number };
    actualLines: QuoteLine[];
    uncapped: string[];
  };
  export function creditFrom(p: PaymentRecord): { amountCents: number; expiresAt: string } | null;
  ```
- Removed: `DEPOSIT_FRACTION`, `depositLines`, `depositTotalCents`, `assertDepositSane`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/payments-terms.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import {
  CREDIT_MONTHS,
  assertPaymentSane,
  computeBalance,
  creditFrom,
  paymentLines,
  paymentTotalCents,
} from '@/lib/payments/terms';
import type { PaymentRecord } from '@/lib/payments/types';

const bar = (n: number) => buildQuote([{ serviceSlug: 'barcoding', count: n }]);

describe('paymentLines', () => {
  it('bills the whole quote, not half of it', () => {
    const q = bar(800); // academic: 300–999 tier @ $12 => $9,600
    expect(q.total.academic).toBe(9600);
    expect(paymentTotalCents(paymentLines(q.lines, 'academic'))).toBe(960000);
  });

  it('describes the line without the word deposit', () => {
    const [line] = paymentLines(bar(800).lines, 'academic');
    expect(line.description).toContain('800 specimens');
    expect(line.description).toContain('$12/specimen');
    expect(line.description).not.toMatch(/deposit/i);
  });
});

describe('assertPaymentSane', () => {
  it('accepts the full total', () => {
    expect(() => assertPaymentSane(9600, 960000, 1)).not.toThrow();
  });

  it('rejects a half-total left over from the deposit era', () => {
    expect(() => assertPaymentSane(9600, 480000, 1)).toThrow();
  });
});

// Spec §4.2. Each row is the whole reason the rate lock exists; if you are
// tempted to simplify the rule, one of these will catch you.
describe('computeBalance rate lock', () => {
  const paid = (cents: number) => ({
    amountCents: cents,
    invoiceLabel: 'order #1001',
    paidAt: '2026-09-02T10:00:00Z',
  });
  const settle = (quotedCount: number, actualCount: number) => {
    const quoted = bar(quotedCount);
    const prepaid = paymentTotalCents(paymentLines(quoted.lines, 'academic'));
    const r = computeBalance(
      [{ serviceSlug: 'barcoding', count: actualCount }],
      'academic',
      paid(prepaid),
      quoted.lines,
    );
    return { prepaid, settled: r.actualTotalCents, balance: r.balanceCents, uncapped: r.uncapped };
  };

  it('shipping exactly what was quoted owes and credits nothing', () => {
    const r = settle(800, 800);
    expect(r.settled).toBe(960000);
    expect(r.balance).toBe(0);
  });

  it('under-shipping credits at the LOCKED rate, beating the engine', () => {
    // engine would settle 250 at $3,600 (dead-zone buy-up to the 300 floor);
    // the locked $12 rate settles it at $3,000 — $600 more credit.
    const r = settle(800, 250);
    expect(r.settled).toBe(300000);
    expect(r.balance).toBe(-660000);
  });

  it('over-shipping still earns the better tier', () => {
    // 1,100 reaches the 1,000–4,999 tier at $10 => $11,000. The cap must NOT
    // clamp this back to the $9,600 they prepaid.
    const r = settle(800, 1100);
    expect(r.settled).toBe(1100000);
    expect(r.balance).toBe(140000);
  });

  it('a dead-zone quote shipped exactly gets NO spurious credit', () => {
    // 250 is priced as a 300-slot block ($3,600). Measuring the shortfall
    // against pricedCount instead of count would credit $600 here.
    const r = settle(250, 250);
    expect(r.settled).toBe(360000);
    expect(r.balance).toBe(0);
  });

  it('free headroom is honoured — 250 quoted, 300 shipped, nothing owed', () => {
    const r = settle(250, 300);
    expect(r.balance).toBe(0);
  });

  it('past the headroom, the extra is billed at the locked rate', () => {
    const r = settle(250, 320); // 20 past the 300 block @ $12 => $240
    expect(r.balance).toBe(24000);
  });

  it('when the engine beats the cap, the customer keeps the engine price', () => {
    const r = settle(250, 100);
    expect(r.settled).toBe(160000);
    expect(r.balance).toBe(-200000);
  });

  it('flags a line that matches nothing in the quote as uncapped', () => {
    const quoted = bar(800);
    const r = computeBalance(
      [
        { serviceSlug: 'barcoding', count: 800 },
        { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
      ],
      'academic',
      paid(960000),
      quoted.lines,
    );
    expect(r.uncapped).toEqual(['metabarcoding']);
  });

  it('treats a changed marker count as uncapped', () => {
    const quoted = buildQuote([{ serviceSlug: 'metabarcoding', count: 60, markers: 2 }]);
    const r = computeBalance(
      [{ serviceSlug: 'metabarcoding', count: 60, markers: 3 }],
      'academic',
      paid(1),
      quoted.lines,
    );
    expect(r.uncapped).toEqual(['metabarcoding']);
  });
});

describe('creditFrom', () => {
  const row = (over: Partial<PaymentRecord>): PaymentRecord =>
    ({
      id: 'p1',
      quote_id: 'q1',
      kind: 'balance',
      status: 'settled',
      amount_cents: -660000,
      currency: 'usd',
      provider: 'shopify',
      external_id: null,
      hosted_url: null,
      pdf_url: null,
      order_ref: null,
      external_order_id: null,
      due_at: null,
      paid_at: null,
      actual_lines: null,
      created_by: null,
      created_at: '2026-09-10T00:00:00Z',
      ...over,
    }) as PaymentRecord;

  it('turns a negative settled balance into a positive credit', () => {
    const c = creditFrom(row({}));
    expect(c).toEqual({ amountCents: 660000, expiresAt: '2027-09-10T00:00:00.000Z' });
  });

  it(`expires ${CREDIT_MONTHS} months out`, () => {
    expect(CREDIT_MONTHS).toBe(12);
  });

  it('is null for every non-credit shape', () => {
    expect(creditFrom(row({ amount_cents: 0 }))).toBeNull();
    expect(creditFrom(row({ amount_cents: 1000 }))).toBeNull();
    expect(creditFrom(row({ status: 'paid' }))).toBeNull();
    expect(creditFrom(row({ kind: 'deposit' }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/payments-terms.test.ts`
Expected: FAIL — `paymentLines`, `paymentTotalCents`, `assertPaymentSane`, `creditFrom`, `CREDIT_MONTHS` are not exported.

- [ ] **Step 3: Rewrite `src/lib/payments/terms.ts`**

Delete `DEPOSIT_FRACTION` and the `pct` constant. Replace `depositLines` / `depositTotalCents` / `assertDepositSane`, extract the shared line description, add the rate lock and `creditFrom`. Keep `usdCents` and `INVOICE_DAYS_UNTIL_DUE` as they are.

```ts
import type { InvoiceLineSpec, PaymentRecord } from './types';

export const INVOICE_DAYS_UNTIL_DUE = 30;
/** How long an under-shipping credit stays redeemable. Spec §4.3. */
export const CREDIT_MONTHS = 12;

const plural = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}s`;
const markerNote = (markers: number) => (markers > 1 ? ` × ${markers} markers` : '');

/** One description for both the payment invoice and the balance invoice —
 * they bill the same thing at the same rate, so they read the same. */
function lineDescription(l: QuoteLine, audience: Audience, rate: number, held: boolean): string {
  return (
    `${l.serviceTitle} — ${plural(l.count, l.unitLabel)}${markerNote(l.markers)}` +
    ` @ $${rate}/${l.unitLabel}, ${audience} rate` +
    (held ? ' (quoted rate held)' : '')
  );
}

/** The up-front invoice: 100% of the quote. Spec §4.1. One line per quote
 * line, each rounded independently, so the invoice's lines add up to its
 * total exactly. */
export function paymentLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[] {
  return lines.map((l) => {
    const p = l[audience];
    return {
      description: lineDescription(l, audience, p.effectiveRate, false),
      amountCents: Math.round(p.total * 100),
    };
  });
}

export function paymentTotalCents(lines: InvoiceLineSpec[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

/** Refuse to invoice an amount that isn't this quote's total — a guard
 * against a future pricing change silently producing nonsense invoices. */
export function assertPaymentSane(
  totalDollars: number,
  amountCents: number,
  lineCount: number,
): void {
  if (amountCents < 100) throw new Error(`Refusing payment under $1 (${amountCents} cents)`);
  const expected = totalDollars * 100;
  if (Math.abs(amountCents - expected) > lineCount) {
    throw new Error(`Payment ${amountCents} cents is not the ${totalDollars} dollar total`);
  }
}
```

Then `computeBalance` — read spec §4.2 before writing this:

```ts
export function computeBalance(
  inputs: QuoteLineInput[],
  audience: Audience,
  deposit: DepositCredit,
  quotedLines: QuoteLine[],
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  credit: { title: string; amountCents: number };
  actualLines: QuoteLine[];
  uncapped: string[];
} {
  const actual = buildQuote(inputs); // throws on bad input, same as /api/quote
  const uncapped: string[] = [];

  const lines: InvoiceLineSpec[] = actual.lines.map((l) => {
    const p = l[audience];
    const engineCents = Math.round(p.total * 100);
    // Matched on markers too: a different marker count is a different rate,
    // so there is nothing honest to hold it to.
    const quoted = quotedLines.find(
      (q) => q.serviceSlug === l.serviceSlug && q.markers === l.markers,
    );
    if (!quoted) {
      uncapped.push(l.serviceSlug);
      return {
        description: lineDescription(l, audience, p.effectiveRate, false),
        amountCents: engineCents,
      };
    }

    const lockedRate = quoted[audience].effectiveRate;
    // Against `count`, NEVER `pricedCount`: inside a dead zone the engine
    // buys up to the next tier floor and the extra units are advertised as
    // free headroom, so measuring against pricedCount would credit a
    // customer who shipped exactly what they quoted.
    const shortfall = Math.max(0, quoted.count - l.count);
    // Skipped when nothing is short, because over-shipping must be allowed
    // to RAISE the total — clamping there would sell 1,100 at the 800 price.
    const capCents =
      shortfall > 0
        ? Math.round(quoted[audience].total * 100) - Math.round(shortfall * lockedRate * 100)
        : engineCents;

    const held = capCents < engineCents;
    const amountCents = held ? capCents : engineCents;
    return {
      description: lineDescription(l, audience, held ? lockedRate : p.effectiveRate, held),
      amountCents,
    };
  });

  const actualTotalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  return {
    actualTotalCents,
    balanceCents: actualTotalCents - deposit.amountCents,
    lines,
    credit: {
      title: `Payment received (${deposit.invoiceLabel}, paid ${deposit.paidAt.slice(0, 10)})`,
      amountCents: deposit.amountCents,
    },
    actualLines: actual.lines,
    uncapped,
  };
}

/** The credit a settled, negative balance row represents. That row is the
 * whole credit ledger — there is no separate table. Spec §4.3. */
export function creditFrom(p: PaymentRecord): { amountCents: number; expiresAt: string } | null {
  if (p.kind !== 'balance' || p.status !== 'settled' || p.amount_cents >= 0) return null;
  const expires = new Date(p.created_at);
  expires.setUTCMonth(expires.getUTCMonth() + CREDIT_MONTHS);
  return { amountCents: -p.amount_cents, expiresAt: expires.toISOString() };
}
```

- [ ] **Step 4: Update every call site (mechanical — no behaviour change yet)**

The compiler enumerates them. Expect exactly these:

- `src/pages/api/quote/[token]/deposit.ts` — `depositLines` → `paymentLines`, `depositTotalCents` → `paymentTotalCents`, `assertDepositSane(total, amountCents, lines.length)` → `assertPaymentSane(...)`. Delete the `const pct = ...` line and change the `footer` string's `${pct} deposit toward` to `Payment for`.
- `src/lib/payments/panel.ts` — the two `depositTotalCents(depositLines(...))` calls become `paymentTotalCents(paymentLines(...))`.
- `src/widget/quote-widget.ts` — same rename in `revealDeposit`.
- `src/pages/api/admin/quotes/[number]/balance.ts` — pass the fourth argument: `computeBalance(form.inputs, quote.audience, {...}, quote.lines)`.
- `src/pages/admin/quotes/[number].astro` — same fourth argument on the preview call.

- [ ] **Step 5: Run the full unit suite**

Run: `npx vitest run tests/unit && npm run check`
Expected: PASS. `tests/unit/payments-balance.test.ts` exercises the old 50%-deposit fixture (`DEPOSIT = 480000`); it must still pass unchanged — that is the live-row compatibility check from Global Constraints.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/payments/terms.ts tests/unit/payments-terms.test.ts
git add -A src/lib/payments src/pages/api src/widget src/pages/admin tests/unit
git commit -m "$(cat <<'EOF'
feat(payments): bill 100% up front, hold the quoted rate on settlement

The up-front invoice becomes the full quote total (DEPOSIT_FRACTION is
gone). computeBalance now settles actual counts against the rate the
customer locked: a shortfall is credited at that rate, and the engine
price still wins whenever it is lower.

The shortfall is measured against the quoted `count`, not `pricedCount` —
inside a dead zone the engine buys up to the next tier floor and those
extra units are advertised as free headroom, so pricedCount would credit
someone who shipped exactly what they quoted.

creditFrom() reads the credit off the negative settled balance row that
handleBalance already writes. No new table, no migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The pay endpoint — `intent`, net terms, `/pay`

**Files:**

- Create: `src/lib/payments/pay.ts` (the handler, moved out of the route)
- Create: `src/pages/api/quote/[token]/pay.ts` (new route)
- Modify: `src/pages/api/quote/[token]/deposit.ts` (becomes a deprecated alias)
- Modify: `src/lib/payments/gateway.ts` (`netTerms` on `CreateInvoiceSpec`)
- Test: `tests/unit/payments-deposit.test.ts` (rename the describe blocks; keep the file name so history survives), `tests/unit/payments-gateway.test.ts`

**Interfaces:**

- Consumes: `paymentLines`, `paymentTotalCents`, `assertPaymentSane` (Task 1).
- Produces: `export async function handlePayment(request, token, deps: PaymentDeps): Promise<Response>` — same shape as today's `handleDeposit`, which it replaces. `CreateInvoiceSpec` gains `netTerms: boolean`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/payments-deposit.test.ts` (it already builds a `MemoryDb` + `MemoryGateway`; follow its existing `post()` helper):

```ts
it('intent=pay redirects to the Shopify checkout and asks for no net terms', async () => {
  const res = await handlePayment(post({ audience: 'commercial', intent: 'pay' }), TOKEN, deps());
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe('https://store.biokea.test/invoices/test-1');
  expect(gateway.created[0].netTerms).toBe(false);
});

it('intent=invoice attaches net terms and lands back on the quote page', async () => {
  const res = await handlePayment(
    post({ audience: 'commercial', intent: 'invoice', po_number: 'PO-77' }),
    TOKEN,
    deps(),
  );
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=invoiced#pay`);
  expect(gateway.created[0].netTerms).toBe(true);
  expect(gateway.created[0].poNumber).toBe('PO-77');
});

it('net terms no longer depend on a PO number', async () => {
  await handlePayment(post({ audience: 'commercial', intent: 'invoice' }), TOKEN, deps());
  expect(gateway.created[0].netTerms).toBe(true);
  expect(gateway.created[0].poNumber).toBeNull();
});

it('invoices the full total, not half of it', async () => {
  await handlePayment(post({ audience: 'academic', attest: 'true', intent: 'pay' }), TOKEN, deps());
  const total = gateway.created[0].lines.reduce((s, l) => s + l.amountCents, 0);
  expect(total).toBe(Math.round(quoteFixture.total_academic * 100));
});

it('accepts an attestation already recorded on the quote', async () => {
  db.quotes[0].audience = 'academic';
  db.quotes[0].academic_attested_at = '2026-08-22T00:00:00Z';
  const res = await handlePayment(post({ intent: 'pay' }), TOKEN, deps());
  expect(res.status).toBe(303);
  expect(res.headers.get('location')).toContain('store.biokea.test');
});

it('still bounces an academic rate with no attestation anywhere', async () => {
  const res = await handlePayment(post({ audience: 'academic', intent: 'pay' }), TOKEN, deps());
  expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=attest&audience=academic#pay`);
});
```

Add to `tests/unit/payments-gateway.test.ts`:

```ts
// `fakeShopify` and `okAnswers` already exist in this file — reuse them.
it('attaches payment terms on netTerms even with no PO number', async () => {
  const s = fakeShopify(okAnswers);
  await shopifyGateway(cfg, s.fetch).createInvoice({
    ...spec2,
    netTerms: true,
    poNumber: null,
  });
  const create = s.calls.find((c) => c.op === 'draftOrderCreate')!;
  expect(create.variables.input.paymentTerms).toMatchObject({
    paymentTermsTemplateId: 'gid://shopify/PaymentTermsTemplate/3',
  });
});

it('attaches no terms without netTerms, even when a PO number is present', async () => {
  const s = fakeShopify(okAnswers);
  await shopifyGateway(cfg, s.fetch).createInvoice({
    ...spec2,
    netTerms: false,
    poNumber: 'PO-77',
  });
  const create = s.calls.find((c) => c.op === 'draftOrderCreate')!;
  expect(create.variables.input.paymentTerms).toBeUndefined();
  // The PO still travels as a custom attribute for the invoice to print.
  expect(create.variables.input.customAttributes).toContainEqual({
    key: 'po_number',
    value: 'PO-77',
  });
});
```

Every other `CreateInvoiceSpec` literal in this file needs `netTerms` added — the compiler lists them.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/payments-deposit.test.ts`
Expected: FAIL — `handlePayment` is not exported.

- [ ] **Step 3: Move the handler and add `intent`**

Move the whole body of `handleDeposit` from `src/pages/api/quote/[token]/deposit.ts` into `src/lib/payments/pay.ts`, rename it `handlePayment`, rename `DepositDeps` → `PaymentDeps`, and change:

```ts
const FormSchema = z.object({
  // Optional: the widget now records the audience on the quote at creation
  // time, so a form that omits it falls back to quote.audience.
  audience: z.enum(['academic', 'commercial']).optional(),
  attest: z.string().optional(),
  intent: z.enum(['pay', 'invoice']).default('pay'),
  po_number: z
    .string()
    .trim()
    .max(64)
    .regex(/^[^\r\n]*$/)
    .optional()
    .or(z.literal('')),
});
```

After parsing:

```ts
const audience = form.audience ?? quote.audience;
if (!audience) return back(token, 'unavailable');

// Server-authoritative, as before — but the attestation may have been
// captured in the configurator and already persisted on the quote.
if (audience === 'academic' && form.attest !== 'true' && !quote.academic_attested_at)
  return back(token, 'attest', { audience, po: form.po_number || undefined });
```

Replace `depositLines(quote.lines, form.audience)` with `paymentLines(quote.lines, audience)`, `depositTotalCents` with `paymentTotalCents`, `assertDepositSane` with `assertPaymentSane`, and every remaining `form.audience` with `audience`.

Pass net terms to the gateway and branch the redirect:

```ts
    netTerms: form.intent === 'invoice',
    footer:
      `Payment in full for BioKEA quote ${quote.quote_number} (valid to ${quote.expires_at.slice(0, 10)}).` +
      ` Your quoted per-sample rate is held for this project: ship fewer samples than quoted and the` +
      ` unused amount stays as credit toward another project for 12 months; ship more and we invoice` +
      ` the difference at the same rate. Questions: contact@biokea.ai.`,
```

```ts
return form.intent === 'invoice'
  ? seeOther(`/quote/${token}?pay=invoiced#pay`)
  : seeOther(created.hostedUrl);
```

Everything else — idempotency via `liveDepositUrl`, the `pay:<uuid>` tag, the sanity check, the total-mismatch log, `updateQuoteStatusIf(quote.id, 'quoted', 'deposit_invoiced')` — is unchanged. Do not touch it.

- [ ] **Step 4: Add `netTerms` to the gateway**

In `src/lib/payments/gateway.ts`, add `netTerms: boolean;` to `CreateInvoiceSpec`, and change the terms condition from `if (terms && spec.poNumber)` to `if (terms && spec.netTerms)`. The `write_payment_terms` retry-without-terms fallback below it stays exactly as is.

- [ ] **Step 5: Wire both routes**

`src/pages/api/quote/[token]/pay.ts` — the `POST` export currently at the bottom of `deposit.ts`, importing `handlePayment` from `@/lib/payments/pay`.

`src/pages/api/quote/[token]/deposit.ts` becomes only:

```ts
// Deprecated alias. The payment rail is deployed and a cached widget bundle
// on store.biokea.ai still posts here; keep this until one release after
// widget 1.1.0 has rolled out, then delete the file.
export { POST } from './pay';
export const prerender = false;
```

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/unit && npm run check`

```bash
npx prettier --write src/lib/payments src/pages/api/quote
git add -A src/lib/payments src/pages/api/quote tests/unit
git commit -m "$(cat <<'EOF'
feat(payments): /api/quote/<token>/pay with pay|invoice intents

intent=pay redirects to Shopify checkout due-on-receipt; intent=invoice
attaches NET_30 and lands back on the quote page. Net terms now key off
the intent rather than off the presence of a PO number, so an academic
buyer can get a Net-30 invoice before purchasing has issued them a PO.

audience and the academic attestation may now arrive on the quote row
instead of the form; the endpoint stays the authority for both.

/deposit stays as an alias — the rail is live and cached widget bundles
on the store still post there.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/api/quote` takes an audience, and the quote email sells the payment

**Files:**

- Modify: `src/pages/api/quote.ts`
- Test: `tests/unit/quote-api.test.ts`

**Interfaces:**

- Produces: `QuoteSchema` accepts optional `audience: 'academic' | 'commercial'` and `attest: boolean`; the inserted row carries `audience` and `academic_attested_at`. Response body is unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
it('persists the audience the configurator chose', async () => {
  await handleQuote(req({ ...validBody, audience: 'academic', attest: true }), envFixture);
  const row = insertedRow(); // the existing fetch-mock helper in this file
  expect(row.audience).toBe('academic');
  expect(row.academic_attested_at).toEqual(expect.any(String));
});

it('records no attestation for a commercial quote', async () => {
  await handleQuote(req({ ...validBody, audience: 'commercial', attest: true }), envFixture);
  expect(insertedRow().academic_attested_at).toBeNull();
});

it('records an academic audience without an attestation as unattested', async () => {
  await handleQuote(req({ ...validBody, audience: 'academic' }), envFixture);
  const row = insertedRow();
  expect(row.audience).toBe('academic');
  expect(row.academic_attested_at).toBeNull();
});

it('accepts a body with no audience at all (stale cached widget)', async () => {
  const res = await handleQuote(req(validBody), envFixture);
  expect(res.status).toBe(200);
  expect(insertedRow().audience).toBeNull();
});

it('rejects a junk audience', async () => {
  const res = await handleQuote(req({ ...validBody, audience: 'student' }), envFixture);
  expect(res.status).toBe(400);
});

it('closes the customer email on the pay CTA and the credit disclosure', async () => {
  await handleQuote(req({ ...validBody, audience: 'commercial' }), envFixture, undefined, {
    paymentsEnabled: true,
  });
  const text = customerEmailText(); // existing Resend fetch-mock helper
  expect(text).toContain('Pay in full and start your project:');
  expect(text).toContain('#pay');
  expect(text).toContain('credit toward another project for 12 months');
  expect(text).toContain('purchase order');
  expect(text).not.toMatch(/deposit/i);
});

it('shows one total when the audience is known', async () => {
  await handleQuote(req({ ...validBody, audience: 'commercial' }), envFixture);
  const text = customerEmailText();
  expect(text).toContain('Total: $');
  expect(text).not.toContain('academic/nonprofit ·');
});

it('shows both totals when the audience is not known', async () => {
  await handleQuote(req(validBody), envFixture);
  expect(customerEmailText()).toContain('academic/nonprofit ·');
});

it('keeps the follow-up close for a conversation-band quote', async () => {
  await handleQuote(
    req({ ...validBody, lines: [{ serviceSlug: 'barcoding', count: 5000 }] }),
    envFixture,
    undefined,
    { paymentsEnabled: true },
  );
  const text = customerEmailText();
  expect(text).toContain("we'll follow up to confirm scheduling");
  expect(text).not.toContain('Pay in full and start your project:');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/quote-api.test.ts`
Expected: FAIL — `audience` is stripped by the schema, so `row.audience` is `undefined`.

- [ ] **Step 3: Implement**

Add to `QuoteSchema`:

```ts
  // Optional so a cached widget bundle on the store keeps working; absent
  // means the pay endpoint collects them instead.
  audience: z.enum(['academic', 'commercial']).optional(),
  attest: z.boolean().optional(),
```

Add to `row`:

```ts
    audience: parsed.data.audience ?? null,
    // Only meaningful for the academic rate, and only the pay endpoint may
    // rely on it — it re-checks before any money moves.
    academic_attested_at:
      parsed.data.audience === 'academic' && parsed.data.attest === true
        ? new Date().toISOString()
        : null,
```

Replace the `Total:` line and the closing of the customer email `text` array:

```ts
const { audience } = parsed.data;
const totalLine = audience
  ? `Total: ${usd(quote.total[audience])} (${audience === 'academic' ? 'academic/nonprofit' : 'commercial'} rate)`
  : `Total: ${usd(quote.total.academic)} academic/nonprofit · ${usd(quote.total.commercial)} commercial`;

const closing = quote.needsConversation
  ? `Because of the volume involved, we'll follow up to confirm scheduling and final pricing before anything is committed.`
  : opts?.paymentsEnabled
    ? [
        `Pay in full and start your project:`,
        `${url}#pay`,
        ``,
        `Card, Shop Pay, and PayPal are accepted. Paying by purchase order?`,
        `The same page will email you a Net-30 invoice to forward to purchasing.`,
        ``,
        `Paying in full locks your rate and reserves lab capacity. Your quoted`,
        `per-sample rate is held for this project — send fewer samples than quoted`,
        `and the unused amount stays as credit toward another project for 12`,
        `months; send more and we invoice the difference at the same rate.`,
        ``,
        `Quote valid for 30 days. Full terms: https://biokea.ai/terms`,
      ].join('\n')
    : `Quote valid for 30 days. Reply to this email to start a project.`;
```

Use `totalLine` and `closing` in the `text` array in place of the current `Total: …` line and the trailing ternary. The lab-notification email keeps both totals — staff want the comparison — but add `Rate: ${audience ?? '—'}` under its `Organization:` line.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/unit/quote-api.test.ts && npm run check`

```bash
npx prettier --write src/pages/api/quote.ts tests/unit/quote-api.test.ts
git add src/pages/api/quote.ts tests/unit/quote-api.test.ts
git commit -m "$(cat <<'EOF'
feat(quotes): record the chosen rate on the quote; email leads with pay-in-full

The configurator now picks academic or commercial before anything is
priced, so the quote row carries it (and the attestation when given).
Both stay optional: a cached widget bundle omits them and the pay
endpoint collects them instead.

The customer email closes on the pay CTA, names the Net-30 path for
purchasing departments, and states the credit policy in full.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Payment emails — rename, retone, and the missing credit email

The `balanceCents <= 0` branch sends the customer nothing today. Under a no-refund policy that silence is the worst possible behaviour.

**Files:**

- Modify: `src/lib/email/quote-payments.ts`, `src/pages/api/shopify/webhook.ts`, `src/pages/api/admin/quotes/[number]/balance.ts`
- Test: `tests/unit/quote-payments-email.test.ts`, `tests/unit/payments-balance.test.ts`

**Interfaces:**

- Produces: `paymentReceivedCustomerEmail(q, p)`, `paymentReceivedLabEmail(q, p, labTo)` (renamed from `depositPaid*`), and new `projectSettledWithCreditEmail(q, p)`.
- Consumes: `creditFrom` (Task 1).

- [ ] **Step 1: Write the failing tests**

```ts
import { creditFrom } from '@/lib/payments/terms';
import {
  paymentReceivedCustomerEmail,
  projectSettledWithCreditEmail,
} from '@/lib/email/quote-payments';

it('the payment email says paid in full and never says deposit', () => {
  const m = paymentReceivedCustomerEmail(quote, payment);
  expect(m.subject).toContain('Payment received');
  expect(m.text).toContain('paid in full');
  expect(m.text).toContain('shipping instructions');
  expect(m.text).not.toMatch(/deposit/i);
  expect(m.text).toContain('credit toward another project for 12 months');
});

it('the credit email states the amount and the expiry date', () => {
  const settled = {
    ...payment,
    kind: 'balance' as const,
    status: 'settled' as const,
    amount_cents: -660000,
    created_at: '2026-09-10T00:00:00Z',
  };
  const m = projectSettledWithCreditEmail(quote, settled);
  expect(m.text).toContain('$6,600.00');
  expect(m.text).toContain('2027-09-10');
  expect(m.text).toContain(quote.quote_number); // how they redeem it
  expect(m.text).not.toMatch(/refund/i);
});

it('there is no credit email when nothing is left over', () => {
  const settled = {
    ...payment,
    kind: 'balance' as const,
    status: 'settled' as const,
    amount_cents: 0,
  };
  expect(creditFrom(settled)).toBeNull();
});
```

In `tests/unit/payments-balance.test.ts`:

```ts
it('emails the customer their credit when the actuals come in under', async () => {
  const sent: EmailMessage[] = [];
  const res = await handleBalance(
    post({ confirm: 'true', 'line-0-slug': 'barcoding', 'line-0-count': '250' }),
    N,
    { ...deps(), email: async (m: EmailMessage) => void sent.push(m) },
  );
  expect(res.headers.get('location')).toContain('credit=');
  expect(sent).toHaveLength(1);
  expect(sent[0].text).toContain('credit');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/quote-payments-email.test.ts tests/unit/payments-balance.test.ts`
Expected: FAIL — the new builders are not exported and `BalanceDeps` has no `email`.

- [ ] **Step 3: Implement the email builders**

Rename `depositPaidCustomerEmail` → `paymentReceivedCustomerEmail` and `depositPaidLabEmail` → `paymentReceivedLabEmail`, then rewrite their bodies:

```ts
export function paymentReceivedCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Payment received — BioKEA quote ${q.quote_number}`,
    text: [
      `Thanks — quote ${q.quote_number} is paid in full (${usdCents(p.amount_cents)}).`,
      ``,
      `What happens next: the lab will email you shipping instructions and your`,
      `sample manifest within 2 business days. Once your samples arrive and pass`,
      `QC, we start sequencing.`,
      ``,
      `Your quoted per-sample rate is held for this project. If fewer samples`,
      `arrive than you quoted, the unused amount stays as credit toward another`,
      `project for 12 months; if more arrive, we invoice the difference at the`,
      `same rate.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.pdf_url ? `Receipt / invoice PDF: ${p.pdf_url}` : '',
      `Full terms: ${SITE_URL}/terms`,
      ``,
      `Questions? Just reply to this email.`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}
```

`paymentReceivedLabEmail` keeps `labBody` and changes only its subject (`[paid] …`) and headline (`Paid in full on ${q.quote_number} — send shipping instructions + manifest.`).

New builder — note it returns `null` when there is no credit, so the caller cannot send an empty one:

```ts
/** The under-shipping close-out. Sent instead of a balance invoice when the
 * actual counts came in at or under what was paid for. Spec §4.3 — we issue
 * credit, not a refund, so this email is the customer's only record of it. */
export function projectSettledWithCreditEmail(
  q: QuoteRecord,
  p: PaymentRecord,
): EmailMessage | null {
  const credit = creditFrom(p);
  if (!credit) return null;
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Project settled — ${usdCents(credit.amountCents)} credit on BioKEA ${q.quote_number}`,
    text: [
      `Your project on quote ${q.quote_number} is complete and settled.`,
      ``,
      `Fewer samples arrived than the quote covered, so the unused amount is`,
      `held as credit:`,
      ``,
      `  Credit: ${usdCents(credit.amountCents)}`,
      `  Valid until: ${credit.expiresAt.slice(0, 10)}`,
      ``,
      `To use it, reply to this email or mention quote ${q.quote_number} when you`,
      `next configure a project, and we'll apply it to that invoice.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      `Full terms: ${SITE_URL}/terms`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ].join('\n'),
  };
}
```

- [ ] **Step 4: Send it from the settled branch**

`BalanceDeps` gains `email: (m: EmailMessage) => Promise<unknown>` — copy the shape the webhook already uses for `deps.email`. In `handleBalance`'s `computed.balanceCents <= 0` branch, after `updateQuote(... status: 'paid')` and before the redirect:

```ts
const settledRow = (await deps.db.listPayments(quote.id)).find(
  (p) => p.kind === 'balance' && p.status === 'settled',
);
const msg = settledRow ? projectSettledWithCreditEmail(quote, settledRow) : null;
// The row is committed; an email failure must not fail the request.
if (msg) {
  try {
    await deps.email(msg);
  } catch (err) {
    console.error('[balance] credit email failed for', quote.quote_number, err);
  }
}
return seeOther(`${admin}?balance=settled&credit=${-computed.balanceCents}`);
```

Wire the real Resend sender in the route's `POST` export the same way `webhook.ts` does. Update `webhook.ts`'s two imports and call sites (`depositPaidCustomerEmail` → `paymentReceivedCustomerEmail`, `depositPaidLabEmail` → `paymentReceivedLabEmail`); its `payment.kind === 'deposit'` branch is otherwise unchanged.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/unit && npm run check`

```bash
npx prettier --write src/lib/email src/pages/api tests/unit
git add -A src/lib/email src/pages/api tests/unit
git commit -m "$(cat <<'EOF'
feat(email): payment-received wording, and tell customers about their credit

The balanceCents <= 0 branch closed projects out silently. Under a
no-refund policy that is the worst possible behaviour, so it now sends
the amount, the expiry date, and how to redeem it.

depositPaid* builders become paymentReceived*.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Widget — rate selector and a single price

**Files:**

- Modify: `src/widget/template.ts`, `src/widget/quote-widget.ts`, `src/widget/quote.css`
- Test: `tests/unit/widget-template.test.ts`

**Interfaces:**

- Produces: new contractual hooks `[data-audience-toggle="academic|commercial"]`, `[data-total]`, `[data-total-alt]`. `renderLineItems(quote, audience)` and `renderDeadzone(quote, audience)` gain an audience argument. `[data-total-academic]` and `[data-total-commercial]` are **removed** — Task 10 updates the e2e tests that use them.

- [ ] **Step 1: Write the failing tests**

```ts
it('renders a rate selector defaulting to commercial', () => {
  const html = renderWidgetHtml(pricedServices, {});
  expect(html).toContain('data-audience-toggle="commercial"');
  expect(html).toContain('data-audience-toggle="academic"');
  // Commercial is the default: we never headline a rate the visitor may not
  // be eligible for.
  expect(html).toMatch(/data-audience-toggle="commercial"[^>]*checked/);
});

it('renders one headline total and one alternate', () => {
  const html = renderWidgetHtml(pricedServices, {});
  expect(html).toContain('data-total');
  expect(html).toContain('data-total-alt');
  expect(html).not.toContain('data-total-academic');
  expect(html).not.toContain('data-total-commercial');
});

it('line items show only the selected audience', () => {
  const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
  const html = renderLineItems(q, 'academic');
  expect(html).toContain('$9,600');
  expect(html).not.toContain('$12,000'); // the commercial total
});

it('the dead-zone callout speaks for one audience only', () => {
  const q = buildQuote([{ serviceSlug: 'barcoding', count: 250 }]);
  const html = renderDeadzone(q, 'academic');
  expect(html).toContain('300–999');
  expect(html).not.toMatch(/commercial/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/widget-template.test.ts`
Expected: FAIL — no `data-audience-toggle`, and `renderLineItems` takes one argument.

- [ ] **Step 3: Implement the template**

In `renderWidgetHtml`, replace the whole `.bk-totals` block inside `.bk-summary-head`:

```html
<div class="bk-summary-head">
  <div class="bk-eyebrow">Your quote</div>
  <fieldset class="bk-rates">
    <legend class="bk-legend">Rates for</legend>
    <label class="bk-rate">
      <input
        type="radio"
        name="bk-audience"
        value="commercial"
        data-audience-toggle="commercial"
        checked
      />
      <span>Commercial</span>
    </label>
    <label class="bk-rate">
      <input type="radio" name="bk-audience" value="academic" data-audience-toggle="academic" />
      <span>Academic / nonprofit</span>
    </label>
  </fieldset>
  <div class="bk-totals" role="status" aria-live="polite" aria-atomic="true">
    <div data-total class="bk-total">$0</div>
    <div data-total-alt class="bk-total-alt"></div>
  </div>
</div>
```

Give `renderLineItems(quote: Quote, audience: Audience)` a single price column — drop the two-column `.bk-line-prices` markup for one `.bk-line-price` plus `.bk-line-tier` reading `l[audience]`.

Give `renderDeadzone(quote: Quote, audience: Audience)` the same treatment: keep the `isBetterThanLiteral` honesty gate exactly as it is, but return the single paragraph for `audience` only, and `null` when that audience does not benefit.

`renderUpsell(quote, audience)`: report the selected audience's numbers and drop the "At the commercial rate that's…" tail.

- [ ] **Step 4: Wire the widget**

In `mountQuoteWidget`:

```ts
let audience: Audience = 'commercial';

$$<HTMLInputElement>('[data-audience-toggle]').forEach((el) =>
  on(el, 'change', () => {
    if (!el.checked) return;
    audience = el.dataset.audienceToggle as Audience;
    render();
  }),
);
```

In `render()`, replace the two `textContent` assignments with:

```ts
const alt: Audience = audience === 'academic' ? 'commercial' : 'academic';
$('[data-total]')!.textContent = usd(quote.total[audience]);
$('[data-total-alt]')!.textContent =
  `${alt === 'academic' ? 'Academic/nonprofit' : 'Commercial'} rate: ${usd(quote.total[alt])}`;
lineList.innerHTML = renderLineItems(quote, audience);
```

and pass `audience` to `renderDeadzone` / `renderUpsell`. In the empty-configuration branch set `[data-total]` to `$0` and `[data-total-alt]` to `''`.

- [ ] **Step 5: Style it**

In `src/widget/quote.css`, replace the `.bk-totals` / `.bk-total` / `.bk-total-label` rules and add:

```css
.bk-rates {
  display: flex;
  gap: 0.75rem;
  border: 0;
  margin: 0 0 0.75rem;
  padding: 0;
}
.bk-rates .bk-legend {
  padding: 0;
  margin-bottom: 0.35rem;
}
.bk-rate {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8125rem;
  cursor: pointer;
}
.bk-total {
  font-size: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}
.bk-total-alt {
  margin-top: 0.25rem;
  font-size: 0.8125rem;
  color: var(--bk-slate-soft);
}
```

Delete the now-unused `.bk-line-prices` / `.bk-line-right` rules.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/unit/widget-template.test.ts && npm run widget:build && npm run check`

```bash
npx prettier --write src/widget tests/unit/widget-template.test.ts
git add -A src/widget tests/unit/widget-template.test.ts
git commit -m "$(cat <<'EOF'
feat(widget): one price and a rate selector

Two side-by-side totals with no way to say which one is yours was the
first half of the customer's confusion ("a bit confused by 'email me a
quote' given that the price was listed" — which price?). The
configurator now asks up front and shows one number, with the other rate
as a muted line so the academic discount still sells itself.

Commercial is the default: never headline a rate the visitor may not be
eligible for.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Widget — three CTAs and one-click checkout

**Files:**

- Modify: `src/widget/template.ts`, `src/widget/quote-widget.ts`, `src/widget/quote.css`, `src/data/version.ts`, `package.json`
- Test: `tests/unit/widget-template.test.ts`, `tests/unit/version.test.ts`

**Interfaces:**

- Consumes: the audience state from Task 5; `POST /api/quote` from Task 3; `POST /api/quote/<token>/pay` from Task 2.
- Produces: hooks `[data-cta-pay]`, `[data-cta-invoice]`, `[data-cta-email]`, `[data-details-form]`, `[data-attest-field]`, `[data-po-field]`, `[data-handoff-form]`. `[data-open-form]`, `[data-deposit-panel]`, `[data-deposit-form]`, `[data-deposit-academic]`, `[data-deposit-commercial]` are **removed**.

- [ ] **Step 1: Write the failing tests**

```ts
it('offers three ranked calls to action', () => {
  const html = renderWidgetHtml(pricedServices, {});
  expect(html).toContain('data-cta-pay');
  expect(html).toContain('data-cta-invoice');
  expect(html).toContain('data-cta-email');
  expect(html).toContain('Net-30 invoice');
  expect(html).not.toContain('data-deposit-panel');
});

it('states the credit policy at the point of sale', () => {
  const html = renderWidgetHtml(pricedServices, {});
  expect(html).toContain('credit toward another project for 12 months');
  expect(html).toContain('/terms');
});

it('carries an attestation field and a PO field in the details form', () => {
  const html = renderWidgetHtml(pricedServices, {});
  expect(html).toContain('data-attest-field');
  expect(html).toContain('data-po-field');
  expect(html).toContain('degree-granting institution');
});

it('never advertises a deposit anywhere', () => {
  expect(renderWidgetHtml(pricedServices, {})).not.toMatch(/deposit/i);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/widget-template.test.ts`
Expected: FAIL — the deposit panel is still rendered.

- [ ] **Step 3: Replace the CTA block in `renderWidgetHtml`**

Delete `[data-open-form]`, the `[data-deposit-note]` paragraph, and the whole `[data-deposit-panel]` section. In their place, after the fine print:

```html
<button type="button" data-cta-pay class="bk-btn bk-btn--primary bk-btn--block">
  Pay <span data-cta-amount>$0</span> and start →
</button>
<p class="bk-fine bk-fine--spaced">
  Pay in full to lock your rate and reserve lab capacity. Your quoted per-sample rate is held for
  this project. Send fewer samples than quoted and the unused amount stays as credit toward another
  project for 12 months; send more and we invoice the difference at the same rate.
  <a class="bk-link" href="https://biokea.ai/terms">Full terms</a>.
</p>
<p class="bk-alt-ctas">
  <button type="button" data-cta-invoice class="bk-linkbtn">
    Paying by purchase order? Get a Net-30 invoice →
  </button>
  <button type="button" data-cta-email class="bk-linkbtn">
    Just want the numbers? Email me this quote →
  </button>
</p>
```

The existing `[data-quote-form]` becomes `[data-details-form]` and gains, after the organization field:

```html
<label class="bk-field-label bk-attest" data-attest-field hidden>
  <input type="checkbox" name="attest" value="true" />
  <span>
    Required for the academic rate: this work is for a degree-granting institution, government
    agency, or non-profit research organization.
  </span>
</label>
<label class="bk-field-label" data-po-field hidden>
  <span class="bk-legend">PO number (optional — printed on the invoice)</span>
  <input name="po_number" maxlength="64" class="bk-input bk-input--block" />
</label>
```

and, after the form, the hidden hand-off form that carries the browser to Shopify:

```html
<form method="post" data-handoff-form hidden aria-hidden="true">
  <input type="hidden" name="audience" />
  <input type="hidden" name="attest" />
  <input type="hidden" name="intent" />
  <input type="hidden" name="po_number" />
</form>
```

- [ ] **Step 4: Wire the three intents**

```ts
type Intent = 'pay' | 'invoice' | 'email';
let intent: Intent = 'pay';

const detailsForm = $<HTMLFormElement>('[data-details-form]')!;
const handoff = $<HTMLFormElement>('[data-handoff-form]')!;
const attestField = $<HTMLElement>('[data-attest-field]')!;
const poField = $<HTMLElement>('[data-po-field]')!;

function openDetails(next: Intent): void {
  intent = next;
  detailsForm.hidden = false;
  // Attestation is only needed where money moves; the email-me path never
  // reaches the pay endpoint, which is the authority for it anyway.
  attestField.hidden = !(audience === 'academic' && next !== 'email');
  attestField.querySelector('input')!.required = !attestField.hidden;
  poField.hidden = next !== 'invoice';
  detailsForm.querySelector<HTMLInputElement>('#quote-name')?.focus();
}

on($('[data-cta-pay]')!, 'click', () => openDetails('pay'));
on($('[data-cta-invoice]')!, 'click', () => openDetails('invoice'));
on($('[data-cta-email]')!, 'click', () => openDetails('email'));
```

`render()` also sets the button amount and re-evaluates the attestation row when the rate changes:

```ts
$('[data-cta-amount]')!.textContent = usd(quote.total[audience]);
if (!detailsForm.hidden) openDetails(intent);
```

In the `[data-details-form]` submit handler, add `audience` and `attest` to the `/api/quote` payload, then chain:

```ts
if (res.ok && body.ok) {
  // ...existing status line and form.reset()...
  const quote = buildQuote(lines);
  if (
    intent !== 'email' &&
    body.paymentsEnabled &&
    isQuoteToken(body.token) &&
    !quote.needsConversation &&
    configSignature(readConfig()) === signature
  ) {
    // Native submit, so the endpoint's 303 to Shopify is a top-level
    // navigation — which is what makes this work from the store's
    // origin as well as ours.
    handoff.action = `${apiBase}/api/quote/${body.token}/pay`;
    (handoff.elements.namedItem('audience') as HTMLInputElement).value = audience;
    (handoff.elements.namedItem('attest') as HTMLInputElement).value = attested ? 'true' : '';
    (handoff.elements.namedItem('intent') as HTMLInputElement).value = intent;
    (handoff.elements.namedItem('po_number') as HTMLInputElement).value = po;
    handoff.submit();
  }
}
```

where `attested` and `po` are read from the details form's `FormData` before `form.reset()`. If the chain does not fire, the status line already carries the quote link, and `/quote/<token>` shows the pay panel — that is the retry path, so change nothing else about the failure branch. Keep `configSignature`, `state.ts`, and `invalidateDeposit` (rename it `invalidateHandoff`, clearing `handoff.action`).

- [ ] **Step 5: Style and bump the version**

Add to `quote.css`:

```css
.bk-alt-ctas {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
}
.bk-linkbtn {
  background: none;
  border: 0;
  padding: 0;
  text-align: left;
  font-size: 0.8125rem;
  color: var(--bk-teal);
  cursor: pointer;
  text-decoration: underline;
}
.bk-attest {
  flex-direction: row;
  gap: 0.5rem;
  align-items: flex-start;
  font-size: 0.75rem;
  color: var(--bk-slate);
}
```

Set `APP_VERSION = '1.1.0'` in `src/data/version.ts` and `"version": "1.1.0"` in `package.json`. Delete the `.bk-deposit*` rules.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/unit && npm run widget:build && npm run check`

```bash
npx prettier --write src/widget src/data/version.ts tests/unit
git add -A src/widget src/data/version.ts package.json tests/unit
git commit -m "$(cat <<'EOF'
feat(widget): pay in full in one click, with invoice and quote-by-email beside it

"Why isn't this as simple as pay 100% up front with credit card?" — now it
is. The primary CTA names the amount and hands off straight to Shopify
checkout: the widget chains POST /api/quote into a native submit of the
pay endpoint, so the 303 to Shopify is a top-level navigation and works
from the store's origin too.

Both steps stay server-side. If the hand-off fails the quote still
exists and /quote/<token> is the retry path, unchanged.

Purchase-order buyers get a Net-30 invoice, and "email me this quote"
survives as a text link for academics who need numbers before purchasing
will act. The 50% deposit panel is gone. Widget 1.1.0.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The customer quote page

**Files:**

- Modify: `src/lib/payments/panel.ts`, `src/pages/quote/[token].astro`
- Test: `tests/unit/payments-panel.test.ts`

**Interfaces:**

- Consumes: `paymentLines`, `paymentTotalCents`, `creditFrom` (Task 1).
- Produces: `PanelView`'s `offer` gains `audience: Audience | null` and `needsAttestation: boolean`; `paid` gains `creditCents: number | null` and `creditExpiresAt: string | null`.

- [ ] **Step 1: Write the failing tests**

```ts
it('offers a single amount when the quote knows its audience', () => {
  const v = panelView(quote({ audience: 'academic' }), [], now);
  expect(v).toMatchObject({ kind: 'offer', audience: 'academic' });
});

it('offers both amounts for a legacy quote with no audience', () => {
  const v = panelView(quote({ audience: null }), [], now);
  // PanelView is a union — narrow before reading the offer's fields.
  expect(v.kind).toBe('offer');
  if (v.kind !== 'offer') throw new Error('unreachable');
  expect(v.audience).toBeNull();
  expect(v.amountAcademicCents).toBeGreaterThan(0);
  expect(v.amountCommercialCents).toBeGreaterThan(0);
});

it('asks for an attestation only when academic and not yet attested', () => {
  expect(
    panelView(quote({ audience: 'academic', academic_attested_at: null }), [], now),
  ).toMatchObject({ needsAttestation: true });
  expect(
    panelView(
      quote({ audience: 'academic', academic_attested_at: '2026-08-22T00:00:00Z' }),
      [],
      now,
    ),
  ).toMatchObject({ needsAttestation: false });
  expect(panelView(quote({ audience: 'commercial' }), [], now)).toMatchObject({
    needsAttestation: false,
  });
});

it('offers the full total, not half of it', () => {
  const v = panelView(quote({ audience: 'academic' }), [], now);
  if (v.kind !== 'offer') throw new Error('expected an offer');
  expect(v.amountAcademicCents).toBe(Math.round(quoteFixture.total_academic * 100));
});

it('surfaces a credit on a settled project', () => {
  const v = panelView(quote({ status: 'paid' }), [paidPayment, settledNegative], now);
  expect(v).toMatchObject({
    kind: 'paid',
    creditCents: 660000,
    creditExpiresAt: '2027-09-10T00:00:00.000Z',
  });
});

it('reports no credit when the project settled square', () => {
  const v = panelView(quote({ status: 'paid' }), [paidPayment, settledZero], now);
  expect(v).toMatchObject({ kind: 'paid', creditCents: null });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/payments-panel.test.ts`
Expected: FAIL — `audience`, `needsAttestation`, `creditCents` are not on the view.

- [ ] **Step 3: Implement `panel.ts`**

Rename the `offer` fields `depositAcademicCents`/`depositCommercialCents` to `amountAcademicCents`/`amountCommercialCents`, compute them with `paymentTotalCents(paymentLines(...))`, and add:

```ts
return {
  kind: 'offer',
  audience: quote.audience,
  needsAttestation: quote.audience === 'academic' && quote.academic_attested_at === null,
  amountAcademicCents: paymentTotalCents(paymentLines(quote.lines, 'academic')),
  amountCommercialCents: paymentTotalCents(paymentLines(quote.lines, 'commercial')),
};
```

For `'paid'`, find the settled balance row among `payments` and run it through `creditFrom`:

```ts
    case 'paid': {
      const settled = payments.find((p) => p.kind === 'balance' && p.status === 'settled');
      const credit = settled ? creditFrom(settled) : null;
      return {
        kind: 'paid',
        depositPdf: deposit?.pdf_url ?? null,
        balancePdf: balance?.pdf_url ?? null,
        creditCents: credit?.amountCents ?? null,
        creditExpiresAt: credit?.expiresAt ?? null,
      };
    }
```

Note `LIVE` excludes `'settled'` for the `live()` lookup, so the settled row must be found from the raw `payments` array as above.

- [ ] **Step 4: Update the page**

In `src/pages/quote/[token].astro`:

- The quote table renders both rate columns for a legacy `audience === null` quote and a single column when `quote.audience` is set.
- The `offer` panel: heading `Pay in full`, the §7.1 disclosure verbatim, `action={`/api/quote/${quote.access_token}/pay`}`. When `panel.audience` is set, render a hidden `audience` input and show one amount; when null, keep the two radios (legacy path). Render the attestation checkbox only when `panel.needsAttestation`. Add a second submit button `name="intent" value="invoice"` labelled `Email me a Net-30 invoice instead` next to the primary `name="intent" value="pay"` button, and move the PO field beside it.
- Add a `payFlash === 'invoiced'` branch: _"Invoice sent to {quote.email} — forward it to purchasing, or pay it online with the button below."_
- The `paid` panel gains, when `panel.creditCents`: _"{usdCents(panel.creditCents)} credit toward a future project, valid until {fmtDate(panel.creditExpiresAt)}. Mention quote {quote.quote_number} and we'll apply it."_
- The footer fine print: replace _"attested when you pay the deposit. Final pricing is based on the counts actually received."_ with _"attested when you pay. Your quoted per-sample rate is held for this project — see [terms](/terms)."_
- The inline `<script>` that toggles `attest.required` keys off `input[name="audience"]` — keep it, and guard it so it no-ops when the radios are absent (the single-audience case).

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/unit/payments-panel.test.ts && npm run check`

```bash
npx prettier --write src/lib/payments/panel.ts "src/pages/quote/[token].astro" tests/unit/payments-panel.test.ts
git add -A src/lib/payments/panel.ts src/pages/quote tests/unit/payments-panel.test.ts
git commit -m "$(cat <<'EOF'
feat(quote-page): pay in full, and show the credit when a project settles

The panel offers one amount when the quote knows its rate and keeps the
two-radio path for quotes created before the configurator asked. A
settled negative balance now surfaces as a credit with its expiry, which
is the only place a customer can see it besides the email.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Admin — honest labels and credit instead of refund

**Files:**

- Create: `src/lib/payments/labels.ts`
- Modify: `src/pages/admin/quotes/[number].astro`, `src/pages/admin/index.astro`
- Test: `tests/unit/payments-labels.test.ts`

**Interfaces:**

- Produces: `export function statusLabel(s: QuoteStatus): string`.

- [ ] **Step 1: Write the failing test**

```ts
import { statusLabel } from '@/lib/payments/labels';

it('never shows the lab the word deposit', () => {
  const all = ['quoted', 'deposit_invoiced', 'deposit_paid', 'balance_invoiced', 'paid'] as const;
  for (const s of all) expect(statusLabel(s)).not.toMatch(/deposit/i);
});

it('names what each state actually means now', () => {
  expect(statusLabel('deposit_invoiced')).toBe('Invoiced — awaiting payment');
  expect(statusLabel('deposit_paid')).toBe('Paid — awaiting samples');
  expect(statusLabel('balance_invoiced')).toBe('Additional samples invoiced');
  expect(statusLabel('paid')).toBe('Settled');
  expect(statusLabel('quoted')).toBe('Quoted');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/payments-labels.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/payments/labels.ts
//
// quotes.status keeps its original values because renaming them means a
// data migration on live rows for no customer benefit (spec §6.3). The
// up-front payment is 100% now, so 'deposit_paid' means "paid in full,
// awaiting samples" — staff read these labels, never the raw values.
import type { QuoteStatus } from './types';

const LABELS: Record<QuoteStatus, string> = {
  quoted: 'Quoted',
  deposit_invoiced: 'Invoiced — awaiting payment',
  deposit_paid: 'Paid — awaiting samples',
  balance_invoiced: 'Additional samples invoiced',
  paid: 'Settled',
};

export function statusLabel(s: QuoteStatus): string {
  return LABELS[s] ?? s;
}
```

- [ ] **Step 4: Use it, and swap refund for credit**

In `src/pages/admin/quotes/[number].astro` and `src/pages/admin/index.astro`, render every status through `statusLabel(...)`. Then:

- `flash.refund` → `flash.credit`; `refundDisplay` → `creditDisplay`.
- The settled message becomes: _"Nothing further owed — actual counts came in at or under what was paid. **{creditDisplay} credit recorded**, valid 12 months. No refund is issued; apply it as a fixed-amount discount on their next draft order."_
- The preview block's _"refund {usdCents(-preview.balanceCents)} in Shopify"_ becomes _"record {usdCents(-preview.balanceCents)} as credit"_.
- Under the preview line items, when `preview.uncapped.length > 0`: _"⚠ {preview.uncapped.join(', ')} — no matching quote line (service or marker count changed), so these are priced at current rates rather than the rate the customer locked."_
- The line about `the paid deposit of … is credited` becomes `the payment of … is credited`.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/unit && npm run check`

```bash
npx prettier --write src/lib/payments/labels.ts src/pages/admin tests/unit/payments-labels.test.ts
git add -A src/lib/payments/labels.ts src/pages/admin tests/unit/payments-labels.test.ts
git commit -m "$(cat <<'EOF'
feat(admin): status labels that match what the states now mean, and credit copy

The ledger keeps its 'deposit_*' values (renaming them is a data
migration on live rows for no customer benefit), so the admin renders
them through a label map instead — the lab should never read "deposit"
about a quote that was paid in full.

The settled branch now says credit, not refund, and the balance preview
flags any line whose service or marker count no longer matches the quote
and therefore escapes the rate lock.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: `/terms`, and the marketing copy that still sells a deposit

**Files:**

- Create: `src/pages/terms.astro`
- Modify: `src/pages/pricing.astro`, `src/pages/services.astro`, `src/components/layout/Footer.astro`, `README.md`
- Test: `tests/e2e/terms.spec.ts`

**Interfaces:**

- Consumes: nothing. Produces `/terms`, linked from the widget (Task 6), both emails (Tasks 3, 4), and the quote page (Task 7).

- [ ] **Step 1: Write the failing test**

```ts
import { test, expect } from '@playwright/test';

test('/terms states the payment, rate-lock, and credit policy', async ({ page }) => {
  await page.goto('/terms');
  await expect(page.getByRole('heading', { name: /terms/i })).toBeVisible();
  await expect(page.getByText(/paid in full/i)).toBeVisible();
  await expect(page.getByText(/12 months/i)).toBeVisible();
  await expect(page.getByText(/credit/i).first()).toBeVisible();
});

test('no page still advertises a 50% deposit', async ({ page }) => {
  for (const path of ['/pricing', '/services', '/quote']) {
    await page.goto(path);
    await expect(page.locator('body')).not.toContainText(/50% deposit/i);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test tests/e2e/terms.spec.ts`
Expected: FAIL — 404 on `/terms`, and `/pricing` still says "pay a 50% deposit online".

- [ ] **Step 3: Write `/terms`**

Follow `src/pages/privacy.astro` for structure — `BaseLayout`, `Eyebrow`, prose sections. Cover, in this order:

1. **What payment buys** — N samples at a locked per-unit rate; capacity reserved on payment.
2. **Rate lock** — the quoted per-unit rate is held for the project; a larger shipment that reaches a better tier gets that better rate.
3. **Fewer samples than quoted** — the unused amount is credit, valid 12 months from the settlement date, redeemable against any BioKEA project by quoting the original quote number. Say plainly that it is not refunded.
4. **More samples than quoted** — invoiced at the locked rate when results are delivered.
5. **Academic / nonprofit eligibility** — degree-granting institution, government agency, or non-profit research organization; attested at payment.
6. **Turnaround** — typically 4–8 weeks from sample receipt, and that it is an estimate.
7. **Purchase orders** — Net-30 invoices available; the PO number is printed on the invoice.
8. **Data deposits** — GBIF / NCBI SRA / Zenodo are part of the standard deliverable, holds and embargoes on request (mirror the wording already in `services.astro`'s FAQ).
9. **Quote validity** — 30 days.

- [ ] **Step 4: Fix the deposit copy**

- `src/pages/pricing.astro:91` → `Configure &amp; pay online →`
- `src/pages/pricing.astro:104` → `Configure a quote in a minute — and pay online by card, Shop Pay, or PayPal.`
- `src/pages/services.astro:115` → same sentence as pricing:104
- `src/pages/services.astro:150` → `Configure barcoding &amp; pay online →`
- `src/pages/services.astro:187` → `Configure eDNA &amp; pay online →`
- `README.md:66` → `Customers configure a quote and pay in full` (and add a line: _"Under-shipping settles as a 12-month credit, not a refund — see the spec."_)
- `src/components/layout/Footer.astro` → add a `Terms` link beside the existing Privacy link.

- [ ] **Step 5: Verify and commit**

Run: `npx playwright test tests/e2e/terms.spec.ts && npm run check`

```bash
npx prettier --write src/pages/terms.astro src/pages/pricing.astro src/pages/services.astro src/components/layout/Footer.astro tests/e2e/terms.spec.ts
git add -A src/pages src/components/layout/Footer.astro README.md tests/e2e/terms.spec.ts
git commit -m "$(cat <<'EOF'
feat(site): /terms, and stop advertising a deposit we no longer take

A no-refund credit policy needs somewhere linkable to live, and the site
had no terms page at all. Linked from the pay panel, the footer, both
emails, and the quote page.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: End-to-end, and the full green run

**Files:**

- Modify: `tests/e2e/quote.spec.ts`, `tests/e2e/payments.spec.ts`, `tests/e2e/pricing.spec.ts`, `tests/e2e/services.spec.ts`

- [ ] **Step 1: Rewrite the hook-dependent e2e tests**

`tests/e2e/quote.spec.ts` — the tests at lines 105–151 address `[data-deposit-panel]`, `[data-deposit-form]`, `[data-deposit-academic]`, all removed in Task 6. Rewrite, don't delete:

```ts
test('switching the rate switches the headline total', async ({ page }) => {
  await page.goto('/quote');
  await page.fill('[data-count-input="barcoding"]', '800');
  await expect(page.locator('[data-total]')).toHaveText('$12,000'); // commercial default
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-total]')).toHaveText('$9,600');
  await expect(page.locator('[data-total-alt]')).toContainText('$12,000');
});

test('the pay button names the amount', async ({ page }) => {
  await page.goto('/quote');
  await page.fill('[data-count-input="barcoding"]', '800');
  await expect(page.locator('[data-cta-pay]')).toContainText('$12,000');
});

test('the academic attestation appears only for the academic rate', async ({ page }) => {
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await expect(page.locator('[data-attest-field]')).toBeHidden();
  await page.check('[data-audience-toggle="academic"]');
  await expect(page.locator('[data-attest-field]')).toBeVisible();
});

test('the PO field appears only on the invoice path', async ({ page }) => {
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await expect(page.locator('[data-po-field]')).toBeHidden();
  await page.click('[data-cta-invoice]');
  await expect(page.locator('[data-po-field]')).toBeVisible();
});

test('paying chains the quote post into the pay endpoint', async ({ page }) => {
  // Same route-stub pattern the old deposit-invalidation test used.
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  let payPost: string | null = null;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (r) => {
    payPost = r.request().postData();
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });
  await page.goto('/quote');
  await page.click('[data-cta-pay]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await expect.poll(() => payPost).toContain('intent=pay');
  expect(payPost).toContain('audience=commercial');
});

test('the email-me path creates a quote and does NOT hand off to payment', async ({ page }) => {
  await page.route('**/api/quote', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        quoteNumber: 'BK-2026-0001',
        url: '/quote/' + QUOTE_TOKEN,
        token: QUOTE_TOKEN,
        paymentsEnabled: true,
      }),
    }),
  );
  let payCalls = 0;
  await page.route(`**/api/quote/${QUOTE_TOKEN}/pay`, (r) => {
    payCalls += 1;
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'ok' });
  });
  await page.goto('/quote');
  await page.click('[data-cta-email]');
  await page.fill('#quote-name', 'Alice');
  await page.fill('#quote-email', 'alice@state.edu');
  await page.click('[data-details-form] button[type="submit"]');
  await expect(page.locator('[data-quote-status]')).toContainText('BK-2026-0001');
  expect(payCalls).toBe(0);
});
```

`tests/e2e/payments.spec.ts:48` — "pricing and services advertise the online deposit" becomes "pricing and services advertise paying online", asserting the new labels from Task 9. Check `tests/e2e/pricing.spec.ts` and `tests/e2e/services.spec.ts` for any assertion pinned to the old CTA strings and update them.

- [ ] **Step 2: Run the whole suite**

```bash
npm run widget:build
npm run lint
npm run check
npm test
npx playwright test
```

Expected: all green. If `tests/unit/payments-balance.test.ts` fails, re-read Global Constraints — its 50%-deposit fixture is deliberate and must keep passing.

- [ ] **Step 3: Commit**

```bash
npx prettier --write tests/e2e
git add -A tests/e2e
git commit -m "$(cat <<'EOF'
test(e2e): cover the rate selector, the three CTAs, and the chained checkout

Replaces the deposit-panel tests, whose data-* hooks no longer exist.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: HUMAN — verify against the real Shopify store**

Nothing above touches Shopify's configuration, but the terms change is worth one live pass on a cheap quote:

1. Configure a small barcoding quote on `/quote`, commercial rate, and click **Pay** — confirm you land on Shopify checkout for the **full** amount.
2. Back out, click **Get a Net-30 invoice** — confirm the invoice email arrives with Net-30 terms and that you land back on `/quote/<token>` with the "Invoice sent" note.
3. Confirm the Shopify draft order for (1) has **no** payment terms attached (due on receipt).
4. In `/admin`, run the balance step on that quote with a **lower** actual count and confirm the preview says "record $X as credit", the customer gets the credit email, and no refund is attempted.

---

## Self-review

**Spec coverage.** §4.1 → T1. §4.2 → T1 (all seven table rows are tests). §4.3 → T1 `creditFrom`, T4 email, T7 page, T8 admin. §5.1 → T5. §5.2 → T6. §5.3 → T6. §6.1 → T3. §6.2 → T2. §6.3 → T8 (label map; values unchanged). §7.1 → T6 widget, T7 page, T3 email. §7.2 → T9. §7.3 → T3, T4. §7.4 → T9. §8 → T7, T8. §9 → Global Constraints + T1 Step 5 + T2 Step 5 + T7 legacy-audience tests. §10 → every task's tests + T10. §11 → Global Constraints. §12 → nothing implemented, as intended.

**Type consistency.** `paymentLines`/`paymentTotalCents`/`assertPaymentSane`/`creditFrom`/`CREDIT_MONTHS` are defined in T1 and used with the same names in T2, T4, T7. `handlePayment`/`PaymentDeps` defined T2, used T2 only. `statusLabel` defined T8, used T8. `PanelView.amountAcademicCents` (T7) replaces `depositAcademicCents` everywhere it appeared. `uncapped: string[]` is produced by `computeBalance` (T1) and consumed only by the admin preview (T8). `netTerms` added to `CreateInvoiceSpec` in T2 and set by the pay endpoint in the same task.

**Known ordering constraints.** T1 must land first — every later task imports its names. T5 before T6 (both edit the same widget files; T6 owns the version bump). T2 before T6 (the widget posts to `/pay`). T3 before T6 (the widget sends `audience`). T10 last.

**Deliberate gaps.** No credit-redemption automation, no 50%-deposit UI, no refund flow, no ledger rename — all listed out of scope in spec §12.
