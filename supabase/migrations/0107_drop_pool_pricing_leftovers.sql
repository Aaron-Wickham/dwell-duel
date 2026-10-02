-- LMSR pricing, part 5 of 5 (#332, docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md,
-- "Clean-up"): drops what the pool rules left behind and nothing can reach any more. Since 0105 no
-- pool market is open and none can be made, so a pool bet can't be placed, cancelled or removed.
-- docs/superpowers/plans/2026-10-02-lmsr-5-cleanup.md has the full audit.
--
-- This applies while the previous build still serves, so it drops only what that build can't call:
-- - cancel_bet and remove_bet: that build shows Cancel and Remove only on an open pool market.
-- - refund_room: called only by those two.
-- - place_slip, place_slip_v2 and create_market, create_market_v2: they have refused since 0105.
-- - place_slip_v3: no build since #334 calls it.
-- - cancelled_bets' write limit (0090), and the bet_cancel limit itself: nothing inserts a
--   cancelled bet now.
--
-- Kept, because history or an admin override still reads them: cancelled_bets (My bets' Cancelled
-- tab), markets.seed_per_outcome (pool and converted markets' chance and charts),
-- parlay_legs.locked_odds, pool_payout and payout_seed (re-resolving a pool market), pick_quote and
-- parlay_leg_odds (an old parlay's unpriced legs), place_bet and place_parlay (place_slip_v4's pool
-- branch, which refuses because no pool market is open). pick_quotes stays until the previous
-- build, whose slip reads it, is gone.

begin;
set local lock_timeout = '5s';

drop function public.cancel_bet(bigint);
drop function public.remove_bet(bigint);
drop function public.refund_room(uuid, integer);

drop function public.place_slip(jsonb, uuid[], integer, uuid);
drop function public.place_slip_v2(jsonb, uuid[], integer, uuid);
drop function public.place_slip_v3(jsonb, uuid[], integer, uuid);

drop function public.create_market(text, text, text, text[], timestamptz, numeric);
drop function public.create_market_v2(text, text, text, text[], timestamptz, numeric, uuid);

drop trigger cancelled_bets_write_limit on public.cancelled_bets;

create or replace function public.write_limits()
returns table (action text, max_writes integer, window_seconds integer)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('market', 20, 86400),
    ('category', 20, 86400),
    ('comment', 10, 60),
    ('comment', 200, 86400),
    ('reaction', 60, 60),
    ('reaction', 1000, 86400),
    ('task_submission', 30, 86400)
  ) as l (action, max_writes, window_seconds)
$$;

delete from public.write_rate_counters where action = 'bet_cancel';

commit;
