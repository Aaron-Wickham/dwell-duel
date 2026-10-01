# Post-Beta Cleanup (Sub-project 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close out every code-side item deferred from the sub-project 8 and 9 reviews, in one migration and a handful of paging/accessibility fixes:
- Retire `activity_feed` from app access (it stays only as the tests' equivalence oracle) and index every foreign key column on `activity_events`.
- Enforce the feed's timestamp invariants with two validated CHECKs, guarded by a preflight that proves no existing row violates them.
- Make `market_sparklines` cheaper as bet history grows, with bit-identical output.
- Page the leaderboard and open markets, the last two unpaged lists.
- Fix the remaining accessibility gaps: focus after "Show more", "Nothing older here" past the end of a window, and one loading announcement per page instead of one per section.
- Two small paging leftovers: a keys-only keyset probe, and "Nothing older here" for a window past the end.

**Architecture:**
- **The migration (`supabase/migrations/0036_post_beta_cleanup.sql`, Tasks 1–2):** one explicit `begin … commit`, following 0034 and 0035's shape — `set local lock_timeout = '5s'`, a `lock table … in share row exclusive mode` on the three tables it changes (the view, `bets` and `market_outcomes` are deliberately left out; see Rulings), then a preflight guard before anything is added. Task 1 revokes `select` on `activity_feed` from `authenticated` and `anon`, adds seven foreign key indexes on `activity_events` (the spec's five cascade columns, plus `resolution_id` and `actor_id`), and adds the two timestamp CHECKs (`task_completions_approved_has_reviewed_at`, `parlays_won_has_settled_at`), validated because the guard already proved every existing row passes. Task 2 replaces `market_sparklines` just before the final `commit`, with the same signature and return shape but no bet × outcome cross join: each outcome's running pool comes from that outcome's own bets, and each market's running total from its own bets.
- **Shared "Show more" behaviour (Task 3):** `ShowMore` gains a `focusId`, a new `ShowMoreFocus` client component moves focus to the first newly shown row after navigation without scrolling, and `NothingOlder` renders "Nothing older here" when a windowed read comes back empty. `readKeyset`'s probe for the next cursor reads keys only. Every existing paged list (ledger, bets, closed markets, feed, member activity) is wired to all three.
- **Leaderboard and open-markets paging (Tasks 4–5):** the leaderboard gets its own cursor (`lib/pagination/rank-cursor.ts`) and reader (`getLeaderboardPage`), keeping competition ranking correct across a page boundary; open markets reuse the existing keyset helpers the closed list already uses. Both wire up `ShowMore`, focus and `NothingOlder`.
- **One loading status per page (Task 6):** the market page is the only page with several sections that can be pending at once (its chart, outcomes, bet form and bets each stream behind their own `Suspense`). `SkeletonScreen` gains an `announce` prop (default `true`, so every route-level `loading.tsx` keeps its single status unchanged); the market page's four fallbacks set it to `false` and the page renders one `LoadingStatus` instead, a client component that watches for `[data-skeleton]` elements in the DOM and announces "Loading…" for as long as any section's fallback is still showing, clearing once every section has resolved.
- **Verification (Task 7):** the full chain, the pinned-CLI re-run (`supabase@2.115.0`) including `0036`, `EXPLAIN ANALYZE` of `market_sparklines` before and after `0036` on the scale seed, a controller visual pass of the leaderboard's and markets list's "Show more" (with focus visible) and "Nothing older here", and the market page's loading state, applying `0036` to production before merge, and the post-deploy checklist.

**Tech Stack:**
- Next.js 16.3.5 (App Router), React 19.2.8 and TypeScript
- Tailwind CSS v4
- Supabase: Postgres, Auth, Realtime; `@supabase/supabase-js` 2.116, `@supabase/ssr` 0.12.7
- Vitest 4 with React Testing Library and jsdom
- Playwright

**Spec:** [`docs/superpowers/specs/2026-09-27-post-beta-cleanup-design.md`](../specs/2026-09-27-post-beta-cleanup-design.md). It starts from `main` (`fdbb4cc`, `v0.1.0-beta`) plus the spec itself, at `post-beta-cleanup` `12b316b`.

**Commits** end with the `Co-Authored-By:` trailer the implementer's own session specifies. The commit commands in this plan omit it.

## Global Constraints

- **One migration, `0036`,** in one explicit transaction with `lock_timeout` and a preflight guard. It only adds indexes and CHECKs, revokes `select` on `activity_feed` from `authenticated`/`anon`, and recreates `market_sparklines` with identical output. No other function or policy changes.
- **Non-goals, left to the user:** member invites, switching Supabase to asymmetric JWT signing keys, and the Supabase Auth redirect allow-list for Vercel previews. None of this plan's tasks touch them.
- **Out of scope:** dropping `activity_feed` (it stays as the tests' equivalence oracle), and any change to coin-moving functions beyond the two new CHECKs.
- **The e2e contract:**
  - every existing asserted string, role and count keeps resolving
  - the member and market pages keep their real 404s, and the signed-out 307 is unchanged
  - existing specs may gain waits, never changed assertions
  - **the e2e count stays 27 for every task in this plan, start to finish** — this PR adds no new spec and removes none
- **Bounded reads:** every read is at most 500 rows per request, and no URL grows with row counts.
- **AGENTS.md conventions:** tokens only, phone-first, 44px targets, real elements, errors wired inline with `aria-invalid`/`aria-describedby`, and `hit-area` for a standalone inline link.
- **Code style:** single quotes, no semicolons, and comments only for a non-obvious why. Quote `(app)`, `(list)` and `[id]` paths in shell commands.
- **Deploy order:** apply `0036` to production before merging, by running the Deploy Production Database workflow on the branch, as for `0035`. The new build doesn't strictly depend on `0036`, but the same order keeps it safe — Task 7 runs it.
- **Test infrastructure facts, at `12b316b`:** Vitest runs 1087 tests in 164 files (284 in 46 under `tests/db/`); Playwright runs 27. Each task's Verify step gives the exact counts after that task: 1092 in 165 (Task 1), 1093 in 165 (Task 2), 1118 in 169 (Task 3), 1166 in 173 (Task 4), 1178 in 174 (Task 5) and 1181 in 175 (Task 6).

## Rulings this plan makes

- **The migration's two sections have one fixed boundary.** `0036` is one file. Task 1 writes the transaction, the preflight guard for the two timestamp invariants, the view revoke, the seven foreign key indexes and the two CHECKs. Task 2 inserts `create or replace function public.market_sparklines(…)` immediately before the final `commit`, with a signature and return shape identical to the one it replaces. Neither task's commit may touch the migration file after the other's.
- **Task 3 fixes the shared paging interfaces every later paged-list task builds on**, so Tasks 4 and 5 don't have to invent their own: `components/ui/show-more.tsx`'s `ShowMore` takes an optional `focusId` (the DOM id of the row that becomes first-new); `components/ui/show-more-focus.tsx`'s `<ShowMoreFocus />` is rendered once per page that has a `ShowMore` and moves focus to that id after navigation, with `tabIndex={-1}` and no scroll; `lib/pagination/row-id.ts`'s `rowDomId(prefix, id)` builds the stable id from the row's own id (the key's tiebreak column, unique within a list), not from a `{ ts, id }` key, because the leaderboard's key has no timestamp, and `focusTarget(domId)` spreads `id`, `tabIndex={-1}` and a self-`aria-labelledby` onto the row; `components/ui/nothing-older.tsx`'s `<NothingOlder href={backToNewestHref} />` replaces a paged list's normal empty state when a windowed read returns no rows; `lib/pagination/keyset.ts`'s `readKeyset` takes an optional `fetchKeys` for a keys-only probe, defaulting to the existing `fetchRows` behavior so no caller breaks. `NextPage` gains `firstId`, the id of the first row a "Show more" shows. The prefixes are `ledger`, `bet`, `market-closed`, `feed`, `activity` (Task 3), `member` (Task 4) and `market-open` (Task 5).
- **The leaderboard's cursor and reader are new, dedicated types, not a reuse of the ledger/markets cursor.** `lib/pagination/rank-cursor.ts` encodes `(balance, display_name, id)`; `getLeaderboardPage` ranks a window from two counts about its first row, so a tie straddling a page boundary keeps one rank on both sides and every later row gets its true competition rank: the first row's tie group ranks `1 + count(balance > B)`, and a later row ranks `count(members before the first row in the full order) + its local assignRanks rank`. Adding local ranks onto `1 + count(balance > B)` alone would be wrong when the first tie group started on an earlier page (balances `[10, 10, 10, 5]` with the boundary after the second 10 would rank the 5 second, not fourth). A read that starts at the top runs neither count. `getMemberStanding` and Home are unchanged. Search params are `before` / `before_from`.
- **Open markets reuse the closed list's keyset machinery rather than a new one.** `listOpenMarkets` becomes keyset-paged like `listClosedMarkets`, with search params `open` / `open_from` (the closed list keeps `resolved`). Sparklines are read for whichever open and closed cards are on screen, as today.
- **The market page's four sections stay independently streamed; the fix is in what each fallback announces, not in how many `Suspense` boundaries there are.** Collapsing the chart, outcomes, bet form and bets into one shared `Suspense` would kill the progressive reveal the page is built for, and a plain, unconditionally-rendered status would go stale once every section resolves. `LoadingStatus` (Task 6) is a small client component instead, watching `[data-skeleton]` — the attribute every `SkeletonScreen` fallback already carries — so it works with sections that resolve at different times without any of them needing to report state to a parent. `SkeletonScreen`'s new `announce` prop defaults to `true`, so no other page (every route-level `loading.tsx`, and the member page's single activity skeleton) needs to change.
- **The e2e count is a hard gate, not a target.** Any task whose change would touch an asserted e2e string, role or count is out of scope for this plan; a task's own DB, unit or jsdom tests carry the new coverage instead.
- **Seven foreign key indexes, not five, and one `AGENTS.md` line (Task 1).** The user asked for no leftover work. Beyond the spec's five cascade columns, Task 1 indexes `resolution_id` (it cascades too, and 0035's partial `(market_id) where resolution_id is not null` index can only be walked with it as a Filter) and `actor_id` (a profile delete looks events up with no `hidden_at` predicate, which the partial `activity_events_actor_idx` can't serve: it's a Seq Scan even with `enable_seqscan = off`). Both fit the spec's constraint that 0036 only adds indexes and CHECKs. `AGENTS.md` gains a line that members can't select `activity_feed` since 0036, and tests read it only through the service client or `pgQuery`.
- **The lock list leaves out the view, `bets` and `market_outcomes` (Task 1).** It locks `task_completions`, `parlays` and `activity_events`, the three tables the file changes. Locking a view locks every table it reads; a `revoke` needs no table lock; and replacing `market_sparklines` locks the function, parsing its body under access share at most, which no bet or outcome write conflicts with. Task 1 gives the reasoning in full.
- **Task 2 keeps its extra failing-first test.** It pins the "no bet × outcome cross join" requirement by the widest `WindowAgg`'s row count (300 before, at most 115 after), which the data fixes and the planner can't change, and gives the task a real red step.
- **The test fixtures survive a killed run (Task 4).** Task 4's DB test adds 58 auth users, more than the one page of 50 that `seedMembers` used to delete, so a run killed before its `afterAll` would have broken every later `seedMembers` (`A user with this email address has already been registered`). Task 4 makes `seedMembers` read and delete page after page until none is left, and the test still deletes its own users in `afterAll`.
- **The closed list's paging test is corrected (Task 5).** It claimed a created_at tie across the 50th and 51st rows, but its pairs never straddled that boundary. Task 5 already replaces the file, so it offsets the pairs by one and asserts the tie, as its new open-list test does.
- **Task 6 anchors on Task 3's version of the market page.** Both edit `app/(app)/markets/[id]/page.tsx`. Task 3 changes three imports and `MarketBets`; Task 6's two edits anchor on text Task 3 leaves alone, so they apply cleanly in order.
- **Task 7's visual check reaches every state deterministically, and its numbers are honest.** "Nothing older here" comes from a fresh-window URL past the end, built with `encodeRankCursor` / `encodeCursor` (a captured "Show more" href is an extend, which is never windowed). The open list's "Show more" is found with `.first()`. The market page's fallbacks are held by locking `bets` for a few seconds, because network throttling can't delay a server that answers before its first flush. The sparkline timings promise no big win at the scale seed: about 15.0 → 13.4 ms for the 50 busiest markets there, against about 285 → 134 ms at 2,000 bets per market.
- **The market page announces before hydration (Task 6).** `LoadingStatus` starts pending, so the server-rendered first flush, where the fallbacks are showing, already says "Loading…". A status that started empty would say nothing until the page hydrated. The first check after mount clears it when nothing is pending.
- **`/markets`' two "Show more" links are told apart by description, not name (Task 5).** Each keeps the accessible name "Show more", so every existing selector resolves. `ShowMore`'s optional `description` adds "Open markets" or "Closed markets" through `aria-describedby`, for a screen reader's links list, where the preceding heading (H80) isn't read.

## Execution rulings (as built)

Forced during execution, after the rulings above were written, and reflected in the code rather than in the task bodies below:

- **Task 1's three locks are taken with a NOWAIT retry loop, not one fixed acquisition order.** The ruling above (lock list leaves out the view, `bets`, `market_outcomes`) still holds, but a fixed order for `task_completions`, `parlays` and `activity_events` can deadlock: the app writes `activity_events` from both a resolve/void path and a parlay-settle path, in opposite orders against the other two tables. 0036 takes each lock with `NOWAIT` inside a retry loop instead, so a failed attempt releases whatever it holds and the migration never waits while holding a lock.
- **Seven foreign key indexes, not five**, per the ruling above — carried through unchanged.
- **Task 6's `LoadingStatus` is a scoped `useSyncExternalStore` wrapper, not a `useState` that starts `true`.** A plain state starting `true` flashed "Loading…" on a client navigation into an already-resolved page, and an unscoped check could count an outgoing page's own skeletons during a route transition. The built version answers `true` from `getServerSnapshot` (so the first flush still announces), and re-derives its status afterward from a `MutationObserver` scoped to its own wrapper.
- **`focusTarget` takes an optional `labelId` (Task 3 fix round 1).** Overriding the self-`aria-labelledby` ruling above, `MarketCard` labels itself by its title rather than its whole content — the review judged a title the more useful accessible name for a card-shaped row.
- **`ShowMore` takes an optional `description` (Task 5 Step 3b).** Already reflected in the ruling above; called out here because it was a controller edit made outside a task's own Verify step, unproven until the final review's own test run.
- **The rank cursor rejects a balance outside `int4`'s range (Task 4 fix round 1).** Without the bound, a crafted or drifted balance reaches PostgREST as a literal Postgres can't store, which surfaced as the error page (`22003`) instead of falling back to the first page like any other bad cursor.
- **The markets list tags each card by its source list and drops the open copy of a market that resolved between the two reads (Task 5 fix round 1).** Markets only move open → closed, so dropping the stale open copy is enough to keep every key and DOM id unique.

---

## Task 1: Close the old feed view, index the event cascades, enforce the feed's timestamps

No deployed build reads `activity_feed` any more: the feed and member activity moved to `activity_events` in 0035. This task starts `supabase/migrations/0036_post_beta_cleanup.sql`, which does three things:
- **Closes the view to the app.** It revokes select on `public.activity_feed` from `authenticated` and `anon`. `service_role` and the owner keep access, and the view itself stays unchanged. It's still the DB tests' equivalence oracle.
- **Indexes every foreign key column.** It adds plain b-tree indexes on `activity_events`' `bet_id`, `parlay_id`, `task_completion_id`, `outcome_id` and `market_id` (the spec's five), plus `resolution_id` and `actor_id`, so no foreign key lookup is left scanning the events table:
  - The first six are `on delete cascade`, and without an index every deleted source row scans the whole events table. 0035's `activity_events_market_resolution_idx` is partial (`(market_id) where resolution_id is not null`): it can't serve the market cascade, and for a resolution delete Postgres can only walk the whole index with `resolution_id` as a Filter, not an Index Cond.
  - `actor_id` doesn't cascade, but a profile delete still checks it (`select 1 from only activity_events where actor_id = $1 for key share`). Its only index, `activity_events_actor_idx`, is partial (`where hidden_at is null`), and that lookup has no `hidden_at` predicate, so it's a Seq Scan even with `enable_seqscan = off`.
  - The spec names five columns, but its constraint is that 0036 "only adds indexes and CHECKs", which the other two keep to. The app deletes neither markets' resolutions nor profiles today, but test fixtures do, and the plan leaves no known gap behind.
- **Enforces the two timestamp invariants.** It adds two CHECKs, both validated:
  - `task_completions_approved_has_reviewed_at`: `check (status <> 'approved' or reviewed_at is not null)`
  - `parlays_won_has_settled_at`: `check (status <> 'won' or settled_at is not null)`

  `approve_task_completion` (0020, and `review_task_completions` through it) and `settle_parlay` (0027) already set these timestamps, so no app behaviour changes. Without the CHECKs, a direct write that skips the timestamp still fails, but later and less clearly: 0035's events trigger hits `occurred_at`'s not-null.

**The transaction.** It's one explicit `begin; … commit;`, like 0034 and 0035, because the Supabase CLI runs a file's statements without a transaction.
- `set local lock_timeout = '5s'` bounds each lock wait separately.
- **The lock list.** `lock table public.task_completions, public.parlays, public.activity_events in share row exclusive mode` covers the three tables the file changes. They're locked in the app writers' own order: `task_completions` before `parlays` (0033's order), and `activity_events` last, because every writer reaches it through a trigger after writing its source row.
- **What's left out, and why it's safe.** The rule carried from 0034 and 0035 is that the lock list covers every table the file touches or references. Three relations the file names are deliberately left out, because locking them buys no consistency and costs availability:
  - **`activity_feed`.** `lock table` on a view locks every table the view reads, recursively (bets, parlays, markets, profiles and more). `revoke` changes only the view's ACL, needs no table lock of its own, and nothing else in the file reads the view.
  - **`bets` and `market_outcomes`,** which Task 2's `create or replace function` names. Replacing a SQL function takes a lock on the function, not on the tables its body reads, and parsing the body checks those tables under access share at most. Access share conflicts only with access exclusive, so no bet or outcome write can interfere with it, and none of this file's statements reads or writes their rows. Taking share row exclusive on `bets` here would block every bet for the whole migration and protect nothing.
  - The FK target tables (`profiles`, `markets`, `market_resolutions` and the rest) aren't touched either: `create index` on `activity_events` reads only `activity_events`, which is already locked.
- **The CHECKs' own lock.** Each `add constraint` upgrades its table to access exclusive while it validates. That's the same as 0034, and `lock_timeout` covers the wait.

**The preflight guard.** Before any change, a `do $$ … $$;` block counts the approved completions with no `reviewed_at` and the won parlays with no `settled_at`. If either count is non-zero, it raises, naming both counts, and nothing is applied. The guard has already proved every row passes, so the constraints are added validated, not `NOT VALID`. The guard is the file's only `do` block, and the test reads it out of the file, as 0034's test does.

**The tests that read the view.** Only two read it through a member client:
- **`tests/db/activity-feed.test.ts`.** Its reader moves to the service client. The view is `security_invoker`, and the service role bypasses RLS, so it sees every row. That's exactly what an invited member saw before, and the fixtures are wiped per test, so every assertion keeps its meaning.
  - Its two RLS assertions change. "Approved task completions to everyone" now reads the approved event through each member's own `activity_events` read. "An uninvited session sees nothing" becomes "closed to members and anon": every member client and an anon client get `42501`, and `has_table_privilege` confirms the grants.
  - An uninvited member seeing nothing in `activity_events` is already pinned by `activity-events.test.ts` ("shows an uninvited member nothing, and lets no member write").
- **`tests/db/list-feed-equivalence.test.ts`.** Its `legacyListFeed` reference reads the view through the service client, and is compared with Bob's `listFeed`, which is unchanged. Bob is invited, so the two still see the same rows. The uninvited check keeps `listFeed`'s empty result and adds that the view refuses Dave with `42501`.

`activity-events.test.ts` and `data-layer-indexes.test.ts` read the view through `pgQuery`, whose postgres-meta role the revoke doesn't touch (the same role already runs `alter table` and `vacuum` in other tests), and `social-readers.test.ts` only names it in a comment. None of the three needs a change.

**`AGENTS.md`** gains one line under "Data and reliability", so no later test reaches for the view through a member client: members can't select `activity_feed` since 0036, and tests read it only through the service client or `pgQuery`.

**Files:**
- Create: `supabase/migrations/0036_post_beta_cleanup.sql`
- Modify: `AGENTS.md` (one bullet under "Data and reliability")
- Test, create: `tests/db/post-beta-cleanup.test.ts`
- Test, modify: `tests/db/activity-feed.test.ts`, `tests/db/list-feed-equivalence.test.ts`

**Interfaces:**
- Consumes:
  - `public.activity_feed` (0031): `security_invoker`, granted select to `authenticated` and `service_role` (0031 revoked everything else from `anon` and `authenticated`).
  - `public.activity_events` (0035), with its cascading foreign keys `bet_id`, `parlay_id`, `task_completion_id`, `outcome_id`, `market_id` and `resolution_id`, and its non-cascading `actor_id`. Its existing indexes are all partial or on other columns: `activity_events_feed_idx`, `activity_events_actor_idx (actor_id, occurred_at desc, id desc) where hidden_at is null` and `activity_events_market_resolution_idx (market_id) where resolution_id is not null`.
  - The triggers `activity_events_from_task_completion` on `task_completions` and `activity_events_from_parlay` on `parlays` (0035). Each inserts an event with a not-null `occurred_at` taken from `reviewed_at` or `settled_at`.
  - `task_completions` (0017): `status in ('pending', 'approved', 'rejected')`, `reviewed_at` nullable, and a unique active completion per `(task_id, profile_id, period_key)`. `parlays` (0025): `status in ('pending', 'won', 'lost', 'refunded')`, `settled_at` nullable. `service_role` has all privileges on both.
  - The test helpers:
    - `serviceClient()` (`tests/db/helpers.ts`)
    - `seedMembers`, `makeMember`, `clientFor`, `createTestMarket`, `createTestTask`, `ensureInvited`, `Member` and `TestMarket` (`tests/db/fixtures.ts`)
    - `pgQuery` (`tests/db/pg-query.ts`). A multi-statement call runs as one implicit transaction, so an error anywhere rolls the whole call back.
- Produces, for Task 2 and later:
  - `supabase/migrations/0036_post_beta_cleanup.sql`, ending with a line containing only `commit;`, the only such line in the file. Task 2 inserts its section just before it.
  - `activity_feed`: no privileges for `authenticated` or `anon`. `service_role` still selects it.
  - Indexes `activity_events_bet_id_idx`, `activity_events_parlay_id_idx`, `activity_events_task_completion_id_idx`, `activity_events_outcome_id_idx`, `activity_events_market_id_idx`, `activity_events_resolution_id_idx` and `activity_events_actor_id_idx`, each a plain b-tree on its one column.
  - Constraints `task_completions_approved_has_reviewed_at` and `parlays_won_has_settled_at`, validated. A violating write fails with `23514`, naming the constraint.

- [ ] **Step 1: Write the failing DB tests**

Local Supabase must be running.

Run: `npm run db:reset`
Expected: the reset applies migrations through `0035_activity_events.sql` without error.

Create `tests/db/post-beta-cleanup.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { serviceClient } from './helpers'
import { seedMembers, createTestTask, type Member } from './fixtures'
import { pgQuery } from './pg-query'

// Reads the preflight guard out of the migration itself, so the test can't drift from what
// actually runs: the do $$ ... $$; block before any change. It's the only do block in 0036, and
// it doesn't nest $$ tags.
function readGuardBlock(): string {
  const sql = readFileSync(
    path.resolve(import.meta.dirname, '../../supabase/migrations/0036_post_beta_cleanup.sql'),
    'utf8',
  )
  const match = sql.match(/do \$\$[\s\S]*?\$\$;/)
  if (!match) throw new Error('could not find the preflight do $$ block in 0036_post_beta_cleanup.sql')
  return match[0]
}

const FOREIGN_KEY_INDEXES: Record<string, string> = {
  activity_events_actor_id_idx: 'CREATE INDEX activity_events_actor_id_idx ON public.activity_events USING btree (actor_id)',
  activity_events_bet_id_idx: 'CREATE INDEX activity_events_bet_id_idx ON public.activity_events USING btree (bet_id)',
  activity_events_market_id_idx: 'CREATE INDEX activity_events_market_id_idx ON public.activity_events USING btree (market_id)',
  activity_events_outcome_id_idx: 'CREATE INDEX activity_events_outcome_id_idx ON public.activity_events USING btree (outcome_id)',
  activity_events_parlay_id_idx: 'CREATE INDEX activity_events_parlay_id_idx ON public.activity_events USING btree (parlay_id)',
  activity_events_resolution_id_idx:
    'CREATE INDEX activity_events_resolution_id_idx ON public.activity_events USING btree (resolution_id)',
  activity_events_task_completion_id_idx:
    'CREATE INDEX activity_events_task_completion_id_idx ON public.activity_events USING btree (task_completion_id)',
}

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('activity_events foreign key indexes', () => {
  it('indexes every column a source row delete looks events up by', async () => {
    const rows = await pgQuery<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in (${Object.keys(FOREIGN_KEY_INDEXES)
        .map((name) => `'${name}'`)
        .join(', ')})`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]))).toEqual(FOREIGN_KEY_INDEXES)
  })
})

describe('timestamp invariants', () => {
  it('refuses an approved task completion with no reviewed_at, and accepts one with it', async () => {
    const db = serviceClient()
    const { taskId: first } = await createTestTask(alice, { title: 'First task' })
    const { taskId: second } = await createTestTask(alice, { title: 'Second task' })
    const completion = { profile_id: bob.id, reward_amount: 10, period_key: 'once' }

    const refused = await db.from('task_completions').insert({ ...completion, task_id: first, status: 'approved' })
    expect(refused.error?.code).toBe('23514')
    expect(refused.error?.message).toContain('task_completions_approved_has_reviewed_at')

    const pending = await db.from('task_completions').insert({ ...completion, task_id: first, status: 'pending' })
    expect(pending.error).toBeNull()

    const approved = await db.from('task_completions').insert({
      ...completion,
      task_id: second,
      status: 'approved',
      reviewed_at: new Date().toISOString(),
      reviewed_by: alice.id,
    })
    expect(approved.error).toBeNull()
  })

  it('refuses a won parlay with no settled_at, and accepts one with it', async () => {
    const db = serviceClient()
    const { data: parlay, error: insertErr } = await db
      .from('parlays')
      .insert({ profile_id: bob.id, stake: 10 })
      .select('id')
      .single()
    expect(insertErr).toBeNull()

    const refused = await db.from('parlays').update({ status: 'won', credited: 20 }).eq('id', parlay!.id)
    expect(refused.error?.code).toBe('23514')
    expect(refused.error?.message).toContain('parlays_won_has_settled_at')

    const won = await db
      .from('parlays')
      .update({ status: 'won', credited: 20, settled_at: new Date().toISOString() })
      .eq('id', parlay!.id)
    expect(won.error).toBeNull()
  })

  it('adds both constraints validated', async () => {
    const rows = await pgQuery<{ conname: string; convalidated: boolean; definition: string }>(`
      select conname, convalidated, pg_get_constraintdef(oid) as definition from pg_constraint
      where conname in ('task_completions_approved_has_reviewed_at', 'parlays_won_has_settled_at')
      order by conname
    `)
    expect(rows).toEqual([
      {
        conname: 'parlays_won_has_settled_at',
        convalidated: true,
        definition: "CHECK (((status <> 'won'::text) OR (settled_at IS NOT NULL)))",
      },
      {
        conname: 'task_completions_approved_has_reviewed_at',
        convalidated: true,
        definition: "CHECK (((status <> 'approved'::text) OR (reviewed_at IS NOT NULL)))",
      },
    ])
  })

  it('the preflight guard passes clean rows and raises on rows that break either invariant, naming each count', async () => {
    await expect(pgQuery(readGuardBlock())).resolves.toBeDefined()

    // The violating rows can only be made with the constraints gone, and with the events triggers
    // off, since they'd fail on the missing timestamp first. Everything runs in postgres-meta's one
    // implicit transaction, so the guard's raise rolls it all back: the constraints, triggers and
    // rows are exactly as they were. The last statement fails the test if the guard doesn't raise,
    // and rolls back just the same.
    const { taskId } = await createTestTask(alice)
    await expect(
      pgQuery(`
        alter table public.task_completions drop constraint task_completions_approved_has_reviewed_at;
        alter table public.parlays drop constraint parlays_won_has_settled_at;
        alter table public.task_completions disable trigger activity_events_from_task_completion;
        alter table public.parlays disable trigger activity_events_from_parlay;
        insert into public.task_completions (task_id, profile_id, status, reward_amount, period_key)
          values ('${taskId}', '${bob.id}', 'approved', 10, 'once');
        insert into public.parlays (profile_id, stake, status, credited) values ('${bob.id}', 10, 'won', 20);
        ${readGuardBlock()}
        do $$ begin raise exception 'the guard let the violating rows through'; end $$;
      `),
    ).rejects.toThrow(/task_completions approved without reviewed_at: 1, parlays won without settled_at: 1/)

    const [after] = await pgQuery<{ constraints: number; triggers: number; completions: number; parlays: number }>(`
      select
        (select count(*)::integer from pg_constraint
          where conname in ('task_completions_approved_has_reviewed_at', 'parlays_won_has_settled_at')) as constraints,
        (select count(*)::integer from pg_trigger
          where tgname in ('activity_events_from_task_completion', 'activity_events_from_parlay') and tgenabled = 'O') as triggers,
        (select count(*)::integer from public.task_completions) as completions,
        (select count(*)::integer from public.parlays) as parlays
    `)
    expect(after).toEqual({ constraints: 2, triggers: 2, completions: 0, parlays: 0 })
  })
})
```

Replace the whole of `tests/db/activity-feed.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
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
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(aliceClient)
  await ensureInvited(bobClient)
  // Alice is an admin so she can resolve before close_at, override, and review tasks.
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
})

interface FeedRow {
  id: string
  kind: string
  actor_id: string
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

// 0036 closed the view to members and anon; it stays as the equivalence oracle, read here through
// the service role. The view is security_invoker, so the service role's own bypass of RLS means
// it shows every row, which is what an invited member saw before the revoke. What each member
// may see is activity_events' RLS, and that's asserted on activity_events itself.
async function feed(actorId?: string): Promise<FeedRow[]> {
  let query = serviceClient()
    .from('activity_feed')
    .select('id, kind, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
  if (actorId) query = query.eq('actor_id', actorId)
  const { data, error } = await query
  if (error) throw error
  return data as FeedRow[]
}

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number): Promise<void> {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

describe('activity_feed', () => {
  it('shows a created market and a placed bet with their details', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Feed market' })
    await bet(bobClient, market, 0, 7)

    const rows = await feed()
    expect(rows).toContainEqual(
      expect.objectContaining({
        kind: 'market_created',
        actor_id: alice.id,
        actor_name: 'Alice',
        market_id: market.marketId,
        market_title: 'Feed market',
        amount: null,
      }),
    )
    expect(rows).toContainEqual(
      expect.objectContaining({
        kind: 'bet_placed',
        actor_id: bob.id,
        actor_name: 'Bob',
        market_id: market.marketId,
        market_title: 'Feed market',
        outcome_label: 'Yes',
        amount: 7,
        leg_count: null,
        task_title: null,
      }),
    )
  })

  it('shows a placed parlay with its pick count', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    await bet(aliceClient, a, 0, 5)
    await bet(aliceClient, b, 0, 5)
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()

    expect(await feed()).toContainEqual(
      expect.objectContaining({ kind: 'parlay_placed', actor_id: bob.id, amount: 10, leg_count: 2, market_id: null }),
    )
  })

  it("shows a resolution and each winner's payout, matching what the ledger paid", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Payout market' })
    await bet(aliceClient, market, 1, 10)
    await bet(bobClient, market, 0, 3)
    await bet(aliceClient, market, 0, 4)
    await resolve(market, 0)

    const rows = await feed()
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'market_resolved', actor_id: alice.id, market_id: market.marketId, outcome_label: 'Yes' }),
    )

    // Pool 17, winning pool 7: Bob floor(3 × 17 / 7) = 7, Alice floor(4 × 17 / 7) = 9.
    const wins = rows.filter((r) => r.kind === 'bet_won' && r.market_id === market.marketId)
    const { data: ledger } = await serviceClient()
      .from('coin_transactions')
      .select('profile_id, amount')
      .eq('type', 'bet_won')
      .eq('meta->>market_id', market.marketId)
    const byProfile = (list: { profile_id?: string; actor_id?: string; amount: number | null }[]) =>
      Object.fromEntries(list.map((x) => [x.profile_id ?? x.actor_id, x.amount]))
    expect(byProfile(wins)).toEqual({ [bob.id]: 7, [alice.id]: 9 })
    expect(byProfile(ledger!)).toEqual(byProfile(wins))
  })

  it('drops an overridden resolution and its wins, and shows the new ones', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Override market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 15)
    await resolve(market, 0)
    await resolve(market, 1)

    const rows = (await feed()).filter((r) => r.market_id === market.marketId)
    const resolutions = rows.filter((r) => r.kind === 'market_resolved')
    expect(resolutions).toHaveLength(1)
    expect(resolutions[0].outcome_label).toBe('No')

    const wins = rows.filter((r) => r.kind === 'bet_won')
    expect(wins).toEqual([expect.objectContaining({ actor_id: alice.id, amount: 20 })])
  })

  it('shows no wins for a voided market or one nobody backed', async () => {
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided market' })
    await bet(bobClient, voided, 0, 5)
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: voided.marketId })
    expect(voidErr).toBeNull()

    const unbacked = await createTestMarket(aliceClient, ['Yes', 'No', 'Maybe'], { title: 'Unbacked market' })
    await bet(bobClient, unbacked, 0, 5)
    await resolve(unbacked, 2)

    const rows = await feed()
    expect(rows.filter((r) => r.kind === 'bet_won')).toEqual([])
    expect(rows.filter((r) => r.market_id === voided.marketId).map((r) => r.kind).sort()).toEqual([
      'bet_placed',
      'market_created',
    ])
    expect(rows).toContainEqual(
      expect.objectContaining({ kind: 'market_resolved', market_id: unbacked.marketId, outcome_label: 'Maybe' }),
    )
  })

  it('shows a won parlay with its payout', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const { error } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(error).toBeNull()
    await resolve(a, 0)
    await resolve(b, 0)

    expect(await feed()).toContainEqual(
      expect.objectContaining({ kind: 'parlay_won', actor_id: bob.id, amount: 160, leg_count: 2 }),
    )
  })

  it('shows approved task completions, and every invited member sees them in activity_events, but no pending or rejected ones', async () => {
    const approvedTask = await createTestTask(alice, { title: 'Read Psalm 1', rewardAmount: 12 })
    const rejectedTask = await createTestTask(alice, { title: 'Rejected task' })
    const pendingTask = await createTestTask(alice, { title: 'Pending task' })
    const submit = async (taskId: string): Promise<string> => {
      const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
      if (error) throw error
      return data as string
    }
    const approvedId = await submit(approvedTask.taskId)
    const rejectedId = await submit(rejectedTask.taskId)
    await submit(pendingTask.taskId)
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: approvedId })).error).toBeNull()
    expect((await aliceClient.rpc('reject_task_completion', { p_completion_id: rejectedId, p_reason: null })).error).toBeNull()

    expect((await feed()).filter((r) => r.kind === 'task_completed')).toEqual([
      expect.objectContaining({ id: `task:${approvedId}`, actor_id: bob.id, actor_name: 'Bob', task_title: 'Read Psalm 1', amount: 12 }),
    ])

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    await ensureInvited(carolClient)

    for (const viewer of [carolClient, bobClient]) {
      const { data, error } = await viewer.from('activity_events').select('id, actor_id, amount').eq('kind', 'task_completed')
      expect(error).toBeNull()
      expect(data).toEqual([{ id: `task:${approvedId}`, actor_id: bob.id, amount: 12 }])
    }
  })

  it('filters to one member', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Filter market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 5)

    const rows = await feed(alice.id)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.actor_id === alice.id)).toBe(true)
    expect(rows.map((r) => r.kind).sort()).toEqual(['bet_placed', 'market_created'])
  })

  it('is closed to members and anon, and open to the service role', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Closed view market' })
    await bet(bobClient, market, 0, 5)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    const anonClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    })
    // An invited admin, an invited member, an uninvited member and a signed-out session alike.
    for (const client of [aliceClient, bobClient, carolClient, anonClient]) {
      const { data, error } = await client.from('activity_feed').select('id')
      expect(error?.code).toBe('42501')
      expect(data).toBeNull()
    }

    const [grants] = await pgQuery<Record<string, boolean>>(`
      select
        has_table_privilege('authenticated', 'public.activity_feed', 'select, insert, update, delete') as authenticated,
        has_table_privilege('anon', 'public.activity_feed', 'select, insert, update, delete') as anon,
        has_table_privilege('service_role', 'public.activity_feed', 'select') as service_role
    `)
    expect(grants).toEqual({ authenticated: false, anon: false, service_role: true })

    expect((await feed()).map((r) => r.kind).sort()).toEqual(['bet_placed', 'market_created'])
  })

  it('dates each event from its source column', async () => {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Dated A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Dated B' })
    for (const m of [a, b]) {
      await bet(aliceClient, m, 0, 5)
      await bet(aliceClient, m, 1, 15)
    }
    const { data: parlayId, error: parlayErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(parlayErr).toBeNull()
    await resolve(a, 0)
    await resolve(b, 0)

    const { taskId } = await createTestTask(alice, { title: 'Dated task' })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const { data: rows, error } = await serviceClient().from('activity_feed').select('kind, market_id, occurred_at')
    expect(error).toBeNull()
    const at = (kind: string, marketId?: string) =>
      Date.parse(rows!.find((r) => r.kind === kind && (marketId === undefined || r.market_id === marketId))!.occurred_at)

    const db = serviceClient()
    const { data: resolution } = await db
      .from('markets')
      .select('market_resolutions!markets_current_resolution_id_fkey(resolved_at)')
      .eq('id', b.marketId)
      .single()
    const resolvedAt = Date.parse(
      (resolution!.market_resolutions as unknown as { resolved_at: string }).resolved_at,
    )
    expect(at('market_resolved', b.marketId)).toBe(resolvedAt)
    expect(at('bet_won', b.marketId)).toBe(resolvedAt)

    const { data: parlay } = await db.from('parlays').select('settled_at').eq('id', parlayId as string).single()
    expect(at('parlay_won')).toBe(Date.parse(parlay!.settled_at))

    const { data: completion } = await db
      .from('task_completions')
      .select('reviewed_at')
      .eq('id', completionId as string)
      .single()
    expect(at('task_completed')).toBe(Date.parse(completion!.reviewed_at))
  })
})
```

Replace the whole of `tests/db/list-feed-equivalence.test.ts` with:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
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
import { listFeed } from '@/lib/social/list-feed'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'
import type { FeedEvent, FeedKind } from '@/lib/social/describe-event'

const NO_PAGE: PageParams = { top: null, bottom: null }

// legacyListFeed is lib/social/list-feed.ts's body at 8207124, the commit Task 1 left behind and
// the last one before Task 2 moved listFeed from the activity_feed view onto activity_events --
// `git show 8207124:lib/social/list-feed.ts`. Kept here rather than imported, since the source
// file no longer has this shape; this is the reference the activity_events-backed listFeed must
// stay equivalent to, so later work can't quietly drift the two apart. Since 0036 no member can
// select the view, so the reference reads it through the service role: the view is
// security_invoker, and the service role bypasses RLS, so it sees every row, exactly what an
// invited member saw through the view before the revoke.
interface LegacyFeedRow {
  id: string
  kind: FeedKind
  occurred_at: string
  actor_id: string
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

const LEGACY_FEED_COLUMNS =
  'id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title'
const LEGACY_FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

function legacyToFeedEvent(r: LegacyFeedRow): FeedEvent {
  return {
    id: r.id,
    kind: r.kind,
    occurredAt: r.occurred_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    marketId: r.market_id,
    marketTitle: r.market_title,
    outcomeLabel: r.outcome_label,
    amount: r.amount,
    legCount: r.leg_count,
    taskTitle: r.task_title,
  }
}

async function legacyListFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  const fetchRows = async (filter: string | null, limit: number): Promise<LegacyFeedRow[]> => {
    let query = supabase
      .from('activity_feed')
      .select(LEGACY_FEED_COLUMNS)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as LegacyFeedRow[]
  }

  const { rows, next, windowed } = await readKeyset<LegacyFeedRow>(
    opts.page,
    LEGACY_FEED_KEY_COLUMNS,
    fetchRows,
    (row) => ({ ts: row.occurred_at, id: row.id }),
  )

  return { rows: rows.map(legacyToFeedEvent), next, windowed }
}

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
  // Alice is an admin so she can resolve before close_at, override and void.
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

async function resolve(market: TestMarket, outcomeIndex: number): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
  })
  if (error) throw error
}

describe('listFeed vs the pre-activity_events view', () => {
  it("matches legacyListFeed's rows for the whole feed, one actor's activity and a second page, and shows an uninvited session nothing", async () => {
    // Every kind: bets, a parlay, a resolve then an override, a parlay win, a void, and an
    // approved task -- the same shape tests/db/activity-events.test.ts's fullScenario proves
    // activity_events keeps in step with activity_feed for, so listFeed's own read of each table
    // is what's compared here.
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Equivalence A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Equivalence B' })
    await bet(bobClient, a, 0, 11)
    await bet(carolClient, a, 1, 30)
    await bet(bobClient, b, 0, 4)
    await bet(carolClient, b, 1, 6)

    const { error: parlayBobErr } = await bobClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]],
      p_stake: 10,
    })
    expect(parlayBobErr).toBeNull()
    const { error: parlayCarolErr } = await carolClient.rpc('place_parlay', {
      p_outcome_ids: [a.outcomeIds[1], b.outcomeIds[1]],
      p_stake: 5,
    })
    expect(parlayCarolErr).toBeNull()

    // Resolve A to Yes: bob's leg wins.
    await resolve(a, 0)
    // Void B: both parlays settle on A alone -- bob's parlay wins, carol's loses.
    const { error: voidErr } = await aliceClient.rpc('void_market', { p_market_id: b.marketId })
    expect(voidErr).toBeNull()
    // Override A to No: claws back A's payouts and reverses bob's parlay win; carol's parlay,
    // whose A leg now wins, wins in its place.
    await resolve(a, 1)

    const { taskId } = await createTestTask(alice, { title: 'Equivalence task', rewardAmount: 9 })
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    expect((await aliceClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    // Padding, past the 50-row page size, so the whole feed's first page has a next cursor: a
    // second market_created event per market is the cheapest way to add rows both readers agree on.
    for (let i = 0; i < 55; i++) {
      await createTestMarket(aliceClient, ['Yes', 'No'], { title: `Equivalence padding ${i}` })
    }

    const viewerAll = await listFeed(bobClient, { page: NO_PAGE })
    const legacyAll = await legacyListFeed(serviceClient(), { page: NO_PAGE })
    expect(viewerAll.rows.length).toBe(50)
    expect(viewerAll.next).not.toBeNull()
    expect(viewerAll).toEqual(legacyAll)

    const viewerActor = await listFeed(bobClient, { actorId: bob.id, page: NO_PAGE })
    const legacyActor = await legacyListFeed(serviceClient(), { actorId: bob.id, page: NO_PAGE })
    expect(viewerActor.rows.length).toBeGreaterThan(0)
    expect(viewerActor).toEqual(legacyActor)

    // The cursor means "down to and including this row", read through the same
    // showMoreHref/readPageParams round trip a real "Show more" link uses.
    const href = new URL(showMoreHref('/feed', {}, 'activity', viewerAll.next!), 'http://localhost')
    const page2 = readPageParams(Object.fromEntries(href.searchParams), 'activity')
    const viewerPage2 = await listFeed(bobClient, { page: page2 })
    const legacyPage2 = await legacyListFeed(serviceClient(), { page: page2 })
    expect(viewerPage2.rows.length).toBeGreaterThan(0)
    expect(viewerPage2).toEqual(legacyPage2)

    const dave = await makeMember('Dave')
    const daveClient = await clientFor(dave)
    const viewerUninvited = await listFeed(daveClient, { page: NO_PAGE })
    expect(viewerUninvited.rows).toEqual([])
    expect(viewerUninvited.next).toBeNull()
    // The view itself is closed to every member, invited or not, since 0036.
    const { error: viewErr } = await daveClient.from('activity_feed').select('id').limit(1)
    expect(viewErr?.code).toBe('42501')
  })
})
```

Run: `npx vitest run tests/db/post-beta-cleanup.test.ts tests/db/activity-feed.test.ts tests/db/list-feed-equivalence.test.ts`
Expected: FAIL, with 7 failed and 9 passed:
- all 5 cases in `post-beta-cleanup.test.ts` fail:
  - the index case finds none of the seven indexes
  - both CHECK cases get `23502` where `23514` is expected: with no CHECK yet, the violating write gets as far as 0035's events trigger, whose insert breaks `occurred_at`'s not-null
  - the validated case finds no constraints
  - the guard case throws `ENOENT`, because `0036_post_beta_cleanup.sql` doesn't exist yet
- in `activity-feed.test.ts`, "is closed to members and anon, and open to the service role" fails, because every member client can still read the view (`error` is null). The other 9 cases pass through the service client.
- `list-feed-equivalence.test.ts`'s one case fails at its last assertion, because Dave can still select the view.

- [ ] **Step 2: Add the migration**

Create `supabase/migrations/0036_post_beta_cleanup.sql`:

```sql
-- Post-beta cleanup: activity_feed closed to the app, activity_events'
-- foreign key columns indexed, and the feed's two timestamp invariants
-- enforced.
--
-- One explicit transaction, like 0034 and 0035, because the migration runner
-- autocommits each statement. lock_timeout bounds each lock wait below
-- separately; if one can't be taken in time, or Postgres picks this
-- transaction to break a deadlock, nothing is applied and the Deploy
-- Production Database workflow can simply be re-run.
--
-- The locks hold until commit, so no completion or parlay can change between
-- the guard's count and the constraints being added. They're taken in the
-- order the app's own writers take them: task_completions before parlays
-- (0033's order), and activity_events last, since every writer reaches it
-- through a trigger after writing its source row. Each alter table ... add
-- constraint below still upgrades its table to access exclusive while it
-- validates; lock_timeout covers that wait too. activity_feed isn't in the
-- list: locking a view locks every table it reads, and a revoke needs no
-- lock of its own.
begin;
set local lock_timeout = '5s';
lock table public.task_completions, public.parlays, public.activity_events in share row exclusive mode;

-- Preflight: the constraints below are added validated, so a row already
-- breaking either invariant would fail the whole migration at the alter
-- table, with Postgres naming only the constraint. This counts both first
-- and raises with each count, so the rows can be found and fixed before
-- anything is applied.
do $$
declare
  parts text[] := '{}';
  n integer;
begin
  select count(*) into n from public.task_completions where status = 'approved' and reviewed_at is null;
  if n > 0 then parts := parts || format('task_completions approved without reviewed_at: %s', n); end if;

  select count(*) into n from public.parlays where status = 'won' and settled_at is null;
  if n > 0 then parts := parts || format('parlays won without settled_at: %s', n); end if;

  if array_length(parts, 1) > 0 then
    raise exception '0036: rows already break the new invariants — %. Fix them before applying.', array_to_string(parts, ', ');
  end if;
end;
$$;

-- No deployed build reads activity_feed since the feed moved to
-- activity_events (0035). It stays, unchanged, as the DB tests' equivalence
-- oracle, which reads it through the service role or as its owner.
revoke select on public.activity_feed from authenticated, anon;

-- Deleting a source row cascades to its events. Without an index on the
-- referencing column, every deleted bet, parlay, completion, outcome, market
-- or resolution scans the whole events table.
-- activity_events_market_resolution_idx (0035) is partial, so it can't serve
-- the market cascade, and a resolution delete could only walk all of it.
-- actor_id doesn't cascade, but deleting a profile still looks its events
-- up, with no hidden_at predicate, so the partial activity_events_actor_idx
-- can't serve that either.
create index activity_events_bet_id_idx on public.activity_events (bet_id);
create index activity_events_parlay_id_idx on public.activity_events (parlay_id);
create index activity_events_task_completion_id_idx on public.activity_events (task_completion_id);
create index activity_events_outcome_id_idx on public.activity_events (outcome_id);
create index activity_events_market_id_idx on public.activity_events (market_id);
create index activity_events_resolution_id_idx on public.activity_events (resolution_id);
create index activity_events_actor_id_idx on public.activity_events (actor_id);

-- The feed dates an approved completion by reviewed_at and a won parlay by
-- settled_at, and activity_events.occurred_at is not null. approve_task_completion
-- and settle_parlay always set both. With these, a direct write that leaves
-- one out fails here, naming the rule, rather than in the events trigger
-- with a bare not-null error. Validated, not NOT VALID: the guard above has
-- already proved every existing row passes.
alter table public.task_completions
  add constraint task_completions_approved_has_reviewed_at check (status <> 'approved' or reviewed_at is not null);
alter table public.parlays
  add constraint parlays_won_has_settled_at check (status <> 'won' or settled_at is not null);

commit;
```

Run: `grep -n '^commit;$' supabase/migrations/0036_post_beta_cleanup.sql && tail -n 1 supabase/migrations/0036_post_beta_cleanup.sql`
Expected: exactly one `commit;` line, and it's the last line of the file.

In `AGENTS.md`, under "Data and reliability", replace:

```md
  equivalence scenario. No trigger watches `market_resolutions`.
```

with:

```md
  equivalence scenario. No trigger watches `market_resolutions`.
- **Members can't select `activity_feed`** since 0036. It stays only as
  the DB tests' equivalence oracle, and tests read it through the service
  client or `pgQuery`, never a member client.
```

- [ ] **Step 3: Apply it and see the tests pass**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0036_post_beta_cleanup.sql` without error. The guard passes on the reset's empty tables.

Run: `npx vitest run tests/db/post-beta-cleanup.test.ts tests/db/activity-feed.test.ts tests/db/list-feed-equivalence.test.ts tests/db/activity-events.test.ts tests/db/data-layer-indexes.test.ts tests/db/social-readers.test.ts tests/db/approve-task-completion.test.ts tests/db/review-task-completions.test.ts tests/db/settle-parlay.test.ts`
Expected: PASS, 65 tests in 9 files:
- the 16 cases in the three files above
- the view readers that go through `pgQuery` (`activity-events`, `data-layer-indexes`), unchanged
- the writers the CHECKs bind (`approve_task_completion`, `review_task_completions`, `settle_parlay`), unchanged: each already sets its timestamp

- [ ] **Step 4: Verify**

Local Supabase must be running, with 0036 applied (Step 3).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1092 tests in 165 files, 47 of them in `tests/db/`. This task adds 5 tests in 1 new file. The two modified files keep their counts (10 and 1).
- **Build:** the same routes as before. Nothing in `app/`, `lib/` or `components/` reads `activity_feed`. Only a comment in `lib/social/list-feed.ts` names it.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, the same as before.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0036_post_beta_cleanup.sql AGENTS.md tests/db/post-beta-cleanup.test.ts tests/db/activity-feed.test.ts tests/db/list-feed-equivalence.test.ts
git commit -m "Close activity_feed to the app, index event foreign keys, enforce feed timestamps"
```

---

## Task 2: A cheaper `market_sparklines`, with identical output

`market_sparklines` (0035) keeps a running pool for every outcome by joining every bet to every outcome of its market and windowing over the result. Its work therefore grows with bets × outcomes. This task recreates it in 0036, with the same signature, return shape, caps, grants and output, down to the bit, but with no cross join. The markets list calls it through `lib/markets/sparklines.ts`, and nothing there changes.

**How the new body works.**
- **Numbering.** `ordered` numbers each market's bets `n` over `(created_at, id)`, exactly as before. In the same window it keeps the market's running total, the sum of the amounts up to and including bet `n`.
- **Picks.** `sized` and `picked` are unchanged, so the same positions are picked: `1 + (i − 1)(N − 1) / (K − 1)` for i = 1…K, or only the last bet when K = 1.
- **Pools.** `pooled` runs one window over each outcome's own bets, partitioned by `(market_id, outcome_id)`. Into each outcome's run it adds a zero-amount marker for every picked position, sorted after the bet at that same position (`order by n, mark`, where `false < true`). A marker's running sum is then that outcome's pool at or before the picked bet, and it's 0 for an outcome with no bet yet. So the window sorts bets + picked × outcomes rows, not bets × outcomes.
- **Shares.** `chosen` keeps only the marker rows, joins each to its picked bet in `ordered` for the bet's `created_at` and the market's running total, and builds `{ outcome: pool / total }`. The final select is unchanged.

**Why the output is bit-identical.**
- **The same numbers.** Every pool and total is the same integer sum 0035 computed (`sum` of integer amounts, a `bigint`). The division is the same `double precision` division, so every share is the same double, and so is its `jsonb` text.
- **The edge cases.** They fall out the same way:
  - an outcome with no bets reads 0
  - a bet whose outcome isn't one of its market's outcomes (no app path writes one) counts toward the total but no pool, as before
  - a caller who can see `bets` but not `market_outcomes` (an admin who isn't invited) gets no row, as before, because there are no markers to read
- **The rest is 0035's.** The `ids` cap by flattened element count, the `offset 0`-fenced lateral read keyed on `market_id`, security invoker, no `set search_path` (so it still inlines), and schema-qualified relations are all unchanged. `create or replace` keeps 0035's grants.

**The test.** Every existing case in `tests/db/market-sparklines.test.ts` pins the output, and they all pass unchanged. That covers equality with `buildProbabilitySeries`, ties, the caps, a null `p_points`, duplicate ids, 50-id chunks, nested arrays, RLS, grants, and the `Index Cond` EXPLAIN. The EXPLAIN case needs no change, because each market's bets are still read by the same fenced lateral subquery.

One new case pins what this task is for. It asks EXPLAIN ANALYZE for the row count of every `WindowAgg`, which the data sets and the planner can't change:
- **The fixture.** One market with 3 outcomes and 100 bets, at `p_points` = 5.
- **Before this task,** the widest window is 300 rows (100 × 3).
- **After it,** the widest is 115 (100 bets + 5 × 3 markers).

**What it buys, honestly.** Measured while writing this plan, as the median `Execution Time` of `explain (analyze, timing off)` over the 50 busiest markets in one call:
- **The scale seed** (about 113 bets per busy market, a little over 2 outcomes each): about 15.0 ms before and 13.4 ms after. At that shape the cross join was a small part of the cost, and building the points' JSON dominates.
- **Heavier history** (50 markets × 2,000 bets, half binary and half with 6 outcomes): about 285 ms before and 134 ms after, roughly 2.1×. The gain grows with bets × outcomes.

Task 7 re-measures on the scale seed, and the PR reports both, promising no visible change at today's scale.

**Files:**
- Modify: `supabase/migrations/0036_post_beta_cleanup.sql` (Task 1's file; a new section just before its final `commit;`)
- Test, modify: `tests/db/market-sparklines.test.ts` (one new case)

**Interfaces:**
- Consumes:
  - `supabase/migrations/0036_post_beta_cleanup.sql` from Task 1. It ends with a line containing only `commit;`, the only such line in the file.
  - `public.market_sparklines(p_market_ids uuid[], p_points integer default 40) returns table (market_id uuid, points jsonb)` (0035): `language sql stable`, security invoker, no `set search_path`. Execute is granted to `authenticated` and `service_role` only.
  - `bets` (0008), with `bets_market_created_idx (market_id, created_at desc, id desc)` (0033) and `amount integer not null check (amount > 0)`. `market_outcomes` (0008).
  - The test file's own helpers: `createTestMarket`, `insertBets`, `fullSeries`, `picked`, `pointsOf`, `expectSameSeries`, and `pgQuery`.
- Produces:
  - The same function, with the same signature, return type, volatility, security, grants and output. `lib/markets/sparklines.ts` and the markets list page are unchanged.

- [ ] **Step 1: Write the failing DB test**

Local Supabase must be running, with Task 1's 0036 applied (`npm run db:reset`).

Replace the whole of `tests/db/market-sparklines.test.ts` with the file below. It's the current file plus one case, "keeps its running sums to the bets plus one marker per picked bet and outcome, never bets × outcomes", placed before "returns one row for each market that has bets":

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

  it('breaks same-instant ties by id, the same order fullSeries reads and buildProbabilitySeries keeps', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const tie = new Date('2026-09-01T00:00:00.000Z').toISOString()
    const { error } = await serviceClient()
      .from('bets')
      .insert([
        { market_id: market.marketId, outcome_id: market.outcomeIds[1], profile_id: bob.id, amount: 9, created_at: tie },
        { market_id: market.marketId, outcome_id: market.outcomeIds[0], profile_id: alice.id, amount: 3, created_at: tie },
        { market_id: market.marketId, outcome_id: market.outcomeIds[0], profile_id: alice.id, amount: 5, created_at: tie },
      ])
    if (error) throw error

    const points = await pointsOf(bobClient, market)
    const series = await fullSeries(market)
    expect(series).toHaveLength(3)
    expectSameSeries(points, series)
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

  it('returns every bet when a market has exactly p_points bets', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 40)
    const series = await fullSeries(market)
    expect(series).toHaveLength(40)
    expectSameSeries(await pointsOf(bobClient, market), series)
  })

  it('treats a null p_points as the default of 40', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await insertBets(market, 45)
    const series = await fullSeries(market)

    const { data, error } = await bobClient.rpc('market_sparklines', { p_market_ids: [market.marketId], p_points: null })
    if (error) throw error
    const rows = data as SparklineRow[]
    expect(rows.map((r) => r.market_id)).toEqual([market.marketId])
    expectSameSeries(rows[0].points, picked(series, 40))
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

  it('keeps its running sums to the bets plus one marker per picked bet and outcome, never bets × outcomes', async () => {
    const market = await createTestMarket(aliceClient, ['Red', 'Blue', 'Green'])
    await insertBets(market, 100)

    interface PlanNode {
      'Node Type': string
      'Actual Rows': number
      Plans?: PlanNode[]
    }
    // Each WindowAgg's row count is set by the data, not by the planner's choices: 0035's running
    // pools windowed over every bet joined to every outcome, 100 × 3 = 300 rows here. Now the
    // widest window is the bets themselves plus a marker for each of the 5 picked bets in each of
    // the 3 outcomes' runs.
    const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
      `explain (analyze, format json) select * from public.market_sparklines(array['${market.marketId}']::uuid[], 5)`,
    )
    const windows: number[] = []
    const walk = (node: PlanNode) => {
      if (node['Node Type'] === 'WindowAgg') windows.push(node['Actual Rows'])
      node.Plans?.forEach(walk)
    }
    walk(row['QUERY PLAN'][0].Plan)

    expect(windows.length).toBeGreaterThan(0)
    expect(Math.max(...windows)).toBeLessThanOrEqual(100 + 5 * 3)
    expectSameSeries(await pointsOf(bobClient, market, 5), picked(await fullSeries(market), 5))
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

  it('returns one row even when the same market id is sent twice', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await placeBet(aliceClient, market, 0, 5)

    const rows = await sparklines(bobClient, [market.marketId, market.marketId])
    expect(rows).toHaveLength(1)
    expect(rows[0].market_id).toBe(market.marketId)
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

  it('caps by flattened element count, so a nested array cannot smuggle more than 50 ids past the cap', async () => {
    // p_market_ids[1:50] slices only the array's first dimension: a single "row" holding every id
    // would pass that slice whole, and unnest() flattens all dimensions anyway, so the cap would
    // never bite. 59 real markets, each with a bet, sent as one nested array: only the first 50
    // flattened elements may come back.
    const db = serviceClient()
    const { data: markets, error } = await db
      .from('markets')
      .insert(
        Array.from({ length: 59 }, (_, i) => ({
          created_by: alice.id,
          title: `Nested ${i}`,
          kind: 'binary',
          close_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        })),
      )
      .select('id')
    if (error) throw error
    const marketIds = markets.map((m) => m.id as string)
    const { data: outcomes, error: outcomesErr } = await db
      .from('market_outcomes')
      .insert(marketIds.flatMap((id) => [{ market_id: id, label: 'Yes' }, { market_id: id, label: 'No' }]))
      .select('id, market_id')
    if (outcomesErr) throw outcomesErr
    const outcomesOf = new Map<string, string[]>()
    for (const o of outcomes) outcomesOf.set(o.market_id as string, [...(outcomesOf.get(o.market_id as string) ?? []), o.id as string])
    const { error: betsErr } = await db.from('bets').insert(
      marketIds.map((id) => ({
        market_id: id,
        outcome_id: outcomesOf.get(id)![0],
        profile_id: alice.id,
        amount: 5,
        created_at: new Date().toISOString(),
      })),
    )
    if (betsErr) throw betsErr

    const { data, error: rpcErr } = await bobClient.rpc('market_sparklines', { p_market_ids: [marketIds] })
    if (rpcErr) throw rpcErr
    const rows = data as SparklineRow[]
    expect(rows).toHaveLength(50)
    expect(rows.map((r) => r.market_id).sort()).toEqual(marketIds.slice(0, 50).sort())
    for (const id of marketIds.slice(50)) expect(rows.some((r) => r.market_id === id)).toBe(false)
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
      'Index Cond'?: string
      'Recheck Cond'?: string
      Plans?: PlanNode[]
    }
    // The function is plain SQL with no SET clause, so Postgres inlines it and EXPLAIN shows the
    // bet reads inside it; a scan of bets in the plan proves the inlining. The fixture is two bets,
    // where a sequential scan is cheapest whatever the indexes, so seq scans are priced out for the
    // one statement. Each market's bets come from an `offset 0`-fenced lateral subquery keyed on the
    // market id, which Postgres can't flatten into a plain join, so the lookup is planned per market
    // and keyed on market_id — either a plain Index Scan (an Index Cond of its own) or a Bitmap Heap
    // Scan (a Recheck Cond, with the Index Cond one level down on its Bitmap Index Scan child) —
    // rather than one scan of every matched bet filtered by a Join Filter.
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
    for (const scan of betScans) {
      expect(scan['Node Type']).not.toBe('Seq Scan')
      const cond = scan['Index Cond'] ?? scan['Recheck Cond'] ?? scan.Plans?.find((p) => p['Index Cond'])?.['Index Cond']
      expect(cond).toMatch(/market_id/)
    }
    const indexNames = nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : []))
    expect(indexNames).toContain('bets_market_created_idx')
  })
})
```

Run: `npx vitest run tests/db/market-sparklines.test.ts`
Expected: FAIL, with 1 failed and 12 passed. The new case fails with `expected 300 to be less than or equal to 115`: 0035's running-pool window covers every bet joined to every outcome.

- [ ] **Step 2: Replace the function in the migration**

In `supabase/migrations/0036_post_beta_cleanup.sql`, replace the file's final line, `commit;`, with the block below. The block ends with that same `commit;`, so the function is replaced inside Task 1's transaction:

```sql
-- market_sparklines (0035), recreated with the same signature, return shape,
-- caps and output, bit for bit. 0035 joined every bet to every outcome of its
-- market to keep a running pool per outcome, so the work grew with bets ×
-- outcomes. Here each outcome's running pool runs over that outcome's own
-- bets, and the market's running total over its bets, both in the one
-- (created_at, id) order that numbers them. Only the picked positions need
-- every outcome's share: each position is added to each outcome's own run as
-- a zero-amount marker, sorted just after the bet at that position, so the
-- marker's running sum is that outcome's pool at or before it, and 0 for an
-- outcome with no bet yet. The sums are the same integers 0035 added, divided
-- the same way, so every share is the same double.
--
-- Everything else is as 0035 explains it: security invoker, so the caller's
-- access rules on bets and market_outcomes apply; no set search_path, so
-- Postgres can inline it and plan each market's bets through
-- bets_market_created_idx (every relation is schema-qualified, and the
-- functions it calls resolve from pg_catalog); ids capped at the first 50
-- flattened elements; p_points clamped to 1..200; each market's bets read
-- through an offset 0 fenced lateral subquery, so the lookup stays keyed on
-- market_id. create or replace keeps the grants 0035 gave it.
create or replace function public.market_sparklines(p_market_ids uuid[], p_points integer default 40)
returns table (market_id uuid, points jsonb)
language sql
stable
as $$
  with ids as (
    select distinct u.id
    from unnest(p_market_ids) with ordinality as u(id, ord)
    where u.ord <= 50
  ),
  ordered as (
    select bet.market_id, bet.outcome_id, bet.amount, bet.created_at,
      row_number() over w as n,
      sum(bet.amount) over w as total
    from ids
    cross join lateral (
      select b.id, b.market_id, b.outcome_id, b.amount, b.created_at
      from public.bets b
      where b.market_id = ids.id
      offset 0
    ) bet
    window w as (partition by bet.market_id order by bet.created_at, bet.id)
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
  pooled as (
    select e.market_id, e.n, e.outcome_id, e.mark,
      sum(e.amount) over (partition by e.market_id, e.outcome_id order by e.n, e.mark) as pool
    from (
      select o.market_id, o.n, o.outcome_id, o.amount, false as mark
      from ordered o
      union all
      select p.market_id, p.n, mo.id, 0, true
      from picked p
      join public.market_outcomes mo on mo.market_id = p.market_id
    ) e
  ),
  chosen as (
    select o.market_id, o.n, o.created_at,
      jsonb_object_agg(pl.outcome_id, pl.pool::double precision / o.total::double precision) as shares
    from pooled pl
    join ordered o on o.market_id = pl.market_id and o.n = pl.n
    where pl.mark
    group by o.market_id, o.n, o.created_at
  )
  select c.market_id, jsonb_agg(jsonb_build_object('t', c.created_at, 'shares', c.shares) order by c.n)
  from chosen c
  group by c.market_id
  order by c.market_id
$$;

commit;
```

Run: `grep -n '^commit;$' supabase/migrations/0036_post_beta_cleanup.sql && tail -n 1 supabase/migrations/0036_post_beta_cleanup.sql`
Expected: exactly one `commit;` line, and it's the last line of the file.

Run: `grep -c 'do \$\$' supabase/migrations/0036_post_beta_cleanup.sql`
Expected: `1`. The guard is still the file's only `do` block, which Task 1's guard test relies on.

- [ ] **Step 3: Apply it and see the tests pass**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0036_post_beta_cleanup.sql` without error.

Run: `npx vitest run tests/db/market-sparklines.test.ts tests/db/post-beta-cleanup.test.ts`
Expected: PASS: all 13 cases in `market-sparklines.test.ts` (the 12 existing ones unchanged, the `Index Cond` EXPLAIN included), and Task 1's 5.

- [ ] **Step 4: Verify**

Local Supabase must be running, with 0036 applied (Step 3).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1093 tests in 165 files, 47 of them in `tests/db/`. This task adds 1 test to an existing file.
- **Build:** the same routes as before.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, the same as before. The markets list's sparklines are unchanged.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0036_post_beta_cleanup.sql tests/db/market-sparklines.test.ts
git commit -m "Compute market sparklines without joining every bet to every outcome"
```

---

## Task 3: Shared "Show more": focus, "Nothing older here", and a keys-only probe

Three changes land together in every paged list: the ledger, a market's bets, closed markets, the feed and a member's activity. Tasks 4 and 5 then add the leaderboard and open markets, built on what this task produces.

- **Focus after "Show more" (spec 3b).** Today the link a keyboard or screen reader user just pressed disappears, or moves, and focus falls back to the document. After this task, focus lands on the first newly shown row. For a fresh window, that's the window's first row.
- **"Nothing older here" (spec 4, second bullet).** A fresh window (a `…_from` cursor) that finds no rows says so, with "Back to newest". It no longer claims the list is empty.
- **The keys-only probe (spec 4, first bullet).** `readKeyset`'s probe for the next cursor reads only the key columns, not the full row select with its embeds.

**How focus moves.**
- **The link.** `ShowMore` becomes a client component with a `focusId` prop: the DOM id of the row that will be first new. Link's `onNavigate` fires only for a client-side navigation (never for a modified click or a new tab), and from it `ShowMore` calls `requestShowMoreFocus(focusId)`.
- **The page.** Every page with a paged list renders one `<ShowMoreFocus />`. After each navigation (a change of `usePathname()` or `useSearchParams()`), it looks for the requested id and focuses it with `focus({ preventScroll: true })`, so it never scrolls.
- **Streamed lists.** The market page's bets and a member's activity stream in behind `<Suspense>`, so a row can render after the navigation commits. If the row isn't there yet, a `MutationObserver` watches for up to 10 seconds, then gives up.
- **Why not the URL.** The target lives in module state, not in a search param or a hash:
  - a reload or a shared link never refocuses a row, or jumps to it
  - `showMoreHref` and `newestHref` stay as they are
  - the ledger e2e spec's URL assertions are untouched
- **Why not inside `ShowMore`.** The last "Show more" of a list is gone from the page its own navigation renders, so the component that reads the target has to be a separate one.
- **Scrolling.** `scroll={false}` (an extend) is untouched. For a fresh window, the router scrolls to the top and focuses the page element in a layout effect; `ShowMoreFocus` runs after it, in a passive effect, so the row wins.

**Rows.**
- **The id.** `rowDomId(prefix, id)` makes a stable DOM id from the row's own id (the key's tiebreak column, unique within a list). Each list has its own prefix: `ledger`, `bet`, `market-closed`, `feed` and `activity`. Task 4 adds `member`, and Task 5 adds `market-open`.
- **The attributes.** `focusTarget(domId)` spreads `id`, `tabIndex={-1}` and `aria-labelledby={domId}` onto the row. A list item or an article has no accessible name of its own, and labelling it by itself names it from its content, so a screen reader announces the row that focus lands on.
- **The first new row.** `NextPage` gains `firstId`, the probe's first key's id. For an extend it's the row right after the last one shown; for a window it's the window's first row. Either way it's the first row the link shows. `showMoreHref` now takes only `kind` and `cursor`, so its callers and its tests are unchanged.

**The probe.** `readKeyset` takes an optional fifth argument, `fetchKeys(filter, limit): Promise<Cursor[]>`. Without it, the probe falls back to `fetchRows`, so every caller keeps compiling. Each of the four readers gets one small query builder that takes the select columns, and both the range read and the probe go through it, so the two can't drift apart on filters or order. The feed's probe skips the `!inner` actor embed: `activity_events` and `profiles` are both readable exactly when `is_invited()`, and `actor_id` is a not-null foreign key, so the embed never drops a row the probe would count.

**"Nothing older here."** `NothingOlder` is the existing `EmptyState` (icon `ListEnd`), titled "Nothing older here.", with `BackToNewest` as its action. Its title ends in a full stop, as every `EmptyState` title does. A list that's windowed and empty renders it in place of its empty state, and drops its separate "Back to newest" above the list, so the link isn't shown twice.

**Files:**
- Create:
  - `lib/pagination/row-id.ts`
  - `components/ui/show-more-focus.tsx`
  - `components/ui/nothing-older.tsx`
- Modify:
  - `lib/pagination/cursor.ts`, `lib/pagination/keyset.ts`, `components/ui/show-more.tsx`
  - the readers: `lib/ledger/list-transactions.ts`, `lib/markets/get-market.ts`, `lib/markets/list-markets.ts`, `lib/social/list-feed.ts`
  - the rows: `components/admin/ledger-row.tsx`, `components/markets/bet-list.tsx`, `components/markets/market-card.tsx`, `components/feed/feed-item.tsx`, `app/(app)/feed/feed-list.tsx`
  - the pages: `app/(app)/admin/ledger/page.tsx`, `app/(app)/markets/[id]/page.tsx` (`MarketBets` and the imports only), `app/(app)/markets/(list)/page.tsx`, `app/(app)/feed/page.tsx`, `app/(app)/members/[id]/page.tsx`
  - `AGENTS.md`: the "Long lists page" bullet
- Test, create:
  - `tests/lib/pagination/row-id.test.ts`
  - `tests/components/show-more-focus.test.tsx`
  - `tests/components/nothing-older.test.tsx`
  - `tests/lib/social/list-feed.test.ts`
- Test, modify:
  - `tests/lib/pagination/keyset.test.ts`, `tests/components/show-more.test.tsx`, `tests/lib/fake-supabase.ts` (gains `.is()`)
  - `tests/lib/ledger/list-transactions.test.ts`, `tests/lib/markets/market-bets.test.ts`, `tests/lib/markets/list-markets.test.ts`
  - `tests/components/admin-ledger.test.tsx`, `tests/components/bet-list.test.tsx`, `tests/components/feed-list.test.tsx`, `tests/components/market-card.test.tsx`

**Interfaces:**
- Consumes:
  - `readKeyset`, `rangeFilter`, `olderThanFilter` and `KeyColumns` (`lib/pagination/keyset.ts`); `encodeCursor`, `Cursor`, `NextPage`, `showMoreHref` and `newestHref` (`lib/pagination/cursor.ts`)
  - `EmptyState` (`components/ui/empty-state.tsx`) and `buttonVariants` (`components/ui/button.tsx`)
  - Next 16's `Link`, with `onNavigate` (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`: "Only executes during SPA navigation"), plus `usePathname` and `useSearchParams` from `next/navigation`
  - `tests/lib/fake-supabase.ts`. Its `.is()` is added here, for `listFeed`'s `hidden_at` filter.
- Produces, for Tasks 4 and 5:

```ts
// lib/pagination/cursor.ts
export type NextPage = { kind: 'extend' | 'window'; cursor: string; firstId: string }
export function showMoreHref(pathname: string, searchParams: SearchParams, param: string, next: Pick<NextPage, 'kind' | 'cursor'>): string

// lib/pagination/keyset.ts
export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
  fetchKeys?: (filter: string, limit: number) => Promise<Cursor[]>,
): Promise<KeysetPage<Row>>

// lib/pagination/row-id.ts
export function rowDomId(prefix: string, id: string | number): string
export function focusTarget(domId: string | undefined): { id; tabIndex: -1; 'aria-labelledby' } | {}

// components/ui/show-more.tsx ('use client')
export function ShowMore(props: { href: string; fresh?: boolean; focusId?: string }): JSX.Element
export function BackToNewest(props: { href: string }): JSX.Element // unchanged

// components/ui/show-more-focus.tsx ('use client')
export function requestShowMoreFocus(id: string): void
export function ShowMoreFocus(): null

// components/ui/nothing-older.tsx
export function NothingOlder(props: { href: string }): JSX.Element // "Nothing older here." + Back to newest

// Row components gain an optional id: LedgerRow and MarketCard take `domId`,
// BetList and FeedList take `rowIdPrefix`, and FeedList also takes `emptyState?: ReactNode`.
```

**Why `rowDomId` takes the row's id,** `rowDomId(prefix: string, id: string | number)`, not a `{ ts, id }` key:
- The id alone is unique within every list.
- The leaderboard's key (Task 4) has no timestamp.

- [ ] **Step 1: Write the failing pagination tests**

Create `tests/lib/pagination/row-id.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

describe('rowDomId', () => {
  it('prefixes a plain id as it is, whether a number or a string', () => {
    expect(rowDomId('ledger', 4242)).toBe('ledger-4242')
    expect(rowDomId('market-closed', '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f')).toBe(
      'market-closed-0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
    )
  })

  it('escapes every character outside letters, digits and hyphens', () => {
    expect(rowDomId('feed', 'win:12:ab')).toBe('feed-win_003a12_003aab')
    expect(rowDomId('feed', 'a b"c')).toBe('feed-a_0020b_0022c')
    expect(rowDomId('feed', 'task_1')).toBe('feed-task_005f1')
  })

  it('never maps two different ids to one DOM id', () => {
    const ids = ['bet:1', 'bet_1', 'bet-1', 'bet_003a1', 'bet:1:', 'é', 'éx']
    expect(new Set(ids.map((id) => rowDomId('feed', id))).size).toBe(ids.length)
  })
})

describe('focusTarget', () => {
  it('makes the row focusable by script only, and names it from its own content', () => {
    expect(focusTarget('ledger-7')).toEqual({ id: 'ledger-7', tabIndex: -1, 'aria-labelledby': 'ledger-7' })
  })

  it('adds nothing for a row with no id', () => {
    expect(focusTarget(undefined)).toEqual({})
    expect(focusTarget('')).toEqual({})
  })
})
```

In `tests/lib/pagination/keyset.test.ts`, `fakeTable` gains a keys-only reader beside `fetchRows`, and every `next` now carries `firstId`. Four edits.

First, inside `fakeTable`, replace:

```ts
  const calls: { filter: string | null; limit: number }[] = []
  async function fetchRows(filter: string | null, limit: number): Promise<Row[]> {
    calls.push({ filter, limit })
    return sorted.filter((row) => filter === null || splitTerms(filter).some((t) => matches(t, row))).slice(0, limit)
  }
  return { sorted, calls, fetchRows }
```

with:

```ts
  const calls: { filter: string | null; limit: number }[] = []
  const keyCalls: { filter: string; limit: number }[] = []
  const select = (filter: string | null, limit: number) =>
    sorted.filter((row) => filter === null || splitTerms(filter).some((t) => matches(t, row))).slice(0, limit)
  async function fetchRows(filter: string | null, limit: number): Promise<Row[]> {
    calls.push({ filter, limit })
    return select(filter, limit)
  }
  async function fetchKeys(filter: string, limit: number): Promise<Cursor[]> {
    keyCalls.push({ filter, limit })
    return select(filter, limit).map(keyOf)
  }
  return { sorted, calls, keyCalls, fetchRows, fetchKeys }
```

Second, in "reads the newest 50, and points Show more at the 50th row past them", replace:

```ts
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[99]))
    expect(table.calls).toEqual([
```

with:

```ts
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[99]))
    expect(page.next?.firstId).toBe(table.sorted[50].id)
    expect(table.calls).toEqual([
```

Third, at the end of "never skips rows when new ones arrive at the top and push the range past the cap", replace:

```ts
    expect(page.next).toEqual({ kind: 'window', cursor: encodeCursor(keyOf(table.sorted[500])) })
  })
```

with the updated assertion and three new tests:

```ts
    expect(page.next).toEqual({
      kind: 'window',
      cursor: encodeCursor(keyOf(table.sorted[500])),
      firstId: table.sorted[500].id,
    })
  })

  it('probes with fetchKeys when one is given, so the full row read runs once', async () => {
    const table = fakeTable(makeRows(120))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf, table.fetchKeys)

    expect(page.rows).toEqual(table.sorted.slice(0, 50))
    expect(page.next).toEqual({
      kind: 'extend',
      cursor: encodeCursor(keyOf(table.sorted[99])),
      firstId: table.sorted[50].id,
    })
    expect(table.calls).toEqual([{ filter: null, limit: 50 }])
    expect(table.keyCalls).toEqual([{ filter: olderThanFilter(COLS, keyOf(table.sorted[49])), limit: 50 }])
  })

  it('starts a fresh window from the keys probe too, at the first row past the cap', async () => {
    const table = fakeTable(makeRows(600))
    const page = await readKeyset({ top: null, bottom: keyOf(table.sorted[479]) }, COLS, table.fetchRows, keyOf, table.fetchKeys)

    expect(page.rows).toEqual(table.sorted.slice(0, 480))
    expect(page.next).toEqual({ kind: 'window', cursor: encodeCursor(keyOf(table.sorted[480])), firstId: table.sorted[480].id })
    expect(table.calls).toHaveLength(1)
    expect(table.keyCalls).toHaveLength(1)
  })

  it('skips the keys probe when the first page is short', async () => {
    const table = fakeTable(makeRows(30))
    await readKeyset(FIRST, COLS, table.fetchRows, keyOf, table.fetchKeys)
    expect(table.keyCalls).toHaveLength(0)
  })
```

Fourth, replace:

```ts
  it('treats a cursor whose id the column cannot hold as absent', async () => {
```

with:

```ts
  it('reads a fresh window that starts past the last row as empty and windowed, with no probe', async () => {
    const table = fakeTable(makeRows(120))
    const pastTheEnd: Cursor = { ts: '2026-09-25T00:00:00.000000+00:00', id: '000000' }
    const page = await readKeyset({ top: pastTheEnd, bottom: null }, COLS, table.fetchRows, keyOf, table.fetchKeys)
    expect(page).toEqual({ rows: [], next: null, windowed: true })
    expect(table.keyCalls).toHaveLength(0)
  })

  it('treats a cursor whose id the column cannot hold as absent', async () => {
```

Run: `npx vitest run tests/lib/pagination/keyset.test.ts tests/lib/pagination/row-id.test.ts`
Expected: FAIL.
- `row-id.test.ts` can't load, because `@/lib/pagination/row-id` doesn't exist yet.
- In `keyset.test.ts`, 4 of 15 fail, because no `next` carries `firstId` and `fetchKeys` is ignored:
  - "reads the newest 50, and points Show more at the 50th row past them"
  - "never skips rows when new ones arrive at the top and push the range past the cap"
  - "probes with fetchKeys when one is given, so the full row read runs once"
  - "starts a fresh window from the keys probe too, at the first row past the cap"
- The other two new tests pass already. With no probe to make, the old code reads the same way.

- [ ] **Step 2: Add `firstId`, the `fetchKeys` probe and `row-id.ts`**

In `lib/pagination/cursor.ts`, replace:

```ts
export type NextPage = { kind: 'extend' | 'window'; cursor: string }
```

with:

```ts
// firstId is the id of the first row the link will show, which "Show more" moves focus to.
export type NextPage = { kind: 'extend' | 'window'; cursor: string; firstId: string }
```

In the same file, replace:

```ts
export function showMoreHref(pathname: string, searchParams: SearchParams, param: string, next: NextPage): string {
```

with:

```ts
export function showMoreHref(
  pathname: string,
  searchParams: SearchParams,
  param: string,
  next: Pick<NextPage, 'kind' | 'cursor'>,
): string {
```

Replace `lib/pagination/keyset.ts` with:

```ts
import { PAGE_SIZE, WINDOW_CAP, encodeCursor, type Cursor, type NextPage, type PageParams } from '@/lib/pagination/cursor'

// isId guards the id's column type: Postgres rejects `id.lt."abc"` on a bigint column with an
// error, so a cursor whose id can't be that column's is dropped, like any other bad cursor.
export type KeyColumns = { ts: string; id: string; isId?: (id: string) => boolean }
export type KeysetPage<T> = { rows: T[]; next: NextPage | null; windowed: boolean }

const BIGINT_ID = /^\d{1,18}$/

export function isBigintId(id: string): boolean {
  return BIGINT_ID.test(id)
}

// Every leaf is a plain `<ts>.op."value"` term, plus a matching plain bound on <ts> alongside the
// (ts, id) tiebreak OR. A pure-OR filter with no such bound is known from EXPLAIN review to get
// only a Filter on the (ts desc, id desc) index, walking the whole table; the bounded form here is
// proven to get an Index Cond instead (tests/db/data-layer-indexes.test.ts). The bound is redundant
// with the OR itself — the `lt`/`eq` tiebreak implies `lte`, and the `gt`/`eq` tiebreak implies
// `gte` — but it's what gives Postgres something to seek by.
function atOrOlder(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.lte."${c.ts}",or(${cols.ts}.lt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.lte."${c.id}")))`
}

function atOrNewer(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.gte."${c.ts}",or(${cols.ts}.gt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.gte."${c.id}")))`
}

// Every value is quoted, and a validated cursor can't contain a quote (see decodeCursor).
export function rangeFilter(cols: KeyColumns, page: PageParams): string | null {
  const { top, bottom } = page
  if (top && bottom) return `and(${atOrNewer(cols, bottom)},${atOrOlder(cols, top)})`
  if (bottom) return atOrNewer(cols, bottom)
  if (top) return atOrOlder(cols, top)
  return null
}

export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.lte."${cursor.ts}",or(${cols.ts}.lt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.lt."${cursor.id}")))`
}

export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.gte."${cursor.ts}",or(${cols.ts}.gt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.gt."${cursor.id}")))`
}

// fetchKeys, when given, answers the probe below with only the key columns: the probe needs
// nothing else, and the full row select can carry embeds that cost a join per row. Without it
// the probe falls back to fetchRows.
export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
  fetchKeys?: (filter: string, limit: number) => Promise<Cursor[]>,
): Promise<KeysetPage<Row>> {
  const valid = (c: Cursor | null) => (c && (!cols.isId || cols.isId(c.id)) ? c : null)
  const page: PageParams = { top: valid(rawPage.top), bottom: valid(rawPage.bottom) }
  const windowed = page.top !== null

  const rows = await fetchRows(rangeFilter(cols, page), page.bottom ? WINDOW_CAP : PAGE_SIZE)
  if (rows.length === 0 || (page.bottom === null && rows.length < PAGE_SIZE)) return { rows, next: null, windowed }

  // "Show more" points at the 50th row past the last one shown, so the read needs those rows'
  // keys. Probing from the last row returned, not from the cursor, means rows that arrived at the
  // top and pushed the range past the cap are picked up here instead of skipped.
  const after = olderThanFilter(cols, keyOf(rows[rows.length - 1]))
  const probe = fetchKeys ? await fetchKeys(after, PAGE_SIZE) : (await fetchRows(after, PAGE_SIZE)).map(keyOf)
  if (probe.length === 0) return { rows, next: null, windowed }
  const firstId = probe[0].id
  if (rows.length + probe.length > WINDOW_CAP) {
    return { rows, next: { kind: 'window', cursor: encodeCursor(probe[0]), firstId }, windowed }
  }
  return { rows, next: { kind: 'extend', cursor: encodeCursor(probe[probe.length - 1]), firstId }, windowed }
}
```

Create `lib/pagination/row-id.ts`:

```ts
// A row's DOM id, from its list's prefix and the row's own id (the key's tiebreak column, unique
// within a list). Anything outside [A-Za-z0-9-] is escaped as _ and four hex digits, so a feed id
// like `win:12:<uuid>` stays a plain token and two different ids can never share a DOM id.
export function rowDomId(prefix: string, id: string | number): string {
  const safe = String(id).replace(/[^A-Za-z0-9-]/g, (c) => `_${c.charCodeAt(0).toString(16).padStart(4, '0')}`)
  return `${prefix}-${safe}`
}

// The attributes of a row "Show more" can move focus to. tabIndex -1 makes it focusable by script
// only, never a tab stop. A list item or an article has no accessible name of its own, so the row
// is labelled by itself, which names it from its content, and a screen reader announces the row
// that focus lands on.
export function focusTarget(domId: string | undefined) {
  return domId ? ({ id: domId, tabIndex: -1, 'aria-labelledby': domId } as const) : {}
}
```

Run: `npx vitest run tests/lib/pagination`
Expected: PASS, 66 tests in 4 files: `cursor.test.ts` 42, `keyset.test.ts` 15, `chunk.test.ts` 4 and `row-id.test.ts` 5.

- [ ] **Step 3: Write the failing "Show more" tests**

Replace `tests/components/show-more.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

const { requestShowMoreFocus } = vi.hoisted(() => ({ requestShowMoreFocus: vi.fn() }))
vi.mock('@/components/ui/show-more-focus', () => ({ requestShowMoreFocus }))

// Vitest resolves next/link to the Pages Router Link, which drops scroll and replace before the
// DOM, so they are written onto the anchor for these assertions. A plain click runs onNavigate,
// as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      data-replace={String(replace ?? false)}
      data-on-navigate={String(Boolean(onNavigate))}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import { BackToNewest, ShowMore } from '@/components/ui/show-more'

beforeEach(() => {
  requestShowMoreFocus.mockReset()
})

describe('ShowMore', () => {
  it('is a real link to the next range, styled as a 44px secondary button with no underline', () => {
    render(<ShowMore href="/admin/ledger?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/admin/ledger?before=abc')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'border-line-s', 'bg-surface', 'self-start')
  })

  it('keeps the scroll position and replaces the history entry, by default', () => {
    render(<ShowMore href="/feed?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'false')
    expect(link).toHaveAttribute('data-replace', 'true')
  })

  it('scrolls to the top like a normal navigation when it starts a fresh window', () => {
    render(<ShowMore href="/admin/ledger?before_from=abc" fresh />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'true')
    expect(link).toHaveAttribute('data-replace', 'true')
  })

  it('asks for focus on the first new row when its navigation starts, and keeps the href to the range alone', () => {
    render(<ShowMore href="/feed?before=abc" focusId="feed-bet_003a7" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/feed?before=abc')
    expect(requestShowMoreFocus).not.toHaveBeenCalled()

    fireEvent.click(link)
    expect(requestShowMoreFocus).toHaveBeenCalledExactlyOnceWith('feed-bet_003a7')
  })

  it('asks for nothing without a focus target', () => {
    render(<ShowMore href="/feed?before=abc" />)
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('data-on-navigate', 'false')
  })
})

describe('BackToNewest', () => {
  it('links back to the newest rows with the same button styling', () => {
    render(<BackToNewest href="/markets" />)
    const link = screen.getByRole('link', { name: 'Back to newest' })
    expect(link).toHaveAttribute('href', '/markets')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'self-start')
  })

  it('scrolls to the top as a normal navigation does, and replaces the history entry', () => {
    render(<BackToNewest href="/markets" />)
    const link = screen.getByRole('link', { name: 'Back to newest' })
    expect(link).toHaveAttribute('data-scroll', 'true')
    expect(link).toHaveAttribute('data-replace', 'true')
  })
})
```

Create `tests/components/show-more-focus.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'

const nav = vi.hoisted(() => ({ search: '' }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/ledger',
  useSearchParams: () => new URLSearchParams(nav.search),
}))

// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation. The
// tests then play the router's part: change the URL and render the page it returns.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll: _scroll,
    replace: _replace,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; onNavigate?: () => void }) => (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import { ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'

function Ledger({ rows, next }: { rows: number[]; next?: number }) {
  return (
    <>
      <ShowMoreFocus />
      <ul>
        {rows.map((n) => (
          <li key={n} id={`row-${n}`} tabIndex={-1}>
            Row {n}
          </li>
        ))}
      </ul>
      {next !== undefined && <ShowMore href={`/admin/ledger?before=${next}`} focusId={`row-${next}`} />}
    </>
  )
}

afterEach(() => {
  nav.search = ''
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('ShowMoreFocus', () => {
  it('moves focus to the first new row once the extended list renders, without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)

    expect(document.activeElement).toBe(document.getElementById('row-3'))
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
  })

  it('waits for a row that renders after the navigation commits, as a streamed list does', async () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)

    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[]} />)
    expect(document.activeElement).toBe(document.body)

    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    await waitFor(() => expect(document.activeElement).toBe(document.getElementById('row-3')))
  })

  it('moves focus only once, not again on a later navigation that renders the same row', async () => {
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)
    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.getElementById('row-3'))

    act(() => document.getElementById('row-1')!.focus())
    nav.search = 'before=3&tab=x'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.getElementById('row-1'))
  })

  it('leaves focus alone on a navigation no Show more started', () => {
    const { rerender } = render(<Ledger rows={[1, 2]} />)
    nav.search = 'before=3'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    expect(document.activeElement).toBe(document.body)
  })

  it('gives up on a row that hasn’t rendered within ten seconds', () => {
    vi.useFakeTimers()
    const { rerender } = render(<Ledger rows={[1, 2]} next={3} />)
    fireEvent.click(screen.getByRole('link', { name: 'Show more' }))
    nav.search = 'before=3'
    rerender(<Ledger rows={[]} />)

    act(() => vi.advanceTimersByTime(10_001))
    rerender(<Ledger rows={[1, 2, 3, 4]} />)
    nav.search = 'before=3&tab=x'
    rerender(<Ledger rows={[1, 2, 3, 4]} />)

    expect(document.activeElement).toBe(document.body)
  })
})
```

Create `tests/components/nothing-older.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

vi.mock('next/link', () => ({
  default: ({ href, scroll, replace, ...props }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean }) => (
    <a href={href} data-scroll={String(scroll ?? true)} data-replace={String(replace ?? false)} {...props} />
  ),
}))

import { NothingOlder } from '@/components/ui/nothing-older'

describe('NothingOlder', () => {
  it('says there is nothing older, with a way back to the newest rows', () => {
    render(<NothingOlder href="/admin/ledger" />)
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    const back = screen.getByRole('link', { name: 'Back to newest' })
    expect(back).toHaveAttribute('href', '/admin/ledger')
    expect(back).toHaveAttribute('data-replace', 'true')
    expect(back).toHaveClass('min-h-11', 'no-underline')
  })

})
```

Run: `npx vitest run tests/components/show-more.test.tsx tests/components/show-more-focus.test.tsx tests/components/nothing-older.test.tsx`
Expected: FAIL.
- `show-more-focus.test.tsx` and `nothing-older.test.tsx` can't load, because neither module exists yet.
- In `show-more.test.tsx`, "asks for focus on the first new row when its navigation starts, and keeps the href to the range alone" fails: `requestShowMoreFocus` is never called. The other 6 pass.

- [ ] **Step 4: Add `ShowMoreFocus`, `NothingOlder` and `ShowMore`'s `focusId`**

Create `components/ui/show-more-focus.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

// A streamed list (the market page's bets, a member's activity) can render well after the
// navigation itself commits, so the target is watched for this long before it's given up.
const WAIT_MS = 10_000

let pending: { id: string; until: number } | null = null

// Called from Link's onNavigate, which fires only for a client-side navigation, so a "Show more"
// opened in a new tab never leaves a target behind in this one.
export function requestShowMoreFocus(id: string): void {
  pending = { id, until: Date.now() + WAIT_MS }
}

// True once there's nothing left to wait for: the target was focused, it expired, or none was set.
function focusPending(): boolean {
  if (!pending) return true
  if (Date.now() > pending.until) {
    pending = null
    return true
  }
  const target = document.getElementById(pending.id)
  if (!target) return false
  pending = null
  // With scroll={false} the new rows render where "Show more" was, already in view; a fresh
  // window has just been scrolled to the top by the router. Either way focusing must not scroll.
  target.focus({ preventScroll: true })
  return true
}

// Rendered once on every page with a "Show more". The target is held in this module rather than
// the URL, so a reload or a shared link never refocuses a row, and the link's href stays the
// list's position alone. It's read here, not in ShowMore, because the last "Show more" of a list
// is gone from the page its own navigation renders.
export function ShowMoreFocus() {
  const pathname = usePathname()
  const search = useSearchParams().toString()

  useEffect(() => {
    if (focusPending()) return
    const observer = new MutationObserver(() => {
      if (focusPending()) observer.disconnect()
    })
    observer.observe(document.body, { childList: true, subtree: true })
    const timer = window.setTimeout(() => observer.disconnect(), WAIT_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [pathname, search])

  return null
}
```

Replace `components/ui/show-more.tsx` with:

```tsx
'use client'

import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { requestShowMoreFocus } from '@/components/ui/show-more-focus'
import { cn } from '@/lib/utils'

const linkClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')

// Both links replace the history entry: the list's position lives in the URL, so a reload or a
// shared link lands on it, but each "Show more" is not a page of its own. A pushed entry would make
// Back step through every expansion, and a back-swipe on a drill-down page would slide the page
// away only to land on the same pathname (components/nav/back-swipe.tsx).
//
// `fresh` marks a "Show more" that starts a brand-new window (next.kind === 'window') rather than
// extending the current range: the rows on screen are swapped for an unrelated 50-row slice, so
// keeping the old scroll position (the default, scroll={false}) would strand the admin at the
// bottom of the new window, past its start and past "Back to newest". A fresh window scrolls like
// a normal navigation instead.
//
// `focusId` is the DOM id of the first row the link will show (rowDomId of next.firstId). The
// link itself leaves the page or moves, so focus would otherwise fall back to the document; the
// page's ShowMoreFocus moves it to that row once it renders.
export function ShowMore({ href, fresh = false, focusId }: { href: string; fresh?: boolean; focusId?: string }) {
  return (
    <Link
      href={href}
      scroll={fresh}
      replace
      className={linkClass}
      onNavigate={focusId ? () => requestShowMoreFocus(focusId) : undefined}
    >
      Show more
    </Link>
  )
}

export function BackToNewest({ href }: { href: string }) {
  return (
    <Link href={href} replace className={linkClass}>
      Back to newest
    </Link>
  )
}
```

Create `components/ui/nothing-older.tsx`:

```tsx
import { ListEnd } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { BackToNewest } from '@/components/ui/show-more'

// A fresh window (a `…_from` cursor) that finds no rows: the list isn't empty, it just has nothing
// past that point any more, so it says so instead of showing the list's own empty state.
export function NothingOlder({ href }: { href: string }) {
  return <EmptyState icon={ListEnd} title="Nothing older here." action={<BackToNewest href={href} />} />
}
```

Run: `npx vitest run tests/components/show-more.test.tsx tests/components/show-more-focus.test.tsx tests/components/nothing-older.test.tsx`
Expected: PASS, 13 tests (7 + 5 + 1).

- [ ] **Step 5: Write the failing reader tests**

Replace `tests/lib/fake-supabase.ts` with the version below. It gains `is` beside `eq`, which `listFeed` needs for its `hidden_at` filter:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for the query builder: it records each query's chain, and answers it when awaited.
export type RecordedQuery = {
  table: string
  select?: string
  selectOptions?: unknown
  eq: [string, unknown][]
  is: [string, unknown][]
  in: [string, unknown[]][]
  or: string[]
  order: [string, unknown][]
  limit?: number
}

export type FakeResponse = { data?: unknown; count?: number | null; error?: unknown }

export function fakeSupabase(respond: (query: RecordedQuery, index: number) => FakeResponse) {
  const queries: RecordedQuery[] = []
  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, eq: [], is: [], in: [], or: [], order: [] }
      const index = queries.push(query) - 1
      const builder = {
        select(columns: string, options?: unknown) {
          query.select = columns
          query.selectOptions = options
          return builder
        },
        eq(column: string, value: unknown) {
          query.eq.push([column, value])
          return builder
        },
        is(column: string, value: unknown) {
          query.is.push([column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          query.in.push([column, values])
          return builder
        },
        or(filter: string) {
          query.or.push(filter)
          return builder
        },
        order(column: string, options?: unknown) {
          query.order.push([column, options])
          return builder
        },
        limit(count: number) {
          query.limit = count
          return builder
        },
        then<T>(onFulfilled: (value: FakeResponse) => T, onRejected?: (reason: unknown) => T) {
          return Promise.resolve()
            .then(() => ({ data: null, count: null, error: null, ...respond(query, index) }))
            .then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, queries }
}
```

Create `tests/lib/social/list-feed.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { listFeed } from '@/lib/social/list-feed'
import { fakeSupabase } from '../fake-supabase'

function eventRow(n: number) {
  return {
    id: `bet:${n}`,
    kind: 'bet_placed',
    occurred_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    actor_id: 'p-alice',
    market_id: 'm1',
    amount: 5,
    actor: { display_name: 'Alice' },
    market: { title: 'Will it rain?' },
    outcome: { label: 'Yes' },
    task_completion: null,
    parlay: null,
  }
}

describe('listFeed', () => {
  it('probes only the keys of the next 50 events, with the same filters and order as the range read', async () => {
    const shown = Array.from({ length: 50 }, (_, i) => eventRow(200 - i))
    const probed = Array.from({ length: 50 }, (_, i) => eventRow(150 - i))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await listFeed(client, { actorId: 'p-alice', page: { top: null, bottom: null } })

    const [read, probe] = queries
    expect(read.select).toContain('actor:profiles!inner(display_name)')
    expect(probe.select).toBe('id, occurred_at')
    expect(probe.is).toEqual([['hidden_at', null]])
    expect(probe.eq).toEqual([['actor_id', 'p-alice']])
    expect(probe.order).toEqual(read.order)
    expect(probe.limit).toBe(50)
    expect(page.rows[0]).toMatchObject({ id: 'bet:200', actorName: 'Alice', marketTitle: 'Will it rain?' })
    expect(page.next).toMatchObject({ kind: 'extend', firstId: 'bet:150' })
  })
})
```

In `tests/lib/ledger/list-transactions.test.ts`, replace:

```ts
  it('reads 50 rows newest first, then probes 50 older ones for the Show more cursor', async () => {
```

with:

```ts
  it('reads 50 rows newest first, then probes the keys of 50 older ones for the Show more cursor', async () => {
```

In the same test, replace:

```ts
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.limit).toBe(50)
    expect(probe.or).toHaveLength(1)
    expect(page.rows.map((e) => e.id)).toEqual(shown)
    expect(page.rows[0]).toMatchObject({ memberName: 'Mia', context: 'Bet on Name of o200 in Name of m200' })
    expect(page.next).toEqual({ kind: 'extend', cursor: encodeCursor({ ts: ledgerRow(101).created_at, id: '101' }) })
```

with:

```ts
    expect(read.select).toBe('id, profile_id, amount, type, meta, created_at, profiles(display_name)')
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.select).toBe('id, created_at')
    expect(probe.order).toEqual(read.order)
    expect(probe.limit).toBe(50)
    expect(probe.or).toHaveLength(1)
    expect(page.rows.map((e) => e.id)).toEqual(shown)
    expect(page.rows[0]).toMatchObject({ memberName: 'Mia', context: 'Bet on Name of o200 in Name of m200' })
    expect(page.next).toEqual({
      kind: 'extend',
      cursor: encodeCursor({ ts: ledgerRow(101).created_at, id: '101' }),
      firstId: '150',
    })
```

In `tests/lib/markets/market-bets.test.ts`, replace:

```ts
    expect(queries.map((q) => [q.table, q.eq, q.limit])).toEqual([
      ['bets', [['market_id', 'm1']], 50],
      ['bets', [['market_id', 'm1']], 50],
    ])
```

with:

```ts
    expect(queries.map((q) => [q.table, q.select, q.eq, q.limit])).toEqual([
      ['bets', 'id, outcome_id, amount, created_at, profile_id, profiles(display_name)', [['market_id', 'm1']], 50],
      ['bets', 'id, created_at', [['market_id', 'm1']], 50],
    ])
    expect(queries[1].order).toEqual(queries[0].order)
```

In the same test, replace:

```ts
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: betRow(101).created_at, id: '101' })
```

with:

```ts
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: betRow(101).created_at, id: '101' })
    expect(page.next?.firstId).toBe('150')
```

In `tests/lib/markets/list-markets.test.ts`, inside `describe('listClosedMarkets')`, replace:

```ts
  it('ignores a cursor whose id is not a market id', async () => {
```

with:

```ts
  it('probes only the keys of the next closed markets, with the same filter and order, and no embeds', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      marketRow({ id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(1000 - i).padStart(12, '0')}` }),
    )
    const probed = [marketRow({ id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001', created_at: '2026-09-18T09:00:00+00:00' })]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? rows : probed }))

    const page = await listClosedMarkets(client, { top: null, bottom: null })

    const [read, probe] = queries
    expect(read.select).toContain(RESOLUTION_EMBED)
    expect(probe.select).toBe('id, created_at')
    expect(probe.in).toEqual(read.in)
    expect(probe.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.order).toEqual([
      ...probe.order,
      ['created_at', { referencedTable: 'market_outcomes' }],
      ['label', { referencedTable: 'market_outcomes' }],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
  })

  it('ignores a cursor whose id is not a market id', async () => {
```

That adds one test just before the existing cursor test.

Run: `npx vitest run tests/lib/ledger/list-transactions.test.ts tests/lib/markets/market-bets.test.ts tests/lib/markets/list-markets.test.ts tests/lib/social/list-feed.test.ts`
Expected: FAIL, 4 of 13. Each reader's probe still selects the full row, and the ledger's `next` has no `firstId`:
- "reads 50 rows newest first, then probes the keys of 50 older ones for the Show more cursor"
- "reads the market's newest 50 bets, and points Show more at the 50th one past them"
- "probes only the keys of the next closed markets, with the same filter and order, and no embeds"
- "probes only the keys of the next 50 events, with the same filters and order as the range read"

- [ ] **Step 6: Probe keys only in the four readers**

In `lib/ledger/list-transactions.ts`, replace:

```ts
import type { PageParams } from '@/lib/pagination/cursor'
```

with:

```ts
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
```

In the same file, replace everything from `const LEDGER_KEYS` to the end of the file with:

```ts
const LEDGER_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
const LEDGER_COLUMNS = 'id, profile_id, amount, type, meta, created_at, profiles(display_name)'

type LedgerRow = {
  id: number
  profile_id: string
  amount: number
  type: string
  meta: EntryMeta | null
  created_at: string
  profiles: { display_name: string } | null
}

const ledgerKey = (t: { id: number; created_at: string }): Cursor => ({ ts: t.created_at, id: String(t.id) })

// The range read and its key probe share one builder, so the two can't drift apart on order.
function ledgerQuery(supabase: SupabaseClient, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('coin_transactions').select(columns)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function listAllTransactions(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<LedgerEntry>> {
  const result = await readKeyset(
    page,
    LEDGER_KEYS,
    async (filter, limit) => {
      const { data, error } = await ledgerQuery(supabase, LEDGER_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as LedgerRow[]
    },
    ledgerKey,
    async (filter, limit) => {
      const { data, error } = await ledgerQuery(supabase, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(ledgerKey)
    },
  )

  const rows = result.rows
  const metas = rows.map((t) => t.meta ?? {})

  const marketIds = [...new Set(metas.map((m) => m.market_id).filter((v): v is string => Boolean(v)))]
  const outcomeIds = [...new Set(metas.map((m) => m.outcome_id).filter((v): v is string => Boolean(v)))]
  const taskIds = [...new Set(metas.map((m) => m.task_id).filter((v): v is string => Boolean(v)))]

  const [markets, outcomes, tasks] = await Promise.all([
    fetchMarketTitles(supabase, marketIds),
    fetchOutcomeLabels(supabase, outcomeIds),
    fetchTaskTitles(supabase, taskIds),
  ])
  const lookups: Lookups = { markets, outcomes, tasks }

  return {
    ...result,
    rows: rows.map((t, index) => ({
      id: t.id,
      profileId: t.profile_id,
      memberName: t.profiles?.display_name ?? 'Unknown member',
      amount: t.amount,
      type: TYPE_LABELS[t.type] ?? t.type,
      context: buildContext(t.type, metas[index], lookups),
      createdAt: t.created_at,
    })),
  }
}
```

In `lib/markets/get-market.ts`, make the same import change (`import type { Cursor, PageParams } from '@/lib/pagination/cursor'`). Then replace everything from `const BET_KEYS` to the end of the file with:

```ts
const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }
const BET_COLUMNS = 'id, outcome_id, amount, created_at, profile_id, profiles(display_name)'

type BetRow = {
  id: number
  outcome_id: string
  amount: number
  created_at: string
  profile_id: string
  profiles: { display_name: string } | null
}

const betKey = (b: { id: number; created_at: string }): Cursor => ({ ts: b.created_at, id: String(b.id) })

// The range read and its key probe share one builder, so the two can't drift apart on filters.
function betsQuery(supabase: SupabaseClient, marketId: string, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('bets').select(columns).eq('market_id', marketId)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

export async function getMarketBets(supabase: SupabaseClient, marketId: string, page: PageParams): Promise<KeysetPage<MarketBet>> {
  const result = await readKeyset(
    page,
    BET_KEYS,
    async (filter, limit) => {
      const { data, error } = await betsQuery(supabase, marketId, BET_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as BetRow[]
    },
    betKey,
    async (filter, limit) => {
      const { data, error } = await betsQuery(supabase, marketId, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: number; created_at: string }[]).map(betKey)
    },
  )

  return {
    ...result,
    rows: result.rows.map((b) => ({
      id: b.id,
      outcomeId: b.outcome_id,
      amount: b.amount,
      createdAt: b.created_at,
      profileId: b.profile_id,
      bettorName: b.profiles?.display_name ?? 'Unknown member',
    })),
  }
}
```

In `lib/markets/list-markets.ts`, make the same import change. Then replace everything from `const MARKET_KEYS` up to, but not including, `export async function countOpenMarkets` with:

```ts
const MARKET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isUuid }

const marketKey = (m: { id: string; created_at: string }): Cursor => ({ ts: m.created_at, id: m.id })

// The range read and its key probe share one builder, so the two can't drift apart on filters.
function closedQuery(supabase: SupabaseClient, columns: string, filter: string | null, limit: number) {
  let query = supabase.from('markets').select(columns).in('status', ['resolved', 'voided'])
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  const result = await readKeyset(
    page,
    MARKET_KEYS,
    async (filter, limit) => {
      const { data, error } = await closedQuery(supabase, SUMMARY_SELECT, filter, limit)
        .order('created_at', { referencedTable: 'market_outcomes' })
        .order('label', { referencedTable: 'market_outcomes' })
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    marketKey,
    async (filter, limit) => {
      const { data, error } = await closedQuery(supabase, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: string; created_at: string }[]).map(marketKey)
    },
  )
  return { ...result, rows: result.rows.map(toSummary) }
}
```

Replace `lib/social/list-feed.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'
import { readKeyset, type KeysetPage } from '@/lib/pagination/keyset'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'

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
// through, so no `!fkey` disambiguation is needed. actor_id is not null, but the actor embed is
// still `!inner`, matching activity_feed's plain join on profiles: a row whose actor a viewer
// can't see (RLS) is dropped, the same as the view never having a row to join in the first place,
// instead of surfacing with an empty actorName. parlay_legs is capped at 6 rows per parlay
// (MAX_PICKS, lib/parlays/odds.ts), so this never grows with the size of the table.
const FEED_COLUMNS =
  'id, kind, occurred_at, actor_id, market_id, amount, ' +
  'actor:profiles!inner(display_name), market:markets(title), outcome:market_outcomes(label), ' +
  'task_completion:task_completions(task:tasks(title)), parlay:parlays(parlay_legs(id))'
const FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

const feedKey = (r: { id: string; occurred_at: string }): Cursor => ({ ts: r.occurred_at, id: r.id })

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
  // The range read and its key probe share one builder, so the two can't drift apart on filters.
  const feedQuery = (columns: string, filter: string | null, limit: number) => {
    let query = supabase
      .from('activity_events')
      .select(columns)
      .is('hidden_at', null)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)
    return query
  }

  const { rows, next, windowed } = await readKeyset<FeedRow>(
    opts.page,
    FEED_KEY_COLUMNS,
    async (filter, limit) => {
      const { data, error } = await feedQuery(FEED_COLUMNS, filter, limit)
      if (error) throw error
      return (data ?? []) as unknown as FeedRow[]
    },
    feedKey,
    // No actor embed here: activity_events and profiles are both readable exactly when
    // is_invited(), and actor_id is a not-null foreign key, so the `!inner` join above never
    // drops a row this probe counts.
    async (filter, limit) => {
      const { data, error } = await feedQuery('id, occurred_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: string; occurred_at: string }[]).map(feedKey)
    },
  )

  return { rows: rows.map(toFeedEvent), next, windowed }
}
```

Run: `npx vitest run tests/lib/ledger/list-transactions.test.ts tests/lib/markets/market-bets.test.ts tests/lib/markets/list-markets.test.ts tests/lib/social/list-feed.test.ts`
Expected: PASS, 13 tests (4 + 2 + 6 + 1).

- [ ] **Step 7: Write the failing row tests**

Each block below goes at the end of its file's `describe`, just before the file's final `})`.

In `tests/components/admin-ledger.test.tsx`:

```tsx
  it('is a focus target named from its own line when given a DOM id', () => {
    render(
      <ul>
        <LedgerRow
          entry={{
            id: 7,
            profileId: 'p-mia',
            memberName: 'Mia',
            amount: 10,
            type: 'Task reward',
            context: 'Task approved: Read Genesis 1-3',
            createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
          }}
          domId="ledger-7"
        />
      </ul>,
    )
    const row = screen.getByRole('listitem', { name: /^Mia: \+10 DC — Task approved: Read Genesis 1-3/ })
    expect(row).toHaveAttribute('id', 'ledger-7')
    expect(row).toHaveAttribute('tabindex', '-1')
  })
```

In `tests/components/bet-list.test.tsx`:

```tsx
  it('gives each bet a focus target named from its sentence, when the list has a row id prefix', () => {
    render(<BetList bets={bets} outcomes={outcomes} viewerId="p-alice" canBet rowIdPrefix="bet" />)
    const row = screen.getByRole('listitem', { name: 'Bob — 15 DC on No' })
    expect(row).toHaveAttribute('id', 'bet-2')
    expect(row).toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('listitem', { name: /^Alice — 5 DC on Yes/ })).toHaveAttribute('id', 'bet-1')
  })
```

In `tests/components/feed-list.test.tsx`:

```tsx
  it('gives each event a focus target named from its content, from the row id prefix', () => {
    render(<FeedList events={[{ ...event, id: 'bet:9' }]} heading="Events" headingId="feed-events" headingHidden rowIdPrefix="feed" />)
    // jsdom's name computation drops the spaces between inline elements that a browser keeps.
    const row = screen.getByRole('listitem', { name: /Social layer market/ })
    expect(row).toHaveAttribute('id', 'feed-bet_003a9')
    expect(row).toHaveAttribute('tabindex', '-1')
  })

  it('shows the given empty state instead of its own when there are no events', () => {
    render(
      <FeedList
        events={[]}
        heading="Recent activity"
        headingId="recent-activity"
        emptyState={<p>Nothing older here.</p>}
      />,
    )
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing yet.')).toBeNull()
  })
```

In `tests/components/market-card.test.tsx`:

```tsx
  it('becomes a focus target named from its content when given a DOM id', () => {
    render(
      <MarketCard
        id="m7"
        title="Will the choir sing?"
        status="resolved"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt="2026-10-05T16:30:00.000Z"
        outcomes={[
          { id: 'a', label: 'Yes', pct: 70 },
          { id: 'b', label: 'No', pct: 30 },
        ]}
        resolvedOutcomeLabel="Yes"
        domId="market-closed-m7"
      />,
    )
    const card = screen.getByRole('article', { name: /Will the choir sing\?/ })
    expect(card).toHaveAttribute('id', 'market-closed-m7')
    expect(card).toHaveAttribute('tabindex', '-1')
  })

  it('is not focusable without a DOM id', () => {
    render(
      <MarketCard
        id="m8"
        title="Will the choir sing?"
        status="open"
        kind="binary"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByRole('article')).not.toHaveAttribute('tabindex')
    expect(screen.getByRole('article')).not.toHaveAttribute('id')
  })
```

Run: `npx vitest run tests/components/admin-ledger.test.tsx tests/components/bet-list.test.tsx tests/components/feed-list.test.tsx tests/components/market-card.test.tsx`
Expected: FAIL, 5 of 34. No row takes an id yet, and `FeedList` has no `emptyState`. The one that passes already is "is not focusable without a DOM id".

- [ ] **Step 8: Give the rows their ids, and wire every paged list**

Replace `components/admin/ledger-row.tsx` with:

```tsx
import Link from 'next/link'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { ageLabel, isOldEntry } from '@/lib/social/relative-time'
import { LocalTime } from '@/components/ui/local-time'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

export function LedgerRow({ entry, domId }: { entry: LedgerEntry; domId?: string }) {
  const sign = entry.amount > 0 ? '+' : entry.amount < 0 ? '−' : ''
  const amountClass = entry.amount > 0 ? 'text-win' : entry.amount < 0 ? 'text-loss' : 'text-ink2'

  return (
    <li {...focusTarget(domId)} className="flex items-start gap-3 py-3.5">
      <p className="min-w-0 grow">
        <Link href={`/members/${entry.profileId}`} transitionTypes={['nav-forward']}>{entry.memberName}</Link>:{' '}
        <span className={cn('font-extrabold tabular-nums', amountClass)}>
          {sign}
          {Math.abs(entry.amount)} DC
        </span>{' '}
        — {entry.context}
      </p>
      <span className="whitespace-nowrap pt-0.5 text-sm text-ink2">
        {isOldEntry(entry.createdAt) ? <LocalTime iso={entry.createdAt} format="day" /> : ageLabel(entry.createdAt)}
      </span>
    </li>
  )
}
```

Replace `components/feed/feed-item.tsx` with:

```tsx
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { Segment } from '@/lib/social/describe-event'
import { focusTarget } from '@/lib/pagination/row-id'

export function FeedItem({
  icon: Icon,
  segments,
  age,
  domId,
}: {
  icon: LucideIcon
  segments: Segment[]
  age: string
  domId?: string
}) {
  return (
    <li {...focusTarget(domId)} className="flex items-start gap-3 py-3.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-sunk text-ink">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <p className="grow pt-[5px] text-base">
        {segments.map((segment, i) =>
          typeof segment === 'string' ? (
            <span key={i}>{segment}</span>
          ) : (
            <Link key={i} href={segment.href} transitionTypes={['nav-forward']}>
              {segment.text}
            </Link>
          ),
        )}
      </p>
      <span className="shrink-0 pt-[7px] text-sm whitespace-nowrap text-ink2">{age}</span>
    </li>
  )
}
```

Replace `components/markets/bet-list.tsx` with:

```tsx
import Link from 'next/link'
import { CircleDot } from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'
import { EmptyState } from '@/components/ui/empty-state'
import type { MarketBet } from '@/lib/markets/get-market'
import { focusTarget, rowDomId } from '@/lib/pagination/row-id'

export function BetList({
  bets,
  outcomes,
  viewerId,
  canBet,
  rowIdPrefix,
}: {
  bets: MarketBet[]
  outcomes: { id: string; label: string }[]
  viewerId: string
  canBet: boolean
  rowIdPrefix?: string
}) {
  if (bets.length === 0) {
    return canBet ? (
      <EmptyState icon={CircleDot} title="No bets yet.">
        Be the first to back an outcome.
      </EmptyState>
    ) : (
      <EmptyState icon={CircleDot} title="No bets yet." />
    )
  }

  return (
    <ul className="flex flex-col divide-y divide-line">
      {bets.map((b) => (
        <li
          key={b.id}
          {...focusTarget(rowIdPrefix && rowDomId(rowIdPrefix, b.id))}
          className="flex min-h-[52px] items-center gap-3 py-3"
        >
          <Avatar name={b.bettorName} size="sm" />
          <p className="min-w-0">
            <Link href={`/members/${b.profileId}`} transitionTypes={['nav-forward']}>{b.bettorName}</Link> — {b.amount} DC on{' '}
            {outcomes.find((o) => o.id === b.outcomeId)?.label ?? 'unknown outcome'}
            {b.profileId === viewerId && <span className="text-ink2"> (you)</span>}
          </p>
        </li>
      ))}
    </ul>
  )
}
```

In `components/markets/market-card.tsx`, four edits. First, replace:

```tsx
import { chartClosedAt, type MarketCardStatus } from '@/lib/markets/market-status'
```

with:

```tsx
import { chartClosedAt, type MarketCardStatus } from '@/lib/markets/market-status'
import { focusTarget } from '@/lib/pagination/row-id'
```

Second, replace:

```tsx
  chart?: MarketCardChart
}
```

with:

```tsx
  chart?: MarketCardChart
  domId?: string
}
```

Third, replace:

```tsx
  chart,
}: MarketCardProps) {
```

with:

```tsx
  chart,
  domId,
}: MarketCardProps) {
```

Fourth, replace:

```tsx
    <article className={cn(cardClass, 'flex flex-col gap-3 p-[18px]')}>
```

with:

```tsx
    <article {...focusTarget(domId)} className={cn(cardClass, 'flex flex-col gap-3 p-[18px]')}>
```

Replace `app/(app)/feed/feed-list.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { BookOpen, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedItem } from '@/components/feed/feed-item'
import { rowDomId } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

const EVENT_ICONS: Record<FeedKind, LucideIcon> = {
  bet_placed: Target,
  parlay_placed: Layers,
  market_created: Plus,
  market_resolved: Flag,
  bet_won: Trophy,
  parlay_won: Trophy,
  task_completed: BookOpen,
}

export function FeedList({
  events,
  heading,
  headingId,
  headingHidden,
  aboveList,
  belowList,
  emptyState,
  rowIdPrefix,
}: {
  events: FeedEvent[]
  heading: string
  headingId: string
  headingHidden?: boolean
  aboveList?: ReactNode
  belowList?: ReactNode
  emptyState?: ReactNode
  rowIdPrefix?: string
}) {
  const body =
    events.length === 0 ? (
      emptyState ?? <EmptyState icon={MessageSquareText} title="Nothing yet." />
    ) : (
      <ul className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {events.map((e) => (
          <FeedItem
            key={e.id}
            icon={EVENT_ICONS[e.kind]}
            segments={describeEvent(e)}
            age={ageLabel(e.occurredAt)}
            domId={rowIdPrefix && rowDomId(rowIdPrefix, e.id)}
          />
        ))}
      </ul>
    )

  if (headingHidden && events.length === 0) {
    return (
      <>
        {aboveList}
        {body}
        {belowList}
      </>
    )
  }

  return (
    <SectionCard
      title={headingHidden ? <span className="sr-only">{heading}</span> : heading}
      titleId={headingId}
      className={cn('max-w-[820px]', headingHidden ? 'gap-0 py-1 px-0 md:py-1 md:px-0' : 'pb-1 md:pt-[18px] md:pb-1')}
    >
      {aboveList}
      {body}
      {belowList}
    </SectionCard>
  )
}
```

Replace `app/(app)/admin/ledger/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { cardClass } from '@/components/ui/card'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

const ROW_ID_PREFIX = 'ledger'

export default async function AdminLedgerPage(props: PageProps<'/admin/ledger'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const ledger = await listAllTransactions(supabase, readPageParams(searchParams, 'before'))
  const backToNewestHref = newestHref('/admin/ledger', searchParams, 'before')

  return (
    <ContentReveal>
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className="sr-only">
          Every coin movement
        </h2>
        <ShowMoreFocus />
        {ledger.windowed && ledger.rows.length > 0 && (
          <div className="flex flex-col border-b border-line py-3.5">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        {ledger.rows.length === 0 ? (
          <div className="py-[18px] md:py-6">
            {ledger.windowed ? (
              <NothingOlder href={backToNewestHref} />
            ) : (
              <EmptyState icon={NotebookText} title="No coin movements yet." />
            )}
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ledger.rows.map((e) => (
              <LedgerRow key={e.id} entry={e} domId={rowDomId(ROW_ID_PREFIX, e.id)} />
            ))}
          </ul>
        )}
        {ledger.next && (
          <div className="flex flex-col border-t border-line py-3.5">
            <ShowMore
              href={showMoreHref('/admin/ledger', searchParams, 'before', ledger.next)}
              fresh={ledger.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, ledger.next.firstId)}
            />
          </div>
        )}
      </section>
    </ContentReveal>
  )
}
```

In `app/(app)/markets/[id]/page.tsx`, touch only the imports and `MarketBets`. Task 6 edits the same file's Suspense area and skeletons. First, replace:

```tsx
import { newestHref, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
```

with:

```tsx
import { newestHref, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
```

Second, replace:

```tsx
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
```

with:

```tsx
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
```

Third, replace the whole `MarketBets` function, from `async function MarketBets({` up to, but not including, `async function MarketSlipDrawer`, with:

```tsx
const BET_ROW_ID_PREFIX = 'bet'

async function MarketBets({
  market,
  viewerId,
  canBet,
  page,
  searchParams,
}: {
  market: MarketDetail
  viewerId: string
  canBet: boolean
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const betsPage = await getMarketBets(supabase, market.id, page)
  const pathname = `/markets/${market.id}`
  const backToNewestHref = newestHref(pathname, searchParams, 'bets')

  return (
    <ContentReveal>
      <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
        <ShowMoreFocus />
        {betsPage.windowed && betsPage.rows.length > 0 && (
          <div className="flex flex-col py-2">
            <BackToNewest href={backToNewestHref} />
          </div>
        )}
        {betsPage.windowed && betsPage.rows.length === 0 ? (
          <NothingOlder href={backToNewestHref} />
        ) : (
          <BetList
            bets={betsPage.rows}
            outcomes={market.outcomes}
            viewerId={viewerId}
            canBet={canBet}
            rowIdPrefix={BET_ROW_ID_PREFIX}
          />
        )}
        {betsPage.next && (
          <div className="flex flex-col border-t border-line pt-3">
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'bets', betsPage.next)}
              fresh={betsPage.next.kind === 'window'}
              focusId={rowDomId(BET_ROW_ID_PREFIX, betsPage.next.firstId)}
            />
          </div>
        )}
      </SectionCard>
    </ContentReveal>
  )
}
```

Replace `app/(app)/markets/(list)/page.tsx` with the version below. Task 5 rewrites it again for open markets. Here, only the closed list gains focus targets and "Nothing older here". Closed cards get the `market-closed` prefix, and open cards get no id yet. "No markets yet." now shows only when the closed list isn't windowed.

```tsx
import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { readSparklines } from '@/lib/markets/sparklines'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

const CLOSED_ROW_ID_PREFIX = 'market-closed'

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [open, closed] = await Promise.all([
    listOpenMarkets(supabase),
    listClosedMarkets(supabase, readPageParams(searchParams, 'resolved')),
  ])
  const closedIds = new Set(closed.rows.map((m) => m.id))
  const markets = [...open, ...closed.rows]
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map((m) => m.id),
  )
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)

  const cards = markets.map((market) => {
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
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      kind: market.kind,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      domId: closedIds.has(market.id) ? rowDomId(CLOSED_ROW_ID_PREFIX, market.id) : undefined,
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)

  const firstClosedGroup = groups.findIndex((group) => group.id === 'resolved' || group.id === 'voided')
  const closedNewestHref = newestHref('/markets', searchParams, 'resolved')
  const backToNewest = closed.windowed ? (
    closed.rows.length > 0 ? (
      <BackToNewest href={closedNewestHref} />
    ) : (
      <NothingOlder href={closedNewestHref} />
    )
  ) : null

  return (
    <Page transition="tab">
      <PageHeader
        title="Markets"
        action={
          <Link
            href="/markets/new"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
          >
            <Plus aria-hidden="true" className="size-5" />
            Create market
          </Link>
        }
      />
      <LiveTables subscriptions={pageSubscriptions.markets()} />
      <ShowMoreFocus />
      {groups.length === 0 && !closed.windowed ? (
        <EmptyState
          icon={ChartColumn}
          title="No markets yet."
          action={
            <Link
              href="/markets/new"
              transitionTypes={['nav-forward']}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Create market
            </Link>
          }
        >
          Open the first one and get the duel started.
        </EmptyState>
      ) : (
        groups.map((group, index) => (
          <Fragment key={group.id}>
            {index === firstClosedGroup && backToNewest}
            <section aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
              <h2 id={`markets-${group.id}-heading`} className={h2Class}>
                {group.heading}
              </h2>
              <div className="grid items-start gap-5 lg:grid-cols-3">
                {group.markets.map((market) => (
                  <MarketCard key={market.id} {...market} />
                ))}
              </div>
            </section>
          </Fragment>
        ))
      )}
      {firstClosedGroup === -1 && backToNewest}
      {closed.next && (
        <ShowMore
          href={showMoreHref('/markets', searchParams, 'resolved', closed.next)}
          fresh={closed.next.kind === 'window'}
          focusId={rowDomId(CLOSED_ROW_ID_PREFIX, closed.next.firstId)}
        />
      )}
    </Page>
  )
}
```

Replace `app/(app)/feed/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listFeed } from '@/lib/social/list-feed'
import { readPageParams, showMoreHref, newestHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { FeedList } from './feed-list'

const ROW_ID_PREFIX = 'feed'

export default async function FeedPage(props: PageProps<'/feed'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const feed = await listFeed(supabase, { page: readPageParams(searchParams, 'before') })
  const backToNewestHref = newestHref('/feed', searchParams, 'before')

  return (
    <Page transition="tab">
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
      <LiveTables subscriptions={pageSubscriptions.feed()} />
      <ShowMoreFocus />
      <FeedList
        events={feed.rows}
        heading="Events"
        headingId="feed-events"
        headingHidden
        rowIdPrefix={ROW_ID_PREFIX}
        emptyState={feed.windowed ? <NothingOlder href={backToNewestHref} /> : undefined}
        aboveList={
          feed.windowed &&
          feed.rows.length > 0 && (
            <div className="px-[18px] pt-3 md:px-6">
              <BackToNewest href={backToNewestHref} />
            </div>
          )
        }
        belowList={
          feed.next && (
            <div className="px-[18px] pb-3 md:px-6">
              <ShowMore
                href={showMoreHref('/feed', searchParams, 'before', feed.next)}
                fresh={feed.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, feed.next.firstId)}
              />
            </div>
          )
        }
      />
    </Page>
  )
}
```

Replace `app/(app)/members/[id]/page.tsx` with:

```tsx
import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { readPageParams, showMoreHref, newestHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { isUuid } from '@/lib/uuid'
import { Page, h1Class } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { ContentReveal } from '@/components/nav/page-transition'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'
import { NothingOlder } from '@/components/ui/nothing-older'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { FeedList } from '@/app/(app)/feed/feed-list'

// No loading.tsx for this route: the member must be found before anything streams, so an
// unknown id still gets a real 404 status. Only the activity list streams in behind a skeleton.
export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  const member = await getMemberStanding(supabase, id)
  if (!member) notFound()

  return (
    <Page transition="drill-down">
      <BackLink href="/leaderboard">Leaderboard</BackLink>
      <LiveTables subscriptions={pageSubscriptions.member(member.id)} />
      <section className="flex items-center gap-4 md:gap-5">
        <Avatar name={member.displayName} size="lg" />
        <div className="flex flex-col gap-1">
          <h1 className={h1Class}>{member.displayName}</h1>
          <p className="text-[18px] font-extrabold tabular-nums">
            {member.balance} DC · Rank {member.rank} of {member.memberCount}
          </p>
        </div>
      </section>
      <Suspense
        fallback={
          <SkeletonScreen name="member-activity">
            <FeedListSkeleton />
          </SkeletonScreen>
        }
      >
        <MemberActivity memberId={member.id} page={readPageParams(searchParams, 'activity')} searchParams={searchParams} />
      </Suspense>
    </Page>
  )
}

const ROW_ID_PREFIX = 'activity'

async function MemberActivity({
  memberId,
  page,
  searchParams,
}: {
  memberId: string
  page: PageParams
  searchParams: SearchParams
}) {
  const { supabase } = await requireUser()
  const activity = await listFeed(supabase, { actorId: memberId, page })
  const pathname = `/members/${memberId}`
  const backToNewestHref = newestHref(pathname, searchParams, 'activity')

  return (
    <ContentReveal>
      <ShowMoreFocus />
      <FeedList
        events={activity.rows}
        heading="Recent activity"
        headingId="recent-activity"
        rowIdPrefix={ROW_ID_PREFIX}
        emptyState={activity.windowed ? <NothingOlder href={backToNewestHref} /> : undefined}
        aboveList={activity.windowed && activity.rows.length > 0 && <BackToNewest href={backToNewestHref} />}
        belowList={
          activity.next && (
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'activity', activity.next)}
              fresh={activity.next.kind === 'window'}
              focusId={rowDomId(ROW_ID_PREFIX, activity.next.firstId)}
            />
          )
        }
      />
    </ContentReveal>
  )
}
```

In `AGENTS.md`, under "Data and reliability", replace:

```md
- **Long lists page with "Show more".** `lib/pagination` plus
  `components/ui/show-more.tsx`'s `ShowMore`, which takes `href` and an
  optional `fresh` prop — pass `fresh` when `next.kind === 'window'`, so a
  fresh window scrolls to the top.
```

with:

```md
- **Long lists page with "Show more".** `lib/pagination` plus
  `components/ui/show-more.tsx`'s `ShowMore`, which takes `href`, an
  optional `fresh` prop — pass `fresh` when `next.kind === 'window'`, so a
  fresh window scrolls to the top — and `focusId`,
  `rowDomId(prefix, next.firstId)`. Each row spreads
  `focusTarget(rowDomId(prefix, row.id))` (`lib/pagination/row-id.ts`),
  the page renders one `<ShowMoreFocus />`, and a window that comes back
  empty renders `NothingOlder` instead of the list's empty state. A reader
  whose row select carries embeds passes `readKeyset` a keys-only
  `fetchKeys` for its probe.
```

Run: `npx vitest run tests/components/admin-ledger.test.tsx tests/components/bet-list.test.tsx tests/components/feed-list.test.tsx tests/components/market-card.test.tsx`
Expected: PASS, 34 tests (8 + 5 + 10 + 11).

Run: `npx next typegen && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Verify**

Local Supabase must be running. This task has no migration, so there's no reset.

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1118 tests in 169 files: 25 more tests and 4 more files than after Task 2 (1093 in 165). `tests/db/` is unchanged by this task, and its paging tests (`list-transactions`, `market-bets`, `list-markets`, `social-readers`, `list-feed-equivalence`) now run each keys-only probe through real PostgREST.
- **The 25:**
  - `row-id` 5, `show-more-focus` 5, `nothing-older` 1 and `list-feed` 1 (new files)
  - `keyset` +4, `show-more` +2, `feed-list` +2 and `market-card` +2
  - `list-markets`, `admin-ledger` and `bet-list` +1 each
- **Build:** the same 20 routes, `/_not-found` included.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, with no spec changed.
- **The ledger spec.** `ledger-show-more.spec.ts` clicks "Show more" and asserts the scroll position holds within 1px and the skeleton never mounts. Focus now moves to the "Paging check 09" row, with `preventScroll`, so both still hold.
- **Everything else.** Rows keep their roles and text, so every `getByRole('listitem').filter({ hasText })` still resolves.

- [ ] **Step 10: Commit**

```bash
git add lib/pagination/cursor.ts lib/pagination/keyset.ts lib/pagination/row-id.ts \
  components/ui/show-more.tsx components/ui/show-more-focus.tsx components/ui/nothing-older.tsx \
  lib/ledger/list-transactions.ts lib/markets/get-market.ts lib/markets/list-markets.ts lib/social/list-feed.ts \
  components/admin/ledger-row.tsx components/feed/feed-item.tsx components/markets/bet-list.tsx components/markets/market-card.tsx \
  "app/(app)/feed/feed-list.tsx" "app/(app)/feed/page.tsx" "app/(app)/admin/ledger/page.tsx" \
  "app/(app)/markets/[id]/page.tsx" "app/(app)/markets/(list)/page.tsx" "app/(app)/members/[id]/page.tsx" AGENTS.md \
  tests/lib/pagination/row-id.test.ts tests/lib/pagination/keyset.test.ts tests/lib/fake-supabase.ts \
  tests/components/show-more.test.tsx tests/components/show-more-focus.test.tsx tests/components/nothing-older.test.tsx \
  tests/lib/ledger/list-transactions.test.ts tests/lib/markets/market-bets.test.ts tests/lib/markets/list-markets.test.ts \
  tests/lib/social/list-feed.test.ts tests/components/admin-ledger.test.tsx tests/components/bet-list.test.tsx \
  tests/components/feed-list.test.tsx tests/components/market-card.test.tsx
git commit -m "Move focus to the first new row after Show more, say when a window is past the end, and probe keys only"
```

---

## Task 4: Leaderboard paging

`/leaderboard` reads every member in one request today (`getLeaderboard`, "still unbounded"). This task pages it like the other lists (spec 2a):
- 50 members at a time, with "Show more", and "Back to newest" and "Nothing older here" for a fresh window
- focus moves to the first new member after "Show more", as Task 3 set up for the other lists
- ranks stay competition ranks over the whole board, whichever slice is on screen

`getMemberStanding` and Home are unchanged.

**The order and the cursor.**
- **The order** is the existing SQL order: `balance desc, display_name asc, id asc`.
- **The cursor** is `(balance, display_name, id)`, in `lib/pagination/rank-cursor.ts`, next to `cursor.ts`. It's base64url JSON, like `encodeCursor`, but the JSON goes through UTF-8 first, because a display name can be any text and `btoa` only takes single-byte characters.
- **Decoding** returns `null` for anything it can't use, so a bad link shows the first page and never throws. It needs:
  - a safe, non-negative integer balance (the column is `integer`, `check (balance >= 0)`)
  - a name of at most `TEXT_LIMITS.displayName` (80) code points, which 0034's CHECK enforces, and whose preflight guard proved every existing row passes
  - a uuid id
  - valid UTF-8, which `TextDecoder`'s fatal mode checks

**The filters.**
- **Quoting.** A name can hold a quote, a comma, parentheses or a backslash. Every value goes into the filter double-quoted, with `\` and `"` backslash-escaped, which is PostgREST's own grammar for a quoted value. So a name is always a literal, never filter syntax.
- **No seek bound.** Unlike `keyset.ts`'s filters, these carry no redundant seek bound. `profiles` has no index in this order, and the whole membership is a few hundred rows.
- **Collation.** The name comparisons run in Postgres under the same collation as the `order`, so the filters and the order always agree.

**The reader.**
- **`readOrdered`.** `readKeyset`'s extend-and-window logic moves into a generic `readOrdered<Row, Key>` in `keyset.ts`. It's driven by a small `KeysetOrder<Key>` (`range`, `after`, `encode`), and `readKeyset` becomes a thin wrapper over it. The semantics and bounds are unchanged: 50 rows, a range of at most 500, then a fresh window.
- **The leaderboard's order.** It is `RANK_ORDER`.
- **No `fetchKeys`.** The key columns (`id, display_name, balance`) are the whole row the leaderboard reads, so there's nothing narrower to probe with.

**Ranks across pages.** The spec gives the first row of a window the rank `1 + count(members with balance > its balance)`, with later rows continuing by competition ranking. That's right for the first row's tie group. But adding the window's local ranks onto it is wrong when that group straddles the boundary into the previous page.

Take balances `[10, 10, 10, 5]`, with the page boundary after the second 10. The window is `[10, 5]`:
- the 10 is rank 1 (`1 + 0`), which is right
- the 5 would be `1 + (2 − 1)` = 2, but it's really 4

So a window counts two things about its first row:
- **`above`**: the members with more coins. The first row's whole tie group ranks `above + 1`.
- **`ahead`**: every member before the first row in the order. That includes the part of its tie that sits on earlier pages. A later row ranks `ahead + (its local assignRanks rank)`.

A read that starts at the top (`windowed` false, an extend included) needs neither count, since both are 0, so it runs no count queries. Both counts are head-only `count: 'exact'` reads, like `getMemberStanding`'s.

**The page.**
- **Search params:** `before` for the range, and `before_from` for a fresh window.
- **Empty states:**
  - "No other members yet." shows only for a board that starts at the top and has at most one member
  - a window with no rows shows `NothingOlder`
- **"Back to newest"** sits at the top of the rankings card when the page is windowed.
- **"Show more"** sits at the bottom of the card, and its focus target uses the prefix `member`.
- **`getLeaderboard` is removed.** Nothing else calls it, and `tests/db/social-readers.test.ts`'s two tests move onto `getLeaderboardPage`.

**Files:**
- Create:
  - `lib/pagination/rank-cursor.ts`
- Modify:
  - `lib/pagination/keyset.ts` (adds `KeysetOrder` and `readOrdered`)
  - `lib/social/leaderboard.ts` (`getLeaderboardPage` replaces `getLeaderboard`)
  - `app/(app)/leaderboard/page.tsx`
  - `components/leaderboard/leaderboard-row.tsx` (gains `domId`)
- Test, create:
  - `tests/lib/pagination/rank-cursor.test.ts`
  - `tests/lib/social/leaderboard.test.ts`
  - `tests/components/leaderboard-page.test.tsx`
  - `tests/db/leaderboard-page.test.ts`
- Test, modify:
  - `tests/lib/fake-supabase.ts` (gains `.gt()`)
  - `tests/db/fixtures.ts` (`seedMembers` deletes every auth user, not just the first page)
  - `tests/db/social-readers.test.ts` (the `getLeaderboard` block and its import only)
  - `tests/components/leaderboard-row.test.tsx`

**Interfaces:**
- Consumes:
  - from Task 3:
    - `readKeyset` with `fetchKeys` (`lib/pagination/keyset.ts`)
    - `NextPage.firstId`, `showMoreHref`, `newestHref` and `SearchParams` (`lib/pagination/cursor.ts`)
    - `rowDomId` and `focusTarget` (`lib/pagination/row-id.ts`)
    - `ShowMore` with `focusId`, `BackToNewest`, `ShowMoreFocus` and `NothingOlder`
  - `assignRanks` and `LeaderboardEntry` (`lib/social/ranking.ts`, unchanged)
  - `TEXT_LIMITS.displayName` (`lib/forms/limits.ts`) and `isUuid` (`lib/uuid.ts`)
  - the test helpers `seedMembers`, `makeMember`, `clientFor` and `ensureInvited` (`tests/db/fixtures.ts`), and `serviceClient` (`tests/db/helpers.ts`)
  - `seedMembers` clears auth users with one unpaged `listUsers()` call, which returns only the first page of 50. This task's DB test adds 58 members, so a run killed before its `afterAll` would leave more users than one page holds, and every later `seedMembers` could then find an old `alice@example.com` and fail to recreate her. This task makes `seedMembers` read page after page until no user is left, and the DB test still deletes its own 58 in `afterAll`, so the DB test files that clear auth users themselves (`schema`, `new-profile-trigger`, `market-schema` and `create-own-profile`, a page at a time) never inherit them.
  - `tests/components/view-transition-mock.ts`. Vitest's React has no `ViewTransition`, and `Page` renders one.
- Produces:

```ts
// lib/pagination/keyset.ts
export type KeysetOrder<Key> = {
  range: (page: { top: Key | null; bottom: Key | null }) => string | null
  after: (key: Key) => string
  encode: (key: Key) => string
}
export async function readOrdered<Row, Key extends { id: string }>(
  page: { top: Key | null; bottom: Key | null },
  order: KeysetOrder<Key>,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Key,
  fetchKeys?: (filter: string, limit: number) => Promise<Key[]>,
): Promise<KeysetPage<Row>>
// readKeyset keeps its Task 3 signature and delegates to readOrdered.

// lib/pagination/rank-cursor.ts
export type RankCursor = { balance: number; name: string; id: string }
export type RankPageParams = { top: RankCursor | null; bottom: RankCursor | null }
export function encodeRankCursor(cursor: RankCursor): string
export function decodeRankCursor(raw: string | string[] | undefined | null): RankCursor | null
export function readRankPageParams(searchParams: SearchParams, param: string): RankPageParams
export function aheadOfRankFilter(c: RankCursor): string
export const RANK_ORDER: KeysetOrder<RankCursor>

// lib/social/leaderboard.ts
export async function getLeaderboardPage(supabase: SupabaseClient, page: RankPageParams): Promise<KeysetPage<LeaderboardEntry>>
// getLeaderboard is gone; getMemberStanding is unchanged.

// components/leaderboard/leaderboard-row.tsx: LeaderboardRow gains `domId?: string`
```

- [ ] **Step 1: Write the failing rank cursor tests**

Create `tests/lib/pagination/rank-cursor.test.ts`. Its `matches` evaluates a filter the way PostgREST does, backslash escapes included, and its fake board repeats names and balances. So the filters are checked against every member's position, not just against their spelling.

```ts
import { describe, it, expect } from 'vitest'
import {
  RANK_ORDER,
  aheadOfRankFilter,
  decodeRankCursor,
  encodeRankCursor,
  readRankPageParams,
  type RankCursor,
} from '@/lib/pagination/rank-cursor'

const ID = '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f'

// What arbitrary bytes or text encode to, so a test can hand-craft a tampered cursor.
function encodeBytes(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
const encodeText = (text: string) => encodeBytes([...new TextEncoder().encode(text)])

type Member = { balance: number; display_name: string; id: string }

// Evaluates a filter the way PostgREST's `or=(…)` does: nested and(…) / or(…) around
// `col.op."value"` leaves, where a backslash inside the quotes escapes the next character.
function matches(filter: string, row: Member): boolean {
  let i = 0
  function term(): boolean {
    const group = /^(and|or)\(/.exec(filter.slice(i))
    if (group) {
      i += group[0].length
      const parts = [term()]
      while (filter[i] === ',') {
        i++
        parts.push(term())
      }
      if (filter[i] !== ')') throw new Error(`expected ) at ${i}: ${filter.slice(i)}`)
      i++
      return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean)
    }
    const leaf = /^(balance|display_name|id)\.(lt|lte|gt|gte|eq)\."/.exec(filter.slice(i))
    if (!leaf) throw new Error(`unparsed filter at ${i}: ${filter.slice(i)}`)
    i += leaf[0].length
    let text = ''
    while (filter[i] !== '"') {
      if (i >= filter.length) throw new Error('unterminated value')
      if (filter[i] === '\\') i++
      text += filter[i]
      i++
    }
    i++
    const column = leaf[1] as keyof Member
    const value = row[column]
    const other = column === 'balance' ? Number(text) : text
    switch (leaf[2]) {
      case 'lt':
        return value < other
      case 'lte':
        return value <= other
      case 'gt':
        return value > other
      case 'gte':
        return value >= other
      default:
        return value === other
    }
  }
  const result = term()
  if (i !== filter.length) throw new Error(`trailing filter text: ${filter.slice(i)}`)
  return result
}

const NAMES = ['Ann', 'O"Brien, (Jr.)', 'Back\\slash', 'x"),id.gt.(0', 'Zoë 🎲', 'a,b.c:d', 'Ann']

// 49 members in tiers of balances, so ties span several names, and the last seven repeat the first
// seven's names, so a tie on balance and name falls back to the id.
const BOARD: Member[] = Array.from({ length: 49 }, (_, i) => ({
  balance: [300, 150, 150, 90, 90, 90, 0][i % 7],
  display_name: NAMES[Math.floor(i / 7) % NAMES.length] + (i % 3 === 0 ? '' : ` ${i % 3}`),
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
})).sort((a, b) =>
  a.balance !== b.balance ? b.balance - a.balance : a.display_name !== b.display_name ? (a.display_name < b.display_name ? -1 : 1) : a.id < b.id ? -1 : 1,
)

const keyOf = (m: Member): RankCursor => ({ balance: m.balance, name: m.display_name, id: m.id })
const select = (filter: string | null) => BOARD.filter((m) => filter === null || matches(filter, m))

describe('encodeRankCursor / decodeRankCursor', () => {
  it.each<RankCursor>([
    { balance: 150, name: 'Alice', id: ID },
    { balance: 0, name: '', id: ID },
    { balance: 2_147_483_647, name: 'O"Brien, (Jr.) \\ back', id: ID },
    { balance: 42, name: 'Zoë 🎲 — ünïcode', id: ID },
    { balance: 7, name: '🎲'.repeat(80), id: ID },
  ])('round-trips $balance / $name', (cursor) => {
    const encoded = encodeRankCursor(cursor)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeRankCursor(encoded)).toEqual(cursor)
  })

  it.each([undefined, null, '', ' ', 'not a cursor', '!!!', 'a'.repeat(1001)])('decodes %j to null', (raw) => {
    expect(decodeRankCursor(raw)).toBeNull()
  })

  it('decodes a repeated query param (an array) to null', () => {
    const one = encodeRankCursor({ balance: 1, name: 'A', id: ID })
    expect(decodeRankCursor([one, one])).toBeNull()
  })

  it.each([
    ['a JSON object', `{"balance":1,"name":"A","id":"${ID}"}`],
    ['two elements', `[1,"A"]`],
    ['four elements', `[1,"A","${ID}","x"]`],
    ['a string balance', `["1","A","${ID}"]`],
    ['a negative balance', `[-1,"A","${ID}"]`],
    ['a fractional balance', `[1.5,"A","${ID}"]`],
    ['an unsafe integer balance', `[9007199254740993,"A","${ID}"]`],
    ['a numeric name', `[1,7,"${ID}"]`],
    ['a name past 80 characters', `[1,"${'a'.repeat(81)}","${ID}"]`],
    ['an id that is not a uuid', `[1,"A","42"]`],
    ['an id with filter syntax', `[1,"A","${ID}),id.gt.(0"]`],
    ['not JSON at all', `1,A,${ID}`],
  ])('decodes a tampered cursor with %s to null', (_label, text) => {
    expect(decodeRankCursor(encodeText(text))).toBeNull()
  })

  it('decodes bytes that are not UTF-8 to null', () => {
    expect(decodeRankCursor(encodeBytes([0x5b, 0x31, 0x2c, 0x22, 0xff, 0xfe, 0x22, 0x5d]))).toBeNull()
  })
})

describe('readRankPageParams', () => {
  it('reads the range end from the param and the window start from param_from', () => {
    const top: RankCursor = { balance: 90, name: 'Top', id: ID }
    const bottom: RankCursor = { balance: 10, name: 'Bottom', id: ID }
    expect(
      readRankPageParams({ before: encodeRankCursor(bottom), before_from: encodeRankCursor(top) }, 'before'),
    ).toEqual({ top, bottom })
    expect(readRankPageParams({ before: 'garbage' }, 'before')).toEqual({ top: null, bottom: null })
  })
})

describe('RANK_ORDER filters', () => {
  it('builds the strictly-after filter in the board order, with every value quoted', () => {
    expect(RANK_ORDER.after({ balance: 90, name: 'Bob', id: ID })).toBe(
      `or(balance.lt."90",and(balance.eq."90",or(display_name.gt."Bob",and(display_name.eq."Bob",id.gt."${ID}"))))`,
    )
  })

  it('escapes quotes and backslashes in a name, so it stays a literal', () => {
    const filter = RANK_ORDER.after({ balance: 1, name: 'x"),id.gt.(0\\', id: ID })
    expect(filter).toContain('display_name.gt."x\\"),id.gt.(0\\\\"')
    expect(select(filter)).toEqual(BOARD.filter((m) => m.balance < 1 || (m.balance === 1 && m.display_name > 'x"),id.gt.(0\\')))
  })

  it('selects exactly the members after each member on the board', () => {
    BOARD.forEach((member, index) => {
      expect(select(RANK_ORDER.after(keyOf(member)))).toEqual(BOARD.slice(index + 1))
    })
  })

  it('selects exactly the members ahead of each member on the board', () => {
    BOARD.forEach((member, index) => {
      expect(select(aheadOfRankFilter(keyOf(member)))).toEqual(BOARD.slice(0, index))
    })
  })

  it('reads a range from the top to its end, from a window start down, and between the two, both inclusive', () => {
    expect(RANK_ORDER.range({ top: null, bottom: null })).toBeNull()
    expect(select(RANK_ORDER.range({ top: null, bottom: keyOf(BOARD[20]) }))).toEqual(BOARD.slice(0, 21))
    expect(select(RANK_ORDER.range({ top: keyOf(BOARD[20]), bottom: null }))).toEqual(BOARD.slice(20))
    expect(select(RANK_ORDER.range({ top: keyOf(BOARD[5]), bottom: keyOf(BOARD[30]) }))).toEqual(BOARD.slice(5, 31))
  })

  it('encodes a next cursor that decodes to the same member', () => {
    expect(decodeRankCursor(RANK_ORDER.encode(keyOf(BOARD[3])))).toEqual(keyOf(BOARD[3]))
  })
})
```

Run: `npx vitest run tests/lib/pagination/rank-cursor.test.ts`
Expected: FAIL. The file can't load, because `@/lib/pagination/rank-cursor` doesn't exist yet.

- [ ] **Step 2: Add `readOrdered` and the rank cursor**

Replace `lib/pagination/keyset.ts` with:

```ts
import { PAGE_SIZE, WINDOW_CAP, encodeCursor, type Cursor, type NextPage, type PageParams } from '@/lib/pagination/cursor'

// isId guards the id's column type: Postgres rejects `id.lt."abc"` on a bigint column with an
// error, so a cursor whose id can't be that column's is dropped, like any other bad cursor.
export type KeyColumns = { ts: string; id: string; isId?: (id: string) => boolean }
export type KeysetPage<T> = { rows: T[]; next: NextPage | null; windowed: boolean }

const BIGINT_ID = /^\d{1,18}$/

export function isBigintId(id: string): boolean {
  return BIGINT_ID.test(id)
}

// Every leaf is a plain `<ts>.op."value"` term, plus a matching plain bound on <ts> alongside the
// (ts, id) tiebreak OR. A pure-OR filter with no such bound is known from EXPLAIN review to get
// only a Filter on the (ts desc, id desc) index, walking the whole table; the bounded form here is
// proven to get an Index Cond instead (tests/db/data-layer-indexes.test.ts). The bound is redundant
// with the OR itself — the `lt`/`eq` tiebreak implies `lte`, and the `gt`/`eq` tiebreak implies
// `gte` — but it's what gives Postgres something to seek by.
function atOrOlder(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.lte."${c.ts}",or(${cols.ts}.lt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.lte."${c.id}")))`
}

function atOrNewer(cols: KeyColumns, c: Cursor): string {
  return `and(${cols.ts}.gte."${c.ts}",or(${cols.ts}.gt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.gte."${c.id}")))`
}

// Every value is quoted, and a validated cursor can't contain a quote (see decodeCursor).
export function rangeFilter(cols: KeyColumns, page: PageParams): string | null {
  const { top, bottom } = page
  if (top && bottom) return `and(${atOrNewer(cols, bottom)},${atOrOlder(cols, top)})`
  if (bottom) return atOrNewer(cols, bottom)
  if (top) return atOrOlder(cols, top)
  return null
}

export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.lte."${cursor.ts}",or(${cols.ts}.lt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.lt."${cursor.id}")))`
}

export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `and(${cols.ts}.gte."${cursor.ts}",or(${cols.ts}.gt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.gt."${cursor.id}")))`
}

// How a list's keys become PostgREST filters. `range` is every row from `bottom` (where an
// extended range ends) up to `top` (where a fresh window starts), both inclusive and either
// optional; `after` is every row strictly after a key in the list's order.
export type KeysetOrder<Key> = {
  range: (page: { top: Key | null; bottom: Key | null }) => string | null
  after: (key: Key) => string
  encode: (key: Key) => string
}

// fetchKeys, when given, answers the probe below with only the key columns: the probe needs
// nothing else, and the full row select can carry embeds that cost a join per row. Without it
// the probe falls back to fetchRows.
export async function readOrdered<Row, Key extends { id: string }>(
  page: { top: Key | null; bottom: Key | null },
  order: KeysetOrder<Key>,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Key,
  fetchKeys?: (filter: string, limit: number) => Promise<Key[]>,
): Promise<KeysetPage<Row>> {
  const windowed = page.top !== null

  const rows = await fetchRows(order.range(page), page.bottom ? WINDOW_CAP : PAGE_SIZE)
  if (rows.length === 0 || (page.bottom === null && rows.length < PAGE_SIZE)) return { rows, next: null, windowed }

  // "Show more" points at the 50th row past the last one shown, so the read needs those rows'
  // keys. Probing from the last row returned, not from the cursor, means rows that arrived at the
  // top and pushed the range past the cap are picked up here instead of skipped.
  const after = order.after(keyOf(rows[rows.length - 1]))
  const probe = fetchKeys ? await fetchKeys(after, PAGE_SIZE) : (await fetchRows(after, PAGE_SIZE)).map(keyOf)
  if (probe.length === 0) return { rows, next: null, windowed }
  const firstId = probe[0].id
  if (rows.length + probe.length > WINDOW_CAP) {
    return { rows, next: { kind: 'window', cursor: order.encode(probe[0]), firstId }, windowed }
  }
  return { rows, next: { kind: 'extend', cursor: order.encode(probe[probe.length - 1]), firstId }, windowed }
}

export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
  fetchKeys?: (filter: string, limit: number) => Promise<Cursor[]>,
): Promise<KeysetPage<Row>> {
  const valid = (c: Cursor | null) => (c && (!cols.isId || cols.isId(c.id)) ? c : null)
  const order: KeysetOrder<Cursor> = {
    range: (page) => rangeFilter(cols, page),
    after: (key) => olderThanFilter(cols, key),
    encode: encodeCursor,
  }
  return readOrdered({ top: valid(rawPage.top), bottom: valid(rawPage.bottom) }, order, fetchRows, keyOf, fetchKeys)
}
```

Create `lib/pagination/rank-cursor.ts`:

```ts
import { TEXT_LIMITS } from '@/lib/forms/limits'
import type { SearchParams } from '@/lib/pagination/cursor'
import type { KeysetOrder } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

// The leaderboard's position: balance desc, display_name asc, id asc, the same order its read uses.
export type RankCursor = { balance: number; name: string; id: string }
export type RankPageParams = { top: RankCursor | null; bottom: RankCursor | null }

// Long enough for the longest valid cursor: 80 code points of JSON-escaped name plus the rest.
const BASE64URL = /^[A-Za-z0-9_-]{1,1000}$/

// A display name can be any text, so the JSON goes through UTF-8 before btoa, which only takes
// single-byte characters. TextDecoder's fatal mode turns a tampered byte sequence into an error.
function toBase64Url(text: string): string {
  let binary = ''
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(raw: string): string {
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))
}

export function encodeRankCursor(cursor: RankCursor): string {
  return toBase64Url(JSON.stringify([cursor.balance, cursor.name, cursor.id]))
}

export function decodeRankCursor(raw: string | string[] | undefined | null): RankCursor | null {
  if (typeof raw !== 'string' || !BASE64URL.test(raw)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(fromBase64Url(raw))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) return null
  const [balance, name, id] = parsed
  if (typeof balance !== 'number' || !Number.isSafeInteger(balance) || balance < 0) return null
  if (typeof name !== 'string' || [...name].length > TEXT_LIMITS.displayName) return null
  if (typeof id !== 'string' || !isUuid(id)) return null
  return { balance, name, id }
}

export function readRankPageParams(searchParams: SearchParams, param: string): RankPageParams {
  return { top: decodeRankCursor(searchParams[`${param}_from`]), bottom: decodeRankCursor(searchParams[param]) }
}

// PostgREST reads a double-quoted value up to the next unescaped quote, taking \" and \\ as
// escapes, so any display name reaches the query as a literal and never as filter syntax.
function quote(value: string | number): string {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// The members after c in the board's order (below) or before it, and c itself when inclusive.
// Unlike keyset.ts these carry no redundant seek bound: profiles has no index in this order, and
// the whole membership is a few hundred rows.
function beside(c: RankCursor, below: boolean, inclusive: boolean): string {
  const balance = below ? 'lt' : 'gt'
  const name = below ? 'gt' : 'lt'
  const id = `${below ? 'gt' : 'lt'}${inclusive ? 'e' : ''}`
  return (
    `or(balance.${balance}.${quote(c.balance)},and(balance.eq.${quote(c.balance)},` +
    `or(display_name.${name}.${quote(c.name)},and(display_name.eq.${quote(c.name)},id.${id}.${quote(c.id)}))))`
  )
}

// Every member ranked ahead of c: the count that fixes the rank a window's first row continues from.
export function aheadOfRankFilter(c: RankCursor): string {
  return beside(c, false, false)
}

export const RANK_ORDER: KeysetOrder<RankCursor> = {
  range: ({ top, bottom }) => {
    if (top && bottom) return `and(${beside(top, true, true)},${beside(bottom, false, true)})`
    if (bottom) return beside(bottom, false, true)
    if (top) return beside(top, true, true)
    return null
  },
  after: (key) => beside(key, true, false),
  encode: encodeRankCursor,
}
```

Run: `npx vitest run tests/lib/pagination`
Expected: PASS, 99 tests in 5 files: `cursor` 42, `keyset` 15, `chunk` 4, `row-id` 5 and `rank-cursor` 33. `keyset.test.ts` is unchanged, and passing it proves `readKeyset` behaves exactly as before on top of `readOrdered`.

- [ ] **Step 3: Write the failing leaderboard reader tests**

Replace `tests/lib/fake-supabase.ts` with the version below. It gains `gt` beside `eq`, for the rank count:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for the query builder: it records each query's chain, and answers it when awaited.
export type RecordedQuery = {
  table: string
  select?: string
  selectOptions?: unknown
  eq: [string, unknown][]
  gt: [string, unknown][]
  is: [string, unknown][]
  in: [string, unknown[]][]
  or: string[]
  order: [string, unknown][]
  limit?: number
}

export type FakeResponse = { data?: unknown; count?: number | null; error?: unknown }

export function fakeSupabase(respond: (query: RecordedQuery, index: number) => FakeResponse) {
  const queries: RecordedQuery[] = []
  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, eq: [], gt: [], is: [], in: [], or: [], order: [] }
      const index = queries.push(query) - 1
      const builder = {
        select(columns: string, options?: unknown) {
          query.select = columns
          query.selectOptions = options
          return builder
        },
        eq(column: string, value: unknown) {
          query.eq.push([column, value])
          return builder
        },
        gt(column: string, value: unknown) {
          query.gt.push([column, value])
          return builder
        },
        is(column: string, value: unknown) {
          query.is.push([column, value])
          return builder
        },
        in(column: string, values: unknown[]) {
          query.in.push([column, values])
          return builder
        },
        or(filter: string) {
          query.or.push(filter)
          return builder
        },
        order(column: string, options?: unknown) {
          query.order.push([column, options])
          return builder
        },
        limit(count: number) {
          query.limit = count
          return builder
        },
        then<T>(onFulfilled: (value: FakeResponse) => T, onRejected?: (reason: unknown) => T) {
          return Promise.resolve()
            .then(() => ({ data: null, count: null, error: null, ...respond(query, index) }))
            .then(onFulfilled, onRejected)
        },
      }
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, queries }
}
```

Create `tests/lib/social/leaderboard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { RANK_ORDER, aheadOfRankFilter, decodeRankCursor, type RankCursor } from '@/lib/pagination/rank-cursor'
import { fakeSupabase, type RecordedQuery } from '../fake-supabase'

function profile(n: number, balance: number) {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, display_name: `Member ${String(n).padStart(3, '0')}`, balance }
}

const isCount = (q: RecordedQuery) => (q.selectOptions as { head?: boolean } | undefined)?.head === true

describe('getLeaderboardPage', () => {
  it('reads the top 50 in board order, ranks ties together, and counts nothing', async () => {
    // Pairs share a balance, so ranks go 1, 1, 3, 3, …
    const shown = Array.from({ length: 50 }, (_, i) => profile(i, 1000 - Math.floor(i / 2)))
    const probed = Array.from({ length: 50 }, (_, i) => profile(50 + i, 975 - Math.floor(i / 2)))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getLeaderboardPage(client, { top: null, bottom: null })

    expect(queries).toHaveLength(2)
    const [read, probe] = queries
    expect(read.select).toBe('id, display_name, balance')
    expect(read.order).toEqual([
      ['balance', { ascending: false }],
      ['display_name', { ascending: true }],
      ['id', { ascending: true }],
    ])
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.or).toEqual([RANK_ORDER.after({ balance: 976, name: 'Member 049', id: shown[49].id })])
    expect(page.windowed).toBe(false)
    expect(page.rows.slice(0, 4).map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Member 000', 1000, 1],
      ['Member 001', 1000, 1],
      ['Member 002', 999, 3],
      ['Member 003', 999, 3],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: probed[0].id })
    expect(decodeRankCursor(page.next?.cursor)).toEqual({ balance: 951, name: 'Member 099', id: probed[49].id })
  })

  it('ranks a window against the whole board, across a tie that started before it', async () => {
    // Three members have more than 100, and two more at 100 come before the window's first row.
    const shown = [profile(5, 100), profile(6, 100), profile(7, 90), profile(8, 90), profile(9, 80)]
    const top: RankCursor = { balance: 100, name: 'Member 005', id: shown[0].id }
    const { client, queries } = fakeSupabase((query) => {
      if (!isCount(query)) return { data: shown }
      return { count: query.gt.length > 0 ? 3 : 5 }
    })

    const page = await getLeaderboardPage(client, { top, bottom: null })

    expect(page.windowed).toBe(true)
    expect(page.rows.map((m) => [m.displayName, m.rank])).toEqual([
      ['Member 005', 4],
      ['Member 006', 4],
      ['Member 007', 8],
      ['Member 008', 8],
      ['Member 009', 10],
    ])
    const counts = queries.filter(isCount)
    expect(counts.map((q) => [q.gt, q.or])).toEqual([
      [[['balance', 100]], []],
      [[], [aheadOfRankFilter(top)]],
    ])
    expect(queries[0].or).toEqual([RANK_ORDER.range({ top, bottom: null })])
  })

  it('reads an empty window with no counts', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await getLeaderboardPage(client, { top: { balance: 0, name: 'Z', id: profile(1, 0).id }, bottom: null })
    expect(page).toEqual({ rows: [], next: null, windowed: true })
    expect(queries).toHaveLength(1)
  })

  it('throws when a rank count fails, so the error page shows rather than wrong ranks', async () => {
    const { client } = fakeSupabase((query) => (isCount(query) ? { error: new Error('count failed') } : { data: [profile(1, 5)] }))
    await expect(
      getLeaderboardPage(client, { top: { balance: 5, name: 'Member 001', id: profile(1, 5).id }, bottom: null }),
    ).rejects.toThrow('count failed')
  })
})
```

The DB test below adds 58 members, more than the one page of auth users that `seedMembers` deletes today. In `tests/db/fixtures.ts`, inside `seedMembers`, replace:

```ts
  const { data: existing } = await db.auth.admin.listUsers()
  for (const u of existing.users) await db.auth.admin.deleteUser(u.id)
```

with:

```ts
  // listUsers returns one page of 50, and a DB test that adds more and is killed before its own
  // cleanup leaves the rest behind. Every page is read until none is left; deleting shifts the
  // pages, so it's always page 1.
  for (;;) {
    const { data, error } = await db.auth.admin.listUsers()
    if (error) throw error
    if (data.users.length === 0) break
    for (const u of data.users) {
      const { error: deleteErr } = await db.auth.admin.deleteUser(u.id)
      if (deleteErr) throw deleteErr
    }
  }
```

Create `tests/db/leaderboard-page.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, ensureInvited } from './fixtures'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { assignRanks } from '@/lib/social/ranking'
import { showMoreHref } from '@/lib/pagination/cursor'
import { encodeRankCursor, readRankPageParams, type RankCursor } from '@/lib/pagination/rank-cursor'

type Profile = { id: string; display_name: string; balance: number }

// Six members tie at positions 48–53 of 60, across the first page's boundary at 50. Their names
// are ones a PostgREST filter has to quote and escape, so the probe and every cursor built from
// the tie carry them.
const TIED_NAMES = ['O"Brien, (Jr.)', 'Back\\slash', 'x"),id.gt.(0', 'Zoë 🎲', 'a,b.c:d', 'Ann (the 2nd)']
const TIE_START = 47
// Between the balances either side of the tie: 1000 - 46 above it and 1000 - 53 below.
const TIE_BALANCE = 950
const EXTRA_MEMBERS = 58

let bobClient: SupabaseClient
// Every member this file adds is deleted in afterAll, so the DB tests that clear auth users one
// page at a time never inherit them. A run killed first still leaves nothing for seedMembers,
// which pages through every auth user.
const extras: string[] = []
let board: (Profile & { rank: number })[]

const keyOf = (p: Profile): RankCursor => ({ balance: p.balance, name: p.display_name, id: p.id })
const summary = (rows: { id: string; rank: number }[]) => rows.map((m) => [m.id, m.rank])

beforeAll(async () => {
  const [alice, bob] = await seedMembers()
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
  for (let i = 0; i < EXTRA_MEMBERS; i += 10) {
    const batch = await Promise.all(
      Array.from({ length: Math.min(10, EXTRA_MEMBERS - i) }, (_, j) => makeMember(`Ranked${String(i + j).padStart(2, '0')}`)),
    )
    extras.push(...batch.map((m) => m.id))
  }

  const db = serviceClient()
  const everyone = [alice.id, bob.id, ...extras]
  await Promise.all(
    everyone.map(async (id, k) => {
      const tied = k >= TIE_START && k < TIE_START + TIED_NAMES.length
      const update = tied ? { balance: TIE_BALANCE, display_name: TIED_NAMES[k - TIE_START] } : { balance: 1000 - k }
      const { error } = await db.from('profiles').update(update).eq('id', id)
      if (error) throw error
    }),
  )

  // The expected board comes from the database's own order, so the names in the tie sort by its
  // collation, the same one the reader's filters compare with.
  const { data, error } = await db
    .from('profiles')
    .select('id, display_name, balance')
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error
  board = assignRanks(data as Profile[])
}, 60_000)

afterAll(async () => {
  const db = serviceClient()
  // Each profile's starting grant goes with it: coin_transactions.profile_id cascades (0001).
  if (extras.length > 0) await db.from('profiles').delete().in('id', extras)
  for (const id of extras) await db.auth.admin.deleteUser(id)
}, 60_000)

describe('getLeaderboardPage', () => {
  it('sets up a board of 60 with the tie across the page boundary', () => {
    expect(board).toHaveLength(60)
    expect(board.slice(TIE_START, TIE_START + 6).map((m) => m.balance)).toEqual(Array(6).fill(TIE_BALANCE))
    expect(board.slice(TIE_START, TIE_START + 6).every((m) => m.rank === 48)).toBe(true)
    expect(board[TIE_START + 6].rank).toBe(54)
  })

  it('pages 50 at a time, and Show more ranks the tie the same on both sides of the boundary', async () => {
    const first = await getLeaderboardPage(bobClient, { top: null, bottom: null })
    expect(summary(first.rows)).toEqual(summary(board.slice(0, 50)))
    expect(first.rows.slice(TIE_START).map((m) => m.rank)).toEqual([48, 48, 48])
    expect(first.next).toMatchObject({ kind: 'extend', firstId: board[50].id })

    const href = new URL(showMoreHref('/leaderboard', {}, 'before', first.next!), 'http://localhost')
    const second = await getLeaderboardPage(bobClient, readRankPageParams(Object.fromEntries(href.searchParams), 'before'))
    expect(second.windowed).toBe(false)
    expect(summary(second.rows)).toEqual(summary(board))
    expect(second.rows.slice(50, 54).map((m) => m.rank)).toEqual([48, 48, 48, 54])
    expect(second.next).toBeNull()
  })

  it('ranks a fresh window that starts inside the tie against the whole board', async () => {
    const page = await getLeaderboardPage(bobClient, readRankPageParams({ before_from: encodeRankCursor(keyOf(board[50])) }, 'before'))
    expect(page.windowed).toBe(true)
    expect(summary(page.rows)).toEqual(summary(board.slice(50)))
    expect(page.rows.map((m) => m.rank)).toEqual([48, 48, 48, 54, 55, 56, 57, 58, 59, 60])
    expect(page.next).toBeNull()
  })

  it('ranks a fresh window that starts just past the tie from the members above it', async () => {
    const page = await getLeaderboardPage(bobClient, readRankPageParams({ before_from: encodeRankCursor(keyOf(board[53])) }, 'before'))
    expect(page.rows.map((m) => m.rank)).toEqual([54, 55, 56, 57, 58, 59, 60])
  })

  it('reads a window past the last member as empty, and a garbage cursor as the first page', async () => {
    const pastTheEnd: RankCursor = { balance: 0, name: '', id: 'ffffffff-ffff-4fff-bfff-ffffffffffff' }
    expect(await getLeaderboardPage(bobClient, readRankPageParams({ before_from: encodeRankCursor(pastTheEnd) }, 'before'))).toEqual({
      rows: [],
      next: null,
      windowed: true,
    })

    const garbage = await getLeaderboardPage(bobClient, readRankPageParams({ before: 'garbage', before_from: '!!' }, 'before'))
    expect(garbage.windowed).toBe(false)
    expect(summary(garbage.rows)).toEqual(summary(board.slice(0, 50)))
  })
})
```

In `tests/db/social-readers.test.ts`, change only the `getLeaderboard` block and its import. Task 1 edits this file's `listFeed` tests. First, replace:

```ts
import { getLeaderboard, getMemberStanding } from '@/lib/social/leaderboard'
```

with:

```ts
import { getLeaderboardPage, getMemberStanding } from '@/lib/social/leaderboard'
```

Second, replace:

```ts
describe('getLeaderboard', () => {
```

with:

```ts
describe('getLeaderboardPage', () => {
```

Third, replace:

```ts
    const board = await getLeaderboard(bobClient)
    expect(board.map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Alice', 150, 1],
      ['Bob', 150, 1],
      ['Carol', 90, 3],
    ])
```

with:

```ts
    const board = await getLeaderboardPage(bobClient, { top: null, bottom: null })
    expect(board.rows.map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Alice', 150, 1],
      ['Bob', 150, 1],
      ['Carol', 90, 3],
    ])
    expect(board.next).toBeNull()
```

Fourth, replace:

```ts
    expect(await getLeaderboard(carolClient)).toEqual([])
```

with:

```ts
    expect(await getLeaderboardPage(carolClient, { top: null, bottom: null })).toEqual({ rows: [], next: null, windowed: false })
```

Run: `npx vitest run tests/lib/social/leaderboard.test.ts`
Expected: FAIL, 4 of 4, with `TypeError: getLeaderboardPage is not a function`.

Local Supabase must be running for the next command.

Run: `npx vitest run tests/db/leaderboard-page.test.ts tests/db/social-readers.test.ts`
Expected: FAIL.
- In `leaderboard-page.test.ts`, every test that reads the board fails with `getLeaderboardPage is not a function`. Its fixture check, "sets up a board of 60 with the tie across the page boundary", passes.
- In `social-readers.test.ts`, its two `getLeaderboardPage` tests fail the same way.
- `afterAll` still deletes the 58 members it added.

- [ ] **Step 4: Page the leaderboard reader**

Replace `lib/social/leaderboard.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { readOrdered, type KeysetPage } from '@/lib/pagination/keyset'
import { RANK_ORDER, aheadOfRankFilter, type RankCursor, type RankPageParams } from '@/lib/pagination/rank-cursor'
import { assignRanks, type LeaderboardEntry } from './ranking'

export type MemberStanding = LeaderboardEntry & { memberCount: number }

type ProfileRow = { id: string; display_name: string; balance: number }

const rankKey = (p: ProfileRow): RankCursor => ({ balance: p.balance, name: p.display_name, id: p.id })

function boardQuery(supabase: SupabaseClient, filter: string | null, limit: number) {
  let query = supabase.from('profiles').select('id, display_name, balance')
  if (filter) query = query.or(filter)
  return query
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit)
}

// Ranks are competition ranks over the whole board, whichever slice of it is on screen. A window
// that starts mid-board counts two things about its first row: the members with more coins, whose
// count fixes the rank of the first row's whole tie group, and every member ahead of it in the
// order, which includes the start of a tie that straddles the boundary and so fixes where the
// window's later groups rank. The key columns are the whole row, so the probe needs no fetchKeys.
export async function getLeaderboardPage(supabase: SupabaseClient, page: RankPageParams): Promise<KeysetPage<LeaderboardEntry>> {
  const result = await readOrdered(
    page,
    RANK_ORDER,
    async (filter, limit) => {
      const { data, error } = await boardQuery(supabase, filter, limit)
      if (error) throw error
      return (data ?? []) as ProfileRow[]
    },
    rankKey,
  )

  const ranked = assignRanks(result.rows.map((p) => ({ id: p.id, displayName: p.display_name, balance: p.balance })))
  if (!result.windowed || result.rows.length === 0) return { ...result, rows: ranked }

  const first = result.rows[0]
  const [above, ahead] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gt('balance', first.balance),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).or(aheadOfRankFilter(rankKey(first))),
  ])
  if (above.error) throw above.error
  if (ahead.error) throw ahead.error

  return {
    ...result,
    rows: ranked.map((m) => ({
      ...m,
      rank: m.balance === first.balance ? (above.count ?? 0) + 1 : (ahead.count ?? 0) + m.rank,
    })),
  }
}

// Reads one profile, then counts rather than loading every member, so the member page's cost
// doesn't grow with the membership. `isUuid(memberId)` must be checked by the caller first:
// a malformed id reaches `.eq('id', …)` here, which errors instead of matching no rows.
export async function getMemberStanding(supabase: SupabaseClient, memberId: string): Promise<MemberStanding | null> {
  const { data: member, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance')
    .eq('id', memberId)
    .maybeSingle()
  if (error) throw error
  if (!member) return null

  const [above, everyone] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).gt('balance', member.balance),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
  ])
  if (above.error) throw above.error
  if (everyone.error) throw everyone.error

  return {
    id: member.id as string,
    displayName: member.display_name as string,
    balance: member.balance as number,
    rank: (above.count ?? 0) + 1,
    memberCount: everyone.count ?? 0,
  }
}
```

Run: `npx vitest run tests/lib/social/leaderboard.test.ts`
Expected: PASS, 4 tests.

Run: `npx vitest run tests/db/leaderboard-page.test.ts tests/db/social-readers.test.ts`
Expected: PASS. `leaderboard-page.test.ts` passes 5 tests, and every test in `social-readers.test.ts` passes. The tie runs over positions 48–53 of 60, and its names include a quote, a backslash, a comma, parentheses and an emoji:
- the extend ranks it 48 on both sides of the page boundary
- a window that starts inside the tie ranks its first rows 48, then 54
- a window that starts just past the tie begins at 54

`tsc` still fails on `app/(app)/leaderboard/page.tsx`, which imports `getLeaderboard`, until Step 6.

- [ ] **Step 5: Write the failing page and row tests**

Create `tests/components/leaderboard-page.test.tsx`. It renders the server component by awaiting it, with the reader, the session and the live subscription mocked:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { LeaderboardEntry } from '@/lib/social/ranking'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { getLeaderboardPage, requestShowMoreFocus } = vi.hoisted(() => ({
  getLeaderboardPage: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/social/leaderboard', () => ({ getLeaderboardPage }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace: _replace,
    transitionTypes: _transitionTypes,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; transitionTypes?: string[]; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import LeaderboardPage from '@/app/(app)/leaderboard/page'
import { encodeRankCursor } from '@/lib/pagination/rank-cursor'

const member = (n: number, balance: number, rank: number): LeaderboardEntry => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  displayName: `Member ${n}`,
  balance,
  rank,
})

async function renderPage(board: KeysetPage<LeaderboardEntry>, searchParams: Record<string, string> = {}) {
  getLeaderboardPage.mockResolvedValue(board)
  render(await LeaderboardPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

beforeEach(() => {
  getLeaderboardPage.mockReset()
  requestShowMoreFocus.mockReset()
})

describe('LeaderboardPage', () => {
  it('reads the range and window cursors from before and before_from', async () => {
    const bottom = { balance: 10, name: 'Member 9', id: member(9, 10, 9).id }
    await renderPage({ rows: [member(1, 50, 1), member(2, 40, 2)], next: null, windowed: false }, { before: encodeRankCursor(bottom) })
    expect(getLeaderboardPage).toHaveBeenCalledWith({}, { top: null, bottom })
  })

  it('shows Show more under the ranks, keeping the scroll position, and moves focus to the first new member', async () => {
    await renderPage({
      rows: [member(1, 50, 1), member(2, 50, 1), member(3, 40, 3)],
      next: { kind: 'extend', cursor: 'NEXT', firstId: member(4, 30, 4).id },
      windowed: false,
    })

    expect(screen.getByRole('listitem', { name: /Rank 1.*Member 1/ })).toHaveAttribute('id', `member-${member(1, 50, 1).id}`)
    expect(screen.getAllByText('Rank 1', { exact: false })).toHaveLength(2)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    const showMore = screen.getByRole('link', { name: 'Show more' })
    expect(showMore).toHaveAttribute('href', '/leaderboard?before=NEXT')
    expect(showMore).toHaveAttribute('data-scroll', 'false')

    fireEvent.click(showMore)
    expect(requestShowMoreFocus).toHaveBeenCalledWith(`member-${member(4, 30, 4).id}`)
  })

  it('starts a fresh window at the top of the page, with Back to newest above it', async () => {
    await renderPage(
      { rows: [member(501, 5, 498), member(502, 4, 502)], next: { kind: 'window', cursor: 'WIN', firstId: 'x' }, windowed: true },
      { before_from: 'OLD' },
    )
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/leaderboard')
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('href', '/leaderboard?before_from=WIN')
    expect(screen.getByRole('link', { name: 'Show more' })).toHaveAttribute('data-scroll', 'true')
    expect(screen.getByText('Rank 498')).toBeInTheDocument()
  })

  it('says there is nothing older for a window past the end, not that there are no members', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { before_from: 'OLD' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toHaveAttribute('href', '/leaderboard')
    expect(screen.queryByText('No other members yet.')).toBeNull()
  })

  it('keeps its empty state for a board of one', async () => {
    await renderPage({ rows: [member(1, 100, 1)], next: null, windowed: false })
    expect(screen.getByText('No other members yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
  })
})
```

In `tests/components/leaderboard-row.test.tsx`, add at the end of the `describe`, just before the file's final `})`:

```tsx
  it('is a focus target named from its rank, name and balance when given a DOM id', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" balance={90} isMe={false} href="/members/bob" domId="member-bob" />
      </ol>,
    )
    const row = screen.getByRole('listitem', { name: /Rank 2.*Bob.*90 DC/ })
    expect(row).toHaveAttribute('id', 'member-bob')
    expect(row).toHaveAttribute('tabindex', '-1')
  })
```

Run: `npx vitest run tests/components/leaderboard-page.test.tsx tests/components/leaderboard-row.test.tsx`
Expected: FAIL.
- All 5 page tests fail. The page still imports `getLeaderboard`, which the mock doesn't define.
- The new row test fails, because `LeaderboardRow` has no `domId` yet. The other 5 row tests pass.

- [ ] **Step 6: Page the leaderboard**

Replace `components/leaderboard/leaderboard-row.tsx` with:

```tsx
import Link from 'next/link'
import { Avatar } from '@/components/ui/avatar'
import { focusTarget } from '@/lib/pagination/row-id'
import { cn } from '@/lib/utils'

export function LeaderboardRow({
  rank,
  name,
  balance,
  isMe,
  href,
  domId,
}: {
  rank: number
  name: string
  balance: number
  isMe: boolean
  href: string
  domId?: string
}) {
  return (
    <li
      {...focusTarget(domId)}
      className={cn('flex min-h-[60px] items-center gap-3 rounded-[12px] px-2.5 py-2.5 md:px-3.5', isMe && 'bg-acc-soft')}
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-control text-lg font-extrabold tabular-nums',
          rank === 1 ? 'bg-lime text-on-lime' : 'bg-sunk text-ink',
        )}
      >
        <span aria-hidden="true">{rank}</span>
        <span className="sr-only">Rank {rank}</span>
      </span>
      <Avatar name={name} />
      <span className="grow text-[17px] font-extrabold">
        <Link href={href} transitionTypes={['nav-forward']} className="hit-area">
          {name}
        </Link>
        {isMe && <span className="font-semibold text-ink2"> (you)</span>}
      </span>
      <span className="text-[17px] font-extrabold tabular-nums">{balance} DC</span>
    </li>
  )
}
```

Replace `app/(app)/leaderboard/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { getLeaderboardPage } from '@/lib/social/leaderboard'
import { newestHref, showMoreHref } from '@/lib/pagination/cursor'
import { readRankPageParams } from '@/lib/pagination/rank-cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row'

const ROW_ID_PREFIX = 'member'

export default async function LeaderboardPage(props: PageProps<'/leaderboard'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboardPage(supabase, readRankPageParams(searchParams, 'before'))
  const backToNewestHref = newestHref('/leaderboard', searchParams, 'before')

  return (
    <Page transition="tab">
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} />
      <ShowMoreFocus />
      {board.windowed && board.rows.length === 0 ? (
        <NothingOlder href={backToNewestHref} />
      ) : !board.windowed && board.rows.length <= 1 ? (
        <EmptyState icon={Trophy} title="No other members yet.">
          Invite friends to start the competition.
        </EmptyState>
      ) : (
        <SectionCard
          title={<span className="sr-only">Rankings</span>}
          titleId="leaderboard-rankings"
          className="max-w-[820px] gap-0 py-1.5 px-2 md:py-1.5 md:px-3"
        >
          {board.windowed && (
            <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
              <BackToNewest href={backToNewestHref} />
            </div>
          )}
          <ol className="flex flex-col">
            {board.rows.map((member) => (
              <LeaderboardRow
                key={member.id}
                rank={member.rank}
                name={member.displayName}
                balance={member.balance}
                isMe={member.id === user.id}
                href={`/members/${member.id}`}
                domId={rowDomId(ROW_ID_PREFIX, member.id)}
              />
            ))}
          </ol>
          {board.next && (
            <div className="flex flex-col px-2.5 py-2.5 md:px-3.5">
              <ShowMore
                href={showMoreHref('/leaderboard', searchParams, 'before', board.next)}
                fresh={board.next.kind === 'window'}
                focusId={rowDomId(ROW_ID_PREFIX, board.next.firstId)}
              />
            </div>
          )}
        </SectionCard>
      )}
    </Page>
  )
}
```

Run: `npx vitest run tests/components/leaderboard-page.test.tsx tests/components/leaderboard-row.test.tsx`
Expected: PASS, 11 tests (5 + 6).

Run: `npx next typegen && npx tsc --noEmit`
Expected: PASS.

Run: `grep -rn "getLeaderboard\b" app components lib tests e2e`
Expected: no output. Nothing refers to the removed reader any more.

- [ ] **Step 7: Verify**

Local Supabase must be running. This task has no migration.

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1166 tests in 173 files: 48 more tests and 4 more files than after Task 3 (1118 in 169).
- **The 48:**
  - `rank-cursor` 33, `leaderboard` 4 and `leaderboard-page` 5 (new unit and jsdom files)
  - `tests/db/leaderboard-page.test.ts` 5 (a new DB file)
  - `leaderboard-row` +1
  - `social-readers` keeps its count, because its two leaderboard tests are rewritten, not added
- **Build:** the same 20 routes.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, with no spec changed.
- `social.spec.ts` still finds `getByRole('link', { name: 'Alice' })` on `/leaderboard`. Its member row's accessible name is now its text, but the link inside it keeps its own name.
- `skeletons.spec.ts`'s leaderboard skeleton and h1 are untouched.

- [ ] **Step 8: Commit**

```bash
git add lib/pagination/keyset.ts lib/pagination/rank-cursor.ts lib/social/leaderboard.ts \
  "app/(app)/leaderboard/page.tsx" components/leaderboard/leaderboard-row.tsx \
  tests/lib/pagination/rank-cursor.test.ts tests/lib/social/leaderboard.test.ts tests/lib/fake-supabase.ts \
  tests/components/leaderboard-page.test.tsx tests/components/leaderboard-row.test.tsx \
  tests/db/leaderboard-page.test.ts tests/db/social-readers.test.ts tests/db/fixtures.ts
git commit -m "Page the leaderboard 50 at a time, with ranks counted across the whole board"
```

---

## Task 5: Open-markets paging

`listOpenMarkets` reads every open market in one request today. This task pages it like the closed list, on the list page's own params (spec 2b):
- the newest 50 by `(created_at, id)`, using the same keyset helpers and the keys-only probe from Task 3
- "Show more", and "Back to newest" and "Nothing older here" for a fresh window
- focus moving to the first new card

**Search params:** `open` and `open_from`. The closed list keeps `resolved` and `resolved_from`. The two lists page independently: each "Back to newest" clears only its own list's params, so the other list keeps its position.

**The reader.** The open and closed lists differ only in their statuses, so both now go through one `listMarkets(supabase, statuses, page)`, over one query builder, `marketsQuery`, which serves the range read and the probe alike.
- **The status filter.** The open list's filter becomes `.in('status', ['open'])`, which is equivalent to the old `.eq`. There is no status index to prefer either way.
- **Embed ordering.** Only the full read carries the `market_outcomes` embed, and with it the embed's `referencedTable` ordering, which PostgREST would reject on a probe that has no embed.
- **Open, not awaiting.** `listOpenMarkets` still returns every open market, awaiting ones included. The page splits them into "Open" and "Awaiting resolution" by close time, as today.

**The page.**
- **Layout.** The page lays out, top to bottom:
  - the open list's window heading ("Back to newest", or "Nothing older here")
  - the "Open" and "Awaiting resolution" groups
  - the open list's "Show more"
  - the closed list's window heading
  - the "Resolved" and "Voided" groups
  - the closed list's "Show more"

  Each "Show more" follows its own list's groups, so the heading before it names what it extends: WCAG's H80, link purpose from the preceding heading.
- **Empty states.** "No markets yet." shows only when both lists are empty and neither is windowed.
- **Focus targets.** Open cards use the prefix `market-open` and closed cards `market-closed`. Both prefixes stay distinct even if a market changes lists between the two reads.
- **Sparklines** are still read once, for exactly the cards shown: the open page's rows, then the closed page's.

**Files:**
- Modify: `lib/markets/list-markets.ts`, `app/(app)/markets/(list)/page.tsx`, `components/ui/show-more.tsx` (an optional `description`)
- Test, create: `tests/components/markets-page.test.tsx`
- Test, modify: `tests/lib/markets/list-markets.test.ts`, `tests/db/list-markets.test.ts`, `tests/components/show-more.test.tsx`

**Interfaces:**
- Consumes:
  - `readKeyset` with `fetchKeys`, `KeyColumns` and `KeysetPage` (`lib/pagination/keyset.ts`, Tasks 3–4)
  - `readPageParams`, `showMoreHref`, `newestHref` and `encodeCursor` (`lib/pagination/cursor.ts`), and `rowDomId` (`lib/pagination/row-id.ts`)
  - `ShowMore` with `focusId`, `BackToNewest`, `ShowMoreFocus` and `NothingOlder` (Task 3)
  - `MarketCard`'s `domId` (Task 3)
  - `readSparklines` (`lib/markets/sparklines.ts`, unchanged)
  - The state Task 3 left `app/(app)/markets/(list)/page.tsx` in. This task replaces the whole file.
- Produces:

```ts
// lib/markets/list-markets.ts
export async function listOpenMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>>
export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> // unchanged signature
export async function countOpenMarkets(supabase: SupabaseClient): Promise<number> // unchanged
// app/(app)/markets/(list)/page.tsx reads `open` / `open_from` and `resolved` / `resolved_from`
```

- [ ] **Step 1: Write the failing reader tests**

Replace `tests/lib/markets/list-markets.test.ts` with:

```ts
import { describe, it, expect } from 'vitest'
import { countOpenMarkets, listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { fakeSupabase } from '../fake-supabase'

const RESOLUTION_EMBED = 'current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)'

function marketRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
    title: 'Will it rain?',
    kind: 'binary',
    status: 'resolved',
    close_at: '2026-09-20T09:00:00+00:00',
    created_at: '2026-09-19T09:00:00.123456+00:00',
    current_resolution: { outcome_id: 'o-yes', resolved_at: '2026-09-21T09:00:00+00:00' },
    market_outcomes: [
      { id: 'o-no', label: 'No', pool_total: 5 },
      { id: 'o-yes', label: 'Yes', pool_total: 15 },
    ],
    ...overrides,
  }
}

describe('listOpenMarkets', () => {
  it('reads only open markets, 50 newest first, with the resolution embedded in the same request', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [marketRow({ status: 'open', current_resolution: null })] }))

    const page = await listOpenMarkets(client, { top: null, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0].select).toContain(RESOLUTION_EMBED)
    expect(queries[0].in).toEqual([['status', ['open']]])
    expect(queries[0].limit).toBe(50)
    expect(queries[0].order.slice(0, 2)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(page.next).toBeNull()
    expect(page.rows).toEqual([
      {
        id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f',
        title: 'Will it rain?',
        kind: 'binary',
        status: 'open',
        closeAt: '2026-09-20T09:00:00+00:00',
        resolvedOutcomeLabel: null,
        resolvedAt: null,
        outcomes: [
          { id: 'o-no', label: 'No', poolTotal: 5 },
          { id: 'o-yes', label: 'Yes', poolTotal: 15 },
        ],
      },
    ])
  })

  it('probes only the keys of the next open markets, with the same filter and order', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      marketRow({ id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(1000 - i).padStart(12, '0')}`, status: 'open', current_resolution: null }),
    )
    const probed = [marketRow({ id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001', status: 'open', current_resolution: null })]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? rows : probed }))

    const page = await listOpenMarkets(client, { top: null, bottom: null })

    const [read, probe] = queries
    expect(probe.select).toBe('id, created_at')
    expect(probe.in).toEqual([['status', ['open']]])
    expect(probe.order).toEqual(read.order.slice(0, 2))
    expect(page.rows).toHaveLength(50)
    expect(page.next).toMatchObject({ kind: 'extend', firstId: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
  })

  it('ignores a cursor whose id is not a market id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await listOpenMarkets(client, { top: { ts: '2026-09-19T09:00:00Z', id: '42' }, bottom: null })
    expect(queries[0].or).toEqual([])
    expect(page.windowed).toBe(false)
  })
})

describe('listClosedMarkets', () => {
  it('reads resolved and voided markets as one list of 50, labelling each resolution from the embed', async () => {
    const { client, queries } = fakeSupabase(() => ({
      data: [marketRow(), marketRow({ id: '1b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f', status: 'voided', current_resolution: null })],
    }))

    const page = await listClosedMarkets(client, { top: null, bottom: null })

    expect(queries).toHaveLength(1)
    expect(queries[0].in).toEqual([['status', ['resolved', 'voided']]])
    expect(queries[0].limit).toBe(50)
    expect(page.rows.map((m) => [m.status, m.resolvedOutcomeLabel, m.resolvedAt])).toEqual([
      ['resolved', 'Yes', '2026-09-21T09:00:00+00:00'],
      ['voided', null, null],
    ])
    expect(page.next).toBeNull()
  })

  it('probes only the keys of the next closed markets, with the same filter and order, and no embeds', async () => {
    const rows = Array.from({ length: 50 }, (_, i) =>
      marketRow({ id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(1000 - i).padStart(12, '0')}` }),
    )
    const probed = [marketRow({ id: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001', created_at: '2026-09-18T09:00:00+00:00' })]
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? rows : probed }))

    const page = await listClosedMarkets(client, { top: null, bottom: null })

    const [read, probe] = queries
    expect(read.select).toContain(RESOLUTION_EMBED)
    expect(probe.select).toBe('id, created_at')
    expect(probe.in).toEqual(read.in)
    expect(probe.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.order).toEqual([
      ...probe.order,
      ['created_at', { referencedTable: 'market_outcomes' }],
      ['label', { referencedTable: 'market_outcomes' }],
    ])
    expect(page.next).toMatchObject({ kind: 'extend', firstId: '0b9c3f5e-8a1d-4c2b-9e7f-000000000001' })
  })

  it('ignores a cursor whose id is not a market id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    await listClosedMarkets(client, { top: null, bottom: { ts: '2026-09-19T09:00:00Z', id: '42' } })
    expect(queries[0].or).toEqual([])
    expect(queries[0].limit).toBe(50)
  })
})

describe('countOpenMarkets', () => {
  it('counts open markets without reading any rows', async () => {
    const { client, queries } = fakeSupabase(() => ({ count: 7 }))
    expect(await countOpenMarkets(client)).toBe(7)
    expect(queries[0].selectOptions).toEqual({ count: 'exact', head: true })
    expect(queries[0].eq).toEqual([['status', 'open']])
  })

  it('throws when the count fails', async () => {
    const { client } = fakeSupabase(() => ({ error: new Error('count failed') }))
    await expect(countOpenMarkets(client)).rejects.toThrow('count failed')
  })
})
```

Replace `tests/db/list-markets.test.ts` with the version below. The open-list tests read `.rows` from a page, and two tests are new:
- **Paging across a tie.** 60 open markets, inserted directly, share `created_at` in pairs offset by one, so the 50th and 51st newest tie and only the id orders them. The first page stops inside the tie, "Show more" extends to all 60, and a fresh window that starts inside the tie begins exactly there.
- **A window past the end.** It comes back empty and windowed.
- **The closed list's paging test, corrected.** It says its pairs make the 50th and 51st tie, but `Math.floor(i / 2)` over 60 rows puts positions 49 and 50 (0-based) in different pairs, so it never crossed a tie at the boundary. Its pairs are now offset by one, as the open test's are, and it asserts the tie.

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { countOpenMarkets, listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { encodeCursor, readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

let alice: Member
let bob: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function closeNow(marketId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('markets')
    .update({ close_at: new Date(Date.now() - 1000).toISOString() })
    .eq('id', marketId)
  if (error) throw error
}

async function resolve(marketId: string, outcomeId: string): Promise<void> {
  const { error } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeId })
  if (error) throw error
}

async function voidMarket(marketId: string): Promise<void> {
  const { error } = await aliceClient.rpc('void_market', { p_market_id: marketId })
  if (error) throw error
}

describe('listOpenMarkets', () => {
  it('lists only open markets, newest first, awaiting ones included, with no resolution time', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Older' })
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Newer' })
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Awaiting' })
    await closeNow(awaiting.marketId)
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided' })
    await voidMarket(voided.marketId)

    const { rows: markets, next } = await listOpenMarkets(bobClient, FIRST)

    expect(markets.map((m) => m.title)).toEqual(['Awaiting', 'Newer', 'Older'])
    expect(markets.every((m) => m.status === 'open' && m.resolvedAt === null && m.resolvedOutcomeLabel === null)).toBe(true)
    expect(markets.map((m) => m.id)).not.toContain(voided.marketId)
    expect(next).toBeNull()
  })

  it("orders a market's outcomes by label when they tie on creation time, regardless of input order", async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Zebra', 'Apple', 'Mango'])

    const { rows } = await listOpenMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Apple', 'Mango', 'Zebra'])
  })

  it("orders a market's outcomes by creation time before label, even when that disagrees with alphabetical order", async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Alpha', 'Beta'])
    // create_market() inserts every outcome in one transaction, so they normally tie on
    // created_at. Backdating one simulates the untied case and proves created_at wins.
    await serviceClient()
      .from('market_outcomes')
      .update({ created_at: new Date(Date.now() - 60_000).toISOString() })
      .eq('id', outcomeIds[1])

    const { rows } = await listOpenMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Beta', 'Alpha'])
  })

  it('is empty for an uninvited session', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const carol = await makeMember('Carol')
    expect(await listOpenMarkets(await clientFor(carol), FIRST)).toEqual({ rows: [], next: null, windowed: false })
  })

  it('pages 50 at a time across a created_at tie, and a fresh window starts inside the tie', async () => {
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly, as the closed list's paging test does. Markets share a created_at in
    // pairs offset by one, so the 50th and 51st newest tie and only the id orders them.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      created_by: alice.id,
      title: `Open ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'open',
      close_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_at: `${new Date(start + Math.floor((i + 1) / 2) * 60_000).toISOString().slice(0, 19)}.000456+00:00`,
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const { data: all, error: allErr } = await serviceClient()
      .from('markets')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (allErr) throw allErr
    const everything = all.map((m) => m.id as string)
    expect(all[49].created_at).toBe(all[50].created_at)

    const first = await listOpenMarkets(bobClient, FIRST)
    expect(first.rows.map((m) => m.id)).toEqual(everything.slice(0, 50))
    expect(first.next).toMatchObject({ kind: 'extend', firstId: everything[50] })

    const href = new URL(showMoreHref('/markets', {}, 'open', first.next!), 'http://localhost')
    const second = await listOpenMarkets(bobClient, readPageParams(Object.fromEntries(href.searchParams), 'open'))
    expect(second.rows.map((m) => m.id)).toEqual(everything)
    expect(second.next).toBeNull()

    const window = await listOpenMarkets(
      bobClient,
      readPageParams({ open_from: encodeCursor({ ts: all[50].created_at, id: everything[50] }) }, 'open'),
    )
    expect(window.windowed).toBe(true)
    expect(window.rows.map((m) => m.id)).toEqual(everything.slice(50))
  })

  it('reads a fresh window past the oldest open market as empty', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const pastTheEnd = encodeCursor({ ts: '2000-01-01T00:00:00Z', id: '00000000-0000-4000-8000-000000000000' })
    expect(await listOpenMarkets(bobClient, readPageParams({ open_from: pastTheEnd }, 'open'))).toEqual({
      rows: [],
      next: null,
      windowed: true,
    })
  })
})

describe('listClosedMarkets', () => {
  it('dates the current resolution, from the embedded join', async () => {
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'], { closeInMs: 1000 })
    await closeNow(marketId)
    await resolve(marketId, outcomeIds[0])

    const { data: resolution, error: resolutionErr } = await serviceClient()
      .from('market_resolutions')
      .select('resolved_at')
      .eq('market_id', marketId)
      .single()
    if (resolutionErr) throw resolutionErr

    const { rows } = await listClosedMarkets(bobClient, FIRST)
    const market = rows.find((m) => m.id === marketId)
    expect(market?.status).toBe('resolved')
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe(resolution.resolved_at)
  })

  it('shows the current resolution after an override, not the reversed one', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    await resolve(marketId, outcomeIds[0])
    await resolve(marketId, outcomeIds[1])

    const { rows } = await listClosedMarkets(bobClient, FIRST)
    expect(rows.find((m) => m.id === marketId)?.resolvedOutcomeLabel).toBe('No')
  })

  it('lists resolved and voided markets as one list, newest first, and no open ones', async () => {
    const resolved = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Resolved' })
    await closeNow(resolved.marketId)
    await resolve(resolved.marketId, resolved.outcomeIds[0])
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Voided' })
    await voidMarket(voided.marketId)
    await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Still open' })

    const page = await listClosedMarkets(bobClient, FIRST)

    expect(page.rows.map((m) => [m.title, m.status, m.resolvedOutcomeLabel])).toEqual([
      ['Voided', 'voided', null],
      ['Resolved', 'resolved', 'Yes'],
    ])
    expect(page.next).toBeNull()
  })

  it('pages 50 at a time, with nothing skipped or repeated across a tie', async () => {
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: sixty create/void round trips are slow, and the list never reads outcomes'
    // pools. Pairs share a created_at, offset by one, so the 50th/51st tie and the id breaks it.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      created_by: alice.id,
      title: `Closed ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'voided',
      close_at: new Date(start).toISOString(),
      created_at: `${new Date(start + Math.floor((i + 1) / 2) * 60_000).toISOString().slice(0, 19)}.000456+00:00`,
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const { data: all, error: allErr } = await serviceClient()
      .from('markets')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (allErr) throw allErr
    const everything = all.map((m) => m.id as string)
    expect(all[49].created_at).toBe(all[50].created_at)

    const first = await listClosedMarkets(bobClient, FIRST)
    expect(first.rows.map((m) => m.id)).toEqual(everything.slice(0, 50))
    expect(first.next?.kind).toBe('extend')

    const href = new URL(showMoreHref('/markets', {}, 'resolved', first.next!), 'http://localhost')
    const second = await listClosedMarkets(bobClient, readPageParams(Object.fromEntries(href.searchParams), 'resolved'))
    expect(second.rows.map((m) => m.id)).toEqual(everything)
    expect(second.next).toBeNull()
  })
})

describe('countOpenMarkets', () => {
  it('counts open markets, awaiting ones included, and not resolved or voided ones', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const awaiting = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(awaiting.marketId)
    const resolved = await createTestMarket(aliceClient, ['Yes', 'No'])
    await closeNow(resolved.marketId)
    await resolve(resolved.marketId, resolved.outcomeIds[0])
    const voided = await createTestMarket(aliceClient, ['Yes', 'No'])
    await voidMarket(voided.marketId)

    expect(await countOpenMarkets(bobClient)).toBe(2)
  })

  it('is 0 for an uninvited session', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const carol = await makeMember('Carol')
    expect(await countOpenMarkets(await clientFor(carol))).toBe(0)
  })
})
```

Run: `npx vitest run tests/lib/markets/list-markets.test.ts`
Expected: FAIL, 3 of 8. `listOpenMarkets` still takes no page, filters with `.eq`, and returns an array:
- "reads only open markets, 50 newest first, with the resolution embedded in the same request"
- "probes only the keys of the next open markets, with the same filter and order"
- the open list's "ignores a cursor whose id is not a market id"

Local Supabase must be running for the next command.

Run: `npx vitest run tests/db/list-markets.test.ts`
Expected: FAIL. All 6 `listOpenMarkets` tests fail, because the reader returns an array, not a page. The `listClosedMarkets` and `countOpenMarkets` tests (4 + 2) pass.

- [ ] **Step 2: Page the open markets reader**

Replace `lib/markets/list-markets.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cursor, PageParams } from '@/lib/pagination/cursor'
import { readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
import { isUuid } from '@/lib/uuid'

export interface MarketSummary {
  id: string
  title: string
  kind: 'binary' | 'multiple_choice'
  status: 'open' | 'resolved' | 'voided'
  closeAt: string
  resolvedOutcomeLabel: string | null
  resolvedAt: string | null
  outcomes: { id: string; label: string; poolTotal: number }[]
}

// The resolution is embedded through the market's own current_resolution_id, not read with a
// second `.in()` whose URL would grow with the list. The hint names the foreign key because
// market_resolutions also points back at markets through market_id.
const SUMMARY_SELECT =
  'id, title, kind, status, close_at, created_at, current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at), market_outcomes(id, label, pool_total)'

type SummaryRow = {
  id: string
  title: string
  kind: MarketSummary['kind']
  status: MarketSummary['status']
  close_at: string
  created_at: string
  current_resolution: { outcome_id: string; resolved_at: string } | null
  market_outcomes: { id: string; label: string; pool_total: number }[] | null
}

function toSummary(m: SummaryRow): MarketSummary {
  const outcomes = (m.market_outcomes ?? []).map((o) => ({ id: o.id, label: o.label, poolTotal: o.pool_total }))
  const resolution = m.current_resolution
  return {
    id: m.id,
    title: m.title,
    kind: m.kind,
    status: m.status,
    closeAt: m.close_at,
    resolvedOutcomeLabel: resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null,
    resolvedAt: resolution?.resolved_at ?? null,
    outcomes,
  }
}

const MARKET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isUuid }

const marketKey = (m: { id: string; created_at: string }): Cursor => ({ ts: m.created_at, id: m.id })

// The range read and its key probe share one builder, so the two can't drift apart on filters.
function marketsQuery(
  supabase: SupabaseClient,
  statuses: MarketSummary['status'][],
  columns: string,
  filter: string | null,
  limit: number,
) {
  let query = supabase.from('markets').select(columns).in('status', statuses)
  if (filter) query = query.or(filter)
  return query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit)
}

async function listMarkets(
  supabase: SupabaseClient,
  statuses: MarketSummary['status'][],
  page: PageParams,
): Promise<KeysetPage<MarketSummary>> {
  const result = await readKeyset(
    page,
    MARKET_KEYS,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, SUMMARY_SELECT, filter, limit)
        // Same tiebreak as getMarket: insertion time, then label, so outcome order (and
        // therefore colour assignment) is stable across requests.
        .order('created_at', { referencedTable: 'market_outcomes' })
        .order('label', { referencedTable: 'market_outcomes' })
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    marketKey,
    async (filter, limit) => {
      const { data, error } = await marketsQuery(supabase, statuses, 'id, created_at', filter, limit)
      if (error) throw error
      return ((data ?? []) as unknown as { id: string; created_at: string }[]).map(marketKey)
    },
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

// Open markets include those past their close time and awaiting resolution; the page splits them.
export async function listOpenMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['open'], page)
}

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  return listMarkets(supabase, ['resolved', 'voided'], page)
}

export async function countOpenMarkets(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (error) throw error
  return count ?? 0
}
```

Run: `npx vitest run tests/lib/markets/list-markets.test.ts`
Expected: PASS, 8 tests.

Run: `npx vitest run tests/db/list-markets.test.ts`
Expected: PASS, 12 tests.

`tsc` fails on `app/(app)/markets/(list)/page.tsx` until Step 4, because the page still calls `listOpenMarkets(supabase)`.

- [ ] **Step 3: Write the failing page tests**

Create `tests/components/markets-page.test.tsx`. It renders the server component by awaiting it, with the readers, the session and the live subscription mocked. `outline()` reads the page's group headings and paging links in document order:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { MarketSummary } from '@/lib/markets/list-markets'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

const { listOpenMarkets, listClosedMarkets, readSparklines, requestShowMoreFocus } = vi.hoisted(() => ({
  listOpenMarkets: vi.fn(),
  listClosedMarkets: vi.fn(),
  readSparklines: vi.fn(),
  requestShowMoreFocus: vi.fn(),
}))
vi.mock('@/lib/markets/list-markets', () => ({ listOpenMarkets, listClosedMarkets }))
vi.mock('@/lib/markets/sparklines', () => ({ readSparklines }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase: {}, user: { id: 'p-me' } }) }))
vi.mock('@/components/live/live-tables', () => ({ LiveTables: () => null }))
vi.mock('@/components/ui/show-more-focus', () => ({ ShowMoreFocus: () => null, requestShowMoreFocus }))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
// A plain click runs onNavigate, as the App Router's Link does for a client-side navigation.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace: _replace,
    transitionTypes: _transitionTypes,
    onNavigate,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean; transitionTypes?: string[]; onNavigate?: () => void }) => (
    <a
      href={href}
      data-scroll={String(scroll ?? true)}
      onClick={(event) => {
        event.preventDefault()
        onNavigate?.()
      }}
      {...props}
    />
  ),
}))

import MarketsPage from '@/app/(app)/markets/(list)/page'
import { encodeCursor } from '@/lib/pagination/cursor'

const DAY = 86_400_000
const EMPTY: KeysetPage<MarketSummary> = { rows: [], next: null, windowed: false }

function market(n: number, status: MarketSummary['status'], closeInMs = DAY): MarketSummary {
  return {
    id: `0b9c3f5e-8a1d-4c2b-9e7f-${String(n).padStart(12, '0')}`,
    title: `Market ${n}`,
    kind: 'binary',
    status,
    closeAt: new Date(Date.now() + closeInMs).toISOString(),
    resolvedOutcomeLabel: status === 'resolved' ? 'Yes' : null,
    resolvedAt: status === 'resolved' ? new Date(Date.now() - DAY).toISOString() : null,
    outcomes: [],
  }
}

async function renderPage(
  open: KeysetPage<MarketSummary>,
  closed: KeysetPage<MarketSummary>,
  searchParams: Record<string, string> = {},
) {
  listOpenMarkets.mockResolvedValue(open)
  listClosedMarkets.mockResolvedValue(closed)
  render(await MarketsPage({ params: Promise.resolve({}), searchParams: Promise.resolve(searchParams) }))
}

// The order the page lays its landmarks out in, top to bottom: group headings and paging links.
function outline(): string[] {
  return [...document.querySelectorAll('h2, a')]
    .map((el) => el.textContent ?? '')
    .filter((text) => ['Open', 'Awaiting resolution', 'Resolved', 'Voided', 'Show more', 'Back to newest'].includes(text))
}

beforeEach(() => {
  listOpenMarkets.mockReset()
  listClosedMarkets.mockReset()
  readSparklines.mockReset()
  readSparklines.mockResolvedValue(new Map())
  requestShowMoreFocus.mockReset()
})

describe('MarketsPage', () => {
  it('reads each list from its own params, and sparklines for exactly the cards shown', async () => {
    const openTop = { ts: '2026-09-20T10:00:00Z', id: market(1, 'open').id }
    const closedEnd = { ts: '2026-09-10T10:00:00Z', id: market(9, 'voided').id }
    await renderPage(
      { rows: [market(1, 'open'), market(2, 'open', -DAY)], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: false },
      { open_from: encodeCursor(openTop), resolved: encodeCursor(closedEnd) },
    )
    expect(listOpenMarkets).toHaveBeenCalledWith({}, { top: openTop, bottom: null })
    expect(listClosedMarkets).toHaveBeenCalledWith({}, { top: null, bottom: closedEnd })
    expect(readSparklines).toHaveBeenCalledWith({}, [market(1, 'open').id, market(2, 'open').id, market(9, 'voided').id])
  })

  it('puts the open list’s Show more under its groups and the closed list’s under theirs', async () => {
    await renderPage(
      {
        rows: [market(1, 'open'), market(2, 'open', -DAY)],
        next: { kind: 'extend', cursor: 'OPEN', firstId: market(3, 'open').id },
        windowed: false,
      },
      {
        rows: [market(8, 'resolved'), market(9, 'voided')],
        next: { kind: 'window', cursor: 'CLOSED', firstId: market(10, 'voided').id },
        windowed: false,
      },
      { tab: 'x' },
    )

    expect(outline()).toEqual(['Open', 'Awaiting resolution', 'Show more', 'Resolved', 'Voided', 'Show more'])
    const [openMore, closedMore] = screen.getAllByRole('link', { name: 'Show more' })
    expect(openMore).toHaveAttribute('href', '/markets?tab=x&open=OPEN')
    expect(openMore).toHaveAttribute('data-scroll', 'false')
    expect(closedMore).toHaveAttribute('href', '/markets?tab=x&resolved_from=CLOSED')
    expect(closedMore).toHaveAttribute('data-scroll', 'true')

    expect(openMore).toHaveAccessibleDescription('Open markets')
    expect(closedMore).toHaveAccessibleDescription('Closed markets')

    fireEvent.click(openMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-open-${market(3, 'open').id}`)
    fireEvent.click(closedMore)
    expect(requestShowMoreFocus).toHaveBeenLastCalledWith(`market-closed-${market(10, 'voided').id}`)
  })

  it('gives every card a focus target named for the list it came from', async () => {
    await renderPage({ rows: [market(1, 'open')], next: null, windowed: false }, { rows: [market(9, 'voided')], next: null, windowed: false })
    expect(screen.getByRole('article', { name: /Market 1/ })).toHaveAttribute('id', `market-open-${market(1, 'open').id}`)
    expect(screen.getByRole('article', { name: /Market 9/ })).toHaveAttribute('id', `market-closed-${market(9, 'voided').id}`)
  })

  it('shows Back to newest above each windowed list, leaving the other list’s position alone', async () => {
    await renderPage(
      { rows: [market(1, 'open')], next: null, windowed: true },
      { rows: [market(9, 'voided')], next: null, windowed: true },
      { open_from: 'A', resolved_from: 'B' },
    )
    expect(outline()).toEqual(['Back to newest', 'Open', 'Back to newest', 'Voided'])
    const [openBack, closedBack] = screen.getAllByRole('link', { name: 'Back to newest' })
    expect(openBack).toHaveAttribute('href', '/markets?resolved_from=B')
    expect(closedBack).toHaveAttribute('href', '/markets?open_from=A')
  })

  it('says there is nothing older for an open window past the end, and still shows the closed list', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { rows: [market(9, 'voided')], next: null, windowed: false }, { open_from: 'A' })
    expect(screen.getByText('Nothing older here.')).toBeInTheDocument()
    expect(screen.queryByText('No markets yet.')).toBeNull()
    expect(outline()).toEqual(['Back to newest', 'Voided'])
  })

  it('says there is nothing older, not that there are no markets, when both windows are past the end', async () => {
    await renderPage({ rows: [], next: null, windowed: true }, { rows: [], next: null, windowed: true }, { open_from: 'A', resolved_from: 'B' })
    expect(screen.getAllByText('Nothing older here.')).toHaveLength(2)
    expect(screen.queryByText('No markets yet.')).toBeNull()
  })

  it('keeps its empty state when there are no markets at all', async () => {
    await renderPage(EMPTY, EMPTY)
    expect(screen.getByText('No markets yet.')).toBeInTheDocument()
    expect(screen.queryByText('Nothing older here.')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })
})
```

Run: `npx vitest run tests/components/markets-page.test.tsx`
Expected: FAIL, 7 of 7. The page still spreads `listOpenMarkets`'s result as an array (`TypeError: open is not iterable`).

- [ ] **Step 3b: Let `ShowMore` say which list it extends**

`/markets` has two "Show more" links. Both keep the accessible name "Show more", so every existing selector still resolves. Each also gets an accessible description, "Open markets" or "Closed markets", so a screen reader's links list can tell them apart. The description lives in a `hidden` span that `aria-describedby` references. A hidden element named by `aria-describedby` still counts toward the description, and it never shows up in the reading order.

Add this case at the end of `describe('ShowMore', …)` in `tests/components/show-more.test.tsx`:

```tsx
  it('keeps its name and adds a description of the list it extends, when given one', () => {
    render(<ShowMore href="/markets?open=abc" description="Open markets" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAccessibleDescription('Open markets')
  })
```

Run: `npx vitest run tests/components/show-more.test.tsx`
Expected: FAIL, the new case only. It has no description.

In `components/ui/show-more.tsx`, add `useId` to the imports (`import { useId } from 'react'`; the file is already `'use client'`), then replace the `ShowMore` function with:

```tsx
// `description` names the list when a page has more than one "Show more" (the markets list's open
// and closed lists), so they're distinguishable out of context while their name stays "Show more".
export function ShowMore({
  href,
  fresh = false,
  focusId,
  description,
}: {
  href: string
  fresh?: boolean
  focusId?: string
  description?: string
}) {
  const descriptionId = useId()
  return (
    <>
      <Link
        href={href}
        scroll={fresh}
        replace
        className={linkClass}
        aria-describedby={description ? descriptionId : undefined}
        onNavigate={focusId ? () => requestShowMoreFocus(focusId) : undefined}
      >
        Show more
      </Link>
      {description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
    </>
  )
}
```

Keep the existing comment block above the function; the new comment goes directly above `export function ShowMore`. If `show-more.tsx` isn't `'use client'` at this point (Task 3 made it one, for `onNavigate`), stop and report: `useId` needs no client boundary, but the rest of Task 3 assumes one.

Run: `npx vitest run tests/components/show-more.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 4: Wire the open list into the markets page**

Replace `app/(app)/markets/(list)/page.tsx` with:

```tsx
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { readSparklines } from '@/lib/markets/sparklines'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { rowDomId } from '@/lib/pagination/row-id'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { NothingOlder } from '@/components/ui/nothing-older'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ShowMoreFocus } from '@/components/ui/show-more-focus'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

const OPEN_GROUPS: MarketCardStatus[] = ['open', 'awaiting']
const OPEN_ROW_ID_PREFIX = 'market-open'
const CLOSED_ROW_ID_PREFIX = 'market-closed'

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [open, closed] = await Promise.all([
    listOpenMarkets(supabase, readPageParams(searchParams, 'open')),
    listClosedMarkets(supabase, readPageParams(searchParams, 'resolved')),
  ])
  const closedIds = new Set(closed.rows.map((m) => m.id))
  const markets = [...open.rows, ...closed.rows]
  const sparklinesByMarket = await readSparklines(
    supabase,
    markets.map((m) => m.id),
  )
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)

  const cards = markets.map((market) => {
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
    return {
      id: market.id,
      title: market.title,
      status: marketCardStatus(market.status, market.closeAt, now),
      kind: market.kind,
      closeAt: market.closeAt,
      resolvedAt: market.resolvedAt,
      outcomes: odds.map((o) => ({
        id: o.outcomeId,
        label: o.label,
        pct: o.impliedProbability === null ? null : Math.round(o.impliedProbability * 100),
      })),
      resolvedOutcomeLabel: market.resolvedOutcomeLabel,
      chart,
      domId: rowDomId(closedIds.has(market.id) ? CLOSED_ROW_ID_PREFIX : OPEN_ROW_ID_PREFIX, market.id),
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)
  const openGroups = groups.filter((group) => OPEN_GROUPS.includes(group.id))
  const closedGroups = groups.filter((group) => !OPEN_GROUPS.includes(group.id))

  // Each list's window says where it starts above its own groups: Back to newest, or, when the
  // window has no rows left, that there's nothing older, where those groups would have been.
  const windowTop = (list: typeof open, param: string) => {
    if (!list.windowed) return null
    const href = newestHref('/markets', searchParams, param)
    return list.rows.length > 0 ? <BackToNewest href={href} /> : <NothingOlder href={href} />
  }

  const renderGroup = (group: (typeof groups)[number]) => (
    <section key={group.id} aria-labelledby={`markets-${group.id}-heading`} className="flex flex-col gap-3">
      <h2 id={`markets-${group.id}-heading`} className={h2Class}>
        {group.heading}
      </h2>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {group.markets.map((market) => (
          <MarketCard key={market.id} {...market} />
        ))}
      </div>
    </section>
  )

  return (
    <Page transition="tab">
      <PageHeader
        title="Markets"
        action={
          <Link
            href="/markets/new"
            transitionTypes={['nav-forward']}
            className={cn(buttonVariants({ variant: 'primary', size: 'sm' }), 'md:min-h-12 md:px-5 md:text-base')}
          >
            <Plus aria-hidden="true" className="size-5" />
            Create market
          </Link>
        }
      />
      <LiveTables subscriptions={pageSubscriptions.markets()} />
      <ShowMoreFocus />
      {groups.length === 0 && !open.windowed && !closed.windowed ? (
        <EmptyState
          icon={ChartColumn}
          title="No markets yet."
          action={
            <Link
              href="/markets/new"
              transitionTypes={['nav-forward']}
              className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            >
              Create market
            </Link>
          }
        >
          Open the first one and get the duel started.
        </EmptyState>
      ) : (
        <>
          {windowTop(open, 'open')}
          {openGroups.map(renderGroup)}
          {open.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'open', open.next)}
              fresh={open.next.kind === 'window'}
              focusId={rowDomId(OPEN_ROW_ID_PREFIX, open.next.firstId)}
              description="Open markets"
            />
          )}
          {windowTop(closed, 'resolved')}
          {closedGroups.map(renderGroup)}
          {closed.next && (
            <ShowMore
              href={showMoreHref('/markets', searchParams, 'resolved', closed.next)}
              fresh={closed.next.kind === 'window'}
              focusId={rowDomId(CLOSED_ROW_ID_PREFIX, closed.next.firstId)}
              description="Closed markets"
            />
          )}
        </>
      )}
    </Page>
  )
}
```

Run: `npx vitest run tests/components/markets-page.test.tsx`
Expected: PASS, 7 tests.

Run: `npx next typegen && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify**

Local Supabase must be running. This task has no migration.

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1178 tests in 174 files: 12 more tests and 1 more file than after Task 4 (1166 in 173).
- **The 12:**
  - `markets-page` 7 (a new file)
  - `tests/lib/markets/list-markets.test.ts` +2
  - `tests/db/list-markets.test.ts` +2 (the corrected closed-list tie test keeps its count)
  - `tests/components/show-more.test.tsx` +1 (`description`)
- **Build:** the same 20 routes.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, with no spec changed.
- `charts.spec.ts` still finds its card with `getByRole('article').filter({ hasText })`, and the card's chart as an `img`.
- `back-swipe.spec.ts` and `offline.spec.ts` still find the Markets h1.
- The suite creates far fewer than 50 markets, so every spec's market is on the first page.

- [ ] **Step 6: Commit**

```bash
git add lib/markets/list-markets.ts "app/(app)/markets/(list)/page.tsx" components/ui/show-more.tsx \
  tests/lib/markets/list-markets.test.ts tests/db/list-markets.test.ts tests/components/markets-page.test.tsx \
  tests/components/show-more.test.tsx
git commit -m "Page open markets 50 at a time on the markets list"
```

---

## Task 6: One loading status per page

The market page (`app/(app)/markets/[id]/page.tsx`) streams four sections behind independent `Suspense` boundaries — the chart, the outcomes-and-bet-form pair, and the bets list — each falling back to its own `SkeletonScreen`, and every `SkeletonScreen` renders its own sr-only `role="status"` "Loading…". On a cold load all four can be pending at once, so a screen reader hears "Loading…" announced up to four times for what is one page loading. This task makes `SkeletonScreen`'s status optional, gives the market page one combined status instead, and greps the rest of the app to confirm no other page has the same problem.

**What was checked already, and doesn't need re-checking:** every route-level `loading.tsx` (`home`, `markets` list, `create-market`, `parlays`, `tasks`, `feed`, `leaderboard`, `admin-invites`, `admin-tasks`, `admin-members`, `admin-ledger`) renders exactly one `SkeletonScreen`, so exactly one status each — these are unaffected and keep their default. The member page (`app/(app)/members/[id]/page.tsx`) has one `Suspense` around one `SkeletonScreen` (`member-activity`) — also unaffected. The market detail page is the only page in the app with more than one `SkeletonScreen` on screen at once.

**Files:**
- Modify: `components/ui/skeleton.tsx` (`SkeletonScreen` gains an `announce` prop)
- Create: `components/ui/loading-status.tsx` (`LoadingStatus`, `'use client'`)
- Modify: `components/markets/market-detail-skeletons.tsx` (all four `SkeletonScreen`s set `announce={false}`)
- Modify: `app/(app)/markets/[id]/page.tsx` (renders one `<LoadingStatus />`)
- Test, modify: `tests/components/skeleton.test.tsx`
- Test, modify: `tests/components/market-detail-skeletons.test.tsx`
- Test, create: `tests/components/loading-status.test.tsx`

**Interfaces:**
- Consumes:
  - `SkeletonScreen({ name, className, children })` (`components/ui/skeleton.tsx`), which renders `<div data-skeleton={name} className={className}>`. Every fallback in the app already carries this attribute.
  - `MarketChartSkeleton`, `MarketActionsSkeleton`, `MarketBetsSkeleton` (`components/markets/market-detail-skeletons.tsx`), unchanged in shape.
  - `app/(app)/markets/[id]/page.tsx` as Task 3 left it. Task 3 added three imports (`rowDomId`, `NothingOlder`, `ShowMoreFocus`) and rewrote `MarketBets`; this task's two edits anchor on the `BackLink`/`LocalTime`/`Message` imports and the grid's opening comment, neither of which Task 3 touched.
- Produces:
  - `SkeletonScreen`'s new `announce?: boolean` prop, default `true`. `false` renders no `role="status"` paragraph at all; every other prop and the rendered `data-skeleton` div are unchanged. Every existing call site outside `market-detail-skeletons.tsx` keeps compiling and keeps its status, because the default is `true`.
  - `LoadingStatus` (`components/ui/loading-status.tsx`): a client component, no props, rendering `<p role="status" className="sr-only">{pending ? 'Loading…' : ''}</p>`. `pending` starts `true`, so the server-rendered HTML announces before hydration, and from then on is true whenever `document.querySelectorAll('[data-skeleton]')` finds at least one element, checked on mount and on every DOM mutation under `document.body`. A page renders it once, alongside any number of `SkeletonScreen`s that pass `announce={false}`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/skeleton.test.tsx` with:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { viewTransitionCalls } from '@/tests/components/view-transition-mock'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { Skeleton, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

beforeEach(() => {
  viewTransitionCalls.length = 0
})

describe('Skeleton', () => {
  it('is a hidden block carrying the shimmer class and any overrides', () => {
    const { container } = render(<Skeleton className="h-6 w-40 rounded-full" />)
    const block = container.firstElementChild!
    expect(block).toHaveAttribute('aria-hidden', 'true')
    expect(block).toHaveClass('skeleton', 'h-6', 'w-40', 'rounded-full')
    expect(block).toBeEmptyDOMElement()
  })

  it('builds a field from a label bar and a control bar, taller for a textarea', () => {
    const { container } = render(
      <>
        <SkeletonField />
        <SkeletonField tall />
      </>,
    )
    const [field, tallField] = Array.from(container.children)
    expect(field.lastElementChild).toHaveClass('h-12')
    expect(tallField.lastElementChild).toHaveClass('h-[100px]')
  })
})

describe('SkeletonScreen', () => {
  it('names the skeleton, announces loading, and hands off through the route transition', () => {
    const { container } = render(
      <SkeletonScreen name="feed" className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(viewTransitionCalls).toHaveLength(1)
    expect(viewTransitionCalls[0].exit).toEqual({ 'nav-forward': 'nav-forward', 'nav-back': 'nav-back', default: 'page-exit' })
    expect(viewTransitionCalls[0].default).toBe('none')
    const screenEl = container.firstElementChild!
    expect(screenEl).toHaveAttribute('data-skeleton', 'feed')
    expect(screenEl).toHaveClass('flex', 'flex-col')
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screenEl.querySelectorAll('.skeleton')).toHaveLength(1)
  })

  it('renders no status when announce is false, for a page with its own combined one', () => {
    render(
      <SkeletonScreen name="market-chart" announce={false} className="flex flex-col">
        <Skeleton className="h-6" />
      </SkeletonScreen>,
    )
    expect(screen.queryByRole('status')).toBeNull()
  })
})
```

Replace `tests/components/market-detail-skeletons.test.tsx` with:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'

// The fallbacks sit on the page beside real content, so like a route skeleton they must add
// nothing the market e2e specs count. None of the four announces its own status any more (the
// page renders one combined <LoadingStatus />, tested in loading-status.test.tsx): asserting zero
// here is what would catch a status creeping back into one of them.
function expectOnlyHiddenBlocks(container: HTMLElement) {
  expect(screen.queryAllByRole('status')).toHaveLength(0)
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(1)
  for (const block of container.querySelectorAll('.skeleton')) {
    expect(block).toHaveAttribute('aria-hidden', 'true')
  }
  for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
    expect(screen.queryAllByRole(role)).toHaveLength(0)
  }
  expect(container).toHaveTextContent(/^$/)
}

describe.each<[string, ReactElement, string[]]>([
  ['market-chart', <MarketChartSkeleton key="chart" />, ['lg:col-start-1', 'lg:row-start-1']],
  ['market-bets', <MarketBetsSkeleton key="bets" />, ['lg:col-start-1', 'lg:row-start-3']],
])('the %s skeleton', (name, element, placement) => {
  it('is named, holds its grid cell, announces nothing itself, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    expect(screenEl).toHaveClass(...placement)
    expectOnlyHiddenBlocks(container)
  })
})

describe('the market actions skeleton', () => {
  it('stands in for the outcomes card and the bet column, each in its own grid cell', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={2} />)

    const [outcomes, betForm] = Array.from(container.querySelectorAll('[data-skeleton]'))
    expect(outcomes).toHaveAttribute('data-skeleton', 'market-outcomes')
    expect(outcomes).toHaveClass('lg:col-start-1', 'lg:row-start-2')
    expect(betForm).toHaveAttribute('data-skeleton', 'market-bet-form')
    expect(betForm).toHaveClass('lg:col-start-2', 'lg:row-span-3', 'lg:row-start-1')
    expectOnlyHiddenBlocks(container)
  })

  it('draws one outcome row per outcome', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={4} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
  })
})
```

Create `tests/components/loading-status.test.tsx`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { LoadingStatus } from '@/components/ui/loading-status'
import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'

describe('LoadingStatus', () => {
  it('announces from its first render, then clears once it sees nothing on the page is pending', async () => {
    const { container } = render(<LoadingStatus />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
    expect(renderToString(<LoadingStatus />)).toContain('Loading…')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1)
  })

  it('is the market page cold render’s only status, for as long as any of its four fallbacks is showing, and clears once none are', async () => {
    const { rerender } = render(
      <>
        <LoadingStatus />
        <MarketChartSkeleton />
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </>,
    )

    // Cold render: all four sections pending at once, but exactly one status announces it.
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // One section resolving (its fallback unmounts) while the others are still pending.
    rerender(
      <>
        <LoadingStatus />
        <MarketActionsSkeleton outcomes={2} />
        <MarketBetsSkeleton />
      </>,
    )
    expect(screen.getAllByRole('status')).toHaveLength(1)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Loading…'))

    // Every section resolved: the status clears instead of announcing "Loading…" forever.
    rerender(<LoadingStatus />)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(''))
    expect(screen.getAllByRole('status')).toHaveLength(1)
  })
})
```

Run: `npx vitest run tests/components/skeleton.test.tsx tests/components/market-detail-skeletons.test.tsx tests/components/loading-status.test.tsx`
Expected: FAIL.
- `tests/components/loading-status.test.tsx` can't load: `@/components/ui/loading-status` doesn't exist yet.
- `SkeletonScreen > renders no status when announce is false…` fails: `SkeletonScreen` doesn't destructure `announce`, so it's an unused extra prop and the status paragraph still renders; `screen.queryByRole('status')` isn't `null`.
- In `market-detail-skeletons.test.tsx`, 3 of its 4 cases fail: each skeleton still renders its own status (one for `market-chart`/`market-bets`, two for the actions pair), so `expectOnlyHiddenBlocks` sees a non-empty `role="status"` list and non-empty text content. "draws one outcome row per outcome" passes.
- In all: 4 failed and 4 passed, plus the file that can't load.

- [ ] **Step 2: Give `SkeletonScreen` an `announce` prop**

Replace `components/ui/skeleton.tsx` with:

```tsx
import type { ReactNode } from 'react'
import { cardClass } from '@/components/ui/card'
import { SkeletonReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

// The sunk fill, control radius and shimmer come from the .skeleton rule in app/globals.css, a
// component layer, so a bg-* or rounded-* utility in className overrides them.
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}

export function SkeletonScreen({
  name,
  className,
  announce = true,
  children,
}: {
  name: string
  className?: string
  // false when the page renders its own combined status (components/ui/loading-status.tsx)
  // because it streams several sections that can be pending at once.
  announce?: boolean
  children: ReactNode
}) {
  return (
    <SkeletonReveal>
      <div data-skeleton={name} className={className}>
        {announce && (
          <p role="status" className="sr-only">
            Loading…
          </p>
        )}
        {children}
      </div>
    </SkeletonReveal>
  )
}

export function SkeletonCard({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn(cardClass, 'flex flex-col gap-3 p-[18px] md:p-6', className)}>{children}</div>
}

export function SkeletonPageHeader({ description = false, action = false }: { description?: boolean; action?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 grow flex-col gap-2">
        <Skeleton className="h-8 w-44 md:h-11 md:w-64" />
        {description && <Skeleton className="h-5 w-full max-w-[420px]" />}
      </div>
      {action && <Skeleton className="h-11 w-36 shrink-0 md:h-12 md:w-44" />}
    </div>
  )
}

export function SkeletonField({ className, tall = false }: { className?: string; tall?: boolean }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Skeleton className="h-5 w-24" />
      <Skeleton className={tall ? 'h-[100px]' : 'h-12'} />
    </div>
  )
}
```

Create `components/ui/loading-status.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'

// A page that streams several sections behind independent Suspense boundaries (the market page's
// chart, outcomes, bet form and bets) can have more than one pending at once. Each one used to
// carry its own SkeletonScreen status; mounted once per page instead, this announces exactly one,
// for as long as any [data-skeleton] fallback is still in the DOM, and clears itself once every
// section has resolved and swapped its fallback for real content.
export function LoadingStatus() {
  // Starts pending so the server-rendered first flush, where the fallbacks are showing, already
  // announces it before hydration; the first check clears it if nothing is pending.
  const [pending, setPending] = useState(true)

  useEffect(() => {
    const check = () => setPending(document.querySelectorAll('[data-skeleton]').length > 0)
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <p role="status" className="sr-only">
      {pending ? 'Loading…' : ''}
    </p>
  )
}
```

Replace `components/markets/market-detail-skeletons.tsx` with:

```tsx
import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each one
// carries its section's grid placement, so from lg the two-column layout holds while they load.

// The page renders one combined <LoadingStatus /> instead (app/(app)/markets/[id]/page.tsx),
// since these four sections stream independently and can be pending at the same time.

export function MarketChartSkeleton() {
  return (
    <SkeletonScreen name="market-chart" announce={false} className="lg:col-start-1 lg:row-start-1">
      <SkeletonCard>
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-[220px] md:h-[300px]" />
      </SkeletonCard>
    </SkeletonScreen>
  )
}

// The outcomes card and the bet column stream as one section, so they share one fallback.
export function MarketActionsSkeleton({ outcomes }: { outcomes: number }) {
  return (
    <>
      <SkeletonScreen name="market-outcomes" announce={false} className="lg:col-start-1 lg:row-start-2">
        <SkeletonCard className="gap-1">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="flex flex-col divide-y divide-line">
            {Array.from({ length: outcomes }, (_, i) => (
              <div key={i} className="flex flex-col gap-2 py-4">
                <div className="flex items-center justify-between gap-3">
                  <Skeleton className="h-5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
                <Skeleton className="h-2 rounded-full" />
                <div className="flex min-h-11 items-center justify-between gap-2">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="h-11 w-36" />
                </div>
              </div>
            ))}
          </div>
        </SkeletonCard>
      </SkeletonScreen>
      <SkeletonScreen
        name="market-bet-form"
        announce={false}
        className="flex flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-7"
      >
        <SkeletonCard className="gap-4">
          <Skeleton className="h-6 w-32" />
          <SkeletonField />
          <SkeletonField />
          <Skeleton className="h-12" />
        </SkeletonCard>
      </SkeletonScreen>
    </>
  )
}

export function MarketBetsSkeleton() {
  return (
    <SkeletonScreen name="market-bets" announce={false} className="lg:col-start-1 lg:row-start-3">
      <SkeletonCard className="gap-1">
        <Skeleton className="h-6 w-16" />
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex min-h-[52px] items-center gap-3 py-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-52 max-w-full" />
            </div>
          ))}
        </div>
      </SkeletonCard>
    </SkeletonScreen>
  )
}
```

In `app/(app)/markets/[id]/page.tsx`, replace:

```tsx
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
```

with:

```tsx
import { BackLink } from '@/components/ui/back-link'
import { LoadingStatus } from '@/components/ui/loading-status'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
```

In the same file, replace:

```tsx
        {/* Each section's fallback carries the same grid placement as the section itself. */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
```

with:

```tsx
        {/* Each section's fallback carries the same grid placement as the section itself. The
            four fallbacks announce nothing themselves (SkeletonScreen announce={false}); this is
            the page's one combined status for as long as any of them is still showing. */}
        <LoadingStatus />
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
```

- [ ] **Step 3: Run the tests again**

Run: `npx vitest run tests/components/skeleton.test.tsx tests/components/market-detail-skeletons.test.tsx tests/components/loading-status.test.tsx`
Expected: PASS, 10 tests in 3 files: `skeleton.test.tsx` 4 (2 `Skeleton`, 2 `SkeletonScreen`), `market-detail-skeletons.test.tsx` 4 and `loading-status.test.tsx` 2.

- [ ] **Step 4: Grep for any other page with the same problem**

Run: `grep -rln "SkeletonScreen" --include="*.tsx" app components | grep -v market-detail-skeletons.tsx`
Expected: 15 files, none of which needs a change:
- the 11 route-level `loading.tsx` files, one `SkeletonScreen` each
- `app/(app)/members/[id]/page.tsx`: one `SkeletonScreen`, `member-activity`, behind one `Suspense`
- `app/(app)/markets/[id]/page.tsx`: only the comment Step 2 added (its skeletons live in `market-detail-skeletons.tsx`)
- `components/ui/skeleton.tsx` and `components/ui/loading-status.tsx` themselves

No page other than the market page renders more than one `SkeletonScreen` at a time, so no other page needs `announce={false}` or a `LoadingStatus`.

- [ ] **Step 5: Verify**

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1181 tests in 175 files: 3 more tests and 1 more file than after Task 5 (1178 in 174). The 3 are `skeleton.test.tsx`'s `announce={false}` case and `loading-status.test.tsx`'s 2; `market-detail-skeletons.test.tsx`'s cases are updated in place.
- **Build:** the same 20 routes.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed. No e2e spec asserts on `role="status"` text on the market page, so none of them changes: `e2e/skeletons.spec.ts` only checks the leaderboard's prefetch behavior, not a status role.

- [ ] **Step 6: Commit**

```bash
git add components/ui/skeleton.tsx components/ui/loading-status.tsx components/markets/market-detail-skeletons.tsx "app/(app)/markets/[id]/page.tsx" \
  tests/components/skeleton.test.tsx tests/components/market-detail-skeletons.test.tsx tests/components/loading-status.test.tsx
git commit -m "Announce one loading status on the market page instead of one per section"
```

---

## Task 7: Verification

This task changes no product code. It:
- runs the whole chain on the finished branch, then again on the Supabase CLI version CI pins, covering `0036` specifically
- measures `market_sparklines` with `EXPLAIN ANALYZE` on the scale seed, before and after `0036`
- takes a controller visual pass of the leaderboard's and markets list's "Show more" (with focus visible), "Nothing older here", and the market page's single loading status
- applies `0036` to production before merge, and hands the user the Rollout checklist from the spec

**Files:**
- Temporary, not committed: `e2e/zz-visual-post-beta-cleanup.spec.ts` (Step 5, the controller's screenshot spec, deleted after use)
- Temporary, outside the repo: `$SCRATCH/explain-sparklines-0036.mjs` (Step 4)

**Interfaces:**
- Consumes every task in this plan: the migration's guard, indexes and CHECKs and the cheaper `market_sparklines` (Tasks 1–2), `ShowMore`/`ShowMoreFocus`/`NothingOlder`/the keys-only probe in every paged list (Task 3), leaderboard paging with `rowDomId('member', id)` rows and `encodeRankCursor` (Task 4), open-markets paging with `rowDomId('market-open', id)` cards and `open`/`open_from` (Task 5), and `LoadingStatus` on the market page (Task 6).
- Produces nothing new. This is the last task.

- [ ] **Step 1: Run the whole chain**

Local Supabase must be running.

Run: `npm run db:reset && npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- **Vitest:** 1181 tests in 175 files, 297 of them in 48 files under `tests/db/`. That's 1087 in 164 at `12b316b` (284 in 46 under `tests/db/`), plus Task 1's 5, Task 2's 1, Task 3's 25, Task 4's 48, Task 5's 12 and Task 6's 3. Record the total in the PR description.
- **Build:** the same 20 routes as `12b316b`. This plan adds and removes no route.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged from before this plan. No task adds or removes an e2e spec.

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

Expected: every step passes on this exact CLI version: 1181 Vitest tests and 27 e2e tests. `db reset` applies `0036` cleanly. 2.115.0 grants nothing implicitly (the 0007 lesson), so confirm what `0036` left behind:

```bash
docker exec -i supabase_db_dwell-duel psql -U postgres -At \
  -c "select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'market_sparklines' order by 1" \
  -c "select conname, convalidated from pg_constraint where conname in ('task_completions_approved_has_reviewed_at', 'parlays_won_has_settled_at')" \
  -c "select count(*) from pg_indexes where indexname like 'activity_events_%_id_idx'" \
  -c "select has_table_privilege('authenticated', 'public.activity_feed', 'select'), has_table_privilege('anon', 'public.activity_feed', 'select'), has_table_privilege('service_role', 'public.activity_feed', 'select')"
```

Expected:
- `market_sparklines`: `EXECUTE` for `authenticated`, `postgres` and `service_role`, and none for `anon`. `create or replace` kept 0035's grants.
- both CHECKs, each validated (`t`)
- `7` foreign key indexes
- `f|f|t`: the view is closed to `authenticated` and `anon`, and open to `service_role`

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: no output. Every task committed its own files, and this task has nothing to commit.

- [ ] **Step 4: `EXPLAIN ANALYZE` of `market_sparklines`, before and after `0036`, with the scale seed**

This step writes tens of thousands of rows to local Supabase. Run it from the repo root with the project's own CLI (`npx supabase`), and restore the normal database with the reset at the end before running anything else.

1. Make a scratch directory outside the repo: `SCRATCH=$(mktemp -d)`.

2. Reset to just before `0036`, then load the scale seed:

   ```bash
   npx supabase db reset --version 0035
   node scripts/seed-scale.mjs
   ```

   Expected: the seed prints 500 members, 70 open, 120 resolved and 10 voided markets, 20,000 bets, 130 resolutions, 400 parlays, about 3,000 task completions and about 31,000 ledger rows.

3. Write `$SCRATCH/explain-sparklines-0036.mjs`. Like the activity-events plan's verification script, it talks to postgres-meta directly and reads its env through `node --env-file`, because a script outside the repo can't resolve `dotenv`. It times two reads, each as the table owner and as an invited admin through RLS: the 50 busiest markets (the worst case for one RPC chunk) and the list's first open chunk. Each figure is the median of 21 `explain (analyze, timing off)` runs, because a single run's timing noise is as large as the difference being measured:

   ```js
   // Throwaway, not committed. Run from the repo root: node --env-file=.env.local "$SCRATCH/explain-sparklines-0036.mjs"
   // It reads through postgres-meta as the table owner, then repeats each call as a signed-in,
   // invited admin, through the access rules PostgREST would apply.
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

   const label = process.argv.includes('--after') ? 'after ' : 'before'
   const RUNS = 21

   // Fresh statistics, so the plans before and after 0036 are compared on the same footing.
   await pgQuery('analyze public.bets, public.market_outcomes, public.markets')

   // The ids go in as a literal uuid[]: a sub-select as the argument stops Postgres inlining the
   // function, and EXPLAIN would then time an opaque Function Scan plus the sub-select.
   const literal = (rows) => `'{${rows.map((r) => r.id).join(',')}}'::uuid[]`
   const busiest = await pgQuery(
     'select market_id as id from public.bets group by market_id order by count(*) desc, market_id limit 50',
   )
   const newestOpen = await pgQuery(
     "select id from public.markets where status = 'open' order by created_at desc, id desc limit 50",
   )
   const [{ bets: busiestBets }] = await pgQuery(
     `select count(*)::integer as bets from public.bets where market_id = any(${literal(busiest)})`,
   )

   // An invited admin, so RLS lets it read every market's bets and outcomes.
   const [admin] = await pgQuery(
     'select p.id, p.email from public.profiles p join public.allowed_emails a on a.email = p.email where p.is_admin order by p.email limit 1',
   )
   if (!admin) throw new Error('no invited admin to read as')
   const asAdmin = `set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: admin.id, email: admin.email, role: 'authenticated' })}', true);`

   function walk(node, out = []) {
     out.push(node)
     for (const child of node.Plans ?? []) walk(child, out)
     return out
   }

   const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]

   const reads = {
     [`busiest 50 (${busiestBets} bets)`]: `select * from public.market_sparklines(${literal(busiest)}, 40)`,
     'newest 50 open': `select * from public.market_sparklines(${literal(newestOpen)}, 40)`,
   }

   for (const [name, sql] of Object.entries(reads)) {
     for (const [who, prefix] of [
       ['owner', ''],
       ['admin (rls)', asAdmin],
     ]) {
       const times = []
       let plan
       for (let i = 0; i < RUNS; i++) {
         const [row] = await pgQuery(`${prefix} explain (analyze, timing off, format json) ${sql}`)
         plan = row['QUERY PLAN'][0]
         times.push(plan['Execution Time'])
       }
       const nodes = walk(plan.Plan)
       const seq = [...new Set(nodes.filter((n) => n['Node Type'] === 'Seq Scan').map((n) => n['Relation Name']))]
       const windows = nodes.filter((n) => n['Node Type'] === 'WindowAgg').map((n) => n['Actual Rows'])
       console.log(
         `${label} ${`${name}, ${who}`.padEnd(40)} median ${median(times).toFixed(2).padStart(7)} ms of ${RUNS}  rows ${String(plan.Plan['Actual Rows']).padStart(3)}  widest window ${Math.max(...windows)}  seq scans: ${seq.join(', ') || 'none'}`,
       )
     }
   }
   ```

   Run: `node --env-file=.env.local "$SCRATCH/explain-sparklines-0036.mjs" | tee "$SCRATCH/explain-before.txt"`

4. Apply `0036` on top of the seeded data, without dropping it: `npx supabase migration up --local`. Unlike `db reset`, it applies only the pending migration, so the seed's rows survive and the guard, the CHECKs, the indexes and the recreated function all run over scale-sized data.
   Expected: `Applying migration 0036_post_beta_cleanup.sql...` and no error. This also proves the guard doesn't false-positive on the seed's rows (every approved completion has a `reviewed_at`, and every won parlay a `settled_at`).

5. Measure again: `node --env-file=.env.local "$SCRATCH/explain-sparklines-0036.mjs" --after | tee "$SCRATCH/explain-after.txt"`

6. Compare the two files, and record both in the PR description, next to Task 2's heavier numbers.
   - **What to expect, honestly.** On the scale seed the gain is small. At about 113 bets per busy market and a little over 2 outcomes each, the cross join was a small part of the cost, and building the points' JSON dominates. Measured while writing this plan (one seed run, 5,663 bets in the busiest 50):

     | Read | Before (0035) | After (0036) | Widest window, rows |
     |---|---|---|---|
     | Busiest 50, owner | 14.99 ms | 13.42 ms | 12,916 → 10,223 |
     | Busiest 50, admin through RLS | 13.80 ms | 13.23 ms | 12,916 → 10,223 |
     | Newest 50 open, owner | 13.86 ms | 12.48 ms | 11,564 → 9,623 |
     | Newest 50 open, admin through RLS | 12.89 ms | 12.59 ms | 11,564 → 9,623 |

     The gain grows with bets × outcomes. Task 2 measured 50 markets × 2,000 bets (half binary, half with 6 outcomes) at about 285 ms before and 134 ms after, about 2.1×. The PR should say both: no visible change at today's scale, and a real one as history grows.
   - **What must hold.** Every line returns 50 rows, before and after, and each `admin (rls)` line matches its owner line's row count, so the admin really can see the data it timed. The widest window shrinks. Neither version gains a sequential scan on `bets` (the `market_outcomes` seq scan is on a small table, in both). The median after must not be meaningfully higher than before: a regression is a blocking finding, not a note.
   - Absolute times vary by machine, so record both files' numbers, not only the ratio.

7. Restore the normal dev database before anything else: `npm run db:reset`

- [ ] **Step 5 (the controller, not the implementer): visual check at 375px and 1280px, light and dark**

The executing controller does this step, not a subagent. As in earlier plans, it takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed.

How the spec reaches each state:
- **"Show more".** It seeds 55 members and 55 open markets, so both lists have a second page. "Show more" is pressed from the keyboard (focus, then Enter), as a keyboard user would, so the row focus lands on shows its `:focus-visible` ring. The spec asserts that focus is on a `member-…` row or a `market-open-…` card, which proves Task 3's focus handling in a real browser, not just in jsdom. On `/markets`, the open list's "Show more" is the first one in the document (`tests/components/markets-page.test.tsx` pins that order), so it's found with `.first()`.
- **"Nothing older here."** The app never links past the end of a list, and a "Show more" href captured from page one is an extend (`?before=` / `?open=`), which re-reads from the top and is never windowed. So the spec builds a fresh-window URL past the end with the exported encoders, exactly as Tasks 4 and 5's DB tests do.
- **The market page's loading state.** Local Supabase answers before the first flush, so React would render every section inline and no fallback would show; throttling the browser's network doesn't change that, because the delay has to be on the server. So the spec holds `bets` under an access exclusive lock for six seconds through `pgQuery`. The chart and the bets stay pending while the page's own read (the market and its outcomes) goes through, so their fallbacks stream first.
- **Worker restarts.** Playwright reruns `beforeAll` in a fresh worker after a failed test, so the seed checks for its own last market first and isn't made twice.
- **The offline banner.** Every signed-in page has the offline banner's `role="status"` live region, empty while online, so the loading assertion counts statuses that say "Loading…", not every status.

1. Make a scratch directory outside the repo for the PNGs: `SCRATCH=$(mktemp -d)`.

2. Create `e2e/zz-visual-post-beta-cleanup.spec.ts`:

```ts
import { test, expect, type Browser, type Page } from '@playwright/test'
import { STORAGE_STATE_PATH } from './global-setup'
import { serviceClient } from '../tests/db/helpers'
import { makeMember, clientForEmail, createTestMarket } from '../tests/db/fixtures'
import { pgQuery } from '../tests/db/pg-query'
import { encodeCursor } from '../lib/pagination/cursor'
import { encodeRankCursor } from '../lib/pagination/rank-cursor'

// Temporary: the controller's post-beta-cleanup visual check. Delete this file after viewing the
// screenshots. Global setup already seeded Alice (admin, the storage-state session) and Bob.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual-post-beta-cleanup'

type Scheme = 'light' | 'dark'
const VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 1280, height: 900 },
] as const
const SCHEMES: Scheme[] = ['light', 'dark']

const BOARD_COUNT = 55
const MARKET_COUNT = 55

// The app never links past the end of a list, so these windows are built by hand. Every member
// here has coins (Alice and Bob their starting 100, the board 1 to 55), so a leaderboard window
// starting at 0 coins is past the last member; no open market was made in 2000.
const LEADERBOARD_PAST_THE_END = `/leaderboard?before_from=${encodeRankCursor({ balance: 0, name: '', id: 'ffffffff-ffff-4fff-bfff-ffffffffffff' })}`
const OPEN_MARKETS_PAST_THE_END = `/markets?open_from=${encodeCursor({ ts: '2000-01-01T00:00:00Z', id: '00000000-0000-4000-8000-000000000000' })}`

let sampleMarketId: string

// Playwright reruns beforeAll in a fresh worker after any failed test, so the seed is made once
// and found again after that.
test.beforeAll(async () => {
  const db = serviceClient()
  const { data: seeded, error: seededErr } = await db
    .from('markets')
    .select('id')
    .eq('title', `Open check ${MARKET_COUNT - 1}`)
    .maybeSingle()
  if (seededErr) throw seededErr
  if (seeded) {
    sampleMarketId = seeded.id
    return
  }

  for (let i = 0; i < BOARD_COUNT; i++) {
    const member = await makeMember(`Board${String(i).padStart(2, '0')}`)
    const { error } = await db.from('profiles').update({ balance: BOARD_COUNT - i }).eq('id', member.id)
    if (error) throw error
  }

  const { data: alice, error: aliceErr } = await db.from('profiles').select('email').eq('display_name', 'Alice').single()
  if (aliceErr) throw aliceErr
  const aliceClient = await clientForEmail(alice.email)
  for (let i = 0; i < MARKET_COUNT; i++) {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: `Open check ${String(i).padStart(2, '0')}` })
    sampleMarketId = market.marketId
  }
})

function openContext(browser: Browser, opts: { width: number; height: number; scheme: Scheme }) {
  return browser.newContext({
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
    viewport: { width: opts.width, height: opts.height },
    colorScheme: opts.scheme,
  })
}

// A route's loading skeleton cross-fades out after the content arrives, so each capture waits for
// every skeleton to leave and stops the fade.
async function capture(page: Page, path: string) {
  await expect(page.locator('[data-skeleton]')).toHaveCount(0)
  await page.screenshot({ path, fullPage: true, animations: 'disabled' })
}

// "Show more" pressed from the keyboard, as a keyboard user would, so the focused row shows its
// :focus-visible ring. The first "Show more" in the document is the open list's on /markets.
async function showMoreByKeyboard(page: Page) {
  const link = page.getByRole('link', { name: 'Show more' }).first()
  await link.focus()
  await page.keyboard.press('Enter')
}

for (const scheme of SCHEMES) {
  for (const { width, height } of VIEWPORTS) {
    const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`

    test(`leaderboard and open markets "Show more" move focus to the first new row, at ${width}px ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, height, scheme })
      const page = await context.newPage()

      await page.goto('/leaderboard')
      await showMoreByKeyboard(page)
      await expect(page).toHaveURL(/[?&]before=/)
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toMatch(/^member-/)
      await capture(page, shot('leaderboard-show-more-focus'))

      await page.goto('/markets')
      await showMoreByKeyboard(page)
      await expect(page).toHaveURL(/[?&]open=/)
      await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toMatch(/^market-open-/)
      await capture(page, shot('markets-show-more-focus'))

      await context.close()
    })

    test(`leaderboard and open markets show "Nothing older here" past the end, at ${width}px ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, height, scheme })
      const page = await context.newPage()

      await page.goto(LEADERBOARD_PAST_THE_END)
      await expect(page.getByText('Nothing older here.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to newest' })).toBeVisible()
      await capture(page, shot('leaderboard-nothing-older'))

      await page.goto(OPEN_MARKETS_PAST_THE_END)
      await expect(page.getByText('Nothing older here.')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Back to newest' })).toBeVisible()
      await capture(page, shot('markets-nothing-older'))

      await context.close()
    })

    test(`the market page's loading state announces once, at ${width}px ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, height, scheme })
      const page = await context.newPage()

      // Local Supabase answers before the first flush, so React would render every section inline
      // and no fallback would ever show. Holding bets under a lock for a few seconds keeps the
      // chart and the bets pending (the page's own read, of the market and its outcomes, isn't
      // blocked), so their fallbacks stream first. postgres-meta runs the two statements as one
      // transaction, and the lock goes when it commits.
      const held = pgQuery('lock table public.bets in access exclusive mode; select pg_sleep(6);')
      await expect
        .poll(async () => {
          const [row] = await pgQuery<{ held: boolean }>(
            "select exists (select 1 from pg_locks where relation = 'public.bets'::regclass and mode = 'AccessExclusiveLock' and granted) as held",
          )
          return row.held
        })
        .toBe(true)

      const navigation = page.goto(`/markets/${sampleMarketId}`)
      await expect(page.locator('[data-skeleton]').first()).toBeAttached()
      // Every signed-in page also has the offline banner's live region, empty while online, so
      // the count is of statuses that say Loading.
      const loading = page.getByRole('status').filter({ hasText: 'Loading…' })
      await expect(loading).toHaveCount(1)
      await page.screenshot({ path: shot('market-loading'), fullPage: true, animations: 'disabled' })

      await held
      await navigation
      await expect(page.locator('[data-skeleton]')).toHaveCount(0)
      await expect(loading).toHaveCount(0)

      await context.close()
    })
  }
}
```

3. Run it on its own. Its global setup reseeds the database, as every e2e run does.

```bash
lsof -ti:3000 | xargs kill 2>/dev/null
VISUAL_OUT="$SCRATCH/visual" npx playwright test e2e/zz-visual-post-beta-cleanup.spec.ts
```

Expected: 12 passed (3 checks × 2 widths × 2 schemes), and 20 PNGs in `$SCRATCH/visual`, 5 per width and scheme: two "Show more" focus shots, two "Nothing older here" shots and one market-loading shot.

4. View every PNG and check:
   - **`*-show-more-focus`:** the first newly shown row (rank 51, `Board48`, on the leaderboard; the 51st card, `Open check 04`, on markets) carries the `--focus` outline, in the app's own token. On the leaderboard, the ranks run on without a gap. The sticky top bar can appear partway down a full-page screenshot; that's how Playwright stitches a sticky element, not a layout bug.
   - **`*-nothing-older`:** "Nothing older here." and "Back to newest" render in the list's place, styled like every other `EmptyState`, and "Back to newest" is at least 44px tall.
   - **`market-loading`:** the chart and bets skeletons hold their grid cells while the outcomes and bet column have already rendered, so nothing jumps once the rest arrives. The single status is asserted by the spec.
   - Nothing scrolls sideways at 375px, and dark mode uses the same variables as light, with no hardcoded colours showing through.
5. Delete `e2e/zz-visual-post-beta-cleanup.spec.ts` and `test-results/`, run `npm run db:reset`, and run `git status --short` to confirm the tree is clean.
6. Record every mismatch as a final-review finding.

- [ ] **Step 6: Apply `0036` to production, before merging**

As for `0035`, the migration goes live before the branch merges, so `main`'s own push (which runs in parallel with the Vercel deploy) has nothing pending to apply.

```bash
gh workflow run deploy-production-db.yml --repo Aaron-Wickham/dwell-duel --ref post-beta-cleanup
```

Then poll until it finishes, rather than assuming it succeeded:

```bash
sleep 5
run_id=$(gh run list --repo Aaron-Wickham/dwell-duel --workflow=deploy-production-db.yml --branch post-beta-cleanup --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch "$run_id" --repo Aaron-Wickham/dwell-duel --exit-status
```

Expected: the run completes successfully (`gh run watch --exit-status` exits `0`). If it fails, read the run's log (`gh run view "$run_id" --repo Aaron-Wickham/dwell-duel --log-failed`) before retrying. A failed production push must be understood, not re-run blind, since `0036` takes `share row exclusive` locks on live tables. A guard failure names the counts of rows breaking each invariant; fix those rows, then re-run. Don't merge the PR until this run has succeeded.

- [ ] **Step 7 (the user, after deploy): post-deploy checklist**

Hand this to the user with the PR, and include it in the PR description:

> **After deploying, please check:**
> 1. `/leaderboard` shows "Show more" once there are more than 50 members, and paging through it lands your keyboard focus on the next member.
> 2. `/markets` shows "Show more" on the open list once there are more than 50 open markets.
> 3. The market page (`/markets/[id]`) loads normally: the chart, outcomes, bet form and bets all appear, with no lingering "Loading…" once everything's in.
> 4. `/feed` and a member's page still load, unaffected by this deploy.

- [ ] **Step 8: Commit**

Nothing to commit: this task changes no product file. If Step 5's spec was left behind, delete it and re-run `git status --short` to confirm a clean tree before closing out the PR.

---
