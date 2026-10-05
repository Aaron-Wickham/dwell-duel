-- Outcome order, chart bucketing and the week-ago chance in SQL (#409).
--
-- 1. market_outcomes.position: the order the creator typed the outcomes in. create_market_v4
--    inserts them in one transaction, so they share a created_at and the old tiebreak (the label)
--    listed a multiple-choice market alphabetically. Existing rows are numbered in the order the
--    app shows them today: Yes before No, Over before Under, otherwise insertion time, then label.
--    A row inserted without a position (create_market_v3, test fixtures) goes after its market's
--    others, so every path keeps the typed order. Unique per market.
-- 2. create_market_v4 sets position from p_outcome_labels' order, and market_sparks lists a card's
--    outcome ids in position order.
-- 3. market_series(market ids, window starts, buckets): for each market and each window start, the
--    price at the last move at or before the start (a window's carry-in), then the last move in
--    each of `buckets` equal slices of time up to the market's latest move. The market page reads
--    its 1D, 1W and All series from it in one call, so a busy market's day shows its intraday
--    moves instead of every k-th bet of its whole history (market_sparklines, which the cards keep
--    reading through market_sparks). With no buckets it is the price at an instant: the cards'
--    weekly change reads the chance a week ago this way. Prices are market_sparklines' own: the
--    LMSR price from shares (bets and parlay-book legs) plus q_offset, or a converted bet's and a
--    pool market's pool chance.
--
-- Additive: a column with its trigger and constraint, a new function, and two functions replaced
-- with the same signatures. The previous build orders outcomes by created_at and label, which
-- still works, and never calls market_series.
--
-- One explicit transaction, like 0034-0109.
begin;
set local lock_timeout = '5s';

-- ─── Outcome position ───────────────────────────────────────────────────────

alter table public.market_outcomes add column position smallint;

update public.market_outcomes mo
set position = ranked.position
from (
  select o.id,
    (row_number() over (
      partition by o.market_id
      order by
        case
          when m.kind = 'binary' and o.label = 'Yes' then 0
          when m.kind = 'over_under' and o.label like 'Over%' then 0
          else 1
        end,
        o.created_at, o.label, o.id
    ) - 1)::smallint as position
  from public.market_outcomes o
  join public.markets m on m.id = o.market_id
) ranked
where ranked.id = mo.id;

create function public.default_outcome_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(mo.position) + 1, 0) into new.position
    from public.market_outcomes mo
    where mo.market_id = new.market_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.default_outcome_position() from public, anon, authenticated;

create trigger market_outcomes_default_position
  before insert on public.market_outcomes
  for each row execute function public.default_outcome_position();

alter table public.market_outcomes
  alter column position set not null,
  add constraint market_outcomes_market_id_position_key unique (market_id, position);

-- 0103's, apart from: each outcome's position is its place in p_outcome_labels.
create or replace function public.create_market_v4(
  p_title text,
  p_description text,
  p_kind text,
  p_outcome_labels text[],
  p_close_at timestamptz,
  p_category text,
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
  v_labels text[] := p_outcome_labels;
  v_previous jsonb;
  v_category_id uuid;
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

  v_category_id := public.category_for_name(p_category);

  insert into public.markets (created_by, title, description, kind, close_at, line, pricing, seed_per_outcome, category_id)
  values (
    auth.uid(), p_title, p_description, p_kind, p_close_at,
    case when p_kind = 'over_under' then p_line end,
    'lmsr', 0, v_category_id
  )
  returning id into v_market_id;

  for i in 1 .. array_length(v_labels, 1) loop
    insert into public.market_outcomes (market_id, label, position) values (v_market_id, v_labels[i], i - 1);
  end loop;

  if p_idempotency_key is not null then
    perform public.finish_idempotent(p_idempotency_key, jsonb_build_object('market_id', v_market_id));
  end if;

  return jsonb_build_object('market_id', v_market_id, 'replayed', false);
end;
$$;

-- 0095's, apart from: outcome ids in position order, the order the cards list them in.
create or replace function public.market_sparks(p_market_ids uuid[], p_points integer default 24)
returns table (market_id uuid, outcome_ids uuid[], points jsonb)
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
  with series as (
    select s.market_id, s.points
    from public.market_sparklines(p_market_ids, greatest(1, least(coalesce(p_points, 24), 24))) s
  ),
  outcomes as (
    select mo.market_id,
      array_agg(mo.id order by mo.position) as ids
    from public.market_outcomes mo
    join series s on s.market_id = mo.market_id
    group by mo.market_id
  )
  select s.market_id, o.ids,
    (
      select jsonb_agg(
        (
          select jsonb_agg(c.v order by c.k)
          from (
            select 0::bigint as k, to_jsonb(floor(extract(epoch from (p.value ->> 't')::timestamptz))::bigint) as v
            union all
            select u.k, to_jsonb(round(coalesce((p.value -> 'shares' ->> u.id::text)::numeric, 0), 4)::double precision)
            from unnest(o.ids) with ordinality as u(id, k)
          ) c
        )
        order by p.n
      )
      from jsonb_array_elements(s.points) with ordinality as p(value, n)
    )
  from series s
  join outcomes o on o.market_id = s.market_id
  order by s.market_id;
end;
$$;

-- ─── Time-bucketed series ───────────────────────────────────────────────────

-- Moves are numbered and priced as in market_sparklines (0105); only the points picked differ. A
-- window's span runs from its start (or the market's first move, if later) to the market's latest
-- move, so the last bucket always ends on the price the market shows. At most 50 markets, 3
-- window starts and 500 buckets.
create function public.market_series(p_market_ids uuid[], p_froms timestamptz[], p_buckets integer default 200)
returns table (market_id uuid, from_at timestamptz, points jsonb)
language sql
stable
set search_path = ''
as $$
  with ids as (
    select distinct u.id
    from unnest(p_market_ids) with ordinality as u(id, ord)
    where u.ord <= 50
  ),
  froms as (
    select distinct f.at
    from unnest(p_froms) with ordinality as f(at, ord)
    where f.ord <= 3 and f.at is not null
  ),
  sizing as (
    select greatest(0, least(coalesce(p_buckets, 200), 500)) as buckets
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
  spans as (
    select o.market_id, f.at as from_at,
      greatest(f.at, min(o.created_at)) as lo,
      max(o.created_at) as hi
    from ordered o
    cross join froms f
    group by o.market_id, f.at
  ),
  picked as (
    select s.market_id, s.from_at, max(o.n) as n
    from spans s
    join ordered o on o.market_id = s.market_id and o.created_at <= s.lo
    group by s.market_id, s.from_at
    union
    select s.market_id, s.from_at, max(o.n)
    from spans s
    cross join sizing z
    join ordered o on o.market_id = s.market_id and o.created_at > s.lo
    where z.buckets > 0
    group by s.market_id, s.from_at,
      least(
        z.buckets - 1,
        floor(extract(epoch from (o.created_at - s.lo)) / (extract(epoch from (s.hi - s.lo)) / z.buckets))
      )
  ),
  marks as (
    select distinct p.market_id, p.n from picked p
  ),
  pooled as (
    select e.market_id, e.n, e.outcome_id, e.mark,
      sum(e.amount) over x as pool,
      sum(e.shares) over x as held
    from (
      select o.market_id, o.n, o.outcome_id, o.amount, o.shares, false as mark
      from ordered o
      union all
      select mk.market_id, mk.n, mo.id, 0, 0, true
      from marks mk
      join public.market_outcomes mo on mo.market_id = mk.market_id
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
  select p.market_id, p.from_at,
    jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by p.n)
  from picked p
  join chosen c on c.market_id = p.market_id and c.n = p.n
  group by p.market_id, p.from_at
  order by p.market_id, p.from_at
$$;

revoke execute on function public.market_series(uuid[], timestamptz[], integer) from public, anon;
grant execute on function public.market_series(uuid[], timestamptz[], integer) to authenticated, service_role;

commit;
