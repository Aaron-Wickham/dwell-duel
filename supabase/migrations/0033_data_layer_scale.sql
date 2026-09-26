-- ─── 1. Access rules run their helpers once per query ─────────────────────────
-- is_invited() and is_admin() (0003) are stable security definer functions,
-- which Postgres never inlines, so a bare call in a policy runs once per row.
-- Wrapped in a scalar subselect, each becomes an InitPlan that runs once per
-- statement, as 0016 did for auth.uid(). Every policy below is otherwise
-- exactly its latest definition (0005, 0006, 0014, 0016, 0022, 0030):
-- tests/db/data-layer-policies.test.ts proves only the wraps changed.

drop policy select_all_profiles on public.profiles;
create policy select_all_profiles on public.profiles for select to authenticated
  using ((select is_invited()));

drop policy insert_own_profile on public.profiles;
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and (select is_invited())
    and balance = 0
    and is_admin = false
    and lower(email) = lower((select auth.jwt()) ->> 'email')
  );

drop policy admin_select_invites on public.allowed_emails;
create policy admin_select_invites on public.allowed_emails for select to authenticated
  using ((select is_admin()));

drop policy admin_insert_invites on public.allowed_emails;
create policy admin_insert_invites on public.allowed_emails for insert to authenticated
  with check ((select is_admin()));

drop policy admin_delete_invites on public.allowed_emails;
create policy admin_delete_invites on public.allowed_emails for delete to authenticated
  using ((select is_admin()));

drop policy select_own_or_admin_transactions on public.coin_transactions;
create policy select_own_or_admin_transactions on public.coin_transactions for select to authenticated
  using (profile_id = (select auth.uid()) or (select is_admin()));

drop policy select_markets on public.markets;
create policy select_markets on public.markets for select to authenticated
  using ((select is_invited()));

drop policy select_market_outcomes on public.market_outcomes;
create policy select_market_outcomes on public.market_outcomes for select to authenticated
  using ((select is_invited()));

drop policy select_market_resolutions on public.market_resolutions;
create policy select_market_resolutions on public.market_resolutions for select to authenticated
  using ((select is_invited()));

drop policy select_invited_bets on public.bets;
create policy select_invited_bets on public.bets for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_invited_parlays on public.parlays;
create policy select_invited_parlays on public.parlays for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_invited_parlay_legs on public.parlay_legs;
create policy select_invited_parlay_legs on public.parlay_legs for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_tasks on public.tasks;
create policy select_tasks on public.tasks for select to authenticated
  using ((select is_invited()));

drop policy admin_insert_tasks on public.tasks;
create policy admin_insert_tasks on public.tasks for insert to authenticated
  with check ((select is_admin()));

drop policy admin_update_tasks on public.tasks;
create policy admin_update_tasks on public.tasks for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

drop policy select_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select is_admin())
    or (status = 'approved' and (select is_invited()))
  );

-- ─── 2. Indexes for named queries ─────────────────────────────────────────────
-- Each serves a query named in the spec (docs/superpowers/specs/
-- 2026-09-26-data-layer-scale-design.md, 1b). The tables are small today, so
-- building them inside the migration's transaction, without concurrently, is
-- instant.

-- A market's bets and chart reads, and the resolve and void loops.
create index bets_market_created_idx on public.bets (market_id, created_at desc, id desc);
-- The winner payout loop and the feed's bet_won branch.
create index bets_outcome_id_idx on public.bets (outcome_id);
-- Member activity: the feed's bet branches filtered by actor.
create index bets_profile_created_idx on public.bets (profile_id, created_at desc);
-- The override's reversal lookup, which otherwise scans the whole ledger while
-- the market row is locked. On the text, not a ::uuid cast, which would fail
-- this migration, or a later insert, on any row whose resolution_id isn't a
-- uuid. resolve_market compares it with meta ->> 'resolution_id' = <id>::text.
create index coin_transactions_resolution_id_idx on public.coin_transactions ((meta ->> 'resolution_id'));
-- Admin ledger paging.
create index coin_transactions_created_idx on public.coin_transactions (created_at desc, id desc);
-- listMyTaskCompletions, and member activity's task branch.
create index task_completions_profile_submitted_idx on public.task_completions (profile_id, submitted_at desc);
-- listPendingTaskCompletions.
create index task_completions_pending_submitted_idx on public.task_completions (submitted_at) where status = 'pending';
-- The feed's task branch.
create index task_completions_approved_reviewed_idx on public.task_completions (reviewed_at desc) where status = 'approved';
-- The feed's parlay-placed branch.
create index parlays_created_idx on public.parlays (created_at desc);
-- The feed's parlay-won branch.
create index parlays_won_settled_idx on public.parlays (settled_at desc) where status = 'won';
-- Member activity: resolutions by a member.
create index market_resolutions_resolved_by_idx on public.market_resolutions (resolved_by);
-- The feed's market_resolved and bet_won branches, which join markets on its
-- current resolution; without it, member activity scans markets for each.
create index markets_current_resolution_id_idx on public.markets (current_resolution_id);
