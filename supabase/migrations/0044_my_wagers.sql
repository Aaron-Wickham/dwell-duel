-- My bets shows solo bets and parlays in one list (#34), paged together by
-- when each was placed. my_wagers is just the keys for that: kind-prefixed
-- ids ('bet:12', 'parlay:<uuid>'), who placed it, when, and which tab it
-- belongs on. The page reads a keyset page of it, then fetches the bets and
-- parlays it names.
--
-- A solo bet is open while its market is (including after close, awaiting a
-- result) and settled once the market resolves or is voided; a parlay is open
-- while pending. Cancelled bets aren't here: cancelled_bets pages on its own.
--
-- security_invoker, so the bets and parlays policies still decide what a
-- member can see. The page always filters to the member's own profile_id.
begin;
set local lock_timeout = '5s';

create view public.my_wagers
with (security_invoker = true)
as
select
  'bet:' || b.id as id,
  b.profile_id,
  b.created_at,
  case when m.status = 'open' then 'open' else 'settled' end as bucket
from public.bets b
join public.markets m on m.id = b.market_id

union all

select
  'parlay:' || p.id,
  p.profile_id,
  p.created_at,
  case when p.status = 'pending' then 'open' else 'settled' end
from public.parlays p;

revoke all on public.my_wagers from anon, authenticated;
grant select on public.my_wagers to authenticated;
grant select on public.my_wagers to service_role;

-- The parlays branch pages by profile and time, like bets_profile_created_idx.
create index parlays_profile_created_idx on public.parlays (profile_id, created_at desc);
drop index public.parlays_profile_id_idx;

commit;
