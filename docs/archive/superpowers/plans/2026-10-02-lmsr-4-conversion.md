# LMSR 4/5: Convert open markets at release and cut over (#335)

**Spec:** `docs/archive/superpowers/specs/2026-10-01-lmsr-pricing-design.md`, section 3 "Conversion
at release" and decision 9. Parts 1–3 (0101, 0102, 0104) gave us the LMSR functions, lmsr
markets for new creations, `place_slip_v3`/`v4`, fixed parlays and the parlay book.

**Goal:** one migration (`0105`) that converts every open pool market (closed-but-unresolved
included) and every pending pool parlay to fixed payouts without changing any member's
expected payout, chance shown or balance, and stops the build before #333 from betting.

## Constraints

- It runs against production on merge, before the app deploys, in one transaction.
- Additive only: new columns and functions, replacements with the same signatures. The pool
  code paths stay until clean-up (#332).
- The conversion is a function the migration calls, so a DB test can call it on a snapshot.

## Rules (decided here)

| Question | Rule |
|---|---|
| Starting price | `p_i = (pool_i + seed) / (total + seed·n)` (effectivePools); even when there is nothing at all; an outcome at 0 is floored at 0.1% so `ln` is finite (it still shows 0%). `q_i = 50·ln p_i`, shifted so `min q = 0` |
| A bet's shares | `pool_payout(amount, pool of its outcome, total)`, the exact "Pays ~"; `cost = amount` |
| Nobody backed the winner | Pool rules refunded every bet. A converted bet keeps that: it stores the outcomes nobody had backed at conversion (`bets.refund_outcomes`), and if one of them wins it's refunded its stake. Bets placed after conversion are LMSR bets as usual |
| `q_offset` | `q_i − Σ shares on outcome i` |
| Pending pool parlays | Unlocked legs lock at `pick_quote` now (a leg on a voided market stays as it is); every leg's `factor = locked_odds` (1 for a voided leg with none); `multiplier = least(Π factors of the legs still counting, max_multiplier)`; `payout = least(floor(stake × multiplier), greatest(max_payout, stake))`; `converted = true` |
| Their parlay-book shares | None. Pool parlays were house-paid and never moved a pool, so book shares would move today's chance, and the book is never paid |
| A converted parlay with a voided leg | `least(floor(stake × least(Π remaining, max_multiplier)), payout)`, which equals 0074's capped rule |
| Old builds | `place_slip_v2` (and `place_slip`, which wraps it) refuses "DwellDuel just updated. Refresh to bet." after replaying a finished attempt key |
| Creator's Void control | `can_void_market` mirrors `void_market`'s rules (0104: no void by a staked creator), and the page reads it as Resolve reads `can_resolve_market` |

## Database (`supabase/migrations/0105_lmsr_conversion.sql`)

| Object | Change |
|---|---|
| `bets` | `converted boolean`, `refund_outcomes uuid[]` |
| `parlays` | `converted boolean` |
| `convert_pool_markets_to_lmsr()` | The conversion; postgres only; refuses if a pool doesn't equal its live bets |
| `resolve_market_core` | lmsr branch: refunds converted bets whose `refund_outcomes` has the winner |
| `settle_parlay` | A converted parlay's voided-leg case keeps the pool caps |
| `market_sparklines` | A converted bet's point is the pool chance it showed then |
| `member_stats`, `member_records`, `leaderboard_awards` | A converted refund counts as refunded, not lost; best parlay keeps the cap |
| `place_slip_v2` | Refuses |
| `can_void_market` | New |

## App

- `list-my-bets.ts`, `position.ts`: a converted bet refunded on its outcome list shows "Refunded · no winners".
- `list-parlays.ts`, `get-parlay.ts`: a converted parlay shows its stored figures, capped.
- Market page: `canVoid` from `can_void_market`.
- Tests' helpers and DB tests that used `place_slip_v2` move to `place_slip_v4`.

## Tests

- `tests/db/lmsr-conversion.test.ts`: a real-shaped snapshot (binary, multi with seed, an
  unbacked outcome, over/under, closed-but-unresolved, no bets, resolved and voided pool markets,
  cancelled bets, pending parlays with locked, unlocked, pre-0074 and voided legs, a capped one).
  Records every "Pays ~", chance, balance and parlay payout first, converts, then checks them,
  and resolves every market to every outcome (override) comparing each resolution's ledger rows
  with the pool rules; wins and voids every parlay; the refund rule with a post-conversion bet;
  `place_slip_v2` refusal; sparkline history; the app readers.
- Ledger check: converted parlay legs carry a factor and no shares.
- Manual: reset to 0104, build the snapshot, apply 0105 with psql, verify.
