# LMSR release leftovers (#345)

Follow-up to #325 (PRs #336–#344). One migration, `0108_lmsr_leftovers.sql`, plus client and docs.

## Audit (before dropping anything)

- `pick_quotes`: no caller in `lib/`, `app/`, `components/` on main; after `db:reset`, no function
  body in `pg_proc` names it (`prosrc ilike '%pick_quotes%'`) other than itself. Only the DB tests
  call it. The build before 0107 is gone, so the drop is safe while main's build serves.
- `cancelled_bets`: `LIVE_TABLES` lists it but no `pageSubscriptions` entry follows it, so leaving
  the publication changes nothing for the build serving during the deploy. The table stays (My
  bets' Cancelled tab, bet history).
- `enforce_write_limit`'s `bet_cancel` message: 0107 dropped the limit and the trigger, so the
  branch can't run.

## Tasks

1. Migration 0108, in one transaction with `set local lock_timeout`:
   - `drop function public.pick_quotes(uuid[])`.
   - `create or replace function public.enforce_write_limit()` without the `bet_cancel` branch.
   - Drop `cancelled_bets` from `supabase_realtime` (guarded like 0098).
   - Live category changes (0103): a plain row trigger on `market_categories` calling
     `live_ping_trigger('markets')`, so every page following the `markets` topic (the list, Home,
     My bets, the leaderboard, a parlay) re-reads after a rename, hide or merge. No new topic, so
     no `live_pings` row or `realtime.messages` policy change.
   - Add `market_categories` to the publication: the market page follows only its own rows, so it
     follows its own category row (`id=eq.<category id>`) for a rename or hide. A merge moves the
     market's `category_id`, which the page's `markets` row already hears.
2. Client: `LIVE_TABLES` drops `cancelled_bets`, gains `market_categories`;
   `pageSubscriptions.marketDetail` takes the category id; `getMarket` selects it.
3. Tests: DB (publication contents; a rename, hide and merge each ping `markets`; `pick_quotes`
   gone and nothing in `pg_proc` names it; parlay-pricing tests read `pick_quote` through the
   service client); unit (`page-subscriptions` exact declaration); schema-privileges list.
4. Docs: ARCHITECTURE migration row and live-updates paragraph, AGENTS.md's `pick_quotes` line,
   CHANGELOG under `## Unreleased`.
