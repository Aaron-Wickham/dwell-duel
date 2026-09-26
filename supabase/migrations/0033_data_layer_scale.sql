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

-- ─── 3. Resolve and void: clawback block and deterministic lock order ─────────
-- Both recreated from 0028 with two changes. First, an override checks, before
-- anything changes, that every earlier winner can pay back what it would claw
-- back, and otherwise raises 'clawback_short:' plus a JSON list of who's short
-- (lib/markets/clawback.ts turns that into the resolve form's message). Second,
-- right after the auth and outcome checks, each function takes every profile
-- lock it will need in one statement, ordered by id, before the clawback block
-- or any write. Sorting each phase on its own -- the clawback block, the
-- reversal, the payout/refund loop, settle_parlay's own locking -- isn't
-- enough: two concurrent calls whose bettors or parlay owners cross, in
-- different per-phase orders, could still deadlock. With the market row
-- locked first, this up-front lock gives every call the same global order:
-- market row, then profiles by id, then (via settle_parlay) parlays. The
-- per-loop `order by profile_id, id` stays, for determinism, but re-locks
-- rows this call already holds -- it's the up-front lock that rules out the
-- deadlock. The reversal also finds its ledger rows by the text
-- resolution_id, which section 2's index serves, rather than a ::uuid cast.
-- create or replace keeps both functions' grants.

create or replace function public.resolve_market(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_outcome_market_id uuid;
  v_total_pool integer;
  v_winning_pool integer;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
  v_parlay_id uuid;
  v_short jsonb;
begin
  select created_by, status, close_at, current_resolution_id
    into v_created_by, v_status, v_close_at, v_current_resolution_id
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status = 'voided' then
    raise exception 'market was voided';
  end if;

  select public.is_admin() into v_is_admin;

  if v_status = 'resolved' then
    -- Overriding an already-resolved market: admin only. This is the
    -- clawback path.
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
  else
    -- First-time resolution: the creator or an admin. Only once closed,
    -- unless an admin is resolving early.
    if not (auth.uid() = v_created_by or v_is_admin) then
      raise exception 'only the market creator or an admin can resolve this market';
    end if;
    if now() < v_close_at and not v_is_admin then
      raise exception 'market has not closed yet';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  -- Every profile this call could touch, locked once up front in id order,
  -- before the clawback block or any write: the current resolution's payout
  -- recipients (also the reversal's), this market's bettors, and the owners
  -- of parlays with a leg here. See the note above the two functions for why
  -- this -- not the per-phase ordering below -- is what rules out a
  -- cross-phase deadlock. When there's no current resolution, the first
  -- branch of the union matches no rows.
  perform 1 from public.profiles where id in (
    select profile_id from public.coin_transactions where meta ->> 'resolution_id' = v_current_resolution_id::text
    union select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for update;

  -- An override claws back every payout of the current resolution, and
  -- settle_parlay reverses every won parlay whose leg here picked the old
  -- winner. A member who has spent their winnings would hit the balance check
  -- part-way through, so check first and name who's short. What's owed is
  -- gross, not netted against the new outcome's payouts: the reversal runs
  -- before any new payout. Nothing of it is already reversed, because a
  -- resolution is only ever reversed as it stops being current. The owing
  -- members' profiles are locked, in id order, so their balances can't move
  -- before the reversal.
  if v_status = 'resolved' then
    select jsonb_agg(
             jsonb_build_object('display_name', m.display_name, 'owed', m.owed, 'balance', m.balance)
             order by m.display_name, m.id
           ) filter (where m.balance < m.owed)
      into v_short
    from (
      select p.id, p.display_name, p.balance, o.owed
      from public.profiles p
      join (
        select c.profile_id, sum(c.amount) as owed
        from (
          select t.profile_id, t.amount
          from public.coin_transactions t
          where t.meta ->> 'resolution_id' = v_current_resolution_id::text
          union all
          select pa.profile_id, pa.credited
          from public.parlays pa
          where pa.status = 'won'
            and exists (
              select 1 from public.parlay_legs l
              where l.parlay_id = pa.id
                and l.market_id = p_market_id
                and l.outcome_id <> p_outcome_id
            )
        ) c
        group by c.profile_id
      ) o on o.profile_id = p.id
      order by p.id
      for update of p
    ) m;

    if v_short is not null then
      raise exception '%', 'clawback_short:' || v_short::text;
    end if;
  end if;

  -- Reverse the currently-active resolution's payouts, if there is one.
  -- Every payout/refund a resolution makes carries that resolution's own
  -- id in meta, so this targets exactly (and only) those transactions --
  -- never a later resolution's, never an unrelated bet.
  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where meta ->> 'resolution_id' = v_current_resolution_id::text
      order by profile_id, id
    loop
      perform public.apply_coin_transaction(
        v_txn.profile_id, -v_txn.amount, 'resolution_reversed',
        jsonb_build_object(
          'market_id', p_market_id,
          'reversed_resolution_id', v_current_resolution_id,
          'original_transaction_id', v_txn.id
        )
      );
    end loop;

    update public.market_resolutions
    set reversed_at = now(), reversed_by = auth.uid()
    where id = v_current_resolution_id;
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id
  where id = p_market_id;

  select coalesce(sum(pool_total), 0) into v_total_pool
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * v_total_pool / v_winning_pool)::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  end if;

  -- Fixed order, so two concurrent resolutions touching overlapping
  -- parlays lock them in the same sequence and can't deadlock.
  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;

create or replace function public.void_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_bet record;
  v_parlay_id uuid;
begin
  select created_by, status into v_created_by, v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not (auth.uid() = v_created_by or public.is_admin()) then
    raise exception 'only the market creator or an admin can void this market';
  end if;

  -- Every profile this call could touch, locked once up front in id order,
  -- before any write: this market's bettors and the owners of parlays with a
  -- leg here. A voided market only ever had status 'open' (checked above),
  -- so it never has a current resolution to reverse -- see the note above
  -- resolve_market and void_market for why this, not the per-loop ordering
  -- below, is what rules out a cross-phase deadlock.
  perform 1 from public.profiles where id in (
    select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for update;

  update public.markets set status = 'voided' where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
    perform public.apply_coin_transaction(
      v_bet.profile_id, v_bet.amount, 'bet_voided_refund',
      jsonb_build_object('market_id', p_market_id, 'bet_id', v_bet.id)
    );
  end loop;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;
