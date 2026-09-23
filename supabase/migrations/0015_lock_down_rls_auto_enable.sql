-- `rls_auto_enable()` isn't one of ours -- it's the SECURITY DEFINER
-- function Supabase's platform generates to back the "Enable automatic
-- RLS" project setting (the event trigger that force-enables RLS on new
-- public-schema tables). Supabase's own Security Advisor flagged it as
-- directly callable via RPC by both `anon` and `authenticated`, which we
-- never need -- nothing in this app calls it, and the event trigger that
-- actually uses it runs with its own elevated privileges regardless of
-- what these two roles are granted. Revoking EXECUTE only closes an
-- unnecessary external door; it does not affect the auto-RLS behavior
-- itself.
--
-- Guarded because this function only exists on hosted projects that had
-- the "Enable automatic RLS" checkbox on at creation -- a fresh local
-- Supabase instance (and CI, which runs against one) has no such
-- function, and an unconditional REVOKE would fail migration application
-- there.
do $$
begin
  if exists (
    select 1 from pg_proc
    where pronamespace = 'public'::regnamespace
      and proname = 'rls_auto_enable'
  ) then
    revoke execute on function public.rls_auto_enable() from anon, authenticated;
  end if;
end $$;
