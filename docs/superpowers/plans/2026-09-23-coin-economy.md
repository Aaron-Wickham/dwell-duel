# Coin Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fixed, admin-managed catalog of Bible-study tasks that
invited members can claim to have completed, gated behind admin approval
before any Dwell Coin (DC) is granted — the first sub-project that
actually creates new coin rather than only moving coin that already
exists.

**Architecture:** Two new tables (`tasks`, `task_completions`), a pure
helper function (`compute_period_key`), and three `SECURITY DEFINER`
functions (`submit_task_completion`, `approve_task_completion`,
`reject_task_completion`) that are the only way `task_completions` rows
are ever written. `tasks` itself is plain admin-gated RLS (no wrapper
function needed — creating a task has no side effects, unlike creating a
market). Every coin grant is still exactly one call to the existing
`apply_coin_transaction()`. Next.js App Router pages add a member-facing
`/tasks` catalog and an admin `/admin/tasks` page (catalog management +
approval queue).

**Tech Stack:** Same as Foundation and Market Engine — Next.js 16 (App
Router) + TypeScript + Supabase (Postgres/RLS/`SECURITY DEFINER`) +
Vitest + Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-23-coin-economy-design.md`](../specs/2026-09-23-coin-economy-design.md)
— read it alongside this plan.

## Global Constraints

- Migrations continue the sequence: `0017_` through `0022_`, sequential
  and zero-padded. Never edit a past migration in place.
- Every `SECURITY DEFINER` function: `set search_path = ''` with fully
  schema-qualified (`public.table`) references, explicit `EXECUTE`
  grants (revoke from `public`/`anon`, grant to `authenticated`) in the
  same migration that creates it — **and** an explicit
  `grant execute ... to service_role` in that same migration. Likewise
  every new table gets `grant all ... to service_role` in the migration
  that creates it, per Foundation's `0007` lesson (do not rely on the
  Supabase CLI's version-dependent implicit defaults).
- No FK from `tasks` or `task_completions` back to `profiles` ever uses
  `on delete cascade` — Market Engine's final review found that pattern
  could silently destroy another member's data on any profile deletion,
  and fixed it by removing the cascades and wiping dependent tables
  explicitly in `seedMembers()` instead. This plan's Task 1 follows that
  already-corrected pattern from the start, not the original mistake.
- `task_completions` never gets an `INSERT`/`UPDATE`/`DELETE` grant for
  `authenticated` — the three functions in Tasks 3-5 are the only way
  any row in it is ever written, each doing its own internal permission
  check. `tasks` gets column-restricted `INSERT`/`UPDATE` grants only
  (Task 1), gated by RLS requiring `is_admin()` (Task 6).
- Any RLS policy comparing against `auth.uid()`/`auth.jwt()` is written
  as `(select auth.uid())`/`(select auth.jwt())` from the start — the
  initplan-caching optimization Supabase's Performance Advisor flagged
  on three older policies, fixed in migration `0016`. Not repeating that
  gap here.
- Currency is displayed as **Dwell Coin (DC)** in all new UI copy.
  Internal naming (`balance`, `amount`, `coin_transactions`, etc.) is
  unchanged.
- Server actions in this feature follow the existing
  `useActionState`-compatible pattern — `(prevState, formData) => { formError?: string } | undefined`,
  binding extra IDs with `.bind(null, id)` when an action needs one
  beyond `prevState`/`formData` (see `lib/markets/place-bet.ts` and
  `app/markets/[id]/bet-form.tsx` for the exact existing pattern).
- Comments explain why, not what; default to no comments.
- No unrequested scope creep: member-proposed tasks, submission
  backdating, bulk approve/reject, and a general admin dashboard are
  explicitly out of scope here (see the spec's non-goals).

**Before Task 1:** `npm run db:start` (or confirm it's already running),
`.env.local` populated per `README.md` and pointed at the **local**
Supabase instance (`http://127.0.0.1:54321`) — not the hosted project.

**Before the final task's full verification pass:** re-run the whole
verification chain against the exact Supabase CLI version CI pins
(`npx -y supabase@2.115.0 db reset` before testing) — the same check
that caught Foundation's `service_role` gap after merge.

---

## Task 1: Core tables

**Files:**
- Create: `supabase/migrations/0017_task_tables.sql`
- Modify: `tests/db/fixtures.ts`
- Create: `tests/db/task-schema.test.ts`

**Interfaces:**
- Consumes: `serviceClient()` (`tests/db/helpers.ts`); `Member`,
  `makeMember()` (`tests/db/fixtures.ts`, from Foundation)
- Produces: `TestTask { taskId: string }`,
  `createTestTask(createdBy: Member, opts?: { title?: string; rewardAmount?: number; isRepeatable?: boolean; period?: 'daily' | 'weekly' | 'monthly' | 'yearly' }): Promise<TestTask>`
  (`tests/db/fixtures.ts`) — inserts directly via `serviceClient()`
  (bypassing RLS; this is fixture setup, not the thing under test,
  matching `makeMember`'s own doc comment). `seedMembers()` (Foundation)
  is modified to also wipe `task_completions` and `tasks`.

- [ ] **Step 1: Write `tests/db/task-schema.test.ts` (will fail — no tables yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('tasks table', () => {
  it('accepts a valid one-time task with the expected defaults', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('is_repeatable, period, is_active')
      .single()

    expect(error).toBeNull()
    expect(data).toEqual({ is_repeatable: false, period: null, is_active: true })
  })

  it('accepts a valid repeatable task', async () => {
    const db = serviceClient()
    const { data, error } = await db
      .from('tasks')
      .insert({
        title: 'Attend Home Church',
        reward_amount: 15,
        is_repeatable: true,
        period: 'weekly',
        created_by: alice.id,
      })
      .select('period')
      .single()

    expect(error).toBeNull()
    expect(data?.period).toBe('weekly')
  })

  it('rejects a non-positive reward amount', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 0, created_by: alice.id })
    expect(error).not.toBeNull()
  })

  it('rejects a repeatable task with no period', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 10, is_repeatable: true, created_by: alice.id })
    expect(error).not.toBeNull()
  })

  it('rejects a one-time task with a period set', async () => {
    const db = serviceClient()
    const { error } = await db
      .from('tasks')
      .insert({ title: 'Bad task', reward_amount: 10, period: 'weekly', created_by: alice.id })
    expect(error).not.toBeNull()
  })
})

describe('task_completions table', () => {
  it('defaults a new row to pending status', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    const { data, error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })
      .select('status')
      .single()

    expect(error).toBeNull()
    expect(data?.status).toBe('pending')
  })

  it('rejects a second pending row for the same task/profile/period', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    const { error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    expect(error).not.toBeNull()
  })

  it('allows a fresh row for the same task/profile/period once the prior one is rejected', async () => {
    const db = serviceClient()
    const { data: task } = await db
      .from('tasks')
      .insert({ title: 'Read Genesis 1-3', reward_amount: 10, created_by: alice.id })
      .select('id')
      .single()

    const { data: first } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })
      .select('id')
      .single()

    await db.from('task_completions').update({ status: 'rejected' }).eq('id', first!.id)

    const { error } = await db
      .from('task_completions')
      .insert({ task_id: task!.id, profile_id: alice.id, reward_amount: 10, period_key: 'once' })

    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/task-schema.test.ts`
Expected: FAIL — `relation "public.tasks" does not exist`

- [ ] **Step 3: Write `supabase/migrations/0017_task_tables.sql`**

```sql
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  reward_amount integer not null check (reward_amount > 0),
  is_repeatable boolean not null default false,
  period text check (period in ('daily', 'weekly', 'monthly', 'yearly')),
  is_active boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint period_matches_repeatable check (
    (is_repeatable = false and period is null) or
    (is_repeatable = true and period is not null)
  )
);

create table public.task_completions (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id),
  profile_id uuid not null references public.profiles (id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reward_amount integer not null,
  period_key text not null,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id),
  review_note text
);

create unique index task_completions_one_active_per_period
  on public.task_completions (task_id, profile_id, period_key)
  where status in ('pending', 'approved');

grant all on public.tasks, public.task_completions to service_role;
```

- [ ] **Step 4: Add `createTestTask` and update `seedMembers()` in `tests/db/fixtures.ts`**

Add near `createTestMarket`:

```typescript
export interface TestTask {
  taskId: string
}

export async function createTestTask(
  createdBy: Member,
  opts?: {
    title?: string
    rewardAmount?: number
    isRepeatable?: boolean
    period?: 'daily' | 'weekly' | 'monthly' | 'yearly'
  },
): Promise<TestTask> {
  const db = serviceClient()
  const isRepeatable = opts?.isRepeatable ?? false
  const { data, error } = await db
    .from('tasks')
    .insert({
      title: opts?.title ?? 'Test task',
      reward_amount: opts?.rewardAmount ?? 10,
      is_repeatable: isRepeatable,
      period: isRepeatable ? (opts?.period ?? 'weekly') : null,
      created_by: createdBy.id,
    })
    .select('id')
    .single()
  if (error) throw error
  return { taskId: data.id }
}
```

Modify `seedMembers()`'s wipe order — add these two lines before the
existing `markets` wipe (child tables before anything they reference):

```typescript
  await db.from('task_completions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  await db.from('tasks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
```

- [ ] **Step 5: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/task-schema.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Run the full DB suite to confirm the `seedMembers()` change didn't break anything**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0017_task_tables.sql tests/db/fixtures.ts tests/db/task-schema.test.ts
git commit -m "Add tasks and task_completions tables"
```

---

## Task 2: `compute_period_key` function

**Files:**
- Create: `supabase/migrations/0018_compute_period_key.sql`
- Create: `tests/db/compute-period-key.test.ts`

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `Member` (Foundation)
- Produces: `compute_period_key(p_period text, p_at timestamptz default now()) returns text` (SQL RPC), callable by any `authenticated` session — no invite check, since it touches no data of its own.

- [ ] **Step 1: Write `tests/db/compute-period-key.test.ts` (will fail — function doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { seedMembers, clientFor, type Member } from './fixtures'

let alice: Member

beforeEach(async () => {
  ;[alice] = await seedMembers()
})

describe('compute_period_key', () => {
  it('returns "once" for a null period regardless of timestamp', async () => {
    const client = await clientFor(alice)
    const { data, error } = await client.rpc('compute_period_key', { p_period: null })
    expect(error).toBeNull()
    expect(data).toBe('once')
  })

  it('groups the same calendar day together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: a } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-23T00:00:00Z',
    })
    const { data: b } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-23T23:59:59Z',
    })
    const { data: c } = await client.rpc('compute_period_key', {
      p_period: 'daily',
      p_at: '2026-09-24T00:00:00Z',
    })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })

  it('groups the same ISO week (Monday-Sunday) together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: monday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-21T00:00:00Z',
    })
    const { data: sunday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-27T23:59:59Z',
    })
    const { data: nextMonday } = await client.rpc('compute_period_key', {
      p_period: 'weekly',
      p_at: '2026-09-28T00:00:01Z',
    })
    expect(monday).toBe(sunday)
    expect(monday).not.toBe(nextMonday)
  })

  it('groups the same calendar month together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: start } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-09-01T00:00:00Z',
    })
    const { data: end } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-09-30T23:59:59Z',
    })
    const { data: nextMonth } = await client.rpc('compute_period_key', {
      p_period: 'monthly',
      p_at: '2026-10-01T00:00:00Z',
    })
    expect(start).toBe(end)
    expect(start).not.toBe(nextMonth)
  })

  it('groups the same calendar year together and separates the next one', async () => {
    const client = await clientFor(alice)
    const { data: start } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2026-01-01T00:00:00Z',
    })
    const { data: end } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2026-12-31T23:59:59Z',
    })
    const { data: nextYear } = await client.rpc('compute_period_key', {
      p_period: 'yearly',
      p_at: '2027-01-01T00:00:00Z',
    })
    expect(start).toBe(end)
    expect(start).not.toBe(nextYear)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/compute-period-key.test.ts`
Expected: FAIL — `function compute_period_key(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0018_compute_period_key.sql`**

```sql
create function compute_period_key(p_period text, p_at timestamptz default now())
returns text
language sql
immutable
as $$
  select case p_period
    when 'daily'   then to_char(p_at, 'YYYY-MM-DD')
    when 'weekly'  then to_char(p_at, 'IYYY-"W"IW')
    when 'monthly' then to_char(p_at, 'YYYY-MM')
    when 'yearly'  then to_char(p_at, 'YYYY')
    else 'once'
  end;
$$;

revoke execute on function compute_period_key(text, timestamptz) from public;
revoke execute on function compute_period_key(text, timestamptz) from anon;
grant execute on function compute_period_key(text, timestamptz) to authenticated;
grant execute on function compute_period_key(text, timestamptz) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/compute-period-key.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0018_compute_period_key.sql tests/db/compute-period-key.test.ts
git commit -m "Add compute_period_key function"
```

---

## Task 3: `submit_task_completion` function

**Files:**
- Create: `supabase/migrations/0019_submit_task_completion.sql`
- Create: `tests/db/submit-task-completion.test.ts`

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `ensureInvited()`,
  `createTestTask()`, `TestTask`, `Member` (Foundation/Task 1);
  `compute_period_key` (Task 2)
- Produces: `submit_task_completion(p_task_id uuid) returns uuid` (SQL
  RPC) — the returned `uuid` is the new `task_completions.id`.

- [ ] **Step 1: Write `tests/db/submit-task-completion.test.ts` (will fail — function doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('submit_task_completion', () => {
  it('rejects a non-invited caller', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).not.toBeNull()
  })

  it('rejects submitting an inactive task', async () => {
    const { taskId } = await createTestTask(alice)
    await serviceClient().from('tasks').update({ is_active: false }).eq('id', taskId)

    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).not.toBeNull()
  })

  it('succeeds and snapshots the task reward amount', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 25 })
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data: completionId, error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()

    const { data: row } = await serviceClient()
      .from('task_completions')
      .select('status, reward_amount, profile_id')
      .eq('id', completionId as string)
      .single()
    expect(row).toEqual({ status: 'pending', reward_amount: 25, profile_id: alice.id })
  })

  it('rejects a second submission for the same task while one is pending', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).not.toBeNull()
  })

  it('allows resubmission after the prior one was rejected', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data: firstId } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    await serviceClient().from('task_completions').update({ status: 'rejected' }).eq('id', firstId as string)

    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()
  })

  it('lets two different members each submit the same task independently', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(aliceClient)
    await ensureInvited(bobClient)

    const { error: aliceErr } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    const { error: bobErr } = await bobClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(aliceErr).toBeNull()
    expect(bobErr).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/submit-task-completion.test.ts`
Expected: FAIL — `function submit_task_completion(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0019_submit_task_completion.sql`**

```sql
create function submit_task_completion(p_task_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task record;
  v_period_key text;
  v_completion_id uuid;
begin
  if not public.is_invited() then
    raise exception 'not invited';
  end if;

  select reward_amount, period, is_active
    into v_task
  from public.tasks
  where id = p_task_id;

  if not found or not v_task.is_active then
    raise exception 'task not found or inactive';
  end if;

  v_period_key := public.compute_period_key(v_task.period);

  begin
    insert into public.task_completions (task_id, profile_id, status, reward_amount, period_key)
    values (p_task_id, auth.uid(), 'pending', v_task.reward_amount, v_period_key)
    returning id into v_completion_id;
  exception when unique_violation then
    raise exception 'you already have a pending or approved submission for this task in the current period';
  end;

  return v_completion_id;
end;
$$;

revoke execute on function submit_task_completion(uuid) from public;
revoke execute on function submit_task_completion(uuid) from anon;
grant execute on function submit_task_completion(uuid) to authenticated;
grant execute on function submit_task_completion(uuid) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/submit-task-completion.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0019_submit_task_completion.sql tests/db/submit-task-completion.test.ts
git commit -m "Add submit_task_completion function"
```

---

## Task 4: `approve_task_completion` function

**Files:**
- Create: `supabase/migrations/0020_approve_task_completion.sql`
- Create: `tests/db/approve-task-completion.test.ts`

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `ensureInvited()`,
  `createTestTask()`, `serviceClient()`, `Member` (Foundation/Task 1);
  `submit_task_completion` (Task 3)
- Produces: `approve_task_completion(p_completion_id uuid) returns void` (SQL RPC)

- [ ] **Step 1: Write `tests/db/approve-task-completion.test.ts` (will fail — function doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

async function submitAsAlice(taskId: string) {
  const aliceClient = await clientFor(alice)
  await ensureInvited(aliceClient)
  const { data } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
  return data as string
}

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('approve_task_completion', () => {
  it('rejects a non-admin caller', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })

  it('grants exactly the reward amount through the real ledger', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 30 })
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance + 30)

    const { data: txns } = await serviceClient()
      .from('coin_transactions')
      .select('amount, type')
      .eq('profile_id', alice.id)
    expect(txns).toContainEqual(expect.objectContaining({ amount: 30, type: 'task_completed' }))

    const { data: completion } = await serviceClient()
      .from('task_completions')
      .select('status, reviewed_by')
      .eq('id', completionId)
      .single()
    expect(completion).toEqual({ status: 'approved', reviewed_by: bob.id })
  })

  it('rejects approving a completion that is not pending', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })

    const { error } = await adminClient.rpc('approve_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/approve-task-completion.test.ts`
Expected: FAIL — `function approve_task_completion(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0020_approve_task_completion.sql`**

```sql
create function approve_task_completion(p_completion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_profile_id uuid;
  v_reward_amount integer;
  v_task_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only an admin can approve a task completion';
  end if;

  select status, profile_id, reward_amount, task_id
    into v_status, v_profile_id, v_reward_amount, v_task_id
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'completion not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'completion is not pending';
  end if;

  update public.task_completions
  set status = 'approved', reviewed_at = now(), reviewed_by = auth.uid()
  where id = p_completion_id;

  perform public.apply_coin_transaction(
    v_profile_id, v_reward_amount, 'task_completed',
    jsonb_build_object('task_id', v_task_id, 'completion_id', p_completion_id)
  );
end;
$$;

revoke execute on function approve_task_completion(uuid) from public;
revoke execute on function approve_task_completion(uuid) from anon;
grant execute on function approve_task_completion(uuid) to authenticated;
grant execute on function approve_task_completion(uuid) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/approve-task-completion.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0020_approve_task_completion.sql tests/db/approve-task-completion.test.ts
git commit -m "Add approve_task_completion function"
```

---

## Task 5: `reject_task_completion` function

**Files:**
- Create: `supabase/migrations/0021_reject_task_completion.sql`
- Create: `tests/db/reject-task-completion.test.ts`

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `ensureInvited()`,
  `createTestTask()`, `serviceClient()`, `Member` (Foundation/Task 1);
  `submit_task_completion` (Task 3)
- Produces: `reject_task_completion(p_completion_id uuid, p_reason text default null) returns void` (SQL RPC)

- [ ] **Step 1: Write `tests/db/reject-task-completion.test.ts` (will fail — function doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

async function submitAsAlice(taskId: string) {
  const aliceClient = await clientFor(alice)
  await ensureInvited(aliceClient)
  const { data } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
  return data as string
}

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('reject_task_completion', () => {
  it('rejects a non-admin caller', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('reject_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })

  it('moves zero coin and records the reason', async () => {
    const { taskId } = await createTestTask(alice, { rewardAmount: 30 })
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    const { error } = await adminClient.rpc('reject_task_completion', {
      p_completion_id: completionId,
      p_reason: 'wrong task',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance)

    const { data: txns } = await serviceClient().from('coin_transactions').select('id').eq('profile_id', alice.id)
    expect(txns).toEqual([])

    const { data: completion } = await serviceClient()
      .from('task_completions')
      .select('status, review_note, reviewed_by')
      .eq('id', completionId)
      .single()
    expect(completion).toEqual({ status: 'rejected', review_note: 'wrong task', reviewed_by: bob.id })
  })

  it('rejects rejecting a completion that is not pending', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })

    const { error } = await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })
    expect(error).not.toBeNull()
  })

  it('lets the member resubmit for the same period immediately after rejection', async () => {
    const { taskId } = await createTestTask(alice)
    const completionId = await submitAsAlice(taskId)

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    await adminClient.rpc('reject_task_completion', { p_completion_id: completionId })

    const aliceClient = await clientFor(alice)
    const { error } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    expect(error).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/reject-task-completion.test.ts`
Expected: FAIL — `function reject_task_completion(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0021_reject_task_completion.sql`**

```sql
create function reject_task_completion(p_completion_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'only an admin can reject a task completion';
  end if;

  select status into v_status
  from public.task_completions
  where id = p_completion_id
  for update;

  if not found then
    raise exception 'completion not found';
  end if;

  if v_status <> 'pending' then
    raise exception 'completion is not pending';
  end if;

  update public.task_completions
  set status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), review_note = p_reason
  where id = p_completion_id;
end;
$$;

revoke execute on function reject_task_completion(uuid, text) from public;
revoke execute on function reject_task_completion(uuid, text) from anon;
grant execute on function reject_task_completion(uuid, text) to authenticated;
grant execute on function reject_task_completion(uuid, text) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/reject-task-completion.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0021_reject_task_completion.sql tests/db/reject-task-completion.test.ts
git commit -m "Add reject_task_completion function"
```

---

## Task 6: RLS policies

**Files:**
- Create: `supabase/migrations/0022_task_rls_policies.sql`
- Create: `tests/db/task-rls.test.ts`

**Interfaces:**
- Consumes: `serviceClient()`, `seedMembers()`, `clientFor()`,
  `ensureInvited()`, `createTestTask()`, `Member` (Foundation/Task 1)

- [ ] **Step 1: Write `tests/db/task-rls.test.ts` (will fail — no grant/policy yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, ensureInvited, createTestTask, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('tasks select policy', () => {
  it('lets an invited member read tasks', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { data, error } = await aliceClient.from('tasks').select('id').eq('id', taskId)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('a non-invited authenticated session sees zero rows', async () => {
    const { taskId } = await createTestTask(alice)
    const bobClient = await clientFor(bob)

    const { data, error } = await bobClient.from('tasks').select('id').eq('id', taskId)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

describe('tasks write policy', () => {
  it('rejects a non-admin inserting a task', async () => {
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { error } = await aliceClient.from('tasks').insert({ title: 'Sneaky', reward_amount: 10 })
    expect(error).not.toBeNull()
  })

  it('lets an admin insert and update a task', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', alice.id)
    const adminClient = await clientFor(alice)

    const { data, error } = await adminClient
      .from('tasks')
      .insert({ title: 'Admin task', reward_amount: 10 })
      .select('id, created_by')
      .single()
    expect(error).toBeNull()
    expect(data?.created_by).toBe(alice.id)

    const { error: updateErr } = await adminClient
      .from('tasks')
      .update({ is_active: false })
      .eq('id', data!.id)
    expect(updateErr).toBeNull()
  })
})

describe('task_completions select policy', () => {
  it("shows a member only their own completions", async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    const bobClient = await clientFor(bob)
    await ensureInvited(aliceClient)
    await ensureInvited(bobClient)

    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })
    await bobClient.rpc('submit_task_completion', { p_task_id: taskId })

    const { data, error } = await aliceClient.from('task_completions').select('profile_id')
    expect(error).toBeNull()
    expect(data?.every((c) => c.profile_id === alice.id)).toBe(true)
  })

  it('shows an admin every completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { data, error } = await adminClient.from('task_completions').select('profile_id')
    expect(error).toBeNull()
    expect(data?.some((c) => c.profile_id === alice.id)).toBe(true)
  })
})

describe('task_completions direct writes', () => {
  it('rejects a direct insert, bypassing submit_task_completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)

    const { error } = await aliceClient
      .from('task_completions')
      .insert({ task_id: taskId, profile_id: alice.id, reward_amount: 999, period_key: 'once' })
    expect(error).not.toBeNull()

    const { count } = await serviceClient()
      .from('task_completions')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
    expect(count).toBe(0)
  })

  it('rejects a direct update, bypassing approve/reject_task_completion', async () => {
    const { taskId } = await createTestTask(alice)
    const aliceClient = await clientFor(alice)
    await ensureInvited(aliceClient)
    const { data: completionId } = await aliceClient.rpc('submit_task_completion', { p_task_id: taskId })

    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient
      .from('task_completions')
      .update({ status: 'approved' })
      .eq('id', completionId as string)
    expect(error).not.toBeNull()

    const { data: row } = await serviceClient()
      .from('task_completions')
      .select('status')
      .eq('id', completionId as string)
      .single()
    expect(row?.status).toBe('pending')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/task-rls.test.ts`
Expected: FAIL — every `select`/write against `tasks`/`task_completions`
errors with "permission denied" (no grant yet)

- [ ] **Step 3: Write `supabase/migrations/0022_task_rls_policies.sql`**

```sql
alter table public.tasks enable row level security;
alter table public.task_completions enable row level security;

revoke all on public.tasks from anon, authenticated;
revoke all on public.task_completions from anon, authenticated;

grant select on public.tasks to authenticated;
grant insert (title, description, reward_amount, is_repeatable, period) on public.tasks to authenticated;
grant update (title, description, reward_amount, is_active) on public.tasks to authenticated;
grant select on public.task_completions to authenticated;

create policy select_tasks on public.tasks for select to authenticated
  using (is_invited());
create policy admin_insert_tasks on public.tasks for insert to authenticated
  with check (is_admin());
create policy admin_update_tasks on public.tasks for update to authenticated
  using (is_admin()) with check (is_admin());

create policy select_own_or_admin_task_completions on public.task_completions for select to authenticated
  using (profile_id = (select auth.uid()) or is_admin());
```

Note: `task_completions` gets no `insert`/`update`/`delete` grant for
`authenticated` at all — Tasks 3-5's three functions are the only way
any row in it is ever written.

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/task-rls.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Run the full DB suite**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0022_task_rls_policies.sql tests/db/task-rls.test.ts
git commit -m "Add RLS policies for tasks and task_completions"
```

---

## Task 7: Member-facing `/tasks` page

**Files:**
- Create: `lib/tasks/list-tasks.ts`
- Create: `lib/tasks/list-task-completions.ts`
- Create: `lib/tasks/period-keys.ts`
- Create: `lib/tasks/submit-task-completion.ts`
- Create: `app/tasks/page.tsx`
- Create: `app/tasks/submit-button.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `requireUser()` (`lib/auth/require-user.ts`); the
  `submit_task_completion` RPC (Task 3); `tasks`/`task_completions`
  tables (Tasks 1, 6)
- Produces: `TaskSummary { id: string; title: string; description: string | null; rewardAmount: number; isRepeatable: boolean; period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null; isActive: boolean }`
  (`lib/tasks/list-tasks.ts`), `listTasks(supabase): Promise<TaskSummary[]>`;
  `MyCompletion { taskId: string; status: 'pending' | 'approved' | 'rejected'; periodKey: string; rewardAmount: number }`
  (`lib/tasks/list-task-completions.ts`), `listMyTaskCompletions(supabase, profileId: string): Promise<MyCompletion[]>`;
  `getCurrentPeriodKeys(supabase, periods: (TaskSummary['period'])[]): Promise<Map<string, string>>`
  (`lib/tasks/period-keys.ts`) — map keyed by the period value itself
  (using the string `'once'` as the map key for `null`); `ActionState`,
  `submitTaskCompletionAction` (`lib/tasks/submit-task-completion.ts`)

- [ ] **Step 1: Write `lib/tasks/list-tasks.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TaskSummary {
  id: string
  title: string
  description: string | null
  rewardAmount: number
  isRepeatable: boolean
  period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null
  isActive: boolean
}

export async function listTasks(supabase: SupabaseClient): Promise<TaskSummary[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, title, description, reward_amount, is_repeatable, period, is_active')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    rewardAmount: t.reward_amount,
    isRepeatable: t.is_repeatable,
    period: t.period,
    isActive: t.is_active,
  }))
}
```

- [ ] **Step 2: Write `lib/tasks/list-task-completions.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MyCompletion {
  taskId: string
  status: 'pending' | 'approved' | 'rejected'
  periodKey: string
  rewardAmount: number
}

export async function listMyTaskCompletions(supabase: SupabaseClient, profileId: string): Promise<MyCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('task_id, status, period_key, reward_amount')
    .eq('profile_id', profileId)
    .order('submitted_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((c) => ({
    taskId: c.task_id,
    status: c.status,
    periodKey: c.period_key,
    rewardAmount: c.reward_amount,
  }))
}

export interface PendingCompletion {
  id: string
  taskTitle: string
  submitterName: string
  submittedAt: string
}

export async function listPendingTaskCompletions(supabase: SupabaseClient): Promise<PendingCompletion[]> {
  const { data, error } = await supabase
    .from('task_completions')
    .select('id, submitted_at, tasks(title), profiles(display_name)')
    .eq('status', 'pending')
    .order('submitted_at', { ascending: true })

  if (error) throw error

  return (data ?? []).map((c) => {
    const task = c.tasks as unknown as { title: string } | null
    const profile = c.profiles as unknown as { display_name: string } | null
    return {
      id: c.id,
      taskTitle: task?.title ?? 'Unknown task',
      submitterName: profile?.display_name ?? 'Unknown member',
      submittedAt: c.submitted_at,
    }
  })
}
```

- [ ] **Step 3: Write `lib/tasks/period-keys.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TaskSummary } from './list-tasks'

export async function getCurrentPeriodKeys(
  supabase: SupabaseClient,
  periods: TaskSummary['period'][],
): Promise<Map<string, string>> {
  const distinct = [...new Set(periods)]
  const result = new Map<string, string>()

  await Promise.all(
    distinct.map(async (period) => {
      const { data, error } = await supabase.rpc('compute_period_key', { p_period: period })
      if (error) throw error
      result.set(period ?? 'once', data as string)
    }),
  )

  return result
}
```

- [ ] **Step 4: Write `lib/tasks/submit-task-completion.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function submitTaskCompletionAction(taskId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('submit_task_completion', { p_task_id: taskId })
  if (error) return { formError: error.message }

  revalidatePath('/tasks')
  return undefined
}
```

- [ ] **Step 5: Write `app/tasks/submit-button.tsx`**

```typescript
'use client'

import { useActionState } from 'react'
import { submitTaskCompletionAction, type ActionState } from '@/lib/tasks/submit-task-completion'

export function SubmitButton({ taskId }: { taskId: string }) {
  const boundAction = submitTaskCompletionAction.bind(null, taskId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction}>
      <button type="submit" className="text-sm underline">
        I did this
      </button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 6: Write `app/tasks/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listMyTaskCompletions } from '@/lib/tasks/list-task-completions'
import { getCurrentPeriodKeys } from '@/lib/tasks/period-keys'
import { SubmitButton } from './submit-button'

const PERIOD_LABEL: Record<string, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

export default async function TasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')

  const allTasks = await listTasks(supabase)
  const activeTasks = allTasks.filter((t) => t.isActive)
  const myCompletions = await listMyTaskCompletions(supabase, user.id)
  const currentPeriodKeys = await getCurrentPeriodKeys(
    supabase,
    activeTasks.map((t) => t.period),
  )

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>
      <ul className="mt-6 space-y-4">
        {activeTasks.map((task) => {
          const currentPeriodKey = currentPeriodKeys.get(task.period ?? 'once')!
          const active = myCompletions.find(
            (c) => c.taskId === task.id && c.periodKey === currentPeriodKey && c.status !== 'rejected',
          )

          return (
            <li key={task.id} className="border p-4">
              <p className="font-medium">
                {task.title} — {task.rewardAmount} DC
                {task.isRepeatable && ` (${PERIOD_LABEL[task.period!]})`}
              </p>
              {task.description && <p className="text-sm text-foreground/70">{task.description}</p>}
              {!active && <SubmitButton taskId={task.id} />}
              {active?.status === 'pending' && <p className="text-sm text-foreground/70">Pending review</p>}
              {active?.status === 'approved' && <p className="text-sm text-foreground/70">Completed this period</p>}
            </li>
          )
        })}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">My submissions</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {myCompletions.map((c, i) => (
          <li key={i}>
            {allTasks.find((t) => t.id === c.taskId)?.title ?? 'Unknown task'} — {c.status} ({c.rewardAmount} DC)
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 7: Add a "Tasks" link to `app/page.tsx`**

Modify `app/page.tsx` — add this line next to the existing `Markets` link:

```typescript
      <Link href="/tasks" className="text-sm underline">
        Tasks
      </Link>
```

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, sign in, visit `/tasks`. Since there are no tasks
yet (Task 8 adds the admin UI to create them), the page should render
an empty catalog with no errors. Verify via `npm run build` that
everything type-checks:

Run: `npm run build`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add lib/tasks/list-tasks.ts lib/tasks/list-task-completions.ts lib/tasks/period-keys.ts lib/tasks/submit-task-completion.ts app/tasks/page.tsx app/tasks/submit-button.tsx app/page.tsx
git commit -m "Add member-facing /tasks page"
```

---

## Task 8: Admin `/admin/tasks` page

**Files:**
- Create: `lib/tasks/create-task.ts`
- Create: `lib/tasks/update-task.ts`
- Create: `lib/tasks/review-task-completion.ts`
- Create: `app/admin/tasks/page.tsx`
- Create: `app/admin/tasks/create-task-form.tsx`
- Create: `app/admin/tasks/edit-task-form.tsx`
- Create: `app/admin/tasks/review-buttons.tsx`
- Modify: `app/admin/invites/page.tsx` (add a nav link to `/admin/tasks`, mirroring how `/page.tsx` links to `/tasks`)

**Interfaces:**
- Consumes: `requireUser()`, `isAdmin()` (Foundation); `listTasks`,
  `TaskSummary` (Task 7); `listPendingTaskCompletions`,
  `PendingCompletion` (Task 7); `approve_task_completion`,
  `reject_task_completion` RPCs (Tasks 4-5)

- [ ] **Step 1: Write `lib/tasks/create-task.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export async function createTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isRepeatable = formData.get('is_repeatable') === 'on'
  const period = String(formData.get('period') ?? '')

  if (!title) return { formError: 'Enter a title.' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.' }
  }
  if (isRepeatable && !PERIODS.includes(period as (typeof PERIODS)[number])) {
    return { formError: 'Choose a cadence for a repeatable task.' }
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

- [ ] **Step 2: Write `lib/tasks/update-task.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function updateTaskAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isActive = formData.get('is_active') === 'on'

  if (!title) return { formError: 'Enter a title.' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.' }
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

- [ ] **Step 3: Write `lib/tasks/review-task-completion.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function approveTaskCompletionAction(completionId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: completionId })
  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}

export async function rejectTaskCompletionAction(completionId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const reason = String(formData.get('reason') ?? '').trim()
  const { error } = await supabase.rpc('reject_task_completion', {
    p_completion_id: completionId,
    p_reason: reason || null,
  })
  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
```

- [ ] **Step 4: Write `app/admin/tasks/create-task-form.tsx`**

```typescript
'use client'

import { useActionState, useState } from 'react'
import { createTaskAction, type ActionState } from '@/lib/tasks/create-task'

export function CreateTaskForm() {
  const [isRepeatable, setIsRepeatable] = useState(false)
  const [state, formAction] = useActionState<ActionState, FormData>(createTaskAction, undefined)

  return (
    <form action={formAction} className="mt-4 flex flex-col gap-2 border p-4">
      <label className="flex flex-col gap-1">
        Title
        <input name="title" required className="border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Description
        <textarea name="description" className="border px-2 py-1" />
      </label>
      <label className="flex flex-col gap-1">
        Reward (DC)
        <input name="reward_amount" type="number" min="1" step="1" required className="border px-2 py-1" />
      </label>
      <label className="flex items-center gap-2">
        <input
          name="is_repeatable"
          type="checkbox"
          checked={isRepeatable}
          onChange={(e) => setIsRepeatable(e.target.checked)}
        />
        Repeatable
      </label>
      {isRepeatable && (
        <label className="flex flex-col gap-1">
          Cadence
          <select name="period" required className="border px-2 py-1">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>
      )}
      <button type="submit">Create task</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 5: Write `app/admin/tasks/edit-task-form.tsx`**

```typescript
'use client'

import { useActionState } from 'react'
import { updateTaskAction, type ActionState } from '@/lib/tasks/update-task'
import type { TaskSummary } from '@/lib/tasks/list-tasks'

export function EditTaskForm({ task }: { task: TaskSummary }) {
  const boundAction = updateTaskAction.bind(null, task.id)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-2 flex flex-col gap-2 text-sm">
      <input name="title" defaultValue={task.title} className="border px-2 py-1" />
      <textarea name="description" defaultValue={task.description ?? ''} className="border px-2 py-1" />
      <input name="reward_amount" type="number" min="1" step="1" defaultValue={task.rewardAmount} className="border px-2 py-1" />
      <label className="flex items-center gap-2">
        <input name="is_active" type="checkbox" defaultChecked={task.isActive} />
        Active
      </label>
      <button type="submit">Save</button>
      {state?.formError && <p className="text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 6: Write `app/admin/tasks/review-buttons.tsx`**

```typescript
'use client'

import { useActionState } from 'react'
import { approveTaskCompletionAction, rejectTaskCompletionAction, type ActionState } from '@/lib/tasks/review-task-completion'

export function ReviewButtons({ completionId }: { completionId: string }) {
  const boundApprove = approveTaskCompletionAction.bind(null, completionId)
  const boundReject = rejectTaskCompletionAction.bind(null, completionId)
  const [approveState, approveAction] = useActionState<ActionState, FormData>(boundApprove, undefined)
  const [rejectState, rejectAction] = useActionState<ActionState, FormData>(boundReject, undefined)

  return (
    <div className="mt-2 flex gap-2">
      <form action={approveAction}>
        <button type="submit">Approve</button>
      </form>
      <form action={rejectAction} className="flex gap-1">
        <input name="reason" placeholder="Reason (optional)" className="border px-2 py-1 text-sm" />
        <button type="submit">Reject</button>
      </form>
      {approveState?.formError && <p className="text-sm text-red-600">{approveState.formError}</p>}
      {rejectState?.formError && <p className="text-sm text-red-600">{rejectState.formError}</p>}
    </div>
  )
}
```

- [ ] **Step 7: Write `app/admin/tasks/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listTasks } from '@/lib/tasks/list-tasks'
import { listPendingTaskCompletions } from '@/lib/tasks/list-task-completions'
import { CreateTaskForm } from './create-task-form'
import { EditTaskForm } from './edit-task-form'
import { ReviewButtons } from './review-buttons'

export default async function AdminTasksPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const tasks = await listTasks(supabase)
  const pending = await listPendingTaskCompletions(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Tasks</h1>

      <h2 className="mt-6 text-lg font-semibold">Pending approvals</h2>
      <ul className="mt-2 space-y-3">
        {pending.map((c) => (
          <li key={c.id} className="border p-3">
            <p>
              {c.submitterName} — {c.taskTitle}
            </p>
            <ReviewButtons completionId={c.id} />
          </li>
        ))}
        {pending.length === 0 && <p className="text-sm text-foreground/70">Nothing pending.</p>}
      </ul>

      <h2 className="mt-8 text-lg font-semibold">Catalog</h2>
      <CreateTaskForm />
      <ul className="mt-4 space-y-3">
        {tasks.map((task) => (
          <li key={task.id} className="border p-3">
            <p className="font-medium">
              {task.title} — {task.rewardAmount} DC {!task.isActive && '(inactive)'}
            </p>
            <EditTaskForm task={task} />
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 8: Add a nav link from `/admin/invites` to `/admin/tasks`**

Modify `app/admin/invites/page.tsx` — add near the existing `<h1>`:

```typescript
      <Link href="/admin/tasks" className="text-sm underline">
        Manage tasks
      </Link>
```

(Add `import Link from 'next/link'` alongside the existing imports.)

- [ ] **Step 9: Manual verification**

Run: `npm run dev`, sign in as the admin, visit `/admin/tasks`. Create a
task, then visit `/tasks` in a different session (or after signing out
and back in as another seeded member) and confirm it appears with a
working "I did this" button, and that it shows up back in
`/admin/tasks`'s pending queue for approval.

Run: `npm run build`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add lib/tasks/create-task.ts lib/tasks/update-task.ts lib/tasks/review-task-completion.ts app/admin/tasks app/admin/invites/page.tsx
git commit -m "Add admin /admin/tasks page: catalog management and approval queue"
```

---

## Task 9: End-to-end wiring

**Files:**
- Create: `e2e/coin-economy.spec.ts`

**Interfaces:**
- Consumes: the seeded, admin-promoted session `e2e/global-setup.ts`
  already provides (Foundation)

- [ ] **Step 1: Write `e2e/coin-economy.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('create a task, submit it, and approve it as admin', async ({ page }) => {
  await page.goto('/admin/tasks')

  await page.getByLabel('Title').fill('Read Genesis 1-3')
  await page.getByLabel('Reward (DC)').fill('10')
  await page.getByRole('button', { name: 'Create task' }).click()

  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()

  await page.goto('/tasks')
  await expect(page.getByText('Read Genesis 1-3 — 10 DC')).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).click()
  await expect(page.getByText('Pending review')).toBeVisible()

  await page.goto('/admin/tasks')
  await expect(page.getByText('Read Genesis 1-3')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(/Balance: 1\d\d DC/)).toBeVisible()
})
```

- [ ] **Step 2: Run the e2e suite**

Run: `npm run db:reset && npx playwright test`
Expected: PASS (this new test plus the 4 existing ones — 5 total)

- [ ] **Step 3: Run everything (lint, unit+DB tests, build, e2e)**

Run: `npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all PASS

- [ ] **Step 4: Commit**

```bash
git add e2e/coin-economy.spec.ts
git commit -m "Add e2e test: create task, submit, admin-approve"
```

---

## Task 10: Documentation and CI-version verification

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only, plus a verification pass.

- [ ] **Step 1: Update `README.md`'s status line**

Replace:

```markdown
**Status:** Foundation + Market Engine complete — Google sign-in
(invite-only), a single admin account, a Dwell Coin (DC) ledger, and a
pari-mutuel betting market (create, bet, resolve, admin override). Live at
[dwelldule.com](https://dwelldule.com).
```

with:

```markdown
**Status:** Foundation + Market Engine + Coin Economy complete — Google
sign-in (invite-only), a single admin account, a Dwell Coin (DC) ledger,
a pari-mutuel betting market, and an admin-managed Bible-study task
catalog with approval-gated coin rewards. Live at
[dwelldule.com](https://dwelldule.com).
```

- [ ] **Step 2: Verify the full chain against the exact Supabase CLI version CI pins**

```bash
npx -y supabase@2.115.0 stop --no-backup
npx -y supabase@2.115.0 start
npm run lint
npx vitest run
npm run build
npx -y supabase@2.115.0 db reset
npx playwright test
```

Expected: every step PASS, using this exact CLI version, not whatever's
installed globally.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Coin Economy in README"
```

---

## Self-Review

**Spec coverage:**
- Admin-only fixed task catalog, each with its own custom reward → Tasks 1, 8 ✓
- One-time and repeatable (daily/weekly/monthly/yearly) tasks, calendar-aligned periods → Tasks 1-2 ✓
- Submit → pending → admin approve/reject; approval grants coin through the real ledger; rejection grants nothing → Tasks 3-5 ✓
- Resubmission allowed after rejection, same period → Tasks 3, 5 (tested in both) ✓
- Partial unique index enforcing "one active per period," reused for one-time tasks via the `'once'` sentinel → Task 1 ✓
- `reward_amount` snapshotted at submission so later task edits don't retroactively change pending/approved value → Task 3 (test asserts the snapshotted value directly) ✓
- No table gets a write grant for `authenticated` beyond `tasks`' column-restricted admin-gated insert/update; `task_completions` has none at all → Task 6 ✓
- RLS: own completions only, or everything for an admin; direct writes rejected → Task 6 ✓
- `/tasks` catalog with per-task eligibility status, `/admin/tasks` catalog management + approval queue → Tasks 7-8 ✓
- `useActionState`-compatible actions throughout → Tasks 7-8 ✓
- e2e smoke test → Task 9 ✓
- CI-pinned-version verification → Task 10 ✓
- No FK-to-`profiles` cascade; explicit `seedMembers()` wipe instead → Task 1 ✓
- Initplan-cached `(select auth.uid())` in the one new policy that needs it → Task 6 ✓

**Placeholder scan:** none found — every step has complete, real code.

**Type consistency:** `TestTask { taskId }` (Task 1) used identically in
Tasks 3-6. `ActionState = { formError?: string } | undefined` (Task 7)
reused verbatim across Tasks 7-8's five action files. `TaskSummary`
(Task 7) field names (`rewardAmount`, `isRepeatable`, `period`,
`isActive`, camelCase throughout the TS layer, matching
`MarketSummary`'s existing convention) match exactly between
`list-tasks.ts` and every page/component that consumes it
(`app/tasks/page.tsx`, `app/admin/tasks/page.tsx`,
`edit-task-form.tsx`). `MyCompletion`/`PendingCompletion` (Task 7) are
each used with the same field names in both the page that produces
them and the component that renders them.
