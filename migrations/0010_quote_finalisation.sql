-- 0010_quote_finalisation.sql — the lab firms up consult quotes (spec 3:
-- docs/superpowers/specs/2026-10-29-consult-finalisation-design.md).
--
-- Apply via Supabase Dashboard -> SQL Editor BEFORE deploying the code that
-- writes these columns. Only POST /api/admin/quotes/<n>/finalise writes
-- them, so if the deploy lands first only that action fails (PostgREST
-- rejects a PATCH naming an unknown column); every read uses select=*.
--
-- Verify after applying:
--   select column_name from information_schema.columns
--   where table_schema = 'public' and table_name = 'quotes'
--     and column_name in ('finalised_at','finalised_by','lab_note');
-- Expect three rows.

alter table public.quotes
  add column if not exists finalised_at timestamptz,
  -- Cloudflare Access email of the staff member who confirmed the firm quote.
  add column if not exists finalised_by text check (finalised_by is null or char_length(finalised_by) <= 320),
  -- Shown to the customer on /quote/<token> and in the "quote is ready" email.
  add column if not exists lab_note text check (lab_note is null or char_length(lab_note) <= 2000);
