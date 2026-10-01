-- #252: the markets list's sparklines, small and fetched only when they change.
--
-- /markets read every card's series as market_sparklines' verbose JSON (an ISO time and every
-- outcome's uuid repeated in each of 40 points, about 7 KB a two-outcome card), on every render,
-- and every live refresh rendered it again. Now:
--
-- 1. market_sparks returns at most 24 points a market, compact: each point is
--    [epoch seconds, share, share, ...] with the shares in outcome_ids' order, rounded to 4
--    decimals (3 would round the card's "Now: Yes 33%" label differently from its odds about one
--    time in twenty). It reads market_sparklines, so the maths stays the one the DB tests hold
--    equal to the chart's.
-- 2. market_outcomes.pool_version counts every change to an outcome's pool (each bet and each
--    cancellation), so the sum over a market's outcomes is a version of its series. The list
--    already reads the outcomes, so the app caches each card's series under that version and asks
--    for it again only when it moves. A settled market's series never changes.
--
-- Additive: the previous build keeps reading markets.sparkline (0070), whose trigger still fills it.
--
-- One explicit transaction, like 0034-0073.
begin;
set local lock_timeout = '5s';

-- ─── Pool version ────────────────────────────────────────────────────────────
-- A constant default is a metadata-only change, so this takes no table rewrite.
alter table public.market_outcomes add column pool_version bigint not null default 0;

create function public.bump_pool_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.pool_version := old.pool_version + 1;
  return new;
end;
$$;

create trigger market_outcomes_bump_pool_version
  before update of pool_total on public.market_outcomes
  for each row
  when (new.pool_total is distinct from old.pool_total)
  execute function public.bump_pool_version();

revoke execute on function public.bump_pool_version() from public, anon, authenticated;

-- ─── Compact sparklines ──────────────────────────────────────────────────────
-- Outcomes in the list's own order (insertion, then label), with id last so the order is total.
create function public.market_sparks(p_market_ids uuid[], p_points integer default 24)
returns table (market_id uuid, outcome_ids uuid[], points jsonb)
language sql
stable
set search_path = ''
as $$
  with series as (
    select s.market_id, s.points
    from public.market_sparklines(p_market_ids, greatest(1, least(coalesce(p_points, 24), 24))) s
  ),
  outcomes as (
    select mo.market_id,
      array_agg(mo.id order by mo.created_at, mo.label, mo.id) as ids
    from public.market_outcomes mo
    join series s on s.market_id = mo.market_id
    group by mo.market_id
  )
  select s.market_id, o.ids,
    (
      select jsonb_agg(
        (
          select jsonb_agg(v order by k)
          from (
            select 0 as k, to_jsonb(floor(extract(epoch from (p.value ->> 't')::timestamptz))::bigint) as v
            union all
            select u.k, to_jsonb(round(coalesce((p.value -> 'shares' ->> u.id::text)::numeric, 0), 4)::double precision)
            from unnest(o.ids) with ordinality as u(id, k)
          ) cells
        )
        order by p.n
      )
      from jsonb_array_elements(s.points) with ordinality as p(value, n)
    )
  from series s
  join outcomes o on o.market_id = s.market_id
  order by s.market_id
$$;

revoke execute on function public.market_sparks(uuid[], integer) from public, anon;
grant execute on function public.market_sparks(uuid[], integer) to authenticated, service_role;

commit;
