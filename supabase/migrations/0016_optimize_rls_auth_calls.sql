-- Supabase's Performance Advisor flagged these three policies for
-- re-evaluating auth.uid()/auth.jwt() once per row instead of once per
-- query. Wrapping the call in a scalar subselect lets Postgres cache it
-- as an initplan, evaluated once regardless of row count -- the
-- policy's actual access logic is otherwise unchanged.
drop policy insert_own_profile on public.profiles;
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and is_invited()
    and balance = 0
    and is_admin = false
    and lower(email) = lower((select auth.jwt()) ->> 'email')
  );

drop policy select_own_or_admin_transactions on public.coin_transactions;
create policy select_own_or_admin_transactions on public.coin_transactions for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());

drop policy select_own_or_admin_bets on public.bets;
create policy select_own_or_admin_bets on public.bets for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());
