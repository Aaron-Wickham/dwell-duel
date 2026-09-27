# Post-beta cleanup — design

**Date:** 2026-09-27
**Status:** approved, not yet implemented
**Sub-project 10.** This clears every code-side item left open after `v0.1.0-beta` (#17, #18). The user chose to leave no leftover work.

## Goal

Close out the deferred items from the sub-project 8 and 9 reviews:
- retire the old feed view from app access
- index the events table's cascade columns
- enforce the feed's timestamp invariants
- make market sparklines cheaper as history grows
- page the last two unpaged lists
- fix the remaining accessibility gaps in loading and "Show more"
- tidy two small paging leftovers

## Non-goals

These are for the user to do, not code:
- member invites
- switching Supabase to asymmetric JWT signing keys
- the Supabase Auth redirect allow-list for Vercel previews

Also out of scope:
- dropping `activity_feed`. It stays as the tests' equivalence oracle.
- any change to coin-moving functions, apart from the new CHECKs described below.

## Decisions (from the user)

- **Invites:** the user sends them.
- **Paging:** both the leaderboard and open markets get "Show more".
- **Scope:** all the deferred items below. Nothing is parked.

## Design

### 1. Migration `supabase/migrations/0036_post_beta_cleanup.sql`

One explicit transaction, following the pattern of 0034 and 0035:
- `begin`
- `set local lock_timeout = '5s'`
- one `lock table … in share row exclusive mode` on every table the file touches or references
- a preflight guard
- the changes below
- `commit`

**1a. Retire `activity_feed` from app access.**
- `revoke select on public.activity_feed from authenticated, anon`. `service_role` and the owner keep access.
- The view stays as it is, as the tests' equivalence oracle.
- Tests that read it through a member client (`tests/db/activity-feed.test.ts`, `list-feed-equivalence.test.ts`, `social-readers.test.ts`, `activity-events.test.ts`, `data-layer-indexes.test.ts`) switch to the service client or `pgQuery`. The view is `security_invoker`, so its results under those clients must be checked against the tests' intent. Where a test asserted the view's RLS for members, replace it with an assertion that `authenticated` can't select the view, and keep any per-viewer RLS assertions on `activity_events` itself.

**1b. Cascade indexes on `activity_events`.** Plain b-tree indexes on `bet_id`, `parlay_id`, `task_completion_id`, `outcome_id` and `market_id`. Each serves the `on delete cascade` from its source table, so deleting a source row no longer scans the whole events table.

**1c. Timestamp invariants.** Two CHECK constraints:
- `task_completions_approved_has_reviewed_at`: `check (status <> 'approved' or reviewed_at is not null)`
- `parlays_won_has_settled_at`: `check (status <> 'won' or settled_at is not null)`

A **preflight guard** runs before any constraint is added. It counts the rows that violate either invariant and raises, naming each count, so nothing is applied. With the guard in place the constraints are added **validated**, not `NOT VALID`: the guard has already proved every existing row passes. Every writer already sets these timestamps (`approve_task_completion`, `settle_parlay`), so no app behaviour changes.

**1d. A cheaper `market_sparklines`.** `create or replace` with the same signature, return shape, caps (`ord <= 50`, points `≤ 200`), security invoker, no `search_path`, and full schema qualification. The body changes:
- Compute each outcome's running pool over **that outcome's bets only**, and each market's running total over its bets. There is no bet × outcome cross join.
- Keep the same `n` numbering over `(created_at, id)` per market and the same picked positions.
- At each picked position, each outcome's share is its latest running pool at or before that position, divided by the market's running total there. Outcomes with no bet yet read as 0.
- Output stays **bit-identical** to the current function. The existing sparkline DB tests pin this: equality with `buildProbabilitySeries`, ties, duplicates, caps, the `Index Cond` EXPLAIN and RLS. They must pass unchanged, apart from any EXPLAIN assertion adjusted to the new plan shape while still proving the per-market `Index Cond`.
- Record before and after `EXPLAIN ANALYZE` on the scale seed in the PR.

### 2. Paging the last two lists

**2a. Leaderboard** (`app/(app)/leaderboard/page.tsx`, `lib/social/leaderboard.ts`).
- The page shows 50 members at a time, with "Show more" and "Back to newest", as the other lists do.
- The order is the existing SQL order: `balance desc, display_name asc, id asc`.
- **The cursor** encodes `(balance, display_name, id)`. It gets its own small encode/decode, alongside `lib/pagination/cursor.ts` (for example `lib/pagination/rank-cursor.ts`), validated like the existing cursor: a bad cursor means the first page, and it never throws. The `readKeyset` pattern (extend the range, window at 500) is reused if the implementation allows. Otherwise use a dedicated reader with the same semantics and bounds, at most 500 rows per request.
- **Ranks stay correct across pages.** The first row of any window gets rank `1 + count(members with balance > its balance)`. Later rows continue with competition ranking (`assignRanks`), so ties share a rank, and a tie that straddles a page boundary keeps the same rank on both sides.
- `getMemberStanding` and Home are unchanged.
- **Search params:** `before` for the range, and `before_from` for a fresh window.

**2b. Open markets** (`lib/markets/list-markets.ts` `listOpenMarkets`, `app/(app)/markets/(list)/page.tsx`).
- The list pages like the closed list: newest 50 by `(created_at, id)`, using the existing keyset helpers, with "Show more" and "Back to newest".
- **Search params:** `open` and `open_from`. The closed list keeps `resolved`.
- **Sparklines:** they're read for the open and closed cards shown, as today.

### 3. Accessibility

**3a. One loading announcement per page.**
- The market page's section skeletons (`components/markets/market-detail-skeletons.tsx`) drop their own `role="status"` "Loading…" lines. One sr-only status is rendered for the page while any section is still loading, and it isn't repeated per section.
- The same rule applies anywhere a page renders several skeleton sections. Grep for `SkeletonScreen` usage.
- Route-level `loading.tsx` skeletons keep their single status.

**3b. Focus after "Show more".**
- After a "Show more" that extends the list, focus moves to the first newly shown row. A fresh window counts as well: there, focus goes to the window's first row. The row takes `tabIndex={-1}` and gets an accessible name from its content, so screen readers announce it and keyboard users carry on from there.
- **How:** the "Show more" link carries the id of the row that will be first new, for example via a `focus` search param or a hash that a small client component reads after navigation. The row gets a stable DOM id derived from its cursor. Whichever approach is chosen, it must:
  - work with `scroll={false}`
  - not trigger a scroll jump
  - apply to every list that uses `ShowMore`: ledger, bets, closed markets, open markets, feed, member activity and leaderboard
- Reduced motion is unaffected.

### 4. Small leftovers

- **The keyset probe reads keys only.** `readKeyset`'s probe for the next cursor reads only the key columns, not the full row `select` with its embeds. Its public signature stays compatible with every caller, or all callers are updated together.
- **A window past the end.** A windowed list (a `*_from` cursor) that returns no rows shows "Nothing older here" plus "Back to newest", instead of that list's empty state ("No coin movements yet", "No markets yet" and so on). This applies to every paged list.

## Copy (new)

- "Nothing older here"

## Global constraints

- **One migration, `0036`,** in one explicit transaction with `lock_timeout` and a preflight guard. It only adds indexes and CHECKs, revokes select on the view from `authenticated`/`anon`, and recreates `market_sparklines` with identical output. No other function or policy changes.
- **The e2e contract:**
  - every existing asserted string, role and count keeps resolving
  - the member and market pages keep their real 404s, and the signed-out 307 is unchanged
  - specs may gain waits, never changed assertions
  - the e2e count stays **27**
- **Bounded reads:** every read is at most 500 rows per request, and no URL grows with row counts.
- **AGENTS.md conventions:** tokens only, 44px targets, real elements, errors inline, and `hit-area` for inline links.
- **Deploy order:** apply 0036 to production before merging, by running Deploy Production Database on the branch, as for 0035. The new build doesn't strictly depend on 0036, but the same order keeps it safe.

## Testing

**DB tests:**
- `authenticated` can't select `activity_feed`, and the equivalence tests still pass through the service client.
- The five cascade indexes exist.
- Both CHECKs reject a violating write and accept a valid one.
- The preflight guard raises on seeded violating rows. Extract it from the migration file as the 0034 guard test does.
- The recreated `market_sparklines` passes every existing sparkline test.
- The leaderboard windows give correct ranks across a tie that straddles a page boundary.
- Open-markets paging covers ties at a page boundary.

**Unit and jsdom tests:**
- the rank cursor: round trip, garbage and tampering
- leaderboard and open-markets pages' `ShowMore` wiring
- the focus-after-Show-more behaviour, including the focus target and no scroll
- the single loading status on the market page
- the "Nothing older here" state
- the keys-only probe

**E2E:** stays at 27, with no changed assertions.

## Rollout

- **Before merging:** run Deploy Production Database on the branch to apply 0036.
- **Merge:** the push from `main` then has nothing to apply.
- **After deploy:** check that the leaderboard and markets list show "Show more" when there are enough rows, and that the feed and member pages still load.
