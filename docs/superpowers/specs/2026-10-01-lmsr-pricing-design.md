# Market pricing: LMSR, fixed payouts at placement (#325)

Status: approved design, 2026-10-01. Replaces pari-mutuel pools, the
virtual seed and odds-at-close for parlays.

## Why

- A parlay leg's odds are set when its market closes (0074), so a member
  doesn't know what a parlay pays when they place it.
- Parlays are capped (`parlay_limits()`), only because house-paid parlays
  mint DC.
- The seed counts toward chance but not payout, so chance and payout
  disagree.

House losses are acceptable (decided by Aaron). Pump-style cheating is a
low concern in this group.

## Decisions

| # | Question | Decision |
|---|---|---|
| 1 | What does a member know when betting? | The exact payout, fixed at placement, for solo bets and parlays alike |
| 2 | Cancel / cash out | Neither. Bets are final once placed |
| 3 | Who funds liquidity | The house, a fixed amount per market |
| 4 | Starting odds | Even across outcomes. The creator isn't required to bet |
| 5 | Pump defence | None needed: without cash-out, pumping costs real DC and risk |
| 6 | Do parlays move market prices? | Yes |
| 7 | How much does each leg buy? | The stake split evenly across legs |
| 8 | Parlay limits | 2–6 legs, one pick per market, nothing else |
| 9 | Open markets at release | Converted, and nobody's expected payout changes |
| 10 | Liquidity level | b = 50 for every market, stored per market |

## 1. Markets and solo bets

### Pricing

Each market runs a logarithmic market scoring rule (LMSR) market maker.

- **State:** `q_i` is the shares outstanding for outcome *i*.
- **Liquidity:** `b = markets.liquidity`, default 50.
- **Cost function:** `C(q) = b · ln Σ exp(q_i / b)`.
- **Price (= chance):** `p_i = exp(q_i / b) / Σ exp(q_j / b)`.
- **Buying:** spending `x` DC on outcome *i* buys the `s` shares that
  satisfy `C(q + s·e_i) − C(q) = x`. Solved in closed form:
  `s = b · ln( (exp(x/b) · Σ exp(q_j/b) − Σ_{j≠i} exp(q_j/b)) / exp(q_i/b) )`.
- **Overflow:** computed with log-sum-exp (subtract `max q / b`), so large
  share counts can't overflow.
- **Opening state:** a new market opens with all `q_i = 0`, so its
  outcomes start at even prices (50/50, 25% each and so on). The creator
  is not required to bet.
- **Over/under markets:** the same, with two outcomes.
- **Display:** the price is the chance. Charts, sparklines,
  `market_sparklines` and the slip all read one number.
  `effectivePools`, `poolPayout`, `soloPayout`, `pool_payout()` and the
  seed retire for `lmsr` markets.
- **Worst-case house loss** on a fresh market is `b · ln(n)`, about 35 DC
  for a two-outcome market. It's accepted.

### Placing a bet

- A bet records `cost` (the DC spent) and `shares`. A share pays 1 DC if
  its outcome wins.
- The slip shows the exact shares and payout ("Pays 18.3 DC"), with no `~`.
- **Re-price:** the client sends the payout it showed. If the server's
  payout at commit is more than 2% lower, the action refuses with
  `price_moved` and the new figure. The slip shows it and asks the member
  to confirm again. Placing stays never-optimistic and retry-safe
  (attempt keys, `claim_idempotency_key` / `finish_idempotent`).
- Existing minimum-stake and balance checks are unchanged.

### Bets are final

- `cancel_bet` and `remove_bet` refuse for `lmsr` markets, and the UI
  removes the Cancel control.
- My bets' Cancelled tab stays as history of earlier cancellations.
- The slip's confirmation says "Bets are final".

### Resolving

- Each winning share pays 1 DC. A payout is `floor(shares)` DC, and the
  remainder goes to the existing payout-rounding line.
- The economy summary replaces "seed payouts" and "house parlays" with a
  single "market maker" line: the house's net result per resolved market.

### Voiding

A voided market refunds every bettor their `cost`.

## 2. Parlays

### Limits

- 2–6 legs, at most one pick per market.
- `parlay_limits()` keeps only the leg bounds.
- `MAX_MULTIPLIER`, `MAX_PAYOUT`, `MIN_LEG_*` and `MAX_LEG_ODDS`, and their
  DB equality test, are removed. `MAX_PICKS` becomes 6.

### Placing

For a parlay with stake `S` and `n` legs:

1. **Buying:** each leg buys `S / n` DC of shares on its outcome through
   that market's LMSR, so the parlay moves each market's price.
2. **Ownership:** those shares belong to the **house parlay book**, an
   internal holder that members never see. It settles at resolution like
   any holder and its result feeds the "market maker" economy line.
3. **Leg factor:** `factor_k = 1 / avg_price_k`, where
   `avg_price_k = (S/n) / shares_k`.
4. **Multiplier and payout:** `multiplier = Π factor_k`, and
   `payout = floor(S × multiplier)`. Both are fixed at placement and
   stored.

The slip shows the exact figure ("Pays 52.4 DC (5.24×)"). The 2% re-price
rule applies to the parlay's total payout.

`pick_quote`, `locked_odds` and settle-at-close (0074) retire for parlays
placed on `lmsr` markets.

### Settling

- **Every leg wins:** the house pays `payout`.
- **Any leg loses:** the parlay pays nothing.
- **A leg's market is voided:** the leg drops out, and the multiplier
  becomes the product of the remaining factors.
  - With one leg left, the parlay pays at that leg's factor.
  - With every leg voided, the stake is refunded.

### Display

- The "riding in parlays" figure (#279) stays. HOW-IT-WORKS now says
  parlays do move odds.
- The best-parlay award uses the stored multiplier.

## 3. Data, release and delivery

### Data model (additive)

**`markets`:**
- `liquidity numeric not null default 50`
- `pricing text not null default 'lmsr' check (pricing in ('pool','lmsr'))`

Every money function branches on `pricing`.

**`market_outcomes`** (the "pools"): one row per outcome, plus `shares numeric` (the shares held by bets and the parlay book) and
`q_offset numeric default 0`. The market maker's state is
`q_i = shares + q_offset`; only converted markets have a non-zero offset. The
existing DC column stays for `pool` markets until clean-up.

**`bets`:** `shares numeric`, `cost integer`.

**Parlays:**
- Each leg gains `factor numeric`.
- The parlay gains `multiplier numeric` and `payout integer`.
- Parlay-book holdings are stored per leg (`shares`), owned by no member.

**Functions:**
- **SQL:** `lmsr_cost`, `lmsr_price`, `lmsr_buy` (pure), mirrored in
  `lib/markets/lmsr.ts`. A DB test keeps the two equal.
- **New action:** `place_slip_v3`.

**Ledger:** `apply_coin_transaction` gains kinds for market-maker payouts
and parlay-book settlement as needed.

### Conversion at release

For every market with `status = 'open'`, including closed-but-unresolved
markets:

1. Set `pricing = 'lmsr'`, `liquidity = 50`, and choose `q` so that `p_i`
   equals the current displayed chance (`effectivePools`):
   `q_i = b · ln(p_i)`, shifted so `min q = 0`. Store `q_offset = q_i − shares`
   once step 2 has set the shares.
2. Each live bet gets `shares` equal to its current `poolPayout` (its
   "Pays ~" figure) and `cost` equal to its stake. What members saw as an
   estimate becomes a guarantee.
3. Each pending parlay's unlocked legs lock at their current
   `pick_quote`, and the parlay stores its fixed `multiplier` and
   `payout`. Legs already locked keep their odds.
4. On converted markets the `b · ln(n)` loss bound doesn't hold, because
   those shares weren't bought through the market maker. This is
   accepted.
5. `place_slip_v2` refuses with "DwellDuel just updated. Refresh to bet."
   The migration applies before the new app deploys, so this stops the old
   app writing pool-style bets into converted markets.

### Delivery

Each item gets its own issue under #325 and its own PR, in this order:

1. **The LMSR core:** SQL functions, the TS mirror, the new columns, and
   equality tests. No behaviour change.
2. **New-market pricing:** create, solo bets via `place_slip_v3`, exact
   slip payouts, the 2% re-price, resolve and void, the economy summary,
   and removing Cancel for `lmsr` markets.
3. **Parlays:** split stakes, the parlay book, fixed multipliers, the
   void rule, and 6 legs.
4. **Conversion and cutover:**
   - the conversion migration and the `place_slip_v2` refusal
   - a HOW-IT-WORKS rewrite
   - AGENTS.md's economy bullets ("The seed is for display…", parlay limits)
   - `docs/ARCHITECTURE.md` and the CHANGELOG
5. **Clean-up** (after release): drop `cancel_bet`, `remove_bet`,
   `pick_quote`, the seed columns and functions, and the pool payout code.

### Testing

- `assertLedgerConsistent`: "pools equal live bets" becomes "each
  outcome's `shares` equals the shares held by bets plus the parlay book".
  Balances still equal the ledger.
- **DB tests:** pricing against the TS mirror, re-price refusal, bets are
  final, void refunds, a parlay with a voided leg, the 6-leg limit,
  conversion on a real-shaped snapshot (payouts unchanged), and the
  `place_slip_v2` refusal.
- **E2e:** the slip shows exact payouts with no `~`, and placing confirms
  "Bets are final".

## Effect on other issues

- **#326 (reopen markets):** nothing is set at close any more, so
  reopening only moves `close_at` and re-arms the closing alert.
- **#57 (pump and cancel):** this exploit no longer applies, because there
  is no cancel.

## Free tiers

The LMSR maths is a few `exp`/`ln` calls per bet inside existing RPCs.
There's no new cron, function or realtime channel.
