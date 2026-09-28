-- Places a whole bet slip at once: any number of solo bets plus at most one
-- parlay, all or nothing. It reuses place_bet and place_parlay, so every rule
-- they enforce still applies; running them inside this one function makes a
-- failure in any of them roll back the rest.
--
-- A failing pick's error is prefixed with its outcome id ("pick <id>: ...")
-- or "parlay: ...", so the app can point at the pick that needs fixing. A
-- balance check failure is re-raised untouched: it's about the slip's total,
-- not one pick, and the app already recognises it by name.
--
-- Security definer, like the two functions it calls, because it takes
-- FOR UPDATE locks on markets, which members can't update directly.
-- auth.uid() still names the caller inside it.
create function public.place_slip(p_singles jsonb, p_parlay_outcome_ids uuid[], p_parlay_stake integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_single jsonb;
  v_outcome_id uuid;
  v_market_id uuid;
  v_parlay_id uuid;
  v_parlay_legs integer := coalesce(array_length(p_parlay_outcome_ids, 1), 0);
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not invited';
  end if;

  if jsonb_typeof(coalesce(p_singles, '[]'::jsonb)) <> 'array' then
    raise exception 'singles must be a list';
  end if;

  if jsonb_array_length(coalesce(p_singles, '[]'::jsonb)) = 0 and v_parlay_legs = 0 then
    raise exception 'your slip is empty';
  end if;

  -- Every market the slip touches, locked up front in id order. place_bet
  -- locks one market per call in the slip's order, and place_parlay locks
  -- its own in id order; two slips taking those in different orders could
  -- deadlock. Taking them all here first, in one fixed order, means the
  -- later locks are ones this transaction already holds.
  perform 1
  from public.markets m
  where m.id in (
    select o.market_id
    from public.market_outcomes o
    where o.id in (
      select (s ->> 'outcome_id')::uuid from jsonb_array_elements(coalesce(p_singles, '[]'::jsonb)) s
      union
      select unnest(coalesce(p_parlay_outcome_ids, '{}'::uuid[]))
    )
  )
  order by m.id
  for update;

  for v_single in select * from jsonb_array_elements(coalesce(p_singles, '[]'::jsonb)) loop
    v_outcome_id := (v_single ->> 'outcome_id')::uuid;
    begin
      select market_id into v_market_id from public.market_outcomes where id = v_outcome_id;
      if v_market_id is null then
        raise exception 'outcome not found';
      end if;
      perform public.place_bet(v_market_id, v_outcome_id, (v_single ->> 'amount')::integer);
    exception
      when check_violation then
        raise;
      when others then
        raise exception using errcode = sqlstate, message = format('pick %s: %s', v_outcome_id, sqlerrm);
    end;
  end loop;

  if v_parlay_legs > 0 then
    begin
      v_parlay_id := public.place_parlay(p_parlay_outcome_ids, p_parlay_stake);
    exception
      when check_violation then
        raise;
      when others then
        raise exception using errcode = sqlstate, message = format('parlay: %s', sqlerrm);
    end;
  end if;

  return v_parlay_id;
end;
$$;

revoke execute on function public.place_slip(jsonb, uuid[], integer) from public, anon;
grant execute on function public.place_slip(jsonb, uuid[], integer) to authenticated, service_role;
