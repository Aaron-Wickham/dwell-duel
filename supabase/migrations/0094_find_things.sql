-- #264: narrow lists at scale. A trigram index for the markets title search, the computed column
-- markets.i_bet_on (Markets' "I bet on" chip) and my_activity_events() (the Feed's "Mine" tab).
-- Everything here is new and additive.
begin;
set local lock_timeout = '5s';

create extension if not exists pg_trgm with schema extensions;

-- ilike '%word%' on a title can use this; a plain btree can't.
create index markets_title_trgm_idx on public.markets using gin (title extensions.gin_trgm_ops);

-- Neither function below sets search_path: a function with a SET clause can't be inlined, and these
-- only work because they are. Every name is schema-qualified instead (the Supabase linter flags a
-- mutable search_path, and that is the price of the plan).
--
-- A computed column: PostgREST exposes a function of a table's row type as a column of that table,
-- so `markets?i_bet_on=is.true` filters without the client sending ids. The caller has a bet on the
-- market, or a leg of a parlay on it, in any state: unlike has_stake_in_market (0046) this is
-- history, not only live stakes. Security invoker, and the caller's id is named explicitly because
-- every invited member can read every bet (0030). Each IN is a hashed subplan, once per query.
create function public.i_bet_on(m public.markets)
returns boolean
language sql
stable
security invoker
as $$
  select m.id in (select b.market_id from public.bets b where b.profile_id = (select auth.uid()))
      or m.id in (
        select l.market_id from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
        where p.profile_id = (select auth.uid())
      )
$$;

-- The Feed's "Mine" tab: the caller's own events, plus results on markets they have a stake in
-- (a bet or a parlay leg, in any state). Two UNION ALL branches, each on its own index (the actor
-- index; the member's bets and parlays, then the market index), so the cursor's filter, the order
-- and the limit read through `.rpc().select()` reach both, instead of a per-row test walking the
-- whole feed. Security invoker: RLS on activity_events still applies.
create function public.my_activity_events()
returns setof public.activity_events
language sql
stable
security invoker
as $$
  select e.* from public.activity_events e
  where e.actor_id = (select auth.uid()) and e.hidden_at is null
  union all
  select e.* from public.activity_events e
  where e.kind = 'market_resolved' and e.hidden_at is null
    and e.actor_id is distinct from (select auth.uid())
    and e.market_id in (
      select b.market_id from public.bets b where b.profile_id = (select auth.uid())
      union
      select l.market_id from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
      where p.profile_id = (select auth.uid())
    )
$$;

revoke execute on function public.i_bet_on(public.markets) from public, anon;
revoke execute on function public.my_activity_events() from public, anon;
grant execute on function public.i_bet_on(public.markets) to authenticated, service_role;
grant execute on function public.my_activity_events() to authenticated, service_role;

commit;
