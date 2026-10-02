# LMSR 3/5: Parlays with split stakes and a fixed multiplier (#334)

**Spec:** `docs/superpowers/specs/2026-10-01-lmsr-pricing-design.md`, section 2 and the
parts of section 3 about parlays. Parts 1 and 2 (0101, 0102) gave us the LMSR functions,
the inert `parlay_legs.factor/shares` and `parlays.multiplier/payout` columns, `lmsr`
markets for new creations, `place_slip_v3` and a trigger refusing parlay legs on them.

**Goal:** a parlay on `lmsr` markets splits its stake evenly across its 2–6 legs; each
leg buys `S/n` DC of shares into the house parlay book, moving that market's price; the
multiplier (`Π factor_k`, `factor_k = shares_k / (S/n)`) and payout (`floor(S × multiplier)`)
are fixed and stored at placement. Pool parlays keep 0074's rules until #335 converts them.

## Constraints

- Additive migration (`0104`), applied while the #333 build still serves. That build calls
  `place_slip_v3`, which keeps refusing lmsr parlay legs (it has no payout to compare), so
  only the new `place_slip_v4` places an lmsr parlay.
- Never optimistic; retry-safe through the slip's attempt key (`claim_idempotency_key` /
  `finish_idempotent`, action `place_slip`).

## Database (`supabase/migrations/0104_lmsr_parlays.sql`)

| Object | Change |
|---|---|
| `parlay_limits()` | `max_legs` 10 → 6 for every parlay; the other columns stay for the pool path (`pick_quote`, `place_parlay`, `settle_parlay`) until #335/clean-up |
| `place_lmsr_parlay` (internal) | 2–6 legs, one per market, every market `lmsr`, open; buys `trunc(lmsr_buy(q, b, i, S/n), 6)` shares a leg into `market_outcomes.shares` (not `pool_total`, which stays DC of solo bets); `factor = greatest(1, trunc(shares·n/S, 6))`; `multiplier = Π factor` exactly; `payout = floor(S·multiplier)`; refuses `price_moved:<payout>` below 98% of the shown payout; stake at most 1,000,000 DC; payout under 1e9 |
| `place_slip_v4` | `place_slip_v3` plus `p_parlay_payout`; a parlay with any lmsr leg goes to `place_lmsr_parlay`, which refuses a mix |
| `place_parlay` | Refuses an lmsr leg itself ("DwellDuel just updated. Refresh to bet."), since the trigger goes |
| `parlay_legs` trigger | Replaced: an lmsr leg must carry `factor` and `shares`, a pool leg neither |
| `settle_parlay` | A fixed parlay (`multiplier is not null`): all won → `payout`; a voided leg drops out → `floor(S × Π remaining factors)`; all voided → stake back; never locks odds |
| `parlay_leg_odds` | Returns `factor` (known) for an lmsr leg |
| `member_stats`, `leaderboard_awards` | Best parlay: the stored multiplier (product of the remaining factors if a leg was voided), uncapped |
| `economy_flows` | A fixed parlay's flows go on the market maker line, not house parlays |
| `market_sparklines` | Parlay-book legs are points too, so the chart ends at the price; exp over double precision (carry-over) |
| `activity_feed` (oracle) | `bet_won` on lmsr is `floor(shares)` (carry-over) |

The book's shares stay in `market_outcomes.shares` for good, like bets' shares, so the
ledger rule is: each lmsr outcome's `shares` = Σ `bets.shares` + Σ `parlay_legs.shares`.

## App

- `lib/parlays/odds.ts`: `MAX_PICKS = 6`; `fixedParlay(stake, factors)` (BigInt, micro-units).
- `lib/markets/pricing.ts`: `lmsrParlayQuote(legs, stake)` mirroring `place_lmsr_parlay`.
- `get-slip.ts`: lmsr picks no longer blocked as legs.
- `slip-panel.tsx`: an lmsr parlay shows "Pays N DC (M×)" exactly and sends `parlay_payout`;
  a mixed parlay is blocked with a note; stale price-moved messages clear when the stake changes.
- `place-slip.ts`: `place_slip_v4`; parlay `price_moved`; the placed toast reads the stored figures.
- `list-parlays.ts`, `get-parlay.ts`, parlay page and card: fixed parlays show exact figures.

## Tests

- DB (`tests/db/lmsr-parlays.test.ts`): placement figures vs the TS mirror, prices moved by
  S/n a leg, re-price refusal, win/lose/void-leg/one-left/all-void, override, mixed refusal,
  6-leg limit, own market allowed, retry replay, economy line, best-parlay award, sparkline.
- `assertLedgerConsistent`: the new shares rule; lmsr bets have shares and cost = amount;
  pool outcomes hold no shares; lmsr legs carry factor and shares.
- activity_events equivalence: an lmsr scenario. Admin override on an lmsr market (carry-over).
- Unit: `fixedParlay`, `lmsrParlayQuote`, slip errors, place-slip action.
- E2e: the slip shows a parlay's exact payout with no `~`.
