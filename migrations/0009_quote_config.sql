-- 0009_quote_config.sql — configurator state and consult status (spec 2).
-- Apply via Supabase Dashboard -> SQL Editor BEFORE deploying.
alter table public.quotes
  add column if not exists config jsonb,
  add column if not exists directions text check (directions is null or char_length(directions) <= 2000),
  add column if not exists consult_triggers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(consult_triggers) = 'array');
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('quoted','consult','deposit_invoiced','deposit_paid','balance_invoiced','paid'));
