-- Seeded odds (#32) and higher parlay limits (#33).
--
-- Seeded odds: every outcome's pool counts a virtual seed on top of its real
-- stakes, so a market has odds from the moment it opens (a new Yes/No market
-- is 2.00x / 2.00x) and one-sided betting no longer shows 1.00x. With S the
-- seed, n the market's outcome count, P an outcome's real pool and T the
-- market's real total:
--
--   odds        = (T + S*n) / (P + S)
--   chance      = (P + S) / (T + S*n)
--   payout      = floor(stake * (T + S*n) / (W + S)), W the winning pool
--
-- The seed is never staked by anyone, so a seeded payout can mint DC, as
-- parlays and task rewards do; it's bounded below S*n per market. When the
-- winner is the popular side, the payout can also come in under the real
-- pool, the same way today's floor() rounding already keeps a few DC. If
-- nobody bet on the winner, everyone is refunded, as before.
--
-- Markets already open take the default seed, so every live market shows
-- odds at once. Resolved and voided markets get 0, so their history (and
-- any override of them) keeps paying exactly what it paid.
--
-- Parlays: up to 10 legs and a 100x payout cap, both read from
-- parlay_limits() so the TS constants (lib/parlays/odds.ts) have one SQL
-- twin that a test compares them against.
--
-- One explicit transaction, like 0034-0040. lock_timeout bounds the markets
-- alter; an abort applies nothing, and the Deploy Production Database
-- workflow can simply be re-run.
begin;
set local lock_timeout = '5s';

alter table public.markets
  add column seed_per_outcome integer not null default 20 check (seed_per_outcome >= 0);

update public.markets set seed_per_outcome = 0 where status <> 'open';

create function public.parlay_limits()
returns table (max_legs integer, max_multiplier integer)
language sql
immutable
set search_path = ''
as $$
  select 10, 100
$$;

revoke execute on function public.parlay_limits() from public, anon;
grant execute on function public.parlay_limits() to authenticated, service_role;

-- ─── resolve_market: seeded payouts ─────────────────────────────────────────
-- Identical to 0033's apart from the payout line and its ledger meta, which
-- records the seed so the admin ledger can tell minted DC from staked DC.
create or replace function public.resolve_market(p_market_id uuid, p_outcome_id uuid)
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
  v_total_pool integer;
  v_winning_pool integer;
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
  else
    if not (auth.uid() = v_created_by or v_is_admin) then
      raise exception 'only the market creator or an admin can resolve this market';
    end if;
    if now() < v_close_at and not v_is_admin then
      raise exception 'market has not closed yet';
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
  set status = 'resolved', current_resolution_id = v_new_resolution_id
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
        floor(v_bet.amount::numeric * (v_total_pool + v_seed * v_outcome_count) / (v_winning_pool + v_seed))::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id, 'seed_per_outcome', v_seed)
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

-- ─── place_parlay: seeded leg odds, up to parlay_limits().max_legs ──────────
-- Identical to 0029's apart from the leg-count bound and the seeded odds. A
-- leg now only needs odds, which the seed provides even before its first bet.
create or replace function public.place_parlay(p_outcome_ids uuid[], p_stake integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_leg_count integer;
  v_max_legs integer;
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

  select max_legs into v_max_legs from public.parlay_limits();
  v_leg_count := coalesce(array_length(p_outcome_ids, 1), 0);
  if v_leg_count < 2 or v_leg_count > v_max_legs then
    raise exception 'a parlay needs 2 to % picks', v_max_legs;
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
    select o.label, o.pool_total, m.title, m.status, m.close_at, m.seed_per_outcome
    from public.market_outcomes o
    join public.markets m on m.id = o.market_id
    where o.id = any(p_outcome_ids)
  loop
    if v_pick.status <> 'open' or now() >= v_pick.close_at then
      raise exception '''%'' is no longer open', v_pick.title;
    end if;
    if v_pick.pool_total + v_pick.seed_per_outcome = 0 then
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
         trunc(
           (
             (select sum(o2.pool_total) from public.market_outcomes o2 where o2.market_id = o.market_id)
             + m.seed_per_outcome * (select count(*) from public.market_outcomes o2 where o2.market_id = o.market_id)
           )::numeric / (o.pool_total + m.seed_per_outcome),
           4
         )
  from public.market_outcomes o
  join public.markets m on m.id = o.market_id
  where o.id = any(p_outcome_ids);

  return v_parlay_id;
end;
$$;

-- ─── settle_parlay: the cap from parlay_limits() ────────────────────────────
-- Identical to 0027's apart from the cap. The credit is also held under the
-- integer ceiling: an overflowing ::integer would abort the resolve or void
-- that settles it.
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
  v_leg record;
  v_any_lost boolean := false;
  v_any_pending boolean := false;
  v_any_won boolean := false;
  v_multiplier numeric := 1;
  v_max_multiplier integer;
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

  select max_multiplier into v_max_multiplier from public.parlay_limits();

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
    v_target_credit := least(floor(v_stake * least(v_multiplier, v_max_multiplier)), 2147483647)::integer;
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

-- ─── activity_feed: the tests' oracle pays seeded winnings too ──────────────
-- Identical to 0031's apart from the bet_won branch's amount, which must
-- match resolve_market's payout for tests/db/activity-events.test.ts to
-- compare like with like. create or replace keeps its (service-only) grants.
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
  floor(b.amount::numeric * (pools.total + m.seed_per_outcome * pools.n) / (o.pool_total + m.seed_per_outcome))::integer,
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

-- ─── market_sparklines: seeded shares ───────────────────────────────────────
-- Identical to 0036's apart from `chosen`, which adds each market's seed to
-- every outcome's running pool and n seeds to the running total, the same
-- chance the market page shows.
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
    select m.id as market_id, m.seed_per_outcome as seed,
      (select count(*) from public.market_outcomes mo where mo.market_id = m.id) as outcomes
    from public.markets m
    join ids on ids.id = m.id
  ),
  ordered as (
    select bet.market_id, bet.outcome_id, bet.amount, bet.created_at,
      row_number() over w as n,
      sum(bet.amount) over w as total
    from ids
    cross join lateral (
      select b.id, b.market_id, b.outcome_id, b.amount, b.created_at
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
      sum(e.amount) over (partition by e.market_id, e.outcome_id order by e.n, e.mark) as pool
    from (
      select o.market_id, o.n, o.outcome_id, o.amount, false as mark
      from ordered o
      union all
      select p.market_id, p.n, mo.id, 0, true
      from picked p
      join public.market_outcomes mo on mo.market_id = p.market_id
    ) e
  ),
  chosen as (
    select o.market_id, o.n, o.created_at,
      jsonb_object_agg(
        pl.outcome_id,
        (pl.pool + s.seed)::double precision / (o.total + s.seed * s.outcomes)::double precision
      ) as shares
    from pooled pl
    join ordered o on o.market_id = pl.market_id and o.n = pl.n
    join seeds s on s.market_id = pl.market_id
    where pl.mark
    group by o.market_id, o.n, o.created_at
  )
  select c.market_id, jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by c.n)
  from chosen c
  group by c.market_id
  order by c.market_id
$$;

commit;
