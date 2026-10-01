-- #264: narrow lists at scale. A trigram index for the markets title search, and two computed
-- columns PostgREST can filter on: markets.i_bet_on (Markets' "I bet on" chip) and
-- activity_events.is_mine (the Feed's "Mine" tab). Everything here is new and additive.
begin;
set local lock_timeout = '5s';

create extension if not exists pg_trgm with schema extensions;

-- ilike '%word%' on a title can use this; a plain btree can't.
create index markets_title_trgm_idx on public.markets using gin (title extensions.gin_trgm_ops);

-- The caller has a bet on the market, or a leg of a parlay on it, in any state. Unlike
-- has_stake_in_market (0046) this is history, not only live stakes: a settled market a member bet
-- on is still one they bet on. Security invoker, and the caller's id is named explicitly because
-- every invited member can read every bet (0030).
create function public.has_bet_on_market(p_market_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from public.bets b where b.market_id = p_market_id and b.profile_id = (select auth.uid()))
      or exists (
        select 1 from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
        where l.market_id = p_market_id and p.profile_id = (select auth.uid())
      )
$$;

-- Computed columns: PostgREST exposes a function of a table's row type as a column of that table,
-- so `markets?i_bet_on=is.true` filters without the client sending ids.
create function public.i_bet_on(m public.markets)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select public.has_bet_on_market(m.id) $$;

-- The caller's own events, plus results on markets they have a stake in.
create function public.is_mine(e public.activity_events)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select e.actor_id = (select auth.uid())
      or (e.kind = 'market_resolved' and e.market_id is not null and public.has_bet_on_market(e.market_id))
$$;

revoke execute on function public.has_bet_on_market(uuid) from public, anon;
revoke execute on function public.i_bet_on(public.markets) from public, anon;
revoke execute on function public.is_mine(public.activity_events) from public, anon;
grant execute on function public.has_bet_on_market(uuid) to authenticated, service_role;
grant execute on function public.i_bet_on(public.markets) to authenticated, service_role;
grant execute on function public.is_mine(public.activity_events) to authenticated, service_role;

commit;
