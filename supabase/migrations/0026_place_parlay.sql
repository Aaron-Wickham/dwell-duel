create function place_parlay(p_outcome_ids uuid[], p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg_count integer;
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

  v_leg_count := coalesce(array_length(p_outcome_ids, 1), 0);
  if v_leg_count < 2 or v_leg_count > 6 then
    raise exception 'a parlay needs 2 to 6 picks';
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

  -- Lock every leg's market in a fixed order, so pools can't move while
  -- odds are read and two concurrent placements can't deadlock.
  perform 1 from public.markets
  where id in (select market_id from public.market_outcomes where id = any(p_outcome_ids))
  order by id
  for update;

  for v_pick in
    select o.label, o.pool_total, m.title, m.status, m.close_at
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids)
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;
    if v_pick.pool_total = 0 then
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

  insert into public.parlay_legs (parlay_id, market_id, outcome_id, locked_odds)
  select v_parlay_id, o.market_id, o.id,
         (select sum(o2.pool_total) from public.market_outcomes o2 where o2.market_id = o.market_id)::numeric
           / o.pool_total
  from public.market_outcomes o
  where o.id = any(p_outcome_ids);

  return v_parlay_id;
end;
$$;

revoke execute on function place_parlay(uuid[], integer) from public;
revoke execute on function place_parlay(uuid[], integer) from anon;
grant execute on function place_parlay(uuid[], integer) to authenticated;
grant execute on function place_parlay(uuid[], integer) to service_role;
