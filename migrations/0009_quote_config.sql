-- 0009_quote_config.sql — configurator state and consult status (spec 2).
-- Apply via Supabase Dashboard -> SQL Editor BEFORE deploying.
--
-- The drop below assumes Postgres's auto-generated name quotes_status_check.
-- After applying, verify the status check now allows 'consult':
--   select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid='public.quotes'::regclass and contype='c';
-- Expect one check constraint whose definition lists 'consult'. If none does,
-- the old check had another name: drop it by that name and re-run the
-- add constraint, or every consult quote insert returns 502.
alter table public.quotes
  add column if not exists config jsonb,
  add column if not exists directions text check (directions is null or char_length(directions) <= 2000),
  add column if not exists consult_triggers jsonb not null default '[]'::jsonb
    check (jsonb_typeof(consult_triggers) = 'array');
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check
  check (status in ('quoted','consult','deposit_invoiced','deposit_paid','balance_invoiced','paid'));
