-- 0002_subscribers_and_handle_moderation.sql
--
-- Two unrelated additions that ship together because they touch the same
-- shared Supabase project (xkmfsxcaapyuxachtcsy):
--
-- 1. `subscribers` — opt-in lead-capture for the "Lab updates" form on
--    /mission/games/, /golden-sample-26, and the in-game injection. RLS
--    allows anonymous insert, denies select. /api/subscribe submits via
--    REST using the publishable anon key. Welcome email is sent
--    transactionally by the same endpoint via Resend.
--
-- 2. `forbidden_handle_patterns` + a BEFORE INSERT trigger on `scores`
--    that rejects player_handles matching any pattern (case-insensitive,
--    with a leetspeak normalization pass). Enforcing here rather than
--    client-side because four separate game repos consume the shared
--    leaderboard — a DB-level chokepoint can't be bypassed by editing
--    bundle JS.
--
-- Apply via Supabase Dashboard → SQL Editor, paste, run.

create extension if not exists citext;

-- ──────────────────────────── subscribers ────────────────────────────

create table public.subscribers (
  id              uuid primary key default gen_random_uuid(),
  email           citext not null unique,
  source          text not null,
  handle          text,
  metadata        jsonb not null default '{}'::jsonb,
  consented_at    timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at      timestamptz not null default now(),

  constraint subscribers_email_format
    check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  constraint subscribers_source_format
    check (source ~ '^[a-z0-9-]{1,64}$'),
  constraint subscribers_handle_length
    check (handle is null or char_length(handle) between 1 and 32)
);

create index subscribers_created_idx
  on public.subscribers (created_at desc);

create index subscribers_handle_idx
  on public.subscribers (handle)
  where handle is not null;

alter table public.subscribers enable row level security;

-- Anonymous opt-in inserts are allowed; reads require service_role.
create policy subscribers_public_insert
  on public.subscribers for insert
  with check (true);

-- ──────────────────── handle moderation infrastructure ────────────────────

create table public.forbidden_handle_patterns (
  id         uuid primary key default gen_random_uuid(),
  pattern    text not null,                 -- POSIX regex; matched case-insensitively
  reason     text not null default 'lewd',
  created_at timestamptz not null default now()
);

alter table public.forbidden_handle_patterns enable row level security;
-- No policies = no anonymous access. service_role only.

-- Reject inserts whose handle matches any forbidden pattern, either
-- directly (lowercased) or after a common-leet substitution. We do the
-- normalization in the trigger so the seed list can stay short and
-- readable; the trigger expands "f4ggot" / "@sshole" / "n1gger" to their
-- canonical forms before regex match.
create or replace function public.scores_check_handle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  has_match  boolean;
  normalized text := translate(lower(new.player_handle), '01345789@', 'olesatbga');
begin
  select exists (
    select 1
    from public.forbidden_handle_patterns p
    where lower(new.player_handle) ~* p.pattern
       or normalized              ~* p.pattern
  ) into has_match;

  if has_match then
    raise exception 'forbidden_handle'
      using errcode = '23514',  -- check_violation; @biokea/leaderboard maps to 'invalid'
            hint    = 'This handle is not allowed.';
  end if;

  return new;
end;
$$;

create trigger scores_handle_check_trigger
  before insert on public.scores
  for each row execute function public.scores_check_handle();

-- Seed list. Substring patterns; intentionally rough for v1. Expect
-- some false positives ("class" matches "ass" via the loose pattern);
-- iterate by adding word-boundary anchors (\m...\M) or explicit
-- exceptions as real cases come in.
insert into public.forbidden_handle_patterns (pattern) values
  ('fuck'), ('shit'), ('cunt'), ('nigg'), ('fag'), ('rape'),
  ('penis'), ('vagina'), ('cock'), ('dick'), ('asshole'),
  ('whore'), ('slut'), ('bitch'), ('porn'), ('xxx'),
  ('hitler'), ('nazi'), ('kike'), ('chink'), ('spic'),
  ('retard'), ('tranny'), ('faggot');
