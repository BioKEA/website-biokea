-- 0004_golden_sample_hunt.sql
--
-- Backing tables for the Golden Sample 26 hunt — six tickets, one
-- hidden in each of the six games, that together spell out the
-- BioKEA tagline. Players who collect all six (within the campaign
-- window) are eligible for one of ten free soil-sequencing prizes.
--
-- Three tables:
--
--   golden_sample_tickets         — one row per (handle, game) earn
--   golden_sample_milestones      — long-form game progress counters
--                                   (cal-field-lab, 3d-biodiversity)
--   golden_sample_redemptions     — one row per fully-claimed prize
--
-- All three are RLS-locked with no public policies. The Cloudflare
-- Worker reads/writes via the SUPABASE_SERVICE_ROLE_KEY secret —
-- this isolates the hunt's word vault from anonymous Supabase
-- traffic.
--
-- Run once via Supabase SQL editor.

create extension if not exists citext;

-- ───────── tickets ─────────
-- A ticket is the proof a given handle earned a given game's word.
-- The word itself is NOT stored in client-readable form — server
-- responses include it transiently for the in-game animation, but
-- redemption only validates the (handle, slot, signed-token) tuple.
create table public.golden_sample_tickets (
  id              uuid primary key default gen_random_uuid(),
  player_handle   citext not null,
  -- Recorded for audit but NOT load-bearing — tickets bind to handle,
  -- so a player using two devices unifies their collection. (See
  -- Q&A in the brainstorm: cross-device-merge wins over per-device
  -- isolation; the desktop disclaimer warns about handle ergonomics.)
  client_id       uuid not null,
  game_id         text not null,
  -- 1..6 — the position of this ticket's word in the final sentence.
  -- Slot is canonical; the game-id↔slot mapping lives in the Worker.
  slot            int not null check (slot between 1 and 6),
  issued_at       timestamptz not null default now(),

  constraint golden_sample_tickets_game_format
    check (game_id ~ '^[a-z0-9-]{1,64}$'),
  constraint golden_sample_tickets_handle_length
    check (char_length(player_handle) between 1 and 32),

  -- One ticket per handle per game (the in-game animation guards the
  -- first-earn-only rule client-side; this is the server-side belt).
  unique (player_handle, game_id),
  -- One ticket per handle per slot (defensive — if the game↔slot map
  -- is ever changed we don't want the same handle to hold two of the
  -- same word).
  unique (player_handle, slot)
);

create index golden_sample_tickets_handle_idx
  on public.golden_sample_tickets (player_handle);
create index golden_sample_tickets_issued_idx
  on public.golden_sample_tickets (issued_at desc);

alter table public.golden_sample_tickets enable row level security;
-- No public policies. Worker uses service_role.

-- ───────── milestones ─────────
-- Long-form games (cal-field-lab-collectible, 3d-biodiversity-
-- collect-em-all) don't post to the leaderboard, so we can't validate
-- their unlock conditions against the `scores` table. Instead, the
-- game POSTs its current count whenever it advances. Server stores
-- the max ever observed for that (handle, game) — duplicate or
-- replayed POSTs are idempotent.
create table public.golden_sample_milestones (
  player_handle   citext not null,
  game_id         text not null,
  -- e.g. 5 specimens processed (BDL); 20 distinct animals (WildCal).
  count           int not null default 0,
  updated_at      timestamptz not null default now(),

  primary key (player_handle, game_id),
  constraint golden_sample_milestones_game_format
    check (game_id ~ '^[a-z0-9-]{1,64}$'),
  constraint golden_sample_milestones_count_nonneg
    check (count >= 0)
);

alter table public.golden_sample_milestones enable row level security;
-- No public policies.

-- ───────── redemptions ─────────
-- A complete-set redemption — the player has all six tickets and is
-- claiming their soil-sequencing prize. Capped at 10 globally; server
-- enforces with `select count(*) < 10` before insert. Email + address
-- captured here so we can ship the kit. Address is a JSONB blob so
-- the schema doesn't have to model international addresses up-front.
create table public.golden_sample_redemptions (
  id                uuid primary key default gen_random_uuid(),
  player_handle     citext not null unique,
  email             citext not null,
  shipping_address  jsonb not null,
  redeemed_at       timestamptz not null default now(),

  constraint golden_sample_redemptions_email_format
    check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

create index golden_sample_redemptions_redeemed_idx
  on public.golden_sample_redemptions (redeemed_at);

alter table public.golden_sample_redemptions enable row level security;
-- No public policies.
