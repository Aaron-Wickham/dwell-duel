-- LMSR pricing, part 3 of 5 (#334, docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md):
-- parlays on lmsr markets split their stake across their legs, and their multiplier and payout
-- are fixed when they're placed.
--
-- 1. place_lmsr_parlay: 2-6 legs, one per market, every one on an lmsr market. Each leg buys
--    stake/n DC of shares on its pick, held by the house parlay book (owned by no member, stored
--    on the leg) and added to market_outcomes.shares, so the parlay moves each market's price.
--    pool_total stays the DC of solo bets: a parlay's stake is counted as the parlay's. A leg's
--    factor is shares / (stake/n), to six places, rounded down; the multiplier is the product of
--    the factors, exactly; the payout is floor(stake x multiplier). It refuses price_moved:<payout>
--    when that is more than 2% under the payout the slip showed. No caps beyond the legs: the
--    1,000,000 DC stake and 1e9 DC payout bounds only keep the numbers inside an integer.
-- 2. place_slip_v4 is place_slip_v3 with the parlay's shown payout. A parlay with any lmsr leg
--    goes to place_lmsr_parlay, which refuses one that mixes in a pool market. v3 stays for the
--    #333 build and keeps refusing lmsr legs, since it has no payout to compare.
-- 3. 0102's trigger refusing lmsr legs is replaced by one that keeps a leg's figures matching its
--    market: an lmsr leg carries factor and shares, a pool leg neither. place_parlay, the pool
--    path, refuses an lmsr leg itself.
-- 4. settle_parlay: a fixed parlay (multiplier set) pays its payout when every leg wins. A voided
--    leg drops out and the rest pay floor(stake x their factors); with every leg voided the stake
--    comes back. It never locks pool odds on one.
-- 5. parlay_limits() caps every parlay at 6 legs. Its other columns stay for pool parlays, which
--    keep 0074's rules until #335 converts them.
-- 6. The book's shares stay in market_outcomes.shares, as bets' do, so each lmsr outcome's shares
--    equal its bets' shares plus its legs' shares. Nothing is paid to the book: a fixed parlay's
--    flows (its stake, and its payout or refund) are the market maker's on the economy panel.
-- 7. The best-parlay award and member stats read the stored multiplier; parlay_leg_odds returns a
--    fixed leg's factor; market_sparklines charts parlay legs too, and does its exp in double
--    precision; activity_feed, the tests' oracle, pays floor(shares) on lmsr markets.
-- 8. has_stake_in_market counts a parlay leg on the market whatever the parlay's status: a parlay
--    lost elsewhere still has a leg here that an override could revive, so its owner mustn't
--    resolve this market. void_market refuses a creator who has a stake in their own market; an
--    admin still can.
--
-- Additive: new functions, a replaced trigger, and replacements with the same signatures.
--
-- One explicit transaction, like 0034-0103.
begin;
set local lock_timeout = '5s';

-- ─── Limits ─────────────────────────────────────────────────────────────────

create or replace function public.parlay_limits()
returns table (max_legs integer, max_multiplier integer, max_payout integer, min_leg_pool integer, min_leg_bettors integer, max_leg_odds integer)
language sql
immutable
set search_path = ''
as $$
  select 6, 20, 1000, 50, 2, 5
$$;

-- ─── A leg matches its market ───────────────────────────────────────────────

drop trigger parlay_legs_refuse_lmsr on public.parlay_legs;
drop function public.refuse_lmsr_parlay_leg();

create function public.check_parlay_leg_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.markets m where m.id = new.market_id and m.pricing = 'lmsr') then
    if new.factor is null or new.shares is null then
      raise exception 'a parlay leg on a market with fixed payouts needs its factor and shares';
    end if;
  elsif new.factor is not null or new.shares is not null then
    raise exception 'only a parlay leg on a market with fixed payouts has a factor and shares';
  end if;
  return new;
end;
$$;

revoke execute on function public.check_parlay_leg_pricing() from public, anon, authenticated;

create trigger parlay_legs_check_pricing
  before insert on public.parlay_legs
  for each row
  execute function public.check_parlay_leg_pricing();

-- ─── Placing ────────────────────────────────────────────────────────────────

-- Only place_slip_v4 calls this, with the markets already locked. p_payout is the payout the slip
-- showed: the parlay is refused when what it would really pay is more than 2% lower.
create function public.place_lmsr_parlay(p_outcome_ids uuid[], p_stake integer, p_payout integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_legs integer := coalesce(array_length(p_outcome_ids, 1), 0);
  v_max_legs integer;
  v_found integer;
  v_markets integer;
  v_spend numeric;
  v_pick record;
  v_ids uuid[];
  v_q numeric[];
  v_share numeric;
  v_factor numeric;
  v_market_ids uuid[] := '{}';
  v_outcomes uuid[] := '{}';
  v_shares numeric[] := '{}';
  v_factors numeric[] := '{}';
  v_multiplier numeric := 1;
  v_payout numeric;
  v_parlay_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be positive';
  end if;

  if p_stake > 1000000 then
    raise exception 'a parlay can stake at most 1,000,000 DC';
  end if;

  select l.max_legs into v_max_legs from public.parlay_limits() l;
  if v_legs < 2 or v_legs > v_max_legs then
    raise exception 'a parlay needs 2 to % picks', v_max_legs;
  end if;

  if (select count(distinct o) from unnest(p_outcome_ids) o) <> v_legs then
    raise exception 'each pick must be from a different market';
  end if;

  select count(*), count(distinct market_id) into v_found, v_markets
  from public.market_outcomes
  where id = any(p_outcome_ids);

  if v_found <> v_legs then
    raise exception 'outcome not found';
  end if;

  if v_markets <> v_legs then
    raise exception 'each pick must be from a different market';
  end if;

  perform 1 from public.markets
  where id in (select market_id from public.market_outcomes where id = any(p_outcome_ids))
  order by id
  for update;

  -- A pool leg's odds are set at close and an lmsr leg's now: one parlay can't be priced both ways.
  if exists (
    select 1
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids) and m.pricing <> 'lmsr'
  ) then
    raise exception 'a parlay can''t mix markets with fixed payouts and older markets. Bet the older market''s pick solo';
  end if;

  v_spend := p_stake::numeric / v_legs;

  for v_pick in
    select o.id as outcome_id, m.id as market_id, m.title, m.status, m.close_at, m.liquidity
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids)
    order by m.id
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;

    select array_agg(x.id order by x.id), array_agg(x.shares + x.q_offset order by x.id)
      into v_ids, v_q
    from public.market_outcomes x
    where x.market_id = v_pick.market_id;

    -- Six places, rounded down, as a solo bet's. stake/n isn't always whole, so the rounding can
    -- leave a hair under the spend; a factor never goes below 1.
    v_share := trunc(public.lmsr_buy(v_q, v_pick.liquidity, array_position(v_ids, v_pick.outcome_id), v_spend), 6);
    v_factor := greatest(1, trunc(v_share * v_legs / p_stake, 6));
    v_multiplier := v_multiplier * v_factor;

    v_market_ids := v_market_ids || v_pick.market_id;
    v_outcomes := v_outcomes || v_pick.outcome_id;
    v_shares := v_shares || v_share;
    v_factors := v_factors || v_factor;
  end loop;

  v_payout := floor(p_stake * v_multiplier);
  if v_payout >= 1000000000 then
    raise exception 'that parlay would pay more than DwellDuel can hold';
  end if;

  if p_payout is null or v_payout < p_payout * 0.98 then
    raise exception 'price_moved:%', v_payout;
  end if;

  -- max_multiplier is the pool rules' cap; nothing caps a fixed parlay, so it just bounds this one.
  insert into public.parlays (profile_id, stake, max_multiplier, odds_at_close, multiplier, payout)
  values (auth.uid(), p_stake, ceil(v_multiplier)::integer, false, v_multiplier, v_payout::integer)
  returning id into v_parlay_id;

  perform public.apply_coin_transaction(
    auth.uid(), -p_stake, 'parlay_placed',
    jsonb_build_object('parlay_id', v_parlay_id)
  );

  insert into public.parlay_legs (parlay_id, market_id, outcome_id, factor, shares)
  select v_parlay_id, t.market_id, t.outcome_id, t.factor, t.shares
  from unnest(v_market_ids, v_outcomes, v_factors, v_shares) as t(market_id, outcome_id, factor, shares);

  update public.market_outcomes o
  set shares = o.shares + t.shares
  from unnest(v_outcomes, v_shares) as t(outcome_id, shares)
  where o.id = t.outcome_id;

  return v_parlay_id;
end;
$$;

revoke execute on function public.place_lmsr_parlay(uuid[], integer, integer) from public, anon, authenticated;
grant execute on function public.place_lmsr_parlay(uuid[], integer, integer) to service_role;

-- place_slip_v3 with the payout the slip showed for the parlay.
create function public.place_slip_v4(
  p_singles jsonb,
  p_parlay_outcome_ids uuid[],
  p_parlay_stake integer,
  p_parlay_payout integer default null,
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
  v_pricing text;
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

  -- Every market the slip touches, locked up front in id order, as place_slip_v2 does, so two
  -- slips can't deadlock taking them in different orders.
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
      select o.market_id, m.pricing into v_market_id, v_pricing
      from public.market_outcomes o
      join public.markets m on m.id = o.market_id
      where o.id = v_outcome_id;
      if v_market_id is null then
        raise exception 'outcome not found';
      end if;
      if v_pricing = 'lmsr' then
        perform public.place_lmsr_bet(
          v_market_id, v_outcome_id, (v_single ->> 'amount')::integer, (v_single ->> 'payout')::integer
        );
      else
        perform public.place_bet(v_market_id, v_outcome_id, (v_single ->> 'amount')::integer);
      end if;
    exception
      when check_violation then
        raise;
      when others then
        raise exception using errcode = sqlstate, message = format('pick %s: %s', v_outcome_id, sqlerrm);
    end;
  end loop;

  if v_parlay_legs > 0 then
    begin
      if exists (
        select 1
        from public.market_outcomes o
        join public.markets m on m.id = o.market_id
        where o.id = any (p_parlay_outcome_ids) and m.pricing = 'lmsr'
      ) then
        v_parlay_id := public.place_lmsr_parlay(p_parlay_outcome_ids, p_parlay_stake, p_parlay_payout);
      else
        v_parlay_id := public.place_parlay(p_parlay_outcome_ids, p_parlay_stake);
      end if;
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

revoke execute on function public.place_slip_v4(jsonb, uuid[], integer, integer, uuid) from public, anon;
grant execute on function public.place_slip_v4(jsonb, uuid[], integer, integer, uuid) to authenticated, service_role;

-- As before (0074), refusing an lmsr leg, which 0102's trigger did until now. Only the builds
-- before #333 reach this with one, through place_slip_v2.
create or replace function public.place_parlay(p_outcome_ids uuid[], p_stake integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_leg_count integer;
  v_limits record;
  v_found_count integer;
  v_market_count integer;
  v_parlay_id uuid;
  v_pick record;
  v_most integer;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  select * into v_limits from public.parlay_limits();

  if p_stake is null or p_stake <= 0 then
    raise exception 'stake must be positive';
  end if;

  if p_stake > v_limits.max_payout then
    raise exception 'a parlay pays at most % DC, so its stake can be at most % DC', v_limits.max_payout, v_limits.max_payout;
  end if;

  v_leg_count := coalesce(array_length(p_outcome_ids, 1), 0);
  if v_leg_count < 2 or v_leg_count > v_limits.max_legs then
    raise exception 'a parlay needs 2 to % picks', v_limits.max_legs;
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

  if exists (
    select 1
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids) and m.pricing = 'lmsr'
  ) then
    raise exception 'DwellDuel just updated. Refresh to bet.';
  end if;

  for v_pick in
    select m.title, m.status, m.close_at, q.own_market, q.meets_floor
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    cross join lateral public.pick_quote(auth.uid(), o.id) q
    where o.id = any(p_outcome_ids)
    order by m.id
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;
    if v_pick.own_market then
      raise exception '''%'' is your own market, so it can''t be a parlay pick', v_pick.title;
    end if;
    if not v_pick.meets_floor then
      raise exception '''%'' needs at least % DC from % other members before it can be a parlay pick',
        v_pick.title, v_limits.min_leg_pool, v_limits.min_leg_bettors;
    end if;
  end loop;

  -- The most this parlay could pay: every leg at the leg cap, under both caps. With the markets
  -- locked above, two parlays from the same member can't both slip under the exposure cap.
  v_most := least(
    floor(p_stake * least(power(v_limits.max_leg_odds::numeric, v_leg_count), v_limits.max_multiplier)),
    greatest(v_limits.max_payout, p_stake)
  )::integer;

  for v_pick in
    select m.title, coalesce(sum(public.parlay_max_payout(pa.id)), 0) as exposure
    from public.markets m
    left join public.parlays pa
      on pa.profile_id = auth.uid()
     and pa.status = 'pending'
     and exists (select 1 from public.parlay_legs l where l.parlay_id = pa.id and l.market_id = m.id)
    where m.id in (select market_id from public.market_outcomes where id = any(p_outcome_ids))
    group by m.id, m.title
    order by m.id
  loop
    if v_pick.exposure + v_most > v_limits.max_payout then
      raise exception 'your parlays with ''%'' in them could already pay % DC, and one member''s parlays on a market can pay at most % DC in all',
        v_pick.title, v_pick.exposure, v_limits.max_payout;
    end if;
  end loop;

  insert into public.parlays (profile_id, stake, max_multiplier)
  values (auth.uid(), p_stake, v_limits.max_multiplier)
  returning id into v_parlay_id;

  perform public.apply_coin_transaction(
    auth.uid(), -p_stake, 'parlay_placed',
    jsonb_build_object('parlay_id', v_parlay_id)
  );

  insert into public.parlay_legs (parlay_id, market_id, outcome_id, locked_odds)
  select v_parlay_id, o.market_id, o.id, null
  from public.market_outcomes o
  where o.id = any(p_outcome_ids);

  return v_parlay_id;
end;
$function$;

-- ─── Settling ───────────────────────────────────────────────────────────────

-- As 0074's, plus a fixed parlay (multiplier set at placement): its legs' factors are its odds,
-- nothing caps it, and with no leg voided it pays the payout it stored.
create or replace function public.settle_parlay(p_parlay_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_profile_id uuid;
  v_stake integer;
  v_status text;
  v_credited integer;
  v_max_multiplier integer;
  v_fixed_multiplier numeric;
  v_fixed_payout integer;
  v_max_payout integer;
  v_leg record;
  v_any_lost boolean := false;
  v_any_pending boolean := false;
  v_any_won boolean := false;
  v_any_voided boolean := false;
  v_multiplier numeric := 1;
  v_target_status text;
  v_target_credit integer;
  v_balance integer;
begin
  select profile_id, stake, status, credited, max_multiplier, multiplier, payout
    into v_profile_id, v_stake, v_status, v_credited, v_max_multiplier, v_fixed_multiplier, v_fixed_payout
  from public.parlays
  where id = p_parlay_id
  for update;

  -- Once a market has closed or resolved its pool can't move, so a leg priced here keeps its odds.
  if v_fixed_multiplier is null then
    update public.parlay_legs l
    set locked_odds = (select q.odds from public.pick_quote(v_profile_id, l.outcome_id) q)
    from public.markets m
    where l.parlay_id = p_parlay_id
      and m.id = l.market_id
      and l.locked_odds is null
      and (m.status = 'resolved' or (m.status = 'open' and now() >= m.close_at));
  end if;

  for v_leg in
    select l.outcome_id, coalesce(l.factor, l.locked_odds) as odds, m.status as market_status, r.outcome_id as winning_outcome_id
    from public.parlay_legs l
    join public.markets m on m.id = l.market_id
    left join public.market_resolutions r on r.id = m.current_resolution_id
    where l.parlay_id = p_parlay_id
  loop
    if v_leg.market_status = 'voided' then
      v_any_voided := true;
    elsif v_leg.market_status = 'resolved' then
      if v_leg.winning_outcome_id = v_leg.outcome_id then
        v_any_won := true;
        v_multiplier := v_multiplier * v_leg.odds;
      else
        v_any_lost := true;
      end if;
    else
      v_any_pending := true;
    end if;
  end loop;

  select max_payout into v_max_payout from public.parlay_limits();

  if v_any_lost then
    v_target_status := 'lost';
    v_target_credit := 0;
  elsif v_any_pending then
    v_target_status := 'pending';
    v_target_credit := 0;
  elsif not v_any_won then
    v_target_status := 'refunded';
    v_target_credit := v_stake;
  elsif v_fixed_multiplier is not null then
    v_target_status := 'won';
    -- The remaining factors multiply to no more than the stored multiplier, so this fits too.
    v_target_credit := case when v_any_voided then floor(v_stake * v_multiplier)::integer else v_fixed_payout end;
  else
    v_target_status := 'won';
    v_target_credit := least(floor(v_stake * least(v_multiplier, v_max_multiplier)), greatest(v_max_payout, v_stake))::integer;
  end if;

  -- A settled parlay's odds never move, so the same status means the same payout. A credit below
  -- it was cut to fit the balance when it was paid, and stays as it is.
  if v_target_status = v_status and (v_target_credit = v_credited or (v_status <> 'pending' and v_credited < v_target_credit)) then
    return;
  end if;

  if v_credited > 0 then
    perform public.apply_coin_transaction(
      v_profile_id, -v_credited, 'parlay_reversed',
      jsonb_build_object('parlay_id', p_parlay_id)
    );
  end if;

  if v_target_credit > 0 then
    select balance into v_balance from public.profiles where id = v_profile_id;
    v_target_credit := least(v_target_credit::bigint, 2147483647 - v_balance)::integer;
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
$function$;

-- ─── Reads ──────────────────────────────────────────────────────────────────

-- As 0074's, plus a fixed leg: its factor, known from the start.
create or replace function public.parlay_leg_odds(p_parlay_ids uuid[])
 RETURNS TABLE(parlay_id uuid, outcome_id uuid, odds numeric, known boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if auth.uid() is null or not (public.is_invited() or public.is_admin()) then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  select l.parlay_id, l.outcome_id,
         coalesce(l.locked_odds, l.factor, (select q.odds from public.pick_quote(pa.profile_id, l.outcome_id) q)),
         l.locked_odds is not null or l.factor is not null or m.status <> 'open' or now() >= m.close_at
  from public.parlay_legs l
  join public.parlays pa on pa.id = l.parlay_id
  join public.markets m on m.id = l.market_id
  where l.parlay_id in (select distinct x.id from unnest(p_parlay_ids[1:50]) as x(id));
end;
$function$;

-- As 0102's, plus parlay-book legs as points, so the chart ends at the price the market shows.
-- Weights are exp'd in double precision: numeric exp is far slower and the chart needs no more.
create or replace function public.market_sparklines(p_market_ids uuid[], p_points integer default 40)
returns table (market_id uuid, points jsonb)
language sql
stable
as $$
  with ids as (
    select distinct u.id
    from unnest(p_market_ids) with ordinality as u(id, ord)
    where u.ord <= 50
  ),
  seeds as (
    select m.id as market_id, m.seed_per_outcome as seed, m.pricing, m.liquidity,
      (select count(*) from public.market_outcomes mo where mo.market_id = m.id) as outcomes
    from public.markets m
    join ids on ids.id = m.id
  ),
  ordered as (
    select bet.market_id, bet.outcome_id, bet.amount, bet.shares, bet.created_at,
      row_number() over w as n,
      sum(bet.amount) over w as total
    from ids
    cross join lateral (
      (
        select b.market_id, b.outcome_id, b.amount, coalesce(b.shares, 0) as shares, b.created_at,
          0 as source, b.id as bet_id, null::uuid as leg_id
        from public.bets b
        where b.market_id = ids.id
        offset 0
      )
      union all
      (
        select l.market_id, l.outcome_id, 0, l.shares, pa.created_at, 1, null::bigint, l.id
        from public.parlay_legs l
        join public.parlays pa on pa.id = l.parlay_id
        where l.market_id = ids.id and l.shares is not null
        offset 0
      )
    ) bet
    window w as (partition by bet.market_id order by bet.created_at, bet.source, bet.bet_id, bet.leg_id)
  ),
  sized as (
    select o.market_id, count(*) as bets,
      least(count(*), greatest(1, least(coalesce(p_points, 40), 200))) as points
    from ordered o
    group by o.market_id
  ),
  picked as (
    select s.market_id,
      case when s.points = 1 then s.bets else 1 + (g.i - 1) * (s.bets - 1) / (s.points - 1) end as n
    from sized s
    cross join lateral generate_series(1, s.points) as g(i)
  ),
  pooled as (
    select e.market_id, e.n, e.outcome_id, e.mark,
      sum(e.amount) over x as pool,
      sum(e.shares) over x as held
    from (
      select o.market_id, o.n, o.outcome_id, o.amount, o.shares, false as mark
      from ordered o
      union all
      select p.market_id, p.n, mo.id, 0, 0, true
      from picked p
      join public.market_outcomes mo on mo.market_id = p.market_id
    ) e
    window x as (partition by e.market_id, e.outcome_id order by e.n, e.mark)
  ),
  scored as (
    select pl.market_id, pl.n, pl.outcome_id, pl.pool, ((pl.held + mo.q_offset) / s.liquidity)::double precision as z
    from pooled pl
    join public.market_outcomes mo on mo.id = pl.outcome_id
    join seeds s on s.market_id = pl.market_id
    where pl.mark
  ),
  weighted as (
    select sc.market_id, sc.n, sc.outcome_id, sc.pool,
      exp(sc.z - max(sc.z) over (partition by sc.market_id, sc.n)) as w
    from scored sc
  ),
  priced as (
    select wt.market_id, wt.n, wt.outcome_id,
      case
        when s.pricing = 'lmsr' then wt.w / sum(wt.w) over (partition by wt.market_id, wt.n)
        else (wt.pool + s.seed)::double precision / (o.total + s.seed * s.outcomes)::double precision
      end as share
    from weighted wt
    join seeds s on s.market_id = wt.market_id
    join ordered o on o.market_id = wt.market_id and o.n = wt.n
  ),
  chosen as (
    select o.market_id, o.n, o.created_at, jsonb_object_agg(p.outcome_id, p.share) as shares
    from priced p
    join ordered o on o.market_id = p.market_id and o.n = p.n
    group by o.market_id, o.n, o.created_at
  )
  select c.market_id, jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by c.n)
  from chosen c
  group by c.market_id
  order by c.market_id
$$;

-- ─── The economy ────────────────────────────────────────────────────────────

-- As 0102's, plus a fixed parlay's flows (its stake out, its payout or refund in) on the market
-- maker line: the house's parlay book took the other side of it, not a pool.
create or replace function public.economy_flows(p_from timestamptz, p_to timestamptz)
returns table (source text, added bigint, removed bigint)
language sql
stable
set search_path = ''
as $$
  with parlay_first_credit as (
    select t.meta ->> 'parlay_id' as parlay_id, min(t.created_at) as happened_at
    from public.coin_transactions t
    where t.type in ('parlay_won', 'parlay_refunded')
    group by 1
  ),
  parlay_first_loss as (
    select l.parlay_id, min(r.resolved_at) as happened_at
    from public.parlay_legs l
    join public.market_resolutions r on r.market_id = l.market_id and r.outcome_id <> l.outcome_id
    group by 1
  ),
  remainders as (
    select r.market_id, r.resolved_at, r.reversed_at, round(r.payout_remainder)::bigint as dc
    from public.market_resolutions r
    where round(r.payout_remainder) > 0
  ),
  flows (source, event_key, happened_at, amount, seeded) as (
    select
      case t.type
        when 'starting_grant' then 'starting_grants'
        when 'task_completed' then 'task_rewards'
        when 'admin_adjustment' then 'owner_adjustments'
        when 'bet_won' then 'seed_payouts'
        when 'bet_refunded' then 'seed_payouts'
        when 'resolution_reversed' then 'seed_payouts'
        else 'house_parlays'
      end,
      case
        when t.type in ('bet_won', 'bet_refunded', 'resolution_reversed') then 'market:' || (t.meta ->> 'market_id')
        when t.type like 'parlay_%' then 'parlay:' || (t.meta ->> 'parlay_id')
        else 'txn:' || t.id
      end,
      t.created_at,
      t.amount::bigint,
      case
        when t.type in ('bet_won', 'bet_refunded') then exists (
          select 1 from public.market_resolutions r where r.id = (t.meta ->> 'resolution_id')::uuid and r.payout_seed > 0)
        when t.type = 'resolution_reversed' then exists (
          select 1 from public.market_resolutions r where r.id = (t.meta ->> 'reversed_resolution_id')::uuid and r.payout_seed > 0)
        else false
      end
    from public.coin_transactions t
    where t.type in (
      'starting_grant', 'task_completed', 'admin_adjustment',
      'bet_won', 'bet_refunded', 'resolution_reversed',
      'parlay_won', 'parlay_refunded', 'parlay_reversed'
    )

    union all

    select 'seed_payouts', 'market:' || b.market_id, first_resolution.happened_at, -sum(b.amount)::bigint,
           first_resolution.payout_seed > 0
    from public.bets b
    join public.markets m on m.id = b.market_id and m.status = 'resolved'
    cross join lateral (
      select r.resolved_at as happened_at, r.payout_seed
      from public.market_resolutions r
      where r.market_id = b.market_id
      order by r.resolved_at, r.id
      limit 1
    ) first_resolution
    group by b.market_id, first_resolution.happened_at, first_resolution.payout_seed

    union all

    select 'house_parlays', 'parlay:' || pa.id, least(c.happened_at, x.happened_at), -pa.stake::bigint, false
    from public.parlays pa
    left join parlay_first_credit c on c.parlay_id = pa.id::text
    left join parlay_first_loss x on x.parlay_id = pa.id
    where pa.status <> 'pending'

    union all

    -- A resolution's rounded-away fractions move from the market maker to payout rounding, and
    -- back when an override reverses it.
    select 'market_maker', 'market:' || x.market_id, x.resolved_at, x.dc, false from remainders x
    union all
    select 'payout_rounding', 'market:' || x.market_id, x.resolved_at, -x.dc, false from remainders x
    union all
    select 'market_maker', 'market:' || x.market_id, x.reversed_at, -x.dc, false from remainders x where x.reversed_at is not null
    union all
    select 'payout_rounding', 'market:' || x.market_id, x.reversed_at, x.dc, false from remainders x where x.reversed_at is not null
  ),
  sourced as (
    select
      case
        when f.source = 'seed_payouts' and f.event_key in (
          select 'market:' || m.id from public.markets m where m.pricing = 'lmsr'
        ) then 'market_maker'
        when f.source = 'house_parlays' and f.event_key in (
          select 'parlay:' || pa.id from public.parlays pa where pa.multiplier is not null
        ) then 'market_maker'
        else f.source
      end as source,
      f.event_key, f.happened_at, f.amount, f.seeded
    from flows f
  ),
  events as (
    select
      case when f.source = 'seed_payouts' and not bool_or(f.seeded) then 'payout_rounding' else f.source end as source,
      sum(f.amount) as net
    from sourced f
    where f.happened_at >= p_from and f.happened_at < p_to
    group by f.source, f.event_key, f.happened_at
  )
  select e.source,
         coalesce(sum(greatest(e.net, 0)), 0)::bigint,
         coalesce(sum(greatest(-e.net, 0)), 0)::bigint
  from events e
  group by e.source
$$;

-- ─── Stats and awards: the best parlay is its stored multiplier ─────────────

-- As 0102's, apart from won_parlays: a fixed parlay counts its stored multiplier, or the product
-- of the factors left when a leg was voided, with no cap.
create or replace function public.member_stats(p_profile_id uuid)
 RETURNS TABLE(bets_won integer, bets_lost integer, bets_refunded integer, parlays_won integer, parlays_lost integer, parlays_refunded integer, net_profit bigint, biggest_win bigint, biggest_win_market_id uuid, biggest_win_market_title text, best_parlay_multiplier numeric, best_parlay_payout integer, markets_created integer, tasks_completed integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  with solo as (
    select
      count(*) filter (where m.status = 'resolved' and b.outcome_id = r.outcome_id)::integer as won,
      count(*) filter (where m.status = 'resolved' and b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr'))::integer as lost,
      count(*) filter (where m.status = 'voided' or (m.status = 'resolved' and w.pool_total = 0 and m.pricing = 'pool'))::integer as refunded
    from public.bets b
    join public.markets m on m.id = b.market_id
    left join public.market_resolutions r on r.id = m.current_resolution_id
    left join public.market_outcomes w on w.id = r.outcome_id
    where b.profile_id = p_profile_id
  ),
  parlay_record as (
    select
      count(*) filter (where pa.status = 'won')::integer as won,
      count(*) filter (where pa.status = 'lost')::integer as lost,
      count(*) filter (where pa.status = 'refunded')::integer as refunded
    from public.parlays pa
    where pa.profile_id = p_profile_id
  ),
  profit as (
    select coalesce(sum(t.amount), 0)::bigint as total
    from public.coin_transactions t
    where t.profile_id = p_profile_id
      and t.type = any(public.betting_ledger_types())
  ),
  biggest as (
    select (t.amount - b.amount)::bigint as gain, m.id as market_id, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    where t.profile_id = p_profile_id
      and t.type = 'bet_won'
      and t.amount > b.amount
    order by 1 desc, t.id
    limit 1
  ),
  won_parlays as (
    select pa.id, pa.credited,
      case
        when pa.multiplier is null then least(trunc(round(exp(sum(ln(l.locked_odds))), 10), 4), pa.max_multiplier)
        when count(*) = (select count(*) from public.parlay_legs a where a.parlay_id = pa.id) then trunc(pa.multiplier, 4)
        else trunc(round(exp(sum(ln(l.factor))), 10), 4)
      end as multiplier
    from public.parlays pa
    join public.parlay_legs l on l.parlay_id = pa.id
    join public.markets m on m.id = l.market_id
    where pa.profile_id = p_profile_id
      and pa.status = 'won'
      and m.status = 'resolved'
    group by pa.id, pa.credited, pa.max_multiplier, pa.multiplier
  ),
  best_parlay as (
    select wp.multiplier::numeric as multiplier, wp.credited
    from won_parlays wp
    order by 1 desc, wp.credited desc, wp.id
    limit 1
  ),
  created as (
    select count(*)::integer as n
    from public.markets m
    where m.created_by = p_profile_id
  ),
  tasks as (
    select count(*)::integer as n
    from public.task_completions tc
    where tc.profile_id = p_profile_id
      and tc.status = 'approved'
  )
  select
    solo.won, solo.lost, solo.refunded,
    pr.won, pr.lost, pr.refunded,
    profit.total,
    bw.gain, bw.market_id, bw.title,
    bp.multiplier, bp.credited,
    created.n, tasks.n
  from solo
  cross join parlay_record pr
  cross join profit
  cross join created
  cross join tasks
  left join biggest bw on true
  left join best_parlay bp on true;
end;
$function$;

-- As 0102's, apart from best_parlay, which reads a fixed parlay as member_stats does.
create or replace function public.leaderboard_awards()
 RETURNS TABLE(kind text, profile_id uuid, display_name text, avatar_path text, value numeric, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
  v_to timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::timestamp at time zone 'America/New_York';
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  -- Members still in DwellDuel: a removed member (remove_member deletes their invite) wins no award.
  with members as (
    select i.id from public.invited_member_ids() i
  )
  (
    select 'biggest_win'::text, p.id, p.display_name, p.avatar_path, (t.amount - b.amount)::numeric, m.title
    from public.coin_transactions t
    join public.bets b on b.id = (t.meta ->> 'bet_id')::bigint
    join public.markets m on m.id = b.market_id and m.current_resolution_id = (t.meta ->> 'resolution_id')::uuid
    join public.profiles p on p.id = t.profile_id
    join members cm on cm.id = p.id
    where t.type = 'bet_won' and t.created_at >= v_from and t.created_at < v_to and t.amount > b.amount
    order by (t.amount - b.amount) desc, t.id
    limit 1
  )
  union all
  (
    select 'best_parlay'::text, p.id, p.display_name, p.avatar_path, x.multiplier::numeric, x.id::text
    from (
      select pa.id, pa.profile_id, pa.credited,
        case
          when pa.multiplier is null then least(trunc(round(exp(sum(ln(l.locked_odds))), 10), 4), pa.max_multiplier)
          when count(*) = (select count(*) from public.parlay_legs a where a.parlay_id = pa.id) then trunc(pa.multiplier, 4)
          else trunc(round(exp(sum(ln(l.factor))), 10), 4)
        end as multiplier
      from public.parlays pa
      join public.parlay_legs l on l.parlay_id = pa.id
      join public.markets m on m.id = l.market_id and m.status = 'resolved'
      where pa.status = 'won'
        and pa.id in (
          select (t.meta ->> 'parlay_id')::uuid
          from public.coin_transactions t
          where t.type = 'parlay_won' and t.created_at >= v_from and t.created_at < v_to
        )
      group by pa.id, pa.profile_id, pa.credited, pa.max_multiplier, pa.multiplier
    ) x
    join public.profiles p on p.id = x.profile_id
    join members cm on cm.id = p.id
    order by 5 desc, x.credited desc, x.id
    limit 1
  )
  union all
  (
    select 'sharpshooter'::text, p.id, p.display_name, p.avatar_path,
           round(x.won::numeric / (x.won + x.lost), 4), x.won || ' of ' || (x.won + x.lost)
    from (
      select b.profile_id,
             count(*) filter (where b.outcome_id = r.outcome_id) as won,
             count(*) filter (where b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr')) as lost
      from public.bets b
      join public.markets m on m.id = b.market_id and m.status = 'resolved'
      join public.market_resolutions r on r.id = m.current_resolution_id and r.resolved_at >= v_from and r.resolved_at < v_to
      join public.market_outcomes w on w.id = r.outcome_id
      group by b.profile_id
    ) x
    join public.profiles p on p.id = x.profile_id
    join members cm on cm.id = p.id
    where x.won + x.lost >= 5
    order by round(x.won::numeric / (x.won + x.lost), 4) desc, x.won + x.lost desc, p.display_name, p.id
    limit 1
  )
  union all
  (
    select 'most_active'::text, p.id, p.display_name, p.avatar_path, y.n::numeric, y.n || ' bets and parlays'
    from (
      select z.profile_id, count(*) as n
      from (
        select b.profile_id from public.bets b where b.created_at >= v_from and b.created_at < v_to
        union all
        select pa.profile_id from public.parlays pa where pa.created_at >= v_from and pa.created_at < v_to
      ) z
      group by z.profile_id
    ) y
    join public.profiles p on p.id = y.profile_id
    join members cm on cm.id = p.id
    order by y.n desc, p.display_name, p.id
    limit 1
  );
end;
$function$;

-- ─── activity_feed: the tests' oracle pays what resolve_market_core pays ─────
-- 0074's view; only the bet_won amount changes: floor(shares) on an lmsr market (0102).
create or replace view public.activity_feed
with (security_invoker = true)
as
select
  'bet:' || b.id as id,
  'bet_placed' as kind,
  b.created_at as occurred_at,
  b.profile_id as actor_id,
  p.display_name as actor_name,
  m.id as market_id,
  m.title as market_title,
  o.label as outcome_label,
  b.amount as amount,
  null::integer as leg_count,
  null::text as task_title
from public.bets b
join public.market_outcomes o on o.id = b.outcome_id
join public.markets m on m.id = b.market_id
join public.profiles p on p.id = b.profile_id

union all

select
  'parlay:' || pa.id, 'parlay_placed', pa.created_at, pa.profile_id, p.display_name,
  null, null, null, pa.stake,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id

union all

select
  'market:' || m.id, 'market_created', m.created_at, m.created_by, p.display_name,
  m.id, m.title, null, null, null, null
from public.markets m
join public.profiles p on p.id = m.created_by

union all

select
  'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, p.display_name,
  m.id, m.title, o.label, null, null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.profiles p on p.id = r.resolved_by

union all

select
  'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, b.profile_id, p.display_name,
  m.id, m.title, o.label,
  case
    when m.pricing = 'lmsr' then floor(b.shares)::integer
    else public.pool_payout(b.amount, o.pool_total, pools.total, r.payout_seed, pools.n::integer)
  end,
  null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.bets b on b.outcome_id = o.id
join public.profiles p on p.id = b.profile_id
cross join lateral (
  select sum(o2.pool_total) as total, count(*) as n from public.market_outcomes o2 where o2.market_id = m.id
) pools

union all

select
  'parlay_win:' || pa.id, 'parlay_won', pa.settled_at, pa.profile_id, p.display_name,
  null, null, null, pa.credited,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id
where pa.status = 'won'

union all

select
  'task:' || c.id, 'task_completed', c.reviewed_at, c.profile_id, p.display_name,
  null, null, null, c.reward_amount, null, t.title
from public.task_completions c
join public.tasks t on t.id = c.task_id
join public.profiles p on p.id = c.profile_id
where c.status = 'approved';

-- ─── Who may resolve or void with a stake ───────────────────────────────────

-- As 0091's, but any parlay leg on the market counts, not only a pending parlay's: an override of
-- another leg's market can bring a settled parlay back, so its owner keeps a stake here. Solo bets
-- count as before (only live ones are in bets).
create or replace function public.has_stake_in_market(p_market_id uuid, p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (auth.uid() is null or public.is_invited())
     and (
       exists (select 1 from public.bets where market_id = p_market_id and profile_id = p_profile_id)
       or exists (
         select 1 from public.parlay_legs l join public.parlays p on p.id = l.parlay_id
         where l.market_id = p_market_id and p.profile_id = p_profile_id
       )
     )
$$;

-- As 0073's, plus: a creator with a stake in their own market (a bet, or a parlay leg) asks an
-- admin to void it, as they would to resolve it.
create or replace function public.void_market(p_market_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_reason text := nullif(btrim(coalesce(p_reason, ''), E' \t\r\n'), '');
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet record;
  v_parlay_id uuid;
begin
  select created_by, status, close_at into v_created_by, v_status, v_close_at
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not public.is_admin() then
    if not (auth.uid() = v_created_by and public.is_invited()) then
      raise exception 'only the market creator or an admin can void this market';
    end if;
    if now() >= v_close_at then
      raise exception 'this market has closed, so only an admin can void it';
    end if;
    if public.has_stake_in_market(p_market_id, auth.uid()) then
      raise exception 'you have a stake in this market, so ask an admin to void it';
    end if;
  end if;

  if v_reason is null then
    raise exception 'say why this market is voided';
  end if;

  -- Every profile this call could touch, locked once up front in id order,
  -- before any write: this market's bettors and the owners of parlays with a
  -- leg here. A voided market only ever had status 'open' (checked above),
  -- so it never has a current resolution to reverse -- see the note above
  -- resolve_market and void_market (0033) for why this, not the per-loop
  -- ordering below, is what rules out a cross-phase deadlock. NO KEY UPDATE,
  -- not UPDATE: FOR UPDATE here would block other transactions' foreign-key
  -- checks (FOR KEY SHARE) on these profiles.
  perform 1 from public.profiles where id in (
    select profile_id from public.bets where market_id = p_market_id
    union select pa.profile_id from public.parlays pa join public.parlay_legs l on l.parlay_id = pa.id where l.market_id = p_market_id
  ) order by id for no key update;

  update public.markets set status = 'voided', settled_at = now(), void_reason = v_reason where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
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

  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id)
  values ('void:' || p_market_id, 'market_voided', now(), auth.uid(), p_market_id);
end;
$function$;

commit;
