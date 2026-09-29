-- #74: the Open list sorts by close time, soonest first, and Home nudges whoever should resolve a
-- closed market, since nothing else does and its bettors' DC and parlays wait on it.
--
-- One explicit transaction, like 0034-0046.
begin;
set local lock_timeout = '5s';

-- /markets' Open list (listOpenMarkets), keyset-paged by (close_at, id), and markets_to_resolve's
-- closed-and-open scan.
create index markets_status_close_idx on public.markets (status, close_at, id);

-- The closed, unresolved markets waiting on the caller, soonest closed first. A creator is nudged
-- about their own at once; reviewers and admins about any left 48 hours, and at once about one
-- whose creator has a stake, since the creator can't resolve that one. can_resolve_market has the
-- final say, so a stake rules out anyone but an admin, as resolve_market_core does.
--
-- Security invoker: markets' own RLS decides which rows exist for the caller. `total` counts every
-- match before the cap, so Home can say how many there are while listing only the first few.
create function public.markets_to_resolve()
returns table (id uuid, title text, close_at timestamptz, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.id, m.title, m.close_at, count(*) over () as total
  from public.markets m
  where m.status = 'open'
    and m.close_at <= now()
    and (
      m.created_by = auth.uid()
      or (
        public.has_role('reviewer')
        and (m.close_at < now() - interval '48 hours' or public.has_stake_in_market(m.id, m.created_by))
      )
    )
    and public.can_resolve_market(m.id)
  order by m.close_at, m.id
  limit 10
$$;
revoke execute on function public.markets_to_resolve() from public, anon;
grant execute on function public.markets_to_resolve() to authenticated, service_role;

commit;
