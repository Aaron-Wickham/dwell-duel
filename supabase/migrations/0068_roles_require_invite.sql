-- #202: a role only counts while its holder is invited. my_role() read profiles.role alone, and
-- has_role() and is_admin() (and through them every role-gated policy and RPC) build on it, so an
-- admin whose allowed_emails row was removed kept every admin power, including the insert policy
-- on allowed_emails that let them invite themselves back. Nothing else reads the caller's role
-- from profiles, so this is the one place to fix it.
--
-- remove_member is the owner's way to take someone out of DwellDuel: their role goes back to
-- member, their invite goes, and their devices stop getting pushes. Their coins, bets and history
-- stay, so the ledger and the feed still add up, and inviting them again restores everything.
--
-- One explicit transaction, like 0034-0067.
begin;
set local lock_timeout = '5s';

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_invited() then coalesce((select role from public.profiles where id = auth.uid()), 'member')
    else 'member'
  end
$$;

create function public.remove_member(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_role text;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can remove a member';
  end if;

  select lower(email), role into v_email, v_role
  from public.profiles
  where id = p_profile_id
  for update;

  if not found then
    raise exception 'member not found';
  end if;

  if p_profile_id = auth.uid() or v_role = 'owner' then
    raise exception 'the owner can''t be removed';
  end if;

  update public.profiles set role = 'member' where id = p_profile_id;
  -- By email, as is_invited() matches, and by claim, in case the profile's email was ever recased.
  delete from public.allowed_emails where email = v_email or claimed_by = p_profile_id;
  delete from public.push_subscriptions where profile_id = p_profile_id;
end;
$$;

revoke execute on function public.remove_member(uuid) from public, anon;
grant execute on function public.remove_member(uuid) to authenticated, service_role;

commit;
