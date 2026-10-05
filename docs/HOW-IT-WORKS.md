<!-- The app renders this file as its How it works page (/how-it-works), so write it for
members. Links to other repo files show there as plain text. -->

# How DwellDuel works

DwellDuel is an invite-only app for a church friend group. Members bet
**Dwell Coin (DC)** on friendly questions ("Will the sermon run past
noon?") and earn DC by completing Bible-study tasks. DC is play money: it
can't be bought or cashed out.

This page explains the rules.

## The short version

- Dwell Coin (DC) is play money. You start with 100 DC.
- Bet DC on friendly questions. The slip tells you exactly what a bet pays
  if it wins, and that never changes. Bets are final.
- A parlay joins 2–6 picks. It pays big, but only if every pick wins, and
  what it pays is fixed when you place it too.
- Run low? Earn more DC with Bible-study tasks.

## Getting in

- **Invites only.** An admin adds your Google email under Admin → Invites.
  Only admins can see members' email addresses. An admin can take back an
  invite nobody has used yet; once someone has signed in with it, only the
  owner can remove them (see [Roles](#roles)).
  Sign in with that Google account; any other account lands on a "not
  invited" page, which says which account you used. Google always asks
  which account to use, so "Try another account" there lets you pick a
  different one. What Google shared about an account that wasn't invited
  (name, email, picture) is deleted the next day.
- **Links survive signing in.** Open a shared market link while signed
  out, and after signing in you land on that market, not Home.
- **Everyone starts with 100 DC.** Every coin you gain or spend is a line
  in the ledger, so a balance can always be explained. Your own lines are
  under My bets → Coins.

## Markets

Any member can create a market. It has a question, a kind, a closing
time, a category and optional details, and it comes in one of three
kinds:

| Kind | Outcomes |
|---|---|
| **Yes/No** | Yes and No |
| **Multiple choice** | 2 to 6 outcomes you name |
| **Over/Under** | A number with a line ending in .5 (for example "Minutes the sermon runs, 42.5"). The outcomes are Over 42.5 and Under 42.5, and it can never tie. |

**Categories.** Every market has exactly one category, such as Sports or
Bible Study. Pick one of the suggestions as you type, tap one of the six
most used, or type a new one (up to 24 characters): a name that differs
only in capitals or spacing from an existing category is that category.
Markets made before categories, and any made from an older version of the
app, are in **Other**. An admin can rename, merge or hide categories; a
hidden or merged-away one drops out of the suggestions and chips, and
typing its name for a market brings it back.

While a market is open, its creator (or an admin) can edit the
description and the category, and can reword the title until someone else
has bet on it, solo or as a parlay pick. An admin can change a market's
category at any time, even after it closes. Everyone can see every past
version under Edit history, in the market's More actions menu (the ⋯
button at its top right, beside Share and Duplicate). The outcomes and
the line can never change,
because changing them would change the bet. Betting stops at the closing
time, so set it before the answer is known, and if you bet on your own
market, a reviewer resolves it (see [Results](#results)).

The creator (or an admin) can also move the closing time, later or
earlier, as long as the new time is still to come. Once a market has
closed, and until it's resolved or voided, the same people can
**reopen** it by giving it a new closing time: it takes bets again until
then. Only reopen a market whose result isn't known yet. A creator who
has money on their own market, a bet or a parlay pick, can't move its
closing time; an admin can. Bets already placed stay exactly as they are, since every payout
and parlay multiplier is fixed when it's placed. Only an admin can
resolve a reopened market before it closes again, and its creator and
admins are reminded about it again when it does. Every move shows in
Edit history.

The Markets page has three tabs: **Open** (the default: still taking
bets, **soonest to close first**, so one closing within the hour is at
the top), **Waiting** (past the close time, waiting for a result, oldest
close first) and **Resolved** (has a result, most recently settled first;
voided markets are here too, in their own group). Each card shows the
leading outcome's chance (Yes, or Over, on a two-outcome market; the
favourite of several), how many points it moved this week, a small chart,
and when it closes ("Closes in 2h" within a day) with how many bets it
has. A resolved card says who won ("Yes won"). When more than one category
holds markets, chips under the tabs narrow the list to one: **All**, then
the eight busiest categories (the most markets still taking bets), then
**More…** for the rest. The choices are in the page's address, so a reload
or a shared link keeps them.

A yes/no chart draws one line, Yes's chance (an over/under draws Over's):
No is the same line read from the top. A multiple-choice chart draws a
line per outcome.

For a question that comes round every week, **Duplicate** (in any
market's More actions menu) opens Create market already filled in with its question, description,
category, kind and outcomes (or line). The closing time moves on by one or more
whole weeks, keeping the same local time, until it's in the future. Nothing is created until
you tap Create market, so you can change anything first.

**Share** (in the same menu) sends a market's link through your phone's
share sheet, or copies it where there isn't one. Only signed-in members can open it.

## Betting: fixed payouts

Every market is run by a **market maker**: the house sells **shares** in
each outcome, and each share of the winning outcome pays **1 DC**. When you
bet, you buy shares at the current price, so you know exactly what your bet
pays before you place it, and nothing anyone does afterwards changes it.

- **A market opens at even odds:** 50% / 50% for Yes/No, 25% each for
  four outcomes. Nobody has to bet first.
- **The price is the chance.** Buying an outcome's shares raises its price
  (and lowers the others'), so the chance, the market page's chart and the
  card's chart all show the same number. A bigger bet moves the price more, so each extra
  DC buys a little less.
- **The slip shows the exact payout** ("Pays 18 DC if it wins"), with no
  "~". Each outcome on a market page shows the same figure for 10 DC
  ("10 DC wins 18"), worked out exactly as the slip does. If the price moves between showing it and placing it, so that your bet
  would pay more than 2% less, nothing is placed: the slip says what it
  pays now, and you tap Place again to accept.
- **Bets are final.** A bet can't be cancelled, and the owner can't remove
  it. (That's what makes the payout fixed.) My bets → Cancelled still lists
  bets cancelled before October 2026, when that was allowed.
- **Parlays pay a fixed amount too.** Your stake is split across the
  picks, and what the parlay pays is set when you place it. See "How
  parlays pay" below.

### The maths

- Each outcome has some number of shares sold, *q*. The house's
  liquidity, *b*, is **50** for every market.
- **Chance (price)** of an outcome = e^(*q* ÷ *b*) for that outcome ÷ the
  sum of e^(*q* ÷ *b*) over every outcome.
- **Buying:** spending *x* DC on an outcome buys the shares that raise
  the market's total cost, *b* × ln(the sum of e^(*q* ÷ *b*)), by exactly
  *x*. You always get at least one share per DC.
- **Payout if it wins** = your shares, rounded down to whole DC. The
  fractions rounded away count as payout rounding in the owner's economy
  panel.

**A worked example.** On a new Yes/No market, both sides show 50%. Alice
bets 10 DC on Yes. That buys **18.33 shares**, so the slip says "Pays 18 DC
if it wins", and Yes moves to about **59%**. If Yes wins, Alice gets
**18 DC** (an 8 DC profit), whatever anyone bets after her. If No wins, she
gets nothing: the house took the other side of her bet. Nobody is refunded
when nobody backed the winner (bets from before October 2026 aside: see
below).

**The house** pays winners out of what it sold shares for. On a new
two-outcome market it can lose at most about 35 DC (*b* × ln 2), however
people bet on it solo; the owner's economy panel shows its result as the
**market maker** line. Parlays are the house's too: it keeps a lost
parlay's stake and pays a won one, with no cap, and that shows on the same
line.

**Your position.** A market you have money on shows a **Your position**
card at the top (above the chart on a phone, at the top of the right-hand
column on a computer). Only you see it. While the market is open it lists
each of your bets with exactly what it pays if it wins, and each parlay
that has a leg on the market, linking to the parlay. Once the market
settles, each bet shows Won, Lost or Refunded, the card says what you won
or lost on the market overall (left out when it comes to 0), and each
parlay leg says where it and its parlay stand.

## Markets from before October 2026

Until October 2026 a market was a **shared pool**: every DC bet on it went
into one pot, the people who picked the winner split it in proportion to
their stakes, and if nobody had bet on the winning outcome, everyone was
refunded. A payout was only an estimate ("Pays ~") until the market
closed, because later bets moved it, and each outcome's chance counted a
20 DC seed that belonged to nobody.

When fixed payouts arrived, every one of those markets that was still
open, or closed and waiting for its result, switched over, and **nobody's
expected payout changed**:

- **Each bet pays exactly what its "Pays ~" said** at the switch: its
  stake × all DC on the market ÷ DC on its outcome, rounded down. The
  estimate became a guarantee, and later bets no longer move it.
- **The chances didn't move.** The market maker started each outcome at
  the chance it showed then, seed included (an outcome at 0% starts a
  sliver above it), and prices every bet since from there. The chart's
  history before the switch is unchanged.
- **The no-winners refund stays for those bets.** If the market resolves
  to an outcome nobody had bet on at the switch, every bet placed before
  the switch gets its stake back, as the old rules promised, even if
  someone bets on that outcome afterwards. Bets placed after the switch
  are paid like any other: their shares if they win, nothing if they
  lose. My bets marks such a refund "Refunded · no winners".
- **Pending parlays were fixed too.** A pick whose odds weren't set yet
  got them from its market's pool as it stood: other members' DC on the
  market ÷ other members' DC on your pick, at most 5×, or 1.00× without
  50 DC from 2 other members or with nobody else on your pick. Picks whose
  odds were already set kept them. The multiplier and payout were then
  fixed under the old caps (20×, and 1,000 DC, or the stake back if a
  parlay staked more than that), and a pick voided later drops out under
  the same caps. These parlays hold no shares, so they never moved any
  chance, just as before.
- Those bets and parlays are final, like every other.

Markets settled before the switch keep their results, and My bets still
shows what they paid (some of the oldest counted the seed in their
payouts).

## The slip, solo bets and parlays

Every bet goes through the **slip**. Tap "Add" on outcomes from
any number of markets, then open the slip to set stakes. Type a stake,
or tap a quick stake: 5, 10, 25 or Max. Max is your balance less the
other stakes already in the slip, and a chip for more than that is
greyed out. The top of the slip shows your balance and what's left after
the slip (or how many DC short it is), and when Place can't be tapped, a
line under it says why. At 0 DC it points you to Tasks; your picks stay
in the slip. Each pick is either:

- **Solo:** a normal bet on that outcome, buying shares at a fixed
  payout.
- **Parlay:** combined with your other Parlay picks into one bet that
  wins only if every pick wins.

"Place" sends everything at once. If any single bet can't be placed, none
of them are.

**How parlays pay.** A parlay's payout is **fixed when you place it**,
like a solo bet's:

- Between 2 and **6** legs, one per market.
- It's lost as soon as one leg loses, and paid once every leg has won.
- **Your stake is split evenly across the picks.** Each pick's share buys
  shares in its outcome at that market's price, just as a solo bet of
  that size would, so a parlay **moves each market's chance**. The shares
  are held by DwellDuel (the "parlay book"), not by you: what you're paid
  is the parlay's payout.
- **Each leg's odds** are what its share of the stake bought: the shares ÷
  the DC spent on them (1 ÷ the average price paid), to six decimal
  places, rounded down. A leg never counts less than 1.00×.
- **The multiplier** is the legs' odds multiplied together, and the
  **payout** is the stake × the multiplier, rounded down to a whole DC.
  The slip shows both exactly ("Pays 49 DC (4.96×) if every pick wins"),
  with no "~". If the payout would be more than 2% lower by the time you
  place it, nothing is placed: the slip shows the new payout and you tap
  Place again.
- **No other limits:** your own markets can be legs, a pick needs no
  money from other members first, and there is no cap on the multiplier
  or the payout. Your balance is the limit.
- **A voided leg** drops out: the payout becomes the stake × the other
  legs' odds, rounded down. With one leg left, it pays at that leg's odds.
  If every leg is voided, the stake is refunded.
- **Bets are final:** a parlay can't be cancelled.
- Example: market A has just opened, at 50% Yes; on market B, 30 shares
  of Yes have been bought (about 65% Yes, 35% No). A 10 DC parlay on Yes
  in A and No in B spends 5 DC on each.
  5 DC buys 9.545141 shares of A's Yes, so that leg is 9.545141 ÷ 5 =
  **1.909028×** (and A's Yes moves to about 55%). 5 DC buys 12.995170
  shares of B's No, so that leg is **2.599034×**. The multiplier is
  1.909028 × 2.599034 = **4.96×**, so the parlay pays **49 DC** if both
  win. If B is voided instead, it pays 10 × 1.909028 = **19 DC** when A's
  Yes wins.

Parlays placed before October 2026 were fixed when their markets switched
over: see [Markets from before October 2026](#markets-from-before-october-2026).

**Riding in parlays.** So a busy parlay market doesn't look empty, a
market page says under its outcomes how much DC rides on the market in
parlays still pending, as "Includes 45 DC riding in parlays". Each
parlay's full stake is counted. The figure itself is for information only: it
isn't the chance or anyone's payout (the parlay's share of its stake has
already moved the chance like any bet, apart from a parlay from before
October 2026, which never did). It never says whose parlays they are.

**My bets** shows your solo bets and parlays together, newest first, under
Open, Settled and Cancelled. Only you can see it. Everyone can see who
bet what on each market, and bets and parlays also appear in the feed.

Tap a parlay to open its **breakdown**: its stake, multiplier and what it
pays (or paid), each pick with its odds and where its market stands (Open, Awaiting resolution, Won, Lost
or Voided), and a short sum showing how the multiplier adds
up. A voided pick is shown as left out, and the rest carry on.

My bets' **Coins** tab is your coin history: every DC that came in or went
out, newest first, in plain words ("Won 26 DC on Will it rain?", "Task
reward: Read Ruth", "Refund: market voided"). It includes the reason for
any balance adjustment the owner made. Only you (and admins, through the
full ledger) can see it.

## Results

- **Who resolves:** once a market has closed, its creator or any
  reviewer, or an admin at any time. **Nobody but an admin resolves a
  market they have money on** (a bet or a parlay leg), so a creator who bet
  leaves it to a reviewer. A parlay leg counts even after its parlay has
  been settled on another market, since an override there could bring it
  back. A market whose creator has money on it shows
  what, bets and parlay picks alike ("Ben has 40 DC on Yes"), and its
  result in the feed says the same. The resolver picks the winner (or, for an Over/Under,
  types the actual number) and **must say why**. They can attach photos,
  files or links as proof (see **Proof limits and expiry** under Tasks). The
  reason and proof show on the market page and in the feed. Before anything is paid, the app asks them to confirm,
  naming the winner ("Yes wins").
- **Reminders:** bettors' DC and parlays wait on a market awaiting
  resolution until it's resolved, so Home's **Needs you** lists them for
  whoever should do it (an admin sees how many wait, opening Admin's Markets). A creator sees their own markets as soon as they close
  (unless they have money on one and aren't an admin). Reviewers and admins see any market
  still unresolved 48 hours after closing, and straight away one whose
  creator has money on it, since the creator can't resolve that one.
- **Overrides:** an admin can change a result to a different outcome; the
  outcome that already won can't be chosen again. The original payouts are
  taken back and the new winners paid; the confirmation says so first. If a past winner has already spent
  their winnings, the override is blocked and names who, so an admin can
  sort out balances first.
- **Voids:** until a market closes, its creator or an admin can void it;
  once it has closed, only an admin can, the same way nobody with money on a
  market settles it. A creator with money on their own market (a bet or a
  parlay leg) can't void it at all: they ask an admin. Every void **must say why**, and the reason shows on
  the market page and in the feed. Every bet on it is refunded what it
  cost, and a parlay leg on it drops out.
- **Paying out:** each winning bet is paid its shares, rounded down to
  whole DC. Nobody is refunded when nobody backed the winner, apart from
  bets placed before October 2026 (see
  [Markets from before October 2026](#markets-from-before-october-2026)).

## Tasks

Admins keep a catalogue of Bible-study tasks, each with a DC reward.

- A task is **one-off** or **repeats** daily, weekly (Monday–Sunday
  weeks), monthly or yearly. Periods run on US Eastern time, so a daily
  task resets at **midnight Eastern**, a weekly one at midnight going into
  Monday, and so on. Once a repeating task is approved, its row says when
  you can do it again ("Again Monday, midnight ET").
- You submit a task once per period, with an optional note. Some tasks
  **require proof**: a photo, file or link.
- **Proof limits and expiry.** Proof is a photo, a PDF or a text file, or a
  link: up to 5 attachments, no more than 3 of them files, 3 MB a file and
  6 MB of files together. Photos are shrunk on your device before they upload.
  There's also a daily upload allowance (30 files or 60 MB), which an honest
  submission never comes near. Once you've submitted proof you can't delete it.
  So that the app's free storage doesn't fill up, the **files expire**: proof
  on a task submission that has been approved or rejected is deleted **30 days
  after the review**, and proof on a market's result **90 days after it was
  resolved**. A pending submission's proof is kept until it's reviewed. After
  expiry the row still says how many attachments there were and that they've
  expired; links aren't files and stay.
- A **reviewer** approves it, which pays the reward, or rejects it,
  optionally saying why. Your row then says "Not approved", with the
  reason if they gave one, and you can submit again. Nobody reviews their
  own submission, and a task can reward at most 500 DC.
- On Tasks, a submission waiting for review says **Pending review** until
  it's approved, and its reward is paid then.
- **Streaks:** do a repeating task in back-to-back periods and its row
  shows your streak, like "5-week streak", from two in a row. Only
  approved submissions count: one waiting for review joins the streak
  once it's approved. The streak lasts until the end of the current
  period, so a daily streak survives today until midnight even if you
  haven't done today's yet; miss a whole period and it starts again.
  Streaks earn no extra DC.

## The leaderboard

- **Net worth** (the main board) ranks everyone by **balance plus the DC
  riding on open bets**: solo bets on markets that haven't resolved yet
  and parlays not yet settled. Placing a bet doesn't move you down; losing
  it does. Your profile shows your rank on this board, and so does Home
  once you've had a bet or parlay settled. Your own row is highlighted
  and stays pinned to the bottom of the screen until you scroll to it.
  When you're further down than the list shows, a bar with your rank and
  net worth stands in for it on a phone, with **Jump to me**, which opens
  the list ten places above you instead of paging down from the top.
- **This month** ranks **net betting profit** for the calendar month, on
  Eastern time (America/New_York): winnings, refunds and cancelled-bet
  refunds, minus stakes, and minus any winnings an override took back.
  Starting grants, task rewards and balance adjustments don't count, so
  everyone starts each month level. Money counts **when it moves**: a
  stake placed this month on a market that resolves next month is a loss
  this month, and its winnings count next month. Only members who've bet
  or been paid this month appear.
- **Ties share a rank** on both boards ("1, 1, 3").
- **Only current members are ranked.** Someone the owner has removed drops
  off both boards and out of "Rank X of N"; their profile still shows
  their net worth, marked "Not ranked".
- **Your standing** (Net worth, wide screens only): a card beside the
  rankings, under the podium, shows your rank, net worth, record and how
  far you are behind the member above you, with Jump to me.
- **Podium and records:** once three members are ranked, the top three
  of the Net worth board stand on a podium (This month leads with the
  race instead). From tablet width up, each row shows a win-loss record (like 6-3):
  your settled solo bets and parlays, all time. Bets on a voided market,
  or refunded because nobody had backed the winner, are refunds and count
  as neither, and open bets don't count yet.
- **The race** (This month): a step line for each of the month's top five,
  showing their running net profit from the month's first settled bet,
  one step each time a total moved, with each name and total at the end
  of the line. Hover or tap it for everyone's exact total at that moment,
  or focus it and use the arrow keys (Home and End jump to either end) to
  step through the moments, with a screen reader reading out the totals.
  When one member is far ahead, or far behind, their line runs off the
  top or bottom (an arrow marks where) so the others stay readable; their
  label still shows their true total. Until a bet settles, the race says
  it hasn't started.
- **This month's awards**, each shown only once someone has earned it:
  **Biggest win** (the most gained on one solo bet paid this month),
  **Best parlay** (the highest multiplier among parlays paid this month,
  the same figure its parlay page and the profile's Stats card show),
  **Sharpshooter** (the best solo hit rate over markets resolved this
  month, with at least five decided bets) and **Most active** (the most
  solo bets and parlays placed this month). A tie on Biggest win goes to
  the payout that came first, and on Best parlay to the parlay that paid
  more. Sharpshooter and Most active go to whoever has more of what's
  counted, then the name. A removed member wins no award; it goes to the
  next member still in.
- **Past champions** lists the months already crowned.
- **Monthly champion:** when a month ends, whoever finished it with the
  top profit is posted to the feed early on the 1st, Eastern time ("Alice
  was October's champion with +140 DC"). If two finish level, it goes to whoever reached that total
  first. A month where nobody bet, or nobody came out ahead, has no
  champion.

## Profile stats

Every member's profile has a **Stats** card, which any member can see:

- **Solo bets** and **Parlays:** how many settled bets were won, lost
  and refunded. A bet on a voided market, or one refunded because nobody
  had backed the winner, counts as refunded. Cancelled bets, and bets
  still open or waiting to be resolved, don't count. After an override,
  a bet counts by the final result.
- **Net profit:** all-time net betting profit, worked out exactly as the
  This month board does, over every month. A stake counts when it's
  placed, so an open bet counts against it until it settles.
- **Biggest win:** the largest payout minus its stake on a single solo
  bet, with the market. A payout an override took back doesn't count.
- **Best parlay:** the won parlay with the highest multiplier (the
  multiplier fixed when it was placed, less any voided legs, and up to its
  cap for a parlay from before October 2026), and what it paid.
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
| **Markets to resolve** | A market you made has closed and is waiting for you to resolve it. Admins and the owner also hear about every closed market that has no result, once each. Sent within about a minute of closing, with a daily backup if that's missed | On |
| **Results** | A market you bet on, solo or as a parlay leg, is resolved ("You won 26 DC", then the market and its result), changed by an override or voided | On |
| **Task reviews** | Your task submission is approved or rejected, with the reviewer's reason, if they gave one | On |
| **Tasks to review** (reviewers and above only) | A member submits a task waiting for review. Never your own | On |
| **New markets** | Someone else creates a market | Off |

A parlay only pays once all its legs are settled, so if your only stake
in a market is a parlay leg, the notification just gives the result. A
cancelled bet gets no notification. Tapping a notification opens the
market, your tasks, or (for Task to review) the review queue.

**On iPhone and iPad,** notifications only work once DwellDuel is on
your Home Screen (iOS 16.4 or later): tap Share, then Add to Home Screen,
open DwellDuel from there and turn them on in Settings. If you've blocked
notifications for DwellDuel, allow them again in your browser's or
phone's settings.

**Notifications keep themselves connected.** If your browser replaces
its notification connection, DwellDuel re-registers this device within a
day of you opening the app (or straight away, where the browser tells it),
on a device where you've turned notifications on or opened Settings since
this update. A device the notification services keep rejecting is removed
from your account after five rejected attempts spanning more than a day, or
after 60 days without a delivery once it has also been failing for a day.
Outages on the services' side, or ours, never count against your device.
If yours was removed, turn notifications on again in Settings.

**Signing out stops notifications on that device,** so on a shared phone
the next person to sign in never sees yours. Turn them on again after you
sign back in. Your other devices keep theirs.

## Roles

| Role | Can also…
|---|---|
| **Member** | Bet, create markets and edit their own (wording, category, and the closing time while they have no money on it), resolve their own once they close and void them before they close (unless they have money on them), submit tasks |
| **Reviewer** | Approve and reject task submissions (not their own), and resolve closed markets they have no stake in |
| **Admin** | Invite people, manage tasks, resolve, override or void any market, move any market's closing time or reopen it, change any market's category, rename, merge and hide categories, delete any comment, view members and the full ledger |
| **Owner** (exactly one) | Adjust balances, grant and remove roles, remove a member, and delete a market or task that hasn't been used |

Reviewers and above see what is waiting on them: other members' task
submissions (reviewers and above) and closed markets with no result (admins
and above). Their avatar gets a red dot, its menu's **Admin** item says
"N waiting", and Home's **Needs you** lists each queue with its count; all
of it disappears at zero. Admin opens on the queue that has work in it.

A role only counts while you're invited, and so does what you can do with
your own markets and comments. The owner can **remove a member**
from their page under Admin → Members: they go back to plain member, their
invite is revoked, they're signed out on every device and their devices
stop getting notifications, straight away. They can no longer resolve,
void or edit the markets they created, or delete their comments. Their
coins, bets and history stay where they are, but they're left out of both
leaderboards, the "Rank X of N" count, the month's champion and the weekly
recap's best call and top tasker, and Admin → Members lists them under
**Removed**. If they sign in again they land on the not-invited page. The
owner's **Invite again** on their page (it asks first) brings them back as
a member, ranked again.

## Limits

So that one account, or a stolen session, can't flood the app, each
member can make at most:

| What | How many |
|---|---|
| New markets | 20 a day |
| New categories | 20 a day |
| Comments | 10 a minute, 200 a day |
| Reactions | 60 a minute, 1,000 a day |
| Task submissions | 30 a day |

Each count starts with your first one and resets once its minute or day
has passed. Going over just refuses that one, with a message
saying so; nothing else changes. Admins and the owner have no limits.
Notifications stay on your ten most recently used devices: turning them
on for an eleventh turns off the one you've used least recently.

## Your data

What DwellDuel keeps about you, who can see it, and for how long. This
section is also public, at
[dwellduel.com/privacy](https://www.dwellduel.com/privacy).

**Who runs it:** Aaron Wickham, a member of the group, runs DwellDuel as
a hobby, not a business. It has no ads, and nothing about you is sold or
used for anything but running the app.

**What's stored**

- **From Google, when you sign in:** your name, email address and the link
  to your Google profile picture, used only to sign you in, check your
  invite and show your name and photo. DwellDuel never sees your Google
  password.
- **What you add:** your display name, photo and bio.
- **What you do:** your bets, parlays and cancelled bets, the markets you
  make and resolve, comments, reactions, task submissions with their notes
  and proof, and every coin that moves (the ledger).
- **Your devices:** for each device you turn notifications on, its
  notification address and which browser it is, plus your notification
  choices. Theme, vibration and animation settings are cookies on the
  device itself. Your sign-in sessions and when you last signed in are
  kept too.
- **Diagnostics:** when something breaks, an error report with your name,
  cookies and what you typed taken out, and anonymous page-view counts with
  no cookies.

**Who can see it**

| What | Who |
|---|---|
| Your name, photo, bio, profile stats and leaderboard standing | Every member |
| Your bets and parlays on each market, the markets you make, your comments and reactions, your approved tasks and your wins | Every member (they also show in the feed) |
| Your email address, and when you joined and last signed in | Admins and the owner only; other members never see your email |
| Your coin history (every DC in and out, with reasons) | You, and admins through the full ledger |
| A task submission still waiting or rejected, its note and its proof | You, and reviewers and above |
| A result's reason and proof | Every member |
| Your notification devices and choices | Only you |

Nobody outside the group can see anything: every page needs an invited
sign-in. The owner, who runs DwellDuel, can see everything stored in the
database.

**Where it's kept:** the database, sign-ins and uploaded files are with
Supabase, and the app runs on Vercel, both in the US (Ohio). Error reports go to
Sentry, in the US. Encrypted nightly backups are kept in a private GitHub
repository.

**How long it's kept**

- **Proof files:** deleted 30 days after a task submission is reviewed,
  and 90 days after a market is resolved (see **Proof limits and expiry**
  under [Tasks](#tasks)). Links aren't files and stay.
- **A Google account that wasn't invited:** what Google shared is deleted
  the next day.
- **A device's notification address:** deleted when you turn
  notifications off or sign out on it, or after it keeps failing.
- **A replaced profile photo:** deleted within a couple of days.
- **Everything else** stays while DwellDuel runs, including after a member
  is removed, so that everyone's results and balances still add up.
- **Backups:** each nightly copy is kept for about 60 days, so anything
  deleted is gone from the backups within about two months.

**Leaving, or asking for your data to be deleted:** ask the owner. They
can remove you straight away: your invite goes, you're signed out
everywhere, your notifications stop and you drop off the leaderboards (see
[Roles](#roles)). Your coins, bets and history stay. If you'd like your
data deleted as well, say so: the app has no button for that yet, so the
owner does it by hand.

**Questions:** members can ask the owner directly. Anyone else can email
[aaronmaxwellwickham1917@gmail.com](mailto:aaronmaxwellwickham1917@gmail.com)
or reach them through
[DwellDuel on GitHub](https://github.com/Aaron-Wickham/dwell-duel).

## Around the app

- **Home:** a greeting with your rank (once you've had a bet settled) and
  the DC riding on your open bets; your balance is in the top bar, and on
  a computer in a Balance card too. **Needs you** appears when something
  does: submissions to review and markets to resolve, and at 0 DC a pointer
  to Tasks, the way to earn more. **Your bets** lists the three closing
  soonest (or, with none open, the markets closing soonest), and
  **Activity** the latest from the feed, with See all. New members also get
  a **Getting started** card: read this page, turn on notifications on this
  device (left out on a browser that can't get them), add your photo, place
  your first bet and try a task. It goes away once you've done them all,
  when you dismiss it, or once you've had a bet settled and a task
  approved. After that, the installed app without
  notifications asks once to turn them on, until you tap Not now.
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
- **Activity:** opened from Home's Activity (See all). Everyone's bets, parlays, new markets, results, voids (with
  their reason), wins, approved tasks and each month's champion, with their
  reactions, updated live. See [Reactions and comments](#reactions-and-comments).
  The tabs narrow it: **All**, **Results** (markets resolved or voided,
  bets and parlays won, each month's champion) and **Mine** (your own bets,
  markets and wins, plus the result or void of any market you have a bet or
  a parlay leg on, and the void of any market you made).
- **Finding a market:** on Markets, type in the search box to find a market
  whose title contains what you typed (not case-sensitive, up to 80
  characters). It looks in every status, whichever tab you're on, keeps
  the category chip, and lists every match in one list, newest first,
  rather than in sections.
  Your own bets are under My bets.
- **Leaderboard and profiles:** see [The leaderboard](#the-leaderboard)
  and [Profile stats](#profile-stats).
  Tap your avatar (top right) for a menu: **Your profile** (where Edit
  profile lives), **Settings**, **Admin** for reviewers and above, and
  **Send feedback**.
- **Settings:** theme (System, Light or Dark), vibration on taps (Android),
  reduced animations, your profile (photo and name), [notifications](#notifications), how to install the app (on a phone browser that hasn't yet), this How it works
  page, [what DwellDuel keeps about you](#your-data), and sign out. Signing out only signs out the device you're on, and
  stops its notifications; your other devices stay signed in.
- **Install it:** add DwellDuel to your Home Screen for a full-screen app
  with a launch animation. It shows an offline page when you lose
  connection, and on iPhone and iPad it's how you get notifications.
- **Feedback:** use "Send feedback" in your avatar's menu.
