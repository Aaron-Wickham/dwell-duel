-- #61: a slip (or balance adjustment) that commits while its response is lost in transit leaves
-- the member looking at an error, and tapping again would place everything a second time. The
-- form now sends a key per attempt; a repeat of a key returns the first call's result instead of
-- acting again.
--
-- The key row is written in the same transaction as the work, before it: a concurrent repeat
-- blocks on the unique key until the first commits (then returns its result) or rolls back (then
-- goes ahead itself). A call that fails rolls its key back with it, so a retry after a real error
-- still tries again.

create table public.idempotency_keys (
  key uuid primary key,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create index idempotency_keys_created_at_idx on public.idempotency_keys (created_at);

-- Only the functions below (security definer) and the daily cron's prune touch it.
alter table public.idempotency_keys enable row level security;
revoke all on public.idempotency_keys from public, anon, authenticated;

-- Claims p_key for this caller and action. Returns null when the key is new (go ahead, then call
-- finish_idempotent), or the stored result when it was already used.
create function public.claim_idempotency_key(p_key uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row public.idempotency_keys;
begin
  insert into public.idempotency_keys (key, profile_id, action)
  values (p_key, auth.uid(), p_action)
  on conflict (key) do nothing;
  if found then
    return null;
  end if;

  select * into v_row from public.idempotency_keys where key = p_key;
  if v_row.profile_id is distinct from auth.uid() or v_row.action <> p_action then
    raise exception 'that request key was already used';
  end if;
  return coalesce(v_row.result, 'null'::jsonb);
end;
$$;

create function public.finish_idempotent(p_key uuid, p_result jsonb)
returns void
language sql
security definer
set search_path to ''
as $$
  update public.idempotency_keys set result = p_result where key = p_key;
$$;

revoke execute on function public.claim_idempotency_key(uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_idempotent(uuid, jsonb) from public, anon, authenticated;

-- place_slip gains the key. A new trailing argument means a new signature, so the old one goes.
drop function public.place_slip(jsonb, uuid[], integer);

create function public.place_slip(
  p_singles jsonb,
  p_parlay_outcome_ids uuid[],
  p_parlay_stake integer,
  p_idempotency_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_single jsonb;
  v_outcome_id uuid;
  v_market_id uuid;
  v_parlay_id uuid;
  v_parlay_legs integer := coalesce(array_length(p_parlay_outcome_ids, 1), 0);
  v_previous jsonb;
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_idempotency_key is not null then
    v_previous := public.claim_idempotency_key(p_idempotency_key, 'place_slip');
    if v_previous is not null then
      return (v_previous ->> 'parlay_id')::uuid;
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

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, jsonb_build_object('parlay_id', v_parlay_id));
  end if;

  return v_parlay_id;
end;
$function$;

revoke execute on function public.place_slip(jsonb, uuid[], integer, uuid) from public, anon;
grant execute on function public.place_slip(jsonb, uuid[], integer, uuid) to authenticated, service_role;

drop function public.adjust_balance(uuid, integer, text);

create function public.adjust_balance(p_profile_id uuid, p_amount integer, p_reason text, p_idempotency_key uuid default null)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can adjust a balance';
  end if;

  if p_idempotency_key is not null and public.claim_idempotency_key(p_idempotency_key, 'adjust_balance') is not null then
    return;
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

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, 'true'::jsonb);
  end if;
end;
$function$;

revoke execute on function public.adjust_balance(uuid, integer, text, uuid) from public, anon;
grant execute on function public.adjust_balance(uuid, integer, text, uuid) to authenticated, service_role;
