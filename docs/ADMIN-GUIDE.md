# Admin guide

For the people who run DwellDuel: reviewers, admins and the owner. It's
task by task: what to tap, what the app asks, and what happens to members'
coins. The rules every member plays by are in
[How it works](HOW-IT-WORKS.md) (in the app under Settings → How it works → Read the full rules);
this guide doesn't repeat them except where running the group needs them.

Everything here happens under **Admin**, which reviewers and above open
from their avatar's menu or from Home's **Needs you** (it opens on whatever
is waiting), and on market pages.

## Roles at a glance

| Role | Can | Admin sections |
|---|---|---|
| **Member** | Bet, create markets and edit their own (wording, category, and the closing time while they have no money on it), resolve their own markets once they close (unless they have money on them), void their own markets before they close, submit tasks | none |
| **Reviewer** | Everything a member can, plus approve and reject other members' task submissions, and resolve any closed market they have no money on | Tasks (the approval queue only) |
| **Admin** | Everything a reviewer can, plus invite people, create and edit tasks, resolve any market at any time (even before it closes, and even one they have money on), override a result, void any market, move any market's closing time or reopen it, delete any comment, and see members' emails and the full ledger | Invites, Tasks, Markets, Members, Ledger |
| **Owner** (exactly one) | Everything an admin can, plus adjust balances, change roles, remove a member or invite them again, and delete a market or task nobody has used | The same, with the owner's cards on each member's page and the Economy card on Ledger |

A role only counts while its account is invited. Removing a member takes
their role away with their invite, straight away.

What's waiting on you is other members' task submissions (reviewers and
above) and closed markets with no result (admins and above). While
anything waits, your avatar carries a red dot and its menu's **Admin** item
says "N waiting"; inside Admin, the **Tasks** and **Markets** tabs show
their share as a red count; and Home's **Needs you** lists each queue with
its count, opening that section.

## Inviting people

DwellDuel is invite-only: only a Google account whose email is on the
invite list can get in.

1. **Admin → Invites → Invite someone.** Type their Google email (the one
   they'll sign in with) and add it.
2. **Copy invite message** on their row copies a short message with the
   link. Adding an email sends nothing by itself, so send that message
   yourself, by text or email.
3. They sign in with Google. If they use a different Google account, they
   land on a "not invited" page that names the account they used, and can
   try another.

The **Waiting** tab lists invites nobody has used yet, and **Claimed** the
ones someone has signed in with. Search finds an email in either.

**Revoke** takes back an invite nobody has used yet. Once someone has
signed in with it, it can't be revoked from here: taking a member out is
the owner's, through their page (see [Members](#members-owner)).

## Markets

### Creating one

Any member can create a market from Markets → Create market: a question,
an optional description, a category, a closing time, and its kind.

- **Yes/No**, or **Multiple choice** with 2 to 6 outcomes.
- **Over/Under** takes a number with a line ending in .5 (for example
  "Minutes the sermon runs, 42.5"), so it can never tie. Its outcomes are
  made from the line: Over 42.5 and Under 42.5.
- **Set the closing time before the answer is known.** Betting stops then.
  The outcomes and the line can never change afterwards; the closing time
  can be moved (see Editing and deleting).
- **Duplicate** (in a market's **More actions** menu, the ⋯ button at the
  top right) opens the form already filled in, a week (or more) later, for
  a question that comes round every week.

A member can create up to 20 markets a day; admins and the owner aren't
limited.

### Editing and deleting

Edit, Reopen and Edit history are in the market's **More actions** menu
(the ⋯ button at the top right of the market page), beside Share and
Duplicate.

- **Edit** (the creator or an admin, until the market closes) changes the
  description, and the title only until someone else has bet on it, solo
  or as a parlay pick. Every version is kept under **Edit history**, which
  every member can read.
- **Category:** the creator can change it until the market closes, and an
  admin at any time (**Edit category** once it has closed). It's logged in
  Edit history too.
- **Close time and Reopen:** the creator or an admin can move the close
  time, later or earlier as long as it's still to come. A market that has
  closed without a result shows **Reopen**, which takes bets again until
  the new close time. Only reopen while the result isn't known yet:
  anyone could otherwise buy the known winner cheaply. A creator with a
  bet or parlay pick on their own market can't move its close time; an
  admin does it for them.
- **Delete** (the owner only, its own card on the market page) removes a
  market nobody has ever bet on, cancelled a bet on, or picked in a parlay. Anything with money on it
  can't be deleted: void it instead, which refunds everyone and keeps the
  record.

### Resolving

Members' DC waits on a market until it's resolved, so resolve within 48
hours of it closing.

**Where to find them.** **Admin → Markets** lists every market that has
closed with no result, oldest first, with when it closed, the DC in it, who
made it and a Resolve button. Home's **Needs you** shows what's waiting on
*you*: an admin sees how many markets wait, opening Admin → Markets; a
creator sees each of their own as soon as it closes ("… closed. Resolve
it."), and a reviewer also sees any market still unresolved 48 hours after
closing, and straight away one whose creator has money on it (since the
creator can't resolve that one).

**Who can resolve.** After it closes, its creator or any reviewer, as long
as they have no money on it (no bet and no parlay pick). An admin can
resolve any market at any time. If the Resolve form isn't on a market page
for you, you can't resolve it: the database decides
(`can_resolve_market`), and the app only shows what it allows.

**Steps.** On the market page, in the **Resolve market** card: on a phone
it comes straight after the outcomes and your position once the market has
closed (before then, for an admin resolving early, it's near the bottom);
from a laptop it's in the right-hand column, under the outcomes.

1. Pick the **winning outcome**. For an Over/Under, type the **actual
   number** instead; it can't equal the line, and the app picks Over or
   Under from it.
2. Say **why** it won (required, up to 1,000 characters). Everyone sees
   this on the market page and in Activity.
3. Optionally add **proof**: photos, a PDF or text file, or links (up to 5
   attachments, at most 3 of them files, 3 MB a file and 6 MB together).
   Resolution proof files are deleted 90 days after the result; links
   stay.
4. Tap **Resolve market**, and confirm. The confirmation names the winner.

**What happens.** Winning solo bets are paid at once: each is paid its
shares, rounded down to whole DC, which is what its slip said it would
pay. Nobody is refunded when nobody backed the winner, with one exception:
a bet placed before the October 2026 switch gets its stake back if the
market resolves to an outcome nobody had backed at the switch.
Each parlay with a pick on the market settles that leg: a losing pick
loses the parlay, and a parlay pays once every pick has won.

### Overriding a result

Admins only, for a result that was wrong.

1. On the resolved market, in the **Override resolution** card, choose a
   **different** outcome (the current one can't be picked again) and say
   why.
2. The confirmation warns that earlier payouts are reversed. Confirm.

The app takes back every original payout, pays the new winners, and
settles every parlay with a pick there again on the new result.

**"Blocked: a past winner has already spent their winnings"** means taking
the payout back would put someone below 0 DC. The message names who. Sort
it out first: talk to them, and if the group agrees, the owner adds DC to
their balance with a reason (see [Adjusting a balance](#adjusting-a-balance)),
then override again.

### Voiding (calling a market off)

Void a market that can't be settled fairly: the question was ambiguous,
the event was cancelled, or it was made in error. Members never see the
word: the app says the market was **called off**, and a market past its
close with no result is **waiting for a result** (#403).

- **Who:** until it closes, its creator or an admin; once it has closed,
  only an admin. A creator with a bet or parlay pick on their own market
  can't void it; an admin does.
- **Steps:** in the **Call off market** card, its own card below Resolve on
  the market page, tap **Call off this market**, give the reason (required, up to 500 characters;
  everyone sees it on the market page and in Activity), and confirm.
- **What happens:** every bet is refunded. A parlay with a pick on it drops
  that pick and carries on with the rest; a parlay with no picks left is
  refunded. This can't be undone.

### Categories (admins)

Members make categories when they create a market, so near-duplicates
creep in. Admin › Markets › Categories lists each one with how many
markets it has:

- **Rename** fixes a name. It can't clash with another category's name
  (capitals and spacing don't count as different).
- **Merge** moves every market in one category into another, logs each
  move in the market's Edit history, and hides the old category.
- **Hide** takes a category out of the filter chips and suggestions
  without touching its markets. Typing a hidden category's name for a
  market brings it back.
- **Other** is the default and can only be renamed.

### Bets are final

Bets can't be cancelled or removed, by members or the owner. A wrong bet
stands, or the market is voided.

## Tasks

### The catalogue (admins)

**Admin → Tasks → Create task**: a title, an optional description, a
reward in DC (at most 500), whether it **requires proof**, and whether it's
**repeatable**, with a cadence: daily, weekly (Monday to Sunday), monthly
or yearly. Periods run on US Eastern time, so a daily task resets at
midnight Eastern. A member can submit a task once per period.

In the **Task catalog** each task has **Edit**, and **Deactivate**, which
hides it from members without losing its history (**Reactivate** brings it
back). The owner can also **Delete** a task nobody has submitted yet.

### Reviewing submissions (reviewers and above)

**Admin → Tasks → To review** lists submissions oldest first, 50 at
a time, with **Show more** for the rest. On a computer it's a table (member,
task and reward, proof, when it was sent); on a phone, one compact row each.
Tap a row's proof line ("Note · 1 photo") to read their note and open any
proof.

- **Approve** pays the reward at once. It doesn't ask first.
- **Reject…** opens a small window asking why, optionally (up to 500
  characters). The member sees "Not approved" and the reason, and can
  submit again.
- The bar at the top of the queue stays in view as you scroll. **Select
  all**, or tick several, and it says how many are selected and what they
  pay. **Approve selected** asks first, saying how many it approves and how
  much it pays; **Reject selected…** asks for one optional reason, sent to
  each of them.
- **Your own submissions** are in the list but can't be reviewed by you;
  another reviewer does those.

Proof on a reviewed submission is deleted 30 days after the review, so look
at it when you review.

## Members (owner)

**Admin → Members** lists everyone, A to Z, in two tabs: **Active** and
**Removed**: on a computer a table of name and email, role, balance, net
worth (balance plus DC riding on open bets) and when they joined. Search
finds a member by name or email. A member's name opens their Admin page:
their email, when they joined and last signed in, their balance and their
last five coin movements (**Open in Ledger** shows all of them), then the
owner's cards below, with Access last. Admins can look; the cards are the
owner's.

### Adjusting a balance

For corrections: a payout an override couldn't take back, a mistake, a
prize the group agreed.

1. On the member's Admin page, **Adjust balance**: an amount (positive
   adds, negative takes away) and a **reason** (required, up to 200
   characters).
2. Confirm. The adjustment and its reason appear in the ledger, and in the
   member's own coin history.

A balance can't go below 0. If the answer is lost (a dropped connection),
the app says so: tap again and it won't be applied twice.

### Changing a role

**Role**: Member, Reviewer or Admin, then confirm. The owner's own role
never changes here (see OPERATIONS.md's owner recovery if ownership must
move).

### Removing a member

**Access → Remove from DwellDuel**, then confirm. Straight away they:

- go back to member, and lose their invite;
- are signed out on every device, and their devices stop getting
  notifications;
- can no longer resolve, void or edit markets they made, or delete their
  comments;
- drop off both leaderboards, the count in a rank like "218th of 502", the month's champion and the
  weekly recap.

Their coins, bets and history stay where they are, and they're listed
under **Removed**. If they sign in again they land on the not-invited page.
**Invite again** on their page (it asks first) brings them back as a
member, ranked again.

Removing a member doesn't erase their data. If someone asks for that, see
[How it works → Your data](HOW-IT-WORKS.md#your-data); it's done by hand.

## Ledger and the Economy card

**Admin → Ledger** lists every DC movement, newest first: starting grants,
bets, payouts, refunds, parlays, task rewards and adjustments. From a
member's page, **Open in Ledger** narrows it to them.

The **Economy card** above it (owner only) shows the DC in circulation
(balances plus stakes still riding) and this month's DC added and removed,
by source: starting grants, task rewards, the market maker (what markets
paid winners, less every stake on them, parlays included), payout rounding,
house-paid parlays and owner adjustments, plus seed payouts in a month
when an older result was paid or overridden. It also checks that **everything ever added,
less everything ever removed, equals what's in circulation**. If it says
the check fails, or that the ledger holds a type it doesn't know, coins
have moved outside the rules: tell Aaron, and don't adjust balances to
paper over it.

## Warnings in Admin

- **"Closing alerts last ran …"**: the timer that tells creators and admins
  a market has closed may have stopped. Members aren't affected and the
  daily backup still sends them, but tell Aaron; it's in OPERATIONS.md's
  Incidents.
- **"Couldn't check whether closing alerts are running"**: a passing
  read failure; reload. If it stays, tell Aaron.

## Parlays, for the people who settle markets

- A parlay's odds and payout are fixed when it's placed. Resolving a
  market early, or moving its close time, doesn't change what a parlay
  pays.
- A parlay's stake buys shares on each of its picks, so parlays move a
  market's chance like solo bets do. "Includes N DC riding in parlays" under
  the outcomes shows how much parlay money is on the market.
- An override settles every affected parlay again; a void drops the pick,
  and the rest pay at their own odds.
- Parlays placed before the October 2026 switch keep their old caps: 20×
  and 1,000 DC.

## Good practice

- **Resolve within 48 hours** of a market closing; members are waiting on
  their DC, and parlays on their picks.
- **Say why** in every resolution and void, plainly, and add proof when
  there is any: a photo of the scoreboard beats "Yes won".
- **Don't resolve a market you're unsure of.** Leave it for another
  reviewer, or ask in the group.
- **Overrides and balance adjustments are for mistakes,** not second
  thoughts. Say what happened in the reason; everyone can read it.
- **Never review your own task** (the app won't let you) and never resolve
  a market you have money on unless you're an admin and nobody else can;
  say so in the reason if you do.
