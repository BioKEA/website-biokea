# Shopify Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Stripe payment rail with Shopify Draft Orders, launch `store.biokea.ai` as the storefront, and turn the `/quote` configurator into a shared widget that runs on both the store's service product pages and biokea.ai.

**Architecture:** The merged deposit/balance model (quotes, `quote_payments`, webhook state machine, admin balance flow, emails) is kept and made provider-neutral by migration `0007` + a rename sweep. `PaymentsGateway` gets a Shopify implementation (GraphQL Admin API via `fetch`, no SDK) that creates + sends a Draft Order; the webhook becomes `/api/shopify/webhook` (HMAC-SHA256, topics `orders/paid`, `draft_orders/delete`, `orders/cancelled`, `refunds/create`). The configurator moves into `src/widget/` and is built by a Vite library build to `public/widget/quote.{js,css}`; `/api/quote` gains CORS for the store origin and returns the quote token + a `paymentsEnabled` flag; the CSRF allow-list admits `https://store.biokea.ai`. Marketing pages link to the store.

**Tech Stack:** Astro v6 on Cloudflare Workers, Shopify GraphQL Admin API `2026-01`, Vite lib build, Supabase REST, Resend, vitest, Playwright, prettier.

**Spec:** `docs/superpowers/specs/2026-08-17-shopify-store-design.md` (binding). Inherits from `docs/superpowers/specs/2026-08-16-stripe-payments-design.md` everything it does not override.

## Global Constraints

- Provider-neutral names after Task 1 (use exactly these everywhere): `quote_payments.external_id` (draft-order GID), `hosted_url`, `pdf_url`, `provider` (`'shopify'`), `order_ref` (Shopify order name e.g. `#1042`), `external_order_id` (numeric order id as text); `quotes.external_customer_id`; table `webhook_events` (`id`, `provider`, `type`, `received_at`); `PaymentsDb.recordWebhookEvent(id, type)` / `deleteWebhookEvent(id)`; `CreatedInvoice { externalId, number, hostedUrl, pdfUrl, dueAt, amountDueCents, customerId: string | null }`.
- `InvoiceLineSpec.amountCents` ≥ 0 always; the balance's deposit credit travels as `CreateInvoiceSpec.credit = { title, amountCents }` and becomes a Shopify fixed-amount `appliedDiscount`.
- Shopify money is decimal dollars as strings (`"1234.00"`); convert from cents only inside the gateway; assert `Math.round(dollars*100) === cents`.
- Every draft order carries `tags: ['biokea', <kind>, 'payment:<paymentRowId>', 'quote:<quoteNumber>']` and `customAttributes` `quote_id`, `quote_number`, `kind`, `payment_id` (+ `po_number`); the webhook resolves the payment by the `payment:` tag first, `payment_id` attribute second, `external_id` third.
- Idempotency: before `draftOrderCreate` the gateway searches `draftOrders(query: "tag:payment:<paymentRowId>")` and reuses an OPEN draft.
- Webhook auth: `X-Shopify-Hmac-Sha256` == base64(HMAC-SHA256(rawBody, `SHOPIFY_WEBHOOK_SECRET`)), constant-time compare; 401 otherwise. Idempotency key: `X-Shopify-Webhook-Id`. State machine, `RANK`, step-back rules, un-record-on-failure: unchanged from the Stripe webhook.
- CORS on `/api/quote`: allowed origins `https://store.biokea.ai`, `https://biokea.ai` (+ `http://localhost:4321` in dev); preflight 204; header echoed only for allowed origins. `ALLOWED_ORIGINS` in `src/lib/origin-check.ts` gains `https://store.biokea.ai`.
- Widget: framework-free TS, IIFE bundle `public/widget/quote.js` + `public/widget/quote.css`, global `BioKEAQuote`, mounts on `#quote-widget`; keeps the existing `data-*` hooks (`data-service-toggle`, `data-count-input`, `data-count-slider`, `data-markers-input`, `data-total-academic`, `data-total-commercial`, `data-line-list`, `data-deadzone-callout`, `data-upsell-callout`, `data-conversation-notice`, `data-open-form`, `data-quote-form`, `data-quote-status`) so `tests/e2e/quote.spec.ts` keeps passing; own CSS under `.bk-quote` using site tokens with fallbacks; `apiBase` hardcoded `https://biokea.ai` in the bundle, overridable only via `mount(el, { apiBase })` for dev.
- `public/widget/` is git-ignored and built by `npm run widget:build` (`prebuild`, and `dev` runs it first).
- Env: secrets `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`; vars `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STORE_HANDLE`, optional `SHOPIFY_PAYMENT_TERMS_TEMPLATE` (default `NET_30`). All `STRIPE_*` names removed from code, types, docs.
- Handler pattern unchanged: exported `handleX(request, …, deps)` unit-tested with `MemoryDb`/`MemoryGateway`/`memorySender`; thin `POST` reads `env` and 500s "not configured".
- Prettier + `astro check` + lint + `npm test` + `npx playwright test` green before each commit; commits end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Deviation from spec §4.1 (declared): no `manifest.json`/content-hash; the pages reference `/widget/quote.js?v=<APP_VERSION>` where `APP_VERSION` is `package.json` version — bump it when the widget changes. Cost: a manual bump; benefit: no manifest plumbing.

## File structure

| File                                                                                                                                                                                                             | Responsibility                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `migrations/0007_shopify.sql`                                                                                                                                                                                    | Renames + new columns.                              |
| `src/lib/payments/{types,db,panel,terms,gateway}.ts`                                                                                                                                                             | Renamed fields; Shopify gateway; `credit` in specs. |
| `src/lib/cors.ts`                                                                                                                                                                                                | Allow-list CORS helper.                             |
| `src/lib/origin-check.ts`                                                                                                                                                                                        | + store origin.                                     |
| `src/pages/api/quote.ts`                                                                                                                                                                                         | + OPTIONS/CORS, `token`, `paymentsEnabled`.         |
| `src/pages/api/quote/[token]/deposit.ts`, `src/pages/api/admin/quotes/[number]/balance.ts`                                                                                                                       | `paymentId`, `credit`, footer copy.                 |
| `src/pages/api/shopify/webhook.ts` (new), `src/pages/api/stripe/webhook.ts` (deleted)                                                                                                                            | Webhook.                                            |
| `src/widget/{entry,quote-widget,template}.ts`, `src/widget/quote.css`, `vite.widget.config.ts`                                                                                                                   | Widget.                                             |
| `src/pages/quote/index.astro`                                                                                                                                                                                    | Thin host.                                          |
| `src/pages/quote/[token].astro`, `src/pages/admin/*.astro`                                                                                                                                                       | Renamed fields, Shopify links.                      |
| `src/components/layout/Nav.astro`, `src/pages/pricing.astro`, `src/pages/services.astro`, `src/pages/subscribe.astro`                                                                                            | Store links.                                        |
| `src/env.d.ts`, `wrangler.toml`, `.dev.vars.example`, `.gitignore`, `package.json`, `.github/workflows/deploy.yml`, `README.md`, `docs/shopify/product-quote-section.liquid`                                     | Config + docs.                                      |
| Tests: `tests/unit/payments-*.test.ts` (updated), `tests/unit/cors.test.ts`, `tests/unit/shopify-webhook.test.ts`, `tests/unit/widget-template.test.ts`, `tests/e2e/quote.spec.ts`, `tests/e2e/payments.spec.ts` | Coverage.                                           |

---

### Task 1: Migration `0007` + provider-neutral rename sweep

**Files:**

- Create: `migrations/0007_shopify.sql`
- Modify: `src/lib/payments/types.ts`, `src/lib/payments/db.ts`, `src/lib/payments/panel.ts`, `src/lib/payments/gateway.ts` (types only), `src/pages/api/quote/[token]/deposit.ts`, `src/pages/api/admin/quotes/[number]/balance.ts`, `src/pages/api/stripe/webhook.ts`, `src/pages/quote/[token].astro`, `src/pages/admin/index.astro`, `src/pages/admin/quotes/[number].astro`, `src/lib/email/quote-payments.ts`, and every `tests/unit/payments-*.test.ts` + `tests/unit/quote-payments-email.test.ts`
- Test: existing suites must stay green after the rename (this task adds no behaviour).

**Interfaces:**

- Produces the names in Global Constraints. Concretely:

```ts
// types.ts
export interface PaymentRecord { id; quote_id; kind; status; amount_cents; currency; provider: 'shopify'; external_id: string | null; hosted_url: string | null; pdf_url: string | null; order_ref: string | null; external_order_id: string | null; due_at; paid_at; actual_lines; created_by; created_at }
export interface QuoteRecord { …; external_customer_id: string | null }   // was stripe_customer_id
// db.ts
recordWebhookEvent(id: string, type: string): Promise<boolean>; deleteWebhookEvent(id: string): Promise<void>;
// PaymentPatch adds order_ref, external_order_id; NewPayment adds provider?, external_id, hosted_url, pdf_url
// gateway.ts
export interface CreatedInvoice { externalId: string; number: string | null; hostedUrl: string; pdfUrl: string | null; dueAt: string | null; amountDueCents: number; customerId: string | null }
```

- [ ] **Step 1: Write the migration**

```sql
-- 0007_shopify.sql
--
-- The payment rail moved from Stripe Invoices to Shopify Draft Orders before
-- anything reached production, so the Stripe-specific column names are
-- renamed to provider-neutral ones rather than duplicated. Apply after 0006.
-- Supabase Dashboard → SQL Editor, paste, run.

alter table public.quote_payments rename column stripe_invoice_id   to external_id;   -- Shopify DraftOrder GID
alter table public.quote_payments rename column hosted_invoice_url  to hosted_url;    -- draft invoiceUrl (Shopify checkout)
alter table public.quote_payments rename column invoice_pdf         to pdf_url;       -- unused for Shopify; kept nullable
alter table public.quote_payments
  add column if not exists provider          text not null default 'shopify' check (provider in ('shopify')),
  add column if not exists order_ref         text,   -- Shopify order name once paid, e.g. #1042
  add column if not exists external_order_id text;   -- numeric Shopify order id as text, for webhook lookups
alter table public.quotes rename column stripe_customer_id to external_customer_id;

alter table public.stripe_events rename to webhook_events;
alter table public.webhook_events add column if not exists provider text not null default 'shopify';
-- Grows unbounded; safe to prune rows older than ~90 days.
```

- [ ] **Step 2: Rename sweep**

Run from the repo root and then fix what the compiler/tests report:

```bash
grep -rl "stripe_invoice_id\|hosted_invoice_url\|invoice_pdf\|stripe_customer_id\|stripe_events\|recordStripeEvent\|deleteStripeEvent\|invoiceId\b\|hostedInvoiceUrl\|invoicePdf\|invoiceNumber" src tests | sort
```

Apply, in every listed file: `stripe_invoice_id`→`external_id`, `hosted_invoice_url`→`hosted_url`, `invoice_pdf`→`pdf_url`, `stripe_customer_id`→`external_customer_id`, `stripe_events`→`webhook_events`, `recordStripeEvent`→`recordWebhookEvent`, `deleteStripeEvent`→`deleteWebhookEvent`; in `gateway.ts` `CreatedInvoice`: `invoiceId`→`externalId`, `invoiceNumber`→`number`, `hostedInvoiceUrl`→`hostedUrl`, `invoicePdf`→`pdfUrl`, `customerId: string` → `string | null`. Add `provider`, `order_ref`, `external_order_id` to `PaymentRecord`, `NewPayment` (`provider?`), `PaymentPatch`, `MemoryDb.insertPayment` defaults (`provider: 'shopify'`, `order_ref: null`, `external_order_id: null`), and the `SupabaseDb.recordWebhookEvent` body (`{ id, type, provider: 'shopify' }`). In `SupabaseDb`, the REST paths change to `webhook_events`. Panel/pages: `panel.ts` `hostedInvoiceUrl`/`invoicePdf` view-model keys become `hostedUrl`/`pdfUrl` and `depositPdf`/`balancePdf` stay. Update tests' fixtures/assertions to the new names (search the same list in `tests/`).

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npx prettier --check "src/**/*" "tests/**/*"`
Expected: 0 type errors; all 206 tests pass (renamed, not reduced); prettier clean. Also `grep -rn "stripe_\|Stripe" src --include=*.ts --include=*.astro | grep -v "pages/api/stripe/webhook.ts\|gateway.ts"` should list nothing (the two remaining Stripe files are replaced in Tasks 3 and 5).

- [ ] **Step 4: Commit**

```bash
git add -A migrations src tests
git commit -m "refactor(payments): provider-neutral names — migration 0007, external_id/hosted_url/pdf_url, webhook_events

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Balance credit + gateway spec changes (`terms.ts`, `gateway.ts` types, deposit/balance endpoints)

**Files:**

- Modify: `src/lib/payments/terms.ts`, `src/lib/payments/gateway.ts` (types + `MemoryGateway`), `src/pages/api/quote/[token]/deposit.ts`, `src/pages/api/admin/quotes/[number]/balance.ts`
- Test: `tests/unit/payments-terms.test.ts`, `tests/unit/payments-gateway.test.ts`, `tests/unit/payments-deposit.test.ts`, `tests/unit/payments-balance.test.ts`

**Interfaces:**

- Produces:

```ts
// terms.ts
export function computeBalance(
  inputs,
  audience,
  deposit,
): {
  actualTotalCents: number;
  balanceCents: number;
  lines: InvoiceLineSpec[];
  credit: { title: string; amountCents: number };
  actualLines: QuoteLine[];
};
// gateway.ts
export interface CreateInvoiceSpec {
  customer: InvoiceCustomer;
  kind: PaymentKind;
  quoteId: string;
  quoteNumber: string;
  paymentId: string;
  poNumber: string | null;
  lines: InvoiceLineSpec[];
  credit?: { title: string; amountCents: number };
  footer: string;
  daysUntilDue: number;
}
// (customFields and idempotencyKey are gone — tags/attributes and paymentId replace them)
```

- [ ] **Step 1: Update tests first**

In `tests/unit/payments-terms.test.ts` `computeBalance` block: `r.lines` has ONE entry (positive), and `r.credit` equals `{ title: 'Deposit received (invoice A1B2C3D4-0001, paid 2026-09-01)', amountCents: 480000 }`; `balanceCents` unchanged; add: `expect(r.lines.every((l) => l.amountCents >= 0)).toBe(true)`.
In `tests/unit/payments-gateway.test.ts` replace the Stripe-shaped tests with `MemoryGateway`-only tests (the Shopify implementation is Task 3): records specs, deterministic `externalId` `gid://shopify/DraftOrder/test-1`, `hostedUrl` `https://store.biokea.test/invoices/test-1`, `number` `#D1`, `pdfUrl` null, `customerId` null, `failNext`.
In `tests/unit/payments-deposit.test.ts`: `spec.paymentId === 'p1'`, `spec.poNumber === 'PO-77'`, no `customFields`/`idempotencyKey` assertions; footer becomes `50% deposit toward BioKEA quote BK-2026-0142 (valid to 2026-09-19). The balance is invoiced on actual sample counts when results are delivered. Pay here or from the emailed invoice; questions: contact@biokea.ai.`
In `tests/unit/payments-balance.test.ts`: `spec.credit` equals `{ title: 'Deposit received (invoice in_1, paid 2026-09-02)', amountCents: DEPOSIT }` (fixture deposit `external_id: 'in_1'` becomes `'gid://shopify/DraftOrder/1'` — the label uses `deposit.order_ref ?? deposit.external_id`, so with `order_ref: '#1001'` set in the fixture the title reads `Deposit received (order #1001, paid 2026-09-02)`; set the fixture and assert that string), lines all ≥ 0, sum of `spec.lines` equals actual total cents (credit is separate), `spec.paymentId` is the balance row id.

- [ ] **Step 2: Run to see the failures**

Run: `npx vitest run tests/unit/payments-terms.test.ts tests/unit/payments-gateway.test.ts tests/unit/payments-deposit.test.ts tests/unit/payments-balance.test.ts`
Expected: FAIL on the new assertions.

- [ ] **Step 3: Implement**

`terms.ts` `computeBalance`: keep the positive per-service lines; return `credit: { title: \`Deposit received (${deposit.invoiceLabel}, paid ${deposit.paidAt.slice(0,10)})\`, amountCents: deposit.amountCents }` instead of pushing a negative line. Rename the `DepositCredit.invoiceLabel` doc to "human label for the memo (order name or draft id)".
`gateway.ts`: replace `CreateInvoiceSpec` per the interface above; `MemoryGateway.createInvoice` returns `{ customerId: null, externalId: \`gid://shopify/DraftOrder/test-${n}\`, number: \`#D${n}\`, hostedUrl: \`https://store.biokea.test/invoices/test-${n}\`, pdfUrl: null, dueAt: '2026-10-01T00:00:00.000Z', amountDueCents: sum(lines) - (credit?.amountCents ?? 0) }`. Delete the Stripe implementation and `makeStripe`from this file (Task 3 adds the Shopify one) — temporarily export a placeholder`export function shopifyGateway(): PaymentsGateway { throw new Error('not implemented until Task 3') }`so the`POST`wrappers compile.`deposit.ts`: build spec with `paymentId: inserted.id`, `poNumber`, footer above; drop `customFields`/`idempotencyKey`. `balance.ts`: `credit: computed.credit`, label = `deposit.order_ref ? \`order ${deposit.order_ref}\` : (deposit.external_id ?? 'deposit')`, `paymentId: inserted.id`.

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/unit && npm run check`
Expected: green.

```bash
git add src/lib/payments src/pages/api tests/unit
git commit -m "feat(payments): balance credit as a discount; gateway spec keyed by payment row + PO; drop Stripe-specific fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Shopify gateway (`shopifyGateway`) + drop the `stripe` dependency

**Files:**

- Modify: `src/lib/payments/gateway.ts`, `package.json` (`npm uninstall stripe`)
- Test: `tests/unit/payments-gateway.test.ts`

**Interfaces:**

- Produces:

```ts
export interface ShopifyConfig {
  storeDomain: string;
  adminToken: string;
  apiVersion?: string /* default '2026-01' */;
  paymentTermsTemplate?: string; /* e.g. 'NET_30'; omit → due on receipt */
}
export function shopifyGateway(cfg: ShopifyConfig, fetchImpl?: typeof fetch): PaymentsGateway;
export function shopifyGraphql<T>(
  cfg: ShopifyConfig,
  query: string,
  variables: unknown,
  fetchImpl?: typeof fetch,
): Promise<T>; // throws on HTTP error or `errors`/`userErrors`
export const dollars = (cents: number) => string; // "1234.00"; throws if not integer cents
```

- [ ] **Step 1: Write the failing tests** (append to `tests/unit/payments-gateway.test.ts`)

```ts
import { shopifyGateway, dollars } from '@/lib/payments/gateway';

const cfg = {
  storeDomain: 'biokea.myshopify.com',
  adminToken: 'shpat_test',
  paymentTermsTemplate: 'NET_30',
};
const spec2 = { ...spec, paymentId: 'p1', poNumber: 'PO-77', credit: undefined };

// Records every GraphQL call and answers by operation name.
function fakeShopify(answers: Record<string, unknown>) {
  const calls: { op: string; variables: any; headers: Record<string, string>; url: string }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    const op = /^\s*(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? 'unknown';
    calls.push({
      op,
      variables: body.variables,
      headers: init.headers as Record<string, string>,
      url,
    });
    return new Response(JSON.stringify({ data: answers[op] ?? {} }), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

describe('dollars', () => {
  it('formats integer cents as a two-decimal string and rejects fractions', () => {
    expect(dollars(480000)).toBe('4800.00');
    expect(dollars(5)).toBe('0.05');
    expect(() => dollars(10.5)).toThrow();
  });
});

describe('shopifyGateway.createInvoice', () => {
  const okAnswers = {
    paymentTermsTemplates: {
      paymentTermsTemplates: [
        {
          id: 'gid://shopify/PaymentTermsTemplate/3',
          name: 'Net 30',
          paymentTermsType: 'NET',
          dueInDays: 30,
        },
      ],
    },
    findDraft: { draftOrders: { nodes: [] } },
    draftOrderCreate: {
      draftOrderCreate: {
        draftOrder: { id: 'gid://shopify/DraftOrder/11', name: '#D11' },
        userErrors: [],
      },
    },
    draftOrderInvoiceSend: {
      draftOrderInvoiceSend: {
        draftOrder: {
          id: 'gid://shopify/DraftOrder/11',
          name: '#D11',
          invoiceUrl: 'https://store.biokea.ai/11/invoices/abc',
          totalPriceSet: { shopMoney: { amount: '4800.00' } },
          paymentTerms: { paymentSchedules: { nodes: [{ dueAt: '2026-10-01T00:00:00Z' }] } },
        },
        userErrors: [],
      },
    },
  };

  it('looks for an existing draft by payment tag, creates one with tags/attributes/lines/terms, sends the invoice', async () => {
    const s = fakeShopify(okAnswers);
    const out = await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls.map((c) => c.op)).toEqual([
      'paymentTermsTemplates',
      'findDraft',
      'draftOrderCreate',
      'draftOrderInvoiceSend',
    ]);
    expect(s.calls[0].url).toBe('https://biokea.myshopify.com/admin/api/2026-01/graphql.json');
    expect(s.calls[0].headers['X-Shopify-Access-Token']).toBe('shpat_test');
    expect(s.calls[1].variables).toEqual({ query: 'tag:payment:p1' });
    const input = s.calls[2].variables.input;
    expect(input.email).toBe('a@b.edu');
    expect(input.taxExempt).toBe(true);
    expect(input.tags).toEqual(['biokea', 'deposit', 'payment:p1', 'quote:BK-2026-0142']);
    expect(input.customAttributes).toEqual([
      { key: 'quote_id', value: 'q1' },
      { key: 'quote_number', value: 'BK-2026-0142' },
      { key: 'kind', value: 'deposit' },
      { key: 'payment_id', value: 'p1' },
      { key: 'po_number', value: 'PO-77' },
    ]);
    expect(input.lineItems).toEqual([
      {
        title: 'Barcoding — 50% deposit',
        quantity: 1,
        originalUnitPrice: '4000.00',
        taxable: false,
        requiresShipping: false,
      },
      {
        title: 'eDNA — 50% deposit',
        quantity: 1,
        originalUnitPrice: '800.00',
        taxable: false,
        requiresShipping: false,
      },
    ]);
    expect(input.note).toBe(spec2.footer);
    expect(input.paymentTerms).toEqual({
      paymentTermsTemplateId: 'gid://shopify/PaymentTermsTemplate/3',
    });
    expect(input.appliedDiscount).toBeUndefined();
    expect(out).toEqual({
      customerId: null,
      externalId: 'gid://shopify/DraftOrder/11',
      number: '#D11',
      hostedUrl: 'https://store.biokea.ai/11/invoices/abc',
      pdfUrl: null,
      dueAt: '2026-10-01T00:00:00Z',
      amountDueCents: 480000,
    });
  });

  it('turns the credit into a fixed-amount appliedDiscount', async () => {
    const s = fakeShopify(okAnswers);
    await shopifyGateway(cfg, s.fetch).createInvoice({
      ...spec2,
      kind: 'balance',
      lines: [{ description: 'Barcoding — 743', amountCents: 891600 }],
      credit: { title: 'Deposit received (order #1001, paid 2026-09-02)', amountCents: 480000 },
    });
    expect(s.calls[2].variables.input.appliedDiscount).toEqual({
      title: 'Deposit received (order #1001, paid 2026-09-02)',
      description: 'Deposit received (order #1001, paid 2026-09-02)',
      value: 4800,
      valueType: 'FIXED_AMOUNT',
    });
  });

  it('reuses an OPEN draft that already carries the payment tag instead of creating a second one', async () => {
    const s = fakeShopify({
      ...okAnswers,
      findDraft: {
        draftOrders: { nodes: [{ id: 'gid://shopify/DraftOrder/9', name: '#D9', status: 'OPEN' }] },
      },
      draftOrderInvoiceSend: {
        draftOrderInvoiceSend: {
          draftOrder: {
            id: 'gid://shopify/DraftOrder/9',
            name: '#D9',
            invoiceUrl: 'https://store.biokea.ai/9/invoices/x',
            totalPriceSet: { shopMoney: { amount: '4800.00' } },
            paymentTerms: null,
          },
          userErrors: [],
        },
      },
    });
    const out = await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls.map((c) => c.op)).toEqual([
      'paymentTermsTemplates',
      'findDraft',
      'draftOrderInvoiceSend',
    ]);
    expect(out.externalId).toBe('gid://shopify/DraftOrder/9');
    expect(out.dueAt).toBeNull();
  });

  it('omits paymentTerms when the template lookup fails or has no match', async () => {
    const s = fakeShopify({ ...okAnswers, paymentTermsTemplates: { paymentTermsTemplates: [] } });
    await shopifyGateway(cfg, s.fetch).createInvoice(spec2);
    expect(s.calls[2].variables.input.paymentTerms).toBeUndefined();
    const s2 = fakeShopify(okAnswers);
    await shopifyGateway({ ...cfg, paymentTermsTemplate: undefined }, s2.fetch).createInvoice(
      spec2,
    );
    expect(s2.calls.map((c) => c.op)[0]).toBe('findDraft'); // no lookup at all
  });

  it('throws on GraphQL userErrors and on non-2xx', async () => {
    const s = fakeShopify({
      ...okAnswers,
      draftOrderCreate: {
        draftOrderCreate: { draftOrder: null, userErrors: [{ field: ['input'], message: 'nope' }] },
      },
    });
    await expect(shopifyGateway(cfg, s.fetch).createInvoice(spec2)).rejects.toThrow(/nope/);
    const bad = (async () => new Response('down', { status: 502 })) as unknown as typeof fetch;
    await expect(shopifyGateway(cfg, bad).createInvoice(spec2)).rejects.toThrow(/502/);
  });

  it('caches the payment-terms template per gateway instance', async () => {
    const s = fakeShopify(okAnswers);
    const g = shopifyGateway(cfg, s.fetch);
    await g.createInvoice(spec2);
    await g.createInvoice({ ...spec2, paymentId: 'p2' });
    expect(s.calls.filter((c) => c.op === 'paymentTermsTemplates')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to see the failures**

Run: `npx vitest run tests/unit/payments-gateway.test.ts` — FAIL (`shopifyGateway`/`dollars` missing).

- [ ] **Step 3: Implement**

```ts
// gateway.ts — replace the Task-2 placeholder with:
export interface ShopifyConfig {
  storeDomain: string; // biokea.myshopify.com
  adminToken: string;
  apiVersion?: string;
  paymentTermsTemplate?: string; // 'NET_30' etc.; undefined → due on receipt
}

export const dollars = (cents: number): string => {
  if (!Number.isInteger(cents)) throw new Error(`amount must be integer cents, got ${cents}`);
  return (cents / 100).toFixed(2);
};

export async function shopifyGraphql<T>(
  cfg: ShopifyConfig,
  query: string,
  variables: unknown,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const url = `https://${cfg.storeDomain}/admin/api/${cfg.apiVersion ?? '2026-01'}/graphql.json`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': cfg.adminToken },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify GraphQL ${res.status}`);
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length)
    throw new Error(`Shopify GraphQL: ${json.errors.map((e) => e.message).join('; ')}`);
  return json.data as T;
}

const Q_TEMPLATES = `query paymentTermsTemplates { paymentTermsTemplates { id name paymentTermsType dueInDays } }`;
const Q_FIND = `query findDraft($query: String!) { draftOrders(first: 1, query: $query) { nodes { id name status } } }`;
const M_CREATE = `mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id name } userErrors { field message } } }`;
const M_SEND = `mutation draftOrderInvoiceSend($id: ID!) { draftOrderInvoiceSend(id: $id) { draftOrder { id name invoiceUrl totalPriceSet { shopMoney { amount } } paymentTerms { paymentSchedules(first: 1) { nodes { dueAt } } } } userErrors { field message } } }`;

const userErr = (errs: { message: string }[] | undefined, what: string) => {
  if (errs && errs.length) throw new Error(`${what}: ${errs.map((e) => e.message).join('; ')}`);
};

export function shopifyGateway(
  cfg: ShopifyConfig,
  fetchImpl: typeof fetch = fetch,
): PaymentsGateway {
  let templateId: string | null | undefined; // undefined = not looked up yet
  async function termsTemplateId(): Promise<string | null> {
    if (!cfg.paymentTermsTemplate) return null;
    if (templateId !== undefined) return templateId;
    try {
      const d = await shopifyGraphql<{
        paymentTermsTemplates: {
          id: string;
          name: string;
          paymentTermsType: string;
          dueInDays: number | null;
        }[];
      }>(cfg, Q_TEMPLATES, {}, fetchImpl);
      const want = cfg.paymentTermsTemplate.toUpperCase(); // NET_30
      const days = Number(want.split('_')[1]);
      const hit =
        d.paymentTermsTemplates.find((t) => t.paymentTermsType === 'NET' && t.dueInDays === days) ??
        null;
      templateId = hit?.id ?? null;
    } catch {
      templateId = null; // due on receipt; never block an invoice on terms lookup
    }
    return templateId;
  }

  return {
    async createInvoice(spec) {
      const terms = await termsTemplateId();
      const found = await shopifyGraphql<{
        draftOrders: { nodes: { id: string; name: string; status: string }[] };
      }>(cfg, Q_FIND, { query: `tag:payment:${spec.paymentId}` }, fetchImpl);
      let draft = found.draftOrders.nodes.find((n) => n.status === 'OPEN') ?? null;
      if (!draft) {
        const attrs = [
          { key: 'quote_id', value: spec.quoteId },
          { key: 'quote_number', value: spec.quoteNumber },
          { key: 'kind', value: spec.kind },
          { key: 'payment_id', value: spec.paymentId },
        ];
        if (spec.poNumber) attrs.push({ key: 'po_number', value: spec.poNumber });
        const input: Record<string, unknown> = {
          email: spec.customer.email,
          note: spec.footer,
          taxExempt: true,
          tags: ['biokea', spec.kind, `payment:${spec.paymentId}`, `quote:${spec.quoteNumber}`],
          customAttributes: attrs,
          lineItems: spec.lines.map((l) => ({
            title: l.description,
            quantity: 1,
            originalUnitPrice: dollars(l.amountCents),
            taxable: false,
            requiresShipping: false,
          })),
        };
        if (spec.credit)
          input.appliedDiscount = {
            title: spec.credit.title,
            description: spec.credit.title,
            value: spec.credit.amountCents / 100,
            valueType: 'FIXED_AMOUNT',
          };
        if (terms) input.paymentTerms = { paymentTermsTemplateId: terms };
        const c = await shopifyGraphql<{
          draftOrderCreate: {
            draftOrder: { id: string; name: string } | null;
            userErrors: { message: string }[];
          };
        }>(cfg, M_CREATE, { input }, fetchImpl);
        userErr(c.draftOrderCreate.userErrors, 'draftOrderCreate');
        draft = { ...c.draftOrderCreate.draftOrder!, status: 'OPEN' };
      }
      const s = await shopifyGraphql<{
        draftOrderInvoiceSend: {
          draftOrder: {
            id: string;
            name: string;
            invoiceUrl: string;
            totalPriceSet: { shopMoney: { amount: string } };
            paymentTerms: { paymentSchedules: { nodes: { dueAt: string | null }[] } } | null;
          };
          userErrors: { message: string }[];
        };
      }>(cfg, M_SEND, { id: draft.id }, fetchImpl);
      userErr(s.draftOrderInvoiceSend.userErrors, 'draftOrderInvoiceSend');
      const d = s.draftOrderInvoiceSend.draftOrder;
      return {
        customerId: null,
        externalId: d.id,
        number: d.name,
        hostedUrl: d.invoiceUrl,
        pdfUrl: null,
        dueAt: d.paymentTerms?.paymentSchedules.nodes[0]?.dueAt ?? null,
        amountDueCents: Math.round(Number(d.totalPriceSet.shopMoney.amount) * 100),
      };
    },
  };
}
```

Then `npm uninstall stripe`; grep `src tests` for `from 'stripe'` — only `src/pages/api/stripe/webhook.ts` and its test remain (deleted in Task 5); to keep the build green now, delete `src/pages/api/stripe/webhook.ts` and `tests/unit/payments-webhook.test.ts` in this task and note it (Task 5 recreates both for Shopify).

- [ ] **Step 4: Verify + commit**

Run: `npx vitest run tests/unit && npm run check`

```bash
git add package.json package-lock.json src/lib/payments/gateway.ts tests/unit/payments-gateway.test.ts
git rm -q src/pages/api/stripe/webhook.ts tests/unit/payments-webhook.test.ts
git commit -m "feat(payments): Shopify Draft Order gateway (GraphQL Admin API); remove the stripe SDK and the Stripe webhook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: CORS helper, `/api/quote` preflight + `token`/`paymentsEnabled`, store origin allow-list

**Files:**

- Create: `src/lib/cors.ts`
- Modify: `src/pages/api/quote.ts`, `src/lib/origin-check.ts`
- Test: `tests/unit/cors.test.ts`, `tests/unit/quote-api.test.ts`, `tests/unit/origin-check.test.ts`, `tests/e2e/api-endpoints.spec.ts`

**Interfaces:**

```ts
// cors.ts
export const CORS_ORIGINS: readonly string[] = ['https://store.biokea.ai', 'https://biokea.ai'];
export function corsHeaders(origin: string | null, dev = false): Record<string, string>; // {} when not allowed; dev adds http://localhost:4321
export function preflight(request: Request, dev?: boolean): Response; // 204 + headers (or 204 without when not allowed)
export function withCors(res: Response, origin: string | null, dev?: boolean): Response; // clones headers onto res
// quote.ts: handleQuote response JSON gains `token` (access_token) and `paymentsEnabled` (deps flag); export const OPTIONS
```

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/cors.test.ts
import { describe, it, expect } from 'vitest';
import { corsHeaders, preflight, withCors } from '@/lib/cors';
describe('cors', () => {
  it('echoes only allow-listed origins', () => {
    expect(corsHeaders('https://store.biokea.ai')).toEqual({
      'access-control-allow-origin': 'https://store.biokea.ai',
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '86400',
      vary: 'origin',
    });
    expect(corsHeaders('https://evil.example')).toEqual({});
    expect(corsHeaders(null)).toEqual({});
    expect(corsHeaders('http://localhost:4321', true)['access-control-allow-origin']).toBe(
      'http://localhost:4321',
    );
    expect(corsHeaders('http://localhost:4321', false)).toEqual({});
  });
  it('preflight is 204 with headers for allowed origins and 204 bare otherwise', () => {
    const ok = preflight(
      new Request('https://biokea.ai/api/quote', {
        method: 'OPTIONS',
        headers: { origin: 'https://store.biokea.ai' },
      }),
    );
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://store.biokea.ai');
    const no = preflight(
      new Request('https://biokea.ai/api/quote', {
        method: 'OPTIONS',
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(no.status).toBe(204);
    expect(no.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('withCors adds headers to an existing response without changing status/body', async () => {
    const r = withCors(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
      'https://store.biokea.ai',
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe('{"ok":true}');
    expect(r.headers.get('access-control-allow-origin')).toBe('https://store.biokea.ai');
    expect(r.headers.get('content-type')).toBe('application/json');
  });
});
```

In `tests/unit/quote-api.test.ts` add: the success response JSON contains `token` (from the mocked insert's `access_token`) and `paymentsEnabled: true` when `handleQuote(req, env, ip, { paymentsEnabled: true })`, `false` when omitted; and the response carries `access-control-allow-origin: https://store.biokea.ai` when the request has that Origin, and no such header for `https://evil.example`.
In `tests/unit/origin-check.test.ts`: `ALLOWED_ORIGINS` contains `https://store.biokea.ai`; a form post from it is allowed.
In `tests/e2e/api-endpoints.spec.ts` add: `OPTIONS /api/quote` with `origin: https://store.biokea.ai` → 204 + header; with `origin: https://evil.example` → 204 and no header; `POST /api/quote` from `store.biokea.ai` origin with an invalid body → 400 **and** the CORS header present.

- [ ] **Step 2: Implement**

`src/lib/cors.ts` per the interface (lower-case header names; `vary: origin`). `quote.ts`: `handleQuote(request, e, remoteIp?, opts?: { paymentsEnabled?: boolean })`; the success JSON adds `token: accessToken` and `paymentsEnabled: !!opts?.paymentsEnabled`; wrap every returned `json(...)` via `withCors(res, request.headers.get('origin'), import.meta.env.DEV)` (do it once at the end by capturing the response in a variable — restructure `handleQuote` to compute `const res = …; return withCors(res, origin, dev)` in a single exit path or a small inner function). `export const OPTIONS: APIRoute = ({ request }) => preflight(request, import.meta.env.DEV)`. `POST` passes `{ paymentsEnabled: !!(e.SHOPIFY_ADMIN_TOKEN && e.SHOPIFY_STORE_DOMAIN) }` (env keys typed in Task 5; add them to the `Env` interface here as optional). `origin-check.ts`: `ALLOWED_ORIGINS = ['https://games.biokea.ai', 'https://store.biokea.ai']`.

- [ ] **Step 3: Verify + commit**

Run: `npx vitest run tests/unit && npm run check && npx playwright test tests/e2e/api-endpoints.spec.ts`

```bash
git add src/lib/cors.ts src/lib/origin-check.ts src/pages/api/quote.ts tests/unit/cors.test.ts tests/unit/quote-api.test.ts tests/unit/origin-check.test.ts tests/e2e/api-endpoints.spec.ts
git commit -m "feat(api): CORS for the store origin on /api/quote; response carries token + paymentsEnabled; store origin allow-listed for form posts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Shopify webhook `POST /api/shopify/webhook` + env/config

**Files:**

- Create: `src/pages/api/shopify/webhook.ts`, `src/lib/payments/shopify-hmac.ts`
- Modify: `src/env.d.ts`, `wrangler.toml`, `.dev.vars.example`
- Test: `tests/unit/shopify-webhook.test.ts`

**Interfaces:**

```ts
// shopify-hmac.ts
export async function shopifyHmacBase64(rawBody: string, secret: string): Promise<string>;
export async function verifyShopifyHmac(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean>; // constant-time
// webhook.ts
export interface ShopifyWebhookDeps {
  db: PaymentsDb;
  email: EmailSender;
  labTo: string;
  webhookSecret: string;
  now?: () => Date;
}
export async function handleShopifyWebhook(
  request: Request,
  deps: ShopifyWebhookDeps,
): Promise<Response>;
// headers read: x-shopify-hmac-sha256, x-shopify-topic, x-shopify-webhook-id
```

- [ ] **Step 1: Failing tests** (`tests/unit/shopify-webhook.test.ts`)

Mirror the structure of the deleted Stripe test (fixtures `quote()`, `MemoryDb`, `memorySender`, `NOW`), with a `send(topic, payload, id)` helper that computes the real HMAC via `shopifyHmacBase64(JSON.stringify(payload), SECRET)` and sets `x-shopify-topic`, `x-shopify-webhook-id`, `x-shopify-hmac-sha256`, `content-type: application/json`. Seed a deposit row `{ external_id: 'gid://shopify/DraftOrder/11', hosted_url: 'https://store.biokea.ai/11/invoices/abc', amount_cents: 480000 }` (id `p1`), quote `deposit_invoiced`. Payload shapes:

- `orders/paid`: `{ id: 5551, name: '#1042', financial_status: 'paid', source_name: 'shopify_draft_order', tags: 'biokea, deposit, payment:p1, quote:BK-2026-0142', note_attributes: [{ name: 'payment_id', value: 'p1' }, { name: 'quote_id', value: 'q1' }, { name: 'kind', value: 'deposit' }], order_status_url: 'https://store.biokea.ai/…/orders/xyz', total_price: '4800.00' }`
- `draft_orders/delete`: `{ id: 11 }`
- `orders/cancelled`: order payload as above with `financial_status: 'voided'` (`cancelled_at` set)
- `refunds/create`: `{ id: 77, order_id: 5551 }`
  Cases: (1) bad HMAC → 401, nothing recorded; (2) `orders/paid` → payment `paid`, `paid_at`, `order_ref '#1042'`, `external_order_id '5551'`, `hosted_url` = order_status_url, quote `deposit_paid`, 2 emails; (3) redelivered same webhook id → 200, no more emails; (4) `orders/paid` when the payment tag is missing but `note_attributes.payment_id` present → same result; (5) when only `draft_order_id: 11` is present (no tag/attribute) → found via `external_id` suffix; (6) `draft_orders/delete` on the open deposit → payment `void`, quote `quoted`; (7) `orders/cancelled` for an order tied to an open payment (by tag) → `void`, step back; (8) `refunds/create` for `order_id` matching `external_order_id` of a paid deposit → 200, one lab email with subject `[refund] BK-2026-0142 · State University · order #1042`, no state change; (9) unknown topic → 200; (10) unknown order → 200; (11) DB throws mid-processing → 500 and `events.size === 0`; (12) stale `orders/paid` after the quote advanced → no regress/no email (rank guard); (13) balance paid → quote `paid` + balance emails.

- [ ] **Step 2: Implement `shopify-hmac.ts`**

```ts
// src/lib/payments/shopify-hmac.ts
const enc = new TextEncoder();
export async function shopifyHmacBase64(rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
export async function verifyShopifyHmac(
  rawBody: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;
  const expected = await shopifyHmacBase64(rawBody, secret);
  if (expected.length !== header.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}
```

- [ ] **Step 3: Implement the webhook** — port `handleStripeWebhook` (git show `4bac4cd:src/pages/api/stripe/webhook.ts` for the reference logic) with these substitutions: auth via `verifyShopifyHmac(body, request.headers.get('x-shopify-hmac-sha256'), deps.webhookSecret)` → 401; `topic = x-shopify-topic`; `eventId = x-shopify-webhook-id` (400 if missing); `HANDLED = orders/paid, draft_orders/delete, orders/cancelled, refunds/create`; `findPayment`: from `tags` (split on `, `, find `payment:<id>`) → `note_attributes` `payment_id` → `draft_order_id`/`id` numeric suffix match against `external_id` (`gid://shopify/DraftOrder/<n>`); for `refunds/create` look up by `external_order_id === String(order_id)`. `orders/paid`: same rank guard; `updatePayment({ status:'paid', paid_at, order_ref: name, external_order_id: String(id), hosted_url: order_status_url ?? existing })`; emails as before. `draft_orders/delete` and `orders/cancelled`: same as the Stripe void path (only if payment `open`; step back only when `quote.status === waiting` and no other live row). `refunds/create`: `email(labRefundEmail(quote, payment, orderName, deps.labTo))` — add `refundLabEmail(q, p, orderRef, labTo)` to `src/lib/email/quote-payments.ts` (subject `[refund] <n> · <who> · order <ref>`, body: "A refund was recorded in Shopify on order <ref> for quote <n>. No status change was made; review in Shopify admin." + admin link) with a unit test in `tests/unit/quote-payments-email.test.ts`. Keep the un-record-on-failure try/catch and logging.
      `POST`: requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CONTACT_FROM_EMAIL`, `CONTACT_TO_EMAIL`.

- [ ] **Step 4: Env + config**

`src/env.d.ts`: replace the `STRIPE_*` entries with `SHOPIFY_ADMIN_TOKEN?`, `SHOPIFY_WEBHOOK_SECRET?`, `SHOPIFY_STORE_DOMAIN?`, `SHOPIFY_STORE_HANDLE?`, `SHOPIFY_PAYMENT_TERMS_TEMPLATE?`. `wrangler.toml` `[vars]`: `SHOPIFY_STORE_DOMAIN = "biokea.myshopify.com"`, `SHOPIFY_STORE_HANDLE = "biokea"`, `SHOPIFY_PAYMENT_TERMS_TEMPLATE = "NET_30"` with a comment; secrets comment: `wrangler secret put SHOPIFY_ADMIN_TOKEN` / `SHOPIFY_WEBHOOK_SECRET`; delete the Stripe lines. `.dev.vars.example`: same swap. Wire `shopifyGateway({ storeDomain, adminToken, paymentTermsTemplate })` into the `POST` wrappers of `deposit.ts` and `balance.ts` (500 "not configured" without `SHOPIFY_ADMIN_TOKEN`/`SHOPIFY_STORE_DOMAIN`).

- [ ] **Step 5: Verify + commit**

Run: `npx vitest run tests/unit && npm run check && npm run lint`

```bash
git add src/pages/api/shopify src/lib/payments/shopify-hmac.ts src/lib/email/quote-payments.ts src/pages/api/quote/[token]/deposit.ts "src/pages/api/admin/quotes/[number]/balance.ts" src/env.d.ts wrangler.toml .dev.vars.example tests/unit/shopify-webhook.test.ts tests/unit/quote-payments-email.test.ts
git commit -m "feat(payments): Shopify webhook (HMAC, orders/paid, draft delete, cancel, refunds) and Shopify env wiring

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: The quote widget — extract, build, host on `/quote`

**Files:**

- Create: `src/widget/template.ts`, `src/widget/quote-widget.ts`, `src/widget/entry.ts`, `src/widget/quote.css`, `vite.widget.config.ts`
- Modify: `src/pages/quote/index.astro` (thin host), `package.json` (scripts), `.gitignore` (`public/widget/`), `.github/workflows/deploy.yml` (build widget before tests + build), `src/pages/api/quote.ts` (nothing — already returns `token`), `playwright.config.ts` (no change; `dev` builds the widget)
- Test: `tests/unit/widget-template.test.ts`, `tests/e2e/quote.spec.ts` (keep green + one new test)

**Interfaces:**

```ts
// template.ts (pure)
export function renderWidgetHtml(
  services: PricedService[],
  opts: { turnstileSiteKey?: string },
): string; // uses the data-* hooks listed in Global Constraints and bk-* classes
export function renderLineItems(quote: Quote): string; // the <li> list
export function renderDeadzone(quote: Quote): string | null;
export function renderUpsell(quote: Quote): string | null;
// quote-widget.ts
export interface WidgetOptions {
  apiBase?: string;
  turnstileSiteKey?: string;
  source?: string;
}
export function mountQuoteWidget(root: HTMLElement, opts?: WidgetOptions): { destroy(): void };
// entry.ts (IIFE): window.BioKEAQuote = { mount: mountQuoteWidget }; auto-mounts on DOMContentLoaded into `#quote-widget` (data-source attr → opts.source)
```

- [ ] **Step 1: Failing template tests**

```ts
// tests/unit/widget-template.test.ts
import { describe, it, expect } from 'vitest';
import { pricedServices } from '@/data/pricing';
import { buildQuote } from '@/lib/pricing/quote';
import { renderWidgetHtml, renderLineItems, renderDeadzone, renderUpsell } from '@/widget/template';

describe('renderWidgetHtml', () => {
  const html = renderWidgetHtml(pricedServices, { turnstileSiteKey: '1x000' });
  it('renders one card per priced service with the data hooks the page script and e2e rely on', () => {
    for (const s of pricedServices) {
      expect(html).toContain(`data-service-toggle="${s.slug}"`);
      expect(html).toContain(`data-count-input="${s.slug}"`);
      expect(html).toContain(`data-count-slider="${s.slug}"`);
    }
    expect(html).toContain('data-markers-input="metabarcoding"');
    expect(html).not.toContain('data-markers-input="barcoding"');
    for (const hook of [
      'data-total-academic',
      'data-total-commercial',
      'data-line-list',
      'data-deadzone-callout',
      'data-upsell-callout',
      'data-conversation-notice',
      'data-open-form',
      'data-quote-form',
      'data-quote-status',
      'data-deposit-panel',
    ])
      expect(html).toContain(hook);
    expect(html).toContain('class="cf-turnstile"');
    expect(html).toContain('data-sitekey="1x000"');
    expect(renderWidgetHtml(pricedServices, {})).not.toContain('cf-turnstile');
  });
  it('escapes service copy', () => {
    const svc = { ...pricedServices[0], title: 'X <b>bold</b>' };
    expect(renderWidgetHtml([svc], {})).toContain('X &lt;b&gt;bold&lt;/b&gt;');
  });
});
describe('render helpers', () => {
  it('line items list each service with both totals', () => {
    const q = buildQuote([{ serviceSlug: 'barcoding', count: 800 }]);
    const li = renderLineItems(q);
    expect(li).toContain('Voucher-Linked Specimen Barcoding');
    expect(li).toContain('800 specimens');
    expect(li).toContain('$9,600');
    expect(li).toContain('$12,800');
  });
  it('deadzone copy appears only when a line is better than literal, upsell only otherwise', () => {
    expect(renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]))).toMatch(
      /less than 290 specimens/,
    );
    expect(renderDeadzone(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]))).toBeNull();
    expect(renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 100 }]))).toMatch(
      /more specimens costs/,
    );
    expect(renderUpsell(buildQuote([{ serviceSlug: 'barcoding', count: 290 }]))).toBeNull();
  });
});
```

(Verify the `$9,600`/`$12,800` figures against `buildQuote` in a REPL before committing the test; if the rate card differs, use the engine's numbers.)

- [ ] **Step 2: Implement `template.ts`** — move the markup from `src/pages/quote/index.astro` (service cards, summary aside, form) into template-literal functions with an `esc()` helper, replacing Tailwind classes with `bk-*` classes (`bk-quote`, `bk-grid`, `bk-card`, `bk-toggle`, `bk-field`, `bk-input`, `bk-range`, `bk-included`, `bk-summary`, `bk-summary-head`, `bk-totals`, `bk-total`, `bk-lines`, `bk-callout`, `bk-callout--ochre`, `bk-notice`, `bk-btn`, `bk-btn--primary`, `bk-btn--teal`, `bk-form`, `bk-status`, `bk-deposit`), keeping every `data-*` hook, and adding a hidden **deposit panel** after the status line:

```html
<section data-deposit-panel hidden class="bk-deposit">
  <p class="bk-eyebrow">Start this project</p>
  <h3>Pay a 50% deposit</h3>
  <p class="bk-muted">
    You'll get a Shopify invoice you can pay by card, Shop Pay, or PayPal — or forward to accounts
    payable. The balance is invoiced on actual counts when results are delivered.
  </p>
  <form method="post" data-deposit-form>
    <label
      ><input type="radio" name="audience" value="commercial" required /> Commercial rate — deposit
      <span data-deposit-commercial></span
    ></label>
    <label
      ><input type="radio" name="audience" value="academic" required /> Academic / nonprofit rate —
      deposit <span data-deposit-academic></span
    ></label>
    <label class="bk-attest"
      ><input type="checkbox" name="attest" value="true" /> Required for the academic rate: this
      work is for a degree-granting institution, government agency, or non-profit research
      organization.</label
    >
    <label>PO number (optional) <input name="po_number" maxlength="64" /></label>
    <button type="submit" class="bk-btn bk-btn--primary">Continue to invoice →</button>
  </form>
</section>
```

`renderLineItems`/`renderDeadzone`/`renderUpsell` are the string-building parts of the old `render()` extracted verbatim (same copy).

- [ ] **Step 3: Implement `quote-widget.ts`** — the old page script, scoped to `root` (`root.querySelector` instead of `document.querySelector`), with: `apiBase = opts.apiBase ?? 'https://biokea.ai'` **but** when `location.origin === 'https://biokea.ai' || location.hostname === 'localhost'` use `''` (same-origin) so `/quote` on the site posts same-origin; on submit success show the quote number + link, then if `body.paymentsEnabled && !quote.needsConversation` reveal `[data-deposit-panel]`, set `form.action = \`${apiBase}/api/quote/${body.token}/deposit\``, fill deposit amounts via `depositLines`/`depositTotalCents`from`@/lib/payments/terms` for the current config, wire the academic→`required`attest toggle (from Task 12 of the Stripe plan); include`source`as a hidden`source`field on the quote payload (server ignores unknown fields — zod`.strict()`is not used; verify`QuoteSchema`tolerates it, else add`source: z.string().max(32).optional()`); Turnstile: if `opts.turnstileSiteKey`and no`window.turnstile`, inject `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer>`once. Return`{ destroy }`that removes listeners (store handlers in an array).`entry.ts`: `import './quote.css'`; `import { mountQuoteWidget } from './quote-widget'`; expose `window.BioKEAQuote`; on `DOMContentLoaded`(or immediately if already loaded) mount into`document.getElementById('quote-widget')`with`{ source: el.dataset.source, turnstileSiteKey: **TURNSTILE_SITE_KEY** }`(a Vite`define`).
`quote.css`: scoped styles for the classes above using `var(--color-ink, #0a0e1a)`, `var(--color-cream, #f6f1e7)`, `var(--color-cream-warm, #efe6d3)`, `var(--color-teal, #0f766e)`, `var(--color-ochre, #b45309)`, `var(--color-pink, #be185d)`; system font stack + `ui-monospace`for eyebrows; two-column grid ≥ 1024px, single column below; matches the current page's look closely enough that the`/quote` page reads unchanged.

- [ ] **Step 4: Build config + scripts**

`vite.widget.config.ts`:

```ts
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __TURNSTILE_SITE_KEY__: JSON.stringify(process.env.PUBLIC_TURNSTILE_SITE_KEY ?? '') },
  build: {
    lib: {
      entry: 'src/widget/entry.ts',
      name: 'BioKEAQuote',
      formats: ['iife'],
      fileName: () => 'quote.js',
      cssFileName: 'quote',
    },
    outDir: 'public/widget',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
  },
});
```

`package.json`: `"widget:build": "vite build --config vite.widget.config.ts"`, `"prebuild": "npm run widget:build"`, `"dev": "npm run widget:build && astro dev"`. `.gitignore`: `public/widget/`. `deploy.yml`: in the **test** job add `- run: npm run widget:build` before the e2e step (with `PUBLIC_TURNSTILE_SITE_KEY` env if present); the deploy job's `npm run build` triggers `prebuild`. `src/env.d.ts`: `declare const __TURNSTILE_SITE_KEY__: string;`.
`src/pages/quote/index.astro`: keep the hero + `CtaBand`; replace the configuration/summary sections and the whole `<script>` with `<link rel="stylesheet" href={\`/widget/quote.css?v=${version}\`} /><div id="quote-widget" data-source="site"></div><script src={\`/widget/quote.js?v=${version}\`} defer></script>`where`version`is imported from`package.json` (`import pkg from '../../../package.json'`with`resolveJsonModule`— or a`src/data/version.ts`exporting the string; pick the latter and keep it in sync with`package.json` via a unit test that reads both).

- [ ] **Step 5: e2e** — run `npx playwright test tests/e2e/quote.spec.ts`; all existing tests must pass unchanged (same hooks). Add one test: `the deposit panel is hidden until a quote is created` (`[data-deposit-panel]` hidden on load). Add `tests/e2e/widget.spec.ts`: `page.setContent('<div id="quote-widget"></div><script src="http://localhost:4321/widget/quote.js"></script>')` via `page.goto('about:blank')` + `addScriptTag({ url })` + `addStyleTag`, then assert `[data-total-academic]` renders `$1,600` for the default 100 specimens (proves the bundle is self-contained off-site).

- [ ] **Step 6: Verify + commit**

Run: `npm run widget:build && npx vitest run tests/unit && npm run check && npm run lint && npx playwright test`

```bash
git add src/widget vite.widget.config.ts src/pages/quote/index.astro src/data/version.ts src/env.d.ts package.json .gitignore .github/workflows/deploy.yml tests/unit/widget-template.test.ts tests/e2e/quote.spec.ts tests/e2e/widget.spec.ts
git commit -m "feat(quote): extract the configurator into an embeddable widget bundle; /quote hosts it; deposit panel after quote creation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Site links, admin Shopify links, quote-page copy, docs, theme snippet

**Files:**

- Modify: `src/components/layout/Nav.astro` (line ~34: add `{ href: 'https://store.biokea.ai', label: 'Store' }` after Games), `src/pages/pricing.astro` (line ~88 CTA), `src/pages/services.astro` (CTAs at ~104/147/181/259), `src/pages/subscribe.astro` (`SOURCE_LABELS` gains `store: 'the BioKEA store'`, `site: 'biokea.ai'`), `src/pages/quote/[token].astro` (panel copy: "Pay now" → Shopify checkout; "Receipt / invoice PDF" links only when `pdfUrl`; text "sent to <email>" stays), `src/pages/admin/quotes/[number].astro` (payments table links: `hosted` = `hosted_url`, `shopify` = `https://admin.shopify.com/store/${SHOPIFY_STORE_HANDLE}/draft_orders/${numericId(external_id)}` and, when `external_order_id`, `/orders/${external_order_id}`; drop the Stripe customer link), `README.md`, `.github/workflows/deploy.yml` (already), `docs/shopify/product-quote-section.liquid` (new), `docs/shopify/STORE-SETUP.md` (new)
- Test: `tests/e2e/nav.spec.ts` (Store link present, external), `tests/e2e/pricing.spec.ts` + `services.spec.ts` (CTA hrefs point at the store product URLs and the "50% deposit online" phrase remains), `tests/e2e/payments.spec.ts` (unchanged), `npm run check`

- [ ] **Step 1: CTAs** — pricing: primary CTA `href="https://store.biokea.ai/products/specimen-barcoding"` label "Configure & pay a 50% deposit online →" plus a small secondary link "or build a quote here" → `/quote`. services: the barcoding CTA → `…/products/specimen-barcoding`, the eDNA/qPCR CTA → `…/products/edna-metabarcoding`, the general ones keep `/quote`; add `rel="noopener"` + `target="_blank"` consistently with the Games link treatment in Nav (check how Nav marks external links and reuse). Update the two e2e specs' href assertions.

- [ ] **Step 2: Admin + quote page** — implement `numericId(gid)` in `src/lib/payments/shopify-ids.ts` (`'gid://shopify/DraftOrder/11' → '11'`; unit test) and use it in the admin page; `SHOPIFY_STORE_HANDLE` read from `env` (fallback `'biokea'`). Quote page: `Pay now →` opens `hostedUrl` (Shopify checkout) in the same tab (no `target=_blank` — checkout should replace the page), keep `rel="noopener"` off since same-tab.

- [ ] **Step 3: Docs** — `README.md`: rewrite the Payments section for Shopify (secrets `SHOPIFY_ADMIN_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`; vars; migrations 0005–0007; rollout list from spec §8; local dev: `npm run dev` builds the widget; how to embed the widget on Shopify: paste `docs/shopify/product-quote-section.liquid` into a Custom Liquid section on the `product.quote` template). Remove all Stripe wording. `docs/shopify/STORE-SETUP.md`: spec §5 as a checklist with the exact admin paths, the four webhook topics + URL, the two service product handles (`specimen-barcoding`, `edna-metabarcoding`) with suggested titles/descriptions ("from $6/specimen", "from $115/sample" — from `src/data/pricing.ts` tiers), the eight placeholder goods (Freshwater eDNA Sampling Kit, Marine eDNA Sampling Kit, Soil eDNA Sampling Kit; DNA Preservation Buffer 100 mL, Sterile Filter Packs ×10; BioKEA Field Tee, BioKEA Cap, Sticker Pack) with placeholder prices and "Coming soon" tags, Turnstile hostname step, DNS-only CNAME step. `docs/shopify/product-quote-section.liquid`:

```liquid
{% comment %} BioKEA quote widget — paste into a Custom Liquid section on the product.quote template. {% endcomment %}
<link rel="stylesheet" href="https://biokea.ai/widget/quote.css?v={{ 'now' | date: '%Y%m%d' }}">
<div id="quote-widget" data-source="store"></div>
<script src="https://biokea.ai/widget/quote.js?v={{ 'now' | date: '%Y%m%d' }}" defer crossorigin="anonymous"></script>
```

(Daily cache-buster is deliberate — the theme can't know our version.)

- [ ] **Step 4: Verify + commit**

Run: `npm run check && npm run lint && npm test && npx playwright test`

```bash
git add src/components/layout/Nav.astro src/pages/pricing.astro src/pages/services.astro src/pages/subscribe.astro "src/pages/quote/[token].astro" "src/pages/admin/quotes/[number].astro" src/lib/payments/shopify-ids.ts tests README.md docs/shopify
git commit -m "feat(store): Store nav link, CTAs to store product pages, Shopify admin links, docs + theme snippet

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: HUMAN — store setup, secrets, migration, rollout

- [ ] 1. Apply `migrations/0007_shopify.sql` in Supabase (SQL Editor). Verify `quote_payments` has `external_id`, `provider`, `order_ref`, `external_order_id`; `webhook_events` exists.
- [ ] 2. Shopify: create the store (Basic), enable Shopify Payments (test mode / Bogus Gateway first), USD.
- [ ] 3. Settings → Apps and sales channels → Develop apps → `biokea-website` → scopes `write_draft_orders`, `read_draft_orders`, `read_orders`, `read_products` → install → Admin API access token → `npx wrangler secret put SHOPIFY_ADMIN_TOKEN`.
- [ ] 4. Settings → Notifications → Webhooks → four subscriptions (`Order payment`, `Draft order deletion`, `Order cancellation`, `Refund create`) → JSON → `https://biokea.ai/api/shopify/webhook`; copy the signing key on that page → `npx wrangler secret put SHOPIFY_WEBHOOK_SECRET`.
- [ ] 5. If the store handle isn't `biokea`, set `SHOPIFY_STORE_DOMAIN`/`SHOPIFY_STORE_HANDLE` in `wrangler.toml` and commit.
- [ ] 6. Products + `product.quote` template + Custom Liquid section (docs/shopify). Placeholder goods.
- [ ] 7. Domain: Cloudflare DNS `store` CNAME `shops.myshopify.com` DNS-only; Shopify Domains → connect `store.biokea.ai` → primary. Turnstile → add `store.biokea.ai` hostname.
- [ ] 8. `git push origin main` (first deploy carrying payments) → watch Actions → walk: store product page shows widget → quote → deposit → Shopify checkout (Bogus card `1`) → paid → emails + `/admin` → balance (above / below) → delete-draft void → refund → net-30 invoice → goods checkout.
- [ ] 9. Shopify Payments live; smallest real order + refund; done.

---

## Self-review against the spec

- §2 decisions → T1 (renames), T2/T3 (draft orders, credit as discount), T4/T6 (shared widget + CORS), T7 (store links, docs), T8 (store, tax, domain).
- §3 journeys → T6 (widget: quote → deposit panel → cross-origin form → 303 to Shopify), T5 (paid → emails → quote page), balance unchanged (T2 credit).
- §4.1 widget: `mountQuoteWidget`, IIFE, hooks preserved, own CSS, `apiBase` policy → T6. Manifest replaced by `?v=` (declared deviation).
- §4.2 CORS + allow-list → T4. §4.3 gateway → T3 (templates lookup, tags/attributes, discount, dollars). §4.4 webhook → T5 (HMAC, four topics, lookups, refund email). §4.5 data model → T1. §4.6 endpoints → T2/T5. §4.7 marketing → T7. §4.8 config → T5/T7.
- §5 store setup → T8 + `docs/shopify/STORE-SETUP.md` (T7). §6 idempotency via payment tag search → T3; strict reads/conditional steps inherited (unchanged code). §7 testing → each task; widget off-site e2e in T6. §8 rollout → T8.
- Names consistent: `external_id`, `hosted_url`, `pdf_url`, `order_ref`, `external_order_id`, `external_customer_id`, `webhook_events`, `recordWebhookEvent`/`deleteWebhookEvent`, `CreatedInvoice{externalId, number, hostedUrl, pdfUrl, dueAt, amountDueCents, customerId}`, `CreateInvoiceSpec{…, paymentId, poNumber, credit}`, `shopifyGateway(cfg, fetch)`, `handleShopifyWebhook(request, deps)`, `renderWidgetHtml`, `mountQuoteWidget`, `numericId`.
