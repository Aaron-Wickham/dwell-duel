-- #204, #205: the markets list and the leaderboard at scale.
--
-- A resolved or voided market's bets never change again, but /markets recomputed its sparkline
-- (market_sparklines: a sort and two window passes over every bet) on every render. The 40-point
-- card series is now written once to markets.sparkline the moment a market leaves 'open', by a
-- trigger, so it fires from resolve_market_core and void_market without either being redefined
-- here. Open markets keep computing live.
--
-- One explicit transaction, like 0034-0064.
begin;
set local lock_timeout = '5s';

-- ─── Sparkline cache ─────────────────────────────────────────────────────────
-- Null while the market is open; '[]' for a market that closed with no bets, so the list never
-- asks the database about it again either.
alter table public.markets add column sparkline jsonb;

create function public.cache_market_sparkline()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('resolved', 'voided') and new.status is distinct from old.status then
    new.sparkline := coalesce(
      (select s.points from public.market_sparklines(array[new.id], 40) s),
      '[]'::jsonb
    );
  end if;
  return new;
end;
$$;

create trigger markets_cache_sparkline
  before update of status on public.markets
  for each row
  execute function public.cache_market_sparkline();

-- Markets settled before this shipped.
update public.markets m
set sparkline = coalesce((select s.points from public.market_sparklines(array[m.id], 40) s), '[]'::jsonb)
where m.status in ('resolved', 'voided') and m.sparkline is null;

-- ─── market_outcomes goes live ───────────────────────────────────────────────
-- Every bet moves an outcome's pool_total, so the markets list can follow market_outcomes instead
-- of every bets and cancelled_bets row. select_market_outcomes (0033) filters the payloads to
-- invited members. Same guarded shape as 0032.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'market_outcomes'
  ) then
    alter publication supabase_realtime add table public.market_outcomes;
  end if;
end
$$;

-- ─── Pending parlays for stakes_riding ───────────────────────────────────────
-- stakes_riding's parlay branch (0051) is every pending parlay, which leaderboard_net_worth sums
-- for the whole board and my_at_stake filters to one member; both read the whole table without
-- this. Pending parlays are always the few live ones, so the partial index stays tiny.
create index parlays_pending_profile_idx on public.parlays (profile_id) where status = 'pending';

commit;
