-- LMSR pricing, part 4 of 5 (#335, docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md,
-- "Conversion at release"): every open pool market and pending pool parlay moves to fixed payouts,
-- and nobody's expected payout, the chance any market shows, or any balance changes.
--
-- 1. convert_pool_markets_to_lmsr(), called at the end, converts every market with status 'open'
--    (closed-but-unresolved included) and pricing 'pool':
--    - Each live bet's shares are its "Pays ~" (pool_payout of its stake, its outcome's real pool
--      and the market's, as resolve_market_core would have paid it now), its cost is its stake, and
--      it is marked converted.
--    - The market maker starts at the chance the market shows (effectivePools, seed included):
--      q_i = 50 ln p_i, shifted so the smallest is 0, with an outcome at 0% floored at 0.1% so its
--      log is finite (it still shows 0%), and an even start when the market has nothing at all.
--      shares = the bets' shares; q_offset = q_i - shares.
--    - Pool rules refunded every bet when nobody had backed the winner. A converted bet keeps that:
--      refund_outcomes lists the outcomes nobody had backed at conversion, and resolve_market_core
--      refunds the bet's stake when one of them wins. A bet placed after conversion is an ordinary
--      lmsr bet.
--    - Each pending pool parlay's unlocked legs lock at pick_quote now (a voided leg drops out and
--      stays as it is); every leg's factor is its locked odds (1 for a voided leg without any); the
--      parlay's multiplier and payout are 0074's capped figures at those odds, stored, and it is
--      marked converted. Its legs hold no parlay-book shares: a pool parlay was paid by the house
--      and never moved a pool, so book shares would move today's chance, and the book is never
--      paid. Members' parlay payouts don't depend on it either way.
--    It refuses to run if any pool doesn't equal its live bets, rather than convert from figures
--    nobody saw.
-- 2. settle_parlay keeps 0074's caps for a converted parlay whose leg is voided.
-- 3. market_sparklines charts a converted bet at the pool chance it showed when it was placed, so a
--    converted market's history doesn't change; points after it are LMSR prices.
-- 4. member_stats, member_records and leaderboard_awards count a converted bet refunded under
--    (1) as refunded, not lost, and the best parlay keeps a converted parlay's cap.
-- 5. place_slip_v2 (and place_slip, which wraps it) refuses with "DwellDuel just updated. Refresh to
--    bet.", after replaying an attempt it already finished. This applies before the new app
--    deploys; the build before #333 is the only caller.
-- 6. create_market_v2 (and create_market, which wraps it) refuses the same build with "DwellDuel just
--    updated. Refresh to create a market.", after replaying a finished attempt, so no pool market
--    can appear after release.
-- 7. can_void_market mirrors void_market's rules (0104: a creator with a stake can't void), so the
--    market page offers Void as it offers Resolve through can_resolve_market.
--
-- The pool code paths stay until clean-up (#332). Additive: new columns and functions, and
-- replacements with the same signatures.
--
-- One explicit transaction, like 0034-0104.
begin;
set local lock_timeout = '5s';

-- ─── Columns ────────────────────────────────────────────────────────────────

alter table public.bets
  add column converted boolean not null default false,
  add column refund_outcomes uuid[] not null default '{}';

comment on column public.bets.converted is
  'Placed as a pool bet and converted to shares at release (0105): its shares are the payout it showed then.';
comment on column public.bets.refund_outcomes is
  'For a converted bet (0105), the outcomes nobody had backed at conversion. If one wins, the bet is refunded its cost, as the pool rules would have.';

alter table public.parlays
  add column converted boolean not null default false;

comment on column public.parlays.converted is
  'A pool parlay converted at release (0105): its multiplier and payout are 0074''s capped figures at its locked odds, its legs'' factors are those odds, and its legs hold no parlay-book shares.';

-- ─── The conversion ─────────────────────────────────────────────────────────

create function public.convert_pool_markets_to_lmsr()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_market record;
  v_parlay record;
  v_factor numeric;
  v_outcomes integer;
  v_total bigint;
  v_whole numeric;
  v_product numeric;
  v_multiplier numeric;
  v_max_payout integer;
  v_rows integer;
  v_markets integer := 0;
  v_bets integer := 0;
  v_parlays integer := 0;
begin
  for v_market in
    select m.id, m.seed_per_outcome as seed
    from public.markets m
    where m.status = 'open' and m.pricing = 'pool'
    order by m.id
    for update
  loop
    if exists (
      select 1
      from public.market_outcomes o
      where o.market_id = v_market.id
        and o.pool_total <> coalesce((select sum(b.amount) from public.bets b where b.outcome_id = o.id), 0)
    ) then
      raise exception 'market % has a pool that doesn''t equal its live bets, so it wasn''t converted', v_market.id;
    end if;

    select count(*), coalesce(sum(o.pool_total), 0) into v_outcomes, v_total
    from public.market_outcomes o
    where o.market_id = v_market.id;

    -- effectivePools' denominator: the real pool plus the seed on every outcome.
    v_whole := v_total + v_market.seed::numeric * v_outcomes;

    update public.bets b
    set shares = public.pool_payout(b.amount, o.pool_total, v_total),
        cost = b.amount,
        converted = true,
        refund_outcomes = coalesce((
          select array_agg(e.id order by e.id)
          from public.market_outcomes e
          where e.market_id = v_market.id and e.pool_total = 0
        ), '{}')
    from public.market_outcomes o
    where o.id = b.outcome_id and b.market_id = v_market.id;
    get diagnostics v_rows = row_count;
    v_bets := v_bets + v_rows;

    with chance as (
      select o.id,
        greatest(
          case when v_whole > 0 then (o.pool_total + v_market.seed) / v_whole else 1.0 / v_outcomes end,
          0.001
        ) as p
      from public.market_outcomes o
      where o.market_id = v_market.id
    ),
    q as (
      select c.id, 50 * ln(c.p) as q from chance c
    ),
    shifted as (
      select q.id, round(q.q - min(q.q) over (), 10) as q from q
    ),
    held as (
      select o.id, coalesce((select sum(b.shares) from public.bets b where b.outcome_id = o.id), 0) as shares
      from public.market_outcomes o
      where o.market_id = v_market.id
    )
    update public.market_outcomes o
    set shares = h.shares, q_offset = s.q - h.shares
    from shifted s
    join held h on h.id = s.id
    where o.id = s.id;

    update public.markets set pricing = 'lmsr', liquidity = 50 where id = v_market.id;
    v_markets := v_markets + 1;
  end loop;

  select l.max_payout into v_max_payout from public.parlay_limits() l;

  for v_parlay in
    select pa.id, pa.profile_id, pa.stake, pa.max_multiplier
    from public.parlays pa
    where pa.status = 'pending' and pa.multiplier is null
    order by pa.id
    for update
  loop
    -- What settle_parlay would lock each leg at if its market closed now. Bets can't move on a
    -- converted market's pool any more, so these are the odds the leg would have kept.
    update public.parlay_legs l
    set locked_odds = (select q.odds from public.pick_quote(v_parlay.profile_id, l.outcome_id) q)
    from public.markets m
    where l.parlay_id = v_parlay.id
      and m.id = l.market_id
      and l.locked_odds is null
      and m.status <> 'voided';

    update public.parlay_legs l
    set factor = coalesce(l.locked_odds, 1)
    where l.parlay_id = v_parlay.id;

    -- 0074's settle_parlay: the exact product of the legs still counting, capped.
    v_product := 1;
    for v_factor in
      select l.factor
      from public.parlay_legs l
      join public.markets m on m.id = l.market_id
      where l.parlay_id = v_parlay.id and m.status <> 'voided'
    loop
      v_product := v_product * v_factor;
    end loop;
    v_multiplier := least(v_product, v_parlay.max_multiplier);

    update public.parlays
    set multiplier = v_multiplier,
        payout = least(floor(v_parlay.stake * v_multiplier), greatest(v_max_payout, v_parlay.stake))::integer,
        converted = true
    where id = v_parlay.id;
    v_parlays := v_parlays + 1;
  end loop;

  return jsonb_build_object('markets', v_markets, 'bets', v_bets, 'parlays', v_parlays);
end;
$$;

revoke execute on function public.convert_pool_markets_to_lmsr() from public, anon, authenticated, service_role;

-- ─── Paying what the pool rules would have ──────────────────────────────────

-- As 0102's, plus: a converted bet is refunded when an outcome nobody had backed at conversion wins.
CREATE OR REPLACE FUNCTION public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_pricing text;
begin
  select created_by, status, close_at, current_resolution_id, seed_per_outcome, pricing
    into v_created_by, v_status, v_close_at, v_current_resolution_id, v_seed, v_pricing
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

  -- LMSR (#333): a winning share pays 1 DC, rounded down per bet, and the fractions go to
  -- payout rounding. Nobody is refunded when nobody backed the winner: the house took the other
  -- side of every bet, so the losers lost to it.
  if v_pricing = 'lmsr' then
    for v_bet in select profile_id, shares, id from public.bets where outcome_id = p_outcome_id order by profile_id, id loop
      if floor(v_bet.shares) > 0 then
        perform public.apply_coin_transaction(
          v_bet.profile_id, floor(v_bet.shares)::integer, 'bet_won',
          jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'shares', v_bet.shares)
        );
      end if;
    end loop;

    update public.market_resolutions
    set payout_remainder = (
      select coalesce(sum(b.shares - floor(b.shares)), 0) from public.bets b where b.outcome_id = p_outcome_id
    )
    where id = v_new_resolution_id;

    -- A bet converted from a pool (0105) keeps the pool rule that refunded every bet when nobody
    -- had backed the winner: refund_outcomes lists the outcomes nobody had backed at conversion.
    for v_bet in
      select profile_id, cost, id from public.bets
      where market_id = p_market_id and p_outcome_id = any (refund_outcomes)
      order by profile_id, id
    loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.cost, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  elsif v_winning_pool = 0 then
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
$function$;

-- As 0104's, plus: a converted parlay with a voided leg keeps 0074's caps.
CREATE OR REPLACE FUNCTION public.settle_parlay(p_parlay_id uuid)
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
  v_converted boolean;
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
  select profile_id, stake, status, credited, max_multiplier, multiplier, payout, converted
    into v_profile_id, v_stake, v_status, v_credited, v_max_multiplier, v_fixed_multiplier, v_fixed_payout, v_converted
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
    -- A parlay converted from the pool rules (0105) keeps their caps when a leg drops out: its
    -- stored payout is already capped, and the remaining legs multiply to no more than all of them.
    v_target_credit := case
      when not v_any_voided then v_fixed_payout
      when v_converted then least(floor(v_stake * least(v_multiplier, v_max_multiplier)), v_fixed_payout)::integer
      else floor(v_stake * v_multiplier)::integer
    end;
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

-- ─── Charts ─────────────────────────────────────────────────────────────────

-- As 0104's, plus: a converted bet's point is the pool chance it showed, so history stays as it was.
CREATE OR REPLACE FUNCTION public.market_sparklines(p_market_ids uuid[], p_points integer DEFAULT 40)
 RETURNS TABLE(market_id uuid, points jsonb)
 LANGUAGE sql
 STABLE
AS $function$
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
    select bet.market_id, bet.outcome_id, bet.amount, bet.shares, bet.converted, bet.created_at,
      row_number() over w as n,
      sum(bet.amount) over w as total
    from ids
    cross join lateral (
      (
        select b.market_id, b.outcome_id, b.amount, coalesce(b.shares, 0) as shares, b.converted, b.created_at,
          0 as source, b.id as bet_id, null::uuid as leg_id
        from public.bets b
        where b.market_id = ids.id
        offset 0
      )
      union all
      (
        select l.market_id, l.outcome_id, 0, l.shares, false, pa.created_at, 1, null::bigint, l.id
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
        when s.pricing = 'lmsr' and not o.converted then wt.w / sum(wt.w) over (partition by wt.market_id, wt.n)
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
$function$;

-- ─── Stats and awards ───────────────────────────────────────────────────────

-- As 0104's, apart from: a converted refund is refunded, not lost, and the best parlay with a voided
-- leg is capped at the parlay's own cap (a fixed parlay's remaining factors never reach it).
CREATE OR REPLACE FUNCTION public.member_stats(p_profile_id uuid)
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
      count(*) filter (where m.status = 'resolved' and b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr') and not coalesce(r.outcome_id = any (b.refund_outcomes), false))::integer as lost,
      count(*) filter (where m.status = 'voided' or (m.status = 'resolved' and w.pool_total = 0 and m.pricing = 'pool')
        or (m.status = 'resolved' and coalesce(r.outcome_id = any (b.refund_outcomes), false)))::integer as refunded
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
        else least(trunc(round(exp(sum(ln(l.factor))), 10), 4), pa.max_multiplier)
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

-- As 0102's, apart from: a converted refund isn't lost.
CREATE OR REPLACE FUNCTION public.member_records(p_ids uuid[])
 RETURNS TABLE(profile_id uuid, won integer, lost integer)
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
    select b.profile_id as id,
           count(*) filter (where b.outcome_id = r.outcome_id) as won,
           count(*) filter (where b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr') and not coalesce(r.outcome_id = any (b.refund_outcomes), false)) as lost
    from public.bets b
    join public.markets m on m.id = b.market_id and m.status = 'resolved'
    join public.market_resolutions r on r.id = m.current_resolution_id
    join public.market_outcomes w on w.id = r.outcome_id
    where b.profile_id = any (p_ids)
    group by b.profile_id
  ),
  parlays as (
    select pa.profile_id as id,
           count(*) filter (where pa.status = 'won') as won,
           count(*) filter (where pa.status = 'lost') as lost
    from public.parlays pa
    where pa.profile_id = any (p_ids)
    group by pa.profile_id
  )
  select i.id,
         (coalesce(s.won, 0) + coalesce(q.won, 0))::integer,
         (coalesce(s.lost, 0) + coalesce(q.lost, 0))::integer
  from unnest(p_ids) as i(id)
  left join solo s on s.id = i.id
  left join parlays q on q.id = i.id;
end;
$function$;

-- As 0104's, apart from member_stats' two changes.
CREATE OR REPLACE FUNCTION public.leaderboard_awards()
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
          else least(trunc(round(exp(sum(ln(l.factor))), 10), 4), pa.max_multiplier)
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
             count(*) filter (where b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr') and not coalesce(r.outcome_id = any (b.refund_outcomes), false)) as lost
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

-- ─── Cutover ────────────────────────────────────────────────────────────────

-- The build before #333 places slips here. It would write pool bets into markets priced by shares,
-- so it is refused, apart from replaying an attempt that already finished.
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
  v_previous jsonb;
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

  raise exception 'DwellDuel just updated. Refresh to bet.';
end;
$$;

-- The same build creates markets here (create_market wraps it), and would make pool markets no build
-- can bet on any more. Refused like place_slip_v2, so no pool market appears after release.
create or replace function public.create_market_v2(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_line numeric default null,
  p_idempotency_key uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous jsonb;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_idempotency_key is not null then
    v_previous := public.claim_idempotency_key(p_idempotency_key, 'create_market');
    if v_previous is not null then
      return jsonb_build_object('market_id', v_previous ->> 'market_id', 'replayed', true);
    end if;
  end if;

  raise exception 'DwellDuel just updated. Refresh to create a market.';
end;
$$;

-- Mirrors void_market's rules, as can_resolve_market mirrors resolve_market_core's: an admin at any
-- time; the creator while the market is open, before it closes, and only with no stake in it.
create function public.can_void_market(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.markets m
    where m.id = p_market_id
      and m.status = 'open'
      and now() < m.close_at
      and m.created_by = auth.uid()
      and public.is_invited()
      and not public.has_stake_in_market(m.id, auth.uid())
  )
$$;

revoke execute on function public.can_void_market(uuid) from public, anon;
grant execute on function public.can_void_market(uuid) to authenticated, service_role;

-- ─── Convert ────────────────────────────────────────────────────────────────

select public.convert_pool_markets_to_lmsr();

commit;
