# Stripe Payments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer pay a 50% deposit on an existing `/quote/<token>` via a Stripe-hosted invoice, let staff issue the balance invoice from an Access-gated admin page on actual counts, and mirror every payment state onto the quote page.

**Architecture:** The quote is the payable object. `POST /api/quote/[token]/deposit` creates a Stripe Customer + Invoice (send_invoice, card/ACH/bank-transfer) and 303-redirects to the hosted invoice page. `POST /api/stripe/webhook` mirrors `invoice.paid|voided|marked_uncollectible` into Supabase (`quotes.status`, `quote_payments`) and sends Resend emails. `/admin/quotes/[number]` (Cloudflare Access + Worker-side JWT check) previews and creates the balance invoice with the same pricing engine. All handlers are exported `handleX(request, …, deps)` functions taking small interfaces (`PaymentsDb`, `PaymentsGateway`, `EmailSender`) so unit tests use in-memory fakes; the thin Astro `POST` wrappers wire real implementations.

**Tech Stack:** Astro v6 (`output: 'server'`) on Cloudflare Workers, `stripe` (fetch HTTP client + SubtleCrypto webhook verification), `jose` (Cloudflare Access JWT), Supabase REST via service-role key, Resend, zod v4, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-16-stripe-payments-design.md`

## Global Constraints

- `DEPOSIT_FRACTION = 0.5`, `INVOICE_DAYS_UNTIL_DUE = 30`, currency USD only — constants in `src/lib/payments/terms.ts`.
- Payment method types on every invoice: `['card', 'us_bank_account', 'customer_balance']` with `customer_balance` funding type `bank_transfer` / `us_bank_transfer`.
- Quote statuses: `quoted | deposit_invoiced | deposit_paid | balance_invoiced | paid`. Payment statuses: `open | paid | void | uncollectible | settled`.
- Only `barcoding` and `metabarcoding` are payable (the only priced services; `/quote` cannot produce anything else).
- Money in Supabase: `quotes.total_*` are whole dollars (existing); `quote_payments.amount_cents` are cents. Balance = actual total cents − the **paid** deposit row's `amount_cents`, never recomputed from the quote.
- Every server handler follows the repo pattern: exported `handleX()` unit-tested with injected deps; thin `POST`/page wrapper reads `env` from `cloudflare:workers` and returns 500 "not configured" when secrets are missing.
- New public form posts are covered by the existing origin-check middleware (`src/middleware.ts`); the webhook is JSON so it passes that check and is authenticated by Stripe signature only.
- Admin routes (`/admin/*`, `/api/admin/*`) require a verified `Cf-Access-Jwt-Assertion`; the `CF_ACCESS_DEV_EMAIL` bypass exists only under `import.meta.env.DEV`.
- Prettier + `astro check` + `npm test` + `npm run test:e2e` must pass before each commit; commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Deviation from spec §5.3, deliberately: the deposit endpoint answers a browser form post, so "unavailable" states redirect back to the quote page with `?pay=unavailable|failed` (303) instead of returning 409/500 bodies. Unknown token is still 404.
- Deviation from spec §5.3: no flag is added to `buildQuote()`; the balance path simply ignores `needsConversation` in the result (the engine already prices every count).

## File structure

| File                                                                                                                                  | Responsibility                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `migrations/0006_quote_payments.sql`                                                                                                  | Schema: `quotes` columns, `quote_payments`, `stripe_events`.                  |
| `src/lib/payments/types.ts`                                                                                                           | Shared record types (`QuoteRecord`, `PaymentRecord`, statuses).               |
| `src/lib/payments/terms.ts`                                                                                                           | Money math: constants, deposit lines/totals, balance computation, formatting. |
| `src/lib/payments/panel.ts`                                                                                                           | Pure `panelView()` — quote + payments → what the customer page shows.         |
| `src/lib/payments/db.ts`                                                                                                              | `PaymentsDb` interface + `SupabaseDb` (REST, service role).                   |
| `src/lib/payments/gateway.ts`                                                                                                         | `PaymentsGateway` interface + `stripeGateway()` + `makeStripe()`.             |
| `src/lib/email/resend.ts`                                                                                                             | `EmailSender` type + `resendSender(env)`.                                     |
| `src/lib/email/quote-payments.ts`                                                                                                     | Pure builders for the four payment emails.                                    |
| `src/lib/access.ts`                                                                                                                   | Cloudflare Access JWT verification (`jose`).                                  |
| `src/middleware.ts`                                                                                                                   | Existing origin check + new admin gate.                                       |
| `src/pages/api/quote/[token]/deposit.ts`                                                                                              | `handleDeposit` + `POST`.                                                     |
| `src/pages/api/stripe/webhook.ts`                                                                                                     | `handleStripeWebhook` + `POST`.                                               |
| `src/pages/api/admin/quotes/[number]/balance.ts`                                                                                      | `handleBalance` + `POST`.                                                     |
| `src/pages/admin/index.astro`, `src/pages/admin/quotes/[number].astro`                                                                | Staff pages.                                                                  |
| `src/pages/quote/[token].astro`                                                                                                       | Payment panel.                                                                |
| `src/pages/pricing.astro`, `src/pages/services.astro`                                                                                 | CTA copy.                                                                     |
| `src/env.d.ts`, `wrangler.toml`, `.dev.vars.example`, `astro.config.mjs`, `README.md`                                                 | Config + docs.                                                                |
| `tests/unit/payments-*.test.ts`, `tests/unit/access.test.ts`, `tests/unit/quote-payments-email.test.ts`, `tests/e2e/payments.spec.ts` | Tests.                                                                        |

---

### Task 1: Migration `0006_quote_payments.sql`

**Files:**

- Create: `migrations/0006_quote_payments.sql`

**Interfaces:**

- Produces: the columns and tables every later task reads/writes (names below are canonical).

- [ ] **Step 1: Write the migration**

```sql
-- 0006_quote_payments.sql
--
-- Payments for quotes (spec: docs/superpowers/specs/2026-08-16-stripe-payments-design.md).
-- Stripe is the ledger; these tables mirror state so /quote/<token> and
-- /admin can render without calling Stripe. Same RLS posture as `quotes`
-- (0005): enabled, zero policies, every access via the Worker + service role.
--
-- Apply via Supabase Dashboard → SQL Editor, paste, run.

alter table public.quotes
  add column if not exists status text not null default 'quoted'
    check (status in ('quoted','deposit_invoiced','deposit_paid','balance_invoiced','paid')),
  add column if not exists audience text
    check (audience in ('academic','commercial')),
  add column if not exists academic_attested_at timestamptz,
  add column if not exists po_number text check (char_length(po_number) <= 64),
  add column if not exists stripe_customer_id text;

create table if not exists public.quote_payments (
  id                 uuid primary key default gen_random_uuid(),
  quote_id           uuid not null references public.quotes(id),
  kind               text not null check (kind in ('deposit','balance')),
  status             text not null default 'open'
                       check (status in ('open','paid','void','uncollectible','settled')),
  -- Cents. May be <= 0 only for a kind='balance' status='settled' row
  -- (actual total came in at or under the deposit; refund is manual in Stripe).
  amount_cents       integer not null,
  currency           text not null default 'usd',
  stripe_invoice_id  text unique,          -- null only for a 'settled' no-invoice balance
  hosted_invoice_url text,
  invoice_pdf        text,
  due_at             timestamptz,
  paid_at            timestamptz,
  actual_lines       jsonb,                -- balance only: [{serviceSlug,count,markers}]
  created_by         text,                 -- balance only: Cloudflare Access email
  created_at         timestamptz not null default now(),
  constraint quote_payments_settled_shape
    check (status <> 'settled' or (kind = 'balance' and stripe_invoice_id is null)),
  constraint quote_payments_positive_unless_settled
    check (status = 'settled' or amount_cents > 0)
);

-- At most one live (open/paid) invoice per (quote, kind); a voided or
-- uncollectible one can be reissued. This index is also the lock that
-- makes the deposit endpoint idempotent under a double submit.
create unique index if not exists quote_payments_live_idx
  on public.quote_payments (quote_id, kind) where status in ('open','paid');

create index if not exists quote_payments_quote_idx on public.quote_payments (quote_id);

-- Webhook idempotency: insert-or-skip on the Stripe event id.
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.quote_payments enable row level security;
alter table public.stripe_events  enable row level security;
-- No policies on purpose — see 0005_quotes.sql for the reasoning.
```

- [ ] **Step 2: Sanity-check the SQL parses**

Run: `psql --version >/dev/null 2>&1 && psql -h localhost -U nobody -c '' 2>/dev/null; node -e "const s=require('fs').readFileSync('migrations/0006_quote_payments.sql','utf8'); for (const t of ['quote_payments_live_idx','stripe_events','academic_attested_at','stripe_customer_id']) if(!s.includes(t)) {console.error('missing',t);process.exit(1)}; console.log('ok')"`
Expected: `ok` (there is no local Postgres; the real check is Step 4).

- [ ] **Step 3: Commit**

```bash
git add migrations/0006_quote_payments.sql
git commit -m "feat(payments): migration 0006 — quotes payment columns, quote_payments, stripe_events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: HUMAN STEP — apply in Supabase**

Sean: Supabase Dashboard → SQL Editor → paste the file → Run. Then in
Table Editor confirm `quotes` has `status` defaulting to `quoted` and
`quote_payments` / `stripe_events` exist. Later tasks can be developed
before this is applied, but the test-mode rollout (Task 13) needs it.

---

### Task 2: Shared types + money math (`terms.ts`)

**Files:**

- Create: `src/lib/payments/types.ts`
- Create: `src/lib/payments/terms.ts`
- Test: `tests/unit/payments-terms.test.ts`

**Interfaces:**

- Consumes: `buildQuote`, `Quote`, `QuoteLine`, `QuoteLineInput`, `Audience` from `@/lib/pricing/quote`.
- Produces (used by Tasks 3, 7, 10, 11, 12):

```ts
// types.ts
export type QuoteStatus =
  | 'quoted'
  | 'deposit_invoiced'
  | 'deposit_paid'
  | 'balance_invoiced'
  | 'paid';
export type PaymentKind = 'deposit' | 'balance';
export type PaymentStatus = 'open' | 'paid' | 'void' | 'uncollectible' | 'settled';
export interface QuoteRecord {
  id;
  quote_number;
  access_token;
  email;
  name;
  organization: string | null;
  lines: QuoteLine[];
  total_academic: number;
  total_commercial: number;
  needs_conversation: boolean;
  created_at: string;
  expires_at: string;
  status: QuoteStatus;
  audience: Audience | null;
  academic_attested_at: string | null;
  po_number: string | null;
  stripe_customer_id: string | null;
}
export interface PaymentRecord {
  id;
  quote_id;
  kind;
  status;
  amount_cents;
  currency;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_at: string | null;
  paid_at: string | null;
  actual_lines: QuoteLineInput[] | null;
  created_by: string | null;
  created_at: string;
}
export interface InvoiceLineSpec {
  description: string;
  amountCents: number;
}
// terms.ts
export const DEPOSIT_FRACTION = 0.5;
export const INVOICE_DAYS_UNTIL_DUE = 30;
export function usdCents(cents: number): string; // '$1,234.50'
export function depositLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[];
export function depositTotalCents(lines: InvoiceLineSpec[]): number;
export function assertDepositSane(
  totalDollars: number,
  depositCents: number,
  lineCount: number,
): void; // throws
export function computeBalance(
  inputs: QuoteLineInput[],
  audience: Audience,
  deposit: { amountCents: number; invoiceLabel: string; paidAt: string },
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  actualLines: QuoteLine[];
};
```

- [ ] **Step 1: Write the types file**

```ts
// src/lib/payments/types.ts
// Row shapes for quotes + payments as read from Supabase, and the one
// invoice-line shape shared by the deposit and balance paths.
import type { Audience, QuoteLine, QuoteLineInput } from '@/lib/pricing/quote';

export type QuoteStatus =
  | 'quoted'
  | 'deposit_invoiced'
  | 'deposit_paid'
  | 'balance_invoiced'
  | 'paid';
export type PaymentKind = 'deposit' | 'balance';
export type PaymentStatus = 'open' | 'paid' | 'void' | 'uncollectible' | 'settled';

export interface QuoteRecord {
  id: string;
  quote_number: string;
  access_token: string;
  email: string;
  name: string;
  organization: string | null;
  lines: QuoteLine[];
  total_academic: number;
  total_commercial: number;
  needs_conversation: boolean;
  created_at: string;
  expires_at: string;
  status: QuoteStatus;
  audience: Audience | null;
  academic_attested_at: string | null;
  po_number: string | null;
  stripe_customer_id: string | null;
}

export interface PaymentRecord {
  id: string;
  quote_id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_cents: number;
  currency: string;
  stripe_invoice_id: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  due_at: string | null;
  paid_at: string | null;
  actual_lines: QuoteLineInput[] | null;
  created_by: string | null;
  created_at: string;
}

export interface InvoiceLineSpec {
  description: string;
  amountCents: number; // may be negative (deposit credit on the balance invoice)
}
```

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/payments-terms.test.ts
import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import {
  DEPOSIT_FRACTION,
  usdCents,
  depositLines,
  depositTotalCents,
  assertDepositSane,
  computeBalance,
} from '@/lib/payments/terms';

const quote = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);

describe('usdCents', () => {
  it('formats cents as US dollars', () => {
    expect(usdCents(123450)).toBe('$1,234.50');
    expect(usdCents(0)).toBe('$0.00');
    expect(usdCents(-500)).toBe('-$5.00');
  });
});

describe('depositLines', () => {
  it('halves each line at the chosen audience rate, in cents, one line per service', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(lines).toHaveLength(2);
    expect(lines[0].amountCents).toBe(
      Math.round(quote.lines[0].academic.total * 100 * DEPOSIT_FRACTION),
    );
    expect(lines[1].amountCents).toBe(
      Math.round(quote.lines[1].academic.total * 100 * DEPOSIT_FRACTION),
    );
  });

  it('describes the line with title, estimated count, rate, and audience', () => {
    const [barcoding, edna] = depositLines(quote.lines, 'commercial');
    expect(barcoding.description).toBe(
      `Voucher-Linked Specimen Barcoding — 50% deposit on 800 specimens (est.) @ $${quote.lines[0].commercial.effectiveRate}/specimen, commercial rate`,
    );
    expect(edna.description).toContain('× 2 markers');
    expect(edna.description).toContain('commercial rate');
  });

  it('uses the commercial total when asked', () => {
    const [a] = depositLines(quote.lines, 'academic');
    const [c] = depositLines(quote.lines, 'commercial');
    expect(c.amountCents).toBeGreaterThan(a.amountCents);
  });
});

describe('depositTotalCents + assertDepositSane', () => {
  it('sums the per-line amounts', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(depositTotalCents(lines)).toBe(lines[0].amountCents + lines[1].amountCents);
  });

  it('accepts a deposit within one cent per line of half the total', () => {
    const lines = depositLines(quote.lines, 'academic');
    expect(() =>
      assertDepositSane(quote.total.academic, depositTotalCents(lines), lines.length),
    ).not.toThrow();
  });

  it('rejects a deposit under $1 or far from half the total', () => {
    expect(() => assertDepositSane(1, 50, 1)).toThrow(/deposit/i);
    expect(() => assertDepositSane(10000, 100, 1)).toThrow(/deposit/i);
  });
});

describe('computeBalance', () => {
  const deposit = {
    amountCents: 480000,
    invoiceLabel: 'A1B2C3D4-0001',
    paidAt: '2026-09-01T00:00:00Z',
  };

  it('prices actual counts with the engine at the recorded audience and credits the deposit', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 743 }], 'academic', deposit);
    const expectedTotal =
      buildQuote([{ serviceSlug: 'barcoding', count: 743 }]).total.academic * 100;
    expect(r.actualTotalCents).toBe(expectedTotal);
    expect(r.balanceCents).toBe(expectedTotal - 480000);
    expect(r.lines).toHaveLength(2);
    expect(r.lines[0].amountCents).toBe(expectedTotal);
    expect(r.lines[0].description).toMatch(
      /^Voucher-Linked Specimen Barcoding — 743 specimens @ \$\d+\/specimen, academic rate$/,
    );
    expect(r.lines[1]).toEqual({
      description: 'Less deposit received (invoice A1B2C3D4-0001, paid 2026-09-01)',
      amountCents: -480000,
    });
    expect(r.actualLines[0].count).toBe(743);
  });

  it('returns a non-positive balance when the actual total is at or under the deposit', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 100 }], 'academic', deposit);
    expect(r.balanceCents).toBeLessThanOrEqual(0);
  });

  it('still prices counts above the conversation threshold (the human check already happened)', () => {
    const r = computeBalance([{ serviceSlug: 'barcoding', count: 5000 }], 'commercial', deposit);
    expect(r.actualTotalCents).toBe(
      buildQuote([{ serviceSlug: 'barcoding', count: 5000 }]).total.commercial * 100,
    );
  });

  it('throws on an unknown service or a bad count, like the engine', () => {
    expect(() =>
      computeBalance([{ serviceSlug: 'nope', count: 1 }], 'academic', deposit),
    ).toThrow();
    expect(() =>
      computeBalance([{ serviceSlug: 'barcoding', count: 0 }], 'academic', deposit),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-terms.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/terms`.

- [ ] **Step 4: Implement `terms.ts`**

```ts
// src/lib/payments/terms.ts
//
// Money rules for the deposit / balance flow. Everything here is pure so
// the deposit endpoint, the balance endpoint, the admin preview, and the
// customer panel all agree to the cent. Spec §5.5.
import {
  buildQuote,
  type Audience,
  type QuoteLine,
  type QuoteLineInput,
} from '@/lib/pricing/quote';
import type { InvoiceLineSpec } from './types';

export const DEPOSIT_FRACTION = 0.5;
export const INVOICE_DAYS_UNTIL_DUE = 30;

export function usdCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const pct = `${Math.round(DEPOSIT_FRACTION * 100)}%`;
const plural = (n: number, unit: string) => `${n.toLocaleString('en-US')} ${unit}s`;
const markerNote = (markers: number) => (markers > 1 ? ` × ${markers} markers` : '');

// One invoice line per quote line, each rounded independently. The
// invoice's lines therefore add up to its total exactly; the drift from
// "half the quote total" is at most one cent per line (see assertDepositSane).
export function depositLines(lines: QuoteLine[], audience: Audience): InvoiceLineSpec[] {
  return lines.map((l) => {
    const p = l[audience];
    return {
      description:
        `${l.serviceTitle} — ${pct} deposit on ${plural(l.count, l.unitLabel)}${markerNote(l.markers)} (est.)` +
        ` @ $${p.effectiveRate}/${l.unitLabel}, ${audience} rate`,
      amountCents: Math.round(p.total * 100 * DEPOSIT_FRACTION),
    };
  });
}

export function depositTotalCents(lines: InvoiceLineSpec[]): number {
  return lines.reduce((sum, l) => sum + l.amountCents, 0);
}

// Refuse to create an invoice whose amount doesn't look like a deposit on
// this quote — a guard against a future pricing-engine change silently
// producing nonsense invoices.
export function assertDepositSane(
  totalDollars: number,
  depositCents: number,
  lineCount: number,
): void {
  if (depositCents < 100) throw new Error(`Refusing deposit under $1 (${depositCents} cents)`);
  const expected = totalDollars * 100 * DEPOSIT_FRACTION;
  if (Math.abs(depositCents - expected) > lineCount) {
    throw new Error(`Deposit ${depositCents} cents is not ${pct} of ${totalDollars} dollars`);
  }
}

export interface DepositCredit {
  amountCents: number; // the PAID deposit row's amount — never recomputed
  invoiceLabel: string; // Stripe invoice number for the memo line
  paidAt: string; // ISO
}

export function computeBalance(
  inputs: QuoteLineInput[],
  audience: Audience,
  deposit: DepositCredit,
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  actualLines: QuoteLine[];
} {
  const actual = buildQuote(inputs); // throws on bad input, same as /api/quote
  const lines: InvoiceLineSpec[] = actual.lines.map((l) => {
    const p = l[audience];
    return {
      description:
        `${l.serviceTitle} — ${plural(l.count, l.unitLabel)}${markerNote(l.markers)}` +
        ` @ $${p.effectiveRate}/${l.unitLabel}, ${audience} rate`,
      amountCents: p.total * 100,
    };
  });
  const actualTotalCents = actual.total[audience] * 100;
  lines.push({
    description: `Less deposit received (invoice ${deposit.invoiceLabel}, paid ${deposit.paidAt.slice(0, 10)})`,
    amountCents: -deposit.amountCents,
  });
  return {
    actualTotalCents,
    balanceCents: actualTotalCents - deposit.amountCents,
    lines,
    actualLines: actual.lines,
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-terms.test.ts`
Expected: PASS (11 tests). If the `usdCents(-500)` assertion fails on your Node ICU with `-$5.00` vs `($5.00)`, keep the test's `-$5.00` — Node 22 with full ICU produces it.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/payments tests/unit/payments-terms.test.ts
git add src/lib/payments/types.ts src/lib/payments/terms.ts tests/unit/payments-terms.test.ts
git commit -m "feat(payments): shared record types and deposit/balance money math

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Customer panel view-model (`panel.ts`)

**Files:**

- Create: `src/lib/payments/panel.ts`
- Test: `tests/unit/payments-panel.test.ts`

**Interfaces:**

- Consumes: `QuoteRecord`, `PaymentRecord` (Task 2), `depositLines`, `depositTotalCents` (Task 2).
- Produces (used by Task 12):

```ts
export type PanelView =
  | { kind: 'none' }
  | { kind: 'offer'; depositAcademicCents: number; depositCommercialCents: number }
  | {
      kind: 'invoiced';
      phase: 'deposit' | 'balance';
      amountCents: number;
      dueAt: string | null;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }
  | { kind: 'deposit_paid'; amountCents: number; paidAt: string; invoicePdf: string | null }
  | { kind: 'paid'; depositPdf: string | null; balancePdf: string | null };
export function panelView(quote: QuoteRecord, payments: PaymentRecord[], now: Date): PanelView;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/payments-panel.test.ts
import { describe, it, expect } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { panelView } from '@/lib/payments/panel';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
const now = new Date('2026-09-01T00:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: 't',
    email: 'a@b.edu',
    name: 'Alice',
    organization: null,
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'quoted',
    audience: null,
    academic_attested_at: null,
    po_number: null,
    stripe_customer_id: null,
    ...over,
  };
}
function payment(over: Partial<PaymentRecord>): PaymentRecord {
  return {
    id: 'p1',
    quote_id: 'q1',
    kind: 'deposit',
    status: 'open',
    amount_cents: 480000,
    currency: 'usd',
    stripe_invoice_id: 'in_1',
    hosted_invoice_url: 'https://invoice.stripe.com/i/x',
    invoice_pdf: 'https://pay.stripe.com/x.pdf',
    due_at: '2026-10-01T00:00:00Z',
    paid_at: null,
    actual_lines: null,
    created_by: null,
    created_at: '2026-09-01T00:00:00Z',
    ...over,
  };
}

describe('panelView', () => {
  it('offers the deposit at both rates for a fresh, valid quote', () => {
    const v = panelView(quote(), [], now);
    expect(v.kind).toBe('offer');
    if (v.kind !== 'offer') return;
    expect(v.depositAcademicCents).toBe(q.total.academic * 100 * 0.5);
    expect(v.depositCommercialCents).toBe(q.total.commercial * 100 * 0.5);
  });

  it('shows nothing for conversation-band or expired quotes with no deposit', () => {
    expect(panelView(quote({ needs_conversation: true }), [], now).kind).toBe('none');
    expect(panelView(quote({ expires_at: '2026-08-31T00:00:00Z' }), [], now).kind).toBe('none');
  });

  it('shows the open deposit invoice, even after the quote itself expired', () => {
    const v = panelView(
      quote({ status: 'deposit_invoiced', expires_at: '2026-08-31T00:00:00Z' }),
      [payment({})],
      now,
    );
    expect(v).toEqual({
      kind: 'invoiced',
      phase: 'deposit',
      amountCents: 480000,
      dueAt: '2026-10-01T00:00:00Z',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/x',
      invoicePdf: 'https://pay.stripe.com/x.pdf',
    });
  });

  it('shows deposit received', () => {
    const v = panelView(
      quote({ status: 'deposit_paid' }),
      [payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' })],
      now,
    );
    expect(v).toEqual({
      kind: 'deposit_paid',
      amountCents: 480000,
      paidAt: '2026-09-02T10:00:00Z',
      invoicePdf: 'https://pay.stripe.com/x.pdf',
    });
  });

  it('shows the open balance invoice', () => {
    const v = panelView(
      quote({ status: 'balance_invoiced' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          amount_cents: 411600,
          stripe_invoice_id: 'in_2',
          hosted_invoice_url: 'https://invoice.stripe.com/i/y',
          invoice_pdf: null,
        }),
      ],
      now,
    );
    expect(v.kind).toBe('invoiced');
    if (v.kind !== 'invoiced') return;
    expect(v.phase).toBe('balance');
    expect(v.amountCents).toBe(411600);
    expect(v.hostedInvoiceUrl).toBe('https://invoice.stripe.com/i/y');
  });

  it('shows paid in full with both PDFs (balance PDF absent when settled without an invoice)', () => {
    const paid = panelView(
      quote({ status: 'paid' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          status: 'paid',
          invoice_pdf: 'https://pay.stripe.com/y.pdf',
          paid_at: '2026-10-20T00:00:00Z',
        }),
      ],
      now,
    );
    expect(paid).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.stripe.com/x.pdf',
      balancePdf: 'https://pay.stripe.com/y.pdf',
    });
    const settled = panelView(
      quote({ status: 'paid' }),
      [
        payment({ status: 'paid', paid_at: '2026-09-02T10:00:00Z' }),
        payment({
          id: 'p2',
          kind: 'balance',
          status: 'settled',
          amount_cents: -1200,
          stripe_invoice_id: null,
          invoice_pdf: null,
          hosted_invoice_url: null,
        }),
      ],
      now,
    );
    expect(settled).toEqual({
      kind: 'paid',
      depositPdf: 'https://pay.stripe.com/x.pdf',
      balancePdf: null,
    });
  });

  it('ignores voided rows when picking the live payment', () => {
    const v = panelView(
      quote({ status: 'deposit_invoiced' }),
      [
        payment({ id: 'old', status: 'void', hosted_invoice_url: 'https://old' }),
        payment({ id: 'new', hosted_invoice_url: 'https://new' }),
      ],
      now,
    );
    expect(v.kind === 'invoiced' && v.hostedInvoiceUrl).toBe('https://new');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-panel.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/panel`.

- [ ] **Step 3: Implement `panel.ts`**

```ts
// src/lib/payments/panel.ts
// Pure mapping from (quote row, payment rows) to what the customer's quote
// page shows. Kept out of the .astro file so it can be unit-tested and so
// the page stays a template. Spec §4.
import { depositLines, depositTotalCents } from './terms';
import type { PaymentKind, PaymentRecord, QuoteRecord } from './types';

export type PanelView =
  | { kind: 'none' }
  | { kind: 'offer'; depositAcademicCents: number; depositCommercialCents: number }
  | {
      kind: 'invoiced';
      phase: PaymentKind;
      amountCents: number;
      dueAt: string | null;
      hostedInvoiceUrl: string | null;
      invoicePdf: string | null;
    }
  | { kind: 'deposit_paid'; amountCents: number; paidAt: string; invoicePdf: string | null }
  | { kind: 'paid'; depositPdf: string | null; balancePdf: string | null };

const LIVE = new Set(['open', 'paid', 'settled']);
const live = (payments: PaymentRecord[], kind: PaymentKind) =>
  payments.find((p) => p.kind === kind && LIVE.has(p.status)) ?? null;

export function panelView(quote: QuoteRecord, payments: PaymentRecord[], now: Date): PanelView {
  const deposit = live(payments, 'deposit');
  const balance = live(payments, 'balance');

  switch (quote.status) {
    case 'quoted': {
      const expired = Date.parse(quote.expires_at) < now.getTime();
      if (quote.needs_conversation || expired) return { kind: 'none' };
      return {
        kind: 'offer',
        depositAcademicCents: depositTotalCents(depositLines(quote.lines, 'academic')),
        depositCommercialCents: depositTotalCents(depositLines(quote.lines, 'commercial')),
      };
    }
    case 'deposit_invoiced':
      if (!deposit) return { kind: 'none' };
      return {
        kind: 'invoiced',
        phase: 'deposit',
        amountCents: deposit.amount_cents,
        dueAt: deposit.due_at,
        hostedInvoiceUrl: deposit.hosted_invoice_url,
        invoicePdf: deposit.invoice_pdf,
      };
    case 'deposit_paid':
      if (!deposit || !deposit.paid_at) return { kind: 'none' };
      return {
        kind: 'deposit_paid',
        amountCents: deposit.amount_cents,
        paidAt: deposit.paid_at,
        invoicePdf: deposit.invoice_pdf,
      };
    case 'balance_invoiced':
      if (!balance) return { kind: 'none' };
      return {
        kind: 'invoiced',
        phase: 'balance',
        amountCents: balance.amount_cents,
        dueAt: balance.due_at,
        hostedInvoiceUrl: balance.hosted_invoice_url,
        invoicePdf: balance.invoice_pdf,
      };
    case 'paid':
      return {
        kind: 'paid',
        depositPdf: deposit?.invoice_pdf ?? null,
        balancePdf: balance?.invoice_pdf ?? null,
      };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-panel.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/payments/panel.ts tests/unit/payments-panel.test.ts
git add src/lib/payments/panel.ts tests/unit/payments-panel.test.ts
git commit -m "feat(payments): pure panelView() for the quote page payment panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: `PaymentsDb` interface + Supabase implementation

**Files:**

- Create: `src/lib/payments/db.ts`
- Test: `tests/unit/payments-db.test.ts`

**Interfaces:**

- Consumes: `QuoteRecord`, `PaymentRecord`, `QuoteStatus` (Task 2).
- Produces (used by Tasks 7, 8, 10, 11, 12):

```ts
export type NewPayment = Pick<PaymentRecord, 'quote_id' | 'kind' | 'amount_cents'> &
  Partial<
    Pick<
      PaymentRecord,
      | 'status'
      | 'stripe_invoice_id'
      | 'hosted_invoice_url'
      | 'invoice_pdf'
      | 'due_at'
      | 'paid_at'
      | 'actual_lines'
      | 'created_by'
    >
  >;
export type QuotePatch = Partial<
  Pick<
    QuoteRecord,
    'status' | 'audience' | 'academic_attested_at' | 'po_number' | 'stripe_customer_id'
  >
>;
export type PaymentPatch = Partial<
  Pick<
    PaymentRecord,
    'status' | 'stripe_invoice_id' | 'hosted_invoice_url' | 'invoice_pdf' | 'due_at' | 'paid_at'
  >
>;
export interface PaymentsDb {
  getQuoteByToken(token: string): Promise<QuoteRecord | null>;
  getQuoteByNumber(quoteNumber: string): Promise<QuoteRecord | null>;
  getQuoteById(id: string): Promise<QuoteRecord | null>;
  listRecentQuotes(limit: number): Promise<QuoteRecord[]>;
  listPayments(quoteId: string): Promise<PaymentRecord[]>; // newest first
  findPaymentByInvoiceId(stripeInvoiceId: string): Promise<PaymentRecord | null>;
  insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'>; // 'conflict' = live-index violation
  updatePayment(id: string, patch: PaymentPatch): Promise<void>;
  deletePayment(id: string): Promise<void>;
  updateQuote(id: string, patch: QuotePatch): Promise<void>;
  recordStripeEvent(id: string, type: string): Promise<boolean>; // false = already seen
}
export class SupabaseDb implements PaymentsDb {
  constructor(url: string, serviceRoleKey: string);
}
export class MemoryDb implements PaymentsDb {
  quotes: QuoteRecord[];
  payments: PaymentRecord[];
  events: Set<string>;
} // for tests + fakes
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/payments-db.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupabaseDb, MemoryDb } from '@/lib/payments/db';

const URL = 'https://example.supabase.co';
const KEY = 'sr_test';

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('SupabaseDb', () => {
  const calls: { url: string; init: RequestInit }[] = [];
  beforeEach(() => {
    calls.length = 0;
  });

  it('reads a quote by access token with the service-role headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'q1', quote_number: 'BK-2026-0001' }]);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    const q = await db.getQuoteByToken('11111111-1111-1111-1111-111111111111');
    expect(q?.id).toBe('q1');
    expect(calls[0].url).toBe(
      `${URL}/rest/v1/quotes?access_token=eq.11111111-1111-1111-1111-111111111111&select=*&limit=1`,
    );
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.apikey).toBe(KEY);
    expect(h.authorization).toBe(`Bearer ${KEY}`);
  });

  it('returns null for an empty result and on a non-2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([])),
    );
    expect(await new SupabaseDb(URL, KEY).getQuoteByNumber('BK-2026-9999')).toBeNull();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'boom' }, 500)),
    );
    expect(await new SupabaseDb(URL, KEY).getQuoteById('x')).toBeNull();
  });

  it('inserts a payment and returns the representation; maps a unique violation to "conflict"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes(
          [{ id: 'p1', quote_id: 'q1', kind: 'deposit', status: 'open', amount_cents: 100 }],
          201,
        );
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    const row = await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 100 });
    expect(row).toMatchObject({ id: 'p1' });
    expect(calls[0].url).toBe(`${URL}/rest/v1/quote_payments`);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe('return=representation');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      quote_id: 'q1',
      kind: 'deposit',
      amount_cents: 100,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonRes(
          {
            code: '23505',
            message: 'duplicate key value violates unique constraint "quote_payments_live_idx"',
          },
          409,
        ),
      ),
    );
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 100 })).toBe(
      'conflict',
    );
  });

  it('throws on any other insert failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes({ message: 'nope' }, 500)),
    );
    await expect(
      new SupabaseDb(URL, KEY).insertPayment({
        quote_id: 'q1',
        kind: 'deposit',
        amount_cents: 100,
      }),
    ).rejects.toThrow(/insert/i);
  });

  it('patches a payment / quote with PATCH ...?id=eq.', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response(null, { status: 204 });
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T00:00:00Z' });
    await db.updateQuote('q1', { status: 'deposit_paid' });
    expect(calls[0].url).toBe(`${URL}/rest/v1/quote_payments?id=eq.p1`);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[1].url).toBe(`${URL}/rest/v1/quotes?id=eq.q1`);
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ status: 'deposit_paid' });
  });

  it('records a Stripe event once: true the first time, false on the duplicate', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonRes([{ id: 'evt_1' }], 201);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    expect(await db.recordStripeEvent('evt_1', 'invoice.paid')).toBe(true);
    expect((calls[0].init.headers as Record<string, string>).Prefer).toBe(
      'resolution=ignore-duplicates,return=representation',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonRes([], 201)),
    );
    expect(await db.recordStripeEvent('evt_1', 'invoice.paid')).toBe(false);
  });

  it('lists payments newest first and finds by invoice id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push({ url, init: {} });
        return jsonRes([{ id: 'p2' }]);
      }),
    );
    const db = new SupabaseDb(URL, KEY);
    await db.listPayments('q1');
    expect(calls[0].url).toBe(
      `${URL}/rest/v1/quote_payments?quote_id=eq.q1&select=*&order=created_at.desc`,
    );
    expect(await db.findPaymentByInvoiceId('in_2')).toMatchObject({ id: 'p2' });
    expect(calls[1].url).toBe(
      `${URL}/rest/v1/quote_payments?stripe_invoice_id=eq.in_2&select=*&limit=1`,
    );
  });
});

describe('MemoryDb', () => {
  it('enforces the live (quote_id, kind) uniqueness like the partial index', async () => {
    const db = new MemoryDb();
    const a = await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 });
    expect(a).not.toBe('conflict');
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 })).toBe(
      'conflict',
    );
    await db.updatePayment((a as { id: string }).id, { status: 'void' });
    expect(await db.insertPayment({ quote_id: 'q1', kind: 'deposit', amount_cents: 1 })).not.toBe(
      'conflict',
    );
  });

  it('records events once', async () => {
    const db = new MemoryDb();
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(true);
    expect(await db.recordStripeEvent('e', 'invoice.paid')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-db.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/db`.

- [ ] **Step 3: Implement `db.ts`**

```ts
// src/lib/payments/db.ts
//
// Supabase access for the payments flow, behind a small interface so the
// endpoints are unit-tested against MemoryDb. Every call uses the
// service-role key: `quotes`, `quote_payments`, `stripe_events` all have
// RLS enabled with zero policies (see migrations/0005 and 0006).
import type { PaymentRecord, QuoteRecord } from './types';

export type NewPayment = Pick<PaymentRecord, 'quote_id' | 'kind' | 'amount_cents'> &
  Partial<
    Pick<
      PaymentRecord,
      | 'status'
      | 'stripe_invoice_id'
      | 'hosted_invoice_url'
      | 'invoice_pdf'
      | 'due_at'
      | 'paid_at'
      | 'actual_lines'
      | 'created_by'
    >
  >;
export type QuotePatch = Partial<
  Pick<
    QuoteRecord,
    'status' | 'audience' | 'academic_attested_at' | 'po_number' | 'stripe_customer_id'
  >
>;
export type PaymentPatch = Partial<
  Pick<
    PaymentRecord,
    'status' | 'stripe_invoice_id' | 'hosted_invoice_url' | 'invoice_pdf' | 'due_at' | 'paid_at'
  >
>;

export interface PaymentsDb {
  getQuoteByToken(token: string): Promise<QuoteRecord | null>;
  getQuoteByNumber(quoteNumber: string): Promise<QuoteRecord | null>;
  getQuoteById(id: string): Promise<QuoteRecord | null>;
  listRecentQuotes(limit: number): Promise<QuoteRecord[]>;
  listPayments(quoteId: string): Promise<PaymentRecord[]>;
  findPaymentByInvoiceId(stripeInvoiceId: string): Promise<PaymentRecord | null>;
  insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'>;
  updatePayment(id: string, patch: PaymentPatch): Promise<void>;
  deletePayment(id: string): Promise<void>;
  updateQuote(id: string, patch: QuotePatch): Promise<void>;
  recordStripeEvent(id: string, type: string): Promise<boolean>;
}

export class SupabaseDb implements PaymentsDb {
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      'content-type': 'application/json',
      apikey: this.key,
      authorization: `Bearer ${this.key}`,
      ...extra,
    };
  }

  private async one<T>(path: string): Promise<T | null> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, { headers: this.headers() });
    if (!res.ok) return null;
    const rows = (await res.json()) as T[];
    return rows[0] ?? null;
  }

  private async many<T>(path: string): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${path}`, { headers: this.headers() });
    if (!res.ok) return [];
    return (await res.json()) as T[];
  }

  getQuoteByToken(token: string) {
    return this.one<QuoteRecord>(
      `quotes?access_token=eq.${encodeURIComponent(token)}&select=*&limit=1`,
    );
  }
  getQuoteByNumber(n: string) {
    return this.one<QuoteRecord>(
      `quotes?quote_number=eq.${encodeURIComponent(n)}&select=*&limit=1`,
    );
  }
  getQuoteById(id: string) {
    return this.one<QuoteRecord>(`quotes?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  }
  listRecentQuotes(limit: number) {
    return this.many<QuoteRecord>(`quotes?select=*&order=created_at.desc&limit=${limit}`);
  }
  listPayments(quoteId: string) {
    return this.many<PaymentRecord>(
      `quote_payments?quote_id=eq.${encodeURIComponent(quoteId)}&select=*&order=created_at.desc`,
    );
  }
  findPaymentByInvoiceId(inv: string) {
    return this.one<PaymentRecord>(
      `quote_payments?stripe_invoice_id=eq.${encodeURIComponent(inv)}&select=*&limit=1`,
    );
  }

  async insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'> {
    const res = await fetch(`${this.url}/rest/v1/quote_payments`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'return=representation' }),
      body: JSON.stringify(row),
    });
    if (res.status === 409) return 'conflict'; // PostgREST maps unique_violation (23505) to 409
    if (!res.ok) throw new Error(`quote_payments insert failed: ${res.status}`);
    const rows = (await res.json()) as PaymentRecord[];
    if (!rows[0]) throw new Error('quote_payments insert returned no row');
    return rows[0];
  }

  private async patch(table: string, id: string, body: unknown): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers({ Prefer: 'return=minimal' }),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${table} update failed: ${res.status}`);
  }
  updatePayment(id: string, patch: PaymentPatch) {
    return this.patch('quote_payments', id, patch);
  }
  updateQuote(id: string, patch: QuotePatch) {
    return this.patch('quotes', id, patch);
  }

  async deletePayment(id: string): Promise<void> {
    const res = await fetch(`${this.url}/rest/v1/quote_payments?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`quote_payments delete failed: ${res.status}`);
  }

  // Insert-or-skip on the primary key. With ignore-duplicates the
  // representation is empty when the row already existed.
  async recordStripeEvent(id: string, type: string): Promise<boolean> {
    const res = await fetch(`${this.url}/rest/v1/stripe_events`, {
      method: 'POST',
      headers: this.headers({ Prefer: 'resolution=ignore-duplicates,return=representation' }),
      body: JSON.stringify({ id, type }),
    });
    if (!res.ok) throw new Error(`stripe_events insert failed: ${res.status}`);
    const rows = (await res.json()) as unknown[];
    return rows.length > 0;
  }
}

// In-memory implementation for unit tests and local fakes. Mirrors the
// partial unique index and the event primary key.
export class MemoryDb implements PaymentsDb {
  quotes: QuoteRecord[] = [];
  payments: PaymentRecord[] = [];
  events = new Set<string>();
  private seq = 0;

  async getQuoteByToken(token: string) {
    return this.quotes.find((q) => q.access_token === token) ?? null;
  }
  async getQuoteByNumber(n: string) {
    return this.quotes.find((q) => q.quote_number === n) ?? null;
  }
  async getQuoteById(id: string) {
    return this.quotes.find((q) => q.id === id) ?? null;
  }
  async listRecentQuotes(limit: number) {
    return [...this.quotes]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  }
  async listPayments(quoteId: string) {
    return this.payments
      .filter((p) => p.quote_id === quoteId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async findPaymentByInvoiceId(inv: string) {
    return this.payments.find((p) => p.stripe_invoice_id === inv) ?? null;
  }
  async insertPayment(row: NewPayment): Promise<PaymentRecord | 'conflict'> {
    const status = row.status ?? 'open';
    const clash = this.payments.some(
      (p) =>
        p.quote_id === row.quote_id &&
        p.kind === row.kind &&
        (p.status === 'open' || p.status === 'paid'),
    );
    if (clash && (status === 'open' || status === 'paid')) return 'conflict';
    const rec: PaymentRecord = {
      id: `p${++this.seq}`,
      currency: 'usd',
      status,
      stripe_invoice_id: null,
      hosted_invoice_url: null,
      invoice_pdf: null,
      due_at: null,
      paid_at: null,
      actual_lines: null,
      created_by: null,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, this.seq)).toISOString(),
      ...row,
    };
    this.payments.push(rec);
    return rec;
  }
  async updatePayment(id: string, patch: PaymentPatch) {
    const p = this.payments.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  }
  async deletePayment(id: string) {
    this.payments = this.payments.filter((p) => p.id !== id);
  }
  async updateQuote(id: string, patch: QuotePatch) {
    const q = this.quotes.find((x) => x.id === id);
    if (q) Object.assign(q, patch);
  }
  async recordStripeEvent(id: string) {
    if (this.events.has(id)) return false;
    this.events.add(id);
    return true;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-db.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/lib/payments/db.ts tests/unit/payments-db.test.ts
git add src/lib/payments/db.ts tests/unit/payments-db.test.ts
git commit -m "feat(payments): PaymentsDb interface with Supabase REST and in-memory implementations

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: `PaymentsGateway` interface + Stripe implementation

**Files:**

- Modify: `package.json` (add `stripe`)
- Create: `src/lib/payments/gateway.ts`
- Test: `tests/unit/payments-gateway.test.ts`

**Interfaces:**

- Consumes: `InvoiceLineSpec` (Task 2).
- Produces (used by Tasks 7, 10):

```ts
export interface InvoiceCustomer {
  id: string | null;
  email: string;
  name: string;
  organization: string | null;
  quoteId: string;
}
export interface CreateInvoiceSpec {
  customer: InvoiceCustomer;
  kind: 'deposit' | 'balance';
  quoteId: string;
  quoteNumber: string;
  lines: InvoiceLineSpec[];
  footer: string;
  customFields: { name: string; value: string }[];
  daysUntilDue: number;
  idempotencyKey: string;
}
export interface CreatedInvoice {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  hostedInvoiceUrl: string;
  invoicePdf: string | null;
  dueAt: string | null;
  amountDueCents: number;
}
export interface PaymentsGateway {
  createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice>;
}
export function makeStripe(secretKey: string): Stripe;
export function stripeGateway(stripe: Stripe): PaymentsGateway;
export class MemoryGateway implements PaymentsGateway {
  created: CreateInvoiceSpec[];
  failNext?: Error;
}
```

- [ ] **Step 1: Install the SDK**

Run: `npm install stripe@^19`
Expected: `package.json` gains `"stripe": "^19.x"`; lockfile updated.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/unit/payments-gateway.test.ts
import { describe, it, expect, vi } from 'vitest';
import type Stripe from 'stripe';
import { stripeGateway, MemoryGateway, type CreateInvoiceSpec } from '@/lib/payments/gateway';

function fakeStripe() {
  const calls: Record<string, unknown[]> = {
    customersCreate: [],
    invoicesCreate: [],
    itemsCreate: [],
    finalize: [],
    send: [],
  };
  const stripe = {
    customers: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.customersCreate.push([p, o]);
        return { id: 'cus_1' };
      }),
    },
    invoices: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.invoicesCreate.push([p, o]);
        return { id: 'in_1' };
      }),
      finalizeInvoice: vi.fn(async (id: string) => {
        calls.finalize.push(id);
        return { id };
      }),
      sendInvoice: vi.fn(async (id: string) => {
        calls.send.push(id);
        return {
          id,
          number: 'A1B2C3D4-0001',
          hosted_invoice_url: 'https://invoice.stripe.com/i/x',
          invoice_pdf: 'https://pay.stripe.com/x.pdf',
          due_date: 1790000000,
          amount_due: 480000,
        };
      }),
    },
    invoiceItems: {
      create: vi.fn(async (p: unknown, o: unknown) => {
        calls.itemsCreate.push([p, o]);
        return { id: 'ii' };
      }),
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const spec: CreateInvoiceSpec = {
  customer: { id: null, email: 'a@b.edu', name: 'Alice', organization: 'State U', quoteId: 'q1' },
  kind: 'deposit',
  quoteId: 'q1',
  quoteNumber: 'BK-2026-0142',
  lines: [
    { description: 'Barcoding — 50% deposit', amountCents: 400000 },
    { description: 'eDNA — 50% deposit', amountCents: 80000 },
  ],
  footer: '50% deposit toward BioKEA quote BK-2026-0142.',
  customFields: [
    { name: 'Quote', value: 'BK-2026-0142' },
    { name: 'PO number', value: 'PO-77' },
  ],
  daysUntilDue: 30,
  idempotencyKey: 'deposit:q1',
};

describe('stripeGateway.createInvoice', () => {
  it('creates the customer when there is no id, then invoice → items → finalize → send, with idempotency keys', async () => {
    const { stripe, calls } = fakeStripe();
    const out = await stripeGateway(stripe).createInvoice(spec);

    expect(calls.customersCreate[0]).toEqual([
      { email: 'a@b.edu', name: 'Alice', description: 'State U', metadata: { quote_id: 'q1' } },
      { idempotencyKey: 'deposit:q1:customer' },
    ]);
    const [invParams, invOpts] = calls.invoicesCreate[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(invParams).toEqual({
      customer: 'cus_1',
      collection_method: 'send_invoice',
      days_until_due: 30,
      currency: 'usd',
      auto_advance: false,
      metadata: { quote_id: 'q1', quote_number: 'BK-2026-0142', kind: 'deposit' },
      custom_fields: [
        { name: 'Quote', value: 'BK-2026-0142' },
        { name: 'PO number', value: 'PO-77' },
      ],
      footer: '50% deposit toward BioKEA quote BK-2026-0142.',
      payment_settings: {
        payment_method_types: ['card', 'us_bank_account', 'customer_balance'],
        payment_method_options: {
          customer_balance: {
            funding_type: 'bank_transfer',
            bank_transfer: { type: 'us_bank_transfer' },
          },
        },
      },
    });
    expect(invOpts).toEqual({ idempotencyKey: 'deposit:q1' });
    expect(calls.itemsCreate).toHaveLength(2);
    expect(calls.itemsCreate[0]).toEqual([
      {
        customer: 'cus_1',
        invoice: 'in_1',
        currency: 'usd',
        amount: 400000,
        description: 'Barcoding — 50% deposit',
      },
      { idempotencyKey: 'deposit:q1:item:0' },
    ]);
    expect(calls.finalize).toEqual(['in_1']);
    expect(calls.send).toEqual(['in_1']);
    expect(out).toEqual({
      customerId: 'cus_1',
      invoiceId: 'in_1',
      invoiceNumber: 'A1B2C3D4-0001',
      hostedInvoiceUrl: 'https://invoice.stripe.com/i/x',
      invoicePdf: 'https://pay.stripe.com/x.pdf',
      dueAt: new Date(1790000000 * 1000).toISOString(),
      amountDueCents: 480000,
    });
  });

  it('reuses an existing customer id and skips customers.create', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({
      ...spec,
      customer: { ...spec.customer, id: 'cus_existing' },
    });
    expect(calls.customersCreate).toHaveLength(0);
    expect((calls.invoicesCreate[0] as [Record<string, unknown>])[0].customer).toBe('cus_existing');
  });

  it('passes negative amounts through unchanged (deposit credit on the balance invoice)', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({
      ...spec,
      kind: 'balance',
      lines: [
        { description: 'Barcoding — 743', amountCents: 891600 },
        { description: 'Less deposit', amountCents: -480000 },
      ],
    });
    expect((calls.itemsCreate[1] as [Record<string, unknown>])[0].amount).toBe(-480000);
  });

  it('omits custom_fields when there are none', async () => {
    const { stripe, calls } = fakeStripe();
    await stripeGateway(stripe).createInvoice({ ...spec, customFields: [] });
    expect((calls.invoicesCreate[0] as [Record<string, unknown>])[0]).not.toHaveProperty(
      'custom_fields',
    );
  });
});

describe('MemoryGateway', () => {
  it('records specs and returns deterministic ids; can be told to fail once', async () => {
    const g = new MemoryGateway();
    const a = await g.createInvoice(spec);
    expect(a.invoiceId).toBe('in_test_1');
    expect(a.hostedInvoiceUrl).toBe('https://invoice.stripe.test/in_test_1');
    expect(g.created).toHaveLength(1);
    g.failNext = new Error('stripe down');
    await expect(g.createInvoice(spec)).rejects.toThrow('stripe down');
    expect((await g.createInvoice(spec)).invoiceId).toBe('in_test_2');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-gateway.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/gateway`.

- [ ] **Step 4: Implement `gateway.ts`**

```ts
// src/lib/payments/gateway.ts
//
// The one thing we ask Stripe to do: turn a list of lines into a sent,
// hosted invoice for a customer. Both the deposit and the balance go
// through createInvoice(); the callers only differ in what lines and
// metadata they pass. Spec §5.1.
import Stripe from 'stripe';
import type { InvoiceLineSpec, PaymentKind } from './types';

export interface InvoiceCustomer {
  id: string | null; // existing Stripe customer id, or null to create one
  email: string;
  name: string;
  organization: string | null;
  quoteId: string;
}

export interface CreateInvoiceSpec {
  customer: InvoiceCustomer;
  kind: PaymentKind;
  quoteId: string;
  quoteNumber: string;
  lines: InvoiceLineSpec[];
  footer: string;
  customFields: { name: string; value: string }[]; // Stripe allows up to 4
  daysUntilDue: number;
  idempotencyKey: string; // e.g. `deposit:<quoteId>` / `balance:<quoteId>:<attempt>`
}

export interface CreatedInvoice {
  customerId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  hostedInvoiceUrl: string;
  invoicePdf: string | null;
  dueAt: string | null;
  amountDueCents: number;
}

export interface PaymentsGateway {
  createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice>;
}

// Workers have no Node http; use the fetch client the SDK ships.
export function makeStripe(secretKey: string): Stripe {
  return new Stripe(secretKey, { httpClient: Stripe.createFetchHttpClient() });
}

export const PAYMENT_METHOD_TYPES = ['card', 'us_bank_account', 'customer_balance'] as const;

export function stripeGateway(stripe: Stripe): PaymentsGateway {
  return {
    async createInvoice(spec) {
      const key = spec.idempotencyKey;

      let customerId = spec.customer.id;
      if (!customerId) {
        const c = await stripe.customers.create(
          {
            email: spec.customer.email,
            name: spec.customer.name,
            description: spec.customer.organization ?? undefined,
            metadata: { quote_id: spec.customer.quoteId },
          },
          { idempotencyKey: `${key}:customer` },
        );
        customerId = c.id;
      }

      const params: Stripe.InvoiceCreateParams = {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: spec.daysUntilDue,
        currency: 'usd',
        auto_advance: false,
        metadata: { quote_id: spec.quoteId, quote_number: spec.quoteNumber, kind: spec.kind },
        footer: spec.footer,
        payment_settings: {
          payment_method_types: [...PAYMENT_METHOD_TYPES],
          payment_method_options: {
            customer_balance: {
              funding_type: 'bank_transfer',
              bank_transfer: { type: 'us_bank_transfer' },
            },
          },
        },
      };
      if (spec.customFields.length > 0) params.custom_fields = spec.customFields;

      const invoice = await stripe.invoices.create(params, { idempotencyKey: key });

      for (const [i, line] of spec.lines.entries()) {
        await stripe.invoiceItems.create(
          {
            customer: customerId,
            invoice: invoice.id,
            currency: 'usd',
            amount: line.amountCents,
            description: line.description,
          },
          { idempotencyKey: `${key}:item:${i}` },
        );
      }

      await stripe.invoices.finalizeInvoice(invoice.id);
      // sendInvoice emails the customer Stripe's own "invoice ready" mail
      // with the hosted link, so paying later by ACH/transfer needs nothing
      // from us. Its return value carries the URLs we mirror.
      const sent = await stripe.invoices.sendInvoice(invoice.id);

      return {
        customerId,
        invoiceId: sent.id,
        invoiceNumber: sent.number ?? null,
        hostedInvoiceUrl: sent.hosted_invoice_url ?? '',
        invoicePdf: sent.invoice_pdf ?? null,
        dueAt: sent.due_date ? new Date(sent.due_date * 1000).toISOString() : null,
        amountDueCents: sent.amount_due,
      };
    },
  };
}

// Test double: records every spec, hands back deterministic ids.
export class MemoryGateway implements PaymentsGateway {
  created: CreateInvoiceSpec[] = [];
  failNext?: Error;
  private seq = 0;
  async createInvoice(spec: CreateInvoiceSpec): Promise<CreatedInvoice> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = undefined;
      throw err;
    }
    this.created.push(spec);
    const n = ++this.seq;
    return {
      customerId: spec.customer.id ?? `cus_test_${n}`,
      invoiceId: `in_test_${n}`,
      invoiceNumber: `TEST-${String(n).padStart(4, '0')}`,
      hostedInvoiceUrl: `https://invoice.stripe.test/in_test_${n}`,
      invoicePdf: `https://invoice.stripe.test/in_test_${n}.pdf`,
      dueAt: '2026-10-01T00:00:00.000Z',
      amountDueCents: spec.lines.reduce((s, l) => s + l.amountCents, 0),
    };
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-gateway.test.ts && npm run check`
Expected: PASS (5 tests); `astro check` reports 0 errors (the `Stripe.InvoiceCreateParams` types must accept `payment_method_options.customer_balance.bank_transfer.type` — if the installed SDK's type differs, match its name; the runtime shape is what the test asserts).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/payments/gateway.ts tests/unit/payments-gateway.test.ts
git add package.json package-lock.json src/lib/payments/gateway.ts tests/unit/payments-gateway.test.ts
git commit -m "feat(payments): PaymentsGateway with Stripe hosted-invoice implementation and test double

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Email sender + the four payment emails

**Files:**

- Create: `src/lib/email/resend.ts`
- Create: `src/lib/email/quote-payments.ts`
- Test: `tests/unit/quote-payments-email.test.ts`

**Interfaces:**

- Consumes: `QuoteRecord`, `PaymentRecord` (Task 2), `usdCents` (Task 2).
- Produces (used by Task 8):

```ts
// resend.ts
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}
export type EmailSender = (msg: EmailMessage) => Promise<void>; // never throws; swallows failures like contact/subscribe do
export function resendSender(env: {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
}): EmailSender;
export function memorySender(): EmailSender & { sent: EmailMessage[] };
// quote-payments.ts
export const SITE_URL = 'https://biokea.ai';
export function depositPaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage;
export function depositPaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage;
export function balancePaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage;
export function balancePaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage;
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/quote-payments-email.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { resendSender, memorySender } from '@/lib/email/resend';
import {
  depositPaidCustomerEmail,
  depositPaidLabEmail,
  balancePaidCustomerEmail,
  balancePaidLabEmail,
} from '@/lib/email/quote-payments';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const quote: QuoteRecord = {
  id: 'q1',
  quote_number: 'BK-2026-0142',
  access_token: 'tok',
  email: 'alice@state.edu',
  name: 'Alice',
  organization: 'State University',
  lines: q.lines,
  total_academic: q.total.academic,
  total_commercial: q.total.commercial,
  needs_conversation: false,
  created_at: '2026-08-20T00:00:00Z',
  expires_at: '2026-09-19T00:00:00Z',
  status: 'deposit_paid',
  audience: 'academic',
  academic_attested_at: '2026-09-01T00:00:00Z',
  po_number: 'PO-77',
  stripe_customer_id: 'cus_1',
};
const deposit: PaymentRecord = {
  id: 'p1',
  quote_id: 'q1',
  kind: 'deposit',
  status: 'paid',
  amount_cents: 480000,
  currency: 'usd',
  stripe_invoice_id: 'in_1',
  hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  invoice_pdf: 'https://pay.stripe.com/x.pdf',
  due_at: null,
  paid_at: '2026-09-02T10:00:00Z',
  actual_lines: null,
  created_by: null,
  created_at: '2026-09-01T00:00:00Z',
};
const balance: PaymentRecord = {
  ...deposit,
  id: 'p2',
  kind: 'balance',
  amount_cents: 411600,
  stripe_invoice_id: 'in_2',
  invoice_pdf: 'https://pay.stripe.com/y.pdf',
  paid_at: '2026-10-20T00:00:00Z',
};

describe('payment emails', () => {
  it('deposit paid → customer: amount, next steps, quote link, receipt', () => {
    const m = depositPaidCustomerEmail(quote, deposit);
    expect(m.to).toBe('alice@state.edu');
    expect(m.subject).toBe('Deposit received — BioKEA quote BK-2026-0142');
    expect(m.replyTo).toBe('contact@biokea.ai');
    expect(m.text).toContain('$4,800.00');
    expect(m.text).toContain('within 2 business days');
    expect(m.text).toContain('https://biokea.ai/quote/tok');
    expect(m.text).toContain('https://pay.stripe.com/x.pdf');
  });

  it('deposit paid → lab: lines, audience, PO, customer, admin link', () => {
    const m = depositPaidLabEmail(quote, deposit, 'contact@biokea.ai');
    expect(m.to).toBe('contact@biokea.ai');
    expect(m.subject).toBe('[deposit paid] BK-2026-0142 · State University · $4,800.00');
    expect(m.replyTo).toBe('alice@state.edu');
    expect(m.text).toContain('Voucher-Linked Specimen Barcoding: 800 specimens');
    expect(m.text).toContain('× 2 markers');
    expect(m.text).toContain('Rate: academic');
    expect(m.text).toContain('PO number: PO-77');
    expect(m.text).toContain('https://biokea.ai/admin/quotes/BK-2026-0142');
  });

  it('balance paid → customer and lab', () => {
    const c = balancePaidCustomerEmail(quote, balance);
    expect(c.subject).toBe('Paid in full — BioKEA quote BK-2026-0142');
    expect(c.text).toContain('$4,116.00');
    expect(c.text).toContain('https://pay.stripe.com/y.pdf');
    const l = balancePaidLabEmail(quote, balance, 'contact@biokea.ai');
    expect(l.subject).toBe('[paid in full] BK-2026-0142 · State University · $4,116.00');
  });

  it('uses the customer name when there is no organization', () => {
    const m = depositPaidLabEmail({ ...quote, organization: null }, deposit, 'contact@biokea.ai');
    expect(m.subject).toBe('[deposit paid] BK-2026-0142 · Alice · $4,800.00');
  });
});

describe('resendSender', () => {
  it('posts to Resend with the shared envelope and never throws', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return new Response('{"id":"m"}', { status: 200 });
      }),
    );
    const send = resendSender({
      RESEND_API_KEY: 'k',
      CONTACT_FROM_EMAIL: 'notifications@biokea.ai',
    });
    await send({ to: 'x@y.z', subject: 'S', text: 'T', replyTo: 'contact@biokea.ai' });
    expect(calls[0]).toEqual({
      from: 'BioKEA <notifications@biokea.ai>',
      to: 'x@y.z',
      reply_to: 'contact@biokea.ai',
      subject: 'S',
      text: 'T',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net');
      }),
    );
    await expect(send({ to: 'x@y.z', subject: 'S', text: 'T' })).resolves.toBeUndefined();
  });

  it('memorySender records messages', async () => {
    const s = memorySender();
    await s({ to: 'a', subject: 'b', text: 'c' });
    expect(s.sent).toEqual([{ to: 'a', subject: 'b', text: 'c' }]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/quote-payments-email.test.ts`
Expected: FAIL — cannot resolve `@/lib/email/resend`.

- [ ] **Step 3: Implement `resend.ts`**

```ts
// src/lib/email/resend.ts
// Minimal Resend sender behind a function type so handlers can be tested
// with memorySender(). Failures are swallowed on purpose: every caller has
// already committed the thing the email is about (same stance as
// api/contact.ts and api/subscribe.ts).
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}
export type EmailSender = (msg: EmailMessage) => Promise<void>;

export function resendSender(env: {
  RESEND_API_KEY: string;
  CONTACT_FROM_EMAIL: string;
}): EmailSender {
  return async (msg) => {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `BioKEA <${env.CONTACT_FROM_EMAIL}>`,
          to: msg.to,
          reply_to: msg.replyTo ?? 'contact@biokea.ai',
          subject: msg.subject,
          text: msg.text,
        }),
      });
    } catch {
      // ignore — see header comment
    }
  };
}

export function memorySender(): EmailSender & { sent: EmailMessage[] } {
  const sent: EmailMessage[] = [];
  const fn = (async (msg: EmailMessage) => {
    sent.push(msg);
  }) as EmailSender & { sent: EmailMessage[] };
  fn.sent = sent;
  return fn;
}
```

- [ ] **Step 4: Implement `quote-payments.ts`**

```ts
// src/lib/email/quote-payments.ts
// The four notifications the Stripe webhook sends. Pure builders — the
// webhook handler decides when; these decide what. Spec §5.6.
import type { EmailMessage } from './resend';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';
import { usdCents } from '@/lib/payments/terms';

export const SITE_URL = 'https://biokea.ai';

const who = (q: QuoteRecord) => q.organization ?? q.name;
const date = (iso: string | null) => (iso ? iso.slice(0, 10) : '—');
const quoteUrl = (q: QuoteRecord) => `${SITE_URL}/quote/${q.access_token}`;
const adminUrl = (q: QuoteRecord) => `${SITE_URL}/admin/quotes/${q.quote_number}`;

function lineSummary(q: QuoteRecord): string {
  return q.lines
    .map((l) => {
      const markers = l.markers > 1 ? ` × ${l.markers} markers` : '';
      return `  · ${l.serviceTitle}: ${l.count.toLocaleString('en-US')} ${l.unitLabel}s${markers}`;
    })
    .join('\n');
}

function labBody(q: QuoteRecord, p: PaymentRecord, headline: string): string {
  return [
    headline,
    ``,
    `Customer: ${q.name} <${q.email}>`,
    `Organization: ${q.organization ?? '—'}`,
    `Rate: ${q.audience ?? '—'}`,
    `PO number: ${q.po_number ?? '—'}`,
    ``,
    lineSummary(q),
    ``,
    `Amount: ${usdCents(p.amount_cents)} · paid ${date(p.paid_at)}`,
    p.invoice_pdf ? `Invoice PDF: ${p.invoice_pdf}` : '',
    ``,
    `Admin: ${adminUrl(q)}`,
  ]
    .filter((l) => l !== '')
    .join('\n');
}

export function depositPaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Deposit received — BioKEA quote ${q.quote_number}`,
    text: [
      `Thanks — we've received your deposit of ${usdCents(p.amount_cents)} toward quote ${q.quote_number}.`,
      ``,
      `What happens next: the lab will email you shipping instructions and your sample`,
      `manifest within 2 business days. Once your samples arrive and pass QC, we start`,
      `sequencing; the balance is invoiced on the actual counts when results are delivered.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.invoice_pdf ? `Receipt / invoice PDF: ${p.invoice_pdf}` : '',
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

export function depositPaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage {
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[deposit paid] ${q.quote_number} · ${who(q)} · ${usdCents(p.amount_cents)}`,
    text: labBody(
      q,
      p,
      `Deposit paid on ${q.quote_number} — send shipping instructions + manifest.`,
    ),
  };
}

export function balancePaidCustomerEmail(q: QuoteRecord, p: PaymentRecord): EmailMessage {
  return {
    to: q.email,
    replyTo: 'contact@biokea.ai',
    subject: `Paid in full — BioKEA quote ${q.quote_number}`,
    text: [
      `Thanks — your balance of ${usdCents(p.amount_cents)} for quote ${q.quote_number} is paid, and the project is settled in full.`,
      ``,
      `Your quote: ${quoteUrl(q)}`,
      p.invoice_pdf ? `Invoice PDF: ${p.invoice_pdf}` : '',
      ``,
      `Thank you for working with BioKEA.`,
      ``,
      `— The BioKEA team`,
      `${SITE_URL}/`,
    ]
      .filter((l) => l !== '')
      .join('\n'),
  };
}

export function balancePaidLabEmail(q: QuoteRecord, p: PaymentRecord, labTo: string): EmailMessage {
  return {
    to: labTo,
    replyTo: q.email,
    subject: `[paid in full] ${q.quote_number} · ${who(q)} · ${usdCents(p.amount_cents)}`,
    text: labBody(q, p, `Balance paid on ${q.quote_number} — project settled.`),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/quote-payments-email.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/lib/email tests/unit/quote-payments-email.test.ts
git add src/lib/email tests/unit/quote-payments-email.test.ts
git commit -m "feat(payments): Resend sender abstraction and the four payment notification emails

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Deposit endpoint `POST /api/quote/[token]/deposit`

**Files:**

- Create: `src/pages/api/quote/[token]/deposit.ts`
- Modify: `src/env.d.ts` (add `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `CF_ACCESS_DEV_EMAIL` to the `cloudflare:workers` env type)
- Create: `.dev.vars.example`
- Test: `tests/unit/payments-deposit.test.ts`

**Interfaces:**

- Consumes: `PaymentsDb`, `MemoryDb` (Task 4); `PaymentsGateway`, `MemoryGateway` (Task 5); `depositLines`, `depositTotalCents`, `assertDepositSane`, `INVOICE_DAYS_UNTIL_DUE` (Task 2).
- Produces:

```ts
export interface DepositDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  now?: () => Date;
}
export async function handleDeposit(
  request: Request,
  token: string,
  deps: DepositDeps,
): Promise<Response>;
// 303 → hosted invoice URL on success or when a live deposit already exists
// 303 → /quote/<token>?pay=unavailable  (conversation band, expired, wrong status, bad form)
// 303 → /quote/<token>?pay=failed       (Stripe error; row rolled back)
// 404 plain text for an unknown token
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/payments-deposit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { handleDeposit } from '@/pages/api/quote/[token]/deposit';
import type { QuoteRecord } from '@/lib/payments/types';

const TOKEN = '11111111-1111-1111-1111-111111111111';
const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const NOW = () => new Date('2026-09-01T00:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: TOKEN,
    email: 'alice@state.edu',
    name: 'Alice',
    organization: 'State University',
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'quoted',
    audience: null,
    academic_attested_at: null,
    po_number: null,
    stripe_customer_id: null,
    ...over,
  };
}
function post(token: string, fields: Record<string, string>) {
  return new Request(`https://biokea.ai/api/quote/${token}/deposit`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://biokea.ai' },
    body: new URLSearchParams(fields),
  });
}

let db: MemoryDb;
let gateway: MemoryGateway;
beforeEach(() => {
  db = new MemoryDb();
  gateway = new MemoryGateway();
  db.quotes.push(quote());
});

describe('handleDeposit', () => {
  it('404s an unknown token', async () => {
    const res = await handleDeposit(
      post('22222222-2222-2222-2222-222222222222', { audience: 'commercial' }),
      '22222222-2222-2222-2222-222222222222',
      { db, gateway, now: NOW },
    );
    expect(res.status).toBe(404);
  });

  it('creates the deposit invoice at the commercial rate and redirects to the hosted page', async () => {
    const res = await handleDeposit(
      post(TOKEN, { audience: 'commercial', po_number: 'PO-77' }),
      TOKEN,
      { db, gateway, now: NOW },
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://invoice.stripe.test/in_test_1');

    const spec = gateway.created[0];
    expect(spec.kind).toBe('deposit');
    expect(spec.customer).toEqual({
      id: null,
      email: 'alice@state.edu',
      name: 'Alice',
      organization: 'State University',
      quoteId: 'q1',
    });
    expect(spec.quoteNumber).toBe('BK-2026-0142');
    expect(spec.daysUntilDue).toBe(30);
    expect(spec.idempotencyKey).toBe('deposit:q1');
    expect(spec.customFields).toEqual([
      { name: 'Quote', value: 'BK-2026-0142' },
      { name: 'PO number', value: 'PO-77' },
    ]);
    expect(spec.footer).toBe(
      '50% deposit toward BioKEA quote BK-2026-0142 (valid to 2026-09-19). The balance is invoiced on actual sample counts when results are delivered.',
    );
    const expected =
      Math.round(q.lines[0].commercial.total * 100 * 0.5) +
      Math.round(q.lines[1].commercial.total * 100 * 0.5);
    expect(spec.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(expected);

    const p = db.payments[0];
    expect(p).toMatchObject({
      quote_id: 'q1',
      kind: 'deposit',
      status: 'open',
      amount_cents: expected,
      stripe_invoice_id: 'in_test_1',
      hosted_invoice_url: 'https://invoice.stripe.test/in_test_1',
      due_at: '2026-10-01T00:00:00.000Z',
    });
    expect(db.quotes[0]).toMatchObject({
      status: 'deposit_invoiced',
      audience: 'commercial',
      po_number: 'PO-77',
      stripe_customer_id: 'cus_test_1',
      academic_attested_at: null,
    });
  });

  it('records the academic attestation timestamp when the academic rate is chosen', async () => {
    await handleDeposit(post(TOKEN, { audience: 'academic', attest: 'true' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(db.quotes[0].audience).toBe('academic');
    expect(db.quotes[0].academic_attested_at).toBe('2026-09-01T00:00:00.000Z');
    expect(gateway.created[0].customFields).toEqual([{ name: 'Quote', value: 'BK-2026-0142' }]);
  });

  it('refuses academic without the attestation, and unknown audiences', async () => {
    for (const fields of [
      { audience: 'academic' },
      { audience: 'academic', attest: 'no' },
      { audience: 'wholesale' },
      {},
    ]) {
      const res = await handleDeposit(post(TOKEN, fields), TOKEN, { db, gateway, now: NOW });
      expect(res.status).toBe(303);
      expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
    }
    expect(gateway.created).toHaveLength(0);
    expect(db.payments).toHaveLength(0);
  });

  it('is unavailable for conversation-band, expired, or already-progressed quotes', async () => {
    for (const over of [
      { needs_conversation: true },
      { expires_at: '2026-08-31T00:00:00Z' },
      { status: 'deposit_paid' as const },
    ]) {
      db.quotes[0] = quote(over);
      const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
        db,
        gateway,
        now: NOW,
      });
      expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
    }
    expect(gateway.created).toHaveLength(0);
  });

  it('is idempotent: a second submit returns the existing live invoice URL without calling Stripe again', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, { db, gateway, now: NOW });
    const res = await handleDeposit(post(TOKEN, { audience: 'academic', attest: 'true' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe('https://invoice.stripe.test/in_test_1');
    expect(gateway.created).toHaveLength(1);
    expect(db.payments).toHaveLength(1);
    expect(db.quotes[0].audience).toBe('commercial'); // first choice sticks
  });

  it('still returns the live URL when the quote expired after the invoice was issued', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, { db, gateway, now: NOW });
    db.quotes[0].expires_at = '2026-08-31T00:00:00Z';
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe('https://invoice.stripe.test/in_test_1');
  });

  it('rolls back the row and redirects with ?pay=failed when Stripe throws', async () => {
    gateway.failNext = new Error('stripe down');
    const res = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=failed`);
    expect(db.payments).toHaveLength(0);
    expect(db.quotes[0].status).toBe('quoted');
    // and the customer can try again
    const again = await handleDeposit(post(TOKEN, { audience: 'commercial' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(again.headers.get('location')).toBe('https://invoice.stripe.test/in_test_1');
  });

  it('trims and length-limits the PO number', async () => {
    await handleDeposit(post(TOKEN, { audience: 'commercial', po_number: '  PO-1  ' }), TOKEN, {
      db,
      gateway,
      now: NOW,
    });
    expect(db.quotes[0].po_number).toBe('PO-1');
    db.quotes[0] = quote();
    db.payments = [];
    gateway = new MemoryGateway();
    const res = await handleDeposit(
      post(TOKEN, { audience: 'commercial', po_number: 'x'.repeat(65) }),
      TOKEN,
      { db, gateway, now: NOW },
    );
    expect(res.headers.get('location')).toBe(`/quote/${TOKEN}?pay=unavailable`);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-deposit.test.ts`
Expected: FAIL — cannot resolve `@/pages/api/quote/[token]/deposit`.

- [ ] **Step 3: Implement the endpoint**

```ts
// src/pages/api/quote/[token]/deposit.ts
//
// "Pay 50% deposit" on /quote/<token>. Creates the Stripe customer +
// deposit invoice and sends the browser to Stripe's hosted invoice page.
// A plain form post so it works without JavaScript; every non-success
// path is a 303 back to the quote page with ?pay=… (spec §5.3, with the
// redirect deviation noted in the plan's Global Constraints).
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type PaymentsGateway, makeStripe, stripeGateway } from '@/lib/payments/gateway';
import {
  DEPOSIT_FRACTION,
  INVOICE_DAYS_UNTIL_DUE,
  assertDepositSane,
  depositLines,
  depositTotalCents,
} from '@/lib/payments/terms';
import type { QuoteRecord } from '@/lib/payments/types';

export const prerender = false;

const FormSchema = z
  .object({
    audience: z.enum(['academic', 'commercial']),
    attest: z.string().optional(),
    po_number: z
      .string()
      .trim()
      .max(64)
      .regex(/^[^\r\n]*$/)
      .optional()
      .or(z.literal('')),
  })
  .refine((f) => f.audience !== 'academic' || f.attest === 'true', {
    message: 'academic requires attestation',
  });

export interface DepositDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  now?: () => Date;
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });
const back = (token: string, reason: 'unavailable' | 'failed') =>
  seeOther(`/quote/${token}?pay=${reason}`);

async function liveDepositUrl(db: PaymentsDb, quote: QuoteRecord): Promise<string | null> {
  const payments = await db.listPayments(quote.id);
  const live = payments.find(
    (p) => p.kind === 'deposit' && (p.status === 'open' || p.status === 'paid'),
  );
  return live?.hosted_invoice_url ?? null;
}

export async function handleDeposit(
  request: Request,
  token: string,
  deps: DepositDeps,
): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const quote = await deps.db.getQuoteByToken(token);
  if (!quote) return new Response('Quote not found', { status: 404 });

  // Idempotency first: a second submit (double click, back button, or the
  // quote expiring after the invoice went out) just goes to the invoice.
  const existing = await liveDepositUrl(deps.db, quote);
  if (existing) return seeOther(existing);

  const expired = Date.parse(quote.expires_at) < now().getTime();
  if (quote.status !== 'quoted' || quote.needs_conversation || expired)
    return back(token, 'unavailable');

  let form: z.infer<typeof FormSchema>;
  try {
    const fd = await request.formData();
    const fields: Record<string, string> = {};
    for (const [k, v] of fd.entries()) fields[k] = typeof v === 'string' ? v : '';
    const parsed = FormSchema.safeParse(fields);
    if (!parsed.success) return back(token, 'unavailable');
    form = parsed.data;
  } catch {
    return back(token, 'unavailable');
  }

  const lines = depositLines(quote.lines, form.audience);
  const amountCents = depositTotalCents(lines);
  const total = form.audience === 'academic' ? quote.total_academic : quote.total_commercial;
  assertDepositSane(total, amountCents, lines.length); // throws → 500 via the wrapper; deliberate

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'deposit',
    amount_cents: amountCents,
  });
  if (inserted === 'conflict') {
    // Lost a race with a concurrent submit; that one owns the invoice.
    const url = await liveDepositUrl(deps.db, quote);
    return url ? seeOther(url) : back(token, 'failed');
  }

  const poNumber = form.po_number && form.po_number.length > 0 ? form.po_number : null;
  const pct = `${Math.round(DEPOSIT_FRACTION * 100)}%`;
  const customFields = [{ name: 'Quote', value: quote.quote_number }];
  if (poNumber) customFields.push({ name: 'PO number', value: poNumber });

  let created;
  try {
    created = await deps.gateway.createInvoice({
      customer: {
        id: quote.stripe_customer_id,
        email: quote.email,
        name: quote.name,
        organization: quote.organization,
        quoteId: quote.id,
      },
      kind: 'deposit',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lines,
      footer:
        `${pct} deposit toward BioKEA quote ${quote.quote_number} (valid to ${quote.expires_at.slice(0, 10)}).` +
        ` The balance is invoiced on actual sample counts when results are delivered.`,
      customFields,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
      idempotencyKey: `deposit:${quote.id}`,
    });
  } catch {
    await deps.db.deletePayment(inserted.id);
    return back(token, 'failed');
  }

  await deps.db.updatePayment(inserted.id, {
    stripe_invoice_id: created.invoiceId,
    hosted_invoice_url: created.hostedInvoiceUrl,
    invoice_pdf: created.invoicePdf,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    status: 'deposit_invoiced',
    audience: form.audience,
    academic_attested_at: form.audience === 'academic' ? now().toISOString() : null,
    po_number: poNumber,
    stripe_customer_id: created.customerId,
  });

  return seeOther(created.hostedInvoiceUrl);
}

export async function POST({ request, params }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
  };
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !e?.STRIPE_SECRET_KEY) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  const token = params.token ?? '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return new Response('Quote not found', { status: 404 });
  }
  return handleDeposit(request, token, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: stripeGateway(makeStripe(e.STRIPE_SECRET_KEY)),
  });
}
```

- [ ] **Step 4: Extend the env typing and add `.dev.vars.example`**

In `src/env.d.ts`, inside `declare module 'cloudflare:workers'` → `env`, add after `TURNSTILE_SECRET_KEY?: string;`:

```ts
    // Stripe — Worker secrets. sk_test_… in dev/.dev.vars, sk_live_… in prod.
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    // Cloudflare Access (admin gate) — plain vars in wrangler.toml.
    CF_ACCESS_TEAM_DOMAIN?: string; // e.g. biokea.cloudflareaccess.com
    CF_ACCESS_AUD?: string; // Application Audience tag
    // Dev-only bypass for the admin gate; ignored in production builds.
    CF_ACCESS_DEV_EMAIL?: string;
```

Create `.dev.vars.example` (confirm `.dev.vars` is in `.gitignore`; add it if not):

```
# Copy to .dev.vars for `npm run dev`. Never commit .dev.vars.
SUPABASE_URL=https://xkmfsxcaapyuxachtcsy.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
SUPABASE_SERVICE_ROLE_KEY=…
RESEND_API_KEY=re_…
CONTACT_FROM_EMAIL=notifications@biokea.ai
CONTACT_TO_EMAIL=contact@biokea.ai
# Stripe TEST keys (Dashboard → Developers → API keys, test mode)
STRIPE_SECRET_KEY=sk_test_…
# From `stripe listen --forward-to localhost:4321/api/stripe/webhook`
STRIPE_WEBHOOK_SECRET=whsec_…
# Admin gate bypass in dev only
CF_ACCESS_DEV_EMAIL=you@biokea.ai
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-deposit.test.ts && npm run check`
Expected: PASS (10 tests); `astro check` 0 errors.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "src/pages/api/quote/[token]/deposit.ts" tests/unit/payments-deposit.test.ts src/env.d.ts
git add "src/pages/api/quote/[token]/deposit.ts" tests/unit/payments-deposit.test.ts src/env.d.ts .dev.vars.example .gitignore
git commit -m "feat(payments): POST /api/quote/[token]/deposit creates the Stripe deposit invoice

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Stripe webhook `POST /api/stripe/webhook`

**Files:**

- Create: `src/pages/api/stripe/webhook.ts`
- Test: `tests/unit/payments-webhook.test.ts`

**Interfaces:**

- Consumes: `PaymentsDb`, `MemoryDb` (Task 4); `EmailSender`, `memorySender` (Task 6); the four email builders (Task 6); `makeStripe` (Task 5).
- Produces:

```ts
export interface WebhookDeps {
  db: PaymentsDb;
  email: EmailSender;
  labTo: string;
  stripe: Stripe;
  webhookSecret: string;
  now?: () => Date;
}
export async function handleStripeWebhook(request: Request, deps: WebhookDeps): Promise<Response>;
// 400 bad signature · 200 otherwise (including duplicates, unknown invoices, unhandled types)
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/payments-webhook.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import Stripe from 'stripe';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { memorySender } from '@/lib/email/resend';
import { handleStripeWebhook } from '@/pages/api/stripe/webhook';
import type { QuoteRecord } from '@/lib/payments/types';

const SECRET = 'whsec_test_secret';
// Only the webhooks helper is used; the key is never sent anywhere.
const stripe = new Stripe('sk_test_unused', { httpClient: Stripe.createFetchHttpClient() });
const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
const NOW = () => new Date('2026-09-02T10:00:00Z');

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: 'BK-2026-0142',
    access_token: 'tok',
    email: 'alice@state.edu',
    name: 'Alice',
    organization: 'State University',
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'deposit_invoiced',
    audience: 'academic',
    academic_attested_at: '2026-09-01T00:00:00Z',
    po_number: null,
    stripe_customer_id: 'cus_1',
    ...over,
  };
}

function event(id: string, type: string, invoice: Record<string, unknown>) {
  const payload = JSON.stringify({
    id,
    object: 'event',
    type,
    data: { object: { object: 'invoice', ...invoice } },
  });
  const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return new Request('https://biokea.ai/api/stripe/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': sig },
    body: payload,
  });
}
const depositInvoice = {
  id: 'in_1',
  invoice_pdf: 'https://pay.stripe.com/x.pdf',
  hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  metadata: { quote_id: 'q1', kind: 'deposit' },
};

let db: MemoryDb;
let email: ReturnType<typeof memorySender>;
const deps = () => ({
  db,
  email,
  labTo: 'contact@biokea.ai',
  stripe,
  webhookSecret: SECRET,
  now: NOW,
});

beforeEach(async () => {
  db = new MemoryDb();
  email = memorySender();
  db.quotes.push(quote());
  await db.insertPayment({
    quote_id: 'q1',
    kind: 'deposit',
    amount_cents: 480000,
    stripe_invoice_id: 'in_1',
    hosted_invoice_url: 'https://invoice.stripe.com/i/x',
  });
});

describe('handleStripeWebhook', () => {
  it('rejects a bad signature with 400 and touches nothing', async () => {
    const req = new Request('https://biokea.ai/api/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 't=1,v1=bad' },
      body: '{}',
    });
    expect((await handleStripeWebhook(req, deps())).status).toBe(400);
    expect(db.events.size).toBe(0);
  });

  it('invoice.paid on the deposit → payment paid, quote deposit_paid, two emails', async () => {
    const res = await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    expect(res.status).toBe(200);
    expect(db.payments[0]).toMatchObject({
      status: 'paid',
      paid_at: '2026-09-02T10:00:00.000Z',
      invoice_pdf: 'https://pay.stripe.com/x.pdf',
    });
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Deposit received — BioKEA quote BK-2026-0142',
      '[deposit paid] BK-2026-0142 · State University · $4,800.00',
    ]);
  });

  it('is idempotent on a redelivered event', async () => {
    await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    const res = await handleStripeWebhook(event('evt_1', 'invoice.paid', depositInvoice), deps());
    expect(res.status).toBe(200);
    expect(email.sent).toHaveLength(2);
  });

  it('invoice.voided on the deposit → payment void, quote back to quoted, no email', async () => {
    await handleStripeWebhook(event('evt_2', 'invoice.voided', depositInvoice), deps());
    expect(db.payments[0].status).toBe('void');
    expect(db.quotes[0].status).toBe('quoted');
    expect(email.sent).toHaveLength(0);
  });

  it('invoice.marked_uncollectible behaves like void for the quote status', async () => {
    await handleStripeWebhook(
      event('evt_3', 'invoice.marked_uncollectible', depositInvoice),
      deps(),
    );
    expect(db.payments[0].status).toBe('uncollectible');
    expect(db.quotes[0].status).toBe('quoted');
  });

  it('balance: paid → quote paid + two emails; voided → back to deposit_paid', async () => {
    await db.updatePayment('p1', { status: 'paid', paid_at: '2026-09-02T10:00:00Z' });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    await db.insertPayment({
      quote_id: 'q1',
      kind: 'balance',
      amount_cents: 411600,
      stripe_invoice_id: 'in_2',
    });
    const balanceInvoice = {
      id: 'in_2',
      invoice_pdf: 'https://pay.stripe.com/y.pdf',
      metadata: { quote_id: 'q1', kind: 'balance' },
    };

    await handleStripeWebhook(event('evt_4', 'invoice.voided', balanceInvoice), deps());
    expect(db.quotes[0].status).toBe('deposit_paid');
    expect(db.payments.find((p) => p.id === 'p2')?.status).toBe('void');

    await db.insertPayment({
      quote_id: 'q1',
      kind: 'balance',
      amount_cents: 411600,
      stripe_invoice_id: 'in_3',
    });
    await db.updateQuote('q1', { status: 'balance_invoiced' });
    await handleStripeWebhook(
      event('evt_5', 'invoice.paid', { ...balanceInvoice, id: 'in_3' }),
      deps(),
    );
    expect(db.quotes[0].status).toBe('paid');
    expect(email.sent.map((m) => m.subject)).toEqual([
      'Paid in full — BioKEA quote BK-2026-0142',
      '[paid in full] BK-2026-0142 · State University · $4,116.00',
    ]);
  });

  it('falls back to metadata (quote_id + kind) when the row has no invoice id yet, and fills it in', async () => {
    await db.updatePayment('p1', { stripe_invoice_id: null });
    await handleStripeWebhook(event('evt_6', 'invoice.paid', depositInvoice), deps());
    expect(db.payments[0]).toMatchObject({ status: 'paid', stripe_invoice_id: 'in_1' });
    expect(db.quotes[0].status).toBe('deposit_paid');
  });

  it('ignores invoices it does not know and event types it does not handle (200)', async () => {
    expect(
      (
        await handleStripeWebhook(
          event('evt_7', 'invoice.paid', { id: 'in_manual', metadata: {} }),
          deps(),
        )
      ).status,
    ).toBe(200);
    expect(
      (await handleStripeWebhook(event('evt_8', 'customer.created', { id: 'cus_9' }), deps()))
        .status,
    ).toBe(200);
    expect(db.payments[0].status).toBe('open');
    expect(email.sent).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-webhook.test.ts`
Expected: FAIL — cannot resolve `@/pages/api/stripe/webhook`.

- [ ] **Step 3: Implement the webhook**

```ts
// src/pages/api/stripe/webhook.ts
//
// Mirrors Stripe invoice state onto quotes/quote_payments and sends the
// notifications. Signature is the only auth (spec §5.3, §7). Idempotent
// via stripe_events. Everything is awaited before returning — `void`'d
// work gets torn down with the response on Workers.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import Stripe from 'stripe';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { makeStripe } from '@/lib/payments/gateway';
import { type EmailSender, resendSender } from '@/lib/email/resend';
import {
  balancePaidCustomerEmail,
  balancePaidLabEmail,
  depositPaidCustomerEmail,
  depositPaidLabEmail,
} from '@/lib/email/quote-payments';
import type { PaymentKind, PaymentRecord } from '@/lib/payments/types';

export const prerender = false;

export interface WebhookDeps {
  db: PaymentsDb;
  email: EmailSender;
  labTo: string;
  stripe: Stripe;
  webhookSecret: string;
  now?: () => Date;
}

const HANDLED = new Set(['invoice.paid', 'invoice.voided', 'invoice.marked_uncollectible']);
const ok = () =>
  new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

async function findPayment(db: PaymentsDb, invoice: Stripe.Invoice): Promise<PaymentRecord | null> {
  const byId = await db.findPaymentByInvoiceId(invoice.id);
  if (byId) return byId;
  // Race: our row exists but its stripe_invoice_id was not written yet.
  const quoteId = invoice.metadata?.quote_id;
  const kind = invoice.metadata?.kind as PaymentKind | undefined;
  if (!quoteId || (kind !== 'deposit' && kind !== 'balance')) return null;
  const open = (await db.listPayments(quoteId)).find(
    (p) => p.kind === kind && p.status === 'open' && p.stripe_invoice_id === null,
  );
  if (!open) return null;
  await db.updatePayment(open.id, { stripe_invoice_id: invoice.id });
  return { ...open, stripe_invoice_id: invoice.id };
}

export async function handleStripeWebhook(request: Request, deps: WebhookDeps): Promise<Response> {
  const now = deps.now ?? (() => new Date());
  const body = await request.text();
  const sig = request.headers.get('stripe-signature') ?? '';

  let event: Stripe.Event;
  try {
    event = await deps.stripe.webhooks.constructEventAsync(
      body,
      sig,
      deps.webhookSecret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response('Bad signature', { status: 400 });
  }

  if (!HANDLED.has(event.type)) return ok();
  const fresh = await deps.db.recordStripeEvent(event.id, event.type);
  if (!fresh) return ok();

  const invoice = event.data.object as Stripe.Invoice;
  const payment = await findPayment(deps.db, invoice);
  if (!payment) return ok(); // ad-hoc dashboard invoice, not ours to track
  const quote = await deps.db.getQuoteById(payment.quote_id);
  if (!quote) return ok();

  const urls = {
    hosted_invoice_url: invoice.hosted_invoice_url ?? payment.hosted_invoice_url,
    invoice_pdf: invoice.invoice_pdf ?? payment.invoice_pdf,
  };

  if (event.type === 'invoice.paid') {
    const paidAt = now().toISOString();
    await deps.db.updatePayment(payment.id, { status: 'paid', paid_at: paidAt, ...urls });
    await deps.db.updateQuote(quote.id, {
      status: payment.kind === 'deposit' ? 'deposit_paid' : 'paid',
    });
    const paid: PaymentRecord = { ...payment, status: 'paid', paid_at: paidAt, ...urls };
    if (payment.kind === 'deposit') {
      await deps.email(depositPaidCustomerEmail(quote, paid));
      await deps.email(depositPaidLabEmail(quote, paid, deps.labTo));
    } else {
      await deps.email(balancePaidCustomerEmail(quote, paid));
      await deps.email(balancePaidLabEmail(quote, paid, deps.labTo));
    }
    return ok();
  }

  // voided / marked_uncollectible: the invoice is dead; step the quote back
  // so the customer (deposit) or staff (balance) can issue a fresh one.
  const status = event.type === 'invoice.voided' ? 'void' : 'uncollectible';
  await deps.db.updatePayment(payment.id, { status, ...urls });
  await deps.db.updateQuote(quote.id, {
    status: payment.kind === 'deposit' ? 'quoted' : 'deposit_paid',
  });
  return ok();
}

export async function POST({ request }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
    STRIPE_WEBHOOK_SECRET?: string;
    RESEND_API_KEY?: string;
    CONTACT_FROM_EMAIL?: string;
    CONTACT_TO_EMAIL?: string;
  };
  if (
    !e?.SUPABASE_URL ||
    !e?.SUPABASE_SERVICE_ROLE_KEY ||
    !e?.STRIPE_SECRET_KEY ||
    !e?.STRIPE_WEBHOOK_SECRET ||
    !e?.RESEND_API_KEY ||
    !e?.CONTACT_FROM_EMAIL ||
    !e?.CONTACT_TO_EMAIL
  ) {
    return new Response('Webhook is not configured.', { status: 500 });
  }
  return handleStripeWebhook(request, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    email: resendSender({
      RESEND_API_KEY: e.RESEND_API_KEY,
      CONTACT_FROM_EMAIL: e.CONTACT_FROM_EMAIL,
    }),
    labTo: e.CONTACT_TO_EMAIL,
    stripe: makeStripe(e.STRIPE_SECRET_KEY),
    webhookSecret: e.STRIPE_WEBHOOK_SECRET,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-webhook.test.ts && npm run check`
Expected: PASS (8 tests). (`generateTestHeaderString` + `constructEventAsync` both run on Node's WebCrypto; no network.)

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/pages/api/stripe/webhook.ts tests/unit/payments-webhook.test.ts
git add src/pages/api/stripe/webhook.ts tests/unit/payments-webhook.test.ts
git commit -m "feat(payments): Stripe webhook mirrors invoice.paid/voided/uncollectible and sends notifications

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Cloudflare Access gate for `/admin/*` and `/api/admin/*`

**Files:**

- Modify: `package.json` (add `jose`)
- Create: `src/lib/access.ts`
- Modify: `src/middleware.ts`
- Modify: `src/env.d.ts` (App.Locals)
- Modify: `wrangler.toml` (vars)
- Test: `tests/unit/access.test.ts`
- Test: `tests/e2e/payments.spec.ts` (created here; extended in Tasks 11–12)

**Interfaces:**

- Produces:

```ts
// access.ts
export interface AccessConfig {
  teamDomain: string;
  aud: string;
}
export function accessIssuer(teamDomain: string): string; // https://<team>
export function remoteAccessKeys(teamDomain: string): JWTVerifyGetKey; // jose createRemoteJWKSet(https://<team>/cdn-cgi/access/certs)
export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  getKey: JWTVerifyGetKey,
): Promise<string>; // resolves to the email claim; throws otherwise
export const ADMIN_PREFIXES = ['/admin', '/api/admin'];
export function isAdminPath(pathname: string): boolean;
// middleware sets Astro.locals.adminEmail: string on admin routes
```

- [ ] **Step 1: Install jose**

Run: `npm install jose@^6`

- [ ] **Step 2: Write the failing unit tests**

```ts
// tests/unit/access.test.ts
import { describe, it, expect } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { verifyAccessJwt, accessIssuer, isAdminPath } from '@/lib/access';

const cfg = { teamDomain: 'biokea.cloudflareaccess.com', aud: 'aud-tag-123' };

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'k1';
  jwk.alg = 'RS256';
  return { privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}
async function token(
  privateKey: CryptoKey,
  over: { iss?: string; aud?: string; exp?: string; email?: string } = {},
) {
  const jwt = new SignJWT({ email: over.email ?? 'sean@biokea.ai', type: 'app' })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuedAt()
    .setIssuer(over.iss ?? accessIssuer(cfg.teamDomain))
    .setAudience(over.aud ?? cfg.aud)
    .setExpirationTime(over.exp ?? '10m');
  return jwt.sign(privateKey);
}

describe('verifyAccessJwt', () => {
  it('returns the email for a valid Access JWT', async () => {
    const { privateKey, getKey } = await keys();
    expect(await verifyAccessJwt(await token(privateKey), cfg, getKey)).toBe('sean@biokea.ai');
  });

  it('rejects wrong audience, wrong issuer, expired, and missing email', async () => {
    const { privateKey, getKey } = await keys();
    await expect(
      verifyAccessJwt(await token(privateKey, { aud: 'other' }), cfg, getKey),
    ).rejects.toThrow();
    await expect(
      verifyAccessJwt(
        await token(privateKey, { iss: 'https://evil.cloudflareaccess.com' }),
        cfg,
        getKey,
      ),
    ).rejects.toThrow();
    await expect(
      verifyAccessJwt(await token(privateKey, { exp: '-1m' }), cfg, getKey),
    ).rejects.toThrow();
    const noEmail = await new SignJWT({})
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(accessIssuer(cfg.teamDomain))
      .setAudience(cfg.aud)
      .setExpirationTime('10m')
      .sign(privateKey);
    await expect(verifyAccessJwt(noEmail, cfg, getKey)).rejects.toThrow(/email/);
  });

  it('rejects a token signed by another key', async () => {
    const a = await keys();
    const b = await keys();
    await expect(verifyAccessJwt(await token(b.privateKey), cfg, a.getKey)).rejects.toThrow();
  });
});

describe('isAdminPath', () => {
  it('matches /admin, /admin/…, /api/admin/… and nothing else', () => {
    for (const p of ['/admin', '/admin/', '/admin/quotes/BK-1', '/api/admin/quotes/BK-1/balance'])
      expect(isAdminPath(p)).toBe(true);
    for (const p of ['/', '/administrator', '/api/quote', '/adminx', '/quote/admin'])
      expect(isAdminPath(p)).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/unit/access.test.ts`
Expected: FAIL — cannot resolve `@/lib/access`.

- [ ] **Step 4: Implement `access.ts`**

```ts
// src/lib/access.ts
//
// Verifies the JWT Cloudflare Access puts on every request that passed
// its policy (header Cf-Access-Jwt-Assertion). Access already blocked
// unauthenticated users at the edge; this is defence in depth so a
// misconfigured or deleted Access app can never expose /admin. Spec §5.4.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface AccessConfig {
  teamDomain: string; // e.g. biokea.cloudflareaccess.com
  aud: string; // Access application "Application Audience (AUD) Tag"
}

export const ADMIN_PREFIXES = ['/admin', '/api/admin'] as const;

export function isAdminPath(pathname: string): boolean {
  return ADMIN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function accessIssuer(teamDomain: string): string {
  return `https://${teamDomain}`;
}

// Module-level so the JWKS is cached across requests within an isolate.
const keySets = new Map<string, JWTVerifyGetKey>();
export function remoteAccessKeys(teamDomain: string): JWTVerifyGetKey {
  let ks = keySets.get(teamDomain);
  if (!ks) {
    ks = createRemoteJWKSet(new URL(`${accessIssuer(teamDomain)}/cdn-cgi/access/certs`));
    keySets.set(teamDomain, ks);
  }
  return ks;
}

export async function verifyAccessJwt(
  token: string,
  cfg: AccessConfig,
  getKey: JWTVerifyGetKey,
): Promise<string> {
  const { payload } = await jwtVerify(token, getKey, {
    issuer: accessIssuer(cfg.teamDomain),
    audience: cfg.aud,
    algorithms: ['RS256'],
  });
  const email = payload.email;
  if (typeof email !== 'string' || email.length === 0)
    throw new Error('Access JWT has no email claim');
  return email;
}
```

- [ ] **Step 5: Extend the middleware**

Replace `src/middleware.ts` with:

```ts
// src/middleware.ts
//
// 1. CSRF: replaces Astro's built-in origin check (disabled in
//    astro.config.mjs) with the same rules plus an allow-list for
//    games.biokea.ai — see src/lib/origin-check.ts.
// 2. Admin gate: /admin/* and /api/admin/* require a valid Cloudflare
//    Access JWT — see src/lib/access.ts. In `astro dev` only,
//    CF_ACCESS_DEV_EMAIL stands in for the header.
import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { rejectCrossSiteForm } from '@/lib/origin-check';
import { isAdminPath, remoteAccessKeys, verifyAccessJwt } from '@/lib/access';

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.isPrerendered) return next();

  const rejection = rejectCrossSiteForm(context.request, context.url);
  if (rejection) return rejection;

  if (isAdminPath(context.url.pathname)) {
    const e = env as {
      CF_ACCESS_TEAM_DOMAIN?: string;
      CF_ACCESS_AUD?: string;
      CF_ACCESS_DEV_EMAIL?: string;
    };
    if (import.meta.env.DEV && e?.CF_ACCESS_DEV_EMAIL) {
      context.locals.adminEmail = e.CF_ACCESS_DEV_EMAIL;
      return next();
    }
    const token = context.request.headers.get('cf-access-jwt-assertion');
    if (!token || !e?.CF_ACCESS_TEAM_DOMAIN || !e?.CF_ACCESS_AUD) {
      return new Response('Forbidden', { status: 403 });
    }
    try {
      context.locals.adminEmail = await verifyAccessJwt(
        token,
        { teamDomain: e.CF_ACCESS_TEAM_DOMAIN, aud: e.CF_ACCESS_AUD },
        remoteAccessKeys(e.CF_ACCESS_TEAM_DOMAIN),
      );
    } catch {
      return new Response('Forbidden', { status: 403 });
    }
  }

  return next();
});
```

- [ ] **Step 6: Type `Astro.locals` and add the vars**

Append to `src/env.d.ts`:

```ts
declare namespace App {
  interface Locals {
    // Set by src/middleware.ts on /admin/* and /api/admin/* after the
    // Cloudflare Access JWT verifies (or CF_ACCESS_DEV_EMAIL in dev).
    adminEmail?: string;
  }
}
```

In `wrangler.toml` `[vars]`, after `SUPABASE_PUBLISHABLE_KEY = …`, add:

```toml
# Cloudflare Access application protecting /admin/* and /api/admin/*.
# Zero Trust → Access → Applications → biokea-admin → Overview shows the
# team domain; the AUD tag is under the application's settings. Both are
# public identifiers, not secrets. src/middleware.ts verifies the JWT.
CF_ACCESS_TEAM_DOMAIN = "REPLACE.cloudflareaccess.com"
CF_ACCESS_AUD = "REPLACE-with-application-audience-tag"
```

and add to the secrets comment block: `#   wrangler secret put STRIPE_SECRET_KEY` and `#   wrangler secret put STRIPE_WEBHOOK_SECRET`.

- [ ] **Step 7: Write the e2e gate test**

```ts
// tests/e2e/payments.spec.ts
import { test, expect } from '@playwright/test';

// The dev server has no CF_ACCESS_DEV_EMAIL in CI, so the admin gate must
// refuse. Locally with .dev.vars this test is skipped by the env check.
test('/admin is forbidden without a Cloudflare Access JWT', async ({ request }) => {
  test.skip(!!process.env.CF_ACCESS_DEV_EMAIL, 'dev bypass active locally');
  expect((await request.get('/admin')).status()).toBe(403);
  expect((await request.get('/admin/quotes/BK-2026-0001')).status()).toBe(403);
  expect(
    (
      await request.post('/api/admin/quotes/BK-2026-0001/balance', { form: { confirm: 'true' } })
    ).status(),
  ).toBe(403);
});

test('a forged Access header is refused', async ({ request }) => {
  const res = await request.get('/admin', { headers: { 'cf-access-jwt-assertion': 'not.a.jwt' } });
  expect(res.status()).toBe(403);
});
```

- [ ] **Step 8: Run all checks**

Run: `npx vitest run tests/unit/access.test.ts && npm run check && npx playwright test tests/e2e/payments.spec.ts tests/e2e/api-endpoints.spec.ts`
Expected: unit PASS (5 tests); `astro check` 0 errors; e2e PASS (the origin-check tests still pass, proving the middleware refactor kept rule 1). If Playwright reports the `/admin` route as 404 rather than 403, the middleware isn't running — check that `src/middleware.ts` still exports `onRequest`.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/lib/access.ts src/middleware.ts src/env.d.ts tests/unit/access.test.ts tests/e2e/payments.spec.ts
git add package.json package-lock.json src/lib/access.ts src/middleware.ts src/env.d.ts wrangler.toml tests/unit/access.test.ts tests/e2e/payments.spec.ts
git commit -m "feat(admin): Cloudflare Access JWT gate for /admin/* and /api/admin/*

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: Balance endpoint `POST /api/admin/quotes/[number]/balance`

**Files:**

- Create: `src/pages/api/admin/quotes/[number]/balance.ts`
- Test: `tests/unit/payments-balance.test.ts`

**Interfaces:**

- Consumes: `PaymentsDb`, `MemoryDb` (Task 4); `PaymentsGateway`, `MemoryGateway` (Task 5); `computeBalance`, `INVOICE_DAYS_UNTIL_DUE`, `usdCents` (Task 2); `locals.adminEmail` (Task 9).
- Produces:

```ts
export interface BalanceDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  actorEmail: string;
}
export function parseBalanceForm(
  fd: FormData,
): { inputs: QuoteLineInput[]; confirm: boolean } | null; // shared with the admin page's preview (Task 11)
export async function handleBalance(
  request: Request,
  quoteNumber: string,
  deps: BalanceDeps,
): Promise<Response>;
// preview (no confirm=true): 303 → /admin/quotes/<number>?preview=1&<same form fields>
// confirm=true, balance > 0: creates invoice → 303 → /admin/quotes/<number>?balance=invoiced
// confirm=true, balance <= 0: settled row, quote paid → 303 → /admin/quotes/<number>?balance=settled&refund=<cents>
// 404 unknown quote · 303 ?error=state (quote not deposit_paid / no paid deposit) · ?error=input (bad counts) · ?error=stripe
```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/unit/payments-balance.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { buildQuote } from '@/lib/pricing/quote';
import { MemoryDb } from '@/lib/payments/db';
import { MemoryGateway } from '@/lib/payments/gateway';
import { handleBalance, parseBalanceForm } from '@/pages/api/admin/quotes/[number]/balance';
import type { QuoteRecord } from '@/lib/payments/types';

const N = 'BK-2026-0142';
const q = buildQuote([
  { serviceSlug: 'barcoding', count: 800 },
  { serviceSlug: 'metabarcoding', count: 60, markers: 2 },
]);
const deps = () => ({ db, gateway, actorEmail: 'michelle@biokea.ai' });

function quote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'q1',
    quote_number: N,
    access_token: 'tok',
    email: 'alice@state.edu',
    name: 'Alice',
    organization: 'State University',
    lines: q.lines,
    total_academic: q.total.academic,
    total_commercial: q.total.commercial,
    needs_conversation: false,
    created_at: '2026-08-20T00:00:00Z',
    expires_at: '2026-09-19T00:00:00Z',
    status: 'deposit_paid',
    audience: 'academic',
    academic_attested_at: '2026-09-01T00:00:00Z',
    po_number: 'PO-77',
    stripe_customer_id: 'cus_1',
    ...over,
  };
}
function post(fields: Record<string, string>) {
  return new Request(`https://biokea.ai/api/admin/quotes/${N}/balance`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://biokea.ai' },
    body: new URLSearchParams(fields),
  });
}

let db: MemoryDb;
let gateway: MemoryGateway;
const DEPOSIT = 480000;
beforeEach(async () => {
  db = new MemoryDb();
  gateway = new MemoryGateway();
  db.quotes.push(quote());
  await db.insertPayment({
    quote_id: 'q1',
    kind: 'deposit',
    amount_cents: DEPOSIT,
    status: 'paid',
    stripe_invoice_id: 'in_1',
    paid_at: '2026-09-02T10:00:00Z',
  });
});

describe('parseBalanceForm', () => {
  it('reads counts[slug] and markers[slug] into engine inputs, dropping blanks', () => {
    const fd = new FormData();
    fd.set('counts[barcoding]', '743');
    fd.set('counts[metabarcoding]', '58');
    fd.set('markers[metabarcoding]', '2');
    fd.set('confirm', 'true');
    expect(parseBalanceForm(fd)).toEqual({
      inputs: [
        { serviceSlug: 'barcoding', count: 743 },
        { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
      ],
      confirm: true,
    });
  });
  it('returns null on a non-integer or missing count', () => {
    const fd = new FormData();
    fd.set('counts[barcoding]', '7.5');
    expect(parseBalanceForm(fd)).toBeNull();
    expect(parseBalanceForm(new FormData())).toBeNull();
  });
});

describe('handleBalance', () => {
  it('404s an unknown quote', async () => {
    expect(
      (await handleBalance(post({ 'counts[barcoding]': '1' }), 'BK-2026-9999', deps())).status,
    ).toBe(404);
  });

  it('preview: redirects back to the admin page carrying the fields', async () => {
    const res = await handleBalance(
      post({
        'counts[barcoding]': '743',
        'counts[metabarcoding]': '58',
        'markers[metabarcoding]': '2',
      }),
      N,
      deps(),
    );
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!, 'https://biokea.ai');
    expect(loc.pathname).toBe(`/admin/quotes/${N}`);
    expect(loc.searchParams.get('preview')).toBe('1');
    expect(loc.searchParams.get('counts[barcoding]')).toBe('743');
    expect(loc.searchParams.get('markers[metabarcoding]')).toBe('2');
    expect(gateway.created).toHaveLength(0);
  });

  it('confirm: creates the balance invoice at the recorded audience with the deposit credited', async () => {
    const res = await handleBalance(
      post({
        'counts[barcoding]': '743',
        'counts[metabarcoding]': '58',
        'markers[metabarcoding]': '2',
        confirm: 'true',
      }),
      N,
      deps(),
    );
    expect(res.headers.get('location')).toBe(`/admin/quotes/${N}?balance=invoiced`);
    const spec = gateway.created[0];
    expect(spec.kind).toBe('balance');
    expect(spec.customer.id).toBe('cus_1');
    expect(spec.idempotencyKey).toBe('balance:q1:1');
    expect(spec.customFields).toEqual([
      { name: 'Quote', value: N },
      { name: 'PO number', value: 'PO-77' },
    ]);
    expect(spec.footer).toBe(`Balance for BioKEA quote ${N}, computed on actual sample counts.`);
    const actual = buildQuote([
      { serviceSlug: 'barcoding', count: 743 },
      { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
    ]);
    expect(spec.lines.at(-1)).toEqual({
      description: 'Less deposit received (invoice in_1, paid 2026-09-02)',
      amountCents: -DEPOSIT,
    });
    expect(spec.lines.reduce((s, l) => s + l.amountCents, 0)).toBe(
      actual.total.academic * 100 - DEPOSIT,
    );

    const balance = db.payments.find((p) => p.kind === 'balance')!;
    expect(balance).toMatchObject({
      status: 'open',
      amount_cents: actual.total.academic * 100 - DEPOSIT,
      stripe_invoice_id: 'in_test_1',
      created_by: 'michelle@biokea.ai',
    });
    expect(balance.actual_lines).toEqual([
      { serviceSlug: 'barcoding', count: 743 },
      { serviceSlug: 'metabarcoding', count: 58, markers: 2 },
    ]);
    expect(db.quotes[0].status).toBe('balance_invoiced');
  });

  it('confirm with actual <= deposit: no invoice, settled row, quote paid, refund amount in the redirect', async () => {
    const res = await handleBalance(
      post({ 'counts[barcoding]': '100', confirm: 'true' }),
      N,
      deps(),
    );
    const actual = buildQuote([{ serviceSlug: 'barcoding', count: 100 }]).total.academic * 100;
    expect(res.headers.get('location')).toBe(
      `/admin/quotes/${N}?balance=settled&refund=${DEPOSIT - actual}`,
    );
    expect(gateway.created).toHaveLength(0);
    expect(db.payments.find((p) => p.kind === 'balance')).toMatchObject({
      status: 'settled',
      amount_cents: actual - DEPOSIT,
      stripe_invoice_id: null,
      created_by: 'michelle@biokea.ai',
    });
    expect(db.quotes[0].status).toBe('paid');
  });

  it('refuses when the quote is not deposit_paid or has no paid deposit', async () => {
    db.quotes[0].status = 'deposit_invoiced';
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '1', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=state`);
    db.quotes[0].status = 'deposit_paid';
    await db.updatePayment('p1', { status: 'void' });
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '1', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=state`);
  });

  it('refuses bad input', async () => {
    expect(
      (await handleBalance(post({ 'counts[barcoding]': 'lots' }), N, deps())).headers.get(
        'location',
      ),
    ).toBe(`/admin/quotes/${N}?error=input`);
    expect(
      (await handleBalance(post({ 'counts[nope]': '5', confirm: 'true' }), N, deps())).headers.get(
        'location',
      ),
    ).toBe(`/admin/quotes/${N}?error=input`);
  });

  it('reissues after a void with the next idempotency attempt', async () => {
    await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, deps());
    const first = db.payments.find((p) => p.kind === 'balance')!;
    await db.updatePayment(first.id, { status: 'void' });
    await db.updateQuote('q1', { status: 'deposit_paid' });
    await handleBalance(post({ 'counts[barcoding]': '750', confirm: 'true' }), N, deps());
    expect(gateway.created[1].idempotencyKey).toBe('balance:q1:2');
    expect(db.payments.filter((p) => p.kind === 'balance')).toHaveLength(2);
  });

  it('rolls back and reports a Stripe failure', async () => {
    gateway.failNext = new Error('down');
    expect(
      (
        await handleBalance(post({ 'counts[barcoding]': '743', confirm: 'true' }), N, deps())
      ).headers.get('location'),
    ).toBe(`/admin/quotes/${N}?error=stripe`);
    expect(db.payments.filter((p) => p.kind === 'balance')).toHaveLength(0);
    expect(db.quotes[0].status).toBe('deposit_paid');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/unit/payments-balance.test.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement the endpoint**

```ts
// src/pages/api/admin/quotes/[number]/balance.ts
//
// Staff-only (Cloudflare Access + middleware). Two-step: a plain submit
// bounces back to the admin page as a preview; confirm=true prices the
// actual counts with the same engine at the audience recorded at deposit
// time, credits the PAID deposit, and either sends the balance invoice or
// records a no-invoice settlement when nothing is owed. Spec §5.3.
import type { APIContext } from 'astro';
import { env } from 'cloudflare:workers';
import type { QuoteLineInput } from '@/lib/pricing/quote';
import { type PaymentsDb, SupabaseDb } from '@/lib/payments/db';
import { type PaymentsGateway, makeStripe, stripeGateway } from '@/lib/payments/gateway';
import { INVOICE_DAYS_UNTIL_DUE, computeBalance } from '@/lib/payments/terms';

export const prerender = false;

export interface BalanceDeps {
  db: PaymentsDb;
  gateway: PaymentsGateway;
  actorEmail: string;
}

const COUNT_KEY = /^counts\[([a-z0-9-]{1,64})\]$/;
const MARKER_KEY = /^markers\[([a-z0-9-]{1,64})\]$/;
const isPosInt = (s: string) => /^\d{1,7}$/.test(s) && Number(s) > 0;

// Also used by the admin page to render the preview from the query string.
export function parseBalanceForm(
  fd: FormData | URLSearchParams,
): { inputs: QuoteLineInput[]; confirm: boolean } | null {
  const counts = new Map<string, number>();
  const markers = new Map<string, number>();
  for (const [k, v] of fd.entries()) {
    const val = typeof v === 'string' ? v.trim() : '';
    const c = k.match(COUNT_KEY);
    if (c) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      counts.set(c[1], Number(val));
      continue;
    }
    const m = k.match(MARKER_KEY);
    if (m) {
      if (val === '') continue;
      if (!isPosInt(val)) return null;
      markers.set(m[1], Number(val));
    }
  }
  if (counts.size === 0) return null;
  const inputs: QuoteLineInput[] = [];
  for (const [slug, count] of counts) {
    const mk = markers.get(slug);
    inputs.push(
      mk && mk > 1 ? { serviceSlug: slug, count, markers: mk } : { serviceSlug: slug, count },
    );
  }
  return { inputs, confirm: fd.get('confirm') === 'true' };
}

const seeOther = (location: string) => new Response(null, { status: 303, headers: { location } });

export async function handleBalance(
  request: Request,
  quoteNumber: string,
  deps: BalanceDeps,
): Promise<Response> {
  const admin = `/admin/quotes/${quoteNumber}`;
  const quote = await deps.db.getQuoteByNumber(quoteNumber);
  if (!quote) return new Response('Quote not found', { status: 404 });

  let fd: FormData;
  try {
    fd = await request.formData();
  } catch {
    return seeOther(`${admin}?error=input`);
  }
  const form = parseBalanceForm(fd);
  if (!form) return seeOther(`${admin}?error=input`);

  if (!form.confirm) {
    const qs = new URLSearchParams({ preview: '1' });
    for (const [k, v] of fd.entries()) if (typeof v === 'string' && k !== 'confirm') qs.set(k, v);
    return seeOther(`${admin}?${qs.toString()}`);
  }

  const payments = await deps.db.listPayments(quote.id);
  const deposit = payments.find((p) => p.kind === 'deposit' && p.status === 'paid');
  if (quote.status !== 'deposit_paid' || !deposit || !quote.audience)
    return seeOther(`${admin}?error=state`);

  let computed: ReturnType<typeof computeBalance>;
  try {
    computed = computeBalance(form.inputs, quote.audience, {
      amountCents: deposit.amount_cents,
      invoiceLabel: deposit.stripe_invoice_id ?? 'deposit',
      paidAt: deposit.paid_at ?? deposit.created_at,
    });
  } catch {
    return seeOther(`${admin}?error=input`);
  }

  if (computed.balanceCents <= 0) {
    await deps.db.insertPayment({
      quote_id: quote.id,
      kind: 'balance',
      status: 'settled',
      amount_cents: computed.balanceCents,
      actual_lines: form.inputs,
      created_by: deps.actorEmail,
    });
    await deps.db.updateQuote(quote.id, { status: 'paid' });
    return seeOther(`${admin}?balance=settled&refund=${-computed.balanceCents}`);
  }

  const inserted = await deps.db.insertPayment({
    quote_id: quote.id,
    kind: 'balance',
    amount_cents: computed.balanceCents,
    actual_lines: form.inputs,
    created_by: deps.actorEmail,
  });
  if (inserted === 'conflict') return seeOther(`${admin}?error=state`);
  const attempt = payments.filter((p) => p.kind === 'balance').length + 1;

  const customFields = [{ name: 'Quote', value: quote.quote_number }];
  if (quote.po_number) customFields.push({ name: 'PO number', value: quote.po_number });

  let created;
  try {
    created = await deps.gateway.createInvoice({
      customer: {
        id: quote.stripe_customer_id,
        email: quote.email,
        name: quote.name,
        organization: quote.organization,
        quoteId: quote.id,
      },
      kind: 'balance',
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lines: computed.lines,
      footer: `Balance for BioKEA quote ${quote.quote_number}, computed on actual sample counts.`,
      customFields,
      daysUntilDue: INVOICE_DAYS_UNTIL_DUE,
      idempotencyKey: `balance:${quote.id}:${attempt}`,
    });
  } catch {
    await deps.db.deletePayment(inserted.id);
    return seeOther(`${admin}?error=stripe`);
  }

  await deps.db.updatePayment(inserted.id, {
    stripe_invoice_id: created.invoiceId,
    hosted_invoice_url: created.hostedInvoiceUrl,
    invoice_pdf: created.invoicePdf,
    due_at: created.dueAt,
  });
  await deps.db.updateQuote(quote.id, {
    status: 'balance_invoiced',
    stripe_customer_id: created.customerId,
  });
  return seeOther(`${admin}?balance=invoiced`);
}

export async function POST({ request, params, locals }: APIContext): Promise<Response> {
  const e = env as {
    SUPABASE_URL?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    STRIPE_SECRET_KEY?: string;
  };
  if (!e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY || !e?.STRIPE_SECRET_KEY) {
    return new Response('Payments are not configured.', { status: 500 });
  }
  if (!locals.adminEmail) return new Response('Forbidden', { status: 403 }); // middleware sets it; belt and braces
  const number = params.number ?? '';
  if (!/^BK-\d{4}-\d{4,}$/.test(number)) return new Response('Quote not found', { status: 404 });
  return handleBalance(request, number, {
    db: new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY),
    gateway: stripeGateway(makeStripe(e.STRIPE_SECRET_KEY)),
    actorEmail: locals.adminEmail,
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/unit/payments-balance.test.ts && npm run check`
Expected: PASS (10 tests); 0 type errors.

- [ ] **Step 5: Commit**

```bash
npx prettier --write "src/pages/api/admin/quotes/[number]/balance.ts" tests/unit/payments-balance.test.ts
git add "src/pages/api/admin/quotes/[number]/balance.ts" tests/unit/payments-balance.test.ts
git commit -m "feat(admin): POST /api/admin/quotes/[number]/balance previews and issues the balance invoice

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Admin pages `/admin` and `/admin/quotes/[number]`

**Files:**

- Create: `src/pages/admin/index.astro`
- Create: `src/pages/admin/quotes/[number].astro`
- Modify: `astro.config.mjs` (`hiddenFromSitemap` gains `'/admin'`)
- Modify: `tests/e2e/payments.spec.ts`

**Interfaces:**

- Consumes: `SupabaseDb` (Task 4); `computeBalance`, `usdCents` (Task 2); `parseBalanceForm` (Task 10); `locals.adminEmail` (Task 9).

- [ ] **Step 1: Write the index page**

```astro
---
// src/pages/admin/index.astro — staff list of recent quotes + payment status.
// Behind Cloudflare Access (src/middleware.ts). Operational, not analytical:
// Stripe is where the money lives.
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { env } from 'cloudflare:workers';
import { SupabaseDb } from '@/lib/payments/db';
import { usdCents } from '@/lib/payments/terms';
import type { QuoteRecord } from '@/lib/payments/types';

export const prerender = false;

const e = env as { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };
let quotes: QuoteRecord[] = [];
let configured = false;
if (e?.SUPABASE_URL && e?.SUPABASE_SERVICE_ROLE_KEY) {
  configured = true;
  quotes = await new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY).listRecentQuotes(100);
}
const admin = Astro.locals.adminEmail ?? 'unknown';
const total = (q: QuoteRecord) =>
  q.audience === 'commercial'
    ? q.total_commercial
    : q.audience === 'academic'
      ? q.total_academic
      : null;
---

<BaseLayout title="Admin — quotes — BioKEA" description="Internal." noindex>
  <section class="max-w-5xl mx-auto px-6 pt-16 pb-12">
    <Eyebrow>ADMIN · QUOTES</Eyebrow>
    <h1 class="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
      Quotes &amp; payments
    </h1>
    <p class="mt-1 text-xs text-slate-500">Signed in as {admin} · {quotes.length} most recent</p>
    {
      !configured && (
        <p class="mt-6 text-sm text-red-700">Supabase is not configured on this deployment.</p>
      )
    }
    <table
      class="mt-6 w-full border-collapse text-sm bg-white border border-slate-900/10 rounded-md overflow-hidden"
    >
      <thead>
        <tr class="bg-[var(--color-ink)] text-white text-left">
          <th class="px-3 py-2">Quote</th><th class="px-3 py-2">Created</th><th class="px-3 py-2"
            >Customer</th
          >
          <th class="px-3 py-2">Status</th><th class="px-3 py-2 text-right">Total (chosen rate)</th>
        </tr>
      </thead>
      <tbody>
        {
          quotes.map((q) => (
            <tr class="border-t border-slate-900/10">
              <td class="px-3 py-2 font-mono">
                <a
                  class="underline text-[var(--color-teal)]"
                  href={`/admin/quotes/${q.quote_number}`}
                >
                  {q.quote_number}
                </a>
              </td>
              <td class="px-3 py-2">{q.created_at.slice(0, 10)}</td>
              <td class="px-3 py-2">
                {q.organization ?? q.name} <span class="text-slate-500">· {q.email}</span>
              </td>
              <td class="px-3 py-2 font-mono text-xs">
                {q.status}
                {q.needs_conversation ? ' · conversation' : ''}
              </td>
              <td class="px-3 py-2 text-right font-mono">
                {total(q) === null
                  ? `${usdCents(q.total_academic * 100)} / ${usdCents(q.total_commercial * 100)}`
                  : usdCents(total(q)! * 100)}
              </td>
            </tr>
          ))
        }
      </tbody>
    </table>
  </section>
</BaseLayout>
```

- [ ] **Step 2: Write the quote page**

```astro
---
// src/pages/admin/quotes/[number].astro — one quote: lines, payments,
// and the balance form (preview → confirm). Spec §5.3.
import BaseLayout from '@/layouts/BaseLayout.astro';
import Eyebrow from '@/components/ui/Eyebrow.astro';
import { env } from 'cloudflare:workers';
import { SupabaseDb } from '@/lib/payments/db';
import { computeBalance, usdCents } from '@/lib/payments/terms';
import { parseBalanceForm } from '@/pages/api/admin/quotes/[number]/balance';
import type { PaymentRecord } from '@/lib/payments/types';

export const prerender = false;

const e = env as { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string };
const number = Astro.params.number ?? '';
if (!/^BK-\d{4}-\d{4,}$/.test(number) || !e?.SUPABASE_URL || !e?.SUPABASE_SERVICE_ROLE_KEY) {
  return new Response('Quote not found', { status: 404 });
}
const db = new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
const quote = await db.getQuoteByNumber(number);
if (!quote) return new Response('Quote not found', { status: 404 });
const payments: PaymentRecord[] = await db.listPayments(quote.id);
const deposit = payments.find((p) => p.kind === 'deposit' && p.status === 'paid') ?? null;

const url = Astro.url;
const flash = {
  error: url.searchParams.get('error'),
  balance: url.searchParams.get('balance'),
  refund: url.searchParams.get('refund'),
};

// Preview: the balance endpoint bounced the form back to us as query params.
let preview: ReturnType<typeof computeBalance> | null = null;
let previewError: string | null = null;
let previewInputs = new URLSearchParams();
if (url.searchParams.get('preview') === '1' && deposit && quote.audience) {
  previewInputs = url.searchParams;
  const parsed = parseBalanceForm(url.searchParams);
  if (!parsed) previewError = 'Counts must be positive whole numbers.';
  else {
    try {
      preview = computeBalance(parsed.inputs, quote.audience, {
        amountCents: deposit.amount_cents,
        invoiceLabel: deposit.stripe_invoice_id ?? 'deposit',
        paidAt: deposit.paid_at ?? deposit.created_at,
      });
    } catch (err) {
      previewError = err instanceof Error ? err.message : 'Invalid configuration.';
    }
  }
}
const canBalance = quote.status === 'deposit_paid' && deposit !== null && quote.audience !== null;
const val = (k: string) => previewInputs.get(k) ?? '';
---

<BaseLayout title={`Admin — ${quote.quote_number} — BioKEA`} description="Internal." noindex>
  <section class="max-w-4xl mx-auto px-6 pt-16 pb-12">
    <p class="text-xs">
      <a class="underline text-[var(--color-teal)]" href="/admin">← All quotes</a>
    </p>
    <Eyebrow>ADMIN · {quote.quote_number}</Eyebrow>
    <h1 class="mt-3 text-3xl font-semibold tracking-[-0.02em] text-[var(--color-ink)]">
      {quote.organization ?? quote.name}
    </h1>
    <p class="mt-1 text-sm text-slate-600">
      {quote.name} · <a class="underline" href={`mailto:${quote.email}`}>{quote.email}</a>
    </p>
    <p class="mt-1 font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">
      status {quote.status} · rate {quote.audience ?? '—'} · PO {quote.po_number ?? '—'} · valid to {
        quote.expires_at.slice(0, 10)
      }
      · <a class="underline" href={`/quote/${quote.access_token}`}>customer view</a>
      {
        quote.stripe_customer_id && (
          <>
            {' '}
            ·{' '}
            <a
              class="underline"
              href={`https://dashboard.stripe.com/customers/${quote.stripe_customer_id}`}
            >
              Stripe customer
            </a>
          </>
        )
      }
    </p>

    {
      flash.error && (
        <p class="mt-6 text-sm text-red-700 border-l-2 border-red-700 pl-3">
          {flash.error === 'state' &&
            'The quote is not ready for a balance (needs a paid deposit and status deposit_paid).'}
          {flash.error === 'input' && 'Those counts could not be priced — check the numbers.'}
          {flash.error === 'stripe' &&
            'Stripe rejected the invoice. Nothing was recorded; try again.'}
        </p>
      )
    }
    {
      flash.balance === 'invoiced' && (
        <p class="mt-6 text-sm text-green-800 border-l-2 border-green-700 pl-3">
          Balance invoice sent.
        </p>
      )
    }
    {
      flash.balance === 'settled' && (
        <p class="mt-6 text-sm text-amber-800 border-l-2 border-amber-600 pl-3">
          Nothing owed — actual total came in at or under the deposit.{' '}
          <strong>Refund {usdCents(Number(flash.refund ?? 0))}</strong> in Stripe: Payments → the
          deposit payment → Refund. The quote is marked paid.
        </p>
      )
    }

    <h2 class="mt-8 text-lg font-semibold">Quoted lines</h2>
    <table class="mt-2 w-full text-sm border-collapse bg-white border border-slate-900/10">
      <thead
        ><tr class="bg-slate-100 text-left"
          ><th class="px-3 py-2">Service</th><th class="px-3 py-2 text-right">Quoted count</th><th
            class="px-3 py-2 text-right">Academic</th
          ><th class="px-3 py-2 text-right">Commercial</th></tr
        ></thead
      >
      <tbody
        >{
          quote.lines.map((l) => (
            <tr class="border-t border-slate-900/10">
              <td class="px-3 py-2">
                {l.serviceTitle}
                {l.markers > 1 ? ` × ${l.markers} markers` : ''}
              </td>
              <td class="px-3 py-2 text-right font-mono">
                {l.count.toLocaleString('en-US')} {l.unitLabel}s
              </td>
              <td class="px-3 py-2 text-right font-mono">{usdCents(l.academic.total * 100)}</td>
              <td class="px-3 py-2 text-right font-mono">{usdCents(l.commercial.total * 100)}</td>
            </tr>
          ))
        }
      </tbody>
    </table>

    <h2 class="mt-8 text-lg font-semibold">Payments</h2>
    {
      payments.length === 0 ? (
        <p class="mt-2 text-sm text-slate-500">None yet.</p>
      ) : (
        <table class="mt-2 w-full text-sm border-collapse bg-white border border-slate-900/10">
          <thead>
            <tr class="bg-slate-100 text-left">
              <>
                <th class="px-3 py-2">Kind</th>
                <th class="px-3 py-2">Status</th>
                <th class="px-3 py-2 text-right">Amount</th>
                <th class="px-3 py-2">Due</th>
                <th class="px-3 py-2">Paid</th>
                <th class="px-3 py-2">Links</th>
                <th class="px-3 py-2">By</th>
              </>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr class="border-t border-slate-900/10">
                <td class="px-3 py-2">{p.kind}</td>
                <td class="px-3 py-2 font-mono text-xs">{p.status}</td>
                <td class="px-3 py-2 text-right font-mono">{usdCents(p.amount_cents)}</td>
                <td class="px-3 py-2">{p.due_at?.slice(0, 10) ?? '—'}</td>
                <td class="px-3 py-2">{p.paid_at?.slice(0, 10) ?? '—'}</td>
                <td class="px-3 py-2 text-xs">
                  {p.hosted_invoice_url && (
                    <a class="underline" href={p.hosted_invoice_url}>
                      hosted
                    </a>
                  )}{' '}
                  {p.invoice_pdf && (
                    <a class="underline" href={p.invoice_pdf}>
                      pdf
                    </a>
                  )}{' '}
                  {p.stripe_invoice_id && (
                    <a
                      class="underline"
                      href={`https://dashboard.stripe.com/invoices/${p.stripe_invoice_id}`}
                    >
                      stripe
                    </a>
                  )}
                </td>
                <td class="px-3 py-2 text-xs">{p.created_by ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }

    {
      canBalance && (
        <section class="mt-10 p-5 bg-[var(--color-cream)] border border-slate-900/10 rounded-md">
          <h2 class="text-lg font-semibold">Issue balance invoice</h2>
          <p class="mt-1 text-sm text-slate-600">
            Enter the counts actually received and QC-passed. Priced at the{' '}
            <strong>{quote.audience}</strong> rate; the paid deposit of{' '}
            <strong>{usdCents(deposit!.amount_cents)}</strong> is credited.
          </p>
          <form
            method="post"
            action={`/api/admin/quotes/${quote.quote_number}/balance`}
            class="mt-4"
          >
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left">
                  <>
                    <th class="py-1">Service</th>
                    <th class="py-1 text-right">Quoted</th>
                    <th class="py-1">Actual count</th>
                    <th class="py-1">Markers</th>
                  </>
                </tr>
              </thead>
              <tbody>
                {quote.lines.map((l) => (
                  <tr>
                    <td class="py-1 pr-3">{l.serviceTitle}</td>
                    <td class="py-1 pr-3 text-right font-mono">
                      {l.count.toLocaleString('en-US')}
                    </td>
                    <td class="py-1 pr-3">
                      <input
                        name={`counts[${l.serviceSlug}]`}
                        inputmode="numeric"
                        pattern="[0-9]*"
                        value={val(`counts[${l.serviceSlug}]`) || String(l.count)}
                        class="w-28 border border-slate-300 rounded px-2 py-1 font-mono"
                      />
                    </td>
                    <td class="py-1">
                      {l.serviceSlug === 'metabarcoding' ? (
                        <input
                          name={`markers[${l.serviceSlug}]`}
                          inputmode="numeric"
                          pattern="[0-9]*"
                          value={val(`markers[${l.serviceSlug}]`) || String(l.markers)}
                          class="w-16 border border-slate-300 rounded px-2 py-1 font-mono"
                        />
                      ) : (
                        <span class="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {previewError && <p class="mt-3 text-sm text-red-700">{previewError}</p>}
            {preview && (
              <div class="mt-4 text-sm">
                <table class="w-full border-collapse bg-white border border-slate-900/10">
                  <tbody>
                    {preview.lines.map((l) => (
                      <tr class="border-t border-slate-900/10">
                        <td class="px-3 py-1">{l.description}</td>
                        <td class="px-3 py-1 text-right font-mono">{usdCents(l.amountCents)}</td>
                      </tr>
                    ))}
                    <tr class="border-t-2 border-slate-900/20 font-semibold">
                      <td class="px-3 py-2">Balance due</td>
                      <td class="px-3 py-2 text-right font-mono">
                        {usdCents(preview.balanceCents)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {preview.balanceCents <= 0 ? (
                  <p class="mt-2 text-amber-800">
                    Nothing owed. Confirming records a settlement and marks the quote paid; you then
                    refund {usdCents(-preview.balanceCents)} in Stripe.
                  </p>
                ) : (
                  <p class="mt-2 text-slate-600">
                    Confirming creates and emails the balance invoice for{' '}
                    {usdCents(preview.balanceCents)}.
                  </p>
                )}
              </div>
            )}

            <div class="mt-4 flex gap-3">
              <button
                type="submit"
                name="confirm"
                value=""
                class="px-4 py-2 rounded-sm text-sm font-medium border border-slate-900/20 bg-white"
              >
                Preview
              </button>
              {preview && (
                <button
                  type="submit"
                  name="confirm"
                  value="true"
                  class="px-4 py-2 rounded-sm text-sm font-medium bg-[var(--color-ink)] text-[var(--color-cream)]"
                >
                  Confirm &amp; {preview.balanceCents <= 0 ? 'settle' : 'send invoice'}
                </button>
              )}
            </div>
          </form>
        </section>
      )
    }
  </section>
</BaseLayout>
```

- [ ] **Step 3: Hide admin from the sitemap**

In `astro.config.mjs`: `const hiddenFromSitemap = ['/404', '/projects/sdl-moonshot', '/admin'];`

- [ ] **Step 4: Extend the e2e spec**

Append to `tests/e2e/payments.spec.ts`:

```ts
// With the dev bypass (CF_ACCESS_DEV_EMAIL in .dev.vars) the pages render.
// Without Supabase configured, /admin says so and a quote page 404s.
test('admin pages render for a dev-bypassed staff user', async ({ page }) => {
  test.skip(!process.env.CF_ACCESS_DEV_EMAIL, 'needs the dev bypass');
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: /quotes & payments/i })).toBeVisible();
  await expect(page.getByText(`Signed in as ${process.env.CF_ACCESS_DEV_EMAIL}`)).toBeVisible();
});
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm run lint && npx playwright test tests/e2e/payments.spec.ts`
Then, locally with `.dev.vars` containing `CF_ACCESS_DEV_EMAIL` and the Supabase keys: `npm run dev`, open `http://localhost:4321/admin`, click a quote, confirm the balance form appears only for `deposit_paid` quotes (none yet — that's expected until Task 13's test-mode run).
Expected: 0 type errors; lint clean; e2e PASS.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "src/pages/admin/**/*.astro" tests/e2e/payments.spec.ts astro.config.mjs
git add src/pages/admin astro.config.mjs tests/e2e/payments.spec.ts
git commit -m "feat(admin): quotes index and per-quote page with balance preview/confirm form

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Customer payment panel on `/quote/[token]` + CTA copy

**Files:**

- Modify: `src/pages/quote/[token].astro`
- Modify: `src/pages/pricing.astro`, `src/pages/services.astro` (one sentence each)
- Modify: `tests/e2e/payments.spec.ts`

**Interfaces:**

- Consumes: `SupabaseDb` (Task 4); `panelView` (Task 3); `usdCents` (Task 2); `QuoteRecord`, `PaymentRecord` (Task 2).

- [ ] **Step 1: Switch the page's data loading to `SupabaseDb` and compute the panel**

In `src/pages/quote/[token].astro` frontmatter, replace everything from `interface QuoteLineRow {` through `const expired = …;` with:

```ts
import { SupabaseDb } from '@/lib/payments/db';
import { panelView } from '@/lib/payments/panel';
import { usdCents } from '@/lib/payments/terms';
import type { PaymentRecord, QuoteRecord } from '@/lib/payments/types';

const { token } = Astro.params;
const e = env as unknown as {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  STRIPE_SECRET_KEY?: string;
};

// UUID shape check first — avoids a pointless round trip on junk tokens.
const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token ?? '');

let quote: QuoteRecord | null = null;
let payments: PaymentRecord[] = [];
if (isUuid && e?.SUPABASE_URL && e?.SUPABASE_SERVICE_ROLE_KEY) {
  // Service role: the quotes table has no anonymous select policy. The page
  // renders on the Worker, so this key is never exposed to the client.
  const db = new SupabaseDb(e.SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY);
  quote = await db.getQuoteByToken(token!);
  if (quote) payments = await db.listPayments(quote.id);
}

if (!quote) return new Response('Quote not found', { status: 404 });

const usd = (n: number) => '$' + n.toLocaleString('en-US');
const fmtDate = (iso: string) => iso.slice(0, 10);
const expired = Date.parse(quote.expires_at) < Date.now();
const panel = panelView(quote, payments, new Date());
const paymentsLive = !!e?.STRIPE_SECRET_KEY; // hide the offer if Stripe isn't configured on this deployment
const payFlash = Astro.url.searchParams.get('pay'); // 'unavailable' | 'failed' | null
```

(Keep the existing `import { env } from 'cloudflare:workers';` and the two component imports; delete the local `QuoteLineRow`/`QuoteRow` interfaces — `QuoteRecord` replaces them.)

- [ ] **Step 2: Render the panel**

In the template, directly after the `needs_conversation` paragraph block and before the `<div class="mt-6 text-xs …">` fine-print block, insert:

```astro
{
  payFlash === 'failed' && (
    <p class="mt-5 text-sm text-[var(--color-ink)] bg-[rgba(190,24,93,0.08)] border-l-2 border-[var(--color-pink)] rounded-r-sm px-4 py-3 leading-relaxed print:hidden">
      <strong>Payment service unavailable.</strong> Your quote is unaffected — please try again in a
      few minutes.
    </p>
  )
}
{
  payFlash === 'unavailable' && (
    <p class="mt-5 text-sm text-[var(--color-ink)] bg-[rgba(146,64,14,0.1)] border-l-2 border-[var(--color-ochre)] rounded-r-sm px-4 py-3 leading-relaxed print:hidden">
      This quote can't be paid online right now. Email{' '}
      <a class="underline" href="mailto:contact@biokea.ai">
        contact@biokea.ai
      </a>{' '}
      and we'll sort it out.
    </p>
  )
}

{
  panel.kind === 'offer' && paymentsLive && (
    <section
      id="pay"
      class="mt-8 p-5 bg-[var(--color-cream)] border border-slate-900/10 rounded-md print:hidden"
    >
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">
        Start this project
      </p>
      <h2 class="mt-1 text-lg font-semibold text-[var(--color-ink)]">Pay a 50% deposit online</h2>
      <p class="mt-1 text-sm text-slate-600 leading-relaxed">
        You'll get a Stripe invoice you can pay by card, ACH debit, or bank transfer — or forward to
        your accounts-payable team. The balance is invoiced on the actual sample counts when results
        are delivered.
      </p>
      <form
        method="post"
        action={`/api/quote/${quote.access_token}/deposit`}
        class="mt-4 space-y-3 text-sm"
      >
        <label class="flex items-start gap-2">
          <input type="radio" name="audience" value="commercial" required class="mt-1" />
          <span>
            <strong>Commercial rate</strong> — deposit {usdCents(panel.depositCommercialCents)}
          </span>
        </label>
        <label class="flex items-start gap-2">
          <input type="radio" name="audience" value="academic" required class="mt-1" />
          <span>
            <strong>Academic / nonprofit rate</strong> — deposit{' '}
            {usdCents(panel.depositAcademicCents)}
          </span>
        </label>
        <label class="flex items-start gap-2 pl-6 text-xs text-slate-600">
          <input type="checkbox" name="attest" value="true" class="mt-0.5" />
          <span>
            Required for the academic rate: this work is for a degree-granting institution,
            government agency, or non-profit research organization.
          </span>
        </label>
        <label class="block pt-1">
          <span class="text-xs text-slate-600">PO number (optional — printed on the invoice)</span>
          <input
            name="po_number"
            maxlength="64"
            class="mt-1 w-full max-w-xs border border-slate-300 rounded px-2 py-1.5 font-mono"
          />
        </label>
        <button
          type="submit"
          class="mt-2 bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2.5 rounded-sm text-sm font-medium"
        >
          Continue to invoice →
        </button>
      </form>
    </section>
  )
}
{
  panel.kind === 'invoiced' && (
    <section class="mt-8 p-5 bg-[var(--color-cream)] border border-slate-900/10 rounded-md print:hidden">
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">
        {panel.phase === 'deposit' ? 'Deposit invoice' : 'Balance invoice'}
      </p>
      <p class="mt-1 text-sm text-[var(--color-ink)]">
        {panel.phase === 'deposit' ? 'Deposit' : 'Balance'} invoice for{' '}
        <strong>{usdCents(panel.amountCents)}</strong> sent to {quote.email}
        {panel.dueAt && ` — due ${fmtDate(panel.dueAt)}`}.
      </p>
      <div class="mt-3 flex gap-3">
        {panel.hostedInvoiceUrl && (
          <a
            href={panel.hostedInvoiceUrl}
            class="bg-[var(--color-ink)] text-[var(--color-cream)] px-4 py-2 rounded-sm text-sm font-medium"
          >
            Pay now →
          </a>
        )}
        {panel.invoicePdf && (
          <a
            href={panel.invoicePdf}
            class="px-4 py-2 rounded-sm text-sm font-medium border border-slate-900/20 bg-white"
          >
            Invoice PDF
          </a>
        )}
      </div>
    </section>
  )
}
{
  panel.kind === 'deposit_paid' && (
    <section class="mt-8 p-5 bg-[var(--color-cream)] border border-slate-900/10 rounded-md">
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">
        Deposit received
      </p>
      <p class="mt-1 text-sm text-[var(--color-ink)]">
        Deposit of <strong>{usdCents(panel.amountCents)}</strong> received on{' '}
        {fmtDate(panel.paidAt)}. The lab will send shipping instructions and your sample manifest
        within 2 business days.
      </p>
      {panel.invoicePdf && (
        <a
          href={panel.invoicePdf}
          class="mt-3 inline-block text-sm underline text-[var(--color-teal)] print:hidden"
        >
          Receipt / invoice PDF
        </a>
      )}
    </section>
  )
}
{
  panel.kind === 'paid' && (
    <section class="mt-8 p-5 bg-[var(--color-cream)] border border-slate-900/10 rounded-md">
      <p class="font-mono text-[11px] tracking-[0.1em] uppercase text-slate-500">Paid in full</p>
      <p class="mt-1 text-sm text-[var(--color-ink)]">Thank you — this project is settled.</p>
      <div class="mt-3 flex gap-4 text-sm print:hidden">
        {panel.depositPdf && (
          <a href={panel.depositPdf} class="underline text-[var(--color-teal)]">
            Deposit invoice PDF
          </a>
        )}
        {panel.balancePdf && (
          <a href={panel.balancePdf} class="underline text-[var(--color-teal)]">
            Balance invoice PDF
          </a>
        )}
      </div>
    </section>
  )
}
```

Also update the fine-print sentence "Academic/nonprofit rates require eligible institutional status, confirmed at ordering." to "Academic/nonprofit rates require eligible institutional status, attested when you pay the deposit."

- [ ] **Step 3: CTA copy on pricing + services**

Find the primary "Get a quote"/configurator CTA sentence on `src/pages/pricing.astro` and `src/pages/services.astro` (grep `href="/quote"`) and append the clause so each reads along the lines of: _"Configure a quote in a minute — and pay a 50% deposit online when you're ready."_ Do not add new sections; one sentence per page. (Per spec §9 step 4, ship this commit last in the rollout — it lands in the repo now but the deploy that carries it is the go-live deploy.)

- [ ] **Step 4: E2E**

Append to `tests/e2e/payments.spec.ts`:

```ts
test('the deposit endpoint fails closed on an unknown quote / unconfigured deployment', async ({
  request,
}) => {
  const res = await request.post('/api/quote/11111111-1111-1111-1111-111111111111/deposit', {
    headers: { origin: 'http://localhost:4321' },
    form: { audience: 'commercial' },
    maxRedirects: 0,
  });
  // 500 "not configured" (CI), or 404 when Supabase is configured locally but the token is unknown.
  expect([404, 500]).toContain(res.status());
});

test('the webhook refuses an unsigned post', async ({ request }) => {
  const res = await request.post('/api/stripe/webhook', { data: { id: 'evt_x' } });
  expect([400, 500]).toContain(res.status()); // 400 bad signature; 500 when unconfigured
});

test('pricing and services advertise the online deposit', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByText(/50% deposit online/i).first()).toBeVisible();
  await page.goto('/services');
  await expect(page.getByText(/50% deposit online/i).first()).toBeVisible();
});
```

- [ ] **Step 5: Verify**

Run: `npm run check && npm run lint && npm test && npx playwright test`
Expected: all green (existing `quote.spec.ts` "unknown quote token returns 404" still passes). Locally with `.dev.vars` (Supabase + `STRIPE_SECRET_KEY=sk_test_…`): create a quote at `/quote`, open its link, confirm the offer panel renders with both deposit amounts.

- [ ] **Step 6: Commit**

```bash
npx prettier --write "src/pages/quote/[token].astro" src/pages/pricing.astro src/pages/services.astro tests/e2e/payments.spec.ts
git add "src/pages/quote/[token].astro" src/pages/pricing.astro src/pages/services.astro tests/e2e/payments.spec.ts
git commit -m "feat(payments): deposit/balance payment panel on the quote page; advertise online deposit on pricing + services

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Docs, dashboard setup, and rollout

**Files:**

- Modify: `README.md` (Payments section)
- Modify: `docs/superpowers/specs/2026-08-16-stripe-payments-design.md` (only if reality diverged — record it under §10)

- [ ] **Step 1: README — add a "Payments" section after the existing deploy/secrets notes**

````markdown
## Payments (Stripe)

Customers pay a 50% deposit on a quote from `/quote/<token>`; staff issue the
balance from `/admin/quotes/<number>`. Design: `docs/superpowers/specs/2026-08-16-stripe-payments-design.md`.

Worker secrets (once per mode):

```bash
npx wrangler secret put STRIPE_SECRET_KEY        # sk_test_… first, sk_live_… at go-live
npx wrangler secret put STRIPE_WEBHOOK_SECRET    # from the dashboard webhook endpoint
```
````

`wrangler.toml` vars: `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD` (Cloudflare Access app for `/admin/*`).

Stripe dashboard (once, in test mode, then repeat in live):

1. Settings → Payments → Payment methods: enable **ACH Direct Debit** and **Bank transfers**.
2. Settings → Billing → Invoices: upload logo/brand colour; turn on "Email finalized invoices to customers" and receipts.
3. Developers → Webhooks → Add endpoint `https://biokea.ai/api/stripe/webhook`, events
   `invoice.paid`, `invoice.voided`, `invoice.marked_uncollectible`; copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

Cloudflare Zero Trust (once): Access → Applications → Add → Self-hosted; domain `biokea.ai`,
paths `/admin/*` and `/api/admin/*`; policy Allow emails ending `@biokea.ai` (Google or One-time PIN);
copy the team domain and the app's Audience (AUD) tag into `wrangler.toml`.

Local dev: copy `.dev.vars.example` → `.dev.vars` (test keys), run `npm run dev`, and in another
terminal `stripe listen --forward-to localhost:4321/api/stripe/webhook` (paste its `whsec_…` into `.dev.vars`).
Set `CF_ACCESS_DEV_EMAIL` to reach `/admin` locally.

````

- [ ] **Step 2: Commit the docs**

```bash
npx prettier --write README.md
git add README.md
git commit -m "docs: payments setup — Stripe secrets, dashboard steps, Cloudflare Access app, local webhook forwarding

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
````

- [ ] **Step 3: HUMAN STEP — test-mode rollout (spec §9)**

Sean, in order:

1. Confirm migration `0006` is applied (Task 1 step 4).
2. Cloudflare Access app created; `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` filled in `wrangler.toml` (commit + push).
3. Stripe **test** mode: payment methods, invoice branding, webhook endpoint (README step list). `wrangler secret put STRIPE_SECRET_KEY` (sk_test) and `STRIPE_WEBHOOK_SECRET`.
4. Push → deploy. Then walk the checklist on production with test keys:
   - `/quote` → create a quote with your own email → open its link → offer panel shows both deposit amounts.
   - Pay deposit, commercial rate, PO `TEST-1` → hosted invoice shows card / ACH / bank transfer, footer, Quote + PO fields → pay with `4242 4242 4242 4242`.
   - Within seconds: quote page shows _Deposit received_; two emails arrive (customer + contact@); `/admin/quotes/<n>` shows the paid deposit.
   - `/admin/quotes/<n>`: enter actual counts **above** the estimate → Preview → Confirm → balance invoice arrives; pay it → quote page _Paid in full_; two more emails.
   - Repeat with a second quote: pay deposit, then void the invoice in Stripe → quote returns to the offer state; pay again (new invoice).
   - Third quote: actual counts **below** the deposit → Confirm → _settled_ banner with refund amount; quote _Paid in full_ with no balance PDF.
   - ACH test: pay a deposit with Stripe's test bank account (`000123456789` / routing `110000000`) → invoice shows _processing_, then `invoice.paid` lands (test mode: instant).
5. Record anything that diverged from the spec in §10 of the spec and commit.

- [ ] **Step 4: HUMAN STEP — go live**

1. Stripe live mode: repeat payment-methods + branding + webhook (live endpoint, new signing secret).
2. `wrangler secret put STRIPE_SECRET_KEY` (sk_live) and `STRIPE_WEBHOOK_SECRET` (live). Deploy is unchanged — secrets only.
3. One real $1 deposit? Not possible from the rate card; instead pay the smallest real quote you'd accept (e.g. 1 barcoding specimen, $16 → $8 deposit) with a personal card, confirm the emails and the admin page, then refund it in Stripe.
4. Only now merge/deploy the pricing + services CTA copy if it was held back (Task 12 step 3) — the capability is proven live.

---

## Self-review against the spec

- **§4 states / panel** → Task 3 (view-model) + Task 12 (render), transitions in Task 8. Expired-but-invoiced remains payable: Task 3 test + Task 7 idempotency test.
- **§5.1 Stripe mapping** → Task 5 (params, metadata, custom fields, payment methods, footer, negative lines, sendInvoice); idempotency keys in Tasks 7/10.
- **§5.2 data model** → Task 1; DB access Task 4.
- **§5.3 endpoints** → Tasks 7, 8, 10; admin pages Task 11. Redirect-instead-of-409 and no-engine-flag deviations are declared in Global Constraints.
- **§5.4 Access** → Task 9 (jose, JWKS cache, dev bypass under DEV only, `locals.adminEmail`).
- **§5.5 money** → Task 2 (per-line rounding, sanity bound, balance from paid deposit).
- **§5.6 emails** → Task 6; sent from Task 8.
- **§5.7 pages** → Tasks 11, 12; sitemap hide in Task 11.
- **§5.8 config** → env typing (Task 7), vars (Task 9), `.dev.vars.example` (Task 7), README + dashboard steps (Task 13).
- **§6 error handling / idempotency** → Tasks 4 (conflict, event insert-or-skip), 7 (rollback, race), 8 (duplicate, metadata fallback, unknown invoice), 10 (settled path, reissue attempt).
- **§7 security** → origin-check unchanged (Task 9 keeps rule 1; e2e re-run), Access double gate (Task 9 + `POST` belt-and-braces in Task 10), signature-only webhook (Task 8).
- **§8 testing** → every task carries unit tests; e2e in Tasks 9/11/12; manual checklist Task 13. The spec's "migration static check" has no counterpart in this repo (no existing migration tests) — replaced by Task 1's grep sanity step and the human apply step.
- **§9 rollout** → Task 13.
- Type/name consistency checked: `handleDeposit(request, token, deps)`, `handleStripeWebhook(request, deps)`, `handleBalance(request, quoteNumber, deps)`, `parseBalanceForm(FormData|URLSearchParams)`, `PaymentsDb`/`MemoryDb`, `PaymentsGateway`/`MemoryGateway`, `EmailSender`/`memorySender`, `panelView`, `computeBalance`, `depositLines`, `depositTotalCents`, `assertDepositSane`, `usdCents`, `verifyAccessJwt`, `isAdminPath`, `remoteAccessKeys`, `accessIssuer` — used with the same signatures throughout.
