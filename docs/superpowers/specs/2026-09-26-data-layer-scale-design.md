# Data layer, scale and reliability — design

**Date:** 2026-09-26
**Status:** approved, not yet implemented
**Sub-project 8, PR A.** Sub-project 8 is "Speed, reliability and native feel", and it ships as two PRs:
- **PR B**, native feel, merged as #14 (`1935310`).
- **PR A** (this spec) covers the data layer and reliability.

**Where the list comes from.** The findings were audited on the Design Pass B branch. They were then re-verified against `main` at `1935310` after PR B merged. Every item below is still true at that commit unless it says otherwise. File and line references are to that commit.

## Goal

DwellDuel stays fast and correct well past today's friend group. The target is about 10× today: a few hundred members and tens of thousands of bets and ledger rows. It also fails gracefully instead of showing a blank crash screen, or sending members to sign-in when Auth hiccups. The work splits into five areas:
- **Database:** real indexes for real queries, access rules that run once per query rather than once per row, and resolution and void logic that can't deadlock or fail on a raw constraint error.
- **Correctness past 1,000 rows:**
  - no list silently drops rows at PostgREST's 1,000-row cap
  - no read builds a URL that grows with the data
  - long lists page with "Show more"
- **Resilience:**
  - error pages at every level
  - an Auth failure is no longer treated as "signed out"
  - network timeouts on every Supabase call
  - a keep-alive job with margin
- **Speed:**
  - independent reads run in parallel
  - one local sign-in check per request instead of two network calls
  - live updates re-render only the screens that show what changed
- **Clean-up:** no dead CSS generated from the docs folder.

## Non-goals (deferred)

- Replacing the `activity_feed` view with an events table. This PR adds indexes and removes the per-row access-rule overhead first.
- Database length limits on text fields. They need a UI pass for the error messages.
- A real 404 for malformed or unknown market links. Market detail keeps its soft 404 (200 + `noindex`) under its `loading.tsx`.
- Checking environment variables at startup.
- Realtime broadcast channels. Per-page Postgres Changes subscriptions are enough at the target scale.
- Allowing negative balances, or any clawback policy other than blocking.

## Decisions (from the user)

- **Scale:** build for "room to grow", about 10×. Defer the feed events table and anything beyond blocking for clawback.
- **Live updates:** each page listens only to what it shows, with a 2-second cap on the refresh delay.
- **Clawback:** block the override with a clear message naming who's short. No debt, and no write-off.
- **Pagination:** a "Show more" button, 50 rows at a time, with the position kept in the URL. The feed and member activity get it too.
- **Shape:** one PR, database work first.

## Design

### 1. The migration (`0033_data_layer_scale.sql`)

This is the only migration in the PR. It adds and recreates things, and drops nothing that isn't recreated in the same migration.

**1a. Access rules run their helpers once per query.** `is_invited()` and `is_admin()` are `STABLE SECURITY DEFINER` (0003). Postgres never inlines them, so today each one runs once per row scanned.

- **The rewrite.** Every policy that calls them is dropped and recreated with identical logic, with each call wrapped as `(select is_invited())` or `(select is_admin())`. That turns each call into an InitPlan that runs once per statement.
- **The policies** (latest definitions):
  - `profiles` select (0006:32) and insert (0016:10)
  - `allowed_emails` select, insert and delete (0005:16-18)
  - `coin_transactions` select (0016:17)
  - `markets`, `market_outcomes`, `market_resolutions` (0014:13-20)
  - `bets`, `parlays`, `parlay_legs` (0030:4-13)
  - `tasks` (0022:12-17)
  - `task_completions` (0030:16-21)
- **Existing wraps stay.** `auth.uid()` calls that are already wrapped keep their wrap.
- **No other changes.** No policy changes its roles, command or meaning.

**1b. Indexes.** Every index is justified by a named query. Nothing is speculative.

| Index | Serves |
|---|---|
| `bets (market_id, created_at desc, id desc)` | market bets (`get-market.ts:82`), chart reads (`chart-bets.ts:13`), and the resolve and void loops (0028:102,162) |
| `bets (outcome_id)` | the winner payout loop (0028:109) and the feed's `bet_won` branch (0031:60) |
| `bets (profile_id, created_at desc)` | member activity (actor-filtered feed) |
| `coin_transactions (((meta->>'resolution_id')::uuid))` | the override reversal loop (0028:67-70). Today it's a full ledger scan while the market row is locked |
| `coin_transactions (created_at desc, id desc)` | admin ledger paging |
| `task_completions (profile_id, submitted_at desc)` | `listMyTaskCompletions` |
| `task_completions (submitted_at) where status = 'pending'` | `listPendingTaskCompletions` |
| `task_completions (reviewed_at desc) where status = 'approved'` | the feed's task branch |
| `parlays (created_at desc)` | the feed's parlay-placed branch |
| `parlays (settled_at desc) where status = 'won'` | the feed's parlay-won branch |
| `market_resolutions (resolved_by)` | member activity (resolutions by a member) |

These existing indexes are kept:
- `parlays(profile_id)`
- `parlay_legs(market_id)`
- `task_completions_one_active_per_period`
- the unique constraints

`markets(created_by)`, `markets(created_at)` and `market_resolutions(market_id)` are not added, because no query needs them.

**1c. Clawback is blocked with a clear message.** When `resolve_market` overrides an earlier resolution, it first computes what each earlier winner would owe. That means each payout credited under the earlier `resolution_id`, net of anything already reversed, summed per member. The same check covers parlays that `settle_parlay` would reverse (`parlay_reversed`, 0027:65-69).

If any member's balance is lower than what they'd owe, the function raises a named exception before anything changes:
- `sqlstate 'P0001'` with the message prefix `clawback_short:`
- then a JSON array of `{ "display_name", "owed", "balance" }`

The server action (`lib/markets/resolve-market.ts`) recognises the prefix and returns the inline form error described under Copy. Any other database error still maps to today's generic message. The admin can adjust balances and retry. An override where everyone can pay back works exactly as today.

**1d. Deterministic lock order.** Resolve and void update `profiles` rows in their payout, reversal and refund loops. These loops (0028:67, 102, 109, 162) iterate `order by profile_id` (plus `id` as a tiebreak). That way two concurrent resolutions of markets with overlapping bettors take row locks in the same order and can't deadlock. The parlay loop (0028:121) is already ordered.

**1e. Batch review.** There is a new `review_task_completions(p_ids uuid[], p_approve boolean, p_note text)`:
- `security definer`, `search_path = ''`
- it checks `is_admin()` once, then processes ids in ascending order by calling the existing single-review logic for each
- it returns a `(id uuid, ok boolean, error text)` row per id

Bulk approve and bulk reject in `lib/tasks/review-task-completion.ts` (49-56, 76-86) each call it once. The UI's existing partial-success reporting is kept. An id that fails, for example one already reviewed, reports its error, and the others still go through. Grants match the existing single-review function.

**Unchanged:**
- no change to any other coin-moving function's behaviour
- no change to any server action's failure shape, apart from the clawback message
- no change to grants on existing objects

### 2. Correctness past 1,000 rows, and "Show more"

**2a. One pagination pattern.**

- **The cursor helper.** `lib/pagination/cursor.ts` encodes a row's `(timestamp, id)` as a URL-safe cursor string, and decodes and validates one. A malformed, tampered or missing cursor decodes to `null`, which means the first page. It never throws.
- **What a cursor in the URL means.** "Show every row from the newest down to and including this cursor." For example, `/admin/ledger?before=<cursor>`. Each list uses its own parameter name, so two lists on one page don't collide: `bets=` on market detail, `resolved=` on `/markets`.
- **The server read.** It fetches the range `(ts, id) >= cursor`, ordered `ts desc, id desc`, through the new indexes, plus one extra row. The extra row decides whether "Show more" appears. With no cursor, it reads the newest 50 plus one.
- **The "Show more" link.** Its cursor points at the 50th row past what's shown. The page renders the whole range, so older rows appear below the ones already visible. Reload, back-swipe and a shared link all land on the same spot. A live refresh keeps the range and adds new rows at the top.
- **Window cap.**
  - A range is capped at 500 rows. When "Show more" would exceed it, the link starts a fresh window instead, pointing to `?<param>_from=<cursor>` with the next 50 older rows.
  - A windowed view shows "Back to newest" above the list, linking to the page without the parameter.
  - This keeps every read under the 1,000-row cap.
- **The component.** `components/ui/show-more.tsx` renders a real `<a>` via `Link` with `scroll={false}`, styled as a secondary button. It's at least 44px tall and carries `no-underline`. It sits below its list. There's no JS requirement: it works as a plain link.

**2b. Where "Show more" is used.**
- the admin ledger (`listAllTransactions`, `list-transactions.ts:98-105`, which today is unbounded and silently truncated at 1,000)
- a market's bets on market detail (`getMarketBets`, `get-market.ts:81-87`)
- resolved and voided markets on `/markets` (open markets stay unpaged)
- the feed (`/feed`) and a member's activity (`/members/[id]`), replacing `FEED_LIMIT = 50` (`list-feed.ts:4`)

The feed's cursor is `(occurred_at, id)`. The view's text `id` works as the tiebreak because the cursor comparison is done in the query, not through an index.

**2c. The markets list stops growing its URLs.**
- Resolution labels come from an embedded join (a foreign-key embed from `markets` to its resolution) instead of `.in('id', resolutionIds)` (`list-markets.ts:35`).
- Chart data is read only for the market cards on the current page, open plus the shown resolved ones. The read uses keyset paging (`created_at, id`) instead of OFFSET (`chart-bets.ts`).
- If the chart read fails, the cards render without charts. The failure is logged with `console.error`, and it no longer takes the page down (`markets/page.tsx:29`).

**2d. Leaderboard and member page.**
- `getLeaderboard` orders by balance in SQL, then display name and id, and ranks with the same tie rules as `ranking.ts`.
- `/members/[id]` reads one profile and computes its rank as the count of members ranked above it. It no longer loads everyone and uses `find` (`members/[id]/page.tsx:15-23`). An unknown id still gives a real 404.

**2e. Home counts, not reads.** Home's open-market count uses a `count: 'exact', head: true` query, instead of calling `listMarkets` and taking the length (`home/page.tsx:25,31`).

### 3. Resilience

**3a. Error pages.** Error pages use the `retry` prop from Next 16.2+ (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`). `retry()` re-fetches and re-renders the segment, and it's used instead of `reset()`.

| File | Catches | Chrome |
|---|---|---|
| `app/(app)/error.tsx` | any signed-in page or streamed section, such as member activity or a feed page | the in-app top bar and tab bar stay, because the `(app)` layout renders above it |
| `app/error.tsx` | the `(app)` layout's own reads, and the auth pages | none |
| `app/global-error.tsx` | the root layout | its own `<html>`/`<body>`. It follows the OS colour scheme, as the docs describe, and sets `<title>` via React |

- **Rendering.** All three render the same `ErrorCard` in `components/ui/error-card.tsx`: an icon, the heading, the body copy and a "Try again" button that calls `retry()`. It uses tokens only and 44px controls, and it follows the offline page's layout.
- **Logging.** Each boundary logs `console.error(error)` with its `digest` in an effect, so failures can be matched to Vercel logs.

**3b. An Auth failure isn't "signed out".**
- **`requireUser`** (`lib/auth/require-user.ts`):
  - no session returns `{ user: null }`, as today
  - any other Auth error (network, 5xx, timeout) throws an `AuthUnavailableError`, which the error boundaries catch
- **The proxy** (`proxy.ts`): on an Auth error it doesn't redirect. It passes the request through, and the page's own `requireUser` throws into the boundary. The signed-out 307 is unchanged when there is genuinely no session.
- **`isAdmin`** (`lib/auth/is-admin.ts:5-6`): an RPC error throws instead of returning `false`, so admins are no longer silently bounced to Home.
- **The `(app)` layout:** it keeps throwing on a profile read error, but that error now lands in `app/error.tsx` instead of a bare 500.

**3c. Timeouts.**
- The server Supabase client (`lib/supabase/server.ts`) and the proxy's client pass a `fetch` wrapper that adds `AbortSignal.timeout(10_000)`, combined with any caller signal via `AbortSignal.any`.
- The browser client uses 15 seconds.
- A timed-out request surfaces as an error, reaching the error page, or `AuthUnavailableError` for Auth calls.
- The database's existing 8-second `statement_timeout` on `authenticated` stays.

**3d. Keep-alive job.**
- `vercel.json` runs it at `0 0 * * 1,4`, Monday and Thursday. Supabase pauses a free project after 7 days idle, so one missed run no longer pauses it.
- The route (`app/api/cron/keep-alive/route.ts:27-31`) logs the error with `console.error` before returning 502.
- The comment claiming the weekly schedule had margin is corrected.

### 4. Speed

**4a. Parallel reads.** Reads that don't depend on each other run together with `Promise.all`:
- **Market detail:**
  - `getMarket`'s two lookups become one joined read
  - `isAdmin` and the slip read join the bets and chart batch
  - result: about 5 serial round trips become 2–3
- **Parlays:** the slip and parlays reads run together (`parlays/page.tsx:17-18`).
- **Tasks:** `listTasks` and `listMyTaskCompletions` run together (`tasks/page.tsx:18-21`).
- **Admin tasks:** the tasks and pending reads run together (`admin/tasks/page.tsx:20-22`).
- **Home:** the admin-only pending read joins the main batch (`home/page.tsx:29`).
- **The `(app)` layout:** the profile read joins `isAdmin` and the slip (`layout.tsx:15-19`).

**4b. One local sign-in check.**
- **`requireUser`** uses `supabase.auth.getClaims()`. With asymmetric JWT signing keys, it verifies the token locally against the cached JWKS, with no Auth round trip. It returns `user` built from the claims (`id` from `sub`, `email`). Every caller today uses only `user.id` (the callback route gets its own user from `exchangeCodeForSession`, so it's unaffected).
- **The proxy** uses `getClaims()` too, which still refreshes an expiring session and writes the cookies as today.
- **`api/cron`** is removed from the proxy matcher.
- **Legacy signing secret:** if the hosted project still uses the legacy JWT secret, `getClaims()` falls back to a network check, the same cost as today. The PR description tells the user how to switch the project to asymmetric signing keys in the Supabase dashboard. That's optional, and existing sessions keep working.

**4c. Live updates for what's on screen.**
- **The layout's channel.** `LiveRefresh` in the `(app)` layout keeps one channel, which always listens to `profiles` filtered `id=eq.<me>`. That keeps the top-bar balance live on every page.
- **Per-page declarations.** Pages declare what they show with `<LiveTables tables={[...]} />`, a client component that registers its subscriptions in a context. On navigation the channel is rebuilt from the current page's declarations plus the base subscription. Each entry is `{ table, filter? }`, using Postgres Changes' single `column=eq.value` filter.

| Page | Subscriptions |
|---|---|
| Market detail | `bets` `market_id=eq.<id>`, `markets` `id=eq.<id>`, `market_resolutions` `market_id=eq.<id>` |
| Markets list | `markets`, `bets` |
| Home | `markets`, `tasks` |
| Leaderboard | `profiles` |
| Member page | `profiles` `id=eq.<id>`, `bets` `profile_id=eq.<id>`, `parlays` `profile_id=eq.<id>` |
| Feed | `bets`, `parlays`, `task_completions`, `market_resolutions` |
| Tasks | `tasks`, `task_completions` `profile_id=eq.<me>` |
| Parlays | `parlays` `profile_id=eq.<me>`, `parlay_legs` |
| Admin tasks | `task_completions` |
| Other admin pages | base only |

- **`LIVE_TABLES`** stays the list of published tables. A unit test checks that every table used in a declaration is in it.
- **Debounce.** Trailing 400ms, as today, plus a 2-second `maxWait`: a continuous stream of changes still refreshes at least every 2 seconds.
- **Unchanged:** the hidden-tab skip, the foreground refresh, the rejoin catch-up and the StrictMode handling from PR B all stay.

**4d. Clean-up.** Add `@source not "../docs";` to `app/globals.css` after the Tailwind import, so class names quoted in the plan docs stop producing CSS. The build must still contain every class the app uses. The Playwright suite and the visual check prove it.

## Copy (new, needs sign-off)

- **Error page:** "Something went wrong" / "We couldn't load this page. Try again in a moment." / "Try again"
- **Clawback, inline on the resolve form:**
  - one member: "Can't override: Bob has already spent 40 of the 60 DC he won."
  - several: "Can't override: Bob has already spent 40 of the 60 DC he won, and Carol 15 of 30."
  - both: "Adjust their balances first if you still want to override."
- **Pagination:** "Show more" / "Back to newest"

## Global constraints

- **Scope:** only what this spec lists. Nothing from the non-goals.
- **One migration,** `0033`. It adds or recreates. The policy rewrite keeps every policy's meaning, which a test proves. The clawback block and the batch review function are the only behavioural changes to coin-moving SQL.
- **The e2e contract:**
  - every existing asserted string, role and count keeps resolving
  - the member page keeps its real HTTP 404, and the signed-out 307 is unchanged
  - existing specs may gain waits, never changed assertions
- **Tokens only, phone-first, 44px controls,** real elements, and reduced motion respected, as in AGENTS.md.
- **Money actions are never optimistic.** The service worker never caches member data.
- **Every new list read is bounded** (at most 501 rows per request), and no read builds a URL whose length grows with row counts.

## Testing

**Database** (`tests/db/`, against local Supabase):
- **Policies:** for every policy, the recreated expression equals the old one with only the `(select …)` wraps added, compared via `pg_policies`. The existing anon, member and admin access tests all still pass.
- **Indexes:** each index in 1b exists. On seeded data, `EXPLAIN` shows index use, not a sequential scan, for:
  - the override reversal lookup
  - market bets
  - the ledger range
  - each feed branch filtered by actor
- **Clawback:**
  - an override that would take a winner below zero raises the `clawback_short:` error, and the ledger and balances are unchanged
  - an override everyone can repay works exactly as before
  - the same two cases for parlay reversal
- **Deterministic order:** the resolve and void loops are ordered, asserted from the function definitions.
- **`review_task_completions`:**
  - mixed ids report per-id results
  - a non-admin is refused
  - approved ones credit exactly once

**Unit and jsdom:**
- the cursor helper: round trip, garbage, tampering and missing input
- `ShowMore`: its link, the windowed "Back to newest", and the 44px size
- `ErrorCard` and the three boundaries
- `requireUser`: no session vs Auth error vs claims
- the `isAdmin` throw
- the clawback message mapping in `resolve-market.ts`
- the fetch timeout wrapper
- `LiveTables` registration and channel rebuild
- the 2-second `maxWait`
- the declarations ⊆ `LIVE_TABLES` check

**E2E** (24 now, 26 after), with no changed assertions:
- "Show more" on the admin ledger appends older rows, and a reload keeps them
- the clawback override shows the inline message

The error pages are covered in jsdom, not e2e. Forcing a server read to fail from Playwright would need a test-only failure switch in production code, and this PR doesn't add one.

**Scale seed.** `scripts/seed-scale.mjs` loads about 500 members, 200 markets, 20,000 bets and matching ledger rows into local Supabase. It's used to measure `EXPLAIN ANALYZE` timings for the feed, the ledger and market detail before and after the migration. It's for development only: CI never runs it, and it never touches production.

## Rollout

- Merging to `main` runs the Deploy Production Database workflow (`supabase db push`), which applies `0033`, exactly as `0032` was applied. The indexes are small today, so creating them without `concurrently` inside the migration transaction is instant.
- **After deploy, check:**
  - `/markets`, a market, the admin ledger with "Show more", and the feed on production
  - one live update between two sessions
  - Vercel logs for new errors
- **Optional for the user:** switch the Supabase project to asymmetric JWT signing keys, to get the local sign-in check.
