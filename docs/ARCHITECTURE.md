# Architecture

How DwellDuel fits together. For the rules members see (odds, payouts,
parlays, tasks), read [HOW-IT-WORKS.md](HOW-IT-WORKS.md). For the coding
conventions every change follows, read [AGENTS.md](../AGENTS.md).

## The shape of it

```
Browser / installed app (PWA)
  │  React Server Components + a few client islands
  ▼
Next.js 16 on Vercel ── proxy.ts: signed-out requests → /sign-in
  │  server components read with the member's own Supabase session
  │  server actions call Postgres RPCs; nothing writes tables directly
  ▼
Supabase (one hosted project: production)
  ├─ Auth: Google only, invite-gated
  ├─ Postgres: tables + RLS + security-definer RPCs (all money moves here)
  ├─ Realtime: 12 published tables drive live page refreshes
  └─ Storage: `avatars` (public), `proof` (private, signed URLs)

Web push: server actions and the daily cron → web-push (VAPID) → the
browser's push service → public/sw.js shows the notification
```

The rule that shapes everything else is that **all business logic that
touches coins lives in Postgres.** Placing a bet, resolving a market,
approving a task or adjusting a balance are each one `security definer`
function that checks permissions, locks the rows it needs, and writes the
ledger in a single transaction. The Next.js side renders, validates input
for friendly errors, and calls those functions. It never updates a balance
itself.

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19, server actions, `proxy.ts`) |
| Language | TypeScript, strict |
| Styling | Tailwind v4 with CSS-variable tokens (`app/globals.css`), light and dark |
| UI pieces | Base UI (dialogs, drawers), lucide-react icons, Motion (loaded lazily), NumberFlow, Recharts (the market page's chart; cards draw plain SVG), sonner toasts |
| Data | Supabase: Postgres, Auth, Realtime, Storage (`@supabase/ssr`) |
| Hosting | Vercel (production only, plus a daily cron) |
| Tests | Vitest (unit, component, DB against local Supabase), Playwright (e2e) |

## Routes

Signed-in routes live under `app/(app)/`, which share one layout: the nav,
the slip, live updates and toasts. `lib/auth/app-paths.ts` lists them so
`proxy.ts` can redirect signed-out visitors (a test keeps the two in step).

| Route | What it is |
|---|---|
| `/` | Home: greeting, balance hero (balance, rank, At stake, Pending), a new member's Getting started card, Markets to resolve, the weekly recap (Sundays and Mondays), tiles |
| `/markets` | Open markets as cards with sparklines, soonest to close first (a "Closes in 2h" chip inside a day), then resolved and voided newest first, each paged. `?status=all|open|pending|closed` (`lib/markets/status-filter.ts`) narrows it: open and pending read the open list split at the close time (`listOpenMarkets`' `bound`), closed reads only the closed list |
| `/markets/new` | Create a market: Yes/No, multiple choice (up to 6) or Over/Under. `?from=<id>` pre-fills it from a market (Duplicate) |
| `/markets/[id]` | A market: chart, outcomes, the slip controls, bets, comments, resolve/void/edit, share and duplicate, resolution proof |
| `/bets` | My bets: Open · Settled · Cancelled, solo bets and parlays together, and Coins, the member's own `coin_transactions` (`?tab=`) |
| `/parlays` | Redirects to `/bets` (kept for old links) |
| `/tasks` | Bible-study tasks to submit, with optional or required proof |
| `/feed` | Everyone's activity, with reactions, live |
| `/leaderboard` | Net-worth ranks, and This month's betting profit (`?tab=month`) |
| `/members/[id]` | A member's profile, stats and activity; your own adds Edit profile and Settings |
| `/profile` | Edit your name, photo and bio |
| `/settings` | Theme, haptics, reduced motion, notifications, How it works, sign out |
| `/how-it-works` | The rules, rendered from `docs/HOW-IT-WORKS.md` (read by `lib/docs/how-it-works.ts`, shipped by `outputFileTracingIncludes`, parsed by `lib/docs/markdown.ts`) |
| `/admin/invites` · `/admin/tasks` · `/admin/members` · `/admin/ledger` | Admin sections, shown by role; the ledger opens with the owner's Economy card |

Public routes live under `app/(auth)/`: `/sign-in`, `/callback` (the OAuth
return), `/not-invited` and `/offline`. The API has one route,
`/api/cron/keep-alive`, which a daily Vercel cron calls so the free
Supabase project never pauses. It also deletes unattached proof files and
attempt keys older than a day, calls `settle_season()` to post last
month's champion to the feed (a no-op once it's posted), and sends the
push reminders to resolve closed markets (`push_resolve_reminders()`).

## Code layout

```
app/            routes (see above), globals.css, manifest, error pages
components/     UI by area: app-nav, brand, feed, home, markets, parlays, proof,
                slip, tasks, live, offline, ui (shared primitives: Page, SectionCard,
                Button, Field, SubNav, ShowMore, EmptyState, Skeleton…)
lib/            logic by area: auth, markets, bets, parlays, tasks, proof, social,
                live, pagination, preferences, push, theme, forms, env, nav…
supabase/       migrations/0001…0057, config.toml
tests/          components/, lib/, db/ (Vitest), plus e2e/ (Playwright)
scripts/        generate-splash.mjs, generate-favicons.mjs
public/         sw.js (service worker), icons, favicons, iOS splash screens
docs/           this file, HOW-IT-WORKS, design handoff, dated specs and plans
```

## Data model

Every table has row-level security. Members read what the app shows them.
Almost every write goes through an RPC; the exceptions are admin writes to
the task catalogue and invite list, which are allowed by policy.

**People**

- `allowed_emails`: the invite list. Only invited Google accounts get in. Adding one
  sends nothing: Admin → Invites offers a "Copy invite message" to send
  the invitee yourself (`lib/invites/invite-message.ts`).
- `profiles`: one per member. Display name, bio, `avatar_path`, `balance`
  and `role` (owner › admin › reviewer › member). A trigger creates it on
  first sign-in and grants 100 DC.
- `coin_transactions`: the ledger. Every balance change is a row
  (`starting_grant`, `bet_placed`, `bet_won`, `bet_voided_refund`,
  `bet_refunded`, `bet_cancelled`, `resolution_reversed`, `parlay_placed`, `parlay_won`,
  `parlay_refunded`, `parlay_reversed`, `task_completed`,
  `admin_adjustment`), written only by `apply_coin_transaction`. Admins
  read it all at `/admin/ledger`; a member reads their own under My bets
  → Coins (`lib/ledger/my-transactions.ts`), keyset-paged on
  `coin_transactions_profile_created_idx` and worded for them. It isn't
  published for realtime, so that tab follows the member's own `profiles`
  row, whose balance moves with every coin row.

**Markets and bets**

- `markets`: title, description, kind (`binary`, `multiple_choice`,
  `over_under`), `line` (Over/Under only), `close_at`, status (`open`,
  `resolved`, `voided`), `seed_per_outcome` (20 DC by default),
  `current_resolution_id` and `edited_at`.
- `market_outcomes`: labels and `pool_total`, the real DC bet on each.
- `bets`: live stakes only. A cancelled bet moves to `cancelled_bets`.
- `market_resolutions`: each resolution or override, with its required
  note, `actual_value` for an Over/Under, and a link to the one it
  replaced.
- `market_edits`: every title or description change, readable by all
  members.
- `market_comments` (0053): a market's thread. `body` is at most 280
  characters (`TEXT_LIMITS.commentBody`). Members insert their own; the
  author, or an admin or the owner, deletes one through
  `delete_market_comment`, a soft delete that empties `body` and sets
  `deleted_at` and `deleted_by`. Members have no direct update or delete.
  Reads leave deleted rows out (`lib/social/comments.ts`), keyset-paged on
  `market_comments_market_idx`: the newest 50, shown oldest first, with
  "Show more" above for older ones (`?comments=`).
- `parlays` and `parlay_legs`: a stake, a status (`pending`, `won`, `lost`,
  `refunded`), and each leg's outcome with odds locked at placement.
- `idempotency_keys` (0047): one row per slip or balance-adjustment
  attempt, holding its result. Only `place_slip` and `adjust_balance` touch
  it, and the daily cron prunes rows older than a day.

**Tasks and proof**

- `tasks`: the Bible-study catalogue. Reward, whether it repeats (daily,
  weekly, monthly or yearly), active flag and `proof_required`.
- `task_completions`: submissions (`pending`, `approved`, `rejected`) with
  a note, one per task per period. `period_key` comes from
  `compute_period_key(period, at)`: `YYYY-MM-DD`, ISO `IYYY-"W"IW`, `YYYY-MM`
  or `YYYY`, read in `group_time_zone()` (America/New_York since 0054, UTC
  before). `my_task_streaks(p_at default now())` (0054, security definer,
  the caller's own rows) returns `task_id, streak, includes_current`: the
  run of consecutive periods with an approved completion ending in the
  current period or the one before, numbered by `period_index` (not
  callable by members). The Tasks page shows it as `StreakBadge` from two
  periods up.
- `proof_attachments`: files, photos and links attached to a submission or
  a resolution. The files live in the private `proof` storage bucket.

**Feed**

- `activity_events`: one row per feed item (bets, parlays, new markets,
  results, wins and approved tasks), kept in step by triggers (0035). The
  feed and member activity read only this table. `season_champion` (0051)
  is the one kind no trigger writes: `settle_season` inserts it, keyed
  `season:YYYY-MM`, so it has no source row and the DB tests' equivalence
  check against `activity_feed` leaves it out. `actor_id` cascades, so a
  champion's events go with their profile.
- `feed_reactions` (0053): one row per member, event and kind (`fire`,
  `pray`, `laugh`, `clap`), keyed `(event_id, profile_id, kind)` and
  cascading with the event and the member. Members insert and delete their
  own rows directly under RLS (`lib/social/reactions-actions.ts`); pages
  read a page of events' counts through `feed_reaction_counts(p_event_ids)`
  (security invoker, one row per event and kind with a `mine` flag),
  chunked with `chunk()` in `getReactions` (`lib/social/reactions.ts`). The
  feed and member activity show them as `ReactionBar`, optimistic through
  `useOptimistic`, since reactions move no coins.
- `activity_feed` (view): the old computed feed. It is kept only as the
  DB tests' oracle; members can't read it.

**Notifications** (0057)

- `push_subscriptions`: one row per subscribed device: `endpoint`
  (unique, https, at most 1024 characters), the device's `p256dh` and
  `auth` keys, `user_agent`, `created_at` and `last_success_at`. A member
  reads, inserts and deletes only their own rows; Settings saves through
  `save_push_subscription`, which also hands a shared device's row to
  whoever saves it with the same keys (the keys never leave the device).
  Endpoints must be on a known push service (`lib/push/subscription.ts`).
- `notification_prefs`: one row per member, `resolve_reminders`,
  `results` and `task_reviews` (default on) and `new_markets` (default
  off). No row means the defaults. Own row only, select, insert and update.
- `push_log`: what must go out only once, keyed `(kind, ref)`; today only
  `resolve_reminder` and `market_alert` per market. Service role only.

**Views for pages**

- `my_wagers`: keys for My bets, solo bets and parlays together
  (`bet:<id>`, `parlay:<uuid>`), bucketed open or settled.
- `stakes_riding` (0051, security invoker): one row per live stake, solo
  bets on open markets and pending parlays. `my_at_stake` (Home's At
  stake) and `leaderboard_net_worth` both read it, so they can't disagree.

### The functions that move coins

| Function | Who | What it does |
|---|---|---|
| `place_slip` | member | Places every solo bet and the parlay in the slip, all or nothing |
| `place_bet` / `place_parlay` | member | The single-bet and single-parlay versions `place_slip` builds on |
| `cancel_bet` | bettor | Refunds a bet before its market closes |
| `resolve_market` | after close, the creator or a reviewer with no stake; an admin any time | Needs a note; may take proof; pays winners from the seeded pool; an admin override reverses the old payouts first and is blocked if a past winner has already spent them. Nobody but an admin resolves a market they have a stake in (`has_stake_in_market`, 0046); `can_resolve_market` answers the same question for the page |
| `resolve_over_under` | same | Picks Over or Under from the actual number, then resolves |
| `void_market` | creator or admin | Refunds every bet; parlays drop the voided leg |
| `settle_parlay` | trigger | Runs when a leg's market resolves or voids |
| `submit_task_completion` | member | Submits a task with an optional note and proof |
| `approve_task_completion`, `reject_task_completion`, `review_task_completions` | reviewer+, never on their own submission | Pays or rejects submissions, one at a time or in bulk |
| `adjust_balance` | owner | A manual correction, with a required reason |

Also: `create_market`, `update_market` (creator or admin, before close; the
title is fixed once anyone else has bet), `member_emails` (admin only:
members can't select `profiles.email`), `member_activity` (admin only, 0050:
each member's join date, `profiles.created_at`, and last sign-in from
`auth.users`, for Admin → Members), `stray_proof_objects` (service role:
the daily cron deletes proof files nothing attached),
`set_member_role`, `delete_market`, `delete_task` and `remove_bet` (owner
only), `update_my_profile`, `record_proof`, `market_sparklines` (the
cards' 40-point sparklines and the market chart's 200 points, sampled in
SQL so no page reads every bet; both prepend a seeded market's even
opening split through `withSeededStart`, since the function returns points
only at bets),
`markets_to_resolve` (0049, security invoker: the closed, unresolved
markets waiting on the caller, capped at 10 with an uncapped `total`; a
creator's own at once, and for reviewers and admins any left 48 hours or
whose creator has a stake, always filtered through `can_resolve_market`;
a close fires no database change, so Home's `RefreshAt` refreshes it at
the next moment the list could grow, from `nextResolveCheckAt`),
`my_at_stake` and `parlay_limits`.

Push recipients (0057) come from service-role-only functions, so members
can't call them: `push_wants(profile, kind)` (still invited, a device
subscribed, the kind not turned off), `push_resolve_reminders()` (closed,
unresolved markets whose creator may resolve them, claimed in `push_log`
as they're returned), `push_market_result(market)` (every solo bettor and
parlay-leg holder, with their payout and refund from the current
resolution; cancelled bets live elsewhere, so never count),
`push_task_reviews(ids)` and `push_new_market(market)` (everyone but the
creator who opted in). Review alerts (0058) add `push_task_alerts(completion)`
(reviewers and above except the submitter, `review_alerts` on) and
`push_market_alerts()` (admins and above except the market's creator, who has
the reminder, `resolve_reminders` on; each market claimed once as `market_alert`).
`my_review_counts()` (security invoker) counts what waits on the caller: other
members' pending task submissions for a reviewer and above, closed unresolved
markets for an admin and above.

The leaderboard (0051) reads two boards through `rpc()`, each returning
`id, display_name, avatar_path, score, rank` with a competition rank over
every member, computed before PostgREST applies the page's filters, and
paged by `readOrdered` with `RANK_ORDER` on `(score desc, display_name,
id)`. `leaderboard_net_worth` (security invoker) scores balance plus
`stakes_riding`, summed once for the board; the member page and Home's rank
read the same function through `getMemberStanding`. `leaderboard_month`
(security definer, invited members only) scores this month's
`season_profits`: the net of the betting ledger types (`bet_*`,
`parlay_*`, `resolution_reversed`) between midnights in America/New_York,
leaving out `starting_grant`, `task_completed`, `admin_adjustment` and any
type added later; since 0055 that list is `betting_ledger_types()`, shared
with `member_stats`. `settle_season(p_month default last month)` (service role
only) posts a finished month's top positive profit as a `season_champion`
event, ties going to whoever reached the total first.

**The economy panel** (0052, #86). `economy_summary(p_month_start)` is owner
only and backs the Economy card above Admin → Ledger's list
(`lib/economy/summary.ts`, `components/admin/economy-card.tsx`). It reports
the DC in circulation (balances, plus stakes in open markets' bets and
pending parlays) and, for the America/New_York month holding
`p_month_start`, the DC added and removed by source: starting grants, task
rewards, seed payouts, house-paid parlays and owner adjustments. Stakes,
cancels, voids and remove-bet refunds only move DC between a balance and
"at stake", so they count nowhere. A market's seed effect is measured at
each resolution: payouts less the real stakes at the first one, and new
payouts less the reversed ones at an override; it can be negative, since
the seed keeps part of the losers' stakes when they outweigh it, and
`floor()` keeps the fractions. A parlay's is its credit less its stake, so
a lost parlay removes its stake. `economy_flows` (callable by no member)
holds that classification, with every `coin_transactions` type listed in
the migration. The panel also checks the identity *all DC ever added less
all removed = in circulation*, and says so if it fails or if the ledger
holds a type it doesn't know.

**Member stats** (0055, #83). `member_stats(p_profile_id)` returns one row
for the member page's Stats card (`lib/members/stats.ts`,
`components/members/member-stats-card.tsx`, streamed behind its own
`<Suspense>`): settled solo bets and parlays won, lost and refunded; all-time
net betting profit; the biggest win (a current resolution's `bet_won` less
its stake, with the market); the best won parlay (its resolved legs' locked
odds multiplied, capped by `parlay_limits()`, and its payout); markets
created; and approved task completions. A solo bet counts as refunded when
its market was voided or resolved to an outcome nobody backed; cancelled
bets and open ones count nowhere. Net profit is `betting_ledger_types()`
summed over all time, the This month board's classification, so a stake
still riding counts as spent. It is security definer, because the ledger is
own-or-admin and net profit comes from it; it returns only aggregates, and
raises `not invited` (42501) for anyone else. Every branch is one grouped
pass over the member's own index entries (bets, parlays and the ledger by
profile, `markets_created_by_idx`, task completions by profile), with no
subquery per row, so 0055 adds no index.

### Migrations

Migrations are numbered in order, `0001`–`0057`, and none is ever edited
after it ships. They roughly follow the project's history:

| Range | What they add |
|---|---|
| 0001–0007 | Profiles, invites, the coin ledger, RLS |
| 0008–0016 | Markets, betting, resolution, overrides and voids |
| 0017–0024 | Tasks, periods, approvals and balance adjustment |
| 0025–0029 | Parlays |
| 0030–0036 | The social layer, realtime, scale work and the `activity_events` feed |
| 0037–0039 | Cancelling bets, profile editing, the unified slip |
| 0040–0045 | Roles, seeded odds, proof, Over/Under and market edits, My bets, At stake |
| 0046 | Security: parlay odds without your own stakes, no resolving with a stake, no self-review, a 500 DC task cap, hidden emails |
| 0047 | Attempt keys, so a retried slip or balance adjustment never acts twice |
| 0048 | Indexes for the markets list, a market's resolutions, a member's coin history and unindexed foreign keys |
| 0049 | Closing soon: `markets (status, close_at, id)` for the Open list's close-time order, and `markets_to_resolve()` for Home's nudge |
| 0050 | `member_activity`: join and last sign-in dates for Admin → Members, admins only |
| 0051 | Net worth and seasons: `stakes_riding` (shared with `my_at_stake`), `leaderboard_net_worth`, `season_profits`, `leaderboard_month`, `settle_season` and the `season_champion` feed kind |
| 0052 | `economy_summary`: the owner's economy panel on Admin → Ledger (supply in circulation, and this month's DC added and removed by source) |
| 0053 | Reactions and comments: `feed_reactions` and `feed_reaction_counts`, `market_comments` and `delete_market_comment`, both tables published for realtime |
| 0054 | Task periods in US Eastern time: `group_time_zone()`, `compute_period_key` read in that zone, stored keys recomputed from `submitted_at` where the one-active-per-period index allows; task streaks: `period_index`, `my_task_streaks` and an approved-only `(profile_id, task_id, period_key)` index |
| 0055 | Member stats: `member_stats` for the profile's Stats card, and `betting_ledger_types()`, 0051's betting types named once and shared with `season_profits` |
| 0056 | `weekly_recap(p_week)`: Home's weekly recap, one row of date-bounded aggregates for the Eastern week holding `p_week` |
| 0058 | Review alerts (#123): `notification_prefs.review_alerts`, `push_task_alerts`, `push_market_alerts`, the `market_alert` kind in `push_log`, and `my_review_counts` for the Admin badge |
| 0057 | Push notifications: `push_subscriptions`, `notification_prefs`, `push_log`, `save_push_subscription` and the service-role `push_*` recipient functions |

Merging a migration to `main` runs the **Deploy Production Database**
workflow. It runs in parallel with Vercel's deploy, so a build that needs
a new migration runs that workflow on its branch before merging.

## Key flows

**Signing in.** Google OAuth only; Supabase has every other provider
switched off. `/callback` exchanges the code, and a member whose email
isn't in `allowed_emails` lands on `/not-invited`. The `profiles` trigger
creates the profile and the 100 DC starting grant. `requireUser` reads
claims and throws `AuthUnavailableError` (not "signed out") when Auth
itself is down.

**Betting through the slip.** An outcome's "Add to slip" writes a cookie
of picks (`lib/parlays/slip.ts`). `SlipProvider` in the signed-in layout
holds those picks, each marked Solo or Parlay, with optimistic add, remove
and mode switches. Stakes live only in client state. The layout also
hands it the member's balance, for the quick-stake chips' Max (the balance
less the slip's other stakes). The floating
`SlipSheet` sends everything to `place_slip` in one call; it either all
succeeds or nothing is placed. Only its button is in every page's first
load: the drawer (`SlipDrawer`) loads the first time the slip opens, or
when the button is pointed at or focused. Bets are never optimistic. Each place sends
an attempt key, kept until a place succeeds: if the bets commit but the
answer is lost, the slip says so, and tapping Place again returns the first
result instead of placing twice (0047). `adjust_balance` takes a key the
same way.

**Duplicating a market.** Duplicate links to `/markets/new?from=<id>`. The
page reads that market with the member's own client, so RLS decides what
can be copied, and an unknown or unreadable id opens a blank form. The
form moves the original close time on by at least one whole week in the viewer's own
time zone (`lib/markets/weekly-close.ts`), so a weekly market keeps its
local time across a DST change. Nothing is written until the form is
submitted through `create_market` as usual.

**Odds.** Pari-mutuel with a seed. A parlay leg locks its odds from
everyone's money but the bettor's own (0046), and the slip previews the
same number. Each outcome's pool counts
`seed_per_outcome` virtual DC on top of real stakes, so a new market
already shows even odds, and one-sided betting never pays 1.00×.
`effectivePools` in `lib/markets/odds.ts` is the one place the app does
this sum. It matches `resolve_market`, so the percentages, charts, payout
estimates and My bets results all agree with what's actually paid.
Parlay legs lock their odds at placement, and parlays are paid by the
house, not from market pools (the #51 decision).

**Resolution and proof.** The resolve form needs a reason and can carry
photos, files and links. Submitting it opens a confirmation naming the
winner (and, for an override, that earlier payouts are reversed); only its
button runs the action (`ConfirmSubmitDialog`). Balance adjustments and
role changes ask the same way. Files upload straight from the browser to the
private `proof` bucket (`lib/proof/upload.ts`), then `record_proof`
checks the paths when the RPC runs. Pages show proof through short-lived
signed URLs made with the viewer's own session.

**Live updates.** A page declares the tables it shows with
`<LiveTables subscriptions={pageSubscriptions.x(…)}>`. `LiveRefresh` keeps
a long-lived channel on the member's own profile, which carries their
balance and avatar, plus a per-page channel. A change to a subscribed
table triggers `router.refresh()`, so the server re-renders with fresh
data. Twelve tables are published (`LIVE_TABLES`). A filtered channel never
receives a DELETE, so a page that must hear one either watches the table
unfiltered (the feed and member activity watch `feed_reactions` that way,
since taking a reaction back is a delete) or has the delete write
something it can hear: a cancelled bet inserts into `cancelled_bets`, and a
deleted comment is an UPDATE, which the market page's channel filtered to
its market receives.

**Long lists.** Keyset pagination (`lib/pagination`) with "Show more".
Each list keeps its place in URL cursors, jumps to a fresh window after
500 rows, and moves focus to the first new row. Every `.in()` lookup that
grows with the data is split into chunks.

**Installed app and offline.** The manifest and iOS splash screens make
it installable. On a cold start of the installed app, `LaunchScreen`
grows the leaves onto the splash's D, using only CSS and a small inline
script. `public/sw.js` is hand-written. It caches only the content-hashed
`/_next/static/` files and a precached `/offline` page, which it serves
when a navigation can't reach the network. Each deploy gets its own cache. It never caches per-member HTML, RSC
payloads, server actions or Supabase responses. Pages slide in with
React's `<ViewTransition>`, drill-down pages support a back swipe, and
each signed-in route has a skeleton.

**Push notifications** (#80). Settings' Notifications card
(`app/(app)/settings/notification-settings.tsx`) asks for permission,
subscribes this device's service worker with the VAPID public key, and
saves the subscription (`lib/push/actions.ts`); its "on" state is this
device's `pushManager.getSubscription()` matching one of the member's
saved endpoints. Its four checkboxes save `notification_prefs`. Sending is
server-only (`lib/push/send.ts`, `web-push`): it reads the recipients'
subscriptions with the service-role client, sends up to six at a time, and
deletes a subscription whose push service answers 404 or 410. It never
throws; failures are logged. Resolving, overriding, voiding, approving
or rejecting a task and creating a market call `afterAction()`
(`lib/push/notify.ts`), which runs the send through Next's `after()`, so
the member's action never waits on it; the recipients are read from the
database once the RPC has committed. The daily cron sends the reminders
to resolve. Submitting a task alerts reviewers at once (`notifyTaskSubmitted`).
A market closing is only the clock passing, so `/api/cron/closing-alerts`
(`sendClosingAlerts`: the creator's reminder and the admins' alert) is called
every ten minutes by `.github/workflows/closing-alerts.yml`, which needs the
`CRON_SECRET` repository secret (Vercel Hobby cron runs once a day, and the
daily keep-alive still calls the same function as a backstop). The signed-in
layout reads `getReviewCounts` for the Admin button's badge, follows
`task_completions` (and `markets` for admins) live, and refreshes at the next
market close. The wording is `lib/push/messages.ts`: payloads are `{ title,
body, url }`, with an in-app `url`. The OS already names the app, so the
title says what happened ("New market", "You won 26 DC") and the body
carries the detail. `public/sw.js` shows them
on `push` and, on `notificationclick`, focuses an open window and
navigates it, or opens one; it adds no caching. Without both VAPID keys
(local dev, CI, tests) nothing is scheduled or sent, the cron claims no
reminders, and Settings says notifications aren't available here. iOS
offers web push only to an app on the Home Screen (16.4+), so there the
card says to install first.

**Settings.** Theme, haptics and reduced motion are cookies. The root
layout renders them as attributes on `<html>` (`data-theme`,
`data-haptics`, `data-motion`), so they apply before any script runs.
`motion-reduce:` in CSS covers both the device setting and the app's own.

**Getting started.** Home's onboarding card (`components/home/onboarding-card.tsx`)
reads its three steps from real data in `lib/home/onboarding.ts`, with
head-only counts: a photo (`profiles.avatar_path`), any bet or parlay
(`bets`, `cancelled_bets`, `parlays`) and any task submission. It hides
itself once all three are done. Dismissing it sets the `onboarding`
cookie, which skips those reads, so it never flashes back.

**Weekly recap** (0056, #81). On Sundays and Mondays in America/New_York,
Home shows `components/home/weekly-recap-card.tsx`. `lib/home/recap-week.ts`
works out the day and the week from the server's clock in that zone (Sunday:
the week so far; Monday: the same week, finished), and `getWeeklyRecap`
(`lib/home/recap.ts`) skips the call on any other day. `weekly_recap(p_week)`
is security definer, invited members only, and returns one row, each figure
read over an indexed one-week range: the caller's own betting net
(`betting_ledger_types()`) and task income from `coin_transactions`; the best
call (largest payout less stake on a solo bet) and the biggest upset (lowest
effective-pool chance of a winner, under 50%, on a market with real stakes)
from the `bet_won` and `market_resolved` events in `activity_events`, so an
overridden result doesn't count; the most approved `task_completions`; and
open markets closing the following week (first three and a total). The card
leaves out empty lines and hides when every one is empty.

## Environments and deploys

- **Local:** Docker Supabase (`npm run db:start`) is the only dev and test
  database. DB tests refuse to run against anything but localhost.
- **Production:** one Vercel project and one hosted Supabase project.
  Vercel preview deploys are off on purpose (see the README).
- **CI** (`.github/workflows/ci.yml`): lint, the type check, a
  generated-types drift check, Vitest (the `unit` project in parallel, the
  `db` project serially), a production build and Playwright on every push
  and PR, all against a throwaway local Supabase.
- **Database deploys** (`.github/workflows/deploy-production-db.yml`): a
  dry run, then the push behind the `production-db` environment's approval,
  one at a time.
- **Typed queries:** `lib/supabase/database.types.ts` is generated from the
  migrations and never edited; `lib/supabase/database.ts` wraps it
  (`Database`, `DbClient`) and marks the few function arguments that take a
  real null. Every client and helper uses `DbClient`.
- **Security headers** (`next.config.ts`): a Content Security Policy that
  only allows scripts and connections to the app itself and its Supabase
  project, plus `X-Frame-Options: DENY`, `nosniff` and a referrer policy. A
  new third-party origin (analytics, an image host) has to be added to the
  CSP there.
- **Required env vars** are checked at boot (`lib/env/required.ts`):
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  always; `SUPABASE_SECRET_KEY`, `CRON_SECRET`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in production.
