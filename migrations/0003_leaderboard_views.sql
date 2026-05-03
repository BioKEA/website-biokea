-- 0003_leaderboard_views.sql
--
-- Cross-game leaderboard infrastructure. All read-only — no schema changes
-- to `scores` or `subscribers`. Defines a small lookup table for "ranked
-- modes" plus four views that derive BKP (BioKEA Points) and standings.
--
-- The motivating UX: per-game daily top, per-game season top, AND a single
-- cross-game ranking. The four games' raw scores are on incompatible
-- scales (Codon ≈ 50,000 / Pipette ≈ 300 / Plasmid varies / Particle is
-- seconds survived) so we rank per-game and award fixed-payout BKP, then
-- sum BKP across games for the meta-ranking.
--
-- BKP payouts: rank 1 → 25, ranks 2–3 → 15, ranks 4–10 → 10, else → 5.
-- Tunable in `scores_with_bkp` if the bucket sizes turn out wrong.
--
-- Apply via Supabase Dashboard → SQL Editor.

-- ─────────────────────── ranked modes lookup ───────────────────────
-- Only (game_id, mode) pairs in this table contribute to BKP. Every
-- mode here MUST use a YYYY-MM-DD date as `seed` (the views cast it).
-- Adding a new game = insert a row; no view edits required.

create table public.ranked_modes (
  game_id text not null,
  mode    text not null,
  primary key (game_id, mode)
);

insert into public.ranked_modes (game_id, mode) values
  ('codon2048',                       'classic-daily'),
  ('pipette-rush',                    'daily'),
  ('plasmid-plinko',                  'daily'),
  ('particle-survival-shooter',       'daily'),
  ('cal-field-lab-collectible',       'daily'),
  ('3d-biodiversity-collect-em-all',  'daily');

alter table public.ranked_modes enable row level security;
-- No public policies — the views read it as their owner (postgres).

-- ─────────────────── (player, game, day) personal best ───────────────────
-- Players submit on every game-over; we award BKP off their best per day.

create or replace view public.scores_best_daily as
select
  s.game_id,
  s.mode,
  s.seed,
  s.player_handle,
  max(s.score)      as score,
  min(s.created_at) as best_at
from public.scores s
join public.ranked_modes rm
  on rm.game_id = s.game_id
 and rm.mode    = s.mode
group by s.game_id, s.mode, s.seed, s.player_handle;

-- ─────────────────────────── per-row BKP ───────────────────────────
-- Adds rank, bkp, and a `verified` flag derived from the subscribers
-- table (case-insensitive handle match against an active subscriber).

create or replace view public.scores_with_bkp as
with ranked as (
  select
    b.*,
    dense_rank() over (
      partition by b.game_id, b.mode, b.seed
      order by b.score desc, b.best_at asc
    ) as rank
  from public.scores_best_daily b
)
select
  r.game_id,
  r.mode,
  r.seed,
  r.player_handle,
  r.score,
  r.best_at,
  r.rank,
  case
    when r.rank = 1  then 25
    when r.rank <= 3 then 15
    when r.rank <= 10 then 10
    else 5
  end as bkp,
  exists (
    select 1 from public.subscribers sub
    where lower(sub.handle) = lower(r.player_handle)
      and sub.unsubscribed_at is null
  ) as verified
from ranked r;

-- ─────────────── daily cross-game standings (one row per player×day) ───────────────

create or replace view public.daily_standings as
select
  s.seed::date            as day,
  s.player_handle,
  bool_or(s.verified)     as verified,
  sum(s.bkp)              as bkp_total,
  count(*)                as games_played,
  count(*) filter (where s.rank = 1)            as golds,
  count(*) filter (where s.rank in (2, 3))      as silvers_bronzes,
  count(*) filter (where s.rank between 4 and 10) as top_tens
from public.scores_with_bkp s
group by s.seed::date, s.player_handle;

-- ─────────────── season cross-game standings (one row per player×month) ───────────────

create or replace view public.season_standings as
select
  date_trunc('month', s.seed::date)::date as month,
  s.player_handle,
  bool_or(s.verified)             as verified,
  sum(s.bkp)                      as bkp_total,
  count(distinct s.seed)          as days_played,
  count(distinct s.game_id)       as games_played,
  count(*) filter (where s.rank = 1) as golds
from public.scores_with_bkp s
group by date_trunc('month', s.seed::date), s.player_handle;

-- ─────────────────────── grants ───────────────────────
-- The publishable anon key uses the `anon` role; the leaderboard page
-- queries these views directly via PostgREST.

grant select on
  public.scores_best_daily,
  public.scores_with_bkp,
  public.daily_standings,
  public.season_standings
to anon, authenticated;
