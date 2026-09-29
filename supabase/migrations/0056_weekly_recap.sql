-- #81: Home's weekly recap, shown on Sundays and Mondays in America/New_York. Computed on demand:
-- every read is bounded by one week's dates on an index, so a call never scans older history.
--
-- One explicit transaction, like 0034-0055.
begin;
set local lock_timeout = '5s';

-- The week holding p_week (any day of it names it), Monday 00:00 to the next Monday 00:00 Eastern.
-- The bounds are wall-clock midnights converted in that zone, so a week that crosses a DST change
-- is 167 or 169 hours long, as the members living it would count it. One row:
--
--   my_*          the caller's own ledger for the week: net betting profit, over
--                 betting_ledger_types() (0055) as the This month board counts it, how many
--                 betting rows moved (so no betting can be told apart from breaking even), and
--                 task rewards, kept apart.
--   best_*        the week's biggest single profit on a solo bet, by payout less stake. From the
--                 bet_won feed events, which are dated when the market resolved and hidden when an
--                 override takes the win back. A parlay spans several markets, so it can't name
--                 one and isn't a candidate. Ties go to the earlier win.
--   upset_*       the market resolved this week whose winner had the lowest chance at close,
--                 (winner's pool + seed) / (all pools + seed × outcomes), effectivePools' maths
--                 and resolve_market's. Pools can't move after close, so today's pools are the
--                 ones at close. Only a real upset counts: under even odds, on a market someone bet on.
--   top_tasker_*  the most task completions approved this week; a tie goes to whoever got there first.
--   closing_*     open markets closing in the week after this one, from now on (so, read on the
--                 Monday after, what's left of the current week): the first three and the total.
--
-- Security definer, since members read only their own ledger: the only ledger figures returned are
-- the caller's own, and everything else is what the feed and the markets list already show every
-- invited member. Anyone else gets no row.
create function public.weekly_recap(p_week date)
returns table (
  week_start timestamptz,
  week_end timestamptz,
  my_betting_net bigint,
  my_betting_moves integer,
  my_task_income bigint,
  best_bettor_id uuid,
  best_bettor_name text,
  best_market_id uuid,
  best_market_title text,
  best_stake integer,
  best_payout integer,
  upset_market_id uuid,
  upset_market_title text,
  upset_outcome_label text,
  upset_chance double precision,
  top_tasker_id uuid,
  top_tasker_name text,
  top_tasker_count integer,
  closing_total integer,
  closing jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with week as (
    select
      (date_trunc('week', p_week::timestamp) at time zone 'America/New_York') as starts,
      ((date_trunc('week', p_week::timestamp) + interval '7 days') at time zone 'America/New_York') as ends,
      ((date_trunc('week', p_week::timestamp) + interval '14 days') at time zone 'America/New_York') as next_ends
  ),
  mine as (
    select
      coalesce(sum(t.amount) filter (where t.betting), 0)::bigint as betting_net,
      (count(*) filter (where t.betting))::integer as betting_moves,
      coalesce(sum(t.amount) filter (where t.type = 'task_completed'), 0)::bigint as task_income
    from (
      select c.amount, c.type, c.type = any(public.betting_ledger_types()) as betting
      from public.coin_transactions c
      cross join week w
      where c.profile_id = (select auth.uid())
        and c.created_at >= w.starts
        and c.created_at < w.ends
    ) t
  ),
  best as (
    select e.actor_id, e.market_id, b.amount as stake, e.amount as payout
    from public.activity_events e
    cross join week w
    join public.bets b on b.id = e.bet_id
    where e.hidden_at is null
      and e.kind = 'bet_won'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and e.amount > b.amount
    order by e.amount - b.amount desc, e.occurred_at, e.id
    limit 1
  ),
  upset as (
    select e.market_id, e.outcome_id, c.chance
    from public.activity_events e
    cross join week w
    join public.markets m on m.id = e.market_id
    cross join lateral (
      select
        sum(o.pool_total) as real_total,
        (max(o.pool_total) filter (where o.id = e.outcome_id) + m.seed_per_outcome)::double precision
          / (sum(o.pool_total) + m.seed_per_outcome * count(*))::double precision as chance
      from public.market_outcomes o
      where o.market_id = e.market_id
    ) c
    where e.hidden_at is null
      and e.kind = 'market_resolved'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and c.real_total > 0
      and c.chance < 0.5
    order by c.chance, e.occurred_at desc, e.id
    limit 1
  ),
  tasker as (
    select c.profile_id, count(*)::integer as n
    from public.task_completions c
    cross join week w
    where c.status = 'approved'
      and c.reviewed_at >= w.starts
      and c.reviewed_at < w.ends
    group by c.profile_id
    order by count(*) desc, max(c.reviewed_at), c.profile_id
    limit 1
  ),
  closing as (
    select m.id, m.title, m.close_at, count(*) over () as total
    from public.markets m
    cross join week w
    where m.status = 'open'
      and m.close_at >= greatest(now(), w.ends)
      and m.close_at < w.next_ends
    order by m.close_at, m.id
    limit 3
  )
  select
    w.starts,
    w.ends,
    mi.betting_net,
    mi.betting_moves,
    mi.task_income,
    b.actor_id,
    bp.display_name,
    b.market_id,
    bm.title,
    b.stake,
    b.payout,
    u.market_id,
    um.title,
    uo.label,
    u.chance,
    t.profile_id,
    tp.display_name,
    t.n,
    coalesce((select max(c.total) from closing c), 0)::integer,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'close_at', c.close_at) order by c.close_at, c.id) from closing c),
      '[]'::jsonb
    )
  from week w
  cross join mine mi
  left join best b on true
  left join public.profiles bp on bp.id = b.actor_id
  left join public.markets bm on bm.id = b.market_id
  left join upset u on true
  left join public.markets um on um.id = u.market_id
  left join public.market_outcomes uo on uo.id = u.outcome_id
  left join tasker t on true
  left join public.profiles tp on tp.id = t.profile_id
  where (select public.is_invited());
$$;

revoke execute on function public.weekly_recap(date) from public, anon;
grant execute on function public.weekly_recap(date) to authenticated, service_role;

commit;
