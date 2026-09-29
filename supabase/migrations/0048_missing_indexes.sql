-- #67: indexes the list, proof and ledger reads were scanning without (checked with EXPLAIN).

-- /markets: open, or resolved and voided, newest first (listOpenMarkets, listClosedMarkets and
-- countOpenMarkets).
create index markets_status_created_idx on public.markets (status, created_at desc, id desc);

-- A market's resolutions: the proof lookup and the market page's live filter.
create index market_resolutions_market_resolved_idx on public.market_resolutions (market_id, resolved_at desc);

-- A member's own coin history, and the ledger policy's profile_id check.
create index coin_transactions_profile_created_idx on public.coin_transactions (profile_id, created_at desc, id desc);

-- Foreign keys nothing indexed, so a delete or cascade on the parent scanned the child table.
create index parlay_legs_outcome_id_idx on public.parlay_legs (outcome_id);
create index markets_created_by_idx on public.markets (created_by);
create index market_resolutions_outcome_id_idx on public.market_resolutions (outcome_id);
create index idempotency_keys_profile_id_idx on public.idempotency_keys (profile_id);
