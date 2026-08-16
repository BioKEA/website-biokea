-- 0005_quotes.sql
--
-- `quotes` — lead capture for the /quote configurator. A quote records the
-- exact configuration and both audience totals as computed SERVER-SIDE by
-- src/lib/pricing/quote.ts. Client-supplied totals are never persisted.
--
-- Two identifiers on purpose:
--   quote_number  human-readable (BK-2026-0142); goes on PO requisitions.
--   access_token  unguessable; the only thing in the retrieval URL. A
--                 sequential number in the URL would let anyone enumerate
--                 other customers' quotes.
--
-- RLS mirrors `subscribers`: anonymous insert is allowed (the API route
-- posts with the publishable key), and there is no select policy, so
-- reads require service_role. /quote/<token> renders server-side on the
-- Worker using SUPABASE_SERVICE_ROLE_KEY.
--
-- Apply via Supabase Dashboard → SQL Editor, paste, run.

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
create index quotes_token_idx   on public.quotes (access_token);

alter table public.quotes enable row level security;

-- Anonymous inserts allowed (the API route recomputes prices before
-- inserting). No select policy: reads require service_role.
create policy quotes_public_insert
  on public.quotes for insert
  with check (true);
