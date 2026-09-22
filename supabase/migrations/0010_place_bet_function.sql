create function place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
begin
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
$$;

revoke execute on function place_bet(uuid, uuid, integer) from public;
revoke execute on function place_bet(uuid, uuid, integer) from anon;
grant execute on function place_bet(uuid, uuid, integer) to authenticated;
grant execute on function place_bet(uuid, uuid, integer) to service_role;
