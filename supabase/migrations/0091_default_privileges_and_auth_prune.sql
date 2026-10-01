-- Default privileges (#274) and pruning uninvited sign-ins (#275).
--
-- #274  Supabase's default privileges give anon and authenticated full rights
--       on every new table, sequence and function postgres creates in public,
--       and Postgres itself gives PUBLIC (which anon is a member of) EXECUTE on
--       every new function. Each migration has had to remember its own
--       `revoke ... from public, anon`. From here on anon gets nothing by
--       default, and no new function is executable by PUBLIC: a migration
--       grants what it means to. The PUBLIC default can only be changed
--       globally, not per schema, so that one line has no `in schema`.
--       authenticated keeps its schema defaults, so an app that relies on them
--       keeps working; tests/db/schema-privileges.test.ts sweeps what anon and
--       authenticated can reach.
--       The four identity sequences still carried anon's default grant, which
--       nothing uses; it goes too.
--       has_stake_in_market answers false to a signed-in account that isn't
--       invited, like the rest of the member API. The service role (no
--       auth.uid()) and the resolve functions that call it are unaffected.
--
-- #275  Anyone can finish Google sign-in, which creates an auth.users row with
--       their name, email and picture even when the callback then turns them
--       away. uninvited_auth_users lists such rows a day old or more, for the
--       daily cron to delete through the Auth admin API. It never lists
--       anyone with a profile (removed members keep theirs), an invite, or a
--       ledger row.
--
-- Additive: grants and new functions only; has_stake_in_market keeps its
-- signature and its answer for every invited caller.
begin;
set local lock_timeout = '5s';

-- ─── #274 ───────────────────────────────────────────────────────────────────

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke all on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

revoke all on all sequences in schema public from anon;

create or replace function public.has_stake_in_market(p_market_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (auth.uid() is null or public.is_invited())
     and (
       exists (select 1 from public.bets where market_id = p_market_id and profile_id = p_profile_id)
       or exists (
         select 1 from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
         where l.market_id = p_market_id and p.profile_id = p_profile_id and p.status = 'pending'
       )
     )
$$;

-- ─── #275 ───────────────────────────────────────────────────────────────────

create function public.uninvited_auth_users(p_limit integer default 100)
returns table (id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where u.created_at < now() - interval '1 day'
    and not exists (select 1 from public.profiles p where p.id = u.id)
    and not exists (select 1 from public.allowed_emails a where a.email = lower(u.email) or a.claimed_by = u.id)
    and not exists (select 1 from public.coin_transactions t where t.profile_id = u.id)
  order by u.created_at, u.id
  limit least(greatest(p_limit, 0), 500)
$$;

revoke execute on function public.uninvited_auth_users(integer) from public, anon, authenticated;
grant execute on function public.uninvited_auth_users(integer) to service_role;

commit;
