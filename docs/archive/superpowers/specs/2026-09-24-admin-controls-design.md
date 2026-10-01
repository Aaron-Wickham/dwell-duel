# Admin Controls — design

**Date:** 2026-09-24
**Status:** approved, not yet implemented
**Sub-project 4 of 7** in the DwellDuel build order. Builds directly on
Foundation's `apply_coin_transaction()` and `is_admin()`, and reuses
[Coin Economy](2026-09-23-coin-economy-design.md)'s `approve_task_completion`/
`reject_task_completion` unchanged. [Market Engine](2026-09-22-market-engine-design.md)'s
spec explicitly deferred "a broader admin moderation dashboard (bulk
actions, audit views, general balance adjustment)" to this sub-project,
having scoped its own admin capability (resolve/override) tightly to
markets alone — this is that deferred work.

## Goal

Three admin capabilities, each reusing as much existing infrastructure
as possible rather than inventing new mechanisms:

- **Manual balance adjustment** — credit or debit any member's Dwell
  Coin balance directly, with a required reason, for corrections or
  one-off situations the market/task systems don't cover.
- **Audit log** — a simple chronological feed of every coin movement
  that has ever happened in the app, across every member, in one place.
- **Bulk approve/reject** for the task-completion approval queue —
  select several pending submissions and act on all of them at once.

## Non-goals (deferred or explicitly out of scope)

- Bulk actions on markets — considered during brainstorming and
  explicitly declined. Bulk *resolving* doesn't even make sense (each
  market needs its own outcome picked), and bulk *voiding* wasn't
  wanted either.
- Filtering or search on the audit log — a flat, unfiltered feed is
  enough for this pass; add filtering later if the feed grows long
  enough to need it.
- Editing or undoing a past balance adjustment — consistent with this
  app's immutable-ledger philosophy everywhere else (a market
  resolution is reversed by a new transaction, never by editing an old
  one), a mistaken adjustment gets corrected by making a second,
  opposite adjustment, never by changing history.
- Any notification when a balance is adjusted or a task is
  bulk-reviewed — no email/push infrastructure exists in this app,
  same accepted limitation as Coin Economy.
- A general "admin actions" audit trail beyond coin movements (e.g.
  logging every task-catalog edit or invite change) — only money
  moving is audited, matching what `coin_transactions` already covers.

## Prior art being reused, and what's deliberately new

This sub-project needs unusually little new surface:

- **No new tables.** `adjust_balance`'s new transaction type,
  `'admin_adjustment'`, needs no schema change — `coin_transactions.type`
  is `text not null` with no enum constraint (verified against migration
  `0001_core_tables.sql`), the same reason Market Engine and Coin
  Economy could each add their own new type values freely.
- **No new RLS policies, no new grants for reading.** An admin can
  already read every profile (`select_all_profiles using (is_invited())`,
  Foundation) and every transaction
  (`select_own_or_admin_transactions using (profile_id = (select auth.uid()) or is_admin())`,
  hardened in migration `0016`) under policies that already exist. The
  member list and the audit feed are new *pages*, not new *access* —
  there is nothing left to grant.
- **One new function, following the established pattern exactly:**
  `adjust_balance` is a narrow `SECURITY DEFINER` wrapper around the
  existing `apply_coin_transaction`, exactly like every prior coin-mover
  in this app (`place_bet`, `resolve_market`, `submit_task_completion`,
  etc.). It inherits `apply_coin_transaction`'s existing
  `balance >= 0` check for free — a debit that would take someone
  negative is already rejected without `adjust_balance` needing any
  balance-checking logic of its own.
- **No new function for bulk actions at all.** Approving or rejecting a
  task completion is already a single, safe, atomic RPC call
  (`approve_task_completion`/`reject_task_completion`, Coin Economy).
  "Bulk" here means calling that same existing RPC once per selected
  item from one new server action — not a new privileged database
  operation.

## `adjust_balance` — the one new function

Migration continues the sequence at `0024_adjust_balance.sql`.

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

`p_amount` takes either sign — a positive value credits, a negative
value debits, through the exact same function. The explicit
`p_amount = 0` check exists even though `coin_transactions` already has
`check (amount <> 0)` at the schema level, for the same reason
`submit_task_completion` catches its own `unique_violation` rather than
letting a raw constraint error reach the client: a clear, specific
message instead of a raw Postgres error. `adjusted_by` in `meta` records
which admin made the call (relevant once there is ever more than one
admin); `reason` is what the audit feed actually displays.

## UI

- **`/admin/members`** — every profile (display name, email, balance,
  admin flag), each row with an inline adjust-balance form: an amount
  field (accepts a negative value), a required reason field, and a
  submit button — the same compact inline-form pattern already
  established by `/admin/tasks`' edit-task form.
- **`/admin/ledger`** — every `coin_transactions` row, newest first,
  joined to `profiles` for a display name: member, signed amount
  (`+10`/`-5`), a human-readable label for `type`
  (`bet_placed` → "Bet placed", `bet_won` → "Bet won",
  `bet_refunded` → "Bet refunded",
  `bet_voided_refund` → "Market voided",
  `resolution_reversed` → "Resolution reversed",
  `task_completed` → "Task reward",
  `admin_adjustment` → "Admin adjustment"), and — only for
  `admin_adjustment` rows — the reason from `meta`. No filtering, per
  the non-goals above.
- **`/admin/tasks`** (existing page, enhanced) — a checkbox per pending
  row plus a "select all" checkbox, and two new controls: **Approve
  selected** / **Reject selected**. Bulk reject takes one shared,
  optional reason applied to every selected item, rather than a
  separate reason per item, which would defeat the point of doing this
  in bulk.

## Error handling

`adjust_balance`'s exceptions (non-admin, zero amount, missing reason,
or `apply_coin_transaction`'s own insufficient-balance rejection) surface
as a `formError` on the inline form, the same `useActionState`-compatible
pattern used everywhere else in this app.

Bulk actions call the existing single-item RPCs in a loop, one call per
selected id, so a single stale item (e.g. already reviewed by the time
the batch runs) fails independently without blocking the rest of the
batch. The action reports a summary — e.g. "3 approved, 1 failed
(already reviewed)" — rather than one opaque error for the whole
selection.

## Testing

Same `tests/db/*.test.ts` pattern, against real RLS-scoped sessions:

- `adjust_balance`: rejects a non-admin caller; rejects a zero amount;
  rejects a missing or blank (whitespace-only) reason; credits and
  debits correctly through the real ledger (verified via
  `coin_transactions`, not just `profiles.balance`); rejects a debit
  that would take the balance negative, proving it inherits
  `apply_coin_transaction`'s existing check rather than needing its own.
- Read-side pages (`/admin/members`, `/admin/ledger`): confirmed against
  existing RLS with no new policies needed — an admin session can read
  every profile and every transaction; a non-admin's attempt to reach
  either page redirects, matching every other `/admin/*` page's gate.
- Playwright e2e: as the admin, with two pending task completions
  already submitted, select both in the approval queue, approve in
  bulk, and confirm both members' balances updated and the queue is
  empty afterward.
