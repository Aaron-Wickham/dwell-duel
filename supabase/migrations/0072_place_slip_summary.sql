-- #226: a retried slip reported the *current* form as placed. On a replay (same attempt key after
-- a lost response) place_slip returned only the stored parlay id, so the action built its toast from
-- whatever the slip held now, and cleared picks that were never placed. place_slip_v2 returns what
-- was actually placed, and whether this call was a replay, and stores that summary under the key.
--
-- place_slip keeps its signature and return type and calls v2, so the build before this deploy
-- keeps working while it rolls out. Both use the same 'place_slip' key namespace, so a key the old
-- build claimed replays through v2 (its stored result just has no 'solos' or 'picks').
create or replace function public.place_slip_v2(
  p_singles jsonb,
  p_parlay_outcome_ids uuid[],
  p_parlay_stake integer,
  p_idempotency_key uuid default null
)
returns jsonb
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
  v_previous jsonb;
  v_summary jsonb;
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_idempotency_key is not null then
    v_previous := public.claim_idempotency_key(p_idempotency_key, 'place_slip');
    if v_previous is not null then
      return v_previous || jsonb_build_object('replayed', true);
    end if;
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

  v_summary := jsonb_build_object(
    'parlay_id', v_parlay_id,
    'solos', jsonb_array_length(coalesce(p_singles, '[]'::jsonb)),
    'picks', (
      select coalesce(jsonb_agg(id), '[]'::jsonb)
      from (
        select s ->> 'outcome_id' as id from jsonb_array_elements(coalesce(p_singles, '[]'::jsonb)) s
        union all
        select unnest(coalesce(p_parlay_outcome_ids, '{}'::uuid[]))::text
      ) placed
    )
  );

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, v_summary);
  end if;

  return v_summary || jsonb_build_object('replayed', false);
end;
$$;

revoke execute on function public.place_slip_v2(jsonb, uuid[], integer, uuid) from public, anon;
grant execute on function public.place_slip_v2(jsonb, uuid[], integer, uuid) to authenticated, service_role;

create or replace function public.place_slip(
  p_singles jsonb,
  p_parlay_outcome_ids uuid[],
  p_parlay_stake integer,
  p_idempotency_key uuid default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select (public.place_slip_v2(p_singles, p_parlay_outcome_ids, p_parlay_stake, p_idempotency_key) ->> 'parlay_id')::uuid
$$;
