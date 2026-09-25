create or replace function resolve_market(p_market_id uuid, p_outcome_id uuid)
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

  -- Reverse the currently-active resolution's payouts, if there is one.
  -- Every payout/refund a resolution makes carries that resolution's own
  -- id in meta, so this targets exactly (and only) those transactions --
  -- never a later resolution's, never an unrelated bet.
  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where (meta ->> 'resolution_id')::uuid = v_current_resolution_id
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
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id loop
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

create or replace function void_market(p_market_id uuid)
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

  update public.markets set status = 'voided' where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id loop
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
