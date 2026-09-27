# Activity Events and Market Sparklines (Sub-project 9, PR B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two reads still grow with the whole history of the app; this PR makes both grow only with what's on screen, and changes nothing a member sees:
- **The feed.** `/feed` and a member's activity (`/members/[id]`) read `activity_feed`, a view that rebuilds every event from seven tables and re-sorts them on every load — about 16 ms at 20,000 bets, and rising. They switch to `activity_events`, a table kept in step by triggers.
- **The markets list.** `/markets` reads every bet ever placed on every card it shows to draw 84px sparklines, and re-reads all of it on any bet anywhere. It switches to `market_sparklines`, a database function that returns one row per card, carrying a small, capped chart series.

**Architecture:**
- **The events table (`supabase/migrations/0035_activity_events.sql`, Task 1):** `public.activity_events` carries one row per feed event, keyed by the same ids `activity_feed` already uses (`bet:<id>`, `parlay:<id>`, `market:<id>`, `resolution:<id>`, `win:<bet id>:<resolution id>`, `parlay_win:<id>`, `task:<id>`), so every outstanding "Show more" cursor keeps working. `after` triggers on `bets`, `parlays`, `markets`, `coin_transactions` and `task_completions` keep it in step, each a `security definer` function with `set search_path = ''`, inserting with `on conflict (id) do update` so a re-resolve or a parlay reversal updates or hides a row instead of duplicating it. An override hides the old resolution's `market_resolved`/`bet_won` rows (`hidden_at`) rather than deleting them, and a parlay reversal hides its `parlay_won`. Names, titles and the parlay leg count are never stored — they're joined at read time. RLS mirrors the view's existing audience (`(select is_invited())`, select only, no member-facing writes). A backfill, inside the same explicit transaction as the triggers and guarded by `share row exclusive` locks on every table a trigger watches, seeds the table from `activity_feed` so no event can be written between the backfill and the triggers taking over. `activity_events` joins `supabase_realtime` and `LIVE_TABLES`. `activity_feed` itself is untouched and stays live, unused, until a later migration drops it.
- **The feed reader (Task 2):** `lib/social/list-feed.ts`'s `listFeed` keeps its signature and its `FeedEvent` shape, but reads `activity_events where hidden_at is null` instead of the view, reconstructing `actorName`, `marketTitle`, `outcomeLabel`, `taskTitle` and `legCount` through PostgREST embeds on `activity_events`'s own foreign keys (`profiles`, `markets`, `market_outcomes`, `task_completions → tasks`, `parlays → parlay_legs`) — the same embed idiom `lib/markets/get-market.ts` already uses, and simpler than standing up a second view the migration's owner (Task 1) would have to carry. Keyset paging over `(occurred_at, id)` is unchanged. `pageSubscriptions.feed()` becomes `activity_events` alone, and `pageSubscriptions.member()` becomes `activity_events` filtered to the actor plus unfiltered `profiles` — which also closes today's gap where a member's activity page missed live updates for task approvals and resolutions.
- **Market sparklines (Task 3):** `public.market_sparklines(p_market_ids uuid[], p_points integer default 40) returns table (market_id uuid, points jsonb)` is `language sql stable`, security invoker, so today's RLS on `bets`/`market_outcomes` applies unchanged. Per market it walks bets in `(created_at, id)` order, keeps running per-outcome pools, and returns one row whose `points` is a JSON array of `{ t, shares }` at up to `p_points` (capped at 200) evenly spaced bets, always the first and the last — the same arithmetic as `buildProbabilitySeries` (`lib/markets/probability-series.ts`), computed once in the database instead of shipping the whole bet history to compute it in Node. `p_market_ids` is capped at 50 per call, so a call is at most 50 rows. A market with no bets has no row.
- **The markets list (Task 4):** `lib/markets/sparklines.ts`'s `listSparklines`/`readSparklines` call the RPC in chunks of 50 market ids and map each row's points straight into `SeriesPoint[]` — no client-side `buildProbabilitySeries` call needed, since the function already returns shares. `app/(app)/markets/(list)/page.tsx` swaps `readCharts` for `readSparklines`; a failed read still degrades to cards with no chart, exactly as today. `listChartBets`/`readCharts` (`lib/markets/chart-bets.ts`) are deleted along with their tests, since nothing else calls them; `getChartBets`, which still serves the market detail page's full, exact chart, stays untouched.
- **Verification (Task 5):** the full chain, the pinned-CLI re-run, `EXPLAIN ANALYZE` before and after `0035` on the scale seed for the feed, member activity and the markets sparkline load, a controller visual pass with a live-update check, and the post-deploy checklist.

**Tech Stack:**
- Next.js 16.3.5 (App Router), React 19.2 and TypeScript
- Tailwind CSS v4
- Supabase: Postgres, Auth, Realtime; `@supabase/supabase-js` 2.116, `@supabase/ssr` 0.12.7
- Vitest 4 with React Testing Library and jsdom
- Playwright

**How this plan was checked.** All five tasks were applied in order, from this text, to a fresh copy of `activity-events` (`da8555a`), on local Supabase (CLI 2.117.0), and after each task the full chain ran (`npx next typegen`, tsc, lint, `npx vitest run`, build, Playwright), with `npm run db:reset` first for Tasks 1, 3 and 5:
- tsc and lint were clean after every task
- `npx vitest run` passed after every task, DB tests included: 1073, 1075, 1082, 1081 tests after Tasks 1–4 (161, 161, 162, 163 files; 44, 44, 45, 45 in `tests/db/`), and 1081 in 163 in Task 5, from 1065 in 160 before
- the build passed after every task, with the same 20 routes as `da8555a`
- Playwright passed 27 after every task
- each task's red step failed as its text says, and each step's run gave the count it states
- on the scale seed, `migration up` applied `0035` over 20,000 bets in about 1.3 s and backfilled 28,292 rows, equal to the view; a second seed run through the live triggers (10 more overrides) left 56,584 visible rows, still equal to the view, and 462 hidden
- on that data, the old and new `listFeed` returned identical pages as an admin: 13 successive pages through "Show more", past the 500-row window (3,050 rows compared), plus the three busiest members' first pages
- Task 5's `EXPLAIN ANALYZE`, before and after `0035`: the feed's first page 15.80 → 0.44 ms, the busiest bettor's activity 0.61 → 0.48 ms, and the 50 busiest markets' sparklines 1.81 ms for 5,663 bet rows → 19.87 ms for 50 rows
- end to end through PostgREST for the list page's 120 cards, the old `listChartBets` plus `buildProbabilitySeries` took 53–63 ms reading about 12,000 bets; `listSparklines` took 20–24 ms for 4,800 points, and every card's last point matched the full series
- Task 5's visual-check spec ran, 5 passed, 12 screenshots, and was then deleted

Integration fixed six things in the drafted text, beyond the four controller rulings below. Task 2's red and green counts were wrong (`social-readers` has 8 tests before the task, not 11). Task 4's defensive sort went, since the function now guarantees point order, and its sort test became a mapping test. Task 5's scale script timed only the first 500-row page of 12 markets as "before", and now reads one full chunk of 50 markets and prints row counts. Its expectations said member activity would fall by an order of magnitude and the sparkline read would get faster in the database, and neither held; they now say what was measured. Its visual spec failed as drafted (`makeMember('Live-check watcher')` builds an invalid email), and on global setup's empty database it captured "No markets yet" mid-fade; it now seeds two markets with bets, checks the charts are there, and waits out the skeletons. Two code comments named plan tasks and were reworded. Re-applying the final Tasks 1–4 to a second fresh copy of `da8555a` reproduced the identical tree, task by task. Not run: Task 5's pinned-CLI re-run (Step 2) and the post-deploy checks (Step 6).

**Spec:** [`docs/superpowers/specs/2026-09-27-activity-events-and-sparklines-design.md`](../specs/2026-09-27-activity-events-and-sparklines-design.md). Its references are to `main` at `0bc5819` (beta readiness merged as PR #17); this plan starts from `activity-events` at `da8555a`, which adds only the spec. The rulings below amend it in four places: the trigger table (1b), the grants (1c), the sparkline return shape (2a) and the sparkline function's missing `search_path`.

**Commits** end with the `Co-Authored-By:` trailer the implementer's own session specifies. The commit commands below omit it.

## Global Constraints

- **Scope:** only what the spec lists. Overrides, reversals, voids and balance adjustments still don't get their own feed events — the feed keeps showing only the current truth. `activity_feed` isn't dropped, no `use cache`/`cacheComponents` caching is introduced, the market page's full chart is untouched, and no coin-moving function or access rule on an existing table changes.
- **One migration, `0035`,** in a single explicit transaction. It creates `activity_events`, its triggers and `market_sparklines`, backfills the table, and adds it to the publication. It changes no existing function, access policy or table, apart from the new triggers those tables gain.
- **Equivalence:** the visible rows of `activity_events` must equal `activity_feed`'s rows (same ids, kinds, actors, times, amounts), which a DB test proves and every later task's DB reads may assume.
- **The e2e contract:**
  - every existing asserted string, role and count keeps resolving
  - the member page's real 404, the market page's real 404 and the signed-out 307 are unchanged
  - existing specs may gain waits, never changed assertions
  - **E2E counts:** 27 before this PR, and 27 after every task (1 through 5) — this PR adds no new spec and removes none.
- **Vitest counts:** 1065 tests in 160 files before this PR, 43 of them in `tests/db/`. After each task, as measured by applying the tasks in order on one branch and running the full suite against local Supabase:

  | Task | 1 | 2 | 3 | 4 | 5 |
  |---|---|---|---|---|---|
  | Tests | 1073 | 1075 | 1082 | 1081 | 1081 |
  | Files | 161 | 161 | 162 | 163 | 163 |
  | In `tests/db/` | 44 | 44 | 45 | 45 | 45 |
  | E2E | 27 | 27 | 27 | 27 | 27 |
- **Build:** 20 routes (`/_not-found` included) at `da8555a` and after every task. This PR adds and removes no route.
- **Bounded reads:** every list read stays at 500 rows per request or fewer, and no URL grows with the number of rows.
- **UI conventions (AGENTS.md):** tokens only, phone-first, 44px controls, real elements. This PR is expected to touch no UI markup, so none of these should have anything to confirm — Task 4's list-page edit swaps a data source, not a rendered element.
- **Code style:** single quotes, no semicolons, and comments only for a non-obvious why. Quote `(app)` / `(list)` / `[id]` paths in shell commands. `'use server'` modules export only async functions.
- **Native feel and speed (AGENTS.md):** a new live table goes in both `LIVE_TABLES` and a realtime-publication migration (Task 1 and Task 2 together cover `activity_events`); every `.in(col, ids)` lookup that grows with rows, and every RPC call keyed on a list of ids, is chunked with `lib/pagination/chunk.ts`; a page declares what it shows live with `<LiveTables subscriptions={pageSubscriptions.x(…)}>`.
- **A fresh checkout runs `npx next typegen` once** (or a build) before its first `npx tsc --noEmit`. Until then `PageProps` and `LayoutProps` don't exist, and tsc fails on route files that use them.
- **Next.js 16 differs from older versions.** Read `node_modules/next/dist/docs/` before writing anything Next-specific.
- **Local Supabase must be running** for any task that touches `0035` or runs `tests/db/*`. `npm run db:reset` after any change to `0035`.
- **Commits carry no attribution line.** Each task's commit message is imperative, with nothing after it; the implementer's own session appends its own trailer (for example `Co-Authored-By:`) when it actually commits — this plan's commit commands never include one.

## Rulings this plan makes

- **Controller ruling: `market_sparklines` returns one row per market (amends spec 2a).** The spec's shape was one row per point, `(market_id, t, shares)`. The function instead `returns table (market_id uuid, points jsonb)`, where `points` is a JSON array of `{ "t": <timestamptz>, "shares": { <outcome id>: <share> } }` in time order. At the default 40 points, 50 ids would have been up to 2,000 rows in one call: PostgREST's `max_rows = 1000` (`supabase/config.toml`) truncates RPC results silently, and the rows came ordered by `market_id`, so the later cards of a full chunk would have lost their charts with no error. One row per market caps a call at 50 rows, inside both PostgREST's cap and the repo's 500-row bound, whatever `p_points` is. The drafter's verified share maths, the at-most-`p_points` count with the last bet always included, and both caps are unchanged. Task 3's function and tests and Task 4's mapping and tests are written to this shape; Task 3's 50-id case asks for 50 markets of 41 bets each and gets every one of their 2,000 points back in one response.
- **Controller ruling: Task 2's hiding test sets `hidden_at` through `pgQuery`,** a superuser SQL call through postgres-meta, not the service client. `activity_events` grants `service_role` select only (spec 1c), so a service-client update would fail with `42501`; only the triggers write to the table.
- **Controller ruling: Task 1's widened triggers are accepted (amends spec 1b).** The spec's trigger table has `bets`, `parlays` and `markets` on insert only and `task_completions` on update only. Each trigger here also fires on insert, and on an update of any column its event copies. That keeps equivalence for rows written directly rather than through the app's functions: `scripts/seed-scale.mjs` inserts about 2,100 completions already `approved` and moves every parlay's `created_at` after placing it, and `tests/db/chart-bets.test.ts` moves bets' `created_at`. With the spec's triggers the scale seed would lose about 2,100 task events and misdate 400 parlay events, which breaks equivalence and skews Task 5's measurements. The app's own paths go through exactly the spec's route. `market_resolutions` gets no trigger, because nothing edits `resolved_at`, `resolved_by` or `outcome_id` after insert.
- **Controller ruling: `market_sparklines` doesn't set `search_path`, so it stays inlinable.** Postgres only inlines a SQL function with no SET clause. Inlined, the planner sees the bet reads inside it, which is what lets Task 3's EXPLAIN test show `bets_market_created_idx`; a non-inlined call is an opaque Function Scan. This is accepted because every relation in the body is schema-qualified (`public.bets`, `public.market_outcomes`), the functions it calls resolve from `pg_catalog`, and the function is security invoker, so a caller's search_path can only affect that caller. It's the one function in the repo without `set search_path`, and its comment says why.
- **The feed reader joins through PostgREST embeds on `activity_events` itself, not a second SQL view.** `lib/social/list-feed.ts` embeds `profiles`, `markets`, `market_outcomes`, `task_completions → tasks` and `parlays → parlay_legs` directly off `activity_events`'s own foreign keys — every one of those columns has exactly one relationship to embed through, so PostgREST needs no `!fkey` disambiguation. This is the same idiom `lib/markets/get-market.ts` already uses (`creator:profiles(display_name)`, a disambiguated `current_resolution:market_resolutions!markets_current_resolution_id_fkey(...)`), proven in this codebase, and it keeps the whole join inside Task 2's own files rather than adding a second view Task 1 would have to define, grant and keep equivalent to the table. `parlay_legs` is bounded at 6 rows per parlay (`MAX_PICKS`, `lib/parlays/odds.ts`), so embedding it never grows with table size, and every embedded table's own RLS applies to the join exactly as it does to a direct read.
- **Stricter grants than spec 1c's wording.** The spec says `revoke all … from public, anon`, then grant select. `0035` revokes from `public, anon, authenticated, service_role`, then grants `select` to `authenticated` and `service_role`, because hosted default privileges would otherwise leave `authenticated` and `service_role` holding write privileges. RLS already blocks member writes; the revoke makes them fail with `42501`, which Task 1 pins. The trigger functions have execute revoked from `public`, `anon` and `authenticated` and are granted to nobody: a trigger function needs no EXECUTE to fire.
- **One index beyond the spec's two:** `activity_events_market_resolution_idx (market_id) where resolution_id is not null`. A resolve or override hides one market's old resolution rows while the market row is locked; without it, that update would scan the whole table.
- **`market_sparklines` keeps the first bet as well as the last,** so the compact line spans the same time as today's full-history line. A market with fewer bets than `p_points` returns every bet, exactly today's series. Both caps are silent (`p_points` clamped to 1…200, ids past the 50th ignored), so an oversized call still gets an answer.
- **`listSparklines` never calls `buildProbabilitySeries`.** `market_sparklines` already returns each chosen bet's running shares, matching `buildProbabilitySeries`'s arithmetic inside the database (a DB test in Task 3 pins the two against each other); the list page just maps each row's `points` into `SeriesPoint[]`. `buildProbabilitySeries` keeps its one remaining caller, the market detail page's full chart, unchanged.
- **`getChartBets` survives; `listChartBets` and `readCharts` don't.** A grep before Task 4's removal step confirms nothing outside `lib/markets/chart-bets.ts`, its own tests and the markets list page imports either name.
- **The `EXPLAIN ANALYZE` before/after in Task 5 resets to just before `0035`, seeds the scale data, measures, then applies `0035` with `migration up` and measures again** — the same methodology the data-layer-scale plan's own Task 12 used, so the two numbers are read off the same seeded rows under two real schema states, not off two different SQL strings run on one already-migrated database.

---

## Task 1: The events table

`/feed` and a member's activity read `activity_feed` (0031), a view that rebuilds every event from seven tables and sorts them all on every load. This task stores those same rows in `public.activity_events`, which triggers keep in step, so a feed page becomes one index range. Nothing reads the table yet. Task 2 moves `listFeed` onto it, and the view stays in place.

**What's in `0035_activity_events.sql` after this task:**
- the table, its two feed indexes, and one small index for the resolve path
- RLS and grants
- five `security definer` trigger functions, with their triggers
- the backfill from `activity_feed`
- the publication entry

It's one explicit `begin; … commit;`, like 0034. Task 3 adds `market_sparklines` just before the final `commit;`.

**Equivalence is the contract.** After any sequence of actions, the visible rows (`hidden_at is null`) must equal `activity_feed` on id, kind, occurred_at, actor_id and amount. The DB test also compares the market, the outcome label, the leg count and the task title, joined through the stored ids. That proves the related ids Task 2 joins on are right. The ids are the view's own, so every feed cursor already in a "Show more" link still points at the same row.

**What each kind stores:**

| kind | id | occurred_at | actor_id | market_id | outcome_id | bet / resolution / parlay / completion | amount |
|---|---|---|---|---|---|---|---|
| `bet_placed` | `bet:<bet>` | `bets.created_at` | `bets.profile_id` | the bet's | the bet's | `bet_id` | `bets.amount` |
| `parlay_placed` | `parlay:<parlay>` | `parlays.created_at` | `parlays.profile_id` | null | null | `parlay_id` | `parlays.stake` |
| `market_created` | `market:<market>` | `markets.created_at` | `markets.created_by` | the market | null | none | null |
| `market_resolved` | `resolution:<resolution>` | `resolved_at` | `resolved_by` | the market | the winner | `resolution_id` | null |
| `bet_won` | `win:<bet>:<resolution>` | the resolution's `resolved_at` | the ledger row's `profile_id` | the market | the bet's (the winner) | `bet_id`, `resolution_id` | the ledger `amount` |
| `parlay_won` | `parlay_win:<parlay>` | `parlays.settled_at` | `parlays.profile_id` | null | null | `parlay_id` | `parlays.credited` |
| `task_completed` | `task:<completion>` | `reviewed_at` | `task_completions.profile_id` | null | null | `task_completion_id` | `reward_amount` |

**Hiding.**
- **Resolutions.** When `markets.current_resolution_id` moves, every visible `market_resolved` and `bet_won` row of that market with a different `resolution_id` is hidden. The new resolution's `market_resolved` is then written. `resolve_market` moves the pointer before it pays the new winners, so their `bet_won` rows (from the ledger trigger) arrive after the hide.
- **Parlays.** A parlay whose status leaves `won` has its `parlay_won` hidden. If it wins again, the same row comes back with the new `settled_at` and `credited`. That's the one `on conflict … do update` path the app really takes.
- **Voids.** A void never touches `current_resolution_id`, because `void_market` only voids open markets. So nothing is hidden. The view keeps a voided market's `market_created` and `bet_placed` rows, and so does the table.
- **Re-resolving to the original outcome.** This makes a new resolution id. The new rows are fresh, and the first resolution's rows stay hidden.

**One deviation from the spec's trigger table (accepted as a controller ruling; see the header).** The spec lists `task_completions` on update only, and `bets`, `parlays` and `markets` on insert only. Each trigger here also fires on insert, and on an update of any column its event copies. Two things in the repo would otherwise break equivalence:
- `scripts/seed-scale.mjs` inserts about 2,100 completions directly as `approved`, and moves every parlay's `created_at` after placing it.
- `tests/db/chart-bets.test.ts` moves bets' `created_at`.

On the scale seed, the spec-only triggers would miss about 2,100 task events and misdate 400 parlay events. That would skew Task 5's before-and-after measurements.

**Locks.**
- **The migration's lock.** It takes `share row exclusive` on `markets`, `task_completions`, `bets`, `coin_transactions` and `parlays`, in 0033's order. These are the five tables the triggers watch. `create trigger` takes that same lock on each of them anyway; taking all five first just fixes the order.
- **What the triggers lock.** They write only to `activity_events`, and never take a row lock of their own on a profile or a market.
- **The foreign keys' checks.** Each takes FOR KEY SHARE on the row it names. Either the source row's own foreign keys already hold that lock in the same transaction, or the transaction already locks the row itself (a resolve's market, a settle's parlay). Nothing takes FOR UPDATE on `profiles` since 0033.

**The foreign keys and the fixtures.**
- **Why each key is safe.** Every event carries a cascading key to its source: `market_id`, `bet_id`, `resolution_id`, `parlay_id` or `task_completion_id`. `seedMembers()` deletes parlays, completions, tasks and markets before it deletes profiles. So every event is gone before the non-cascading `actor_id` key is checked.
- **What was checked.** On a throwaway Postgres with 0001–0035 applied, running the fixture's delete order after a full scenario left 0 events and deleted every profile without error.

**Files:**
- Create: `supabase/migrations/0035_activity_events.sql`
- Test, create: `tests/db/activity-events.test.ts`
- Test, modify: `tests/db/data-layer-policies.test.ts` (the snapshot gains `select_activity_events`), `tests/db/realtime-publication.test.ts` (the published list gains `activity_events`)

**Interfaces:**
- Consumes:
  - `public.activity_feed` (0031): its columns `id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title`, and its id formats (table above).
  - The coin-moving functions, all unchanged:
    - `resolve_market` and `void_market` (0033). `resolve_market` writes `bet_won` ledger rows with `meta = { market_id, resolution_id, bet_id }`, and it updates `markets` (`status`, `current_resolution_id`) before the payout loop.
    - `settle_parlay` (0027). It writes `status`, `credited` and `settled_at` in one update.
    - `approve_task_completion` (0020) and `review_task_completions` (0033). Both set `status = 'approved'` and `reviewed_at = now()`.
    - `place_bet` (0010), `place_parlay` (0029) and `create_market` (0009). These insert the source rows.
  - `is_invited()` (0003).
  - The test helpers:
    - `serviceClient()` (`tests/db/helpers.ts`)
    - `seedMembers`, `makeMember`, `clientFor`, `createTestMarket`, `createTestTask`, `ensureInvited`, `Member` and `TestMarket` (`tests/db/fixtures.ts`)
    - `pgQuery` (`tests/db/pg-query.ts`). A multi-statement call runs as one implicit transaction.
- Produces, for Task 2 and later:
  - **`public.activity_events`**, with exactly the pinned columns. Readers filter on `hidden_at is null`.
  - **Foreign key names**, for PostgREST embeds (each is the only key between its pair of tables, so no hint is ambiguous):
    - `activity_events_actor_id_fkey` → `profiles`
    - `activity_events_market_id_fkey` → `markets`
    - `activity_events_outcome_id_fkey` → `market_outcomes`
    - `activity_events_bet_id_fkey` → `bets`
    - `activity_events_resolution_id_fkey` → `market_resolutions`
    - `activity_events_parlay_id_fkey` → `parlays`
    - `activity_events_task_completion_id_fkey` → `task_completions`
  - **Indexes:**
    - `activity_events_feed_idx (occurred_at desc, id desc) where hidden_at is null`
    - `activity_events_actor_idx (actor_id, occurred_at desc, id desc) where hidden_at is null`
    - `activity_events_market_resolution_idx (market_id) where resolution_id is not null`. The resolve path's hide uses it.
  - **Access:**
    - Policy `select_activity_events`, for select to `authenticated`, using `(select is_invited())`. No write policies.
    - Privileges: `select` for `authenticated` and `service_role` only. `anon` gets nothing. Any member write fails with `42501`.
  - **Triggers**, each an `after … for each row` trigger with a same-named `security definer` function (`set search_path = ''`; execute revoked from `public`, `anon` and `authenticated`):
    - `activity_events_from_bet` on `bets`
    - `activity_events_from_market` on `markets`
    - `activity_events_from_payout` on `coin_transactions`, `when (new.type = 'bet_won')`
    - `activity_events_from_parlay` on `parlays`
    - `activity_events_from_task_completion` on `task_completions`
  - **Publication:** `activity_events` is in `supabase_realtime`. A hide is an UPDATE, so live pages hear about overrides and reversals too.

- [ ] **Step 1: Write the failing DB tests**

Local Supabase must be running.

Run: `npm run db:reset`
Expected: the reset applies migrations through `0034_text_length_limits.sql` without error.

Create `tests/db/activity-events.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import {
  seedMembers,
  makeMember,
  clientFor,
  createTestMarket,
  createTestTask,
  ensureInvited,
  type Member,
  type TestMarket,
} from './fixtures'
import { pgQuery } from './pg-query'

let alice: Member
let bob: Member
let carol: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  for (const client of [aliceClient, bobClient, carolClient]) await ensureInvited(client)
  // Alice is an admin so she can resolve before close_at, override, void and review tasks.
  const { error } = await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
  if (error) throw error
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<string> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
  const { data, error: readErr } = await serviceClient()
    .from('markets')
    .select('current_resolution_id')
    .eq('id', market.marketId)
    .single()
  if (readErr) throw readErr
  return data.current_resolution_id as string
}

async function placeParlay(client: SupabaseClient, outcomeIds: string[], stake: number): Promise<string> {
  const { data, error } = await client.rpc('place_parlay', { p_outcome_ids: outcomeIds, p_stake: stake })
  if (error) throw error
  return data as string
}

async function betIds(marketId: string): Promise<Record<string, number>> {
  const { data, error } = await serviceClient().from('bets').select('id, profile_id').eq('market_id', marketId)
  if (error) throw error
  return Object.fromEntries(data.map((b) => [b.profile_id as string, b.id as number]))
}

interface Mismatch {
  side: string
  id: string
  kind: string
}

// Every visible event, with the names and labels a reader joins onto it, against every row of
// activity_feed: id, kind, occurred_at, actor_id and amount as the spec names them, plus the
// market, outcome label, leg count and task title, which prove the stored related ids are right.
// Both directions, so a missing row and an extra one both show up. Empty means equal.
const MISMATCHES = `
  with stored as (
    select e.id, e.kind, e.occurred_at, e.actor_id, e.amount, e.market_id, o.label as outcome_label,
      case when e.kind in ('parlay_placed', 'parlay_won') then (select count(*)::integer from public.parlay_legs l where l.parlay_id = e.parlay_id) end as leg_count,
      t.title as task_title
    from public.activity_events e
    left join public.market_outcomes o on o.id = e.outcome_id
    left join public.task_completions c on c.id = e.task_completion_id
    left join public.tasks t on t.id = c.task_id
    where e.hidden_at is null
  ),
  derived as (
    select id, kind, occurred_at, actor_id, amount, market_id, outcome_label, leg_count, task_title
    from public.activity_feed
  )
  select 'view only' as side, id, kind from (select * from derived except select * from stored) missing
  union all
  select 'table only' as side, id, kind from (select * from stored except select * from derived) extra
  order by id, side
`

async function mismatches(): Promise<Mismatch[]> {
  return pgQuery<Mismatch>(MISMATCHES)
}

async function feedCount(): Promise<number> {
  const [row] = await pgQuery<{ n: number }>('select count(*)::integer as n from public.activity_feed')
  return row.n
}

interface StoredEvent {
  id: string
  kind: string
  occurred_at: string
  amount: number | null
  resolution_id: string | null
  hidden_at: string | null
}

async function eventsFor(column: 'market_id' | 'parlay_id', value: string): Promise<StoredEvent[]> {
  const { data, error } = await serviceClient()
    .from('activity_events')
    .select('id, kind, occurred_at, amount, resolution_id, hidden_at')
    .eq(column, value)
    .order('id')
  if (error) throw error
  return data as StoredEvent[]
}

const visibleIds = (events: StoredEvent[]) => events.filter((e) => e.hidden_at === null).map((e) => e.id).sort()
const hiddenIds = (events: StoredEvent[]) => events.filter((e) => e.hidden_at !== null).map((e) => e.id).sort()

// The spec's scenario, checking the table against the view after every step.
async function fullScenario(): Promise<void> {
  const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Scenario A' })
  const b = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'], { title: 'Scenario B' })
  expect(await mismatches()).toEqual([])

  await bet(bobClient, a, 0, 10)
  await bet(carolClient, a, 1, 30)
  await bet(aliceClient, a, 0, 5)
  await bet(bobClient, b, 0, 4)
  await bet(carolClient, b, 1, 6)
  await bet(aliceClient, b, 2, 2)
  expect(await mismatches()).toEqual([])

  await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
  await placeParlay(carolClient, [a.outcomeIds[1], b.outcomeIds[1]], 5)
  expect(await mismatches()).toEqual([])

  await resolve(a, 0)
  expect(await mismatches()).toEqual([])

  // Voiding B settles both parlays on A alone: Bob's wins, Carol's loses.
  const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
  if (voidErr) throw voidErr
  expect(await mismatches()).toEqual([])

  // The override claws back A's payouts and reverses Bob's parlay; Carol's parlay now wins.
  await resolve(a, 1)
  expect(await mismatches()).toEqual([])

  const { taskId } = await createTestTask(alice, { title: 'Read Psalm 1', rewardAmount: 12 })
  const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (submitErr) throw submitErr
  const { error: approveErr } = await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
  if (approveErr) throw approveErr
  expect(await mismatches()).toEqual([])
}

describe('activity_events', () => {
  it('holds exactly the rows activity_feed shows after every step of a full scenario', async () => {
    await fullScenario()

    const kinds = await pgQuery<{ kind: string; visible: number; hidden: number }>(`
      select kind, count(*) filter (where hidden_at is null)::integer as visible, count(*) filter (where hidden_at is not null)::integer as hidden
      from public.activity_events group by kind order by kind
    `)
    // Every kind is covered, and the override really did hide rows, so the comparison isn't vacuous.
    expect(kinds).toEqual([
      { kind: 'bet_placed', visible: 6, hidden: 0 },
      { kind: 'bet_won', visible: 1, hidden: 2 },
      { kind: 'market_created', visible: 2, hidden: 0 },
      { kind: 'market_resolved', visible: 1, hidden: 1 },
      { kind: 'parlay_placed', visible: 2, hidden: 0 },
      { kind: 'parlay_won', visible: 1, hidden: 1 },
      { kind: 'task_completed', visible: 1, hidden: 0 },
    ])
    expect(await feedCount()).toBe(14)
  })

  it("backfills, from activity_feed, the same rows the triggers wrote", async () => {
    await fullScenario()

    // The migration's own backfill statement, run into a scratch copy of the table, so the real
    // rows stay as the triggers left them. Every column is compared, related ids included.
    const migration = readFileSync(path.resolve('supabase/migrations/0035_activity_events.sql'), 'utf8')
    const backfill = migration.match(/^insert into public\.activity_events [^;]*?from public\.activity_feed[^;]*;/m)?.[0]
    expect(backfill).toBeDefined()
    const columns = 'id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount'
    const [result] = await pgQuery<{ differing: number; backfilled: number }>(`
      create temp table backfill (like public.activity_events) on commit drop;
      ${backfill!.replace('insert into public.activity_events', 'insert into pg_temp.backfill')}
      select
        (select count(*)::integer from (
          (select ${columns} from pg_temp.backfill except select ${columns} from public.activity_events where hidden_at is null)
          union all
          (select ${columns} from public.activity_events where hidden_at is null except select ${columns} from pg_temp.backfill)
        ) d) as differing,
        (select count(*)::integer from pg_temp.backfill) as backfilled
    `)
    expect(result).toEqual({ differing: 0, backfilled: 14 })
  })

  it("hides exactly the old resolution's rows on an override, and shows a new resolution's rows when it goes back", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Override market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 15)
    const bets = await betIds(market.marketId)

    const first = await resolve(market, 0)
    const second = await resolve(market, 1)
    let events = await eventsFor('market_id', market.marketId)
    expect(hiddenIds(events)).toEqual([`resolution:${first}`, `win:${bets[bob.id]}:${first}`].sort())
    expect(visibleIds(events)).toEqual(
      [
        `market:${market.marketId}`,
        `bet:${bets[bob.id]}`,
        `bet:${bets[alice.id]}`,
        `resolution:${second}`,
        `win:${bets[alice.id]}:${second}`,
      ].sort(),
    )
    expect(await mismatches()).toEqual([])

    // Back to the first outcome: a new resolution id, so new rows, and the first stay hidden.
    const third = await resolve(market, 0)
    events = await eventsFor('market_id', market.marketId)
    expect(hiddenIds(events)).toEqual(
      [
        `resolution:${first}`,
        `win:${bets[bob.id]}:${first}`,
        `resolution:${second}`,
        `win:${bets[alice.id]}:${second}`,
      ].sort(),
    )
    expect(visibleIds(events)).toEqual(
      [
        `market:${market.marketId}`,
        `bet:${bets[bob.id]}`,
        `bet:${bets[alice.id]}`,
        `resolution:${third}`,
        `win:${bets[bob.id]}:${third}`,
      ].sort(),
    )
    // Pool 20, winning pool 5: Bob is paid floor(5 × 20 / 5) = 20, the same as the ledger.
    expect(events.find((e) => e.id === `win:${bets[bob.id]}:${third}`)?.amount).toBe(20)
    expect(await mismatches()).toEqual([])
  })

  it("hides a parlay's win when an override reverses it, and shows it again, re-dated, when it wins again", async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Leg A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Leg B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const parlayId = await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
    await resolve(a, 0)
    await resolve(b, 0)

    const db = serviceClient()
    const settled = async () => {
      const { data, error } = await db.from('parlays').select('status, credited, settled_at').eq('id', parlayId).single()
      if (error) throw error
      return data
    }
    const won = await settled()
    expect(won.status).toBe('won')
    let win = (await eventsFor('parlay_id', parlayId)).find((e) => e.kind === 'parlay_won')!
    expect(win).toMatchObject({ id: `parlay_win:${parlayId}`, amount: won.credited, hidden_at: null })
    expect(Date.parse(win.occurred_at)).toBe(Date.parse(won.settled_at))

    await resolve(a, 1)
    expect((await settled()).status).toBe('lost')
    win = (await eventsFor('parlay_id', parlayId)).find((e) => e.kind === 'parlay_won')!
    expect(win.hidden_at).not.toBeNull()
    expect(await mismatches()).toEqual([])

    await resolve(a, 0)
    const wonAgain = await settled()
    expect(wonAgain.status).toBe('won')
    const events = await eventsFor('parlay_id', parlayId)
    expect(events.filter((e) => e.kind === 'parlay_won')).toHaveLength(1)
    win = events.find((e) => e.kind === 'parlay_won')!
    expect(win).toMatchObject({ amount: wonAgain.credited, hidden_at: null })
    expect(Date.parse(win.occurred_at)).toBe(Date.parse(wonAgain.settled_at))
    expect(Date.parse(wonAgain.settled_at)).toBeGreaterThan(Date.parse(won.settled_at))
    expect(await mismatches()).toEqual([])
  })

  it('stays equal to the view when a source row is written directly, as the scale seed does', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Direct A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Direct B' })
    await bet(aliceClient, a, 0, 5)
    await bet(aliceClient, b, 0, 5)
    const parlayId = await placeParlay(bobClient, [a.outcomeIds[0], b.outcomeIds[0]], 10)
    const { taskId } = await createTestTask(alice, { title: 'Seeded task', rewardAmount: 9 })

    const db = serviceClient()
    const { error: parlayErr } = await db.from('parlays').update({ created_at: '2026-08-01T10:00:00+00:00' }).eq('id', parlayId)
    if (parlayErr) throw parlayErr
    const { error: completionErr } = await db.from('task_completions').insert({
      task_id: taskId,
      profile_id: bob.id,
      status: 'approved',
      reward_amount: 9,
      period_key: 'once',
      submitted_at: '2026-08-02T10:00:00+00:00',
      reviewed_at: '2026-08-03T10:00:00+00:00',
      reviewed_by: alice.id,
    })
    if (completionErr) throw completionErr

    expect(await mismatches()).toEqual([])
    const { data, error } = await db.from('activity_events').select('kind').in('kind', ['parlay_placed', 'task_completed'])
    if (error) throw error
    expect(data.map((e) => e.kind).sort()).toEqual(['parlay_placed', 'task_completed'])
  })

  it('shows an uninvited member nothing, and lets no member write', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Private market' })
    await bet(bobClient, market, 0, 5)

    const { data: visible, error: readErr } = await bobClient.from('activity_events').select('id')
    expect(readErr).toBeNull()
    expect(visible).toHaveLength(2)

    const dave = await makeMember('Dave')
    const daveClient = await clientFor(dave)
    const { data: hidden, error: uninvitedErr } = await daveClient.from('activity_events').select('id')
    expect(uninvitedErr).toBeNull()
    expect(hidden).toEqual([])

    const insert = await bobClient.from('activity_events').insert({
      id: 'bet:999999',
      kind: 'bet_placed',
      occurred_at: new Date().toISOString(),
      actor_id: bob.id,
    })
    expect(insert.error?.code).toBe('42501')
    const update = await bobClient.from('activity_events').update({ hidden_at: new Date().toISOString() }).eq('actor_id', bob.id)
    expect(update.error?.code).toBe('42501')
    const remove = await bobClient.from('activity_events').delete().eq('actor_id', bob.id)
    expect(remove.error?.code).toBe('42501')

    const { data: after, error: afterErr } = await serviceClient().from('activity_events').select('id, hidden_at')
    if (afterErr) throw afterErr
    expect(after).toHaveLength(2)
    expect(after.every((e) => e.hidden_at === null)).toBe(true)
  })
})

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  'Index Cond'?: string
  Plans?: PlanNode[]
}

// The fixtures are a handful of rows, where Postgres would scan or sort whatever the indexes, so
// both are priced out for the one statement: a plan that still reads activity_events in feed order
// can only be walking an index that holds that order. `set local` ends with postgres-meta's
// implicit transaction.
async function planNodes(query: string): Promise<PlanNode[]> {
  const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
    `set local enable_seqscan = off; set local enable_bitmapscan = off; set local enable_sort = off; explain (format json) ${query}`,
  )
  const nodes: PlanNode[] = []
  const walk = (node: PlanNode) => {
    nodes.push(node)
    node.Plans?.forEach(walk)
  }
  walk(row['QUERY PLAN'][0].Plan)
  return nodes
}

const COLUMNS = 'id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount'

describe('activity_events indexes', () => {
  let newest: { occurred_at: string; id: string }

  beforeEach(async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 10)
    await bet(aliceClient, market, 1, 5)
    await resolve(market, 0)
    const { data, error } = await serviceClient()
      .from('activity_events')
      .select('occurred_at, id')
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .single()
    if (error) throw error
    newest = data
    await pgQuery('vacuum (analyze) public.activity_events;')
  })

  it('reads a feed page, and a range below a cursor, in order from activity_events_feed_idx', async () => {
    const ts = newest.occurred_at
    for (const where of [
      'hidden_at is null',
      // listFeed's range read (lib/pagination/keyset.ts): a plain bound beside the tiebreak OR.
      `hidden_at is null and occurred_at <= '${ts}' and (occurred_at < '${ts}' or (occurred_at = '${ts}' and id <= '${newest.id}'))`,
    ]) {
      const nodes = await planNodes(`select ${COLUMNS} from public.activity_events where ${where} order by occurred_at desc, id desc limit 51`)
      const scans = nodes.filter((n) => n['Relation Name'] === 'activity_events')
      expect(scans.map((n) => n['Index Name'])).toEqual(['activity_events_feed_idx'])
      expect(nodes.some((n) => n['Node Type'] === 'Sort')).toBe(false)
    }
  })

  it("reads one member's page from activity_events_actor_idx, narrowed by the actor", async () => {
    const ts = newest.occurred_at
    for (const where of [
      `hidden_at is null and actor_id = '${bob.id}'`,
      `hidden_at is null and actor_id = '${bob.id}' and occurred_at <= '${ts}' and (occurred_at < '${ts}' or (occurred_at = '${ts}' and id <= '${newest.id}'))`,
    ]) {
      const nodes = await planNodes(`select ${COLUMNS} from public.activity_events where ${where} order by occurred_at desc, id desc limit 51`)
      const scans = nodes.filter((n) => n['Relation Name'] === 'activity_events')
      expect(scans.map((n) => n['Index Name'])).toEqual(['activity_events_actor_idx'])
      expect(scans[0]['Index Cond']).toContain(bob.id)
      expect(nodes.some((n) => n['Node Type'] === 'Sort')).toBe(false)
    }
  })
})
```

**What each case proves:**
- **The scenario case** is the spec's scenario. It creates two markets, bets on several outcomes, and places parlays across both markets. It resolves A, voids B (which settles Bob's parlay as won), then overrides A (which reverses Bob's parlay and wins Carol's). Last, it approves a task. It compares table and view after every step, then pins how many rows of each kind are visible and hidden, so the comparison can't pass vacuously.
- **The backfill case** runs the migration's own backfill statement into a scratch copy of the table, and compares every column, related ids included, with what the triggers wrote. `supabase/seed.sql` is empty, so `db reset` has nothing to backfill. The statement has to be exercised on purpose.
- **The direct-writes case** pins the deviation above: an approved completion inserted directly, and a parlay's `created_at` moved directly.
- **The EXPLAIN cases** price out sequential scans, bitmap scans and sorts, as `data-layer-indexes.test.ts` does for the ledger. A plan that still returns rows in feed order is walking the index that holds that order. The range reads have the shape `lib/pagination/keyset.ts` builds: a plain bound beside the tiebreak OR.

Replace `tests/db/data-layer-policies.test.ts` with the version below. Only the comment and the first entry of `BEFORE_0033` change:

```ts
import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'

interface Policy {
  tablename: string
  policyname: string
  cmd: string
  permissive: string
  roles: string[]
  qual: string | null
  with_check: string | null
}

type Expression = Pick<Policy, 'tablename' | 'policyname' | 'cmd' | 'qual' | 'with_check'>

// pg_policies as migration 0032 left them, plus 0035's policy on the new activity_events table.
// 0033 may only wrap the helper calls.
const BEFORE_0033: Expression[] = [
  { tablename: 'activity_events', policyname: 'select_activity_events', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'allowed_emails', policyname: 'admin_delete_invites', cmd: 'DELETE', qual: 'is_admin()', with_check: null },
  { tablename: 'allowed_emails', policyname: 'admin_insert_invites', cmd: 'INSERT', qual: null, with_check: 'is_admin()' },
  { tablename: 'allowed_emails', policyname: 'admin_select_invites', cmd: 'SELECT', qual: 'is_admin()', with_check: null },
  { tablename: 'bets', policyname: 'select_invited_bets', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'coin_transactions',
    policyname: 'select_own_or_admin_transactions',
    cmd: 'SELECT',
    qual: '((profile_id = ( SELECT auth.uid() AS uid)) OR is_admin())',
    with_check: null,
  },
  { tablename: 'market_outcomes', policyname: 'select_market_outcomes', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'market_resolutions', policyname: 'select_market_resolutions', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'markets', policyname: 'select_markets', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  { tablename: 'parlay_legs', policyname: 'select_invited_parlay_legs', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  { tablename: 'parlays', policyname: 'select_invited_parlays', cmd: 'SELECT', qual: '(is_invited() OR is_admin())', with_check: null },
  {
    tablename: 'profiles',
    policyname: 'insert_own_profile',
    cmd: 'INSERT',
    qual: null,
    with_check:
      "((id = ( SELECT auth.uid() AS uid)) AND is_invited() AND (balance = 0) AND (is_admin = false) AND (lower(email) = lower((( SELECT auth.jwt() AS jwt) ->> 'email'::text))))",
  },
  { tablename: 'profiles', policyname: 'select_all_profiles', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
  {
    tablename: 'task_completions',
    policyname: 'select_task_completions',
    cmd: 'SELECT',
    qual: "((profile_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR ((status = 'approved'::text) AND is_invited()))",
    with_check: null,
  },
  { tablename: 'tasks', policyname: 'admin_insert_tasks', cmd: 'INSERT', qual: null, with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'admin_update_tasks', cmd: 'UPDATE', qual: 'is_admin()', with_check: 'is_admin()' },
  { tablename: 'tasks', policyname: 'select_tasks', cmd: 'SELECT', qual: 'is_invited()', with_check: null },
]

// How Postgres prints `(select is_invited())`. `is_admin = false` in insert_own_profile is the
// column, so only a call with parentheses counts.
const WRAPPED_CALL = /\( SELECT (is_invited|is_admin)\(\) AS \1\)/g
const BARE_CALL = /\bis_(invited|admin)\(\)/

function unwrap(expression: string | null): string | null {
  return expression === null ? null : expression.replace(WRAPPED_CALL, '$1()')
}

function byName(a: { tablename: string; policyname: string }, b: { tablename: string; policyname: string }) {
  const left = `${a.tablename}.${a.policyname}`
  const right = `${b.tablename}.${b.policyname}`
  return left < right ? -1 : left > right ? 1 : 0
}

async function publicPolicies(): Promise<Policy[]> {
  const rows = await pgQuery<Policy>(
    "select tablename, policyname, cmd, permissive, roles::text[] as roles, qual, with_check from pg_policies where schemaname = 'public'",
  )
  return rows.sort(byName)
}

describe('access rules after 0033', () => {
  it('keeps every policy as it was, apart from the (select …) wraps', async () => {
    const policies = await publicPolicies()

    expect(
      policies.map((p) => ({
        tablename: p.tablename,
        policyname: p.policyname,
        cmd: p.cmd,
        qual: unwrap(p.qual),
        with_check: unwrap(p.with_check),
      })),
    ).toEqual([...BEFORE_0033].sort(byName))
    for (const p of policies) {
      expect(p.permissive).toBe('PERMISSIVE')
      expect(p.roles).toEqual(['authenticated'])
    }
  })

  it('calls is_invited() and is_admin() only inside a (select …), so each runs once per statement', async () => {
    const bare = (await publicPolicies()).flatMap((p) =>
      [p.qual, p.with_check]
        .filter((expression): expression is string => expression !== null)
        .filter((expression) => BARE_CALL.test(expression.replace(WRAPPED_CALL, '')))
        .map((expression) => `${p.tablename}.${p.policyname}: ${expression}`),
    )
    expect(bare).toEqual([])
  })
})
```

Replace `tests/db/realtime-publication.test.ts` with the version below. The first list gains `'activity_events'`, and Task 2 adds it to `LIVE_TABLES`:

```ts
import { describe, it, expect } from 'vitest'
import { pgQuery } from './pg-query'
import { LIVE_TABLES } from '@/components/live/live-refresh'

async function publishedTables(): Promise<string[]> {
  const rows = await pgQuery<{ tablename: string }>(
    "select tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'",
  )
  return rows.map((row) => row.tablename)
}

describe('supabase_realtime publication', () => {
  it('contains every table the live updates watch', async () => {
    expect(await publishedTables()).toEqual(
      expect.arrayContaining([
        'activity_events',
        'bets',
        'markets',
        'market_resolutions',
        'parlays',
        'parlay_legs',
        'tasks',
        'task_completions',
        'profiles',
      ]),
    )
  })

  it('publishes every table LiveRefresh subscribes to', async () => {
    expect(await publishedTables()).toEqual(expect.arrayContaining([...LIVE_TABLES]))
  })

  it('publishes inserts, updates and deletes', async () => {
    const [publication] = await pgQuery<{ pubinsert: boolean; pubupdate: boolean; pubdelete: boolean }>(
      "select pubinsert, pubupdate, pubdelete from pg_publication where pubname = 'supabase_realtime'",
    )
    expect(publication).toEqual({ pubinsert: true, pubupdate: true, pubdelete: true })
  })
})
```

Run: `npx vitest run tests/db/activity-events.test.ts tests/db/data-layer-policies.test.ts tests/db/realtime-publication.test.ts`
Expected: FAIL, with 10 failed and 3 passed:
- all 8 cases in `activity-events.test.ts` fail on the missing table. `pgQuery` throws `postgres-meta 400 … relation "public.activity_events" does not exist`, and supabase-js returns `PGRST205`.
- in `data-layer-policies.test.ts`, "keeps every policy as it was" fails, missing `select_activity_events`. The wraps case passes.
- in `realtime-publication.test.ts`, "contains every table the live updates watch" fails, missing `activity_events`. The other two pass.

- [ ] **Step 2: Add the migration**

Create `supabase/migrations/0035_activity_events.sql`:

```sql
-- The feed's events, stored instead of rebuilt on every read. activity_feed
-- (0031) derives every event from seven tables and sorts them all on each
-- load; this table holds the same rows, kept in step by triggers, so a feed
-- page is one index range. The view stays until no deployed build reads it.
--
-- One explicit transaction, like 0034, because the migration runner
-- autocommits each statement. The lock makes every table a trigger below
-- watches read-only until commit, so no event can be written between the
-- backfill and the triggers taking over. create trigger takes this same lock
-- on each table anyway, one at a time; taking them together first fixes the
-- order, which follows 0033's: markets and completions, then bets and the
-- ledger, then parlays.
begin;
lock table public.markets, public.task_completions, public.bets, public.coin_transactions, public.parlays in share row exclusive mode;

-- Ids, kinds, times, actors and amounts are the view's, so feed cursors
-- (occurred_at, id) from before this migration still point at the same rows.
-- Names, titles, labels and leg counts are joined at read time, so nothing
-- here can go stale. hidden_at marks an event the current truth no longer
-- shows: an overridden resolution and its wins, or a reversed parlay win.
--
-- The foreign keys clean events up with their source rows (tests/db/
-- fixtures.ts deletes parlays, completions and markets before profiles).
-- Their checks take FOR KEY SHARE on the rows they name, which each source
-- row's own foreign keys already hold in the same transaction, or which that
-- transaction already locks itself (a resolve's market, a settle's parlay), so
-- the triggers add no new lock waits. Nothing takes FOR UPDATE on profiles
-- (0033), and no trigger takes a row lock of its own on a profile or a market.
create table public.activity_events (
  id text primary key,
  kind text not null check (kind in ('bet_placed','parlay_placed','market_created','market_resolved','bet_won','parlay_won','task_completed')),
  occurred_at timestamptz not null,
  actor_id uuid not null references public.profiles (id),
  market_id uuid references public.markets (id) on delete cascade,
  outcome_id uuid references public.market_outcomes (id) on delete cascade,
  bet_id bigint references public.bets (id) on delete cascade,
  resolution_id uuid references public.market_resolutions (id) on delete cascade,
  parlay_id uuid references public.parlays (id) on delete cascade,
  task_completion_id uuid references public.task_completions (id) on delete cascade,
  amount integer,
  hidden_at timestamptz
);

create index activity_events_feed_idx on public.activity_events (occurred_at desc, id desc) where hidden_at is null;
create index activity_events_actor_idx on public.activity_events (actor_id, occurred_at desc, id desc) where hidden_at is null;
-- A resolve or override hides and un-hides one market's resolution events;
-- without this it would scan the whole table while the market row is locked.
create index activity_events_market_resolution_idx on public.activity_events (market_id) where resolution_id is not null;

alter table public.activity_events enable row level security;

-- The same audience that can read the feed's source tables today. Task
-- events exist only for approved completions, which every invited member
-- can already see. No insert, update or delete policy: only the triggers
-- below write.
create policy select_activity_events on public.activity_events for select to authenticated
  using ((select is_invited()));

revoke all on public.activity_events from public, anon, authenticated, service_role;
grant select on public.activity_events to authenticated, service_role;

-- Each trigger mirrors the columns an event copies from its own source row,
-- on insert and on any later update of them, so a row written or edited
-- directly (the scale seed inserts approved completions and moves parlays'
-- created_at) still matches the view. Re-writing an existing event updates it
-- in place and un-hides it; on conflict keeps every write idempotent.

create function public.activity_events_from_bet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, amount)
  values ('bet:' || new.id, 'bet_placed', new.created_at, new.profile_id, new.market_id, new.outcome_id, new.id, new.amount)
  on conflict (id) do update set
    occurred_at = excluded.occurred_at,
    actor_id = excluded.actor_id,
    market_id = excluded.market_id,
    outcome_id = excluded.outcome_id,
    amount = excluded.amount,
    hidden_at = null;
  return null;
end;
$$;

create function public.activity_events_from_market()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.created_by, new.created_at) is distinct from (old.created_by, old.created_at) then
    insert into public.activity_events (id, kind, occurred_at, actor_id, market_id)
    values ('market:' || new.id, 'market_created', new.created_at, new.created_by, new.id)
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      hidden_at = null;
  end if;

  if (tg_op = 'INSERT' and new.current_resolution_id is null)
     or (tg_op = 'UPDATE' and new.current_resolution_id is not distinct from old.current_resolution_id) then
    return null;
  end if;

  -- The view shows only the current resolution and its wins. resolve_market
  -- moves current_resolution_id before it pays the new winners, so their
  -- bet_won events (coin_transactions trigger below) arrive after this hide.
  update public.activity_events
  set hidden_at = now()
  where market_id = new.id
    and resolution_id is not null
    and resolution_id is distinct from new.current_resolution_id
    and hidden_at is null;

  if new.current_resolution_id is not null then
    insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, resolution_id)
    select 'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, new.id, r.outcome_id, r.id
    from public.market_resolutions r
    where r.id = new.current_resolution_id
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      outcome_id = excluded.outcome_id,
      hidden_at = null;

    -- Only reachable by pointing a market back at an older resolution by
    -- hand; resolve_market always makes a new one.
    update public.activity_events
    set hidden_at = null
    where market_id = new.id
      and resolution_id = new.current_resolution_id
      and hidden_at is not null;
  end if;

  return null;
end;
$$;

-- A winner's payout, from the ledger row resolve_market writes for it, so the
-- amount is exactly what was paid. The view computes the same floor(stake ×
-- pool / winning pool) from pools that can't move once a market resolves.
-- Rows without resolve_market's meta (a hand-written ledger row) are skipped.
create function public.activity_events_from_payout()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.meta ->> 'bet_id', '') !~ '^[0-9]{1,18}$'
     or coalesce(new.meta ->> 'resolution_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;

  insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, amount, hidden_at)
  select 'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, new.profile_id, r.market_id, b.outcome_id, b.id, r.id, new.amount,
    case when m.current_resolution_id = r.id then null else now() end
  from public.bets b
  join public.market_resolutions r on r.id = (new.meta ->> 'resolution_id')::uuid
  join public.markets m on m.id = r.market_id
  where b.id = (new.meta ->> 'bet_id')::bigint
  on conflict (id) do update set
    occurred_at = excluded.occurred_at,
    actor_id = excluded.actor_id,
    outcome_id = excluded.outcome_id,
    amount = excluded.amount,
    hidden_at = excluded.hidden_at;
  return null;
end;
$$;

-- settle_parlay writes status, credited and settled_at in one update, so a
-- win is inserted with its final credit and time, and a reversal (won to
-- lost, through an override) hides it. A parlay that wins again later gets
-- its event back, with the new time and credit.
create function public.activity_events_from_parlay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or (new.profile_id, new.stake, new.created_at) is distinct from (old.profile_id, old.stake, old.created_at) then
    insert into public.activity_events (id, kind, occurred_at, actor_id, parlay_id, amount)
    values ('parlay:' || new.id, 'parlay_placed', new.created_at, new.profile_id, new.id, new.stake)
    on conflict (id) do update set
      occurred_at = excluded.occurred_at,
      actor_id = excluded.actor_id,
      amount = excluded.amount,
      hidden_at = null;
  end if;

  if new.status = 'won' then
    if tg_op = 'INSERT' or old.status <> 'won'
       or (new.profile_id, new.credited, new.settled_at) is distinct from (old.profile_id, old.credited, old.settled_at) then
      insert into public.activity_events (id, kind, occurred_at, actor_id, parlay_id, amount)
      values ('parlay_win:' || new.id, 'parlay_won', new.settled_at, new.profile_id, new.id, new.credited)
      on conflict (id) do update set
        occurred_at = excluded.occurred_at,
        actor_id = excluded.actor_id,
        amount = excluded.amount,
        hidden_at = null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'won' then
    update public.activity_events
    set hidden_at = now()
    where id = 'parlay_win:' || new.id and hidden_at is null;
  end if;

  return null;
end;
$$;

create function public.activity_events_from_task_completion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' or old.status <> 'approved'
       or (new.profile_id, new.reward_amount, new.reviewed_at) is distinct from (old.profile_id, old.reward_amount, old.reviewed_at) then
      insert into public.activity_events (id, kind, occurred_at, actor_id, task_completion_id, amount)
      values ('task:' || new.id, 'task_completed', new.reviewed_at, new.profile_id, new.id, new.reward_amount)
      on conflict (id) do update set
        occurred_at = excluded.occurred_at,
        actor_id = excluded.actor_id,
        amount = excluded.amount,
        hidden_at = null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'approved' then
    update public.activity_events
    set hidden_at = now()
    where id = 'task:' || new.id and hidden_at is null;
  end if;

  return null;
end;
$$;

-- Trigger functions can't be called directly, but they get the same
-- explicit revoke as every other function here (0006).
revoke execute on function public.activity_events_from_bet() from public, anon, authenticated;
revoke execute on function public.activity_events_from_market() from public, anon, authenticated;
revoke execute on function public.activity_events_from_payout() from public, anon, authenticated;
revoke execute on function public.activity_events_from_parlay() from public, anon, authenticated;
revoke execute on function public.activity_events_from_task_completion() from public, anon, authenticated;

create trigger activity_events_from_bet
  after insert or update of market_id, outcome_id, profile_id, amount, created_at on public.bets
  for each row execute function public.activity_events_from_bet();

create trigger activity_events_from_market
  after insert or update of created_by, created_at, current_resolution_id on public.markets
  for each row execute function public.activity_events_from_market();

create trigger activity_events_from_payout
  after insert on public.coin_transactions
  for each row when (new.type = 'bet_won') execute function public.activity_events_from_payout();

create trigger activity_events_from_parlay
  after insert or update of profile_id, stake, created_at, status, credited, settled_at on public.parlays
  for each row execute function public.activity_events_from_parlay();

create trigger activity_events_from_task_completion
  after insert or update of profile_id, status, reward_amount, reviewed_at on public.task_completions
  for each row execute function public.activity_events_from_task_completion();

-- Every row the view shows today, with the related ids its own ids carry.
-- The view has no outcome id, so it comes from the bet, or for a resolution
-- from the resolution row. tests/db/activity-events.test.ts runs this same
-- statement against a scratch table and compares it with the triggers' rows.
insert into public.activity_events (id, kind, occurred_at, actor_id, market_id, outcome_id, bet_id, resolution_id, parlay_id, task_completion_id, amount)
select f.id, f.kind, f.occurred_at, f.actor_id, f.market_id, coalesce(b.outcome_id, r.outcome_id), f.bet_id, f.resolution_id, f.parlay_id, f.task_completion_id, f.amount
from (
  select v.id, v.kind, v.occurred_at, v.actor_id, v.market_id, v.amount,
    case when v.kind in ('bet_placed', 'bet_won') then split_part(v.id, ':', 2)::bigint end as bet_id,
    case v.kind when 'market_resolved' then split_part(v.id, ':', 2)::uuid when 'bet_won' then split_part(v.id, ':', 3)::uuid end as resolution_id,
    case when v.kind in ('parlay_placed', 'parlay_won') then split_part(v.id, ':', 2)::uuid end as parlay_id,
    case when v.kind = 'task_completed' then split_part(v.id, ':', 2)::uuid end as task_completion_id
  from public.activity_feed v
) f
left join public.bets b on b.id = f.bet_id
left join public.market_resolutions r on r.id = f.resolution_id;

-- For live updates (components/live/live-refresh.tsx), guarded as in 0032.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if (select puballtables from pg_publication where pubname = 'supabase_realtime') then
    return;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'activity_events'
  ) then
    alter publication supabase_realtime add table public.activity_events;
  end if;
end
$$;

commit;
```

**Notes on the backfill:**
- **Where the related ids come from.** The view carries no bet, resolution, parlay or completion id, so the backfill parses them out of the view's own ids with `split_part`. The outcome comes from the bet, or, for `market_resolved`, from the resolution row.
- **Why it can't clash with the triggers.** The triggers already exist when it runs, but the lock at the top means no source row can change before `commit`. The backfill therefore inserts into an empty table, and nothing written by a trigger can collide with it.

- [ ] **Step 3: Apply it and see the tests pass**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0035_activity_events.sql` without error.

Run: `npx vitest run tests/db/activity-events.test.ts tests/db/data-layer-policies.test.ts tests/db/realtime-publication.test.ts tests/db/activity-feed.test.ts`
Expected: PASS: the 8 new cases, the 5 cases in the two updated files, and `activity-feed.test.ts` unchanged. The view is untouched.

- [ ] **Step 4: Verify**

Local Supabase must be running, with 0035 applied (Step 3).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1073 tests in 161 files, 44 of them in `tests/db/`. This task adds 8 tests in 1 file.
- **Existing tests:** every one still passes, including the fixtures' cleanup in every `beforeEach`. The triggers write events while those tests run, and the cascades remove them again.
- **Build:** the same 20 routes as `da8555a`, `/_not-found` included.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, the same as before. Nothing reads `activity_events` yet.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0035_activity_events.sql tests/db/activity-events.test.ts tests/db/data-layer-policies.test.ts tests/db/realtime-publication.test.ts
git commit -m "Store feed events in a table kept in step by triggers"
```

---

## Task 2: The feed reads the table

Task 1 lands `activity_events`, kept in step by triggers, with the same ids `activity_feed` already uses. This task moves the readers over to it: `listFeed` (the only thing `/feed` and a member's activity page call) switches its source table and reconstructs the same `FeedEvent`s through PostgREST embeds instead of the view's SQL joins, and the two live-update declarations that used to watch every source table directly (`feed()`, `member()`) collapse onto `activity_events` itself — closing a real gap along the way, since a member's activity page never watched `market_resolutions` or `task_completions` for someone else's task approval.

**Files:**
- Modify: `lib/social/list-feed.ts`
- Modify: `lib/live/page-subscriptions.ts`
- Modify: `components/live/live-refresh.tsx` (`LIVE_TABLES` only)
- Test, modify: `tests/lib/live/page-subscriptions.test.ts`, `tests/db/social-readers.test.ts`

**Interfaces:**
- Consumes:
  - `public.activity_events` (Task 1): `id text primary key`, `kind`, `occurred_at`, `actor_id uuid not null references profiles(id)`, `market_id uuid references markets(id)`, `outcome_id uuid references market_outcomes(id)`, `bet_id`, `resolution_id`, `parlay_id uuid references parlays(id)`, `task_completion_id uuid references task_completions(id)`, `amount`, `hidden_at`. RLS: select only, to `authenticated`/`service_role`, gated the same way `activity_feed` is today.
  - `FeedEvent`, `FeedKind` (`lib/social/describe-event.ts`, unchanged by this task).
  - `readKeyset`, `rangeFilter`, `olderThanFilter`, `newerThanFilter` (`lib/pagination/keyset.ts`, unchanged); `PageParams` (`lib/pagination/cursor.ts`).
  - `LiveSubscription`, `LIVE_TABLES` (`components/live/live-refresh.tsx`).
- Produces:
  - `listFeed(supabase, opts)` — same signature, same `KeysetPage<FeedEvent>` return shape, same keyset paging over `(occurred_at, id)`. Every caller (`app/(app)/feed/page.tsx`, `app/(app)/members/[id]/page.tsx`) is unchanged.
  - `pageSubscriptions.feed(): LiveSubscription[]` → `[{ table: 'activity_events' }]`.
  - `pageSubscriptions.member(memberId): LiveSubscription[]` → `[{ table: 'activity_events', filter: 'actor_id=eq.<id>' }, { table: 'profiles' }]`.
  - `LIVE_TABLES` gains `'activity_events'`.

**On the join.** `activity_events` has exactly one foreign key to each of `profiles` (`actor_id`), `markets` (`market_id`), `market_outcomes` (`outcome_id`) and `parlays` (`parlay_id`), and exactly one to `task_completions` (`task_completion_id`), which itself has exactly one foreign key to `tasks` (`task_id`). PostgREST can embed through every one of these without `!fkey` disambiguation, so `listFeed` selects:

```
id, kind, occurred_at, actor_id, market_id, amount,
actor:profiles(display_name),
market:markets(title),
outcome:market_outcomes(label),
task_completion:task_completions(task:tasks(title)),
parlay:parlays(parlay_legs(id))
```

`parlay_legs` is capped at 6 rows per parlay (`MAX_PICKS`, `lib/parlays/odds.ts`), so embedding it to count legs client-side never grows with table size, and it needs no `count` aggregate embed (a PostgREST feature this codebase doesn't otherwise rely on). This is the same alias/embed idiom already proven in `lib/markets/get-market.ts` (`creator:profiles(display_name)`, `market_outcomes(id, label, pool_total)`), including its `(data ?? []) as unknown as Row[]` cast, needed because this repo's `SupabaseClient` isn't parameterized with a generated `Database` type.

- [ ] **Step 1: Write the failing subscription tests**

In `tests/lib/live/page-subscriptions.test.ts`, replace:

```ts
  it('member watches every profile for live ranks, and carries the member id through bets and parlays', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'profiles' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })
```

with:

```ts
  it('member watches every profile for live ranks, and carries the member id through activity_events', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'activity_events', filter: `actor_id=eq.${MEMBER_ID}` },
      { table: 'profiles' },
    ])
  })
```

In the same file, replace:

```ts
  it('feed watches every table its event kinds come from, including markets for market_created', () => {
    expect(pageSubscriptions.feed()).toEqual([
      { table: 'bets' },
      { table: 'parlays' },
      { table: 'task_completions' },
      { table: 'market_resolutions' },
      { table: 'markets' },
    ])
  })
```

with:

```ts
  it('feed watches only activity_events, now that every event kind is a row in it', () => {
    expect(pageSubscriptions.feed()).toEqual([{ table: 'activity_events' }])
  })
```

Run: `npx vitest run tests/lib/live/page-subscriptions.test.ts`
Expected: FAIL, 2 failed and 18 passed. `pageSubscriptions.member()` and `.feed()` still return their current arrays; every other pinned declaration (`marketDetail`, `markets`, `home`, `leaderboard`, `tasks`, `parlays`, `adminTasks`, plus the generic "only declares published tables" loop) is untouched and keeps passing.

- [ ] **Step 2: Update the live subscriptions**

In `lib/live/page-subscriptions.ts`, replace:

```ts
  // profiles is unfiltered, not id=eq.<memberId>: this page also shows the member's live rank
  // (getMemberStanding), which moves whenever any other member's balance does.
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'profiles' },
      { table: 'bets', filter: `profile_id=eq.${memberId}` },
      { table: 'parlays', filter: `profile_id=eq.${memberId}` },
    ]
  },
  // market_created feed rows come from markets, not bets.
  feed(): LiveSubscription[] {
    return [
      { table: 'bets' },
      { table: 'parlays' },
      { table: 'task_completions' },
      { table: 'market_resolutions' },
      { table: 'markets' },
    ]
  },
```

with:

```ts
  // profiles is unfiltered, not id=eq.<memberId>: this page also shows the member's live rank
  // (getMemberStanding), which moves whenever any other member's balance does. activity_events
  // carries every kind this page shows, task approvals and resolutions included.
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'activity_events', filter: `actor_id=eq.${memberId}` },
      { table: 'profiles' },
    ]
  },
  // Every feed kind is a row in activity_events now, so it's the only table to watch.
  feed(): LiveSubscription[] {
    return [{ table: 'activity_events' }]
  },
```

In `components/live/live-refresh.tsx`, replace:

```ts
export const LIVE_TABLES = [
  'bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'tasks',
  'task_completions',
  'profiles',
] as const
```

with:

```ts
export const LIVE_TABLES = [
  'bets',
  'markets',
  'market_resolutions',
  'parlays',
  'parlay_legs',
  'tasks',
  'task_completions',
  'profiles',
  'activity_events',
] as const
```

Run: `npx vitest run tests/lib/live/page-subscriptions.test.ts`
Expected: PASS, 20 tests.

Run: `npx tsc --noEmit`
Expected: PASS. (`tests/db/realtime-publication.test.ts`'s second assertion, `expect.arrayContaining([...LIVE_TABLES])`, now requires `activity_events` to be a published table — Task 1 already adds it to `supabase_realtime` and to that file's own hardcoded list, so this needs no change here; don't touch that file.)

- [ ] **Step 3: Write the failing DB tests**

Local Supabase must be running, with `0035` applied (Task 1).

In `tests/db/social-readers.test.ts`, replace the import:

```ts
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
```

with:

```ts
import { seedMembers, makeMember, clientFor, createTestMarket, createTestTask, ensureInvited, type Member } from './fixtures'
import { pgQuery } from './pg-query'
```

In the same file, in `describe('listFeed', ...)`, replace the closing of the block:

```ts
    expect(second.rows.slice(0, 50).map((e) => e.id)).toEqual(first.rows.map((e) => e.id))
    expect(new Set(second.rows.map((e) => e.id)).size).toBe(51)
    expect(second.next).toBeNull()
  })
})
```

with:

```ts
    expect(second.rows.slice(0, 50).map((e) => e.id)).toEqual(first.rows.map((e) => e.id))
    expect(new Set(second.rows.map((e) => e.id)).size).toBe(51)
    expect(second.next).toBeNull()
  })

  it('joins a parlay’s leg count and a task’s title through activity_events', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Parlay market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Parlay market B' })
    expect((await aliceClient.rpc('place_bet', { p_market_id: a.marketId, p_outcome_id: a.outcomeIds[0], p_amount: 5 })).error).toBeNull()
    expect((await aliceClient.rpc('place_bet', { p_market_id: b.marketId, p_outcome_id: b.outcomeIds[0], p_amount: 5 })).error).toBeNull()
    expect(
      (await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })).error,
    ).toBeNull()

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const { taskId } = await createTestTask(alice, { title: 'Read Psalm 23', rewardAmount: 9 })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const { rows } = await listFeed(bobClient, { actorId: bob.id, page: NO_PAGE })
    expect(rows).toContainEqual(expect.objectContaining({ kind: 'parlay_placed', actorId: bob.id, amount: 10, legCount: 2 }))
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'task_completed', actorId: bob.id, taskTitle: 'Read Psalm 23', amount: 9 }),
    )
  })

  // activity_feed (the view 0035 leaves in place) recomputes every row from source tables on
  // every read, so it never consults activity_events.hidden_at. Hiding a row directly here, with
  // no matching write to any source table, only shows through listFeed once it reads
  // activity_events itself, so this proves the swap happened. service_role can only select from
  // activity_events, so the hide goes through pgQuery as the table's owner.
  it('excludes an event once its hidden_at is set on activity_events', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Hide-me market' })

    const before = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(before.rows.map((e) => e.kind)).toEqual(['market_created'])

    await pgQuery(
      `update public.activity_events set hidden_at = now() where market_id = '${market.marketId}' and kind = 'market_created'`,
    )

    const after = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(after.rows).toEqual([])
  })
})
```

Run: `npx vitest run tests/db/social-readers.test.ts`
Expected: FAIL, 1 failed and 9 passed. The hiding case fails: `listFeed` still reads `activity_feed`, which recomputes `market_created` straight from `markets` on every read and has no `hidden_at` to consult, so the row is still there after the direct update. The leg-count/task-title case already passes — `activity_feed` computes both correctly today too — and pins that `listFeed` keeps producing them once Step 4 moves it onto the table.

- [ ] **Step 4: Move `listFeed` onto `activity_events`**

Replace `lib/social/list-feed.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import type { PageParams } from '@/lib/pagination/cursor'

interface FeedRow {
  id: string
  kind: FeedKind
  occurred_at: string
  actor_id: string
  market_id: string | null
  amount: number | null
  actor: { display_name: string } | null
  market: { title: string } | null
  outcome: { label: string } | null
  task_completion: { task: { title: string } | null } | null
  parlay: { parlay_legs: { id: string }[] } | null
}

// Names, labels, the task title and the parlay leg count are joined at read time through
// PostgREST embeds, not stored on activity_events: every one of these foreign keys (actor_id,
// market_id, outcome_id, task_completion_id, parlay_id) has exactly one relationship to embed
// through, so no `!fkey` disambiguation is needed. parlay_legs is capped at 6 rows per parlay
// (MAX_PICKS, lib/parlays/odds.ts), so this never grows with the size of the table.
const FEED_COLUMNS =
  'id, kind, occurred_at, actor_id, market_id, amount, ' +
  'actor:profiles(display_name), market:markets(title), outcome:market_outcomes(label), ' +
  'task_completion:task_completions(task:tasks(title)), parlay:parlays(parlay_legs(id))'
const FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

function toFeedEvent(r: FeedRow): FeedEvent {
  return {
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor?.display_name ?? '',
    marketId: r.market_id,
    marketTitle: r.market?.title ?? null,
    outcomeLabel: r.outcome?.label ?? null,
    amount: r.amount,
    legCount: r.parlay ? r.parlay.parlay_legs.length : null,
    taskTitle: r.task_completion?.task?.title ?? null,
  }
}

export async function listFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  const fetchRows = async (filter: string | null, limit: number): Promise<FeedRow[]> => {
    let query = supabase
      .from('activity_events')
      .select(FEED_COLUMNS)
      .is('hidden_at', null)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as unknown as FeedRow[]
  }

  const { rows, next, windowed } = await readKeyset<FeedRow>(
    opts.page,
    FEED_KEY_COLUMNS,
    fetchRows,
    (row) => ({ ts: row.occurred_at, id: row.id }),
  )

  return { rows: rows.map(toFeedEvent), next, windowed }
}
```

Run: `npx vitest run tests/db/social-readers.test.ts`
Expected: PASS, 10 tests (the 8 that existed before this task, plus the 2 added in Step 3).

- [ ] **Step 5: Verify**

Local Supabase must be running, with `0035` applied.

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1075 tests in 161 files, 44 of them in `tests/db/`. This task adds 2 tests to `tests/db/social-readers.test.ts` and rewrites 2 in `tests/lib/live/page-subscriptions.test.ts` (no count change there).
- **Build:** the same 20 routes as before; this task adds none.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged. No e2e spec asserts on `pageSubscriptions`' internals or `listFeed`'s query shape — only on what `/feed` and `/members/[id]` render, which is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/social/list-feed.ts lib/live/page-subscriptions.ts components/live/live-refresh.tsx \
  tests/lib/live/page-subscriptions.test.ts tests/db/social-readers.test.ts
git commit -m "Read the feed from activity_events instead of the view"
```

---

## Task 3: Sparklines in the database

`/markets` reads every bet ever placed on every card it shows, only to draw 84px sparklines (`listChartBets`, `lib/markets/chart-bets.ts`). This task adds `public.market_sparklines`, which does the chart maths in the database and returns one row per market, carrying a few dozen points. Task 4 switches the list page to it.

**The maths is `buildProbabilitySeries`, exactly.** It follows `lib/markets/probability-series.ts` step for step:
- bets in `(created_at, id)` order, which is the reader's order, kept by the stable sort in TS
- a running pool per outcome, and a running total
- at each bet, every outcome of the market gets `pool / total`, an outcome with no bets included (at 0)

The division is `double precision`, the same IEEE division JavaScript does on the same two integers.

**What was checked.** On a throwaway Postgres with 0001–0035 and the scale seed run twice, every share of every point came out bit-identical to `buildProbabilitySeries` at the same bets. That's all 400 markets, 40,000 bets and 36,000 shares at 40 points, plus a 450-bet, six-outcome market with same-instant ties.

**Why the test compares to 12 decimal places.** Supabase's Postgres ships `extra_float_digits = 0` in `postgresql.conf`, so each share reaches JSON rounded to 15 significant digits: at most 5.6e-16 from JavaScript's value, which was measured. Twelve decimal places sits well inside that, and far past anything a chart can draw.

**Which points come back.** A market with n bets returns k = min(n, p_points) of them. These are evenly spaced from the first bet to the last: position `1 + (i − 1)(n − 1) / (k − 1)` in integer division, for i = 1…k. With k = 1, only the last bet comes back.
- **The spec requires** "always including the last one".
- **This plan also keeps the first,** so the compact line spans the same time as today's full-history line and starts at the same point.
- **Short markets:** a market with fewer bets than p_points returns every bet, so its sparkline is exactly today's.

**One row per market (a ruling).** The function returns `(market_id uuid, points jsonb)`, where `points` is a JSON array of `{ "t": <timestamptz>, "shares": { <outcome id>: <share> } }` in bet order. The spec's shape, one row per point, would put up to 50 × 40 = 2,000 rows in one call. PostgREST's `max_rows = 1000` (`supabase/config.toml`) applies to RPC results too and truncates silently, and the repo's own bound is 500 rows per request. One row per market means at most 50 rows per call, whatever `p_points` is, so neither limit can cut a chart short.

**Caps.** Both are silent, so a caller that sends too much still gets an answer:
- **p_points** is clamped to 1…200. Null counts as the default of 40.
- **p_market_ids:** only the first 50 elements are read, and duplicates count once.

**Inlined, and invoker.**
- **What the caller can see.** The function is `language sql stable`, security invoker, so the caller's access rules on `bets` and `market_outcomes` apply. An uninvited member gets no rows, exactly as the reads it replaces do.
- **Why there's no `set search_path`.** Postgres only inlines a SQL function that has no SET clause. Inlined, the planner sees the bet reads inside it, so EXPLAIN can show `bets_market_created_idx` (a non-inlined call shows only an opaque Function Scan).
- **Why that's safe.** Every relation in the body is schema-qualified (`public.bets`, `public.market_outcomes`), and `unnest`, `generate_series` and the `jsonb` builders resolve from `pg_catalog`, which is always searched first. An invoker function runs with the caller's own rights, so the caller's search_path can only affect the caller.
- **Consistency with the rest of the repo.** Every other function here sets `search_path`, and this one's comment says why it doesn't.

**Files:**
- Modify: `supabase/migrations/0035_activity_events.sql` (Task 1's file; a new section just before its final `commit;`)
- Test, create: `tests/db/market-sparklines.test.ts`

**Interfaces:**
- Consumes:
  - `supabase/migrations/0035_activity_events.sql` from Task 1. It ends with a line containing only `commit;`, the only such line in the file.
  - `bets` (0008), with `bets_market_created_idx (market_id, created_at desc, id desc)` (0033), and `market_outcomes` (0008). The select policies on both are `(select is_invited())`, and bets' is `or (select is_admin())`.
  - `buildProbabilitySeries(outcomeIds: string[], bets: ChartBet[]): SeriesPoint[]` and `type SeriesPoint = { t: number; shares: Record<string, number> }` (`lib/markets/probability-series.ts`), unchanged.
  - The test helpers:
    - `serviceClient()` (`tests/db/helpers.ts`)
    - `seedMembers`, `makeMember`, `clientFor`, `createTestMarket`, `ensureInvited`, `Member` and `TestMarket` (`tests/db/fixtures.ts`)
    - `pgQuery` (`tests/db/pg-query.ts`)
- Produces, for Task 4:
  - The function:
    ```sql
    public.market_sparklines(p_market_ids uuid[], p_points integer default 40)
    returns table (market_id uuid, points jsonb)
    language sql stable  -- security invoker, inlinable
    ```
  - Execute is revoked from `public` and `anon`, and granted to `authenticated` and `service_role`.
  - Called as `supabase.rpc('market_sparklines', { p_market_ids: ids })`. It returns an array of rows:
    ```ts
    { market_id: string; points: { t: string; shares: Record<string, number> }[] }[]
    ```
  - **The rows:**
    - One per market that has bets, ordered by `market_id`. At most 50.
    - `points` is in bet order, with at most `p_points` entries (40 by default), the last bet always included.
    - Each point's `t` is the chosen bet's `created_at`, as an ISO string. `Date.parse(t)` equals `buildProbabilitySeries`'s `t` for that bet.
    - Each point's `shares` has one key per outcome of the market.
  - **Markets with no row:** a market with no bets, one the caller can't see, or one past the 50th id. None of these is an error.

- [ ] **Step 1: Write the failing DB test**

Local Supabase must be running, with Task 1's 0035 applied (`npm run db:reset`).

Create `tests/db/market-sparklines.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { buildProbabilitySeries, type SeriesPoint } from '@/lib/markets/probability-series'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

interface SparklinePoint {
  t: string
  shares: Record<string, number>
}

interface SparklineRow {
  market_id: string
  points: SparklinePoint[]
}

async function sparklines(client: SupabaseClient, marketIds: string[], points?: number): Promise<SparklineRow[]> {
  const { data, error } = await client.rpc('market_sparklines', {
    p_market_ids: marketIds,
    ...(points === undefined ? {} : { p_points: points }),
  })
  if (error) throw error
  return data as SparklineRow[]
}

// One market's points, after checking the call returned that market's row and nothing else.
async function pointsOf(client: SupabaseClient, market: TestMarket, points?: number): Promise<SparklinePoint[]> {
  const rows = await sparklines(client, [market.marketId], points)
  expect(rows.map((r) => r.market_id)).toEqual([market.marketId])
  return rows[0].points
}

async function placeBet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

// Inserted directly, a minute apart from 1 September: hundreds of place_bet calls would be slow,
// and the function never reads the outcomes' pools. Amounts and outcomes vary, so every share moves.
async function insertBets(market: TestMarket, count: number): Promise<void> {
  const start = Date.parse('2026-09-01T00:00:00.000Z')
  const rows = Array.from({ length: count }, (_, i) => ({
    market_id: market.marketId,
    outcome_id: market.outcomeIds[(i * 7) % market.outcomeIds.length],
    profile_id: i % 2 === 0 ? alice.id : bob.id,
    amount: 1 + ((i * 13) % 17),
    created_at: new Date(start + i * 60_000).toISOString(),
  }))
  const { error } = await serviceClient().from('bets').insert(rows)
  if (error) throw error
}

// The whole series the market page's chart draws, from every bet, oldest first.
async function fullSeries(market: TestMarket): Promise<SeriesPoint[]> {
  const { data, error } = await serviceClient()
    .from('bets')
    .select('outcome_id, amount, created_at')
    .eq('market_id', market.marketId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  return buildProbabilitySeries(
    market.outcomeIds,
    data.map((b) => ({ outcomeId: b.outcome_id as string, amount: b.amount as number, createdAt: b.created_at as string })),
  )
}

// Which bets the function keeps: k evenly spaced positions from the first bet to the last.
function picked(series: SeriesPoint[], points: number): SeriesPoint[] {
  const k = Math.min(series.length, points)
  if (k === 1) return [series[series.length - 1]]
  return Array.from({ length: k }, (_, i) => series[Math.floor((i * (series.length - 1)) / (k - 1))])
}

// The database's float division is the same IEEE division as JavaScript's, but Supabase's Postgres
// sets extra_float_digits = 0, so each share reaches JSON rounded to 15 significant digits. Twelve
// decimal places is well inside that and far past anything a chart can show.
function expectSameSeries(points: SparklinePoint[], expected: SeriesPoint[]): void {
  expect(points).toHaveLength(expected.length)
  points.forEach((point, i) => {
    expect(Date.parse(point.t)).toBe(expected[i].t)
    expect(Object.keys(point.shares).sort()).toEqual(Object.keys(expected[i].shares).sort())
    for (const [outcomeId, share] of Object.entries(expected[i].shares)) {
      expect(point.shares[outcomeId]).toBeCloseTo(share, 12)
    }
  })
}

describe('market_sparklines', () => {
  it("returns every bet's shares when a market has fewer bets than p_points, as buildProbabilitySeries computes them", async () => {
    const market = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'])
    await placeBet(aliceClient, market, 0, 10)
    await placeBet(bobClient, market, 1, 3)
    await placeBet(bobClient, market, 0, 7)
    await placeBet(aliceClient, market, 1, 4)

    const points = await pointsOf(bobClient, market)
    const series = await fullSeries(market)
    expect(series).toHaveLength(4)
    expectSameSeries(points, series)
    // Green has no bets, and still has a share: zero, as the chart draws it.
    expect(points.every((p) => p.shares[market.outcomeIds[2]] === 0)).toBe(true)
    expect(points.at(-1)!.shares[market.outcomeIds[0]]).toBeCloseTo(17 / 24, 12)
  })

  it('picks at most p_points evenly spaced bets, always the first and the last', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 25)

    const points = await pointsOf(bobClient, market, 7)
    const series = await fullSeries(market)
    expectSameSeries(points, picked(series, 7))
    expect(Date.parse(points[0].t)).toBe(series[0].t)
    expect(Date.parse(points.at(-1)!.t)).toBe(series.at(-1)!.t)

    // The default is 40 points, more than this market's 25 bets, so every bet comes back.
    expectSameSeries(await pointsOf(bobClient, market), series)
  })

  it('caps p_points at 200, and keeps the last bet when asked for fewer than one', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No', 'Maybe'])
    await insertBets(market, 205)
    const series = await fullSeries(market)

    const capped = await pointsOf(bobClient, market, 1000)
    expect(capped).toHaveLength(200)
    expectSameSeries(capped, picked(series, 200))

    for (const points of [1, 0, -5]) {
      expectSameSeries(await pointsOf(bobClient, market, points), [series.at(-1)!])
    }
  })

  it('returns one row for each market that has bets, with its points in bet order', async () => {
    const empty = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'No bets' })
    const first = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'First' })
    const second = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Second' })
    await placeBet(aliceClient, first, 0, 5)
    await placeBet(bobClient, second, 1, 8)
    await placeBet(aliceClient, first, 1, 15)

    const rows = await sparklines(bobClient, [empty.marketId, first.marketId, second.marketId])
    expect(rows.map((r) => r.market_id).sort()).toEqual([first.marketId, second.marketId].sort())
    expectSameSeries(rows.find((r) => r.market_id === first.marketId)!.points, await fullSeries(first))
    expectSameSeries(rows.find((r) => r.market_id === second.marketId)!.points, await fullSeries(second))
    expect(await sparklines(bobClient, [empty.marketId])).toEqual([])
  })

  it('reads at most 50 market ids per call, and returns every point of all 50 in one response', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)
    // Fifty more markets with 41 bets each, inserted directly: fifty create_market calls and 2,050
    // place_bet calls are slow. 50 × 40 points is 2,000, twice PostgREST's 1,000-row cap (max_rows,
    // supabase/config.toml), which one row per market keeps out of reach.
    const db = serviceClient()
    const { data: others, error } = await db
      .from('markets')
      .insert(
        Array.from({ length: 50 }, (_, i) => ({
          created_by: alice.id,
          title: `Filler ${i}`,
          kind: 'binary',
          close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })),
      )
      .select('id')
    if (error) throw error
    const fillers = others.map((m) => m.id as string)
    const { data: outcomes, error: outcomesErr } = await db
      .from('market_outcomes')
      .insert(fillers.flatMap((id) => [{ market_id: id, label: 'Yes' }, { market_id: id, label: 'No' }]))
      .select('id, market_id')
    if (outcomesErr) throw outcomesErr
    const outcomesOf = new Map<string, string[]>()
    for (const o of outcomes) outcomesOf.set(o.market_id as string, [...(outcomesOf.get(o.market_id as string) ?? []), o.id as string])
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    const { error: betsErr } = await db.from('bets').insert(
      fillers.flatMap((id) =>
        Array.from({ length: 41 }, (_, i) => ({
          market_id: id,
          outcome_id: outcomesOf.get(id)![i % 2],
          profile_id: alice.id,
          amount: 1 + (i % 5),
          created_at: new Date(start + i * 60_000).toISOString(),
        })),
      ),
    )
    if (betsErr) throw betsErr

    const past = await sparklines(bobClient, [...fillers, market.marketId])
    expect(past.map((r) => r.market_id).sort()).toEqual([...fillers].sort())
    expect(past.every((r) => r.points.length === 40)).toBe(true)

    const within = await sparklines(bobClient, [market.marketId, ...fillers])
    expect(within).toHaveLength(50)
    expect(within.find((r) => r.market_id === market.marketId)?.points).toHaveLength(1)
  })

  it('returns nothing to an uninvited member, and is closed to anon', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await sparklines(carolClient, [market.marketId])).toEqual([])

    const [fn] = await pgQuery<{
      anon: boolean
      authenticated: boolean
      service_role: boolean
      security_definer: boolean
      volatility: string
    }>(`
      select
        has_function_privilege('anon', 'public.market_sparklines(uuid[], integer)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.market_sparklines(uuid[], integer)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.market_sparklines(uuid[], integer)', 'execute') as service_role,
        p.prosecdef as security_definer,
        p.provolatile::text as volatility
      from pg_proc p
      where p.oid = 'public.market_sparklines(uuid[], integer)'::regprocedure
    `)
    expect(fn).toEqual({ anon: false, authenticated: true, service_role: true, security_definer: false, volatility: 's' })
  })

  it("reads each market's bets through bets_market_created_idx", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)
    await placeBet(bobClient, market, 1, 5)
    await pgQuery('vacuum (analyze) public.bets, public.market_outcomes;')

    interface PlanNode {
      'Node Type': string
      'Relation Name'?: string
      'Index Name'?: string
      Plans?: PlanNode[]
    }
    // The function is plain SQL with no SET clause, so Postgres inlines it and EXPLAIN shows the
    // bet reads inside it; a scan of bets in the plan proves the inlining. The fixture is two bets,
    // where a sequential scan is cheapest whatever the indexes, so seq scans are priced out for the
    // one statement.
    const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `set local enable_seqscan = off; explain (format json) select * from public.market_sparklines(array['${market.marketId}']::uuid[], 40)`,
    )
    const nodes: PlanNode[] = []
    const walk = (node: PlanNode) => {
      nodes.push(node)
      node.Plans?.forEach(walk)
    }
    walk(row['QUERY PLAN'][0].Plan)

    const betScans = nodes.filter((n) => n['Relation Name'] === 'bets')
    expect(betScans.length).toBeGreaterThan(0)
    for (const scan of betScans) expect(scan['Node Type']).not.toBe('Seq Scan')
    const indexNames = nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : []))
    expect(indexNames).toContain('bets_market_created_idx')
  })
})
```

**How the test builds its expectations.**
- **Where the expected series comes from:** the market's bets, read oldest first, go through the real `buildProbabilitySeries`.
- **Which points are compared:** those at the positions the spec describes (`picked`).
- **Why the larger markets insert bets directly:** they insert bets straight into the table, as `chart-bets.test.ts` does, a minute apart. The function never reads the outcomes' pools, so skipping `place_bet` changes nothing it computes.
- **The 50-id case** asks for 51 markets that all have bets. It proves both caps at once: the 51st id is ignored, and 50 markets at 40 points each (2,000 points) come back whole, which a row per point could not do under `max_rows`.

Run: `npx vitest run tests/db/market-sparklines.test.ts`
Expected: FAIL, with 7 failed:
- the six RPC cases get `PGRST202`, because `public.market_sparklines` isn't in the schema cache
- the EXPLAIN case's `pgQuery` throws `postgres-meta 400 … function public.market_sparklines(uuid[], integer) does not exist`

- [ ] **Step 2: Add the function to the migration**

In `supabase/migrations/0035_activity_events.sql`, replace the file's final line, `commit;`, with the block below. The block ends with that same `commit;`, so the function is created inside Task 1's transaction:

```sql
-- A small chart series per market card on /markets, so the list no longer
-- reads every bet ever placed on every card it shows. Same maths as
-- buildProbabilitySeries (lib/markets/probability-series.ts): bets in
-- (created_at, id) order, each outcome's running pool over the running total,
-- over that market's own outcomes. Only the shares at up to p_points evenly
-- spaced bets come back, always the first and the last, so the line spans the
-- same time as the full chart and ends at today's split. A market with no bets
-- returns no row.
--
-- One row per market, its points a JSON array in bet order, so a call of 50
-- ids is at most 50 rows: one row per point would reach 2,000 at the default
-- and be cut short by PostgREST's max_rows without an error.
--
-- Security invoker, so the caller's access rules on bets and market_outcomes
-- apply, as they do to the reads it replaces: an uninvited caller gets
-- nothing. No set search_path: Postgres only inlines a SQL function that has
-- no SET clause, which lets the planner see the bet reads (and EXPLAIN show
-- them). Every relation is schema-qualified, the functions it calls resolve
-- from pg_catalog, and an invoker function runs with the caller's own rights,
-- so the caller's search_path can only affect them.
--
-- The caps are silent: ids past the 50th are ignored, and p_points is clamped
-- to 1..200. lib/markets/sparklines.ts sends at most 50 ids per call.
create function public.market_sparklines(p_market_ids uuid[], p_points integer default 40)
returns table (market_id uuid, points jsonb)
language sql
stable
as $$
  with ids as (
    select distinct u.id
    from unnest(p_market_ids[1:50]) as u(id)
  ),
  ordered as (
    select b.market_id, b.outcome_id, b.amount, b.created_at,
      row_number() over (partition by b.market_id order by b.created_at, b.id) as n
    from public.bets b
    where b.market_id in (select ids.id from ids)
  ),
  sized as (
    select o.market_id, count(*) as bets,
      least(count(*), greatest(1, least(coalesce(p_points, 40), 200))) as points
    from ordered o
    group by o.market_id
  ),
  picked as (
    select s.market_id,
      case when s.points = 1 then s.bets else 1 + (g.i - 1) * (s.bets - 1) / (s.points - 1) end as n
    from sized s
    cross join lateral generate_series(1, s.points) as g(i)
  ),
  running as (
    select o.market_id, o.n, o.created_at, mo.id as outcome_id,
      sum(case when o.outcome_id = mo.id then o.amount else 0 end) over w as pool,
      sum(o.amount) over w as total
    from ordered o
    join public.market_outcomes mo on mo.market_id = o.market_id
    window w as (partition by o.market_id, mo.id order by o.n)
  ),
  chosen as (
    select r.market_id, r.n, r.created_at,
      jsonb_object_agg(r.outcome_id, r.pool::double precision / r.total::double precision) as shares
    from running r
    join picked p on p.market_id = r.market_id and p.n = r.n
    group by r.market_id, r.n, r.created_at
  )
  select c.market_id, jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by c.n)
  from chosen c
  group by c.market_id
  order by c.market_id
$$;

revoke execute on function public.market_sparklines(uuid[], integer) from public, anon;
grant execute on function public.market_sparklines(uuid[], integer) to authenticated, service_role;

commit;
```

Run: `grep -n '^commit;$' supabase/migrations/0035_activity_events.sql && tail -n 1 supabase/migrations/0035_activity_events.sql`
Expected: exactly one `commit;` line, and it's the last line of the file.

- [ ] **Step 3: Apply it and see the tests pass**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0035_activity_events.sql` without error.

Run: `npx vitest run tests/db/market-sparklines.test.ts tests/db/activity-events.test.ts`
Expected: PASS: the 7 new cases, and Task 1's 8 unchanged.

- [ ] **Step 4: Verify**

Local Supabase must be running, with 0035 applied (Step 3).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1082 tests in 162 files, 45 of them in `tests/db/`. This task adds 7 tests in 1 file. Nothing calls the function yet.
- **Build:** the same 20 routes as before.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, the same as before.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0035_activity_events.sql tests/db/market-sparklines.test.ts
git commit -m "Add market_sparklines, a small chart series per market card"
```

---

## Task 4: The markets list uses sparklines

Task 3 lands `public.market_sparklines(p_market_ids uuid[], p_points integer default 40)`, which returns one row per market with its chart series already computed in the database, instead of the whole bet history. This task wires the markets list up to it: a new `lib/markets/sparklines.ts` calls the RPC in chunks and maps each row's points straight to `SeriesPoint[]`, `app/(app)/markets/(list)/page.tsx` uses it in place of `readCharts`, and `listChartBets`/`readCharts` are deleted along with their tests, since nothing else calls them. `getChartBets`, which still serves the market detail page's full, exact chart (a non-goal to change), stays exactly as it is.

**Files:**
- Create: `lib/markets/sparklines.ts`
- Modify: `lib/markets/chart-bets.ts` (remove `listChartBets` and `readCharts`; `getChartBets` unchanged)
- Modify: `app/(app)/markets/(list)/page.tsx`
- Test, create: `tests/lib/markets/sparklines.test.ts`
- Test, modify: `tests/lib/markets/chart-bets.test.ts`, `tests/db/chart-bets.test.ts` (remove `listChartBets`/`readCharts` coverage; `getChartBets` coverage unchanged)

**Interfaces:**
- Consumes:
  - `public.market_sparklines(p_market_ids uuid[], p_points integer default 40) returns table (market_id uuid, points jsonb)` (Task 3). `security invoker`, granted to `authenticated`/`service_role`, not `anon`. `p_points` capped at 200 inside the function, `p_market_ids` at 50. Through supabase-js each row is `{ market_id: string; points: { t: string; shares: Record<string, number> }[] }`: one row per market that has bets, at most 50 per call, its `points` already in bet order. A market with no bets has no row.
  - `SeriesPoint = { t: number; shares: Record<string, number> }` (`lib/markets/probability-series.ts`, unchanged).
  - `IN_CHUNK`, `chunk` (`lib/pagination/chunk.ts`, unchanged).
  - `MarketCardChart` (`components/markets/market-card.tsx`, unchanged): `{ outcomes: ChartOutcome[]; points: SeriesPoint[]; now: number }`.
- Produces:
  ```ts
  // lib/markets/sparklines.ts
  export async function listSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>>
  export async function readSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>>
  ```
  Every id passed in appears as a key in the returned map (an empty array if the market has no bets); an id not passed in never appears. `readSparklines` never throws — on any error it `console.error`s `'Market sparklines failed to load'` with the error, and resolves to an empty `Map`, as `readCharts` did.
  - `lib/markets/chart-bets.ts` keeps only `getChartBets(supabase, marketId): Promise<ChartBet[]>`. `listChartBets` and `readCharts` no longer exist.

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/markets/sparklines.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listSparklines, readSparklines } from '@/lib/markets/sparklines'

type RpcResponse = { data?: unknown; error?: unknown }

// A minimal stand-in for the one RPC call this module makes: fake-supabase.ts only stubs
// .from(), and market_sparklines is reached through .rpc(), not a table read.
function fakeRpc(respond: (params: { p_market_ids: string[] }, call: number) => RpcResponse) {
  const calls: { p_market_ids: string[] }[] = []
  const rpc = vi.fn(async (_fn: string, params: { p_market_ids: string[] }) => {
    calls.push(params)
    return { data: null, error: null, ...respond(params, calls.length - 1) }
  })
  return { client: { rpc } as unknown as SupabaseClient, calls }
}

function marketRow(marketId: string, points: { t: string; shares: Record<string, number> }[]) {
  return { market_id: marketId, points }
}

const ONE_POINT = [{ t: '2026-09-26T10:00:00Z', shares: { yes: 1 } }]

describe('listSparklines', () => {
  it('reads the listed markets in chunks of at most 50 ids, one row per market', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, calls } = fakeRpc((params) => ({
      data: params.p_market_ids.map((id) => marketRow(id, ONE_POINT)),
    }))

    const byMarket = await listSparklines(client, ids)

    expect(calls.map((c) => c.p_market_ids.length)).toEqual([50, 50, 20])
    expect(calls.flatMap((c) => c.p_market_ids)).toEqual(ids)
    expect([...byMarket.keys()]).toEqual(ids)
    expect(byMarket.get('m119')).toEqual([{ t: Date.parse('2026-09-26T10:00:00Z'), shares: { yes: 1 } }])
  })

  it('gives a market with no row an empty list, and never a market that wasn’t asked for', async () => {
    const { client } = fakeRpc(() => ({
      data: [marketRow('busy', ONE_POINT), marketRow('unasked', ONE_POINT)],
    }))

    const byMarket = await listSparklines(client, ['busy', 'quiet'])

    expect([...byMarket.keys()]).toEqual(['busy', 'quiet'])
    expect(byMarket.get('quiet')).toEqual([])
    expect(byMarket.has('unasked')).toBe(false)
  })

  it('maps each point’s time to milliseconds and keeps its shares, in the order the function returns them', async () => {
    const { client } = fakeRpc(() => ({
      data: [
        marketRow('m1', [
          { t: '2026-09-26T10:00:00.123456+00:00', shares: { yes: 0.4, no: 0.6 } },
          { t: '2026-09-26T10:00:00.123456+00:00', shares: { yes: 0.5, no: 0.5 } },
          { t: '2026-09-26T10:01:00+00:00', shares: { yes: 0.6, no: 0.4 } },
        ]),
      ],
    }))

    const byMarket = await listSparklines(client, ['m1'])

    const tied = Date.parse('2026-09-26T10:00:00.123Z')
    expect(byMarket.get('m1')).toEqual([
      { t: tied, shares: { yes: 0.4, no: 0.6 } },
      { t: tied, shares: { yes: 0.5, no: 0.5 } },
      { t: Date.parse('2026-09-26T10:01:00Z'), shares: { yes: 0.6, no: 0.4 } },
    ])
  })

  it('makes no request for no markets', async () => {
    const { client, calls } = fakeRpc(() => ({ data: [] }))
    expect(await listSparklines(client, [])).toEqual(new Map())
    expect(calls).toHaveLength(0)
  })

  it('throws when a chunk’s RPC call fails', async () => {
    const { client } = fakeRpc(() => ({ error: new Error('rpc failed') }))
    await expect(listSparklines(client, ['m1'])).rejects.toThrow('rpc failed')
  })
})

describe('readSparklines', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs and resolves to an empty map when the sparkline read fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc(() => ({ error: new Error('rpc failed') }))

    const byMarket = await readSparklines(client, ['m1'])

    expect(byMarket).toEqual(new Map())
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('Market sparklines failed to load')
  })

  it('returns each market’s points when the read succeeds', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeRpc((params) => ({ data: params.p_market_ids.map((id) => marketRow(id, ONE_POINT)) }))

    const byMarket = await readSparklines(client, ['m1'])

    expect(byMarket).toEqual(new Map([['m1', [{ t: Date.parse('2026-09-26T10:00:00Z'), shares: { yes: 1 } }]]]))
    expect(spy).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run tests/lib/markets/sparklines.test.ts`
Expected: FAIL. The file can't load, because `@/lib/markets/sparklines` doesn't exist yet.

- [ ] **Step 2: Add `lib/markets/sparklines.ts`**

Create `lib/markets/sparklines.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeriesPoint } from '@/lib/markets/probability-series'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

type SparklineRow = { market_id: string; points: { t: string; shares: Record<string, number> }[] }

async function rpcSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<SparklineRow[]> {
  const { data, error } = await supabase.rpc('market_sparklines', { p_market_ids: marketIds })
  if (error) throw error
  return (data ?? []) as SparklineRow[]
}

// Market ids go in chunks of IN_CHUNK, the cap market_sparklines itself puts on p_market_ids, so
// each call is at most 50 rows, one per market, however many cards the page shows.
export async function listSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>> {
  const byMarket = new Map<string, SeriesPoint[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])

  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => rpcSparklines(supabase, part)))
  for (const row of chunks.flat()) {
    if (!byMarket.has(row.market_id)) continue
    byMarket.set(
      row.market_id,
      row.points.map((point) => ({ t: Date.parse(point.t), shares: point.shares })),
    )
  }
  return byMarket
}

// Sparklines are decoration on /markets: if their read fails, the cards still render without them.
export async function readSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>> {
  try {
    return await listSparklines(supabase, marketIds)
  } catch (error) {
    console.error('Market sparklines failed to load', error)
    return new Map()
  }
}
```

Run: `npx vitest run tests/lib/markets/sparklines.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 3: Remove the unused chart-bets exports, and their tests**

There's no meaningful "failing test" for deleting dead code, so this step goes straight from confirming the exports really are unused to removing them.

First confirm nothing outside `lib/markets/chart-bets.ts` and its own two test files still imports `listChartBets` or `readCharts` — the list page isn't switched over until Step 4, so at this point they're still called from `app/(app)/markets/(list)/page.tsx`:

```bash
grep -rn "listChartBets\|readCharts" --include='*.ts' --include='*.tsx' app components lib tests
```

Expected: matches only in `lib/markets/chart-bets.ts` (the definitions), `app/(app)/markets/(list)/page.tsx` (the one call site, removed in Step 4), and the two test files below.

In `tests/lib/markets/chart-bets.test.ts`, replace the whole file with:

```ts
import { describe, it, expect } from 'vitest'
import { getChartBets } from '@/lib/markets/chart-bets'
import { newerThanFilter } from '@/lib/pagination/keyset'
import { fakeSupabase } from '../fake-supabase'

function betRow(n: number, marketId = 'm1') {
  return {
    id: n,
    market_id: marketId,
    outcome_id: `o-${marketId}`,
    amount: n,
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
  }
}

describe('getChartBets', () => {
  it('reads oldest first in pages of 500, each starting after the last row of the one before', async () => {
    const pages = [
      Array.from({ length: 500 }, (_, i) => betRow(i + 1)),
      Array.from({ length: 500 }, (_, i) => betRow(i + 501)),
      [betRow(1001)],
    ]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: pages[index] }))

    const bets = await getChartBets(client, 'm1')

    expect(bets).toHaveLength(1001)
    expect(bets.at(-1)).toEqual({ outcomeId: 'o-m1', amount: 1001, createdAt: betRow(1001).created_at })
    expect(queries).toHaveLength(3)
    for (const q of queries) {
      expect(q.in).toEqual([['market_id', ['m1']]])
      expect(q.order).toEqual([
        ['created_at', { ascending: true }],
        ['id', { ascending: true }],
      ])
      expect(q.limit).toBe(500)
    }
    expect(queries[0].or).toEqual([])
    expect(queries[1].or).toEqual([newerThanFilter({ ts: 'created_at', id: 'id' }, { ts: betRow(500).created_at, id: '500' })])
    expect(queries[2].or).toEqual([newerThanFilter({ ts: 'created_at', id: 'id' }, { ts: betRow(1000).created_at, id: '1000' })])
  })

  it('stops after one request for a market with fewer than 500 bets', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [betRow(1), betRow(2)] }))
    expect(await getChartBets(client, 'm1')).toHaveLength(2)
    expect(queries).toHaveLength(1)
  })

  it('throws when a read fails', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('read failed') }))
    await expect(getChartBets(client, 'm1')).rejects.toThrow('read failed')
  })
})
```

This drops the `listChartBets` and `readCharts` `describe` blocks entirely and keeps `getChartBets`'s three cases byte-for-byte.

In `tests/db/chart-bets.test.ts`, replace the whole file with:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getChartBets } from '@/lib/markets/chart-bets'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function placeBet(client: SupabaseClient, marketId: string, outcomeId: string, amount: number) {
  const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
  if (error) throw error
}

describe('getChartBets', () => {
  it("reads every member's bets on the market, oldest first, and nothing from other markets", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(bobClient, other.marketId, other.outcomeIds[0], 5)

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => [b.outcomeId, b.amount])).toEqual([
      [market.outcomeIds[0], 10],
      [market.outcomeIds[1], 20],
    ])
    expect(Date.parse(bets[0].createdAt)).toBeLessThanOrEqual(Date.parse(bets[1].createdAt))
  })

  it('orders bets placed at the same instant by id', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)
    await placeBet(bobClient, market.marketId, market.outcomeIds[1], 20)
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 30)
    // Put the last bet first in time, then tie the other two, so only the id can order them.
    const db = serviceClient()
    const { data: rows, error } = await db.from('bets').select('id').eq('market_id', market.marketId).order('id')
    if (error) throw error
    const at = '2026-09-20T09:00:00+00:00'
    for (const [id, createdAt] of [
      [rows[0].id, at],
      [rows[1].id, at],
      [rows[2].id, '2026-09-19T09:00:00+00:00'],
    ] as const) {
      const { error: updateErr } = await db.from('bets').update({ created_at: createdAt }).eq('id', id)
      if (updateErr) throw updateErr
    }

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => b.amount)).toEqual([30, 10, 20])
  })

  it('reads past the 1000-row response cap', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: 1001 place_bet calls would take minutes, and the reader never looks at pools.
    const rows = Array.from({ length: 1001 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 2],
      profile_id: alice.id,
      amount: i + 1,
      created_at: new Date(start + i * 60_000).toISOString(),
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets).toHaveLength(1001)
    expect(bets.at(-1)?.amount).toBe(1001)
  })

  it('reads across a page boundary that falls inside a timestamp tie, in id order', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    // 520 bets at one instant: only the id orders them, and the 500-row page boundary falls inside the tie.
    const rows = Array.from({ length: 520 }, (_, i) => ({
      market_id: market.marketId,
      outcome_id: market.outcomeIds[i % 2],
      profile_id: alice.id,
      amount: i + 1,
      created_at: '2026-09-20T09:00:00.654321+00:00',
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const bets = await getChartBets(bobClient, market.marketId)
    expect(bets.map((b) => b.amount)).toEqual(Array.from({ length: 520 }, (_, i) => i + 1))
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market.marketId, market.outcomeIds[0], 10)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getChartBets(carolClient, market.marketId)).toEqual([])
  })
})
```

This drops the `listChartBets` `describe` block and keeps `getChartBets`'s five cases byte-for-byte.

Run: `npx vitest run tests/lib/markets/chart-bets.test.ts` (local Supabase not needed for this one)
Expected: PASS, 3 tests. The file now describes only `getChartBets`, which isn’t touched yet, so this is a checkpoint that the rewrite lost no coverage, not a red step. (`tests/db/chart-bets.test.ts` is run in Step 5.)

- [ ] **Step 4: Remove `listChartBets` and `readCharts`, and wire up the list page**

Confirm the two now-unused functions have no other caller left:

```bash
grep -rn "listChartBets\|readCharts" --include='*.ts' --include='*.tsx' app components lib tests
```

Expected: only `lib/markets/chart-bets.ts` itself (the definitions) and `app/(app)/markets/(list)/page.tsx` (the one call site, removed below) — the two test files were already rewritten in Step 3.

Replace `lib/markets/chart-bets.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartBet } from '@/lib/markets/probability-series'
import { WINDOW_CAP, type Cursor } from '@/lib/pagination/cursor'
import { newerThanFilter, type KeyColumns } from '@/lib/pagination/keyset'

// A chart needs every bet, oldest first. It reads them in keyset pages of 500, under PostgREST's
// silent 1,000-row cap (max_rows, supabase/config.toml), each page starting after the last row of
// the one before, so a bet placed mid-read can't shift a page the way an offset would.
const CHART_PAGE = WINDOW_CAP
const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id' }

type BetRow = { id: number; market_id: string; outcome_id: string; amount: number; created_at: string }

async function readBets(supabase: SupabaseClient, marketIds: string[]): Promise<BetRow[]> {
  const rows: BetRow[] = []
  let after: Cursor | null = null
  for (;;) {
    let query = supabase.from('bets').select('id, market_id, outcome_id, amount, created_at').in('market_id', marketIds)
    if (after) query = query.or(newerThanFilter(BET_KEYS, after))
    const { data, error } = await query
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(CHART_PAGE)
    if (error) throw error
    const page = (data ?? []) as BetRow[]
    rows.push(...page)
    if (page.length < CHART_PAGE) return rows
    const last = page[page.length - 1]
    after = { ts: last.created_at, id: String(last.id) }
  }
}

function toChartBet(row: BetRow): ChartBet {
  return { outcomeId: row.outcome_id, amount: row.amount, createdAt: row.created_at }
}

export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]> {
  return (await readBets(supabase, [marketId])).map(toChartBet)
}
```

In `app/(app)/markets/(list)/page.tsx`, replace:

```ts
import { readCharts } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
```

with:

```ts
import { readSparklines } from '@/lib/markets/sparklines'
```

In the same file, replace:

```ts
  const chartBetsByMarket = await readCharts(
    supabase,
    markets.map((m) => m.id),
  )
```

with:

```ts
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map((m) => m.id),
  )
```

In the same file, inside the `cards = markets.map((market) => { ... })` block, replace:

```ts
    const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
    const chartBets = chartBetsByMarket.get(market.id) ?? []
    const chart: MarketCardChart | undefined =
      chartBets.length > 0
        ? {
            outcomes: odds.map((o, index) => ({
              id: o.outcomeId,
              label: o.label,
              series: outcomeSeries(market.kind, o.label, index),
            })),
            points: buildProbabilitySeries(
              odds.map((o) => o.outcomeId),
              chartBets,
            ),
            now: nowMs,
          }
        : undefined
```

with:

```ts
    const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))
    const points = sparklinesByMarket.get(market.id) ?? []
    const chart: MarketCardChart | undefined =
      points.length > 0
        ? {
            outcomes: odds.map((o, index) => ({
              id: o.outcomeId,
              label: o.label,
              series: outcomeSeries(market.kind, o.label, index),
            })),
            points,
            now: nowMs,
          }
        : undefined
```

Run: `npx next typegen && npx tsc --noEmit`
Expected: PASS.

Run: `npx vitest run tests/lib/markets/sparklines.test.ts tests/lib/markets/chart-bets.test.ts`
Expected: PASS, 10 tests (7 + 3).

Run: `npm run build`
Expected: PASS, the same route table as before this task (no route added or removed).

- [ ] **Step 5: Verify**

Local Supabase must be running, with `0035` applied (Tasks 1 and 3).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1081 tests in 163 files, 45 of them in `tests/db/`. This task adds one file (`tests/lib/markets/sparklines.test.ts`, 7 tests) and removes 8 tests from the two chart-bets files: `tests/lib/markets/chart-bets.test.ts` drops its `listChartBets` (2) and `readCharts` (2) cases, keeping `getChartBets`’s 3, and `tests/db/chart-bets.test.ts` drops its `listChartBets` block (4), keeping `getChartBets`’s 5. Net: −1.
- **Build:** the same 20 routes as before.

Run: `npx vitest run tests/db/chart-bets.test.ts`
Expected: PASS, 5 tests (`getChartBets` only).

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged. No e2e spec asserts on `readCharts`/`listChartBets` by name; `/markets`' chart cards are asserted by their rendered shape, which is unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/markets/sparklines.ts lib/markets/chart-bets.ts "app/(app)/markets/(list)/page.tsx" \
  tests/lib/markets/sparklines.test.ts tests/lib/markets/chart-bets.test.ts tests/db/chart-bets.test.ts
git commit -m "Draw market-list sparklines from market_sparklines instead of every bet"
```

---

## Task 5: Verification

This task changes no product code. It runs the whole chain on the finished branch, re-runs it on the Supabase CLI version CI pins (covering `0035` specifically), measures the scale seed's `EXPLAIN ANALYZE` timings before and after `0035` for the three reads the spec names, takes a controller visual pass confirming `/feed`, a member's activity and `/markets` look identical to before this PR and that a live update actually reaches a second session, and hands the user the Rollout checklist from the spec.

**Files:**
- Temporary, not committed: `e2e/zz-visual-activity-sparklines.spec.ts` (Step 5, the controller's screenshot and live-update spec, deleted after use)
- Temporary, outside the repo: `$SCRATCH/explain-activity-sparklines.mjs` (Step 4)

**Interfaces:**
- Consumes every task in this PR: the events table, its triggers, RLS and backfill (Task 1), the feed reader (Task 2), `market_sparklines` (Task 3), the markets list (Task 4).
- Produces nothing new. This is the last task.

- [ ] **Step 1: Run the whole chain**

Local Supabase must be running, with every migration through `0035` applied.

Run: `npm run db:reset && npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1081 tests in 163 files, 45 of them in `tests/db/`, the same as after Task 4. Record the printed total in the PR description.
- **Build:** the same 20 routes as `da8555a`, `/_not-found` included. This PR adds and removes no route.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed — unchanged from before this PR. No task in this plan adds or removes an e2e spec.

- [ ] **Step 2: Re-run the chain on the CLI version CI pins**

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
lsof -ti:3000 | xargs kill 2>/dev/null
npx playwright test
```

Expected: every step passes on this exact CLI version, with 27 e2e tests. Watch `0035` in particular: `db reset` must apply the table, RLS, indexes, triggers, backfill, `market_sparklines` and the publication addition cleanly on 2.115.0, and every new function's grants must land explicitly. 2.115.0 is the version that grants nothing implicitly (the 0007 lesson) — `0035` adds several new `security definer` trigger functions and one new `security invoker` function, none of which is a `create or replace` of something with grants already in place.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: no output. Every task committed its own files, and this task has nothing to commit.

- [ ] **Step 4: `EXPLAIN ANALYZE` before and after `0035`, with the scale seed**

This step writes tens of thousands of rows to local Supabase. Run it from the repo root with the project's own CLI (`npx supabase`), and run no DB test until the reset at the end: `seedMembers()` can't clear 500 extra auth users.

1. Make a scratch directory outside the repo: `SCRATCH=$(mktemp -d)`.

2. Reset to just before `0035`, then load the scale seed:

   ```bash
   npx supabase db reset --version 0034
   node scripts/seed-scale.mjs
   ```

   Expected: the seed prints 500 members, 70 open, 120 resolved and 10 voided markets, 20,000 bets, 130 resolutions, 400 parlays, about 3,000 task completions and about 31,000 ledger rows.

3. Write `$SCRATCH/explain-activity-sparklines.mjs`. Like the data-layer-scale plan's Task 12 script, it talks to postgres-meta directly (`tests/db/pg-query.ts` is TypeScript, and the repo has no `.ts` runner outside the test tooling), and reads its env through `node --env-file`, because a script outside the repo can't resolve `dotenv`. Before `0035`, "the feed" and "member activity" mean `activity_feed`; after, `activity_events` joined the way `listFeed` joins it (Task 2). Before, "the markets sparkline load" means the old `listChartBets` shape (every bet for the listed markets); after, `market_sparklines`, one call for the same 50 markets:

   ```js
   // Throwaway, not committed. Run from the repo root: node --env-file=.env.local "$SCRATCH/explain-activity-sparklines.mjs"
   // It reads through postgres-meta as the table owner, then repeats the same reads as a signed-in
   // admin, through the access rules PostgREST would apply.
   const url = process.env.NEXT_PUBLIC_SUPABASE_URL
   const key = process.env.SUPABASE_SERVICE_ROLE_KEY
   if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url ?? '')) throw new Error('refusing a non-local URL')

   async function pgQuery(sql) {
     const res = await fetch(`${url}/pg/query`, {
       method: 'POST',
       headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
       body: JSON.stringify({ query: sql }),
     })
     const body = await res.json()
     if (!res.ok) throw new Error(`postgres-meta ${res.status}: ${body.message ?? JSON.stringify(body)}`)
     return body
   }

   const afterMigration = process.argv.includes('--after')

   // Fresh statistics, so the plans before and after 0035 are compared on the same footing.
   await pgQuery(
     'analyze public.profiles, public.markets, public.market_outcomes, public.bets, public.market_resolutions, ' +
       'public.coin_transactions, public.parlays, public.parlay_legs, public.tasks, public.task_completions' +
       (afterMigration ? ', public.activity_events' : ''),
   )

   const [{ id: actorId }] = await pgQuery('select profile_id as id from bets group by profile_id order by count(*) desc limit 1')
   // One RPC chunk's worth: the 50 markets with the most bets, the worst case for one call.
   const busiest = await pgQuery('select market_id as id from bets group by market_id order by count(*) desc limit 50')
   const marketIds = busiest.map((r) => r.id)
   const idList = marketIds.map((id) => `'${id}'`).join(', ')

   const feedBefore = 'select * from public.activity_feed order by occurred_at desc, id desc limit 50'
   // Approximates listFeed's PostgREST embeds (lib/social/list-feed.ts, Task 2) as plain left
   // joins, close enough for a plan/timing comparison though PostgREST itself issues correlated
   // subqueries under the hood.
   const feedAfter = `
     select e.id, e.kind, e.occurred_at, e.actor_id, e.market_id, e.amount, p.display_name, m.title, o.label,
       (select t.title from public.task_completions tc join public.tasks t on t.id = tc.task_id where tc.id = e.task_completion_id) as task_title,
       (select count(*) from public.parlay_legs l where l.parlay_id = e.parlay_id) as leg_count
     from public.activity_events e
     left join public.profiles p on p.id = e.actor_id
     left join public.markets m on m.id = e.market_id
     left join public.market_outcomes o on o.id = e.outcome_id
     where e.hidden_at is null
     order by e.occurred_at desc, e.id desc
     limit 50`

   const queries = afterMigration
     ? {
         feed: feedAfter,
         member_activity: feedAfter.replace('where e.hidden_at is null', `where e.hidden_at is null and e.actor_id = '${actorId}'`),
         markets_sparklines: `select * from public.market_sparklines(array[${idList}]::uuid[], 40)`,
       }
     : {
         feed: feedBefore,
         member_activity: `select * from public.activity_feed where actor_id = '${actorId}' order by occurred_at desc, id desc limit 50`,
         // Every bet on those markets: listChartBets read all of them, in pages of 500.
         markets_sparklines: `select id, market_id, outcome_id, amount, created_at from public.bets where market_id in (${idList}) order by created_at, id`,
       }

   function walk(node, out = []) {
     out.push(node)
     for (const child of node.Plans ?? []) walk(child, out)
     return out
   }

   // The same reads as a signed-in admin, through the access rules, as PostgREST runs them.
   const [{ id: adminId, email: adminEmail }] = await pgQuery('select id, email from profiles where is_admin order by email limit 1')
   const asAdmin = `set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: adminId, email: adminEmail, role: 'authenticated' })}', true);`
   for (const name of Object.keys(queries)) queries[`${name} (rls)`] = { sql: queries[name], prefix: asAdmin }

   for (const [name, entry] of Object.entries(queries)) {
     const { sql, prefix } = typeof entry === 'string' ? { sql: entry, prefix: '' } : entry
     const [row] = await pgQuery(`${prefix} explain (analyze, buffers, format json) ${sql}`)
     const plan = row['QUERY PLAN'][0]
     const nodes = walk(plan.Plan)
     const seq = nodes.filter((n) => n['Node Type'] === 'Seq Scan').map((n) => n['Relation Name'])
     const idx = [...new Set(nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : [])))]
     console.log(
       `${name.padEnd(24)} execution ${plan['Execution Time'].toFixed(2).padStart(8)} ms  planning ${plan['Planning Time'].toFixed(2).padStart(6)} ms  rows ${String(plan.Plan['Actual Rows']).padStart(6)}  seq scans: ${seq.join(', ') || 'none'}`,
     )
     console.log(`${''.padEnd(24)} indexes: ${idx.join(', ') || 'none'}`)
   }
   ```

   Run: `node --env-file=.env.local "$SCRATCH/explain-activity-sparklines.mjs" | tee "$SCRATCH/explain-before.txt"`

4. Apply `0035` on top of the seeded data, without dropping it: `npx supabase migration up`. Unlike `db reset`, `migration up` applies only pending migrations, so the seed's rows survive and the backfill runs over real scale-sized data. Expected: `Applying migration 0035_activity_events.sql...`, with no error. This also proves `0035`'s backfill and `share row exclusive` locks apply over existing data within the CLI's statement timeout.

5. Measure again: `node --env-file=.env.local "$SCRATCH/explain-activity-sparklines.mjs" --after | tee "$SCRATCH/explain-after.txt"`

6. Compare the two files, and record both in the PR description. Expect the same shape as the spec's own numbers (about 16 ms for the feed at 20,000 bets before this PR, rising with history) and the data-layer-scale plan's precedent for this methodology:
   - The feed down by more than an order of magnitude, on `activity_events_feed_idx`, with no seq scan on `activity_events`. Member activity reads `activity_events_actor_idx`; for the busiest bettor it was already fast before (their bets are one index range), so expect it about level, not faster by much. The hand-written joins may hash the small lookup tables (`tasks`, `markets`, `market_outcomes`) instead of probing their keys; PostgREST's own embeds probe per row.
   - The markets sparkline read: before, every bet of the 50 busiest markets, thousands of rows, shipped to Node in pages of 500 and run through `buildProbabilitySeries`; after, 50 rows, one per market, each capped at 40 points however many bets it has. The database still walks every bet of those markets, and now does the running sums itself, so its own time goes **up**. That is the trade: what the page receives no longer grows with bet history.
   - **Measured when this plan was checked** (Apple M5, local Supabase on CLI 2.117.0; execution times):

     | Read | Before 0035 | After 0035 |
     |---|---|---|
     | Feed, first page | 15.80 ms | 0.44 ms |
     | Member activity, busiest bettor | 0.61 ms | 0.48 ms |
     | 50 busiest markets' sparklines | 1.81 ms, 5,663 rows | 19.87 ms, 50 rows |

     Through the access rules, as an admin, the same reads took 16.11 → 0.76, 1.47 → 0.80 and 2.00 → 19.53 ms. `migration up` applied 0035 over the seed in about 1.3 s.
   - Every `(rls)` line returns the same number of rows as the line above it, so the admin really can see the data it timed.
   - Absolute times vary by machine — record both files' numbers, not just the ratio.

7. Restore the normal dev database, before any other DB test: `npm run db:reset`

- [ ] **Step 5 (the controller, not the implementer): visual check at 375px and 1280px, light and dark, plus a live-update check**

The executing controller does this step, not a subagent. As in earlier plans, it takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed. Unlike a feature PR's visual check, this one is a *regression* check: the spec's goal is that this PR "changes nothing a member sees," so the screenshots should look identical to a pre-PR capture, and the one new behavior to confirm live is the live update reaching a second signed-in session through `activity_events`.

1. Make a scratch directory outside the repo for the PNGs: `SCRATCH=$(mktemp -d)`.

2. Create `e2e/zz-visual-activity-sparklines.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from '@playwright/test'
import { STORAGE_STATE_PATH } from './global-setup'
import { serviceClient } from '../tests/db/helpers'
import { makeMember, clientFor, clientForEmail, createTestMarket, sessionCookieHeader } from '../tests/db/fixtures'

// Temporary: the controller's activity-events/sparklines visual and live-update check. Delete
// this file after viewing the screenshots.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual-activity-sparklines'

type Scheme = 'light' | 'dark'

let adminId: string

// Global setup leaves one admin and nothing else, so an empty /markets would prove nothing about
// sparklines. Two markets with a few bets give every page rows and give the cards charts.
test.beforeAll(async () => {
  const { data: admin, error } = await serviceClient().from('profiles').select('id, email').eq('is_admin', true).limit(1).single()
  if (error) throw error
  adminId = admin.id
  const client = await clientForEmail(admin.email)
  const rain = await createTestMarket(client, ['Yes', 'No'], { title: 'Visual check: rain on Sunday?' })
  const pick = await createTestMarket(client, ['Tom', 'Sarah', 'Mia'], { title: 'Visual check: who reads first?' })
  for (const [market, outcome, amount] of [
    [rain, 0, 5],
    [rain, 1, 10],
    [rain, 0, 5],
    [pick, 2, 4],
    [pick, 0, 6],
  ] as const) {
    const { error: betErr } = await client.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[outcome],
      p_amount: amount,
    })
    if (betErr) throw betErr
  }
})

async function openContext(browser: Browser, { width, scheme }: { width: number; scheme: Scheme }) {
  return browser.newContext({
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
    viewport: { width, height: width === 375 ? 812 : 800 },
    colorScheme: scheme,
  })
}

// A route's loading skeleton cross-fades out after the content arrives, so each capture waits for
// every skeleton to leave and stops the fade.
async function capture(page: Page, path: string) {
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`

    test(`/feed, a member's activity and /markets render at ${width}px, ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()

      await page.goto('/feed')
      await expect(page.getByRole('heading', { name: 'Feed' })).toBeVisible()
      await expect(page.getByText('bet 10 DC on No in')).toBeVisible()
      await capture(page, shot('feed'))

      await page.goto(`/members/${adminId}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByText('bet 6 DC on Tom in')).toBeVisible()
      await capture(page, shot('member-activity'))

      await page.goto('/markets')
      await expect(page.getByRole('heading', { name: 'Markets' })).toBeVisible()
      await expect(page.getByRole('img', { name: /^Chance over time\./ })).toHaveCount(2)
      await capture(page, shot('markets'))

      await context.close()
    })
  }
}

// One live-update check, not repeated per viewport/theme: two real signed-in sessions, one places
// a bet, the other's /feed picks it up without a manual reload. DEBOUNCE_MS/MAX_WAIT_MS
// (components/live/live-refresh.tsx) mean the update lands within a few seconds of the write.
// Global setup already seeded one admin, invited member ("alice"); this test adds one more
// invited member as the watcher, and creates its own market so it never depends on another
// spec's data (this file runs on its own, per Step 3 above).
test('a bet placed in one session appears on another session’s /feed without reloading', async ({ browser }) => {
  const { data: admin } = await serviceClient().from('profiles').select('id, email').eq('is_admin', true).limit(1).single()
  const aliceClient = await clientForEmail(admin!.email)

  // makeMember builds the email from the name, so the name has no spaces.
  const watcher = await makeMember('Watcher')
  await serviceClient().from('allowed_emails').insert({ email: watcher.email })
  const watcherClient = await clientFor(watcher)

  const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Live-update check market' })

  const watcherCookies = (await sessionCookieHeader(watcherClient)).split('; ').map((pair) => {
    const [name, ...rest] = pair.split('=')
    return { name, value: rest.join('='), domain: 'localhost', path: '/' }
  })
  const watcherContext = await browser.newContext({ baseURL: 'http://localhost:3000' })
  await watcherContext.addCookies(watcherCookies)
  const watcherPage = await watcherContext.newPage()
  await watcherPage.goto('/feed')
  await expect(watcherPage.getByRole('heading', { name: 'Feed' })).toBeVisible()

  const { error } = await aliceClient.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[0],
    p_amount: 3,
  })
  expect(error).toBeNull()

  await expect(watcherPage.getByText('bet 3 DC').first()).toBeVisible({ timeout: 5000 })

  await watcherContext.close()
})
```

3. Run it on its own. Its global setup reseeds the database, as every e2e run does.

```bash
lsof -ti:3000 | xargs kill 2>/dev/null
VISUAL_OUT="$SCRATCH/visual" npx playwright test e2e/zz-visual-activity-sparklines.spec.ts
```

Expected: 5 passed (4 render checks at each width/scheme combination, plus the one live-update check), and 12 PNGs in `$SCRATCH/visual`: `feed`, `member-activity`, `markets` at each of the 4 width/scheme combinations. Each `markets` shot shows the two `Visual check:` cards, each with its chart.

4. View every PNG and check:
   - `feed`, `member-activity`, `markets` at both widths and themes: unchanged from before this PR — same layout, same "Show more"/"Back to newest" placement, same market cards with their sparklines drawn in the same place with the same shape as `readCharts` produced. The spec runs unchanged on `da8555a`, so for a side-by-side, run it once in a checkout of `da8555a` with a different `VISUAL_OUT`. Every control stays at least 44px tall, nothing scrolls sideways at 375px.
   - The live-update test passed, meaning the bettor's `bet_placed` row reached the watcher's `/feed` without a manual reload, through `activity_events`'s realtime publication and `pageSubscriptions.feed()`.
5. Delete `e2e/zz-visual-activity-sparklines.spec.ts`, run `npm run db:reset`, and run `git status --short` to confirm the tree is clean.
6. Record every mismatch as a final-review finding.

- [ ] **Step 6 (the user, after deploy): post-deploy checklist**

Hand this to the user with the PR, and include it in the PR description:

> **After deploying, please check:**
> 1. `/feed` loads and shows recent activity, newest first.
> 2. A member's activity page (`/members/[id]`) shows their events, including a task approval or a market resolution that happened while you weren't watching.
> 3. `/markets` shows a sparkline on every card with at least one bet.
> 4. Open `/feed` in two browsers (or a normal window and a private one) signed in as two different members. Place a bet as one; the other's feed picks it up without reloading.

- [ ] **Step 7: Commit**

Nothing to commit: this task changes no product file. If Step 5's spec was left behind, delete it and re-run `git status --short` to confirm a clean tree before closing out the PR.

---
