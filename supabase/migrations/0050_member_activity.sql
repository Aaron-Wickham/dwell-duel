-- #85: Admin -> Members shows when each member joined and last signed in.
-- joined_at is profiles.created_at, not auth.users.created_at: an auth user
-- exists from someone's first Google sign-in, invited or not, while the
-- profile is made only once an invite lets them in, which is when they
-- joined. last_sign_in_at lives only in auth.users, which members can't read.

create function public.member_activity(p_ids uuid[])
returns table (id uuid, joined_at timestamptz, last_sign_in_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role('admin') then
    raise exception 'only an admin can see member activity';
  end if;
  return query
    select p.id, p.created_at, u.last_sign_in_at
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.id = any(p_ids);
end;
$$;
revoke execute on function public.member_activity(uuid[]) from public, anon;
grant execute on function public.member_activity(uuid[]) to authenticated, service_role;
