alter table public.markets enable row level security;
alter table public.market_outcomes enable row level security;
alter table public.bets enable row level security;
alter table public.market_resolutions enable row level security;

grant select on public.markets to authenticated;
grant select on public.market_outcomes to authenticated;
grant select on public.bets to authenticated;
grant select on public.market_resolutions to authenticated;

create policy select_markets on public.markets for select to authenticated
  using (is_invited());
create policy select_market_outcomes on public.market_outcomes for select to authenticated
  using (is_invited());
create policy select_own_or_admin_bets on public.bets for select to authenticated
  using (profile_id = auth.uid() or is_admin());
create policy select_market_resolutions on public.market_resolutions for select to authenticated
  using (is_invited());
