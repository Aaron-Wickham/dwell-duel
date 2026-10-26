-- Whether the caller may change a market's title now (MKT-5).
--
-- update_market (0073, 0106) refuses a new title once anyone but the creator has bet on the
-- market, solo or as a parlay leg, and refuses the whole edit with it. The market page asks this
-- first, so the edit dialog shows the title read-only and the rest of the edit still saves.
--
-- It mirrors update_market's rules for rewording: the creator (while invited) or an admin, while
-- the market is open and before its close, and nobody but the creator has bet on it.
--
-- Additive: one new function.
begin;
set local lock_timeout = '5s';

create function public.can_change_market_title(p_market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.markets m
    where m.id = p_market_id
      and m.status = 'open'
      and now() < m.close_at
      and (public.is_admin() or (m.created_by = auth.uid() and public.is_invited()))
      and not exists (
        select 1 from public.bets b where b.market_id = m.id and b.profile_id <> m.created_by
      )
      and not exists (
        select 1
        from public.parlay_legs l
        join public.parlays pa on pa.id = l.parlay_id
        where l.market_id = m.id and pa.profile_id <> m.created_by
      )
  )
$$;

revoke execute on function public.can_change_market_title(uuid) from public, anon;
grant execute on function public.can_change_market_title(uuid) to authenticated, service_role;

commit;
