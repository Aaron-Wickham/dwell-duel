-- #145: the race read badly with real data. 0059's leaderboard_race plots one point per day from
-- the 1st, so a young month or a burst of settlements on one day was a flat line with a jump at
-- "Today". This one starts at the month's first settled bet and steps at every moment a top
-- member's net profit moved, so a burst reads as its own steps.
--
-- A new function rather than a change to leaderboard_race, because the shape changes: code still
-- on the old shape keeps working while this deploys. leaderboard_race goes once nothing calls it.
--
-- One explicit transaction, like 0034-0059.
begin;
set local lock_timeout = '5s';

-- Step 0 is where each member stood just before the first bet of the month settled (stakes already
-- placed count against them, as they do on the board). Each later step is a moment at which at
-- least one of them had a betting ledger row, carrying everyone's running total at that moment;
-- the last step is where the board stands now. A lost bet has no ledger row of its own (its stake
-- left at placement), so it needs no step.
--
-- "Settled" is a resolution of a market someone had a stake in, or any payout, refund or reversal.
-- Nothing settled yet this month: no rows, and the chart says the race hasn't started.
--
-- Steps are capped at 120, so eight members stay under PostgREST's 1000-row limit: past that, the
-- moments are split into 120 runs in time order and each run keeps its last moment. Totals at the
-- kept moments are exact; only the steps between them merge.
create function public.leaderboard_race_steps(p_top integer default 5)
returns table (profile_id uuid, display_name text, step integer, at timestamptz, profit bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
  v_start timestamptz;
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  select min(s.at) into v_start
  from (
    select min(r.resolved_at) as at
    from public.market_resolutions r
    where r.resolved_at >= v_from
      and (exists (select 1 from public.bets b where b.market_id = r.market_id)
        or exists (select 1 from public.parlay_legs l where l.market_id = r.market_id))
    union all
    select min(t.created_at)
    from public.coin_transactions t
    where t.created_at >= v_from
      and t.type in ('bet_won', 'bet_refunded', 'bet_voided_refund', 'resolution_reversed',
                     'parlay_won', 'parlay_refunded', 'parlay_reversed')
  ) s;

  if v_start is null then
    return;
  end if;

  return query
  with top as (
    select s.profile_id as id, p.display_name as name
    from public.season_profits(v_today) s
    join public.profiles p on p.id = s.profile_id
    order by s.profit desc, s.last_at asc, s.profile_id asc
    limit least(greatest(p_top, 1), 8)
  ),
  moves as (
    select t.profile_id as id, t.created_at as at, sum(t.amount) as amt
    from public.coin_transactions t
    where t.profile_id in (select id from top)
      and t.created_at >= v_from
      and t.type = any(public.betting_ledger_types())
    group by 1, 2
  ),
  moments as (
    select distinct m.at from moves m where m.at >= v_start
  ),
  runs as (
    select m.at, ntile(120) over (order by m.at) as run from moments m
  ),
  kept as (
    select max(r.at) as at from runs r group by r.run
  ),
  steps as (
    select 0 as step, v_start as at, false as inclusive
    union all
    select (row_number() over (order by k.at))::integer, k.at, true from kept k
  )
  select top.id, top.name, steps.step, steps.at,
         coalesce((
           select sum(m.amt) from moves m
           where m.id = top.id and (m.at < steps.at or (steps.inclusive and m.at = steps.at))
         ), 0)::bigint
  from top
  cross join steps
  order by top.id, steps.step;
end;
$$;

revoke execute on function public.leaderboard_race_steps(integer) from public, anon;
grant execute on function public.leaderboard_race_steps(integer) to authenticated;

commit;
