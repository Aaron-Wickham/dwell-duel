# Admin Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three admin capabilities deferred from earlier sub-projects —
manual balance adjustment (credit or debit, with a required reason), a
simple audit feed of every coin movement in the app, and bulk
approve/reject for the task-completion approval queue.

**Architecture:** One new `SECURITY DEFINER` function (`adjust_balance`,
a narrow wrapper around the existing `apply_coin_transaction`) and zero
new RLS policies — an admin can already read every profile and every
transaction under policies that already exist, so the new pages are
new *views* onto existing access, not new *access*. Bulk approve/reject
needs no new database function at all: it's a new server action that
calls the existing `approve_task_completion`/`reject_task_completion`
RPCs once per selected item.

**Tech Stack:** Same as every prior sub-project — Next.js 16 (App
Router) + TypeScript + Supabase (Postgres/RLS/`SECURITY DEFINER`) +
Vitest + Playwright.

**Spec:** [`docs/superpowers/specs/2026-09-24-admin-controls-design.md`](../specs/2026-09-24-admin-controls-design.md)
— read it alongside this plan.

## Global Constraints

- Migration continues the sequence at `0024_adjust_balance.sql`. Never
  edit a past migration in place.
- `adjust_balance`: `SECURITY DEFINER`, `set search_path = ''`, fully
  schema-qualified (`public.function`) references, explicit `EXECUTE`
  grant (revoke from `public`/`anon`, grant to `authenticated` **and**
  `service_role`) in the same migration that creates it.
- No new RLS policy and no new grant is needed for reading profiles or
  transactions — `select_all_profiles using (is_invited())` and
  `select_own_or_admin_transactions using (profile_id = (select auth.uid()) or is_admin())`
  already cover everything this sub-project's read-side pages need. If
  a task's implementer finds themselves reaching for a new policy here,
  that's a signal something is wrong — stop and reconsider against this
  constraint before writing one.
- `adjust_balance` never bypasses `apply_coin_transaction`'s own
  `balance >= 0` check — no separate balance-sufficiency check is
  written in `adjust_balance` itself.
- No editing or undoing a past adjustment — a correction is a second,
  opposite-signed adjustment, never a mutation of an existing
  `coin_transactions` row.
- Bulk actions call the existing single-item RPCs in a loop from one
  new server action — never a new privileged database function for
  "the same thing, N times."
- Server actions follow the existing `useActionState`-compatible
  pattern: `(prevState, formData) => { formError?: string } | undefined`
  for single-item actions, binding an id with `.bind(null, id)` when
  needed (see `lib/tasks/update-task.ts` for the exact precedent). Bulk
  actions use a distinct `BulkActionState` shape (`{ formError?: string; summary?: string }`)
  since they need to report a partial-success count, not just a single
  pass/fail.
- Comments explain why, not what; default to no comments.
- No unrequested scope creep: bulk actions on markets, filtering/search
  on the audit log, and any notification on adjustment/bulk-review are
  explicitly out of scope (see the spec's non-goals).

**Before Task 1:** `npm run db:start` (or confirm it's already
running), `.env.local` pointed at the **local** Supabase instance.

**Before the final task's full verification pass:** re-run the whole
verification chain against the exact Supabase CLI version CI pins
(`npx -y supabase@2.115.0`) — the same check that has caught real,
version-specific bugs in every prior sub-project.

---

## Task 1: `adjust_balance` function

**Files:**
- Create: `supabase/migrations/0024_adjust_balance.sql`
- Create: `tests/db/adjust-balance.test.ts`

**Interfaces:**
- Consumes: `seedMembers()`, `clientFor()`, `serviceClient()`, `Member`
  (Foundation/`tests/db/fixtures.ts`); `apply_coin_transaction` (Foundation,
  not modified — just called)
- Produces: `adjust_balance(p_profile_id uuid, p_amount integer, p_reason text) returns void` (SQL RPC)

- [ ] **Step 1: Write `tests/db/adjust-balance.test.ts` (will fail — function doesn't exist yet)**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { serviceClient } from './helpers'
import { seedMembers, clientFor, type Member } from './fixtures'

let alice: Member
let bob: Member

beforeEach(async () => {
  ;[alice, bob] = await seedMembers()
})

describe('adjust_balance', () => {
  it('rejects a non-admin caller', async () => {
    const bobClient = await clientFor(bob)
    const { error } = await bobClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      p_reason: 'test',
    })
    expect(error).not.toBeNull()
  })

  it('rejects a zero amount', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 0,
      p_reason: 'test',
    })
    expect(error).not.toBeNull()
  })

  it('rejects a missing reason', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      p_reason: null,
    })
    expect(error).not.toBeNull()
  })

  it('rejects a blank (whitespace-only) reason', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)
    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 10,
      p_reason: '   ',
    })
    expect(error).not.toBeNull()
  })

  it('credits a balance through the real ledger', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: 25,
      p_reason: 'Bonus for helping set up chairs',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance + 25)

    const { data: txns } = await serviceClient()
      .from('coin_transactions')
      .select('amount, type, meta')
      .eq('profile_id', alice.id)
      .eq('type', 'admin_adjustment')
    expect(txns).toContainEqual(
      expect.objectContaining({
        amount: 25,
        type: 'admin_adjustment',
        meta: expect.objectContaining({ reason: 'Bonus for helping set up chairs', adjusted_by: bob.id }),
      }),
    )
  })

  it('debits a balance through the real ledger', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: -20,
      p_reason: 'Correcting an over-payment',
    })
    expect(error).toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance - 20)
  })

  it('rejects a debit that would take the balance negative', async () => {
    await serviceClient().from('profiles').update({ is_admin: true }).eq('id', bob.id)
    const adminClient = await clientFor(bob)

    const { data: before } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()

    const { error } = await adminClient.rpc('adjust_balance', {
      p_profile_id: alice.id,
      p_amount: -(before!.balance + 1),
      p_reason: 'Would go negative',
    })
    expect(error).not.toBeNull()

    const { data: after } = await serviceClient().from('profiles').select('balance').eq('id', alice.id).single()
    expect(after!.balance).toBe(before!.balance)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/db/adjust-balance.test.ts`
Expected: FAIL — `function adjust_balance(...) does not exist`

- [ ] **Step 3: Write `supabase/migrations/0024_adjust_balance.sql`**

```sql
create function adjust_balance(p_profile_id uuid, p_amount integer, p_reason text)
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

  perform public.apply_coin_transaction(
    p_profile_id, p_amount, 'admin_adjustment',
    jsonb_build_object('reason', p_reason, 'adjusted_by', auth.uid())
  );
end;
$$;

revoke execute on function adjust_balance(uuid, integer, text) from public;
revoke execute on function adjust_balance(uuid, integer, text) from anon;
grant execute on function adjust_balance(uuid, integer, text) to authenticated;
grant execute on function adjust_balance(uuid, integer, text) to service_role;
```

- [ ] **Step 4: Apply the migration and run the test**

Run: `npm run db:reset && npx vitest run tests/db/adjust-balance.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run the full DB suite**

Run: `npx vitest run tests/db`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0024_adjust_balance.sql tests/db/adjust-balance.test.ts
git commit -m "Add adjust_balance function"
```

---

## Task 2: `/admin/members` page

**Files:**
- Create: `lib/members/list-members.ts`
- Create: `lib/members/adjust-balance.ts`
- Create: `app/admin/members/page.tsx`
- Create: `app/admin/members/adjust-balance-form.tsx`
- Modify: `app/admin/invites/page.tsx`
- Modify: `app/admin/tasks/page.tsx`

**Interfaces:**
- Consumes: `requireUser()`, `isAdmin()` (Foundation); `adjust_balance` RPC (Task 1)
- Produces: `MemberSummary { id: string; displayName: string; email: string; balance: number; isAdmin: boolean }`
  and `listMembers(supabase): Promise<MemberSummary[]>` (`lib/members/list-members.ts`);
  `ActionState`, `adjustBalanceAction(profileId: string, prevState: ActionState, formData: FormData): Promise<ActionState>`
  (`lib/members/adjust-balance.ts`)

- [ ] **Step 1: Write `lib/members/list-members.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface MemberSummary {
  id: string
  displayName: string
  email: string
  balance: number
  isAdmin: boolean
}

export async function listMembers(supabase: SupabaseClient): Promise<MemberSummary[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, email, balance, is_admin')
    .order('display_name', { ascending: true })

  if (error) throw error

  return (data ?? []).map((p) => ({
    id: p.id,
    displayName: p.display_name,
    email: p.email,
    balance: p.balance,
    isAdmin: p.is_admin,
  }))
}
```

- [ ] **Step 2: Write `lib/members/adjust-balance.ts`**

```typescript
'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function adjustBalanceAction(profileId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isInteger(amount) || amount === 0) return { formError: 'Enter a non-zero whole number of DC.' }
  if (!reason) return { formError: 'Enter a reason.' }

  const { error } = await supabase.rpc('adjust_balance', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
  })
  if (error) return { formError: error.message }

  revalidatePath('/admin/members')
  return undefined
}
```

- [ ] **Step 3: Write `app/admin/members/adjust-balance-form.tsx`**

```typescript
'use client'

import { useActionState } from 'react'
import { adjustBalanceAction, type ActionState } from '@/lib/members/adjust-balance'

export function AdjustBalanceForm({ profileId }: { profileId: string }) {
  const boundAction = adjustBalanceAction.bind(null, profileId)
  const [state, formAction] = useActionState<ActionState, FormData>(boundAction, undefined)

  return (
    <form action={formAction} className="mt-2 flex gap-2">
      <input name="amount" type="number" step="1" placeholder="Amount (+/-)" required className="border px-2 py-1 text-sm" />
      <input name="reason" placeholder="Reason" required className="border px-2 py-1 text-sm" />
      <button type="submit">Adjust</button>
      {state?.formError && <p className="text-sm text-red-600">{state.formError}</p>}
    </form>
  )
}
```

- [ ] **Step 4: Write `app/admin/members/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listMembers } from '@/lib/members/list-members'
import { AdjustBalanceForm } from './adjust-balance-form'

export default async function AdminMembersPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const members = await listMembers(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Members</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/invites" className="text-sm underline">
          Invites
        </Link>
        <Link href="/admin/tasks" className="text-sm underline">
          Tasks
        </Link>
      </div>
      <ul className="mt-6 space-y-3">
        {members.map((m) => (
          <li key={m.id} className="border p-3">
            <p className="font-medium">
              {m.displayName} — {m.balance} DC {m.isAdmin && '(admin)'}
            </p>
            <p className="text-sm text-foreground/70">{m.email}</p>
            <AdjustBalanceForm profileId={m.id} />
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 5: Add a "Members" nav link to `app/admin/invites/page.tsx`**

Modify the existing links row (currently just `<Link href="/admin/tasks">Manage tasks</Link>`) to also include:

```typescript
      <Link href="/admin/members" className="text-sm underline">
        Manage members
      </Link>
```

- [ ] **Step 6: Add a "Members" nav link to `app/admin/tasks/page.tsx`**

Add near the existing `<h1>Tasks</h1>`:

```typescript
      <Link href="/admin/members" className="text-sm underline">
        Manage members
      </Link>
```

(Add `import Link from 'next/link'` alongside the existing imports if not already present.)

- [ ] **Step 7: Manual verification**

Run: `npm run build`
Expected: PASS, with `/admin/members` listed as a new route

- [ ] **Step 8: Commit**

```bash
git add lib/members app/admin/members app/admin/invites/page.tsx app/admin/tasks/page.tsx
git commit -m "Add admin /admin/members page: member list and balance adjustment"
```

---

## Task 3: `/admin/ledger` page

**Files:**
- Create: `lib/ledger/list-transactions.ts`
- Create: `app/admin/ledger/page.tsx`
- Modify: `app/admin/invites/page.tsx`
- Modify: `app/admin/tasks/page.tsx`
- Modify: `app/admin/members/page.tsx`

**Interfaces:**
- Consumes: `requireUser()`, `isAdmin()` (Foundation)
- Produces: `LedgerEntry { id: number; memberName: string; amount: number; type: string; reason: string | null; createdAt: string }`
  and `listAllTransactions(supabase): Promise<LedgerEntry[]>` (`lib/ledger/list-transactions.ts`)

- [ ] **Step 1: Write `lib/ledger/list-transactions.ts`**

```typescript
import type { SupabaseClient } from '@supabase/supabase-js'

export interface LedgerEntry {
  id: number
  memberName: string
  amount: number
  type: string
  reason: string | null
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
}

export async function listAllTransactions(supabase: SupabaseClient): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('coin_transactions')
    .select('id, amount, type, meta, created_at, profiles(display_name)')
    .order('created_at', { ascending: false })

  if (error) throw error

  return (data ?? []).map((t) => {
    const profile = t.profiles as unknown as { display_name: string } | null
    const meta = t.meta as { reason?: string }
    return {
      id: t.id,
      memberName: profile?.display_name ?? 'Unknown member',
      amount: t.amount,
      type: TYPE_LABELS[t.type] ?? t.type,
      reason: t.type === 'admin_adjustment' ? (meta.reason ?? null) : null,
      createdAt: t.created_at,
    }
  })
}
```

`coin_transactions.profile_id` has exactly one foreign key to `profiles`
(unlike `task_completions`, which has two — `profile_id` and
`reviewed_by` — and needed `profiles!task_completions_profile_id_fkey`
to disambiguate), so a plain `profiles(display_name)` embed resolves
unambiguously here with no disambiguation syntax needed.

- [ ] **Step 2: Write `app/admin/ledger/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireUser } from '@/lib/auth/require-user'
import { isAdmin } from '@/lib/auth/is-admin'
import { listAllTransactions } from '@/lib/ledger/list-transactions'

export default async function AdminLedgerPage() {
  const { supabase, user } = await requireUser()
  if (!user) redirect('/sign-in')
  if (!(await isAdmin(supabase))) redirect('/')

  const entries = await listAllTransactions(supabase)

  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-semibold">Ledger</h1>
      <div className="mt-2 flex gap-4">
        <Link href="/admin/invites" className="text-sm underline">
          Invites
        </Link>
        <Link href="/admin/tasks" className="text-sm underline">
          Tasks
        </Link>
        <Link href="/admin/members" className="text-sm underline">
          Members
        </Link>
      </div>
      <ul className="mt-6 space-y-2 text-sm">
        {entries.map((e) => (
          <li key={e.id} className="border-b py-2">
            {e.memberName}: {e.amount > 0 ? '+' : ''}
            {e.amount} DC — {e.type}
            {e.reason && ` (${e.reason})`}
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 3: Add a "Ledger" nav link to `app/admin/invites/page.tsx`**

```typescript
      <Link href="/admin/ledger" className="text-sm underline">
        View ledger
      </Link>
```

- [ ] **Step 4: Add a "Ledger" nav link to `app/admin/tasks/page.tsx`**

```typescript
      <Link href="/admin/ledger" className="text-sm underline">
        View ledger
      </Link>
```

- [ ] **Step 5: Add a "Ledger" nav link to `app/admin/members/page.tsx`**

```typescript
        <Link href="/admin/ledger" className="text-sm underline">
          View ledger
        </Link>
```

(Add alongside the "Invites"/"Tasks" links already added in Task 2 Step 4.)

- [ ] **Step 6: Manual verification**

Run: `npm run build`
Expected: PASS, with `/admin/ledger` listed as a new route

- [ ] **Step 7: Commit**

```bash
git add lib/ledger app/admin/ledger app/admin/invites/page.tsx app/admin/tasks/page.tsx app/admin/members/page.tsx
git commit -m "Add admin /admin/ledger page: full transaction audit feed"
```

---

## Task 4: Bulk approve/reject on `/admin/tasks`

**Files:**
- Modify: `lib/tasks/review-task-completion.ts`
- Create: `app/admin/tasks/pending-approvals.tsx`
- Modify: `app/admin/tasks/page.tsx`

**Interfaces:**
- Consumes: `PendingCompletion` (Coin Economy, `lib/tasks/list-task-completions.ts`);
  `approve_task_completion`/`reject_task_completion` RPCs (Coin Economy) — called from the new bulk actions, unchanged
- Produces: `BulkActionState { formError?: string; summary?: string }`,
  `bulkApproveTaskCompletionsAction(prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState>`,
  `bulkRejectTaskCompletionsAction(prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState>`
  (`lib/tasks/review-task-completion.ts`)

- [ ] **Step 1: Add bulk actions to `lib/tasks/review-task-completion.ts`**

Add this to the existing file (keep the existing `ActionState`,
`approveTaskCompletionAction`, `rejectTaskCompletionAction` unchanged):

```typescript
export interface BulkActionState {
  formError?: string
  summary?: string
}

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

  revalidatePath('/admin/tasks')
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

- [ ] **Step 2: Write `app/admin/tasks/pending-approvals.tsx`**

```typescript
'use client'

import { useActionState, useRef } from 'react'
import {
  bulkApproveTaskCompletionsAction,
  bulkRejectTaskCompletionsAction,
  type BulkActionState,
} from '@/lib/tasks/review-task-completion'
import { ReviewButtons } from './review-buttons'
import type { PendingCompletion } from '@/lib/tasks/list-task-completions'

const BULK_FORM_ID = 'bulk-review-form'

export function PendingApprovals({ pending }: { pending: PendingCompletion[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [approveState, approveAction] = useActionState<BulkActionState, FormData>(bulkApproveTaskCompletionsAction, undefined)
  const [rejectState, rejectAction] = useActionState<BulkActionState, FormData>(bulkRejectTaskCompletionsAction, undefined)

  function toggleAll(checked: boolean) {
    containerRef.current?.querySelectorAll<HTMLInputElement>('input[name="completionIds"]').forEach((el) => {
      el.checked = checked
    })
  }

  return (
    <div ref={containerRef}>
      {pending.length > 0 && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" onChange={(e) => toggleAll(e.target.checked)} />
          Select all
        </label>
      )}
      <ul className="mt-2 space-y-3">
        {pending.map((c) => (
          <li key={c.id} className="border p-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="completionIds" value={c.id} form={BULK_FORM_ID} />
              {c.submitterName} — {c.taskTitle}
            </label>
            <ReviewButtons completionId={c.id} />
          </li>
        ))}
        {pending.length === 0 && <p className="text-sm text-foreground/70">Nothing pending.</p>}
      </ul>

      {pending.length > 0 && (
        <form id={BULK_FORM_ID} className="mt-3 flex items-center gap-2">
          <button type="submit" formAction={approveAction}>
            Approve selected
          </button>
          <input name="reason" placeholder="Reason (optional)" className="border px-2 py-1 text-sm" />
          <button type="submit" formAction={rejectAction}>
            Reject selected
          </button>
        </form>
      )}
      {approveState?.formError && <p className="mt-2 text-sm text-red-600">{approveState.formError}</p>}
      {approveState?.summary && <p className="mt-2 text-sm">{approveState.summary}</p>}
      {rejectState?.formError && <p className="mt-2 text-sm text-red-600">{rejectState.formError}</p>}
      {rejectState?.summary && <p className="mt-2 text-sm">{rejectState.summary}</p>}
    </div>
  )
}
```

The `<input type="checkbox" ... form={BULK_FORM_ID}>` pattern
associates each row's checkbox with the `<form id="bulk-review-form">`
rendered further down the tree, via the standard HTML `form` attribute
— an input does not need to be a DOM descendant of its form. This is
what lets each checkbox live inside the same `<li>` as its own
`ReviewButtons` (which renders its own, separate, single-item `<form>`
elements) without ever nesting one `<form>` inside another, which HTML
does not allow. The two submit buttons share the same
`bulk-review-form` fields (every checked `completionIds` value, plus
the shared `reason` field) but route to different server actions via
their own `formAction`.

- [ ] **Step 3: Update `app/admin/tasks/page.tsx` to use `PendingApprovals`**

Replace the existing inline pending-completions block:

```typescript
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
```

with:

```typescript
      <h2 className="mt-6 text-lg font-semibold">Pending approvals</h2>
      <PendingApprovals pending={pending} />
```

Remove the now-unused `ReviewButtons` import from `page.tsx` (it is
still used, just from inside `pending-approvals.tsx` now) and add:

```typescript
import { PendingApprovals } from './pending-approvals'
```

- [ ] **Step 4: Manual verification**

Run: `npm run build`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/review-task-completion.ts app/admin/tasks/pending-approvals.tsx app/admin/tasks/page.tsx
git commit -m "Add bulk approve/reject to the admin task approval queue"
```

---

## Task 5: End-to-end wiring

**Files:**
- Create: `e2e/admin-controls.spec.ts`
- Modify: `e2e/coin-economy.spec.ts`

**Interfaces:**
- Consumes: the seeded, admin-promoted session `e2e/global-setup.ts`
  already provides (Foundation)

Adding a new e2e spec file changes the file execution order under this
project's serial (`workers: 1`) Playwright config — files run in the
order Playwright discovers them, which sorts `admin-controls.spec.ts`
*before* `coin-economy.spec.ts` alphabetically. `coin-economy.spec.ts`
currently asserts an exact final balance (`'Balance: 110 DC'`), which
silently assumed it was the only test in the suite that ever grows the
shared session's balance and that nothing runs before it. This task's
own new test also grows that balance (approving two tasks), so that
assumption breaks the moment this task lands — not a hypothetical, a
certainty. Step 1 fixes this at its root instead of choosing a file
name that happens to sort later (which would just defer the same
problem to the next sub-project that adds an e2e file).

- [ ] **Step 1: Make `e2e/coin-economy.spec.ts`'s balance assertion order-independent**

Replace the test's final section. Current ending:

```typescript
  await page.goto('/admin/tasks')
  await expect(page.getByText('Read Genesis 1-3')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText('Balance: 110 DC')).toBeVisible()
})
```

New ending — read the starting balance before the task exists, assert
the delta instead of an absolute value:

```typescript
  await page.goto('/admin/tasks')
  await expect(page.getByText('Read Genesis 1-3')).toBeVisible()
  await page.getByRole('button', { name: 'Approve' }).first().click()
  await expect(page.getByText('Nothing pending.')).toBeVisible()

  await page.goto('/')
  await expect(page.getByText(`Balance: ${startingBalance + 10} DC`)).toBeVisible()
})
```

And add this near the very top of the test, before the task is created
(right after the `test(...)` opening line):

```typescript
test('create a task, submit it, and approve it as admin', async ({ page }) => {
  await page.goto('/')
  const balanceText = await page.getByText(/Balance: \d+ DC/).textContent()
  const startingBalance = Number(balanceText!.match(/\d+/)![0])

  await page.goto('/admin/tasks')
  // ... rest of the test unchanged until the ending above
```

- [ ] **Step 2: Write `e2e/admin-controls.spec.ts`**

```typescript
import { test, expect } from '@playwright/test'

test('bulk-approve two pending task completions from the admin queue', async ({ page }) => {
  await page.goto('/admin/tasks')
  await page.getByLabel('Title').fill('Read Psalm 23')
  await page.getByLabel('Reward (DC)').fill('5')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Psalm 23 — 5 DC')).toBeVisible()

  await page.getByLabel('Title').fill('Read Proverbs 3')
  await page.getByLabel('Reward (DC)').fill('7')
  await page.getByRole('button', { name: 'Create task' }).click()
  await expect(page.getByText('Read Proverbs 3 — 7 DC')).toBeVisible()

  await page.goto('/tasks')
  await page.getByRole('button', { name: 'I did this' }).first().click()
  await expect(page.getByText('Pending review').first()).toBeVisible()
  await page.getByRole('button', { name: 'I did this' }).first().click()

  await page.goto('/admin/tasks')
  await page.locator('input[name="completionIds"]').first().check()
  await page.locator('input[name="completionIds"]').nth(1).check()
  await page.getByRole('button', { name: 'Approve selected' }).click()

  await expect(page.getByText('2 approved.')).toBeVisible()
  await expect(page.getByText('Nothing pending.')).toBeVisible()
})
```

This test deliberately does not assert an absolute or delta balance —
the coin-granting mechanics are already thoroughly covered at the DB
level (Task 1's tests, and Coin Economy's existing
`approve-task-completion.test.ts`). Its job is to prove the bulk-select
UI mechanic itself works: two independent checkboxes, one click,
both approved.

- [ ] **Step 3: Run the e2e suite**

Run: `npm run db:reset && (lsof -ti:3000 | xargs -r kill 2>/dev/null); npx playwright test`
Expected: PASS (this new test plus the 5 existing ones — 6 total)

- [ ] **Step 4: Run everything (lint, unit+DB tests, build, e2e)**

Run: `npm run lint && npx vitest run && npm run build && npx playwright test`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add e2e/admin-controls.spec.ts e2e/coin-economy.spec.ts
git commit -m "Add e2e test: bulk-approve task completions; make coin-economy's balance assertion order-independent"
```

---

## Task 6: Documentation and CI-version verification

**Files:**
- Modify: `README.md`

**Interfaces:** none — documentation only, plus a verification pass.

- [ ] **Step 1: Update `README.md`'s status line**

Replace:

```markdown
**Status:** Foundation + Market Engine + Coin Economy complete — Google
sign-in (invite-only), a single admin account, a Dwell Coin (DC) ledger,
a pari-mutuel betting market, and an admin-managed Bible-study task
catalog with approval-gated coin rewards. Live at
[dwellduel.com](https://dwellduel.com).
```

with:

```markdown
**Status:** Foundation + Market Engine + Coin Economy + Admin Controls
complete — Google sign-in (invite-only), a single admin account, a
Dwell Coin (DC) ledger, a pari-mutuel betting market, an admin-managed
Bible-study task catalog with approval-gated coin rewards, and admin
tooling for manual balance adjustment, a full transaction ledger, and
bulk task-completion review. Live at
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

Expected: every step PASS, using this exact CLI version, not whatever's
installed globally.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Document Admin Controls in README"
```

---

## Self-Review

**Spec coverage:**
- Manual balance adjustment, both directions, required reason → Task 1 ✓
- Debit inherits `apply_coin_transaction`'s existing `balance >= 0` check rather than a new one → Task 1's last test ✓
- No editing/undoing a past adjustment → not implemented anywhere (no update/delete path exists for `coin_transactions`) ✓
- Member list + inline adjustment UI → Task 2 ✓
- Zero new RLS policies, reusing existing `select_all_profiles`/`select_own_or_admin_transactions` → Tasks 2-3 (no RLS migration in either) ✓
- Simple, unfiltered chronological audit feed → Task 3 ✓
- Bulk approve/reject via looping the existing single-item RPCs, no new SQL function → Task 4 ✓
- Separate-pages-per-concern navigation, cross-linked → Tasks 2-3's nav link steps ✓
- `useActionState`-compatible actions throughout, `BulkActionState` distinct from `ActionState` → Tasks 2, 4 ✓
- e2e smoke test for the one genuinely new interaction (bulk select) → Task 5 ✓
- No bulk actions on markets → not implemented anywhere ✓
- No filtering/search on the ledger → not implemented anywhere ✓
- CI-pinned-version verification → Task 6 ✓

**Placeholder scan:** none found — every step has complete, real code.

**Type consistency:** `MemberSummary` (Task 2) field names (`displayName`,
`isAdmin`, camelCase) match `TaskSummary`'s existing convention and are
used identically in `page.tsx` and `adjust-balance-form.tsx`.
`LedgerEntry` (Task 3) fields match between `list-transactions.ts` and
`page.tsx`. `BulkActionState` (Task 4) is a distinct type from the
existing `ActionState` (different shape — carries `summary` — so it's
named differently rather than overloading `ActionState` with an
optional field only bulk actions use) and is used consistently across
`review-task-completion.ts` and `pending-approvals.tsx`. The
`admin_adjustment` transaction type string is identical between the
migration's `apply_coin_transaction` call (Task 1) and
`list-transactions.ts`'s `TYPE_LABELS` lookup and `reason`-extraction
condition (Task 3).
