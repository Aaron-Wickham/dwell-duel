-- #262, #279: the market page's "Your position" card and its "riding in parlays" figure.
--
-- 1. my_market_position(market): the keys of the caller's own solo bets and parlays with a leg on
--    one market, oldest first, settled ones included. The page asks it before streaming, so it
--    renders the card (and its skeleton) only for a member with something on the market, then
--    reads the rows it names.
-- 2. market_parlay_riding(market): per outcome, the stakes of pending parlays with a leg on it. Each
--    parlay's whole stake counts on every pick it rides on. Display only: parlays are paid by
--    DwellDuel, not from the pool, so this never feeds odds, chance, charts or payouts. It returns
--    sums only, never which parlays or whose.
--
-- Both are security invoker: invited members can already read every bet, parlay and leg (0030,
-- 0033), and anyone else gets no rows. Additive: two new functions, nothing else changes.
--
-- One explicit transaction, like 0034-0074.
begin;
set local lock_timeout = '5s';

create function public.my_market_position(p_market_id uuid)
returns table (bet_id bigint, parlay_id uuid, created_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.id, null::uuid, b.created_at
  from public.bets b
  where b.market_id = p_market_id and b.profile_id = (select auth.uid())
  union all
  select null::bigint, pa.id, pa.created_at
  from public.parlay_legs l
  join public.parlays pa on pa.id = l.parlay_id
  where l.market_id = p_market_id and pa.profile_id = (select auth.uid())
  order by 3, 1, 2
$$;

revoke execute on function public.my_market_position(uuid) from public, anon;
grant execute on function public.my_market_position(uuid) to authenticated, service_role;

create function public.market_parlay_riding(p_market_id uuid)
returns table (outcome_id uuid, riding bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.outcome_id, sum(pa.stake)::bigint
  from public.parlay_legs l
  join public.parlays pa on pa.id = l.parlay_id
  where l.market_id = p_market_id and pa.status = 'pending'
  group by l.outcome_id
$$;

revoke execute on function public.market_parlay_riding(uuid) from public, anon;
grant execute on function public.market_parlay_riding(uuid) to authenticated, service_role;

commit;
