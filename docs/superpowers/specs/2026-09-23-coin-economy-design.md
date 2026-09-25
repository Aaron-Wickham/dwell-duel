# Coin Economy — design

**Date:** 2026-09-23
**Status:** approved, not yet implemented
**Sub-project 3 of 7** in the DwellDuel build order. Builds directly on
[Foundation](2026-09-22-foundation-design.md) — `is_admin()`,
`is_invited()`, and `apply_coin_transaction()` (the only path that can
ever change a balance). Unlike [Market Engine](2026-09-22-market-engine-design.md),
which only ever moves coin that already exists in someone's balance,
this sub-project is the first to actually **create** new coin.

## Goal

A fixed, admin-managed catalog of Bible-study tasks that invited members
can claim to have completed, subject to your approval before any coin is
granted:

- Admin creates/edits/deactivates tasks, each with its own coin reward
- A task is either one-time (claimable once, ever) or repeatable on a
  fixed cadence — daily, weekly, monthly, or yearly — enforced by the
  system, not by admin memory
- A member submits "I did this"; it sits pending until you approve or
  reject it
- Approval grants the coin through the existing ledger; rejection grants
  nothing, and the member can immediately resubmit for the same period

## Non-goals (deferred to later sub-projects or out of scope entirely)

- Any notification when a submission needs review — no email/push
  infrastructure exists in this app (Google-only sign-in, no SMTP), so
  you check `/admin/tasks` yourself. Out of scope entirely, not just
  deferred.
- Member-proposed tasks — admin-only catalog for now, per your answer
  during brainstorming.
- Backdating a submission to a period other than "now" — the moment you
  submit is the moment that determines which period you're claiming.
  Someone who forgets to log Monday's meeting until the following
  Monday loses that week's credit; an edge case accepted as out of
  scope for this pass.
- Bulk approve/reject, or any broader admin moderation dashboard — a
  general admin-tools UI is sub-project 4's territory; this sub-project
  only builds the one approval queue it needs.
- Task categories, grouping, or search — a flat list is enough at this
  scale.

## Prior art being reused, and one lesson carried forward early

Every coin grant here is still exactly one call to
`apply_coin_transaction()` — this sub-project adds a new *reason* for it
to fire (`task_completed`), not a new way to move coin. `tasks` and
`task_completions` follow the same revoke-then-narrow-grant hardening
every table in this codebase already uses: no bare `INSERT`/`UPDATE`
grant for `authenticated` where a `SECURITY DEFINER` function needs to
own that write, `search_path = ''` with schema-qualified references
everywhere, and explicit `service_role` grants from the same migration
that creates each object (Foundation's post-merge lesson, not repeated
since).

One thing applied *proactively* this time rather than needing a
follow-up fix: the new `select` policy on `task_completions` already
wraps `auth.uid()` in `(select auth.uid())` from the start — the exact
optimization Supabase's own Performance Advisor just flagged on three
older policies (fixed in migration `0016`). No reason to ship a fourth
policy with the same avoidable cost.

## Data model

Migrations continue the sequence, starting at `0017`.

### `tasks`

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `title` | `text not null` | |
| `description` | `text` | nullable |
| `reward_amount` | `integer not null` | `check (reward_amount > 0)` |
| `is_repeatable` | `boolean not null default false` | |
| `period` | `text` | `check (period in ('daily', 'weekly', 'monthly', 'yearly'))` — nullable, but only when `is_repeatable = false` (see constraint below) |
| `is_active` | `boolean not null default true` | |
| `created_by` | `uuid not null default auth.uid() references profiles(id)` | |
| `created_at` | `timestamptz not null default now()` | |

```sql
constraint period_matches_repeatable check (
  (is_repeatable = false and period is null) or
  (is_repeatable = true and period is not null)
)
```

No delete — matching how markets are voided rather than removed, a task
you no longer want is deactivated (`is_active = false`), which hides it
from the catalog without breaking the historical `task_completions` rows
that still reference it.

### `task_completions`

Every submission, in whatever state it ends up in — not just approved
ones.

| column | type | notes |
|---|---|---|
| `id` | `uuid primary key default gen_random_uuid()` | |
| `task_id` | `uuid not null references tasks(id)` | |
| `profile_id` | `uuid not null references profiles(id)` | |
| `status` | `text not null default 'pending'` | `check (status in ('pending', 'approved', 'rejected'))` |
| `reward_amount` | `integer not null` | snapshotted from the task at submission time, so editing a task's reward later never changes what an already-pending or already-approved row is worth |
| `period_key` | `text not null` | e.g. `2026-09-23`, `2026-W39`, `2026-09`, `2026`, or the constant `once` for non-repeatable tasks |
| `submitted_at` | `timestamptz not null default now()` | |
| `reviewed_at` | `timestamptz` | null until approved/rejected |
| `reviewed_by` | `uuid references profiles(id)` | |
| `review_note` | `text` | optional, mainly for rejections |

**The period-cap trick — one partial unique index does all of it:**

```sql
create unique index task_completions_one_active_per_period
  on public.task_completions (task_id, profile_id, period_key)
  where status in ('pending', 'approved');
```

At most one *non-rejected* row can exist per task/user/period. Rejected
rows are invisible to this index, which is exactly what makes
resubmission-after-rejection work for free: reject one, and the same
`(task_id, profile_id, period_key)` is free again for a fresh insert.
One-time tasks use the constant `period_key = 'once'`, so the same
mechanism enforces "only ever once" for them too — no separate code path
needed for one-time vs. repeatable.

## `compute_period_key` — the one place period logic lives

Both the write path (`submit_task_completion`, enforcing the cap) and
the read path (the `/tasks` page, deciding what to show *before* a
member tries to submit) need to agree on "what period is it right now
for this task" — computing that twice, once in SQL and once in
TypeScript, risks the two drifting (a timezone edge case, an off-by-one
in ISO week math). So it's a single small SQL function, called from
both places:

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
```

`'weekly'` uses Postgres's ISO week (`IYYY`/`IW`), whose weeks run
Monday–Sunday — matching how the four recurring meetings this catalog
will actually hold (Home Church Monday, CT Thursday, Prayer Group and
Cell Group Friday) fall within a single calendar week. `p_period = null`
(a one-time task) falls through to the `else` branch, returning `'once'`.
Marked `immutable`: given the same two inputs it always returns the same
output, since it does no table lookups of its own.

## Coin-moving functions

### `submit_task_completion(p_task_id uuid) returns uuid`

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
```

Always submits as `auth.uid()` — there is no parameter for "which
profile," so there's no way to submit on someone else's behalf. The
`unique_violation` catch turns a raw constraint name into the actual
human-readable reason, matching how every other function in this
codebase surfaces an error.

### `approve_task_completion(p_completion_id uuid) returns void`

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
```

`select ... for update` locks the completion row so two concurrent
approval attempts (e.g. an admin double-clicking) can't both pass the
`status = 'pending'` check and double-pay. The status flip and the coin
grant happen in the same transaction as everything else in this
function, so a failure partway through leaves neither half applied.

### `reject_task_completion(p_completion_id uuid, p_reason text default null) returns void`

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
```

No coin ever moves on this path. Because the row's `status` flips to
`rejected`, it drops out of the partial unique index immediately, so the
member can call `submit_task_completion` again for the same
`(task_id, period_key)` right away.

## RLS policies and grants

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

grant all on public.tasks, public.task_completions to service_role;
grant execute on function compute_period_key(text, timestamptz) to service_role;
grant execute on function submit_task_completion(uuid) to service_role;
grant execute on function approve_task_completion(uuid) to service_role;
grant execute on function reject_task_completion(uuid, text) to service_role;
```

`tasks`' `INSERT`/`UPDATE` grants are column-restricted so `created_by`
can never be set by the client — it always falls through to its
`default auth.uid()`, even though the only caller who can insert at all
is already an admin. `task_completions` gets **no** `INSERT`/`UPDATE`
grant whatsoever for `authenticated` — the three functions above,
running as their owner, are the only way any row in that table is ever
written.

## UI

- **`/tasks`** (linked from the main nav, alongside the existing
  `Markets` link) — the active task catalog: title, description, reward
  amount, and a cadence badge (`Daily` / `Weekly` / `Monthly` / `Yearly`
  / one-time). Per task, one of: a **Submit** button (eligible), **Pending
  review**, or **Already completed this week/month/etc.** — computed by
  calling `compute_period_key` for that task's period and checking it
  against the viewer's own `task_completions`. A "My submissions"
  section below shows the viewer's own pending/approved/rejected history.
- **`/admin/tasks`** — task catalog management (create, edit, toggle
  `is_active`), matching `/admin/invites`' existing visual pattern, plus
  an approval queue: every `pending` completion with its task title,
  submitter, and submitted-at, each with Approve / Reject (Reject takes
  an optional short reason) controls.

## Error handling

Every function raises a plain Postgres exception with a human-readable
message on any invalid state (not invited, task inactive, already
submitted this period, not pending, not an admin) — the calling page
surfaces that message directly, the same pattern established in
Foundation and carried through Market Engine. Approval and rejection
each happen inside one transaction, so a failure partway through (e.g.
`apply_coin_transaction`'s internal invariants) leaves neither the
status flip nor the coin grant applied.

## Testing

Same `tests/db/*.test.ts` pattern as the rest of the suite, against real
RLS-scoped sessions:

- `compute_period_key`: correct output for each of the four period
  types at a few different timestamps (including a week/month/year
  boundary), and `'once'` for a null period.
- `submit_task_completion`: rejects an inactive task; rejects a
  non-invited caller; succeeds and snapshots the task's current
  `reward_amount`; a second submission for the same task in the same
  period is rejected with the friendly message while the first is still
  `pending` or `approved`; after that first one is rejected, a second
  submission for the same period succeeds.
- `approve_task_completion`: grants exactly `reward_amount` DC to the
  submitter through the real ledger (verified via `coin_transactions`,
  not just `profiles.balance`); rejects a non-admin caller; rejects
  approving a completion that isn't `pending` (already approved or
  rejected).
- `reject_task_completion`: moves zero coin; rejects a non-admin caller;
  rejects rejecting a completion that isn't `pending`; the member can
  immediately resubmit for the same period afterward and it succeeds.
- RLS: a member can't see another member's `task_completions` rows; an
  admin can see everyone's; a non-admin's direct `INSERT`/`UPDATE`
  against `tasks` or `task_completions` is rejected (there's no grant
  for it at all); a non-invited authenticated session sees zero rows
  from `tasks`.
- Playwright e2e: as the admin, create a repeatable weekly task; as a
  seeded member, submit it, confirm it shows as pending; as the admin,
  approve it and confirm the member's balance increased by the task's
  reward; confirm the member can no longer submit that same task again
  until the next week.
