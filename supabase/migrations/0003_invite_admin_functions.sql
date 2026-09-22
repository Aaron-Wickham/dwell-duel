create function is_invited() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- Both just return false for an unauthenticated caller (auth.uid()/
-- auth.jwt() are null), so exposing them isn't a live hole either way —
-- but revoking from public/anon and granting only to authenticated is
-- free defense in depth, and is_admin() is called directly from app code
-- as supabase.rpc('is_admin'), so it needs the authenticated grant regardless.
revoke execute on function is_invited() from public;
revoke execute on function is_invited() from anon;
grant execute on function is_invited() to authenticated;

revoke execute on function is_admin() from public;
revoke execute on function is_admin() from anon;
grant execute on function is_admin() to authenticated;
