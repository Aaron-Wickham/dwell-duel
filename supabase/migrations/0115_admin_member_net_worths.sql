-- #429: Admin › Members' Removed tab sorted by net worth.
--
-- The Active tab sorts by net worth off the net-worth board (0093), which leaves removed members
-- out, and member_net_worths (0111) reads only the ids it's given, so the Removed tab couldn't sort
-- by it. admin_member_net_worths(query) is every member admin_members(query) lists, with the same
-- net worth both of those compute (balance plus stakes_riding, 0051) and whether they've been
-- removed, so the app can filter, order and page it in SQL like any other column.
--
-- Security invoker, like admin_member_counts: admin_members checks the role, and an admin reads
-- bets and parlays through their own policies, as member_net_worths does.
--
-- One explicit transaction, like 0034-0111.
begin;
set local lock_timeout = '5s';

create function public.admin_member_net_worths(p_query text default null)
returns table (id uuid, display_name text, score bigint, removed boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  with riding as (
    select s.profile_id, sum(s.amount)::bigint as dc
    from public.stakes_riding s
    group by s.profile_id
  )
  select m.id, m.display_name, (m.balance + coalesce(r.dc, 0))::bigint, m.removed
  from public.admin_members(p_query) m
  left join riding r on r.profile_id = m.id;
$$;

revoke execute on function public.admin_member_net_worths(text) from public, anon;
grant execute on function public.admin_member_net_worths(text) to authenticated, service_role;

commit;
