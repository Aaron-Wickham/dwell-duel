-- #121: more to see on the leaderboard. Three reads, all security definer because they aggregate
-- other members' betting ledger, which coin_transactions keeps own-or-admin. They return only
-- aggregates, the same figures the This month board and every profile's Stats card already show
-- to any invited member, and refuse anyone uninvited, as leaderboard_month does.
--
-- One explicit transaction, like 0034-0058.
begin;
set local lock_timeout = '5s';

-- The race: cumulative net betting profit, day by day since the month began, for the current top
-- members. Days and months are America/New_York's, as season_profits' are. Every member returned
-- has a row for every day, so a line is drawn edge to edge. p_top is capped at 8 lines.
create function public.leaderboard_race(p_top integer default 5)
returns table (profile_id uuid, display_name text, day date, profit bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/New_York')::date;
  v_first date := date_trunc('month', (now() at time zone 'America/New_York'))::date;
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  with top as (
    select s.profile_id as id, p.display_name as name
    from public.season_profits(v_today) s
    join public.profiles p on p.id = s.profile_id
    order by s.profit desc, s.last_at asc, s.profile_id asc
    limit least(greatest(p_top, 1), 8)
  ),
  daily as (
    select t.profile_id as id, (t.created_at at time zone 'America/New_York')::date as d, sum(t.amount) as amt
    from public.coin_transactions t
    where t.profile_id in (select id from top)
      and t.created_at >= v_from
      and t.type = any(public.betting_ledger_types())
    group by 1, 2
  ),
  days as (
    select generate_series(v_first, v_today, interval '1 day')::date as d
  )
  select top.id, top.name, days.d,
         (sum(coalesce(daily.amt, 0)) over (partition by top.id order by days.d))::bigint
  from top
  cross join days
  left join daily on daily.id = top.id and daily.d = days.d
  order by top.id, days.d;
end;
$$;

-- This month's awards, one row each, only when someone earned it:
--   biggest_win  the largest payout less its stake on one solo bet paid this month (value: DC gained; detail: the market)
--   best_parlay  the highest multiplier among parlays paid this month, credited / stake to two places
--   sharpshooter the best solo hit rate over bets on markets resolved this month, at least 5 decided
--   most_active  the most solo bets and parlays placed this month (value: how many)
-- A tie goes to whoever has more of what's being counted, then the name, then the id, so a repeat
-- can't pick differently.
create function public.leaderboard_awards()
returns table (kind text, profile_id uuid, display_name text, avatar_path text, value numeric, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
  v_to timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::timestamp at time zone 'America/New_York';
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  (
    select 'biggest_win'::text, p.id, p.display_name, p.avatar_path, (t.amount - b.amount)::numeric, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    join public.profiles p on p.id = t.profile_id
    where t.type = 'bet_won' and t.created_at >= v_from and t.created_at < v_to and t.amount > b.amount
    order by (t.amount - b.amount) desc, t.id
    limit 1
  )
  union all
  (
    select 'best_parlay'::text, p.id, p.display_name, p.avatar_path, trunc(pa.credited::numeric / pa.stake, 2), pa.id::text
    from public.coin_transactions t
    join public.parlays pa on pa.id = (t.meta ->> 'parlay_id')::uuid and pa.status = 'won' and pa.stake > 0
    join public.profiles p on p.id = pa.profile_id
    where t.type = 'parlay_won' and t.created_at >= v_from and t.created_at < v_to
    order by trunc(pa.credited::numeric / pa.stake, 2) desc, pa.credited desc, pa.id
    limit 1
  )
  union all
  (
    select 'sharpshooter'::text, p.id, p.display_name, p.avatar_path,
           round(x.won::numeric / (x.won + x.lost), 4), x.won || ' of ' || (x.won + x.lost)
    from (
      select b.profile_id,
             count(*) filter (where b.outcome_id = r.outcome_id) as won,
             count(*) filter (where b.outcome_id <> r.outcome_id and w.pool_total > 0) as lost
      from public.bets b
      join public.markets m on m.id = b.market_id and m.status = 'resolved'
      join public.market_resolutions r on r.id = m.current_resolution_id and r.resolved_at >= v_from and r.resolved_at < v_to
      join public.market_outcomes w on w.id = r.outcome_id
      group by b.profile_id
    ) x
    join public.profiles p on p.id = x.profile_id
    where x.won + x.lost >= 5
    order by round(x.won::numeric / (x.won + x.lost), 4) desc, x.won + x.lost desc, p.display_name, p.id
    limit 1
  )
  union all
  (
    select 'most_active'::text, p.id, p.display_name, p.avatar_path, y.n::numeric, y.n || ' bets and parlays'
    from (
      select z.profile_id, count(*) as n
      from (
        select b.profile_id from public.bets b where b.created_at >= v_from and b.created_at < v_to
        union all
        select pa.profile_id from public.parlays pa where pa.created_at >= v_from and pa.created_at < v_to
      ) z
      group by z.profile_id
    ) y
    join public.profiles p on p.id = y.profile_id
    order by y.n desc, p.display_name, p.id
    limit 1
  );
end;
$$;

-- All-time settled wins and losses for the members listed, solo bets and parlays together, for the
-- record chip on each leaderboard row. Counted as member_stats counts them: a bet on a voided
-- market, or one resolved to an outcome nobody backed, is a refund and counts as neither; a
-- parlay is decided when it is won or lost.
create function public.member_records(p_ids uuid[])
returns table (profile_id uuid, won integer, lost integer)
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
    select b.profile_id as id,
           count(*) filter (where b.outcome_id = r.outcome_id) as won,
           count(*) filter (where b.outcome_id <> r.outcome_id and w.pool_total > 0) as lost
    from public.bets b
    join public.markets m on m.id = b.market_id and m.status = 'resolved'
    join public.market_resolutions r on r.id = m.current_resolution_id
    join public.market_outcomes w on w.id = r.outcome_id
    where b.profile_id = any (p_ids)
    group by b.profile_id
  ),
  parlays as (
    select pa.profile_id as id,
           count(*) filter (where pa.status = 'won') as won,
           count(*) filter (where pa.status = 'lost') as lost
    from public.parlays pa
    where pa.profile_id = any (p_ids)
    group by pa.profile_id
  )
  select i.id,
         (coalesce(s.won, 0) + coalesce(q.won, 0))::integer,
         (coalesce(s.lost, 0) + coalesce(q.lost, 0))::integer
  from unnest(p_ids) as i(id)
  left join solo s on s.id = i.id
  left join parlays q on q.id = i.id;
end;
$$;

revoke execute on function public.leaderboard_race(integer) from public, anon;
revoke execute on function public.leaderboard_awards() from public, anon;
revoke execute on function public.member_records(uuid[]) from public, anon;
grant execute on function public.leaderboard_race(integer) to authenticated;
grant execute on function public.leaderboard_awards() to authenticated;
grant execute on function public.member_records(uuid[]) to authenticated;

commit;
