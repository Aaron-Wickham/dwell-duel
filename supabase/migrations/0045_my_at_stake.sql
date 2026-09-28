-- The Home hero's "At stake" (#29): how many solo bets and parlays the member
-- has riding, and the DC on them. A solo bet counts while its market is open
-- (including after close, awaiting a result); a parlay while it's pending.
-- Same split as my_wagers' "open" tab (0044), summed in SQL since PostgREST
-- aggregates are off. security invoker: it only ever reads auth.uid()'s rows,
-- through the bets and parlays policies.
begin;
set local lock_timeout = '5s';

create function public.my_at_stake()
returns table (wagers integer, dc bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer, coalesce(sum(amount), 0)::bigint
  from (
    select b.amount
    from public.bets b
    join public.markets m on m.id = b.market_id
    where b.profile_id = (select auth.uid()) and m.status = 'open'
    union all
    select p.stake
    from public.parlays p
    where p.profile_id = (select auth.uid()) and p.status = 'pending'
  ) riding;
$$;

revoke execute on function public.my_at_stake() from public, anon;
grant execute on function public.my_at_stake() to authenticated, service_role;

commit;
