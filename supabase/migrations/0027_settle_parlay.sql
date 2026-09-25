create function settle_parlay(p_parlay_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile_id uuid;
  v_stake integer;
  v_status text;
  v_credited integer;
  v_leg record;
  v_any_lost boolean := false;
  v_any_pending boolean := false;
  v_any_won boolean := false;
  v_multiplier numeric := 1;
  v_target_status text;
  v_target_credit integer;
begin
  select profile_id, stake, status, credited
    into v_profile_id, v_stake, v_status, v_credited
  from public.parlays
  where id = p_parlay_id
  for update;

  for v_leg in
    select l.outcome_id, l.locked_odds, m.status as market_status, r.outcome_id as winning_outcome_id
    from public.parlay_legs l
    join public.markets m on m.id = l.market_id
    left join public.market_resolutions r on r.id = m.current_resolution_id
    where l.parlay_id = p_parlay_id
  loop
    if v_leg.market_status = 'voided' then
      null;
    elsif v_leg.market_status = 'resolved' then
      if v_leg.winning_outcome_id = v_leg.outcome_id then
        v_any_won := true;
        v_multiplier := v_multiplier * v_leg.locked_odds;
      else
        v_any_lost := true;
      end if;
    else
      v_any_pending := true;
    end if;
  end loop;

  if v_any_lost then
    v_target_status := 'lost';
    v_target_credit := 0;
  elsif v_any_pending then
    v_target_status := 'pending';
    v_target_credit := 0;
  elsif not v_any_won then
    v_target_status := 'refunded';
    v_target_credit := v_stake;
  else
    v_target_status := 'won';
    v_target_credit := floor(v_stake * least(v_multiplier, 20))::integer;
  end if;

  if v_target_status = v_status and v_target_credit = v_credited then
    return;
  end if;

  if v_credited > 0 then
    perform public.apply_coin_transaction(
      v_profile_id, -v_credited, 'parlay_reversed',
      jsonb_build_object('parlay_id', p_parlay_id)
    );
  end if;

  if v_target_credit > 0 then
    perform public.apply_coin_transaction(
      v_profile_id, v_target_credit,
      case v_target_status when 'won' then 'parlay_won' else 'parlay_refunded' end,
      jsonb_build_object('parlay_id', p_parlay_id)
    );
  end if;

  update public.parlays
  set status = v_target_status,
      credited = v_target_credit,
      settled_at = case when v_target_status = 'pending' then null else now() end
  where id = p_parlay_id;
end;
$$;

revoke execute on function settle_parlay(uuid) from public;
revoke execute on function settle_parlay(uuid) from anon;
revoke execute on function settle_parlay(uuid) from authenticated;
grant execute on function settle_parlay(uuid) to service_role;
