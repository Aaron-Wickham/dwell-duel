-- #287, #272: how parlays and payouts are priced.
--
-- Parlays stay paid by the house and out of the pools (the #51 decision). What changes:
--
-- 1. A leg's odds are set when its market closes or settles, whichever comes first, from the final
--    pool without the parlay owner's own money and without the seed: other members' DC on the
--    market / other members' DC on the pick. Nobody can bet, cancel or have a bet removed once a
--    market has closed or settled, so that pool is final; settle_parlay writes the odds into
--    parlay_legs.locked_odds the first time it sees the leg's market closed or resolved, and they
--    never change after that. A leg counts at most 5×. A leg whose final pool has less than the
--    real-money floor (below), or no other member's DC on the pick, counts 1.00×: it still has to
--    win, but it doesn't multiply.
-- 2. A leg needs the floor when it's placed: at least 50 DC of other members' stakes on its market,
--    from at least 2 other members. A leg on a market you created is refused.
-- 3. Caps: a parlay multiplies to at most 20× and pays at most 1,000 DC (or its stake back, if a
--    stake placed before the cap was larger), and its stake can be at most 1,000 DC. One member's
--    pending parlays with a leg on any one market can pay at most 1,000 DC between them, counting
--    each at the most it could pay. Parlays still pending keep their locked odds and take the 20×
--    cap; settled ones keep the cap they were paid under (parlays.max_multiplier).
-- 4. Winners split exactly the real pool: stake × all DC on the market / DC on the winning outcome,
--    rounded down (pool_payout). The seed only shapes the odds, chances and charts a thin market
--    shows. Each resolution records the seed its payouts counted (market_resolutions.payout_seed:
--    the market's seed before 0074, so history and the feed still read what was paid; 0 since).
-- 5. apply_coin_transaction keeps a balance within the integer column: a credit that would take it
--    past 2,147,483,647 DC is cut to fit, and the ledger row records what was actually credited.
--    A refund (cancel_bet, remove_bet) is cut the same way, and cancelled_bets records what was
--    refunded.
-- 6. remove_bet refuses once the market has closed, like cancel_bet (#272).
-- 7. This month's awards leave out removed members, as the boards do (#265's rule).
--
-- Additive: every function keeps its signature, so the build before this one keeps calling them
-- while it deploys. parlay_limits() gains columns (nothing in the app calls it). locked_odds becomes
-- nullable, since a new leg has no odds until its market closes; the previous build would show such
-- a leg's odds as 0.00× until it's replaced.
--
-- One explicit transaction, like 0034-0073.
begin;
set local lock_timeout = '5s';

-- ─── Schema ──────────────────────────────────────────────────────────────────

alter table public.parlay_legs alter column locked_odds drop not null;

comment on column public.parlay_legs.locked_odds is
  'The leg''s odds. For a parlay placed before 0074, locked at placement (seed included). Since 0074, null until the leg''s market closes or settles, then set once from the final pool without the owner''s money or the seed (1 when the pool is under the floor or nobody else backed the pick).';

-- Every existing parlay was placed under the 100× cap; the default fills them, and dropping it means
-- place_parlay (the only writer) always names the cap in force.
alter table public.parlays add column max_multiplier integer not null default 100 check (max_multiplier >= 1);
alter table public.parlays alter column max_multiplier drop default;
update public.parlays set max_multiplier = 20 where status = 'pending';

-- How a parlay's legs got their odds: locked when it was placed (every parlay before 0074, the
-- default that fills them) or set at close. New rows are set at close.
alter table public.parlays add column odds_at_close boolean not null default false;
alter table public.parlays alter column odds_at_close set default true;

comment on column public.parlays.max_multiplier is
  'The multiplier cap the parlay settles under: parlay_limits().max_multiplier, or 100 for a parlay settled before 0074.';

alter table public.market_resolutions add column payout_seed integer not null default 0 check (payout_seed >= 0);
update public.market_resolutions r set payout_seed = m.seed_per_outcome from public.markets m where m.id = r.market_id;

comment on column public.market_resolutions.payout_seed is
  'The seed per outcome this resolution''s payouts counted: the market''s seed before 0074, 0 since (winners split the real pool).';

-- What resolve_market_core pays a winner: their share of the pool, rounded down, counting p_seed
-- per outcome only to reproduce a resolution from before 0074. lib/markets/odds.ts poolPayout
-- mirrors it, and tests/db/seeded-odds.test.ts keeps the two equal.
create function public.pool_payout(p_stake integer, p_winning_pool bigint, p_total_pool bigint, p_seed integer default 0, p_outcomes integer default 0)
returns integer
language sql
immutable
set search_path = ''
as $$
  select floor(p_stake::numeric * (p_total_pool + p_seed * p_outcomes) / (p_winning_pool + p_seed))::integer
$$;

revoke execute on function public.pool_payout(integer, bigint, bigint, integer, integer) from public, anon;
grant execute on function public.pool_payout(integer, bigint, bigint, integer, integer) to authenticated, service_role;

-- ─── Limits ──────────────────────────────────────────────────────────────────
-- lib/parlays/odds.ts mirrors every column; tests/db/seeded-odds.test.ts keeps them equal. A new
-- return type needs a drop; its callers are plpgsql and sql functions, which look it up by name.
drop function public.parlay_limits();

create function public.parlay_limits()
returns table (
  max_legs integer,
  max_multiplier integer,
  max_payout integer,
  min_leg_pool integer,
  min_leg_bettors integer,
  max_leg_odds integer
)
language sql
immutable
set search_path = ''
as $$
  select 10, 20, 1000, 50, 2, 5
$$;

revoke execute on function public.parlay_limits() from public, anon;
grant execute on function public.parlay_limits() to authenticated, service_role;

-- ─── Pricing one pick ────────────────────────────────────────────────────────
-- How a pick stands for one member, from the market's live bets with that member's own left out:
--   others_total    other members' DC on the market
--   others_on_pick  other members' DC on this outcome
--   other_bettors   how many other members have DC on the market
--   meets_floor     the parlay leg floor (parlay_limits)
--   odds            the parlay leg's odds: others_total / others_on_pick to four places, at most
--                   max_leg_odds, or 1 when the floor isn't met or nobody else backed the pick
-- settle_parlay prices a leg with it once the pool is final, and pick_quotes shows the same
-- figure while it can still move. Internal: members read it through pick_quotes.
create function public.pick_quote(p_profile_id uuid, p_outcome_id uuid)
returns table (
  market_id uuid,
  own_market boolean,
  others_total bigint,
  others_on_pick bigint,
  other_bettors integer,
  meets_floor boolean,
  odds numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with pick as (
    select o.market_id, m.created_by = p_profile_id as own_market
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = p_outcome_id
  ),
  others as (
    select b.profile_id, b.outcome_id, b.amount
    from public.bets b
    join pick on pick.market_id = b.market_id
    where b.profile_id <> p_profile_id
  ),
  sums as (
    select
      coalesce(sum(amount), 0)::bigint as total,
      coalesce(sum(amount) filter (where outcome_id = p_outcome_id), 0)::bigint as on_pick,
      count(distinct profile_id)::integer as bettors
    from others
  )
  select pick.market_id, pick.own_market, s.total, s.on_pick, s.bettors,
         s.total >= l.min_leg_pool and s.bettors >= l.min_leg_bettors,
         case
           when s.total >= l.min_leg_pool and s.bettors >= l.min_leg_bettors and s.on_pick > 0
             then least(trunc(s.total::numeric / s.on_pick, 4), l.max_leg_odds)
           else 1
         end
  from pick
  cross join sums s
  cross join public.parlay_limits() l
$$;

revoke execute on function public.pick_quote(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pick_quote(uuid, uuid) to service_role;

-- The slip's picks, priced for the caller: what a parlay leg on each would get if its market
-- closed now. Bets are visible to every invited
-- member, so these sums show nothing a member couldn't add up. At most 50 outcomes a call.
create function public.pick_quotes(p_outcome_ids uuid[])
returns table (
  outcome_id uuid,
  market_id uuid,
  own_market boolean,
  others_total bigint,
  others_on_pick bigint,
  other_bettors integer,
  meets_floor boolean,
  odds numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  select u.id, q.*
  from (select distinct x.id from unnest(p_outcome_ids[1:50]) as x(id)) u
  cross join lateral public.pick_quote(auth.uid(), u.id) q;
end;
$$;

revoke execute on function public.pick_quotes(uuid[]) from public, anon;
grant execute on function public.pick_quotes(uuid[]) to authenticated, service_role;

-- Each leg's odds for a parlay page or card: the set odds once the leg has them, otherwise what
-- its market's pool would give the parlay's owner now (known is true once the market has closed,
-- when that pool can no longer move). At most 50 parlays a call.
create function public.parlay_leg_odds(p_parlay_ids uuid[])
returns table (parlay_id uuid, outcome_id uuid, odds numeric, known boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (public.is_invited() or public.is_admin()) then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  select l.parlay_id, l.outcome_id,
         coalesce(l.locked_odds, (select q.odds from public.pick_quote(pa.profile_id, l.outcome_id) q)),
         l.locked_odds is not null or m.status <> 'open' or now() >= m.close_at
  from public.parlay_legs l
  join public.parlays pa on pa.id = l.parlay_id
  join public.markets m on m.id = l.market_id
  where l.parlay_id in (select distinct x.id from unnest(p_parlay_ids[1:50]) as x(id));
end;
$$;

revoke execute on function public.parlay_leg_odds(uuid[]) from public, anon;
grant execute on function public.parlay_leg_odds(uuid[]) to authenticated, service_role;

-- ─── Exposure ────────────────────────────────────────────────────────────────
-- The most a pending parlay could pay: its set odds, each unset leg at max_leg_odds, under its
-- multiplier and payout caps. A voided leg has dropped out. place_parlay holds one member's pending
-- parlays with a leg on any one market to max_payout between them. Internal.
create function public.parlay_max_payout(p_parlay_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select least(
           floor(pa.stake * least(coalesce(round(exp(sum(ln(coalesce(l.locked_odds, lim.max_leg_odds)))), 10), 1), pa.max_multiplier)),
           greatest(lim.max_payout, pa.stake)
         )::integer
  from public.parlays pa
  cross join public.parlay_limits() lim
  left join public.parlay_legs l
    on l.parlay_id = pa.id
   and exists (select 1 from public.markets m where m.id = l.market_id and m.status <> 'voided')
  where pa.id = p_parlay_id
  group by pa.id, pa.stake, pa.max_multiplier, lim.max_leg_odds, lim.max_payout
$$;

revoke execute on function public.parlay_max_payout(uuid) from public, anon, authenticated;
grant execute on function public.parlay_max_payout(uuid) to service_role;

-- ─── place_parlay ────────────────────────────────────────────────────────────
-- 0046's definition. The legs no longer lock odds; each must meet the floor and not be on one of
-- the bettor's own markets, the stake is capped, and so is what the member's parlays on each of
-- these markets could pay. Replaces the "no bets yet" check, which the seed made unreachable.
create or replace function public.place_parlay(p_outcome_ids uuid[], p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

-- ─── settle_parlay ───────────────────────────────────────────────────────────
-- 0041's definition, plus: legs are priced once their market has closed or resolved; the cap is
-- the parlay's own; a win pays at most parlay_limits().max_payout (or the stake, if larger); and
-- the credit is cut to what the balance can hold, so `credited` matches the ledger row.
create or replace function public.settle_parlay(p_parlay_id uuid)
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
  v_max_multiplier integer;
  v_max_payout integer;
  v_leg record;
  v_any_lost boolean := false;
  v_any_pending boolean := false;
  v_any_won boolean := false;
  v_multiplier numeric := 1;
  v_target_status text;
  v_target_credit integer;
  v_balance integer;
begin
  select profile_id, stake, status, credited, max_multiplier
    into v_profile_id, v_stake, v_status, v_credited, v_max_multiplier
  from public.parlays
  where id = p_parlay_id
  for update;

  -- Once a market has closed or resolved its pool can't move, so a leg priced here keeps its odds.
  update public.parlay_legs l
  set locked_odds = (select q.odds from public.pick_quote(v_profile_id, l.outcome_id) q)
  from public.markets m
  where l.parlay_id = p_parlay_id
    and m.id = l.market_id
    and l.locked_odds is null
    and (m.status = 'resolved' or (m.status = 'open' and now() >= m.close_at));

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
$$;

-- ─── apply_coin_transaction ──────────────────────────────────────────────────
-- 0002's definition. A credit is cut so the balance stays within the integer column; one cut to
-- nothing writes no row (the ledger's amount can't be 0). Debits are unchanged: the balance CHECK
-- already refuses one that would go below 0. Keeps 0002's grants (owner and service only).
create or replace function public.apply_coin_transaction(
  p_profile_id uuid,
  p_amount integer,
  p_type text,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_amount integer := p_amount;
begin
  if p_amount > 0 then
    select least(p_amount::bigint, 2147483647 - balance)::integer into v_amount
    from public.profiles
    where id = p_profile_id
    for no key update;
    if not found then
      v_amount := p_amount;
    elsif v_amount = 0 then
      return;
    end if;
  end if;

  insert into public.coin_transactions (profile_id, amount, type, meta)
  values (p_profile_id, v_amount, p_type, p_meta);

  update public.profiles
  set balance = balance + v_amount
  where id = p_profile_id;
end;
$$;

-- ─── Refunds near the ceiling ────────────────────────────────────────────────
-- How much of a refund the balance can take, so cancelled_bets records what was really refunded.
-- One that can't take any is refused rather than recorded as a refund of nothing. Internal.
create function public.refund_room(p_profile_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room integer;
begin
  select least(p_amount::bigint, 2147483647 - balance)::integer into v_room
  from public.profiles
  where id = p_profile_id
  for no key update;
  if v_room <= 0 then
    raise exception 'this balance is at its limit, so the bet can''t be refunded';
  end if;
  return v_room;
end;
$$;

revoke execute on function public.refund_room(uuid, integer) from public, anon, authenticated;
grant execute on function public.refund_room(uuid, integer) to service_role;

-- ─── cancel_bet ──────────────────────────────────────────────────────────────
-- 0046's definition; the cancelled bet records the refund the balance could take.
create or replace function public.cancel_bet(p_bet_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
  v_refund integer;
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

  v_refund := public.refund_room(v_bet.profile_id, v_bet.amount);
  perform public.apply_coin_transaction(
    v_bet.profile_id, v_refund, 'bet_cancelled',
    jsonb_build_object('market_id', v_bet.market_id, 'outcome_id', v_bet.outcome_id, 'bet_id', v_bet.id)
  );

  insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
  values (v_bet.id, v_bet.market_id, v_bet.outcome_id, v_bet.profile_id, v_refund, v_bet.created_at);

  delete from public.bets where id = v_bet.id;

  update public.market_outcomes
  set pool_total = pool_total - v_bet.amount
  where id = v_bet.outcome_id;
end;
$$;

-- ─── remove_bet ──────────────────────────────────────────────────────────────
-- 0040's definition; like cancel_bet, it stops at close_at, not only at resolution.
create or replace function public.remove_bet(p_bet_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
  v_refund integer;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can remove a bet';
  end if;

  select market_id into v_market_id from public.bets where id = p_bet_id;
  if not found then
    raise exception 'bet not found';
  end if;

  select status, close_at into v_status, v_close_at from public.markets where id = v_market_id for update;
  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'this market has closed, so the bet can''t be removed';
  end if;

  select * into v_bet from public.bets where id = p_bet_id for update;
  if not found then
    raise exception 'bet not found';
  end if;

  v_refund := public.refund_room(v_bet.profile_id, v_bet.amount);
  perform public.apply_coin_transaction(
    v_bet.profile_id, v_refund, 'bet_cancelled',
    jsonb_build_object('market_id', v_bet.market_id, 'outcome_id', v_bet.outcome_id, 'bet_id', v_bet.id, 'removed_by', auth.uid())
  );

  insert into public.cancelled_bets (id, market_id, outcome_id, profile_id, amount, placed_at)
  values (v_bet.id, v_bet.market_id, v_bet.outcome_id, v_bet.profile_id, v_refund, v_bet.created_at);

  delete from public.bets where id = v_bet.id;

  update public.market_outcomes set pool_total = pool_total - v_bet.amount where id = v_bet.outcome_id;
end;
$$;

-- ─── resolve_market_core ─────────────────────────────────────────────────────
-- 0073's definition. Winners split the real pool (pool_payout, no seed); the resolution's
-- payout_seed defaults to 0.
create or replace function public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
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
    if exists (
      select 1 from public.market_resolutions
      where id = v_current_resolution_id and outcome_id = p_outcome_id
    ) then
      raise exception 'that outcome is already the result';
    end if;
  elsif not v_is_admin then
    if not ((auth.uid() = v_created_by and public.is_invited()) or public.has_role('reviewer')) then
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
  set status = 'resolved', current_resolution_id = v_new_resolution_id, settled_at = coalesce(settled_at, now())
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
        public.pool_payout(v_bet.amount, v_winning_pool, v_total_pool),
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'seed_per_outcome', 0)
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
$$;

-- ─── Best parlay figures ─────────────────────────────────────────────────────
-- 0055's member_stats and 0060's leaderboard_awards, with each parlay capped at its own
-- max_multiplier rather than today's parlay_limits(), so a parlay settled under the 100× cap keeps
-- the figure it was paid on. leaderboard_awards also leaves out removed members.
create or replace function public.member_stats(p_profile_id uuid)
returns table (
  bets_won integer,
  bets_lost integer,
  bets_refunded integer,
  parlays_won integer,
  parlays_lost integer,
  parlays_refunded integer,
  net_profit bigint,
  biggest_win bigint,
  biggest_win_market_id uuid,
  biggest_win_market_title text,
  best_parlay_multiplier numeric,
  best_parlay_payout integer,
  markets_created integer,
  tasks_completed integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  with solo as (
    select
      count(*) filter (where m.status = 'resolved' and b.outcome_id = r.outcome_id)::integer as won,
      count(*) filter (where m.status = 'resolved' and b.outcome_id <> r.outcome_id and w.pool_total > 0)::integer as lost,
      count(*) filter (where m.status = 'voided' or (m.status = 'resolved' and w.pool_total = 0))::integer as refunded
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
    select pa.id, pa.credited, pa.max_multiplier, trunc(round(exp(sum(ln(l.locked_odds))), 10), 4) as product
    from public.parlays pa
    join public.parlay_legs l on l.parlay_id = pa.id
    join public.markets m on m.id = l.market_id
    where pa.profile_id = p_profile_id
      and pa.status = 'won'
      and m.status = 'resolved'
    group by pa.id, pa.credited, pa.max_multiplier
  ),
  best_parlay as (
    select least(wp.product, wp.max_multiplier)::numeric as multiplier, wp.credited
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
$$;

create or replace function public.leaderboard_awards()
returns table (kind text, profile_id uuid, display_name text, avatar_path text, value numeric, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')))::timestamp at time zone 'America/New_York';
  v_to timestamptz := (date_trunc('month', (now() at time zone 'America/New_York')) + interval '1 month')::timestamp at time zone 'America/New_York';
begin
  if not public.is_invited() then
    raise exception 'not invited' using errcode = '42501';
  end if;

  return query
  -- Members still in DwellDuel: a removed member (remove_member deletes their invite) wins no award.
  -- The same rule as invited_member_ids() (#265): an invite by email, or one they claimed.
  with members as (
    select p.id
    from public.profiles p
    where exists (select 1 from public.allowed_emails a where a.email = lower(p.email))
       or exists (select 1 from public.allowed_emails a where a.claimed_by = p.id)
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
    select 'best_parlay'::text, p.id, p.display_name, p.avatar_path, least(x.product, x.max_multiplier)::numeric, x.id::text
    from (
      select pa.id, pa.profile_id, pa.credited, pa.max_multiplier, trunc(round(exp(sum(ln(l.locked_odds))), 10), 4) as product
      from public.parlays pa
      join public.parlay_legs l on l.parlay_id = pa.id
      join public.markets m on m.id = l.market_id and m.status = 'resolved'
      where pa.status = 'won'
        and pa.id in (
          select (t.meta ->> 'parlay_id')::uuid
          from public.coin_transactions t
          where t.type = 'parlay_won' and t.created_at >= v_from and t.created_at < v_to
        )
      group by pa.id, pa.profile_id, pa.credited, pa.max_multiplier
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
             count(*) filter (where b.outcome_id <> r.outcome_id and w.pool_total > 0) as lost
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
$$;


-- ─── activity_feed: the tests' oracle pays what resolve_market_core pays ─────
-- 0041's view; only the bet_won amount changes, to pool_payout with the seed the resolution's
-- payouts counted (the market's seed before 0074, 0 since).
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
  public.pool_payout(b.amount, o.pool_total, pools.total, r.payout_seed, pools.n::integer),
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


commit;
