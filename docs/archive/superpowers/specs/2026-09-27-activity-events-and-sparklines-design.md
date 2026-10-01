# Activity events and market sparklines — design

**Date:** 2026-09-27
**Status:** approved, not yet implemented

**Sub-project 9, PR B.** This is the scale follow-up to beta readiness. Beta readiness PR A was merged as #17 (`0bc5819`). After this PR comes the `v0.1.0-beta` release tag, then the first member invites.

## Goal

Two reads still grow with the whole history of the app. This PR makes both grow only with what's on screen, and changes nothing a member sees.

- **The feed.** `/feed` and a member's activity (`/members/[id]`) read `activity_feed`, a view built in 0031. It rebuilds every event from seven tables and re-sorts them on every load: about 16 ms at 20,000 bets, and rising.
- **The markets list.** `/markets` reads every bet ever placed on every card it shows (`listChartBets`, `lib/markets/chart-bets.ts`) to draw 84px sparklines. It does this on every refresh, and any bet anywhere triggers a refresh.

## Non-goals

- Showing overrides, reversals, voids or balance adjustments as their own feed events. The user chose to keep today's behaviour: the feed shows only the current truth.
- Dropping the `activity_feed` view. A later migration removes it, once no deployed build reads it.
- Caching with `use cache` or `cacheComponents`. That would need a config change and is out of scope.
- Any change to the market page's full chart, which stays exact.
- Any change to coin-moving functions or access rules on existing tables.

## Decisions (from the user)

- **Overrides:** the feed keeps today's behaviour. An override or reversal replaces the old rows, with no new event types.
- **Feed approach:** an events table kept in step by triggers.
- **Markets list approach:** a database function that returns a small chart series per card.

## Design

### 1. The events table (`supabase/migrations/0035_activity_events.sql`)

**1a. The table.** `public.activity_events` has these columns:

| Column | Type | Notes |
|---|---|---|
| `id` | `text primary key` | the view's ids, unchanged: `bet:<bet id>`, `parlay:<parlay id>`, `market:<market id>`, `resolution:<resolution id>`, `win:<bet id>:<resolution id>`, `parlay_win:<parlay id>`, `task:<completion id>` |
| `kind` | `text not null` | one of `bet_placed`, `parlay_placed`, `market_created`, `market_resolved`, `bet_won`, `parlay_won`, `task_completed` (CHECK) |
| `occurred_at` | `timestamptz not null` | the same timestamp the view uses for that kind |
| `actor_id` | `uuid not null` | the member the event is about, as in the view |
| `market_id` | `uuid` | the related market, where there is one |
| `outcome_id` | `uuid` | the bet's outcome, or the winning outcome |
| `bet_id` | `bigint` | for `bet_placed` and `bet_won` |
| `resolution_id` | `uuid` | for `market_resolved` and `bet_won`; the hiding rule keys on it |
| `parlay_id` | `uuid` | for `parlay_placed` and `parlay_won` |
| `task_completion_id` | `uuid` | for `task_completed` |
| `amount` | `integer` | the bet or parlay stake, the payout for `bet_won`, the credit for `parlay_won`, or the reward for `task_completed`, each exactly as the view computes it today |
| `hidden_at` | `timestamptz` | set when the event is superseded, otherwise null |

**Keeping the ids makes existing cursors valid.** Feed cursors are `(occurred_at, id)`, and these ids are the same, so every "Show more" link in the wild keeps working.

**Names and labels are joined when the feed is read, not stored.** That covers display names, market titles, outcome labels, task titles and parlay leg counts. With no copies, nothing can go stale. These are primary-key joins on at most about 500 rows.

**Indexes.** Both cover only visible rows:
- `(occurred_at desc, id desc) where hidden_at is null`
- `(actor_id, occurred_at desc, id desc) where hidden_at is null`

**1b. Triggers.** Each is an `after` trigger with a `security definer` function and `set search_path = ''`, and every name is schema-qualified. Each runs in the same transaction as the write that caused it. None of the existing functions (`create_market`, `place_bet`, `place_parlay`, `resolve_market`, `void_market`, `settle_parlay`, approval and review) changes.

| Source | When | Effect |
|---|---|---|
| `bets` | insert | insert `bet_placed` |
| `parlays` | insert | insert `parlay_placed` (leg count is read at query time, because legs are inserted after the parlay row) |
| `markets` | insert | insert `market_created` |
| `markets` | update of `current_resolution_id`, when it changes to a new non-null value | hide every visible `market_resolved` and `bet_won` event for this market whose resolution isn't the new one; insert `market_resolved` for the new resolution |
| `coin_transactions` | insert where `type = 'bet_won'` | insert `bet_won` from the row's `meta` (`bet_id`, `resolution_id`), with `amount` = the ledger amount and `occurred_at` = that resolution's `resolved_at` |
| `parlays` | update of `status`, when it becomes `'won'` | insert `parlay_won` (or un-hide it if it was hidden), with `occurred_at = settled_at` |
| `parlays` | update of `status`, when it changes from `'won'` to anything else | hide that parlay's `parlay_won` |
| `task_completions` | update of `status`, when it becomes `'approved'` | insert `task_completed`, with `occurred_at = reviewed_at` |

Two notes on the table:
- **Inserts are idempotent.** An event that already exists is un-hidden and updated, not duplicated, using `on conflict (id) do update`. A re-resolve back to an earlier outcome creates a new resolution id, so its events are new rows.
- **Lock ordering.** The triggers write only to `activity_events`, and never lock `profiles` or `markets`. The global lock order established in 0033 is unchanged.

**The equivalence rule.** After any sequence of actions, the visible rows of `activity_events` must equal the rows of `activity_feed`: the same ids, kinds, actors, times and amounts. The rows the view derives from joins must match what the triggers store.

**1c. Access.**
- RLS is enabled. Select is allowed to invited members, using `(select is_invited())`, the same audience that can read the feed's source tables today.
- There are no insert, update or delete policies. Only the triggers write.
- `revoke all … from public, anon`, then `grant select … to authenticated, service_role`.
- Task events exist only for approved completions, which every invited member can already see.

**1d. Backfill.** In the same migration, after the triggers exist:
- `insert into public.activity_events (…) select … from public.activity_feed`, carrying over each row's `id`, `kind`, `occurred_at`, `actor_id`, the related ids and `amount`.
- `hidden_at` is null, because the view only ever shows current rows.

The migration is one explicit transaction, like 0034, and it takes `share row exclusive` locks on the source tables. So no event can be written between the backfill and the triggers taking over.

**1e. Readers.**
- `lib/social/list-feed.ts` (`listFeed`) reads `activity_events where hidden_at is null`, joining profiles, markets, outcomes, tasks and the parlay leg count.
- It keeps the same keyset paging over `(occurred_at, id)` through `lib/pagination`.
- It keeps the same `FeedEvent` shape, so `FeedList` and `FeedItem` are unchanged.
- The old view stays in place, unused.

**1f. Live updates.**
- `activity_events` is added to the `supabase_realtime` publication and to `LIVE_TABLES`.
- `pageSubscriptions.feed()` becomes `activity_events` only.
- `pageSubscriptions.member(id)` becomes:
  - `activity_events` filtered `actor_id=eq.<id>`
  - unfiltered `profiles`, which keeps live ranks
- This also fixes today's gap, where a member's activity missed live updates for task approvals and for resolutions.

### 2. Market sparklines

**2a. The function.** `public.market_sparklines(p_market_ids uuid[], p_points integer default 40)`:
- It's `language sql stable`, security invoker, so the caller's RLS on `bets` and `market_outcomes` applies as today.
- It returns rows of `(market_id uuid, t timestamptz, shares jsonb)`, where `shares` maps each outcome id to its share of the running pool.
- For each market, it walks bets in `(created_at, id)` order and keeps running pools per outcome. It picks at most `p_points` bets at evenly spaced positions, always including the last one, and returns the shares at each chosen bet.
- The shares follow `buildProbabilitySeries` (`lib/markets/probability-series.ts`) exactly: each outcome's pool divided by the running total, counting only outcomes of that market.
- A market with no bets returns no rows.
- `p_points` is capped at 200 inside the function, and `p_market_ids` at 50 per call.
- Grants: `authenticated` and `service_role`, but not `anon`.

**2b. The list page.** `app/(app)/markets/(list)/page.tsx` calls `market_sparklines` once per 50 card ids (the existing `chunk` helper) and maps the rows to `SeriesPoint[]` per market for the compact `ProbabilityChart`, which is unchanged.
- If the call fails, the cards render without charts, with a `console.error`, as today.
- `listChartBets` and `readCharts` are removed if nothing else imports them. The market page's `getChartBets` stays.

**2c. Live updates.** `pageSubscriptions.markets()` keeps `markets` and `bets`. Each refresh now costs about 40 points per card, instead of the whole bet history.

## Global constraints

- **Scope:** only what this spec lists.
- **One migration, `0035`,** in a single explicit transaction. It:
  - creates `activity_events`, its triggers, and `market_sparklines`
  - backfills the table
  - adds the table to the publication

  It doesn't change any existing function, access policy or table, apart from new triggers on them.
- **Equivalence:** the visible events equal the view's rows, which a DB test proves.
- **The e2e contract:**
  - every existing asserted string, role and count still resolves
  - the member page's real 404, the market page's real 404 and the signed-out 307 are unchanged
  - specs may gain waits, never changed assertions
- **Bounded reads:** every list read stays at 500 rows per request or fewer, and no URL grows with the number of rows.
- **Conventions (AGENTS.md):** tokens only, 44px controls, real elements and inline errors apply to any UI touched. None is expected.

## Testing

**Database**
- **Equivalence:** run a full scenario, then check that the visible `activity_events` rows equal `select * from activity_feed`, compared on id, kind, occurred_at, actor_id and amount. The scenario:
  - create two markets
  - place bets on several outcomes
  - place a parlay across both markets
  - resolve one market, then override it to the other outcome
  - settle, then reverse, the parlay through the override
  - void the second market
  - approve a task completion
- **Backfill:** after `db reset` on seeded data, the table matches the view.
- **Hiding:** an override hides exactly the old resolution's `market_resolved` and `bet_won` rows. Re-resolving to the original outcome shows the new resolution's rows. A parlay reversal hides its `parlay_won`.
- **Access:** an uninvited member selects nothing. A member can't insert, update or delete.
- **EXPLAIN on the scale seed:** the feed, member activity and `market_sparklines` all use indexes.
- **`market_sparklines`:**
  - at most `p_points` rows per market, always including the final bet
  - its shares equal `buildProbabilitySeries` at the chosen bets
  - no rows for a market without bets
  - `p_points` capped at 200 and the id cap enforced
  - an uninvited caller gets nothing

**Unit and jsdom**
- `listFeed` against the table: the mapping, paging and actor filter
- the list page's sparkline mapping and its failure fallback
- `page-subscriptions`, with `feed` and `member` pinned
- `LIVE_TABLES` includes `activity_events`

**E2E:** stays at 27, with no changed assertions.

**Scale:** record before-and-after timings on the scale seed for the feed, member activity and the `/markets` data load in the PR description.

## Rollout

- Merging runs the Deploy Production Database workflow, which applies `0035`. The backfill runs once, in the same transaction.
- The old view stays, so the app build that's live during the deploy keeps working.
- After deploy, check that `/feed`, a member's activity and `/markets` load with charts. Also check that one live update between two sessions shows on `/feed`.
- **Follow-up migration:** drop `activity_feed` once this PR's build is the only one deployed.
