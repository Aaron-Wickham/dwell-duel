-- GHSA-qxxc-jg94-c49j: is_invited() trusted the session's email claim alone. Production allows only
-- Google sign-in, but if another provider (email sign-up) were ever switched on, anyone could sign
-- up with the address of an invitee who hasn't joined yet and be treated as them. Every access
-- gate (the profile insert, the invite claim in handle_new_profile, RLS) goes through is_invited(),
-- so it now also requires a Google identity on the account.
--
-- The tests mint sessions through magic links (the email provider), so a local database can allow
-- that with a row in app_flags, which only supabase/seed.sql inserts. Production has no such row.

create table public.app_flags (
  key text primary key check (key in ('allow_email_sign_in'))
);
alter table public.app_flags enable row level security;
-- No policies: members can't read or write it. The server (0109) and is_invited() can.
revoke all on table public.app_flags from anon, authenticated;
grant select, insert, update, delete on table public.app_flags to service_role;

create or replace function public.is_invited() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.allowed_emails
    where email = lower(auth.jwt() ->> 'email')
  )
  and (
    coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb) ? 'google'
    or exists (select 1 from public.app_flags where key = 'allow_email_sign_in')
  );
$$;
