-- #418: Admin › Members' net worth for a page of members in one read, removed members included.
--
-- leaderboard_net_worth (0093) leaves removed members out, so Admin › Members fell back to one
-- member_standing call per removed member, which on the Removed tab was every row.
-- member_net_worths(ids) returns the same net worth both of those compute, balance plus
-- stakes_riding (0051), for any mix of current and removed members.
--
-- Security invoker, like both: a member reads profiles, bets and parlays through their own
-- policies, so a signed-in caller without an invite gets no rows. At most 50 ids a call, the
-- app's IN_CHUNK (lib/pagination/chunk.ts), so one call never reads more than a page's worth.
--
-- One explicit transaction, like 0034-0110.
begin;
set local lock_timeout = '5s';

create function public.member_net_worths(p_ids uuid[])
returns table (id uuid, score bigint)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if cardinality(p_ids) > 50 then
    raise exception 'too many members in one read';
  end if;

  return query
    with riding as (
      select s.profile_id, sum(s.amount)::bigint as dc
      from public.stakes_riding s
      where s.profile_id = any(p_ids)
      group by s.profile_id
    )
    select p.id, (p.balance + coalesce(r.dc, 0))::bigint
    from public.profiles p
    left join riding r on r.profile_id = p.id
    where p.id = any(p_ids);
end;
$$;

revoke execute on function public.member_net_worths(uuid[]) from public, anon;
grant execute on function public.member_net_worths(uuid[]) to authenticated, service_role;

commit;
