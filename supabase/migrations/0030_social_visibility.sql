-- Sub-project 6 makes betting social: every invited member can see who bet
-- what. Pending and rejected task completions, and the coin ledger, stay private.
drop policy select_own_or_admin_bets on public.bets;
create policy select_invited_bets on public.bets for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlays on public.parlays;
create policy select_invited_parlays on public.parlays for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlay_legs on public.parlay_legs;
create policy select_invited_parlay_legs on public.parlay_legs for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or is_admin()
    or (status = 'approved' and is_invited())
  );
