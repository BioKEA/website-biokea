-- 0008_quote_source.sql
--
-- Where the quote was configured: 'site' (biokea.ai/quote) or 'store'
-- (store.biokea.ai product pages). Sent by the quote widget since v1.0;
-- persisted for conversion attribution. Nullable: pre-existing rows and
-- non-widget clients have no source.
--
-- Apply via Supabase Dashboard -> SQL Editor BEFORE deploying the code
-- that inserts the column (PostgREST rejects inserts naming an unknown
-- column, so the API change must not go live first).
alter table public.quotes
  add column if not exists source text
    check (source is null or source ~ '^[a-z0-9-]{1,32}$');
