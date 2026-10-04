# LMSR 5/5: drop retired pricing code (#332)

Part of #325. Spec: `docs/archive/superpowers/specs/2026-10-01-lmsr-pricing-design.md`.

Production has 0101–0106: every open market is `lmsr`, and no `pool` market can be
opened or created. Resolved and voided `pool` markets, their bets, parlays and
cancelled bets stay as history. This is a destructive migration that applies on merge,
while the previous build is still serving, so it drops only what is unreachable from
both that build and this one, and nothing history, overrides or charts read.

## Audit (live schema after `db:reset`, `pg_proc` bodies and the app)

| Candidate | Still referenced by | Decision |
| --- | --- | --- |
| `cancel_bet`, `remove_bet` | the previous build's Cancel / Remove controls, shown only on an open `pool` market (none exist) | drop, with the app code |
| `refund_room` | only `cancel_bet` / `remove_bet` | drop |
| `cancelled_bets_write_limit` trigger, `bet_cancel` write limit | only cancellations | drop the trigger, take `bet_cancel` out of `write_limits()` and `WRITE_LIMITS` |
| `cancelled_bets` table | My bets' Cancelled tab, `delete_market`, `my_onboarding` | keep (history), read-only |
| Pages' live follows of `cancelled_bets` | nothing writes it now | drop from `pageSubscriptions`; the table stays in the realtime publication, which the previous build still subscribes to |
| Your position's "Pays ~" and the pool note | only a live bet on a pool market | drop |
| `place_slip`, `place_slip_v2` | nothing; both refuse since 0105 | drop |
| `place_slip_v3` | nothing (the app calls `place_slip_v4`) | drop |
| `create_market`, `create_market_v2` | nothing; v2 refuses since 0105 | drop |
| `place_bet`, `place_parlay`, `parlay_max_payout` | `place_slip_v4`'s pool branch (refuses: no pool market is open), and the DB/e2e fixtures that build pool history | keep |
| `pick_quote` | `settle_parlay` (re-resolving a market with an old pool parlay leg), `parlay_leg_odds` | keep |
| `parlay_leg_odds` | My bets / parlay pages for an old parlay with an unpriced leg | keep |
| `pick_quotes` | the previous build's slip, on every read | keep for now; this build stops calling it (follow-up drop) |
| `pool_payout`, `payout_seed`, pool branch of `resolve_market_core` | an admin override of a resolved pool market | keep |
| `markets.seed_per_outcome`, `effectivePools`, `computeOdds` | chance, charts and sparklines of pool and converted markets (`market_sparklines`, `weekly_recap`) | keep |
| `parlay_legs.locked_odds` | historic and converted parlays, `settle_parlay`, awards, stats | keep |
| `convert_pool_markets_to_lmsr` | nothing live (no role can execute it); the DB tests that build converted markets | keep |
| `poolPayout`, `legOddsBp`, `combineOdds`, `potentialPayout`, `MAX_MULTIPLIER`, `MAX_PAYOUT`, `MAX_LEG_ODDS` | historic results, a resolved pool market's "× per DC", old parlays' caps and notes | keep |
| `soloPayout`, the slip's pool estimates, `LegBlock`, mixed-parlay note | only a pick on an open pool market | drop |
| `MIN_LEG_POOL`, `MIN_LEG_BETTORS` (TS) | only the slip's floor note | drop from TS; SQL `parlay_limits()` keeps them for `pick_quote` |
| `place-slip.ts`'s `parlay_leg_odds` fallback | only a newly placed pool parlay | drop |

## Tasks

1. Migration `0107_drop_pool_pricing_leftovers.sql`: the drops above, `write_limits()`
   without `bet_cancel`, and the stale `bet_cancel` counters. Regenerate types.
2. App: delete Cancel / Remove (`cancel-bet.ts`, both buttons, `removeBetAction`,
   `BetList`'s `canRemove`, the Cancel slots in Your position and My bets), the slip's
   pool path (`pick_quotes`, `soloPayout`, `legBlock`, pool parlay estimates) and the
   `parlay_leg_odds` fallback after placing.
3. Tests: delete tests of dropped functions and of open-pool-market behaviour; replace
   `cancel_bet` used as a fixture with `cancelBetForHistory` (the same rows, written
   directly); move `place_slip_v3` callers to `place_slip_v4`; e2e: delete
   `cancel-bet.spec.ts`, move the slip-driven specs onto LMSR markets.
4. Docs: AGENTS.md, ARCHITECTURE, HOW-IT-WORKS, CHANGELOG.
5. Verify: typecheck, lint, unit, DB suite twice, e2e.
