# Social Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make DwellDuel social: a balance leaderboard, an activity feed,
every member's bets on each market page, and member profile pages. Bets,
parlays and approved task completions become visible to every invited
member.

**Architecture:** One migration swaps four read-only access policies (no
function changes, no new write access). A second migration adds a
read-only `activity_feed` view. It runs with the reader's own permissions
(`security_invoker`) and combines seven event kinds, all derived from
current state, so admin overrides correct the feed automatically. Small
TypeScript readers and pure formatting helpers feed three new pages and a
revised "Bets" section on the market page.

**Tech Stack:** Same as every prior sub-project. Next.js 16 (App Router),
TypeScript, Supabase (Postgres 17, RLS), Vitest and Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-25-social-layer-design.md`](../specs/2026-09-25-social-layer-design.md)
— read it alongside this plan.

## Global Constraints

- Migrations continue at `0030_`. This plan adds `0030` and `0031`. Never
  edit a past migration in place.
- No function is created or changed. No table gains an `insert`,
  `update` or `delete` grant for `authenticated`.
- `bets`, `parlays` and `parlay_legs` become readable by every invited
  member and every admin (`using (is_invited() or is_admin())`). Other members can read
  `task_completions` only when `status = 'approved'`; the owner and admins
  still read all of them. `coin_transactions` stays owner-or-admin, and
  this plan never touches it.
- `activity_feed` is created `with (security_invoker = true)`. It is
  revoked from `anon` and `authenticated` before `select` is granted to
  `authenticated`, and `service_role` is granted `select` explicitly (the
  `0006` and `0007` lessons).
- Feed reads are `order by occurred_at desc, id desc`, limited to 50.
  Leaderboard ranks by balance, highest first. Ties share a rank
  (1, 1, 3) and are ordered by display name.
- Relative ages are computed from `Date.now() − occurred_at`, never from a
  formatted local time, so they're the same in every time zone.
- Existing "my …" readers (`listMyParlays`, `listMyTaskCompletions`) keep
  their explicit `profile_id` filter.
- E2E tests never assert an absolute balance (the Admin Controls lesson).
- Comments explain why, not what; default to no comments.
- No unrequested scope: no comments or reactions, notifications,
  follows, profit leaderboard, feed paging, or hide-until-close.
- zsh treats an unquoted `[id]` as a glob. Quote bracketed paths in
  shell commands, e.g. `'app/members/[id]/page.tsx'`.

**Before Task 1:** `npm run db:start` (or confirm it's already running),
and `.env.local` pointed at the **local** Supabase instance.

**Before the final task's verification pass:** re-run the whole chain
against the exact Supabase CLI version CI pins (`npx -y supabase@2.115.0`,
from `.github/workflows/ci.yml`).

---

## Task 1: Open bets, parlays and approved completions to invited members

**Files:**
- Create: `supabase/migrations/0030_social_visibility.sql`
- Modify: `tests/db/market-rls.test.ts`
- Modify: `tests/db/parlay-rls.test.ts`
- Modify: `tests/db/task-rls.test.ts`

**Interfaces:**
- Consumes: the existing policies `select_own_or_admin_bets`
  (redefined in `0016`), `select_own_or_admin_parlays` and
  `select_own_or_admin_parlay_legs` (`0025`), and
  `select_own_or_admin_task_completions` (`0022`); `is_invited()`,
  `is_admin()` (Foundation); fixtures `seedMembers`, `makeMember`,
  `clientFor`, `ensureInvited`, `createTestMarket`, `createTestTask`
- Produces: policies `select_invited_bets`, `select_invited_parlays`,
  `select_invited_parlay_legs`, `select_task_completions`

Two existing tests describe exactly the rule this task reverses, so they
are rewritten, not deleted. The existing coin-ledger privacy test
(`tests/db/rls.test.ts` "shows a member only their own transactions")
must keep passing unchanged.

- [ ] **Step 1: Rewrite the bets privacy test in `tests/db/market-rls.test.ts`**

Replace the whole `it("shows a member only their own bets", …)` block with:

```typescript
  it('shows an invited member every bet', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])

    const bobClient = await clientFor(bob)
    const aliceBet = await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    expect(aliceBet.error).toBeNull()
    const bobBet = await bobClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[1], p_amount: 10 })
    expect(bobBet.error).toBeNull()

    const { data, error } = await aliceClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(new Set(data?.map((b) => b.profile_id))).toEqual(new Set([alice.id, bob.id]))
  })

  it('shows an uninvited session no bets', async () => {
    const aliceClient = await clientFor(alice)
    const { marketId, outcomeIds } = await createTestMarket(aliceClient, ['Yes', 'No'])
    const aliceBet = await aliceClient.rpc('place_bet', { p_market_id: marketId, p_outcome_id: outcomeIds[0], p_amount: 10 })
    expect(aliceBet.error).toBeNull()

    // Bob is a seedMembers() fixture member, never invited.
    const bobClient = await clientFor(bob)
    const { data, error } = await bobClient.from('bets').select('profile_id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
```

- [ ] **Step 2: Rewrite the parlay privacy tests in `tests/db/parlay-rls.test.ts`**

Replace the whole `it('shows a member only their own parlays and legs', …)`
block with:

```typescript
  it('shows an invited member every parlay and leg', async () => {
    const { aliceClient } = await seedParlays()

    const { data: parlays, error } = await aliceClient.from('parlays').select('profile_id')
    expect(error).toBeNull()
    expect(new Set(parlays?.map((p) => p.profile_id))).toEqual(new Set([alice.id, bob.id]))

    const { data: legs, error: legsErr } = await aliceClient.from('parlay_legs').select('id')
    expect(legsErr).toBeNull()
    expect(legs).toHaveLength(2)
  })
```

Then rename `it('shows a member with no parlays nothing at all', …)` to
`it('shows an uninvited session no parlays or legs', …)`. Its body stays
unchanged: Carol comes from `makeMember` and is never invited.

- [ ] **Step 3: Add completion-visibility tests to `tests/db/task-rls.test.ts`**

Change the fixtures import to include `makeMember`:

```typescript
import { seedMembers, makeMember, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'
```

Add these two tests at the end of the `describe('task_completions select policy', …)`
block. Leave the existing "shows a member only their own completions" test
as it is; it submits only pending completions, which stay private.

```typescript
  it('shows other invited members approved completions only', async () => {
    const approvedTask = await createTestTask(alice, { title: 'Approved task' })
    const rejectedTask = await createTestTask(alice, { title: 'Rejected task' })
    const pendingTask = await createTestTask(alice, { title: 'Pending task' })

    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const submit = async (taskId: string): Promise<string> => {
      const { data, error } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
      if (error) throw error
      return data as string
    }
    const approvedId = await submit(approvedTask.taskId)
    const rejectedId = await submit(rejectedTask.taskId)
    await submit(pendingTask.taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('approve_task_completion', { p_completion_id: approvedId })).error).toBeNull()
    expect(
      (await adminClient.rpc('reject_task_completion', { p_completion_id: rejectedId, p_reason: 'Not this week' })).error,
    ).toBeNull()

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    await ensureInvited(carolClient)
    const { data: seenByCarol, error } = await carolClient.from('task_completions').select('id, status')
    expect(error).toBeNull()
    expect(seenByCarol).toEqual([{ id: approvedId, status: 'approved' }])

    const { data: seenByBob } = await bobClient.from('task_completions').select('id')
    expect(seenByBob).toHaveLength(3)
  })

  it('shows an uninvited session no completions, even approved ones', async () => {
    const { taskId } = await createTestTask(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(bobClient)
    const { data: completionId, error: submitErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(submitErr).toBeNull()

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const adminClient = await clientFor(alice)
    await ensureInvited(adminClient)
    expect((await adminClient.rpc('approve_task_completion', { p_completion_id: completionId as string })).error).toBeNull()

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    const { data, error } = await carolClient.from('task_completions').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
```

- [ ] **Step 4: Run the three files to verify the new expectations fail**

Run: `npx vitest run tests/db/market-rls.test.ts tests/db/parlay-rls.test.ts tests/db/task-rls.test.ts`
Expected: FAIL in "shows an invited member every bet" (only Alice's bet
visible), "shows an invited member every parlay and leg", and "shows other
invited members approved completions only" (Carol sees nothing). The two
uninvited tests already pass.

- [ ] **Step 5: Write `supabase/migrations/0030_social_visibility.sql`**

```sql
-- Sub-project 6 makes betting social: every invited member can see who bet
-- what. Pending and rejected task completions, and the coin ledger, stay private.
drop policy select_own_or_admin_bets on public.bets;
create policy select_invited_bets on public.bets for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlays on public.parlays;
create policy select_invited_parlays on public.parlays for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_parlay_legs on public.parlay_legs;
create policy select_invited_parlay_legs on public.parlay_legs for select to authenticated
  using (is_invited() or is_admin());

drop policy select_own_or_admin_task_completions on public.task_completions;
create policy select_task_completions on public.task_completions for select to authenticated
  using (
    profile_id = (select auth.uid())
    or is_admin()
    or (status = 'approved' and is_invited())
  );
```

- [ ] **Step 6: Apply the migration and run the three files**

Run: `npm run db:reset && npx vitest run tests/db/market-rls.test.ts tests/db/parlay-rls.test.ts tests/db/task-rls.test.ts`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `npx vitest run`
Expected: all PASS, including `tests/db/rls.test.ts` (coin ledger still
private) and every parlay, market and task test.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/0030_social_visibility.sql tests/db/market-rls.test.ts tests/db/parlay-rls.test.ts tests/db/task-rls.test.ts
git commit -m "Let invited members see every bet, parlay, and approved task completion"
```

---

## Task 2: The `activity_feed` view

**Files:**
- Create: `supabase/migrations/0031_activity_feed_view.sql`
- Test: `tests/db/activity-feed.test.ts`

**Interfaces:**
- Consumes: Task 1's policies; `place_bet`, `resolve_market`,
  `void_market`, `place_parlay`, `submit_task_completion`,
  `approve_task_completion`, `reject_task_completion` (all unchanged);
  fixtures as in Task 1
- Produces: view `public.activity_feed (id text, kind text, occurred_at timestamptz, actor_id uuid, actor_name text, market_id uuid, market_title text, outcome_label text, amount integer, leg_count integer, task_title text)`.
  `kind` is one of `bet_placed`, `parlay_placed`, `market_created`,
  `market_resolved`, `bet_won`, `parlay_won`, `task_completed`.

- [ ] **Step 1: Write `tests/db/activity-feed.test.ts` (will fail, because the view doesn't exist yet)**

```typescript
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

async function feed(client: SupabaseClient, actorId?: string): Promise<FeedRow[]> {
  let query = client
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

    const rows = await feed(bobClient)
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

    expect(await feed(bobClient)).toContainEqual(
      expect.objectContaining({ kind: 'parlay_placed', actor_id: bob.id, amount: 10, leg_count: 2, market_id: null }),
    )
  })

  it("shows a resolution and each winner's payout, matching what the ledger paid", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Payout market' })
    await bet(aliceClient, market, 1, 10)
    await bet(bobClient, market, 0, 3)
    await bet(aliceClient, market, 0, 4)
    await resolve(market, 0)

    const rows = await feed(bobClient)
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

    const rows = (await feed(bobClient)).filter((r) => r.market_id === market.marketId)
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

    const rows = await feed(bobClient)
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

    expect(await feed(bobClient)).toContainEqual(
      expect.objectContaining({ kind: 'parlay_won', actor_id: bob.id, amount: 160, leg_count: 2 }),
    )
  })

  it('shows approved task completions to everyone, and pending or rejected ones to no one', async () => {
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

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    await ensureInvited(carolClient)

    for (const viewer of [carolClient, bobClient]) {
      const tasks = (await feed(viewer)).filter((r) => r.kind === 'task_completed')
      expect(tasks).toEqual([
        expect.objectContaining({ actor_id: bob.id, actor_name: 'Bob', task_title: 'Read Psalm 1', amount: 12 }),
      ])
    }
  })

  it('filters to one member', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Filter market' })
    await bet(bobClient, market, 0, 5)
    await bet(aliceClient, market, 1, 5)

    const rows = await feed(bobClient, alice.id)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.actor_id === alice.id)).toBe(true)
    expect(rows.map((r) => r.kind).sort()).toEqual(['bet_placed', 'market_created'])
  })

  it('shows an uninvited session nothing', async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Private market' })
    await bet(bobClient, market, 0, 5)

    const carol = await makeMember('Carol')
    const carolClient = await clientFor(carol)
    expect(await feed(carolClient)).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/activity-feed.test.ts`
Expected: FAIL. PostgREST reports it can't find the relation
`public.activity_feed`.

- [ ] **Step 3: Write `supabase/migrations/0031_activity_feed_view.sql`**

```sql
create view public.activity_feed
with (security_invoker = true)
as
select
  'bet:' || b.id as id,
  'bet_placed' as kind,
  b.created_at as occurred_at,
  b.profile_id as actor_id,
  p.display_name as actor_name,
  m.id as market_id,
  m.title as market_title,
  o.label as outcome_label,
  b.amount as amount,
  null::integer as leg_count,
  null::text as task_title
from public.bets b
join public.market_outcomes o on o.id = b.outcome_id
join public.markets m on m.id = b.market_id
join public.profiles p on p.id = b.profile_id

union all

select
  'parlay:' || pa.id, 'parlay_placed', pa.created_at, pa.profile_id, p.display_name,
  null, null, null, pa.stake,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id

union all

select
  'market:' || m.id, 'market_created', m.created_at, m.created_by, p.display_name,
  m.id, m.title, null, null, null, null
from public.markets m
join public.profiles p on p.id = m.created_by

union all

select
  'resolution:' || r.id, 'market_resolved', r.resolved_at, r.resolved_by, p.display_name,
  m.id, m.title, o.label, null, null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.profiles p on p.id = r.resolved_by

union all

-- Same payout arithmetic as resolve_market; a DB test pins it to the ledger credit.
select
  'win:' || b.id || ':' || r.id, 'bet_won', r.resolved_at, b.profile_id, p.display_name,
  m.id, m.title, o.label,
  floor(b.amount::numeric * pools.total / o.pool_total)::integer,
  null, null
from public.markets m
join public.market_resolutions r on r.id = m.current_resolution_id
join public.market_outcomes o on o.id = r.outcome_id
join public.bets b on b.outcome_id = o.id
join public.profiles p on p.id = b.profile_id
cross join lateral (
  select sum(o2.pool_total) as total from public.market_outcomes o2 where o2.market_id = m.id
) pools

union all

select
  'parlay_win:' || pa.id, 'parlay_won', pa.settled_at, pa.profile_id, p.display_name,
  null, null, null, pa.credited,
  (select count(*)::integer from public.parlay_legs l where l.parlay_id = pa.id),
  null
from public.parlays pa
join public.profiles p on p.id = pa.profile_id
where pa.status = 'won'

union all

select
  'task:' || c.id, 'task_completed', c.reviewed_at, c.profile_id, p.display_name,
  null, null, null, c.reward_amount, null, t.title
from public.task_completions c
join public.tasks t on t.id = c.task_id
join public.profiles p on p.id = c.profile_id
where c.status = 'approved';

revoke all on public.activity_feed from anon, authenticated;
grant select on public.activity_feed to authenticated;
grant select on public.activity_feed to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/activity-feed.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Run the full DB suite**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0031_activity_feed_view.sql tests/db/activity-feed.test.ts
git commit -m "Add the activity_feed view, derived from current state"
```

---

## Task 3: Social readers and formatting helpers

**Files:**
- Create: `lib/social/relative-time.ts`
- Create: `lib/social/ranking.ts`
- Create: `lib/social/describe-event.ts`
- Create: `lib/social/list-feed.ts`
- Create: `lib/social/leaderboard.ts`
- Test: `tests/lib/social/relative-time.test.ts`, `tests/lib/social/ranking.test.ts`,
  `tests/lib/social/describe-event.test.ts`, `tests/db/social-readers.test.ts`

**Interfaces:**
- Consumes: the `activity_feed` view (Task 2); `profiles` (readable by
  every invited member since Foundation)
- Produces:
  - `lib/social/relative-time.ts`: `relativeTime(occurredAt: string, now: number): string`
    and `ageLabel(occurredAt: string): string`
  - `lib/social/ranking.ts`: `LeaderboardEntry { id: string; displayName: string; balance: number; rank: number }`
    and `rankMembers(members: { id: string; displayName: string; balance: number }[]): LeaderboardEntry[]`
  - `lib/social/describe-event.ts`: `FeedKind`, `FeedEvent { id: string; kind: FeedKind; occurredAt: string; actorId: string; actorName: string; marketId: string | null; marketTitle: string | null; outcomeLabel: string | null; amount: number | null; legCount: number | null; taskTitle: string | null }`,
    `Segment = string | { text: string; href: string }`, and
    `describeEvent(e: FeedEvent): Segment[]`
  - `lib/social/list-feed.ts`: `FEED_LIMIT = 50` and
    `listFeed(supabase: SupabaseClient, opts?: { actorId?: string }): Promise<FeedEvent[]>`
  - `lib/social/leaderboard.ts`: `getLeaderboard(supabase: SupabaseClient): Promise<LeaderboardEntry[]>`

`ageLabel` exists so pages never call `Date.now()` in a component body,
which the `react-hooks/purity` lint rule rejects. `relativeTime` stays
pure and testable.

- [ ] **Step 1: Write `tests/lib/social/relative-time.test.ts` (will fail, because the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { relativeTime } from '@/lib/social/relative-time'

const now = Date.parse('2026-09-25T12:00:00Z')

describe('relativeTime', () => {
  it('says "just now" under a minute', () => {
    expect(relativeTime('2026-09-25T11:59:30Z', now)).toBe('just now')
  })

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime('2026-09-25T11:55:00Z', now)).toBe('5m ago')
    expect(relativeTime('2026-09-25T09:00:00Z', now)).toBe('3h ago')
    expect(relativeTime('2026-09-23T12:00:00Z', now)).toBe('2d ago')
  })

  it('treats a timestamp slightly in the future as just now', () => {
    expect(relativeTime('2026-09-25T12:00:10Z', now)).toBe('just now')
  })
})
```

- [ ] **Step 2: Write `tests/lib/social/ranking.test.ts` (will fail, because the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { rankMembers } from '@/lib/social/ranking'

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
```

- [ ] **Step 3: Write `tests/lib/social/describe-event.test.ts` (will fail, because the module doesn't exist yet)**

```typescript
import { describe, it, expect } from 'vitest'
import { describeEvent, type FeedEvent } from '@/lib/social/describe-event'

const base: FeedEvent = {
  id: 'x',
  kind: 'bet_placed',
  occurredAt: '2026-09-25T12:00:00Z',
  actorId: 'u1',
  actorName: 'Sarah',
  marketId: 'm1',
  marketTitle: 'Will it rain?',
  outcomeLabel: 'Yes',
  amount: 20,
  legCount: null,
  taskTitle: null,
}
const sarah = { text: 'Sarah', href: '/members/u1' }
const market = { text: 'Will it rain?', href: '/markets/m1' }

describe('describeEvent', () => {
  it('describes a placed bet', () => {
    expect(describeEvent(base)).toEqual([sarah, ' bet 20 DC on Yes in ', market])
  })

  it('describes a placed parlay', () => {
    expect(describeEvent({ ...base, kind: 'parlay_placed', marketId: null, marketTitle: null, outcomeLabel: null, amount: 10, legCount: 3 })).toEqual([
      sarah,
      ' placed a 3-pick parlay for 10 DC',
    ])
  })

  it('describes a created market', () => {
    expect(describeEvent({ ...base, kind: 'market_created', outcomeLabel: null, amount: null })).toEqual([sarah, ' opened ', market])
  })

  it('describes a resolved market', () => {
    expect(describeEvent({ ...base, kind: 'market_resolved', amount: null })).toEqual([market, ' resolved: Yes'])
  })

  it('describes a bet win', () => {
    expect(describeEvent({ ...base, kind: 'bet_won', amount: 45 })).toEqual([sarah, ' won 45 DC on ', market])
  })

  it('describes a parlay win', () => {
    expect(describeEvent({ ...base, kind: 'parlay_won', marketId: null, marketTitle: null, outcomeLabel: null, amount: 160, legCount: 3 })).toEqual([
      sarah,
      "'s 3-pick parlay paid 160 DC",
    ])
  })

  it('describes an approved task completion', () => {
    expect(
      describeEvent({ ...base, kind: 'task_completed', marketId: null, marketTitle: null, outcomeLabel: null, amount: 10, taskTitle: 'Read Genesis 1-3' }),
    ).toEqual([sarah, ' completed Read Genesis 1-3 (+10 DC)'])
  })
})
```

- [ ] **Step 4: Write `tests/db/social-readers.test.ts` (will fail, because the modules don't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { serviceClient } from './helpers'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { listFeed } from '@/lib/social/list-feed'
import { getLeaderboard } from '@/lib/social/leaderboard'

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

    const events = await listFeed(bobClient)
    expect(events.map((e) => e.kind)).toEqual(['bet_placed', 'market_created'])
    expect(events[0]).toMatchObject({
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
    expect(typeof events[0].occurredAt).toBe('string')
  })

  it("returns only one member's events when filtered", async () => {
    const market = await createTestMarket(aliceClient, ['Yes', 'No'], { title: 'Reader market' })
    const { error } = await bobClient.rpc('place_bet', { p_market_id: market.marketId, p_outcome_id: market.outcomeIds[0], p_amount: 7 })
    expect(error).toBeNull()

    const events = await listFeed(bobClient, { actorId: alice.id })
    expect(events.map((e) => [e.kind, e.actorId])).toEqual([['market_created', alice.id]])
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
```

- [ ] **Step 5: Run the four tests to verify they fail**

Run: `npx vitest run tests/lib/social tests/db/social-readers.test.ts`
Expected: FAIL with `Failed to resolve import "@/lib/social/..."`

- [ ] **Step 6: Write `lib/social/relative-time.ts`**

```typescript
export function relativeTime(occurredAt: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(occurredAt)) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function ageLabel(occurredAt: string): string {
  return relativeTime(occurredAt, Date.now())
}
```

- [ ] **Step 7: Write `lib/social/ranking.ts`**

```typescript
export interface LeaderboardEntry {
  id: string
  displayName: string
  balance: number
  rank: number
}

export function rankMembers(members: { id: string; displayName: string; balance: number }[]): LeaderboardEntry[] {
  const sorted = [...members].sort((a, b) => b.balance - a.balance || a.displayName.localeCompare(b.displayName))
  const ranked: LeaderboardEntry[] = []
  sorted.forEach((m, index) => {
    const previous = ranked[index - 1]
    const rank = previous && previous.balance === m.balance ? previous.rank : index + 1
    ranked.push({ ...m, rank })
  })
  return ranked
}
```

- [ ] **Step 8: Write `lib/social/describe-event.ts`**

```typescript
export type FeedKind =
  | 'bet_placed'
  | 'parlay_placed'
  | 'market_created'
  | 'market_resolved'
  | 'bet_won'
  | 'parlay_won'
  | 'task_completed'

export interface FeedEvent {
  id: string
  kind: FeedKind
  occurredAt: string
  actorId: string
  actorName: string
  marketId: string | null
  marketTitle: string | null
  outcomeLabel: string | null
  amount: number | null
  legCount: number | null
  taskTitle: string | null
}

export type Segment = string | { text: string; href: string }

function actor(e: FeedEvent): Segment {
  return { text: e.actorName, href: `/members/${e.actorId}` }
}

function market(e: FeedEvent): Segment {
  return { text: e.marketTitle ?? '', href: `/markets/${e.marketId}` }
}

export function describeEvent(e: FeedEvent): Segment[] {
  switch (e.kind) {
    case 'bet_placed':
      return [actor(e), ` bet ${e.amount} DC on ${e.outcomeLabel} in `, market(e)]
    case 'parlay_placed':
      return [actor(e), ` placed a ${e.legCount}-pick parlay for ${e.amount} DC`]
    case 'market_created':
      return [actor(e), ' opened ', market(e)]
    case 'market_resolved':
      return [market(e), ` resolved: ${e.outcomeLabel}`]
    case 'bet_won':
      return [actor(e), ` won ${e.amount} DC on `, market(e)]
    case 'parlay_won':
      return [actor(e), `'s ${e.legCount}-pick parlay paid ${e.amount} DC`]
    case 'task_completed':
      return [actor(e), ` completed ${e.taskTitle} (+${e.amount} DC)`]
  }
}
```

- [ ] **Step 9: Write `lib/social/list-feed.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FeedEvent, FeedKind } from './describe-event'

export const FEED_LIMIT = 50

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

export async function listFeed(supabase: SupabaseClient, opts?: { actorId?: string }): Promise<FeedEvent[]> {
  let query = supabase
    .from('activity_feed')
    .select('id, kind, occurred_at, actor_id, actor_name, market_id, market_title, outcome_label, amount, leg_count, task_title')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(FEED_LIMIT)
  if (opts?.actorId) query = query.eq('actor_id', opts.actorId)

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as FeedRow[]).map((r) => ({
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
  }))
}
```

- [ ] **Step 10: Write `lib/social/leaderboard.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import { rankMembers, type LeaderboardEntry } from './ranking'

export async function getLeaderboard(supabase: SupabaseClient): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.from('profiles').select('id, display_name, balance')
  if (error) throw error

  return rankMembers((data ?? []).map((p) => ({ id: p.id, displayName: p.display_name, balance: p.balance })))
}
```

- [ ] **Step 11: Run the four tests to verify they pass**

Run: `npx vitest run tests/lib/social tests/db/social-readers.test.ts`
Expected: PASS (17 tests)

- [ ] **Step 12: Run lint and the full suite**

Run: `npm run lint && npx vitest run`
Expected: all PASS

- [ ] **Step 13: Commit**

```bash
git add lib/social tests/lib/social tests/db/social-readers.test.ts
git commit -m "Add feed and leaderboard readers with sentence, age, and ranking helpers"
```

---

## Task 4: Feed, leaderboard and member profile pages

**Files:**
- Create: `app/feed/feed-list.tsx`
- Create: `app/feed/page.tsx`
- Create: `app/leaderboard/page.tsx`
- Create: `app/members/[id]/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `listFeed`, `FEED_LIMIT` (Task 3, `lib/social/list-feed.ts`);
  `getLeaderboard`, `LeaderboardEntry` (Task 3); `describeEvent`,
  `FeedEvent`, `Segment` (Task 3); `ageLabel` (Task 3); `requireUser()`
  (`lib/auth/require-user`)
- Produces: routes `/feed`, `/leaderboard`, `/members/[id]`. Task 6's
  e2e test relies on these exact rendered strings and roles:
  - Each feed event is one `<li>` whose text is its sentence followed by `· <age>`.
    Member names and market titles are links.
  - `/leaderboard` renders each member's name as a link to `/members/<id>`.
  - `/members/[id]` renders the member's display name as its `<h1>` heading.

- [ ] **Step 1: Write `app/feed/feed-list.tsx`**

```typescript
import Link from 'next/link'
import { describeEvent, type FeedEvent } from '@/lib/social/describe-event'
import { ageLabel } from '@/lib/social/relative-time'

export function FeedList({ events }: { events: FeedEvent[] }) {
  if (events.length === 0) return <p className="mt-2 text-sm text-foreground/70">Nothing yet.</p>

  return (
    <ul className="mt-4 space-y-2 text-sm">
      {events.map((e) => (
        <li key={e.id}>
          {describeEvent(e).map((segment, i) =>
            typeof segment === 'string' ? (
              <span key={i}>{segment}</span>
            ) : (
              <Link key={i} href={segment.href} className="underline">
                {segment.text}
              </Link>
            ),
          )}{' '}
          <span className="text-foreground/60">· {ageLabel(e.occurredAt)}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Write `app/feed/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { listFeed } from '@/lib/social/list-feed'
import { FeedList } from './feed-list'

export default async function FeedPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const events = await listFeed(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Feed</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/" className="text-sm underline">
          Home
        </Link>
        <Link href="/leaderboard" className="text-sm underline">
          Leaderboard
        </Link>
      </div>
      <FeedList events={events} />
    </div>
  )
}
```

- [ ] **Step 3: Write `app/leaderboard/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'

export default async function LeaderboardPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Leaderboard</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/" className="text-sm underline">
          Home
        </Link>
        <Link href="/feed" className="text-sm underline">
          Feed
        </Link>
      </div>
      <ol className="mt-4 space-y-1">
        {board.map((m) => (
          <li key={m.id}>
            {m.rank}.{' '}
            <Link href={`/members/${m.id}`} className="underline">
              {m.displayName}
            </Link>{' '}
            — {m.balance} DC
          </li>
        ))}
      </ol>
    </div>
  )
}
```

- [ ] **Step 4: Write `app/members/[id]/page.tsx`**

The member is looked up in the leaderboard rather than queried by id. That
gives the rank for free, and a malformed id simply isn't found instead of
raising a uuid-cast error.

```typescript
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { getLeaderboard } from '@/lib/social/leaderboard'
import { listFeed } from '@/lib/social/list-feed'
import { FeedList } from '@/app/feed/feed-list'

export default async function MemberPage(props: PageProps<'/members/[id]'>) {
  const { id } = await props.params
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const board = await getLeaderboard(supabase)
  const member = board.find((m) => m.id === id)
  if (!member) notFound()

  const events = await listFeed(supabase, { actorId: member.id })

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">{member.displayName}</h1>
      <p className="mt-1 text-sm">
        {member.balance} DC · Rank {member.rank} of {board.length}
      </p>
      <div className="mt-2 flex gap-4">
        <Link href="/leaderboard" className="text-sm underline">
          Leaderboard
        </Link>
        <Link href="/feed" className="text-sm underline">
          Feed
        </Link>
      </div>
      <h2 className="mt-6 text-lg font-semibold">Recent activity</h2>
      <FeedList events={events} />
    </div>
  )
}
```

- [ ] **Step 5: Add Leaderboard and Feed links to `app/page.tsx`**

Directly after the existing `Parlays` link, add:

```typescript
      <Link href="/leaderboard" className="text-sm underline">
        Leaderboard
      </Link>
      <Link href="/feed" className="text-sm underline">
        Feed
      </Link>
```

- [ ] **Step 6: Verify**

Run: `npm run lint && npx vitest run && npm run build`
Expected: all PASS, with `/feed`, `/leaderboard` and `/members/[id]`
listed as new dynamic routes.

- [ ] **Step 7: Commit**

```bash
git add app/feed app/leaderboard 'app/members/[id]/page.tsx' app/page.tsx
git commit -m "Add the feed, leaderboard, and member profile pages"
```

---

## Task 5: Everyone's bets on the market page

**Files:**
- Modify: `lib/markets/get-market.ts`
- Modify: `app/markets/[id]/page.tsx`
- Test: `tests/db/market-bets.test.ts`

**Interfaces:**
- Consumes: Task 1's `select_invited_bets` policy
- Produces: `MarketBet { id: number; outcomeId: string; amount: number; createdAt: string; profileId: string; bettorName: string }`
  and `getMarketBets(supabase: SupabaseClient, marketId: string): Promise<MarketBet[]>`
  (`lib/markets/get-market.ts`). These replace `OwnBet` and `getOwnBets`,
  whose only caller is the market page.

- [ ] **Step 1: Write `tests/db/market-bets.test.ts` (will fail, because `getMarketBets` doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { seedMembers, makeMember, clientFor, createTestMarket, ensureInvited, type Member } from './fixtures'
import { getMarketBets } from '@/lib/markets/get-market'

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

    const bets = await getMarketBets(bobClient, market.marketId)
    expect(bets.map((b) => [b.bettorName, b.profileId, b.outcomeId, b.amount])).toEqual([
      ['Bob', bob.id, market.outcomeIds[1], 20],
      ['Alice', alice.id, market.outcomeIds[0], 10],
    ])
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
    expect(await getMarketBets(carolClient, market.marketId)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/db/market-bets.test.ts`
Expected: FAIL. `getMarketBets` is not exported.

- [ ] **Step 3: Replace `OwnBet` and `getOwnBets` in `lib/markets/get-market.ts`**

Delete the `OwnBet` interface and the `getOwnBets` function, and add:

```typescript
export interface MarketBet {
  id: number
  outcomeId: string
  amount: number
  createdAt: string
  profileId: string
  bettorName: string
}

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

(`bets.profile_id` is the only foreign key from `bets` to `profiles`, so
the plain `profiles(display_name)` embed is unambiguous.)

- [ ] **Step 4: Update `app/markets/[id]/page.tsx`**

- Change the import to `import { getMarket, getMarketBets } from '@/lib/markets/get-market'`.
- Replace `const ownBets = await getOwnBets(supabase, id, user.id)` with
  `const bets = await getMarketBets(supabase, id)`.
- In the existing purity comment, change `(getMarket, getOwnBets, isAdmin)`
  to `(getMarket, getMarketBets, isAdmin)`.
- Replace the whole `{ownBets.length > 0 && (…)}` block with:

```typescript
      {bets.length > 0 && (
        <div className="mt-4">
          <h2 className="text-sm font-semibold">Bets</h2>
          <ul className="text-sm">
            {bets.map((b) => {
              const outcome = market.outcomes.find((o) => o.id === b.outcomeId)
              return (
                <li key={b.id}>
                  {b.bettorName} — {b.amount} DC on {outcome?.label ?? 'unknown outcome'}
                  {b.profileId === user.id && ' (you)'}
                </li>
              )
            })}
          </ul>
        </div>
      )}
```

The existing e2e assertions (`'20 DC on Yes'`, `'5 DC on Yes'`,
`'15 DC on No'`) match as substrings of the new lines, e.g.
"Alice — 20 DC on Yes (you)".

- [ ] **Step 5: Run the test, the full suite, lint and build**

Run: `npx vitest run tests/db/market-bets.test.ts && npm run lint && npx vitest run && npm run build`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add lib/markets/get-market.ts 'app/markets/[id]/page.tsx' tests/db/market-bets.test.ts
git commit -m "Show every member's bets on the market page"
```

---

## Task 6: End-to-end test

**Files:**
- Create: `e2e/social.spec.ts`

**Interfaces:**
- Consumes: the seeded, admin-promoted session from `e2e/global-setup.ts`,
  whose display name is `Alice` (`seedMembers()` → `makeMember('Alice')`);
  `localDateTimeString` (`e2e/local-date-time.ts`); the `/markets/new`
  form (`Title`, `Close time`, `Create market`); the market page's bet form
  (first combobox, `Amount (DC)` placeholder, `Place bet`); Task 5's
  "Alice — 5 DC on Yes (you)" line; and Task 4's feed list items,
  leaderboard links and profile `<h1>`

`social.spec.ts` sorts last alphabetically, so it runs after every other
spec in the serial suite. It asserts only this test's own events, and uses
`.first()` wherever a CI retry could create a duplicate.

- [ ] **Step 1: Write `e2e/social.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'
import { localDateTimeString } from './local-date-time'

test('a bet shows up in the feed and on the bettor\'s profile', async ({ page }) => {
  await page.goto('/markets/new')
  await page.getByLabel('Title').fill('Social layer market')
  await page.getByLabel('Close time').fill(localDateTimeString(new Date(Date.now() + 60 * 60 * 1000)))
  await page.getByRole('button', { name: 'Create market' }).click()
  await expect(page).toHaveURL(/\/markets\/[0-9a-f-]+/)

  await page.getByRole('combobox').first().selectOption({ label: 'Yes' })
  await page.getByPlaceholder('Amount (DC)').fill('5')
  await page.getByRole('button', { name: 'Place bet' }).click()
  await expect(page.getByText('Alice — 5 DC on Yes (you)')).toBeVisible()

  const sentence = 'Alice bet 5 DC on Yes in Social layer market'

  await page.goto('/feed')
  await expect(page.getByRole('listitem').filter({ hasText: sentence }).first()).toBeVisible()

  await page.goto('/leaderboard')
  await page.getByRole('link', { name: 'Alice' }).click()
  await expect(page).toHaveURL(/\/members\/[0-9a-f-]+/)
  await expect(page.getByRole('heading', { name: 'Alice' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: sentence }).first()).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS. That's this new test plus the 7 existing ones, 8 total.

- [ ] **Step 3: Run everything**

Run: `npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/social.spec.ts
git commit -m "Add e2e test: a bet appears in the feed and on the bettor's profile"
```

---

## Task 7: Documentation and CI-version verification

**Files:**
- Modify: `README.md`

**Interfaces:** none. This task is documentation only, plus a verification pass.

- [ ] **Step 1: Update `README.md`'s status line**

Replace:

```markdown
**Status:** Foundation + Market Engine + Coin Economy + Admin Controls +
Parlays complete — Google sign-in (invite-only), a single admin account,
a Dwell Coin (DC) ledger, a pari-mutuel betting market, an admin-managed
Bible-study task catalog with approval-gated coin rewards, admin tooling
for manual balance adjustment, a full transaction ledger, and bulk
task-completion review, and app-backed parlays (2–6 picks, odds locked
at placement, capped at 20×) built from a bet slip. Live at
[dwellduel.com](https://dwellduel.com).
```

with:

```markdown
**Status:** Foundation + Market Engine + Coin Economy + Admin Controls +
Parlays + Social Layer complete — Google sign-in (invite-only), a single
admin account, a Dwell Coin (DC) ledger, a pari-mutuel betting market, an
admin-managed Bible-study task catalog with approval-gated coin rewards,
admin tooling for manual balance adjustment, a full transaction ledger,
and bulk task-completion review, app-backed parlays (2–6 picks, odds
locked at placement, capped at 20×) built from a bet slip, and a social
layer: a balance leaderboard, an activity feed, member profiles, and
every member's bets visible on each market. Live at
[dwellduel.com](https://dwellduel.com).
```

- [ ] **Step 2: Verify the full chain against the exact Supabase CLI version CI pins**

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

Expected: every step passes on this exact CLI version, not whatever is
installed globally. Migrations `0030` and `0031` apply, and Playwright
reports 8/8.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document the Social Layer in README"
```

---

## Self-Review

**Spec coverage:**
- Bets, parlays and legs visible to invited members; approved completions only; ledger unchanged → Task 1 (plus the unchanged `rls.test.ts`) ✓
- The two reversed privacy tests rewritten, not deleted → Task 1 Steps 1–2 ✓
- `activity_feed` with its seven kinds, reader's permissions, revoke then grant, `service_role` → Task 2 ✓
- Override, voided and unbacked-winner behavior; `bet_won` amount pinned to the ledger → Task 2 tests ✓
- Newest 50, filterable by member → Task 3 `listFeed` ✓
- Balance leaderboard with shared ranks and alphabetical ties → Task 3 `rankMembers` / `getLeaderboard`, Task 4 page ✓
- Time-zone-independent relative age → Task 3 `relativeTime` / `ageLabel` ✓
- `/feed`, `/leaderboard`, `/members/[id]` (404 for unknown), home links → Task 4 ✓
- Market page "Bets" with names and "(you)" → Task 5 ✓
- E2E test with no balance assertions → Task 6 ✓
- CI-pinned CLI verification → Task 7 ✓
- Non-goals (comments, reactions, notifications, follows, profit ranking, paging, hide-until-close) → not implemented anywhere ✓

**Placeholder scan:** none. Every code step has the complete code.

**Type consistency:**
- `FeedEvent` and `FeedKind` (Task 3) are what `listFeed` returns and what `describeEvent` and `FeedList` (Task 4) consume.
- `LeaderboardEntry` (Task 3) is what `/leaderboard` and `/members/[id]` read.
- `MarketBet` (Task 5) is what the market page renders.
- The view's column names (Task 2) match `FeedRow` in `list-feed.ts` (Task 3).
- The seven `kind` strings are identical across the view, `FeedKind`, `describeEvent` and the tests.
- Every string the Task 6 e2e asserts is produced by Task 4 or Task 5 code.
