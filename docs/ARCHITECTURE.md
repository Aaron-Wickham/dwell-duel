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
  ├─ Realtime: 13 published tables drive live page refreshes
  └─ Storage: `avatars` (public), `proof` (private, signed URLs)

Web push: server actions, pg_cron (every minute, via pg_net) and the daily
cron → web-push (VAPID) → the browser's push service → public/sw.js shows
the notification
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
| UI pieces | Base UI (dialogs, drawers), lucide-react icons, Motion (loaded lazily), NumberFlow, Recharts (the market page's chart and the leaderboard's race chart; cards draw plain SVG), sonner toasts |
| Data | Supabase: Postgres, Auth, Realtime, Storage (`@supabase/ssr`) |
| Hosting | Vercel (production only, plus a daily cron), with `@vercel/analytics` and `@vercel/speed-insights` |
| Tests | Vitest (unit, component, DB against local Supabase), Playwright (e2e) |

## Routes

Signed-in routes live under `app/(app)/`, which share one layout: the nav,
the slip, live updates and toasts. `lib/auth/app-paths.ts` lists them so
`proxy.ts` can redirect signed-out visitors (a test keeps the two in step).

| Route | What it is |
|---|---|
| `/` | Home: greeting, balance hero (balance, rank, At stake, Pending), a new member's Getting started card, Markets to resolve, the weekly recap (Sundays and Mondays), tiles |
| `/markets` | Open markets as cards with sparklines, soonest to close first (a "Closes in 2h" chip inside a day), then resolved and voided newest first, each paged. `?status=all|open|awaiting|resolved` (`lib/markets/status-filter.ts`, which also maps the old `pending` and `closed` to awaiting and resolved) narrows it: open and awaiting read the open list split at the close time (`listOpenMarkets`' `bound`), resolved reads only the resolved list (`listResolvedMarkets`, voided included) |
| `/markets/new` | Create a market: Yes/No, multiple choice (up to 6) or Over/Under. `?from=<id>` pre-fills it from a market (Duplicate) |
| `/markets/[id]` | A market: chart, outcomes, the slip controls, bets, comments, resolve/void/edit, share and duplicate, resolution proof |
| `/bets` | My bets: Open · Settled · Cancelled, solo bets and parlays together, and Coins, the member's own `coin_transactions` (`?tab=`) |
| `/parlays` | Redirects to `/bets` (kept for old links) |
| `/parlays/[id]` | A parlay's breakdown (#120): status, stake, multiplier and payout, each pick with its odds (an estimate from `parlay_leg_odds` until its market closes) and result, and how the multiplier adds up. Any invited member can open one; My bets' cards link here. No `loading.tsx`: the page checks the parlay exists first (so an unknown id is a real 404), then streams the body behind `<Suspense>` with `ParlayDetailSkeleton` |
| `/tasks` | Bible-study tasks to submit, with optional or required proof |
| `/feed` | Everyone's activity, with reactions, live |
| `/leaderboard` | Net-worth ranks, and This month's betting profit (`?tab=month`) |
| `/members/[id]` | A member's profile, stats and activity; your own adds Edit profile and Settings |
| `/profile` | Edit your name, photo and bio |
| `/settings` | Theme, your profile, haptics, reduced motion, notifications, How it works, sign out |
| `/how-it-works` | The rules, rendered from `docs/HOW-IT-WORKS.md` (read by `lib/docs/how-it-works.ts`, shipped by `outputFileTracingIncludes`, parsed by `lib/docs/markdown.ts`) |
| `/admin/invites` · `/admin/tasks` · `/admin/markets` · `/admin/members` · `/admin/ledger` | Admin sections, shown by role; Tasks and Markets carry their share of the Admin badge as a count (`my_review_counts`), Markets lists every closed market with no result, oldest first (`lib/admin/markets-awaiting.ts`, #243); the ledger opens with the owner's Economy card |

Public routes live under `app/(auth)/`: `/sign-in`, `/callback` (the OAuth
return), `/not-invited` and `/offline`. The API has three routes.
`/api/cron/keep-alive`, which a daily Vercel cron calls so the free
Supabase project never pauses. It also deletes unattached proof files and
attempt keys older than a day, expires reviewed proof, removes avatar files
no profile points at, reports Storage use (#253, below), calls `settle_season()` to post last
month's champion to the feed (a no-op once it's posted), and runs
`sendClosingAlerts`, the daily backstop for the closing alerts: both the
creator's reminder to resolve and the admins' alert for a closed market
with no result. Both cron routes declare `maxDuration = 60`.
It runs at 05:15 UTC (`vercel.json`), not midnight: `settle_season`
defaults to the month before today's *Eastern* date, and midnight UTC is
still the previous evening in Eastern time, so a run then settled the
month before last and September's champion only posted on October 2
(#197). Any hour from 05:00 UTC is past midnight Eastern under EST and
EDT alike; `tests/lib/deploy/keep-alive-schedule.test.ts` guards it.
The other, `/api/cron/closing-alerts`, sends the same closing alerts from
Supabase's `pg_cron`: within a minute of a market closing, and at least every
ten minutes otherwise (the heartbeat, see Notifications). A second `pg_cron`
job, `cron-history-cleanup` (0065), prunes `cron.job_run_details` older than
a week each morning.
The third, `/api/health`, is for an external uptime monitor: one service-role
read of one row, `200 {"ok":true}` when Supabase answers and `503` when it
doesn't, `Cache-Control: no-store`, no member data, and outside the proxy
(`proxy.ts`'s matcher) so it doesn't depend on Auth.

The daily keep-alive runs its steps independently (database touch, proof
cleanup, proof retention, avatar cleanup, storage usage, key cleanup, season
settle, resolve reminders): a failing step is
logged, captured and named in the response, the rest still run, and the
route answers 502 at the end if any failed (#259). It then pings the
heartbeat, below.

## Code layout

```
app/            routes (see above), globals.css, manifest, error pages
components/     UI by area: admin, app-nav, app-shell, brand, docs, feed, home,
                leaderboard, live, markets, members, nav, not-found, offline,
                parlays, proof, slip, tasks, ui (shared primitives: Page,
                SectionCard, Button, Field, SubNav, ShowMore, EmptyState,
                Skeleton…)
lib/            logic by area: admin, app-shell, auth, bets, docs, economy, env,
                errors, forms, home, invites, ledger, live, markets, members, nav,
                offline, pagination, parlays, preferences, profile, proof, push,
                social, supabase, tasks, theme, toast, ui…
supabase/       migrations/00NN_*.sql, config.toml
tests/          components/, lib/, db/ (Vitest), plus e2e/ (Playwright)
scripts/        generate-splash.mjs, generate-favicons.mjs, ios-standalone-check.mjs
                (npm run check:ios), seed-scale.mjs
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
  the invitee yourself (`lib/invites/invite-message.ts`). An admin may delete
  only an unclaimed row (`admin_delete_invites`, 0073); a claimed one goes
  only through `remove_member`. Members' insert grant covers only `email` and
  `invited_by`, which defaults to and must equal the caller; `claimed_by` is
  the profile trigger's alone.
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
  `current_resolution_id`, `edited_at`, `void_reason` (0073: required by
  `void_market`, at most 500 characters, `TEXT_LIMITS.voidReason`; null for
  older voids), `settled_at` (0066: when it
  left `open`; the Resolved list's order and a voided chart's shaded zone) and
  `sparkline` (0070): the card's
  40-point series, written by a trigger the moment the market resolves or
  voids (`cache_market_sparkline`, so `resolve_market_core` and
  `void_market` needn't know), null while it's open. `/markets` reads it for
  settled markets and only computes open ones live (#204).
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
  `refunded`), the multiplier cap it settles under (`max_multiplier`, 0074:
  20, or 100 for one settled before), whether its legs are priced at close
  (`odds_at_close`), and each leg's outcome with its odds (`locked_odds`):
  null until the leg's market closes or settles, then set once by
  `settle_parlay`. Parlays placed before 0074 locked every leg at placement
  and keep those odds.
- `market_resolutions.payout_seed` (0074): the seed per outcome the
  resolution's payouts counted, the market's seed before 0074 and 0 since,
  so history (My bets, the feed oracle) reads what was paid.
- `idempotency_keys` (0047): one row per slip, balance-adjustment or
  create-market attempt, holding its result. Only `place_slip`,
  `adjust_balance` and `create_market_v2` touch it, and the daily cron
  prunes rows older than a day. Comments and tasks, which return nothing,
  carry the key as a unique `attempt_key` column instead (0083), and their
  actions treat a repeat as success. `useOffline` replays any action whose
  response was lost, so every action that creates something takes a key;
  forms hold it with `useAttemptKey` (`lib/forms/attempt-key.ts`), which
  starts a new one when the submitted fields change.

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
  results, voids, wins and approved tasks), kept in step by triggers (0035). The
  feed and member activity read only this table. `season_champion` (0051)
  and `market_voided` (0073) are the kinds no trigger writes: `settle_season`
  inserts the first, keyed `season:YYYY-MM`, and `void_market` the second,
  keyed `void:<market id>`, with the reason read from `markets.void_reason`.
  Neither has a row in `activity_feed`, so the DB tests' equivalence check
  leaves them out. `actor_id` cascades, so a champion's events go with
  their profile. `FeedList` skips any kind missing from its `EVENT_ICONS`,
  so a kind added by a migration can't break a build that predates it.
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
  `auth` keys, `user_agent`, `created_at`, `last_success_at`, and
  (0076) `failure_count` and `first_failed_at`, the current streak of failed
  sends. `record_push_results(delivered, failed)` (service role) resets a
  delivered device's streak, extends a failed one's, and deletes a device
  that has failed five sends in a row with the first over 24 hours ago, or
  is failing with no delivery for 60 days and its first failure is over 24
  hours old too. Only failures the device caused are ever passed to it.
  One failure counts per market attempt, not per run. A member
  reads and deletes only their own rows and has no insert grant (0067);
  Settings saves through `save_push_subscription`, the only writer, which
  also hands a shared device's row to whoever saves it with the same keys
  (the keys never leave the device). An endpoint must be on a known push
  service: the `push_subscriptions_endpoint_push_service` check calls
  `is_push_endpoint`, whose hosts (`push_hosts()`) mirror
  `lib/push/subscription.ts`'s `PUSH_HOSTS`, a DB test keeping them
  equal, and `sendPush` checks again before every send.
- `notification_prefs`: one row per member, `resolve_reminders`,
  `results` and `task_reviews` (default on) and `new_markets` (default
  off). No row means the defaults. Own row only, select, insert and update.
- `push_log`: what must go out only once, keyed `(kind, ref)`; today only
  `resolve_reminder` and `market_alert` per market. Service role only.
- `cron_heartbeats` (0061): when each scheduled job last ran without an
  error, one row per `name` (today only `closing-alerts`). Written only by
  the service role through `record_cron_heartbeat(p_name)`, which uses the
  database's clock; admins and the owner can read it.

**Views for pages**

- `my_wagers`: keys for My bets, solo bets and parlays together
  (`bet:<id>`, `parlay:<uuid>`), bucketed open or settled.
- `stakes_riding` (0051, security invoker): one row per live stake, solo
  bets on open markets and pending parlays. `my_at_stake` (Home's At
  stake) and `leaderboard_net_worth` both read it, so they can't disagree.

### The functions that move coins

| Function | Who | What it does |
|---|---|---|
| `place_slip_v2` | member | Places every solo bet and the parlay in the slip, all or nothing, and returns what it placed and whether the call was a replay (`place_slip` wraps it for the previous build) |
| `place_bet` / `place_parlay` | member | The single-bet and single-parlay versions `place_slip` builds on. `place_parlay` refuses a leg on the bettor's own market or one without the floor of other members' money (`parlay_limits()`), a stake over the payout cap, and a parlay that would take the member's pending parlays on any of its markets past `max_payout` of possible payout (`parlay_max_payout`); its legs have no odds yet (0074) |
| `cancel_bet` | bettor | Refunds a bet before its market closes; near the integer ceiling, `cancelled_bets` records the refund the balance could take (`refund_room`, 0074) |
| `resolve_market` | after close, the creator or a reviewer with no stake; an admin any time | Needs a note; may take proof; pays winners their share of the real pool (`pool_payout`, 0074: the seed is never paid; everyone is refunded when the winning pool is empty); an admin override must name a different outcome (0066), reverses the old payouts first and is blocked if a past winner has already spent them. Stamps `settled_at` on the first resolution only. Nobody but an admin resolves a market they have a stake in (`has_stake_in_market`, 0046); `can_resolve_market` answers the same question for the page |
| `resolve_over_under` | same | Picks Over or Under from the actual number, then resolves |
| `void_market` | before close, the creator; an admin any time | Needs a reason (0073), stored in `void_reason` and posted to the feed as `market_voided`; refunds every bet; parlays drop the voided leg; stamps `settled_at`. `p_reason` defaults to null only so the previous build's call is refused cleanly |
| `settle_parlay` | trigger | Runs when a leg's market resolves or voids. Sets the odds of each leg whose market has closed or resolved (`pick_quote` for the owner, once), then pays at most `max_multiplier` and `parlay_limits().max_payout` (or the stake, if larger) |
| `remove_bet` | owner | Refunds any member's bet before its market closes (0074; it used to allow it until resolution) |
| `apply_coin_transaction` | none (definer functions only) | Writes a ledger row and moves the balance; a credit is cut to what the balance can hold under the integer ceiling, and one cut to nothing writes no row (0074) |
| `submit_task_completion` | member | Submits a task with an optional note and proof |
| `approve_task_completion`, `reject_task_completion`, `review_task_completions` | reviewer+, never on their own submission | Pays or rejects submissions, one at a time or in bulk |
| `adjust_balance` | owner | A manual correction, with a required reason |

A creator's or author's own-row branch (resolving, voiding or editing their
market, deleting their comment) checks `is_invited()` as well (0073), as the
role branches already do through `has_role`; `tests/db/definer-writers.test.ts`
fails on any member-callable security definer writer that neither checks the
invite nor is listed there as role-gated or delegating.

Also: `create_market`, `update_market` (creator or admin, before close; the
title is fixed once anyone else has bet, solo or as a parlay leg, 0065), `member_emails` (admin only:
members can't select `profiles.email`), `member_activity` (admin only, 0050:
each member's join date, `profiles.created_at`, and last sign-in from
`auth.users`, for Admin → Members), `stray_proof_objects` (service role:
the daily cron deletes proof files nothing attached), `expired_proof_attachments`,
`mark_proof_expired`, `stray_avatar_objects` and `storage_usage` (service role,
0089), `proof_upload_quota_ok` and `avatar_upload_quota_ok` (the upload policies' per-day caps: 30 proof files / 60 MB, 10 avatars), `proof_is_attached` (the delete guard, security definer),
`set_member_role`, `delete_market` (refuses a market with any bet, cancelled
bet or parlay leg; the market page shows the button only when the pool is
empty and `lib/markets/bet-history.ts`'s two head counts find nothing),
`delete_task`, `remove_bet` and `remove_member` (owner only; 0068: back to
member, `allowed_emails` row and push subscriptions gone, coins and bets
untouched; 0073: their `auth.sessions` too, so no device can refresh), `update_my_profile`, `record_proof`, `market_sparklines` (the
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
`my_at_stake`, `parlay_limits`, `pick_quotes(outcome_ids)` and
`parlay_leg_odds(parlay_ids)` (0074: a pick's leg odds and floor for the
caller, and each parlay leg's set or estimated odds for its owner, both built on the service-only `pick_quote(profile, outcome)` that
`settle_parlay` prices with), and from 0071 (#206, #210)
`my_current_task_completions()` (security invoker: the newest completion of
the current period per task, filtered in SQL with `compute_period_key`, so
the Tasks page reads O(tasks) rows and no period keys), `my_onboarding()`
(Home's three checklist booleans in one row) and `member_standing(profile)`
(one member's net worth, rank and the board's size, the same maths as
`leaderboard_net_worth` without ranking the whole board).

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
Since 0071 (#207) the closing alerts read `due_resolve_reminders()` and
`due_market_alerts()` instead, which pick the same recipients but claim
nothing; the route sends one market at a time and claims through
`claim_push_log(kind, refs)` only the markets at least one device took, so
a failed push is due again next run. The two claiming functions stay until a
later migration drops them.
`my_review_counts()` (security invoker) counts what waits on the caller: other
members' pending task submissions for a reviewer and above, closed unresolved
markets for an admin and above.

The leaderboard's extras (0059, `lib/social/leaderboard-extras.ts`) sit on the This month tab and the rows: `leaderboard_race_steps(p_top)` (0062: the top members' running profit from the month's first settled bet, one step per moment a total moved, capped at 120 steps; drawn by `RaceChart` as step lines, with `race-layout.ts` choosing the scale, clipping a runaway leader or last place and placing the end labels; the chart is a keyboard slider over the moments with a polite live region reading out the totals), `leaderboard_awards()` (four awards for the month), `member_records(ids)` (the W-L chip, read for the page's rows in chunks) and the past champions from the `season_champion` events. The top of either board also shows a `Podium`.

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
rewards, seed payouts (older results only), payout rounding, house-paid
parlays and owner adjustments. Stakes, cancels, voids and remove-bet
refunds only move DC between a balance and "at stake", so they count
nowhere. A market's resolution is measured at each event: payouts less the
real stakes at the first resolution, and new payouts less the reversed ones
at an override. Since 0074 winners split the real pool, so for a
resolution that counted no seed (`payout_seed` = 0) that only ever leaves
the fractions `floor()` keeps: *payout rounding* (an override can pay some
back). An event that pays or reverses a resolution from before 0074, which
counted the seed, stays under *seed payouts*, so older results' seed, and
an override taking it back, still show; the card hides that row in a month
with none. A parlay's is its credit less its stake, so
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
its stake, with the market); the best won parlay (its resolved legs' odds
multiplied, capped by its own `max_multiplier`, 0074, and its payout); markets
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

Migrations are numbered sequentially from `0001`, and none is ever edited
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
| 0057 | Push notifications: `push_subscriptions`, `notification_prefs`, `push_log`, `save_push_subscription` and the service-role `push_*` recipient functions |
| 0058 | Review alerts (#123): `notification_prefs.review_alerts`, `push_task_alerts`, `push_market_alerts`, the `market_alert` kind in `push_log`, and `my_review_counts` for the Admin badge |
| 0059 | Leaderboard extras (#121): `leaderboard_race`, `leaderboard_awards`, `member_records` (security definer, invited members only, aggregates only) |
| 0060 | Best parlay award (#146): `leaderboard_awards` computes Best parlay's multiplier as `member_stats` does (resolved legs' locked odds multiplied, capped), not credited / stake |
| 0061 | Cron heartbeat (#149): `cron_heartbeats` (service-role writes, admin reads) and `record_cron_heartbeat`, stamped by `/api/cron/closing-alerts` |
| 0062 | `leaderboard_race_steps` (#145): the race from the month's first settled bet, step by step, replacing `leaderboard_race`'s day-by-day points (a new function, so the old one keeps working during the deploy) |
| 0063 | Drops 0059's `leaderboard_race` (#176), unused since 0062 |
| 0064 | Closing alerts from `pg_cron` (#189): `pg_cron` and `pg_net`, `ping_closing_alerts()` (service role only) and the `closing-alerts` job every minute, calling the app only when a market has just closed or the heartbeat is over nine minutes old |
| 0065 | `update_market` counts other members' parlay legs as bets (#221); the daily `cron-history-cleanup` job, pruning `cron.job_run_details` older than a week (#210) |
| 0066 | `markets.settled_at` (#221), backfilled and indexed `(status, settled_at desc, id desc)`, stamped by `resolve_market_core` (first resolution) and `void_market`; `resolve_market_core` refuses an override to the current outcome (#198) |
| 0067 | Push endpoints allowlisted in SQL (#201): `push_hosts()`, `push_endpoint_host`, `is_push_endpoint` and the `push_subscriptions_endpoint_push_service` check; the direct INSERT grant on `push_subscriptions` goes, so `save_push_subscription` is the only writer |
| 0068 | Roles need an invite (#202): `my_role()` answers `member` unless `is_invited()`, so `has_role`, `is_admin` and every gate on them follow; `remove_member` (owner only) |
| 0070 | Speed at scale (#204, #205): `markets.sparkline` filled by the `cache_market_sparkline` trigger when a market resolves or voids (backfilled), `market_outcomes` in the realtime publication, and `parlays_pending_profile_idx` for `stakes_riding` |
| 0071 | `my_current_task_completions()` (#206); `due_resolve_reminders()`, `due_market_alerts()` and `claim_push_log()` for claim-after-delivery (#207); `my_onboarding()` and `member_standing()` (#210) |
| 0072 | `place_slip_v2` (#226): the slip's place returns what it placed (solo count, picks, parlay id) and whether the call replayed an earlier attempt's key, and stores that summary under the key; `place_slip` now wraps it and still returns the parlay id |
| 0073 | Permissions (#288, #289, #290): own-row branches of `resolve_market_core`, `can_resolve_market`, `void_market`, `update_market` and `delete_market_comment` need `is_invited()`; `remove_member` deletes the member's `auth.sessions`; `admin_delete_invites` only for unclaimed invites, and the invite insert grant narrowed to `email` and `invited_by` (the caller); `void_market(p_market_id, p_reason)` needs a reason (`markets.void_reason`, 500-character check), is admin-only after close and posts a `market_voided` feed event |
| 0074 | Parlay pricing and the seed (#287, #272): leg odds set at close or settlement from other members' real money, no seed (`pick_quote`, `pick_quotes`, `parlay_leg_odds`, nullable `parlay_legs.locked_odds`); a 50 DC from 2 members floor and no legs on your own markets; `parlay_limits()` gains `max_payout`, `min_leg_pool` and `min_leg_bettors`, the cap drops to 20×, a leg counts at most 5× and one member's pending parlays on a market can pay at most 1,000 DC (`parlay_limits()` gains `max_leg_odds`; `parlay_max_payout`); `parlays.max_multiplier` (pending parlays from before move to 20×) and `odds_at_close`; payouts are the real pool (`pool_payout`, `market_resolutions.payout_seed` backfilled for history); `apply_coin_transaction` cuts a credit to fit the balance and `refund_room` a refund; `remove_bet` stops at close; `leaderboard_awards` leaves out removed members; `economy_summary` splits payout rounding from older results' seed payouts |
| 0076 | Push failure pruning (#257): `push_subscriptions.failure_count` and `first_failed_at`, the service-role `record_push_results()`, `save_push_subscription` resetting the streak, and the closing-alerts lease (`cron_leases`, `claim_cron_lease`, `release_cron_lease`) and give-up counter (`push_attempts`, `record_push_failures`) |
| 0083 | `create_market_v2` (#258): `create_market` plus an attempt key, returning `{market_id, replayed}` so a replayed create returns the first market and skips its push; `create_market` now wraps it. `attempt_key` columns, unique where set, on `market_comments` and `tasks` |
| 0089 | Storage caps and retention (#253): proof bucket 3 MB and no Word files, a per-member daily upload quota, `record_proof` caps (5 attachments, 3 files, 6 MB), submitted proof can't be deleted, `proof_attachments.expired_at` with `expired_proof_attachments` / `mark_proof_expired`, `stray_avatar_objects`, `storage_usage` |

No migration 0069: #203's `search_path` pin on `market_sparklines` would stop Postgres inlining it into the caller's plan and lose its use of `bets_market_created_idx`, so it stays unpinned (invoker rights, every name schema-qualified). A DB test guards that no function `anon` or `authenticated` can execute calls into `net.*`, since pg_net's own grants can't be revoked from a migration.

Every merge to `main` runs the **Deploy Production** workflow, with no
approval step: a dry run against production, and when production is missing
any migration, an encrypted pre-migration backup and the push; then the app
deploy through a Vercel deploy hook. What's pending comes from production's
migration history, not the merge's diff, so a migration an earlier run
failed to apply goes out with the next. The app never goes live before its
migrations; a failed backup or migration fails the run and leaves the old
app live. Migrations stay additive anyway, because the old app is still
serving while they apply. CI fails a PR whose new migration isn't numbered
after `main`'s newest, since `db push` refuses one that sorts before
production's latest. Backups and restoring are in `docs/OPERATIONS.md`.

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
`SlipSheet` sends everything to `place_slip_v2` in one call; it either all
succeeds or nothing is placed. Only its button is in every page's first
load: the drawer (`SlipDrawer`) loads the first time the slip opens, or
when the button is pointed at or focused. Bets are never optimistic. Each place sends
an attempt key, kept until a place succeeds: if the bets commit but the
answer is lost, the slip says so, and tapping Place again returns the first
result instead of placing twice (0047). The key and the lost-answer
message live in `SlipProvider` with the stakes, not in the panel, because
closing the sheet unmounts the panel (#192). `adjust_balance` takes a key
the same way.

**Duplicating a market.** Duplicate links to `/markets/new?from=<id>`. The
page reads that market with the member's own client, so RLS decides what
can be copied, and an unknown or unreadable id opens a blank form. The
form moves the original close time on by at least one whole week in the viewer's own
time zone (`lib/markets/weekly-close.ts`), so a weekly market keeps its
local time across a DST change. Nothing is written until the form is
submitted through `create_market` as usual.

**Odds.** Pari-mutuel. Winners split exactly the real pool (0074):
`pool_payout()` in SQL, which `resolve_market_core` pays with, and
`poolPayout` / `soloPayout` in `lib/markets/odds.ts` and
`lib/parlays/odds.ts`, which the market page's "× payout per DC", the slip's
"Pays ~" and My bets (`betResult`) use; `tests/db/seeded-odds.test.ts`
keeps the two equal. The seed is display only: each outcome's chance
counts `seed_per_outcome` virtual DC on top of real stakes, so a new
market shows an even split, through `effectivePools` (mirrored by
`market_sparklines`). A resolution from before 0074 counted the seed in its
payouts, recorded as `market_resolutions.payout_seed`, so history still
reads what was paid.

Parlays are paid by the house, not from market pools (the #51 decision,
kept in 0074): one pool belongs to its solo winners, and a multi-leg win is
a joint event no single pool can fund. A leg's odds are set when its market
closes or settles, whichever comes first, from the final pool without the
parlay owner's own money and without the seed (`pick_quote`: others' total
÷ others' DC on the pick, to four places, at most `max_leg_odds` (5), or 1
when the market is under the floor or nobody else backed the pick). One
member's pending parlays with a leg on any one market can pay at most
`max_payout` between them, each counted at the most it could pay. Nobody can bet, cancel or remove a
bet after close, so that pool is final. Until then the slip and the parlay
views show `~` estimates from the same function (`pick_quotes`,
`parlay_leg_odds`). `parlay_limits()` holds the caps and the floor,
mirrored by `MAX_PICKS`, `MAX_MULTIPLIER`, `MAX_PAYOUT`, `MIN_LEG_POOL`,
`MIN_LEG_BETTORS` and `MAX_LEG_ODDS` in `lib/parlays/odds.ts`; `tests/db/seeded-odds.test.ts`
keeps them equal.

**Resolution and proof.** The resolve form needs a reason and can carry
photos, files and links. Submitting it opens a confirmation naming the
winner (and, for an override, that earlier payouts are reversed); only its
button runs the action (`ConfirmSubmitDialog`). Balance adjustments and
role changes ask the same way. Files upload straight from the browser to the
private `proof` bucket (`lib/proof/upload.ts`), then `record_proof`
checks the paths when the RPC runs. Pages show proof through short-lived
signed URLs made with the viewer's own session.

**Storage caps and retention (#253, 0089).** The free plan holds 1 GB across
the `proof` and `avatars` buckets, so the limits live in the database, not
only the browser. The `proof` bucket takes 3 MB a file and images, PDF and
plain text only. `proof_insert` also calls `proof_upload_quota_ok()`: at most
30 uploads and 60 MB per member per rolling day. `record_proof` takes at
most 5 attachments, 3 of them files, 6 MB of files together (read from
Storage's own object size, not the client's). `proof_delete_own` only lets a
member delete an upload no `proof_attachments` row holds (`proof_is_attached`, so RLS can't hide the row; `record_proof` and a unique index on `storage_path` keep one file to one attachment), so submitted proof
can't be removed. The browser shrinks photos to 1200px at quality 0.7 (WebP,
JPEG where WebP can't be encoded; `lib/proof/downscale.ts`) and mirrors the
caps in `lib/proof/types.ts`. The daily keep-alive runs three storage steps:
`proof retention` (`expired_proof_attachments(30, 90)` lists attachments of
task submissions reviewed over 30 days ago and of resolutions over 90 days
old; it removes the files, then `mark_proof_expired` stamps
`proof_attachments.expired_at` and keeps the row, and `toProofViews` /
`ProofList` show "expired" instead of a link), `avatar cleanup`
(`stray_avatar_objects`: avatar files over a day old that no
`profiles.avatar_path` names, which also covers a replaced avatar whose
remove failed) and `storage usage` (`storage_usage()`: its `storageMb` is in
the cron response, and the step fails, so the heartbeat pings `/fail`, past
800 MB). That is the ops check: when it fails, shorten the retention windows.

**Live updates.** A page declares the tables it shows with
`<LiveTables subscriptions={pageSubscriptions.x(…)}>`. `LiveRefresh` keeps
a long-lived channel on the member's own profile, which carries their
balance and avatar, plus a per-page channel. A change to a subscribed
table triggers `router.refresh()`, so the server re-renders with fresh
data. Thirteen tables are published (`LIVE_TABLES`; `market_outcomes`
since 0070, so `/markets` follows pools rather than every bet, and the
leaderboard follows only `markets`, never every profile, #204, #205). A filtered channel never
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
saved endpoints. A device that turned them on remembers it in
`localStorage` (`dd-push:<member id>`, `lib/push/client.ts`; cleared on
turning off and on sign-out), and `PushResync` in the signed-in layout uses
that on every load (#257): with permission still granted it re-makes a
subscription the browser dropped or made with an old VAPID key, and saves
the current one again when its endpoint changed or the server was last told
over a day ago (which also clears a failure streak). The service worker
handles `pushsubscriptionchange` too: it resubscribes with the old key and
posts the result to `/api/push/resync`, a JSON-only route that makes the same
save as Settings. A device turned on before this shipped gets its memory the
next time Settings is opened. Signing out deletes this device's subscription first
(`app/(app)/settings/sign-out-button.tsx`), so a shared phone's next member
never sees the last one's notifications. Its four checkboxes save `notification_prefs`. Sending is
server-only (`lib/push/send.ts`, `web-push`): it reads the recipients'
subscriptions with the service-role client, sends up to six at a time, and
deletes a subscription whose push service answers 404 or 410, and reports
failures to `record_push_results` (0076), which prunes a device that keeps
failing. Only a 4xx other than 404, 410 and 429 counts against a device, with one
rule for 401/403, which are the device's (a subscription made with an
older VAPID key) or ours (wrong credentials, which every device answers):
decided over the whole run. If the run delivered at least one push they
count against the device (and its market towards giving up); if it
delivered nothing they are systemic. `sendClosingAlerts` collects them in
a `PushRun` and settles them after both sends
(`settleCredentialFailures`); a lone `sendPush` call applies the same rule
to itself. `PushResult.systemic` counts what is never recorded (no
status, 429, 5xx, and 401/403 of a run that delivered nothing). It never throws; failures are logged. Resolving, overriding, voiding, approving
or rejecting a task and creating a market call `afterAction()`
(`lib/push/notify.ts`), which runs the send through Next's `after()`, so
the member's action never waits on it; the recipients are read from the
database once the RPC has committed. Submitting a task alerts reviewers at once (`notifyTaskSubmitted`).
A market closing is only the clock passing, so `/api/cron/closing-alerts`
(`sendClosingAlerts`: the creator's reminder and the admins' alert) is called
by the database (0064, #189): every minute `pg_cron`'s `closing-alerts` job
runs `ping_closing_alerts()`, which checks for a market that closed in the
last 15 minutes still missing either alert, or a heartbeat over nine minutes
old, and only then calls the route through `pg_net` with
the app's origin and `CRON_SECRET` from Supabase Vault (`app_url`,
`cron_secret`; set once in the SQL editor, never in a migration; without
them it does nothing, as locally and in CI). GitHub dropped most runs of a
ten-minute scheduled workflow, so `.github/workflows/closing-alerts.yml`
(the `CRON_SECRET` repository secret and the `APP_URL` repository variable)
is only a backup now; the route claims each market in `push_log` once a
device has its push (`claim_push_log`'s `on conflict do nothing`), so two
callers never repeat a push. Vercel Hobby cron runs once a day, so the
daily keep-alive calls `sendClosingAlerts` itself as the last backstop. Each
call that read its queue stamps `cron_heartbeats` (#149), whether or not its
pushes were delivered: a failed push is logged and counted in the response
(`failed`), not a 502 and not a missing stamp, so one broken device can't keep
the warning below on or make the backup workflow email (#257). A run that
delivered nothing while any failure was systemic (`systemic` summed over the
whole run, so a one-device group alarms too) returns 502 and leaves the stamp
alone. `sendClosingAlerts` also takes a lease
(`claim_cron_lease`, 120 seconds, table `cron_leases`) so overlapping callers
never double-send, and `deliverPerMarket` records a market whose devices all
rejected the push (and none of the failures systemic) in `push_attempts` (`record_push_failures`), which claims it in
`push_log` once its first failure is over 24 hours old. The
Admin layout shows admins and the owner a warning (`ClosingAlertsWarning`,
`lib/admin/cron-health.ts`) once the last stamp is over 30 minutes old or
missing. Only this route stamps it: the daily keep-alive doesn't,
so it can't hide a dead schedule. Without push keys nothing is sent, so the
warning never shows. The signed-in
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
Sonner only hears the device setting, so `globals.css` stills its toasts
under `data-motion="reduce"` itself.

**Motion.** Every curve and duration is a token in `globals.css`'s
`@theme static` block (`--ease-ios`, `--ease-pop`, `--duration-press` …
`--duration-sheet`), and `lib/ui/motion.ts` mirrors them for Motion and
WAAPI; `tests/lib/ui/motion.test.ts` keeps the two equal and rejects a
`cubic-bezier` anywhere else. The sliding pills (the desktop nav's and the
phone tab bar's, each a Motion `layoutId`, and SubNav's WAAPI one) share one
slide, `PILL_SLIDE` / `PILL_TRANSITION`: 280ms on the iOS curve.
The three dialogs share `components/ui/dialog-classes.ts`. `pressable`
shrinks every control on press and, under a mouse only, grows it; a
tappable card adds `hover-lift` and lifts onto `--lift-shadow`
instead, while a row or tile inside a card takes `hover-tint`, a flat panel with no lift (#244), its one link covering it through `stretched-link` (on touch; under a mouse the cover is off so text can be selected, and `CardLinkClick` opens the card on click unless a selection wins).

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

## Observability (#256)

Vercel Hobby keeps runtime logs for one hour, so prod errors go elsewhere.
Everything here is optional and off when its variable is unset, so a missing
value never stops production booting.

- **Sentry** (free tier; errors only, no tracing, replay or default PII).
  `NEXT_PUBLIC_SENTRY_DSN` turns it on; a DSN is public by design, which is
  why one variable serves server and browser, and it's inlined at build, so
  redeploy after setting it. Server: `instrumentation.ts` initialises the SDK
  on the Node runtime and exports `onRequestError`, capturing every
  uncaught error in a component, route, action or the proxy. Browser:
  `instrumentation-client.ts` loads the SDK lazily (global handlers only),
  and `useReportError` sends the render errors the error boundaries catch.
  Handled errors go through `reportError` (`lib/observability/report.ts`):
  `console.error` plus a capture, which `friendlyError`, the resolve and slip
  actions, the cron steps, the health route, the Admin health read and the
  sign-in callback use. `scrubEvent` removes the user, cookies, request body,
  headers and query string from every event. There are no source maps
  (no build plugin, no auth token). The CSP's `connect-src` allows
  `https://*.sentry.io`.
- **Raw database errors.** An RPC's own refusals are `raise exception`
  (SQLSTATE `P0001`, `isDeliberateRaise`) and reach the member as written;
  any other error from `resolve_market` / `resolve_over_under` /
  `place_slip_v2` (a timeout, a constraint, an aborted fetch) is reported
  and shown as "Something went wrong. Try again."
- **Admin health read.** `readClosingAlertsHealth` returns `{ unknown: true }`
  on a failed read; the banner then says it couldn't check, and every
  Admin page still renders.
- **Uptime.** Point an external monitor (UptimeRobot or Better Stack free,
  5-minute interval) at `/api/health` and at `/`.
- **Heartbeat.** `HEALTHCHECKS_KEEP_ALIVE_URL` is a healthchecks.io check's
  ping URL; the daily cron GETs it after its steps, or `<url>/fail` when any
  step failed, and healthchecks emails when a ping is late or fails. A failed
  ping never fails the cron. Give the check a 1-day period and a few hours'
  grace. `HEALTHCHECKS_CLOSING_ALERTS_URL` does the same for
  `/api/cron/closing-alerts` (a healthy run pings it, a 502 pings `/fail`);
  give that check a period of about 10 minutes and a grace of 30.
- **Scrub.** Events carry no breadcrumbs (console ones hold raw error
  objects, fetch ones Supabase query strings), and the query is stripped from
  the request URL and from `contexts.nextjs.request_path`. Tracing is off by
  omitting `tracesSampleRate`. The browser queues errors raised before the SDK
  has loaded (at most 10 per page load) and sends them once it has. The error
  card shows the digest as "Error code" so a member can quote it.

## Environments and deploys

- **Local:** Docker Supabase (`npm run db:start`) is the only dev and test
  database. DB tests refuse to run against anything but localhost. Local
  Google sign-in uses each developer's own OAuth client, read from
  `supabase/.env` (`docs/GETTING-STARTED.md`); CI sets none and doesn't sign in.
- **Production:** one Vercel project and one hosted Supabase project.
  Vercel preview deploys are off on purpose (see the README).
- **CI** (`.github/workflows/ci.yml`) runs on every PR (not on `main`: the
  ruleset requires a PR to be up to date, so the tested head is the merge
  result) as three parallel jobs: `static` (the migration-order check,
  lint, the type check), `db`
  (a throwaway local Supabase, the generated-types drift check, Vitest's
  `db` project, serially) and `web` (Vitest's `unit` project, a production
  build with `.next/cache` restored, Playwright against its own local
  Supabase). `ci-ok` needs all three and is the ruleset's one required
  check, with no bypass. Both Supabase jobs start the stack through
  `.github/actions/local-supabase`, which keeps Supabase's images in the
  Actions cache per CLI version (loaded before `supabase start`, saved
  after a miss): they come from AWS's public registry, whose anonymous data
  limit GitHub's runners share and hit (#238). A cache saved on a PR is scoped to that PR, so
  `.github/workflows/warm-caches.yml` saves it on `main` (when the setup
  changes, weekly, and by hand) for every PR to restore. Every third-party action is
  pinned to a commit SHA with its tag in a trailing comment
  (`uses: actions/checkout@<sha> # v7`); Dependabot's `github-actions`
  ecosystem (`.github/dependabot.yml`) keeps the SHA pins up to date in its
  weekly PR, so don't bump one by hand to a bare tag.
- **Deploys** (`.github/workflows/deploy-production.yml`): Vercel's Git
  integration is off for `main` (`vercel.json`'s `git.deploymentEnabled`).
  Each push to `main` runs the workflow instead, one at a time (waiting runs
  queue in order, `queue: max`) and with no approval step: a dry run against
  production; when anything is pending, `scripts/backup/backup.sh`'s
  encrypted dump and then the push; then, if the run's commit is still
  `main`'s head, a POST to the Vercel deploy hook in the
  `VERCEL_DEPLOY_HOOK_URL` secret. Every job runs only from `main` and takes
  its secrets from the GitHub `Production` environment, which only `main`
  may deploy to. With a `VERCEL_TOKEN` secret
  the run then polls Vercel's deployments API for this commit's production
  deployment and fails when it ends in ERROR or CANCELED, or isn't live
  within 15 minutes; without the token it says so and stops at the hook,
  and only Vercel's own email reports a failed build. GitHub's
  "failed workflows only" notification is what turns a failed migration,
  hook call, build or closing-alerts backup ping into an email. Redeploy by
  hand with "Run workflow" on it, from `main`.
- **Backups** (`.github/workflows/backups.yml`, `scripts/backup/`): a
  nightly `supabase db dump` of roles, schema and data (auth and storage
  rows included) and a weekly copy of the `proof` and `avatars` buckets,
  each age-encrypted and committed to the private `dwell-duel-backups`
  repo, 60 days kept (and always the newest 14 per folder). Each job first
  runs `mask-secrets.sh` as its own step, and `backup.sh` refuses to run in
  Actions without it. `docs/OPERATIONS.md` is the runbook.
- **Checking the installed app** (`npm run check:ios`,
  `scripts/ios-standalone-check.mjs`): Playwright has no standalone mode,
  so the installed iPhone app is checked in the iOS Simulator by hand before
  a release. The script builds and serves the app behind a small proxy that
  adds a measuring script to each page, points the simulator's installed
  DwellDuel web app (a `.webclip` whose URL is a plist value) at `--path`,
  cold-launches it with `simctl launch com.apple.webapp -webClipIdentifier`,
  and fails when the viewport is shorter than the screen (the 812 vs 874pt
  bug of #127). `--video` records the launch and writes ffmpeg contact
  sheets. Install the web app once from the simulator's Safari (Share ›
  Add to Home Screen); the script opens Safari and says how when it's missing.
- **Typed queries:** `lib/supabase/database.types.ts` is generated from the
  migrations and never edited; `lib/supabase/database.ts` wraps it
  (`Database`, `DbClient`) and marks the few function arguments that take a
  real null. Every client and helper uses `DbClient`.
- **Security headers** (`next.config.ts`): a Content Security Policy that
  only allows scripts from the app itself (and `va.vercel-scripts.com`, for
  Vercel Analytics and Speed Insights) and connections to the app and its
  Supabase project, plus `X-Frame-Options: DENY`, `nosniff` and a referrer policy. A
  new third-party origin (analytics, an image host) has to be added to the
  CSP there.
- **Required env vars** are checked at boot (`lib/env/required.ts`):
  `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  always; `SUPABASE_SECRET_KEY`, `CRON_SECRET`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in production.
