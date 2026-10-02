-- LMSR pricing, part 2 of 5 (#333, docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md):
-- new markets are priced by the LMSR market maker (0101), solo bets on them have a payout fixed
-- when they're placed, and those bets are final.
--
-- 1. create_market_v3 makes every new market pricing = 'lmsr', opening at even prices (shares 0)
--    with no seed. The column default stays 'pool', and create_market_v2 still makes pool markets:
--    this applies before the new app deploys, and the build still serving would write pool bets
--    into a market priced by shares.
-- 2. place_slip_v3 buys shares on an lmsr market (place_lmsr_bet) and refuses with
--    price_moved:<payout> when the payout at commit is more than 2% under what the slip showed.
--    place_bet, which place_slip_v2 calls, refuses an lmsr market, so a cached old build can't bet
--    on one. pool_total keeps counting DC staked on every market, which delete_market, "at stake"
--    and the ledger check read; shares are what the market maker and the payout read.
-- 3. Bets on an lmsr market are final: cancel_bet and remove_bet refuse them.
-- 4. Resolving pays floor(shares) DC a winning bet, and market_resolutions.payout_remainder keeps
--    the fractions for the economy's payout rounding line. Nobody is refunded when nobody backed the
--    winner. Voiding refunds bets.amount, which is the cost, so void_market is unchanged.
-- 5. Parlays stay on pool rules until #334: a leg on an lmsr market is refused.
-- 6. Charts, sparklines and the weekly recap's upset read the LMSR price; the economy summary gains
--    a market maker line; member stats and awards stop counting a lost lmsr bet as refunded.
--
-- Additive: new functions, a column, a trigger, and replacements with the same signatures, except
-- economy_summary, which gains two columns at the end of its row.
--
-- One explicit transaction, like 0034-0101.
begin;
set local lock_timeout = '5s';

-- ─── Columns and triggers ───────────────────────────────────────────────────

alter table public.market_resolutions
  add column payout_remainder numeric not null default 0 check (payout_remainder >= 0);

-- A bet on an lmsr market moves shares as well as pool_total; either one is a new point on the
-- market's series (0095).
drop trigger market_outcomes_bump_pool_version on public.market_outcomes;
create trigger market_outcomes_bump_pool_version
  before update of pool_total, shares on public.market_outcomes
  for each row
  when (new.pool_total is distinct from old.pool_total or new.shares is distinct from old.shares)
  execute function public.bump_pool_version();

create function public.refuse_lmsr_parlay_leg()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.markets m where m.id = new.market_id and m.pricing = 'lmsr') then
    raise exception 'a pick on a market with fixed payouts can''t be in a parlay yet. Bet it solo';
  end if;
  return new;
end;
$$;

revoke execute on function public.refuse_lmsr_parlay_leg() from public, anon, authenticated;

create trigger parlay_legs_refuse_lmsr
  before insert on public.parlay_legs
  for each row
  execute function public.refuse_lmsr_parlay_leg();

-- ─── Creating ───────────────────────────────────────────────────────────────

create function public.create_market_v3(
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
  v_market_id uuid;
  v_label text;
  v_labels text[] := p_outcome_labels;
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

  if p_kind not in ('binary', 'multiple_choice', 'over_under') then
    raise exception 'invalid market kind';
  end if;

  if p_kind = 'over_under' then
    if p_line is null or p_line < 0.5 or p_line % 1 <> 0.5 then
      raise exception 'the line must end in .5, like 3.5';
    end if;
    v_labels := array['Over ' || trim_scale(p_line)::text, 'Under ' || trim_scale(p_line)::text];
  elsif p_line is not null then
    raise exception 'only an over/under market has a line';
  end if;

  if array_length(v_labels, 1) is null or array_length(v_labels, 1) < 2 then
    raise exception 'a market needs at least 2 outcomes';
  end if;

  if p_kind = 'binary' and array_length(v_labels, 1) <> 2 then
    raise exception 'a binary market must have exactly 2 outcomes';
  end if;

  if array_length(v_labels, 1) > 6 then
    raise exception 'a market may have at most 6 outcomes';
  end if;

  if p_close_at <= now() then
    raise exception 'close time must be in the future';
  end if;

  insert into public.markets (created_by, title, description, kind, close_at, line, pricing, seed_per_outcome)
  values (
    auth.uid(), p_title, p_description, p_kind, p_close_at,
    case when p_kind = 'over_under' then p_line end,
    'lmsr', 0
  )
  returning id into v_market_id;

  foreach v_label in array v_labels loop
    insert into public.market_outcomes (market_id, label) values (v_market_id, v_label);
  end loop;

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, jsonb_build_object('market_id', v_market_id));
  end if;

  return jsonb_build_object('market_id', v_market_id, 'replayed', false);
end;
$$;

revoke execute on function public.create_market_v3(text, text, text, text[], timestamptz, numeric, uuid) from public, anon;
grant execute on function public.create_market_v3(text, text, text, text[], timestamptz, numeric, uuid) to authenticated, service_role;

-- ─── Betting ────────────────────────────────────────────────────────────────

-- Only place_slip_v3 calls this, with the market already locked. p_payout is the payout the slip
-- showed: the bet is refused when what it would really pay is more than 2% lower.
create function public.place_lmsr_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer, p_payout integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_close_at timestamptz;
  v_pricing text;
  v_liquidity numeric;
  v_ids uuid[];
  v_q numeric[];
  v_index integer;
  v_shares numeric;
  v_payout numeric;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'bet amount must be positive';
  end if;

  -- Far above any balance in the group; it keeps every payout well inside an integer.
  if p_amount > 1000000 then
    raise exception 'a bet can stake at most 1,000,000 DC';
  end if;

  select status, close_at, pricing, liquidity into v_status, v_close_at, v_pricing, v_liquidity
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_pricing <> 'lmsr' then
    raise exception 'this market doesn''t sell shares';
  end if;

  if v_status <> 'open' or now() >= v_close_at then
    raise exception 'market is not open for betting';
  end if;

  select array_agg(o.id order by o.id), array_agg(o.shares + o.q_offset order by o.id)
    into v_ids, v_q
  from public.market_outcomes o
  where o.market_id = p_market_id;

  v_index := array_position(v_ids, p_outcome_id);
  if v_index is null then
    raise exception 'outcome does not belong to this market';
  end if;

  -- Six places, rounded down, keeps the stored numbers short; lmsr_buy never returns fewer
  -- shares than the whole-DC stake, so neither does this.
  v_shares := trunc(public.lmsr_buy(v_q, v_liquidity, v_index, p_amount), 6);
  if v_shares >= 1000000000 then
    raise exception 'that bet would pay more than DwellDuel can hold';
  end if;
  v_payout := floor(v_shares);

  if p_payout is null or v_payout < p_payout * 0.98 then
    raise exception 'price_moved:%', v_payout;
  end if;

  perform public.apply_coin_transaction(
    auth.uid(), -p_amount, 'bet_placed',
    jsonb_build_object('market_id', p_market_id, 'outcome_id', p_outcome_id)
  );

  insert into public.bets (market_id, outcome_id, profile_id, amount, cost, shares)
  values (p_market_id, p_outcome_id, auth.uid(), p_amount, p_amount, v_shares);

  update public.market_outcomes
  set pool_total = pool_total + p_amount, shares = shares + v_shares
  where id = p_outcome_id;
end;
$$;

revoke execute on function public.place_lmsr_bet(uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.place_lmsr_bet(uuid, uuid, integer, integer) to service_role;

-- place_slip_v2 with each single's shown payout (p_singles: [{outcome_id, amount, payout}]). A pick
-- on an lmsr market buys shares; a pick on a pool market is a pool bet, as before.
create function public.place_slip_v3(
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
        raise exception 'a pick on a market with fixed payouts can''t be in a parlay yet. Bet it solo';
      end if;
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

revoke execute on function public.place_slip_v3(jsonb, uuid[], integer, uuid) from public, anon;
grant execute on function public.place_slip_v3(jsonb, uuid[], integer, uuid) to authenticated, service_role;

-- ─── Charts and sparklines ──────────────────────────────────────────────────

-- As 0041's, plus: an lmsr market's point is the LMSR price of its running shares (plus each
-- outcome's q_offset), which is the chance the market shows. A pool market's is unchanged.
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
      select b.id, b.market_id, b.outcome_id, b.amount, coalesce(b.shares, 0) as shares, b.created_at
      from public.bets b
      where b.market_id = ids.id
      offset 0
    ) bet
    window w as (partition by bet.market_id order by bet.created_at, bet.id)
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
    select pl.market_id, pl.n, pl.outcome_id, pl.pool, (pl.held + mo.q_offset) / s.liquidity as z
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
        when s.pricing = 'lmsr' then (wt.w / sum(wt.w) over (partition by wt.market_id, wt.n))::double precision
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

-- As 0074's, plus a market_maker source: an lmsr market's result (winners' payouts less every
-- stake on it) is the market maker's, not payout rounding's, apart from the fractions of a share
-- it rounded away, which payout rounding keeps, rounded to whole DC.
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

-- The same row as 0074's with the market maker's two columns at the end, so the build still
-- serving, which reads columns by name, is unaffected.
drop function public.economy_summary(timestamptz);

create function public.economy_summary(p_month_start timestamptz)
returns table (
  month_start timestamptz,
  month_end timestamptz,
  balances bigint,
  bets_at_stake bigint,
  parlays_at_stake bigint,
  starting_grants_added bigint,
  task_rewards_added bigint,
  seed_payouts_added bigint,
  seed_payouts_removed bigint,
  payout_rounding_added bigint,
  payout_rounding_removed bigint,
  house_parlays_added bigint,
  house_parlays_removed bigint,
  owner_adjustments_added bigint,
  owner_adjustments_removed bigint,
  all_time_added bigint,
  all_time_removed bigint,
  unclassified bigint,
  market_maker_added bigint,
  market_maker_removed bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_local_month timestamp;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can see the economy';
  end if;
  if p_month_start is null then
    raise exception 'a month is required';
  end if;

  v_local_month := date_trunc('month', p_month_start at time zone 'America/New_York');
  month_start := v_local_month at time zone 'America/New_York';
  month_end := (v_local_month + interval '1 month') at time zone 'America/New_York';

  select coalesce(sum(p.balance), 0) into balances from public.profiles p;

  select coalesce(sum(b.amount), 0) into bets_at_stake
  from public.bets b
  join public.markets m on m.id = b.market_id
  where m.status = 'open';

  select coalesce(sum(pa.stake), 0) into parlays_at_stake
  from public.parlays pa
  where pa.status = 'pending';

  select
    coalesce(sum(f.added) filter (where f.source = 'starting_grants'), 0),
    coalesce(sum(f.added) filter (where f.source = 'task_rewards'), 0),
    coalesce(sum(f.added) filter (where f.source = 'seed_payouts'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'seed_payouts'), 0),
    coalesce(sum(f.added) filter (where f.source = 'payout_rounding'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'payout_rounding'), 0),
    coalesce(sum(f.added) filter (where f.source = 'house_parlays'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'house_parlays'), 0),
    coalesce(sum(f.added) filter (where f.source = 'owner_adjustments'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'owner_adjustments'), 0),
    coalesce(sum(f.added) filter (where f.source = 'market_maker'), 0),
    coalesce(sum(f.removed) filter (where f.source = 'market_maker'), 0)
  into
    starting_grants_added, task_rewards_added,
    seed_payouts_added, seed_payouts_removed,
    payout_rounding_added, payout_rounding_removed,
    house_parlays_added, house_parlays_removed,
    owner_adjustments_added, owner_adjustments_removed,
    market_maker_added, market_maker_removed
  from public.economy_flows(month_start, month_end) f;

  select coalesce(sum(f.added), 0), coalesce(sum(f.removed), 0)
    into all_time_added, all_time_removed
  from public.economy_flows('-infinity', 'infinity') f;

  select count(*) into unclassified
  from public.coin_transactions t
  where t.type not in (
    'starting_grant', 'task_completed', 'admin_adjustment',
    'bet_won', 'bet_refunded', 'resolution_reversed',
    'parlay_won', 'parlay_refunded', 'parlay_reversed',
    'bet_placed', 'bet_cancelled', 'bet_voided_refund', 'parlay_placed'
  );

  return next;
end;
$$;

revoke execute on function public.economy_summary(timestamptz) from public, anon;
grant execute on function public.economy_summary(timestamptz) to authenticated, service_role;

-- ─── Replaced with an lmsr branch, otherwise as before ──────────────────────

create or replace function public.place_bet(p_market_id uuid, p_outcome_id uuid, p_amount integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_status text;
  v_close_at timestamptz;
  v_outcome_market_id uuid;
  v_pricing text;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  if p_amount <= 0 then
    raise exception 'bet amount must be positive';
  end if;

  select status, close_at, pricing into v_status, v_close_at, v_pricing
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  -- Only the build before #333 calls this for a slip, and it would write a pool bet into a
  -- market priced by shares.
  if v_pricing = 'lmsr' then
    raise exception 'DwellDuel just updated. Refresh to bet.';
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
$function$;

create or replace function public.cancel_bet(p_bet_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
  v_refund integer;
  v_pricing text;
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

  select status, close_at, pricing into v_status, v_close_at, v_pricing
  from public.markets
  where id = v_market_id
  for update;

  if v_pricing = 'lmsr' then
    raise exception 'bets on this market are final';
  end if;

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
$function$;

create or replace function public.remove_bet(p_bet_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_market_id uuid;
  v_status text;
  v_close_at timestamptz;
  v_bet public.bets%rowtype;
  v_refund integer;
  v_pricing text;
begin
  if not public.has_role('owner') then
    raise exception 'only the owner can remove a bet';
  end if;

  select market_id into v_market_id from public.bets where id = p_bet_id;
  if not found then
    raise exception 'bet not found';
  end if;

  select status, close_at, pricing into v_status, v_close_at, v_pricing from public.markets where id = v_market_id for update;
  if v_pricing = 'lmsr' then
    raise exception 'bets on this market are final';
  end if;
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
$function$;

create or replace function public.resolve_market_core(p_market_id uuid, p_outcome_id uuid)
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
$function$;

create or replace function public.member_records(p_ids uuid[])
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
           count(*) filter (where b.outcome_id <> r.outcome_id and (w.pool_total > 0 or m.pricing = 'lmsr')) as lost
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

create or replace function public.weekly_recap(p_week date)
 RETURNS TABLE(week_start timestamp with time zone, week_end timestamp with time zone, my_betting_net bigint, my_betting_moves integer, my_task_income bigint, best_bettor_id uuid, best_bettor_name text, best_market_id uuid, best_market_title text, best_stake integer, best_payout integer, upset_market_id uuid, upset_market_title text, upset_outcome_label text, upset_chance double precision, top_tasker_id uuid, top_tasker_name text, top_tasker_count integer, closing_total integer, closing jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with week as (
    select
      (date_trunc('week', p_week::timestamp) at time zone 'America/New_York') as starts,
      ((date_trunc('week', p_week::timestamp) + interval '7 days') at time zone 'America/New_York') as ends,
      ((date_trunc('week', p_week::timestamp) + interval '14 days') at time zone 'America/New_York') as next_ends
  ),
  mine as (
    select
      coalesce(sum(t.amount) filter (where t.betting), 0)::bigint as betting_net,
      (count(*) filter (where t.betting))::integer as betting_moves,
      coalesce(sum(t.amount) filter (where t.type = 'task_completed'), 0)::bigint as task_income
    from (
      select c.amount, c.type, c.type = any(public.betting_ledger_types()) as betting
      from public.coin_transactions c
      cross join week w
      where c.profile_id = (select auth.uid())
        and c.created_at >= w.starts
        and c.created_at < w.ends
    ) t
  ),
  best as (
    select e.actor_id, e.market_id, b.amount as stake, e.amount as payout
    from public.activity_events e
    cross join week w
    join public.bets b on b.id = e.bet_id
    where e.hidden_at is null
      and e.kind = 'bet_won'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and e.amount > b.amount
      and e.actor_id in (select i.id from public.invited_member_ids() i)
    order by e.amount - b.amount desc, e.occurred_at, e.id
    limit 1
  ),
  upset as (
    select e.market_id, e.outcome_id, c.chance
    from public.activity_events e
    cross join week w
    join public.markets m on m.id = e.market_id
    cross join lateral (
      select
        sum(o.pool_total) as real_total,
        case when m.pricing = 'lmsr' then
          (sum(exp((o.shares + o.q_offset) / m.liquidity - x.top)) filter (where o.id = e.outcome_id)
            / sum(exp((o.shares + o.q_offset) / m.liquidity - x.top)))::double precision
        else
          (max(o.pool_total) filter (where o.id = e.outcome_id) + m.seed_per_outcome)::double precision
            / (sum(o.pool_total) + m.seed_per_outcome * count(*))::double precision
        end as chance
      from public.market_outcomes o
      cross join (
        select max((t.shares + t.q_offset) / m.liquidity) as top
        from public.market_outcomes t
        where t.market_id = e.market_id
      ) x
      where o.market_id = e.market_id
    ) c
    where e.hidden_at is null
      and e.kind = 'market_resolved'
      and e.occurred_at >= w.starts
      and e.occurred_at < w.ends
      and c.real_total > 0
      and c.chance < 0.5
    order by c.chance, e.occurred_at desc, e.id
    limit 1
  ),
  tasker as (
    select c.profile_id, count(*)::integer as n
    from public.task_completions c
    cross join week w
    where c.status = 'approved'
      and c.reviewed_at >= w.starts
      and c.reviewed_at < w.ends
      and c.profile_id in (select i.id from public.invited_member_ids() i)
    group by c.profile_id
    order by count(*) desc, max(c.reviewed_at), c.profile_id
    limit 1
  ),
  closing as (
    select m.id, m.title, m.close_at, count(*) over () as total
    from public.markets m
    cross join week w
    where m.status = 'open'
      and m.close_at >= greatest(now(), w.ends)
      and m.close_at < w.next_ends
    order by m.close_at, m.id
    limit 3
  )
  select
    w.starts,
    w.ends,
    mi.betting_net,
    mi.betting_moves,
    mi.task_income,
    b.actor_id,
    bp.display_name,
    b.market_id,
    bm.title,
    b.stake,
    b.payout,
    u.market_id,
    um.title,
    uo.label,
    u.chance,
    t.profile_id,
    tp.display_name,
    t.n,
    coalesce((select max(c.total) from closing c), 0)::integer,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title, 'close_at', c.close_at) order by c.close_at, c.id) from closing c),
      '[]'::jsonb
    )
  from week w
  cross join mine mi
  left join best b on true
  left join public.profiles bp on bp.id = b.actor_id
  left join public.markets bm on bm.id = b.market_id
  left join upset u on true
  left join public.markets um on um.id = u.market_id
  left join public.market_outcomes uo on uo.id = u.outcome_id
  left join tasker t on true
  left join public.profiles tp on tp.id = t.profile_id
  where (select public.is_invited());
$function$;

commit;
