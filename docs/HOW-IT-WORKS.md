# How DwellDuel works

DwellDuel is an invite-only app for a church friend group. Members bet
**Dwell Coin (DC)** on friendly questions ("Will the sermon run past
noon?") and earn DC by completing Bible-study tasks. DC is play money: it
can't be bought or cashed out.

This page explains the rules. For how the code implements them, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Getting in

- **Invites only.** An admin adds your Google email under Admin → Invites.
  Sign in with that Google account; any other account lands on a "not
  invited" page.
- **Everyone starts with 100 DC.** Every coin you gain or spend is a line
  in the ledger, so a balance can always be explained.

## Markets

Any member can create a market. It has a question, an optional
description and a closing time, and it comes in one of three kinds:

| Kind | Outcomes |
|---|---|
| **Yes/No** | Yes and No |
| **Multiple choice** | 2 to 6 outcomes you name |
| **Over/Under** | A number with a line ending in .5 (for example "Minutes the sermon runs, 42.5"). The outcomes are Over 42.5 and Under 42.5, and it can never tie. |

While a market is open, its creator (or an admin) can reword the title and
description. Everyone can see every past version under "Edited". The
outcomes, the closing time and the line can never change, because
changing them would change the bet.

## Betting: shared pools with a seed

DwellDuel uses **pari-mutuel** betting: every DC bet on a market goes into
one pot, and the people who picked the winner split it in proportion to
their stakes.

To give a brand-new market sensible odds, each outcome starts with a
**20 DC seed**: virtual money that counts toward the odds but belongs to
nobody. The house covers it when it's paid out.

For an outcome, with *S* the seed per outcome and *n* the number of
outcomes:

- **Chance** = (DC on this outcome + S) ÷ (all DC on the market + S × n)
- **Payout if it wins** = your stake × (all DC + S × n) ÷ (DC on the
  winning outcome + S), rounded down

**A worked example.** On a new Yes/No market, both sides show 50% and
2.00×. Then Alice bets 10 DC on Yes and Bob bets 30 DC on No.

- Yes: (10 + 20) ÷ (40 + 40) = **37.5%**. No: (30 + 20) ÷ 80 = **62.5%**.
- If Yes wins, Alice gets 10 × 80 ÷ 30 = **26 DC** (a 16 DC profit).
- If No wins, Bob gets 30 × 80 ÷ 50 = **48 DC** (an 18 DC profit).

Your payout isn't fixed when you bet. It moves as others bet, until the
market closes. The percentages, charts and "Pays ~" estimates all use the
same formula as the real payout.

- **Cancelling:** you can cancel a bet for a full refund until the market
  closes. Cancelled bets appear under My bets → Cancelled.
- **No winners:** if nobody bet on the winning outcome, everyone is
  refunded.

## The slip, solo bets and parlays

Every bet goes through the **slip**. Tap "Add to slip" on outcomes from
any number of markets, then open the slip to set stakes. Each pick is
either:

- **Solo:** a normal pool bet on that outcome.
- **Parlay:** combined with your other Parlay picks into one bet that
  wins only if every pick wins.

"Place" sends everything at once. If any single bet can't be placed, none
of them are.

**How parlays pay.** Each leg's odds are **locked when you place it**:
that outcome's payout multiplier at that moment, seed included.
Multiplying the legs gives the parlay's multiplier, and the payout is the
stake × the multiplier, rounded down.

- Between 2 and **10** legs, one per market, with the multiplier capped
  at **100×**.
- Example: two legs on new Yes/No markets are 2.00× each, so 4.00×. A
  5 DC parlay pays 20 DC if both win.
- It's lost as soon as one leg loses, and paid once every leg has won.
- A leg whose market is voided drops out, and the parlay continues on the
  rest. If every leg is voided, the stake is refunded.
- Parlays are paid by the house at their locked odds. They don't go into
  any market's pool, so they don't move a market's percentages (the same
  way Kalshi and Polymarket keep their "Combos" separate).

**My bets** shows your solo bets and parlays together, newest first, under
Open, Settled and Cancelled. Only you can see it. Everyone can see who
bet what on each market, and bets and parlays also appear in the feed.

## Results

- **Who resolves:** the market's creator, once it has closed, or an admin
  at any time. The resolver picks the winner (or, for an Over/Under,
  types the actual number) and **must say why**. They can attach photos,
  files or links as proof. The reason and proof show on the market page
  and in the feed.
- **Overrides:** an admin can change a result. The original payouts are
  taken back and the new winners paid. If a past winner has already spent
  their winnings, the override is blocked and names who, so an admin can
  sort out balances first.
- **Voids:** the creator or an admin can void an unresolved market, and
  every bet on it is refunded.

## Tasks

Admins keep a catalogue of Bible-study tasks, each with a DC reward.

- A task is **one-off** or **repeats** daily, weekly (ISO weeks, starting
  Monday), monthly or yearly. Periods are in UTC.
- You submit a task once per period, with an optional note. Some tasks
  **require proof**: a photo, file or link.
- A **reviewer** approves it, which pays the reward, or rejects it with a
  reason. After a rejection you can submit again.
- Your Home screen shows DC that's **Pending** review.

## Roles

| Role | Can also… |
|---|---|
| **Member** | Bet, create and resolve their own markets, submit tasks |
| **Reviewer** | Approve and reject task submissions |
| **Admin** | Invite people, manage tasks, resolve, override or void any market, view members and the full ledger |
| **Owner** (exactly one) | Adjust balances, grant and remove roles, and delete a market or task that hasn't been used |

## Around the app

- **Home:** your balance, rank, DC at stake and pending rewards, plus
  links to everything else.
- **Feed:** everyone's bets, parlays, new markets, results, wins and
  approved tasks, updated live.
- **Leaderboard and profiles:** ranks by balance. Tap your avatar (top
  right) for your profile, where Edit profile and Settings live.
- **Settings:** theme (System, Light or Dark), vibration on taps (Android),
  reduced animations, and sign out.
- **Install it:** add DwellDuel to your Home Screen for a full-screen app
  with a launch animation. It shows an offline page when you lose
  connection.
- **Feedback:** use "Send feedback" on Home.
