-- Final whole-branch review hardening. These four fixes only became
-- visible by reasoning across migrations 0001-0005 together — no single
-- task's own review could catch them in isolation.

-- Finding 1 (critical): insert_own_profile constrained id/balance/is_admin
-- but not email. An invited user could insert their own profile row with
-- email set to anything — including the app owner's Gmail address — and
-- the README's documented one-time admin-promotion command
-- (`update profiles set is_admin = true where email = '...'`) would then
-- promote that attacker's row too, since it matches on the
-- attacker-controlled column. Require email to match the caller's
-- verified JWT email — the same identity source is_invited() and
-- handle_new_profile() already trust — closing the escalation path.
drop policy insert_own_profile on public.profiles;
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (
    id = auth.uid()
    and is_invited()
    and balance = 0
    and is_admin = false
    and lower(email) = lower(auth.jwt() ->> 'email')
  );

-- Finding 3, code half (important): nothing stopped a stranger from
-- signing up against the public anon key and then reading every row of
-- profiles (email, balance, admin status) via the old unconditional
-- `using (true)` select policy. Require the caller to actually be on the
-- invite list. is_invited() is already SECURITY DEFINER and already
-- granted EXECUTE to authenticated (migration 0003), so no new grant is
-- needed here.
drop policy select_all_profiles on public.profiles;
create policy select_all_profiles on public.profiles for select to authenticated
  using (is_invited());

-- Finding 2 (important): Supabase's ALTER DEFAULT PRIVILEGES pre-grants
-- ALL on every new table to anon/authenticated before any
-- migration-defined grant runs, so migration 0005's column-restricted
-- `grant insert (id, email, display_name, avatar_url) on public.profiles`
-- was purely additive on top of that blanket grant, not actually
-- restrictive. RLS has caught every write regardless, but the intended
-- second layer of defense didn't exist. Revoke the blanket defaults and
-- re-establish only the narrow grants 0005 intended. No grants to anon at
-- all on any of these three tables — regular users only ever act as
-- authenticated, once signed in.
revoke all on public.profiles from anon, authenticated;
revoke all on public.allowed_emails from anon, authenticated;
revoke all on public.coin_transactions from anon, authenticated;

grant select on public.profiles to authenticated;
grant insert (id, email, display_name, avatar_url) on public.profiles to authenticated;

grant select, insert, delete on public.allowed_emails to authenticated;

grant select on public.coin_transactions to authenticated;

-- Finding 4 (important): every other SECURITY DEFINER function in this
-- branch (is_invited, is_admin, apply_coin_transaction) explicitly
-- revokes EXECUTE from public/anon/authenticated in its own migration.
-- handle_new_profile() (migration 0004, the trigger function) never got
-- this treatment and still carries the Postgres-default EXECUTE-to-PUBLIC
-- grant. Not currently exploitable — Postgres won't let a non-trigger
-- caller invoke a `returns trigger` function, and PostgREST doesn't
-- expose it either — but it's the one function in the branch that breaks
-- the branch's own stated rule, and a bad precedent for later definer
-- functions.
revoke execute on function public.handle_new_profile() from public, anon, authenticated;
