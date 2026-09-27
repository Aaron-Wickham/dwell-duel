# Beta Readiness: Polish, Data Hygiene and Beta Touches (Sub-project 9, PR A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close DwellDuel's known rough edges before it's called a beta:
- a broken market link gets a real HTTP 404, not a soft one
- ranks update live, not just on a manual refresh
- every standalone link is a comfortable, 44px tap target
- text fields have limits, enforced by the database and explained in the form
- a missing setting fails loudly at startup instead of misbehaving quietly in production
- the app says it's a beta, and members get a one-tap way to send feedback

**Architecture:**
- **Database:** one migration, `0034_text_length_limits.sql` (Task 1). Eight `NOT VALID` `char_length` CHECK constraints, named `<table>_<column>_length`, plus `adjust_balance` recreated with a `char_length(p_reason) > 200` guard. `NOT VALID` means every new insert or update is checked from the moment the migration lands, but no existing row is re-validated, so the migration can't fail on data nobody has audited.
- **Forms:** `lib/forms/limits.ts` (Task 1) is the single source of truth for every limit (`TEXT_LIMITS`) and the shared message (`tooLong`), mirrored by the migration's numbers. Every listed input gets `maxLength`; every action that writes a limited column checks the trimmed length itself and returns the existing `{ formError, field }` shape rather than ever calling the RPC over the limit (Task 2).
- **Market 404:** `app/(app)/markets/[id]/page.tsx` follows the member-page pattern (Task 3) — `isUuid` and `getMarket` run, and `notFound()` is called if needed, before anything suspends; `loading.tsx` is deleted so nothing above that check can start a 200 stream. The chart, bets and outcomes/bet-form sections stream in behind their own `<Suspense>` boundaries with matching skeletons, reads still parallel.
- **Live updates:** `lib/live/page-subscriptions.ts` (Task 4) is the single place every page's realtime declarations live. `home()` and `member()` each carry (or gain) an unfiltered `{ table: 'profiles' }` entry, so a rank or member-count change refreshes those pages whenever any member's balance moves, not only the signed-in member's own.
- **Startup check:** `instrumentation.ts` at the repo root (Task 5) exports `register()`, which calls `lib/env/required.ts`'s `assertRequiredEnv()` — always requiring the two public Supabase vars, and additionally the service-role key and cron secret when `process.env.VERCEL_ENV === 'production'`. Next calls `register()` once when a server instance (`next dev` / `next start`) is initiated, before it serves a request; a missing variable throws, naming only the variable, never a value.
- **Beta touches:** `components/brand/beta-badge.tsx` (Task 6) is a small tokens-only `<span>` reading "Beta", placed beside the wordmark in the desktop `AppNav` header, tucked under the wordmark's right end in the phone header (a 375px bar with a five-digit balance has no width to spare), and under the sign-in card's symbol — always outside any surrounding link. `lib/app-shell/feedback.ts`'s `feedbackHref()` builds a `mailto:` link (address, subject, body all `encodeURIComponent`-encoded); Home's tile list gets a last "Send feedback" row as a real `<a href="mailto:…">`, not a routed `<Link>`.
- **Verification:** Task 7 runs the full chain, re-runs it on the Supabase CLI version CI pins (covering `0034` specifically), and hands the controller a visual pass plus the user a post-deploy checklist.

**Tech Stack:**
- Next.js 16.3.5 (App Router), React 19.2 and TypeScript
- Tailwind CSS v4
- Supabase: Postgres, Auth, Realtime; `@supabase/supabase-js` 2.116, `@supabase/ssr` 0.12.7
- Vitest 4 with React Testing Library and jsdom
- Playwright

**How this plan was checked.** All seven tasks were applied in order, from this text, to a fresh copy of `beta-readiness` (`3031e7e`), on local Supabase (CLI 2.117.0), and after each task the full chain ran (`npx next typegen`, lint, tsc, `npx vitest run`, build, Playwright), with `npm run db:reset` first for Task 1:
- lint and tsc were clean after every task
- `npx vitest run` passed after every task, DB tests included: 1003, 1036, 1039, 1045, 1053, 1061 tests after Tasks 1–6 (148, 155, 156, 157, 158, 160 files; 43 in `tests/db/` throughout), and 1061 in 160 in Task 7, from 987 in 146 before
- the build passed after every task, with the same 20 routes as `3031e7e`
- Playwright passed 26, 26, 27, 27, 27, 27 after Tasks 1–6, and 27 in Task 7
- each task's red step failed as its text says, and each step's run gave the count it states
- Task 5's startup check ran for real: `next start` with `.env.local` answered `200`, and with the anon key missing it logged the one-line error and answered `500`
- Task 7's visual-check spec ran, 14 passed, 24 screenshots, and was then deleted

Integration fixed four things in the drafted text. The phone Beta badge overflowed the 375px bar (Task 6). The visual spec's skeleton capture, badge locator and too-long-title fill all failed as drafted (Task 7). Two red-step expectations were wrong (Tasks 4 and 6). And Task 5's start-and-curl snippet left the server running and didn't wait for it to be ready. Re-applying the final Tasks 1–6 to a second fresh copy of `3031e7e` reproduced the identical tree. Not run: Task 7's pinned-CLI re-run (Step 2), the Vercel environment check (Step 5), and the post-deploy checks (Step 6).

**Spec:** [`docs/superpowers/specs/2026-09-27-beta-readiness-design.md`](../specs/2026-09-27-beta-readiness-design.md). Its references are to `main` at `de15938` (data-layer-scale merged); this plan starts from `beta-readiness` at `3031e7e`, which adds only the spec.

**Commits** end with the `Co-Authored-By:` trailer the implementer's own session specifies. The commit commands below omit it.

## Global Constraints

- **Scope:** only what this spec lists.
- **One migration,** `0034`. It adds `NOT VALID` CHECKs, and it recreates `adjust_balance` with the reason limit and nothing else. No other change to coin-moving behaviour, and no change to access rules.
- **The e2e contract.** Every existing asserted string, role and count keeps resolving. The signed-out 307 is unchanged, and so is the member page's real 404. Existing specs may gain waits, never changed assertions.
- **UI conventions:**
  - tokens only, phone-first, 44px controls, real elements
  - reduced motion respected
  - links underlined unless they're styled as a control
  - errors shown inline with `aria-invalid` / `aria-describedby`
- **E2E counts:** 26 before this PR, then after each task: 26, 26, 27, 27, 27, 27, 27. Task 3 adds `e2e/market-not-found.spec.ts`; no later task changes the count.
- **Vitest counts:** 987 tests in 146 files before this PR, 42 of them in `tests/db/`. After each task, as measured by applying the tasks in order on one branch and running the full suite against local Supabase:

  | Task | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
  |---|---|---|---|---|---|---|---|
  | Tests | 1003 | 1036 | 1039 | 1045 | 1053 | 1061 | 1061 |
  | Files | 148 | 155 | 156 | 157 | 158 | 160 | 160 |
  | In `tests/db/` | 43 | 43 | 43 | 43 | 43 | 43 | 43 |
  | E2E | 26 | 26 | 27 | 27 | 27 | 27 | 27 |
- **A fresh checkout runs `npx next typegen` once** (or a build) before its first `npx tsc --noEmit`. Until then `PageProps` and `LayoutProps` don't exist, and tsc fails on route files that use them. Confirmed directly: a `.next` left over from an earlier task's build can also go stale enough to fail tsc with `TS2307` on a moved or deleted route file — re-run `npx next typegen` whenever tsc complains about a route type that no longer matches the tree.
- **Code style:** single quotes, no semicolons, and comments only for a non-obvious why. Quote `(app)` / `(home)` / `(auth)` / `[id]` paths in shell commands.
- **Next.js 16 differs from older versions.** Read `node_modules/next/dist/docs/` before writing anything Next-specific.
- **Local Supabase must be running** for any task that touches `0034` or runs `tests/db/*`. `npm run db:reset` after any change to `0034`.
- **Commits carry no attribution line.** Each task's commit message is imperative, with nothing after it; the implementer's own session appends its own trailer (for example `Co-Authored-By:`) when it actually commits — this plan's commit commands never include one.

## Rulings this plan makes

- **`NOT VALID`, throughout.** Every one of the eight length CHECKs, and `0034` as a whole, lands as `not valid`: Postgres enforces it on every insert or update from the instant the migration commits, but existing rows are never re-scanned or re-validated, so the migration can't fail because of data nobody has audited (per the spec's non-goal: "Validating existing rows against the new length limits" is explicitly out of scope). A later migration could `validate constraint` each one once the data is known-clean, but that's not part of this PR.
- **`adjust_balance` lives inside `0034`, not a separate migration.** It's `create or replace`d there, byte-identical to `0024`'s body apart from one added guard (`if char_length(p_reason) > 200 then raise exception 'reason too long'; end if;`, placed after the existing empty-reason check). `security definer`, `search_path = ''` and every grant carry over untouched — `create or replace` never drops a function's grants — and this is the only behavioural change `0034` makes to coin-moving SQL.
- **No `loading.tsx` on market detail.** `app/(app)/markets/[id]/loading.tsx` is deleted (Task 3), because a `loading.js` wraps its `page.js` and every child segment in an implicit `<Suspense>`, so its skeleton would start a 200 stream before the page's `isUuid` / `getMarket` check ever runs — exactly the soft-404 bug this PR fixes. A one-line comment, matching the member page's, marks the omission so nobody adds it back. The list route keeps its own `markets/loading.tsx` (content unchanged apart from a why-comment); the spec's requirement that it stay is honoured even though Task 3 has to relocate the list's `page.tsx` and `loading.tsx` into an `app/(app)/markets/(list)/` route group so the *list's* boundary stops sitting above the *detail* route once `[id]/loading.tsx` is gone. The URL for the list stays `/markets` either way — a route group changes no path.
- **The feedback link is a real `mailto:`, never a routed `<Link>`.** `feedbackHref()` (`lib/app-shell/feedback.ts`) builds `mailto:<FEEDBACK_EMAIL>?subject=<encodeURIComponent(FEEDBACK_SUBJECT)>&body=<encodeURIComponent("App version: <v>\n\n")>`; the Home tile renders it as a plain `<a href={...}>`, not through `HomeTiles`' existing `<Link>` branch, so it carries no `transitionTypes` and never goes through Next's client-side router — the device's mail app opens outside DwellDuel, exactly as the spec's non-goal ("no feedback form or storage") intends.
- **Live ranks reach further than "the signed-in member's own row."** The spec's `home()` / `member()` changes (1b) are about the *rank number itself* moving, not just the viewer's own balance — `getMemberStanding` depends on every member's balance, so both pages' `pageSubscriptions` entries watch an unfiltered `profiles` table, layered onto (not replacing) whatever each page's own live channel already needed the base subscription for.
- **Tap targets keep their visual weight and underline; only the hit area grows.** Each of the five links (spec 1c) gets `inline-flex min-h-11 items-center` added to its existing classes — nothing else about size, weight or colour changes. `placed-parlay.tsx`'s leg-title link sits inside a running sentence (title, an em dash, the picked outcome); growing its own box to 44px tall necessarily grows the row that contains it, which is accepted rather than avoided.
- **`instrumentation.ts` reads `process.env` directly; `missingEnv` never does.** `assertRequiredEnv(env = process.env)` is the one function allowed an implicit environment; `missingEnv(env)` always takes an explicit object, so its tests (and any future caller) never depend on ambient state. `register()` runs once per server instance (`next dev` / `next start`), **not** during `next build`, which was confirmed directly (see Task 5) — the startup check therefore only proves itself at `next start`, the mode both Playwright and Vercel production actually run.
- **Controller ruling: Task 3's route-group move is accepted, amending the spec.** The spec said only "delete `markets/[id]/loading.tsx`". But the list's `markets/loading.tsx` also wrapped `/markets/[id]`, so deleting only the detail skeleton would still have left a soft 404 (a `200` with the list skeleton in the body). Task 3 therefore moves the list's `page.tsx` and `loading.tsx` into `app/(app)/markets/(list)/`. The URL is still `/markets`, and the list skeleton's content is unchanged apart from a why-comment.
- **Controller ruling: Task 2's additions to the error shape are accepted.** `createMarketAction` returns `field: 'outcome_N'` (1-based) for a too-long outcome label, so the message is tied to that outcome's input. The review actions' `ActionState` and `BulkActionState` gain `field?: 'reason'`. Everything else keeps the existing `{ formError, field }` shape.
- **Controller ruling: two tasks edit `adjust-balance-form.tsx`, and both edits survive.** Task 2 makes two in-place edits: the `TEXT_LIMITS` import, and `maxLength` on the Reason input. Task 4 then changes only the member-name `<Link>`, with an anchored replace. Neither task replaces the whole file. Checked on the integrated branch: after Task 4, the file carries all three changes.
- **Controller ruling: the market-skeleton screenshot loads the page with JavaScript off, not under CDP throttling.** The drafted CDP-throttled capture never found `[data-skeleton="market-chart"]` in a trial run. Holding the RSC request with `page.route`, as earlier specs do, doesn't apply either: it only shows a route's `loading.tsx`, which Task 3 removes. With JavaScript off, the browser stops at the first paint, the shell plus the four fallbacks, because the resolved sections arrive as hidden segments that only React's inline scripts swap in. That's deterministic, and it only shows fallbacks if the page really streamed (Task 7, Step 4).
- **Controller ruling: `instrumentation.ts` is safe for local and Playwright runs.** `next build` never runs `register()`; `next start` does, before it serves any request. Checked on the integrated branch: `next start` with `.env.local` (the two Supabase vars plus the service-role key, `VERCEL_ENV` unset, no `CRON_SECRET`) answers `200` on `/sign-in`, and Playwright's own `npm run build && npm run start` server passes all 27 specs after Task 5. With `.env.local` moved aside and only `NEXT_PUBLIC_SUPABASE_URL` set, `next start` logs `Missing required environment variables: NEXT_PUBLIC_SUPABASE_ANON_KEY` and answers `500`. `register()` reads the vars at runtime through `env[name]`, so Vercel's runtime environment must define all four in production (Task 7, Step 5).
- **Integration ruling: on phones the Beta badge tucks under the wordmark.** `e2e/app-nav.spec.ts` asserts that the 375px top bar doesn't overflow with a five-digit admin balance. That bar had about 2px to spare, and the badge placed beside the wordmark overflowed it by 39px (measured). So the phone header positions the badge absolutely under the right end of the wordmark, where it takes no width, with `pointer-events-none` so the link's lower strip stays tappable. The desktop header keeps it beside the wordmark. That's still "next to `<Wordmark />`" in both headers and outside the link, as the spec asks (Task 6, Step 4).

---

## Task 1: Length limits in the database

Member-entered text has no length limit today, so a pasted essay can land in a market title or a task description and break every layout it appears in. This task adds the limits where they can't be skipped, in the database, and the shared constants the forms use in Task 2:
- `lib/forms/limits.ts` holds the nine limits as `TEXT_LIMITS`, and `tooLong(label, max)` builds the one message pattern the app uses: "Title can be at most 120 characters."
- `0034_text_length_limits.sql` adds eight named CHECK constraints on `char_length(column)`, each `NOT VALID`: every insert and update from now on is checked, but existing rows aren't, so the migration can't fail on production data nobody has inspected. A null in a nullable column passes.
- The balance-adjust reason lives in the ledger's `meta` JSON, not in a text column, so `adjust_balance` is recreated to raise `reason too long` past 200 characters. Nothing else about the function changes, and `create or replace` keeps its grants.

`char_length` counts characters (code points), not bytes, so "é" counts once. The app's own checks in Task 2 use JavaScript's `.length` (UTF-16 units, the same unit as the browser's `maxLength`), which is never smaller than `char_length`. So the app is at least as strict as the database, and never lets through what the database would refuse.

A `NOT VALID` CHECK still applies to every new version of a row. An older over-limit row can be read and deleted, but an update to any of its columns fails until the long value is shortened. The DB test pins that.

**Files:**
- Create: `lib/forms/limits.ts`
- Create: `supabase/migrations/0034_text_length_limits.sql`
- Test, create: `tests/lib/forms/limits.test.ts`, `tests/db/text-length-limits.test.ts`

**Interfaces:**
- Consumes:
  - `adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)` from `0024_adjust_balance.sql`, unchanged since: `security definer`, `set search_path = ''`; execute revoked from `public` and `anon`, granted to `authenticated` and `service_role`.
  - `serviceClient()` (`tests/db/helpers.ts`); `seedMembers`, `clientFor`, `createTestMarket`, `createTestTask`, `Member`, `TestMarket` (`tests/db/fixtures.ts`); `pgQuery` (`tests/db/pg-query.ts`). A multi-statement `pgQuery` runs as one implicit transaction.
- Produces:
  - `lib/forms/limits.ts`, used by Task 2:
    ```ts
    export const TEXT_LIMITS = {
      marketTitle: 120,
      marketDescription: 1000,
      outcomeLabel: 60,
      taskTitle: 120,
      taskDescription: 1000,
      reviewNote: 500,
      adjustReason: 200,
      inviteEmail: 254,
      displayName: 80,
    } as const
    export function tooLong(label: string, max: number): string // `${label} can be at most ${max} characters.`
    ```
    It's a plain module, not `'use server'`, so client forms and server actions can both import it.
  - Eight constraints, each `check (char_length(<col>) <= N) not valid`: `markets_title_length` (120), `markets_description_length` (1000), `market_outcomes_label_length` (60), `tasks_title_length` (120), `tasks_description_length` (1000), `task_completions_review_note_length` (500), `allowed_emails_email_length` (254), `profiles_display_name_length` (80). A violation is Postgres `23514`, and its message names the constraint.
  - `adjust_balance` raises `reason too long` when `char_length(p_reason) > 200`, after the existing empty-reason check.

- [ ] **Step 1: Write the failing unit test**

Create `tests/lib/forms/limits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

describe('TEXT_LIMITS', () => {
  it('holds the limits the database enforces', () => {
    expect(TEXT_LIMITS).toEqual({
      marketTitle: 120,
      marketDescription: 1000,
      outcomeLabel: 60,
      taskTitle: 120,
      taskDescription: 1000,
      reviewNote: 500,
      adjustReason: 200,
      inviteEmail: 254,
      displayName: 80,
    })
  })
})

describe('tooLong', () => {
  it('names the field and its limit', () => {
    expect(tooLong('Title', 120)).toBe('Title can be at most 120 characters.')
  })

  it('names a numbered outcome', () => {
    expect(tooLong('Outcome 3', TEXT_LIMITS.outcomeLabel)).toBe('Outcome 3 can be at most 60 characters.')
  })
})
```

Run: `npx vitest run tests/lib/forms/limits.test.ts`
Expected: FAIL. The file can't load, because `@/lib/forms/limits` doesn't exist yet.

- [ ] **Step 2: Add the limits module**

Create `lib/forms/limits.ts`:

```ts
// supabase/migrations/0034_text_length_limits.sql enforces these same numbers.
export const TEXT_LIMITS = {
  marketTitle: 120,
  marketDescription: 1000,
  outcomeLabel: 60,
  taskTitle: 120,
  taskDescription: 1000,
  reviewNote: 500,
  adjustReason: 200,
  inviteEmail: 254,
  displayName: 80,
} as const

export function tooLong(label: string, max: number): string {
  return `${label} can be at most ${max} characters.`
}
```

Run: `npx vitest run tests/lib/forms/limits.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 3: Write the failing DB test**

Local Supabase must be running.

Run: `npm run db:reset`
Expected: the reset applies migrations through `0033_data_layer_scale.sql` without error.

Create `tests/db/text-length-limits.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, createTestMarket, createTestTask, type Member, type TestMarket } from './fixtures'
import { pgQuery } from './pg-query'

let alice: Member
let bob: Member
let adminClient: SupabaseClient
let market: TestMarket
let taskId: string
let completionId: string

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
  const db = serviceClient()
  const { error: adminErr } = await db.from('profiles').update({ is_admin: true }).eq('id', alice.id)
  if (adminErr) throw adminErr
  adminClient = await clientFor(alice)
  market = await createTestMarket(adminClient, ['Yes', 'No'])
  ;({ taskId } = await createTestTask(alice))
  const { data, error } = await db
    .from('task_completions')
    .insert({ task_id: taskId, profile_id: bob.id, reward_amount: 10, period_key: 'once' })
    .select('id')
    .single()
  if (error) throw error
  completionId = data.id
})

type Write = (value: string) => PromiseLike<{ error: PostgrestError | null }>

const CASES: { constraint: string; max: number; write: Write }[] = [
  {
    constraint: 'markets_title_length',
    max: 120,
    write: (v) => serviceClient().from('markets').update({ title: v }).eq('id', market.marketId),
  },
  {
    constraint: 'markets_description_length',
    max: 1000,
    write: (v) => serviceClient().from('markets').update({ description: v }).eq('id', market.marketId),
  },
  {
    constraint: 'market_outcomes_label_length',
    max: 60,
    write: (v) => serviceClient().from('market_outcomes').update({ label: v }).eq('id', market.outcomeIds[0]),
  },
  {
    constraint: 'tasks_title_length',
    max: 120,
    write: (v) => serviceClient().from('tasks').update({ title: v }).eq('id', taskId),
  },
  {
    constraint: 'tasks_description_length',
    max: 1000,
    write: (v) => serviceClient().from('tasks').update({ description: v }).eq('id', taskId),
  },
  {
    constraint: 'task_completions_review_note_length',
    max: 500,
    write: (v) => serviceClient().from('task_completions').update({ review_note: v }).eq('id', completionId),
  },
  {
    constraint: 'allowed_emails_email_length',
    max: 254,
    write: (v) => serviceClient().from('allowed_emails').insert({ email: v }),
  },
  {
    constraint: 'profiles_display_name_length',
    max: 80,
    write: (v) => serviceClient().from('profiles').update({ display_name: v }).eq('id', bob.id),
  },
]

describe('text length limits', () => {
  // 'é' is two bytes in UTF-8, so accepting it at the limit shows the check counts characters.
  it.each(CASES)('$constraint accepts $max characters and refuses one more', async ({ constraint, max, write }) => {
    const atLimit = await write('é'.repeat(max))
    expect(atLimit.error).toBeNull()

    const over = await write('b'.repeat(max + 1))
    expect(over.error?.code).toBe('23514')
    expect(over.error?.message).toContain(constraint)
  })

  it('adds every limit without checking the rows already there', async () => {
    const rows = await pgQuery<{ conname: string; convalidated: boolean }>(`
      select conname, convalidated from pg_constraint
      where conname in (${CASES.map((c) => `'${c.constraint}'`).join(', ')})
      order by conname
    `)
    expect(rows).toEqual(
      CASES.map((c) => ({ conname: c.constraint, convalidated: false })).sort((a, b) => a.conname.localeCompare(b.conname)),
    )
  })

  it('leaves an older over-limit row in place, refuses other edits to it, and lets it be shortened', async () => {
    // A CHECK can't be bypassed by the service role or session_replication_role, so the older row
    // is made the way production rows were: with the limit absent. All three statements run in one
    // transaction, and the limit comes back exactly as 0034 adds it.
    const longTitle = 't'.repeat(121)
    await pgQuery(`
      alter table public.tasks drop constraint tasks_title_length;
      insert into public.tasks (title, reward_amount, created_by) values ('${longTitle}', 5, '${alice.id}');
      alter table public.tasks add constraint tasks_title_length check (char_length(title) <= 120) not valid;
    `)
    const db = serviceClient()
    const { data: older, error: readErr } = await db.from('tasks').select('id').eq('title', longTitle).single()
    expect(readErr).toBeNull()

    const { error: rewardErr } = await db.from('tasks').update({ reward_amount: 6 }).eq('id', older!.id)
    expect(rewardErr?.code).toBe('23514')
    expect(rewardErr?.message).toContain('tasks_title_length')

    const { error: shortenErr } = await db.from('tasks').update({ title: 'Read Genesis 1-3' }).eq('id', older!.id)
    expect(shortenErr).toBeNull()
    const { data: after } = await db.from('tasks').select('title').eq('id', older!.id).single()
    expect(after?.title).toBe('Read Genesis 1-3')
  })
})

describe('adjust_balance reason limit', () => {
  async function bobsAdjustments(): Promise<{ amount: number; reason: string }[]> {
    const { data, error } = await serviceClient()
      .from('coin_transactions')
      .select('amount, meta')
      .eq('profile_id', bob.id)
      .eq('type', 'admin_adjustment')
    if (error) throw error
    return data.map((t) => ({ amount: t.amount, reason: t.meta.reason }))
  }

  async function bobsBalance(): Promise<number> {
    const { data, error } = await serviceClient().from('profiles').select('balance').eq('id', bob.id).single()
    if (error) throw error
    return data.balance
  }

  it('refuses a reason over 200 characters, changing nothing', async () => {
    const before = await bobsBalance()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: bob.id,
      p_amount: 5,
      p_reason: 'r'.repeat(201),
    })

    expect(error?.message).toBe('reason too long')
    expect(await bobsBalance()).toBe(before)
    expect(await bobsAdjustments()).toEqual([])
  })

  it('still adjusts with a reason of exactly 200 characters', async () => {
    const before = await bobsBalance()
    const reason = 'é'.repeat(200)

    const { error } = await adminClient.rpc('adjust_balance', { p_profile_id: bob.id, p_amount: 5, p_reason: reason })

    expect(error).toBeNull()
    expect(await bobsBalance()).toBe(before + 5)
    expect(await bobsAdjustments()).toEqual([{ amount: 5, reason }])
  })

  it('keeps its grants and its locked-down search path', async () => {
    const [fn] = await pgQuery<{
      anon: boolean
      authenticated: boolean
      service_role: boolean
      security_definer: boolean
      config: string
    }>(`
      select
        has_function_privilege('anon', 'public.adjust_balance(uuid, integer, text)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.adjust_balance(uuid, integer, text)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.adjust_balance(uuid, integer, text)', 'execute') as service_role,
        p.prosecdef as security_definer,
        array_to_string(p.proconfig, ',') as config
      from pg_proc p
      where p.oid = 'public.adjust_balance(uuid, integer, text)'::regprocedure
    `)
    expect(fn).toEqual({ anon: false, authenticated: true, service_role: true, security_definer: true, config: 'search_path=""' })
  })
})
```

Why the older row is made by dropping and re-adding the constraint: a CHECK constraint binds every role, the service role and superusers included, and `set session_replication_role = replica` only switches off triggers and foreign keys, not CHECKs. So the only way to get a row that predates the limit is to take the limit away for one insert. The three statements run in one `pgQuery` call, which is one transaction, and the constraint comes back exactly as 0034 defines it.

Run: `npx vitest run tests/db/text-length-limits.test.ts`
Expected: FAIL, with 11 failed and 2 passed:
- the eight limit cases fail on `over.error?.code`, because the over-limit write succeeds
- the `NOT VALID` catalog case gets `[]`
- the older-row case's `pgQuery` throws a `postgres-meta 400` saying constraint `tasks_title_length` does not exist
- the 201-character reason is accepted
- the 200-character reason and the grants case pass, since they describe 0024 as it is

- [ ] **Step 4: Add the migration and apply it**

Create `supabase/migrations/0034_text_length_limits.sql`:

```sql
-- Length limits on member-entered text. lib/forms/limits.ts holds the same
-- numbers, so the forms explain a limit before the database has to refuse it.
--
-- NOT VALID: every insert and update from now on is checked, but existing rows
-- aren't, so this migration can't fail on production data nobody has
-- inspected. A null in a nullable column passes.
alter table public.markets
  add constraint markets_title_length check (char_length(title) <= 120) not valid;
alter table public.markets
  add constraint markets_description_length check (char_length(description) <= 1000) not valid;
alter table public.market_outcomes
  add constraint market_outcomes_label_length check (char_length(label) <= 60) not valid;
alter table public.tasks
  add constraint tasks_title_length check (char_length(title) <= 120) not valid;
alter table public.tasks
  add constraint tasks_description_length check (char_length(description) <= 1000) not valid;
alter table public.task_completions
  add constraint task_completions_review_note_length check (char_length(review_note) <= 500) not valid;
alter table public.allowed_emails
  add constraint allowed_emails_email_length check (char_length(email) <= 254) not valid;
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 80) not valid;

-- The balance-adjust reason is stored in the ledger's meta JSON, not a text
-- column, so the function enforces its limit. Identical to 0024 apart from the
-- length check; create or replace keeps its grants.
create or replace function public.adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'only an admin can adjust a balance';
  end if;

  if p_amount = 0 then
    raise exception 'adjustment amount must not be zero';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for a balance adjustment';
  end if;

  if char_length(p_reason) > 200 then
    raise exception 'reason too long';
  end if;

  perform public.apply_coin_transaction(
    p_profile_id, p_amount, 'admin_adjustment',
    jsonb_build_object('reason', p_reason, 'adjusted_by', auth.uid())
  );
end;
$$;
```

The function body is 0024's, byte for byte, plus the one `if char_length(p_reason) > 200` block after the empty check. To confirm, run:

```bash
diff <(sed -n '/^as \$\$/,/^\$\$;/p' supabase/migrations/0024_adjust_balance.sql) <(sed -n '/^as \$\$/,/^\$\$;/p' supabase/migrations/0034_text_length_limits.sql)
```

Expected: exactly one hunk, adding the four lines of the length check (`14a15,18`).

Run: `npm run db:reset`
Expected: the reset applies migrations through `0034_text_length_limits.sql` without error.

Run: `npx vitest run tests/db/text-length-limits.test.ts tests/db/adjust-balance.test.ts`
Expected: PASS. The 13 new cases, and `adjust-balance.test.ts` unchanged.

- [ ] **Step 5: Verify**

Local Supabase must be running, with 0034 applied (Step 4).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 1003 tests in 148 files, 43 of them in `tests/db/`. This task adds 16 tests in 2 files (3 unit, 13 in `tests/db/`). No existing fixture or seed writes a value over any limit.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 26 passed, the same as before. No e2e spec types more than a limit allows.

- [ ] **Step 6: Commit**

```bash
git add lib/forms/limits.ts supabase/migrations/0034_text_length_limits.sql tests/lib/forms/limits.test.ts tests/db/text-length-limits.test.ts
git commit -m "Limit the length of member-entered text in the database"
```

---

## Task 2: Friendly errors in the app

Task 1's limits make the database refuse over-long text, but a refusal from there reaches the member as a raw constraint error. This task explains each limit in the form before anything is written:
- **Inputs.** Every input for a limited field gets `maxLength={TEXT_LIMITS.x}`, so the browser stops typing at the limit. That covers the market title, description and outcome labels; the task title and description, in the create and edit forms; the single and shared rejection reasons; the balance-adjust reason; and the invite email.
- **Actions.** Every server action that writes one of these fields checks its length after trimming, and returns the existing `{ formError, field }` shape with `tooLong(...)` without writing anything. `maxLength` can be bypassed, and an old task being edited can already be over the limit (browsers don't flag an untouched default value), so this check is what the member actually sees in those cases.
- **Outcome labels** are named by their place in the form: "Outcome 3 can be at most 60 characters." The error is tied to that outcome's input, through a new `field` value, `outcome_3`.
- **Display name.** `createOwnProfile` cuts a Google-supplied name to 80 characters before inserting, so sign-up never fails on a long name. It cuts by code point, the unit `char_length` counts, so an emoji is never split in half. It doesn't trim whitespace, which keeps every name of 80 characters or fewer exactly as it is today.

The new messages, all from `tooLong`:
- "Title can be at most 120 characters." (market and task)
- "Description can be at most 1000 characters." (market and task)
- "Outcome N can be at most 60 characters."
- "Reason can be at most 500 characters." (single and shared rejection)
- "Reason can be at most 200 characters." (balance adjust)
- "Email can be at most 254 characters."

**Files:**
- Modify: `lib/markets/create-market.ts`, `lib/tasks/create-task.ts`, `lib/tasks/update-task.ts`, `lib/tasks/review-task-completion.ts`, `lib/members/adjust-balance.ts`, `lib/invites/add-invite.ts`, `lib/auth/create-own-profile.ts`
- Modify: `app/(app)/markets/new/create-market-form.tsx`, `app/(app)/admin/tasks/create-task-form.tsx`, `app/(app)/admin/tasks/edit-task-form.tsx`, `app/(app)/admin/tasks/review-buttons.tsx`, `app/(app)/admin/tasks/pending-approvals.tsx`, `app/(app)/admin/invites/add-invite-form.tsx`
- Modify, two in-place edits: `app/(app)/admin/members/adjust-balance-form.tsx` (Task 4 also edits this file)
- Test, create: `tests/lib/markets/create-market-action.test.ts`, `tests/lib/tasks/create-task-action.test.ts`, `tests/lib/tasks/update-task-action.test.ts`, `tests/lib/tasks/reject-reason-length.test.ts`, `tests/lib/invites/add-invite.test.ts`, `tests/lib/auth/create-own-profile.test.ts`, `tests/components/form-text-limits.test.tsx`
- Test, modify: `tests/lib/members/adjust-balance-action.test.ts` (append one `describe`)

`lib/invites/actions.ts` and `app/(auth)/callback/route.ts` are unchanged: the first already passes `addInvite`'s `formError` through, and the second already passes the Google name to `createOwnProfile`.

**Interfaces:**
- Consumes: `TEXT_LIMITS` and `tooLong` from `lib/forms/limits.ts` (Task 1).
- Produces:
  - `createMarketAction`'s `ActionState['field']` gains `'description'` and `` `outcome_${number}` `` (1-based, counting every outcome input, blanks included). `'outcomes'` still means too few outcomes and still points at the first input.
  - `createTaskAction` and `updateTaskAction`'s `field` gains `'description'`.
  - `review-task-completion.ts`: `ActionState` gains `field?: 'reason'`, and `BulkActionState` gains `field?: 'reason'`. The bulk summaries and every other return are unchanged.
  - `addInvite` returns `{ ok: false, formError: 'Email can be at most 254 characters.' }` for an over-long email, checked before the format check.
  - `createOwnProfile` inserts at most 80 code points of `displayName`.
  - Order inside each action: the existing "missing" check, then the length check, then everything else as before. No over-long value reaches `rpc`, `insert` or `update`.

- [ ] **Step 1: Write the failing action tests**

Create `tests/lib/markets/create-market-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, redirect } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() }, redirect: vi.fn() }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'member-1' } }) }))
vi.mock('next/navigation', () => ({ redirect }))

import { createMarketAction } from '@/lib/markets/create-market'

const CLOSE_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString()

function binaryForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('kind', 'binary')
  form.set('close_at', CLOSE_AT)
  form.append('outcome_labels', 'Yes')
  form.append('outcome_labels', 'No')
  return form
}

function multipleChoiceForm(outcomes: string[]) {
  const form = new FormData()
  form.set('title', 'Who wins the trivia night?')
  form.set('kind', 'multiple_choice')
  form.set('close_at', CLOSE_AT)
  form.set('outcome_labels_text', outcomes.join('\n'))
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
  supabase.rpc.mockResolvedValue({ data: 'market-1', error: null })
  redirect.mockReset()
})

describe('createMarketAction length limits', () => {
  it('refuses a title over 120 characters without creating anything', async () => {
    const state = await createMarketAction(undefined, binaryForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('measures the title after trimming, so 120 characters with spaces around them is allowed', async () => {
    const title = 'a'.repeat(120)

    await createMarketAction(undefined, binaryForm(`  ${title}  `))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_title: title }))
    expect(redirect).toHaveBeenCalledWith('/markets/market-1')
  })

  it('refuses a description over 1000 characters without creating anything', async () => {
    const state = await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('allows a description of exactly 1000 characters', async () => {
    await createMarketAction(undefined, binaryForm('Will it rain?', 'd'.repeat(1000)))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_description: 'd'.repeat(1000) }))
  })

  it('names the outcome that is too long by its place in the form, blanks included', async () => {
    const state = await createMarketAction(undefined, multipleChoiceForm(['Red', '', 'x'.repeat(61), 'Blue']))

    expect(state).toEqual({ formError: 'Outcome 3 can be at most 60 characters.', field: 'outcome_3' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('allows outcomes of exactly 60 characters', async () => {
    const long = 'x'.repeat(60)

    await createMarketAction(undefined, multipleChoiceForm(['Red', long]))

    expect(supabase.rpc).toHaveBeenCalledWith('create_market', expect.objectContaining({ p_outcome_labels: ['Red', long] }))
  })
})
```

Create `tests/lib/tasks/create-task-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, insert } = vi.hoisted(() => {
  const insert = vi.fn()
  return { insert, supabase: { from: vi.fn(() => ({ insert })) } }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createTaskAction } from '@/lib/tasks/create-task'

function taskForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('reward_amount', '10')
  return form
}

beforeEach(() => {
  supabase.from.mockClear()
  insert.mockReset()
  insert.mockResolvedValue({ error: null })
})

describe('createTaskAction length limits', () => {
  it('refuses a title over 120 characters without writing anything', async () => {
    const state = await createTaskAction(undefined, taskForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a description over 1000 characters without writing anything', async () => {
    const state = await createTaskAction(undefined, taskForm('Read Genesis 1-3', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('creates a task whose title and description are exactly at their limits, measured after trimming', async () => {
    const title = 'a'.repeat(120)
    const description = 'd'.repeat(1000)

    const state = await createTaskAction(undefined, taskForm(` ${title} `, ` ${description} `))

    expect(state).toBeUndefined()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ title, description }))
  })
})
```

Create `tests/lib/tasks/update-task-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase, update, eq } = vi.hoisted(() => {
  const eq = vi.fn()
  const update = vi.fn(() => ({ eq }))
  return { update, eq, supabase: { from: vi.fn(() => ({ update })) } }
})
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { updateTaskAction } from '@/lib/tasks/update-task'

function taskForm(title: string, description = '') {
  const form = new FormData()
  form.set('title', title)
  form.set('description', description)
  form.set('reward_amount', '10')
  form.set('is_active', 'on')
  return form
}

beforeEach(() => {
  supabase.from.mockClear()
  update.mockClear()
  eq.mockReset()
  eq.mockResolvedValue({ error: null })
})

describe('updateTaskAction length limits', () => {
  it('refuses a title over 120 characters without writing anything', async () => {
    const state = await updateTaskAction('t1', undefined, taskForm('a'.repeat(121)))

    expect(state).toEqual({ formError: 'Title can be at most 120 characters.', field: 'title' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('refuses a description over 1000 characters without writing anything', async () => {
    const state = await updateTaskAction('t1', undefined, taskForm('Read Genesis 1-3', 'd'.repeat(1001)))

    expect(state).toEqual({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('saves a title and description exactly at their limits', async () => {
    const title = 'a'.repeat(120)
    const description = 'd'.repeat(1000)

    const state = await updateTaskAction('t1', undefined, taskForm(title, description))

    expect(state).toBeUndefined()
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ title, description }))
    expect(eq).toHaveBeenCalledWith('id', 't1')
  })
})
```

Create `tests/lib/tasks/reject-reason-length.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { supabase } = vi.hoisted(() => ({ supabase: { rpc: vi.fn() } }))
vi.mock('@/lib/auth/require-user', () => ({ requireUser: async () => ({ supabase, user: { id: 'admin-1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { rejectTaskCompletionAction, bulkRejectTaskCompletionsAction } from '@/lib/tasks/review-task-completion'

function reasonForm(reason: string, ids: string[] = []) {
  const form = new FormData()
  form.set('reason', reason)
  for (const id of ids) form.append('completionIds', id)
  return form
}

beforeEach(() => {
  supabase.rpc.mockReset()
})

describe('rejectTaskCompletionAction reason limit', () => {
  it('refuses a reason over 500 characters without rejecting anything', async () => {
    const state = await rejectTaskCompletionAction('c-1', undefined, reasonForm('r'.repeat(501)))

    expect(state).toEqual({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects with a reason of exactly 500 characters, measured after trimming', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await rejectTaskCompletionAction('c-1', undefined, reasonForm(`  ${'r'.repeat(500)}  `))

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('reject_task_completion', { p_completion_id: 'c-1', p_reason: 'r'.repeat(500) })
  })
})

describe('bulkRejectTaskCompletionsAction reason limit', () => {
  it('refuses a shared reason over 500 characters without rejecting anything', async () => {
    const state = await bulkRejectTaskCompletionsAction(undefined, reasonForm('r'.repeat(501), ['c-1', 'c-2']))

    expect(state).toEqual({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('rejects the selection with a shared reason of exactly 500 characters', async () => {
    supabase.rpc.mockResolvedValue({ data: [{ id: 'c-1', ok: true, error: null }], error: null })

    const state = await bulkRejectTaskCompletionsAction(undefined, reasonForm('r'.repeat(500), ['c-1']))

    expect(state).toEqual({ summary: '1 rejected.' })
    expect(supabase.rpc).toHaveBeenCalledWith('review_task_completions', {
      p_ids: ['c-1'],
      p_approve: false,
      p_note: 'r'.repeat(500),
    })
  })
})
```

Append this block to the end of `tests/lib/members/adjust-balance-action.test.ts`, after the existing `describe('adjustBalanceAction', …)`. It reuses that file's hoisted `supabase` mock, its `beforeEach` and its `adjustForm` helper:

```ts
describe('adjustBalanceAction reason limit', () => {
  it('refuses a reason over 200 characters without adjusting anything', async () => {
    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('10', 'r'.repeat(201)))

    expect(state).toEqual({ formError: 'Reason can be at most 200 characters.', field: 'reason' })
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('adjusts with a reason of exactly 200 characters, measured after trimming', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })

    const state = await adjustBalanceAction('p-mia', undefined, adjustForm('10', ` ${'r'.repeat(200)} `))

    expect(state).toBeUndefined()
    expect(supabase.rpc).toHaveBeenCalledWith('adjust_balance', { p_profile_id: 'p-mia', p_amount: 10, p_reason: 'r'.repeat(200) })
  })
})
```

Create `tests/lib/invites/add-invite.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { addInvite } from '@/lib/invites/add-invite'

function fakeClient() {
  const insert = vi.fn(async () => ({ error: null }))
  const from = vi.fn(() => ({ insert }))
  return { client: { from } as unknown as SupabaseClient, from, insert }
}

// 64 + 1 + 185 + 4 = 254 characters.
const AT_LIMIT = `${'a'.repeat(64)}@${'b'.repeat(185)}.com`

describe('addInvite length limit', () => {
  it('refuses an email over 254 characters without inserting anything', async () => {
    const { client, from } = fakeClient()

    const result = await addInvite(client, 'admin-1', `x${AT_LIMIT}`)

    expect(result).toEqual({ ok: false, formError: 'Email can be at most 254 characters.' })
    expect(from).not.toHaveBeenCalled()
  })

  it('invites an email of exactly 254 characters, measured after trimming', async () => {
    const { client, insert } = fakeClient()

    const result = await addInvite(client, 'admin-1', `  ${AT_LIMIT.toUpperCase()}  `)

    expect(result).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledWith({ email: AT_LIMIT, invited_by: 'admin-1' })
  })
})
```

Create `tests/lib/auth/create-own-profile.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createOwnProfile } from '@/lib/auth/create-own-profile'

function fakeClient() {
  const insert = vi.fn(async () => ({ error: null }))
  return { client: { from: vi.fn(() => ({ insert })) } as unknown as SupabaseClient, insert }
}

describe('createOwnProfile display name', () => {
  it('cuts a name longer than 80 characters to 80, so sign-up never fails on it', async () => {
    const { client, insert } = fakeClient()

    const result = await createOwnProfile(client, 'u-1', 'long@example.com', 'n'.repeat(81), null)

    expect(result).toEqual({ ok: true })
    expect(insert).toHaveBeenCalledWith({ id: 'u-1', email: 'long@example.com', display_name: 'n'.repeat(80), avatar_url: null })
  })

  it('keeps a name of 80 characters or fewer as it is', async () => {
    const { client, insert } = fakeClient()

    await createOwnProfile(client, 'u-1', 'mia@example.com', 'Mia Thompson', 'https://example.com/a.png')

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ display_name: 'Mia Thompson' }))
  })

  it('counts an emoji as one character and never splits it', async () => {
    const { client, insert } = fakeClient()

    await createOwnProfile(client, 'u-1', 'emoji@example.com', '😀'.repeat(81), null)

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ display_name: '😀'.repeat(80) }))
  })
})
```

Run: `npx vitest run tests/lib/markets/create-market-action.test.ts tests/lib/tasks tests/lib/members tests/lib/invites tests/lib/auth/create-own-profile.test.ts`
Expected: FAIL, with 13 failed and 21 passed. Every "refuses …" case fails, and so do the two display-name cuts. What passes: the ten at-limit and unchanged-name cases, which today's code already handles; `adjust-balance-action.test.ts`'s 3 existing cases; and `bulk-review-action.test.ts`'s 8.

- [ ] **Step 2: Check lengths in every action**

Replace `lib/markets/create-market.ts` with:

```ts
'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState =
  | { formError?: string; field?: 'title' | 'description' | 'close_at' | 'outcomes' | `outcome_${number}` }
  | undefined

const MIN_OUTCOMES = 2

export async function createMarketAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const kind = String(formData.get('kind') ?? '')
  const closeAt = String(formData.get('close_at') ?? '')

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.marketTitle) return { formError: tooLong('Title', TEXT_LIMITS.marketTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.marketDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.marketDescription), field: 'description' }
  }
  if (kind !== 'binary' && kind !== 'multiple_choice') return { formError: 'Choose a market kind.' }

  const closeAtDate = closeAt ? new Date(closeAt) : null
  if (!closeAtDate || Number.isNaN(closeAtDate.getTime()) || closeAtDate.getTime() <= Date.now()) {
    return { formError: 'Choose a close time in the future.', field: 'close_at' }
  }

  // One line per outcome input, blanks included, so a line's position matches the form's "Outcome N".
  const outcomeLines =
    kind === 'binary'
      ? formData.getAll('outcome_labels').map(String)
      : String(formData.get('outcome_labels_text') ?? '')
          .split('\n')
          .map((s) => s.trim())
  const outcomeLabels = kind === 'binary' ? outcomeLines : outcomeLines.filter(Boolean)

  if (outcomeLabels.length < MIN_OUTCOMES) return { formError: 'Enter at least 2 outcomes.', field: 'outcomes' }

  const longOutcome = outcomeLines.findIndex((label) => label.length > TEXT_LIMITS.outcomeLabel)
  if (longOutcome !== -1) {
    const n = longOutcome + 1
    return { formError: tooLong(`Outcome ${n}`, TEXT_LIMITS.outcomeLabel), field: `outcome_${n}` }
  }

  const { data: marketId, error } = await supabase.rpc('create_market', {
    p_title: title,
    p_description: description || null,
    p_kind: kind,
    p_outcome_labels: outcomeLabels,
    p_close_at: closeAt,
  })

  if (error) return { formError: error.message }

  redirect(`/markets/${marketId}`)
}
```

The multiple-choice labels are still split, trimmed and stripped of blanks exactly as before. The length check runs over the unstripped lines, so a line's position matches the form's "Outcome N", because the form sends one line per outcome input.

Replace `lib/tasks/create-task.ts` with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'title' | 'description' | 'reward_amount' | 'period' } | undefined

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export async function createTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isRepeatable = formData.get('is_repeatable') === 'on'
  const period = String(formData.get('period') ?? '')

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.taskTitle) return { formError: tooLong('Title', TEXT_LIMITS.taskTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.taskDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.taskDescription), field: 'description' }
  }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' }
  }
  if (isRepeatable && !PERIODS.includes(period as (typeof PERIODS)[number])) {
    return { formError: 'Choose a cadence for a repeatable task.', field: 'period' }
  }

  const { error } = await supabase.from('tasks').insert({
    title,
    description: description || null,
    reward_amount: rewardAmount,
    is_repeatable: isRepeatable,
    period: isRepeatable ? period : null,
  })

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
```

Replace `lib/tasks/update-task.ts` with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'title' | 'description' | 'reward_amount' } | undefined

export async function updateTaskAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isActive = formData.get('is_active') === 'on'

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.taskTitle) return { formError: tooLong('Title', TEXT_LIMITS.taskTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.taskDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.taskDescription), field: 'description' }
  }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ title, description: description || null, reward_amount: rewardAmount, is_active: isActive })
    .eq('id', taskId)

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
```

Replace `lib/tasks/review-task-completion.ts` with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'reason' } | undefined

export async function approveTaskCompletionAction(completionId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: completionId })
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}

export async function rejectTaskCompletionAction(completionId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length > TEXT_LIMITS.reviewNote) return { formError: tooLong('Reason', TEXT_LIMITS.reviewNote), field: 'reason' }

  const { error } = await supabase.rpc('reject_task_completion', {
    p_completion_id: completionId,
    p_reason: reason || null,
  })
  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}

export interface BulkActionState {
  formError?: string
  field?: 'reason'
  summary?: string
}

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
  if (reason.length > TEXT_LIMITS.reviewNote) return { formError: tooLong('Reason', TEXT_LIMITS.reviewNote), field: 'reason' }

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

The bulk check matters beyond the message: `review_task_completions` catches each id's error on its own, so an over-long shared note would otherwise come back as "0 rejected, 3 failed (new row for relation …)".

Replace `lib/members/adjust-balance.ts` with:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'amount' | 'reason' } | undefined

export async function adjustBalanceAction(profileId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isInteger(amount) || amount === 0) return { formError: 'Enter a non-zero whole number of DC.', field: 'amount' }
  if (!reason) return { formError: 'Add a reason — it’s shown in the ledger next to this adjustment.', field: 'reason' }
  if (reason.length > TEXT_LIMITS.adjustReason) return { formError: tooLong('Reason', TEXT_LIMITS.adjustReason), field: 'reason' }

  const { error } = await supabase.rpc('adjust_balance', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
  })
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('display_name, balance').eq('id', profileId).maybeSingle()
      if (profile) {
        return { formError: `That would take ${profile.display_name}’s balance below zero — they have ${profile.balance} DC.`, field: 'amount' }
      }
    }
    return { formError: error.message }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
```

Replace `lib/invites/add-invite.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export interface AddInviteResult {
  ok: boolean
  formError?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Inserts a new row into allowed_emails using the caller's own session's
 * Supabase client, so admin_insert_invites's is_admin() RLS check
 * actually runs. `invitedBy` must come from the caller's own verified
 * session — never from client-supplied input.
 */
export async function addInvite(
  supabase: SupabaseClient,
  invitedBy: string,
  rawEmail: string,
): Promise<AddInviteResult> {
  const email = rawEmail.trim().toLowerCase()
  if (email.length > TEXT_LIMITS.inviteEmail) {
    return { ok: false, formError: tooLong('Email', TEXT_LIMITS.inviteEmail) }
  }
  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, formError: 'Enter a valid email address.' }
  }

  const { error } = await supabase.from('allowed_emails').insert({ email, invited_by: invitedBy })

  if (error) {
    if (error.code === '23505') {
      return { ok: false, formError: 'That email is already invited.' }
    }
    return { ok: false, formError: 'Could not add that invite.' }
  }

  return { ok: true }
}
```

Replace `lib/auth/create-own-profile.ts` with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { TEXT_LIMITS } from '@/lib/forms/limits'

export type CreateOwnProfileResult = { ok: true } | { ok: false; reason: 'not_invited' | 'error' }

/**
 * Inserts the caller's own profile row using their own session's Supabase
 * client, so insert_own_profile's is_invited() RLS check actually runs.
 * `supabase` must be a client bound to the calling user's own session;
 * `userId`/`email` must come from that same session — never from
 * client-suppliable input.
 */
export async function createOwnProfile(
  supabase: SupabaseClient,
  userId: string,
  email: string,
  displayName: string,
  avatarUrl: string | null,
): Promise<CreateOwnProfileResult> {
  // A Google name can be longer than profiles_display_name_length allows; sign-up must not fail on it.
  // Cut by code point, which is what char_length counts, so no emoji is split in half.
  const name = Array.from(displayName).slice(0, TEXT_LIMITS.displayName).join('')
  const { error } = await supabase
    .from('profiles')
    .insert({ id: userId, email, display_name: name, avatar_url: avatarUrl })

  if (!error) return { ok: true }

  // 23505 = unique_violation on the primary key: a profile already exists
  // for this id (a returning user) — expected, not a failure.
  if (error.code === '23505') return { ok: true }

  // 42501 = insufficient_privilege: either insert_own_profile's RLS check
  // rejected the row (is_invited() was false) or the column-restricted
  // grant rejected an attempted column — this function never sends
  // balance/is_admin, so in practice this means "not invited."
  if (error.code === '42501') return { ok: false, reason: 'not_invited' }

  return { ok: false, reason: 'error' }
}
```

Run: `npx vitest run tests/lib/markets/create-market-action.test.ts tests/lib/tasks tests/lib/members tests/lib/invites tests/lib/auth/create-own-profile.test.ts`
Expected: PASS, 34 tests in 8 files.

- [ ] **Step 3: Write the failing form test**

Create `tests/components/form-text-limits.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

const actions = vi.hoisted(() => ({
  createMarketAction: vi.fn(),
  createTaskAction: vi.fn(),
  updateTaskAction: vi.fn(),
  approveTaskCompletionAction: vi.fn(),
  rejectTaskCompletionAction: vi.fn(),
  bulkApproveTaskCompletionsAction: vi.fn(),
  bulkRejectTaskCompletionsAction: vi.fn(),
  adjustBalanceAction: vi.fn(),
  addInviteAction: vi.fn(),
  revokeInviteAction: vi.fn(),
}))
vi.mock('@/lib/markets/create-market', () => ({ createMarketAction: actions.createMarketAction }))
vi.mock('@/lib/tasks/create-task', () => ({ createTaskAction: actions.createTaskAction }))
vi.mock('@/lib/tasks/update-task', () => ({ updateTaskAction: actions.updateTaskAction }))
vi.mock('@/lib/tasks/review-task-completion', () => ({
  approveTaskCompletionAction: actions.approveTaskCompletionAction,
  rejectTaskCompletionAction: actions.rejectTaskCompletionAction,
  bulkApproveTaskCompletionsAction: actions.bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction: actions.bulkRejectTaskCompletionsAction,
}))
vi.mock('@/lib/members/adjust-balance', () => ({ adjustBalanceAction: actions.adjustBalanceAction }))
vi.mock('@/lib/invites/actions', () => ({ addInviteAction: actions.addInviteAction, revokeInviteAction: actions.revokeInviteAction }))

import { CreateMarketForm } from '@/app/(app)/markets/new/create-market-form'
import { CreateTaskForm } from '@/app/(app)/admin/tasks/create-task-form'
import { EditTaskForm } from '@/app/(app)/admin/tasks/edit-task-form'
import { PendingApprovals, type PendingRow } from '@/app/(app)/admin/tasks/pending-approvals'
import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'
import { AddInviteForm } from '@/app/(app)/admin/invites/add-invite-form'

const GENESIS: TaskSummary = {
  id: 't1',
  title: 'Read Genesis 1-3',
  description: null,
  rewardAmount: 10,
  isRepeatable: false,
  period: null,
  isActive: true,
}

const PENDING: PendingRow[] = [
  {
    id: 'c1',
    taskTitle: 'Read Genesis 1-3',
    submitterId: 'p-alice',
    submitterName: 'Alice',
    rewardAmount: 10,
    submittedAt: '2026-09-25T09:00:00Z',
    submittedAge: '1h ago',
  },
]

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockReset()
})

describe('text limits on form inputs', () => {
  it('caps the market title, description and every outcome label', async () => {
    render(<CreateMarketForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')

    await userEvent.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add outcome' }))
    for (const n of [1, 2, 3]) expect(screen.getByLabelText(`Outcome ${n}`)).toHaveAttribute('maxlength', '60')
  })

  it('caps the task title and description in the create form', () => {
    render(<CreateTaskForm />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')
  })

  it('caps the task title and description in the edit form', () => {
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={() => {}} />)
    expect(screen.getByLabelText('Title')).toHaveAttribute('maxlength', '120')
    expect(screen.getByLabelText('Description')).toHaveAttribute('maxlength', '1000')
  })

  it('caps the single and shared rejection reasons', () => {
    render(<PendingApprovals pending={PENDING} />)
    expect(screen.getByLabelText('Reason for rejecting (optional)')).toHaveAttribute('maxlength', '500')
    expect(screen.getByLabelText('Shared reason (optional)')).toHaveAttribute('maxlength', '500')
  })

  it('caps the balance-adjust reason and the invite email', () => {
    render(
      <>
        <AdjustBalanceForm member={{ id: 'p-ben', displayName: 'Ben', email: 'ben@example.com', balance: 60, isAdmin: false }} />
        <AddInviteForm />
      </>,
    )
    expect(screen.getByLabelText('Reason')).toHaveAttribute('maxlength', '200')
    expect(screen.getByLabelText('Email')).toHaveAttribute('maxlength', '254')
  })
})

describe('too-long errors point at their field', () => {
  it('ties a market description error to the description only', async () => {
    actions.createMarketAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<CreateMarketForm />)

    await userEvent.type(screen.getByLabelText('Title'), 'Will it rain?')
    await userEvent.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Create market' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Title')).toHaveAttribute('aria-invalid', 'false')
  })

  it('ties a too-long outcome error to that outcome only', async () => {
    actions.createMarketAction.mockResolvedValue({ formError: 'Outcome 3 can be at most 60 characters.', field: 'outcome_3' })
    render(<CreateMarketForm />)

    await userEvent.click(screen.getByRole('radio', { name: 'Multiple choice' }))
    await userEvent.click(screen.getByRole('button', { name: 'Add outcome' }))
    await userEvent.type(screen.getByLabelText('Title'), 'Who wins the trivia night?')
    await userEvent.type(screen.getByLabelText('Close time'), '2030-01-01T10:00')
    await userEvent.click(screen.getByRole('button', { name: 'Create market' }))

    await screen.findByRole('alert')
    const third = screen.getByLabelText('Outcome 3')
    expect(third).toHaveAttribute('aria-invalid', 'true')
    expect(third).toHaveAccessibleDescription('Outcome 3 can be at most 60 characters.')
    expect(screen.getByLabelText('Outcome 1')).not.toHaveAttribute('aria-invalid')
    expect(screen.getByLabelText('Outcome 2')).not.toHaveAttribute('aria-invalid')
  })

  it('ties a task description error to the description', async () => {
    actions.createTaskAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<CreateTaskForm />)

    await userEvent.type(screen.getByLabelText('Title'), 'Read Genesis 1-3')
    await userEvent.type(screen.getByLabelText('Reward (DC)'), '10')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Description')).toHaveAccessibleDescription('Description can be at most 1000 characters.')
  })

  it('ties an edit-form description error to the description', async () => {
    actions.updateTaskAction.mockResolvedValue({ formError: 'Description can be at most 1000 characters.', field: 'description' })
    render(<EditTaskForm id="edit-task-t1" task={GENESIS} onDone={() => {}} />)

    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Description can be at most 1000 characters.')
    expect(screen.getByLabelText('Description')).toHaveAttribute('aria-describedby', 'edit-task-t1-error')
  })

  it('ties a shared-reason error to the shared reason field', async () => {
    actions.bulkRejectTaskCompletionsAction.mockResolvedValue({ formError: 'Reason can be at most 500 characters.', field: 'reason' })
    render(<PendingApprovals pending={PENDING} />)

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Alice’s submission' }))
    await userEvent.click(screen.getByRole('button', { name: 'Reject selected' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Reason can be at most 500 characters.')
    const shared = screen.getByLabelText('Shared reason (optional)')
    expect(shared).toHaveAttribute('aria-invalid', 'true')
    expect(shared).toHaveAccessibleDescription('Reason can be at most 500 characters.')
  })
})
```

Run: `npx vitest run tests/components/form-text-limits.test.tsx`
Expected: FAIL, with 10 failed. No input has a `maxlength` yet, and no description or shared-reason input is wired to its error.

- [ ] **Step 4: Add `maxLength` and the error wiring to the forms**

Replace `app/(app)/markets/new/create-market-form.tsx` with:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { cn } from '@/lib/utils'
import { createMarketAction, type ActionState } from '@/lib/markets/create-market'

const MAX_OUTCOMES = 6
const MIN_OUTCOMES = 2

const toggleClass = (on: boolean) =>
  cn(
    'flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] font-bold text-ink2',
    on && 'bg-surface text-ink shadow-tab',
  )

export function CreateMarketForm() {
  const [kind, setKind] = useState<'binary' | 'multiple_choice'>('binary')
  const [outcomes, setOutcomes] = useState(['', ''])
  const [closeAtIso, setCloseAtIso] = useState('')
  const [state, formAction] = useActionState<ActionState, FormData>(createMarketAction, undefined)

  function updateOutcome(index: number, value: string) {
    setOutcomes((prev) => prev.map((outcome, i) => (i === index ? value : outcome)))
  }

  function addOutcome() {
    setOutcomes((prev) => (prev.length >= MAX_OUTCOMES ? prev : [...prev, '']))
  }

  function removeOutcome(index: number) {
    setOutcomes((prev) => (prev.length <= MIN_OUTCOMES ? prev : prev.filter((_, i) => i !== index)))
  }

  // Too few outcomes points at the first input; a too-long label points at its own.
  const outcomeInvalid = (index: number) =>
    state?.field === `outcome_${index + 1}` || (index === 0 && state?.field === 'outcomes')

  return (
    <form
      action={formAction}
      className="flex max-w-[720px] flex-col gap-5 rounded-card border border-line bg-surface p-[18px] shadow-card md:p-6"
    >
      <Field label="Title" htmlFor="cm-title">
        <Input
          id="cm-title"
          name="title"
          required
          maxLength={TEXT_LIMITS.marketTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? 'create-market-error' : undefined}
        />
      </Field>

      <Field label="Description" htmlFor="cm-desc">
        <Textarea
          id="cm-desc"
          name="description"
          maxLength={TEXT_LIMITS.marketDescription}
          aria-invalid={state?.field === 'description'}
          aria-describedby={state?.field === 'description' ? 'create-market-error' : undefined}
        />
      </Field>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-[15px] font-bold">Type</legend>
        <div className="grid grid-cols-2 gap-1.5 rounded-[14px] bg-sunk p-1">
          <label className={toggleClass(kind === 'binary')}>
            <input
              type="radio"
              name="kind"
              value="binary"
              checked={kind === 'binary'}
              onChange={() => setKind('binary')}
              className="size-[18px] accent-primary"
            />
            Binary (Yes/No)
          </label>
          <label className={toggleClass(kind === 'multiple_choice')}>
            <input
              type="radio"
              name="kind"
              value="multiple_choice"
              checked={kind === 'multiple_choice'}
              onChange={() => setKind('multiple_choice')}
              className="size-[18px] accent-primary"
            />
            Multiple choice
          </label>
        </div>
      </fieldset>

      {kind === 'binary' ? (
        <>
          <input type="hidden" name="outcome_labels" value="Yes" />
          <input type="hidden" name="outcome_labels" value="No" />
        </>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-[15px] font-bold">Outcomes</legend>
          <span className="text-sm text-ink2">
            Up to {MAX_OUTCOMES} outcomes · {outcomes.length} of {MAX_OUTCOMES} used
          </span>
          {outcomes.map((value, index) => (
            <div key={index} className="flex items-center gap-2">
              <label className="sr-only" htmlFor={`cm-outcome-${index}`}>{`Outcome ${index + 1}`}</label>
              <Input
                id={`cm-outcome-${index}`}
                value={value}
                onChange={(e) => updateOutcome(index, e.target.value)}
                maxLength={TEXT_LIMITS.outcomeLabel}
                className="flex-1"
                aria-invalid={outcomeInvalid(index) || undefined}
                aria-describedby={outcomeInvalid(index) ? 'create-market-error' : undefined}
              />
              <button
                type="button"
                onClick={() => removeOutcome(index)}
                disabled={outcomes.length <= MIN_OUTCOMES}
                aria-label={`Remove outcome ${index + 1}`}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-control text-ink hover:bg-sunk disabled:cursor-not-allowed disabled:text-ink2 disabled:hover:bg-transparent"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
          ))}
          <input type="hidden" name="outcome_labels_text" value={outcomes.join('\n')} />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addOutcome}
            disabled={outcomes.length >= MAX_OUTCOMES}
            className="self-start"
          >
            <Plus aria-hidden="true" className="size-[18px]" />
            Add outcome
          </Button>
        </fieldset>
      )}

      <Field label="Close time" htmlFor="cm-close">
        <Input
          id="cm-close"
          type="datetime-local"
          required
          aria-invalid={state?.field === 'close_at'}
          aria-describedby={state?.field === 'close_at' ? 'create-market-error' : undefined}
          onChange={(e) => setCloseAtIso(e.target.value ? new Date(e.target.value).toISOString() : '')}
        />
      </Field>
      <input type="hidden" name="close_at" value={closeAtIso} />

      {state?.formError && (
        <Message tone="error" id="create-market-error">
          {state.formError}
        </Message>
      )}

      <FormSubmitButton block className="md:w-auto md:self-start">
        Create market
      </FormSubmitButton>
    </form>
  )
}
```

Only an invalid outcome input carries `aria-invalid` now. The first input used to carry `aria-invalid="false"` when there was no error; an absent attribute means the same, and `create-market-form.test.tsx` asserts only the invalid case.

Replace `app/(app)/admin/tasks/create-task-form.tsx` with:

```tsx
'use client'

import { useActionState, useState } from 'react'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'
import { Field, Input, Select, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'

export function CreateTaskForm() {
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(createTaskAction, undefined)

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Title" htmlFor="create-task-title">
        <Input
          id="create-task-title"
          name="title"
          required
          maxLength={TEXT_LIMITS.taskTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Description" htmlFor="create-task-description">
        <Textarea
          id="create-task-description"
          name="description"
          maxLength={TEXT_LIMITS.taskDescription}
          aria-invalid={state?.field === 'description'}
          aria-describedby={state?.field === 'description' ? 'create-task-error' : undefined}
        />
      </Field>
      <Field label="Reward (DC)" htmlFor="create-task-reward">
        <Input
          id="create-task-reward"
          name="reward_amount"
          type="number"
          min="1"
          step="1"
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? 'create-task-error' : undefined}
        />
      </Field>
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          onChange={(e) => setIsRepeatable(e.target.checked)}
          className="m-0 size-[22px] accent-primary"
        />
        Repeatable
      </label>
      {isRepeatable && (
        <Field label="Cadence" htmlFor="create-task-period">
          <Select
            id="create-task-period"
            name="period"
            required
            aria-invalid={state?.field === 'period'}
            aria-describedby={state?.field === 'period' ? 'create-task-error' : undefined}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
      )}
      {state?.formError && (
        <Message tone="error" id="create-task-error">
          {state.formError}
        </Message>
      )}
      <FormSubmitButton block className="md:w-auto md:self-start">
        Create task
      </FormSubmitButton>
    </form>
  )
}
```

Replace `app/(app)/admin/tasks/edit-task-form.tsx` with:

```tsx
'use client'

import { useActionState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'

export function EditTaskForm({ id, task, onDone }: { id: string; task: TaskSummary; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(async (prevState, formData) => {
    const result = await updateTaskAction(task.id, prevState, formData)
    if (!result?.formError) onDone()
    return result
  }, undefined)
  const errorId = `${id}-error`

  return (
    <form id={id} action={formAction} className="flex flex-col gap-4 rounded-[14px] bg-sunk p-3.5">
      <Field label="Title" htmlFor={`${id}-title`}>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={task.title}
          required
          maxLength={TEXT_LIMITS.taskTitle}
          aria-invalid={state?.field === 'title'}
          aria-describedby={state?.field === 'title' ? errorId : undefined}
        />
      </Field>
      <Field label="Description" htmlFor={`${id}-description`}>
        <Textarea
          id={`${id}-description`}
          name="description"
          defaultValue={task.description ?? ''}
          maxLength={TEXT_LIMITS.taskDescription}
          aria-invalid={state?.field === 'description'}
          aria-describedby={state?.field === 'description' ? errorId : undefined}
        />
      </Field>
      <Field label="Reward (DC)" htmlFor={`${id}-reward`}>
        <Input
          id={`${id}-reward`}
          name="reward_amount"
          type="number"
          min="1"
          step="1"
          defaultValue={task.rewardAmount}
          required
          aria-invalid={state?.field === 'reward_amount'}
          aria-describedby={state?.field === 'reward_amount' ? errorId : undefined}
        />
      </Field>
      {/* Deactivate/Reactivate owns this flag; saving an edit keeps it as it is. */}
      {task.isActive && <input type="hidden" name="is_active" value="on" />}
      {state?.formError && (
        <Message tone="error" id={errorId}>
          {state.formError}
        </Message>
      )}
      <div className="flex gap-2">
        <FormSubmitButton size="sm">Save</FormSubmitButton>
        <Button size="sm" variant="quiet" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
```

Replace `app/(app)/admin/tasks/review-buttons.tsx` with:

```tsx
'use client'

import { useActionState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function ReviewButtons({ completionId }: { completionId: string }) {
  const hasError = (s: ActionState) => Boolean(s?.formError)
  const boundApprove = withSuccessToast(
    approveTaskCompletionAction.bind(null, completionId),
    hasError,
    'Submission approved.',
  )
  const boundReject = withSuccessToast(
    rejectTaskCompletionAction.bind(null, completionId),
    hasError,
    'Submission rejected.',
  )
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)
  const reasonId = `reject-reason-${completionId}`
  const approveErrorId = `approve-${completionId}-error`
  const rejectErrorId = `reject-${completionId}-error`

  return (
    <div className="flex flex-col gap-2 md:pl-[52px]">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <form action={approveAction} className="flex">
          <FormSubmitButton
            size="sm"
            className="grow"
            aria-describedby={approveState?.formError ? approveErrorId : undefined}
          >
            Approve
          </FormSubmitButton>
        </form>
        <form action={rejectAction} className="flex flex-col gap-2 md:grow md:flex-row md:items-center">
          <label htmlFor={reasonId} className="sr-only">
            Reason for rejecting (optional)
          </label>
          <Input
            id={reasonId}
            name="reason"
            placeholder="Reason (optional)"
            maxLength={TEXT_LIMITS.reviewNote}
            className="min-h-11 md:grow"
            aria-invalid={Boolean(rejectState?.formError)}
            aria-describedby={rejectState?.formError ? rejectErrorId : undefined}
          />
          <FormSubmitButton size="sm" variant="secondary">
            Reject
          </FormSubmitButton>
        </form>
      </div>
      {approveState?.formError && (
        <Message tone="error" id={approveErrorId}>
          {approveState.formError}
        </Message>
      )}
      {rejectState?.formError && (
        <Message tone="error" id={rejectErrorId}>
          {rejectState.formError}
        </Message>
      )}
    </div>
  )
}
```

The single reason input already marks itself invalid for any reject error, so only `maxLength` is new here.

Replace `app/(app)/admin/tasks/pending-approvals.tsx` with:

```tsx
'use client'

import Link from 'next/link'
import { useActionState, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { EmptyState } from '@/components/ui/empty-state'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { ReviewButtons } from './review-buttons'

const BULK_FORM_ID = 'bulk-review-form'
const BULK_APPROVE_ERROR_ID = 'bulk-approve-error'
const BULK_REJECT_ERROR_ID = 'bulk-reject-error'

export type PendingRow = PendingCompletion & { submittedAge: string }

export function PendingApprovals({ pending }: { pending: PendingRow[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [approveState, approveAction, isApprovePending] = useActionState<BulkActionState | undefined, FormData>(bulkApproveTaskCompletionsAction, undefined)
  const [rejectState, rejectAction, isRejectPending] = useActionState<BulkActionState | undefined, FormData>(bulkRejectTaskCompletionsAction, undefined)
  // Only the most recently clicked bulk action's result stays visible — otherwise an
  // approve followed by a reject would leave both summaries on screen at once.
  const [lastBulk, setLastBulk] = useState<'approve' | 'reject' | null>(null)
  const bulkReasonInvalid = lastBulk === 'reject' && !isRejectPending && rejectState?.field === 'reason'

  function toggleAll(checked: boolean) {
    containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="completionIds"]').forEach((el) => {
      el.checked = checked
    })
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      {/* Hidden while its own action is pending, so a stale result from an earlier click
          doesn't flash back on screen for the moment before the new one resolves. */}
      {lastBulk === 'approve' && !isApprovePending && approveState?.formError && (
        <Message tone="error" id={BULK_APPROVE_ERROR_ID}>
          {approveState.formError}
        </Message>
      )}
      {lastBulk === 'approve' && !isApprovePending && approveState?.summary && <Message tone="ok">{approveState.summary}</Message>}
      {lastBulk === 'reject' && !isRejectPending && rejectState?.formError && (
        <Message tone="error" id={BULK_REJECT_ERROR_ID}>
          {rejectState.formError}
        </Message>
      )}
      {lastBulk === 'reject' && !isRejectPending && rejectState?.summary && <Message tone="ok">{rejectState.summary}</Message>}

      {pending.length === 0 ? (
        <EmptyState icon={Check} title="Nothing pending." />
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-line">
            {pending.map((c) => (
              <li key={c.id} className="flex flex-col gap-3 py-4">
                <div className="flex items-start gap-2">
                  <label className="inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center">
                    {/* Outside the bulk form (row forms can't nest inside it), so the form attribute joins it. */}
                    <input
                      type="checkbox"
                      name="completionIds"
                      value={c.id}
                      form={BULK_FORM_ID}
                      className="m-0 size-[22px] accent-primary"
                    />
                    <span className="sr-only">Select {c.submitterName}’s submission</span>
                  </label>
                  <div className="flex min-w-0 grow flex-col pt-[9px]">
                    <p>
                      <Link href={`/members/${c.submitterId}`} transitionTypes={['nav-forward']}>{c.submitterName}</Link> — <strong>{c.taskTitle}</strong>{' '}
                      <span className="font-extrabold text-gold">({c.rewardAmount} DC)</span>
                    </p>
                    <p className="text-sm text-ink2">Submitted {c.submittedAge}</p>
                  </div>
                </div>
                <ReviewButtons completionId={c.id} />
              </li>
            ))}
          </ul>

          {/* After the rows, not above them as drawn: the e2e suite clicks the first button named "Approve", which must be a row's. */}
          <div className="flex flex-col gap-3 rounded-[14px] bg-sunk p-3.5">
            <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 self-start font-bold">
              <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} className="m-0 size-[22px] accent-primary" />
              Select all
            </label>
            <form id={BULK_FORM_ID} className="flex flex-col gap-2 md:flex-row md:items-center">
              <label htmlFor="bulk-reason" className="sr-only">
                Shared reason (optional)
              </label>
              <Input
                id="bulk-reason"
                name="reason"
                placeholder="Shared reason (optional)"
                maxLength={TEXT_LIMITS.reviewNote}
                className="md:grow"
                aria-invalid={bulkReasonInvalid}
                aria-describedby={bulkReasonInvalid ? BULK_REJECT_ERROR_ID : undefined}
              />
              <div className="flex flex-wrap shrink-0 gap-2">
                <FormSubmitButton
                  size="sm"
                  formAction={approveAction}
                  className="grow"
                  onClick={() => setLastBulk('approve')}
                  aria-describedby={
                    lastBulk === 'approve' && !isApprovePending && approveState?.formError ? BULK_APPROVE_ERROR_ID : undefined
                  }
                >
                  Approve selected
                </FormSubmitButton>
                <FormSubmitButton
                  size="sm"
                  variant="secondary"
                  formAction={rejectAction}
                  className="grow"
                  onClick={() => setLastBulk('reject')}
                  aria-describedby={
                    lastBulk === 'reject' && !isRejectPending && rejectState?.formError ? BULK_REJECT_ERROR_ID : undefined
                  }
                >
                  Reject selected
                </FormSubmitButton>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
```

`app/(app)/admin/members/adjust-balance-form.tsx` is also edited by Task 4 (its member-name link), so edit it in place rather than replacing it. Two changes:

In the imports, replace:

```tsx
import { Message } from '@/components/ui/message'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
```

with:

```tsx
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'
```

In the Reason field, replace:

```tsx
                name="reason"
                aria-invalid={state?.field === 'reason'}
```

with:

```tsx
                name="reason"
                maxLength={TEXT_LIMITS.adjustReason}
                aria-invalid={state?.field === 'reason'}
```

Replace `app/(app)/admin/invites/add-invite-form.tsx` with:

```tsx
'use client'

import { useActionState } from 'react'
import { addInviteAction } from '@/lib/invites/actions'
import { Input } from '@/components/ui/field'
import { FormSubmitButton } from '@/components/ui/form-submit-button'
import { Message } from '@/components/ui/message'
import { TEXT_LIMITS } from '@/lib/forms/limits'
import { withSuccessToast } from '@/lib/toast/with-success-toast'

export function AddInviteForm() {
  const [state, formAction] = useActionState(
    withSuccessToast(addInviteAction, (s) => Boolean(s?.formError), 'Invite added.'),
    undefined,
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label htmlFor="invite-email" className="text-[15px] font-bold">
        Email
      </label>
      <div className="flex gap-2">
        <Input
          id="invite-email"
          name="email"
          type="email"
          required
          maxLength={TEXT_LIMITS.inviteEmail}
          placeholder="friend@gmail.com"
          className="min-w-0"
          aria-invalid={Boolean(state?.formError)}
          aria-describedby={state?.formError ? 'invite-email-hint add-invite-error' : 'invite-email-hint'}
        />
        <FormSubmitButton className="shrink-0">Add</FormSubmitButton>
      </div>
      <p id="invite-email-hint" className="text-sm text-ink2">
        They can sign in with this Google account right away.
      </p>
      {state?.formError && (
        <Message tone="error" id="add-invite-error">
          {state.formError}
        </Message>
      )}
    </form>
  )
}
```

The invite input already marks itself invalid for any add error, so only `maxLength` is new here.

Run: `npx vitest run tests/components/form-text-limits.test.tsx tests/components/create-market-form.test.tsx tests/components/admin-tasks.test.tsx tests/components/admin-members.test.tsx tests/components/admin-invites.test.tsx`
Expected: PASS, 47 tests in 5 files. The 10 new cases, and the four existing form files unchanged.

- [ ] **Step 5: Verify**

Local Supabase must be running, with 0034 applied (Task 1).

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 1036 tests in 155 files, 43 of them in `tests/db/`. This task adds 33 tests in 7 new files: 23 unit (2 of them appended to `adjust-balance-action.test.ts`) and 10 jsdom.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 26 passed, the same as after Task 1. Every e2e value is well under its limit, and no label, placeholder or role changed.

- [ ] **Step 6: Commit**

```bash
git add lib/markets/create-market.ts lib/tasks/create-task.ts lib/tasks/update-task.ts lib/tasks/review-task-completion.ts lib/members/adjust-balance.ts lib/invites/add-invite.ts lib/auth/create-own-profile.ts \
  "app/(app)/markets/new/create-market-form.tsx" "app/(app)/admin/tasks/create-task-form.tsx" "app/(app)/admin/tasks/edit-task-form.tsx" \
  "app/(app)/admin/tasks/review-buttons.tsx" "app/(app)/admin/tasks/pending-approvals.tsx" "app/(app)/admin/members/adjust-balance-form.tsx" \
  "app/(app)/admin/invites/add-invite-form.tsx" \
  tests/lib/markets/create-market-action.test.ts tests/lib/tasks/create-task-action.test.ts tests/lib/tasks/update-task-action.test.ts \
  tests/lib/tasks/reject-reason-length.test.ts tests/lib/members/adjust-balance-action.test.ts tests/lib/invites/add-invite.test.ts \
  tests/lib/auth/create-own-profile.test.ts tests/components/form-text-limits.test.tsx
git commit -m "Explain text length limits in the forms before anything is written"
```

---

## Task 3: A real 404 for market links

A broken market link answers `200` today with a `noindex` soft 404, because a Suspense boundary above the page starts the stream before the page's `isUuid` / `getMarket` check runs. This task makes it a real HTTP `404`, as the member page already is, and keeps the page fast by streaming its heavy sections behind their own skeletons.

**Two boundaries sit above the page, not one.** `app/(app)/markets/[id]/loading.tsx` is the obvious one. But `app/(app)/markets/loading.tsx`, the list skeleton, is a second: Next says a `loading.js` "will automatically wrap the `page.js` file and any children below in a `<Suspense>` boundary" (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`, "Instant Loading States"). So deleting only `[id]/loading.tsx` would leave the list skeleton streaming ahead of a market page, still a soft 404, with the wrong skeleton on screen. That was confirmed against a production build of this repo: a throwaway `app/probe/loading.tsx` over `app/probe/[id]/page.tsx` answered `200` for a missing id, with the parent skeleton in the body. With the parent's `page.tsx` and `loading.tsx` moved into a `(list)` route group, the same missing id answered `404` with no skeleton in the body.

So this task:
- deletes `app/(app)/markets/[id]/loading.tsx`
- moves the list's `page.tsx` and `loading.tsx`, unchanged apart from one comment, into `app/(app)/markets/(list)/`. The URL stays `/markets`, and a route group's loading wraps only that group's page. `tests/lib/auth/app-paths.test.ts` walks into route groups, and `(list)` has no folders, so its count of 7 sections holds.
- restructures the market page so that the `isUuid` check, and then `getMarket` with the slip cookie, run before anything suspends, and `notFound()` fires before any response bytes. The docs require exactly this: "place `notFound()` before those boundaries and before any `await` that may suspend" (`loading.md`, "Status Codes"; also `01-app/02-guides/streaming.md`, "Status codes", and `01-app/03-api-reference/04-functions/not-found.md`).
- streams the chart, the outcomes card with the bet column, and the bets each behind their own `<Suspense>`, with a skeleton that carries the section's grid placement. The drawer's slip read streams too, behind a `null` fallback.

**What stays exactly as it is:**
- `<Page transition="drill-down">` and so the back-swipe, `<LiveTables subscriptions={pageSubscriptions.marketDetail(market.id)} />`, and `BackLink`
- `MarketSlipProvider`, still wrapping both the grid and the drawer, as its comment requires. Its `pick` needs the slip before any section renders, so the page reads the slip cookie in the same `Promise.all` as `getMarket`. That read is a cookie only, with no network, and costs nothing.
- every heading, region, label, button and string the e2e specs use, and their DOM order. The chart comes first, then the outcomes card, then the bet column (bet form, then resolve form, so `combobox.first()` / `.last()` still pick the same selects), then the bets. The outcomes card and the bet column come from one section, so both selects always arrive together.

**Reads stay parallel.** The section components are siblings, so React's server renderer calls all of them in the same pass, and `getChartBets`, `isAdmin`, `getMarketBets` and `getSlipView` start together, as today's `Promise.all` starts them. Each section calls `requireUser()` again for its client, as the member page's `MemberActivity` does. That's free, because `requireUser` and `isAdmin` are both `cache()`d (`lib/auth/require-user.ts`, `lib/auth/is-admin.ts`).

**"Show more" and live refreshes don't flash skeletons.** Link navigations, `router.refresh()` and server-action refreshes all run as transitions, and a transition never swaps an already-revealed Suspense boundary back to its fallback. The page segment isn't remounted either when only the search params change: the router keys it by `createRouterCacheKey(segment, true)`, which drops the search params (`node_modules/next/dist/client/components/layout-router.js:549`, "no search params"). So the optimistic slip row keeps its DOM node, and `optimistic-slip.spec.ts`'s "never flashes back" observer still watches the right element.

**The trade-off the spec accepted.** A tap on a market card no longer shows an instant full-page skeleton. The navigation waits for the page shell (sign-in check, `getMarket`, the slip cookie), and then the sections stream in.

**Files:**
- Delete: `app/(app)/markets/[id]/loading.tsx`
- Move: `app/(app)/markets/page.tsx` → `app/(app)/markets/(list)/page.tsx` (content unchanged)
- Move and modify: `app/(app)/markets/loading.tsx` → `app/(app)/markets/(list)/loading.tsx` (one comment added)
- Modify (rewrite): `app/(app)/markets/[id]/page.tsx`
- Create: `components/markets/market-detail-skeletons.tsx`
- Modify: `tests/components/loading-skeletons.test.tsx` (drops the deleted route skeleton, and follows the list skeleton's move)
- Test, create: `tests/components/market-detail-skeletons.test.tsx`, `e2e/market-not-found.spec.ts`
- Unchanged, and read by this task: `components/markets/market-card.tsx`, `components/parlays/slip-pick.tsx` (Task 4 edits these two; this task doesn't touch them)

**Interfaces:**
- Consumes (all unchanged): `getMarket`, `getMarketBets`, `MarketDetail` (`lib/markets/get-market.ts`); `getChartBets` (`lib/markets/chart-bets.ts`); `isAdmin` (`lib/auth/is-admin.ts`); `readSlip` (`lib/parlays/slip.ts`); `getSlipView` (`lib/parlays/get-slip.ts`); `computeOdds`, `OutcomeOdds` (`lib/markets/odds.ts`); `readPageParams`, `showMoreHref`, `newestHref`, `PageParams`, `SearchParams` (`lib/pagination/cursor.ts`); `Skeleton`, `SkeletonCard`, `SkeletonField`, `SkeletonScreen` (`components/ui/skeleton.tsx`); `ContentReveal` (`components/nav/page-transition.tsx`); `MarketSlipProvider` (`components/markets/market-slip.tsx`).
- Produces:
  ```ts
  // components/markets/market-detail-skeletons.tsx -- server-safe, no hooks
  export function MarketChartSkeleton(): JSX.Element                           // data-skeleton="market-chart"
  export function MarketActionsSkeleton({ outcomes }: { outcomes: number }): JSX.Element // "market-outcomes" + "market-bet-form"
  export function MarketBetsSkeleton(): JSX.Element                            // data-skeleton="market-bets"
  ```
  The `data-skeleton` names are what Task 7's visual check looks for. The route skeleton `data-skeleton="market"` no longer exists.

- [ ] **Step 1: Write the failing e2e spec**

Create `e2e/market-not-found.spec.ts`:

```ts
import { test, expect } from '@playwright/test'

test('an unknown or malformed market id gets a real 404 and the not-found page', async ({ page }) => {
  for (const id of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
    const response = await page.goto(`/markets/${id}`)
    expect(response?.status(), id).toBe(404)
    // A soft 404 would have streamed a skeleton into the document before the not-found page.
    expect(await response?.text(), id).not.toContain('data-skeleton')
    await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible()
  }
})
```

Checking the body as well as the status catches the specific way this regresses: a `loading.tsx` above the route puts its skeleton into the document ahead of the not-found page.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test e2e/market-not-found.spec.ts`
Expected: FAIL, with `Expected: 404` / `Received: 200` for `00000000-0000-4000-8000-000000000000`. `[id]/loading.tsx` streams the market skeleton before the page's check runs.

- [ ] **Step 2: Take away both boundaries above the page**

Delete the market route's skeleton, and move the list's page and skeleton into a `(list)` route group:

```bash
git rm "app/(app)/markets/[id]/loading.tsx"
mkdir -p "app/(app)/markets/(list)"
git mv "app/(app)/markets/page.tsx" "app/(app)/markets/(list)/page.tsx"
git mv "app/(app)/markets/loading.tsx" "app/(app)/markets/(list)/loading.tsx"
```

`(list)/page.tsx` has no relative imports, so it needs no edit. Replace `app/(app)/markets/(list)/loading.tsx` with the same skeleton plus two comment lines explaining the group, so nobody moves it back:

```tsx
import { pageClass } from '@/components/ui/page'
import { Skeleton, SkeletonCard, SkeletonPageHeader, SkeletonScreen } from '@/components/ui/skeleton'

// Mirrors the markets list: header with Create market, then one status group of market cards,
// three across from lg.
// It sits in the (list) group because a loading.tsx also wraps every segment below it, and market
// detail's real 404 needs nothing above it that streams.
export default function Loading() {
  return (
    <SkeletonScreen name="markets" className={pageClass}>
      <SkeletonPageHeader action />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-20" />
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="md:p-[18px]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-16 rounded-full" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-6 w-4/5" />
              <Skeleton className="h-[84px]" />
              <div className="flex flex-col gap-1.5">
                {Array.from({ length: 2 }, (_, j) => (
                  <div key={j} className="flex min-h-7 items-center gap-2.5">
                    <Skeleton className="size-2.5 shrink-0 rounded-full" />
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="ml-auto h-4 w-10" />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonScreen>
  )
}
```

The route skeleton test imported both files. Replace `tests/components/loading-skeletons.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ComponentType } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import HomeLoading from '@/app/(app)/(home)/loading'
import MarketsLoading from '@/app/(app)/markets/(list)/loading'
import CreateMarketLoading from '@/app/(app)/markets/new/loading'
import ParlaysLoading from '@/app/(app)/parlays/loading'
import TasksLoading from '@/app/(app)/tasks/loading'
import FeedLoading from '@/app/(app)/feed/loading'
import LeaderboardLoading from '@/app/(app)/leaderboard/loading'
import AdminInvitesLoading from '@/app/(app)/admin/invites/loading'
import AdminTasksLoading from '@/app/(app)/admin/tasks/loading'
import AdminMembersLoading from '@/app/(app)/admin/members/loading'
import AdminLedgerLoading from '@/app/(app)/admin/ledger/loading'

const SKELETONS: [string, ComponentType][] = [
  ['home', HomeLoading],
  ['markets', MarketsLoading],
  ['create-market', CreateMarketLoading],
  ['parlays', ParlaysLoading],
  ['tasks', TasksLoading],
  ['feed', FeedLoading],
  ['leaderboard', LeaderboardLoading],
  ['admin-invites', AdminInvitesLoading],
  ['admin-tasks', AdminTasksLoading],
  ['admin-members', AdminMembersLoading],
  ['admin-ledger', AdminLedgerLoading],
]

describe.each(SKELETONS)('the %s skeleton', (name, Loading) => {
  it('is named, announces loading, and shows nothing but hidden blocks', () => {
    const { container } = render(<Loading />)

    expect(container.querySelector(`[data-skeleton="${name}"]`)).not.toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(3)
    for (const block of container.querySelectorAll('.skeleton')) {
      expect(block).toHaveAttribute('aria-hidden', 'true')
    }
    // Page e2e specs count headings, list items, links and buttons; a skeleton must add none.
    for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
      expect(screen.queryAllByRole(role)).toHaveLength(0)
    }
    expect(container).toHaveTextContent(/^Loading…$/)
  })
})
```

Run: `npx vitest run tests/components/loading-skeletons.test.tsx tests/lib/auth/app-paths.test.ts`
Expected: PASS, with 14 tests (11 route skeletons and 3 app-path checks; the `market` case is gone).

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test e2e/market-not-found.spec.ts`
Expected: PASS. Nothing above the page streams any more, and today's page still awaits every read before it renders, so both ids get a real 404. Until Step 5, though, the page shows nothing until its slowest read lands.

- [ ] **Step 3: Write the failing test for the section skeletons**

Create `tests/components/market-detail-skeletons.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import type { ReactElement } from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('react', async (importOriginal) =>
  (await import('@/tests/components/view-transition-mock')).withViewTransition(await importOriginal()),
)

import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'

// The fallbacks sit on the page beside real content, so like a route skeleton they must add
// nothing the market e2e specs count.
function expectOnlyHiddenBlocks(container: HTMLElement, statuses: number) {
  expect(screen.getAllByRole('status')).toHaveLength(statuses)
  for (const status of screen.getAllByRole('status')) expect(status).toHaveTextContent('Loading…')
  expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(1)
  for (const block of container.querySelectorAll('.skeleton')) {
    expect(block).toHaveAttribute('aria-hidden', 'true')
  }
  for (const role of ['heading', 'listitem', 'link', 'button', 'region'] as const) {
    expect(screen.queryAllByRole(role)).toHaveLength(0)
  }
  expect(container).toHaveTextContent(new RegExp(`^(Loading…){${statuses}}$`))
}

describe.each<[string, ReactElement, string[]]>([
  ['market-chart', <MarketChartSkeleton key="chart" />, ['lg:col-start-1', 'lg:row-start-1']],
  ['market-bets', <MarketBetsSkeleton key="bets" />, ['lg:col-start-1', 'lg:row-start-3']],
])('the %s skeleton', (name, element, placement) => {
  it('is named, announces loading, holds its grid cell, and shows nothing but hidden blocks', () => {
    const { container } = render(element)

    const screenEl = container.querySelector(`[data-skeleton="${name}"]`)
    expect(screenEl).not.toBeNull()
    expect(screenEl).toHaveClass(...placement)
    expectOnlyHiddenBlocks(container, 1)
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
    expectOnlyHiddenBlocks(container, 2)
  })

  it('draws one outcome row per outcome', () => {
    const { container } = render(<MarketActionsSkeleton outcomes={4} />)

    const rows = container.querySelector('[data-skeleton="market-outcomes"] .divide-y')
    expect(rows?.children).toHaveLength(4)
  })
})
```

Run: `npx vitest run tests/components/market-detail-skeletons.test.tsx`
Expected: FAIL, with `Failed to resolve import "@/components/markets/market-detail-skeletons"`. The module doesn't exist yet.

- [ ] **Step 4: Create the section skeletons**

Their blocks are the deleted route skeleton's, split by section. Each `SkeletonScreen` wrapper is the grid item, so it carries the grid placement of the section it stands in for. The outcomes stand-in draws one row per outcome, because the page already knows how many there are.

Create `components/markets/market-detail-skeletons.tsx`:

```tsx
import { Skeleton, SkeletonCard, SkeletonField, SkeletonScreen } from '@/components/ui/skeleton'

// Stand-ins for the sections market detail streams (app/(app)/markets/[id]/page.tsx). Each one
// carries its section's grid placement, so from lg the two-column layout holds while they load.

export function MarketChartSkeleton() {
  return (
    <SkeletonScreen name="market-chart" className="lg:col-start-1 lg:row-start-1">
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
      <SkeletonScreen name="market-outcomes" className="lg:col-start-1 lg:row-start-2">
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
    <SkeletonScreen name="market-bets" className="lg:col-start-1 lg:row-start-3">
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

Run: `npx vitest run tests/components/market-detail-skeletons.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Stream the market page's sections**

Replace `app/(app)/markets/[id]/page.tsx` with:

```tsx
import { Suspense } from 'react'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { Layers, Trophy } from 'lucide-react'
import { requireUser } from '@/lib/auth/require-user'
import { LiveTables } from '@/components/live/live-tables'
import { pageSubscriptions } from '@/lib/live/page-subscriptions'
import { isAdmin } from '@/lib/auth/is-admin'
import { getMarket, getMarketBets, type MarketDetail } from '@/lib/markets/get-market'
import { getChartBets } from '@/lib/markets/chart-bets'
import { buildProbabilitySeries } from '@/lib/markets/probability-series'
import { computeOdds, type OutcomeOdds } from '@/lib/markets/odds'
import { outcomeSeries } from '@/lib/markets/outcome-series'
import { chartClosedAt } from '@/lib/markets/market-status'
import { rowState } from '@/lib/markets/row-state'
import { newestHref, readPageParams, showMoreHref, type PageParams, type SearchParams } from '@/lib/pagination/cursor'
import { isUuid } from '@/lib/uuid'
import { getSlipView } from '@/lib/parlays/get-slip'
import { readSlip } from '@/lib/parlays/slip'
import { MAX_PICKS, legOddsBp } from '@/lib/parlays/odds'
import { addToSlipAction, removeFromSlipAction } from '@/lib/parlays/slip-actions'
import { BackLink } from '@/components/ui/back-link'
import { LocalTime } from '@/components/ui/local-time'
import { Message } from '@/components/ui/message'
import { Page, h1Class } from '@/components/ui/page'
import { SectionCard } from '@/components/ui/section-card'
import { BackToNewest, ShowMore } from '@/components/ui/show-more'
import { StatusChip } from '@/components/ui/status-chip'
import { ContentReveal } from '@/components/nav/page-transition'
import { BetList } from '@/components/markets/bet-list'
import { MarketActionsSkeleton, MarketBetsSkeleton, MarketChartSkeleton } from '@/components/markets/market-detail-skeletons'
import { MarketSlipProvider } from '@/components/markets/market-slip'
import { OutcomeRow } from '@/components/markets/outcome-row'
import { ProbabilityChart } from '@/components/markets/probability-chart'
import { BetForm } from './bet-form'
import { ResolveForm } from './resolve-form'
import { SlipDrawer } from './slip-drawer'
import { VoidButton } from './void-button'

// No loading.tsx for this route (and the markets list's own loading.tsx sits in the (list)
// group, so it doesn't wrap this one): the market must be found before anything streams, so an
// unknown id still gets a real 404 status. The chart, the outcomes and bet column, and the bets
// each stream in behind their own skeleton.
export default async function MarketDetailPage(props: PageProps<'/markets/[id]'>) {
  const { id } = await props.params
  const searchParams = await props.searchParams
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!isUuid(id)) notFound()

  // The slip is only a cookie, so reading it here costs nothing. Its pick seeds
  // MarketSlipProvider, which has to sit above both the outcomes and the drawer.
  const [market, slip] = await Promise.all([getMarket(supabase, id), readSlip()])
  if (!market) notFound()

  const odds = computeOdds(market.outcomes.map((o) => ({ id: o.id, label: o.label, pool_total: o.poolTotal })))

  const isCreator = market.createdBy === user.id
  // Server Components render once per request with no re-render/
  // reconciliation cycle for React to keep consistent across -- the
  // purity rule protects Client Components from that, which doesn't
  // apply here, and this page already does non-deterministic async DB
  // reads (getMarket, getMarketBets, isAdmin) on every invocation regardless.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const isPastClose = new Date(market.closeAt).getTime() <= now
  const canBet = market.status === 'open' && !isPastClose
  const marketPick = market.outcomes.find((o) => slip.includes(o.id))?.id ?? null

  const statusTone =
    market.status === 'resolved' ? 'done' : market.status === 'voided' ? 'void' : isPastClose ? 'wait' : 'open'

  const when =
    market.status === 'resolved' && market.resolvedAt ? (
      <>
        Resolved <LocalTime iso={market.resolvedAt} format="day" /> ·{' '}
      </>
    ) : market.status === 'open' ? (
      <>
        {isPastClose ? 'Closed' : 'Closes'} <LocalTime iso={market.closeAt} format="dateTime" /> ·{' '}
      </>
    ) : null

  return (
    <Page transition="drill-down">
      {/* Wraps the drawer too (rendered below, outside the Outcomes section) so removing this
          market's pick from inside it flips the outcome row off in the same transition. */}
      <MarketSlipProvider pick={marketPick}>
        <LiveTables subscriptions={pageSubscriptions.marketDetail(market.id)} />
        <BackLink href="/markets">Markets</BackLink>

        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={statusTone}>
              Status: {market.status === 'open' && isPastClose ? 'awaiting resolution' : market.status}
            </StatusChip>
            <span className="text-sm text-ink2">
              {when}Created by {isCreator ? 'you' : market.creatorName}
            </span>
          </div>
          <h1 className={h1Class}>{market.title}</h1>
          {market.description && <p className="max-w-[68ch] text-ink2">{market.description}</p>}
          {market.status === 'resolved' && market.resolvedOutcomeLabel && (
            <Message tone="ok" icon={Trophy} className="self-start">
              Winning outcome: {market.resolvedOutcomeLabel}
            </Message>
          )}
        </div>

        {/* Each section's fallback carries the same grid placement as the section itself. */}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:grid-rows-[auto_auto_1fr] lg:items-start lg:gap-7">
          <Suspense fallback={<MarketChartSkeleton />}>
            <MarketChart market={market} odds={odds} now={now} />
          </Suspense>
          <Suspense fallback={<MarketActionsSkeleton outcomes={market.outcomes.length} />}>
            <MarketActions
              market={market}
              odds={odds}
              slip={slip}
              isCreator={isCreator}
              isPastClose={isPastClose}
              canBet={canBet}
            />
          </Suspense>
          <Suspense fallback={<MarketBetsSkeleton />}>
            <MarketBets
              market={market}
              viewerId={user.id}
              canBet={canBet}
              page={readPageParams(searchParams, 'bets')}
              searchParams={searchParams}
            />
          </Suspense>
        </div>

        <Suspense fallback={null}>
          <MarketSlipDrawer slip={slip} />
        </Suspense>
      </MarketSlipProvider>
    </Page>
  )
}

async function MarketChart({ market, odds, now }: { market: MarketDetail; odds: OutcomeOdds[]; now: number }) {
  const { supabase } = await requireUser()
  const chartBets = await getChartBets(supabase, market.id)
  const chartOutcomes = odds.map((o, index) => ({
    id: o.outcomeId,
    label: o.label,
    series: outcomeSeries(market.kind, o.label, index),
  }))
  const chartPoints = buildProbabilitySeries(
    chartOutcomes.map((o) => o.id),
    chartBets,
  )

  return (
    <ContentReveal>
      <SectionCard title="Chance over time" titleId="chart-title" className="gap-3 lg:col-start-1 lg:row-start-1">
        <ProbabilityChart
          outcomes={chartOutcomes}
          points={chartPoints}
          now={now}
          closedAt={chartClosedAt(market.status, market.closeAt, market.resolvedAt)}
          resolvedLabel={market.status === 'resolved' ? market.resolvedOutcomeLabel : null}
        />
      </SectionCard>
    </ContentReveal>
  )
}

async function MarketActions({
  market,
  odds,
  slip,
  isCreator,
  isPastClose,
  canBet,
}: {
  market: MarketDetail
  odds: OutcomeOdds[]
  slip: string[]
  isCreator: boolean
  isPastClose: boolean
  canBet: boolean
}) {
  const { supabase } = await requireUser()
  const admin = await isAdmin(supabase)

  const totalPool = odds.reduce((sum, o) => sum + o.poolTotal, 0)
  const canResolve = market.status === 'open' && ((isCreator && isPastClose) || admin)
  const canOverride = market.status === 'resolved' && admin
  const canVoid = market.status === 'open' && (isCreator || admin)
  const showResolve = canResolve || canOverride

  const marketInSlip = market.outcomes.some((o) => slip.includes(o.id))
  const slipFull = slip.length >= MAX_PICKS && !marketInSlip

  const closedCopy =
    market.status === 'resolved' ? (
      <>
        This market resolved
        {market.resolvedAt && (
          <>
            {' '}
            on <LocalTime iso={market.resolvedAt} format="day" />
          </>
        )}{' '}
        and payouts have been sent.
      </>
    ) : market.status === 'voided' ? (
      'This market was voided, and every bet and parlay leg was refunded.'
    ) : (
      <>
        This market closed <LocalTime iso={market.closeAt} format="dateTime" /> and is awaiting resolution.
      </>
    )

  const manageHint = canOverride
    ? 'You’re an admin. A new outcome reverses the payouts and pays the new winners.'
    : !isCreator
      ? 'You’re an admin. Only admins and this market’s creator see this.'
      : canResolve
        ? 'You created this market. Only you and admins see this.'
        : 'You created this market. You can resolve it once it closes.'

  return (
    <ContentReveal>
      <SectionCard
        title="Outcomes"
        titleId="outcomes-title"
        action={<span className="text-sm text-ink2 tabular-nums">{totalPool} DC in the pool</span>}
        className="gap-1 lg:col-start-1 lg:row-start-2"
      >
        {canBet && slipFull && (
          <Message tone="gold" icon={Layers} id="slip-full-note" className="mt-2">
            Your slip is full ({MAX_PICKS} picks).{' '}
            <Link href="/parlays" className="text-inherit">
              Review slip
            </Link>
          </Message>
        )}
        <ul className="flex flex-col divide-y divide-line">
          {odds.map((o, index) => (
            <li key={o.outcomeId}>
              <OutcomeRow
                outcomeId={o.outcomeId}
                label={o.label}
                poolTotal={o.poolTotal}
                probability={o.impliedProbability}
                oddsBp={legOddsBp(totalPool, o.poolTotal)}
                series={outcomeSeries(market.kind, o.label, index)}
                state={rowState(o.outcomeId, o.poolTotal, { slip, canBet, slipFull })}
                winner={market.status === 'resolved' && o.label === market.resolvedOutcomeLabel}
                addAction={addToSlipAction.bind(null, o.outcomeId)}
                removeAction={removeFromSlipAction.bind(null, o.outcomeId)}
                disabledReasonId={slipFull ? 'slip-full-note' : undefined}
              />
            </li>
          ))}
        </ul>
      </SectionCard>

      <div className="flex flex-col gap-5 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:gap-7">
        {canBet ? (
          <SectionCard title="Place a bet" titleId="bet-title" className="gap-4">
            <BetForm marketId={market.id} outcomes={market.outcomes} />
          </SectionCard>
        ) : (
          <SectionCard title="Betting closed" titleId="closed-title" className="gap-2">
            <p className="text-ink2">{closedCopy}</p>
          </SectionCard>
        )}

        {(showResolve || canVoid) && (
          <SectionCard
            title={canOverride ? 'Override resolution' : 'Resolve market'}
            titleId="manage-title"
            className="gap-1"
          >
            <p className="text-sm text-ink2">{manageHint}</p>
            <div className="mt-3 flex flex-col gap-4">
              {showResolve && <ResolveForm marketId={market.id} outcomes={market.outcomes} />}
              {canVoid && (
                <VoidButton marketId={market.id} className={showResolve ? 'border-t border-line pt-4' : undefined} />
              )}
            </div>
          </SectionCard>
        )}
      </div>
    </ContentReveal>
  )
}

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

  return (
    <ContentReveal>
      <SectionCard title="Bets" titleId="bets-title" className="gap-1 lg:col-start-1 lg:row-start-3">
        {betsPage.windowed && (
          <div className="flex flex-col py-2">
            <BackToNewest href={newestHref(pathname, searchParams, 'bets')} />
          </div>
        )}
        <BetList bets={betsPage.rows} outcomes={market.outcomes} viewerId={viewerId} canBet={canBet} />
        {betsPage.next && (
          <div className="flex flex-col border-t border-line pt-3">
            <ShowMore
              href={showMoreHref(pathname, searchParams, 'bets', betsPage.next)}
              fresh={betsPage.next.kind === 'window'}
            />
          </div>
        )}
      </SectionCard>
    </ContentReveal>
  )
}

async function MarketSlipDrawer({ slip }: { slip: string[] }) {
  const { supabase } = await requireUser()
  return <SlipDrawer slip={await getSlipView(supabase, slip)} />
}
```

What moved where, compared with the old file:
- **The page body** keeps everything that needs only the market and the clock: the status line, the title, the description, the winning-outcome message, `canBet`, and `marketPick` for the provider. It keeps the one `Date.now()` too, passed down so every section judges "past close" from the same instant.
- **`MarketChart`** now owns `getChartBets`, and builds the chart outcomes and points.
- **`MarketActions`** now owns `isAdmin`, along with everything derived from it (`canResolve`, `canOverride`, `canVoid`, the manage hint), plus the slip-full note, the closed copy, the outcomes list and the bet column. It returns two grid items, the outcomes card and the bet column, in their old DOM order.
- **`MarketBets`** now owns `getMarketBets`, with its "Back to newest" and "Show more".
- **`MarketSlipDrawer`** now owns `getSlipView`. Its fallback is `null`, because the drawer's trigger only ever appears once the server's slip has a pick.

Each section wraps its output in `ContentReveal`, as the member page's activity list does, so it fades in over its skeleton.

Run: `npx next typegen && npx tsc --noEmit && npm run lint`
Expected: both clean. `next typegen` rewrites `.next/types` first: a build left over from an earlier task still lists the old `app/(app)/markets/page.js`, so without it tsc fails with `Cannot find module '../../app/(app)/markets/page.js'`.

- [ ] **Step 6: Verify**

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. This task adds 4 Vitest tests in 1 new file and removes 1 (the deleted route skeleton's case), so the net change is +3 tests and +1 file. The build lists the same 20 routes as before: `/markets` is still `/markets`, and `/markets/[id]` is still there.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed (26 before, plus `market-not-found`). Every existing market-page spec passes unchanged: `market-engine`, `charts`, `optimistic-slip`, `social`, `slip-drawer`, `void-market`, `clawback`, `parlays` and `back-swipe` (whose `/markets` heading comes from the moved list page). `signed-out` still gets its 307 for `/markets` and `/markets/not-a-uuid` (the proxy answers before any page runs), and `social` still gets the member page's 404.

- [ ] **Step 7: Commit**

```bash
git add -A "app/(app)/markets" components/markets/market-detail-skeletons.tsx \
  tests/components/market-detail-skeletons.test.tsx tests/components/loading-skeletons.test.tsx \
  e2e/market-not-found.spec.ts
git commit -m "$(cat <<'EOF'
Give broken market links a real 404, and stream the market page's sections
EOF
)"
```

---

## Task 4: Live ranks and tap targets

This task has two independent halves that happen to share an owner. **1b (live ranks):** `lib/live/page-subscriptions.ts`'s `home()` and `member()` gain an unfiltered `{ table: 'profiles' }` entry, so `getMemberStanding`'s rank and member count refresh on *any* member's balance change, not only the signed-in member's own row (which the base channel already covers) or, on the member page, only the profile being viewed. **1c (tap targets):** five standalone links get a `min-h-11` hit area, keeping their visual weight and underline exactly as they are.

**Coordination note:** `app/(app)/admin/members/adjust-balance-form.tsx` is also edited by Task 2 (drafter A), which runs before this task and adds a `TEXT_LIMITS` import plus `maxLength` on the Reason input. Step 3 below edits only the member-name `<Link>`, as a small anchored replace — never regenerate this file from `3031e7e`, or Task 2's changes are lost.

**Files:**
- Modify: `lib/live/page-subscriptions.ts`
- Modify: `components/leaderboard/leaderboard-row.tsx`
- Modify: `app/(app)/admin/members/adjust-balance-form.tsx` (the member-name `<Link>` only; see the coordination note above)
- Modify: `components/markets/market-card.tsx`
- Modify: `components/parlays/slip-pick.tsx`
- Modify: `components/parlays/placed-parlay.tsx`
- Test, modify: `tests/lib/live/page-subscriptions.test.ts`, `tests/components/leaderboard-row.test.tsx`, `tests/components/market-card.test.tsx`, `tests/components/slip-pick.test.tsx`, `tests/components/placed-parlay.test.tsx`
- Test, create: `tests/components/adjust-balance-form.test.tsx`

**Interfaces:**
- Consumes: `LiveSubscription` and `LIVE_TABLES` from `components/live/live-refresh.tsx` (unchanged by this task); `MemberSummary` from `lib/members/list-members.ts`; `SlipPick` (the type) from `lib/parlays/get-slip.ts`; `ParlayView` from `lib/parlays/list-parlays.ts`.
- Produces: no new exports. `pageSubscriptions.home()` and `.member()` return one more entry each; the five link components accept the same props as before and render the same text, role and `href` — only their `className` gains `inline-flex min-h-11 items-center`.

Checkboxes and radios need no code change (spec 1d): every one already uses `accent-primary`, and `color-scheme` flips with the theme. Task 7's visual check confirms this in dark mode; if a native box turns out unreadable there, that's a finding for Task 7, not a step here.

- [ ] **Step 1: Write the failing tests**

In `tests/lib/live/page-subscriptions.test.ts`, replace:

```ts
  it('home, for a member, filters task_completions to their own submissions', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: false })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('home, for an admin, watches every submission so the pending-approvals tile stays live', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: true })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'task_completions' },
    ])
  })
```

with:

```ts
  it('home, for a member, filters task_completions to their own submissions and watches every profile for live ranks', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: false })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      { table: 'task_completions', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })

  it('home, for an admin, watches every submission and every profile so ranks and pending-approvals stay live', () => {
    expect(pageSubscriptions.home({ me: MEMBER_ID, admin: true })).toEqual([
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      { table: 'task_completions' },
    ])
  })
```

In the same file, replace:

```ts
  it('member carries the member id through profiles, bets and parlays', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'profiles', filter: `id=eq.${MEMBER_ID}` },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })
```

with:

```ts
  it('member watches every profile for live ranks, and carries the member id through bets and parlays', () => {
    expect(pageSubscriptions.member(MEMBER_ID)).toEqual([
      { table: 'profiles' },
      { table: 'bets', filter: `profile_id=eq.${MEMBER_ID}` },
      { table: 'parlays', filter: `profile_id=eq.${MEMBER_ID}` },
    ])
  })
```

In `tests/components/leaderboard-row.test.tsx`, replace:

```tsx
    expect(screen.getByRole('link', { name: 'Aaron' })).toBeInTheDocument()
    expect(screen.getByText('(you)', { exact: false })).toBeInTheDocument()
  })
})
```

with:

```tsx
    expect(screen.getByRole('link', { name: 'Aaron' })).toBeInTheDocument()
    expect(screen.getByText('(you)', { exact: false })).toBeInTheDocument()
  })

  it('gives the name link a 44px tap target', () => {
    render(
      <ol>
        <LeaderboardRow rank={2} name="Bob" balance={90} isMe={false} href="/members/bob" />
      </ol>,
    )
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveClass('min-h-11')
  })
})
```

In `tests/components/market-card.test.tsx`, replace:

```tsx
    expect(screen.queryByText('no bets yet')).not.toBeInTheDocument()
  })

  it('shows outcome pills and "no bets yet" when nothing has been staked', () => {
```

with:

```tsx
    expect(screen.queryByText('no bets yet')).not.toBeInTheDocument()
  })

  it('gives the title link a 44px tap target', () => {
    render(
      <MarketCard
        id="m1"
        title="Who wins the chili cook-off?"
        status="open"
        kind="multiple_choice"
        closeAt="2026-10-04T16:30:00.000Z"
        resolvedAt={null}
        outcomes={[
          { id: 'a', label: 'Tom', pct: 60 },
          { id: 'b', label: 'Sarah', pct: 40 },
        ]}
        resolvedOutcomeLabel={null}
      />,
    )
    expect(screen.getByRole('link', { name: 'Who wins the chili cook-off?' })).toHaveClass('min-h-11')
  })

  it('shows outcome pills and "no bets yet" when nothing has been staked', () => {
```

In `tests/components/slip-pick.test.tsx`, replace:

```tsx
    expect(screen.queryByText('No longer available')).toBeNull()
  })

  it('formats the odds as plain digits, in en-US regardless of the browser locale', () => {
```

with:

```tsx
    expect(screen.queryByText('No longer available')).toBeNull()
  })

  it('gives the market title link a 44px tap target', () => {
    render(<SlipPick pick={live} removeAction={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'Will it rain on the church picnic?' })).toHaveClass('min-h-11')
  })

  it('formats the odds as plain digits, in en-US regardless of the browser locale', () => {
```

In `tests/components/placed-parlay.test.tsx`, replace:

```tsx
    expect(screen.getByText('pending')).toHaveClass('bg-gold-soft', 'text-gold')
  })
})
```

with:

```tsx
    expect(screen.getByText('pending')).toHaveClass('bg-gold-soft', 'text-gold')
  })

  it('gives each leg link a 44px tap target', () => {
    renderParlay(parlay({}))
    for (const link of screen.getAllByRole('link')) expect(link).toHaveClass('min-h-11')
  })
})
```

Create `tests/components/adjust-balance-form.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AdjustBalanceForm } from '@/app/(app)/admin/members/adjust-balance-form'
import type { MemberSummary } from '@/lib/members/list-members'

const member: MemberSummary = {
  id: 'member-1',
  displayName: 'Bob',
  email: 'bob@example.com',
  balance: 90,
  isAdmin: false,
}

describe('AdjustBalanceForm', () => {
  it('links the member name to their profile with a 44px tap target', () => {
    render(<AdjustBalanceForm member={member} />)
    const link = screen.getByRole('link', { name: 'Bob' })
    expect(link).toHaveAttribute('href', '/members/member-1')
    expect(link).toHaveClass('min-h-11')
  })

  it('keeps the name bold and shows the balance beside it', () => {
    render(<AdjustBalanceForm member={member} />)
    expect(screen.getByRole('link', { name: 'Bob' })).toHaveClass('font-extrabold')
    expect(screen.getByText('90 DC')).toBeInTheDocument()
  })
})
```

Run: `npx vitest run tests/lib/live/page-subscriptions.test.ts tests/components/leaderboard-row.test.tsx tests/components/market-card.test.tsx tests/components/slip-pick.test.tsx tests/components/placed-parlay.test.tsx tests/components/adjust-balance-form.test.tsx`
Expected: FAIL, with 8 failed and 41 passed. The three updated `page-subscriptions` assertions no longer match `home()` / `member()`'s current return values, and the five tap-target assertions (one per component, including `adjust-balance-form.test.tsx`'s first case) fail because no link yet carries `min-h-11`. `adjust-balance-form.test.tsx`'s second case already passes.

- [ ] **Step 2: Update the live subscriptions**

In `lib/live/page-subscriptions.ts`, replace:

```ts
  // The HomeHero's pending-review count and the admin tile's pending-approvals count both only
  // change via task_completions -- a rejection moves no balance, so bets/profiles don't cover it.
  // An admin needs every submission; a member only needs their own.
  home({ me, admin }: { me: string; admin: boolean }): LiveSubscription[] {
    return [
      { table: 'markets' },
      { table: 'tasks' },
      admin ? { table: 'task_completions' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
```

with:

```ts
  // The HomeHero's pending-review count and the admin tile's pending-approvals count both only
  // change via task_completions -- a rejection moves no balance, so bets/profiles don't cover it.
  // An admin needs every submission; a member only needs their own. profiles is unfiltered so the
  // rank and member count (getMemberStanding) refresh when any member's balance changes, not just
  // this member's own.
  home({ me, admin }: { me: string; admin: boolean }): LiveSubscription[] {
    return [
      { table: 'markets' },
      { table: 'tasks' },
      { table: 'profiles' },
      admin ? { table: 'task_completions' } : { table: 'task_completions', filter: `profile_id=eq.${me}` },
    ]
  },
```

In the same file, replace:

```ts
  member(memberId: string): LiveSubscription[] {
    return [
      { table: 'profiles', filter: `id=eq.${memberId}` },
      { table: 'bets', filter: `profile_id=eq.${memberId}` },
      { table: 'parlays', filter: `profile_id=eq.${memberId}` },
    ]
  },
```

with:

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
```

- [ ] **Step 3: Give the five links a 44px hit area**

In `components/leaderboard/leaderboard-row.tsx`, replace:

```tsx
        <Link href={href} transitionTypes={['nav-forward']}>{name}</Link>
```

with:

```tsx
        <Link href={href} transitionTypes={['nav-forward']} className="inline-flex min-h-11 items-center">
          {name}
        </Link>
```

In `app/(app)/admin/members/adjust-balance-form.tsx`, replace only:

```tsx
            <Link href={`/members/${member.id}`} transitionTypes={['nav-forward']} className="font-extrabold">
              {member.displayName}
            </Link>
```

with:

```tsx
            <Link
              href={`/members/${member.id}`}
              transitionTypes={['nav-forward']}
              className="inline-flex min-h-11 items-center font-extrabold"
            >
              {member.displayName}
            </Link>
```

Nothing else in this file changes — its import block and its Reason input's `maxLength` are Task 2's.

In `components/markets/market-card.tsx`, replace:

```tsx
      <h3 className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em]">
        <Link href={`/markets/${id}`} transitionTypes={['nav-forward']}>{title}</Link>
      </h3>
```

with:

```tsx
      <h3 className="text-[18px] font-extrabold leading-[1.3] tracking-[-0.01em]">
        <Link href={`/markets/${id}`} transitionTypes={['nav-forward']} className="inline-flex min-h-11 items-center">
          {title}
        </Link>
      </h3>
```

In `components/parlays/slip-pick.tsx`, replace:

```tsx
        <Link href={`/markets/${pick.marketId}`} transitionTypes={['nav-forward']} className="text-sm">
          {pick.marketTitle}
        </Link>
```

with:

```tsx
        <Link
          href={`/markets/${pick.marketId}`}
          transitionTypes={['nav-forward']}
          className="inline-flex min-h-11 items-center text-sm"
        >
          {pick.marketTitle}
        </Link>
```

In `components/parlays/placed-parlay.tsx`, replace:

```tsx
            <span className="min-w-0 grow">
              <Link href={`/markets/${leg.marketId}`} transitionTypes={['nav-forward']}>
                {leg.marketTitle}
              </Link>
              {' — '}
              <strong>{leg.outcomeLabel}</strong>
            </span>
```

with:

```tsx
            <span className="min-w-0 grow">
              <Link
                href={`/markets/${leg.marketId}`}
                transitionTypes={['nav-forward']}
                className="inline-flex min-h-11 items-center"
              >
                {leg.marketTitle}
              </Link>
              {' — '}
              <strong>{leg.outcomeLabel}</strong>
            </span>
```

- [ ] **Step 4: Run and see the tests pass**

Run: `npx vitest run tests/lib/live/page-subscriptions.test.ts tests/components/leaderboard-row.test.tsx tests/components/market-card.test.tsx tests/components/slip-pick.test.tsx tests/components/placed-parlay.test.tsx tests/components/adjust-balance-form.test.tsx`
Expected: PASS, 49 tests total: `page-subscriptions.test.ts` 20 (three assertions changed, none added); `leaderboard-row.test.tsx` 5 (was 4); `market-card.test.tsx` 9 (was 8); `slip-pick.test.tsx` 6 (was 5); `placed-parlay.test.tsx` 7 (was 6); `adjust-balance-form.test.tsx` 2 (new file).

- [ ] **Step 5: Verify**

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 1045 tests in 157 files, 43 of them in `tests/db/`. This task adds 6 tests: `leaderboard-row.test.tsx` +1, `market-card.test.tsx` +1, `slip-pick.test.tsx` +1, `placed-parlay.test.tsx` +1, `adjust-balance-form.test.tsx` +2 (new file); `page-subscriptions.test.ts` is unchanged in count.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged. No e2e spec asserts on class names, and no link's text, role or `href` changed.

- [ ] **Step 6: Commit**

```bash
git add lib/live/page-subscriptions.ts components/leaderboard/leaderboard-row.tsx \
  "app/(app)/admin/members/adjust-balance-form.tsx" components/markets/market-card.tsx \
  components/parlays/slip-pick.tsx components/parlays/placed-parlay.tsx \
  tests/lib/live/page-subscriptions.test.ts tests/components/leaderboard-row.test.tsx \
  tests/components/market-card.test.tsx tests/components/slip-pick.test.tsx \
  tests/components/placed-parlay.test.tsx tests/components/adjust-balance-form.test.tsx
git commit -m "$(cat <<'EOF'
Watch every profile for live ranks, and give five title links a 44px tap target
EOF
)"
```

---

## Task 5: The startup settings check

A missing production setting should fail loudly at startup, not misbehave quietly once a member hits it. `lib/env/required.ts` is a small, pure module: `missingEnv(env)` names what's absent from an explicit env object, and `assertRequiredEnv(env = process.env)` throws once, naming every missing variable and no value. `instrumentation.ts`, per `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`, exports `register()`, which Next calls once "when a new Next.js server instance is initiated, and must complete before the server is ready to handle requests" — that call happens for `next dev` and `next start`, confirmed below to **not** happen during `next build` itself.

This repo has no `src/` folder (`ls` at the repo root shows `app/`, `components/`, `lib/` etc. directly), so `instrumentation.ts` goes at the repo root beside `next.config.ts` and `proxy.ts`, per the doc's "place the file in the root of your application or inside a `src` folder if using one."

**Files:**
- Create: `lib/env/required.ts`
- Create: `instrumentation.ts`
- Test, create: `tests/lib/env/required.test.ts`

**Interfaces:**
- Consumes: nothing (a plain module with no imports beyond its own types). Next's instrumentation file convention, as documented above.
- Produces:
  ```ts
  // lib/env/required.ts
  export const ALWAYS_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
  export const PRODUCTION_REQUIRED = ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'] as const
  export function missingEnv(env: Record<string, string | undefined>): string[]
  export function assertRequiredEnv(env?: Record<string, string | undefined>): void

  // instrumentation.ts
  export function register(): void
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/lib/env/required.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ALWAYS_REQUIRED, PRODUCTION_REQUIRED, assertRequiredEnv, missingEnv } from '@/lib/env/required'

const BASE = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
}

const PRODUCTION = {
  ...BASE,
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  CRON_SECRET: 'cron-secret',
  VERCEL_ENV: 'production',
}

describe('missingEnv', () => {
  it('is empty when every always-required var is set, outside production', () => {
    expect(missingEnv(BASE)).toEqual([])
  })

  it('names every missing always-required var', () => {
    expect(missingEnv({})).toEqual([...ALWAYS_REQUIRED])
    expect(missingEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
  })

  it('also requires the production vars, but only when VERCEL_ENV is production', () => {
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'preview' })).toEqual([])
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'development' })).toEqual([])
    expect(missingEnv({ ...BASE, VERCEL_ENV: 'production' })).toEqual([...PRODUCTION_REQUIRED])
  })

  it('is empty in production once every var is set', () => {
    expect(missingEnv(PRODUCTION)).toEqual([])
  })

  it('treats an empty string the same as unset', () => {
    expect(missingEnv({ ...BASE, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' })).toEqual(['NEXT_PUBLIC_SUPABASE_ANON_KEY'])
  })
})

describe('assertRequiredEnv', () => {
  it('does not throw when nothing is missing', () => {
    expect(() => assertRequiredEnv(BASE)).not.toThrow()
    expect(() => assertRequiredEnv(PRODUCTION)).not.toThrow()
  })

  it('throws naming every missing var', () => {
    expect(() => assertRequiredEnv({ ...BASE, VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'x' })).toThrow(
      'Missing required environment variables: CRON_SECRET',
    )
  })

  it("never includes a variable's value in the message", () => {
    expect.assertions(1)
    try {
      assertRequiredEnv({ ...BASE, VERCEL_ENV: 'production', SUPABASE_SERVICE_ROLE_KEY: 'super-secret-value' })
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-value')
    }
  })
})
```

Run: `npx vitest run tests/lib/env/required.test.ts`
Expected: FAIL. `@/lib/env/required` doesn't exist yet.

- [ ] **Step 2: Create `lib/env/required.ts`**

```ts
export const ALWAYS_REQUIRED = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const
export const PRODUCTION_REQUIRED = ['SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET'] as const

// Every var this app needs before it can safely serve a request. `env` is an explicit parameter,
// not a read of `process.env`, so this stays pure and easy to test with any combination of vars.
export function missingEnv(env: Record<string, string | undefined>): string[] {
  const required: readonly string[] =
    env.VERCEL_ENV === 'production' ? [...ALWAYS_REQUIRED, ...PRODUCTION_REQUIRED] : ALWAYS_REQUIRED
  return required.filter((name) => !env[name])
}

// Thrown from instrumentation.ts's register(), once, before the server accepts its first request.
// The message names only the missing variables -- never a value, even an already-present one.
export function assertRequiredEnv(env: Record<string, string | undefined> = process.env): void {
  const missing = missingEnv(env)
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }
}
```

Run: `npx vitest run tests/lib/env/required.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 3: Create `instrumentation.ts`**

```ts
import { assertRequiredEnv } from '@/lib/env/required'

export function register() {
  assertRequiredEnv()
}
```

- [ ] **Step 4: Confirm `register()` actually gates startup, not build**

This was checked directly, in a scratch worktree, because it changes what "verify" means for this task:

1. With `.env.local`'s two Supabase vars (plus the service-role key already in that file) present, `npx next build` succeeded.
2. With `instrumentation.ts` changed to unconditionally `throw new Error('REGISTER RAN')` and `.next` removed, `npx next build` **still succeeded** — `register()` does not run during `next build` in Next 16.3.5.
3. Restoring the real `instrumentation.ts`, `npx next start` against the full `.env.local` served `/sign-in` with a 200.
4. With `NEXT_PUBLIC_SUPABASE_ANON_KEY` removed from the environment and `.env.local` moved aside, `npx next start` logged `Failed to prepare server Error: An error occurred while loading instrumentation hook: Missing required environment variables: NEXT_PUBLIC_SUPABASE_ANON_KEY` and every request 500'd.

So this task's own verification is at `next start`, not `next build` — matching the two environments that actually run `register()` for real: Playwright's server (`playwright.config.ts` builds, then starts, a production server on :3000) and Vercel production.

Run, from a clean `.next`:

```bash
rm -rf .next && npm run build
lsof -ti:3100 | xargs kill 2>/dev/null
npx next start -p 3100 > /dev/null 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null http://localhost:3100/sign-in && break; sleep 1; done
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3100/sign-in
lsof -ti:3100 | xargs kill 2>/dev/null
```

Expected: `npm run build` passes, and the server answers `200` for `/sign-in`, because `.env.local` supplies both `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `VERCEL_ENV` is unset locally, so the production-only pair isn't required. The loop waits for the server to be ready, and the last line stops `next-server` itself (killing only the parent shell job would leave it holding the port).

- [ ] **Step 5: Verify**

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 1053 tests in 158 files, 43 of them in `tests/db/`. This task adds 8 tests, all in the new `tests/lib/env/required.test.ts`.

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged. `playwright.config.ts` builds and starts its own production server, so this run is itself a live confirmation that `register()` passes with `.env.local`'s two vars and no `VERCEL_ENV`.

- [ ] **Step 6: Commit**

```bash
git add lib/env/required.ts instrumentation.ts tests/lib/env/required.test.ts
git commit -m "$(cat <<'EOF'
Fail startup loudly when a required environment variable is missing
EOF
)"
```

---

## Task 6: The Beta badge and the feedback link

A small "Beta" pill by the wordmark in both `AppNav` headers (beside it on desktop, tucked under it on phones, where there's no width to spare) and under the symbol on the sign-in card, and a "Send feedback" tile as the last row of Home's tile list, opening the device's mail app with the address, subject and app version pre-filled.

**Files:**
- Create: `components/brand/beta-badge.tsx`
- Create: `lib/app-shell/feedback.ts`
- Modify: `components/app-nav/app-nav.tsx`
- Modify: `app/(auth)/sign-in/page.tsx`
- Modify: `components/home/home-tiles.tsx`
- Modify: `app/(app)/(home)/page.tsx`
- Test, create: `tests/components/beta-badge.test.tsx`, `tests/lib/app-shell/feedback.test.ts`
- Test, modify: `tests/components/app-nav.test.tsx`, `tests/components/sign-in-page.test.tsx`, `tests/components/home-tiles.test.tsx`

**Interfaces:**
- Consumes: `cn` from `lib/utils.ts`; `Wordmark` / `DwellDuelSymbol` from `components/brand/wordmark.tsx` (unchanged); `NEXT_PUBLIC_SW_VERSION`, the build-time deploy id `next.config.ts`'s `env` inlines everywhere (already read the same way in `components/offline/service-worker-registration.tsx`).
- Produces:
  ```ts
  // components/brand/beta-badge.tsx
  export function BetaBadge({ className }: { className?: string }): JSX.Element

  // lib/app-shell/feedback.ts
  export const FEEDBACK_EMAIL = 'aaronmaxwellwickham1917@gmail.com'
  export const FEEDBACK_SUBJECT = 'DwellDuel beta feedback'
  export function feedbackHref(version?: string): string
  ```

**A note on `BetaBadge`'s return type.** This repo's other components have no explicit return type and rely on inference; `JSX.Element` was pinned for this one, but the bare global `JSX` namespace doesn't resolve under this repo's `@types/react` 19.3.0 + `moduleResolution: "bundler"` setup (confirmed: `tsc` reports `TS2503: Cannot find namespace 'JSX'` without it). `import type { JSX } from 'react'` fixes it; Step 2 below includes it.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/beta-badge.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BetaBadge } from '@/components/brand/beta-badge'

describe('BetaBadge', () => {
  it('is a plain span reading Beta, not a control', () => {
    render(<BetaBadge />)
    const badge = screen.getByText('Beta')
    expect(badge.tagName).toBe('SPAN')
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('uses token classes, not a raw colour, and accepts extra classes for placement', () => {
    render(<BetaBadge className="ml-2" />)
    const badge = screen.getByText('Beta')
    expect(badge).toHaveClass('bg-sunk', 'text-ink2', 'ml-2')
    expect(badge.className).not.toMatch(/-(red|green|blue|yellow)-/)
  })
})
```

Create `tests/lib/app-shell/feedback.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { FEEDBACK_EMAIL, FEEDBACK_SUBJECT, feedbackHref } from '@/lib/app-shell/feedback'

describe('feedbackHref', () => {
  it('builds a mailto: link to the feedback address with the encoded subject and body', () => {
    const href = feedbackHref('abc123')
    expect(href).toBe(
      `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(FEEDBACK_SUBJECT)}&body=${encodeURIComponent('App version: abc123\n\n')}`,
    )
  })

  it('encodes the subject and body so a mail client reads them as separate fields', () => {
    const href = feedbackHref('1.2.3')
    expect(href).toContain('subject=DwellDuel%20beta%20feedback')
    expect(href).toContain('body=App%20version%3A%201.2.3')
  })

  it('falls back to the build-time app version when none is given', () => {
    expect(feedbackHref()).toContain(`body=${encodeURIComponent('App version: unknown\n\n')}`)
  })
})
```

In `tests/components/app-nav.test.tsx`, replace:

```tsx
  it('taps on a phone tab press, and not on a desktop link', () => {
```

with:

```tsx
  it('shows the Beta badge beside the wordmark in both headers, without changing the home link name', () => {
    render(<Nav balance={120} slipCount={0} isAdmin={false} />)
    const homeLinks = screen.getAllByRole('link', { name: 'DwellDuel home' })
    expect(homeLinks).toHaveLength(2)
    for (const link of homeLinks) expect(link).not.toHaveTextContent('Beta')
    expect(screen.getAllByText('Beta')).toHaveLength(2)
  })

  it('taps on a phone tab press, and not on a desktop link', () => {
```

In `tests/components/sign-in-page.test.tsx`, replace:

```tsx
  it('shows the tagline and the Google sign-in button', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { name: /Friendly bets/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })
})
```

with:

```tsx
  it('shows the tagline and the Google sign-in button', () => {
    render(<SignInPage />)
    expect(screen.getByRole('heading', { name: /Friendly bets/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument()
  })

  it('shows the Beta badge under the symbol', () => {
    render(<SignInPage />)
    expect(screen.getByText('Beta')).toBeInTheDocument()
  })
})
```

In `tests/components/home-tiles.test.tsx`, replace:

```tsx
  it('gives each tile a press state', () => {
    render(<HomeTiles tiles={[{ id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' }]} />)
    expect(screen.getByRole('link', { name: /Markets/ })).toHaveClass('pressable')
  })
})
```

with:

```tsx
  it('gives each tile a press state', () => {
    render(<HomeTiles tiles={[{ id: 'markets', href: '/markets', icon: ChartColumn, title: 'Markets', subtitle: '3 open markets' }]} />)
    expect(screen.getByRole('link', { name: /Markets/ })).toHaveClass('pressable')
  })

  it('renders a mailto: tile as a plain link, styled like every other tile', () => {
    render(
      <HomeTiles
        tiles={[
          {
            id: 'feedback',
            href: 'mailto:aaron@example.com?subject=Hi&body=Hello',
            icon: ChartColumn,
            title: 'Send feedback',
            subtitle: 'Tell Aaron what’s working',
          },
        ]}
      />,
    )
    const link = screen.getByRole('link', { name: /Send feedback/ })
    expect(link).toHaveAttribute('href', 'mailto:aaron@example.com?subject=Hi&body=Hello')
    expect(link).toHaveClass('pressable', 'no-underline')
    expect(within(link).getByText('Tell Aaron what’s working')).toBeInTheDocument()
  })
})
```

`within` is already imported at the top of `tests/components/home-tiles.test.tsx` (`import { render, screen, within } from '@testing-library/react'`).

Run: `npx vitest run tests/components/beta-badge.test.tsx tests/lib/app-shell/feedback.test.ts tests/components/app-nav.test.tsx tests/components/sign-in-page.test.tsx tests/components/home-tiles.test.tsx`
Expected: FAIL. `beta-badge.test.tsx` and `feedback.test.ts` fail to resolve their imports, and the new `app-nav` and `sign-in-page` cases find no "Beta" text: 2 files fail to load, and 2 tests fail with 20 passing. The new `home-tiles` case already passes, because today's `<Link>` also renders an `<a>` with that href and the tile classes. It pins the mailto tile's href and styling through Step 5's refactor rather than proving the new branch.

- [ ] **Step 2: Create `BetaBadge`**

Create `components/brand/beta-badge.tsx`:

```tsx
import type { JSX } from 'react'
import { cn } from '@/lib/utils'

export function BetaBadge({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center whitespace-nowrap rounded-full bg-sunk px-2 text-[10px] font-extrabold tracking-wider text-ink2 uppercase',
        className,
      )}
    >
      Beta
    </span>
  )
}
```

- [ ] **Step 3: Create the feedback link**

Create `lib/app-shell/feedback.ts`:

```ts
export const FEEDBACK_EMAIL = 'aaronmaxwellwickham1917@gmail.com'
export const FEEDBACK_SUBJECT = 'DwellDuel beta feedback'

// `version` defaults to the build-time deploy id next.config.ts's `env` inlines everywhere (see
// components/offline/service-worker-registration.tsx for the same pattern), so a caller only needs
// to pass one explicitly in a test.
export function feedbackHref(version: string = process.env.NEXT_PUBLIC_SW_VERSION ?? 'unknown'): string {
  const subject = encodeURIComponent(FEEDBACK_SUBJECT)
  const body = encodeURIComponent(`App version: ${version}\n\n`)
  return `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`
}
```

- [ ] **Step 4: Place the badge beside the wordmark, and under the sign-in symbol**

In `components/app-nav/app-nav.tsx`, replace:

```tsx
import { Wordmark } from '@/components/brand/wordmark'
```

with:

```tsx
import { BetaBadge } from '@/components/brand/beta-badge'
import { Wordmark } from '@/components/brand/wordmark'
```

In the same file, replace the desktop header's:

```tsx
        <Wordmark />
        <nav aria-label="Primary" className="flex items-center gap-0.5">
```

with:

```tsx
        <div className="flex items-center gap-2">
          <Wordmark />
          <BetaBadge />
        </div>
        <nav aria-label="Primary" className="flex items-center gap-0.5">
```

And replace the phone header's:

```tsx
        <Wordmark size="sm" />
        <span className="grow" />
```

with:

```tsx
        {/* At 375px with a five-digit balance there's no width to spare beside the wordmark, so the
            badge tucks under its right end instead. It's decorative, so taps pass through to the link. */}
        <div className="relative shrink-0">
          <Wordmark size="sm" />
          <BetaBadge className="pointer-events-none absolute right-1 -bottom-1.5 h-3.5 px-1.5 text-[9px]" />
        </div>
        <span className="grow" />
```

**Why the phone badge sits under the wordmark, not beside it.** `e2e/app-nav.spec.ts`'s "fits at 375px with a five-digit balance" gives an admin a balance of 99999 and asserts the page has no horizontal overflow. At that width the phone header (wordmark, balance chip, Admin, theme toggle) already has about 2px to spare, so a badge beside the wordmark overflows by 39px (measured). Here the badge is absolutely positioned under the right end of "DUEL", in the link's lower padding and still inside the 64px bar, so it takes no width. `cn` is `tailwind-merge`, so the smaller `h-3.5`, `px-1.5` and `text-[9px]` replace the badge's defaults. `pointer-events-none` keeps that strip of the link tappable. The desktop header has room, so its badge sits beside the wordmark as drawn above.

`Wordmark` renders its own `<Link>` internally (`components/brand/wordmark.tsx`); `BetaBadge` is a sibling of `<Wordmark />`, not a child, so it sits outside that link in both headers and the link's accessible name ("DwellDuel home") is unchanged.

In `app/(auth)/sign-in/page.tsx`, replace:

```tsx
import { DwellDuelSymbol } from '@/components/brand/wordmark'
```

with:

```tsx
import { BetaBadge } from '@/components/brand/beta-badge'
import { DwellDuelSymbol } from '@/components/brand/wordmark'
```

and replace:

```tsx
        <DwellDuelSymbol size={64} />
        <h1 className={h1Class}>
```

with:

```tsx
        <DwellDuelSymbol size={64} />
        <BetaBadge />
        <h1 className={h1Class}>
```

The card is a `flex flex-col gap-5`, so the badge lands under the symbol with the same gap as every other child — no extra margin needed. `DwellDuelSymbol` renders a bare `<svg>`, not a link, so the badge sits outside any link here too.

- [ ] **Step 5: Give `HomeTiles` a mailto-capable tile, and add the feedback tile on Home**

Replace `components/home/home-tiles.tsx` in full:

```tsx
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

export interface HomeTile {
  id: string
  href: string
  icon: LucideIcon
  title: string
  subtitle: string
}

const TILE_CLASS =
  'pressable group flex min-h-[72px] items-center gap-3.5 px-4 py-3 text-ink no-underline lg:min-h-24 lg:rounded-card lg:border lg:border-line lg:bg-surface lg:p-5 lg:shadow-card'

function TileBody({ icon: Icon, title, subtitle }: Pick<HomeTile, 'icon' | 'title' | 'subtitle'>) {
  return (
    <>
      <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-acc-soft text-acc-text">
        <Icon aria-hidden="true" className="size-[22px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[17px] leading-[1.25] font-extrabold group-hover:underline group-hover:underline-offset-[3px]">
          {title}
        </span>
        <span className="text-sm text-ink2">{subtitle}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-ink" />
    </>
  )
}

export function HomeTiles({ tiles }: { tiles: HomeTile[] }) {
  return (
    <nav aria-label="Everything in DwellDuel">
      <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface px-1 lg:grid lg:grid-cols-3 lg:gap-5 lg:divide-y-0 lg:border-0 lg:bg-transparent lg:px-0">
        {tiles.map((tile) =>
          // The mail app opens outside DwellDuel, so this is a real <a>, not a routed <Link> --
          // no transitionTypes, and no client-side navigation to cancel or wait on.
          tile.href.startsWith('mailto:') ? (
            <a key={tile.id} href={tile.href} className={TILE_CLASS}>
              <TileBody icon={tile.icon} title={tile.title} subtitle={tile.subtitle} />
            </a>
          ) : (
            <Link
              key={tile.id}
              href={tile.href}
              transitionTypes={tile.id === 'admin' ? ['nav-forward'] : undefined}
              className={TILE_CLASS}
            >
              <TileBody icon={tile.icon} title={tile.title} subtitle={tile.subtitle} />
            </Link>
          ),
        )}
      </div>
    </nav>
  )
}
```

In `app/(app)/(home)/page.tsx`, replace:

```tsx
import { ChartColumn, Layers, BookOpen, MessageSquareText, Trophy, ShieldCheck, LogOut } from 'lucide-react'
```

with:

```tsx
import { ChartColumn, Layers, BookOpen, MessageSquareText, Trophy, ShieldCheck, LogOut, Mail } from 'lucide-react'
```

and replace:

```tsx
import { adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle, parlaysTileSubtitle } from '@/lib/home/copy'
```

with:

```tsx
import { adminTileSubtitle, leaderboardTileSubtitle, marketsTileSubtitle, parlaysTileSubtitle } from '@/lib/home/copy'
import { feedbackHref } from '@/lib/app-shell/feedback'
```

and replace:

```tsx
  if (admin) {
    tiles.push({
      id: 'admin',
      href: '/admin/invites',
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(pendingApprovals.length),
    })
  }
```

with:

```tsx
  if (admin) {
    tiles.push({
      id: 'admin',
      href: '/admin/invites',
      icon: ShieldCheck,
      title: 'Admin',
      subtitle: adminTileSubtitle(pendingApprovals.length),
    })
  }
  tiles.push({
    id: 'feedback',
    href: feedbackHref(),
    icon: Mail,
    title: 'Send feedback',
    subtitle: 'Tell Aaron what’s working and what isn’t',
  })
```

The feedback tile is pushed unconditionally, after the admin tile if one was added, so it's always the last row — for both members and admins.

- [ ] **Step 6: Run and see the tests pass**

Run: `npx vitest run tests/components/beta-badge.test.tsx tests/lib/app-shell/feedback.test.ts tests/components/app-nav.test.tsx tests/components/sign-in-page.test.tsx tests/components/home-tiles.test.tsx`
Expected: PASS, 27 tests: `beta-badge.test.tsx` 2 (new), `feedback.test.ts` 3 (new), `app-nav.test.tsx` 17 (was 16), `sign-in-page.test.tsx` 2 (was 1), `home-tiles.test.tsx` 3 (was 2).

- [ ] **Step 7: Verify**

Run: `npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS. Vitest: 1061 tests in 160 files, 43 of them in `tests/db/`. This task adds 8 tests in 2 new files (`beta-badge.test.tsx` 2, `feedback.test.ts` 3) plus 3 appended to existing files (`app-nav.test.tsx` +1, `sign-in-page.test.tsx` +1, `home-tiles.test.tsx` +1).

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed, unchanged. No e2e spec locates the wordmark or the home link by anything the badge could change (`grep -rn "DwellDuel home\|getByRole('link', { name: 'Home'" e2e/*.spec.ts` — the only "Home" nav-link assertions are in `tests/components/app-nav.test.tsx`, already updated above), and no spec's tile or link count on `/` changes shape (a new tile only adds a row; nothing asserts an exact count of Home's tiles).

- [ ] **Step 8: Commit**

```bash
git add components/brand/beta-badge.tsx lib/app-shell/feedback.ts \
  components/app-nav/app-nav.tsx "app/(auth)/sign-in/page.tsx" \
  components/home/home-tiles.tsx "app/(app)/(home)/page.tsx" \
  tests/components/beta-badge.test.tsx tests/lib/app-shell/feedback.test.ts \
  tests/components/app-nav.test.tsx tests/components/sign-in-page.test.tsx tests/components/home-tiles.test.tsx
git commit -m "$(cat <<'EOF'
Add a Beta badge and a one-tap feedback link
EOF
)"
```

---

## Task 7: Verification

This task changes no product code. It runs the whole chain on the finished branch, re-runs it on the Supabase CLI version CI pins (covering `0034` specifically), takes a visual pass, and hands the user the Rollout checklist from the spec.

**Files:**
- Temporary, not committed: `e2e/zz-visual-beta.spec.ts` (Step 4, the controller's screenshot spec, deleted after use)

**Interfaces:**
- Consumes every task in this PR: length limits in the database (Task 1), friendly errors in the app (Task 2), the market 404 (Task 3), live ranks and tap targets (Task 4), the startup settings check (Task 5), the Beta badge and feedback link (Task 6).
- Produces nothing new. This is the last task.

- [ ] **Step 1: Run the whole chain**

Local Supabase must be running, with every migration through `0034` applied.

Run: `npm run db:reset && npx next typegen && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
Expected: all PASS.
- Vitest: 1061 tests in 160 files, 43 of them in `tests/db/` (987 in 146, 42 in `tests/db/`, before this PR).
- The build's route table is the same 20 routes as `3031e7e` (the market list moved into an `(app)/markets/(list)/` route group in Task 3, which changes no URL).

Run: `lsof -ti:3000 | xargs kill 2>/dev/null; npx playwright test`
Expected: 27 passed: the 26 from before this PR, plus `e2e/market-not-found.spec.ts` (Task 3).

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

Expected: every step passes on this exact CLI version, with 27 e2e tests. Watch `0034` in particular: `db reset` must apply the eight `NOT VALID` CHECKs and the recreated `adjust_balance` cleanly on 2.115.0, and the function's grants must land unchanged. 2.115.0 is the version that grants nothing implicitly (the 0007 lesson); `0034` is a `create or replace` of an existing `security definer` function, not a new one, but it's still worth confirming `anon` stays revoked and `authenticated` / `service_role` keep execute, exactly as `0024` left them.

- [ ] **Step 3: Confirm the tree is clean**

Run: `git status --short`
Expected: no output. Every task committed its own files, and this task has nothing to commit.

- [ ] **Step 4 (the controller, not the implementer): visual check at 375px and 1280px, light and dark**

The executing controller does this step, not a subagent. As in earlier plans, it takes screenshots with a temporary Playwright spec, views them, and deletes the spec. Nothing from this step is committed. It targets what's new in this PR: the Beta badge in both `AppNav` headers and on sign-in, the feedback tile, the market page streaming its section skeletons, a too-long title's inline error, and checkboxes/radios in dark mode. It doesn't repeat the data-layer-scale plan's native-feel or pagination checks.

**On the market page's skeletons.** On a fast local database the sections resolve before a screenshot can catch their fallbacks, and neither usual trick helps here. Holding the page's RSC request with `page.route`, as `e2e/skeletons.spec.ts` does, only works for a route with a `loading.tsx`, and Task 3 removes the market page's; with it held, the old page simply stays. Throttling with CDP didn't work either: in a trial run, `[data-skeleton="market-chart"]` was never found at any of the four sizes. Instead the spec loads the market once with JavaScript off. The browser then shows exactly the first paint: the shell plus the four fallbacks, with the resolved sections sitting in hidden segments that only React's inline scripts swap in. That's deterministic, and it's honest: the fallbacks are in the document only because the page really streamed. A page that waited for every read would have sent its content inline. A second, normal load captures the streamed result. The skeleton locators (`[data-skeleton="market-chart"]` and so on) are Task 3's.

1. Make a scratch directory outside the repo for the PNGs: `SCRATCH=$(mktemp -d)`.

2. Create `e2e/zz-visual-beta.spec.ts`:

```ts
import { test, expect, type Browser } from '@playwright/test'
import { STORAGE_STATE_PATH } from './global-setup'
import { localDateTimeString } from './local-date-time'

// Temporary: the controller's beta-readiness visual check. Delete this file after viewing the
// screenshots.
const OUT = process.env.VISUAL_OUT ?? 'test-results/visual-beta'

type Scheme = 'light' | 'dark'

async function openContext(
  browser: Browser,
  { width, scheme, javaScriptEnabled = true }: { width: number; scheme: Scheme; javaScriptEnabled?: boolean },
) {
  return browser.newContext({
    baseURL: 'http://localhost:3000',
    storageState: STORAGE_STATE_PATH,
    viewport: { width, height: width === 375 ? 812 : 800 },
    colorScheme: scheme,
    javaScriptEnabled,
  })
}

for (const scheme of ['light', 'dark'] as const) {
  for (const width of [375, 1280]) {
    const shot = (name: string) => `${OUT}/${name}-${width}-${scheme}.png`

    test(`Beta badge and feedback tile at ${width}px, ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()

      await page.goto('/')
      // Both headers are in the DOM and one is hidden at each width, so look for the visible badge.
      await expect(page.getByText('Beta').filter({ visible: true })).toBeVisible()
      const feedbackTile = page.getByRole('link', { name: /Send feedback/ })
      await feedbackTile.scrollIntoViewIfNeeded()
      await expect(feedbackTile).toHaveAttribute('href', /^mailto:/)
      await page.screenshot({ path: shot('home-beta-feedback'), fullPage: true })

      await page.goto('/sign-in')
      await expect(page.getByText('Beta')).toBeVisible()
      await page.screenshot({ path: shot('sign-in-beta'), fullPage: true })

      await context.close()
    })

    test(`too-long title's inline error at ${width}px, ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()

      await page.goto('/markets/new')
      // maxLength stops typing at 120 (Playwright's fill included), so take it off to reach the
      // action's own check: what a member sees if the browser limit is bypassed.
      await page.getByLabel('Title').evaluate((input) => input.removeAttribute('maxlength'))
      await page.getByLabel('Title').fill('T'.repeat(121))
      await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
      await page.getByRole('button', { name: 'Create market' }).click()
      await expect(page.getByText('Title can be at most 120 characters.')).toBeVisible()
      await expect(page.getByLabel('Title')).toHaveAttribute('aria-invalid', 'true')
      await page.screenshot({ path: shot('title-too-long'), fullPage: true })

      await context.close()
    })

    if (scheme === 'dark') {
      test(`checkboxes and radios at ${width}px, dark`, async ({ browser }) => {
        const context = await openContext(browser, { width, scheme })
        const page = await context.newPage()

        await page.goto('/markets/new')
        await page.getByLabel('Multiple choice').check()
        await page.screenshot({ path: shot('radios-dark'), fullPage: true })

        await page.goto('/admin/tasks')
        await expect(page.getByLabel('Repeatable')).toBeVisible()
        await page.screenshot({ path: shot('checkboxes-dark'), fullPage: true })

        await context.close()
      })
    }

    test(`market page streams its section skeletons at ${width}px, ${scheme}`, async ({ browser }) => {
      const context = await openContext(browser, { width, scheme })
      const page = await context.newPage()

      await page.goto('/markets/new')
      await page.getByLabel('Title').fill(`Visual streaming ${width} ${scheme}`)
      await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
      await page.getByRole('button', { name: 'Create market' }).click()
      await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)
      const marketUrl = page.url()

      // With JavaScript off, the page stops at its first paint: the shell plus every section's
      // fallback. The sections still arrive in the same response, but as hidden segments that only
      // React's inline scripts swap in. So the skeletons are visible here only because the page
      // really streamed; a page that waited for every read would have sent the content inline.
      const firstPaint = await openContext(browser, { width, scheme, javaScriptEnabled: false })
      const shell = await firstPaint.newPage()
      await shell.goto(marketUrl)
      for (const name of ['market-chart', 'market-outcomes', 'market-bet-form', 'market-bets']) {
        await expect(shell.locator(`[data-skeleton="${name}"]`)).toBeVisible()
      }
      await expect(shell.getByRole('heading', { level: 1 })).toHaveText(`Visual streaming ${width} ${scheme}`)
      await shell.screenshot({ path: shot('market-skeletons'), fullPage: true })
      await firstPaint.close()

      await page.goto(marketUrl)
      await expect(page.getByRole('heading', { name: 'Chance over time' })).toBeVisible()
      await expect(page.locator('[data-skeleton^="market-"]')).toHaveCount(0)
      await page.screenshot({ path: shot('market-streamed'), fullPage: true })

      await context.close()
    })
  }
}
```

3. Run it on its own. Its global setup reseeds the database, as every e2e run does.

```bash
lsof -ti:3000 | xargs kill 2>/dev/null
VISUAL_OUT="$SCRATCH/visual" npx playwright test e2e/zz-visual-beta.spec.ts
```

Expected: 14 passed (4 tests at each of 4 width/scheme combinations, minus the 2 dark-only checkbox/radio combinations that only run once per width — 4 + 4 + 2 + 4 = 14), and PNGs in `$SCRATCH/visual`: `home-beta-feedback`, `sign-in-beta`, `title-too-long`, `market-skeletons`, `market-streamed` at each of the 4 width/scheme combinations, plus `radios-dark` and `checkboxes-dark` at each of the 2 widths.

4. View every PNG and check each item below.

   **Beta badge and feedback tile** (`home-beta-feedback`, `sign-in-beta`):
   - The badge reads "Beta" in small, uppercase, tracked-out type, legible against the header/card background in both themes. It sits beside the wordmark in the desktop header, tucked under the right end of the wordmark in the phone header (Task 6 explains why), and under the symbol on sign-in, never inside a link's own text.
   - The "Send feedback" tile is the last row on Home, same style as every other tile (44px+, chevron, no underline).

   **Too-long title** (`title-too-long`):
   - "Title can be at most 120 characters." appears inline, in the form's existing error style, and the Title field is visibly marked invalid.

   **Market page streaming** (`market-skeletons`, `market-streamed`):
   - `market-skeletons` shows the page shell (back link, status, title) with the chart, outcomes, bet-form and bets sections as skeletons matching their final layout, not the whole page blank.
   - `market-streamed` shows the same sections replaced by real content, in the same positions.

   **Checkboxes and radios in dark mode** (`radios-dark`, `checkboxes-dark`):
   - Both are legible against the dark background: a visible box/circle, a clear checked/selected state, using `accent-primary` -- not washed out or invisible. Record any mismatch as a finding; per the spec, no code change is expected here.

   **Everywhere:** every control is at least 44px tall, nothing scrolls sideways at 375px, and reduced motion is respected (no check here relies on an animation completing).

5. Delete `e2e/zz-visual-beta.spec.ts`, run `npm run db:reset`, and run `git status --short` to confirm the tree is clean.
6. Record every mismatch as a final-review finding.

- [ ] **Step 5: The Vercel environment check, before merging**

Per the spec's Rollout: confirm that Vercel's production environment defines `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`. Task 5's startup check throws if any of these is missing once `VERCEL_ENV === 'production'`, which would stop production from booting on this deploy.

If the Vercel CLI is available and linked to this project:

```bash
vercel env ls production
```

Expected: all four names appear. If the CLI isn't available or isn't linked, this can't be verified from here — the user confirms it in the Vercel dashboard (Project Settings → Environment Variables, Production) before merging.

- [ ] **Step 6 (the user, after deploy): post-deploy checklist**

Hand this to the user with the PR, and include it in the PR description:

> **After deploying, please check:**
> 1. A broken market link (an unknown or malformed id) gives a real 404 on production.
> 2. A market page streams in its chart, bets and outcomes sections rather than showing one long blank wait.
> 3. The Beta badge appears beside the wordmark and on sign-in, and the "Send feedback" tile on Home opens your mail app with the subject and app version filled in.
> 4. A too-long title (or any other limited field) is refused with an inline message, not a server error.

- [ ] **Step 7: Commit**

Nothing to commit: this task changes no product file. If Step 4's spec was left behind, delete it and re-run `git status --short` to confirm a clean tree before closing out the PR.

---

