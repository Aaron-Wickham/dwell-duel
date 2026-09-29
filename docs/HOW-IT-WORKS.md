<!-- The app renders this file as its How it works page (/how-it-works), so write it for
members. Links to other repo files show there as plain text. -->

# How DwellDuel works

DwellDuel is an invite-only app for a church friend group. Members bet
**Dwell Coin (DC)** on friendly questions ("Will the sermon run past
noon?") and earn DC by completing Bible-study tasks. DC is play money: it
can't be bought or cashed out.

This page explains the rules.

## Getting in

- **Invites only.** An admin adds your Google email under Admin → Invites.
  Only admins can see members' email addresses.
  Sign in with that Google account; any other account lands on a "not
  invited" page.
- **Everyone starts with 100 DC.** Every coin you gain or spend is a line
  in the ledger, so a balance can always be explained. Your own lines are
  under My bets → Coins.

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

The Markets page lists open markets **soonest to close first**, so one
closing within the hour is at the top. A market closing within a day
says so ("Closes in 2h"). Closed markets still waiting for a result are
grouped under Awaiting resolution, and resolved and voided markets
follow, newest first.

For a question that comes round every week, **Duplicate** on any market
opens Create market already filled in with its question, description,
kind and outcomes (or line). The closing time moves on by one or more
whole weeks, keeping the same local time, until it's in the future. Nothing is created until
you tap Create market, so you can change anything first.

**Share** sends a market's link through your phone's share sheet, or
copies it where there isn't one. Only signed-in members can open it.

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
any number of markets, then open the slip to set stakes. Type a stake,
or tap a quick stake: 5, 10, 25 or Max. Max is your balance less the
other stakes already in the slip, and a chip for more than that is
greyed out. Each pick is either:

- **Solo:** a normal pool bet on that outcome.
- **Parlay:** combined with your other Parlay picks into one bet that
  wins only if every pick wins.

"Place" sends everything at once. If any single bet can't be placed, none
of them are.

**How parlays pay.** Each leg's odds are **locked when you place it**:
that outcome's payout multiplier at that moment, seed included, **counting
everyone's money except your own** on that market. So you can't raise your
own parlay's odds by betting against it.
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

Its **Coins** tab is your coin history: every DC that came in or went
out, newest first, in plain words ("Won 26 DC on Will it rain?", "Task
reward: Read Ruth", "Refund: market voided"). It includes the reason for
any balance adjustment the owner made. Only you (and admins, through the
full ledger) can see it.

## Results

- **Who resolves:** once a market has closed, its creator or any
  reviewer, or an admin at any time. **Nobody but an admin resolves a
  market they have money on** (a bet or a parlay leg), so a creator who bet
  leaves it to a reviewer. Every market shows what its creator has riding
  on it ("Creator has 40 DC on Yes"), and so does its result in the feed. The resolver picks the winner (or, for an Over/Under,
  types the actual number) and **must say why**. They can attach photos,
  files or links as proof. The reason and proof show on the market page
  and in the feed. Before anything is paid, the app asks them to confirm,
  naming the winner ("Yes wins").
- **Reminders:** bettors' DC and parlays wait on a closed market until
  it's resolved, so Home shows **Markets to resolve** to whoever should
  do it. A creator sees their own closed markets as soon as they close
  (unless they have money on one). Reviewers and admins see any market
  still unresolved 48 hours after closing, and straight away one whose
  creator has money on it, since the creator can't resolve that one.
- **Overrides:** an admin can change a result. The original payouts are
  taken back and the new winners paid; the confirmation says so first. If a past winner has already spent
  their winnings, the override is blocked and names who, so an admin can
  sort out balances first.
- **Voids:** the creator or an admin can void an unresolved market, and
  every bet on it is refunded.

## Tasks

Admins keep a catalogue of Bible-study tasks, each with a DC reward.

- A task is **one-off** or **repeats** daily, weekly (ISO weeks, starting
  Monday), monthly or yearly. Periods run on US Eastern time, so a daily
  task resets at **midnight Eastern**, a weekly one at midnight going into
  Monday, and so on.
- You submit a task once per period, with an optional note. Some tasks
  **require proof**: a photo, file or link.
- A **reviewer** approves it, which pays the reward, or rejects it with a
  reason. After a rejection you can submit again. Nobody reviews their own
  submission, and a task can reward at most 500 DC.
- Your Home screen shows DC that's **Pending** review.
- **Streaks:** do a repeating task in back-to-back periods and its row
  shows your streak, like "🔥 5-week streak", from two in a row. Only
  approved submissions count: one waiting for review joins the streak
  once it's approved. The streak lasts until the end of the current
  period, so a daily streak survives today until midnight even if you
  haven't done today's yet; miss a whole period and it starts again.
  Streaks earn no extra DC.

## The leaderboard

- **Net worth** (the main board) ranks everyone by **balance plus the DC
  riding on open bets**: solo bets on markets that haven't resolved yet
  and parlays still pending. Placing a bet doesn't move you down; losing
  it does. Home and your profile show your rank on this board.
- **This month** ranks **net betting profit** for the calendar month, on
  Eastern time (America/New_York): winnings, refunds and cancelled-bet
  refunds, minus stakes, and minus any winnings an override took back.
  Starting grants, task rewards and balance adjustments don't count, so
  everyone starts each month level. Money counts **when it moves**: a
  stake placed this month on a market that resolves next month is a loss
  this month, and its winnings count next month. Only members who've bet
  or been paid this month appear.
- **Ties share a rank** on both boards ("1, 1, 3").
- **Monthly champion:** when a month ends, whoever finished it with the
  top profit is posted to the feed ("Alice was October's champion with
  +140 DC"). If two finish level, it goes to whoever reached that total
  first. A month where nobody bet, or nobody came out ahead, has no
  champion.

## Profile stats

Every member's profile has a **Stats** card, which any member can see:

- **Solo bets** and **Parlays:** how many settled bets were won, lost
  and refunded. A bet on a voided market, or on a market that resolved to
  an outcome nobody backed, counts as refunded. Cancelled bets, and bets
  still open or waiting to be resolved, don't count. After an override,
  a bet counts by the final result.
- **Net profit:** all-time net betting profit, worked out exactly as the
  This month board does, over every month. A stake counts when it's
  placed, so an open bet counts against it until it settles.
- **Biggest win:** the largest payout minus its stake on a single solo
  bet, with the market. A payout an override took back doesn't count.
- **Best parlay:** the won parlay with the highest multiplier (its winning
  legs' odds multiplied, up to the 100× cap), and what it paid.
- **Markets created** and **Tasks completed** (approved submissions only).

Until a member has a settled bet or parlay, the card says "No settled
bets yet." and shows only markets created and tasks completed.

## Reactions and comments

- **Reactions:** on any item in the feed or in a member's activity, tap
  🔥 🙏 😂 or 👏 to react, and tap it again to take it back. You can
  give each of the four once per item. Everyone sees the counts, and
  your own reactions are highlighted.
- **Comments:** every market has a short comment thread under its bets.
  A comment is up to 280 characters and shows its author and when it was
  posted, newest at the bottom. The latest 50 show first; "Show more"
  brings in older ones.
- **Deleting:** you can delete your own comments. Admins and the owner
  can delete anyone's, to keep the thread kind. A deleted comment is gone
  for everyone and can't be brought back. Reactions and comments move no
  DC.

## Notifications

DwellDuel can send notifications to your phone or computer, even when
the app is closed. They're off until you turn them on, under **Settings →
Notifications**, on each device you want them on. You choose what you
hear about, and your choices apply on every device:

| Notification | When | Starts |
|---|---|---|
| **Markets to resolve** | A market you made has closed and is waiting for you to resolve it (once per market, sent once a day) | On |
| **Results** | A market you bet on, solo or as a parlay leg, is resolved ("You won 26 DC", then the market and its result), changed by an override or voided | On |
| **Task reviews** | Your task submission is approved or rejected, with the reviewer's reason | On |
| **New markets** | Someone else creates a market | Off |

A parlay only pays once all its legs are settled, so if your only stake
in a market is a parlay leg, the notification just gives the result. A
cancelled bet gets no notification. Tapping a notification opens the
market or your tasks.

**On iPhone and iPad,** notifications only work once DwellDuel is on
your Home Screen (iOS 16.4 or later): tap Share, then Add to Home Screen,
open DwellDuel from there and turn them on in Settings. If you've blocked
notifications for DwellDuel, allow them again in your browser's or
phone's settings.

## Roles

| Role | Can also…
|---|---|
| **Member** | Bet, create and resolve their own markets, submit tasks |
| **Reviewer** | Approve and reject task submissions (not their own), and resolve closed markets they have no stake in |
| **Admin** | Invite people, manage tasks, resolve, override or void any market, delete any comment, view members and the full ledger |
| **Owner** (exactly one) | Adjust balances, grant and remove roles, and delete a market or task that hasn't been used |

## Around the app

- **Home:** your balance, rank, DC at stake and pending rewards, plus
  links to everything else. New members also get a **Getting started**
  card: add your photo, place your first bet and try a task. It goes away
  once you've done all three, or when you dismiss it.
- **Weekly recap:** on Sundays and Mondays (Eastern time), Home recaps
  the week, Monday to Sunday. On Sunday it's the week so far; on Monday
  it's the same week, finished. It shows your net betting profit for the
  week (counted like This month, when money moves) with task rewards
  apart; the **best call**, the week's biggest profit on a single solo
  bet; the **biggest upset**, the result whose winner had the lowest
  chance when the market closed (only an underdog, under 50%, on a market
  someone bet on); who had the **most tasks approved** (a tie goes to
  whoever got there first); and the markets closing in the week ahead.
  A line with nothing to report is left out, and a quiet week shows no
  recap at all.
- **Feed:** everyone's bets, parlays, new markets, results, wins,
  approved tasks and each month's champion, with their reactions, updated
  live. See [Reactions and comments](#reactions-and-comments).
- **Leaderboard and profiles:** see [The leaderboard](#the-leaderboard)
  and [Profile stats](#profile-stats).
  Tap your avatar (top right) for your profile, where Edit profile and
  Settings live.
- **Settings:** theme (System, Light or Dark), vibration on taps (Android),
  reduced animations, [notifications](#notifications), this How it works
  page, and sign out.
- **Install it:** add DwellDuel to your Home Screen for a full-screen app
  with a launch animation. It shows an offline page when you lose
  connection, and on iPhone and iPad it's how you get notifications.
- **Feedback:** use "Send feedback" on Home.
