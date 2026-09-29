-- #83: a stats block on each member's profile. One call, one row, every figure aggregated in SQL.
--
-- One explicit transaction, like 0034-0052.
begin;
set local lock_timeout = '5s';

-- ─── Betting ledger types ────────────────────────────────────────────────────
-- 0051's allow-list, named once so the This month board and a profile's all-time net profit
-- can't drift apart. Still a list of betting types, not of the ones left out, so a type added
-- later stays out of both until someone decides it's betting.
create function public.betting_ledger_types()
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array[
    'bet_placed', 'bet_won', 'bet_refunded', 'bet_voided_refund', 'bet_cancelled', 'resolution_reversed',
    'parlay_placed', 'parlay_won', 'parlay_refunded', 'parlay_reversed'
  ]::text[]
$$;

revoke execute on function public.betting_ledger_types() from public, anon, authenticated;
grant execute on function public.betting_ledger_types() to service_role;

-- 0051's body with the list swapped for the shared one. create or replace keeps its grants.
create or replace function public.season_profits(p_month date)
returns table (profile_id uuid, profit bigint, last_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.profile_id, sum(t.amount)::bigint, max(t.created_at)
  from public.coin_transactions t
  where t.created_at >= (date_trunc('month', p_month)::timestamp at time zone 'America/New_York')
    and t.created_at < ((date_trunc('month', p_month) + interval '1 month')::timestamp at time zone 'America/New_York')
    and t.type = any(public.betting_ledger_types())
  group by t.profile_id;
$$;

-- ─── member_stats ────────────────────────────────────────────────────────────
-- Security definer, because net profit is the ledger's: coin_transactions is own-or-admin, so
-- under invoker a member could only ever see their own. Everything else it reads (bets, parlays,
-- markets, resolutions, approved task completions) invited members can already read row by row,
-- and the net profit it adds is the all-time sum of what the This month board already shows
-- every invited member month by month. It returns only these aggregates, never a ledger row,
-- and refuses anyone uninvited.
--
-- Solo bets: a bet on a resolved market's current winner is won; any other bet on a resolved
-- market is lost, unless nobody backed the winner, when resolve_market refunded every stake.
-- A voided market's bets count as refunded. Cancelled bets are in cancelled_bets, not bets, so
-- they never count, and nor do bets on markets still open or awaiting resolution.
--
-- Net profit is the betting ledger's all-time net, counted when money moved, as on the This
-- month board: a stake still riding counts as spent until it settles.
--
-- Biggest win is the largest bet_won payout of a current resolution less that bet's stake, so a
-- payout an override took back doesn't count. A win that only returned its stake isn't one.
--
-- Best parlay is the won parlay with the highest multiplier: the product of its resolved legs'
-- locked odds (voided legs drop out, as settle_parlay drops them), capped at parlay_limits(), as
-- the parlay's own card shows it. ln/exp keep the product in numeric; rounding at 10 places
-- before truncating to the odds' 4 absorbs their last-digit error.
--
-- Every branch reads from this member's own index entries: bets_profile_created_idx,
-- parlays_profile_created_idx, coin_transactions_profile_created_idx, markets_created_by_idx and
-- 0054's approved-only task_completions_approved_streak_idx (or task_completions_profile_submitted_idx),
-- joining out by primary key. Each branch is a single
-- grouped pass, with no subquery per row, so no new index is needed.
create function public.member_stats(p_profile_id uuid)
returns table (
  bets_won integer,
  bets_lost integer,
  bets_refunded integer,
  parlays_won integer,
  parlays_lost integer,
  parlays_refunded integer,
  net_profit bigint,
  biggest_win bigint,
  biggest_win_market_id uuid,
  biggest_win_market_title text,
  best_parlay_multiplier numeric,
  best_parlay_payout integer,
  markets_created integer,
  tasks_completed integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  with solo as (
    select
      count(*) filter (where m.status = 'resolved' and b.outcome_id = r.outcome_id)::integer as won,
      count(*) filter (where m.status = 'resolved' and b.outcome_id <> r.outcome_id and w.pool_total > 0)::integer as lost,
      count(*) filter (where m.status = 'voided' or (m.status = 'resolved' and w.pool_total = 0))::integer as refunded
    from public.bets b
    join public.markets m on m.id = b.market_id
    left join public.market_resolutions r on r.id = m.current_resolution_id
    left join public.market_outcomes w on w.id = r.outcome_id
    where b.profile_id = p_profile_id
  ),
  parlay_record as (
    select
      count(*) filter (where pa.status = 'won')::integer as won,
      count(*) filter (where pa.status = 'lost')::integer as lost,
      count(*) filter (where pa.status = 'refunded')::integer as refunded
    from public.parlays pa
    where pa.profile_id = p_profile_id
  ),
  profit as (
    select coalesce(sum(t.amount), 0)::bigint as total
    from public.coin_transactions t
    where t.profile_id = p_profile_id
      and t.type = any(public.betting_ledger_types())
  ),
  biggest as (
    select (t.amount - b.amount)::bigint as gain, m.id as market_id, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    where t.profile_id = p_profile_id
      and t.type = 'bet_won'
      and t.amount > b.amount
    order by 1 desc, t.id
    limit 1
  ),
  won_parlays as (
    select pa.id, pa.credited, trunc(round(exp(sum(ln(l.locked_odds))), 10), 4) as product
    from public.parlays pa
    join public.parlay_legs l on l.parlay_id = pa.id
    join public.markets m on m.id = l.market_id
    where pa.profile_id = p_profile_id
      and pa.status = 'won'
      and m.status = 'resolved'
    group by pa.id, pa.credited
  ),
  best_parlay as (
    select least(wp.product, lim.max_multiplier)::numeric as multiplier, wp.credited
    from won_parlays wp
    cross join public.parlay_limits() lim
    order by 1 desc, wp.credited desc, wp.id
    limit 1
  ),
  created as (
    select count(*)::integer as n
    from public.markets m
    where m.created_by = p_profile_id
  ),
  tasks as (
    select count(*)::integer as n
    from public.task_completions tc
    where tc.profile_id = p_profile_id
      and tc.status = 'approved'
  )
  select
    solo.won, solo.lost, solo.refunded,
    pr.won, pr.lost, pr.refunded,
    profit.total,
    bw.gain, bw.market_id, bw.title,
    bp.multiplier, bp.credited,
    created.n, tasks.n
  from solo
  cross join parlay_record pr
  cross join profit
  cross join created
  cross join tasks
  left join biggest bw on true
  left join best_parlay bp on true;
end;
$$;

revoke execute on function public.member_stats(uuid) from public, anon;
grant execute on function public.member_stats(uuid) to authenticated;

commit;
