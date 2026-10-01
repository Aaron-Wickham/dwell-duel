-- rls_auto_enable() is Supabase's platform function behind the "Enable automatic RLS" setting (see
-- 0015). 0015 revoked EXECUTE from anon and authenticated, but a function's default EXECUTE grant is
-- to PUBLIC, which both roles inherit, so the Security Advisor still lists it as callable without
-- signing in. Nothing in the app calls it, and the event trigger that uses it is unaffected.
--
-- Guarded like 0015: the function exists only on hosted projects that had automatic RLS on at
-- creation, not on a local instance or in CI.
begin;

do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end $$;

commit;
