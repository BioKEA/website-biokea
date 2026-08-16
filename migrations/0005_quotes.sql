-- 0005_quotes.sql
--
-- `quotes` — lead capture for the /quote configurator. A quote records the
-- exact configuration and both audience totals as computed SERVER-SIDE by
-- src/lib/pricing/quote.ts. Client-supplied totals are never persisted.
--
-- Two identifiers on purpose:
--   quote_number  human-readable (BK-2026-0142); goes on PO requisitions.
--                 The sequence is global and never resets, so the year is
--                 a prefix, not a per-year counter — the first quote of
--                 2027 continues the run (e.g. BK-2027-0143). Uniqueness
--                 is what matters here, not the ordinal.
--   access_token  unguessable; the only thing in the retrieval URL. A
--                 sequential number in the URL would let anyone enumerate
--                 other customers' quotes.
--
-- RLS is enabled with NO policies, which denies anon and authenticated
-- every operation. Both the write (/api/quote) and the read
-- (/quote/<token>) run server-side on the Worker with
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. This is deliberately
-- stricter than `subscribers`, which permits anonymous insert — see the
-- note above the RLS statement at the bottom of this file for why.
--
-- Apply via Supabase Dashboard → SQL Editor, paste, run.

create extension if not exists citext;

create sequence if not exists public.quote_number_seq start 1;

create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text not null unique
                       default 'BK-' || to_char(now(), 'YYYY') || '-' ||
                               lpad(nextval('public.quote_number_seq')::text, 4, '0'),
  access_token       uuid not null unique default gen_random_uuid(),

  email              citext not null,
  name               text not null,
  organization       text,
  note               text,

  -- One object per configured service, as returned by buildQuote().
  lines              jsonb not null,
  total_academic     integer not null,
  total_commercial   integer not null,
  needs_conversation boolean not null default false,

  created_at         timestamptz not null default now(),
  -- Quotes are valid for 30 days; surfaced on the printed quote so
  -- institutional buyers know how long the number is good for.
  expires_at         timestamptz not null default now() + interval '30 days',

  constraint quotes_email_format
    check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  constraint quotes_name_length
    check (char_length(name) between 1 and 200),
  constraint quotes_totals_nonneg
    check (total_academic >= 0 and total_commercial >= 0),
  constraint quotes_lines_is_array
    check (jsonb_typeof(lines) = 'array')
);

create index quotes_created_idx on public.quotes (created_at desc);

alter table public.quotes enable row level security;

-- No policies at all: RLS with zero policies denies every operation to
-- anon/authenticated. Both writes (/api/quote) and reads (/quote/<token>)
-- go through the Worker using SUPABASE_SERVICE_ROLE_KEY, which bypasses
-- RLS. Deliberately stricter than `subscribers`, which allows anonymous
-- insert: the publishable key is public, so an insert policy here would
-- let anyone write rows directly, skipping the endpoint's validation,
-- honeypot, and captcha. It also has to be this way for correctness —
-- Postgres applies SELECT policies to INSERT ... RETURNING, so an
-- insert-only policy would return zero rows and the API could never
-- learn the generated access_token.
