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
-- Grows unbounded; safe to prune rows older than ~90 days (delete from
-- stripe_events where received_at < now() - interval '90 days').
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now()
);

alter table public.quote_payments enable row level security;
alter table public.stripe_events  enable row level security;
-- No policies on purpose — see 0005_quotes.sql for the reasoning.
