create function resolve_market(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
  v_total_pool integer;
  v_winning_pool integer;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_bet record;
begin
  select created_by, status, close_at into v_created_by, v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'market already resolved or voided';
  end if;

  select public.is_admin() into v_is_admin;

  if not (auth.uid() = v_created_by or v_is_admin) then
    raise exception 'only the market creator or an admin can resolve this market';
  end if;

  if now() < v_close_at and not v_is_admin then
    raise exception 'market has not closed yet';
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
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
    -- Nobody bet the winning outcome -- there's no one to pay the
    -- losers' money to, so refund every bet instead of manufacturing a
    -- payout or letting the pool vanish.
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
end;
$$;

revoke execute on function resolve_market(uuid, uuid) from public;
revoke execute on function resolve_market(uuid, uuid) from anon;
grant execute on function resolve_market(uuid, uuid) to authenticated;
grant execute on function resolve_market(uuid, uuid) to service_role;
