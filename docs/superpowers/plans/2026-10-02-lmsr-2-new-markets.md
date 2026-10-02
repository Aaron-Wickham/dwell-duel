# LMSR 2/5: New markets priced by LMSR (#333)

**Spec:** `docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md`, section 1 and the
parts of section 3 for delivery item 2. Part 1 (#331, 0101) gave us `lmsr_cost`,
`lmsr_price`, `lmsr_buy`, `lib/markets/lmsr.ts` and the inert columns.

**Goal:** every market created from now on is `pricing = 'lmsr'`: it opens at even
prices, a solo bet buys shares at a payout fixed when it's placed, bets are final,
and resolving pays 1 DC a share. Existing `pool` markets behave exactly as before.
Parlays stay on pool rules until #334, and conversion is #335.

## Constraints

- Additive migration (`0102`), applied before the new app deploys, while the old app
  still serves. So the old `create_market_v2` keeps making `pool` markets (it must:
  the old build would write pool-style bets into an `lmsr` market), and the new
  `create_market_v3` sets `pricing = 'lmsr'` explicitly. The column default stays.
- The old build's `place_slip_v2` -> `place_bet` refuses an `lmsr` market ("DwellDuel
  just updated. Refresh to bet."), so a cached old client can't write a pool bet into one.
- Never optimistic; retry-safe through the existing attempt key.

## Database (`supabase/migrations/0102_lmsr_new_markets.sql`)

| Object | Change |
|---|---|
| `create_market_v3` | v2's body plus `pricing = 'lmsr'`, `seed_per_outcome = 0`; same `create_market` idempotency action |
| `place_lmsr_bet` (internal) | Locks the market, buys `lmsr_buy(shares + q_offset, liquidity, i, stake)` shares (stored to 6 places, rounded down), refuses `price_moved:<payout>` when `floor(shares)` is more than 2% under the payout the slip showed, debits `cost`, writes `bets.cost/shares`, adds to `market_outcomes.shares` and `pool_total` (DC staked, still what `delete_market`, the ledger check and "at stake" read). Stake at most 1,000,000 DC |
| `place_slip_v3` | v2 with `p_singles[].payout`; an `lmsr` pick goes through `place_lmsr_bet`, a `pool` pick through `place_bet` |
| `place_bet` | Refuses `lmsr` markets |
| parlay legs | A `before insert` trigger on `parlay_legs` refuses a leg on an `lmsr` market until #334 |
| `cancel_bet`, `remove_bet` | Refuse `lmsr` markets: bets are final |
| `pool_version` trigger | Also fires on a change to `shares` |
| `resolve_market_core` | `lmsr`: each winning bet gets `floor(shares)`, no "no winners" refund; `market_resolutions.payout_remainder` keeps the fractions |
| `void_market` | Unchanged: it refunds `bets.amount`, which is the cost |
| `market_sparklines` | `lmsr`: the LMSR price of the running shares + `q_offset` |
| `economy_flows`, `economy_summary` | One "market maker" line for `lmsr` results; the remainder goes to payout rounding |
| `member_stats`, `member_records`, `leaderboard_awards`, `weekly_recap` | No "no winners" refund on `lmsr`; the upset's chance is the LMSR price |

## App

- `lib/markets/chance.ts`: `outcomeChances(market)` — LMSR price or seeded pools.
  Market page, cards, sparkline start and create preview use it.
- `get-market`, `list-markets`: read `pricing`, `liquidity`, `shares`, `q_offset`.
- Slip: `SlipPick` carries `pricing`, `q`, `liquidity`; an `lmsr` Solo pick shows
  "Pays N DC if it wins" (exact, `lmsrPayout`), sends `payout:<id>`; an `lmsr` pick
  can't be a parlay leg (`legBlock: 'lmsr'`); the slip says "Bets are final" and
  shows a `price_moved` refusal with the new figure, then Place confirms again.
- `place-slip.ts` calls `place_slip_v3`; `slip-errors.ts` parses `price_moved`.
- Position card, My bets, bet list: `lmsr` bets show "Pays N DC" (no `~`) and no Cancel.
- Economy panel: "Market maker" line.

## Tests

- `tests/lib/markets/chance.test.ts`, `tests/lib/parlays/slip-errors.test.ts`, slip and
  economy unit tests updated.
- `tests/db/lmsr-markets.test.ts`: create (lmsr, even prices), buy (shares = `lmsr_buy`,
  ledger), re-price refusal and accept, bets final, resolve floor payouts + remainder,
  void refunds cost, economy line, sparklines, `place_slip_v2` refusal, parlay leg refusal,
  pool markets unchanged.
- `assertLedgerConsistent`: an `lmsr` outcome's `shares` equal its bets' shares.
- e2e: the slip shows an exact payout, no `~`, and "Bets are final".

## Docs

HOW-IT-WORKS (new markets, the spec's worked example), ARCHITECTURE, AGENTS.md economy
bullets, CHANGELOG.
