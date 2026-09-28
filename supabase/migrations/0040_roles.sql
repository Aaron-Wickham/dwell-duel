-- Layered roles replace the single is_admin flag: owner > admin > reviewer >
-- member.
--
--   owner     everything; the only role that can adjust balances, delete
--             markets and tasks, remove a member's bet, and grant roles.
--             Exactly one account.
--   admin     create and edit tasks, resolve, override and void any market,
--             invite and revoke members, read the whole ledger.
--   reviewer  approve and reject task submissions.
--   member    bets, creates markets, submits tasks.
--
-- is_admin() keeps its name and now means "admin or owner", so every policy
-- and function that already calls it keeps working unchanged. Only the gates
-- that move are rewritten here: task review drops to reviewer, and balance
-- adjustments rise to owner.
--
-- One explicit transaction, like 0034-0039. lock_timeout bounds the
-- profiles alter; an abort applies nothing and the Deploy Production
-- Database workflow can simply be re-run.
begin;
set local lock_timeout = '5s';

alter table public.profiles
  add column role text not null default 'member'
  check (role in ('owner', 'admin', 'reviewer', 'member'));

update public.profiles set role = 'admin' where is_admin;

-- The owner is Aaron's account. Should that email have no profile in some
-- environment, the longest-standing admin becomes owner instead, so there is
-- always an owner wherever there was an admin.
update public.profiles
set role = 'owner'
where id = coalesce(
  (select id from public.profiles where lower(email) = 'aaronmaxwellwickham1917@gmail.com'),
  (select id from public.profiles where role = 'admin' order by created_at, id limit 1)
);

create unique index profiles_single_owner on public.profiles ((true)) where role = 'owner';

create function public.role_rank(p_role text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'reviewer' then 1 else 0 end
$$;

-- The caller's role; 'member' for anyone without a profile.
create function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'member')
$$;

create function public.has_role(p_min text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.role_rank(public.my_role()) >= public.role_rank(p_min)
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role('admin')
$$;

revoke execute on function public.role_rank(text) from public, anon;
revoke execute on function public.my_role() from public, anon;
revoke execute on function public.has_role(text) from public, anon;
grant execute on function public.role_rank(text) to authenticated, service_role;
grant execute on function public.my_role() to authenticated, service_role;
grant execute on function public.has_role(text) to authenticated, service_role;

-- The only policy that named the column: a new profile starts as a member.
drop policy insert_own_profile on public.profiles;
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and (select is_invited())
    and balance = 0
    and role = 'member'
    and lower(email) = lower((select auth.jwt()) ->> 'email')
  );

alter table public.profiles drop column is_admin;

-- ─── Reviewers review ─────────────────────────────────────────────────────────
-- Identical to 0020 and 0021 apart from the role check. review_task_completions
-- (0033) calls these two per row, so it inherits the new gate; its own
-- up-front check is rewritten below to match.

create or replace function public.approve_task_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_reward_amount integer;
  v_task_id uuid;
begin
  if not public.has_role('reviewer') then
    raise exception 'only a reviewer can approve a task completion';
  end if;

  select status, profile_id, reward_amount, task_id
    into v_status, v_profile_id, v_reward_amount, v_task_id
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'completion not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'completion is not pending';
  end if;

  update public.task_completions
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_completion_id;

  perform public.apply_coin_transaction(
    v_profile_id, v_reward_amount, 'task_completed',
    jsonb_build_object('task_id', v_task_id, 'completion_id', p_completion_id)
  );
end;
$$;

create or replace function public.reject_task_completion(p_completion_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.has_role('reviewer') then
    raise exception 'only a reviewer can reject a task completion';
  end if;

  select status into v_status
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'completion not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'completion is not pending';
  end if;

  update public.task_completions
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_reason
  where id = p_completion_id;
end;
$$;

-- Identical to 0033's apart from the role check; see 0033 for the lock order.
create or replace function public.review_task_completions(p_ids uuid[], p_approve boolean, p_note text default null)
returns table (id uuid, ok boolean, error text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_role('reviewer') then
    raise exception 'only a reviewer can review task completions';
  end if;

  if cardinality(p_ids) > 500 then
    raise exception 'too many completions in one review';
  end if;

  perform 1 from public.task_completions tc where tc.id = any(p_ids) order by tc.id for update;
  if p_approve then
    perform 1 from public.profiles p where p.id in (
      select tc.profile_id from public.task_completions tc where tc.id = any(p_ids)
    ) order by p.id for no key update;
  end if;

  for v_id in select distinct u.v from unnest(p_ids) as u(v) order by u.v loop
    begin
      if p_approve then
        perform public.approve_task_completion(v_id);
      else
        perform public.reject_task_completion(v_id, p_note);
      end if;
      id := v_id;
      ok := true;
      error := null;
    exception when others then
      id := v_id;
      ok := false;
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

-- A reviewer has to see every pending submission to review it.
drop policy select_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select has_role('reviewer'))
    or (status = 'approved' and (select is_invited()))
  );

-- ─── Owner-only powers ────────────────────────────────────────────────────────

-- Identical to 0034's apart from the role check.
create or replace function public.adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can adjust a balance';
  end if;

  if p_amount = 0 then
    raise exception 'adjustment amount must not be zero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for a balance adjustment';
  end if;

  if char_length(p_reason) > 200 then
    raise exception 'reason too long';
  end if;

  perform public.apply_coin_transaction(
    p_profile_id, p_amount, 'admin_adjustment',
    jsonb_build_object('reason', p_reason, 'adjusted_by', auth.uid())
  );
end;
$$;

-- There is only ever one owner, so the owner's own role can't be changed here
-- and nobody can be made owner through it.
create function public.set_member_role(p_profile_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can change roles';
  end if;

  if p_role not in ('admin', 'reviewer', 'member') then
    raise exception 'role must be admin, reviewer or member';
  end if;

  if p_profile_id = auth.uid() then
    raise exception 'the owner''s own role can''t be changed';
  end if;

  update public.profiles set role = p_role where id = p_profile_id and role <> 'owner';
  if not found then
    raise exception 'member not found';
  end if;
end;
$$;

-- A market is only deleted while nothing hangs off it: no bets, cancelled
-- bets or parlay legs. Anything with money on it is voided instead, which
-- refunds everyone and keeps the ledger's story intact.
create function public.delete_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can delete a market';
  end if;

  perform 1 from public.markets where id = p_market_id for update;
  if not found then
    raise exception 'market not found';
  end if;

  if exists (select 1 from public.bets where market_id = p_market_id)
     or exists (select 1 from public.cancelled_bets where market_id = p_market_id)
     or exists (select 1 from public.parlay_legs where market_id = p_market_id) then
    raise exception 'this market has bets, so void it instead';
  end if;

  update public.markets set current_resolution_id = null where id = p_market_id;
  delete from public.markets where id = p_market_id;
end;
$$;

-- Likewise a task, only before anyone has submitted it; after that it can be
-- deactivated instead, which keeps its members' history and rewards.
create function public.delete_task(p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can delete a task';
  end if;

  perform 1 from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task not found';
  end if;

  if exists (select 1 from public.task_completions where task_id = p_task_id) then
    raise exception 'members have submitted this task, so deactivate it instead';
  end if;

  delete from public.tasks where id = p_task_id;
end;
$$;

-- Removes any member's bet with a full refund, while its market is still
-- open, exactly as that member cancelling it would (0037). Locks in cancel_bet's
-- order: the market first, then the ledger, then bets and the pool.
create function public.remove_bet(p_bet_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_status text;
  v_bet public.bets%rowtype;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can remove a bet';
  end if;

  select market_id into v_market_id from public.bets where id = p_bet_id;
  if not found then
    raise exception 'bet not found';
  end if;

  select status into v_status from public.markets where id = v_market_id for update;
  if v_status <> 'open' then
    raise exception 'this market is no longer open, so the bet can''t be removed';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then
    raise exception 'bet not found';
  end if;

  perform public.apply_coin_transaction(
    v_bet.profile_id, v_bet.amount, 'bet_cancelled',
    jsonb_build_object('market_id', v_bet.market_id, 'outcome_id', v_bet.outcome_id, 'bet_id', v_bet.id, 'removed_by', auth.uid())
  );

  insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
  values (v_bet.id, v_bet.market_id, v_bet.outcome_id, v_bet.profile_id, v_bet.amount, v_bet.created_at);

  delete from public.bets where id = v_bet.id;

  update public.market_outcomes set pool_total = pool_total - v_bet.amount where id = v_bet.outcome_id;
end;
$$;

revoke execute on function public.set_member_role(uuid, text) from public, anon;
revoke execute on function public.delete_market(uuid) from public, anon;
revoke execute on function public.delete_task(uuid) from public, anon;
revoke execute on function public.remove_bet(bigint) from public, anon;
grant execute on function public.set_member_role(uuid, text) to authenticated, service_role;
grant execute on function public.delete_market(uuid) to authenticated, service_role;
grant execute on function public.delete_task(uuid) to authenticated, service_role;
grant execute on function public.remove_bet(bigint) to authenticated, service_role;

commit;
