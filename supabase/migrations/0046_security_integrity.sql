-- Release 0.3 security batch (#57, #58, #59, #60, #62).
--
-- #57  A parlay leg's odds are locked without the bettor's own stakes on that
--      market, so betting against yourself (then cancelling) can't pump them.
-- #58  Nobody but an admin resolves a market they have a stake in (a live bet
--      or a pending parlay leg). After close, the creator or any reviewer
--      without a stake can resolve; admins can at any time, as before.
-- #59  Nobody reviews their own task submission; task rewards are 1-500 DC.
-- #60  Members can no longer read each other's email addresses. Admins read
--      them through member_emails().
-- #62  place_bet and cancel_bet check the invite gate; pool sums are bigint;
--      a market's title is fixed once anyone else has bet; stray proof files
--      are listed for the daily cron to delete.
--
-- One explicit transaction, like 0034-0045.
begin;
set local lock_timeout = '5s';

-- A member's stake in a market: a live bet, or a leg of a pending parlay.
create function public.has_stake_in_market(p_market_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.bets where market_id = p_market_id and profile_id = p_profile_id)
      or exists (
        select 1 from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
        where l.market_id = p_market_id and p.profile_id = p_profile_id and p.status = 'pending'
      )
$$;
revoke execute on function public.has_stake_in_market(uuid, uuid) from public, anon;
grant execute on function public.has_stake_in_market(uuid, uuid) to authenticated, service_role;

-- ---- #57 ----
CREATE OR REPLACE FUNCTION public.place_parlay(p_outcome_ids uuid[], p_stake integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_leg_count integer;
  v_max_legs integer;
  v_found_count integer;
  v_market_count integer;
  v_parlay_id uuid;
  v_pick record;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be positive';
  end if;

  select max_legs into v_max_legs from public.parlay_limits();
  v_leg_count := coalesce(array_length(p_outcome_ids, 1), 0);
  if v_leg_count < 2 or v_leg_count > v_max_legs then
    raise exception 'a parlay needs 2 to % picks', v_max_legs;
  end if;

  if (select count(distinct o) from unnest(p_outcome_ids) o) <> v_leg_count then
    raise exception 'each pick must be from a different market';
  end if;

  select count(*), count(distinct market_id) into v_found_count, v_market_count
  from public.market_outcomes
  where id = any(p_outcome_ids);

  if v_found_count <> v_leg_count then
    raise exception 'outcome not found';
  end if;

  if v_market_count <> v_leg_count then
    raise exception 'each pick must be from a different market';
  end if;

  perform 1 from public.markets
  where id in (select market_id from public.market_outcomes where id = any(p_outcome_ids))
  order by id
  for update;

  for v_pick in
    select o.label, m.title, m.status, m.close_at, m.seed_per_outcome,
           o.pool_total - coalesce((select sum(b.amount) from public.bets b
                                    where b.outcome_id = o.id and b.profile_id = auth.uid()), 0) as others_pool
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids)
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;
    if v_pick.others_pool + v_pick.seed_per_outcome = 0 then
      raise exception '''%'' has no bets yet', v_pick.label;
    end if;
  end loop;

  insert into public.parlays (profile_id, stake)
  values (auth.uid(), p_stake)
  returning id into v_parlay_id;

  perform public.apply_coin_transaction(
    auth.uid(), -p_stake, 'parlay_placed',
    jsonb_build_object('parlay_id', v_parlay_id)
  );

  -- #57: the pools here leave out the bettor's own stakes on each market.
  insert into public.parlay_legs (parlay_id, market_id, outcome_id, locked_odds)
  select v_parlay_id, o.market_id, o.id,
         trunc(
           (
             (select sum(o2.pool_total) from public.market_outcomes o2 where o2.market_id = o.market_id)
             - coalesce((select sum(b.amount) from public.bets b
                         where b.market_id = o.market_id and b.profile_id = auth.uid()), 0)
             + m.seed_per_outcome * (select count(*) from public.market_outcomes o2 where o2.market_id = o.market_id)
           )::numeric / (
             o.pool_total
             - coalesce((select sum(b.amount) from public.bets b
                         where b.outcome_id = o.id and b.profile_id = auth.uid()), 0)
             + m.seed_per_outcome
           ),
           4
         )
  from public.market_outcomes o
  join public.markets m on m.id = o.market_id
  where o.id = any(p_outcome_ids);

  return v_parlay_id;
end;
$function$;

-- ---- #58 ----
CREATE OR REPLACE FUNCTION public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_seed integer;
  v_outcome_count integer;
  v_outcome_market_id uuid;
  v_total_pool bigint;
  v_winning_pool bigint;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
  v_parlay_id uuid;
  v_short jsonb;
begin
  select created_by, status, close_at, current_resolution_id, seed_per_outcome
    into v_created_by, v_status, v_close_at, v_current_resolution_id, v_seed
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
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
  elsif not v_is_admin then
    if not (auth.uid() = v_created_by or public.has_role('reviewer')) then
      raise exception 'only the market creator, a reviewer or an admin can resolve this market';
    end if;
    if now() < v_close_at then
      raise exception 'market has not closed yet';
    end if;
    -- #58: a stake in the result rules you out, unless you're an admin.
    if public.has_stake_in_market(p_market_id, auth.uid()) then
      raise exception 'you have a stake in this market, so someone else resolves it';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  perform 1 from public.profiles where id in (
    select profile_id from public.coin_transactions where meta ->> 'resolution_id' = v_current_resolution_id::text
    union select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

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
      for no key update of p
    ) m;

    if v_short is not null then
      raise exception '%', 'clawback_short:' || v_short::text;
    end if;
  end if;

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

  select coalesce(sum(pool_total), 0), count(*) into v_total_pool, v_outcome_count
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
        floor(v_bet.amount::numeric * (v_total_pool + v_seed * v_outcome_count) / (v_winning_pool + v_seed))::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'seed_per_outcome', v_seed)
      );
    end loop;
  end if;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$function$;

create or replace function public.can_resolve_market(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Mirrors resolve_market_core's rules; the resolve form and the proof storage policy use it.
  select public.is_admin() or exists (
    select 1 from public.markets m
    where m.id = p_market_id
      and m.status = 'open'
      and now() >= m.close_at
      and (m.created_by = auth.uid() or public.has_role('reviewer'))
      and not public.has_stake_in_market(m.id, auth.uid())
  )
$$;

-- ---- #59 ----
CREATE OR REPLACE FUNCTION public.approve_task_completion(p_completion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if v_profile_id = auth.uid() then
    raise exception 'you can''t review your own submission';
  end if;

  update public.task_completions
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_completion_id;

  perform public.apply_coin_transaction(
    v_profile_id, v_reward_amount, 'task_completed',
    jsonb_build_object('task_id', v_task_id, 'completion_id', p_completion_id)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.reject_task_completion(p_completion_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if found and (select profile_id from public.task_completions where id = p_completion_id) = auth.uid() then
    raise exception 'you can''t review your own submission';
  end if;

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
$function$;

alter table public.tasks add constraint tasks_reward_amount_max check (reward_amount <= 500) not valid;
do $$
begin
  if not exists (select 1 from public.tasks where reward_amount > 500) then
    alter table public.tasks validate constraint tasks_reward_amount_max;
  end if;
end;
$$;

-- ---- #60 ----
-- Members hold a table-wide SELECT on profiles, which a column-level revoke
-- can't narrow; replace it with every column except email.
revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_url, avatar_path, bio, balance, role, created_at) on public.profiles to authenticated;

create function public.member_emails(p_ids uuid[])
returns table (id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can see member emails';
  end if;
  return query select p.id, p.email from public.profiles p where p.id = any(p_ids);
end;
$$;
revoke execute on function public.member_emails(uuid[]) from public, anon;
grant execute on function public.member_emails(uuid[]) to authenticated, service_role;

-- ---- #62 ----
CREATE OR REPLACE FUNCTION public.place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_amount <= 0 then
    raise exception 'bet amount must be positive';
  end if;

  select status, close_at into v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'market is not open for betting';
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  perform public.apply_coin_transaction(
    auth.uid(), -p_amount, 'bet_placed',
    jsonb_build_object('market_id', p_market_id, 'outcome_id', p_outcome_id)
  );

  insert into public.bets (market_id, outcome_id, profile_id, amount)
  values (p_market_id, p_outcome_id, auth.uid(), p_amount);

  update public.market_outcomes
  set pool_total = pool_total + p_amount
  where id = p_outcome_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_bet(p_bet_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  select market_id into v_market_id
  from public.bets
  where id = p_bet_id and profile_id = auth.uid();

  if not found then
    raise exception 'bet not found';
  end if;

  select status, close_at into v_status, v_close_at
  from public.markets
  where id = v_market_id
  for update;

  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'this market has closed, so the bet can no longer be cancelled';
  end if;

  -- Re-read under the market lock: a second cancel of the same bet that
  -- waited on the lock finds nothing here and fails cleanly.
  select * into v_bet
  from public.bets
  where id = p_bet_id and profile_id = auth.uid()
  for update;

  if not found then
    raise exception 'bet not found';
  end if;

  perform public.apply_coin_transaction(
    v_bet.profile_id, v_bet.amount, 'bet_cancelled',
    jsonb_build_object('market_id', v_bet.market_id, 'outcome_id', v_bet.outcome_id, 'bet_id', v_bet.id)
  );

  insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
  values (v_bet.id, v_bet.market_id, v_bet.outcome_id, v_bet.profile_id, v_bet.amount, v_bet.created_at);

  delete from public.bets where id = v_bet.id;

  update public.market_outcomes
  set pool_total = pool_total - v_bet.amount
  where id = v_bet.outcome_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_market(p_market_id uuid, p_title text, p_description text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_market record;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
begin
  select created_by, status, close_at, title, description into v_market
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;
  if not (v_market.created_by = auth.uid() or public.is_admin()) then
    raise exception 'only the market''s creator or an admin can edit it';
  end if;
  if v_market.status <> 'open' or now() >= v_market.close_at then
    raise exception 'this market has closed, so it can''t be edited';
  end if;
  if v_title = '' then
    raise exception 'enter a title';
  end if;
  -- Rewording the question after someone else has bet on it would change their bet.
  if v_title <> v_market.title and exists (
    select 1 from public.bets where market_id = p_market_id and profile_id <> v_market.created_by
  ) then
    raise exception 'others have bet on this market, so its title can''t change';
  end if;

  if v_title = v_market.title and v_description is not distinct from v_market.description then
    return;
  end if;

  insert into public.market_edits (market_id, edited_by, old_title, new_title, old_description, new_description)
  values (p_market_id, auth.uid(), v_market.title, v_title, v_market.description, v_description);

  update public.markets
  set title = v_title, description = v_description, edited_at = now()
  where id = p_market_id;
end;
$function$;

-- Proof files uploaded but never attached (an abandoned form), older than a day.
-- The daily cron deletes them through the Storage API (direct deletes from
-- storage.objects aren't allowed).
create function public.stray_proof_objects(p_limit integer default 500)
returns table (name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.name from storage.objects o
  where o.bucket_id = 'proof'
    and o.created_at < now() - interval '1 day'
    and not exists (select 1 from public.proof_attachments a where a.storage_path = o.name)
  order by o.created_at
  limit p_limit
$$;
revoke execute on function public.stray_proof_objects(integer) from public, anon, authenticated;
grant execute on function public.stray_proof_objects(integer) to service_role;

commit;
