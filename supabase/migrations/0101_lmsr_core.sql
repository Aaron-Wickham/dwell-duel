-- LMSR pricing, part 1 of 5 (#325, docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md).
-- Additive and inert: every existing market stays pricing = 'pool', and nothing calls the
-- functions yet. lib/markets/lmsr.ts mirrors them; tests/db/lmsr.test.ts keeps the two equal.

alter table public.markets
  add column liquidity numeric not null default 50 check (liquidity > 0),
  add column pricing text not null default 'pool' check (pricing in ('pool', 'lmsr'));

-- shares is what bets and the parlay book hold; the market maker prices on shares + q_offset,
-- which is non-zero only for a market converted from a pool (part 4).
alter table public.market_outcomes
  add column shares numeric not null default 0 check (shares >= 0),
  add column q_offset numeric not null default 0;

alter table public.bets
  add column shares numeric check (shares > 0),
  add column cost integer check (cost > 0);

alter table public.parlay_legs
  add column factor numeric check (factor >= 1),
  add column shares numeric check (shares > 0);

alter table public.parlays
  add column multiplier numeric check (multiplier >= 1),
  add column payout integer check (payout >= 0);

-- Every function shifts by m = max(q)/b so exp never overflows on a large share count.
create function public.lmsr_cost(p_q numeric[], p_b numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  m numeric;
begin
  if coalesce(cardinality(p_q), 0) = 0 then
    raise exception 'a market needs at least one outcome' using errcode = '22023';
  end if;
  if p_b is null or p_b <= 0 then
    raise exception 'liquidity must be positive' using errcode = '22023';
  end if;
  select max(x) / p_b into m from unnest(p_q) x;
  return p_b * (m + ln((select sum(exp(x / p_b - m)) from unnest(p_q) x)));
end;
$$;

create function public.lmsr_price(p_q numeric[], p_b numeric, p_outcome integer)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  m numeric;
begin
  if coalesce(cardinality(p_q), 0) = 0 then
    raise exception 'a market needs at least one outcome' using errcode = '22023';
  end if;
  if p_b is null or p_b <= 0 then
    raise exception 'liquidity must be positive' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome < 1 or p_outcome > cardinality(p_q) then
    raise exception 'no such outcome' using errcode = '22023';
  end if;
  select max(x) / p_b into m from unnest(p_q) x;
  return exp(p_q[p_outcome] / p_b - m) / (select sum(exp(x / p_b - m)) from unnest(p_q) x);
end;
$$;

-- The exact shares s with lmsr_cost(q + s at p_outcome) - lmsr_cost(q) = p_spend.
create function public.lmsr_buy(p_q numeric[], p_b numeric, p_outcome integer, p_spend numeric)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  m numeric;
  total numeric;
begin
  if coalesce(cardinality(p_q), 0) = 0 then
    raise exception 'a market needs at least one outcome' using errcode = '22023';
  end if;
  if p_b is null or p_b <= 0 then
    raise exception 'liquidity must be positive' using errcode = '22023';
  end if;
  if p_outcome is null or p_outcome < 1 or p_outcome > cardinality(p_q) then
    raise exception 'no such outcome' using errcode = '22023';
  end if;
  if p_spend is null or p_spend < 0 then
    raise exception 'spend must not be negative' using errcode = '22023';
  end if;
  select max(x) / p_b into m from unnest(p_q) x;
  select sum(exp(x / p_b - m)) into total from unnest(p_q) x;
  return p_b * (m + ln(total * (exp(p_spend / p_b) - 1) + exp(p_q[p_outcome] / p_b - m))) - p_q[p_outcome];
end;
$$;

revoke execute on function public.lmsr_cost(numeric[], numeric) from public, anon;
revoke execute on function public.lmsr_price(numeric[], numeric, integer) from public, anon;
revoke execute on function public.lmsr_buy(numeric[], numeric, integer, numeric) from public, anon;
grant execute on function public.lmsr_cost(numeric[], numeric) to authenticated, service_role;
grant execute on function public.lmsr_price(numeric[], numeric, integer) to authenticated, service_role;
grant execute on function public.lmsr_buy(numeric[], numeric, integer, numeric) to authenticated, service_role;
