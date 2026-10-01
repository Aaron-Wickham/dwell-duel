# Data Layer, Scale and Reliability (Sub-project 8, PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep DwellDuel fast and correct at about 10× today's size (a few hundred members, tens of thousands of bets and ledger rows), and make it fail gracefully instead of crashing or sending members to sign-in when Auth hiccups. That covers:
- real indexes for real queries, and access rules that run their helpers once per query instead of once per row
- resolution and void logic that can't deadlock, and an override that is blocked with a clear message when a winner has already spent their winnings
- one batch call for bulk task reviews
- no list silently truncated at PostgREST's 1,000-row cap, and no read whose URL grows with the data
- "Show more" paging, 50 rows at a time, with the position in the URL, on the admin ledger, a market's bets, resolved and voided markets, the feed and member activity
- error pages at every level, an Auth failure that is no longer "signed out", and network timeouts on every Supabase call
- a keep-alive job with margin
- independent reads in parallel, one local sign-in check per request, and live updates that re-render only the screens that show what changed
- no CSS generated from the docs folder

**Architecture:**
- **Database:** one migration, `0033_data_layer_scale.sql`, built in four sections across Tasks 1–3: the access-rule rewrite (`(select is_invited())` / `(select is_admin())` InitPlans), the indexes, `resolve_market` / `void_market` recreated with the `clawback_short:` block and `order by profile_id, id` loops, and `review_task_completions`.
- **Pagination:** a keyset reader (`lib/pagination/keyset.ts`) over `(timestamp, id)`, with URL-safe cursors (`lib/pagination/cursor.ts`). A cursor in the URL means "every row from the newest down to and including this one", so reload, back and a shared link land on the same spot. A range is capped at 500 rows; past that, "Show more" starts a fresh window (`?<param>_from=`) with "Back to newest" above it. `ShowMore` is a plain `Link` with `scroll={false}`.
- **Resilience:** `ErrorCard` rendered by `app/(app)/error.tsx`, `app/error.tsx` and `app/global-error.tsx`, using Next 16.3's `retry()`. `requireUser` and the proxy use `getClaims()` and tell "Auth unavailable" (network, timeout, 5xx) apart from "signed out"; the former throws `AuthUnavailableError` into the error page. Every Supabase client gets a `fetch` with a timeout (10s server, 15s browser).
- **Speed:** `Promise.all` batches for independent reads, `getMarket` as one joined read, and per-page realtime subscriptions: pages declare what they show with `<LiveTables subscriptions={…} />`, and `LiveRefresh` rebuilds its one channel from those plus the member's own profile row, with a 2-second cap on the refresh delay.

**Tech Stack:**
- Next.js 16.3.5 (App Router), React 19.2 and TypeScript
- Tailwind CSS v4
- Supabase: Postgres, Auth, Realtime; `@supabase/supabase-js` 2.116, `@supabase/ssr` 0.12.7
- Vitest 4 with React Testing Library and jsdom
- Playwright

**How this plan was checked.** All twelve tasks were applied in order, from this text, to a fresh copy of `data-layer-scale` (`7709dbe`), on local Supabase, and after each task the full chain ran:
- lint and tsc were clean
- `npx vitest run` passed after every task, DB tests included, ending at 954 tests in 146 files
- the build passed, with the same 20 routes as before
- Playwright passed 24, 25, 25, 26, 26, 26, 26, 26, 26, 26, 26 after Tasks 1–11, and 26 in Task 12
- Task 12's scale measurement ran: the signed-in feed went from 204 ms to 15.7 ms and the signed-in admin ledger from 98.6 ms to 0.20 ms
- Task 12's visual-check spec ran, 16 passed

Re-applying the final tasks to a second fresh copy of `7709dbe` reproduced the identical tree. Not run: Task 12's pinned-CLI re-run (the local stack already runs on 2.115.0), and everything that needs a real phone or production.

**Spec:** [`docs/superpowers/specs/2026-09-26-data-layer-scale-design.md`](../specs/2026-09-26-data-layer-scale-design.md). Its references are to `main` at `1935310` (PR B merged); this plan starts from `data-layer-scale` at `7709dbe`, which adds only the spec.

**Commits** end with the `Co-Authored-By:` trailer the implementer's own session specifies. The commit commands below omit it.

## Global Constraints

- **Scope:** only what this spec lists. Nothing from the non-goals.
- **One migration,** `0033`. It adds or recreates. The policy rewrite keeps every policy's meaning, which a test proves. The clawback block and the batch review function are the only behavioural changes to coin-moving SQL.
- **The e2e contract:**
  - every existing asserted string, role and count keeps resolving
  - the member page keeps its real HTTP 404, and the signed-out 307 is unchanged
  - existing specs may gain waits, never changed assertions
- **Tokens only, phone-first, 44px controls,** real elements, and reduced motion respected, as in AGENTS.md.
- **Money actions are never optimistic.** The service worker never caches member data.
- **Every new list read is bounded** (at most 500 rows per request), and no read builds a URL whose length grows with row counts.
- **E2E counts:** 24 before this PR, then after each task: 24, 25, 25, 26, 26, 26, 26, 26, 26, 26, 26, 26. Task 2 adds the clawback spec and Task 4 the ledger "Show more" spec.
- **Vitest counts:** 752 tests in 122 files before this PR, 38 of them in `tests/db/`. After each task:

  | Task | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | Tests | 759 | 784 | 797 | 865 | 887 | 898 | 908 | 926 | 929 | 954 | 954 | 954 |
  | Files | 124 | 127 | 129 | 134 | 137 | 137 | 140 | 143 | 144 | 146 | 146 | 146 |
  | In `tests/db/` | 40 | 41 | 42 | 42 | 42 | 42 | 42 | 42 | 42 | 42 | 42 | 42 |
- **A fresh checkout runs `npx next typegen` once** (or a build) before its first `npx tsc --noEmit`. Until then `PageProps` and `LayoutProps` don't exist, and tsc fails on four route files.
- **Code style:** single quotes, no semicolons, and comments only for a non-obvious why. Quote `(app)` / `(home)` / `[id]` paths in shell commands.
- **Next.js 16 differs from older versions.** Read `node_modules/next/dist/docs/` before writing anything Next-specific.
- **Local Supabase must be running.** `npx vitest run` includes `tests/db/`, which wipes and reseeds it. Run `npm run db:reset` after any change to `0033`.

## Rulings this plan makes

- **0033 is built across Tasks 1–3 by appending.** It stays unshipped until this PR merges, and the spec allows only one migration. Each task appends its own headed section and never edits an earlier one.
- **The feed cursor uses the view's text `id`** (`'bet:123'` and so on) as the tiebreak. The comparison runs in the query, with the same collation as the query's `order by id desc`, so the order is total even though no index serves it.
- **"Show more" points at the 50th row past what's shown,** so the read makes a second key probe of up to 50 rows in place of the spec's single extra row. Every request stays at or under 500 rows. The probe starts from the last row actually returned, so rows that arrive at the top are never skipped.
- **"Back to newest" renders directly above the list, inside the same card.** On `/markets` it sits above the first closed-market group.
- **Resolved and voided markets are one paged list** (`resolved=`), shown in their two existing groups, because the spec names a single parameter for them.
- **`.in()` lookups whose id count grows with rows are chunked at 50 ids:** the ledger's title and label lookups, and `listChartBets`. So no URL grows with the data, as the constraint requires, though the spec only named the markets list.
- **A chart read failure degrades only on `/markets`.** Market detail still shows the error page if its chart read fails, because the spec only names the list.
- **Other resolve errors keep returning `error.message`.** That is today's behaviour, which the spec calls "today's generic message".
- **Clawback "owed" is gross.** It is each member's payouts under the current resolution plus the credit of every won parlay the override would reverse, not netted against the new outcome's payouts. The reversal runs before any new payout, so a member short of the gross amount is exactly the one today's function fails on with a raw constraint error. "Net of anything already reversed" is always zero, because a resolution is only reversed as it stops being current. The check locks the owing members' profiles, so their balances can't move before the reversal. `settle_parlay` is not recreated.
- **Clawback copy** is the spec's, with the app's curly apostrophe ("Can’t") and an Oxford-comma list for three or more members. The copy is gender-neutral ("40 of 60 DC won on this market").
- **A failed `review_task_completions` call** (not an admin, or a network error) returns the bulk actions' existing summary, e.g. "0 approved, 3 failed (…).", so their failure shape doesn't change.
- **`requireUser` returns `user: { id, email? }`,** built from the JWT claims, instead of Supabase's `User`. Every caller reads only `user.id`, and the auth callback keeps its own `getUser()`.
- **"Auth unavailable" means network, timeout, 5xx or unknown.** A revoked or unknown refresh token, a bad JWT or no session all mean "signed out". So a member with a dead session is still sent to sign-in, not stuck on the error page.
- **The member page checks `isUuid(id)` before its read.** A malformed id now reaches `.eq('id', …)`, which errors instead of matching nothing, and it must stay a 404.
- **The feed's description changes** from "The 50 newest things that happened in DwellDuel." to "Everything that’s happened in DwellDuel, newest first.", because with "Show more" the old line would be false. No e2e asserts it. This is new copy for sign-off.
- **`<LiveTables subscriptions={…} />`,** not the spec's `tables=`, because every entry may carry a filter. The per-page declarations live in `lib/live/page-subscriptions.ts`, so one unit test can check them all against `LIVE_TABLES`.
- **Each channel rebuild uses a fresh topic.** Realtime's `channel(topic)` hands back a still-closing channel when a topic is reused.
- **The timeout wrapper has a fallback** for browsers without `AbortSignal.any` (iOS Safari before 17.4).
- **The leaderboard and open markets stay unbounded.** A few hundred members and open markets fit the target, the spec only asks for SQL ordering on one and leaves the other unpaged, and Home keeps `getLeaderboard` for its rank.
- **The EXPLAIN tests turn off sequential scans with `set local`,** because the fixtures are tiny. postgres-meta pools its connections and runs a multi-statement body as one transaction, so `set local` ends with the query, where a plain `set` would leak into later requests. Task 1 sets the pattern, and any later EXPLAIN test follows it. The actor-filtered feed check exempts only the `market_created` branch, which the spec deliberately leaves unindexed.
- **The override's reversal lookup is indexed on the text `meta ->> 'resolution_id'`,** not the spec's `((meta ->> 'resolution_id')::uuid)`. A uuid-cast expression index would fail the migration, or any later insert, if a ledger row ever held a non-uuid `resolution_id`, and the text index is just as selective. `resolve_market`'s clawback check and reversal loop compare `meta ->> 'resolution_id' = v_current_resolution_id::text`.
- **`markets (current_resolution_id)` is indexed too,** beyond the spec's table. Member activity's `market_resolved` and `bet_won` branches join `markets` on it, and without it `markets` is scanned sequentially in three branches. With it, Task 12's measurement shows `market_created` as the only branch left on a sequential scan.
- **Task 10 also gives `/feed` its `<LiveTables subscriptions={pageSubscriptions.feed()} />`,** anchored on the page Task 6 leaves. The spec's table lists it.
- **`tests/db/settle-parlay.test.ts` changes one assertion,** from the raw `23514` to the clawback block's `P0001` and its exact message. It is a DB test of the behaviour Task 2 changes, not an e2e assertion, so the e2e contract is untouched.
- **"Show more" on `/markets` may add Resolved cards above the Voided group.** Resolved and voided markets are one list, so a longer range can grow the group above. The member is at the button, below both groups, so content moving above it is expected.
- **New copy uses the curly apostrophe (U+2019),** as the rest of the app does: "Can’t override…", "We couldn’t load this page…", "Everything that’s happened…".
- **The scale seed is always followed by `npm run db:reset`** before any other DB test. `seedMembers()` clears auth users through `listUsers()`, which returns only its first page, so it can't clear the seed's 500 extra users.
- **Task 12 forces the error cards by revoking one `select` grant for the length of a test,** not by rebuilding the app against a broken Supabase URL. Revoking `activity_feed` fails the feed's read, so `app/(app)/error.tsx` renders inside the chrome. Revoking `profiles` fails the `(app)` layout's read, so `app/error.tsx` renders bare. Both run on the normal e2e server, and jsdom already covers each boundary (Task 7).
- **The scale seed and EXPLAIN ANALYZE are run only in Task 12,** because they write tens of thousands of rows to the local database.

---

## Task 1: 0033 part 1 — access rules that run their helpers once, indexes for named queries, and the scale seed

This task starts the PR's one migration, `supabase/migrations/0033_data_layer_scale.sql`, with its first two sections:
- **Section 1** drops and recreates the 16 access rules that call `is_invited()` or `is_admin()`, wrapping each call as `(select is_invited())` / `(select is_admin())`. Both helpers are `stable security definer` (0003), which Postgres never inlines, so today each bare call runs once per row the rule checks. Wrapped, each becomes an InitPlan that runs once per statement. Nothing else about any rule changes: a DB test compares every rule's expression, with the wraps taken out, against its pre-0033 text.
- **Section 2** adds 12 indexes, each for a named query: the 11 the spec's table names, and `markets (current_resolution_id)`, which the feed's two resolution branches join on (a ruling; the spec's table doesn't list it). The override's reversal lookup is indexed on the text `meta ->> 'resolution_id'`, not the spec's `::uuid` cast (also a ruling): a cast index would fail the migration, or any later insert, on a ledger row whose `resolution_id` isn't a uuid, and the text index is just as selective. Task 2's `resolve_market` compares against it with `meta ->> 'resolution_id' = <id>::text`.

Tasks 2 and 3 append sections 3 and 4 to the same file and never touch these two.

It also adds:
- `tests/db/pg-query.ts`, the postgres-meta reader the realtime test already had inline, so the catalog and `EXPLAIN` tests in this task and the next two can share it.
- `scripts/seed-scale.mjs`, a development-only loader of about 10× today's data. Only Task 12 runs it, to measure `EXPLAIN ANALYZE` before and after 0033; this task only checks that it parses and that it refuses a non-local database.

**Files:**
- Create: `supabase/migrations/0033_data_layer_scale.sql` (sections 1 and 2)
- Create: `tests/db/pg-query.ts`
- Create: `scripts/seed-scale.mjs`
- Modify (rewrite): `tests/db/realtime-publication.test.ts` (uses `pgQuery` instead of its own copy)
- Test, create: `tests/db/data-layer-policies.test.ts`, `tests/db/data-layer-indexes.test.ts`
- Unchanged, and must still pass: `tests/db/rls.test.ts`, `tests/db/market-rls.test.ts`, `tests/db/parlay-rls.test.ts`, `tests/db/task-rls.test.ts`

**Interfaces:**
- Consumes:
  - The 16 policies as their latest migrations left them (0005, 0006, 0014, 0016, 0022, 0030). Their `pg_policies` text on `d53722e` is pinned in the policy test below.
  - postgres-meta's `POST /pg/query` on the local stack (`${NEXT_PUBLIC_SUPABASE_URL}/pg/query`, service-role key), as `tests/db/realtime-publication.test.ts` uses it today. Confirmed in the running `supabase/postgres-meta:v0.98.0` container (`/usr/src/app/dist/lib/db.js`, `dist/server/constants.js`):
    - it connects as `postgres`, the tables' owner, so reads through it bypass RLS
    - a multi-statement body goes to node-postgres as one simple query, so it runs as one implicit transaction: `set local` holds for the rest of the body and ends with it
    - it answers with the rows of the **last statement that returned any** (`res.reverse().find((x) => x.rows.length !== 0)`)
    - connections are pooled, so a plain `set` would leak into later requests; the tests use `set local`
    - each call has a 55-second limit (`PG_QUERY_TIMEOUT_SECS`)
  - `assertLocal` from `tests/db/helpers.ts`, and `seedMembers`, `clientFor`, `ensureInvited`, `createTestMarket` from `tests/db/fixtures.ts`.
- Produces:
  - `tests/db/pg-query.ts`:
    ```ts
    export async function pgQuery<Row>(sql: string): Promise<Row[]>
    ```
    It refuses a non-local URL through `assertLocal`. Tasks 2 and 3 import it.
  - 0033 section 1: the same 16 policy names, commands and roles, recreated. Section 2: `bets_market_created_idx`, `bets_outcome_id_idx`, `bets_profile_created_idx`, `coin_transactions_resolution_id_idx` (on the text `meta ->> 'resolution_id'`), `coin_transactions_created_idx`, `task_completions_profile_submitted_idx`, `task_completions_pending_submitted_idx`, `task_completions_approved_reviewed_idx`, `parlays_created_idx`, `parlays_won_settled_idx`, `market_resolutions_resolved_by_idx`, `markets_current_resolution_id_idx`.
  - `scripts/seed-scale.mjs`, run by hand as `node scripts/seed-scale.mjs` (Task 12).

**How the policy test proves nothing else changed.**
- Postgres prints `(select is_invited())` as `( SELECT is_invited() AS is_invited)`. The test turns every such wrap back into `is_invited()` (and the same for `is_admin()`), then expects the exact pre-0033 `qual` / `with_check` of all 16 rules, with the same command, `PERMISSIVE`, and roles `{authenticated}`.
- A second case strips the wraps and expects no `is_invited()` or `is_admin()` call left. `is_admin = false` in `insert_own_profile` is the column, not the function; only a call with `()` counts.
- Before 0033 the first case already passes (it is the snapshot) and the second fails with all 17 bare expressions (16 rules; `admin_update_tasks` has two).

**How the index test reads a plan.**
- It creates a small fixture (a resolved market with two bets), then sends `set local enable_seqscan = off; explain (format json) <query>` through `pgQuery`. The fixtures are a handful of rows, where a sequential scan is always cheapest; with seq scans priced out, a plan that still uses one has no index to use.
- The queries mirror the app's: the override's reversal lookup (0028), a market's bets (`getMarketBets` with the Task 5 limit of 51), a ledger range (the Task 4 keyset filter at 500 rows), and member activity (`listFeed` filtered by actor, every column).
- It walks the JSON plan and checks the named index appears (reversal, market bets, ledger) and that no node is a `Seq Scan`.
- **Member activity:** every branch must be read through an index except `market_created`, which filters `markets` by `created_by`. That is the spec's deliberate gap (it adds no `markets (created_by)` index). The two resolution branches (`market_resolved`, `bet_won`) join `markets` by `current_resolution_id`, which `markets_current_resolution_id_idx` serves, so the plan's only sequential scan is the one on `markets` for `market_created`. Before 0033 `markets` is scanned three times (once per market branch) and `bets` too, so the case fails. At the target scale `markets` holds a few hundred rows.

- [ ] **Step 1: Extract the postgres-meta reader**

Create `tests/db/pg-query.ts`:

```ts
import { assertLocal } from './helpers'

// PostgREST doesn't expose pg_catalog, so catalog and EXPLAIN reads go through the local stack's
// postgres-meta service: the /pg route Supabase Studio uses, behind the service-role key.
// A multi-statement query runs as one implicit transaction, so a `set local` holds for the rest
// of it and never leaks into postgres-meta's pooled connection. The answer is the rows of the
// last statement that returned any.
export async function pgQuery<Row>(sql: string): Promise<Row[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
  assertLocal(url)
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`postgres-meta ${res.status}: ${body.message ?? JSON.stringify(body)}`)
  return body as Row[]
}
```

Replace the whole of `tests/db/realtime-publication.test.ts` with:

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

Local Supabase must be running.

Run: `npx vitest run tests/db/realtime-publication.test.ts`
Expected: PASS (3 tests), as before.

- [ ] **Step 2: Write the failing policy test**

Create `tests/db/data-layer-policies.test.ts`:

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

// pg_policies as migration 0032 left them. 0033 may only wrap the helper calls.
const BEFORE_0033: Expression[] = [
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

- [ ] **Step 3: Write the failing index test**

Create `tests/db/data-layer-indexes.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { pgQuery } from './pg-query'

const INDEXES: Record<string, string> = {
  bets_market_created_idx: 'CREATE INDEX bets_market_created_idx ON public.bets USING btree (market_id, created_at DESC, id DESC)',
  bets_outcome_id_idx: 'CREATE INDEX bets_outcome_id_idx ON public.bets USING btree (outcome_id)',
  bets_profile_created_idx: 'CREATE INDEX bets_profile_created_idx ON public.bets USING btree (profile_id, created_at DESC)',
  coin_transactions_resolution_id_idx:
    "CREATE INDEX coin_transactions_resolution_id_idx ON public.coin_transactions USING btree (((meta ->> 'resolution_id'::text)))",
  coin_transactions_created_idx:
    'CREATE INDEX coin_transactions_created_idx ON public.coin_transactions USING btree (created_at DESC, id DESC)',
  task_completions_profile_submitted_idx:
    'CREATE INDEX task_completions_profile_submitted_idx ON public.task_completions USING btree (profile_id, submitted_at DESC)',
  task_completions_pending_submitted_idx:
    "CREATE INDEX task_completions_pending_submitted_idx ON public.task_completions USING btree (submitted_at) WHERE (status = 'pending'::text)",
  task_completions_approved_reviewed_idx:
    "CREATE INDEX task_completions_approved_reviewed_idx ON public.task_completions USING btree (reviewed_at DESC) WHERE (status = 'approved'::text)",
  parlays_created_idx: 'CREATE INDEX parlays_created_idx ON public.parlays USING btree (created_at DESC)',
  parlays_won_settled_idx:
    "CREATE INDEX parlays_won_settled_idx ON public.parlays USING btree (settled_at DESC) WHERE (status = 'won'::text)",
  market_resolutions_resolved_by_idx:
    'CREATE INDEX market_resolutions_resolved_by_idx ON public.market_resolutions USING btree (resolved_by)',
  markets_current_resolution_id_idx:
    'CREATE INDEX markets_current_resolution_id_idx ON public.markets USING btree (current_resolution_id)',
}

interface PlanNode {
  'Node Type': string
  'Relation Name'?: string
  'Index Name'?: string
  Plans?: PlanNode[]
}

// The fixtures are a handful of rows, where a sequential scan is cheapest whatever the indexes,
// so seq scans are priced out for the one statement: a plan that still uses one has no index to
// use. `set local` ends with postgres-meta's implicit transaction.
async function planNodes(query: string): Promise<PlanNode[]> {
  const [row] = await pgQuery<{ 'QUERY PLAN': [{ Plan: PlanNode }] }>(
    `set local enable_seqscan = off; explain (format json) ${query}`,
  )
  const nodes: PlanNode[] = []
  const walk = (node: PlanNode) => {
    nodes.push(node)
    node.Plans?.forEach(walk)
  }
  walk(row['QUERY PLAN'][0].Plan)
  return nodes
}

const indexesUsed = (nodes: PlanNode[]) => nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : []))
const seqScanned = (nodes: PlanNode[]) => nodes.filter((n) => n['Node Type'] === 'Seq Scan').map((n) => n['Relation Name'])
const relationsRead = (nodes: PlanNode[]) => new Set(nodes.flatMap((n) => (n['Relation Name'] ? [n['Relation Name']] : [])))

let bob: Member
let marketId: string
let resolutionId: string
let oldestLedgerRow: { created_at: string; id: number }

beforeAll(async () => {
  const [alice, member] = await seedMembers()
  bob = member
  const db = serviceClient()
  await db.from('profiles').update({ is_admin: true }).eq('id', alice.id)
  const aliceClient = await clientFor(alice)
  const bobClient = await clientFor(bob)
  await ensureInvited(bobClient)

  const market = await createTestMarket(aliceClient, ['Yes', 'No'])
  marketId = market.marketId
  for (const [client, outcomeId, amount] of [
    [bobClient, market.outcomeIds[0], 10],
    [aliceClient, market.outcomeIds[1], 5],
  ] as const) {
    const { error } = await client.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeId, p_amount: amount })
    if (error) throw error
  }
  const { error: resolveErr } = await aliceClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: market.outcomeIds[0] })
  if (resolveErr) throw resolveErr

  const { data: resolved, error: marketErr } = await db.from('markets').select('current_resolution_id').eq('id', marketId).single()
  if (marketErr) throw marketErr
  resolutionId = resolved.current_resolution_id

  const { data: oldest, error: ledgerErr } = await db
    .from('coin_transactions')
    .select('created_at, id')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .single()
  if (ledgerErr) throw ledgerErr
  oldestLedgerRow = oldest
})

describe('0033 indexes', () => {
  it('creates each index the named queries need', async () => {
    const rows = await pgQuery<{ indexname: string; indexdef: string }>(
      `select indexname, indexdef from pg_indexes where schemaname = 'public' and indexname in (${Object.keys(INDEXES)
        .map((name) => `'${name}'`)
        .join(', ')})`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]))).toEqual(INDEXES)
  })

  it("finds an override's payouts to reverse through the resolution id index", async () => {
    const nodes = await planNodes(
      `select profile_id, amount, id from public.coin_transactions where meta ->> 'resolution_id' = '${resolutionId}' order by profile_id, id`,
    )
    expect(indexesUsed(nodes)).toContain('coin_transactions_resolution_id_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads a market's newest bets in order from the market index", async () => {
    const nodes = await planNodes(
      `select id, outcome_id, amount, created_at, profile_id from public.bets where market_id = '${marketId}' order by created_at desc, id desc limit 51`,
    )
    expect(indexesUsed(nodes)).toContain('bets_market_created_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it('reads a ledger range from the created_at index', async () => {
    const ts = oldestLedgerRow.created_at
    const nodes = await planNodes(
      `select id, profile_id, amount, type, meta, created_at from public.coin_transactions where created_at > '${ts}' or (created_at = '${ts}' and id >= ${oldestLedgerRow.id}) order by created_at desc, id desc limit 500`,
    )
    expect(indexesUsed(nodes)).toContain('coin_transactions_created_idx')
    expect(seqScanned(nodes)).toEqual([])
  })

  it("reads each branch of a member's activity through an index", async () => {
    const nodes = await planNodes(
      `select id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title from public.activity_feed where actor_id = '${bob.id}' order by occurred_at desc, id desc limit 51`,
    )
    expect([...relationsRead(nodes)]).toEqual(
      expect.arrayContaining(['bets', 'parlays', 'market_resolutions', 'task_completions', 'profiles', 'markets']),
    )
    expect(indexesUsed(nodes)).toContain('markets_current_resolution_id_idx')
    // The one exception, as the spec intends: market_created filters markets by created_by, which
    // has no index.
    expect(seqScanned(nodes)).toEqual(['markets'])
  })
})
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run tests/db/data-layer-policies.test.ts tests/db/data-layer-indexes.test.ts`
Expected: FAIL, with 6 failed and 1 passed:
- `keeps every policy as it was…` passes: it is the pre-0033 snapshot.
- `calls is_invited() and is_admin() only inside a (select …)…` fails, listing 17 bare expressions.
- `creates each index…` fails: `pg_indexes` has none of the 12.
- The four plan cases fail. The reversal, market-bets and ledger cases don't find their index in the plan (each table is scanned sequentially); the member-activity case finds no `markets_current_resolution_id_idx`, with `markets` scanned three times and `bets` too.

- [ ] **Step 5: Create the migration, sections 1 and 2**

Create `supabase/migrations/0033_data_layer_scale.sql`:

```sql
-- ─── 1. Access rules run their helpers once per query ─────────────────────────
-- is_invited() and is_admin() (0003) are stable security definer functions,
-- which Postgres never inlines, so a bare call in a policy runs once per row.
-- Wrapped in a scalar subselect, each becomes an InitPlan that runs once per
-- statement, as 0016 did for auth.uid(). Every policy below is otherwise
-- exactly its latest definition (0005, 0006, 0014, 0016, 0022, 0030):
-- tests/db/data-layer-policies.test.ts proves only the wraps changed.

drop policy select_all_profiles on public.profiles;
create policy select_all_profiles on public.profiles for select to authenticated
  using ((select is_invited()));

drop policy insert_own_profile on public.profiles;
create policy insert_own_profile on public.profiles for insert to authenticated
  with check (
    id = (select auth.uid())
    and (select is_invited())
    and balance = 0
    and is_admin = false
    and lower(email) = lower((select auth.jwt()) ->> 'email')
  );

drop policy admin_select_invites on public.allowed_emails;
create policy admin_select_invites on public.allowed_emails for select to authenticated
  using ((select is_admin()));

drop policy admin_insert_invites on public.allowed_emails;
create policy admin_insert_invites on public.allowed_emails for insert to authenticated
  with check ((select is_admin()));

drop policy admin_delete_invites on public.allowed_emails;
create policy admin_delete_invites on public.allowed_emails for delete to authenticated
  using ((select is_admin()));

drop policy select_own_or_admin_transactions on public.coin_transactions;
create policy select_own_or_admin_transactions on public.coin_transactions for select to authenticated
  using (profile_id = (select auth.uid()) or (select is_admin()));

drop policy select_markets on public.markets;
create policy select_markets on public.markets for select to authenticated
  using ((select is_invited()));

drop policy select_market_outcomes on public.market_outcomes;
create policy select_market_outcomes on public.market_outcomes for select to authenticated
  using ((select is_invited()));

drop policy select_market_resolutions on public.market_resolutions;
create policy select_market_resolutions on public.market_resolutions for select to authenticated
  using ((select is_invited()));

drop policy select_invited_bets on public.bets;
create policy select_invited_bets on public.bets for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_invited_parlays on public.parlays;
create policy select_invited_parlays on public.parlays for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_invited_parlay_legs on public.parlay_legs;
create policy select_invited_parlay_legs on public.parlay_legs for select to authenticated
  using ((select is_invited()) or (select is_admin()));

drop policy select_tasks on public.tasks;
create policy select_tasks on public.tasks for select to authenticated
  using ((select is_invited()));

drop policy admin_insert_tasks on public.tasks;
create policy admin_insert_tasks on public.tasks for insert to authenticated
  with check ((select is_admin()));

drop policy admin_update_tasks on public.tasks;
create policy admin_update_tasks on public.tasks for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

drop policy select_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (select is_admin())
    or (status = 'approved' and (select is_invited()))
  );

-- ─── 2. Indexes for named queries ─────────────────────────────────────────────
-- Each serves a query named in the spec (docs/superpowers/specs/
-- 2026-09-26-data-layer-scale-design.md, 1b). The tables are small today, so
-- building them inside the migration's transaction, without concurrently, is
-- instant.

-- A market's bets and chart reads, and the resolve and void loops.
create index bets_market_created_idx on public.bets (market_id, created_at desc, id desc);
-- The winner payout loop and the feed's bet_won branch.
create index bets_outcome_id_idx on public.bets (outcome_id);
-- Member activity: the feed's bet branches filtered by actor.
create index bets_profile_created_idx on public.bets (profile_id, created_at desc);
-- The override's reversal lookup, which otherwise scans the whole ledger while
-- the market row is locked. On the text, not a ::uuid cast, which would fail
-- this migration, or a later insert, on any row whose resolution_id isn't a
-- uuid. resolve_market compares it with meta ->> 'resolution_id' = <id>::text.
create index coin_transactions_resolution_id_idx on public.coin_transactions ((meta ->> 'resolution_id'));
-- Admin ledger paging.
create index coin_transactions_created_idx on public.coin_transactions (created_at desc, id desc);
-- listMyTaskCompletions, and member activity's task branch.
create index task_completions_profile_submitted_idx on public.task_completions (profile_id, submitted_at desc);
-- listPendingTaskCompletions.
create index task_completions_pending_submitted_idx on public.task_completions (submitted_at) where status = 'pending';
-- The feed's task branch.
create index task_completions_approved_reviewed_idx on public.task_completions (reviewed_at desc) where status = 'approved';
-- The feed's parlay-placed branch.
create index parlays_created_idx on public.parlays (created_at desc);
-- The feed's parlay-won branch.
create index parlays_won_settled_idx on public.parlays (settled_at desc) where status = 'won';
-- Member activity: resolutions by a member.
create index market_resolutions_resolved_by_idx on public.market_resolutions (resolved_by);
-- The feed's market_resolved and bet_won branches, which join markets on its
-- current resolution; without it, member activity scans markets for each.
create index markets_current_resolution_id_idx on public.markets (current_resolution_id);
```

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` without error.

- [ ] **Step 6: Run the new tests, and the access tests that must not change**

Run: `npx vitest run tests/db/data-layer-policies.test.ts tests/db/data-layer-indexes.test.ts`
Expected: PASS (7 tests)

Run: `npx vitest run tests/db/rls.test.ts tests/db/market-rls.test.ts tests/db/parlay-rls.test.ts tests/db/task-rls.test.ts tests/db/realtime-publication.test.ts`
Expected: PASS, with no test file changed. The rewritten rules allow and refuse exactly what they did.

- [ ] **Step 7: Write the scale seed**

Create `scripts/seed-scale.mjs`:

```js
// Adds about 10× today's data to the LOCAL database, for measuring query plans at the scale the
// data-layer spec targets (docs/superpowers/specs/2026-09-26-data-layer-scale-design.md):
// 500 members, 200 markets, 20,000 bets with their ledger rows, resolutions and their payouts,
// overrides, voids, parlays and task completions. Development only: it refuses any database that
// isn't local, and CI never runs it. It only adds rows, tagged per run so it can run again;
// `npm run db:reset` clears everything, and the DB test suite needs one afterwards.
// Run it by hand: `node scripts/seed-scale.mjs`.
import { config } from 'dotenv'

config({ path: '.env.local', quiet: true })

const MEMBERS = 500
const MARKETS = 200
const BETS = 20_000
const PARLAYS = 400
const RESOLVED = 120
const OVERRIDDEN = 10
const VOIDED = 10
const TASKS = 20
const COMPLETIONS = 3_000

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost'])

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) throw new Error('Missing Supabase env vars — is .env.local present?')
const host = new URL(url).hostname
if (!LOCAL_HOSTS.has(host)) {
  console.error(`Refusing to seed ${host}: this script only writes to a local Supabase (${[...LOCAL_HOSTS].join(' or ')}).`)
  process.exit(1)
}

// Letters and digits only, so it is safe inside the SQL below.
const tag = Date.now().toString(36)
const memberEmails = `'scale-${tag}-%'`
const seedNote = `'Scale seed ${tag}'`
const adminEmail = `'scale-${tag}-1@example.test'`

// postgres-meta, the /pg route Supabase Studio uses: it runs a multi-statement query as one
// implicit transaction, with a 55-second limit, so each step is its own call.
async function run(step, sql) {
  const started = Date.now()
  const res = await fetch(`${url}/pg/query`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.json()
  if (!res.ok) throw new Error(`${step} failed: ${body.message ?? JSON.stringify(body)}`)
  console.log(`${step} (${((Date.now() - started) / 1000).toFixed(1)}s)`)
  return body
}

const scaleTempTables = `
  create temp table scale_members on commit drop as
    select id, email, row_number() over (order by id) as rn from public.profiles where email like ${memberEmails};
  create temp table scale_markets on commit drop as
    select id, created_at, row_number() over (order by created_at, id) as rn from public.markets where description = ${seedNote};
`

// Rows written straight into coin_transactions bypass apply_coin_transaction, so the balances
// are re-derived from the ledger, which is the invariant the app keeps.
const syncBalances = `
  update public.profiles p set balance = s.total
  from (select profile_id, sum(amount)::integer as total from public.coin_transactions group by profile_id) s
  where p.id = s.profile_id and p.email like ${memberEmails};
`

await run(
  `Members (${MEMBERS})`,
  `
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  select '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
    format('scale-%s-%s@example.test', '${tag}', n), '', now(),
    '', '', '', '',
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  from generate_series(1, ${MEMBERS}) n;

  -- on_profile_created grants each one the 100 DC starting grant.
  insert into public.profiles (id, email, display_name, is_admin)
  select id, email, 'Scale member ' || split_part(split_part(email, '@', 1), '-', 3), email = ${adminEmail}
  from auth.users where email like ${memberEmails};

  insert into public.allowed_emails (email, claimed_by)
  select email, id from public.profiles where email like ${memberEmails};

  insert into public.coin_transactions (profile_id, amount, type, meta)
  select id, 5000, 'admin_adjustment', jsonb_build_object('reason', 'Scale seed')
  from public.profiles where email like ${memberEmails};
  `,
)

await run(
  `Markets (${MARKETS})`,
  `
  ${scaleTempTables}
  insert into public.markets (created_by, title, description, kind, close_at, created_at)
  select m.id, format('Scale market %s', n), ${seedNote},
    case when n % 4 = 0 then 'multiple_choice' else 'binary' end,
    now() + interval '30 days', now() - (${MARKETS} + 1 - n) * interval '12 hours'
  from generate_series(1, ${MARKETS}) n
  join scale_members m on m.rn = 1 + (n * 37) % ${MEMBERS};

  insert into public.market_outcomes (market_id, label)
  select m.id, l.label
  from public.markets m
  cross join lateral unnest(
    case m.kind when 'binary' then array['Yes', 'No'] else array['Red', 'Blue', 'Green'] end
  ) as l(label)
  where m.description = ${seedNote};
  `,
)

await run(
  `Bets (${BETS}) and their ledger rows`,
  `
  ${scaleTempTables}
  create temp table scale_outcomes on commit drop as
    select id, market_id,
      row_number() over (partition by market_id order by label) as ord,
      count(*) over (partition by market_id) as k
    from public.market_outcomes where market_id in (select id from scale_markets);

  insert into public.bets (market_id, outcome_id, profile_id, amount, created_at)
  select m.id, o.id, p.id, r.amount, m.created_at + r.at * (now() - m.created_at)
  from (
    select 1 + floor(random() * ${MARKETS})::integer as market_rn,
      random() as pick,
      1 + floor(random() * ${MEMBERS})::integer as member_rn,
      1 + floor(random() * 20)::integer as amount,
      random() as at
    from generate_series(1, ${BETS})
  ) r
  join scale_markets m on m.rn = r.market_rn
  join scale_members p on p.rn = r.member_rn
  join scale_outcomes o on o.market_id = m.id and o.ord = 1 + floor(r.pick * o.k)::integer;

  -- The same meta place_bet writes.
  insert into public.coin_transactions (profile_id, amount, type, meta, created_at)
  select b.profile_id, -b.amount, 'bet_placed',
    jsonb_build_object('market_id', b.market_id, 'outcome_id', b.outcome_id), b.created_at
  from public.bets b
  where b.market_id in (select id from scale_markets)
  order by b.created_at, b.id;

  update public.market_outcomes o set pool_total = s.total
  from (
    select outcome_id, sum(amount)::integer as total
    from public.bets where market_id in (select id from scale_markets)
    group by outcome_id
  ) s
  where o.id = s.outcome_id;

  ${syncBalances}
  `,
)

// Parlays, resolutions and voids go through the real functions, acting as a member through the
// same JWT claims PostgREST sets, so every payout, reversal and settlement is the app's own.
await run(
  `Parlays (up to ${PARLAYS})`,
  `
  do $$
  declare
    v_member record;
    v_outcomes uuid[];
  begin
    for i in 1..${PARLAYS} loop
      select id, email into v_member from public.profiles
      where email = format('scale-%s-%s@example.test', '${tag}', 1 + (i * 53) % ${MEMBERS});
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_member.id, 'email', v_member.email, 'role', 'authenticated')::text,
        true
      );

      select array_agg(pick) into v_outcomes
      from (
        select (
          select o.id from public.market_outcomes o
          where o.market_id = m.id and o.pool_total > 0
          order by random() limit 1
        ) as pick
        from public.markets m
        where m.description = ${seedNote}
        order by random()
        limit 2 + i % 2
      ) picks
      where pick is not null;

      if coalesce(array_length(v_outcomes, 1), 0) >= 2 then
        perform public.place_parlay(v_outcomes, 1 + i % 10);
      end if;
    end loop;
  end
  $$;

  -- Spread them out in time; they were all placed in this transaction.
  update public.parlays set created_at = now() - random() * interval '60 days'
  where profile_id in (select id from public.profiles where email like ${memberEmails});

  update public.coin_transactions t set created_at = pa.created_at
  from public.parlays pa
  where t.type = 'parlay_placed' and (t.meta ->> 'parlay_id')::uuid = pa.id
    and pa.profile_id in (select id from public.profiles where email like ${memberEmails});
  `,
)

await run(
  `Resolutions (${RESOLVED}, ${OVERRIDDEN} of them overridden) and voids (${VOIDED})`,
  `
  do $$
  declare
    v_admin record;
    v_market record;
  begin
    select id, email into v_admin from public.profiles where email = ${adminEmail};
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_admin.id, 'email', v_admin.email, 'role', 'authenticated')::text,
      true
    );

    for v_market in
      select m.id, row_number() over (order by m.created_at, m.id) as rn
      from public.markets m
      where m.description = ${seedNote}
      order by m.created_at, m.id
    loop
      if v_market.rn <= ${RESOLVED} then
        perform public.resolve_market(
          v_market.id,
          (select o.id from public.market_outcomes o where o.market_id = v_market.id order by random() limit 1)
        );
        if v_market.rn <= ${OVERRIDDEN} then
          perform public.resolve_market(
            v_market.id,
            (
              select o.id
              from public.market_outcomes o
              join public.markets m on m.id = o.market_id
              join public.market_resolutions r on r.id = m.current_resolution_id
              where o.market_id = v_market.id and o.id <> r.outcome_id
              order by random() limit 1
            )
          );
        end if;
      elsif v_market.rn <= ${RESOLVED + VOIDED} then
        perform public.void_market(v_market.id);
      end if;
    end loop;
  end
  $$;
  `,
)

await run(
  `Tasks (${TASKS}) and completions (up to ${COMPLETIONS})`,
  `
  ${scaleTempTables}
  insert into public.tasks (title, description, reward_amount, is_repeatable, period, created_by, created_at)
  select format('Scale task %s', n), ${seedNote}, 5 * (1 + n % 5), true, 'weekly',
    (select id from scale_members where email = ${adminEmail}), now() - interval '200 days'
  from generate_series(1, ${TASKS}) n;

  create temp table scale_tasks on commit drop as
    select id, reward_amount, row_number() over (order by id) as rn
    from public.tasks where description = ${seedNote};

  -- A member can't have two live completions of a task in one week; clashes are skipped.
  insert into public.task_completions (
    task_id, profile_id, status, reward_amount, period_key, submitted_at, reviewed_at, reviewed_by
  )
  select t.id, p.id, s.status, t.reward_amount, public.compute_period_key('weekly', s.at), s.at,
    case when s.status <> 'pending' then least(s.at + interval '1 day', now()) end,
    case when s.status <> 'pending' then (select id from scale_members where email = ${adminEmail}) end
  from (
    select 1 + floor(random() * ${TASKS})::integer as task_rn,
      1 + floor(random() * ${MEMBERS})::integer as member_rn,
      now() - random() * interval '180 days' as at,
      (array['approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'approved', 'rejected', 'rejected', 'pending'])[1 + floor(random() * 10)::integer] as status
    from generate_series(1, ${COMPLETIONS})
  ) s
  join scale_tasks t on t.rn = s.task_rn
  join scale_members p on p.rn = s.member_rn
  on conflict do nothing;

  -- The same meta approve_task_completion writes.
  insert into public.coin_transactions (profile_id, amount, type, meta, created_at)
  select c.profile_id, c.reward_amount, 'task_completed',
    jsonb_build_object('task_id', c.task_id, 'completion_id', c.id), c.reviewed_at
  from public.task_completions c
  where c.status = 'approved' and c.task_id in (select id from scale_tasks)
  order by c.reviewed_at, c.id;

  ${syncBalances}
  `,
)

await run(
  'Statistics',
  'analyze public.profiles, public.markets, public.market_outcomes, public.bets, public.market_resolutions, public.coin_transactions, public.parlays, public.parlay_legs, public.tasks, public.task_completions;',
)

const [made] = await run(
  'Summary',
  `
  select
    (select count(*) from public.profiles where email like ${memberEmails}) as members,
    (select count(*) from public.markets where description = ${seedNote} and status = 'open') as open_markets,
    (select count(*) from public.markets where description = ${seedNote} and status = 'resolved') as resolved_markets,
    (select count(*) from public.markets where description = ${seedNote} and status = 'voided') as voided_markets,
    (select count(*) from public.bets b join public.markets m on m.id = b.market_id where m.description = ${seedNote}) as bets,
    (select count(*) from public.market_resolutions r join public.markets m on m.id = r.market_id where m.description = ${seedNote}) as resolutions,
    (select count(*) from public.parlays pa join public.profiles p on p.id = pa.profile_id where p.email like ${memberEmails}) as parlays,
    (select count(*) from public.task_completions c join public.tasks t on t.id = c.task_id where t.description = ${seedNote}) as task_completions,
    (select count(*) from public.coin_transactions t join public.profiles p on p.id = t.profile_id where p.email like ${memberEmails}) as ledger_rows
  `,
)

console.log(`\nSeeded run ${tag} into ${url}:`)
for (const [label, count] of Object.entries(made)) console.log(`  ${label.replaceAll('_', ' ')}: ${count}`)
```

**What it makes, and how.**
- **Additive and re-runnable.** Every run tags its rows (`scale-<tag>-<n>@example.test`, and `Scale seed <tag>` in the markets' and tasks' `description`), so a second run adds a second set rather than colliding. It never deletes.
- **Consistent with the app.** Bets and their `bet_placed` ledger rows are bulk inserts with `generate_series`, with the same meta `place_bet` writes, spread in time from each market's creation to now. The pools and balances are then re-derived from the rows. Parlays, resolutions (with their payouts and parlay settlement), ten overrides (so the reversal lookup has real rows) and voids go through the real functions, acting as a member through the JWT claims PostgREST would set. The balance check still holds at every step: each member gets a 5,000 DC top-up first.
- **Auth rows.** The `auth.users` rows fill GoTrue's token columns with `''`, not null, which GoTrue can't read. Nobody signs in as them.
- **Afterwards,** `npm run db:reset` is required before the DB suite: `seedMembers()` deletes auth users through `listUsers()`, which returns only its first page.
- **Checked** against a scratch Postgres (the same `supabase/postgres:17.6.1.159` image, migrations 0001–0032, through a stand-in for postgres-meta): it made 500 members, 200 markets (120 resolved, 10 of them overridden, 10 voided, 70 open), 20,000 bets, 400 parlays, about 3,000 task completions and about 31,000 ledger rows in under 2 seconds, with every balance equal to its ledger sum and every pool equal to its bets. 0033 then applied on top of the seeded data.

Do not run it here; Task 12 does, against a database it resets afterwards.

Run: `node --check scripts/seed-scale.mjs`
Expected: no output (it parses).

Run: `NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=x node scripts/seed-scale.mjs; echo "exit $?"`
Expected: `Refusing to seed example.supabase.co: this script only writes to a local Supabase (127.0.0.1 or localhost).` then `exit 1`. `dotenv` never overrides a variable that is already set, so `.env.local` doesn't mask the test.

- [ ] **Step 8: Verify**

Local Supabase must be running, with 0033 applied (Step 5).

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 759 tests in 124 files, 40 of them in `tests/db/`. This task adds 7 tests in 2 files, both in `tests/db/`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 24 passed, as before. The access rules allow exactly what they did, so no page changes.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0033_data_layer_scale.sql tests/db/pg-query.ts tests/db/realtime-publication.test.ts tests/db/data-layer-policies.test.ts tests/db/data-layer-indexes.test.ts scripts/seed-scale.mjs
git commit -m "Run access-rule helpers once per query, index the named queries, and add a scale seed"
```

---

## Task 2: 0033 part 2 — the clawback block and deterministic lock order

An admin override of a resolved market claws back what the old winners were paid. Today, if one of them has already spent it, the reversal hits the `profiles_balance_check` constraint part-way through, the whole call rolls back, and the admin sees Postgres's raw constraint message. This task makes the override check first:
- **Before anything changes,** `resolve_market` works out what each member would have to pay back, locks those members' profiles, and if anyone's balance is short raises `clawback_short:` followed by a JSON list of who is short.
- **The resolve action** recognises the prefix and shows, inline on the resolve form: "Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override."
- **Every other error** still comes back as `error.message`, as today. An override everyone can pay back runs exactly as before.

It also fixes the lock order. Every loop in `resolve_market` and `void_market` that credits or debits a member (the reversal, refund and payout loops, and the void refund loop) now runs `order by profile_id, id`, so two concurrent resolutions with overlapping bettors take profile locks in the same order and can't deadlock. The parlay loop was already ordered.

Both functions are recreated with `create or replace` from their latest definitions (0028), unchanged apart from those two things, as section 3 of 0033. The one other change is how `resolve_market` finds the current resolution's ledger rows: it compares the text `meta ->> 'resolution_id'` with `v_current_resolution_id::text`, which Task 1's text index serves, instead of casting every row's value to `uuid`. `create or replace` keeps their grants. `settle_parlay` is not touched.

**What a member "owes".** This is the sum, per member, of two things:
- **The current resolution's payouts:** every `coin_transactions` row whose `meta ->> 'resolution_id'` is the current resolution's id as text (its `bet_won` and `bet_refunded` credits). Task 1's text expression index serves this lookup. None of these has been reversed yet, because a resolution is only reversed as it stops being current.
- **Won parlays the override would reverse:** `parlays.credited` for every `won` parlay with a leg on this market whose outcome isn't the new one. That leg picked the old winner, so under a different winner the parlay loses and `settle_parlay` takes back its whole credit.

The sum is gross, not netted against what the new outcome would pay: the reversal runs before any new payout, so a member short of the gross amount is exactly the one today's function fails on. For parlays that is slightly conservative, because a new payout lands before `settle_parlay` runs; the plan accepts that. A member whose balance equals what they owe can pay it back, so they aren't listed.

**Files:**
- Modify: `supabase/migrations/0033_data_layer_scale.sql` (append section 3)
- Create: `lib/markets/clawback.ts`
- Modify: `lib/markets/resolve-market.ts` (the `if (error)` line)
- Test, create: `tests/lib/markets/clawback.test.ts`, `tests/lib/markets/resolve-market-action.test.ts`, `tests/db/clawback.test.ts`
- Test, modify: `tests/db/settle-parlay.test.ts` ("rolls the whole override back when the parlay clawback would go negative" asserted the raw `23514`; the block now answers first, with `P0001`)
- E2E, create: `e2e/clawback.spec.ts`

**Interfaces:**
- Consumes:
  - `resolve_market(p_market_id uuid, p_outcome_id uuid)` and `void_market(p_market_id uuid)` as 0028 defines them. The live local definitions (`pg_get_functiondef`) match 0028 exactly.
  - Task 1's `coin_transactions_resolution_id_idx`, and `pgQuery` from `tests/db/pg-query.ts`.
  - `ResolveForm` (`app/(app)/markets/[id]/resolve-form.tsx`), unchanged: it already renders `state.formError` in `<Message tone="error" id="resolve-error">` and wires `aria-invalid` / `aria-describedby` on its select.
- Produces:
  - Section 3 of 0033. On a short override, `resolve_market` raises `raise exception '%', 'clawback_short:' || <jsonb>` (sqlstate `P0001`, the `raise exception` default). The JSON is an array ordered by display name, then profile id, with one element per member whose balance is below what they owe, and integer values. `jsonb` prints its keys in its own order, with spaces:
    ```text
    clawback_short:[{"owed": 60, "balance": 20, "display_name": "Bob"}]
    ```
  - `lib/markets/clawback.ts`, a plain module (a `'use server'` file may only export async functions):
    ```ts
    export const CLAWBACK_PREFIX = 'clawback_short:'
    export type ClawbackShort = { display_name: string; owed: number; balance: number }
    export function parseClawbackError(message: string | undefined | null): ClawbackShort[] | null
    export function clawbackMessage(short: ClawbackShort[]): string
    ```
    `parseClawbackError` returns `null` unless the message starts with the prefix and is followed by a non-empty JSON array of valid entries; it never throws.
  - `resolveMarketAction` returns `{ formError: clawbackMessage(short) }` for a clawback error and `{ formError: error.message }` for any other.

**The copy** (new, for sign-off). In the JSON's order, with `spent = owed − balance` and `won = owed`, as plain integers:
- one member: "Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override."
- two: "Can’t override: Bob has already spent 40 of 60 DC won on this market, and Carol 15 of 30. Adjust their balances first if you still want to override."
- three or more: "Can’t override: Bob has already spent 40 of 60 DC won on this market, Carol 15 of 30, and Dan 5 of 10. Adjust their balances first if you still want to override."

**How the check locks.** The query that builds the list reads the owing members' profiles in a subquery with `order by p.id for update of p`, and aggregates with `filter (where m.balance < m.owed)` rather than a `where`. So no predicate is pushed into the locking subquery: every owing member's row is locked, in id order, before the reversal loop (also in profile order) updates them, and their balances can't move in between. The market row is locked first, as before.

- [ ] **Step 1: Write the failing message tests**

Create `tests/lib/markets/clawback.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CLAWBACK_PREFIX, clawbackMessage, parseClawbackError } from '@/lib/markets/clawback'

const bob = { display_name: 'Bob', owed: 60, balance: 20 }
const carol = { display_name: 'Carol', owed: 30, balance: 15 }
const dan = { display_name: 'Dan', owed: 10, balance: 5 }

describe('parseClawbackError', () => {
  it('reads the members from the message resolve_market raises', () => {
    // jsonb prints its keys in its own order, with spaces.
    const message = `${CLAWBACK_PREFIX}[{"owed": 60, "balance": 20, "display_name": "Bob"}, {"owed": 30, "balance": 15, "display_name": "Carol"}]`
    expect(parseClawbackError(message)).toEqual([bob, carol])
  })

  it('drops any extra fields', () => {
    expect(parseClawbackError(`${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":60,"balance":20,"id":"x"}]`)).toEqual([bob])
  })

  it.each([
    ['no message', undefined],
    ['a null message', null],
    ['an empty message', ''],
    ['any other database error', 'new row for relation "profiles" violates check constraint "profiles_balance_check"'],
    ['the prefix somewhere other than the start', `oops ${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":60,"balance":20}]`],
    ['JSON that does not parse', `${CLAWBACK_PREFIX}[{"display_name":`],
    ['an empty list', `${CLAWBACK_PREFIX}[]`],
    ['an object, not a list', `${CLAWBACK_PREFIX}{"display_name":"Bob","owed":60,"balance":20}`],
    ['a member without a name', `${CLAWBACK_PREFIX}[{"owed":60,"balance":20}]`],
    ['an amount that is not a whole number', `${CLAWBACK_PREFIX}[{"display_name":"Bob","owed":"60","balance":20}]`],
    ['a null entry', `${CLAWBACK_PREFIX}[null]`],
  ])('returns null for %s', (_case, message) => {
    expect(parseClawbackError(message)).toBeNull()
  })
})

describe('clawbackMessage', () => {
  it('names one member, with what they spent and what they won', () => {
    expect(clawbackMessage([bob])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    )
  })

  it('joins a second member with ", and"', () => {
    expect(clawbackMessage([bob, carol])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market, and Carol 15 of 30. Adjust their balances first if you still want to override.',
    )
  })

  it('lists three or more with a comma before the last', () => {
    expect(clawbackMessage([bob, carol, dan])).toBe(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market, Carol 15 of 30, and Dan 5 of 10. Adjust their balances first if you still want to override.',
    )
  })

  it('keeps the order it was given', () => {
    expect(clawbackMessage([carol, bob])).toMatch(/^Can’t override: Carol has already spent 15 of 30 DC won on this market, and Bob 40 of 60\./)
  })
})
```

Create `tests/lib/markets/resolve-market-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { resolveMarketAction } from '@/lib/markets/resolve-market'

function outcomeForm(outcomeId: string) {
  const form = new FormData()
  form.set('outcome_id', outcomeId)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  revalidatePath.mockReset()
})

describe('resolveMarketAction', () => {
  it('turns a blocked override into the message naming who is short', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'clawback_short:[{"owed": 60, "balance": 20, "display_name": "Bob"}]' },
    })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(supabase.rpc).toHaveBeenCalledWith('resolve_market', { p_market_id: 'market-1', p_outcome_id: 'outcome-2' })
    expect(state).toEqual({
      formError:
        'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps every other error message as it is', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'only an admin can change an already-resolved market' } })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-2'))

    expect(state).toEqual({ formError: 'only an admin can change an already-resolved market' })
  })

  it('refreshes the layout when the resolution goes through', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await resolveMarketAction('market-1', undefined, outcomeForm('outcome-1'))

    expect(state).toBeUndefined()
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })
})
```

Run: `npx vitest run tests/lib/markets/clawback.test.ts tests/lib/markets/resolve-market-action.test.ts`
Expected: FAIL. `clawback.test.ts` can't resolve `@/lib/markets/clawback`, and the action's clawback case gets the raw `clawback_short:…` message back (1 failed, 2 passed in that file).

- [ ] **Step 2: Write `lib/markets/clawback.ts` and map the error in the action**

Create `lib/markets/clawback.ts`:

```ts
// resolve_market (migration 0033) blocks an override that would claw back more than a past
// winner still has, raising this prefix and a JSON list of who's short. This turns it into the
// resolve form's message. A plain module, beside the 'use server' action that uses it.
export const CLAWBACK_PREFIX = 'clawback_short:'

export type ClawbackShort = { display_name: string; owed: number; balance: number }

function isShort(value: unknown): value is ClawbackShort {
  if (typeof value !== 'object' || value === null) return false
  const { display_name, owed, balance } = value as Record<string, unknown>
  return typeof display_name === 'string' && Number.isInteger(owed) && Number.isInteger(balance)
}

export function parseClawbackError(message: string | undefined | null): ClawbackShort[] | null {
  if (!message?.startsWith(CLAWBACK_PREFIX)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(message.slice(CLAWBACK_PREFIX.length))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(isShort)) return null
  return parsed.map(({ display_name, owed, balance }) => ({ display_name, owed, balance }))
}

export function clawbackMessage(short: ClawbackShort[]): string {
  const [first, ...rest] = short.map(({ display_name, owed, balance }) => ({ name: display_name, spent: owed - balance, won: owed }))
  const lead = `${first.name} has already spent ${first.spent} of ${first.won} DC won on this market`
  const others = rest.map(({ name, spent, won }) => `${name} ${spent} of ${won}`)
  const list = others.length === 0 ? lead : `${[lead, ...others.slice(0, -1)].join(', ')}, and ${others.at(-1)}`
  return `Can’t override: ${list}. Adjust their balances first if you still want to override.`
}
```

In `lib/markets/resolve-market.ts`, replace:

```ts
import { requireUser } from '@/lib/auth/require-user'
```

with:

```ts
import { requireUser } from '@/lib/auth/require-user'
import { clawbackMessage, parseClawbackError } from '@/lib/markets/clawback'
```

and replace:

```ts
  if (error) return { formError: error.message }
```

with:

```ts
  if (error) {
    const short = parseClawbackError(error.message)
    return { formError: short ? clawbackMessage(short) : error.message }
  }
```

Run: `npx vitest run tests/lib/markets/clawback.test.ts tests/lib/markets/resolve-market-action.test.ts`
Expected: PASS (20 tests: 17 and 3)

- [ ] **Step 3: Write the failing DB tests**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` (sections 1 and 2) without error.

Create `tests/db/clawback.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, ensureInvited, makeMember, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'
import { CLAWBACK_PREFIX } from '@/lib/markets/clawback'

let alice: Member
let bob: Member
let carol: Member
let aliceClient: SupabaseClient
let bobClient: SupabaseClient
let carolClient: SupabaseClient

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  carol = await makeMember('Carol')
  // Alice creates, resolves and overrides every market; as an admin she can resolve before close_at.
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
  aliceClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  carolClient = await clientFor(carol)
  await ensureInvited(bobClient)
})

async function bet(client: SupabaseClient, market: TestMarket, outcomeIndex: number, amount: number) {
  const { error } = await client.rpc('place_bet', {
    p_market_id: market.marketId,
    p_outcome_id: market.outcomeIds[outcomeIndex],
    p_amount: amount,
  })
  if (error) throw error
}

async function resolve(market: TestMarket, outcomeIndex: number) {
  return aliceClient.rpc('resolve_market', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[outcomeIndex] })
}

async function balanceOf(member: Member): Promise<number> {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', member.id).single()
  if (error) throw error
  return data.balance
}

// Leaves the member exactly `left` DC, as if they had spent the rest elsewhere.
async function spendDownTo(member: Member, left: number) {
  const { error } = await serviceClient().rpc('apply_coin_transaction', {
    p_profile_id: member.id,
    p_amount: left - (await balanceOf(member)),
    p_type: 'test_spend',
  })
  if (error) throw error
}

// Everything an override could touch: balances, the ledger, the market, its resolutions and parlays.
async function snapshot(market: TestMarket) {
  const db = serviceClient()
  const [profiles, ledger, markets, resolutions, parlays] = await Promise.all([
    db.from('profiles').select('id, balance').order('id'),
    db.from('coin_transactions').select('id, profile_id, amount, type').order('id'),
    db.from('markets').select('status, current_resolution_id').eq('id', market.marketId).single(),
    db.from('market_resolutions').select('id, outcome_id, reversed_at').eq('market_id', market.marketId).order('id'),
    db.from('parlays').select('id, status, credited').order('id'),
  ])
  for (const { error } of [profiles, ledger, markets, resolutions, parlays]) if (error) throw error
  return { profiles: profiles.data, ledger: ledger.data, market: markets.data, resolutions: resolutions.data, parlays: parlays.data }
}

function shortList(message: string | undefined): unknown {
  expect(message?.startsWith(CLAWBACK_PREFIX)).toBe(true)
  return JSON.parse(message!.slice(CLAWBACK_PREFIX.length))
}

describe('resolve_market override: resolution payouts', () => {
  // Pool 60: Bob 20 and Carol 10 on Yes, Alice 30 on No. Yes pays Bob 40 and Carol 20.
  async function resolvedYes(): Promise<TestMarket> {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    await bet(bobClient, market, 0, 20)
    await bet(carolClient, market, 0, 10)
    await bet(aliceClient, market, 1, 30)
    const { error } = await resolve(market, 0)
    if (error) throw error
    return market
  }

  it('blocks the override, naming everyone short in name order, and changes nothing', async () => {
    const market = await resolvedYes()
    await spendDownTo(bob, 10)
    await spendDownTo(carol, 5)
    const before = await snapshot(market)

    const { error } = await resolve(market, 1)

    expect(error?.code).toBe('P0001')
    expect(shortList(error?.message)).toEqual([
      { display_name: 'Bob', owed: 40, balance: 10 },
      { display_name: 'Carol', owed: 20, balance: 5 },
    ])
    expect(await snapshot(market)).toEqual(before)
  })

  it('goes through as before when everyone can pay back, even with their last coin', async () => {
    const market = await resolvedYes()
    await spendDownTo(bob, 40)

    const { error } = await resolve(market, 1)

    expect(error).toBeNull()
    expect(await balanceOf(bob)).toBe(0)
    expect(await balanceOf(carol)).toBe(100 - 10)
    // Alice's 30 is now the whole winning pool, so she takes all 60.
    expect(await balanceOf(alice)).toBe(100 - 30 + 60)
    const { data: reversals, error: ledgerErr } = await serviceClient()
      .from('coin_transactions')
      .select('profile_id, amount')
      .eq('type', 'resolution_reversed')
    if (ledgerErr) throw ledgerErr
    expect(reversals).toHaveLength(2)
    expect(reversals).toEqual(
      expect.arrayContaining([
        { profile_id: bob.id, amount: -40 },
        { profile_id: carol.id, amount: -20 },
      ]),
    )
  })
})

describe('resolve_market override: won parlays', () => {
  // Both markets are seeded 5 on Yes and 15 on No, so Yes locks at 4x and Bob's 10 DC parlay on
  // both Yeses pays 160 once they win.
  async function parlayOnBothYeses(): Promise<{ a: TestMarket; b: TestMarket; parlayId: string }> {
    const a = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market A' })
    const b = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Market B' })
    for (const market of [a, b]) {
      await bet(aliceClient, market, 0, 5)
      await bet(aliceClient, market, 1, 15)
    }
    const { data, error } = await bobClient.rpc('place_parlay', { p_outcome_ids: [a.outcomeIds[0], b.outcomeIds[0]], p_stake: 10 })
    if (error) throw error
    return { a, b, parlayId: data as string }
  }

  async function resolveBothYes(a: TestMarket, b: TestMarket) {
    for (const market of [a, b]) {
      const { error } = await resolve(market, 0)
      if (error) throw error
    }
  }

  it('adds the parlay credit to what a member owes, blocks the override and changes nothing', async () => {
    const { a, b, parlayId } = await parlayOnBothYeses()
    // Bob also backs Yes on A directly: A's pool is then 25 with 10 on Yes, so Yes pays him 12.
    await bet(bobClient, a, 0, 5)
    await resolveBothYes(a, b)
    await spendDownTo(bob, 50)
    const before = await snapshot(a)
    expect(before.parlays).toEqual([{ id: parlayId, status: 'won', credited: 160 }])

    const { error } = await resolve(a, 1)

    expect(error?.code).toBe('P0001')
    // 12 from A's payout plus the parlay's 160. Alice owes A's other 12, which she has.
    expect(shortList(error?.message)).toEqual([{ display_name: 'Bob', owed: 172, balance: 50 }])
    expect(await snapshot(a)).toEqual(before)
  })

  it('reverses the parlay as before when the member can pay it back', async () => {
    const { a, b, parlayId } = await parlayOnBothYeses()
    await resolveBothYes(a, b)
    await spendDownTo(bob, 160)

    const { error } = await resolve(a, 1)

    expect(error).toBeNull()
    expect(await balanceOf(bob)).toBe(0)
    const { data: parlay } = await serviceClient().from('parlays').select('status, credited').eq('id', parlayId).single()
    expect(parlay).toEqual({ status: 'lost', credited: 0 })
    const { data: reversal } = await serviceClient()
      .from('coin_transactions')
      .select('amount')
      .eq('profile_id', bob.id)
      .eq('type', 'parlay_reversed')
    expect(reversal).toEqual([{ amount: -160 }])
  })
})

describe('resolve_market and void_market lock order', () => {
  async function definition(signature: string): Promise<string> {
    const [row] = await pgQuery<{ def: string }>(`select pg_get_functiondef('public.${signature}'::regprocedure) as def`)
    return row.def
  }

  // Every loop that credits or debits a member: the reversal, refund and payout loops.
  const memberLoops = (def: string) => def.match(/for v_(?:txn|bet) in\s+select[\s\S]*?\bloop\b/g) ?? []

  it('credits and debits members in profile order, so concurrent resolutions cannot deadlock', async () => {
    const resolveLoops = memberLoops(await definition('resolve_market(uuid,uuid)'))
    const voidLoops = memberLoops(await definition('void_market(uuid)'))

    expect(resolveLoops).toHaveLength(3)
    expect(voidLoops).toHaveLength(1)
    for (const loop of [...resolveLoops, ...voidLoops]) expect(loop).toContain('order by profile_id, id')
  })
})
```

In `tests/db/settle-parlay.test.ts`, in "rolls the whole override back when the parlay clawback would go negative", replace:

```ts
    expect(error?.code).toBe('23514')
```

with:

```ts
    // 0033 blocks it up front, naming who's short, rather than failing on the balance check part-way.
    expect(error?.code).toBe('P0001')
    expect(error?.message).toBe('clawback_short:[{"owed": 160, "balance": 50, "display_name": "Bob"}]')
```

The rest of that test (the market, the parlay and both balances unchanged) stays as it is. Alice owes A's 20 DC payout there, which her 100 DC covers, so only Bob is listed.

Run: `npx vitest run tests/db/clawback.test.ts tests/db/settle-parlay.test.ts`
Expected: FAIL, with 4 failed:
- `clawback.test.ts`: 3 failed, 2 passed. Both blocking cases get `23514` instead of `P0001`, and the lock-order case finds 3 and 1 member loops with no `order by profile_id, id`. The two "as before" cases already pass.
- `settle-parlay.test.ts`: "rolls the whole override back…" gets `23514`; every other case passes.

- [ ] **Step 4: Append section 3 to the migration and apply it**

Append this block to the end of `supabase/migrations/0033_data_layer_scale.sql`:

```sql
-- ─── 3. Resolve and void: clawback block and deterministic lock order ─────────
-- Both recreated from 0028 with two changes. First, an override checks, before
-- anything changes, that every earlier winner can pay back what it would claw
-- back, and otherwise raises 'clawback_short:' plus a JSON list of who's short
-- (lib/markets/clawback.ts turns that into the resolve form's message). Second,
-- every loop that credits or debits a member runs in profile order, so two
-- concurrent resolutions with overlapping bettors lock profiles in the same
-- sequence and can't deadlock. The reversal also finds its ledger rows by the
-- text resolution_id, which section 2's index serves, rather than a ::uuid
-- cast. create or replace keeps both functions' grants.

create or replace function public.resolve_market(p_market_id uuid, p_outcome_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_close_at timestamptz;
  v_current_resolution_id uuid;
  v_outcome_market_id uuid;
  v_total_pool integer;
  v_winning_pool integer;
  v_new_resolution_id uuid;
  v_is_admin boolean;
  v_txn record;
  v_bet record;
  v_parlay_id uuid;
  v_short jsonb;
begin
  select created_by, status, close_at, current_resolution_id
    into v_created_by, v_status, v_close_at, v_current_resolution_id
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status = 'voided' then
    raise exception 'market was voided';
  end if;

  select public.is_admin() into v_is_admin;

  if v_status = 'resolved' then
    -- Overriding an already-resolved market: admin only. This is the
    -- clawback path.
    if not v_is_admin then
      raise exception 'only an admin can change an already-resolved market';
    end if;
  else
    -- First-time resolution: the creator or an admin. Only once closed,
    -- unless an admin is resolving early.
    if not (auth.uid() = v_created_by or v_is_admin) then
      raise exception 'only the market creator or an admin can resolve this market';
    end if;
    if now() < v_close_at and not v_is_admin then
      raise exception 'market has not closed yet';
    end if;
  end if;

  select market_id into v_outcome_market_id
  from public.market_outcomes
  where id = p_outcome_id;

  if v_outcome_market_id is null or v_outcome_market_id <> p_market_id then
    raise exception 'outcome does not belong to this market';
  end if;

  -- An override claws back every payout of the current resolution, and
  -- settle_parlay reverses every won parlay whose leg here picked the old
  -- winner. A member who has spent their winnings would hit the balance check
  -- part-way through, so check first and name who's short. What's owed is
  -- gross, not netted against the new outcome's payouts: the reversal runs
  -- before any new payout. Nothing of it is already reversed, because a
  -- resolution is only ever reversed as it stops being current. The owing
  -- members' profiles are locked, in id order, so their balances can't move
  -- before the reversal.
  if v_status = 'resolved' then
    select jsonb_agg(
             jsonb_build_object('display_name', m.display_name, 'owed', m.owed, 'balance', m.balance)
             order by m.display_name, m.id
           ) filter (where m.balance < m.owed)
      into v_short
    from (
      select p.id, p.display_name, p.balance, o.owed
      from public.profiles p
      join (
        select c.profile_id, sum(c.amount) as owed
        from (
          select t.profile_id, t.amount
          from public.coin_transactions t
          where t.meta ->> 'resolution_id' = v_current_resolution_id::text
          union all
          select pa.profile_id, pa.credited
          from public.parlays pa
          where pa.status = 'won'
            and exists (
              select 1 from public.parlay_legs l
              where l.parlay_id = pa.id
                and l.market_id = p_market_id
                and l.outcome_id <> p_outcome_id
            )
        ) c
        group by c.profile_id
      ) o on o.profile_id = p.id
      order by p.id
      for update of p
    ) m;

    if v_short is not null then
      raise exception '%', 'clawback_short:' || v_short::text;
    end if;
  end if;

  -- Reverse the currently-active resolution's payouts, if there is one.
  -- Every payout/refund a resolution makes carries that resolution's own
  -- id in meta, so this targets exactly (and only) those transactions --
  -- never a later resolution's, never an unrelated bet.
  if v_current_resolution_id is not null then
    for v_txn in
      select profile_id, amount, id
      from public.coin_transactions
      where meta ->> 'resolution_id' = v_current_resolution_id::text
      order by profile_id, id
    loop
      perform public.apply_coin_transaction(
        v_txn.profile_id, -v_txn.amount, 'resolution_reversed',
        jsonb_build_object(
          'market_id', p_market_id,
          'reversed_resolution_id', v_current_resolution_id,
          'original_transaction_id', v_txn.id
        )
      );
    end loop;

    update public.market_resolutions
    set reversed_at = now(), reversed_by = auth.uid()
    where id = v_current_resolution_id;
  end if;

  insert into public.market_resolutions (market_id, outcome_id, resolved_by)
  values (p_market_id, p_outcome_id, auth.uid())
  returning id into v_new_resolution_id;

  update public.markets
  set status = 'resolved', current_resolution_id = v_new_resolution_id
  where id = p_market_id;

  select coalesce(sum(pool_total), 0) into v_total_pool
  from public.market_outcomes where market_id = p_market_id;

  select pool_total into v_winning_pool
  from public.market_outcomes where id = p_outcome_id;

  if v_winning_pool = 0 then
    for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id, v_bet.amount, 'bet_refunded',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  else
    for v_bet in select profile_id, amount, id from public.bets where outcome_id = p_outcome_id order by profile_id, id loop
      perform public.apply_coin_transaction(
        v_bet.profile_id,
        floor(v_bet.amount::numeric * v_total_pool / v_winning_pool)::integer,
        'bet_won',
        jsonb_build_object('market_id', p_market_id, 'resolution_id', v_new_resolution_id, 'bet_id', v_bet.id)
      );
    end loop;
  end if;

  -- Fixed order, so two concurrent resolutions touching overlapping
  -- parlays lock them in the same sequence and can't deadlock.
  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;

create or replace function public.void_market(p_market_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created_by uuid;
  v_status text;
  v_bet record;
  v_parlay_id uuid;
begin
  select created_by, status into v_created_by, v_status
  from public.markets
  where id = p_market_id
  for update;

  if not found then
    raise exception 'market not found';
  end if;

  if v_status <> 'open' then
    raise exception 'only an unresolved, unvoided market can be voided';
  end if;

  if not (auth.uid() = v_created_by or public.is_admin()) then
    raise exception 'only the market creator or an admin can void this market';
  end if;

  update public.markets set status = 'voided' where id = p_market_id;

  for v_bet in select profile_id, amount, id from public.bets where market_id = p_market_id order by profile_id, id loop
    perform public.apply_coin_transaction(
      v_bet.profile_id, v_bet.amount, 'bet_voided_refund',
      jsonb_build_object('market_id', p_market_id, 'bet_id', v_bet.id)
    );
  end loop;

  for v_parlay_id in
    select distinct parlay_id from public.parlay_legs
    where market_id = p_market_id
    order by parlay_id
  loop
    perform public.settle_parlay(v_parlay_id);
  end loop;
end;
$$;
```

Compared with `pg_get_functiondef` of the 0028 functions, the only differences are the `v_short` declaration, the clawback block, the reversal loop's text comparison (`meta ->> 'resolution_id' = v_current_resolution_id::text`), and `order by profile_id, id` on the reversal, refund and payout loops (`resolve_market`) and the refund loop (`void_market`). Everything else, including every comment, is 0028's text.

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` without error.

Run: `npx vitest run tests/db/clawback.test.ts tests/db/settle-parlay.test.ts tests/db/resolve-market.test.ts tests/db/void-market.test.ts`
Expected: PASS. `resolve-market.test.ts`'s "fails atomically, changing nothing, if reversal would take a past winner negative" still passes unchanged: its `toMatch(/balance/)` now matches the JSON's `"balance"` key, and nothing changes, as before.

- [ ] **Step 5: Write the e2e spec**

Create `e2e/clawback.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// e2e/global-setup.ts seeds Bob beside Alice, the signed-in admin. Bob bets through his own
// session; Alice resolves, takes most of his winnings back on /admin/members, then tries to
// override. Alice's own balance never moves, so the specs that read it are unaffected.
test('an override is blocked, naming the member who has spent their winnings', async ({ page }) => {
  const db = serviceClient()
  const { data: bob, error } = await db.from('profiles').select('id, balance').eq('email', 'bob@example.com').single()
  if (error) throw error
  // A retry starts from the 20 DC the first attempt left him.
  if (bob.balance < 60) {
    const { error: topUpErr } = await db.rpc('apply_coin_transaction', {
      p_profile_id: bob.id,
      p_amount: 60 - bob.balance,
      p_type: 'test_top_up',
    })
    if (topUpErr) throw topUpErr
  }
  const bobClient = await clientForEmail('bob@example.com')

  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Will the override be blocked?')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
  const marketPath = new URL(page.url()).pathname
  const marketId = marketPath.split('/').at(-1)!

  const { data: outcomes, error: outcomesErr } = await db.from('market_outcomes').select('id, label').eq('market_id', marketId)
  if (outcomesErr) throw outcomesErr
  // Bob's 20 on Yes is the whole winning pool, so Yes pays him all 60.
  for (const [label, amount] of [
    ['Yes', 20],
    ['No', 40],
  ] as const) {
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomes.find((o) => o.label === label)!.id,
      p_amount: amount,
    })
    if (betErr) throw betErr
  }

  await page.reload()
  await page.getByLabel('Winning outcome').selectOption({ label: 'Yes' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()
  await expect(page.getByText('Status: resolved')).toBeVisible()

  const { data: afterWin, error: balanceErr } = await db.from('profiles').select('balance').eq('id', bob.id).single()
  if (balanceErr) throw balanceErr
  await page.goto('/admin/members')
  const bobRow = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: 'Bob', exact: true }) })
  await bobRow.getByLabel('Amount').fill(String(20 - afterWin.balance))
  await bobRow.getByLabel('Reason').fill('Spent elsewhere')
  await bobRow.getByRole('button', { name: 'Adjust Bob' }).click()
  await expect(bobRow.getByText('20 DC', { exact: true })).toBeVisible()

  await page.goto(marketPath)
  await page.getByLabel('Winning outcome').selectOption({ label: 'No' })
  await page.getByRole('button', { name: 'Confirm outcome' }).click()

  await expect(
    page.getByText(
      'Can’t override: Bob has already spent 40 of 60 DC won on this market. Adjust their balances first if you still want to override.',
    ),
  ).toBeVisible()
  await expect(page.getByLabel('Winning outcome')).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Winning outcome: Yes')).toBeVisible()
})
```

**How the spec sets up.**
- `e2e/global-setup.ts` seeds Bob (`bob@example.com`, 100 DC, not invited). `place_bet` doesn't check invites, so he needs no `allowed_emails` row, and the spec doesn't add one.
- Bob bets 20 on Yes and 40 on No through his own session (`clientForEmail`), so his 20 is the whole winning pool and resolving Yes pays him the full 60. His balance is back where it started, and Alice's never moves, so the specs that read her balance are unaffected.
- Alice (the stored session) resolves in the UI, then lowers Bob to 20 DC on `/admin/members`, leaving 40 of his 60 spent. The override to No shows the one-member message, and the page still says "Winning outcome: Yes".
- Retries: the spec tops Bob back up to 60 through the service role if an earlier attempt left him short.

- [ ] **Step 6: Verify**

Local Supabase must be running, with 0033 re-applied (Step 4).

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 784 tests in 127 files, 41 of them in `tests/db/`. This task adds 25 tests in 3 files (17 + 3 unit, 5 in `tests/db/`).

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 25 passed: the 24 after Task 1 plus `clawback.spec.ts`. `market-engine.spec.ts`'s resolve is a first resolution, never an override, so the block never runs there.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0033_data_layer_scale.sql lib/markets/clawback.ts lib/markets/resolve-market.ts tests/lib/markets/clawback.test.ts tests/lib/markets/resolve-market-action.test.ts tests/db/clawback.test.ts tests/db/settle-parlay.test.ts e2e/clawback.spec.ts
git commit -m "Block an override a past winner can't pay back, and settle members in a fixed order"
```

---

## Task 3: 0033 part 3 — batch review

Bulk approve and bulk reject on `/admin/tasks` make one database call per selected completion today, one after another. This task adds `review_task_completions`, which reviews a whole selection in one call, and points both bulk actions at it:
- It checks `is_admin()` once, then takes the distinct ids in ascending order and runs the existing `approve_task_completion` or `reject_task_completion` for each, inside its own `begin … exception` block.
- A completion that fails (already reviewed, say, or not found) is rolled back on its own and reported on its row. The others still go through.
- It returns one `(id, ok, error)` row per distinct id, ascending. Ascending order also means two overlapping batches lock completions in the same order.

The bulk actions keep `BulkActionState` and their summaries exactly: "2 approved.", "1 approved, 2 failed (completion is not pending).", and the same with "rejected". The error in brackets is now the first failure in ascending id order, rather than in the order the checkboxes were ticked. A call that fails outright (not an admin, a network error) reports every selected completion as failed with that call's error, e.g. "0 approved, 3 failed (only an admin can review task completions).", which is what the per-id loop showed for the same failures. The single-row Approve and Reject actions are untouched.

**Files:**
- Modify: `supabase/migrations/0033_data_layer_scale.sql` (append section 4)
- Modify: `lib/tasks/review-task-completion.ts` (the two bulk actions)
- Test, create: `tests/lib/tasks/bulk-review-action.test.ts`, `tests/db/review-task-completions.test.ts`

**Interfaces:**
- Consumes:
  - `approve_task_completion(p_completion_id uuid)` (0020) and `reject_task_completion(p_completion_id uuid, p_reason text default null)` (0021). Each checks `is_admin()` itself, locks its completion row `for update`, and raises `completion not found` or `completion is not pending`. Approval credits the reward through `apply_coin_transaction` with meta `{ task_id, completion_id }`.
  - `pgQuery` from `tests/db/pg-query.ts` (Task 1), and `createTestTask`, `ensureInvited` from `tests/db/fixtures.ts`.
  - `PendingApprovals` (`app/(app)/admin/tasks/pending-approvals.tsx`), unchanged: it posts every ticked `completionIds` checkbox and shows `summary` or `formError`.
- Produces:
  - Section 4 of 0033:
    ```sql
    review_task_completions(p_ids uuid[], p_approve boolean, p_note text default null)
      returns table (id uuid, ok boolean, error text)
    ```
    - `security definer`, `set search_path = ''`, `language plpgsql`.
    - It raises `only an admin can review task completions` unless `public.is_admin()`.
    - `ok = false` rows carry `sqlerrm` in `error`. `p_note` is passed to `reject_task_completion` and ignored on approval.
    - Grants: `revoke … from public, anon`, then `grant execute … to authenticated, service_role`, as for the single-review functions (0020, 0021).
  - `bulkApproveTaskCompletionsAction` and `bulkRejectTaskCompletionsAction`: same signatures and `BulkActionState`. Each makes one `supabase.rpc('review_task_completions', …)` call: `{ p_ids, p_approve: true }` to approve, and `{ p_ids, p_approve: false, p_note: reason || null }` to reject.

- [ ] **Step 1: Write the failing action test**

Create `tests/lib/tasks/bulk-review-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, revalidatePath } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath }))

import { bulkApproveTaskCompletionsAction, bulkRejectTaskCompletionsAction } from '@/lib/tasks/review-task-completion'

function selection(ids: string[], reason?: string) {
  const form = new FormData()
  for (const id of ids) form.append('completionIds', id)
  if (reason !== undefined) form.set('reason', reason)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  revalidatePath.mockReset()
})

describe('bulkApproveTaskCompletionsAction', () => {
  it('approves every selected completion in one call', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: true, error: null },
      ],
      error: null,
    })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-2', 'c-1']))

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', { p_ids: ['c-2', 'c-1'], p_approve: true })
    expect(state).toEqual({ summary: '2 approved.' })
    expect(revalidatePath).toHaveBeenCalledWith('/', 'layout')
  })

  it('reports the ones that failed, with the first failure in id order', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: false, error: 'completion is not pending' },
        { id: 'c-2', ok: true, error: null },
        { id: 'c-3', ok: false, error: 'completion not found' },
      ],
      error: null,
    })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-3', 'c-2', 'c-1']))

    expect(state).toEqual({ summary: '1 approved, 2 failed (completion is not pending).' })
  })

  it('fails every selected completion when the call itself fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'only an admin can review task completions' } })

    const state = await bulkApproveTaskCompletionsAction(undefined, selection(['c-1', 'c-2', 'c-3']))

    expect(state).toEqual({ summary: '0 approved, 3 failed (only an admin can review task completions).' })
  })

  it('asks for a selection before calling anything', async () => {
    const state = await bulkApproveTaskCompletionsAction(undefined, selection([]))

    expect(state).toEqual({ formError: 'Select at least one completion.' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})

describe('bulkRejectTaskCompletionsAction', () => {
  it('rejects every selected completion in one call, with the reason as the note', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: true, error: null },
      ],
      error: null,
    })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2'], '  Photo is blurry  '))

    expect(supabase.rpc).toHaveBeenCalledTimes(1)
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', {
      p_ids: ['c-1', 'c-2'],
      p_approve: false,
      p_note: 'Photo is blurry',
    })
    expect(state).toEqual({ summary: '2 rejected.' })
    expect(revalidatePath).toHaveBeenCalledWith('/admin/tasks')
  })

  it('sends no note when the reason is blank', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'c-1', ok: true, error: null }], error: null })

    await bulkRejectTaskCompletionsAction(undefined, selection(['c-1'], '   '))

    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', { p_ids: ['c-1'], p_approve: false, p_note: null })
  })

  it('reports the ones that failed', async () => {
    supabase.rpc.mockResolvedValue({
      data: [
        { id: 'c-1', ok: true, error: null },
        { id: 'c-2', ok: false, error: 'completion is not pending' },
      ],
      error: null,
    })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2']))

    expect(state).toEqual({ summary: '1 rejected, 1 failed (completion is not pending).' })
  })

  it('fails every selected completion when the call itself fails', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'fetch failed' } })

    const state = await bulkRejectTaskCompletionsAction(undefined, selection(['c-1', 'c-2']))

    expect(state).toEqual({ summary: '0 rejected, 2 failed (fetch failed).' })
  })
})
```

Run: `npx vitest run tests/lib/tasks/bulk-review-action.test.ts`
Expected: FAIL, with 5 failed and 3 passed. The actions still call `approve_task_completion` / `reject_task_completion` once per id. The three that pass don't depend on the call's shape: the empty selection, and the two "call itself fails" cases (a per-id loop that fails every id reports the same summary).

- [ ] **Step 2: Point the bulk actions at the one call**

In `lib/tasks/review-task-completion.ts`, replace everything from `export async function bulkApproveTaskCompletionsAction` to the end of the file:

```ts
export async function bulkApproveTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  let succeeded = 0
  let firstError: string | undefined
  for (const id of completionIds) {
    const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: id })
    if (error) {
      firstError ??= error.message
    } else {
      succeeded++
    }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  const failed = completionIds.length - succeeded
  if (failed === 0) return { summary: `${succeeded} approved.` }
  return { summary: `${succeeded} approved, ${failed} failed (${firstError}).` }
}

export async function bulkRejectTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const reason = String(formData.get('reason') ?? '').trim()

  let succeeded = 0
  let firstError: string | undefined
  for (const id of completionIds) {
    const { error } = await supabase.rpc('reject_task_completion', {
      p_completion_id: id,
      p_reason: reason || null,
    })
    if (error) {
      firstError ??= error.message
    } else {
      succeeded++
    }
  }

  revalidatePath('/admin/tasks')
  const failed = completionIds.length - succeeded
  if (failed === 0) return { summary: `${succeeded} rejected.` }
  return { summary: `${succeeded} rejected, ${failed} failed (${firstError}).` }
}
```

with:

```ts
type ReviewRow = { id: string; ok: boolean; error: string | null }

// review_task_completions answers one row per id, in ascending id order, so the first failure
// is the lowest id's. A call that fails outright (not an admin, a network error) fails them all.
function tally(requested: number, rows: ReviewRow[] | null, error: { message: string } | null) {
  if (error) return { succeeded: 0, failed: requested, firstError: error.message }
  const failures = (rows ?? []).filter((row) => !row.ok)
  return { succeeded: (rows ?? []).length - failures.length, failed: failures.length, firstError: failures[0]?.error }
}

export async function bulkApproveTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const { data, error } = await supabase.rpc('review_task_completions', { p_ids: completionIds, p_approve: true })
  const { succeeded, failed, firstError } = tally(completionIds.length, data, error)

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  if (failed === 0) return { summary: `${succeeded} approved.` }
  return { summary: `${succeeded} approved, ${failed} failed (${firstError}).` }
}

export async function bulkRejectTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const reason = String(formData.get('reason') ?? '').trim()

  const { data, error } = await supabase.rpc('review_task_completions', {
    p_ids: completionIds,
    p_approve: false,
    p_note: reason || null,
  })
  const { succeeded, failed, firstError } = tally(completionIds.length, data, error)

  revalidatePath('/admin/tasks')
  if (failed === 0) return { summary: `${succeeded} rejected.` }
  return { summary: `${succeeded} rejected, ${failed} failed (${firstError}).` }
}
```

`BulkActionState` above it, and the single-row `approveTaskCompletionAction` and `rejectTaskCompletionAction`, stay as they are.

Run: `npx vitest run tests/lib/tasks/bulk-review-action.test.ts tests/components/admin-tasks.test.tsx`
Expected: PASS. The 8 new cases, and `admin-tasks.test.tsx` unchanged.

- [ ] **Step 3: Write the failing DB test**

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` (sections 1–3) without error.

Create `tests/db/review-task-completions.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'
import { pgQuery } from './pg-query'

let alice: Member
let bob: Member
let adminClient: SupabaseClient
let bobClient: SupabaseClient

const MISSING = '00000000-0000-4000-8000-000000000000'

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
  adminClient = await clientFor(alice)
  bobClient = await clientFor(bob)
  await ensureInvited(bobClient)
})

async function submitAsBob(rewardAmount: number): Promise<string> {
  const { taskId } = await createTestTask(alice, { rewardAmount })
  const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
  if (error) throw error
  return data as string
}

async function bobsRewards(): Promise<{ amount: number; completion_id: string }[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('amount, meta')
    .eq('profile_id', bob.id)
    .eq('type', 'task_completed')
  if (error) throw error
  return data.map((t) => ({ amount: t.amount, completion_id: t.meta.completion_id }))
}

async function statusOf(completionId: string): Promise<{ status: string; review_note: string | null }> {
  const { data, error } = await serviceClient()
    .from('task_completions')
    .select('status, review_note')
    .eq('id', completionId)
    .single()
  if (error) throw error
  return data
}

describe('review_task_completions', () => {
  it('reports each distinct id on its own row, in id order, and the failures hold nobody else up', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)
    const reviewed = await submitAsBob(5)
    const { error: approveErr } = await adminClient.rpc('approve_task_completion', { p_completion_id: reviewed })
    if (approveErr) throw approveErr

    const { data, error } = await adminClient.rpc('review_task_completions', {
      p_ids: [second, reviewed, MISSING, first, second],
      p_approve: true,
    })

    expect(error).toBeNull()
    const expected = [
      { id: first, ok: true, error: null },
      { id: second, ok: true, error: null },
      { id: reviewed, ok: false, error: 'completion is not pending' },
      { id: MISSING, ok: false, error: 'completion not found' },
    ].sort((a, b) => (a.id < b.id ? -1 : 1))
    expect(data).toEqual(expected)
    expect((await statusOf(first)).status).toBe('approved')
    expect((await statusOf(second)).status).toBe('approved')
  })

  it('credits each approved completion exactly once, through the ledger', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)
    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()

    const { error } = await adminClient.rpc('review_task_completions', { p_ids: [first, second, first], p_approve: true })
    expect(error).toBeNull()
    const { data: again } = await adminClient.rpc('review_task_completions', { p_ids: [first, second], p_approve: true })
    expect(again.every((row: { ok: boolean }) => !row.ok)).toBe(true)

    expect(await bobsRewards()).toEqual(
      expect.arrayContaining([
        { amount: 10, completion_id: first },
        { amount: 7, completion_id: second },
      ]),
    )
    expect(await bobsRewards()).toHaveLength(2)
    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    expect(after!.balance).toBe(before!.balance + 17)
  })

  it('rejects with the note and credits nothing', async () => {
    const first = await submitAsBob(10)
    const second = await submitAsBob(7)

    const { data, error } = await adminClient.rpc('review_task_completions', {
      p_ids: [first, second],
      p_approve: false,
      p_note: 'Photo is blurry',
    })

    expect(error).toBeNull()
    expect(data.map((row: { ok: boolean }) => row.ok)).toEqual([true, true])
    expect(await statusOf(first)).toEqual({ status: 'rejected', review_note: 'Photo is blurry' })
    expect(await statusOf(second)).toEqual({ status: 'rejected', review_note: 'Photo is blurry' })
    expect(await bobsRewards()).toEqual([])
  })

  it('refuses a member who is not an admin, changing nothing', async () => {
    const completion = await submitAsBob(10)

    const { data, error } = await bobClient.rpc('review_task_completions', { p_ids: [completion], p_approve: true })

    expect(data).toBeNull()
    expect(error?.message).toBe('only an admin can review task completions')
    expect(await statusOf(completion)).toEqual({ status: 'pending', review_note: null })
    expect(await bobsRewards()).toEqual([])
  })

  it('can be called by members and the service role, not anonymously', async () => {
    const [grants] = await pgQuery<{ anon: boolean; authenticated: boolean; service_role: boolean }>(`
      select
        has_function_privilege('anon', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.review_task_completions(uuid[], boolean, text)', 'execute') as service_role
    `)
    expect(grants).toEqual({ anon: false, authenticated: true, service_role: true })
  })
})
```

Run: `npx vitest run tests/db/review-task-completions.test.ts`
Expected: FAIL, with 5 failed. The function doesn't exist yet: the four RPC cases get PostgREST's `PGRST202` (not in the schema cache), and the grants case's `pgQuery` throws with a `postgres-meta 400` saying the function does not exist.

- [ ] **Step 4: Append section 4 to the migration and apply it**

Append this block to the end of `supabase/migrations/0033_data_layer_scale.sql`:

```sql
-- ─── 4. Batch review ──────────────────────────────────────────────────────────
-- Bulk approve and bulk reject make one call instead of one per completion.
-- Each id runs the existing single-review function in its own subtransaction,
-- so one that fails (already reviewed, say) is rolled back and reported on its
-- own row while the rest still go through. Ids run in ascending order, so two
-- overlapping batches lock completions in the same sequence.
create function public.review_task_completions(p_ids uuid[], p_approve boolean, p_note text default null)
returns table (id uuid, ok boolean, error text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can review task completions';
  end if;

  for v_id in select distinct u.v from unnest(p_ids) as u(v) order by u.v loop
    begin
      if p_approve then
        perform public.approve_task_completion(v_id);
      else
        perform public.reject_task_completion(v_id, p_note);
      end if;
      id := v_id;
      ok := true;
      error := null;
    exception when others then
      id := v_id;
      ok := false;
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$$;

revoke execute on function public.review_task_completions(uuid[], boolean, text) from public, anon;
grant execute on function public.review_task_completions(uuid[], boolean, text) to authenticated, service_role;
```

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` without error. 0033 is now complete.

Run: `npx vitest run tests/db/review-task-completions.test.ts tests/db/approve-task-completion.test.ts tests/db/reject-task-completion.test.ts`
Expected: PASS. The single-review functions are unchanged.

- [ ] **Step 5: Verify**

Local Supabase must be running, with 0033 re-applied (Step 4).

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 797 tests in 129 files, 42 of them in `tests/db/`. This task adds 13 tests in 2 files (8 unit, 5 in `tests/db/`).

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 25 passed, the same as after Task 2. `admin-controls.spec.ts` bulk-approves two completions through the new call and still sees "2 approved.".

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0033_data_layer_scale.sql lib/tasks/review-task-completion.ts tests/lib/tasks/bulk-review-action.test.ts tests/db/review-task-completions.test.ts
git commit -m "Review a bulk selection of task completions in one call"
```

---

## Task 4: Pagination core and the admin ledger's "Show more"

This task builds the one pagination pattern the PR uses, and puts it on its first list, the admin ledger. Today `listAllTransactions` reads the whole ledger with no limit, so PostgREST silently stops at 1,000 rows, and its three name lookups send one `in (…)` list whose URL grows with every row.

After this task:
- **`lib/pagination/`** holds a URL-safe cursor over a row's `(timestamp, id)`, a keyset reader, and a chunk helper for `.in()` lookups. A cursor in the URL means "every row from the newest down to and including this one", so a reload, Back and a shared link all land on the same range.
- **"Show more"** reads 50 more rows each time. A range is capped at 500 rows; past that, the link opens a fresh window (`?before_from=…`) with "Back to newest" above the list. Every request reads at most 500 rows.
- **The ledger** reads 50 rows, plus a key probe of up to 50 older rows for the next cursor. It looks up market, outcome and task names only for the rows shown, in chunks of 50 ids.
- **Tasks 5 and 6 reuse all of it,** on a market's bets, closed markets, the feed and member activity.

**Files:**
- Create: `lib/pagination/cursor.ts`, `lib/pagination/keyset.ts`, `lib/pagination/chunk.ts`
- Create: `components/ui/show-more.tsx`
- Modify (rewrite): `lib/ledger/list-transactions.ts` (`buildContext`, `LedgerEntry`, `EntryMeta` and `Lookups` unchanged)
- Modify (rewrite): `app/(app)/admin/ledger/page.tsx`
- Test, create: `tests/lib/pagination/cursor.test.ts`, `tests/lib/pagination/keyset.test.ts`, `tests/lib/pagination/chunk.test.ts`, `tests/components/show-more.test.tsx`, `tests/lib/ledger/list-transactions.test.ts`
- Test, create: `tests/lib/fake-supabase.ts` (a test helper, not a test; Task 5 uses it too)
- Test, modify (rewrite): `tests/db/list-transactions.test.ts` (the signature change: the existing two cases now read `.rows`, plus three paging cases)
- E2E, create: `e2e/ledger-show-more.spec.ts`

**Interfaces:**
- Consumes:
  - `buttonVariants({ variant: 'secondary', size: 'sm' })` (`components/ui/button.tsx`). It already carries `no-underline`, and `sm` is `min-h-11` (44px).
  - `PageProps<'/admin/ledger'>`, whose `searchParams` is a `Promise<Record<string, string | string[] | undefined>>` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md`).
  - postgrest-js `.or(filters)`, which appends `or=(<filters>)` verbatim (`node_modules/@supabase/postgrest-js/dist/index.mjs`, `or(filters, …)`).
- Produces (the plan's pinned interfaces, with two additions marked **new**):
  ```ts
  // lib/pagination/cursor.ts
  export const PAGE_SIZE = 50
  export const WINDOW_CAP = 500
  export type Cursor = { ts: string; id: string }
  export type PageParams = { top: Cursor | null; bottom: Cursor | null }
  export type NextPage = { kind: 'extend' | 'window'; cursor: string }
  export type SearchParams = Record<string, string | string[] | undefined>
  export function encodeCursor(cursor: Cursor): string
  export function decodeCursor(raw: string | string[] | undefined | null): Cursor | null
  export function readPageParams(searchParams: SearchParams, param: string): PageParams
  export function showMoreHref(pathname: string, searchParams: SearchParams, param: string, next: NextPage): string
  export function newestHref(pathname: string, searchParams: SearchParams, param: string): string

  // lib/pagination/keyset.ts
  export type KeyColumns = { ts: string; id: string; isId?: (id: string) => boolean } // isId is new, optional
  export type KeysetPage<T> = { rows: T[]; next: NextPage | null; windowed: boolean }
  export function isBigintId(id: string): boolean                                     // new
  export function rangeFilter(cols: KeyColumns, page: PageParams): string | null
  export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string
  export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string
  export async function readKeyset<Row>(page, cols, fetchRows, keyOf): Promise<KeysetPage<Row>>

  // lib/pagination/chunk.ts
  export const IN_CHUNK = 50
  export function chunk<T>(items: readonly T[], size: number): T[][]

  // components/ui/show-more.tsx (no directive; server-safe)
  export function ShowMore({ href }: { href: string }): JSX.Element     // Link, scroll={false}, replace
  export function BackToNewest({ href }: { href: string }): JSX.Element // Link, default scroll, replace

  // lib/ledger/list-transactions.ts
  export async function listAllTransactions(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<LedgerEntry>>

  // tests/lib/fake-supabase.ts
  export function fakeSupabase(respond: (query: RecordedQuery, index: number) => FakeResponse): { client: SupabaseClient; queries: RecordedQuery[] }
  ```
  - **`isId`** drops a cursor whose id can't belong to the key's column, as if it were absent. Postgres rejects `id.lt."bet:1"` on a bigint column with an error (22P02) instead of matching nothing, so without it a tampered link would reach the error page. The ledger and a market's bets pass `isBigintId`, and closed markets pass `isUuid`. The feed's text ids need none.
  - **`decodeCursor`** also rejects dates Postgres can't read even though `Date.parse` accepts them: 30 February, year 0000, and an offset past ±15:59. It never throws.

**How a read works** (`readKeyset`, exactly as the plan's header describes):
1. It reads the range `[bottom, top]`, newest first, up to 500 rows when the URL has a range end and 50 when it doesn't.
2. If that returns nothing, or a first page returns fewer than 50 rows, there is no "Show more", and that one request is the whole read.
3. Otherwise a key probe reads up to 50 rows strictly older than the last row returned. Its last row is the next cursor, so "Show more" shows 50 more.
4. If the range plus the probe would pass 500 rows, the link instead starts a window at the probe's first row.

The probe starts from the last row returned, not from the cursor. So when rows arrive at the top and push a range past 500, the rows cut off at the bottom are the ones the window link points at, and none are skipped.

**Why "Show more" doesn't flash the skeleton or jump.** `/admin/ledger` has a `loading.tsx`, and a search-param change gives the page segment a new cache entry. This was checked in Next 16.3.5's router:
- **Same React identity.** `layout-router.js` keys each segment's subtree by `createRouterCacheKey(activeSegment, true)`, which strips the search params from `__PAGE__?…` (`create-router-cache-key.js`). The comment there says why: "search params do not cause state to be lost". So the `loading.tsx` Suspense boundary around the page stays mounted with the old rows in it.
- **A transition.** Every navigation sets the router state inside `startTransition` (`app-router-instance.js`, `dispatchAction`). The page segment suspends on its data (`use(rsc)` in `InnerLayoutRouter`), and React keeps already-revealed Suspense content on screen during a transition instead of showing its fallback. The old rows stay until the new range commits.
- **No scroll.** `scroll={false}` becomes `ScrollBehavior.NoScroll`, so the layout router's scroll handler doesn't run. The new rows are appended below the ones already visible.
- **No crossfade.** The `ViewTransition` wrappers (`components/nav/page-transition.tsx`) animate only on enter and exit (`default="none"`), and the page isn't remounted.

The e2e spec proves all of this in a browser. It holds the page fetch, checks that no `[data-skeleton]` element ever mounts, that the first page stays put and that the scroll position holds, then checks the older row lands below the last one.

**Why both links replace the history entry.** A pushed entry per "Show more" would break two things:
- **Back** would step through every expansion before leaving the page.
- **The back-swipe** on a drill-down page (the admin section, a market) calls `router.back()` when the nav depth is above 0 (`components/nav/back-swipe.tsx`). That would land on the same pathname, so `BackSwipe`'s pathname effect never resets it, and the page would sit slid off-screen for `STUCK_RESET_MS` (4s). `NavDepthTracker` also only counts pathname changes.

With `replace`, the URL still holds the range, so a reload or a shared link lands on it, and leaving the page and coming back returns to it.

- [ ] **Step 1: Write the failing tests for the cursor, the keyset reader and the chunk helper**

Create `tests/lib/pagination/cursor.test.ts`:


```ts
import { describe, it, expect } from 'vitest'
import {
  decodeCursor,
  encodeCursor,
  newestHref,
  readPageParams,
  showMoreHref,
  type Cursor,
} from '@/lib/pagination/cursor'

// What an arbitrary string encodes to, so a test can hand-craft a tampered cursor.
function encodeRaw(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('encodeCursor / decodeCursor', () => {
  it.each<Cursor>([
    { ts: '2026-09-26T10:15:30.123456+00:00', id: '4242' },
    { ts: '2026-09-26T10:15:30Z', id: '0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f' },
    { ts: '2026-09-26T10:15:30.5-05:30', id: 'bet:99' },
    { ts: '2028-02-29T00:00:00+00:00', id: 'win:12:0b9c3f5e-8a1d-4c2b-9e7f-1a2b3c4d5e6f' },
    { ts: '2024-02-29T23:59:59.999999+15:00', id: 'task_completed-1' },
  ])('round-trips $ts / $id, keeping every microsecond', (cursor) => {
    const encoded = encodeCursor(cursor)
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeCursor(encoded)).toEqual(cursor)
  })

  it('never uses +, / or = padding, whatever the input length', () => {
    const encoded = Array.from({ length: 300 }, (_, i) =>
      encodeCursor({ ts: `2026-09-26T10:15:30.${String(i).slice(0, 6)}Z`, id: `bet:${'~'.repeat(i % 7)}${i}`.replace(/~/g, '_') }),
    )
    expect(encoded.join('')).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(new Set(encoded.map((e) => e.length % 4)).size).toBeGreaterThan(1)
  })

  it.each([undefined, null, '', ' ', 'not a cursor', '!!!', 'a'.repeat(401)])('decodes %j to null', (raw) => {
    expect(decodeCursor(raw)).toBeNull()
  })

  it('decodes a repeated query param (an array) to null', () => {
    const one = encodeCursor({ ts: '2026-09-26T10:15:30Z', id: '1' })
    expect(decodeCursor([one, one])).toBeNull()
  })

  it.each([
    ['a JSON object', '{"ts":"2026-09-26T10:15:30Z","id":"1"}'],
    ['three elements', '["2026-09-26T10:15:30Z","1","x"]'],
    ['one element', '["2026-09-26T10:15:30Z"]'],
    ['a numeric id', '["2026-09-26T10:15:30Z",1]'],
    ['a date without a time', '["2026-09-26","1"]'],
    ['a timestamp without a zone', '["2026-09-26T10:15:30","1"]'],
    ['seven fractional digits', '["2026-09-26T10:15:30.1234567Z","1"]'],
    ['a month 13', '["2026-13-01T00:00:00Z","1"]'],
    ['30 February', '["2026-02-30T00:00:00Z","1"]'],
    ['29 February in a common year', '["2025-02-29T00:00:00Z","1"]'],
    ['year 0000', '["0000-01-01T00:00:00Z","1"]'],
    ['hour 25', '["2026-01-01T25:00:00Z","1"]'],
    ['an offset past Postgres’s ±15:59', '["2026-01-01T00:00:00+23:00","1"]'],
    ['an id with a quote', '["2026-09-26T10:15:30Z","1\\"),id.gt.(0"]'],
    ['an id with a comma', '["2026-09-26T10:15:30Z","1,2"]'],
    ['an id with a space', '["2026-09-26T10:15:30Z","1 2"]'],
    ['an empty id', '["2026-09-26T10:15:30Z",""]'],
    ['an id over 100 characters', `["2026-09-26T10:15:30Z","${'a'.repeat(101)}"]`],
    ['not JSON', '[2026-09-26'],
  ])('decodes a tampered cursor with %s to null', (_label, text) => {
    expect(decodeCursor(encodeRaw(text))).toBeNull()
  })

  it('decodes a cursor with a character flipped to null or to a still-valid cursor, never throwing', () => {
    const encoded = encodeCursor({ ts: '2026-09-26T10:15:30.123456+00:00', id: '4242' })
    for (let i = 0; i < encoded.length; i++) {
      const flipped = encoded.slice(0, i) + (encoded[i] === 'A' ? 'B' : 'A') + encoded.slice(i + 1)
      const decoded = decodeCursor(flipped)
      if (decoded) expect(decodeCursor(encodeCursor(decoded))).toEqual(decoded)
    }
  })
})

describe('readPageParams', () => {
  const bottom = { ts: '2026-09-26T10:00:00.000001+00:00', id: '10' }
  const top = { ts: '2026-09-26T12:00:00+00:00', id: '90' }

  it('reads the range end from the param and the window start from param_from', () => {
    expect(readPageParams({ before: encodeCursor(bottom), before_from: encodeCursor(top) }, 'before')).toEqual({ top, bottom })
  })

  it('treats missing, garbage and repeated params as absent', () => {
    expect(readPageParams({}, 'before')).toEqual({ top: null, bottom: null })
    expect(readPageParams({ before: 'junk', before_from: [encodeCursor(top), encodeCursor(top)] }, 'before')).toEqual({
      top: null,
      bottom: null,
    })
  })

  it("reads only its own list's params", () => {
    expect(readPageParams({ bets: encodeCursor(bottom), resolved: encodeCursor(top) }, 'bets')).toEqual({ top: null, bottom })
  })
})

describe('showMoreHref', () => {
  it('extends the range: sets the param and keeps the window start and every other param', () => {
    expect(
      showMoreHref('/markets', { resolved_from: 'TOP', tab: 'x', resolved: 'OLD' }, 'resolved', { kind: 'extend', cursor: 'NEW' }),
    ).toBe('/markets?resolved_from=TOP&tab=x&resolved=NEW')
  })

  it('starts a window: sets param_from and drops the range end', () => {
    expect(
      showMoreHref('/admin/ledger', { before: 'OLD', before_from: 'TOP', q: 'a' }, 'before', { kind: 'window', cursor: 'NEW' }),
    ).toBe('/admin/ledger?before_from=NEW&q=a')
  })

  it('keeps a repeated param and skips an undefined one', () => {
    expect(showMoreHref('/feed', { tag: ['a', 'b'], gone: undefined }, 'before', { kind: 'extend', cursor: 'C' })).toBe(
      '/feed?tag=a&tag=b&before=C',
    )
  })
})

describe('newestHref', () => {
  it('drops both of its params and keeps the rest', () => {
    expect(newestHref('/markets/m1', { bets: 'A', bets_from: 'B', other: 'C' }, 'bets')).toBe('/markets/m1?other=C')
  })

  it('leaves no trailing ? when nothing else remains', () => {
    expect(newestHref('/admin/ledger', { before: 'A', before_from: 'B' }, 'before')).toBe('/admin/ledger')
  })
})
```

Create `tests/lib/pagination/keyset.test.ts`. Its fake table evaluates the filter strings the way PostgREST does, so these tests prove the filters themselves never skip or repeat a row, including across timestamp ties:


```ts
import { describe, it, expect } from 'vitest'
import { decodeCursor, encodeCursor, readPageParams, type Cursor, type PageParams } from '@/lib/pagination/cursor'
import {
  isBigintId,
  newerThanFilter,
  olderThanFilter,
  rangeFilter,
  readKeyset,
  type KeyColumns,
  type KeysetPage,
} from '@/lib/pagination/keyset'

const COLS: KeyColumns = { ts: 'created_at', id: 'id' }

type Row = { created_at: string; id: string }

// Evaluates the filter strings the way PostgREST's `or=(…)` does, for the three shapes keyset.ts
// builds: `col.op."value"` terms, nested and(…) / or(…), and a top-level list that is an OR. Every
// timestamp and id in these fixtures is fixed-width, so plain string comparison orders them.
function splitTerms(list: string): string[] {
  const terms: string[] = []
  let depth = 0
  let quoted = false
  let start = 0
  for (let i = 0; i < list.length; i++) {
    const c = list[i]
    if (c === '"') quoted = !quoted
    else if (!quoted && c === '(') depth++
    else if (!quoted && c === ')') depth--
    else if (!quoted && depth === 0 && c === ',') {
      terms.push(list.slice(start, i))
      start = i + 1
    }
  }
  terms.push(list.slice(start))
  return terms
}

function matches(term: string, row: Row): boolean {
  const group = /^(and|or)\((.*)\)$/.exec(term)
  if (group) {
    const parts = splitTerms(group[2]).map((t) => matches(t, row))
    return group[1] === 'and' ? parts.every(Boolean) : parts.some(Boolean)
  }
  const leaf = /^(\w+)\.(lt|lte|gt|gte|eq)\."([^"]*)"$/.exec(term)
  if (!leaf) throw new Error(`unparsed filter term: ${term}`)
  const value = row[leaf[1] as keyof Row]
  const other = leaf[3]
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

function fakeTable(rows: Row[]) {
  const sorted = [...rows].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1,
  )
  const calls: { filter: string | null; limit: number }[] = []
  async function fetchRows(filter: string | null, limit: number): Promise<Row[]> {
    calls.push({ filter, limit })
    return sorted.filter((row) => filter === null || splitTerms(filter).some((t) => matches(t, row))).slice(0, limit)
  }
  return { sorted, calls, fetchRows }
}

const keyOf = (row: Row): Cursor => ({ ts: row.created_at, id: row.id })

// n rows, newest first by position: row 0 is the newest. Rows share timestamps in pairs, so page
// boundaries fall inside a tie (rows 49 and 50 of 120 do), and every timestamp carries microseconds.
function makeRows(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const second = Math.floor((n - i) / 2)
    const ts = `2026-09-26T${String(Math.floor(second / 3600)).padStart(2, '0')}:${String(Math.floor(second / 60) % 60).padStart(2, '0')}:${String(second % 60).padStart(2, '0')}.123456+00:00`
    return { created_at: ts, id: String(n - i).padStart(6, '0') }
  })
}

function pageFrom(page: KeysetPage<Row>, current: PageParams, param = 'before'): PageParams {
  if (!page.next) throw new Error('no next page')
  const params =
    page.next.kind === 'extend'
      ? { [param]: page.next.cursor, [`${param}_from`]: current.top ? encodeCursor(current.top) : undefined }
      : { [`${param}_from`]: page.next.cursor }
  return readPageParams(params, param)
}

describe('filter strings', () => {
  const c: Cursor = { ts: '2026-09-26T10:15:30.123456+00:00', id: '99' }
  const t: Cursor = { ts: '2026-09-26T12:00:00+00:00', id: 'bet:7' }

  it('builds the strictly older and strictly newer filters', () => {
    expect(olderThanFilter(COLS, c)).toBe(
      'created_at.lt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.lt."99")',
    )
    expect(newerThanFilter({ ts: 'occurred_at', id: 'id' }, c)).toBe(
      'occurred_at.gt."2026-09-26T10:15:30.123456+00:00",and(occurred_at.eq."2026-09-26T10:15:30.123456+00:00",id.gt."99")',
    )
  })

  it('builds the range filter for each combination of bounds', () => {
    expect(rangeFilter(COLS, { top: null, bottom: null })).toBeNull()
    expect(rangeFilter(COLS, { top: null, bottom: c })).toBe(
      'created_at.gt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.gte."99")',
    )
    expect(rangeFilter(COLS, { top: t, bottom: null })).toBe(
      'created_at.lt."2026-09-26T12:00:00+00:00",and(created_at.eq."2026-09-26T12:00:00+00:00",id.lte."bet:7")',
    )
    expect(rangeFilter(COLS, { top: t, bottom: c })).toBe(
      'and(or(created_at.gt."2026-09-26T10:15:30.123456+00:00",and(created_at.eq."2026-09-26T10:15:30.123456+00:00",id.gte."99")),' +
        'or(created_at.lt."2026-09-26T12:00:00+00:00",and(created_at.eq."2026-09-26T12:00:00+00:00",id.lte."bet:7")))',
    )
  })
})

describe('readKeyset', () => {
  const FIRST: PageParams = { top: null, bottom: null }

  it('reads the newest 50, and points Show more at the 50th row past them', async () => {
    const table = fakeTable(makeRows(120))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)

    expect(page.rows).toEqual(table.sorted.slice(0, 50))
    expect(page.windowed).toBe(false)
    expect(page.next?.kind).toBe('extend')
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[99]))
    expect(table.calls).toEqual([
      { filter: null, limit: 50 },
      { filter: olderThanFilter(COLS, keyOf(table.sorted[49])), limit: 50 },
    ])
  })

  it('extends the range down to and including the cursor, then to the end, with nothing skipped or repeated', async () => {
    const table = fakeTable(makeRows(120))
    const first = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    const secondParams = pageFrom(first, FIRST)
    const second = await readKeyset(secondParams, COLS, table.fetchRows, keyOf)

    expect(second.rows).toEqual(table.sorted.slice(0, 100))
    expect(decodeCursor(second.next?.cursor)).toEqual(keyOf(table.sorted[119]))
    expect(table.calls[2].limit).toBe(500)

    const third = await readKeyset(pageFrom(second, secondParams), COLS, table.fetchRows, keyOf)
    expect(third.rows).toEqual(table.sorted)
    expect(third.next).toBeNull()
  })

  it('shows a short first page with no Show more, in one request', async () => {
    const table = fakeTable(makeRows(30))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    expect(page).toEqual({ rows: table.sorted, next: null, windowed: false })
    expect(table.calls).toHaveLength(1)
  })

  it('shows no Show more when exactly 50 rows exist', async () => {
    const table = fakeTable(makeRows(50))
    const page = await readKeyset(FIRST, COLS, table.fetchRows, keyOf)
    expect(page.rows).toHaveLength(50)
    expect(page.next).toBeNull()
    expect(table.calls).toHaveLength(2)
  })

  it('reads an empty list as empty, with no probe', async () => {
    const table = fakeTable([])
    expect(await readKeyset(FIRST, COLS, table.fetchRows, keyOf)).toEqual({ rows: [], next: null, windowed: false })
    expect(table.calls).toHaveLength(1)
  })

  it('starts a fresh window at the row after the cap, then extends within it', async () => {
    const table = fakeTable(makeRows(600))
    let params = FIRST
    let page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    while (page.next?.kind === 'extend') {
      params = pageFrom(page, params)
      page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    }
    expect(page.rows).toEqual(table.sorted.slice(0, 500))
    expect(page.next?.kind).toBe('window')
    expect(decodeCursor(page.next?.cursor)).toEqual(keyOf(table.sorted[500]))
    expect(Math.max(...table.calls.map((c) => c.limit))).toBe(500)

    params = pageFrom(page, params)
    page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    expect(page.windowed).toBe(true)
    expect(page.rows).toEqual(table.sorted.slice(500, 550))
    expect(page.next?.kind).toBe('extend')

    params = pageFrom(page, params)
    page = await readKeyset(params, COLS, table.fetchRows, keyOf)
    expect(page.windowed).toBe(true)
    expect(page.rows).toEqual(table.sorted.slice(500))
    expect(page.next).toBeNull()
  })

  it('never skips rows when new ones arrive at the top and push the range past the cap', async () => {
    const rows = makeRows(600)
    const table = fakeTable(rows)
    // A link made when its range held 480 rows, read after 40 more arrived at the top: 520 now.
    const page = await readKeyset({ top: null, bottom: keyOf(table.sorted[519]) }, COLS, table.fetchRows, keyOf)

    expect(page.rows).toEqual(table.sorted.slice(0, 500))
    expect(page.next).toEqual({ kind: 'window', cursor: encodeCursor(keyOf(table.sorted[500])) })
  })

  it('treats a cursor whose id the column cannot hold as absent', async () => {
    const table = fakeTable(makeRows(120))
    const cols: KeyColumns = { ...COLS, isId: isBigintId }
    const bad: Cursor = { ts: '2026-09-26T00:00:30.123456+00:00', id: 'bet:1' }
    const page = await readKeyset({ top: bad, bottom: bad }, cols, table.fetchRows, keyOf)
    expect(page.windowed).toBe(false)
    expect(page.rows).toEqual(table.sorted.slice(0, 50))
    expect(table.calls[0]).toEqual({ filter: null, limit: 50 })
  })
})

describe('isBigintId', () => {
  it('accepts up to 18 digits only', () => {
    expect(isBigintId('1')).toBe(true)
    expect(isBigintId('123456789012345678')).toBe(true)
    expect(isBigintId('1234567890123456789')).toBe(false)
    expect(isBigintId('bet:1')).toBe(false)
    expect(isBigintId('-1')).toBe(false)
  })
})
```

Create `tests/lib/pagination/chunk.test.ts`:


```ts
import { describe, it, expect } from 'vitest'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

describe('chunk', () => {
  it('splits into runs of the given size, the last one shorter', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('gives no chunks for no items', () => {
    expect(chunk([], IN_CHUNK)).toEqual([])
  })

  it('keeps every item, in order, in chunks of at most IN_CHUNK', () => {
    const ids = Array.from({ length: 121 }, (_, i) => `id-${i}`)
    const chunks = chunk(ids, IN_CHUNK)
    expect(chunks.map((c) => c.length)).toEqual([50, 50, 21])
    expect(chunks.flat()).toEqual(ids)
  })

  it('refuses a size that would loop forever', () => {
    expect(() => chunk([1], 0)).toThrow(RangeError)
    expect(() => chunk([1], 1.5)).toThrow(RangeError)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/pagination`
Expected: FAIL. The three modules under `lib/pagination/` don't exist yet.

- [ ] **Step 3: Write the cursor, the keyset reader and the chunk helper**

Create `lib/pagination/cursor.ts`:


```ts
export const PAGE_SIZE = 50
export const WINDOW_CAP = 500

export type Cursor = { ts: string; id: string }
export type PageParams = { top: Cursor | null; bottom: Cursor | null }
export type NextPage = { kind: 'extend' | 'window'; cursor: string }
export type SearchParams = Record<string, string | string[] | undefined>

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const ID = /^[A-Za-z0-9:_-]{1,100}$/
const BASE64URL = /^[A-Za-z0-9_-]{1,400}$/
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

// Date.parse accepts 30 February, year 0000 and a +23:00 offset, all of which Postgres rejects with
// an error. A cursor that reaches the query must be one Postgres can read, or a tampered link
// would show the error page instead of the first page.
function isPostgresTimestamp(ts: string): boolean {
  if (!TS.test(ts) || Number.isNaN(Date.parse(ts))) return false
  const year = Number(ts.slice(0, 4))
  const month = Number(ts.slice(5, 7))
  const day = Number(ts.slice(8, 10))
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const days = month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1]
  if (year < 1 || days === undefined || day < 1 || day > days) return false
  const offset = /([+-])(\d{2}):(\d{2})$/.exec(ts)
  return !offset || Number(offset[2]) <= 15
}

// btoa/atob rather than Buffer, so the module is the same on the Node and Edge runtimes. Every
// valid cursor is ASCII, so the binary string btoa needs is the text itself.
export function encodeCursor(cursor: Cursor): string {
  return btoa(JSON.stringify([cursor.ts, cursor.id])).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCursor(raw: string | string[] | undefined | null): Cursor | null {
  if (typeof raw !== 'string' || !BASE64URL.test(raw)) return null
  let parsed: unknown
  try {
    const base64 = raw.replace(/-/g, '+').replace(/_/g, '/')
    parsed = JSON.parse(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)))
  } catch {
    return null
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return null
  const [ts, id] = parsed
  if (typeof ts !== 'string' || typeof id !== 'string') return null
  if (!isPostgresTimestamp(ts) || !ID.test(id)) return null
  return { ts, id }
}

export function readPageParams(searchParams: SearchParams, param: string): PageParams {
  return { top: decodeCursor(searchParams[`${param}_from`]), bottom: decodeCursor(searchParams[param]) }
}

function toQuery(searchParams: SearchParams): URLSearchParams {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue
    for (const v of Array.isArray(value) ? value : [value]) query.append(key, v)
  }
  return query
}

function withQuery(pathname: string, query: URLSearchParams): string {
  const search = query.toString()
  return search ? `${pathname}?${search}` : pathname
}

export function showMoreHref(pathname: string, searchParams: SearchParams, param: string, next: NextPage): string {
  const query = toQuery(searchParams)
  if (next.kind === 'extend') {
    query.set(param, next.cursor)
  } else {
    query.set(`${param}_from`, next.cursor)
    query.delete(param)
  }
  return withQuery(pathname, query)
}

export function newestHref(pathname: string, searchParams: SearchParams, param: string): string {
  const query = toQuery(searchParams)
  query.delete(param)
  query.delete(`${param}_from`)
  return withQuery(pathname, query)
}
```

Create `lib/pagination/keyset.ts`:


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

function atOrOlder(cols: KeyColumns, c: Cursor): string {
  return `${cols.ts}.lt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.lte."${c.id}")`
}

function atOrNewer(cols: KeyColumns, c: Cursor): string {
  return `${cols.ts}.gt."${c.ts}",and(${cols.ts}.eq."${c.ts}",${cols.id}.gte."${c.id}")`
}

// Every value is quoted, and a validated cursor can't contain a quote (see decodeCursor).
export function rangeFilter(cols: KeyColumns, page: PageParams): string | null {
  const { top, bottom } = page
  if (top && bottom) return `and(or(${atOrNewer(cols, bottom)}),or(${atOrOlder(cols, top)}))`
  if (bottom) return atOrNewer(cols, bottom)
  if (top) return atOrOlder(cols, top)
  return null
}

export function olderThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `${cols.ts}.lt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.lt."${cursor.id}")`
}

export function newerThanFilter(cols: KeyColumns, cursor: Cursor): string {
  return `${cols.ts}.gt."${cursor.ts}",and(${cols.ts}.eq."${cursor.ts}",${cols.id}.gt."${cursor.id}")`
}

export async function readKeyset<Row>(
  rawPage: PageParams,
  cols: KeyColumns,
  fetchRows: (filter: string | null, limit: number) => Promise<Row[]>,
  keyOf: (row: Row) => Cursor,
): Promise<KeysetPage<Row>> {
  const valid = (c: Cursor | null) => (c && (!cols.isId || cols.isId(c.id)) ? c : null)
  const page: PageParams = { top: valid(rawPage.top), bottom: valid(rawPage.bottom) }
  const windowed = page.top !== null

  const rows = await fetchRows(rangeFilter(cols, page), page.bottom ? WINDOW_CAP : PAGE_SIZE)
  if (rows.length === 0 || (page.bottom === null && rows.length < PAGE_SIZE)) return { rows, next: null, windowed }

  // "Show more" points at the 50th row past the last one shown, so the read needs those rows'
  // keys. Probing from the last row returned, not from the cursor, means rows that arrived at the
  // top and pushed the range past the cap are picked up here instead of skipped.
  const probe = await fetchRows(olderThanFilter(cols, keyOf(rows[rows.length - 1])), PAGE_SIZE)
  if (probe.length === 0) return { rows, next: null, windowed }
  if (rows.length + probe.length > WINDOW_CAP) {
    return { rows, next: { kind: 'window', cursor: encodeCursor(keyOf(probe[0])) }, windowed }
  }
  return { rows, next: { kind: 'extend', cursor: encodeCursor(keyOf(probe[probe.length - 1])) }, windowed }
}
```

Create `lib/pagination/chunk.ts`:


```ts
export const IN_CHUNK = 50

export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError(`chunk size must be a positive integer, got ${size}`)
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run tests/lib/pagination`
Expected: PASS (57 tests).

- [ ] **Step 5: Write the failing tests for the links and the ledger**

Create `tests/components/show-more.test.tsx`:


```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'

// Vitest resolves next/link to the Pages Router Link, which drops scroll and replace before the
// DOM, so they are written onto the anchor for these assertions.
vi.mock('next/link', () => ({
  default: ({
    href,
    scroll,
    replace,
    ...props
  }: ComponentProps<'a'> & { href: string; scroll?: boolean; replace?: boolean }) => (
    <a href={href} data-scroll={String(scroll ?? true)} data-replace={String(replace ?? false)} {...props} />
  ),
}))

import { BackToNewest, ShowMore } from '@/components/ui/show-more'

describe('ShowMore', () => {
  it('is a real link to the next range, styled as a 44px secondary button with no underline', () => {
    render(<ShowMore href="/admin/ledger?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('href', '/admin/ledger?before=abc')
    expect(link).toHaveClass('min-h-11', 'no-underline', 'border-line-s', 'bg-surface', 'self-start')
  })

  it('keeps the scroll position and replaces the history entry', () => {
    render(<ShowMore href="/feed?before=abc" />)
    const link = screen.getByRole('link', { name: 'Show more' })
    expect(link).toHaveAttribute('data-scroll', 'false')
    expect(link).toHaveAttribute('data-replace', 'true')
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

Create `tests/lib/fake-supabase.ts`, a test helper that records each query's chain and answers it when awaited. It isn't a test file, so Vitest doesn't collect it:


```ts
import type { SupabaseClient } from '@supabase/supabase-js'

// A stand-in for the query builder: it records each query's chain, and answers it when awaited.
export type RecordedQuery = {
  table: string
  select?: string
  selectOptions?: unknown
  eq: [string, unknown][]
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
      const query: RecordedQuery = { table, eq: [], in: [], or: [], order: [] }
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

Create `tests/lib/ledger/list-transactions.test.ts`:


```ts
import { describe, it, expect } from 'vitest'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { encodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase, type RecordedQuery } from '../fake-supabase'

function ledgerRow(n: number) {
  return {
    id: n,
    profile_id: 'p1',
    amount: -1,
    type: 'bet_placed',
    meta: { market_id: `m${n}`, outcome_id: `o${n}` },
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    profiles: { display_name: 'Mia' },
  }
}

// Answers the ledger's range read with `shown`, its key probe with `probed`, and every lookup with
// a title for each id it asked for.
function fakeLedger(shown: number[], probed: number[]) {
  let ledgerReads = 0
  return fakeSupabase((query) => {
    if (query.table === 'coin_transactions') {
      ledgerReads++
      return { data: (ledgerReads === 1 ? shown : probed).map(ledgerRow) }
    }
    const ids = query.in[0][1] as string[]
    const column = query.table === 'market_outcomes' ? 'label' : 'title'
    return { data: ids.map((id) => ({ id, [column]: `Name of ${id}` })) }
  })
}

const lookupIds = (queries: RecordedQuery[], table: string) =>
  queries.filter((q) => q.table === table).flatMap((q) => q.in[0][1] as string[])

describe('listAllTransactions', () => {
  it('reads 50 rows newest first, then probes 50 older ones for the Show more cursor', async () => {
    const shown = Array.from({ length: 50 }, (_, i) => 200 - i)
    const probed = Array.from({ length: 50 }, (_, i) => 150 - i)
    const { client, queries } = fakeLedger(shown, probed)

    const page = await listAllTransactions(client, { top: null, bottom: null })

    const [read, probe] = queries.filter((q) => q.table === 'coin_transactions')
    expect(read.order).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(read.limit).toBe(50)
    expect(read.or).toEqual([])
    expect(probe.limit).toBe(50)
    expect(probe.or).toHaveLength(1)
    expect(page.rows.map((e) => e.id)).toEqual(shown)
    expect(page.rows[0]).toMatchObject({ memberName: 'Mia', context: 'Bet on Name of o200 in Name of m200' })
    expect(page.next).toEqual({ kind: 'extend', cursor: encodeCursor({ ts: ledgerRow(101).created_at, id: '101' }) })
  })

  it('looks up names only for the rows shown, never the probed ones', async () => {
    const { client, queries } = fakeLedger(
      Array.from({ length: 50 }, (_, i) => 200 - i),
      Array.from({ length: 50 }, (_, i) => 150 - i),
    )
    await listAllTransactions(client, { top: null, bottom: null })

    const marketIds = lookupIds(queries, 'markets')
    expect(marketIds).toHaveLength(50)
    expect(marketIds).not.toContain('m150')
  })

  it('splits the lookups for a long range into chunks of at most 50 ids', async () => {
    const shown = Array.from({ length: 120 }, (_, i) => 500 - i)
    const { client, queries } = fakeLedger(shown, [])
    const bottom = { ts: ledgerRow(381).created_at, id: '381' }

    const page = await listAllTransactions(client, { top: null, bottom })

    expect(queries[0].limit).toBe(500)
    for (const table of ['markets', 'market_outcomes']) {
      const reads = queries.filter((q) => q.table === table)
      expect(reads.map((q) => (q.in[0][1] as string[]).length)).toEqual([50, 50, 20])
    }
    expect(queries.some((q) => q.table === 'tasks')).toBe(false)
    expect(page.rows).toHaveLength(120)
    expect(page.rows.at(-1)?.context).toBe('Bet on Name of o381 in Name of m381')
    expect(page.next).toBeNull()
  })

  it('throws when a lookup fails, so the error page shows rather than a ledger missing its names', async () => {
    const { client } = fakeSupabase((query) =>
      query.table === 'coin_transactions' ? { data: [ledgerRow(1)] } : { error: new Error('lookup failed') },
    )
    await expect(listAllTransactions(client, { top: null, bottom: null })).rejects.toThrow('lookup failed')
  })
})
```

Replace `tests/db/list-transactions.test.ts` with this. The first two cases are today's, now reading `.rows`. The three new ones insert ledger rows directly, with runs of five sharing one microsecond timestamp so page boundaries fall inside ties, and follow each "Show more" through its real href:


```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { encodeCursor, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import type { KeysetPage } from '@/lib/pagination/keyset'
import type { LedgerEntry } from '@/lib/ledger/list-transactions'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestMarket, createTestTask, type Member } from './fixtures'

let admin: Member
let bob: Member

const FIRST: PageParams = { top: null, bottom: null }

beforeEach(async () => {
  ;[admin, bob] = await seedMembers()
  await serviceClient().from('profiles').update({ is_admin: true }).eq('id', admin.id)
})

// `count` adjustments on Bob, straight into the ledger (paging never reads a balance), a minute
// apart from 1 January, each run of five sharing one microsecond timestamp. With Alice's and Bob's
// starting grants on top, both the 50th/51st and the 100th/101st rows fall inside a tie.
async function insertLedgerRows(count: number): Promise<void> {
  const start = Date.parse('2026-01-01T00:00:00.000Z')
  const rows = Array.from({ length: count }, (_, i) => ({
    profile_id: bob.id,
    amount: i + 1,
    type: 'admin_adjustment',
    meta: { reason: `Row ${i}` },
    created_at: `${new Date(start + Math.floor(i / 5) * 60_000).toISOString().slice(0, 19)}.456123+00:00`,
  }))
  const { error } = await serviceClient().from('coin_transactions').insert(rows)
  if (error) throw error
}

// Every ledger row, newest first, as the service role sees it: the order paging must reproduce.
async function allIdsNewestFirst(): Promise<number[]> {
  const { data, error } = await serviceClient()
    .from('coin_transactions')
    .select('id')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1000)
  if (error) throw error
  return data.map((r) => r.id as number)
}

// Follows the page's "Show more" link the way a click does: build its href, then read the params
// back out of it.
function follow(page: KeysetPage<LedgerEntry>, searchParams: SearchParams): SearchParams {
  if (!page.next) throw new Error('expected a next page')
  const href = new URL(showMoreHref('/admin/ledger', searchParams, 'before', page.next), 'http://localhost')
  return Object.fromEntries(href.searchParams)
}

describe('listAllTransactions', () => {
  let adminClient: SupabaseClient

  beforeEach(async () => {
    adminClient = await clientFor(admin)
    await ensureInvited(adminClient)
  })

  it("carries each entry's member id alongside their name", async () => {
    const { rows } = await listAllTransactions(adminClient, FIRST)

    expect(rows).toContainEqual(
      expect.objectContaining({ profileId: bob.id, memberName: 'Bob', amount: 100, type: 'Starting grant', context: 'Starting grant' }),
    )
  })

  it('builds a context line for a bet, a bet win and an approved task from their meta ids', async () => {
    const { taskId } = await createTestTask(admin, { title: 'Read Genesis 1-3', rewardAmount: 10 })
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()
    const { error: approveErr } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId as string })
    expect(approveErr).toBeNull()

    const { marketId, outcomeIds } = await createTestMarket(adminClient, ['Yes', 'No'], { title: 'Will it rain?' })
    const { error: betErr } = await bobClient.rpc('place_bet', {
      p_market_id: marketId,
      p_outcome_id: outcomeIds[0],
      p_amount: 20,
    })
    expect(betErr).toBeNull()

    // Admin created and can resolve immediately, since an admin caller skips the close_at wait.
    const { error: resolveErr } = await adminClient.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeIds[0] })
    expect(resolveErr).toBeNull()

    const { rows } = await listAllTransactions(adminClient, FIRST)

    expect(rows).toContainEqual(expect.objectContaining({ context: 'Task approved: Read Genesis 1-3' }))
    expect(rows).toContainEqual(expect.objectContaining({ context: 'Bet on Yes in Will it rain?' }))
    expect(rows).toContainEqual(expect.objectContaining({ context: 'Bet won: Will it rain?' }))
  })

  it('pages 50 at a time, and each Show more extends the range with nothing skipped or repeated', async () => {
    await insertLedgerRows(120)
    const everything = await allIdsNewestFirst()
    expect(everything).toHaveLength(122)

    const first = await listAllTransactions(adminClient, FIRST)
    expect(first.rows.map((e) => e.id)).toEqual(everything.slice(0, 50))
    expect(first.windowed).toBe(false)
    expect(first.next?.kind).toBe('extend')

    const secondParams = follow(first, {})
    const second = await listAllTransactions(adminClient, readPageParams(secondParams, 'before'))
    expect(second.rows.map((e) => e.id)).toEqual(everything.slice(0, 100))
    expect(second.next?.kind).toBe('extend')

    const third = await listAllTransactions(adminClient, readPageParams(follow(second, secondParams), 'before'))
    expect(third.rows.map((e) => e.id)).toEqual(everything)
    expect(third.next).toBeNull()
  })

  it('starts a fresh window past 500 rows, with every row reachable exactly once', async () => {
    await insertLedgerRows(560)
    const everything = await allIdsNewestFirst()
    expect(everything).toHaveLength(562)

    let params: SearchParams = {}
    let page = await listAllTransactions(adminClient, FIRST)
    while (page.next?.kind === 'extend') {
      params = follow(page, params)
      page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    }
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(0, 500))
    expect(page.next?.kind).toBe('window')

    params = follow(page, params)
    expect(Object.keys(params)).toEqual(['before_from'])
    page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    expect(page.windowed).toBe(true)
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500, 550))

    params = follow(page, params)
    page = await listAllTransactions(adminClient, readPageParams(params, 'before'))
    expect(page.windowed).toBe(true)
    expect(page.rows.map((e) => e.id)).toEqual(everything.slice(500))
    expect(page.next).toBeNull()
  })

  it('reads a garbage cursor, or one whose id is not a ledger id, as the first page instead of failing', async () => {
    await insertLedgerRows(60)
    const everything = await allIdsNewestFirst()
    const wrongId = readPageParams({ before: encodeCursor({ ts: '2026-01-01T00:00:00Z', id: 'bet:1' }) }, 'before')
    expect(wrongId.bottom).not.toBeNull()

    for (const page of [readPageParams({ before: 'garbage' }, 'before'), wrongId]) {
      const result = await listAllTransactions(adminClient, page)
      expect(result.rows.map((e) => e.id)).toEqual(everything.slice(0, 50))
      expect(result.windowed).toBe(false)
    }
  })
})
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run tests/components/show-more.test.tsx tests/lib/ledger/list-transactions.test.ts`
Expected: FAIL. `components/ui/show-more.tsx` doesn't exist, and `listAllTransactions` still takes one argument and returns an array.

Run: `npx tsc --noEmit`
Expected: FAIL in `tests/db/list-transactions.test.ts` (`Expected 1 arguments, but got 2`).

- [ ] **Step 7: Write the links, the paged ledger read and the ledger page**

Create `components/ui/show-more.tsx`:


```tsx
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const linkClass = cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'self-start')

// Both links replace the history entry: the list's position lives in the URL, so a reload or a
// shared link lands on it, but each "Show more" is not a page of its own. A pushed entry would make
// Back step through every expansion, and a back-swipe on a drill-down page would slide the page
// away only to land on the same pathname (components/nav/back-swipe.tsx).
export function ShowMore({ href }: { href: string }) {
  return (
    <Link href={href} scroll={false} replace className={linkClass}>
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

Replace `lib/ledger/list-transactions.ts` with this. `TYPE_LABELS`, `EntryMeta`, `Lookups` and `buildContext` are unchanged. The lookups are chunked, and `listAllTransactions` reads through `readKeyset`:


```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PageParams } from '@/lib/pagination/cursor'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'

export interface LedgerEntry {
  id: number
  profileId: string
  memberName: string
  amount: number
  type: string
  context: string
  createdAt: string
}

const TYPE_LABELS: Record<string, string> = {
  bet_placed: 'Bet placed',
  bet_won: 'Bet won',
  bet_refunded: 'Bet refunded',
  bet_voided_refund: 'Market voided',
  resolution_reversed: 'Resolution reversed',
  task_completed: 'Task reward',
  admin_adjustment: 'Admin adjustment',
  starting_grant: 'Starting grant',
  parlay_placed: 'Parlay placed',
  parlay_won: 'Parlay won',
  parlay_refunded: 'Parlay refunded',
  parlay_reversed: 'Parlay reversed',
}

export interface EntryMeta {
  market_id?: string
  outcome_id?: string
  task_id?: string
  reason?: string
}

// Three small `in (...)` lookups -- kept as literal `.select()` calls (not one
// helper taking a column name) because supabase-js parses the select string's
// type at compile time, so a templated column name can't be typed the same way.
// Each is split into chunks of IN_CHUNK ids, so a 500-row window never builds a
// URL that grows with the rows shown.
async function fetchMarketTitles(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const results = await Promise.all(chunk(ids, IN_CHUNK).map((part) => supabase.from('markets').select('id, title').in('id', part)))
  for (const { data, error } of results) {
    if (error) throw error
    for (const m of data ?? []) titles.set(m.id as string, m.title as string)
  }
  return titles
}

async function fetchOutcomeLabels(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const labels = new Map<string, string>()
  const results = await Promise.all(
    chunk(ids, IN_CHUNK).map((part) => supabase.from('market_outcomes').select('id, label').in('id', part)),
  )
  for (const { data, error } of results) {
    if (error) throw error
    for (const o of data ?? []) labels.set(o.id as string, o.label as string)
  }
  return labels
}

async function fetchTaskTitles(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const results = await Promise.all(chunk(ids, IN_CHUNK).map((part) => supabase.from('tasks').select('id, title').in('id', part)))
  for (const { data, error } of results) {
    if (error) throw error
    for (const t of data ?? []) titles.set(t.id as string, t.title as string)
  }
  return titles
}

export interface Lookups {
  markets: Map<string, string>
  outcomes: Map<string, string>
  tasks: Map<string, string>
}

// Every other type's context is its label, plus ": {market title}" when the row has a
// market_id (e.g. a voided-market refund) -- the specific movements below read differently
// enough (different wording, or no market involved at all) that they need their own copy.
// Exported (and kept pure -- no supabase client) so its fallback branches get direct unit
// coverage instead of only being reachable through a DB-backed listAllTransactions test.
export function buildContext(type: string, meta: EntryMeta, lookups: Lookups): string {
  const label = TYPE_LABELS[type] ?? type
  const marketTitle = meta.market_id ? lookups.markets.get(meta.market_id) : undefined

  switch (type) {
    case 'task_completed': {
      const taskTitle = meta.task_id ? lookups.tasks.get(meta.task_id) : undefined
      return taskTitle ? `Task approved: ${taskTitle}` : label
    }
    case 'parlay_won':
      return 'Parlay won'
    case 'parlay_placed':
      return 'Parlay placed'
    case 'bet_won':
      return marketTitle ? `Bet won: ${marketTitle}` : label
    case 'admin_adjustment':
      return meta.reason ? `Admin adjustment — “${meta.reason}”` : label
    case 'bet_placed': {
      const outcomeLabel = meta.outcome_id ? lookups.outcomes.get(meta.outcome_id) : undefined
      return marketTitle && outcomeLabel ? `Bet on ${outcomeLabel} in ${marketTitle}` : label
    }
    case 'starting_grant':
      return 'Starting grant'
    default:
      return marketTitle ? `${label}: ${marketTitle}` : label
  }
}

const LEDGER_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }

export async function listAllTransactions(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<LedgerEntry>> {
  const result = await readKeyset(
    page,
    LEDGER_KEYS,
    async (filter, limit) => {
      let query = supabase.from('coin_transactions').select('id, profile_id, amount, type, meta, created_at, profiles(display_name)')
      if (filter) query = query.or(filter)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    (t) => ({ ts: t.created_at, id: String(t.id) }),
  )

  const rows = result.rows
  const metas = rows.map((t) => (t.meta ?? {}) as EntryMeta)

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
    rows: rows.map((t, index) => {
      const profile = t.profiles as unknown as { display_name: string } | null
      return {
        id: t.id,
        profileId: t.profile_id,
        memberName: profile?.display_name ?? 'Unknown member',
        amount: t.amount,
        type: TYPE_LABELS[t.type] ?? t.type,
        context: buildContext(t.type, metas[index], lookups),
        createdAt: t.created_at,
      }
    }),
  }
}
```

Replace `app/(app)/admin/ledger/page.tsx`. "Back to newest" sits inside the card above the list, and "Show more" below it, each in a row ruled like the ledger rows:


```tsx
import { redirect } from 'next/navigation'
import { NotebookText } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { cardClass } from '@/components/ui/card'
import { LedgerRow } from '@/components/admin/ledger-row'
import { EmptyState } from '@/components/ui/empty-state'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { ContentReveal } from '@/components/nav/page-transition'
import { cn } from '@/lib/utils'

export default async function AdminLedgerPage(props: PageProps<'/admin/ledger'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const ledger = await listAllTransactions(supabase, readPageParams(searchParams, 'before'))

  return (
    <ContentReveal>
      <section aria-labelledby="ledger-title" className={cn(cardClass, 'px-[18px] py-1 md:px-6')}>
        <h2 id="ledger-title" className="sr-only">
          Every coin movement
        </h2>
        {ledger.windowed && (
          <div className="flex flex-col border-b border-line py-3.5">
            <BackToNewest href={newestHref('/admin/ledger', searchParams, 'before')} />
          </div>
        )}
        {ledger.rows.length === 0 ? (
          <div className="py-[18px] md:py-6">
            <EmptyState icon={NotebookText} title="No coin movements yet." />
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {ledger.rows.map((e) => (
              <LedgerRow key={e.id} entry={e} />
            ))}
          </ul>
        )}
        {ledger.next && (
          <div className="flex flex-col border-t border-line py-3.5">
            <ShowMore href={showMoreHref('/admin/ledger', searchParams, 'before', ledger.next)} />
          </div>
        )}
      </section>
    </ContentReveal>
  )
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/pagination tests/components/show-more.test.tsx tests/lib/ledger`
Expected: PASS.

Run: `npx vitest run tests/db/list-transactions.test.ts`
Expected: PASS (5 tests). This needs local Supabase running, and it wipes and reseeds it.

- [ ] **Step 9: Add the e2e spec**

Create `e2e/ledger-show-more.spec.ts`. Alice's own session makes 60 real `adjust_balance` calls on herself, +1 and −1 in turn, so her balance nets back to where it started (other specs read it relatively). The spec then holds the "Show more" page fetch the same way `e2e/skeletons.spec.ts` does:


```ts
import { test, expect, type Request } from '@playwright/test'
import { clientForEmail } from '../tests/db/fixtures'
import { serviceClient } from '../tests/db/helpers'

// Next fetches a link's loading state ahead of time (a prefetch, marked Next-Router-Prefetch), and
// fetches the page itself on click (RSC, no prefetch header). Holding only the second one shows
// what the page does while the next range is on its way.
function isPageFetch(request: Request) {
  const headers = request.headers()
  return headers['rsc'] === '1' && !('next-router-prefetch' in headers)
}

test('Show more on the admin ledger appends older rows in place, and a reload keeps them', async ({ page }) => {
  const { data: alice, error } = await serviceClient().from('profiles').select('id, email').eq('display_name', 'Alice').single()
  if (error) throw error
  const aliceClient = await clientForEmail(alice.email)
  // Sixty real ledger rows, +1 and −1 in turn, so Alice's balance nets back to where it started.
  for (let i = 0; i < 60; i++) {
    const { error: adjustErr } = await aliceClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: i % 2 === 0 ? 1 : -1,
      p_reason: `Paging check ${String(i).padStart(2, '0')}`,
    })
    if (adjustErr) throw adjustErr
  }

  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let intercepted = false
  await page.route(
    (url) => url.pathname === '/admin/ledger' && url.searchParams.has('before'),
    async (route) => {
      if (isPageFetch(route.request())) {
        intercepted = true
        await held
      }
      await route.continue()
    },
  )

  await page.goto('/admin/ledger')
  const ledger = page.getByRole('region', { name: 'Every coin movement' })
  const row = (n: string) => ledger.getByRole('listitem').filter({ hasText: `Paging check ${n}` })
  // The newest 50 are checks 59 down to 10.
  await expect(row('10')).toBeVisible()
  await expect(row('09')).toHaveCount(0)

  const showMore = ledger.getByRole('link', { name: 'Show more' })
  await showMore.scrollIntoViewIfNeeded()
  const scrollBefore = await page.evaluate(() => window.scrollY)
  expect(scrollBefore).toBeGreaterThan(0)
  // Flags the route's loading skeleton if it mounts at any point, even for one frame.
  await page.evaluate(() => {
    const flags = window as unknown as { skeletonShown: boolean }
    flags.skeletonShown = false
    new MutationObserver(() => {
      if (document.querySelector('[data-skeleton]')) flags.skeletonShown = true
    }).observe(document.body, { childList: true, subtree: true })
  })

  await showMore.click()
  await expect.poll(() => intercepted).toBe(true)
  // While the next range loads, the first page stays on screen, where it was.
  await expect(row('10')).toBeVisible()
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1)
  release()

  await expect(row('09')).toBeVisible()
  await expect(page).toHaveURL(/[?&]before=/)
  const [last, older] = await Promise.all([row('10').boundingBox(), row('09').boundingBox()])
  expect(older!.y).toBeGreaterThan(last!.y)
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => (window as unknown as { skeletonShown: boolean }).skeletonShown)).toBe(false)
  await page.unrouteAll()

  await page.reload()
  await expect(row('10')).toBeVisible()
  await expect(row('09')).toBeVisible()
  await expect(row('00')).toBeVisible()
})
```

**What the spec proves:**
- **No skeleton flash.** A `MutationObserver` flags any `[data-skeleton]` element mounting between the click and the end of the test. The ledger's `loading.tsx` renders `data-skeleton="admin-ledger"`.
- **The first page stays put while the next range loads.** The page fetch is held, so the assertions run while the server provably hasn't answered. Row "Paging check 10" is still shown, and `scrollY` hasn't moved.
- **Older rows land below.** After release, "Paging check 09" appears, its box is below row 10's, and `scrollY` is still where it was.
- **Reload keeps the range.** The URL carries `before=`, and after a reload rows 10, 09 and 00 are all there.

The 60 rows are the newest in the ledger because the suite runs on one worker. The newest 50 are checks 59 down to 10. After one "Show more", the range reaches 50 rows further down, which includes checks 09 to 00.

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 865 tests in 134 files, 42 of them in `tests/db/`. This task adds 68 tests: 65 in 5 new files, and 3 in `tests/db/list-transactions.test.ts`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed, the 25 after Task 2 plus `ledger-show-more.spec.ts`.

- [ ] **Step 11: Commit**

```bash
git add lib/pagination/cursor.ts lib/pagination/keyset.ts lib/pagination/chunk.ts components/ui/show-more.tsx lib/ledger/list-transactions.ts "app/(app)/admin/ledger/page.tsx" tests/lib/pagination/cursor.test.ts tests/lib/pagination/keyset.test.ts tests/lib/pagination/chunk.test.ts tests/components/show-more.test.tsx tests/lib/fake-supabase.ts tests/lib/ledger/list-transactions.test.ts tests/db/list-transactions.test.ts e2e/ledger-show-more.spec.ts
git commit -m "Page the admin ledger with Show more, on a shared keyset reader"
```

---

## Task 5: Markets — a market's bets, closed markets, charts for the cards shown, and Home's count

Four market reads stop growing with the data:
- **A market's bets.** `getMarketBets` reads the whole list today. It now pages 50 at a time under the market page's Bets card, with the position in `?bets=` (window: `?bets_from=`).
- **The markets list.** `listMarkets` reads every market, then fetches their resolutions with an `.in('id', …)` whose URL grows with the list (`list-markets.ts:35`). It splits in two:
  - `listOpenMarkets`, unpaged, as the spec says
  - `listClosedMarkets`, resolved and voided markets as one paged list in `?resolved=`, shown in their two existing groups
  - both read the current resolution through an embedded foreign-key join in the same request
- **Charts.** `/markets` reads chart bets only for the cards it shows, open plus the closed ones on screen. Chart reads use keyset pages of 500 instead of `OFFSET`, and `listChartBets` sends its market ids in chunks of 50. If the chart read fails, `/markets` logs it and renders the cards without charts. Market detail still throws into the error page, per the plan's ruling.
- **Home** counts open markets with a `head: true` count, instead of reading every market to take a length.

**Files:**
- Modify: `lib/markets/get-market.ts` (`getMarketBets` only; Task 9 changes `getMarket`)
- Modify (rewrite): `lib/markets/list-markets.ts` (`listMarkets` removed; `MarketSummary` unchanged)
- Modify (rewrite): `lib/markets/chart-bets.ts` (same exports and signatures)
- Modify: `app/(app)/markets/[id]/page.tsx` (the paged Bets card)
- Modify (rewrite): `app/(app)/markets/page.tsx`
- Modify: `app/(app)/(home)/page.tsx` (the count)
- Test, create: `tests/lib/markets/chart-bets.test.ts`, `tests/lib/markets/list-markets.test.ts`, `tests/lib/markets/market-bets.test.ts` (all using Task 4's `tests/lib/fake-supabase.ts`)
- Test, modify (rewrite): `tests/db/list-markets.test.ts` (the split; the two outcome-order cases move to `listOpenMarkets`, and the resolution case to `listClosedMarkets`)
- Test, modify (rewrite): `tests/db/market-bets.test.ts` (the signature change, plus paging)
- Test, modify: `tests/db/chart-bets.test.ts` (two cases added; the existing seven pass unchanged)

**Interfaces:**
- Consumes (Task 4): `readKeyset`, `KeyColumns` (with its optional `isId`), `isBigintId`, `newerThanFilter`, `KeysetPage`, `readPageParams`, `showMoreHref`, `newestHref`, `WINDOW_CAP`, `chunk`, `IN_CHUNK`, `ShowMore`, `BackToNewest`, `fakeSupabase`. Also `isUuid` (`lib/uuid.ts`) as the closed-markets key's `isId`.
- Consumes: PostgREST embeds a to-one relation by foreign-key name. `market_resolutions!markets_current_resolution_id_fkey(…)` follows `markets.current_resolution_id` and comes back as an object or `null`. The hint is needed because `market_resolutions.market_id` also links the two tables. The select was run against local PostgREST.
- Produces (the plan's pinned interfaces):
  ```ts
  // lib/markets/get-market.ts                                     URL param: bets
  export async function getMarketBets(supabase: SupabaseClient, marketId: string, page: PageParams): Promise<KeysetPage<MarketBet>>
  // lib/markets/list-markets.ts                                   URL param: resolved
  export async function listOpenMarkets(supabase: SupabaseClient): Promise<MarketSummary[]>
  export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>>
  export async function countOpenMarkets(supabase: SupabaseClient): Promise<number>
  // lib/markets/chart-bets.ts (unchanged signatures)
  export async function getChartBets(supabase: SupabaseClient, marketId: string): Promise<ChartBet[]>
  export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>>
  ```
- Produces, the page states the plan pins for Tasks 9 and 10:
  - **Market detail** reads `const [betsPage, chartBets] = await Promise.all([…])` then `const admin = await isAdmin(supabase)`. The `slip` / `slipView` lines stay where they are.
  - **Home** reads `const [admin, slip, openMarketCount, board, myCompletions] = await Promise.all([…])`.
  - **`/markets`** reads `listOpenMarkets` and `listClosedMarkets` in parallel.

**Where the links go:**
- **Market detail:** "Back to newest" (when `betsPage.windowed`) above the `BetList`, and "Show more" (when `betsPage.next`) below it, inside the Bets card.
- **`/markets`:** "Back to newest" directly above the first closed group (Resolved, else Voided), or at the end of the page when the window shows no closed market. "Show more" goes after the last group. The four groups keep their headings and order.

**Keys.** A market's bets page on `(created_at, id)` desc with `isBigintId`, and closed markets on `(created_at, id)` desc with `isUuid`. Chart bets read `(created_at, id)` ascending, each page strictly after the last row of the one before (`newerThanFilter`). Chart pages are 500 rows (`WINDOW_CAP`) rather than today's 1,000, so every request stays within the PR's 500-row bound.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/lib/markets/chart-bets.test.ts`:


```ts
import { describe, it, expect } from 'vitest'
import { getChartBets, listChartBets } from '@/lib/markets/chart-bets'
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

describe('listChartBets', () => {
  it('reads the listed markets in chunks of at most 50 ids, and groups each one’s bets', async () => {
    const ids = Array.from({ length: 120 }, (_, i) => `m${i}`)
    const { client, queries } = fakeSupabase((query) => {
      const part = query.in[0][1] as string[]
      return { data: part.map((id, i) => betRow(i + 1, id)) }
    })

    const byMarket = await listChartBets(client, ids)

    expect(queries.map((q) => (q.in[0][1] as string[]).length)).toEqual([50, 50, 20])
    expect(queries.flatMap((q) => q.in[0][1] as string[])).toEqual(ids)
    expect([...byMarket.keys()]).toEqual(ids)
    expect(byMarket.get('m119')).toEqual([{ outcomeId: 'o-m119', amount: 20, createdAt: betRow(20).created_at }])
  })

  it('makes no request for no markets', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    expect(await listChartBets(client, [])).toEqual(new Map())
    expect(queries).toHaveLength(0)
  })
})
```

Create `tests/lib/markets/list-markets.test.ts`:


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
  it('reads only open markets, newest first, with the resolution embedded in the same request', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [marketRow({ status: 'open', current_resolution: null })] }))

    const markets = await listOpenMarkets(client)

    expect(queries).toHaveLength(1)
    expect(queries[0].select).toContain(RESOLUTION_EMBED)
    expect(queries[0].eq).toEqual([['status', 'open']])
    expect(queries[0].order.slice(0, 2)).toEqual([
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(markets).toEqual([
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

Create `tests/lib/markets/market-bets.test.ts`:


```ts
import { describe, it, expect } from 'vitest'
import { getMarketBets } from '@/lib/markets/get-market'
import { decodeCursor } from '@/lib/pagination/cursor'
import { fakeSupabase } from '../fake-supabase'

function betRow(n: number) {
  return {
    id: n,
    outcome_id: 'o-yes',
    amount: n,
    created_at: `2026-09-26T10:00:00.${String(n).padStart(6, '0')}+00:00`,
    profile_id: 'p-bob',
    profiles: { display_name: 'Bob' },
  }
}

describe('getMarketBets', () => {
  it("reads the market's newest 50 bets, and points Show more at the 50th one past them", async () => {
    const shown = Array.from({ length: 50 }, (_, i) => betRow(200 - i))
    const probed = Array.from({ length: 50 }, (_, i) => betRow(150 - i))
    const { client, queries } = fakeSupabase((_query, index) => ({ data: index === 0 ? shown : probed }))

    const page = await getMarketBets(client, 'm1', { top: null, bottom: null })

    expect(queries.map((q) => [q.table, q.eq, q.limit])).toEqual([
      ['bets', [['market_id', 'm1']], 50],
      ['bets', [['market_id', 'm1']], 50],
    ])
    expect(page.rows[0]).toEqual({
      id: 200,
      outcomeId: 'o-yes',
      amount: 200,
      createdAt: betRow(200).created_at,
      profileId: 'p-bob',
      bettorName: 'Bob',
    })
    expect(page.rows).toHaveLength(50)
    expect(decodeCursor(page.next?.cursor)).toEqual({ ts: betRow(101).created_at, id: '101' })
  })

  it('ignores a cursor whose id is not a bet id', async () => {
    const { client, queries } = fakeSupabase(() => ({ data: [] }))
    const page = await getMarketBets(client, 'm1', { top: { ts: '2026-09-26T10:00:00Z', id: 'bet:1' }, bottom: null })
    expect(queries[0].or).toEqual([])
    expect(page.windowed).toBe(false)
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/markets/chart-bets.test.ts tests/lib/markets/list-markets.test.ts tests/lib/markets/market-bets.test.ts`
Expected: FAIL. `listOpenMarkets`, `listClosedMarkets` and `countOpenMarkets` don't exist, `getMarketBets` returns an array, and the chart reader still sends `.range()` pages of 1,000 with no `.limit()`.

- [ ] **Step 3: Write the paged readers**

In `lib/markets/get-market.ts`, replace the import line at the top:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
```

with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PageParams } from '@/lib/pagination/cursor'
import { isBigintId, readKeyset, type KeyColumns, type KeysetPage } from '@/lib/pagination/keyset'
```

Then replace the whole `getMarketBets` function, from `export async function getMarketBets` to the end of the file:

```ts
export async function getMarketBets(supabase: SupabaseClient, marketId: string): Promise<MarketBet[]> {
  const { data, error } = await supabase
    .from('bets')
    .select('id, outcome_id, amount, created_at, profile_id, profiles(display_name)')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })

  if (error) throw error

  return (data ?? []).map((b) => {
    const profile = b.profiles as unknown as { display_name: string } | null
    return {
      id: b.id,
      outcomeId: b.outcome_id,
      amount: b.amount,
      createdAt: b.created_at,
      profileId: b.profile_id,
      bettorName: profile?.display_name ?? 'Unknown member',
    }
  })
}
```

with:

```ts
const BET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isBigintId }

export async function getMarketBets(supabase: SupabaseClient, marketId: string, page: PageParams): Promise<KeysetPage<MarketBet>> {
  const result = await readKeyset(
    page,
    BET_KEYS,
    async (filter, limit) => {
      let query = supabase
        .from('bets')
        .select('id, outcome_id, amount, created_at, profile_id, profiles(display_name)')
        .eq('market_id', marketId)
      if (filter) query = query.or(filter)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data ?? []
    },
    (b) => ({ ts: b.created_at, id: String(b.id) }),
  )

  return {
    ...result,
    rows: result.rows.map((b) => {
      const profile = b.profiles as unknown as { display_name: string } | null
      return {
        id: b.id,
        outcomeId: b.outcome_id,
        amount: b.amount,
        createdAt: b.created_at,
        profileId: b.profile_id,
        bettorName: profile?.display_name ?? 'Unknown member',
      }
    }),
  }
}
```

`MarketDetail`, `MarketBet` and `getMarket` are untouched.

Replace `lib/markets/list-markets.ts`:


```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PageParams } from '@/lib/pagination/cursor'
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

export async function listOpenMarkets(supabase: SupabaseClient): Promise<MarketSummary[]> {
  const { data, error } = await supabase
    .from('markets')
    .select(SUMMARY_SELECT)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    // Same tiebreak as getMarket: insertion time, then label, so outcome order (and
    // therefore colour assignment) is stable across requests.
    .order('created_at', { referencedTable: 'market_outcomes' })
    .order('label', { referencedTable: 'market_outcomes' })

  if (error) throw error
  return ((data ?? []) as unknown as SummaryRow[]).map(toSummary)
}

const MARKET_KEYS: KeyColumns = { ts: 'created_at', id: 'id', isId: isUuid }

// Resolved and voided markets are one list, one "Show more", shown in their two groups.
export async function listClosedMarkets(supabase: SupabaseClient, page: PageParams): Promise<KeysetPage<MarketSummary>> {
  const result = await readKeyset(
    page,
    MARKET_KEYS,
    async (filter, limit) => {
      let query = supabase.from('markets').select(SUMMARY_SELECT).in('status', ['resolved', 'voided'])
      if (filter) query = query.or(filter)
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .order('created_at', { referencedTable: 'market_outcomes' })
        .order('label', { referencedTable: 'market_outcomes' })
        .limit(limit)
      if (error) throw error
      return (data ?? []) as unknown as SummaryRow[]
    },
    (m) => ({ ts: m.created_at, id: m.id }),
  )
  return { ...result, rows: result.rows.map(toSummary) }
}

export async function countOpenMarkets(supabase: SupabaseClient): Promise<number> {
  const { count, error } = await supabase.from('markets').select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (error) throw error
  return count ?? 0
}
```

Replace `lib/markets/chart-bets.ts`:


```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChartBet } from '@/lib/markets/probability-series'
import { WINDOW_CAP, type Cursor } from '@/lib/pagination/cursor'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'
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

// Market ids go in chunks of IN_CHUNK, so the `.in()` URL stays the same length however many
// cards the page shows.
export async function listChartBets(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  const byMarket = new Map<string, ChartBet[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])
  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => readBets(supabase, part)))
  for (const row of chunks.flat()) byMarket.get(row.market_id)?.push(toChartBet(row))
  return byMarket
}
```

- [ ] **Step 4: Run the unit tests to verify they pass**

Run: `npx vitest run tests/lib/markets`
Expected: PASS.

- [ ] **Step 5: Update the DB tests**

Replace `tests/db/market-bets.test.ts`:


```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarketBets } from '@/lib/markets/get-market'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

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

describe('getMarketBets', () => {
  it("lists every member's bets on the market, newest first, with names", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    for (const [client, outcomeIndex, amount] of [
      [aliceClient, 0, 10],
      [bobClient, 1, 20],
    ] as const) {
      const { error } = await client.rpc('place_bet', {
        p_market_id: market.marketId,
        p_outcome_id: market.outcomeIds[outcomeIndex],
        p_amount: amount,
      })
      if (error) throw error
    }
    const { error: otherErr } = await bobClient.rpc('place_bet', {
      p_market_id: other.marketId,
      p_outcome_id: other.outcomeIds[0],
      p_amount: 5,
    })
    if (otherErr) throw otherErr

    const page = await getMarketBets(bobClient, market.marketId, FIRST)
    expect(page.rows.map((b) => [b.bettorName, b.profileId, b.outcomeId, b.amount])).toEqual([
      ['Bob', bob.id, market.outcomeIds[1], 20],
      ['Alice', alice.id, market.outcomeIds[0], 10],
    ])
    expect(page.next).toBeNull()
  })

  it('is empty for an uninvited session', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
    })
    if (error) throw error

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getMarketBets(carolClient, market.marketId, FIRST)).toEqual({ rows: [], next: null, windowed: false })
  })

  it("pages a busy market's bets 50 at a time, newest first, with nothing skipped or repeated", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const other = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Other market' })
    const start = Date.parse('2026-09-01T00:00:00.000Z')
    // Inserted directly: 75 place_bet calls are slow, and paging never looks at pools. Runs of
    // three share a microsecond timestamp, so page boundaries fall inside ties.
    const rows = Array.from({ length: 75 }, (_, i) => ({
      market_id: i < 70 ? market.marketId : other.marketId,
      outcome_id: i < 70 ? market.outcomeIds[i % 2] : other.outcomeIds[0],
      profile_id: alice.id,
      amount: i + 1,
      created_at: `${new Date(start + Math.floor(i / 3) * 60_000).toISOString().slice(0, 19)}.000123+00:00`,
    }))
    const { error } = await serviceClient().from('bets').insert(rows)
    if (error) throw error

    const first = await getMarketBets(bobClient, market.marketId, FIRST)
    expect(first.rows.map((b) => b.amount)).toEqual(Array.from({ length: 50 }, (_, i) => 70 - i))
    expect(first.next?.kind).toBe('extend')

    const href = new URL(showMoreHref(`/markets/${market.marketId}`, {}, 'bets', first.next!), 'http://localhost')
    const second = await getMarketBets(bobClient, market.marketId, readPageParams(Object.fromEntries(href.searchParams), 'bets'))
    expect(second.rows.map((b) => b.amount)).toEqual(Array.from({ length: 70 }, (_, i) => 70 - i))
    expect(second.next).toBeNull()
  })

  it('reads a garbage bets param as the first page', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'])
    const { error } = await aliceClient.rpc('place_bet', {
      p_market_id: market.marketId,
      p_outcome_id: market.outcomeIds[0],
      p_amount: 10,
    })
    if (error) throw error

    const page = await getMarketBets(bobClient, market.marketId, readPageParams({ bets: 'x', bets_from: 'y' }, 'bets'))
    expect(page.rows.map((b) => b.amount)).toEqual([10])
    expect(page.windowed).toBe(false)
  })
})
```

Replace `tests/db/list-markets.test.ts`:


```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { countOpenMarkets, listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

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

    const markets = await listOpenMarkets(bobClient)

    expect(markets.map((m) => m.title)).toEqual(['Awaiting', 'Newer', 'Older'])
    expect(markets.every((m) => m.status === 'open' && m.resolvedAt === null && m.resolvedOutcomeLabel === null)).toBe(true)
    expect(markets.map((m) => m.id)).not.toContain(voided.marketId)
  })

  it("orders a market's outcomes by label when they tie on creation time, regardless of input order", async () => {
    const { marketId } = await createTestMarket(aliceClient, ['Zebra', 'Apple', 'Mango'])

    const markets = await listOpenMarkets(bobClient)
    const market = markets.find((m) => m.id === marketId)

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

    const markets = await listOpenMarkets(bobClient)
    const market = markets.find((m) => m.id === marketId)

    expect(market?.outcomes.map((o) => o.label)).toEqual(['Beta', 'Alpha'])
  })

  it('is empty for an uninvited session', async () => {
    await createTestMarket(aliceClient, ['Yes', 'No'])
    const carol = await makeMember('Carol')
    expect(await listOpenMarkets(await clientFor(carol))).toEqual([])
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
    // pools. Pairs share a created_at, so the 50th/51st tie and the id breaks it.
    const rows = Array.from({ length: 60 }, (_, i) => ({
      created_by: alice.id,
      title: `Closed ${String(i).padStart(2, '0')}`,
      kind: 'binary',
      status: 'voided',
      close_at: new Date(start).toISOString(),
      created_at: `${new Date(start + Math.floor(i / 2) * 60_000).toISOString().slice(0, 19)}.000456+00:00`,
    }))
    const { error } = await serviceClient().from('markets').insert(rows)
    if (error) throw error
    const { data: all, error: allErr } = await serviceClient()
      .from('markets')
      .select('id')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (allErr) throw allErr
    const everything = all.map((m) => m.id as string)

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

In `tests/db/chart-bets.test.ts`, add a case to the `getChartBets` block, directly before its `it('is empty for an uninvited session', …)`:

```ts
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
```

Then add a case to the `listChartBets` block, directly before its `it('returns an empty map for no markets', …)`:

```ts
  it('reads more than 50 markets, in chunks, with every market keeping its own bets', async () => {
    const db = serviceClient()
    const closeAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    // Inserted directly: sixty create_market calls are slow, and the reader never looks at pools.
    const { data: markets, error } = await db
      .from('markets')
      .insert(Array.from({ length: 60 }, (_, i) => ({ created_by: alice.id, title: `Chart ${i}`, kind: 'binary', close_at: closeAt })))
      .select('id')
    if (error) throw error
    const { data: outcomes, error: outcomesErr } = await db
      .from('market_outcomes')
      .insert(markets.map((m) => ({ market_id: m.id, label: 'Yes' })))
      .select('id, market_id')
    if (outcomesErr) throw outcomesErr
    const { error: betsErr } = await db
      .from('bets')
      .insert(outcomes.map((o, i) => ({ market_id: o.market_id, outcome_id: o.id, profile_id: alice.id, amount: i + 1 })))
    if (betsErr) throw betsErr

    const ids = markets.map((m) => m.id as string)
    const byMarket = await listChartBets(bobClient, ids)

    expect([...byMarket.keys()]).toEqual(ids)
    outcomes.forEach((o, i) => {
      expect(byMarket.get(o.market_id)?.map((b) => [b.outcomeId, b.amount])).toEqual([[o.id, i + 1]])
    })
  })
```

The existing cases need no change. `'reads past the 1000-row response cap'` now crosses two 500-row page boundaries instead of one 1,000-row one.

- [ ] **Step 6: Run the DB tests to verify they pass**

Run: `npx vitest run tests/db/market-bets.test.ts tests/db/list-markets.test.ts tests/db/chart-bets.test.ts`
Expected: PASS (4, 10 and 9 tests). This needs local Supabase running, and it wipes and reseeds it.

- [ ] **Step 7: Wire the three pages**

**`app/(app)/markets/[id]/page.tsx`.** Add two imports. After:

```tsx
import { rowState } from '@/lib/markets/row-state'
```

add:

```tsx
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
```

and after:

```tsx
import { SectionCard } from '@/components/ui/section-card'
```

add:

```tsx
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
```

Replace:

```tsx
  const { id } = await props.params
  const { supabase, user } = await requireUser()
```

with:

```tsx
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
```

Replace:

```tsx
  const [bets, chartBets] = await Promise.all([getMarketBets(supabase, id), getChartBets(supabase, id)])
```

with:

```tsx
  const [betsPage, chartBets] = await Promise.all([
    getMarketBets(supabase, id, readPageParams(searchParams, 'bets')),
    getChartBets(supabase, id),
  ])
```

The next line, `const admin = await isAdmin(supabase)`, and the `slip` / `slipView` lines further down stay as they are. Then replace the Bets card:

```tsx
          <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
            <BetList bets={bets} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
          </SectionCard>
```

with:

```tsx
          <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
            {betsPage.windowed && (
              <div className="flex flex-col py-2">
                <BackToNewest href={newestHref(`/markets/${id}`, searchParams, 'bets')} />
              </div>
            )}
            <BetList bets={betsPage.rows} outcomes={market.outcomes} viewerId={user.id} canBet={canBet} />
            {betsPage.next && (
              <div className="flex flex-col border-t border-line pt-3">
                <ShowMore href={showMoreHref(`/markets/${id}`, searchParams, 'bets', betsPage.next)} />
              </div>
            )}
          </SectionCard>
```

**`app/(app)/markets/page.tsx`.** Replace it. The card-building code is today's, run over `[...open, ...closed.rows]`:


```tsx
import { Fragment } from 'react'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ChartColumn, Plus } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { listClosedMarkets, listOpenMarkets } from '@/lib/markets/list-markets'
import { computeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { marketCardStatus, type MarketCardStatus } from '@/lib/markets/market-status'
import { listChartBets } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries, type ChartBet } from '@/lib/markets/probability-series'
import { newestHref, readPageParams, showMoreHref } from '@/lib/pagination/cursor'
import { Page, PageHeader, h2Class } from '@/components/ui/page'
import { EmptyState } from '@/components/ui/empty-state'
import { buttonVariants } from '@/components/ui/button'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { cn } from '@/lib/utils'
import { MarketCard, type MarketCardChart } from '@/components/markets/market-card'

const GROUPS: { id: MarketCardStatus; heading: string }[] = [
  { id: 'open', heading: 'Open' },
  { id: 'awaiting', heading: 'Awaiting resolution' },
  { id: 'resolved', heading: 'Resolved' },
  { id: 'voided', heading: 'Voided' },
]

// Charts are decoration on this page: if their read fails, the cards still render without them.
async function readCharts(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, ChartBet[]>> {
  try {
    return await listChartBets(supabase, marketIds)
  } catch (error) {
    console.error('Market charts failed to load', error)
    return new Map()
  }
}

export default async function MarketsPage(props: PageProps<'/markets'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const [open, closed] = await Promise.all([
    listOpenMarkets(supabase),
    listClosedMarkets(supabase, readPageParams(searchParams, 'resolved')),
  ])
  const markets = [...open, ...closed.rows]
  const chartBetsByMarket = await readCharts(
    supabase,
    markets.map((m) => m.id),
  )
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now()
  const now = new Date(nowMs)

  const cards = markets.map((market) => {
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
    }
  })

  const groups = GROUPS.map((group) => ({
    ...group,
    markets: cards.filter((card) => card.status === group.id),
  })).filter((group) => group.markets.length > 0)

  const firstClosedGroup = groups.findIndex((group) => group.id === 'resolved' || group.id === 'voided')
  const backToNewest = closed.windowed ? <BackToNewest href={newestHref('/markets', searchParams, 'resolved')} /> : null

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
      {groups.length === 0 ? (
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
      {closed.next && <ShowMore href={showMoreHref('/markets', searchParams, 'resolved', closed.next)} />}
    </Page>
  )
}
```

**`app/(app)/(home)/page.tsx`.** Replace:

```tsx
import { listMarkets } from '@/lib/markets/list-markets'
```

with:

```tsx
import { countOpenMarkets } from '@/lib/markets/list-markets'
```

Replace:

```tsx
  const [admin, slip, markets, board, myCompletions] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    listMarkets(supabase),
```

with:

```tsx
  const [admin, slip, openMarketCount, board, myCompletions] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    countOpenMarkets(supabase),
```

and delete this line:

```tsx
  const openMarketCount = markets.filter((m) => m.status === 'open').length
```

The count keeps today's meaning: `status = 'open'`, which includes markets past their close time that are awaiting resolution, as the old filter did.

Check that nothing still imports the removed function:

Run: `grep -rn "listMarkets" app lib components tests e2e`
Expected: no output.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 887 tests in 137 files, 42 of them in `tests/db/`. This task adds 22 tests: 12 in 3 new files, and 10 in the three DB files.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed, unchanged from Task 4. `charts.spec.ts` still finds its open market's chart on `/markets`, and every Bets region assertion still finds its bet on the first page.

- [ ] **Step 9: Commit**

```bash
git add lib/markets/get-market.ts lib/markets/list-markets.ts lib/markets/chart-bets.ts "app/(app)/markets/[id]/page.tsx" "app/(app)/markets/page.tsx" "app/(app)/(home)/page.tsx" tests/lib/markets/chart-bets.test.ts tests/lib/markets/list-markets.test.ts tests/lib/markets/market-bets.test.ts tests/db/list-markets.test.ts tests/db/market-bets.test.ts tests/db/chart-bets.test.ts
git commit -m "Page a market's bets and closed markets, embed resolutions, and count Home's open markets"
```

---

## Task 6: Feed, member activity and the leaderboard

The feed and a member's activity list currently read `FEED_LIMIT = 50` and silently drop
anything older. Both switch to Task 4's keyset pager, get "Show more" (and "Back to newest"
once a window starts), and stop needing a client round trip to find out there's more.

The leaderboard and member page currently load every profile into memory and rank it in
JavaScript (`rankMembers`), then the member page does `board.find(m => m.id === id)` — an
O(members) scan on every visit, and a member who isn't found silently 404s only because
`find` returned `undefined`. `getLeaderboard` now orders in SQL and only ranks the page it
gets back; the member page reads one profile and counts how many members outrank it, so its
cost stops growing with the membership. An unknown id still 404s, but on purpose: a real
profile lookup that came back empty, not a linear scan that fell through.

**Files:**
- Modify (rewrite): `lib/social/ranking.ts` (adds `assignRanks`; `rankMembers` becomes sort + `assignRanks`)
- Modify (rewrite): `lib/social/leaderboard.ts` (`getLeaderboard` orders in SQL; adds `getMemberStanding`)
- Modify (rewrite): `lib/social/list-feed.ts` (`listFeed` takes `page: PageParams`, returns `KeysetPage<FeedEvent>`; `FEED_LIMIT` removed)
- Modify (rewrite): `app/(app)/feed/feed-list.tsx` (`FeedList` gains `aboveList`/`belowList` slots)
- Modify (rewrite): `app/(app)/feed/page.tsx` (`before` param, new description copy, `ShowMore`/`BackToNewest`)
- Modify (rewrite): `app/(app)/members/[id]/page.tsx` (`activity` param, `getMemberStanding`, `isUuid` guard)
- Test, modify (rewrite): `tests/lib/social/ranking.test.ts` (adds `assignRanks` cases)
- Test, modify (rewrite): `tests/components/feed-list.test.tsx` (adds the slot cases)
- Test, modify (rewrite): `tests/db/social-readers.test.ts` (updated call shapes, plus a paging case and `getMemberStanding` cases)

**Interfaces:**
- Consumes (Task 4, unchanged by this task):
  - `lib/pagination/cursor.ts`: `PageParams`, `readPageParams`, `showMoreHref`, `newestHref`, `decodeCursor`
  - `lib/pagination/keyset.ts`: `readKeyset`, `KeyColumns`, `KeysetPage<T>`
  - `components/ui/show-more.tsx`: `ShowMore`, `BackToNewest`
  - `lib/uuid.ts`: `isUuid` (already used by the market page the same way)
  - `lib/auth/require-user.ts`: `requireUser` (unchanged this task)
- Produces (pinned for later tasks):
  - `lib/social/ranking.ts`: `assignRanks<T extends { balance: number }>(sorted: T[]): (T & { rank: number })[]` — input already sorted balance desc; ties share a rank; `rankMembers` unchanged in signature and behaviour
  - `lib/social/leaderboard.ts`: `getLeaderboard(supabase)` unchanged signature; `MemberStanding = LeaderboardEntry & { memberCount: number }`; `getMemberStanding(supabase, memberId): Promise<MemberStanding | null>`
  - `lib/social/list-feed.ts`: `listFeed(supabase, opts: { actorId?: string; page: PageParams }): Promise<KeysetPage<FeedEvent>>`, keys `(occurred_at, id)`
  - `app/(app)/feed/feed-list.tsx`: `FeedList({ events, heading, headingId, headingHidden, aboveList, belowList })` — Task 10 does not touch this file

**"Show more" doesn't flash `loading.tsx`.** `/feed` has a `loading.tsx`, and the member page wraps `MemberActivity` in a `<Suspense>`. Neither shows its fallback on "Show more", for the reasons Task 4 gives: the layout router keys a page segment's subtree without its search params, so the boundary stays mounted, and the navigation runs in a transition, so React keeps the rows already on screen until the new range commits. A throwaway Next 16.3.5 app with a `loading.tsx` and a 1.5s page read confirmed it in a browser: the old rows stayed up for the full 1.5s and the fallback never rendered. Task 4's `ledger-show-more.spec.ts` covers the mechanism end to end, so this task adds no e2e spec, and the count stays 26.

- [ ] **Step 1: Write the failing tests for `assignRanks` and the `FeedList` slots**

Replace `tests/lib/social/ranking.test.ts` in full. The `rankMembers` block is today's, unchanged; the `assignRanks` block is new:

```ts
import { describe, it, expect } from 'vitest'
import { rankMembers, assignRanks } from '@/lib/social/ranking'

describe('rankMembers', () => {
  it('ranks by balance, highest first', () => {
    expect(
      rankMembers([
        { id: 'a', displayName: 'Ann', balance: 50 },
        { id: 'b', displayName: 'Ben', balance: 120 },
      ]).map((m) => [m.displayName, m.rank]),
    ).toEqual([
      ['Ben', 1],
      ['Ann', 2],
    ])
  })

  it('gives ties the same rank, orders them by name, and skips the next rank', () => {
    expect(
      rankMembers([
        { id: 'c', displayName: 'Cal', balance: 90 },
        { id: 'b', displayName: 'Bea', balance: 150 },
        { id: 'a', displayName: 'Abe', balance: 150 },
      ]).map((m) => [m.displayName, m.rank]),
    ).toEqual([
      ['Abe', 1],
      ['Bea', 1],
      ['Cal', 3],
    ])
  })

  it('returns an empty list for no members', () => {
    expect(rankMembers([])).toEqual([])
  })
})

describe('assignRanks', () => {
  it('assigns index + 1 to already-sorted, distinct balances', () => {
    expect(assignRanks([{ balance: 150 }, { balance: 90 }, { balance: 50 }]).map((m) => m.rank)).toEqual([1, 2, 3])
  })

  it('gives equal balances the same rank and skips to the next index', () => {
    expect(assignRanks([{ balance: 150 }, { balance: 150 }, { balance: 90 }]).map((m) => m.rank)).toEqual([1, 1, 3])
  })

  it('keeps every other field on the input untouched', () => {
    expect(assignRanks([{ id: 'a', balance: 10 }])).toEqual([{ id: 'a', balance: 10, rank: 1 }])
  })

  it('returns an empty list for no members', () => {
    expect(assignRanks([])).toEqual([])
  })
})
```

Replace `tests/components/feed-list.test.tsx` in full. The first five cases are today's, unchanged; the last three are new:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FeedList } from '@/app/(app)/feed/feed-list'
import type { FeedEvent } from '@/lib/social/describe-event'

const event: FeedEvent = {
  id: '1',
  kind: 'bet_placed',
  occurredAt: '2026-09-25T12:00:00Z',
  actorId: 'a1',
  actorName: 'Alice',
  marketId: 'm1',
  marketTitle: 'Social layer market',
  outcomeLabel: 'Yes',
  amount: 5,
  legCount: null,
  taskTitle: null,
}

describe('FeedList', () => {
  it('lists each event under a visible heading, with no extra list padding', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).not.toHaveClass('px-[18px]')
  })

  it('trims the card to a 4px bottom padding under a visible heading, leaving the rows to supply the rest', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    const card = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')
    expect(card).toHaveClass('pb-1', 'md:pb-1', 'md:pt-[18px]')
  })

  it('renders the empty state inside the card, under a visible heading', () => {
    render(<FeedList events={[]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.getByRole('heading', { name: 'Recent activity' })).toBeInTheDocument()
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
  })

  it('renders a bare empty state with no card when the heading is hidden and there are no events', () => {
    render(<FeedList events={[]} heading="Events" headingId="feed-events" headingHidden />)
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('lists events padded inside a zero-padded card when the heading is hidden', () => {
    render(<FeedList events={[event]} heading="Events" headingId="feed-events" headingHidden />)
    expect(screen.getByRole('listitem')).toHaveTextContent('Alice bet 5 DC on Yes in Social layer market')
    expect(screen.getByRole('list')).toHaveClass('px-[18px]')
  })

  it('renders aboveList before the list and belowList after it, inside the visible-heading card', () => {
    render(
      <FeedList
        events={[event]}
        heading="Recent activity"
        headingId="recent-activity"
        aboveList={<a href="/x">Back to newest</a>}
        belowList={<a href="/y">Show more</a>}
      />,
    )
    const card = screen.getByRole('heading', { name: 'Recent activity' }).closest('section')!
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toBeInTheDocument()
    // aboveList precedes the list content, belowList follows it, inside the same card.
    const html = card.innerHTML
    expect(html.indexOf('Back to newest')).toBeLessThan(html.indexOf('Alice'))
    expect(html.indexOf('Alice')).toBeLessThan(html.indexOf('Show more'))
  })

  it('renders aboveList and belowList around a hidden-heading empty state', () => {
    render(
      <FeedList
        events={[]}
        heading="Events"
        headingId="feed-events"
        headingHidden
        aboveList={<a href="/x">Back to newest</a>}
        belowList={<a href="/y">Show more</a>}
      />,
    )
    expect(screen.getByText('Nothing yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to newest' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Show more' })).toBeInTheDocument()
  })

  it('omits the slots entirely when neither is passed', () => {
    render(<FeedList events={[event]} heading="Recent activity" headingId="recent-activity" />)
    expect(screen.queryByRole('link', { name: 'Back to newest' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Show more' })).toBeNull()
  })
})
```

- [ ] **Step 2: Run — expect the new cases to fail**

Run: `npx vitest run tests/lib/social/ranking.test.ts tests/components/feed-list.test.tsx`
Expected: FAIL. `assignRanks` doesn't exist yet, and `FeedList` doesn't accept `aboveList`/`belowList`.

- [ ] **Step 3: Write `assignRanks` and the `FeedList` slots**

Replace `lib/social/ranking.ts` in full:

```ts
export interface LeaderboardEntry {
  id: string
  displayName: string
  balance: number
  rank: number
}

// Input is already sorted by balance desc (SQL does the ordering now); this only assigns
// tied ranks, so it's reused by both a fully in-memory sort (rankMembers) and a SQL-ordered read.
export function assignRanks<T extends { balance: number }>(sorted: T[]): (T & { rank: number })[] {
  const ranked: (T & { rank: number })[] = []
  sorted.forEach((m, index) => {
    const previous = ranked[index - 1]
    const rank = previous && previous.balance === m.balance ? previous.rank : index + 1
    ranked.push({ ...m, rank })
  })
  return ranked
}

export function rankMembers(members: { id: string; displayName: string; balance: number }[]): LeaderboardEntry[] {
  const sorted = [...members].sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName))
  return assignRanks(sorted)
}
```

Replace `app/(app)/feed/feed-list.tsx` in full:

```tsx
import type { ReactNode } from 'react'
import { BookOpen, Flag, Layers, MessageSquareText, Plus, Target, Trophy, type LucideIcon } from 'lucide-react'
import { describeEvent, type FeedEvent, type FeedKind } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import { FeedItem } from '@/components/feed/feed-item'
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
}: {
  events: FeedEvent[]
  heading: string
  headingId: string
  headingHidden?: boolean
  aboveList?: ReactNode
  belowList?: ReactNode
}) {
  const body =
    events.length === 0 ? (
      <EmptyState icon={MessageSquareText} title="Nothing yet." />
    ) : (
      <ul className={cn('flex flex-col divide-y divide-line', headingHidden && 'px-[18px] md:px-6')}>
        {events.map((e) => (
          <FeedItem key={e.id} icon={EVENT_ICONS[e.kind]} segments={describeEvent(e)} age={ageLabel(e.occurredAt)} />
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

- [ ] **Step 4: Run — expect a pass**

Run: `npx vitest run tests/lib/social/ranking.test.ts tests/components/feed-list.test.tsx`
Expected: PASS (15 tests): `ranking.test.ts` 7 (the 3 `rankMembers` cases plus 4 `assignRanks`), `feed-list.test.tsx` 8 (the 5 existing cases plus 3 slot cases).

- [ ] **Step 5: Write the failing/updated DB tests**

Replace `tests/db/social-readers.test.ts` in full:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listFeed } from '@/lib/social/list-feed'
import { getLeaderboard, getMemberStanding } from '@/lib/social/leaderboard'
import { readPageParams, showMoreHref, type PageParams } from '@/lib/pagination/cursor'

const NO_PAGE: PageParams = { top: null, bottom: null }

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
})

describe('listFeed', () => {
  it('returns camel-cased events, newest first', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const { rows, next, windowed } = await listFeed(bobClient, { page: NO_PAGE })
    expect(rows.map((e) => e.kind)).toEqual(['bet_placed', 'market_created'])
    expect(rows[0]).toMatchObject({
      kind: 'bet_placed',
      actorId: bob.id,
      actorName: 'Bob',
      marketId: market.marketId,
      marketTitle: 'Reader market',
      outcomeLabel: 'Yes',
      amount: 7,
      legCount: null,
      taskTitle: null,
    })
    expect(typeof rows[0].occurredAt).toBe('string')
    expect(next).toBeNull()
    expect(windowed).toBe(false)
  })

  it("returns only one member's events when filtered", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const { rows } = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(rows.map((e) => [e.kind, e.actorId])).toEqual([['market_created', alice.id]])
  })

  it('pages an actor with more than 50 events: the first page is 50, and Show more extends the range to all of them', async () => {
    for (let i = 0; i < 51; i++) {
      await createTestMarket(aliceClient, ['Yes', 'No'], { title: `Paging market ${i}` })
    }

    const first = await listFeed(bobClient, { actorId: alice.id, page: NO_PAGE })
    expect(first.rows).toHaveLength(50)
    expect(first.windowed).toBe(false)
    expect(first.next?.kind).toBe('extend')

    // The cursor means "down to and including this row", so the extended range repeats the first
    // 50 and adds the 51st below them.
    const href = new URL(showMoreHref(`/members/${alice.id}`, {}, 'activity', first.next!), 'http://localhost')
    const second = await listFeed(bobClient, {
      actorId: alice.id,
      page: readPageParams(Object.fromEntries(href.searchParams), 'activity'),
    })
    expect(second.rows).toHaveLength(51)
    expect(second.rows.slice(0, 50).map((e) => e.id)).toEqual(first.rows.map((e) => e.id))
    expect(new Set(second.rows.map((e) => e.id)).size).toBe(51)
    expect(second.next).toBeNull()
  })
})

describe('getLeaderboard', () => {
  it('ranks every member by balance, sharing ranks on ties', async () => {
    const carol = await makeMember('Carol')
    const db = serviceClient()
    await db.from('profiles').update({ balance: 150 }).eq('id', alice.id)
    await db.from('profiles').update({ balance: 150 }).eq('id', bob.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', carol.id)

    const board = await getLeaderboard(bobClient)
    expect(board.map((m) => [m.displayName, m.balance, m.rank])).toEqual([
      ['Alice', 150, 1],
      ['Bob', 150, 1],
      ['Carol', 90, 3],
    ])
  })

  it('is empty for an uninvited session', async () => {
    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await getLeaderboard(carolClient)).toEqual([])
  })
})

describe('getMemberStanding', () => {
  it('computes rank from members strictly above, and the total membership', async () => {
    const carol = await makeMember('Carol')
    const db = serviceClient()
    await db.from('profiles').update({ balance: 150 }).eq('id', alice.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', bob.id)
    await db.from('profiles').update({ balance: 90 }).eq('id', carol.id)

    const standing = await getMemberStanding(bobClient, bob.id)
    expect(standing).toMatchObject({ id: bob.id, displayName: 'Bob', balance: 90, rank: 2, memberCount: 3 })
  })

  it('returns null for a well-formed id that matches no profile — the member page’s real 404', async () => {
    expect(await getMemberStanding(bobClient, '00000000-0000-4000-8000-000000000000')).toBeNull()
  })

  it('throws on a malformed id instead of silently matching nothing, which is why the page checks isUuid first', async () => {
    await expect(getMemberStanding(bobClient, 'not-a-uuid')).rejects.toMatchObject({ code: '22P02' })
  })
})
```

- [ ] **Step 6: Run — expect the updated DB tests to fail**

Run (local Supabase running, migration `0033` already applied by Tasks 1–3): `npx vitest run tests/db/social-readers.test.ts`
Expected: FAIL, with 6 failed and 2 passed. The three `listFeed` cases read `.rows` off the old array, and the three `getMemberStanding` cases call a function that doesn't exist yet. The two `getLeaderboard` cases already pass: its shape doesn't change.

- [ ] **Step 7: Write the paged `listFeed` and the SQL-ordered leaderboard**

Replace `lib/social/list-feed.ts` in full:

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
  actor_name: string
  market_id: string | null
  market_title: string | null
  outcome_label: string | null
  amount: number | null
  leg_count: number | null
  task_title: string | null
}

const FEED_COLUMNS = 'id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title'
const FEED_KEY_COLUMNS = { ts: 'occurred_at', id: 'id' }

function toFeedEvent(r: FeedRow): FeedEvent {
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

export async function listFeed(
  supabase: SupabaseClient,
  opts: { actorId?: string; page: PageParams },
): Promise<KeysetPage<FeedEvent>> {
  const fetchRows = async (filter: string | null, limit: number): Promise<FeedRow[]> => {
    let query = supabase
      .from('activity_feed')
      .select(FEED_COLUMNS)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit)
    if (opts.actorId) query = query.eq('actor_id', opts.actorId)
    if (filter) query = query.or(filter)

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as FeedRow[]
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

Replace `lib/social/leaderboard.ts` in full:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { assignRanks, type LeaderboardEntry } from './ranking'

export type MemberStanding = LeaderboardEntry & { memberCount: number }

// The board is sorted in the query, so ranking is one pass over rows already in order. It is
// still unbounded: a few hundred members fit the 10x target without paging.
export async function getLeaderboard(supabase: SupabaseClient): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, balance')
    .order('balance', { ascending: false })
    .order('display_name', { ascending: true })
    .order('id', { ascending: true })
  if (error) throw error

  return assignRanks(
    (data ?? []).map((p) => ({ id: p.id as string, displayName: p.display_name as string, balance: p.balance as number })),
  )
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

- [ ] **Step 8: Run — expect a pass**

Run: `npx vitest run tests/db/social-readers.test.ts`
Expected: PASS, 8 tests (2 existing `listFeed` + 1 new paging case, 2 existing `getLeaderboard`, 3 new `getMemberStanding`).

- [ ] **Step 9: Wire the pages**

Replace `app/(app)/feed/page.tsx` in full:

```tsx
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { readPageParams, showMoreHref, newestHref } from '@/lib/pagination/cursor'
import { Page, PageHeader } from '@/components/ui/page'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
import { FeedList } from './feed-list'

export default async function FeedPage(props: PageProps<'/feed'>) {
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const feed = await listFeed(supabase, { page: readPageParams(searchParams, 'before') })

  return (
    <Page transition="tab">
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
      <FeedList
        events={feed.rows}
        heading="Events"
        headingId="feed-events"
        headingHidden
        aboveList={
          feed.windowed && (
            <div className="px-[18px] pt-3 md:px-6">
              <BackToNewest href={newestHref('/feed', searchParams, 'before')} />
            </div>
          )
        }
        belowList={
          feed.next && (
            <div className="px-[18px] pb-3 md:px-6">
              <ShowMore href={showMoreHref('/feed', searchParams, 'before', feed.next)} />
            </div>
          )
        }
      />
    </Page>
  )
}
```

The description changes from "The 50 newest things that happened in DwellDuel." — no longer
true once the feed pages — to "Everything that’s happened in DwellDuel, newest first." No e2e
asserts either string; this is new copy for sign-off.

Replace `app/(app)/members/[id]/page.tsx` in full:

```tsx
import { Suspense } from 'react'
import { redirect, notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { getMemberStanding } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { readPageParams, showMoreHref, newestHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { Page, h1Class } from '@/components/ui/page'
import { BackLink } from '@/components/ui/back-link'
import { Avatar } from '@/components/ui/avatar'
import { SkeletonScreen } from '@/components/ui/skeleton'
import { ContentReveal } from '@/components/nav/page-transition'
import { FeedListSkeleton } from '@/components/feed/feed-list-skeleton'
import { ShowMore, BackToNewest } from '@/components/ui/show-more'
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

  return (
    <ContentReveal>
      <FeedList
        events={activity.rows}
        heading="Recent activity"
        headingId="recent-activity"
        aboveList={activity.windowed && <BackToNewest href={newestHref(pathname, searchParams, 'activity')} />}
        belowList={activity.next && <ShowMore href={showMoreHref(pathname, searchParams, 'activity', activity.next)} />}
      />
    </ContentReveal>
  )
}
```

`isUuid(id)` is checked straight after the signed-out redirect, before `getMemberStanding`
runs: a malformed id now reaches `.eq('id', …)` inside it, which errors (`22P02`) instead of
matching no rows, so the guard keeps a bad id 404ing instead of 500ing.

- [ ] **Step 10: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 898 tests in 137 files, 42 of them in `tests/db/`. This task adds 11 tests, all in existing files.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: PASS, 26 tests (unchanged: this task adds no e2e spec; see "'Show more' doesn't flash `loading.tsx`" above).

- [ ] **Step 11: Commit**

```
git add lib/social/ranking.ts lib/social/leaderboard.ts lib/social/list-feed.ts \
  'app/(app)/feed/feed-list.tsx' 'app/(app)/feed/page.tsx' 'app/(app)/members/[id]/page.tsx' \
  tests/lib/social/ranking.test.ts tests/components/feed-list.test.tsx tests/db/social-readers.test.ts
git commit -m "$(cat <<'EOF'
Page the feed and member activity, and rank the leaderboard in SQL
EOF
)"
```

---

## Task 7: Error pages and timeouts

Right now an uncaught error anywhere in the app is a blank crash screen, and a hung network call to Supabase waits forever. This task adds three error boundaries sharing one `ErrorCard`, using Next 16.3's stable `retry` prop instead of `reset`, and a `fetch` wrapper that puts a timeout on every server, proxy and browser call to Supabase.

- **`app/(app)/error.tsx`** catches any signed-in page or streamed section. The `(app)` layout renders above it, so the top bar and tab bar stay.
- **`app/error.tsx`** catches the `(app)` layout's own reads and the auth pages. No chrome.
- **`app/global-error.tsx`** catches the root layout. It renders its own `<html>`/`<body>`, follows the OS colour scheme (no `data-theme`, per the Next docs), and sets `<title>` via React's built-in `<title>` component instead of `metadata`, which error boundaries can't export.
- All three render `ErrorCard`, which mirrors `app/(auth)/offline/page.tsx`'s layout: a centred `Card`, an icon chip, the heading, body copy and a "Try again" button that calls `retry()`. Each boundary logs `console.error(error, { digest: error.digest })` in an effect, through a shared `useReportError` hook, so a production failure can be matched to its Vercel log by digest.
- **`lib/supabase/timeout-fetch.ts`** exports `fetchWithTimeout(ms)`, a `fetch` wrapper that aborts after `ms` milliseconds, combined with any caller-supplied `signal`. It's wired as the `global.fetch` option on the server Supabase client (10s), the proxy's Supabase client (10s) and the browser client (15s). Because `supabase-js` passes `global.fetch` to Auth, PostgREST and Storage alike, this covers every kind of Supabase call, including `getClaims()`'s network fallback. A timed-out request now surfaces as a thrown error (into an error boundary) instead of hanging, or as an Auth error that Task 8's `requireUser` turns into `AuthUnavailableError`.

**Copy** (new, for sign-off; curly apostrophe U+2019, as in `app/(auth)/offline/page.tsx`'s "You’re offline"): heading "Something went wrong", body "We couldn’t load this page. Try again in a moment.", button "Try again".

**Files:**
- Create: `lib/supabase/timeout-fetch.ts`
- Modify: `lib/supabase/server.ts` (add the `global.fetch` option)
- Modify: `lib/supabase/client.ts` (add the `global.fetch` option)
- Modify: `proxy.ts` (anchored: add the `global.fetch` option only — Task 8 edits this file again, for `getClaims` and the matcher)
- Create: `components/ui/error-card.tsx`
- Create: `app/(app)/error.tsx`
- Create: `app/error.tsx`
- Create: `app/global-error.tsx`
- Test, create: `tests/lib/supabase/timeout-fetch.test.ts`, `tests/components/error-card.test.tsx`, `tests/components/error-boundaries.test.tsx`

**Interfaces:**
- Consumes:
  - Next 16.3's `retry` prop on `error.js`/`global-error.js` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`): calling it re-fetches and re-renders the boundary's children. Stable since 16.3.0 (`unstable_retry` before that). `global-error` must define its own `<html>`/`<body>`; it doesn't get the app's global styles or a theme attribute, and `metadata`/`generateMetadata` aren't supported there, so a React `<title>` is used instead.
  - `Card`, `Button`, `h1Class` (`components/ui/card.tsx`, `components/ui/button.tsx`, `components/ui/page.tsx`), unchanged.
  - `lucide-react`'s `CircleAlert`.
  - The native `AbortSignal.timeout` and `AbortSignal.any`, used when both are present.
  - `@supabase/ssr`'s `createServerClient`/`createBrowserClient` `options.global.fetch`, forwarded into `supabase-js`'s `ClientOptions.global.fetch` (`node_modules/@supabase/ssr/dist/module/createServerClient.js:22`, `createBrowserClient.js:29`), which `supabase-js` then hands to `AuthClient`, `PostgrestClient` and `StorageClient` alike (`node_modules/@supabase/supabase-js/dist/index.mjs`, the `SupabaseClient` constructor).
- Produces:
  - `lib/supabase/timeout-fetch.ts`:
    ```ts
    export const SERVER_FETCH_TIMEOUT_MS = 10_000
    export const BROWSER_FETCH_TIMEOUT_MS = 15_000
    export function fetchWithTimeout(ms: number): typeof fetch
    ```
  - `components/ui/error-card.tsx`:
    ```ts
    export function useReportError(error: Error & { digest?: string }): void
    export function ErrorCard({ retry }: { retry: () => void }): JSX.Element
    ```
  - `app/(app)/error.tsx`, `app/error.tsx`, `app/global-error.tsx`: default-exported boundary components, each `'use client'`.

- [ ] **Step 1: The fetch timeout wrapper**

Create `tests/lib/supabase/timeout-fetch.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchWithTimeout } from '@/lib/supabase/timeout-fetch'

function pendingFetch() {
  let capturedSignal: AbortSignal | undefined
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    capturedSignal = init?.signal ?? undefined
    return new Promise((_resolve, reject) => {
      capturedSignal?.addEventListener('abort', () => {
        reject(new DOMException('This operation was aborted', 'AbortError'))
      })
    })
  })
  return { fetchMock, getSignal: () => capturedSignal }
}

describe('fetchWithTimeout', () => {
  const realAbortSignalAny = AbortSignal.any
  const realAbortSignalTimeout = AbortSignal.timeout

  afterEach(() => {
    AbortSignal.any = realAbortSignalAny
    AbortSignal.timeout = realAbortSignalTimeout
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('aborts after ms, using the fallback path when AbortSignal.any is missing', async () => {
    // @ts-expect-error -- simulating iOS Safari < 17.4, which has AbortSignal.timeout but not .any
    delete AbortSignal.any
    vi.useFakeTimers()
    const { fetchMock, getSignal } = pendingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    const result = wrapped('https://example.com')
    let settled: 'pending' | 'rejected' = 'pending'
    result.catch(() => {
      settled = 'rejected'
    })

    await vi.advanceTimersByTimeAsync(9_999)
    expect(settled).toBe('pending')
    expect(getSignal()?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    await expect(result).rejects.toThrow()
    expect(getSignal()?.aborted).toBe(true)
  })

  it('forwards a caller abort in the fallback path', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    const { fetchMock, getSignal } = pendingFetch()
    vi.stubGlobal('fetch', fetchMock)

    const callerController = new AbortController()
    const wrapped = fetchWithTimeout(10_000)
    const result = wrapped('https://example.com', { signal: callerController.signal })

    callerController.abort()
    await expect(result).rejects.toThrow()
    expect(getSignal()?.aborted).toBe(true)
  })

  it('clears its timer once the fetch settles, in the fallback path', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    vi.useFakeTimers()
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('ok'))),
    )

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com')

    expect(vi.getTimerCount()).toBe(0)
  })

  it('works without AbortSignal.any, forwarding init options through to fetch', async () => {
    // @ts-expect-error -- forcing the fallback path
    delete AbortSignal.any
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com', { method: 'POST' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [input, init] = fetchMock.mock.calls[0]
    expect(input).toBe('https://example.com')
    expect(init?.method).toBe('POST')
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses AbortSignal.timeout/any directly when both are present, with no caller signal', async () => {
    const fetchMock = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)

    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('combines the timeout with a caller signal via AbortSignal.any when both are present', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response('ok')))
    vi.stubGlobal('fetch', fetchMock)
    const anySpy = vi.spyOn(AbortSignal, 'any')

    const callerController = new AbortController()
    const wrapped = fetchWithTimeout(10_000)
    await wrapped('https://example.com', { signal: callerController.signal })

    expect(anySpy).toHaveBeenCalledWith([expect.any(AbortSignal), callerController.signal])
  })
})
```

Run: `npx vitest run tests/lib/supabase/timeout-fetch.test.ts`
Expected: FAIL — `lib/supabase/timeout-fetch.ts` doesn't exist yet.

Create `lib/supabase/timeout-fetch.ts`:

```ts
export const SERVER_FETCH_TIMEOUT_MS = 10_000
export const BROWSER_FETCH_TIMEOUT_MS = 15_000

// iOS Safari before 17.4 has no AbortSignal.any, so a caller-supplied signal is combined with a
// manual AbortController and a plain setTimeout there instead of composing native signals.
export function fetchWithTimeout(ms: number): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const callerSignal = init?.signal

    if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
      const timeoutSignal = AbortSignal.timeout(ms)
      const signal = callerSignal ? AbortSignal.any([timeoutSignal, callerSignal]) : timeoutSignal
      return fetch(input, { ...init, signal })
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    const onCallerAbort = () => controller.abort()
    callerSignal?.addEventListener('abort', onCallerAbort)

    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(timer)
      callerSignal?.removeEventListener('abort', onCallerAbort)
    })
  }) as typeof fetch
}
```

Run: `npx vitest run tests/lib/supabase/timeout-fetch.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 2: Wire the timeout into the server, proxy and browser Supabase clients**

Replace `lib/supabase/server.ts` in full. The only changes are the `timeout-fetch` import and the `global` option beside `cookies`:

```ts
import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

/**
 * `cache()`-wrapped so every Server Component/Action in a single request
 * that calls this shares one client instance instead of each constructing
 * its own. Safe across requests, not just within one: `cache()` here is
 * React's Server Components primitive, which Next.js resets per incoming
 * request -- it is not a module-level singleton that would persist across
 * requests on a warm serverless instance.
 */
export const serverClient = cache(async () => {
  const store = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options))
          } catch {
            // Called from a Server Component; middleware refreshes the session instead.
          }
        },
      },
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
    },
  )
})
```

Replace `lib/supabase/client.ts` in full:

```ts
import { createBrowserClient } from '@supabase/ssr'
import { fetchWithTimeout, BROWSER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

export function browserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { fetch: fetchWithTimeout(BROWSER_FETCH_TIMEOUT_MS) } },
  )
}
```

In `proxy.ts`, replace:

```ts
import { isAppPath } from '@/lib/auth/app-paths'
```

with:

```ts
import { isAppPath } from '@/lib/auth/app-paths'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'
```

and replace the end of the `createServerClient(...)` options:

```ts
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
```

with:

```ts
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
    },
  )
```

Nothing else in `proxy.ts` changes in this task — the `supabase.auth.getUser()` call, the redirect and the matcher are Task 8's.

There is no dedicated test for this wiring: neither `server.ts`, `client.ts` nor `proxy.ts` has a unit test today, and `timeout-fetch.test.ts` already covers `fetchWithTimeout` itself. `tsc` catches a wiring mistake (a wrong import path or option shape).

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: `ErrorCard` and `useReportError`**

Create `tests/components/error-card.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorCard } from '@/components/ui/error-card'

describe('ErrorCard', () => {
  it('shows the heading and body copy, and a 44px button that calls retry', async () => {
    const retry = vi.fn()
    render(<ErrorCard retry={retry} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByText('We couldn’t load this page. Try again in a moment.')).toBeInTheDocument()

    const button = screen.getByRole('button', { name: 'Try again' })
    expect(button).toHaveClass('min-h-12')

    await userEvent.click(button)
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
```

Run: `npx vitest run tests/components/error-card.test.tsx`
Expected: FAIL — `components/ui/error-card.tsx` doesn't exist yet.

Create `components/ui/error-card.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { CircleAlert } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { h1Class } from '@/components/ui/page'

// Matches the digest to the corresponding server-side log, per the Next.js error.js docs.
export function useReportError(error: Error & { digest?: string }): void {
  useEffect(() => {
    console.error(error, { digest: error.digest })
  }, [error])
}

export function ErrorCard({ retry }: { retry: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-10 md:px-20">
      <Card padded={false} className="flex w-full max-w-[440px] flex-col items-start gap-4 p-7 md:p-10">
        <span aria-hidden="true" className="flex size-12 items-center justify-center rounded-full bg-loss-soft text-loss">
          <CircleAlert className="size-6" />
        </span>
        <h1 className={h1Class}>Something went wrong</h1>
        <p className="text-ink2">We couldn’t load this page. Try again in a moment.</p>
        <Button block className="md:w-auto" onClick={retry}>
          Try again
        </Button>
      </Card>
    </div>
  )
}
```

Run: `npx vitest run tests/components/error-card.test.tsx`
Expected: PASS (1 test)

- [ ] **Step 4: The three boundaries**

Create `tests/components/error-boundaries.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import AppSegmentError from '@/app/(app)/error'
import RootSegmentError from '@/app/error'
import GlobalError from '@/app/global-error'

function testError(): Error & { digest?: string } {
  const error = new Error('boom') as Error & { digest?: string }
  error.digest = 'digest-123'
  return error
}

describe.each([
  ['app/(app)/error.tsx', AppSegmentError],
  ['app/error.tsx', RootSegmentError],
])('%s', (_name, Boundary) => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders the error card and logs the error with its digest', () => {
    const retry = vi.fn()
    const error = testError()
    render(<Boundary error={error} retry={retry} />)

    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
  })
})

describe('app/global-error.tsx', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders its own html/body, a title, the error card, and logs the error with its digest', () => {
    const retry = vi.fn()
    const error = testError()
    render(<GlobalError error={error} retry={retry} />)

    expect(document.title).toBe('Something went wrong')
    expect(screen.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith(error, { digest: 'digest-123' })
  })
})
```

Run: `npx vitest run tests/components/error-boundaries.test.tsx`
Expected: FAIL — none of `app/(app)/error.tsx`, `app/error.tsx`, `app/global-error.tsx` exist yet.

Create `app/(app)/error.tsx`:

```tsx
'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return <ErrorCard retry={retry} />
}
```

Create `app/error.tsx` (identical body — it catches the `(app)` layout's own reads and the auth pages, with no chrome above it):

```tsx
'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'

export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return <ErrorCard retry={retry} />
}
```

Create `app/global-error.tsx`:

```tsx
'use client'

import { ErrorCard, useReportError } from '@/components/ui/error-card'
import './globals.css'

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useReportError(error)
  return (
    <html lang="en">
      <body className="flex min-h-full flex-col">
        <title>Something went wrong</title>
        <ErrorCard retry={retry} />
      </body>
    </html>
  )
}
```

Run: `npx vitest run tests/components/error-boundaries.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 908 tests in 140 files. This task adds 10 tests in 3 files.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed (unchanged from Task 6 — this task adds no e2e spec; the error pages are covered in jsdom, per the spec's Testing section)

- [ ] **Step 6: Commit**

```bash
git add lib/supabase/timeout-fetch.ts lib/supabase/server.ts lib/supabase/client.ts proxy.ts components/ui/error-card.tsx "app/(app)/error.tsx" app/error.tsx app/global-error.tsx tests/lib/supabase/timeout-fetch.test.ts tests/components/error-card.test.tsx tests/components/error-boundaries.test.tsx
git commit -m "$(cat <<'EOF'
Add error boundaries and a Supabase fetch timeout
EOF
)"
```

---

## Task 8: Auth stops treating an outage as signed out

Today `requireUser` calls `supabase.auth.getUser()` and treats any failure — a dead network, a 5xx from Auth, a timeout — the same as "no session": the caller sees `user: null` and (via the proxy) gets redirected to `/sign-in`. A member with a perfectly live session can get bounced mid-outage. This task tells the two apart:

- **`requireUser`** switches to `supabase.auth.getClaims()`, which verifies the JWT locally against a cached JWKS when the project uses asymmetric signing keys (no Auth round trip), and otherwise falls back to `getUser()` — the same cost as today. No session still returns `user: null`. A genuinely "signed out" error (a revoked or unknown refresh token, a bad JWT) also returns `user: null`. Only an *unavailable* Auth (network, timeout, 5xx, or an unrecognised failure) throws `AuthUnavailableError`, which Task 7's `app/error.tsx` / `app/(app)/error.tsx` boundaries catch. `requireUser` now returns `user: { id, email? }` built from the JWT claims, not Supabase's `User` — every existing caller reads only `user.id`, so nothing else changes.
- **`isAdmin`** now throws on an RPC error instead of returning `false`. Before this, a network blip during the admin check silently redirected an admin to Home; now it surfaces as an error like everything else.
- **The proxy** makes the same switch: `getClaims()` instead of `getUser()`. When Auth is unavailable, the proxy passes the request straight through with no redirect, so the page's own `requireUser()` is the one that throws into the error boundary. The genuinely-signed-out 307 is unchanged. `api/cron` is added to the matcher's negative lookahead, so the keep-alive cron job (which carries its own secret, not a session) never pays for an Auth round trip it doesn't need.

This task touches no SQL and changes no e2e assertion: the signed-out 307 (`e2e/signed-out.spec.ts`) and the market-engine resolve flow are both untouched, and "Auth is unavailable" is exercised only in jsdom (there's no way to make local Supabase's Auth server flake on demand from Playwright).

**Files:**
- Create: `lib/auth/auth-unavailable.ts`
- Modify (rewrite): `lib/auth/require-user.ts`
- Modify (rewrite): `lib/auth/is-admin.ts`
- Modify: `proxy.ts` (anchored: `getClaims`, no-redirect-on-unavailable, and the matcher's `api/cron` exclusion — on top of Task 7's `global.fetch` edit)
- Modify: `tests/lib/offline/proxy-matcher.test.ts` (anchored: add `['/api/cron/keep-alive', false]`)
- Test, create: `tests/lib/auth/require-user.test.ts`, `tests/lib/auth/is-admin.test.ts`, `tests/lib/auth/proxy.test.ts`

**Interfaces:**
- Consumes:
  - `getClaims()` (`node_modules/@supabase/auth-js/dist/module/GoTrueClient.js:5507`): with no `jwt` argument it calls `getSession()` first. No session returns `{ data: null, error: null }` (not an error). A failed refresh or Auth call returns `{ data: null, error }`. An HS256-signed project (no asymmetric keys) or an environment without WebCrypto falls back to `getUser(token)` — a network call, the same cost as today.
  - `handleError` (`node_modules/@supabase/auth-js/dist/module/lib/fetch.js`): a fetch that never reached a response (network failure, abort/timeout) or a 5xx/Cloudflare-52x response becomes `AuthRetryableFetchError` (status 0 or the 5xx code); any other non-2xx becomes `AuthApiError`; a `session_not_found` error code becomes `AuthSessionMissingError`.
  - `isAuthError`, `isAuthRetryableFetchError` (`node_modules/@supabase/auth-js/dist/module/lib/errors.js`, re-exported by `@supabase/supabase-js`'s `index.mjs` via `export * from "@supabase/auth-js"`). `isAuthError` is a type predicate to `AuthError`, which has `status: number | undefined` and `name: string` fields — no cast needed to read `error.status`/`error.name` after the guard.
  - `serverClient` (`lib/supabase/server.ts`, Task 7's timeout-wired version) and `isAppPath` (`lib/auth/app-paths.ts`), unchanged.
- Produces:
  - `lib/auth/auth-unavailable.ts`:
    ```ts
    export class AuthUnavailableError extends Error { constructor(options?: { cause?: unknown }) } // name = 'AuthUnavailableError', message 'Auth is unavailable'
    export function isAuthUnavailable(error: unknown): boolean
    ```
  - `lib/auth/require-user.ts`:
    ```ts
    export type SessionUser = { id: string; email?: string }
    export const requireUser: () => Promise<{ supabase: Awaited<ReturnType<typeof serverClient>>; user: SessionUser | null }>
    ```
  - `lib/auth/is-admin.ts`:
    ```ts
    export const isAdmin: (supabase: SupabaseClient) => Promise<boolean>
    ```
  - `proxy.ts`: same `proxy(request)` and `config.matcher` shape, behaviour changed as described above.

- [ ] **Step 1: `requireUser` and `AuthUnavailableError`**

Create `tests/lib/auth/require-user.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthApiError, AuthInvalidJwtError, AuthRetryableFetchError, AuthSessionMissingError, AuthUnknownError } from '@supabase/supabase-js'

const { getClaims, supabase } = vi.hoisted(() => {
  const getClaims = vi.fn()
  return { getClaims, supabase: { auth: { getClaims } } }
})
vi.mock('@/lib/supabase/server', () => ({ serverClient: async () => supabase }))

import { requireUser } from '@/lib/auth/require-user'
import { AuthUnavailableError } from '@/lib/auth/auth-unavailable'

beforeEach(() => {
  getClaims.mockReset()
})

describe('requireUser', () => {
  it('builds a user from the claims', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1', email: 'a@example.com' } }, error: null })

    const { user, supabase: returnedClient } = await requireUser()

    expect(user).toEqual({ id: 'member-1', email: 'a@example.com' })
    expect(returnedClient).toBe(supabase)
  })

  it('returns a null user with no email claim', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1' } }, error: null })
    const { user } = await requireUser()
    expect(user).toEqual({ id: 'member-1', email: undefined })
  })

  it('returns a null user with no session', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for a session-missing error', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthSessionMissingError() })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for a 4xx auth api error (a revoked or unknown refresh token)', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthApiError('invalid_grant', 400, 'refresh_token_not_found') })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('returns a null user for an invalid JWT', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthInvalidJwtError('bad jwt') })
    const { user } = await requireUser()
    expect(user).toBeNull()
  })

  it('throws AuthUnavailableError for a retryable fetch error (network, timeout, 5xx)', async () => {
    const cause = new AuthRetryableFetchError('network down', 0)
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toMatchObject({ name: 'AuthUnavailableError', cause })
  })

  it('throws AuthUnavailableError for a 5xx auth api error', async () => {
    const cause = new AuthApiError('server error', 500, undefined)
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
  })

  it('throws AuthUnavailableError for an unknown auth error', async () => {
    const cause = new AuthUnknownError('mystery', new Error('inner'))
    getClaims.mockResolvedValue({ data: null, error: cause })
    await expect(requireUser()).rejects.toBeInstanceOf(AuthUnavailableError)
  })
})
```

Run: `npx vitest run tests/lib/auth/require-user.test.ts`
Expected: FAIL — `@/lib/auth/auth-unavailable` doesn't exist, and the current `require-user.ts` calls `getUser()`, not `getClaims()`, so the mocked `getClaims` is never invoked.

Create `lib/auth/auth-unavailable.ts`:

```ts
import { isAuthError, isAuthRetryableFetchError } from '@supabase/supabase-js'

export class AuthUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('Auth is unavailable', options)
    this.name = 'AuthUnavailableError'
  }
}

// "Unavailable" is network trouble, a timeout, a 5xx or an unknown failure -- Auth itself is
// having a bad time, so a member with a live session shouldn't be treated as signed out.
// Everything else (no session, a revoked or unknown refresh token, a bad JWT) is "signed out".
export function isAuthUnavailable(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true
  if (!isAuthError(error)) return false
  if (typeof error.status === 'number' && error.status >= 500) return true
  return error.name === 'AuthUnknownError'
}
```

Replace `lib/auth/require-user.ts` in full:

```ts
import { cache } from 'react'
import { serverClient } from '@/lib/supabase/server'
import { AuthUnavailableError, isAuthUnavailable } from '@/lib/auth/auth-unavailable'

export type SessionUser = { id: string; email?: string }

export const requireUser = cache(async (): Promise<{
  supabase: Awaited<ReturnType<typeof serverClient>>
  user: SessionUser | null
}> => {
  const supabase = await serverClient()
  const { data, error } = await supabase.auth.getClaims()
  if (error) {
    if (isAuthUnavailable(error)) throw new AuthUnavailableError({ cause: error })
    return { supabase, user: null }
  }
  if (!data) return { supabase, user: null }
  return { supabase, user: { id: data.claims.sub, email: data.claims.email } }
})
```

Run: `npx vitest run tests/lib/auth/require-user.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 2: `isAdmin` throws**

Create `tests/lib/auth/is-admin.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isAdmin } from '@/lib/auth/is-admin'
import type { SupabaseClient } from '@supabase/supabase-js'

function client(result: { data: unknown; error: unknown }) {
  return { rpc: async () => result } as unknown as SupabaseClient
}

describe('isAdmin', () => {
  it('is true when the RPC returns true', async () => {
    await expect(isAdmin(client({ data: true, error: null }))).resolves.toBe(true)
  })

  it('is false when the RPC returns false', async () => {
    await expect(isAdmin(client({ data: false, error: null }))).resolves.toBe(false)
  })

  it('throws on an RPC error, instead of silently returning false', async () => {
    const error = new Error('connection reset')
    await expect(isAdmin(client({ data: null, error }))).rejects.toBe(error)
  })
})
```

Run: `npx vitest run tests/lib/auth/is-admin.test.ts`
Expected: FAIL — the current `isAdmin` returns `data === true` unconditionally, so the error case resolves to `false` instead of rejecting.

Replace `lib/auth/is-admin.ts` in full:

```ts
import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

export const isAdmin = cache(async (supabase: SupabaseClient): Promise<boolean> => {
  const { data, error } = await supabase.rpc('is_admin')
  if (error) throw error
  return data === true
})
```

Run: `npx vitest run tests/lib/auth/is-admin.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: The proxy**

Create `tests/lib/auth/proxy.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { AuthRetryableFetchError } from '@supabase/supabase-js'

const { getClaims, createServerClient } = vi.hoisted(() => {
  const getClaims = vi.fn()
  const createServerClient = vi.fn(() => ({ auth: { getClaims } }))
  return { getClaims, createServerClient }
})
vi.mock('@supabase/ssr', () => ({ createServerClient }))

import { proxy } from '@/proxy'

function request(pathname: string, init?: { method?: string }) {
  return new NextRequest(new URL(pathname, 'https://dwellduel.example'), init)
}

beforeEach(() => {
  getClaims.mockReset()
  createServerClient.mockClear()
})

describe('proxy', () => {
  it('redirects a signed-out GET of an app path to /sign-in', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets'))

    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/sign-in')
  })

  it('does not redirect a signed-in GET of an app path', async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: 'member-1' } }, error: null })

    const response = await proxy(request('/markets'))

    expect(response.status).not.toBe(307)
  })

  it('passes the request through with no redirect when Auth is unavailable, even under an app path', async () => {
    getClaims.mockResolvedValue({ data: null, error: new AuthRetryableFetchError('network down', 0) })

    const response = await proxy(request('/markets'))

    expect(response.status).not.toBe(307)
    expect(response.headers.get('location')).toBeNull()
  })

  it('does not redirect a signed-out server action POST', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/markets', { method: 'POST' }))

    expect(response.status).not.toBe(307)
  })

  it('does not redirect a path outside the app sections', async () => {
    getClaims.mockResolvedValue({ data: null, error: null })

    const response = await proxy(request('/sign-in'))

    expect(response.status).not.toBe(307)
  })
})
```

Run: `npx vitest run tests/lib/auth/proxy.test.ts`
Expected: FAIL — the current `proxy.ts` calls `supabase.auth.getUser()`, so the mocked `getClaims` is never invoked and every response falls through as if signed in.

In `proxy.ts` (as Task 7 left it), replace:

```ts
import { isAppPath } from '@/lib/auth/app-paths'
```

with:

```ts
import { isAppPath } from '@/lib/auth/app-paths'
import { isAuthUnavailable } from '@/lib/auth/auth-unavailable'
```

Replace:

```ts
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!user && isPageLoad && isAppPath(request.nextUrl.pathname)) {
```

with:

```ts
  const { data, error } = await supabase.auth.getClaims()
  // Auth itself is unavailable (network, timeout, 5xx): pass the request through unredirected,
  // so the page's own requireUser() throws into the error boundary instead of bouncing a member
  // with a live session to sign-in.
  if (error && isAuthUnavailable(error)) return response

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!data && isPageLoad && isAppPath(request.nextUrl.pathname)) {
```

Replace the matcher's pattern:

```ts
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|offline$|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
```

with this, adding `api/cron` to the negative lookahead:

```ts
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|offline$|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
```

The full file is now:

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { isAppPath } from '@/lib/auth/app-paths'
import { isAuthUnavailable } from '@/lib/auth/auth-unavailable'
import { fetchWithTimeout, SERVER_FETCH_TIMEOUT_MS } from '@/lib/supabase/timeout-fetch'

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
      global: { fetch: fetchWithTimeout(SERVER_FETCH_TIMEOUT_MS) },
    },
  )

  const { data, error } = await supabase.auth.getClaims()
  // Auth itself is unavailable (network, timeout, 5xx): pass the request through unredirected,
  // so the page's own requireUser() throws into the error boundary instead of bouncing a member
  // with a live session to sign-in.
  if (error && isAuthUnavailable(error)) return response

  // A page's own redirect('/sign-in') runs after its loading skeleton has streamed, so the
  // browser gets a 200 and a client-side hop. Redirecting here keeps it a real 307. Only
  // page loads: a server action posted without a session still reaches its own check.
  const isPageLoad = request.method === 'GET' || request.method === 'HEAD'
  if (!data && isPageLoad && isAppPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/sign-in'
    url.search = ''
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest\\.webmanifest$|sw\\.js$|offline$|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

In `tests/lib/offline/proxy-matcher.test.ts`, add a case for the cron route, which must now be excluded. Replace:

```ts
    ['/offline-report', true],
    ['/sw.js', false],
```

with:

```ts
    ['/offline-report', true],
    ['/api/cron/keep-alive', false],
    ['/sw.js', false],
```

Run: `npx vitest run tests/lib/auth/proxy.test.ts tests/lib/offline/proxy-matcher.test.ts`
Expected: PASS (5 + 12 = 17 tests)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 926 tests in 143 files. This task adds 18 tests: 17 in 3 new files, and 1 in `proxy-matcher.test.ts`.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed (unchanged from Task 7 — the signed-out 307 and the market-engine resolve flow keep their existing assertions; "Auth is unavailable" has no e2e coverage, since there's no way to make local Supabase's Auth server return a 5xx on demand from Playwright)

- [ ] **Step 5: Commit**

```bash
git add lib/auth/auth-unavailable.ts lib/auth/require-user.ts lib/auth/is-admin.ts proxy.ts tests/lib/offline/proxy-matcher.test.ts tests/lib/auth/require-user.test.ts tests/lib/auth/is-admin.test.ts tests/lib/auth/proxy.test.ts
git commit -m "$(cat <<'EOF'
Stop treating an Auth outage as signed out
EOF
)"
```

---

## Task 9: Parallel reads

Reads that don't depend on each other run together. `getMarket` becomes one joined read instead of two round trips (the resolution comes through the same embed Task 5 already uses for the markets list). The `(app)` layout, the market detail page, Home, `/parlays`, `/tasks` and `/admin/tasks` each batch their independent reads with `Promise.all`, cutting each page from a short serial chain to one round trip (plus whatever must genuinely wait on something earlier, like `getCurrentPeriodKeys` waiting on the task list it reads periods from).

No behaviour changes: every batch is reads that were already independent, just issued serially. `getMarket`'s return shape, `MarketDetail`, is untouched, and `get-market.test.ts` (`tests/db/`) stays green unmodified.

**Files:**
- Modify: `lib/markets/get-market.ts` (the `getMarket` function only -- Task 5 owns `getMarketBets` in the same file; this task never touches it)
- Modify: `app/(app)/layout.tsx`
- Modify: `app/(app)/markets/[id]/page.tsx` (anchored against the state Task 5 leaves it in)
- Modify: `app/(app)/(home)/page.tsx` (anchored against the state Task 5 leaves it in)
- Modify: `app/(app)/parlays/page.tsx`
- Modify: `app/(app)/tasks/page.tsx`
- Modify: `app/(app)/admin/tasks/page.tsx`
- Test, create: `tests/lib/markets/get-market.test.ts`

**Interfaces:**
- Consumes (all unchanged): `getMarketBets`, `getChartBets`, `isAdmin`, `readSlip`, `getSlipView` (`lib/markets/get-market.ts`, `lib/markets/chart-bets.ts`, `lib/auth/is-admin.ts`, `lib/parlays/slip.ts`, `lib/parlays/get-slip.ts`); `countOpenMarkets`, `getLeaderboard`, `listMyTaskCompletions`, `listPendingTaskCompletions` (`lib/markets/list-markets.ts`, `lib/social/leaderboard.ts`, `lib/tasks/list-task-completions.ts`); `listMyParlays` (`lib/parlays/list-parlays.ts`); `listTasks`, `getCurrentPeriodKeys` (`lib/tasks/list-tasks.ts`, `lib/tasks/period-keys.ts`).
- Produces:
  ```ts
  // lib/markets/get-market.ts -- same signature and MarketDetail, one request using the embed
  export async function getMarket(supabase: SupabaseClient, marketId: string): Promise<MarketDetail | null>
  ```
  Nothing else changes shape: every page keeps the same local variable names (`admin`, `slip`, `betsPage`, `chartBets`, `board`, `myCompletions`, `pendingApprovals`, `tasks`, `pending`, `parlays`), just built from a `Promise.all` instead of a chain of `await`s.

**Why `getMarket` can drop its second query.** `markets.current_resolution_id` is a foreign key straight onto `market_resolutions`, so an embed named off that constraint (`current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)`) is a to-one relationship: PostgREST hands back one object, or `null` when `current_resolution_id` is null -- never an array. This is the exact embed Task 5 already introduced for `listOpenMarkets` / `listClosedMarkets`, checked there against local PostgREST; confirmed again here with an unauthenticated `GET .../markets?select=...&limit=1` against the local instance, which returns `200 []` (no rows to resolve yet, but the query itself is accepted, proving the embed name and syntax are valid against the schema).

- [ ] **Step 1: Write the failing test for `getMarket`'s single round trip**

Create `tests/lib/markets/get-market.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getMarket } from '@/lib/markets/get-market'

function chainableBuilder(result: { data: unknown; error: null }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {}
  builder.eq = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.maybeSingle = vi.fn(async () => result)
  return builder
}

describe('getMarket', () => {
  it('issues exactly one from() call, reading the resolution through the embed', async () => {
    const row = {
      id: 'market-1',
      title: 'Will it rain?',
      description: null,
      kind: 'binary',
      status: 'resolved',
      close_at: '2026-01-01T00:00:00Z',
      created_by: 'member-1',
      current_resolution_id: 'resolution-1',
      creator: { display_name: 'Alice' },
      market_outcomes: [
        { id: 'outcome-yes', label: 'Yes', pool_total: 40 },
        { id: 'outcome-no', label: 'No', pool_total: 10 },
      ],
      current_resolution: { outcome_id: 'outcome-yes', resolved_at: '2026-01-02T00:00:00Z' },
    }
    const select = vi.fn((_query: string) => chainableBuilder({ data: row, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'market-1')

    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('markets')
    expect(select).toHaveBeenCalledTimes(1)
    expect(select.mock.calls[0][0]).toContain(
      'current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)',
    )
    expect(market?.resolvedOutcomeLabel).toBe('Yes')
    expect(market?.resolvedAt).toBe('2026-01-02T00:00:00Z')
    expect(market?.creatorName).toBe('Alice')
  })

  it('has no resolution time when the market has never been resolved', async () => {
    const row = {
      id: 'market-2',
      title: 'Open market',
      description: null,
      kind: 'binary',
      status: 'open',
      close_at: '2026-01-01T00:00:00Z',
      created_by: 'member-1',
      current_resolution_id: null,
      creator: { display_name: 'Alice' },
      market_outcomes: [{ id: 'outcome-yes', label: 'Yes', pool_total: 0 }],
      current_resolution: null,
    }
    const select = vi.fn(() => chainableBuilder({ data: row, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'market-2')

    expect(from).toHaveBeenCalledTimes(1)
    expect(market?.resolvedOutcomeLabel).toBeNull()
    expect(market?.resolvedAt).toBeNull()
  })

  it('returns null, with no query at all beyond the one lookup, when the market is missing', async () => {
    const select = vi.fn(() => chainableBuilder({ data: null, error: null }))
    const from = vi.fn(() => ({ select }))
    const supabase = { from } as unknown as SupabaseClient

    const market = await getMarket(supabase, 'missing')

    expect(from).toHaveBeenCalledTimes(1)
    expect(market).toBeNull()
  })
})
```

Run: `npx vitest run tests/lib/markets/get-market.test.ts`
Expected: FAIL, with 1 failed and 2 passed. Today's `getMarket` calls `.from()` a second time for a resolved market (its `market_resolutions` lookup), so the first case's `toHaveBeenCalledTimes(1)` fails. A never-resolved market and a missing one already make a single call.

- [ ] **Step 2: Rewrite `getMarket` as one joined read**

In `lib/markets/get-market.ts`, change only `getMarket` (`MarketDetail`, `MarketBet` and `getMarketBets` stay exactly as they are). Add the embed to its select. Replace:

```ts
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, creator:profiles(display_name), market_outcomes(id, label, pool_total)',
```

with:

```ts
      'id, title, description, kind, status, close_at, created_by, current_resolution_id, creator:profiles(display_name), market_outcomes(id, label, pool_total), current_resolution:market_resolutions!markets_current_resolution_id_fkey(outcome_id, resolved_at)',
```

Then replace the second round trip:

```ts
  let resolvedOutcomeLabel: string | null = null
  let resolvedAt: string | null = null
  if (data.current_resolution_id) {
    const { data: resolution, error: resolutionErr } = await supabase
      .from('market_resolutions')
      .select('outcome_id, resolved_at')
      .eq('id', data.current_resolution_id)
      .single()
    if (resolutionErr) throw resolutionErr
    resolvedOutcomeLabel = outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null
    resolvedAt = resolution.resolved_at
  }
```

with a read of the embedded row:

```ts
  // The embed above replaces a second round trip to market_resolutions: current_resolution_id
  // is a to-one foreign key on markets itself, so PostgREST hands back one object (or null),
  // never an array.
  const resolution = data.current_resolution as unknown as { outcome_id: string; resolved_at: string } | null
  const resolvedOutcomeLabel = resolution ? (outcomes.find((o) => o.id === resolution.outcome_id)?.label ?? null) : null
  const resolvedAt = resolution?.resolved_at ?? null
```

The rest of the function, including the returned object, is unchanged.

Run: `npx vitest run tests/lib/markets/get-market.test.ts`
Expected: PASS (3 tests).

Run: `npx vitest run tests/db/get-market.test.ts`
Expected: PASS, unchanged -- this file is not touched; `MarketDetail`'s shape and every field it asserts on are identical.

- [ ] **Step 3: Batch the `(app)` layout's reads**

In `app/(app)/layout.tsx`, replace:

```tsx
  const { data: profile, error } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
  if (error) throw error
  if (!profile) return children

  const [admin, slip] = await Promise.all([isAdmin(supabase), readSlip()])
```

with:

```tsx
  const [{ data: profile, error }, admin, slip] = await Promise.all([
    supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle(),
    isAdmin(supabase),
    readSlip(),
  ])
  if (error) throw error
  if (!profile) return children
```

Nothing else in the file changes (Task 10 wraps the returned tree in `LiveTablesProvider` afterwards; the `SignedInLayout` signature and its `if (!user) return children` guard are untouched).

- [ ] **Step 4: Batch market detail's bets, chart, admin and slip reads**

Task 5 leaves `app/(app)/markets/[id]/page.tsx`'s reads, straight after `if (!market) notFound()`, as:

```tsx
  const [betsPage, chartBets] = await Promise.all([
    getMarketBets(supabase, id, readPageParams(searchParams, 'bets')),
    getChartBets(supabase, id),
  ])
  const admin = await isAdmin(supabase)
```

Replace that batch and the `const admin` line after it with one batch:

```tsx
  const [betsPage, chartBets, admin, { slip, slipView }] = await Promise.all([
    getMarketBets(supabase, id, readPageParams(searchParams, 'bets')),
    getChartBets(supabase, id),
    isAdmin(supabase),
    readSlip().then(async (slip) => ({ slip, slipView: await getSlipView(supabase, slip) })),
  ])
```

and delete the two slip reads further down, which the batch now makes:

```tsx
  const slip = await readSlip()
  const slipView = await getSlipView(supabase, slip)
```

Every later line in the file keeps reading `betsPage`, `chartBets`, `admin`, `slip` and `slipView` exactly as before -- only how they're produced changes. (`readSlip().then(...)` keeps the slip's own dependent read, `getSlipView`, inside the same `Promise.all` entry as a nested chain, so it still runs in parallel with the other three.)

- [ ] **Step 5: Batch Home's pending-approvals read into its main batch**

Task 5 leaves `app/(app)/(home)/page.tsx`'s read region as:

```tsx
  const [admin, slip, openMarketCount, board, myCompletions] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    countOpenMarkets(supabase),
    getLeaderboard(supabase),
    listMyTaskCompletions(supabase, user.id),
  ])
  const pendingApprovals = admin ? await listPendingTaskCompletions(supabase) : []

  const me = board.find((m) => m.id === user.id)
```

Replace it with:

```tsx
  const [admin, slip, openMarketCount, board, myCompletions, pendingApprovals] = await Promise.all([
    isAdmin(supabase),
    readSlip(),
    countOpenMarkets(supabase),
    getLeaderboard(supabase),
    listMyTaskCompletions(supabase, user.id),
    isAdmin(supabase).then((a) => (a ? listPendingTaskCompletions(supabase) : [])),
  ])

  const me = board.find((m) => m.id === user.id)
```

`isAdmin` is `cache()`d (`lib/auth/is-admin.ts`), so the second call in this same `Promise.all` is still one RPC round trip, not two -- React's `cache()` memoises by argument identity within one request, and `supabase` is the same client both times.

- [ ] **Step 6: Batch `/parlays`' slip and parlays reads**

In `app/(app)/parlays/page.tsx`, replace:

```tsx
  const slip = await getSlipView(supabase, await readSlip())
  const parlays = await listMyParlays(supabase, user.id)
```

with:

```tsx
  const [outcomeIds, parlays] = await Promise.all([readSlip(), listMyParlays(supabase, user.id)])
  const slip = await getSlipView(supabase, outcomeIds)
```

(`getSlipView` depends on the cookie-read outcome ids, so it can't join the same `Promise.all` entry as `readSlip` itself -- but it now runs concurrently with `listMyParlays` instead of after it.)

- [ ] **Step 7: Batch `/tasks`' task list and completions reads**

In `app/(app)/tasks/page.tsx`, replace:

```tsx
  const allTasks = await listTasks(supabase)
  const activeTasks = allTasks.filter((t) => t.isActive)
  const myCompletions = await listMyTaskCompletions(supabase, user.id)
  const currentPeriodKeys = await getCurrentPeriodKeys(
```

with:

```tsx
  const [allTasks, myCompletions] = await Promise.all([listTasks(supabase), listMyTaskCompletions(supabase, user.id)])
  const activeTasks = allTasks.filter((t) => t.isActive)
  const currentPeriodKeys = await getCurrentPeriodKeys(
```

(`getCurrentPeriodKeys` reads `activeTasks.map((t) => t.period)`, so it still has to wait on `allTasks`; only `myCompletions` was independent, and it now runs alongside `listTasks` instead of after it.)

- [ ] **Step 8: Batch `/admin/tasks`' task catalog and pending reads**

In `app/(app)/admin/tasks/page.tsx`, replace:

```tsx
  const tasks = await listTasks(supabase)
  // Ages are worked out here, on the server, so the client-rendered list hydrates with the same text.
  const pending = (await listPendingTaskCompletions(supabase)).map((c) => ({ ...c, submittedAge: ageLabel(c.submittedAt) }))
```

with:

```tsx
  const [tasks, pendingRaw] = await Promise.all([listTasks(supabase), listPendingTaskCompletions(supabase)])
  // Ages are worked out here, on the server, so the client-rendered list hydrates with the same text.
  const pending = pendingRaw.map((c) => ({ ...c, submittedAge: ageLabel(c.submittedAt) }))
```

The admin check above this (`if (!(await isAdmin(supabase))) redirect('/')`) stays a plain `await`: it gates whether the rest of the function runs at all, so it can't join the batch.

- [ ] **Step 9: Verify**

There are no page-level unit tests of async server components (AGENTS.md), so Steps 3–8 have no test of their own beyond compiling and the existing suites staying green -- the functions they call are unchanged, and every existing test of them (`tests/db/`, `tests/lib/`) is unaffected.

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 929 tests in 144 files. This task adds 3 tests in 1 file.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed (unchanged from Task 8 -- this task adds no UI-visible behaviour, only fewer round trips).

- [ ] **Step 10: Commit**

```bash
git add lib/markets/get-market.ts "app/(app)/layout.tsx" "app/(app)/markets/[id]/page.tsx" \
  "app/(app)/(home)/page.tsx" "app/(app)/parlays/page.tsx" "app/(app)/tasks/page.tsx" \
  "app/(app)/admin/tasks/page.tsx" tests/lib/markets/get-market.test.ts
git commit -m "$(cat <<'EOF'
Run independent reads in parallel, and join getMarket's resolution lookup
EOF
)"
```

---

## Task 10: Per-page live updates

Every page currently listens to every published table through one shared channel (`LIVE_TABLES` in `components/live/live-refresh.tsx`, from PR B). That means a bet on a market nobody on `/leaderboard` cares about still triggers a refresh there. This task lets each page declare what it actually shows, and rebuilds `LiveRefresh`'s one channel from the union of the current page's declarations plus a base subscription to the member's own `profiles` row (so the top-bar balance stays live everywhere, even on pages that declare nothing).

- `components/live/live-tables.tsx` (new) holds a small external store: `<LiveTablesProvider userId>` creates it once per signed-in session, `<LiveTables subscriptions={…}>` registers/unregisters a page's declarations from an effect, and `useLiveSubscriptions()` reads the current deduped, sorted list (base subscription plus every registered page) via `useSyncExternalStore` -- a plain mutable store instead of React state, so a page's registration never itself trips `react-hooks/set-state-in-effect` or forces an extra render beyond the one genuine change it causes.
- `lib/live/page-subscriptions.ts` (new) is the one place every page's declarations live, so a single unit test can check them all against `LIVE_TABLES`.
- `components/live/live-refresh.tsx` is rewritten to read `useLiveSubscriptions()`, rebuild its channel on a fresh topic whenever `subscriptionKey(subscriptions)` changes, and cap the trailing debounce with a 2-second `maxWait` so a continuous stream of changes still refreshes at least that often.

Every PR B behaviour stays: the hidden-tab skip, the foreground refresh, the rejoin-catch-up (a fresh channel's first `SUBSCRIBED` is a join, never treated as a reconnect), the `cancelled` flag guarding against StrictMode's double-invoked effects, and the `.catch()` on the dynamic import so a stale deploy chunk or being offline just quietly stops live updates instead of throwing.

**Files:**
- Create: `components/live/live-tables.tsx`
- Create: `lib/live/page-subscriptions.ts`
- Modify (rewrite): `components/live/live-refresh.tsx`
- Modify: `app/(app)/layout.tsx` (wraps the returned tree in `LiveTablesProvider`; Task 9 already batched this file's reads)
- Modify: `app/(app)/leaderboard/page.tsx`
- Modify: `app/(app)/parlays/page.tsx` (Task 9 already batched this file's reads)
- Modify: `app/(app)/tasks/page.tsx` (Task 9 already batched this file's reads)
- Modify: `app/(app)/admin/tasks/page.tsx` (Task 9 already batched this file's reads)
- Modify: `app/(app)/markets/[id]/page.tsx` (anchored against the state Task 9 leaves it in)
- Modify: `app/(app)/markets/page.tsx` (anchored against the state Task 5 leaves it in)
- Modify: `app/(app)/(home)/page.tsx` (anchored against the state Task 9 leaves it in)
- Modify: `app/(app)/members/[id]/page.tsx` (anchored against the state Task 6 leaves it in)
- Modify: `app/(app)/feed/page.tsx` (anchored against the state Task 6 leaves it in)
- Test, create: `tests/components/live-tables.test.tsx`, `tests/lib/live/page-subscriptions.test.ts`
- Test, rewrite: `tests/components/live-refresh.test.tsx`

**Interfaces:**
- Consumes: `@supabase/realtime-js`'s `RealtimeChannel.on('postgres_changes', { event, schema, table, filter? }, cb)` -- `filter` is `string | RealtimePostgresFilterBuilder` in 2.116's types (`node_modules/@supabase/realtime-js/dist/module/RealtimeChannel.d.ts`), so a plain `column=eq.value` string is accepted as-is; `RealtimeClient.channel(topic)` (confirmed: reuses an in-flight channel for a repeated topic, hence a fresh topic per rebuild) and `removeChannel` (async, unawaited here as in PR B).
- Produces:
  ```ts
  // components/live/live-refresh.tsx -- 'use client'
  export const LIVE_TABLES = [/* unchanged, same order */] as const
  export type LiveTable = (typeof LIVE_TABLES)[number]
  export type LiveSubscription = { table: LiveTable; filter?: string }
  export const DEBOUNCE_MS = 400
  export const MAX_WAIT_MS = 2000
  export function LiveRefresh(): null

  // components/live/live-tables.tsx -- 'use client'
  export function LiveTablesProvider({ userId, children }: { userId: string; children: ReactNode })
  export function LiveTables({ subscriptions }: { subscriptions: LiveSubscription[] }): null
  export function useLiveSubscriptions(): LiveSubscription[]
  export function subscriptionKey(subscriptions: LiveSubscription[]): string

  // lib/live/page-subscriptions.ts -- plain module, imports only the LiveSubscription type
  export const pageSubscriptions: {
    marketDetail(marketId: string): LiveSubscription[]
    markets(): LiveSubscription[]
    home(): LiveSubscription[]
    leaderboard(): LiveSubscription[]
    member(memberId: string): LiveSubscription[]
    feed(): LiveSubscription[]
    tasks(userId: string): LiveSubscription[]
    parlays(userId: string): LiveSubscription[]
    adminTasks(): LiveSubscription[]
  }
  ```

**Why an external store, not context state.** The obvious shape -- a `useState<Map>` in the provider, updated by a registering page's effect -- runs straight into the newer `react-hooks` lint rules bundled with this repo's `eslint-plugin-react-hooks` (7.1.1, pulled in by `eslint-config-next`'s `core-web-vitals`): calling a setter from an effect that isn't gated on a real condition trips `react-hooks/set-state-in-effect`. A plain class instance (`LiveTableRegistry`) with a `Set` of listeners, read through `useSyncExternalStore`, sidesteps that entirely -- it's exactly the pattern `useSyncExternalStore` exists for (an external, mutable source of truth with its own subscribe/notify), and it was checked against this repo's actual lint config (see Step 2's aside).

**Why `subscriptionKey`, not the array, is the effect dependency (in both `LiveTables` and `LiveRefresh`).** A server component's props are a new array literal on every render, even when its content repeats -- `<LiveTables subscriptions={[{ table: 'bets' }]} />` builds a fresh array each time the page re-renders (a navigation, a live refresh, anything). Depending on that array directly would re-run the registration effect, and rebuild `LiveRefresh`'s channel, on every single re-render regardless of whether the declared tables and filters actually changed. `subscriptionKey` collapses the array to a stable, order-independent string (sorted, deduped `table|filter` pairs joined by `,`), so both effects only fire on a genuine change. Both eslint-disable comments carry a why, not just the rule name, per AGENTS.md's comment convention.

- [ ] **Step 1: Write the failing tests for the registry, the per-page declarations, and the rebuilt `LiveRefresh`**

Create `tests/components/live-tables.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { memo, useEffect } from 'react'
import { render, screen } from '@testing-library/react'
import { LiveTables, LiveTablesProvider, subscriptionKey, useLiveSubscriptions } from '@/components/live/live-tables'

function Probe() {
  const subscriptions = useLiveSubscriptions()
  return <output aria-label="Subscriptions">{JSON.stringify(subscriptions)}</output>
}

function readSubscriptions() {
  return JSON.parse(screen.getByLabelText('Subscriptions').textContent!)
}

describe('LiveTablesProvider / LiveTables / useLiveSubscriptions', () => {
  it('starts with just the base profile subscription, and registers a page on mount', () => {
    function Wrapper({ active }: { active: boolean }) {
      return (
        <LiveTablesProvider userId="member-1">
          <Probe />
          {active && <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />}
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper active={false} />)
    expect(readSubscriptions()).toEqual([{ table: 'profiles', filter: 'id=eq.member-1' }])

    rerender(<Wrapper active={true} />)
    expect(readSubscriptions()).toEqual([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('unregisters on unmount', () => {
    function Wrapper({ active }: { active: boolean }) {
      return (
        <LiveTablesProvider userId="member-1">
          <Probe />
          {active && <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />}
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper active={true} />)
    expect(readSubscriptions()).toHaveLength(2)

    rerender(<Wrapper active={false} />)
    expect(readSubscriptions()).toEqual([{ table: 'profiles', filter: 'id=eq.member-1' }])
  })

  it('dedupes an identical table and filter registered by more than one page component', () => {
    render(
      <LiveTablesProvider userId="member-1">
        <Probe />
        <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }, { table: 'markets' }]} />
        <LiveTables subscriptions={[{ table: 'bets', filter: 'market_id=eq.market-1' }]} />
      </LiveTablesProvider>,
    )

    expect(readSubscriptions()).toEqual([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'markets' },
      { table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('is a no-op outside a provider: nothing throws, and useLiveSubscriptions reads []', () => {
    expect(() => render(<LiveTables subscriptions={[{ table: 'bets' }]} />)).not.toThrow()

    render(<Probe />)
    expect(readSubscriptions()).toEqual([])
  })

  it('keeps a stable key across re-renders, so an equal-content array never re-notifies subscribers', () => {
    // Counting happens in an effect, not in the render body: an effect is where React expects a
    // side effect like this, and it still fires exactly once per commit that actually renders
    // CountingProbe (mount, plus one per genuine store notification).
    const renderCount = { current: 0 }
    const CountingProbe = memo(function CountingProbe() {
      useLiveSubscriptions()
      useEffect(() => {
        renderCount.current += 1
      })
      return null
    })

    function Wrapper() {
      return (
        <LiveTablesProvider userId="member-1">
          <CountingProbe />
          <LiveTables subscriptions={[{ table: 'bets' }]} />
        </LiveTablesProvider>
      )
    }

    const { rerender } = render(<Wrapper />)
    // The first render shows just the base subscription; <LiveTables> then registers 'bets' from
    // its mount effect, which is one genuine change and so one further, expected notification.
    const rendersAfterMount = renderCount.current
    expect(rendersAfterMount).toBeGreaterThan(0)

    // Each further render passes a brand new array literal with the same content, exactly as a
    // server component's props do on every request. None of these should add another notification.
    rerender(<Wrapper />)
    rerender(<Wrapper />)

    expect(renderCount.current).toBe(rendersAfterMount)
  })
})

describe('subscriptionKey', () => {
  it('is the same string for equal entries regardless of input order', () => {
    const a = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.1' }, { table: 'markets' }])
    const b = subscriptionKey([{ table: 'markets' }, { table: 'bets', filter: 'market_id=eq.1' }])
    expect(a).toBe(b)
  })

  it('differs when a filter differs', () => {
    const a = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.1' }])
    const b = subscriptionKey([{ table: 'bets', filter: 'market_id=eq.2' }])
    expect(a).not.toBe(b)
  })

  it('collapses duplicate entries', () => {
    const withDupe = subscriptionKey([{ table: 'markets' }, { table: 'markets' }])
    const without = subscriptionKey([{ table: 'markets' }])
    expect(withDupe).toBe(without)
  })
})
```

Create `tests/lib/live/page-subscriptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { LIVE_TABLES, type LiveSubscription } from '@/components/live/live-refresh'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'

const FILTER_RE = /^[a-z_]+=eq\..+$/

const MARKET_ID = '11111111-1111-4111-8111-111111111111'
const MEMBER_ID = '22222222-2222-4222-8222-222222222222'

const declarations: Record<string, () => LiveSubscription[]> = {
  marketDetail: () => pageSubscriptions.marketDetail(MARKET_ID),
  markets: () => pageSubscriptions.markets(),
  home: () => pageSubscriptions.home(),
  leaderboard: () => pageSubscriptions.leaderboard(),
  member: () => pageSubscriptions.member(MEMBER_ID),
  feed: () => pageSubscriptions.feed(),
  tasks: () => pageSubscriptions.tasks(MEMBER_ID),
  parlays: () => pageSubscriptions.parlays(MEMBER_ID),
  adminTasks: () => pageSubscriptions.adminTasks(),
}

describe('pageSubscriptions', () => {
  for (const [name, declare] of Object.entries(declarations)) {
    it(`${name} only declares published tables, with a valid eq filter when one is given`, () => {
      const subscriptions = declare()
      expect(subscriptions.length).toBeGreaterThan(0)
      for (const subscription of subscriptions) {
        expect(LIVE_TABLES).toContain(subscription.table)
        if (subscription.filter !== undefined) expect(subscription.filter).toMatch(FILTER_RE)
      }
    })
  }

  it('carries the market id, and only the market id, through marketDetail', () => {
    const subscriptions = pageSubscriptions.marketDetail(MARKET_ID)
    expect(subscriptions).toEqual([
      { table: 'bets', filter: `market_id=eq.${MARKET_ID}` },
      { table: 'markets', filter: `id=eq.${MARKET_ID}` },
      { table: 'market_resolutions', filter: `market_id=eq.${MARKET_ID}` },
    ])
  })

  it('carries the member id through member', () => {
    const subscriptions = pageSubscriptions.member(MEMBER_ID)
    expect(subscriptions).toEqual([
      { table: 'profiles', filter: `id=eq.${MEMBER_ID}` },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })
})
```

Replace `tests/components/live-refresh.test.tsx` in full:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'
import { act, render } from '@testing-library/react'
import { LiveTables, LiveTablesProvider } from '@/components/live/live-tables'
import type { LiveSubscription } from '@/components/live/live-refresh'

type Status = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR' | 'TIMED_OUT'
type Handler = () => void
type OnConfig = { event: string; schema: string; table: string; filter?: string }

interface MockChannel {
  topic: string
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  handlersByTable: Map<string, Handler[]>
  configsByTable: Map<string, OnConfig[]>
  report: (status: Status) => void
}

const mocks = vi.hoisted(() => {
  const channels: MockChannel[] = []

  function makeChannel(topic: string): MockChannel {
    const handlersByTable = new Map<string, Handler[]>()
    const configsByTable = new Map<string, OnConfig[]>()
    const channel: MockChannel = {
      topic,
      handlersByTable,
      configsByTable,
      report: () => {},
      on: vi.fn(),
      subscribe: vi.fn(),
    }
    channel.on = vi.fn((_type: string, config: OnConfig, handler: Handler) => {
      handlersByTable.set(config.table, [...(handlersByTable.get(config.table) ?? []), handler])
      configsByTable.set(config.table, [...(configsByTable.get(config.table) ?? []), config])
      return channel
    })
    channel.subscribe = vi.fn((callback: (status: Status) => void) => {
      channel.report = callback
      return channel
    })
    return channel
  }

  const client = {
    channel: vi.fn((topic: string) => {
      const channel = makeChannel(topic)
      channels.push(channel)
      return channel
    }),
    removeChannel: vi.fn(),
  }
  const refresh = vi.fn()
  // Next's real useRouter() returns a stable object across renders; a fresh one on every call
  // (the natural way to stub it) would make the effect's [router, key] deps look changed on every
  // render regardless of key, which the app never sees in practice.
  const router = { refresh }
  return { channels, client, browserClient: vi.fn(() => client), refresh, router }
})

vi.mock('@/lib/supabase/client', () => ({ browserClient: mocks.browserClient }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

import { LIVE_TABLES, LiveRefresh } from '@/components/live/live-refresh'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

function fireChange(channel: MockChannel, table: string, index = 0) {
  channel.handlersByTable.get(table)![index]()
}

function Harness({ subscriptions }: { subscriptions?: LiveSubscription[] }) {
  return (
    <LiveTablesProvider userId="member-1">
      <LiveRefresh />
      {subscriptions && <LiveTables subscriptions={subscriptions} />}
    </LiveTablesProvider>
  )
}

// Always mounts base-only first and lets the dynamic import settle, exactly like a fresh page
// load before any <LiveTables> has registered. A page's declarations are then added as a genuinely
// separate update -- as they are on a client-side navigation -- so the fake clock only ever drives
// the debounce and maxWait logic under test, never a mount-time registration race.
async function mount(subscriptions?: LiveSubscription[]) {
  const view = render(<Harness />)
  await act(() => vi.dynamicImportSettled())

  if (subscriptions) {
    await act(async () => {
      view.rerender(<Harness subscriptions={subscriptions} />)
    })
    await act(() => vi.dynamicImportSettled())
  }

  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  return { ...view, channel: mocks.channels.at(-1)! }
}

// For a rebuild that happens mid-test, after fake timers are already active: the channel swap
// still goes through a real dynamic import, so it still needs a real settle.
async function rebuild(view: { rerender: (node: ReactElement) => void }, subscriptions?: LiveSubscription[]) {
  await act(async () => {
    view.rerender(<Harness subscriptions={subscriptions} />)
  })
  await act(() => vi.dynamicImportSettled())
  return mocks.channels.at(-1)!
}

beforeEach(() => {
  mocks.channels.length = 0
  mocks.client.channel.mockClear()
  mocks.client.removeChannel.mockClear()
  mocks.browserClient.mockClear()
  mocks.refresh.mockClear()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
})

describe('LiveRefresh', () => {
  it('renders nothing and opens a channel bound to only the base profile subscription with no page registered', async () => {
    const { container, channel } = await mount()

    expect(container).toBeEmptyDOMElement()
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledTimes(1)
    expect(channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
      expect.any(Function),
    )
    expect(channel.subscribe).toHaveBeenCalledTimes(1)
  })

  it('opens a channel for every LIVE_TABLES entry a page declares, filters passed through, plus the base', async () => {
    const { channel } = await mount([
      { table: 'bets', filter: 'market_id=eq.market-1' },
      { table: 'markets', filter: 'id=eq.market-1' },
    ])

    for (const table of LIVE_TABLES) {
      const shouldSubscribe = table === 'profiles' || table === 'bets' || table === 'markets'
      expect(channel.handlersByTable.has(table)).toBe(shouldSubscribe)
    }
    expect(channel.configsByTable.get('bets')).toEqual([
      { event: '*', schema: 'public', table: 'bets', filter: 'market_id=eq.market-1' },
    ])
    expect(channel.configsByTable.get('markets')).toEqual([
      { event: '*', schema: 'public', table: 'markets', filter: 'id=eq.market-1' },
    ])
    expect(channel.configsByTable.get('profiles')).toEqual([
      { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.member-1' },
    ])
  })

  it('rebuilds the channel with a new topic when a page registers on navigation, and removes the old one', async () => {
    const view = await mount()
    const firstChannel = view.channel
    expect(mocks.client.channel).toHaveBeenCalledTimes(1)

    const secondChannel = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(mocks.client.channel).toHaveBeenCalledTimes(2)
    expect(secondChannel.topic).not.toBe(firstChannel.topic)
    expect(secondChannel.handlersByTable.has('bets')).toBe(true)
    expect(secondChannel.handlersByTable.has('profiles')).toBe(true)
    expect(mocks.client.removeChannel).toHaveBeenCalledWith(firstChannel)
  })

  it('does not rebuild when a re-render carries the same declarations under a new array', async () => {
    const subs: LiveSubscription[] = [{ table: 'bets', filter: 'market_id=eq.market-1' }]
    const view = await mount(subs)
    const channelCallsAfterMount = mocks.client.channel.mock.calls.length
    const removeCallsAfterMount = mocks.client.removeChannel.mock.calls.length

    // A fresh array with identical content, exactly like a server re-render's props.
    await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    expect(mocks.client.channel).toHaveBeenCalledTimes(channelCallsAfterMount)
    expect(mocks.client.removeChannel).toHaveBeenCalledTimes(removeCallsAfterMount)
  })

  it('refreshes once, 400ms after the last change in a burst across tables', async () => {
    const { channel } = await mount([{ table: 'bets' }])

    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(200)
    fireChange(channel, 'bets')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes at least every 2s under a continuous stream of changes', async () => {
    const { channel } = await mount()

    // Each change lands well inside the 400ms trailing window, so without a cap the debounce
    // would never fire.
    for (let i = 0; i < 6; i++) {
      fireChange(channel, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(200)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)

    // The cap resets after it fires: a further burst waits out its own debounce again.
    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(399)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('skips the refresh for a change while the tab is hidden, then catches up once on return', async () => {
    const { channel } = await mount()

    setVisibility('hidden')
    fireChange(channel, 'profiles')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('skips a maxWait tick while hidden too, and still catches up once on return', async () => {
    const { channel } = await mount()

    setVisibility('hidden')
    for (let i = 0; i < 7; i++) {
      fireChange(channel, 'profiles')
      vi.advanceTimersByTime(300)
    }
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('refreshes after a reconnect, but not on the first join', async () => {
    const { channel } = await mount()

    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    channel.report('CLOSED')
    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('treats the first SUBSCRIBED of a rebuilt channel as a join, not a reconnect', async () => {
    const view = await mount()

    const rebuiltChannel = await rebuild(view, [{ table: 'bets', filter: 'market_id=eq.market-1' }])

    rebuiltChannel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('catches up when the app comes back to the foreground, not when it leaves', async () => {
    await mount()

    setVisibility('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).not.toHaveBeenCalled()

    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('folds a reconnect and a return to the foreground into one refresh', async () => {
    const { channel } = await mount()
    channel.report('SUBSCRIBED')

    document.dispatchEvent(new Event('visibilitychange'))
    channel.report('SUBSCRIBED')
    vi.advanceTimersByTime(400)

    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('removes the channel, the listener and any pending refresh on unmount', async () => {
    const { unmount, channel } = await mount()
    fireChange(channel, 'profiles')

    unmount()
    vi.advanceTimersByTime(400)
    document.dispatchEvent(new Event('visibilitychange'))
    vi.advanceTimersByTime(400)

    expect(mocks.client.removeChannel).toHaveBeenCalledWith(channel)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('opens no channel when it unmounts before the client has loaded', async () => {
    const { unmount } = render(<Harness />)
    unmount()
    await act(() => vi.dynamicImportSettled())

    expect(mocks.browserClient).not.toHaveBeenCalled()
    expect(mocks.client.channel).not.toHaveBeenCalled()
  })
})
```

Run: `npx vitest run tests/components/live-tables.test.tsx tests/lib/live/page-subscriptions.test.ts tests/components/live-refresh.test.tsx`
Expected: FAIL. `components/live/live-tables.tsx` and `lib/live/page-subscriptions.ts` don't exist yet, so the first two files fail to resolve their imports; the rewritten `live-refresh.test.tsx` imports `LiveTables` / `LiveTablesProvider` (same reason) and asserts on `MAX_WAIT_MS`-driven and rebuild behaviour the current `live-refresh.tsx` doesn't have.

- [ ] **Step 2: Create the registry**

Create `components/live/live-tables.tsx`:

```tsx
'use client'

import { createContext, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { LiveSubscription } from './live-refresh'

function entryId(subscription: LiveSubscription): string {
  return `${subscription.table}|${subscription.filter ?? ''}`
}

function dedupeSorted(subscriptions: LiveSubscription[]): LiveSubscription[] {
  const byId = new Map<string, LiveSubscription>()
  for (const subscription of subscriptions) byId.set(entryId(subscription), subscription)
  return [...byId.values()].sort((a, b) => {
    const idA = entryId(a)
    const idB = entryId(b)
    return idA < idB ? -1 : idA > idB ? 1 : 0
  })
}

export function subscriptionKey(subscriptions: LiveSubscription[]): string {
  return dedupeSorted(subscriptions).map(entryId).join(',')
}

// A plain external store, not React state: every page's <LiveTables> registers into it from an
// effect, and LiveRefresh (and any other reader) subscribes with useSyncExternalStore. That keeps
// registration out of the render path entirely -- no setState-in-effect, no extra render per page.
class LiveTableRegistry {
  private readonly base: LiveSubscription
  private readonly registered = new Map<string, LiveSubscription[]>()
  private readonly listeners = new Set<() => void>()
  private snapshot: LiveSubscription[]

  constructor(userId: string) {
    this.base = { table: 'profiles', filter: `id=eq.${userId}` }
    this.snapshot = dedupeSorted([this.base])
  }

  register(key: string, subscriptions: LiveSubscription[]): void {
    this.registered.set(key, subscriptions)
    this.recompute()
  }

  unregister(key: string): void {
    if (!this.registered.delete(key)) return
    this.recompute()
  }

  private recompute(): void {
    this.snapshot = dedupeSorted([this.base, ...this.registered.values()].flat())
    for (const listener of this.listeners) listener()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): LiveSubscription[] => this.snapshot
}

const LiveTablesContext = createContext<LiveTableRegistry | null>(null)

export function LiveTablesProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const registry = useMemo(() => new LiveTableRegistry(userId), [userId])
  return <LiveTablesContext value={registry}>{children}</LiveTablesContext>
}

const NO_SUBSCRIPTIONS: LiveSubscription[] = []
const subscribeToNothing = () => () => {}
const getNoSubscriptions = () => NO_SUBSCRIPTIONS

export function useLiveSubscriptions(): LiveSubscription[] {
  const registry = useContext(LiveTablesContext)
  return useSyncExternalStore(
    registry ? registry.subscribe : subscribeToNothing,
    registry ? registry.getSnapshot : getNoSubscriptions,
    registry ? registry.getSnapshot : getNoSubscriptions,
  )
}

let nextRegistrationId = 0

export function LiveTables({ subscriptions }: { subscriptions: LiveSubscription[] }): null {
  const registry = useContext(LiveTablesContext)
  const key = subscriptionKey(subscriptions)
  const idRef = useRef<string | undefined>(undefined)
  if (idRef.current === undefined) idRef.current = `live-tables:${++nextRegistrationId}`

  useEffect(() => {
    if (!registry) return
    const id = idRef.current!
    registry.register(id, subscriptions)
    return () => registry.unregister(id)
    // The key, not the subscriptions array, is the real dependency: a server component hands this
    // component a new array every render even when its tables and filters haven't changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, key])

  return null
}
```

`useSyncExternalStore` is given the same `getSnapshot` for both the client and server reads: the snapshot only ever reflects registrations made from client-side effects (never anything environment-dependent), so it's identical -- `[base]` -- on the server-rendered pass and the first client render, before any `<LiveTables>` has had a chance to register. No hydration mismatch results.

The `useEffect`'s `eslint-disable-next-line react-hooks/exhaustive-deps` is real: without it, `npx eslint components/live/live-tables.tsx` reports `React Hook useEffect has a missing dependency: 'subscriptions'` (checked by removing the comment locally) -- confirming the rule is live in this repo's config (`eslint-plugin-react-hooks` 7.1.1 via `eslint-config-next`'s `core-web-vitals`) and that the disable is suppressing a real, intentional warning rather than a dead comment.

- [ ] **Step 3: Create the per-page declarations**

Create `lib/live/page-subscriptions.ts`:

```ts
import type { LiveSubscription } from '@/components/live/live-refresh'

export const pageSubscriptions = {
  marketDetail(marketId: string): LiveSubscription[] {
    return [
      { table: 'bets', filter: `market_id=eq.${marketId}` },
      { table: 'markets', filter: `id=eq.${marketId}` },
      { table: 'market_resolutions', filter: `market_id=eq.${marketId}` },
    ]
  },
  markets(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'bets' }]
  },
  home(): LiveSubscription[] {
    return [{ table: 'markets' }, { table: 'tasks' }]
  },
  leaderboard(): LiveSubscription[] {
    return [{ table: 'profiles' }]
  },
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'profiles', filter: `id=eq.${memberId}` },
      { table: 'bets', filter: `profile_id=eq.${memberId}` },
      { table: 'parlays', filter: `profile_id=eq.${memberId}` },
    ]
  },
  feed(): LiveSubscription[] {
    return [{ table: 'bets' }, { table: 'parlays' }, { table: 'task_completions' }, { table: 'market_resolutions' }]
  },
  tasks(userId: string): LiveSubscription[] {
    return [{ table: 'tasks' }, { table: 'task_completions', filter: `profile_id=eq.${userId}` }]
  },
  parlays(userId: string): LiveSubscription[] {
    return [{ table: 'parlays', filter: `profile_id=eq.${userId}` }, { table: 'parlay_legs' }]
  },
  adminTasks(): LiveSubscription[] {
    return [{ table: 'task_completions' }]
  },
}
```

This is a plain module (no `'use client'`), and its only import from `live-refresh.tsx` is the `LiveSubscription` type -- a type-only import erases at compile time, so this server-importable module never pulls in a client-component reference.

- [ ] **Step 4: Rewrite `LiveRefresh`**

Replace `components/live/live-refresh.tsx` in full:

```tsx
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { subscriptionKey, useLiveSubscriptions } from './live-tables'

// Every table a signed-in page reads its live numbers from. supabase/migrations/0032 adds them to
// the realtime publication; Postgres Changes then only delivers rows the member's RLS lets them
// read -- except DELETE events, which skip RLS and carry only the primary key. LiveRefresh never
// reads payloads either way; it just triggers a refresh, which re-reads through RLS.
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

export type LiveTable = (typeof LIVE_TABLES)[number]

// `filter` is Postgres Changes' single `column=eq.value` form -- the only shape the pages in this
// app need.
export type LiveSubscription = { table: LiveTable; filter?: string }

export const DEBOUNCE_MS = 400
// However busy the stream, a refresh fires no later than this long after the first unflushed change.
export const MAX_WAIT_MS = 2000

// A fresh topic per build: RealtimeClient.channel(topic) hands back the still-closing channel of a
// reused topic, so rebuilding a channel on the same topic after a page's declarations change would
// reuse a channel that's mid-teardown instead of opening a new one.
let generation = 0

export function LiveRefresh(): null {
  const router = useRouter()
  const subscriptions = useLiveSubscriptions()
  const key = subscriptionKey(subscriptions)

  useEffect(() => {
    let cancelled = false
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    let maxWaitTimer: ReturnType<typeof setTimeout> | undefined
    let teardown: (() => void) | undefined

    function flush() {
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      debounceTimer = undefined
      maxWaitTimer = undefined
      // A hidden tab already gets caught up by the visibility handler below when it returns,
      // so there's no need to re-render it on every change anyone makes while it's away.
      if (document.visibilityState === 'hidden') return
      router.refresh()
    }

    // One action touches several tables (a bet writes bets and profiles), so bursts coalesce
    // into a single refresh -- but under a steady stream the trailing debounce alone would never
    // fire, so a refresh is also forced at MAX_WAIT_MS after the first change in the burst.
    function scheduleRefresh() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(flush, DEBOUNCE_MS)
      if (maxWaitTimer === undefined) {
        maxWaitTimer = setTimeout(flush, MAX_WAIT_MS)
      }
    }

    // A phone that backgrounds the app suspends the socket, and the client only notices a dead one
    // at its next heartbeat, so returning to the app catches up straight away.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') scheduleRefresh()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Loaded on mount rather than imported, so the Supabase client stays off every page's
    // critical path.
    import('@/lib/supabase/client')
      .then(({ browserClient }) => {
        if (cancelled) return
        const supabase = browserClient()
        const channel = supabase.channel(`live-refresh:${++generation}`)
        for (const { table, filter } of subscriptions) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table, filter }, scheduleRefresh)
        }

        // Postgres Changes has no replay: whatever changed while the socket was down is gone once
        // it rejoins. The first SUBSCRIBED is the initial join, and every later one follows a
        // reconnect -- and a channel rebuilt for new declarations is a fresh join too, since it's
        // a new channel object with its own `joined` flag.
        let joined = false
        channel.subscribe((status) => {
          if (status !== 'SUBSCRIBED') return
          if (joined) scheduleRefresh()
          joined = true
        })

        teardown = () => {
          supabase.removeChannel(channel)
        }
      })
      .catch(() => {
        // Offline or a stale deploy chunk: live updates quietly stop, and the foreground refresh still covers it.
      })

    return () => {
      cancelled = true
      clearTimeout(debounceTimer)
      clearTimeout(maxWaitTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      teardown?.()
    }
    // The key, not `subscriptions` itself, decides when to rebuild the channel: the registry hands
    // back a fresh array on every registration change even when its tables and filters repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, key])

  return null
}
```

Run: `npx vitest run tests/components/live-tables.test.tsx tests/lib/live/page-subscriptions.test.ts tests/components/live-refresh.test.tsx`
Expected: PASS (8 + 11 + 14 = 33 tests).

- [ ] **Step 5: Wrap the `(app)` layout in `LiveTablesProvider`**

In `app/(app)/layout.tsx` (as Task 9 left it), replace:

```tsx
import { LiveRefresh } from '@/components/live/live-refresh'
```

with:

```tsx
import { LiveRefresh } from '@/components/live/live-refresh'
import { LiveTablesProvider } from '@/components/live/live-tables'
```

and wrap the returned tree, outside `SlipCountProvider`. Replace:

```tsx
  return (
    <SlipCountProvider initial={slip.length}>
      <NavDepthTracker />
      <AppNav balance={profile.balance} isAdmin={admin} />
      <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
        <OfflineBanner />
        {children}
      </main>
      <Toaster />
      <LiveRefresh />
    </SlipCountProvider>
  )
```

with:

```tsx
  return (
    <LiveTablesProvider userId={user.id}>
      <SlipCountProvider initial={slip.length}>
        <NavDepthTracker />
        <AppNav balance={profile.balance} isAdmin={admin} />
        <main id="main" className="flex flex-1 flex-col pb-[calc(82px+var(--safe-bottom))] md:pb-0">
          <OfflineBanner />
          {children}
        </main>
        <Toaster />
        <LiveRefresh />
      </SlipCountProvider>
    </LiveTablesProvider>
  )
```

`<LiveRefresh />` keeps its position and its empty prop list.

- [ ] **Step 6: Declare each page's subscriptions**

Each page below renders one `<LiveTables subscriptions={pageSubscriptions.x(…)} />`, as a sibling inside its `<Page>` (for `/admin/tasks`, which has no `<Page>` of its own, inside its `<ContentReveal>`). The spec's table (4c) is the source: the feed and the eight pages here. The other admin pages (invites, ledger, members) declare nothing.

In each of the nine page files below, add the same two imports straight after the `requireUser` import. Replace:

```tsx
import { requireUser } from '@/lib/auth/require-user'
```

with:

```tsx
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
```

Then add the declaration.

**`app/(app)/leaderboard/page.tsx`.** Replace:

```tsx
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
```

with:

```tsx
      <PageHeader title="Leaderboard" description="Ranked by balance. Ties share a rank." />
      <LiveTables subscriptions={pageSubscriptions.leaderboard()} />
```

**`app/(app)/parlays/page.tsx`.** Replace:

```tsx
      <PageHeader title="Parlays" />
```

with:

```tsx
      <PageHeader title="Parlays" />
      <LiveTables subscriptions={pageSubscriptions.parlays(user.id)} />
```

**`app/(app)/tasks/page.tsx`.** Replace:

```tsx
      <PageHeader title="Tasks" description="Earn DC with Bible study. An admin reviews each one before the coins land." />
```

with:

```tsx
      <PageHeader title="Tasks" description="Earn DC with Bible study. An admin reviews each one before the coins land." />
      <LiveTables subscriptions={pageSubscriptions.tasks(user.id)} />
```

**`app/(app)/admin/tasks/page.tsx`.** As the first child of the outer column, above the "Pending approvals" card. Replace:

```tsx
      <div className="flex flex-col gap-5 md:gap-7">
```

with:

```tsx
      <div className="flex flex-col gap-5 md:gap-7">
        <LiveTables subscriptions={pageSubscriptions.adminTasks()} />
```

**`app/(app)/markets/page.tsx`** (as Task 5 left it). Right after the `<PageHeader …/>`, whose `action` ends the element. Replace:

```tsx
            Create market
          </Link>
        }
      />
```

with:

```tsx
            Create market
          </Link>
        }
      />
      <LiveTables subscriptions={pageSubscriptions.markets()} />
```

**`app/(app)/markets/[id]/page.tsx`** (as Task 9 left it). As `<MarketSlipProvider>`'s first child, above the `BackLink`. Replace:

```tsx
      <MarketSlipProvider pick={marketPick}>
```

with:

```tsx
      <MarketSlipProvider pick={marketPick}>
        <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id)} />
```

**`app/(app)/(home)/page.tsx`** (as Task 9 left it). Replace:

```tsx
      <PageHeader title={`Welcome, ${me?.displayName}`} />
```

with:

```tsx
      <PageHeader title={`Welcome, ${me?.displayName}`} />
      <LiveTables subscriptions={pageSubscriptions.home()} />
```

**`app/(app)/members/[id]/page.tsx`** (as Task 6 left it). Replace:

```tsx
      <BackLink href="/leaderboard">Leaderboard</BackLink>
```

with:

```tsx
      <BackLink href="/leaderboard">Leaderboard</BackLink>
      <LiveTables subscriptions={pageSubscriptions.member(member.id)} />
```

**`app/(app)/feed/page.tsx`** (as Task 6 left it). Replace:

```tsx
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
```

with:

```tsx
      <PageHeader title="Feed" description="Everything that’s happened in DwellDuel, newest first." />
      <LiveTables subscriptions={pageSubscriptions.feed()} />
```

- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 954 tests in 146 files. This task adds 25 tests: `live-tables.test.tsx` (8, new), `page-subscriptions.test.ts` (11, new) and `live-refresh.test.tsx` (14, up from 8).

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed, unchanged -- `<LiveTables>` renders `null`, and no page's markup, copy or role count changes.

- [ ] **Step 8: Commit**

```bash
git add components/live/live-tables.tsx components/live/live-refresh.tsx lib/live/page-subscriptions.ts \
  "app/(app)/layout.tsx" "app/(app)/leaderboard/page.tsx" "app/(app)/parlays/page.tsx" \
  "app/(app)/tasks/page.tsx" "app/(app)/admin/tasks/page.tsx" "app/(app)/markets/page.tsx" \
  "app/(app)/markets/[id]/page.tsx" "app/(app)/(home)/page.tsx" "app/(app)/members/[id]/page.tsx" "app/(app)/feed/page.tsx" \
  tests/components/live-tables.test.tsx tests/lib/live/page-subscriptions.test.ts tests/components/live-refresh.test.tsx
git commit -m "$(cat <<'EOF'
Give each page its own live-update subscriptions instead of one shared channel
EOF
)"
```

---

## Task 11: Housekeeping — cron margin, keep-alive logging, and no dead CSS from the docs folder

Three small, unrelated fixes, plus the AGENTS.md bullets for everything Tasks 4–10 added. None
of these touch product behaviour a test already exercises, so each is a direct edit with its own
narrow verification rather than a red/green unit test.

**Files:**
- Modify: `vercel.json` (cron schedule)
- Modify (rewrite): `app/api/cron/keep-alive/route.ts` (log before the 502; correct the comment)
- Modify (anchored): `app/globals.css` (`@source not "../docs";` after the Tailwind import)
- Modify (rewrite): `AGENTS.md` (new "Data and reliability" section)

**Interfaces:** none — this task produces nothing another task consumes. It's the last file
each of those four is touched by in this PR.

- [ ] **Step 1: Give the cron job margin, and log before a keep-alive failure**

Replace `vercel.json` in full:

```json
{
  "crons": [
    {
      "path": "/api/cron/keep-alive",
      "schedule": "0 0 * * 1,4"
    }
  ]
}
```

Monday and Thursday instead of just Monday: Supabase pauses a free project after 7 days idle, so
a single missed run of a *weekly* cron can now sit right at that boundary. Two runs a few days
apart means one miss still leaves the project pinged well inside the window.

Replace `app/api/cron/keep-alive/route.ts` in full:

```ts
import { NextResponse } from 'next/server'
import { serviceRoleClient } from '@/lib/supabase/service-role'

/**
 * Supabase pauses free-tier projects after 7 days with no database
 * activity. Triggered Monday and Thursday by vercel.json's cron entry, so
 * one missed run still lands well inside that window, keeping the hosted
 * project alive between bursts of real usage.
 *
 * Verified the same way every guide for securing a Vercel cron route
 * documents: Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to a
 * cron-triggered request when that env var is set on the project, so
 * anything else calling this path either doesn't know the secret or
 * isn't Vercel's own scheduler. The unset case is checked explicitly
 * (`!secret`) rather than relied on to fail via the string comparison
 * alone -- `` `Bearer ${undefined}` `` interpolates to the literal string
 * "Bearer undefined", which a request sending that exact header would
 * otherwise match.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  const { error } = await serviceRoleClient().from('profiles').select('id').limit(1)

  if (error) {
    console.error(error)
    return new NextResponse('Supabase query failed', { status: 502 })
  }

  return NextResponse.json({ ok: true })
}
```

The old comment claimed the weekly schedule already had "comfortably inside that window"
margin — it didn't; a single missed weekly run lands exactly at the 7-day edge. The new comment
says what's actually true of the corrected schedule.

Run: `npx tsc --noEmit && npx eslint app/api/cron/keep-alive/route.ts`
Expected: PASS (this route has no existing test, and the spec's testing list doesn't add one).

- [ ] **Step 2: Stop the docs folder from generating CSS**

In `app/globals.css`, replace its first line:

```css
@import "tailwindcss";
```

with:

```css
@import "tailwindcss";
@source not "../docs";
```

Tailwind v4's automatic content detection scans every non-ignored text file from the project
root for candidate class names — including the prose and code blocks in `docs/`, which quote
plenty of Tailwind-shaped tokens that aren't in any app file, some of them (raw colour classes
like `text-red-600`, quoted in older plans as what *not* to do) exactly the thing AGENTS.md's
"tokens, never raw colours" rule forbids in real code. `@source not "../docs"` excludes that
tree from scanning, path relative to `app/globals.css`.

Run: `npm run build`
Then check the built CSS actually lost the docs-only class and kept a real one:

```bash
find .next -name '*.css' -print0 | xargs -0 grep -l "text-red-600"   # expect: no output — the docs-only leak is gone
find .next -name '*.css' -print0 | xargs -0 grep -l "bg-status-band" # expect: one match — a real app class survives
```

(`text-red-600` is quoted only in `docs/superpowers/plans/*.md`, never in `app/`, `components/`
or `lib/` — confirmed with `grep -rn "text-red-600" app components lib`, no hits. `bg-status-band`
is the status band's real token class, `components/app-shell/status-band.tsx`.) This was checked
directly by compiling `app/globals.css` through `@tailwindcss/postcss` (the same plugin
`postcss.config.mjs` already wires up) both with and without the `@source not` line, outside
Next's own bundler: the unfiltered build is 64,012 bytes with `.text-red-600` present once; the
filtered build is 58,460 bytes with `.text-red-600` gone and `.bg-status-band` still present.
Every other selector present in the filtered build is also present in the unfiltered one — the
line only removes candidates, it adds none.

- [ ] **Step 3: Document this PR's conventions in AGENTS.md**

Add a new section to `AGENTS.md`, after "## Native feel and speed" and directly before the `## Testing` heading, with one blank line either side:

```markdown
## Data and reliability

- **Long lists page with "Show more".** `lib/pagination` (`cursor.ts`, `keyset.ts`, `chunk.ts`)
  and `components/ui/show-more.tsx`'s `ShowMore` / `BackToNewest` are the one pattern across
  every list; a page reads its own `?<param>=` (and `<param>_from` once a window starts).
  Both links replace the history entry, and a key over a bigint or uuid id passes `isId`, so
  a tampered cursor reads as the first page instead of a database error.
- **Every `.in(col, ids)` whose id count grows with rows is chunked,** at `IN_CHUNK` (50) via
  `lib/pagination/chunk.ts`'s `chunk()`, so no read's URL grows with the data.
- **A page declares what it shows live** with `<LiveTables subscriptions={…}>`, built from
  `lib/live/page-subscriptions.ts`; the `(app)` layout's `LiveRefresh` channel is rebuilt from
  the base subscription (always `profiles` for the signed-in member) plus whatever the current
  page registered.
- **An Auth failure isn't "signed out."** `requireUser` (`lib/auth/require-user.ts`) throws
  `AuthUnavailableError` on a network, timeout or 5xx Auth error, which the error boundaries
  catch; a revoked token or no session still returns `user: null`, and sends the member to
  sign-in as before.
- **Every level has an error page.** `app/(app)/error.tsx`, `app/error.tsx` and
  `app/global-error.tsx` all render `components/ui/error-card.tsx`'s `ErrorCard`, with a "Try
  again" that calls `retry()`, and each logs `console.error(error, { digest: error.digest })`.
```

This is documentation only; there's no test to run. Read the result back to confirm the section
landed in the right place and the existing sections are untouched.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS, with Vitest unchanged at 954 tests in 146 files. Re-run the two `grep` checks from Step 2 against the fresh build output.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: PASS, 26 tests (unchanged — this task adds no test and touches no page a spec asserts against).

- [ ] **Step 5: Commit**

```
git add vercel.json app/api/cron/keep-alive/route.ts app/globals.css AGENTS.md
git commit -m "$(cat <<'EOF'
Give the keep-alive cron margin, log its failures, and stop docs from leaking into the CSS build
EOF
)"
```

---

## Task 12: Full verification

This task changes no product code. It runs the whole chain on the finished branch, re-runs it on the Supabase CLI version CI pins, and measures the scale seed's `EXPLAIN ANALYZE` timings before and after `0033`. Then the controller takes a visual pass. Last comes the user's post-deploy checklist, which only the user can run.

**Files:**
- Temporary, not committed: `e2e/zz-visual-scale.spec.ts` (Step 5, the controller's screenshot spec, deleted after use)
- Temporary, outside the repo: `$SCRATCH/explain-scale.mjs` (Step 4)

**Interfaces:**
- Consumes every task in this PR: the policy rewrite and indexes (Task 1), the clawback block and lock order (Task 2), batch review (Task 3), the pagination core and the ledger (Task 4), markets (Task 5), the feed, member activity and leaderboard (Task 6), error pages and timeouts (Task 7), auth (Task 8), parallel reads (Task 9), per-page live updates (Task 10) and housekeeping (Task 11).
- Produces nothing new. This is the last task.

- [ ] **Step 1: Run the whole chain**

Run: `npm run db:reset && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- Vitest: 954 tests in 146 files, 42 of them in `tests/db/` (752 in 122 before this PR).
- The build's route table is the same 20 routes as before this PR. There are no new or missing routes.
- The CSS leak stays fixed (Task 11's check):
  - `find .next -name '*.css' -print0 | xargs -0 grep -l "text-red-600"` finds nothing.
  - `find .next -name '*.css' -print0 | xargs -0 grep -l "bg-status-band"` finds one file.

Run: `lsof -ti:3000 | xargs -r kill 2>/dev/null; npx playwright test`
Expected: 26 passed: the 24 from before this PR, plus `e2e/clawback.spec.ts` (Task 2) and `e2e/ledger-show-more.spec.ts` (Task 4).

- [ ] **Step 2: Re-run the chain on the CLI version CI pins**

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
lsof -ti:3000 | xargs -r kill 2>/dev/null
npx playwright test
```

Expected: every step passes on this exact CLI version, with 26 e2e tests. Watch `0033` in particular. `db reset` must apply the policy rewrite, the indexes, the clawback block and `review_task_completions` cleanly on 2.115.0, and the new function's grants must land. 2.115.0 is the version that grants nothing implicitly (the 0007 lesson), and `0033` is the first migration since then to add a `security definer` function.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: no output. Every task committed its own files, and this task has nothing to commit.

- [ ] **Step 4: `EXPLAIN ANALYZE` before and after `0033`, with the scale seed**

This step writes tens of thousands of rows to local Supabase. Run it from the repo root with the project's own CLI (`npx supabase`), and run no DB test until the reset at the end: `seedMembers()` can't clear 500 extra auth users.

1. Make a scratch directory outside the repo: `SCRATCH=$(mktemp -d)`.

2. Reset to just before `0033`, then load the scale seed:

   ```bash
   npx supabase db reset --version 0032
   node scripts/seed-scale.mjs
   ```

   Expected: the seed prints 500 members, 70 open, 120 resolved and 10 voided markets, 20,000 bets, 130 resolutions, 400 parlays, about 3,000 task completions and about 31,000 ledger rows.

3. Write `$SCRATCH/explain-scale.mjs`. It talks to postgres-meta directly, like Task 1's `pgQuery`, because `tests/db/pg-query.ts` is TypeScript and the repo has no `.ts` runner. It reads its env through `node --env-file`, because a script outside the repo can't resolve `dotenv`:

   ```js
   // Throwaway, not committed. Run from the repo root: node --env-file=.env.local "$SCRATCH/explain-scale.mjs"
   // It reads through postgres-meta as the table owner, then repeats four reads as a signed-in admin.
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

   // Fresh statistics, so the plans before and after 0033 are compared on the same footing (0033's
   // expression index has none until an analyze).
   await pgQuery(
     'analyze public.profiles, public.markets, public.market_outcomes, public.bets, public.market_resolutions, public.coin_transactions, public.parlays, public.parlay_legs, public.tasks, public.task_completions',
   )

   // The busiest market, member and overridden resolution, so each plan reads real volume.
   const [{ id: marketId }] = await pgQuery('select market_id as id from bets group by market_id order by count(*) desc limit 1')
   const [{ id: actorId }] = await pgQuery('select profile_id as id from bets group by profile_id order by count(*) desc limit 1')
   const [{ id: resolutionId }] = await pgQuery(
     "select meta ->> 'resolution_id' as id from coin_transactions where meta ? 'resolution_id' group by 1 order by count(*) desc limit 1",
   )

   // The first page of each read the spec names, as the app sends it (50 rows, newest first).
   const queries = {
     feed: 'select * from activity_feed order by occurred_at desc, id desc limit 50',
     member_activity: `select * from activity_feed where actor_id = '${actorId}' order by occurred_at desc, id desc limit 50`,
     ledger: 'select id, profile_id, amount, type, meta, created_at from coin_transactions order by created_at desc, id desc limit 50',
     market_bets: `select id, outcome_id, amount, created_at, profile_id from bets where market_id = '${marketId}' order by created_at desc, id desc limit 50`,
     reversal_lookup: `select profile_id, amount, id from coin_transactions where meta ->> 'resolution_id' = '${resolutionId}' order by profile_id, id`,
   }

   function walk(node, out = []) {
     out.push(node)
     for (const child of node.Plans ?? []) walk(child, out)
     return out
   }

   // The same reads as a signed-in admin, through the access rules, as PostgREST runs them. This is
   // where the (select is_invited()) / (select is_admin()) wraps show.
   const [{ id: adminId, email: adminEmail }] = await pgQuery(
     'select id, email from profiles where is_admin order by email limit 1',
   )
   const asAdmin = `set local role authenticated; select set_config('request.jwt.claims', '${JSON.stringify({ sub: adminId, email: adminEmail, role: 'authenticated' })}', true);`
   for (const name of ['feed', 'member_activity', 'ledger', 'market_bets']) queries[`${name} (rls)`] = { sql: queries[name], prefix: asAdmin }

   for (const [name, entry] of Object.entries(queries)) {
     const { sql, prefix } = typeof entry === 'string' ? { sql: entry, prefix: '' } : entry
     const [row] = await pgQuery(`${prefix} explain (analyze, buffers, format json) ${sql}`)
     const plan = row['QUERY PLAN'][0]
     const nodes = walk(plan.Plan)
     const seq = nodes.filter((n) => n['Node Type'] === 'Seq Scan').map((n) => n['Relation Name'])
     const idx = [...new Set(nodes.flatMap((n) => (n['Index Name'] ? [n['Index Name']] : [])))]
     console.log(
       `${name.padEnd(22)} execution ${plan['Execution Time'].toFixed(2).padStart(8)} ms  planning ${plan['Planning Time'].toFixed(2).padStart(6)} ms  seq scans: ${seq.join(', ') || 'none'}`,
     )
     console.log(`${''.padEnd(22)} indexes: ${idx.join(', ') || 'none'}`)
   }

   // Task 1's member-activity check, at scale: with seq scans priced out, which relations still
   // have no index to use?
   const [forced] = await pgQuery(
     `set local enable_seqscan = off; explain (format json) ${queries.member_activity}`,
   )
   const forcedSeq = walk(forced['QUERY PLAN'][0].Plan)
     .filter((n) => n['Node Type'] === 'Seq Scan')
     .map((n) => `${n['Relation Name']}${n.Filter ? ` (${n.Filter})` : ''}`)
   console.log(`\nmember_activity with enable_seqscan off, seq scans: ${forcedSeq.join('; ') || 'none'}`)
   ```

   Run: `node --env-file=.env.local "$SCRATCH/explain-scale.mjs" | tee "$SCRATCH/explain-before.txt"`

4. Apply `0033` on top of the seeded data, without dropping it: `npx supabase migration up`. Unlike `db reset`, `migration up` applies only pending migrations, so the seed's rows survive. Expected: `Applying migration 0033_data_layer_scale.sql...`, with no error. This also proves `0033` applies over existing data.

5. Measure again: `node --env-file=.env.local "$SCRATCH/explain-scale.mjs" | tee "$SCRATCH/explain-after.txt"`

6. Compare the two files. What the integration run measured (median of three runs each, execution time):

   | Read (first page, 50 rows) | Before `0033` | After `0033` | Plan after |
   |---|---|---|---|
   | Feed, as a signed-in admin | 204 ms | 15.7 ms | the helper calls run once (InitPlan); the view's union still sorts in memory |
   | Member activity, as a signed-in admin | 16.2 ms | 1.5 ms | `bets_profile_created_idx`, `markets_current_resolution_id_idx`, `task_completions_profile_submitted_idx` |
   | Admin ledger, as a signed-in admin | 98.6 ms | 0.20 ms | `coin_transactions_created_idx`, no seq scan |
   | Market bets, as a signed-in admin | 1.10 ms | 0.23 ms | `bets_market_created_idx`, no seq scan |
   | Feed, as the table owner (no access rules) | 15.5 ms | 15.6 ms | unchanged: this is the union sort, which the spec leaves to a later events table |
   | Member activity, as the table owner | 1.54 ms | 0.60 ms | as above |
   | Admin ledger, as the table owner | 3.60 ms | 0.04 ms | `coin_transactions_created_idx` |
   | Market bets, as the table owner | 0.56 ms | 0.03 ms | `bets_market_created_idx` |
   | Override reversal lookup | 1.61 ms | 0.07 ms | `coin_transactions_resolution_id_idx` |

   The signed-in rows carry the access-rule rewrite. Before `0033`, `is_admin()` and `is_invited()` run once per row they check; after it, once per statement. The last line of each file is Task 1's member-activity check at scale, with sequential scans priced out. Before `0033` it lists `bets` twice, `markets` three times and nothing else. After it, it lists only `markets` filtered by `created_by`, the `market_created` branch the spec deliberately leaves unindexed.

   Expect the same shape: every "after" read of the ledger, market bets and the reversal lookup on its named index, and the signed-in feed and ledger down by an order of magnitude. Absolute times vary by machine. Record both files' numbers for the PR description.

7. Restore the normal dev database, before any other DB test: `npm run db:reset`

- [ ] **Step 5 (the controller, not the implementer): visual check at 375px and 1280px, light and dark**

The executing controller does this step, not a subagent. As in earlier plans, it takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed. It targets what's new in this PR: "Show more" and "Back to newest", the clawback message, and the error card both inside the chrome and bare. It doesn't repeat PR B's native-feel check.

**How the error cards are forced.** Each test takes one `select` grant away from `authenticated` through postgres-meta for the length of the test, then gives it back in a `finally`:
- **Inside the chrome:** `activity_feed`. The feed's own read fails, so `app/(app)/error.tsx` renders under the `(app)` layout's top and tab bars.
- **Bare:** `profiles`. The `(app)` layout's own profile read fails, so `app/error.tsx` renders with no chrome.

Both are real reads failing on a real server, with no rebuild and no second server. jsdom already covers each boundary's markup (Task 7).

1. Create `e2e/zz-visual-scale.spec.ts`:

```ts
import { test, expect, type Browser } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { STORAGE_STATE_PATH } from './global-setup'
import { localDateTimeString } from './local-date-time'
import { serviceClient } from '../tests/db/helpers'
import { clientForEmail } from '../tests/db/fixtures'
import { pgQuery } from '../tests/db/pg-query'
import { encodeCursor } from '../lib/pagination/cursor'

// Temporary: the controller's data-layer visual check. Delete this file after viewing the
// screenshots.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual-scale'

type Scheme = 'light' | 'dark'

async function openContext(browser: Browser, { width, scheme }: { width: number; scheme: Scheme }) {
  return browser.newContext({
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
    viewport: { width, height: width === 375 ? 812 : 800 },
    colorScheme: scheme,
  })
}

async function profile(match: { column: string; value: unknown }) {
  const { data, error } = await serviceClient().from('profiles').select('id, email').eq(match.column, match.value).single()
  if (error) throw error
  return data as { id: string; email: string }
}

// Moves a member's balance to `target` through a real admin adjustment.
async function setBalance(admin: SupabaseClient, memberId: string, target: number, reason: string) {
  const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', memberId).single()
  if (error) throw error
  if (data.balance === target) return
  const { error: adjustError } = await admin.rpc('adjust_balance', {
    p_profile_id: memberId,
    p_amount: target - data.balance,
    p_reason: reason,
  })
  if (adjustError) throw adjustError
}

// Takes a grant away from signed-in members for the length of `run`, so a real read fails
// the way an outage would, then gives it back whatever happens.
async function withoutSelect(table: string, run: () => Promise<void>) {
  await pgQuery(`revoke select on public.${table} from authenticated`)
  try {
    await run()
  } finally {
    await pgQuery(`grant select on public.${table} to authenticated`)
  }
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`

    test(`ledger Show more and Back to newest at ${width}px, ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000)
      const alice = await profile({ column: 'is_admin', value: true })
      const aliceClient = await clientForEmail(alice.email)
      for (let i = 0; i < 60; i++) {
        const { error } = await aliceClient.rpc('adjust_balance', {
          p_profile_id: alice.id,
          p_amount: i % 2 === 0 ? 1 : -1,
          p_reason: `Visual check ${i}`,
        })
        expect(error).toBeNull()
      }

      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()
      await page.goto('/admin/ledger')
      const ledger = page.getByRole('region', { name: 'Every coin movement' })
      await expect(ledger.getByRole('listitem')).toHaveCount(50)
      await page.screenshot({ path: shot('ledger-first-page'), fullPage: true })

      const lastRowBefore = await ledger.getByRole('listitem').last().textContent()
      await ledger.getByRole('link', { name: 'Show more' }).click()
      await expect.poll(() => ledger.getByRole('listitem').count()).toBeGreaterThan(50)
      expect(await ledger.getByRole('listitem').allTextContents()).toContain(lastRowBefore)
      await page.screenshot({ path: shot('ledger-show-more'), fullPage: true })

      // A window only starts past 500 rows, so open one directly, at the 10th newest row.
      const { data: rows, error } = await serviceClient()
        .from('coin_transactions')
        .select('id, created_at')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(10)
      if (error) throw error
      const tenth = rows.at(-1)!
      await page.goto(`/admin/ledger?before_from=${encodeCursor({ ts: tenth.created_at, id: String(tenth.id) })}`)
      await expect(ledger.getByRole('link', { name: 'Back to newest' })).toBeVisible()
      await page.screenshot({ path: shot('ledger-window'), fullPage: true })

      await context.close()
    })

    test(`clawback message at ${width}px, ${scheme}`, async ({ browser }) => {
      test.setTimeout(120_000)
      const alice = await profile({ column: 'is_admin', value: true })
      const bob = await profile({ column: 'display_name', value: 'Bob' })
      const aliceClient = await clientForEmail(alice.email)
      const bobClient = await clientForEmail(bob.email)
      await setBalance(aliceClient, bob.id, 100, 'Visual check top-up')

      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()
      await page.goto('/markets/new')
      await page.getByLabel('Title').fill(`Visual clawback ${width} ${scheme}`)
      await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
      await page.getByRole('button', { name: 'Create market' }).click()
      await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
      const marketId = new URL(page.url()).pathname.split('/').pop()!

      const db = serviceClient()
      const { data: outcomes, error: outcomeError } = await db.from('market_outcomes').select('id, label').eq('market_id', marketId)
      if (outcomeError) throw outcomeError
      // Bob's 20 on Yes is the whole pool, so Yes pays him back exactly 20.
      const { error: betError } = await bobClient.rpc('place_bet', {
        p_market_id: marketId,
        p_outcome_id: outcomes.find((o) => o.label === 'Yes')!.id,
        p_amount: 20,
      })
      expect(betError).toBeNull()

      await page.reload()
      await page.getByLabel('Winning outcome').selectOption({ label: 'Yes' })
      await page.getByRole('button', { name: 'Confirm outcome' }).click()
      await expect(page.getByText('Status: resolved')).toBeVisible()

      // Leave Bob 15 of the 20 he won, so the override is 5 short.
      await setBalance(aliceClient, bob.id, 15, 'Visual check clawback setup')

      await page.reload()
      await page.getByLabel('Winning outcome').selectOption({ label: 'No' })
      await page.getByRole('button', { name: 'Confirm outcome' }).click()
      await expect(page.getByText('Can’t override: Bob has already spent 5 of 20 DC won on this market.', { exact: false })).toBeVisible()
      await page.screenshot({ path: shot('clawback-message'), fullPage: true })

      await context.close()
    })

    test(`error card inside the chrome at ${width}px, ${scheme}`, async ({ browser }) => {
      // The feed's own read fails, so app/(app)/error.tsx catches it under the (app) layout.
      await withoutSelect('activity_feed', async () => {
        const context = await openContext(browser, { width, scheme })
        const page = await context.newPage()
        await page.goto('/feed')
        await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible()
        await page.screenshot({ path: shot('error-card-in-chrome'), fullPage: true })
        await context.close()
      })
    })

    test(`bare error card at ${width}px, ${scheme}`, async ({ browser }) => {
      // The (app) layout's own profile read fails, so app/error.tsx catches it, with no chrome.
      await withoutSelect('profiles', async () => {
        const context = await openContext(browser, { width, scheme })
        const page = await context.newPage()
        await page.goto('/')
        await expect(page.getByRole('heading', { level: 1, name: 'Something went wrong' })).toBeVisible()
        await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
        await page.screenshot({ path: shot('error-card-bare'), fullPage: true })
        await context.close()
      })
    })
  }
}
```

2. Run it on its own. Its global setup reseeds the database, as every e2e run does.

```bash
lsof -ti:3000 | xargs -r kill 2>/dev/null
VISUAL_OUT="$SCRATCH/visual" npx playwright test e2e/zz-visual-scale.spec.ts
```

Expected: 16 passed (4 tests at each of 4 width and scheme combinations), and 24 PNGs in `$SCRATCH/visual`: `ledger-first-page`, `ledger-show-more`, `ledger-window`, `clawback-message`, `error-card-in-chrome` and `error-card-bare`, at each combination. The server logs one `permission denied` error per error-card test; that is the forced failure.

3. View every PNG and check each item below.

   **Pagination** (`ledger-first-page`, `ledger-show-more`, `ledger-window`):
   - "Show more" sits below the list. It is a secondary-styled link, at least 44px tall, with no underline, in both themes.
   - After "Show more", the row that was last on the first page is still there, with older rows below it.
   - In the window, "Back to newest" sits above the list, inside the card.

   **Clawback** (`clawback-message`):
   - The inline error sits in the resolve form's existing error `Message`: "Can’t override: Bob has already spent 5 of 20 DC won on this market. Adjust their balances first if you still want to override."
   - It has the curly apostrophe, and token colours only (the `loss` family), not a raw red.

   **Error card** (`error-card-in-chrome`, `error-card-bare`):
   - Both show a centred card with the `CircleAlert` chip (`bg-loss-soft` / `text-loss`), "Something went wrong", the body copy and a "Try again" button at least 44px tall. The button is full width at 375px and auto width at 1280px, in both themes.
   - `error-card-in-chrome`: the top bar and tab bar (or the desktop nav at 1280px) are still around the card.
   - `error-card-bare`: no chrome at all, just the card on the page background.

   **Everywhere:** every control is at least 44px, and nothing scrolls sideways at 375px.

4. Delete `e2e/zz-visual-scale.spec.ts`, run `npm run db:reset`, and run `git status --short` to confirm the tree is clean.
5. Record every mismatch as a final-review finding.

- [ ] **Step 6 (the user, after deploy): post-deploy checklist**

Hand this to the user with the PR, and include it (plus the optional signing-keys note) in the
PR description:

> **After deploying, please check:**
> 1. `/markets`, a market, the admin ledger with "Show more", and the feed all load on
>    production.
> 2. Open the same account in two browser sessions (or two devices) and place a bet in one —
>    the other should update within a couple of seconds without a manual refresh.
> 3. Check Vercel's function logs for any new errors in the hour after deploy.
>
> **Optional:** this PR's `requireUser` can verify a signed-in session locally instead of
> calling Supabase Auth on every request, but only if the project uses asymmetric (ECC) JWT
> signing keys. If it's still on the legacy shared secret, everything keeps working exactly as
> before — this is a speed optimization, not something required for the PR. To turn it on:
> Supabase dashboard → Project Settings → API → JWT Settings → **Rotate to a new JWT signing
> key**, choosing an asymmetric (ECC) key. Existing sessions keep working through the rotation.

- [ ] **Step 7: Commit**

Nothing to commit: this task changes no product file. If Step 5's spec was left behind, delete it and re-run `git status --short` to confirm a clean tree before closing out the PR.

---
