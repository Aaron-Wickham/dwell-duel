-- #77: the leaderboard ranks by net worth, balance plus the DC riding on
-- open bets, so a stake no longer counts against you until it's lost. A
-- "This month" board ranks net betting profit over the calendar month in
-- America/New_York, and each finished month's winner gets a feed event.
--
-- One explicit transaction, like 0034-0050.
begin;
set local lock_timeout = '5s';

-- ─── What's riding ───────────────────────────────────────────────────────────
-- my_at_stake's definition (0045), one row per stake, so Home's At stake and
-- the leaderboard's net worth can't drift apart. A view rather than a
-- function: Postgres inlines it, so my_at_stake's profile filter still reaches
-- both branches' indexes, and the leaderboard aggregates it in one pass.
-- Security invoker, so a member reads it through bets' and parlays' own
-- policies, as my_at_stake always has.
create view public.stakes_riding
with (security_invoker = true)
as
  select b.profile_id, b.amount::bigint as amount
  from public.bets b
  join public.markets m on m.id = b.market_id
  where m.status = 'open'
  union all
  select p.profile_id, p.stake::bigint as amount
  from public.parlays p
  where p.status = 'pending';

revoke all on public.stakes_riding from public, anon, authenticated;
grant select on public.stakes_riding to authenticated, service_role;

create or replace function public.my_at_stake()
returns table (wagers integer, dc bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(amount), 0)::bigint
  from public.stakes_riding
  where profile_id = (select auth.uid());
$$;

-- ─── The net-worth board ─────────────────────────────────────────────────────
-- Every member with their net worth as `score` and a competition rank over the
-- whole board (ties share it), computed before PostgREST applies a page's
-- filters, so a window deep in the board still carries its true ranks. The
-- stakes are summed once for everyone, then joined. Security invoker: invited
-- members can read every profile, bet and parlay (0030, 0033), and anyone
-- else sees no rows.
create function public.leaderboard_net_worth()
returns table (id uuid, display_name text, avatar_path text, balance integer, at_stake bigint, score bigint, rank bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with riding as (
    select s.profile_id, sum(s.amount)::bigint as dc
    from public.stakes_riding s
    group by s.profile_id
  ),
  worth as (
    select p.id, p.display_name, p.avatar_path, p.balance,
      coalesce(r.dc, 0)::bigint as at_stake,
      (p.balance + coalesce(r.dc, 0))::bigint as score
    from public.profiles p
    left join riding r on r.profile_id = p.id
  )
  select w.id, w.display_name, w.avatar_path, w.balance, w.at_stake, w.score,
    rank() over (order by w.score desc)
  from worth w;
$$;

revoke execute on function public.leaderboard_net_worth() from public, anon;
grant execute on function public.leaderboard_net_worth() to authenticated, service_role;

-- ─── Seasons ─────────────────────────────────────────────────────────────────
-- A month's net betting profit per member: every ledger row a bet or parlay
-- moved in the month, counted when the money moved. So a stake placed in one
-- month on a market that resolves in the next is a loss in the first and its
-- winnings a gain in the second, and a finished month's totals never change.
-- The list is of betting types, not of the ones left out (starting_grant,
-- task_completed, admin_adjustment), so a ledger type added later stays out
-- of seasons until someone decides it's betting. last_at is when the member's
-- total for the month was last set, the champion's tie-break.
--
-- Internal: members read their own ledger only, so the boards below call this
-- as its owner, and only for the month they're meant to show.
create function public.season_profits(p_month date)
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
    and t.type in (
      'bet_placed', 'bet_won', 'bet_refunded', 'bet_voided_refund', 'bet_cancelled', 'resolution_reversed',
      'parlay_placed', 'parlay_won', 'parlay_refunded', 'parlay_reversed'
    )
  group by t.profile_id;
$$;

revoke execute on function public.season_profits(date) from public, anon, authenticated;
grant execute on function public.season_profits(date) to service_role;

-- The current month's board: members who have bet or been paid this month,
-- ranked by profit, ties sharing a rank. Security definer so it can read
-- everyone's ledger through season_profits; invited members only, the same
-- audience as the profiles it names.
create function public.leaderboard_month()
returns table (id uuid, display_name text, avatar_path text, score bigint, rank bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_path, s.profit,
    rank() over (order by s.profit desc)
  from public.season_profits((now() at time zone 'America/New_York')::date) s
  join public.profiles p on p.id = s.profile_id
  where (select public.is_invited());
$$;

revoke execute on function public.leaderboard_month() from public, anon;
grant execute on function public.leaderboard_month() to authenticated, service_role;

-- ─── The champion's feed event ───────────────────────────────────────────────
-- Unlike every other kind, a champion has no source row for a trigger to
-- follow: settle_season writes it. So its only foreign key is the actor, which
-- now cascades, as every other kind already does through its source row, or
-- deleting a champion's profile would be blocked by their trophy.
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check
  check (kind in ('bet_placed','parlay_placed','market_created','market_resolved','bet_won','parlay_won','task_completed','season_champion'));

alter table public.activity_events drop constraint activity_events_actor_id_fkey;
alter table public.activity_events add constraint activity_events_actor_id_fkey
  foreign key (actor_id) references public.profiles (id) on delete cascade;

-- Posts a finished month's champion to the feed, once: the event's id is
-- `season:YYYY-MM`, the primary key, so a second call (the cron runs daily)
-- does nothing. The champion is the top profit; a tie goes to whoever reached
-- that total first (the earlier last_at), then to the lower id so a repeat
-- can't pick differently. A month nobody bet in, or where nobody came out
-- ahead, has no champion. The event is dated the moment the month ended, so
-- it sits in the feed where the month closed, however late it's settled.
-- Defaults to last month. Returns the champion, or null.
create function public.settle_season(p_month date default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := date_trunc('month', coalesce(p_month, (now() at time zone 'America/New_York')::date - interval '1 month'))::date;
  v_end timestamptz := ((v_month + interval '1 month')::timestamp at time zone 'America/New_York');
  v_champion uuid;
  v_profit bigint;
begin
  if v_end > now() then
    raise exception 'season % has not ended', to_char(v_month, 'YYYY-MM');
  end if;

  select s.profile_id, s.profit into v_champion, v_profit
  from public.season_profits(v_month) s
  join public.profiles p on p.id = s.profile_id
  where s.profit > 0
  order by s.profit desc, s.last_at asc, s.profile_id asc
  limit 1;

  if v_champion is null then
    return null;
  end if;

  insert into public.activity_events (id, kind, occurred_at, actor_id, amount)
  values ('season:' || to_char(v_month, 'YYYY-MM'), 'season_champion', v_end, v_champion, least(v_profit, 2147483647)::integer)
  on conflict (id) do nothing;

  select actor_id into v_champion from public.activity_events where id = 'season:' || to_char(v_month, 'YYYY-MM');
  return v_champion;
end;
$$;

revoke execute on function public.settle_season(date) from public, anon, authenticated;
grant execute on function public.settle_season(date) to service_role;

commit;
